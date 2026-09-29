import { Fragment, useEffect, useState } from 'react';
import {
  contentResources,
  roleLabels,
  rolePolicies,
  roles,
  systemResources,
  type Role,
  type Venue,
} from '../../../../packages/domain';
import { CentreLogo } from '../../brand/CentreLogo';
import { Glyph } from '../../icons/glyphs';
import { api } from '../../shared/api';
import {
  errorMessage,
  fieldErrors,
  useCommand,
  type AdminUser,
  type SystemSettings,
} from '../data';
import {
  Badge,
  ChipSelect,
  ColorField,
  ConfirmButton,
  DataTable,
  Drawer,
  Empty,
  NumberField,
  PageHeader,
  Panel,
  SelectField,
  TextArea,
  TextField,
  ToggleField,
  formatDateTime,
  relativeTime,
} from '../ui';

export default function Admin({ section }: { section: string }) {
  switch (section) {
    case 'venue':
      return <VenuePage />;
    case 'users':
      return <UsersPage />;
    case 'roles':
      return <RolesPage />;
    case 'branding':
      return <BrandingPage />;
    case 'languages':
      return <LanguagesPage />;
    case 'settings':
      return <SettingsPage />;
    case 'audit':
      return <AuditPage />;
    default:
      return <Empty title="Section not found" />;
  }
}

function VenuePage() {
  const command = useCommand();
  const canWrite = command.can('venue', 'write');
  const [venue, setVenue] = useState<Venue>(command.data.venue);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Venue>(key: K, value: Venue[K]) =>
    setVenue((v) => ({ ...v, [key]: value }));
  const save = async () => {
    try {
      await api('/api/admin/venue', { method: 'PUT', body: venue });
      command.toast('Venue saved. Publish to update screens.');
      setErrors({});
      await command.reload();
    } catch (e) {
      setErrors(fieldErrors(e));
      command.toast(errorMessage(e), 'error');
    }
  };
  return (
    <>
      <PageHeader
        title="Venue"
        subtitle="Centre details shown on kiosks, WAY EZY GO and help screens."
        actions={
          <button type="button" className="btn btn-primary" onClick={save} disabled={!canWrite}>
            Save venue
          </button>
        }
      />
      <div className="cmd-grid-2">
        <Panel title="Profile">
          <fieldset className="cmd-form" disabled={!canWrite}>
            <TextField
              label="Centre name"
              value={venue.name}
              onChange={(v) => set('name', v)}
              error={errors.name}
              wide
            />
            <TextField
              label="Address"
              value={venue.address}
              onChange={(v) => set('address', v)}
              wide
            />
            <TextArea
              label="Visitor description"
              value={venue.description}
              onChange={(v) => set('description', v)}
              maxLength={1500}
            />
            <TextField
              label="Opening hours"
              value={venue.openingHours}
              onChange={(v) => set('openingHours', v)}
              wide
              hint="Shown in the kiosk header"
            />
          </fieldset>
        </Panel>
        <Panel title="Contact & locale">
          <fieldset className="cmd-form" disabled={!canWrite}>
            <TextField label="Phone" value={venue.phone} onChange={(v) => set('phone', v)} />
            <TextField label="Email" value={venue.email} onChange={(v) => set('email', v)} />
            <TextField
              label="Website"
              value={venue.website}
              onChange={(v) => set('website', v)}
              error={errors.website}
              placeholder="https://"
              wide
            />
            <SelectField
              label="Timezone"
              value={venue.timezone}
              onChange={(v) => set('timezone', v)}
              options={['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'UTC'].map(
                (z) => ({ value: z, label: z }),
              )}
            />
            <ColorField
              label="Brand colour"
              value={venue.brandColor}
              onChange={(v) => set('brandColor', v)}
              error={errors.brandColor}
            />
          </fieldset>
        </Panel>
      </div>
    </>
  );
}

