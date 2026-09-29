import { safeStorage } from './storage';

export const APP_VERSION = '1.0.0';
const KEY = 'wez-device';

export interface DeviceIdentity {
  id: string;
  key: string | null;
}

/**
 * Kiosk identity. A kiosk is provisioned once by opening `/?device=K-001&key=…` (link issued in
 * COMMAND → Screens & Devices). The key is stored locally and removed from the address bar.
 * Unprovisioned browsers behave as the default demo kiosk without sending heartbeats.
 */
export function resolveDeviceIdentity(defaultId = 'K-001'): DeviceIdentity {
  const url = new URL(window.location.href);
  const id = url.searchParams.get('device');
  const key = url.searchParams.get('key');
  if (id && /^[\w.:-]{1,100}$/.test(id)) {
    const identity = { id, key: key && key.length <= 200 ? key : null };
    safeStorage.set(KEY, identity);
    url.searchParams.delete('device');
    url.searchParams.delete('key');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    return identity;
  }
  const stored = safeStorage.get<DeviceIdentity | null>(KEY, null);
  return stored?.id ? stored : { id: defaultId, key: null };
}
