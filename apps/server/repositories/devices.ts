import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Queryable } from '../db/database';

export type DeviceHealth =
  'online' | 'warning' | 'offline' | 'maintenance' | 'disabled' | 'unprovisioned';

export interface DeviceRuntime {
  id: string;
  provisioned: boolean;
  softwareVersion: string;
  lastHeartbeatAt: string | null;
  lastContentVersion: string;
  lastStatus: Record<string, unknown>;
  health: DeviceHealth;
  healthReason: string;
}

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
export const ONLINE_WINDOW_MS = 90_000;
export const WARNING_WINDOW_MS = 10 * 60_000;

export function computeHealth(input: {
  status: string;
  provisioned: boolean;
  lastHeartbeatAt: string | null;
  lastContentVersion: string;
  latestVersion: string | null;
  now?: number;
}): {
  health: DeviceHealth;
  reason: string;
} {
  if (input.status === 'DISABLED') return { health: 'disabled', reason: 'Disabled in Command' };
  if (input.status === 'MAINTENANCE')
    return { health: 'maintenance', reason: 'Marked for maintenance' };
  if (!input.provisioned) return { health: 'unprovisioned', reason: 'No device key issued yet' };
  if (!input.lastHeartbeatAt) return { health: 'offline', reason: 'Never connected' };
  const age = (input.now ?? Date.now()) - new Date(input.lastHeartbeatAt).getTime();
  if (age > WARNING_WINDOW_MS)
    return { health: 'offline', reason: 'No heartbeat for over 10 minutes' };
  if (age > ONLINE_WINDOW_MS) return { health: 'warning', reason: 'Heartbeat delayed' };
  if (
    input.latestVersion &&
    input.lastContentVersion &&
    input.lastContentVersion !== input.latestVersion
  )
    return { health: 'warning', reason: 'Content sync pending' };
  return { health: 'online', reason: 'Healthy' };
}

export class DeviceRepository {
  constructor(
    private db: Queryable,
    private venueId: string,
  ) {}

  /** Issues a new device key. The plain key is returned once and only its hash is stored. */
  async rotateKey(deviceId: string) {
    const key = randomBytes(24).toString('base64url');
    const rows = await this.db.query(
      'update devices set device_key_hash = $3, updated_at = now() where venue_id = $1 and id = $2 returning id',
      [this.venueId, deviceId, hashKey(key)],
    );
    return rows.length ? key : null;
  }

  async verifyKey(deviceId: string, key: string) {
    const rows = await this.db.query<{ device_key_hash: string }>(
      'select device_key_hash from devices where venue_id = $1 and id = $2',
      [this.venueId, deviceId],
    );
    const stored = rows[0]?.device_key_hash;
    if (!stored || !key) return false;
    const a = Buffer.from(stored, 'hex');
    const b = Buffer.from(hashKey(key), 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async heartbeat(
    deviceId: string,
    payload: { softwareVersion: string; contentVersion: string; status: Record<string, unknown> },
  ) {
    await this.db.query(
      'update devices set last_heartbeat_at = now(), software_version = $3, last_content_version = $4, last_status = $5::jsonb where venue_id = $1 and id = $2',
      [
        this.venueId,
        deviceId,
        payload.softwareVersion,
        payload.contentVersion,
        JSON.stringify(payload.status),
      ],
    );
    await this.db.query(
      'insert into device_heartbeats (device_id, software_version, content_version, status) values ($1, $2, $3, $4::jsonb)',
      [deviceId, payload.softwareVersion, payload.contentVersion, JSON.stringify(payload.status)],
    );
    await this.db.query(
      `delete from device_heartbeats where device_id = $1 and received_at < now() - interval '7 days'`,
      [deviceId],
    );
  }

  async runtime(latestVersion: string | null): Promise<DeviceRuntime[]> {
    const rows = await this.db.query<{
      id: string;
      status: string;
      device_key_hash: string;
      software_version: string;
      last_heartbeat_at: Date | string | null;
      last_content_version: string;
      last_status: Record<string, unknown>;
    }>(
      'select id, status, device_key_hash, software_version, last_heartbeat_at, last_content_version, last_status from devices where venue_id = $1 order by id',
      [this.venueId],
    );
    return rows.map((r) => {
      const lastHeartbeatAt = r.last_heartbeat_at
        ? new Date(r.last_heartbeat_at).toISOString()
        : null;
      const provisioned = Boolean(r.device_key_hash);
      const { health, reason } = computeHealth({
        status: r.status,
        provisioned,
        lastHeartbeatAt,
        lastContentVersion: r.last_content_version,
        latestVersion,
      });
      return {
        id: r.id,
        provisioned,
        softwareVersion: r.software_version,
        lastHeartbeatAt,
        lastContentVersion: r.last_content_version,
        lastStatus: r.last_status ?? {},
        health,
        healthReason: reason,
      };
    });
  }
}
