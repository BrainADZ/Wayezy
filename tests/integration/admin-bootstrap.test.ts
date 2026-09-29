import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import { loadConfig, readEnvironment } from '../../apps/server/config';
import { createContext, type AppContext } from '../../apps/server/context';
import { silentLogger } from '../../apps/server/logger';
import { verifyPassword } from '../../apps/server/services/passwords';

it('creates a Super Admin with the .env password when other users already exist', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'way-ezy-admin-'));
  let context: AppContext | undefined;
  try {
    const envFile = path.join(directory, '.env');
    fs.writeFileSync(
      envFile,
      'APP_MODE=demo\nDEMO_USERS=false\nDEMO_ANALYTICS=false\nADMIN_EMAIL=owner@example.com\nADMIN_PASSWORD=first-password-123\n',
    );
    const overrides = { DATA_DIR: directory, SEED_DEMO: 'true' };
    context = await createContext(loadConfig(readEnvironment(envFile, overrides)), silentLogger);
    const original = await context.users.findForLogin('owner@example.com');
    assert.ok(original);
    assert.equal(await verifyPassword('first-password-123', original.passwordHash), true);
    await context.users.create({
      name: 'Staff',
      email: 'staff@example.com',
      role: 'ANALYST',
      password: 'staff-password-123',
    });
    await context.users.remove(original.user.id);
    await context.close();
    context = undefined;

    fs.writeFileSync(
      envFile,
      'APP_MODE=demo\nDEMO_USERS=false\nDEMO_ANALYTICS=false\nADMIN_EMAIL=owner@example.com\nADMIN_PASSWORD=second-password-456\n',
    );
    context = await createContext(loadConfig(readEnvironment(envFile, overrides)), silentLogger);
    const replacement = await context.users.findForLogin('owner@example.com');
    assert.ok(replacement);
    assert.equal(await verifyPassword('second-password-456', replacement.passwordHash), true);
    assert.equal(await context.users.count(), 2);
  } finally {
    await context?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('updates the existing Super Admin from .env without resetting the database', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'way-ezy-admin-sync-'));
  let context: AppContext | undefined;
  try {
    const envFile = path.join(directory, '.env');
    const overrides = {
      DATA_DIR: directory,
      SEED_DEMO: 'true',
      DEMO_USERS: 'false',
      DEMO_ANALYTICS: 'false',
    };
    fs.writeFileSync(
      envFile,
      'APP_MODE=demo\nADMIN_EMAIL=old@example.com\nADMIN_PASSWORD=old-password-123\n',
    );
    context = await createContext(loadConfig(readEnvironment(envFile, overrides)), silentLogger);
    const original = await context.users.findForLogin('old@example.com');
    assert.ok(original);
    await context.close();
    context = undefined;

    fs.writeFileSync(
      envFile,
      'APP_MODE=demo\nADMIN_EMAIL=new@example.com\nADMIN_PASSWORD=admin123\n',
    );
    context = await createContext(loadConfig(readEnvironment(envFile, overrides)), silentLogger);
    const updated = await context.users.findForLogin('new@example.com');
    assert.ok(updated);
    assert.equal(updated.user.id, original.user.id);
    assert.equal(await verifyPassword('admin123', updated.passwordHash), true);
    assert.equal(await context.users.findForLogin('old@example.com'), null);
    assert.equal(await context.users.count(), 1);
    const access = fs.readFileSync(path.join(directory, 'demo-access.txt'), 'utf8');
    assert.match(access, /Super Admin: new@example.com \/ password set in \.env/);
    assert.doesNotMatch(access, /old-password-123/);
  } finally {
    await context?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
