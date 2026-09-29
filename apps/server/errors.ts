import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { Logger } from './logger';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Please sign in to continue.') =>
  new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'Your role does not allow this action.') =>
  new AppError(403, 'forbidden', message);
export const notFound = (message = 'Not found.') => new AppError(404, 'not_found', message);
export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'conflict', message, details);

export function zodDetails(error: ZodError) {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

/** Converts known failures into safe JSON responses. Stack traces never leave the server. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, _next) => {
    const requestId = res.getHeader('x-request-id');
    if (error instanceof AppError) {
      res.status(error.status).json({
        error: { code: error.code, message: error.message, details: error.details, requestId },
      });
      return;
    }
    if (error instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'validation_failed',
          message: 'Some fields need attention.',
          details: zodDetails(error),
          requestId,
        },
      });
      return;
    }
    const pgCode = (error as { code?: string })?.code;
    if (pgCode === '23505') {
      res.status(409).json({
        error: {
          code: 'duplicate',
          message: 'A record with this ID or value already exists.',
          requestId,
        },
      });
      return;
    }
    if (pgCode === '23503') {
      res.status(409).json({
        error: {
          code: 'in_use',
          message: 'This record is linked to other content. Remove or reassign those links first.',
          requestId,
        },
      });
      return;
    }
    if ((error as { type?: string })?.type === 'entity.too.large') {
      res
        .status(413)
        .json({ error: { code: 'too_large', message: 'The request is too large.', requestId } });
      return;
    }
    if ((error as { type?: string })?.type === 'entity.parse.failed') {
      res.status(400).json({
        error: { code: 'bad_json', message: 'The request body is not valid JSON.', requestId },
      });
      return;
    }
    logger.error('Unhandled request error', {
      requestId,
      method: req.method,
      path: req.path,
      error: error instanceof Error ? error.stack : String(error),
    });
    res.status(500).json({
      error: {
        code: 'server_error',
        message: 'Something went wrong on our side. Please try again.',
        requestId,
      },
    });
  };
}
