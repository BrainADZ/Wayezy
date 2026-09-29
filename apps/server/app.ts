import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { projectRoot } from './config';
import type { AppContext } from './context';
import { errorHandler } from './errors';
import { adminRoutes } from './http/admin-routes';
import { sessionLoader } from './http/auth';
import { authRoutes } from './http/auth-routes';
import { publicRoutes } from './http/public-routes';

export async function createApp(context: AppContext, options: { serveClient?: boolean } = {}) {
  const { config, logger } = context;
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy)
    app.set(
      'trust proxy',
      /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy,
    );

  // Request id + access log (no bodies, no cookies).
  app.use((req, res, next) => {
    const requestId = randomUUID();
    const started = Date.now();
    res.setHeader('x-request-id', requestId);
    res.on('finish', () => {
      if (req.path.startsWith('/api/') && req.path !== '/api/stream') {
        const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'debug';
        // Route tokens are bearer links: never write them to logs.
        const logPath = req.path.replace(/^\/api\/route-tokens\/.+$/, '/api/route-tokens/:token');
        logger[level]('request', {
          requestId,
          method: req.method,
          path: logPath,
          status: res.statusCode,
          ms: Date.now() - started,
        });
      }
    });
    next();
  });

  const isDev = config.env === 'development' && options.serveClient !== false;
  app.use(
    helmet({
      contentSecurityPolicy: isDev
        ? false
        : {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: [
                "'self'",
                'data:',
                'blob:',
                ...(config.supabaseUrl ? [config.supabaseUrl] : []),
              ],
              mediaSrc: ["'self'", 'blob:', ...(config.supabaseUrl ? [config.supabaseUrl] : [])],
              fontSrc: ["'self'", 'data:'],
              connectSrc: ["'self'"],
              workerSrc: ["'self'", 'blob:'],
              manifestSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              upgradeInsecureRequests: config.secureCookies ? [] : null,
            },
          },
      crossOriginEmbedderPolicy: false,
      // Kiosk hardware on a LAN demo is served over http; HSTS only makes sense behind TLS.
      strictTransportSecurity: config.secureCookies,
    }),
  );
  app.use('/api', express.json({ limit: '1mb' }));
  app.use('/api', sessionLoader(context));
  app.use('/api', publicRoutes(context));
  app.use('/api/auth', authRoutes(context));
  app.use('/api/admin', adminRoutes(context));
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Unknown API endpoint.' } });
  });

  if (context.storage.localDir) {
    app.use(
      '/media',
      express.static(context.storage.localDir, {
        immutable: true,
        maxAge: '365d',
        index: false,
        setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
      }),
    );
  }

  if (options.serveClient !== false) {
    // The exact architectural vectors compress well. Prepare once at build time,
    // then stream the negotiated asset without compressing it on every kiosk request.
    app.get('/maps/ground-floor-directory.svg', (req, res, next) => {
      const encoding = req.acceptsEncodings('br', 'gzip', 'identity');
      if (encoding !== 'br' && encoding !== 'gzip') return next();
      const file = path.join(
        projectRoot,
        isDev ? 'public' : 'dist/client',
        'maps',
        `ground-floor-directory.svg.${encoding === 'br' ? 'br' : 'gz'}`,
      );
      if (!fs.existsSync(file)) return next();
      res.vary('Accept-Encoding');
      res.type('image/svg+xml');
      res.setHeader('Content-Encoding', encoding);
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(file);
    });
    if (isDev) {
      const { createServer } = await import('vite');
      // HMR socket port follows the app port so several dev servers (e.g. dev + e2e) can run side by side.
      const vite = await createServer({
        root: projectRoot,
        server: { middlewareMode: true, ws: { port: Math.min(config.port + 20_000, 65_000) } },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const clientDir = path.join(projectRoot, 'dist', 'client');
      if (!fs.existsSync(path.join(clientDir, 'index.html')))
        logger.warn('Client build not found. Run "npm run build" first.', { clientDir });
      app.use(
        express.static(clientDir, {
          index: false,
          setHeaders: (res, filePath) => {
            if (filePath.includes(`${path.sep}assets${path.sep}`))
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            else res.setHeader('Cache-Control', 'no-cache');
          },
        }),
      );
      app.use((req, res, next) => {
        if (
          (req.method !== 'GET' && req.method !== 'HEAD') ||
          req.path.startsWith('/api/') ||
          req.path.startsWith('/media/')
        )
          return next();
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(path.join(clientDir, 'index.html'));
      });
    }
  }

  app.use(errorHandler(logger));
  return app;
}
