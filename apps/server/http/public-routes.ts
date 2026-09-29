import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { analyticsEventSchema, type AnalyticsEvent } from '../../../packages/domain';
import { withGroundFloorStructure } from '../../../packages/domain/reference/ground-floor-structure';
import { projectRoot } from '../config';
import type { AppContext } from '../context';
import { AppError, badRequest, notFound, unauthorized } from '../errors';
import { signRouteToken, verifyRouteToken } from '../services/route-tokens';

export function resolvePublicBaseUrl(context: AppContext, requestOrigin: string) {
  return context.config.publicBaseUrl || context.lanBaseUrl || requestOrigin;
}

const limiter = (limit: number, windowMs = 60_000) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message: 'Too many requests. Please wait a moment and try again.',
        },
      });
    },
  });

export function publicRoutes(context: AppContext) {
  const router = Router();

  router.get('/health', async (_req, res) => {
    let database = 'ok';
    try {
      await context.db.query('select 1');
    } catch {
      database = 'unavailable';
    }
    const latest = await context.snapshots.latest().catch(() => null);
    res.status(database === 'ok' ? 200 : 503).json({
      ok: database === 'ok',
      version: context.appVersion,
      database,
      driver: context.db.kind,
      contentVersion: latest?.version ?? null,
    });
  });

  // Hashed entry script of the deployed client build. Long-running kiosks compare it with the script they were
  // loaded with and reload at their next idle moment after a deployment. Not used by the dev server.
  let clientBuild: string | null | undefined;
  const currentClientBuild = () => {
    if (clientBuild !== undefined) return clientBuild;
    clientBuild = null;
    if (context.config.env !== 'development') {
      try {
        const html = fs.readFileSync(
          path.join(projectRoot, 'dist', 'client', 'index.html'),
          'utf8',
        );
        clientBuild =
          /<script[^>]*type="module"[^>]*src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1] ?? null;
      } catch {
        clientBuild = null;
      }
    }
    return clientBuild;
  };

  router.get('/config', async (req, res) => {
    const settings = await context.settings.all();
    res.setHeader('Cache-Control', 'no-cache');
    res.json({
      appVersion: context.appVersion,
      clientBuild: currentClientBuild(),
      mode: context.config.mode,
      venueId: context.config.venueId,
      publicBaseUrl: resolvePublicBaseUrl(context, `${req.protocol}://${req.get('host')}`),
      allowUnsignedDeepLinks: context.config.allowUnsignedDeepLinks,
      qrTokenTtlMinutes: settings.qrTokenTtlMinutes,
      showPoweredBy: settings.showPoweredBy,
      kioskAccentColor: settings.kioskAccentColor,
      kioskDefaultMapMode: settings.kioskDefaultMapMode,
      kioskHighContrastDefault: settings.kioskHighContrastDefault,
      supportPhone: settings.supportPhone,
    });
  });

  router.get('/snapshot', async (req, res, next) => {
    try {
      const latest = await context.snapshots.latest();
      if (!latest)
        throw new AppError(503, 'not_published', 'The directory has not been published yet.');
      res.setHeader('ETag', latest.etag);
      res.setHeader('Cache-Control', 'no-cache');
      if (req.get('if-none-match') === latest.etag) return void res.status(304).end();
      res.type('application/json').send(latest.json);
    } catch (error) {
      next(error);
    }
  });

  router.get('/snapshot/version', async (_req, res, next) => {
    try {
      const latest = await context.snapshots.latest();
      res.setHeader('Cache-Control', 'no-store');
      res.json({ version: latest?.version ?? null, publishedAt: latest?.publishedAt ?? null });
    } catch (error) {
      next(error);
    }
  });

  router.get('/stream', async (_req, res) => {
    const latest = await context.snapshots.latest();
    context.realtime.subscribe(res, { version: latest?.version ?? null });
  });

  const batchSchema = z.object({ events: z.array(z.unknown()).min(1).max(100) });
  router.post('/analytics', limiter(240), async (req, res, next) => {
    try {
      const { events } = batchSchema.parse(req.body);
      const valid: AnalyticsEvent[] = [];
      let rejected = 0;
      const occurredLimit = Date.now() + 5 * 60_000;
      for (const raw of events) {
        const parsed = analyticsEventSchema.safeParse(raw);
        // Server-only event types cannot be forged by clients.
        if (
          !parsed.success ||
          ['qr_generated', 'qr_opened', 'kiosk_heartbeat'].includes(parsed.data.type) ||
          new Date(parsed.data.occurredAt).getTime() > occurredLimit
        )
          rejected++;
        else valid.push(parsed.data);
      }
      const accepted = await context.analytics.insert(valid);
      res.status(202).json({ accepted, duplicates: valid.length - accepted, rejected });
    } catch (error) {
      next(error);
    }
  });

  const tokenRequest = z.object({
    deviceId: z.string().max(100).default(''),
    startNodeId: z.string().min(1).max(100),
    destinationId: z.string().min(1).max(100),
    accessible: z.boolean().default(false),
  });
  router.post('/route-tokens', limiter(60), async (req, res, next) => {
    try {
      const input = tokenRequest.parse(req.body);
      const latest = await context.snapshots.latest();
      if (!latest) throw notFound('Directory not published.');
      // The explorer adds surveyed Ground Floor places in the client. Include those IDs
      // when validating a phone handoff so its QR works for Ground Floor routes too.
      const data = latest.data;
      const groundData = withGroundFloorStructure(data);
      if (![...data.nodes, ...groundData.nodes].some((n) => n.id === input.startNodeId))
        throw badRequest('Unknown start point.');
      const tenant = [...data.tenants, ...groundData.tenants].find(
        (t) => t.id === input.destinationId,
      );
      const poi = [...data.pois, ...groundData.pois].find((p) => p.id === input.destinationId);
      if (!tenant && !poi) throw notFound('Destination not found.');
      if (input.deviceId && !data.devices.some((d) => d.id === input.deviceId))
        throw badRequest('Unknown device.');
      const settings = await context.settings.all();
      const signed = signRouteToken(context.routeTokenSecret, {
        venueId: context.config.venueId,
        startNodeId: input.startNodeId,
        destinationId: input.destinationId,
        destinationKind: tenant ? 'tenant' : 'poi',
        accessible: input.accessible,
        deviceId: input.deviceId,
        ttlMinutes: settings.qrTokenTtlMinutes,
      });
      const baseUrl = resolvePublicBaseUrl(context, `${req.protocol}://${req.get('host')}`);
      await context.analytics.insert(
        [
          {
            id: `srv-qr-${signed.payload.jti}`,
            type: 'qr_generated',
            deviceId: input.deviceId,
            sessionId: '',
            app: 'kiosk',
            occurredAt: new Date().toISOString(),
            props: { destinationId: input.destinationId, accessible: input.accessible },
          },
        ],
        'server',
      );
      res.status(201).json({
        token: signed.token,
        url: `${baseUrl}/go/r/${signed.token}`,
        expiresAt: signed.expiresAt,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/route-tokens/:token', limiter(120), async (req, res, next) => {
    try {
      const result = verifyRouteToken(context.routeTokenSecret, String(req.params.token));
      if (!result.ok) {
        if (result.reason === 'expired')
          throw new AppError(
            410,
            'expired',
            'This route link has expired. Scan a new QR code at any WAY EZY kiosk.',
          );
        throw new AppError(
          400,
          'invalid_token',
          'This route link is not valid. Scan a new QR code at any WAY EZY kiosk.',
        );
      }
      const p = result.payload;
      if (p.ven !== context.config.venueId)
        throw new AppError(400, 'invalid_token', 'This route link belongs to a different venue.');
      await context.analytics.insert(
        [
          {
            id: `srv-open-${p.jti}-${Date.now().toString(36)}`,
            type: 'qr_opened',
            deviceId: p.dev,
            sessionId: '',
            app: 'go',
            occurredAt: new Date().toISOString(),
            props: { destinationId: p.d, accessible: p.a },
          },
        ],
        'server',
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        venueId: p.ven,
        startNodeId: p.s,
        destinationId: p.d,
        destinationKind: p.k,
        accessible: p.a,
        deviceId: p.dev,
        expiresAt: new Date(p.exp * 1000).toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  const heartbeatSchema = z.object({
    softwareVersion: z.string().max(40).default(''),
    contentVersion: z.string().max(80).default(''),
    status: z
      .object({
        online: z.boolean().optional(),
        cachedAt: z.string().max(40).optional(),
        queuedEvents: z.number().int().min(0).max(1_000_000).optional(),
        screen: z.string().max(40).optional(),
        mapMode: z.string().max(10).optional(),
        uptimeSeconds: z.number().min(0).optional(),
      })
      .default({}),
  });
  router.post('/devices/:id/heartbeat', limiter(30), async (req, res, next) => {
    try {
      const deviceId = String(req.params.id);
      const key = req.get('x-device-key') ?? '';
      if (!(await context.devices.verifyKey(deviceId, key)))
        throw unauthorized('Device is not provisioned.');
      const payload = heartbeatSchema.parse(req.body);
      await context.devices.heartbeat(deviceId, payload);
      const latest = await context.snapshots.latest();
      const device = latest?.data.devices.find((d) => d.id === deviceId);
      res.json({
        ok: true,
        contentVersion: latest?.version ?? null,
        config: device
          ? {
              idleTimeout: device.idleTimeout,
              routeStartNode: device.routeStartNode,
              status: device.status,
            }
          : null,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
