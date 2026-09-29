import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../apps/server/app';
import { loadConfig } from '../../apps/server/config';
import { createContext, type AppContext } from '../../apps/server/context';
import { silentLogger } from '../../apps/server/logger';

export const ADMIN_EMAIL = 'admin@test.local';
export const ADMIN_PASSWORD = 'correct-horse-battery-staple';

export interface TestServer {
  url: string;
  context: AppContext;
  close(): Promise<void>;
}

/** Boots the real Express app on an ephemeral port with an in-memory PostgreSQL (PGlite). */
export async function startTestServer(env: Record<string, string> = {}): Promise<TestServer> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'way-ezy-test-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    APP_MODE: 'demo',
    DATA_DIR: dataDir,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    DEMO_USERS: 'false',
    DEMO_ANALYTICS: 'false',
    PUBLIC_BASE_URL: 'http://phone.test',
    ...env,
  });
  const context = await createContext(config, silentLogger, { memoryDatabase: true });
  const app = await createApp(context, { serveClient: false });
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    context,
    async close() {
      context.realtime.close();
      await new Promise((resolve) => server.close(resolve));
      await context.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export class Client {
  cookie = '';
  constructor(private base: string) {}

  async request(
    method: string,
    url: string,
    body?: unknown,
    options: { csrf?: boolean; headers?: Record<string, string> } = {},
  ) {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (this.cookie) headers.cookie = this.cookie;
    if (options.csrf !== false) headers['x-requested-with'] = 'way-ezy';
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(`${this.base}${url}`, { method, headers, body: payload });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: response.status, body: json, headers: response.headers };
  }

  get = (url: string) => this.request('GET', url);
  post = (
    url: string,
    body?: unknown,
    options?: { csrf?: boolean; headers?: Record<string, string> },
  ) => this.request('POST', url, body, options);
  put = (url: string, body?: unknown) => this.request('PUT', url, body);
  delete = (url: string) => this.request('DELETE', url);

  async login(email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
    const result = await this.post('/api/auth/login', { email, password });
    if (result.status !== 200)
      throw new Error(`Login failed for ${email}: ${result.status} ${JSON.stringify(result.body)}`);
    return result;
  }
}
