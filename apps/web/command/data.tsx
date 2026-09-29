import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ContentResource, Resource, Role, Snapshot } from '../../../packages/domain';
import { api, ApiError } from '../shared/api';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Permissions {
  read: Resource[];
  write: Resource[];
  publish: boolean;
}

export interface DeviceRuntime {
  id: string;
  provisioned: boolean;
  softwareVersion: string;
  lastHeartbeatAt: string | null;
  lastContentVersion: string;
  lastStatus: Record<string, unknown>;
  health: 'online' | 'warning' | 'offline' | 'maintenance' | 'disabled' | 'unprovisioned';
  healthReason: string;
}

export interface PublishStatus {
  version: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  pendingChanges: number;
  connectedClients: number;
}

export interface SystemSettings {
  qrTokenTtlMinutes: number;
  analyticsRetentionDays: number;
  showPoweredBy: boolean;
  kioskAccentColor: string;
  kioskDefaultMapMode: '3d' | 'svg';
  kioskHighContrastDefault: boolean;
  supportEmail: string;
  supportPhone: string;
}

export type WorkingCopy = Omit<Snapshot, 'version' | 'publishedAt'>;

interface Bootstrap {
  user: AdminUser;
  permissions: Permissions;
  data: Partial<WorkingCopy>;
  deviceRuntime: DeviceRuntime[];
  settings: SystemSettings | null;
  publish: PublishStatus;
  appVersion: string;
  mode: string;
  storage: string;
  database: string;
}

interface CommandState extends Bootstrap {
  data: WorkingCopy;
  reload(): Promise<void>;
  refreshPublish(): Promise<void>;
  can(resource: Resource, action?: 'read' | 'write'): boolean;
  canPublish: boolean;
  signOut(): Promise<void>;
  toast(message: string, tone?: 'success' | 'error' | 'info'): void;
}

const Ctx = createContext<CommandState | null>(null);

const emptyCopy = (): WorkingCopy =>
  ({
    venue: {
      id: '',
      name: '',
      timezone: 'Asia/Kolkata',
      address: '',
      description: '',
      brandColor: '#005247',
      phone: '',
      email: '',
      website: '',
      openingHours: '',
      defaultLanguage: 'en',
      languages: ['en'],
    },
    floors: [],
    categories: [],
    features: [],
    nodes: [],
    edges: [],
    connectors: [],
    tenants: [],
    pois: [],
    offers: [],
    events: [],
    campaigns: [],
    devices: [],
    media: [],
  }) as WorkingCopy;

export function CommandProvider({
  children,
  onSignedOut,
  toast,
}: {
  children: ReactNode;
  onSignedOut: () => void;
  toast: CommandState['toast'];
}) {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await api<Bootstrap>('/api/admin/bootstrap');
      setBoot(next);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onSignedOut();
      else setError(e instanceof Error ? e.message : 'Could not load COMMAND.');
    }
  }, [onSignedOut]);

  const refreshPublish = useCallback(async () => {
    try {
      const publish = await api<PublishStatus>('/api/admin/publish/status');
      setBoot((b) => (b ? { ...b, publish } : b));
    } catch {
      /* ignore transient errors */
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const timer = window.setInterval(() => void refreshPublish(), 20_000);
    return () => window.clearInterval(timer);
  }, [refreshPublish]);

  const value = useMemo<CommandState | null>(() => {
    if (!boot) return null;
    const read = new Set(boot.permissions.read);
    const write = new Set(boot.permissions.write);
    return {
      ...boot,
      data: { ...emptyCopy(), ...boot.data } as WorkingCopy,
      reload,
      refreshPublish,
      can: (resource, action = 'read') =>
        action === 'read' ? read.has(resource) || write.has(resource) : write.has(resource),
      canPublish: boot.permissions.publish,
      signOut: async () => {
        await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
        onSignedOut();
      },
      toast,
    };
  }, [boot, reload, refreshPublish, onSignedOut, toast]);

  if (error && !boot) {
    return (
      <div className="cmd-fatal">
        <h1>COMMAND could not load</h1>
        <p>{error}</p>
        <button type="button" className="btn btn-primary" onClick={() => void reload()}>
          Try again
        </button>
      </div>
    );
  }
  if (!value)
    return (
      <div className="cmd-loading">
        <span className="splash-loader" />
      </div>
    );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCommand() {
  const value = useContext(Ctx);
  if (!value) throw new Error('useCommand must be used inside CommandProvider');
  return value;
}

/* ------------------------------------------------------------------ */
/* Resource mutations                                                   */
/* ------------------------------------------------------------------ */

export type TableResource = Exclude<ContentResource, 'venue'>;

export async function saveResource<T extends { id?: string }>(
  resource: TableResource,
  item: T,
  existingId?: string,
) {
  if (existingId)
    return api<T>(`/api/admin/resources/${resource}/${encodeURIComponent(existingId)}`, {
      method: 'PUT',
      body: item,
    });
  return api<T & { deviceKey?: { key: string; provisioningUrl: string } }>(
    `/api/admin/resources/${resource}`,
    { method: 'POST', body: item },
  );
}

export async function deleteResource(resource: TableResource, id: string) {
  return api(`/api/admin/resources/${resource}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.details?.length)
      return `${error.message} ${error.details.map((d) => `${d.path ? `${d.path}: ` : ''}${d.message}`).join(' · ')}`;
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.details) return {};
  return Object.fromEntries(error.details.map((d) => [d.path.split('.')[0] || '_', d.message]));
}

/** Small path router for /command/<section>[/<record>]. */
export function useSection(defaultSection = 'dashboard') {
  const read = () =>
    window.location.pathname.replace(/^\/command\/?/, '').replace(/\/$/, '') || defaultSection;
  const [section, setSection] = useState(read);
  useEffect(() => {
    const onPop = () => setSection(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const navigate = useCallback((next: string) => {
    window.history.pushState(null, '', `/command/${next}`);
    setSection(next);
    window.scrollTo({ top: 0 });
  }, []);
  return [section, navigate] as const;
}
