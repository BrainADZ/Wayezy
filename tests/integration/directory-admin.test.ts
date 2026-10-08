import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import type { Snapshot, Tenant } from '../../packages/domain';
import {
  directoryUnits,
  hasDirectoryLayout,
} from '../../packages/domain/reference/architectural-directory';
import { installArchitecturalDirectory } from '../../apps/server/db/architectural-directory';
import { groundPublicData } from '../../apps/web/explorer/ground-public-data';
import { Client, startTestServer } from './helpers';

test('both floor drafts support tenant logos, map occupancy, publication and routing without resetting edits', async () => {
  const server = await startTestServer();
  try {
    const admin = new Client(server.url);
    await admin.login();
    const boot = (await admin.get('/api/admin/bootstrap')).body;
    assert.equal(boot.data.tenants.filter((tenant: Tenant) => tenant.floorId === 'l0').length, 30);
    assert.equal(boot.data.tenants.filter((tenant: Tenant) => tenant.floorId === 'l1').length, 20);
    assert.deepEqual(
      boot.data.floors.map((floor: { name: string }) => floor.name),
      ['Ground Floor', 'First Floor'],
    );
    assert.ok(hasDirectoryLayout(boot.data, 'l1'));
    assert.ok(
      boot.data.offers.some(
        (offer: { tenantId: string }) => offer.tenantId === 'ground-tenant-starbucks',
      ),
    );
    const before = (await admin.get('/api/snapshot')).body as Snapshot;
    assert.equal(
      hasDirectoryLayout(before, 'l1'),
      false,
      'import adds drafts without automatically publishing',
    );
    assert.ok(
      boot.data.edges.some((edge: { id: string }) => edge.id.startsWith('first-walk-edge-')),
    );
    assert.ok(boot.data.edges.some((edge: { id: string }) => edge.id === 'floor-link-lift-c'));

    const image = await sharp({
      create: { width: 240, height: 120, channels: 4, background: '#075b4b' },
    })
      .png()
      .toBuffer();
    const upload = new FormData();
    upload.append(
      'file',
      new Blob([new Uint8Array(image)], { type: 'image/png' }),
      'studio-logo.png',
    );
    const asset = await admin.post('/api/admin/media/upload', upload);
    assert.equal(asset.status, 201, JSON.stringify(asset.body));
    const original = boot.data.tenants.find(
      (tenant: Tenant) => tenant.id === 'first-tenant-greenr',
    ) as Tenant;
    const edited = await admin.put(`/api/admin/resources/tenants/${original.id}`, {
      name: 'Greenr Studio',
      logo: asset.body.url,
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    const ground: Tenant = boot.data.tenants.find(
      (tenant: Tenant) => tenant.id === 'ground-tenant-perona',
    );
    assert.equal(
      (await admin.put(`/api/admin/resources/tenants/${ground.id}`, { logo: asset.body.url }))
        .status,
      200,
    );
    assert.equal(
      groundPublicData((await admin.get('/api/snapshot')).body).tenants.find(
        (tenant) => tenant.id === original.id,
      )?.name,
      'Greenr',
    );

    const unit = directoryUnits.find((unit) => unit.featureId === 'first-module-22')!;
    const entrance = boot.data.nodes.find(
      (node: { floorId: string; type: string }) =>
        node.floorId === 'l1' && node.type === 'corridor',
    );
    const created = await admin.post('/api/admin/resources/tenants', {
      ...original,
      id: 'new-first-store',
      name: 'New First Store',
      featureId: unit.featureId,
      unitNumber: unit.unitNumber,
      nodeId: entrance.id,
      logo: asset.body.url,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const conflict = await admin.post('/api/admin/resources/tenants', {
      ...created.body,
      id: 'conflicting-store',
    });
    assert.equal(conflict.status, 400);
    assert.match(JSON.stringify(conflict.body), /already assigned/);
    assert.equal(
      (await admin.post('/api/admin/publish', { note: 'Publish first-floor brands and logos' }))
        .status,
      201,
    );
    const published = (await admin.get('/api/snapshot')).body as Snapshot;
    const directory = groundPublicData(published);
    assert.ok(directory.offers.some((offer) => offer.tenantId === 'ground-tenant-starbucks'));
    assert.equal(
      directory.tenants.find((tenant) => tenant.id === original.id)?.logo,
      asset.body.url,
    );
    assert.equal(directory.tenants.find((tenant) => tenant.id === ground.id)?.logo, asset.body.url);
    assert.ok(
      directory.tenants.some(
        (tenant) => tenant.id === 'new-first-store' && tenant.featureId === 'first-module-22',
      ),
    );
    const preview = await admin.post('/api/admin/routing/preview', {
      fromNodeId: 'ground-entry-starbucks',
      toNodeId: original.nodeId,
    });
    assert.equal(preview.status, 200);
    assert.deepEqual(preview.body.route.floorIds, ['l0', 'l1']);
    const used = preview.body.route.edges.find((edge: { id: string }) =>
      edge.id.startsWith('floor-link-'),
    );
    assert.equal(
      (
        await admin.post('/api/admin/routing/closures', {
          edgeId: used.id,
          closed: true,
          publish: false,
        })
      ).status,
      200,
    );
    const rerouted = await admin.post('/api/admin/routing/preview', {
      fromNodeId: 'ground-entry-starbucks',
      toNodeId: original.nodeId,
    });
    assert.ok(rerouted.body.route);
    assert.ok(!rerouted.body.route.edges.some((edge: { id: string }) => edge.id === used.id));

    const version = (await server.context.snapshots.latest())!.version;
    await installArchitecturalDirectory(server.context);
    assert.equal((await server.context.snapshots.latest())!.version, version);
    assert.equal(
      (await server.context.content.get<Tenant>('tenants', original.id))!.logo,
      asset.body.url,
    );
    assert.equal(
      (await server.context.content.get<Tenant>('tenants', original.id))!.name,
      'Greenr Studio',
    );
    await admin.put(`/api/admin/resources/tenants/${ground.id}`, { logo: '' });
    await admin.put(`/api/admin/resources/tenants/${original.id}`, { status: 'HIDDEN' });
    await admin.post('/api/admin/publish', {});
    assert.equal(
      groundPublicData((await admin.get('/api/snapshot')).body).tenants.find(
        (tenant) => tenant.id === ground.id,
      )?.logo,
      '',
    );
    assert.ok(
      !groundPublicData((await admin.get('/api/snapshot')).body).tenants.some(
        (tenant) => tenant.id === original.id,
      ),
    );
    await admin.delete('/api/admin/resources/tenants/new-first-store');
    await installArchitecturalDirectory(server.context);
    assert.equal(await server.context.content.get('tenants', 'new-first-store'), null);
  } finally {
    await server.close();
  }
});
