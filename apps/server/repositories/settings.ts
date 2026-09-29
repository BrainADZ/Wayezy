import { z } from 'zod';
import type { Queryable } from '../db/database';

/** Typed system settings editable from Command → System Settings / Branding / Languages. */
export const settingsSchema = z.object({
  qrTokenTtlMinutes: z.number().int().min(5).max(1440),
  analyticsRetentionDays: z.number().int().min(7).max(3650),
  showPoweredBy: z.boolean(),
  kioskAccentColor: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  kioskDefaultMapMode: z.enum(['3d', 'svg']),
  kioskHighContrastDefault: z.boolean(),
  supportEmail: z.string().max(200),
  supportPhone: z.string().max(40),
});
export type SystemSettings = z.infer<typeof settingsSchema>;

export const defaultSettings: SystemSettings = {
  qrTokenTtlMinutes: 120,
  analyticsRetentionDays: 395,
  showPoweredBy: true,
  kioskAccentColor: '#1a5cff',
  kioskDefaultMapMode: '3d',
  kioskHighContrastDefault: false,
  supportEmail: 'support@brainadz.example',
  supportPhone: '+91 80 4000 1299',
};

export class SettingsRepository {
  constructor(
    private db: Queryable,
    private venueId: string,
  ) {}

  async all(): Promise<SystemSettings> {
    const rows = await this.db.query<{ key: string; value: unknown }>(
      'select key, value from settings where venue_id = $1',
      [this.venueId],
    );
    const stored = Object.fromEntries(
      rows.map((r) => [r.key, typeof r.value === 'string' ? safeParse(r.value) : r.value]),
    );
    const merged = { ...defaultSettings, ...stored };
    const parsed = settingsSchema.safeParse(merged);
    return parsed.success ? parsed.data : defaultSettings;
  }

  async update(patch: Partial<SystemSettings>) {
    const before = await this.all();
    const next = settingsSchema.parse({ ...before, ...patch });
    for (const [key, value] of Object.entries(next)) {
      await this.db.query(
        `insert into settings (venue_id, key, value) values ($1, $2, $3::jsonb) on conflict (venue_id, key) do update set value = excluded.value, updated_at = now()`,
        [this.venueId, key, JSON.stringify(value)],
      );
    }
    return { before, after: next };
  }
}

function safeParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
