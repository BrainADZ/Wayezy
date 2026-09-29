import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Media storage abstraction. `local` writes to DATA_DIR/media and is served from /media.
 * `supabase` uploads to a public Supabase Storage bucket through its REST API.
 */
export interface StorageProvider {
  kind: 'local' | 'supabase';
  put(key: string, data: Buffer, contentType: string): Promise<{ url: string; key: string }>;
  remove(key: string): Promise<void>;
  localDir?: string;
}

export function createLocalStorage(dataDir: string): StorageProvider {
  const dir = path.resolve(dataDir, 'media');
  return {
    kind: 'local',
    localDir: dir,
    async put(key, data) {
      if (!/^[\w.-]+$/.test(key)) throw new Error('Invalid storage key');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, key), data, { flag: 'wx' });
      return { url: `/media/${key}`, key };
    },
    async remove(key) {
      if (!/^[\w.-]+$/.test(key)) return;
      await fs.rm(path.join(dir, key), { force: true });
    },
  };
}

export function createSupabaseStorage(options: {
  url: string;
  serviceRoleKey: string;
  bucket: string;
}): StorageProvider {
  const objectUrl = (key: string) =>
    `${options.url}/storage/v1/object/${encodeURIComponent(options.bucket)}/${encodeURIComponent(key)}`;
  return {
    kind: 'supabase',
    async put(key, data, contentType) {
      const response = await fetch(objectUrl(key), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.serviceRoleKey}`,
          'Content-Type': contentType,
          'x-upsert': 'false',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
        body: new Uint8Array(data),
      });
      if (!response.ok) throw new Error(`Storage upload failed (${response.status})`);
      return {
        url: `${options.url}/storage/v1/object/public/${encodeURIComponent(options.bucket)}/${encodeURIComponent(key)}`,
        key,
      };
    },
    async remove(key) {
      await fetch(objectUrl(key), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${options.serviceRoleKey}` },
      });
    },
  };
}
