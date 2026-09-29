import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Campaign } from '../../packages/domain';
import { demo } from '../../packages/domain/seed';
import {
  campaignLiveState,
  DEFAULT_IDLE_TIMEOUT_SECONDS,
  idleTransition,
  isOnAir,
  playlist,
  targetsDevice,
} from '../../packages/advertising';

const base: Campaign = {
  id: 'c1',
  name: 'Test',
  advertiser: 'Advertiser',
  description: '',
  status: 'ACTIVE',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  startTime: '10:00',
  endTime: '22:00',
  daysOfWeek: [1, 2, 3, 4, 5],
  mediaId: 'media-festive-fashion',
  duration: 10,
  priority: 'NORMAL',
  targetType: 'ALL',
  targets: [],
  tapDestinationId: '',
  notes: '',
};
// 2026-09-17 is a Thursday. 06:30 UTC = 12:00 IST.
const thursdayNoon = new Date('2026-09-17T06:30:00Z');

describe('campaign scheduling', () => {
  it('plays inside its date, day and time window', () => {
    assert.equal(isOnAir(base, thursdayNoon), true);
    assert.equal(isOnAir({ ...base, startTime: '13:00' }, thursdayNoon), false);
    assert.equal(isOnAir({ ...base, daysOfWeek: [0, 6] }, thursdayNoon), false);
    assert.equal(isOnAir({ ...base, endDate: '2026-09-16' }, thursdayNoon), false);
    assert.equal(isOnAir({ ...base, startDate: '2026-09-18' }, thursdayNoon), false);
  });

  it('supports overnight time windows', () => {
    const lateNight = new Date('2026-09-17T18:30:00Z'); // 00:00 IST Friday
    assert.equal(
      isOnAir({ ...base, startTime: '20:00', endTime: '02:00', daysOfWeek: [5] }, lateNight),
      true,
    );
  });

  it('never plays drafts, paused or completed campaigns', () => {
    for (const status of ['DRAFT', 'PAUSED', 'COMPLETED'] as const)
      assert.equal(isOnAir({ ...base, status }, thursdayNoon), false);
  });

  it('targets devices by floor, device and group', () => {
    const device = demo.devices[0];
    assert.equal(targetsDevice({ targetType: 'FLOOR', targets: [device.floorId] }, device), true);
    assert.equal(targetsDevice({ targetType: 'FLOOR', targets: ['l9'] }, device), false);
    assert.equal(targetsDevice({ targetType: 'DEVICE', targets: [device.id] }, device), true);
    assert.equal(
      targetsDevice({ targetType: 'GROUP', targets: [device.deviceGroup] }, device),
      true,
    );
  });

  it('orders the playlist by priority', () => {
    const list = playlist(
      [
        { ...base, id: 'low', priority: 'LOW' },
        { ...base, id: 'high', priority: 'HIGH' },
        { ...base, id: 'normal' },
      ],
      demo.devices[0],
      thursdayNoon,
    );
    assert.deepEqual(
      list.map((c) => c.id),
      ['high', 'normal', 'low'],
    );
  });

  it('gives the main-entrance kiosk a demo playlist today', () => {
    const list = playlist(demo.campaigns, demo.devices[0], thursdayNoon);
    assert.ok(list.length >= 2);
    assert.equal(list[0].priority, 'HIGH');
    assert.ok(
      !list.some((c) => c.id === 'camp-tech-fest'),
      'future scheduled campaign is not on air',
    );
  });

  it('reports admin-facing live state', () => {
    assert.equal(campaignLiveState(base, thursdayNoon), 'Live');
    assert.equal(
      campaignLiveState(
        { ...base, status: 'SCHEDULED', startDate: '2026-10-01', endDate: '2026-10-31' },
        thursdayNoon,
      ),
      'Scheduled',
    );
    assert.equal(campaignLiveState({ ...base, endDate: '2026-09-01' }, thursdayNoon), 'Completed');
    assert.equal(campaignLiveState({ ...base, status: 'DRAFT' }, thursdayNoon), 'Draft');
  });
});

describe('idle timeout', () => {
  it('defaults to 10 seconds and every demo kiosk uses the configured value', () => {
    assert.equal(DEFAULT_IDLE_TIMEOUT_SECONDS, 10);
    assert.ok(demo.devices.every((d) => d.idleTimeout === 10));
  });

  it('enters ad mode exactly at the configured timeout', () => {
    assert.equal(idleTransition('ACTIVE', 0, 9_999, 10, 'tick'), 'ACTIVE');
    assert.equal(idleTransition('ACTIVE', 0, 10_000, 10, 'tick'), 'AD');
    assert.equal(idleTransition('ACTIVE', 0, 29_000, 30, 'tick'), 'ACTIVE');
  });

  it('any touch exits ad mode', () => {
    assert.equal(idleTransition('AD', 0, 50_000, 10, 'interaction'), 'ACTIVE');
  });
});
