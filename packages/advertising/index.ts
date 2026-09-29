import type { Campaign, Device } from '../domain';
import { zonedParts } from '../domain';

/**
 * Campaign scheduling and kiosk idle-state logic, kept free of UI code so it is unit-testable.
 */

const priorityRank: Record<Campaign['priority'], number> = { HIGH: 3, NORMAL: 2, LOW: 1 };

/** Bundled sample creatives never enter the visitor screen playlist. */
const demoCreativeByCampaign = new Map([
  ['camp-festive-fashion', 'media-festive-fashion'],
  ['camp-olive-pasta', 'media-olive-pasta'],
  ['camp-pvr-weekend', 'media-pvr-weekend'],
  ['camp-tech-fest', 'media-croma-techfest'],
]);

export function screenCampaigns(campaigns: Campaign[]) {
  return campaigns.filter((campaign) => demoCreativeByCampaign.get(campaign.id) !== campaign.mediaId);
}

function withinTime(campaign: Pick<Campaign, 'startTime' | 'endTime'>, time: string) {
  return campaign.startTime <= campaign.endTime
    ? time >= campaign.startTime && time <= campaign.endTime
    : time >= campaign.startTime || time <= campaign.endTime; // overnight window, e.g. 20:00–02:00
}

export function targetsDevice(
  campaign: Pick<Campaign, 'targetType' | 'targets'>,
  device: Pick<Device, 'id' | 'floorId' | 'deviceGroup'>,
) {
  switch (campaign.targetType) {
    case 'ALL':
      return true;
    case 'FLOOR':
      return campaign.targets.includes(device.floorId);
    case 'DEVICE':
      return campaign.targets.includes(device.id);
    case 'GROUP':
      return campaign.targets.includes(device.deviceGroup);
  }
}

/** Is the campaign scheduled to play at this moment (ignoring targeting)? */
export function isOnAir(campaign: Campaign, now = new Date(), timezone = 'Asia/Kolkata') {
  if (campaign.status !== 'ACTIVE' && campaign.status !== 'SCHEDULED') return false;
  const { day, date, hhmm } = zonedParts(now, timezone);
  return (
    campaign.startDate <= date &&
    campaign.endDate >= date &&
    campaign.daysOfWeek.includes(day) &&
    withinTime(campaign, hhmm)
  );
}

/** Ordered playlist for a device: eligible campaigns by priority, then name for stable ordering. */
export function playlist(
  campaigns: Campaign[],
  device: Device,
  now = new Date(),
  timezone = 'Asia/Kolkata',
) {
  return campaigns
    .filter((c) => isOnAir(c, now, timezone) && targetsDevice(c, device))
    .sort(
      (a, b) => priorityRank[b.priority] - priorityRank[a.priority] || a.id.localeCompare(b.id),
    );
}

export type CampaignLiveState = 'Draft' | 'Paused' | 'Completed' | 'Scheduled' | 'Live' | 'Off-air';

/** What an admin should see: a SCHEDULED campaign becomes Live inside its window, Completed after it ends. */
export function campaignLiveState(
  campaign: Campaign,
  now = new Date(),
  timezone = 'Asia/Kolkata',
): CampaignLiveState {
  if (campaign.status === 'DRAFT') return 'Draft';
  if (campaign.status === 'PAUSED') return 'Paused';
  const { date } = zonedParts(now, timezone);
  if (campaign.status === 'COMPLETED' || campaign.endDate < date) return 'Completed';
  if (campaign.startDate > date) return 'Scheduled';
  return isOnAir(campaign, now, timezone) ? 'Live' : 'Off-air';
}

export type KioskState = 'ACTIVE' | 'AD';

/**
 * Idle state machine. Any interaction returns to ACTIVE; a tick moves to AD once the
 * device's configured idle timeout (seconds) has elapsed since the last interaction.
 */
export function idleTransition(
  state: KioskState,
  lastInteraction: number,
  now: number,
  timeoutSeconds: number,
  event: 'tick' | 'interaction',
): KioskState {
  if (event === 'interaction') return 'ACTIVE';
  return now - lastInteraction >= timeoutSeconds * 1000 ? 'AD' : state;
}

export const DEFAULT_IDLE_TIMEOUT_SECONDS = 10;
