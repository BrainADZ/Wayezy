import { Router, type Request } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { campaignLiveState } from '../../../packages/advertising';
import { canDo, roles, schemas, zonedDayStart, type Resource } from '../../../packages/domain';
import { findRoute, validateGraph } from '../../../packages/routing';
import { findGroundDirectoryRoute } from '../../../packages/routing/ground-directory';
import { groundRouteGraph } from '../../../packages/domain/reference/ground-floor-route-graph';
import groundDirectory from '../../../packages/domain/reference/ground-floor-tenants.json';
import type { AppContext } from '../context';
import { badRequest, conflict, forbidden, notFound } from '../errors';
import { isTableResource, slugId, type TableResource } from '../repositories/content';
import { settingsSchema } from '../repositories/settings';
import { mediaKey, processUpload } from '../services/media';
import { actor, requireAuth, requireCsrfHeader, requirePermission } from './auth';
import { permissionsFor } from './auth-routes';
import { resolvePublicBaseUrl } from './public-routes';

const asyncRoute =
  (fn: (req: Request, res: import('express').Response) => Promise<unknown>) =>
  (req: Request, res: import('express').Response, next: import('express').NextFunction) =>
    fn(req, res).catch(next);

export function adminRoutes(context: AppContext) {
  const router = Router();
  router.use(requireAuth, requireCsrfHeader);
  const { content, audit, snapshots, realtime } = context;

  const publish = async (req: Request, note: string) => {
    const published = await snapshots.publish(content, req.user!.email, note);
    await audit.record({
      actor: actor(req),
      action: 'publish',
      entityType: 'snapshot',
      entityId: published.version,
      summary: note || 'Published changes to Kiosk and WAY EZY GO',
    });
    realtime.send('published', { version: published.version, publishedAt: published.publishedAt });
    return published;
  };

  const publishStatus = async () => {
    const latest = await snapshots.latest();
    return {
      version: latest?.version ?? null,
      publishedAt: latest?.publishedAt ?? null,
      publishedBy: latest?.publishedBy ?? null,
      pendingChanges: await audit.changesSince(latest?.publishedAt ?? null),
      connectedClients: realtime.size,
    };
  };

  /* ---------------------------------------------------------------- */
  /* Bootstrap + dashboard                                             */
  /* ---------------------------------------------------------------- */

  router.get(
    '/bootstrap',
    asyncRoute(async (req, res) => {
      const user = req.user!;
      const copy = await content.workingCopy();
      const readable = (resource: Resource) => canDo(user.role, resource, 'read');
      const latest = await snapshots.latest();
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        user,
        permissions: permissionsFor(user.role),
        data: Object.fromEntries(
          Object.entries(copy).filter(([key]) => key === 'venue' || readable(key as Resource)),
        ),
        deviceRuntime: readable('devices')
          ? await context.devices.runtime(latest?.version ?? null)
          : [],
        settings: canDo(user.role, 'settings', 'read') ? await context.settings.all() : null,
        publish: await publishStatus(),
        appVersion: context.appVersion,
        mode: context.config.mode,
        storage: context.storage.kind,
        database: context.db.kind,
      });
    }),
  );

  router.get(
    '/dashboard',
    asyncRoute(async (req, res) => {
      const user = req.user!;
      const venue = await content.getVenue();
      const now = new Date();
      const startOfDay = zonedDayStart(now, venue.timezone);
      const weekAgo = new Date(startOfDay.getTime() - 6 * 86400_000);
      const latest = await snapshots.latest();
      const [today, week, devices, tenants, campaigns, recent] = await Promise.all([
        canDo(user.role, 'analytics', 'read')
          ? context.analytics.summary({
              from: startOfDay.toISOString(),
              to: new Date(startOfDay.getTime() + 86400_000).toISOString(),
              timezone: venue.timezone,
            })
          : null,
        canDo(user.role, 'analytics', 'read')
          ? context.analytics.summary({
              from: weekAgo.toISOString(),
              to: new Date(startOfDay.getTime() + 86400_000).toISOString(),
              timezone: venue.timezone,
            })
          : null,
        context.devices.runtime(latest?.version ?? null),
        content.list<{ id: string; status: string }>('tenants'),
        content.list<Parameters<typeof campaignLiveState>[0]>('campaigns'),
        canDo(user.role, 'audit', 'read') ? audit.list({ limit: 8 }) : [],
      ]);
      const alerts = devices
        .filter((d) => d.health !== 'online')
        .map((d) => ({
          level: d.health === 'offline' ? 'error' : 'warning',
          message: `${d.id} · ${d.healthReason}`,
          deviceId: d.id,
        }));
      res.json({
        today: today?.totals ?? null,
        week,
        devices,
        activeTenants: tenants.filter((t) => t.status === 'ACTIVE').length,
        totalTenants: tenants.length,
        campaigns: campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          advertiser: c.advertiser,
          state: campaignLiveState(c, now, venue.timezone),
          startDate: c.startDate,
          endDate: c.endDate,
          targetType: c.targetType,
        })),
        alerts,
        recentChanges: recent,
        publish: await publishStatus(),
      });
    }),
  );

  /* ---------------------------------------------------------------- */
  /* Venue                                                             */
  /* ---------------------------------------------------------------- */

  router.get(
    '/venue',
    requirePermission('venue', 'read'),
    asyncRoute(async (_req, res) => res.json(await content.getVenue())),
  );
  router.put(
    '/venue',
    requirePermission('venue', 'write'),
    asyncRoute(async (req, res) => {
      const { before, after } = await content.updateVenue(req.body ?? {});
      await audit.record({
        actor: actor(req),
        action: 'update',
        entityType: 'venue',
        entityId: after.id,
        summary: `Updated venue ${after.name}`,
        before,
        after,
      });
      res.json(after);
    }),
  );

  /* ---------------------------------------------------------------- */
  /* Publishing                                                        */
  /* ---------------------------------------------------------------- */

  router.get(
    '/publish/status',
    requirePermission('publish', 'read'),
    asyncRoute(async (_req, res) => res.json(await publishStatus())),
  );
  router.get(
    '/publish/history',
    requirePermission('publish', 'read'),
    asyncRoute(async (_req, res) => res.json(await snapshots.history(30))),
  );
  router.post(
    '/publish',
    requirePermission('publish', 'publish'),
    asyncRoute(async (req, res) => {
      const { note } = z.object({ note: z.string().max(300).default('') }).parse(req.body ?? {});
      const issues = validateGraph(await content.list('nodes'), await content.list('edges'));
      const published = await publish(req, note);
      res
        .status(201)
        .json({ version: published.version, publishedAt: published.publishedAt, warnings: issues });
    }),
  );

  /* ---------------------------------------------------------------- */
  /* Routing operations                                                */
  /* ---------------------------------------------------------------- */

  router.get(
    '/routing/validate',
    requirePermission('edges', 'read'),
    asyncRoute(async (_req, res) => {
      const [savedEdges, savedNodes] = await Promise.all([
        content.list<import('../../../packages/domain').RouteEdge>('edges'),
        content.list<import('../../../packages/domain').RouteNode>('nodes'),
      ]);
      const graph = groundRouteGraph(savedEdges, savedNodes);
      const issues = validateGraph(graph.nodes, graph.edges);
      for (const tenant of groundDirectory.tenants) {
        if (tenant.id === 'soulfoods') continue; // Source doorway is still unverified.
        if (
          !findGroundDirectoryRoute(
            'ground-entry-starbucks',
            `ground-tenant-${tenant.id}`,
            false,
            graph.edges,
            graph.nodes,
          )
        )
          issues.push(`${tenant.name} has no open route from Entry 1`);
      }
      res.json({
        ok: issues.length === 0,
        issues: [...new Set(issues)].slice(0, 50),
        nodes: graph.nodes.length,
        edges: graph.edges.length,
      });
    }),
  );

  router.post(
    '/routing/preview',
    requirePermission('edges', 'read'),
    asyncRoute(async (req, res) => {
      const input = z
        .object({
          fromNodeId: z.string().max(100),
          toNodeId: z.string().max(100),
          accessible: z.boolean().default(false),
        })
        .parse(req.body);
      const copy = await content.workingCopy();
      const route =
        input.fromNodeId.startsWith('ground-') && input.toNodeId.startsWith('ground-')
          ? findGroundDirectoryRoute(
              input.fromNodeId,
              input.toNodeId,
              input.accessible,
              copy.edges,
              copy.nodes,
            )
          : findRoute(
              copy.nodes,
              copy.edges,
              input.fromNodeId,
              input.toNodeId,
              input.accessible,
              copy.floors,
            );
      res.json({ route });
    }),
  );

  router.post(
    '/routing/closures',
    requirePermission('edges', 'write'),
    asyncRoute(async (req, res) => {
      const input = z
        .object({
          edgeId: z.string().max(100),
          closed: z.boolean(),
          reason: z.string().max(300).default(''),
          publish: z.boolean().default(true),
        })
        .parse(req.body);
      const { before, after } = await content.update('edges', input.edgeId, {
        active: !input.closed,
        reason: input.closed ? input.reason || 'Temporarily closed' : '',
      });
      await audit.record({
        actor: actor(req),
        action: 'closure',
        entityType: 'edges',
        entityId: input.edgeId,
        summary: input.closed
          ? `Closed corridor ${input.edgeId}${input.reason ? ` (${input.reason})` : ''}`
          : `Reopened corridor ${input.edgeId}`,
        before,
        after,
      });
      let version: string | null = null;
      if (input.publish) {
        if (!canDo(req.user!.role, 'publish', 'publish'))
          throw forbidden('Your role cannot publish. Ask a Mall Admin to publish this closure.');
        version = (
          await publish(
            req,
            input.closed ? `Closure: ${input.edgeId}` : `Reopened: ${input.edgeId}`,
          )
        ).version;
      }
      res.json({ edge: after, publishedVersion: version });
    }),
  );

  /* ---------------------------------------------------------------- */
  /* Devices                                                           */
  /* ---------------------------------------------------------------- */

  router.get(
    '/devices/runtime',
    requirePermission('devices', 'read'),
    asyncRoute(async (_req, res) => {
      const latest = await snapshots.latest();
      res.json(await context.devices.runtime(latest?.version ?? null));
    }),
  );

  router.post(
    '/devices/:id/rotate-key',
    requirePermission('devices', 'write'),
    asyncRoute(async (req, res) => {
      const id = String(req.params.id);
      const key = await context.devices.rotateKey(id);
      if (!key) throw notFound('Device not found.');
      await audit.record({
        actor: actor(req),
        action: 'update',
        entityType: 'devices',
        entityId: id,
        summary: `Issued a new device key for ${id}`,
      });
      const base = resolvePublicBaseUrl(context, `${req.protocol}://${req.get('host')}`);
      res.json({
        deviceId: id,
        key,
        provisioningUrl: `${base}/?device=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`,
      });
    }),
  );

  router.post(
    '/devices/idle-timeout',
    requirePermission('devices', 'write'),
    asyncRoute(async (req, res) => {
      const { seconds } = z.object({ seconds: z.number().int().min(10).max(600) }).parse(req.body);
      const devices = await content.list<{ id: string }>('devices');
      for (const device of devices) {
        const { before, after } = await content.update('devices', device.id, {
          idleTimeout: seconds,
        });
        await audit.record({
          actor: actor(req),
          action: 'update',
          entityType: 'devices',
          entityId: device.id,
          summary: `Idle timeout set to ${seconds}s`,
          before,
          after,
        });
      }
      res.json({ updated: devices.length, seconds });
    }),
  );

  /* ---------------------------------------------------------------- */
  /* Media upload                                                      */
  /* ---------------------------------------------------------------- */

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: context.config.maxUploadBytes, files: 1, fields: 8 },
  });
  router.post(
    '/media/upload',
    requirePermission('media', 'write'),
    (req, res, next) =>
      upload.single('file')(req, res, (error: unknown) => {
        if ((error as { code?: string })?.code === 'LIMIT_FILE_SIZE')
          return next(
            badRequest(
              `Files must be ${Math.round(context.config.maxUploadBytes / 1024 / 1024)} MB or smaller.`,
            ),
          );
        if (error) return next(badRequest('Upload failed. Please try again.'));
        next();
      }),
    asyncRoute(async (req, res) => {
      const file = req.file;
      if (!file) throw badRequest('Choose a file to upload.');
      const fields = z
        .object({
          name: z.string().max(160).optional(),
          duration: z.coerce.number().optional(),
          width: z.coerce.number().optional(),
          height: z.coerce.number().optional(),
        })
        .parse(req.body ?? {});
      const processed = await processUpload(file, {
        maxImageBytes: Math.min(context.config.maxUploadBytes, 15 * 1024 * 1024),
        maxVideoBytes: context.config.maxUploadBytes,
        duration: fields.duration,
        width: fields.width,
        height: fields.height,
      });
      const key = mediaKey(file.originalname, processed.extension);
      const stored = await context.storage.put(key, processed.buffer, processed.mimeType);
      const item = await content.create('media', {
        id: slugId(file.originalname.replace(/\.[^.]+$/, '')),
        name: (fields.name || file.originalname).slice(0, 160),
        url: stored.url,
        mimeType: processed.mimeType,
        size: processed.buffer.length,
        width: processed.width,
        height: processed.height,
        duration: processed.duration,
        kind: processed.kind,
      });
      await context.db.query('update media_assets set storage_key = $1 where id = $2', [
        stored.key,
        item.id,
      ]);
      await audit.record({
        actor: actor(req),
        action: 'create',
        entityType: 'media',
        entityId: String(item.id),
        summary: `Uploaded ${item.name}`,
        after: item,
      });
      res.status(201).json(item);
    }),
  );

  /* ---------------------------------------------------------------- */
  /* Analytics + audit                                                 */
  /* ---------------------------------------------------------------- */

  router.get(
    '/analytics',
    requirePermission('analytics', 'read'),
    asyncRoute(async (req, res) => {
      const query = z
        .object({
          days: z.coerce.number().int().min(1).max(365).default(7),
          deviceId: z.string().max(100).optional(),
          floorId: z.string().max(100).optional(),
        })
        .parse(req.query);
      const venue = await content.getVenue();
      const end = new Date(zonedDayStart(new Date(), venue.timezone).getTime() + 86400_000);
      const start = new Date(end.getTime() - query.days * 86400_000);
      res.json(
        await context.analytics.summary({
          from: start.toISOString(),
          to: end.toISOString(),
          deviceId: query.deviceId || undefined,
          floorId: query.floorId || undefined,
          timezone: venue.timezone,
        }),
      );
    }),
  );

  router.post(
    '/analytics/clear-demo',
    requirePermission('settings', 'write'),
    asyncRoute(async (req, res) => {
      const removed = await context.analytics.clearDemoSeed();
      await audit.record({
        actor: actor(req),
        action: 'delete',
        entityType: 'analytics',
        summary: `Cleared ${removed} demo-seed analytics events`,
      });
      res.json({ removed });
    }),
  );

  router.get(
    '/audit',
    requirePermission('audit', 'read'),
    asyncRoute(async (req, res) => {
      const query = z
        .object({
          limit: z.coerce.number().int().min(1).max(200).default(50),
          offset: z.coerce.number().int().min(0).default(0),
          entityType: z.string().max(40).optional(),
          action: z.string().max(40).optional(),
        })
        .parse(req.query);
      res.json(await audit.list(query));
    }),
  );

  /* ---------------------------------------------------------------- */
  /* Settings                                                          */
  /* ---------------------------------------------------------------- */

  router.get(
    '/settings',
    requirePermission('settings', 'read'),
    asyncRoute(async (_req, res) => res.json(await context.settings.all())),
  );
  router.put(
    '/settings',
    requirePermission('settings', 'write'),
    asyncRoute(async (req, res) => {
      const patch = settingsSchema.partial().parse(req.body ?? {});
      const { before, after } = await context.settings.update(patch);
      await audit.record({
        actor: actor(req),
        action: 'update',
        entityType: 'settings',
        summary: `Updated ${Object.keys(patch).join(', ')}`,
        before,
        after,
      });
      res.json(after);
    }),
  );

  /* ---------------------------------------------------------------- */
  /* Users                                                             */
  /* ---------------------------------------------------------------- */

  router.get(
    '/users',
    requirePermission('users', 'read'),
    asyncRoute(async (_req, res) => res.json(await context.users.list())),
  );
  router.post(
    '/users',
    requirePermission('users', 'write'),
    asyncRoute(async (req, res) => {
      const input = schemas.users
        .omit({ id: true })
        .extend({ password: z.string().min(12, 'Use at least 12 characters').max(200) })
        .parse(req.body);
      const user = await context.users.create({
        name: input.name,
        email: input.email,
        role: input.role,
        active: input.active,
        password: input.password,
      });
      await audit.record({
        actor: actor(req),
        action: 'create',
        entityType: 'users',
        entityId: user.id,
        summary: `Created ${user.email} (${user.role})`,
        after: user,
      });
      res.status(201).json(user);
    }),
  );
  router.put(
    '/users/:id',
    requirePermission('users', 'write'),
    asyncRoute(async (req, res) => {
      const id = String(req.params.id);
      const current = await context.users.findById(id);
      if (!current) throw notFound('User not found.');
      const input = z
        .object({
          name: z.string().min(1).max(160),
          email: z.email().max(200),
          role: z.enum(roles),
          active: z.boolean(),
          password: z.string().min(12).max(200).optional().or(z.literal('')),
        })
        .parse({ ...current, ...req.body });
      const losingSuperAdmin =
        current.role === 'SUPER_ADMIN' &&
        current.active &&
        (input.role !== 'SUPER_ADMIN' || !input.active);
      if (losingSuperAdmin && (await context.users.countActiveSuperAdmins()) <= 1)
        throw conflict('At least one active Super Admin is required.');
      if (id === req.user!.id && !input.active)
        throw conflict('You cannot deactivate your own account.');
      const updated = await context.users.update(id, {
        ...input,
        password: input.password || undefined,
      });
      await audit.record({
        actor: actor(req),
        action: 'update',
        entityType: 'users',
        entityId: id,
        summary: `Updated ${input.email}${input.password ? ' (password reset)' : ''}`,
        before: current,
        after: updated,
      });
      res.json(updated);
    }),
  );
  router.delete(
    '/users/:id',
    requirePermission('users', 'write'),
    asyncRoute(async (req, res) => {
      const id = String(req.params.id);
      if (id === req.user!.id) throw conflict('You cannot delete your own account.');
      const current = await context.users.findById(id);
      if (!current) throw notFound('User not found.');
      if (current.role === 'SUPER_ADMIN' && (await context.users.countActiveSuperAdmins()) <= 1)
        throw conflict('At least one active Super Admin is required.');
      await context.users.remove(id);
      await audit.record({
        actor: actor(req),
        action: 'delete',
        entityType: 'users',
        entityId: id,
        summary: `Deleted ${current.email}`,
        before: current,
      });
      res.json({ ok: true });
    }),
  );

  /* ---------------------------------------------------------------- */
  /* Generic content CRUD                                              */
  /* ---------------------------------------------------------------- */

  const resourceParam = (req: Request): TableResource => {
    const resource = String(req.params.resource);
    if (!isTableResource(resource)) throw notFound('Unknown resource.');
    return resource;
  };
  const permit = (req: Request, resource: TableResource, action: 'read' | 'write') => {
    if (!canDo(req.user!.role, resource, action)) throw forbidden();
  };

  router.get(
    '/resources/:resource',
    asyncRoute(async (req, res) => {
      const resource = resourceParam(req);
      permit(req, resource, 'read');
      res.json(await content.list(resource));
    }),
  );

  router.post(
    '/resources/:resource',
    asyncRoute(async (req, res) => {
      const resource = resourceParam(req);
      permit(req, resource, 'write');
      if (resource === 'media') throw badRequest('Upload media through the Media Library.');
      const item = await content.create(resource, req.body ?? {});
      await audit.record({
        actor: actor(req),
        action: 'create',
        entityType: resource,
        entityId: String(item.id),
        summary: `Created ${String(item.name ?? item.title ?? item.label ?? item.id)}`,
        after: item,
      });
      let deviceKey: { key: string; provisioningUrl: string } | undefined;
      if (resource === 'devices') {
        const key = (await context.devices.rotateKey(String(item.id)))!;
        const base = resolvePublicBaseUrl(context, `${req.protocol}://${req.get('host')}`);
        deviceKey = {
          key,
          provisioningUrl: `${base}/?device=${encodeURIComponent(String(item.id))}&key=${encodeURIComponent(key)}`,
        };
      }
      res.status(201).json(deviceKey ? { ...item, deviceKey } : item);
    }),
  );

  router.put(
    '/resources/:resource/:id',
    asyncRoute(async (req, res) => {
      const resource = resourceParam(req);
      permit(req, resource, 'write');
      const id = String(req.params.id);
      if (resource === 'media') {
        // Only descriptive fields of an uploaded asset are editable.
        const { name } = z.object({ name: z.string().min(1).max(160) }).parse(req.body);
        const { before, after } = await content.update('media', id, { name });
        await audit.record({
          actor: actor(req),
          action: 'update',
          entityType: resource,
          entityId: id,
          summary: `Renamed media to ${name}`,
          before,
          after,
        });
        return void res.json(after);
      }
      const { before, after } = await content.update(resource, id, req.body ?? {});
      await audit.record({
        actor: actor(req),
        action: 'update',
        entityType: resource,
        entityId: id,
        summary: `Updated ${String(after.name ?? after.title ?? after.label ?? id)}`,
        before,
        after,
      });
      res.json(after);
    }),
  );

  router.delete(
    '/resources/:resource/:id',
    asyncRoute(async (req, res) => {
      const resource = resourceParam(req);
      permit(req, resource, 'write');
      const id = String(req.params.id);
      if (resource === 'media') {
        const media = await content.get<{ url: string; name: string }>('media', id);
        if (!media) throw notFound('Media not found.');
        const copy = await content.workingCopy();
        const users = [
          ...copy.campaigns.filter((c) => c.mediaId === id).map((c) => `campaign "${c.name}"`),
          ...copy.tenants
            .filter(
              (t) =>
                t.logo === media.url || t.heroImage === media.url || t.gallery.includes(media.url),
            )
            .map((t) => `tenant "${t.name}"`),
          ...copy.offers.filter((o) => o.image === media.url).map((o) => `offer "${o.title}"`),
          ...copy.events.filter((e) => e.image === media.url).map((e) => `event "${e.title}"`),
        ];
        if (users.length)
          throw conflict(
            `This media is used by ${users.slice(0, 3).join(', ')}${users.length > 3 ? '…' : ''}. Replace it there first.`,
          );
        const keyRows = await context.db.query<{ storage_key: string }>(
          'select storage_key from media_assets where id = $1',
          [id],
        );
        await content.remove('media', id);
        if (keyRows[0]?.storage_key)
          await context.storage.remove(keyRows[0].storage_key).catch(() => undefined);
        await audit.record({
          actor: actor(req),
          action: 'delete',
          entityType: resource,
          entityId: id,
          summary: `Deleted media ${media.name}`,
          before: media,
        });
        return void res.json({ ok: true });
      }
      if (resource === 'floors' || resource === 'categories') {
        const copy = await content.workingCopy();
        const dependents =
          resource === 'floors'
            ? copy.tenants.filter((t) => t.floorId === id).length +
              copy.nodes.filter((n) => n.floorId === id).length
            : copy.tenants.filter((t) => t.categoryId === id).length;
        if (dependents)
          throw conflict(
            `This ${resource === 'floors' ? 'floor' : 'category'} still has ${dependents} linked record${dependents === 1 ? '' : 's'}. Reassign them first.`,
          );
      }
      const before = await content.remove(resource, id);
      await audit.record({
        actor: actor(req),
        action: 'delete',
        entityType: resource,
        entityId: id,
        summary: `Deleted ${String(before.name ?? before.title ?? before.label ?? id)}`,
        before,
      });
      res.json({ ok: true });
    }),
  );

  return router;
}
