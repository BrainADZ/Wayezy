import { Router } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { canDo, contentResources, rolePolicies, systemResources } from '../../../packages/domain';
import type { AppContext } from '../context';
import { AppError, unauthorized } from '../errors';
import { verifyPassword } from '../services/passwords';
import { clearSessionCookie, requireAuth, requireCsrfHeader, setSessionCookie } from './auth';

const loginSchema = z.object({ email: z.string().max(200), password: z.string().max(200) });

export function permissionsFor(role: Parameters<typeof canDo>[0]) {
  const resources = [...contentResources, ...systemResources];
  return {
    read: resources.filter((r) => canDo(role, r, 'read')),
    write: resources.filter((r) => canDo(role, r, 'write')),
    publish: rolePolicies[role].publish,
  };
}

export function authRoutes(context: AppContext) {
  const router = Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) =>
      `${ipKeyGenerator(req.ip ?? '')}:${String((req.body as { email?: string })?.email ?? '')
        .toLowerCase()
        .slice(0, 200)}`,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message: 'Too many sign-in attempts. Please wait 15 minutes.',
        },
      });
    },
  });

  router.post('/login', requireCsrfHeader, loginLimiter, async (req, res, next) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const found = await context.users.findForLogin(email);
      const valid = await verifyPassword(password, found?.passwordHash);
      if (!found || !valid || !found.user.active) {
        await context.audit.record({
          actor: null,
          action: 'login_failed',
          entityType: 'auth',
          summary: `Failed sign-in for ${email.slice(0, 120)}`,
        });
        throw unauthorized('Email or password is incorrect.');
      }
      const session = await context.users.createSession(
        found.user.id,
        context.config.sessionHours,
        req.get('user-agent') ?? '',
      );
      await context.users.touchLogin(found.user.id);
      await context.audit.record({
        actor: { id: found.user.id, email: found.user.email },
        action: 'login',
        entityType: 'auth',
        entityId: found.user.id,
        summary: 'Signed in',
      });
      setSessionCookie(res, context, session.token, session.expires);
      res.json({
        user: found.user,
        permissions: permissionsFor(found.user.role),
        expiresAt: session.expires.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', requireCsrfHeader, async (req, res, next) => {
    try {
      if (req.sessionToken) await context.users.destroySession(req.sessionToken);
      if (req.user)
        await context.audit.record({
          actor: { id: req.user.id, email: req.user.email },
          action: 'logout',
          entityType: 'auth',
          entityId: req.user.id,
          summary: 'Signed out',
        });
      clearSessionCookie(res, context);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  /** Non-throwing session probe for the sign-in screen (avoids a 401 on every visit). */
  router.get('/session', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ authenticated: Boolean(req.user) });
  });

  router.get('/me', requireAuth, (req, res) => {
    if (!req.user) throw new AppError(401, 'unauthorized', 'Please sign in.');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ user: req.user, permissions: permissionsFor(req.user.role) });
  });

  return router;
}
