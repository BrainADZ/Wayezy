import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Snapshot } from '../../../packages/domain';
import { safeStorage } from './storage';

export interface PublicConfig {
  appVersion: string;
  /** Entry script of the deployed client build (null in development). */
  clientBuild?: string | null;
  mode: 'demo' | 'production';
  venueId: string;
  publicBaseUrl: string;
  allowUnsignedDeepLinks: boolean;
  qrTokenTtlMinutes: number;
  showPoweredBy: boolean;
  kioskAccentColor: string;
  kioskDefaultMapMode: '3d' | 'svg';
  kioskHighContrastDefault: boolean;
  supportPhone: string;
}

type Status = 'loading' | 'ready' | 'offline' | 'error';

interface ContentState {
  data: Snapshot | null;
  config: PublicConfig | null;
  status: Status;
  online: boolean;
  lastSyncedAt: string | null;
  /** Increments whenever a newer published version arrives (for "updated" toasts). */
  updateCount: number;
  refresh(): Promise<void>;
}

const SNAPSHOT_KEY = 'wez-snapshot';
const CONFIG_KEY = 'wez-config';
const Ctx = createContext<ContentState | null>(null);

/**
 * Published content for Kiosk and WAY EZY GO.
 *
 * - Renders instantly from the last cached snapshot (offline-first).
 * - Fetches /api/snapshot with ETag revalidation.
 * - Listens to /api/stream (SSE) for `published` events, with a 30 s polling fallback.
 */
export function ContentProvider({ children }: { children: ReactNode }) {
  const cached = useMemo(
    () =>
      safeStorage.get<{ data: Snapshot; etag: string; syncedAt: string } | null>(
        SNAPSHOT_KEY,
        null,
      ),
    [],
  );
  const [data, setData] = useState<Snapshot | null>(cached?.data ?? null);
  const [config, setConfig] = useState<PublicConfig | null>(() =>
    safeStorage.get<PublicConfig | null>(CONFIG_KEY, null),
  );
  const [status, setStatus] = useState<Status>(cached ? 'ready' : 'loading');
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(cached?.syncedAt ?? null);
  const [updateCount, setUpdateCount] = useState(0);
  const etag = useRef(cached?.etag ?? '');
  const version = useRef(cached?.data.version ?? '');
  const dataRef = useRef<Snapshot | null>(cached?.data ?? null);
  const warmedVersion = useRef('');

  /** Asks the service worker to cache the published media (adverts, logos, photos) for offline playback. */
  const warmMediaCache = useCallback(() => {
    const snapshot = dataRef.current;
    const controller =
      typeof navigator !== 'undefined' && 'serviceWorker' in navigator
        ? navigator.serviceWorker.controller
        : null;
    if (!snapshot || !controller || warmedVersion.current === snapshot.version) return;
    warmedVersion.current = snapshot.version;
    const urls = new Set<string>();
    for (const m of snapshot.media) if (m.url.startsWith('/')) urls.add(m.url);
    for (const t of snapshot.tenants)
      for (const u of [t.logo, t.heroImage, ...t.gallery]) if (u?.startsWith('/')) urls.add(u);
    controller.postMessage({ type: 'cache-media', urls: [...urls] });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/snapshot', {
        headers: etag.current ? { 'if-none-match': etag.current } : {},
        cache: 'no-cache',
      });
      if (response.status === 304) {
        setStatus('ready');
        setOnline(true);
        setLastSyncedAt(new Date().toISOString());
        warmMediaCache();
        return;
      }
      if (!response.ok) throw new Error(`Snapshot ${response.status}`);
      const next = (await response.json()) as Snapshot;
      const syncedAt = new Date().toISOString();
      etag.current = response.headers.get('etag') ?? '';
      if (version.current && version.current !== next.version) setUpdateCount((n) => n + 1);
      version.current = next.version;
      dataRef.current = next;
      setData(next);
      setStatus('ready');
      setOnline(true);
      setLastSyncedAt(syncedAt);
      safeStorage.set(SNAPSHOT_KEY, { data: next, etag: etag.current, syncedAt });
      warmMediaCache();
    } catch {
      setOnline(false);
      setStatus((current) => (current === 'loading' && !version.current ? 'error' : 'offline'));
    }
  }, [warmMediaCache]);

  useEffect(() => {
    void refresh();
    const loadConfig = () =>
      fetch('/api/config', { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : null))
        .then((next: PublicConfig | null) => {
          if (next) {
            setConfig(next);
            safeStorage.set(CONFIG_KEY, next);
          }
        })
        .catch(() => undefined);
    void loadConfig();

    let source: EventSource | null = null;
    let retry: number | undefined;
    const connect = () => {
      if (typeof EventSource === 'undefined') return;
      source = new EventSource('/api/stream');
      source.addEventListener('published', () => void refresh());
      source.addEventListener('hello', (event) => {
        const incoming = JSON.parse((event as MessageEvent).data || '{}') as { version?: string };
        setOnline(true);
        if (incoming.version && incoming.version !== version.current) void refresh();
      });
      source.onerror = () => {
        // navigator.onLine only reflects the local network; a failed stream means the server is unreachable.
        setOnline(false);
        source?.close();
        retry = window.setTimeout(connect, 5000);
      };
    };
    connect();
    // The first visit is not yet controlled by the service worker; warm the media cache once it takes over.
    const onControllerChange = () => warmMediaCache();
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator)
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    const poll = window.setInterval(() => {
      void refresh();
      void loadConfig();
    }, 30_000);
    const goOnline = () => {
      setOnline(true);
      void refresh();
    };
    const goOffline = () => {
      setOnline(false);
      setStatus((s) => (s === 'ready' ? 'offline' : s));
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      source?.close();
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator)
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      window.clearTimeout(retry);
      window.clearInterval(poll);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [refresh, warmMediaCache]);

  const value = useMemo(
    () => ({ data, config, status, online, lastSyncedAt, updateCount, refresh }),
    [data, config, status, online, lastSyncedAt, updateCount, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useContent() {
  const value = useContext(Ctx);
  if (!value) throw new Error('useContent must be used inside ContentProvider');
  return value;
}
