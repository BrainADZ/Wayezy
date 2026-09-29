import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import { loadConfig, readEnvironment } from '../../apps/server/config';

it('reads admin credentials from .env while explicit environment variables take precedence', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'way-ezy-env-'));
  try {
    const envFile = path.join(directory, '.env');
    fs.writeFileSync(
      envFile,
      'APP_MODE=demo\nADMIN_EMAIL=file@example.com\nADMIN_PASSWORD="file-password-123"\n',
    );
    const fromFile = loadConfig(readEnvironment(envFile, {}));
    assert.equal(fromFile.adminEmail, 'file@example.com');
    assert.equal(fromFile.adminPassword, 'file-password-123');

    const overridden = loadConfig(
      readEnvironment(envFile, { ADMIN_PASSWORD: 'environment-password-456' }),
    );
    assert.equal(overridden.adminPassword, 'environment-password-456');
    assert.equal(
      loadConfig(readEnvironment(envFile, { ADMIN_PASSWORD: 'admin123' })).adminPassword,
      'admin123',
    );
    assert.throws(
      () => loadConfig(readEnvironment(envFile, { ADMIN_PASSWORD: 'short' })),
      /at least 8 characters/,
    );
    assert.throws(
      () =>
        loadConfig(
          readEnvironment(envFile, { APP_MODE: 'production', ADMIN_PASSWORD: 'admin123' }),
        ),
      /at least 12 characters/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