function UsersPage() {
  const command = useCommand();
  const canWrite = command.can('users', 'write');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [editing, setEditing] = useState<{
    user: AdminUser & { password?: string };
    isNew: boolean;
  } | null>(null);
  const load = () =>
    api<AdminUser[]>('/api/admin/users')
      .then(setUsers)
      .catch((e) => command.toast(errorMessage(e), 'error'));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <PageHeader
        title="Users"
        subtitle="People who can sign in to COMMAND. Visitors never need an account."
        actions={
          canWrite ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                setEditing({
                  user: {
                    id: '',
                    name: '',
                    email: '',
                    role: 'CONTENT_MANAGER',
                    active: true,
                    lastLoginAt: null,
                    createdAt: '',
                    password: '',
                  },
                  isNew: true,
                })
              }
            >
              <Glyph name="plus" size={16} /> Create user
            </button>
          ) : null
        }
      />
      <DataTable
        rows={users}
        searchText={(u) => `${u.name} ${u.email} ${u.role}`}
        onRowClick={
          canWrite ? (u) => setEditing({ user: { ...u, password: '' }, isNew: false }) : undefined
        }
        columns={[
          {
            key: 'name',
            header: 'Name',
            sort: (u) => u.name,
            render: (u) => (
              <span className="cmd-cell-title">
                <strong>
                  {u.name}
                  {u.id === command.user.id ? ' (you)' : ''}
                </strong>
                <small>{u.email}</small>
              </span>
            ),
          },
          {
            key: 'role',
            header: 'Role',
            sort: (u) => u.role,
            render: (u) => (
              <Badge tone={u.role === 'SUPER_ADMIN' ? 'violet' : 'blue'}>
                {roleLabels[u.role]}
              </Badge>
            ),
          },
          {
            key: 'active',
            header: 'Status',
            render: (u) =>
              u.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>,
          },
          {
            key: 'login',
            header: 'Last sign-in',
            sort: (u) => u.lastLoginAt ?? '',
            render: (u) => relativeTime(u.lastLoginAt),
          },
          { key: 'created', header: 'Created', render: (u) => formatDateTime(u.createdAt) },
        ]}
      />
      {editing ? (
        <UserEditor
          initial={editing.user}
          isNew={editing.isNew}
          onClose={() => {
            setEditing(null);
            void load();
          }}
        />
      ) : null}
    </>
  );
}

function UserEditor({
  initial,
  isNew,
  onClose,
}: {
  initial: AdminUser & { password?: string };
  isNew: boolean;
  onClose: () => void;
}) {
  const command = useCommand();
  const [user, setUser] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const nextErrors: Record<string, string> = {};
    if (!user.name.trim()) nextErrors.name = 'Enter a name.';
    if (!user.email.trim()) nextErrors.email = 'Enter an email address.';
    if ((isNew || user.password) && (user.password?.length ?? 0) < 12)
      nextErrors.password = 'Use at least 12 characters.';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: user.name.trim(),
        email: user.email.trim(),
        role: user.role,
        active: user.active,
        password: user.password || undefined,
      };
      if (isNew) await api('/api/admin/users', { method: 'POST', body });
      else await api(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'PUT', body });
      command.toast(isNew ? `${user.email} can now sign in.` : 'User updated.');
      onClose();
    } catch (e) {
      setErrors(fieldErrors(e));
      command.toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      title={isNew ? 'Create user' : initial.name}
      onClose={onClose}
      footer={
        <>
          {!isNew && user.id !== command.user.id ? (
            <ConfirmButton
              label="Delete user"
              onConfirm={async () => {
                try {
                  await api(`/api/admin/users/${encodeURIComponent(user.id)}`, {
                    method: 'DELETE',
                  });
                  command.toast('User deleted.');
                  onClose();
                } catch (e) {
                  command.toast(errorMessage(e), 'error');
                }
              }}
            />
          ) : (
            <span />
          )}
          <span className="cmd-foot-spacer" />
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Create user' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="cmd-form">
        <TextField
          label="Full name"
          value={user.name}
          onChange={(v) => setUser({ ...user, name: v })}
          error={errors.name}
        />
        <TextField
          label="Email"
          type="email"
          value={user.email}
          onChange={(v) => setUser({ ...user, email: v })}
          error={errors.email}
        />
        <SelectField
          label="Role"
          value={user.role}
          onChange={(v) => setUser({ ...user, role: v as Role })}
          options={roles.map((r) => ({ value: r, label: roleLabels[r] }))}
        />
        <ToggleField
          label="Active"
          checked={user.active}
          onChange={(v) => setUser({ ...user, active: v })}
        />
        <TextField
          label={isNew ? 'Initial password' : 'Reset password (optional)'}
          type="password"
          value={user.password ?? ''}
          onChange={(v) => setUser({ ...user, password: v })}
          error={errors.password}
          hint="At least 12 characters. Resetting signs the user out everywhere."
          wide
        />
      </div>
    </Drawer>
  );
}

