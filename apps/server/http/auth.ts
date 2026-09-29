import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { canDo, type Action, type Resource } from '../../../packages/domain';
import type { AppContext } from '../context';
import { AppError, forbidden, unauthorized } from '../errors';
import type { AdminUser } from '../repositories/users';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AdminUser;
    sessionToken?: string;
  }
}

export const SESSION_COOKIE = 'wez_session';
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_VALUE = 'way-ezy';

export function parseCookies(header: string | undefined) {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    try {
      cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      /* ignore malformed cookie */
    }
  }
  return cookies;
}

export function setSessionCookie(res: Response, context: AppContext, token: string, expires: Date) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: context.config.secureCookies,
    path: '/',
    expires,
  });
}

export function clearSessionCookie(res: Response, context: AppContext) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'strict',
    secure: context.config.secureCookies,
    path: '/',
  });
}

/** Loads the signed-in admin (if any) from the session cookie. */
export function sessionLoader(context: AppContext): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (token) {
        const session = await context.users.resolveSession(token);
        if (session) {
          req.user = session.user;
          req.sessionToken = token;
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(unauthorized());
  next();
};

/**
 * CSRF defence for cookie-authenticated mutations: SameSite=Strict cookies plus a custom header
 * that cross-site forms cannot send and cross-origin scripts cannot add without CORS approval.
 */
export const requireCsrfHeader: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get(CSRF_HEADER) !== CSRF_VALUE)
    return next(new AppError(403, 'csrf', 'Request blocked. Refresh the page and try again.'));
  next();
};

export function requirePermission(resource: Resource, action: Action | 'publish') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!canDo(req.user.role, resource, action)) return next(forbidden());
    next();
  };
}

export const actor = (req: Request) =>
  req.user ? { id: req.user.id, email: req.user.email } : null;
