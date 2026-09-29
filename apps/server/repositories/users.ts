import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '../../../packages/domain';
import type { Queryable } from '../db/database';
import { hashPassword } from '../services/passwords';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  password_hash: string;
  last_login_at: Date | string | null;
  created_at: Date | string;
}

const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);
const toUser = (row: UserRow): AdminUser => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  active: row.active,
  lastLoginAt: iso(row.last_login_at),
  createdAt: iso(row.created_at)!,
});
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export class UserRepository {
  constructor(
    private db: Queryable,
    private venueId: string,
  ) {}

  async count() {
    const rows = await this.db.query<{ n: number }>(
      'select count(*)::int as n from users where venue_id = $1',
      [this.venueId],
    );
    return rows[0]?.n ?? 0;
  }

  async list() {
    const rows = await this.db.query<UserRow>(
      'select * from users where venue_id = $1 order by name',
      [this.venueId],
    );
    return rows.map(toUser);
  }

  async findById(id: string) {
    const rows = await this.db.query<UserRow>(
      'select * from users where venue_id = $1 and id = $2',
      [this.venueId, id],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findForLogin(email: string) {
    const rows = await this.db.query<UserRow>(
      'select * from users where venue_id = $1 and lower(email) = lower($2)',
      [this.venueId, email.trim()],
    );
    return rows[0] ? { user: toUser(rows[0]), passwordHash: rows[0].password_hash } : null;
  }

  async create(input: {
    id?: string;
    name: string;
    email: string;
    role: Role;
    active?: boolean;
    password: string;
  }) {
    const id = input.id ?? `user-${randomBytes(6).toString('hex')}`;
    await this.db.query(
      'insert into users (id, venue_id, name, email, role, active, password_hash) values ($1, $2, $3, lower($4), $5, $6, $7)',
      [
        id,
        this.venueId,
        input.name,
        input.email,
        input.role,
        input.active ?? true,
        await hashPassword(input.password),
      ],
    );
    return (await this.findById(id))!;
  }

  async update(
    id: string,
    patch: { name: string; email: string; role: Role; active: boolean; password?: string },
  ) {
    await this.db.query(
      'update users set name = $3, email = lower($4), role = $5, active = $6, updated_at = now() where venue_id = $1 and id = $2',
      [this.venueId, id, patch.name, patch.email, patch.role, patch.active],
    );
    if (patch.password) await this.setPassword(id, patch.password);
    return this.findById(id);
  }

  async setPassword(id: string, password: string) {
    await this.db.query(
      'update users set password_hash = $3, updated_at = now() where venue_id = $1 and id = $2',
      [this.venueId, id, await hashPassword(password)],
    );
    await this.db.query('delete from sessions where user_id = $1', [id]);
  }

  async remove(id: string) {
    await this.db.query('delete from users where venue_id = $1 and id = $2', [this.venueId, id]);
  }

  async countActiveSuperAdmins() {
    const rows = await this.db.query<{ n: number }>(
      "select count(*)::int as n from users where venue_id = $1 and role = 'SUPER_ADMIN' and active",
      [this.venueId],
    );
    return rows[0]?.n ?? 0;
  }

  async touchLogin(id: string) {
    await this.db.query('update users set last_login_at = now() where id = $1', [id]);
  }

  /* Sessions: the cookie holds a random token; only its SHA-256 hash is stored. */

  async createSession(userId: string, hours: number, userAgent: string) {
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + hours * 3600_000);
    await this.db.query(
      'insert into sessions (id, user_id, expires_at, user_agent) values ($1, $2, $3, $4)',
      [tokenHash(token), userId, expires.toISOString(), userAgent.slice(0, 200)],
    );
    return { token, expires };
  }

  async resolveSession(token: string) {
    if (!token || token.length > 200) return null;
    const rows = await this.db.query<
      UserRow & { session_id: string; expires_at: Date | string; last_seen_at: Date | string }
    >(
      `select u.*, s.id as session_id, s.expires_at, s.last_seen_at from sessions s join users u on u.id = s.user_id
       where s.id = $1 and s.expires_at > now() and u.active and u.venue_id = $2`,
      [tokenHash(token), this.venueId],
    );
    const row = rows[0];
    if (!row) return null;
    if (Date.now() - new Date(row.last_seen_at).getTime() > 60_000)
      await this.db.query('update sessions set last_seen_at = now() where id = $1', [
        row.session_id,
      ]);
    return {
      user: toUser(row),
      sessionId: row.session_id,
      expiresAt: new Date(row.expires_at).toISOString(),
    };
  }

  async destroySession(token: string) {
    await this.db.query('delete from sessions where id = $1', [tokenHash(token)]);
  }

  async purgeExpiredSessions() {
    await this.db.query('delete from sessions where expires_at < now()');
  }
}
