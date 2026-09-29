import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/**
 * Signed, short-lived route hand-off tokens for QR codes: `/go/r/{token}`.
 *
 * token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, payload))
 *
 * The payload only carries public wayfinding identifiers (venue, start node, destination,
 * preference, expiry) — no personal data. Tampering breaks the signature; expiry is enforced
 * server-side.
 */
const payloadSchema = z.object({
  v: z.literal(1),
  ven: z.string().max(100),
  s: z.string().max(100),
  d: z.string().max(100),
  k: z.enum(['tenant', 'poi']),
  a: z.boolean(),
  dev: z.string().max(100),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string().max(40),
});
export type RouteTokenPayload = z.infer<typeof payloadSchema>;

export type VerifyResult =
  | { ok: true; payload: RouteTokenPayload }
  | { ok: false; reason: 'malformed' | 'signature' | 'expired' };

const b64 = (buffer: Buffer | string) => Buffer.from(buffer).toString('base64url');

export function signRouteToken(
  secret: string,
  input: {
    venueId: string;
    startNodeId: string;
    destinationId: string;
    destinationKind: 'tenant' | 'poi';
    accessible: boolean;
    deviceId: string;
    ttlMinutes: number;
  },
  now = Date.now(),
) {
  const iat = Math.floor(now / 1000);
  const payload: RouteTokenPayload = {
    v: 1,
    ven: input.venueId,
    s: input.startNodeId,
    d: input.destinationId,
    k: input.destinationKind,
    a: input.accessible,
    dev: input.deviceId,
    iat,
    exp: iat + input.ttlMinutes * 60,
    jti: randomBytes(6).toString('base64url'),
  };
  const body = b64(JSON.stringify(payload));
  const signature = b64(createHmac('sha256', secret).update(body).digest());
  return {
    token: `${body}.${signature}`,
    payload,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}

export function verifyRouteToken(secret: string, token: string, now = Date.now()): VerifyResult {
  if (typeof token !== 'string' || token.length > 1024 || !/^[\w-]+\.[\w-]+$/.test(token))
    return { ok: false, reason: 'malformed' };
  const [body, signature] = token.split('.');
  const expected = createHmac('sha256', secret).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return { ok: false, reason: 'signature' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const result = payloadSchema.safeParse(parsed);
  if (!result.success) return { ok: false, reason: 'malformed' };
  if (result.data.exp * 1000 <= now) return { ok: false, reason: 'expired' };
  return { ok: true, payload: result.data };
}
