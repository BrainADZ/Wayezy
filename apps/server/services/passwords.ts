import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

const scrypt = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCallback(password, salt, keylen, options, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );

const N = 16384;
const r = 8;
const p = 1;
const KEYLEN = 64;

/** Format: scrypt$N$r$p$saltBase64$hashBase64 */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize('NFKC'), salt, KEYLEN, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

// A valid hash of a random password, used to keep timing similar when the user does not exist.
let dummyHash: Promise<string> | null = null;

export async function verifyPassword(password: string, stored: string | null | undefined) {
  const target = stored ?? (await (dummyHash ??= hashPassword(randomBytes(12).toString('hex'))));
  const [scheme, n, rr, pp, saltB64, hashB64] = target.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(
    password.normalize('NFKC'),
    Buffer.from(saltB64, 'base64'),
    expected.length,
    {
      N: Number(n),
      r: Number(rr),
      p: Number(pp),
      maxmem: 64 * 1024 * 1024,
    },
  );
  return stored != null && actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generatePassword() {
  // 18 URL-safe characters ≈ 108 bits of entropy.
  return randomBytes(14).toString('base64url').slice(0, 18);
}