function RolesPage() {
  const resources = [...contentResources, ...systemResources.filter((r) => r !== 'publish')];
  return (
    <>
      <PageHeader
        title="Roles & permissions"
        subtitle="Least-privilege roles, enforced on the server for every API call — hiding a button is never the only protection."
      />
      <Panel>
        <div className="cmd-table-scroll">
          <table className="cmd-table cmd-matrix">
            <thead>
              <tr>
                <th>Resource</th>
                {roles.map((r) => (
                  <th key={r}>{roleLabels[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => (
                <tr key={resource}>
                  <td>
                    <strong>{resource}</strong>
                  </td>
                  {roles.map((role) => {
                    const p = rolePolicies[role];
                    const write = p.write === '*' || p.write.includes(resource);
                    const read = write || p.read === '*' || p.read.includes(resource);
                    return (
                      <td key={role}>
                        {write ? (
                          <Badge tone="green">Edit</Badge>
                        ) : read ? (
                          <Badge tone="blue">View</Badge>
                        ) : (
                          <span className="cmd-muted">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td>
                  <strong>publish</strong>
                </td>
                {roles.map((role) => (
                  <td key={role}>
                    {rolePolicies[role].publish ? (
                      <Badge tone="violet">Publish</Badge>
                    ) : (
                      <span className="cmd-muted">—</span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="cmd-grid-3">
        {roles.map((role) => (
          <Panel key={role} title={roleLabels[role]}>
            <p className="cmd-muted cmd-small">
              {
                {
                  SUPER_ADMIN:
                    'Everything, including users, roles, system settings and destructive actions.',
                  MALL_ADMIN:
                    'Runs the centre: directory, maps, routing, devices, campaigns, settings and publishing.',
                  CONTENT_MANAGER:
                    'Tenants, categories, amenities, offers, events and media. Can publish content.',
                  ADVERTISING_MANAGER: 'Campaigns, media and ad analytics. Can publish campaigns.',
                  ANALYST: 'Read-only access to content, analytics and the audit log.',
                  DEVICE_OPERATOR:
                    'Screens & devices: provisioning, idle timeout and maintenance status.',
                }[role]
              }
            </p>
          </Panel>
        ))}
      </div>
    </>
  );
}

function useSettings() {
  const command = useCommand();
  const [settings, setSettings] = useState<SystemSettings | null>(command.settings);
  const save = async (patch: Partial<SystemSettings>) => {
    try {
      const next = await api<SystemSettings>('/api/admin/settings', { method: 'PUT', body: patch });
      setSettings(next);
      command.toast('Settings saved. Screens pick them up on their next refresh.');
      await command.reload();
    } catch (e) {
      command.toast(errorMessage(e), 'error');
    }
  };
  return { settings, setSettings, save, canWrite: command.can('settings', 'write') };
}

function BrandingPage() {
  const { settings, setSettings, save, canWrite } = useSettings();
  if (!settings) return <Empty title="Settings unavailable for your role" />;
  return (
    <>
      <PageHeader
        title="Branding"
        subtitle="Approved IREO Boulevard artwork for COMMAND, with BrainADZ as the platform credit."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => save(settings)}
            disabled={!canWrite}
          >
            Save branding
          </button>
        }
      />
      <div className="cmd-grid-2">
        <Panel title="Kiosk appearance">
          <fieldset className="cmd-form" disabled={!canWrite}>
            <ColorField
              label="Accent colour"
              value={settings.kioskAccentColor}
              onChange={(v) => setSettings({ ...settings, kioskAccentColor: v })}
            />
            <SelectField
              label="Default map style"
              value={settings.kioskDefaultMapMode}
              onChange={(v) => setSettings({ ...settings, kioskDefaultMapMode: v as '3d' | 'svg' })}
              options={[
                { value: '3d', label: '3D (recommended)' },
                { value: 'svg', label: '2D — for low-power screens' },
              ]}
            />
            <ToggleField
              label="Show “Powered by BrainADZ”"
              checked={settings.showPoweredBy}
              onChange={(v) => setSettings({ ...settings, showPoweredBy: v })}
            />
            <ToggleField
              label="High-contrast mode by default"
              checked={settings.kioskHighContrastDefault}
              onChange={(v) => setSettings({ ...settings, kioskHighContrastDefault: v })}
            />
          </fieldset>
        </Panel>
        <Panel title="Centre logo" subtitle="Approved green artwork">
          <div className="cmd-brand-preview">
            <div className="is-centre">
              <CentreLogo />
              <span>Powered by BrainADZ</span>
            </div>
          </div>
          <ul className="cmd-downloads">
            <li>
              <a href="/Green%20logo.png" download="ireo-boulevard-logo.png">
                <Glyph name="download" size={14} /> Download IREO Boulevard logo
              </a>
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}

function LanguagesPage() {
  const command = useCommand();
  const { data } = command;
  const canWrite = command.can('venue', 'write');
  const [languages, setLanguages] = useState(data.venue.languages);
  const [defaultLanguage, setDefault] = useState(data.venue.defaultLanguage);
  const translated = data.tenants.filter(
    (t) => t.i18n.hi?.name || t.i18n.hi?.shortSummary || t.i18n.hi?.description,
  );
  return (
    <>
      <PageHeader
        title="Languages"
        subtitle="Visitor interface languages. Tenant text falls back to English when a translation is missing."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canWrite}
            onClick={async () => {
              try {
                await api('/api/admin/venue', {
                  method: 'PUT',
                  body: {
                    ...data.venue,
                    languages: languages.length ? languages : ['en'],
                    defaultLanguage,
                  },
                });
                command.toast('Languages saved.');
                await command.reload();
              } catch (e) {
                command.toast(errorMessage(e), 'error');
              }
            }}
          >
            Save languages
          </button>
        }
      />
      <div className="cmd-grid-2">
        <Panel title="Enabled languages">
          <fieldset className="cmd-form" disabled={!canWrite}>
            <ChipSelect
              label="Available on kiosks"
              options={[
                { value: 'en', label: 'English' },
                { value: 'hi', label: 'हिन्दी · Hindi' },
              ]}
              value={languages}
              onChange={setLanguages}
            />
            <SelectField
              label="Default language"
              value={defaultLanguage}
              onChange={setDefault}
              options={languages.map((l) => ({
                value: l,
                label: l === 'hi' ? 'हिन्दी · Hindi' : 'English',
              }))}
            />
          </fieldset>
          <p className="cmd-small cmd-muted">
            The kiosk UI ships with English and Hindi. Additional languages can be added to the
            translation dictionary in code and enabled here.
          </p>
        </Panel>
        <Panel title="Tenant translation coverage">
          <div className="cmd-coverage">
            <strong>
              {translated.length} / {data.tenants.length}
            </strong>
            <span>tenants have Hindi text</span>
            <i
              style={{ width: `${(translated.length / Math.max(1, data.tenants.length)) * 100}%` }}
            />
          </div>
          <p className="cmd-small cmd-muted">Add translations in Tenants → Translations.</p>
        </Panel>
      </div>
    </>
  );
}

function SettingsPage() {
  const command = useCommand();
  const { settings, setSettings, save, canWrite } = useSettings();
  if (!settings) return <Empty title="Settings unavailable for your role" />;
  return (
    <>
      <PageHeader
        title="System settings"
        subtitle="Visitor settings and server status. Account access is managed under Users."
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => save(settings)}
            disabled={!canWrite}
          >
            Save settings
          </button>
        }
      />
      <div className="cmd-grid-2">
        <Panel title="Visitor hand-off & data">
          <fieldset className="cmd-form" disabled={!canWrite}>
            <NumberField
              label="QR route link lifetime (minutes)"
              value={settings.qrTokenTtlMinutes}
              onChange={(v) => setSettings({ ...settings, qrTokenTtlMinutes: v })}
              min={5}
              max={1440}
              hint="Signed links expire after this time"
            />
            <NumberField
              label="Analytics retention (days)"
              value={settings.analyticsRetentionDays}
              onChange={(v) => setSettings({ ...settings, analyticsRetentionDays: v })}
              min={7}
              max={3650}
            />
            <TextField
              label="Support email"
              value={settings.supportEmail}
              onChange={(v) => setSettings({ ...settings, supportEmail: v })}
            />
            <TextField
              label="Help phone shown to visitors"
              value={settings.supportPhone}
              onChange={(v) => setSettings({ ...settings, supportPhone: v })}
            />
          </fieldset>
          <p className="cmd-small cmd-muted">
            Kiosk idle timeout is configured per device in Screens & Devices (one control applies it
            to all kiosks).
          </p>
        </Panel>
        <Panel title="System">
          <dl className="cmd-dl">
            <dt>Version</dt>
            <dd>WAY EZY {command.appVersion}</dd>
            <dt>Mode</dt>
            <dd>{command.mode}</dd>
            <dt>Database</dt>
            <dd>{command.database === 'pglite' ? 'Embedded PostgreSQL (PGlite)' : 'PostgreSQL'}</dd>
            <dt>Media storage</dt>
            <dd>{command.storage === 'local' ? 'Local disk' : 'Supabase Storage'}</dd>
            <dt>Published version</dt>
            <dd>
              <code>{command.publish.version ?? '—'}</code>
            </dd>
            <dt>Live screen connections</dt>
            <dd>{command.publish.connectedClients}</dd>
          </dl>
          {command.can('settings', 'write') ? (
            <ConfirmButton
              label="Clear demo analytics"
              confirmLabel="Confirm — remove demo-seed events"
              onConfirm={async () => {
                try {
                  const result = await api<{ removed: number }>('/api/admin/analytics/clear-demo', {
                    method: 'POST',
                    body: {},
                  });
                  command.toast(`Removed ${result.removed} demo analytics events.`);
                } catch (e) {
                  command.toast(errorMessage(e), 'error');
                }
              }}
            />
          ) : null}
        </Panel>
        <Panel title="Admin access" subtitle="How the initial account is created">
          <p className="cmd-muted cmd-small">
            The server reads ADMIN_EMAIL and ADMIN_PASSWORD from the environment or root .env file
            when a venue has no active Super Admin. An existing account keeps its current password.
          </p>
          <p className="cmd-muted cmd-small">
            To reset a current password, open Users, select the account, and enter a new password.
            Passwords are never shown in this panel.
          </p>
          {command.can('users', 'read') ? (
            <a className="btn btn-outline" href="/command/users">
              Manage users
            </a>
          ) : null}
        </Panel>
      </div>
    </>
  );
}

interface AuditEntry {
  id: number;
  at: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  before: unknown;
  after: unknown;
}

function AuditPage() {
  const command = useCommand();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<AuditEntry | null>(null);
  useEffect(() => {
    const params = new URLSearchParams({ limit: '50', offset: String(offset) });
    if (entity) params.set('entityType', entity);
    if (action) params.set('action', action);
    api<AuditEntry[]>(`/api/admin/audit?${params.toString()}`)
      .then(setEntries)
      .catch((e) => command.toast(errorMessage(e), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, action, offset]);
  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Who changed what, and when — including sign-ins, publishes and corridor closures."
      />
      <DataTable
        rows={entries.map((e) => ({ ...e, id: String(e.id) }))}
        onRowClick={(e) => setOpen(entries.find((x) => String(x.id) === e.id) ?? null)}
        filters={
          <>
            <select
              className="cmd-select"
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value);
                setOffset(0);
              }}
              aria-label="Entity"
            >
              <option value="">All records</option>
              {[
                'tenants',
                'categories',
                'pois',
                'offers',
                'events',
                'campaigns',
                'media',
                'devices',
                'nodes',
                'edges',
                'features',
                'connectors',
                'venue',
                'users',
                'settings',
                'snapshot',
                'auth',
                'analytics',
              ].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <select
              className="cmd-select"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setOffset(0);
              }}
              aria-label="Action"
            >
              <option value="">All actions</option>
              {[
                'create',
                'update',
                'delete',
                'publish',
                'closure',
                'login',
                'login_failed',
                'logout',
              ].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </>
        }
        toolbar={
          <span className="cmd-pager-inline">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Newer
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={entries.length < 50}
              onClick={() => setOffset(offset + 50)}
            >
              Older
            </button>
          </span>
        }
        columns={[
          {
            key: 'at',
            header: 'When',
            render: (e) => (
              <span className="cmd-cell-title">
                <span>{formatDateTime(e.at)}</span>
                <small>{relativeTime(e.at)}</small>
              </span>
            ),
          },
          {
            key: 'who',
            header: 'Who',
            render: (e) => e.userEmail || <span className="cmd-muted">system</span>,
          },
          {
            key: 'action',
            header: 'Action',
            render: (e) => (
              <Badge
                tone={
                  e.action === 'delete' || e.action === 'login_failed'
                    ? 'red'
                    : e.action === 'publish'
                      ? 'violet'
                      : e.action === 'closure'
                        ? 'amber'
                        : 'blue'
                }
              >
                {e.action}
              </Badge>
            ),
          },
          {
            key: 'entity',
            header: 'Record',
            render: (e) => (
              <span className="cmd-cell-title">
                <span>{e.entityType}</span>
                <small>
                  <code>{e.entityId}</code>
                </small>
              </span>
            ),
          },
          { key: 'summary', header: 'Summary', render: (e) => e.summary },
        ]}
      />
      {open ? <AuditDetail entry={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function AuditDetail({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  const before = (entry.before ?? {}) as Record<string, unknown>;
  const after = (entry.after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changed = keys.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
  const show = (v: unknown) =>
    v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v);
  return (
    <Drawer
      wide
      title={entry.summary || entry.action}
      subtitle={`${entry.userEmail || 'system'} · ${formatDateTime(entry.at)}`}
      onClose={onClose}
    >
      {entry.before !== null && entry.after !== null ? (
        <>
          <p className="cmd-muted">{changed.length} field(s) changed</p>
          <div className="cmd-diff">
            <strong>Field</strong>
            <strong>Before</strong>
            <strong>After</strong>
            {changed.map((k) => (
              <Fragment key={k}>
                <code>{k}</code>
                <span className="is-before">{show(before[k])}</span>
                <span className="is-after">{show(after[k])}</span>
              </Fragment>
            ))}
          </div>
        </>
      ) : (
        <pre className="cmd-json">{JSON.stringify(entry.after ?? entry.before ?? {}, null, 2)}</pre>
      )}
    </Drawer>
  );
}
