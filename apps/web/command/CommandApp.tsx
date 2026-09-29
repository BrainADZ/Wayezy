import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import '../styles/command.css';
import { roleLabels, type Resource } from '../../../packages/domain';
import { CentreLogo } from '../brand/CentreLogo';
import { Glyph } from '../icons/glyphs';
import { api, ApiError } from '../shared/api';
import { CommandProvider, errorMessage, useCommand, useSection } from './data';
import { Modal, relativeTime } from './ui';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Tenants = lazy(() => import('./pages/Tenants'));
const Directory = lazy(() => import('./pages/Directory'));
const Advertising = lazy(() => import('./pages/Advertising'));
const MediaLibrary = lazy(() => import('./pages/MediaLibrary'));
const Devices = lazy(() => import('./pages/Devices'));
const Analytics = lazy(() => import('./pages/Analytics'));
const MapEditor = lazy(() => import('./pages/MapEditor'));
const Routing = lazy(() => import('./pages/GroundRouting'));
const Admin = lazy(() => import('./pages/Admin'));

interface NavItem {
  id: string;
  label: string;
  icon: string;
  resource: Resource;
}

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: 'dashboard', resource: 'venue' }],
  },
  {
    label: 'Venue & maps',
    items: [
      { id: 'venue', label: 'Venue', icon: 'building', resource: 'venue' },
      { id: 'maps', label: 'Floors & Maps', icon: 'map', resource: 'features' },
      { id: 'routing', label: 'Routing', icon: 'route', resource: 'edges' },
    ],
  },
  {
    label: 'Directory',
    items: [
      { id: 'tenants', label: 'Tenants', icon: 'store', resource: 'tenants' },
      { id: 'categories', label: 'Categories', icon: 'grid', resource: 'categories' },
      { id: 'amenities', label: 'Amenities & POIs', icon: 'pin', resource: 'pois' },
      { id: 'offers', label: 'Offers', icon: 'tag', resource: 'offers' },
      { id: 'events', label: 'Events', icon: 'calendar', resource: 'events' },
    ],
  },
  {
    label: 'Advertising',
    items: [
      { id: 'advertising', label: 'Campaigns', icon: 'megaphone', resource: 'campaigns' },
      { id: 'media', label: 'Media Library', icon: 'image', resource: 'media' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'devices', label: 'Screens & Devices', icon: 'monitor', resource: 'devices' },
      { id: 'analytics', label: 'Analytics', icon: 'chart', resource: 'analytics' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { id: 'users', label: 'Users', icon: 'users', resource: 'users' },
      { id: 'roles', label: 'Roles & Permissions', icon: 'shield', resource: 'users' },
      { id: 'branding', label: 'Branding', icon: 'palette', resource: 'settings' },
      { id: 'languages', label: 'Languages', icon: 'globe', resource: 'venue' },
      { id: 'settings', label: 'System Settings', icon: 'settings', resource: 'settings' },
      { id: 'audit', label: 'Audit Log', icon: 'history', resource: 'audit' },
    ],
  },
];

export default function CommandApp() {
  const [status, setStatus] = useState<'checking' | 'signed-in' | 'signed-out'>('checking');
  const [toasts, setToasts] = useState<
    { id: number; message: string; tone: 'success' | 'error' | 'info' }[]
  >([]);

  useEffect(() => {
    document.title = 'WAY EZY COMMAND';
    document.documentElement.classList.add('command-root');
    api<{ authenticated: boolean }>('/api/auth/session')
      .then((r) => setStatus(r.authenticated ? 'signed-in' : 'signed-out'))
      .catch(() => setStatus('signed-out'));
    return () => document.documentElement.classList.remove('command-root');
  }, []);

  const toast = useCallback((message: string, tone: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-3), { id, message, tone }]);
    window.setTimeout(
      () => setToasts((list) => list.filter((t) => t.id !== id)),
      tone === 'error' ? 7000 : 3800,
    );
  }, []);
  const signedOut = useCallback(() => setStatus('signed-out'), []);

  return (
    <>
      {status === 'checking' ? (
        <div className="cmd-loading">
          <span className="splash-loader" />
        </div>
      ) : status === 'signed-out' ? (
        <Login onSignedIn={() => setStatus('signed-in')} />
      ) : (
        <CommandProvider onSignedOut={signedOut} toast={toast}>
          <Shell />
        </CommandProvider>
      )}
      <div className="cmd-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`cmd-toast is-${t.tone}`}
            role={t.tone === 'error' ? 'alert' : 'status'}
          >
            <Glyph
              name={t.tone === 'error' ? 'alert' : t.tone === 'info' ? 'info' : 'check'}
              size={18}
            />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/login', { method: 'POST', body: { email: email.trim(), password } });
      window.history.replaceState(
        null,
        '',
        window.location.pathname.startsWith('/command') ? window.location.pathname : '/command',
      );
      onSignedIn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="cmd-login">
      <section className="cmd-login-card">
        <div className="cmd-login-card-inner">
          <div className="cmd-login-brand">
            <CentreLogo />
            <span>COMMAND ADMIN PORTAL</span>
          </div>
          <div className="cmd-login-intro">
            <h1>Welcome back</h1>
            <p>Sign in to manage IREO Boulevard's directory, maps, screens and campaigns.</p>
          </div>
          <form onSubmit={submit}>
            <label htmlFor="command-email">Work email</label>
            <div className="cmd-login-input">
              <Glyph name="mail" size={18} />
              <input
                id="command-email"
                type="email"
                inputMode="email"
                autoComplete="username"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                required
                autoFocus
              />
            </div>
            <label htmlFor="command-password">Password</label>
            <div className="cmd-login-input">
              <Glyph name="lock" size={18} />
              <input
                id="command-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                required
              />
              <button
                type="button"
                className="cmd-login-reveal"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide entered text' : 'Show entered text'}
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-controls="command-password"
                aria-pressed={showPassword}
              >
                <Glyph name={showPassword ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
            {error ? (
              <p className="cmd-login-error" role="alert">
                <Glyph name="alert" size={16} /> {error}
              </p>
            ) : null}
            <button
              type="submit"
              className="btn btn-primary cmd-login-submit"
              disabled={busy || !email.trim() || !password}
            >
              {busy ? (
                'Signing in…'
              ) : (
                <>
                  Sign in <Glyph name="arrowRight" size={18} />
                </>
              )}
            </button>
          </form>
          <footer>
            <span>
              <Glyph name="lock" size={14} /> Secure administrator access
            </span>
            <strong>Powered by BrainADZ</strong>
          </footer>
        </div>
      </section>
      <aside className="cmd-login-art">
        <div className="cmd-login-art-copy">
          <span>IREO BOULEVARD · COMMAND</span>
          <h2>Everything your centre needs, in one place.</h2>
          <p>
            Keep destinations current, manage screens and publish the next visitor experience with
            confidence.
          </p>
        </div>
        <div className="cmd-login-art-brand">
          <CentreLogo />
          <span>Powered by BrainADZ</span>
        </div>
      </aside>
    </main>
  );
}

function Shell() {
  const command = useCommand();
  const [section, navigate] = useSection();
  const [publishing, setPublishing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Overview: true });
  const [quick, setQuick] = useState('');
  useEffect(() => {
    if (!sidebarOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [sidebarOpen]);

  const visibleGroups = useMemo(
    () =>
      navGroups
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) => item.id === 'dashboard' || command.can(item.resource, 'read'),
          ),
        }))
        .filter((group) => group.items.length),
    [command],
  );
  const allItems = visibleGroups.flatMap((g) => g.items);
  const current = allItems.find((item) => item.id === section.split('/')[0]) ?? allItems[0];
  useEffect(() => {
    const group = visibleGroups.find((entry) =>
      entry.items.some((item) => item.id === current?.id),
    );
    if (group)
      setOpenGroups((previous) =>
        previous[group.label] ? previous : { ...previous, [group.label]: true },
      );
    setSidebarOpen(false);
  }, [current?.id]);
  const quickResults = quick.trim()
    ? [
        ...allItems
          .filter((i) => i.label.toLowerCase().includes(quick.toLowerCase()))
          .map((i) => ({
            id: `nav-${i.id}`,
            label: i.label,
            hint: 'Section',
            go: () => navigate(i.id),
          })),
        ...command.data.tenants
          .filter((t) => t.name.toLowerCase().includes(quick.toLowerCase()))
          .slice(0, 6)
          .map((t) => ({
            id: `tenant-${t.id}`,
            label: t.name,
            hint: `Tenant · ${t.unitNumber}`,
            go: () => navigate(`tenants/${t.id}`),
          })),
        ...command.data.campaigns
          .filter((c) => c.name.toLowerCase().includes(quick.toLowerCase()))
          .slice(0, 3)
          .map((c) => ({
            id: `camp-${c.id}`,
            label: c.name,
            hint: 'Campaign',
            go: () => navigate(`advertising/${c.id}`),
          })),
        ...command.data.devices
          .filter((d) => `${d.id} ${d.name}`.toLowerCase().includes(quick.toLowerCase()))
          .slice(0, 3)
          .map((d) => ({
            id: `dev-${d.id}`,
            label: d.name,
            hint: 'Device',
            go: () => navigate('devices'),
          })),
      ].slice(0, 10)
    : [];

  const pending = command.publish.pendingChanges;
  const page = (() => {
    switch (current.id) {
      case 'dashboard':
        return <Dashboard navigate={navigate} />;
      case 'tenants':
        return <Tenants />;
      case 'categories':
      case 'amenities':
      case 'offers':
      case 'events':
        return <Directory kind={current.id} />;
      case 'advertising':
        return <Advertising />;
      case 'media':
        return <MediaLibrary />;
      case 'devices':
        return <Devices />;
      case 'analytics':
        return <Analytics />;
      case 'maps':
        return <MapEditor />;
      case 'routing':
        return <Routing />;
      default:
        return <Admin section={current.id} />;
    }
  })();

  return (
    <div className="cmd-shell">
      {sidebarOpen ? (
        <button
          type="button"
          className="cmd-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside className={`cmd-sidebar ${sidebarOpen ? 'is-open' : ''}`} id="command-navigation">
        <div className="cmd-sidebar-brand">
          <CentreLogo /> 
          <small>Powered by BrainADZ</small>
        </div>
        <nav aria-label="COMMAND sections">
          {visibleGroups.map((group) => (
            <div key={group.label} className="cmd-nav-group">
              <button
                type="button"
                className="cmd-nav-group-toggle"
                aria-expanded={Boolean(openGroups[group.label])}
                onClick={() =>
                  setOpenGroups((previous) => ({
                    ...previous,
                    [group.label]: !previous[group.label],
                  }))
                }
              >
                <span>{group.label}</span>
                <Glyph name={openGroups[group.label] ? 'chevronDown' : 'chevronRight'} size={14} />
              </button>
              {openGroups[group.label]
                ? group.items.map((item) => (
                    <a
                      key={item.id}
                      href={`/command/${item.id}`}
                      className={item.id === current.id ? 'is-active' : ''}
                      aria-current={item.id === current.id ? 'page' : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(item.id);
                        setSidebarOpen(false);
                      }}
                    >
                      <Glyph name={item.icon} size={18} />
                      {item.label}
                    </a>
                  ))
                : null}
            </div>
          ))}
        </nav>
        <div className="cmd-sidebar-foot">
          <a href="/" target="_blank" rel="noreferrer">
            <Glyph name="monitor" size={16} /> Open kiosk
          </a>
          <a href="/go" target="_blank" rel="noreferrer">
            <Glyph name="phone" size={16} /> Open WAY EZY GO
          </a>
          <span>
            v{command.appVersion} · {command.mode} · {command.database}
          </span>
        </div>
      </aside>
      <div className="cmd-main">
        <header className="cmd-topbar">
          <button
            type="button"
            className="cmd-mobile-menu"
            aria-label="Open navigation"
            aria-controls="command-navigation"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <Glyph name="menu" size={20} />
          </button>
          <div className="cmd-quick">
            <Glyph name="search" size={16} />
            <input
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuick('');
                if (e.key === 'Enter' && quickResults[0]) {
                  e.preventDefault();
                  quickResults[0].go();
                  setQuick('');
                }
              }}
              placeholder="Search sections and records…"
              aria-label="Quick search"
            />
            {quickResults.length ? (
              <div className="cmd-quick-results" role="listbox">
                {quickResults.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="option"
                    onClick={() => {
                      r.go();
                      setQuick('');
                    }}
                  >
                    <strong>{r.label}</strong>
                    <span>{r.hint}</span>
                  </button>
                ))}
              </div>
            ) : quick.trim() ? (
              <div className="cmd-quick-empty">No matching sections or records</div>
            ) : null}
          </div>
          <div className="cmd-venue-pill">
            <Glyph name="building" size={16} /> {command.data.venue.name}
          </div>
          <button
            type="button"
            className={`cmd-publish-pill ${pending ? 'has-pending' : ''}`}
            onClick={() => setPublishing(true)}
            disabled={!command.canPublish && !pending}
          >
            <i aria-hidden="true" />
            <span>
              <strong>
                {pending
                  ? `${pending} unpublished change${pending === 1 ? '' : 's'}`
                  : 'All changes live'}
              </strong>
              <small>
                {command.publish.version
                  ? `v${command.publish.version.slice(0, 17)} · ${relativeTime(command.publish.publishedAt)}`
                  : 'Not published'}
              </small>
            </span>
            {command.canPublish ? <b>Publish</b> : null}
          </button>
          <div className="cmd-user">
            <button
              type="button"
              className="cmd-user-btn"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
            >
              <span className="cmd-avatar">
                {command.user.name
                  .split(' ')
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <span>
                <strong>{command.user.name}</strong>
                <small>{roleLabels[command.user.role]}</small>
              </span>
              <Glyph name="chevronDown" size={16} />
            </button>
            {menuOpen ? (
              <div className="cmd-user-menu">
                <span>{command.user.email}</span>
                <button type="button" onClick={() => void command.signOut()}>
                  <Glyph name="logout" size={16} /> Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <main className="cmd-content" key={section}>
          <Suspense
            fallback={
              <div className="cmd-loading is-inline">
                <span className="splash-loader" />
              </div>
            }
          >
            {page}
          </Suspense>
        </main>
      </div>
      {publishing ? <PublishDialog onClose={() => setPublishing(false)} /> : null}
    </div>
  );
}

function PublishDialog({ onClose }: { onClose: () => void }) {
  const command = useCommand();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<string[] | null>(null);
  const [history, setHistory] = useState<
    { version: string; publishedAt: string; publishedBy: string; note: string }[]
  >([]);
  useEffect(() => {
    api<{ ok: boolean; issues: string[] }>('/api/admin/routing/validate')
      .then((r) => setIssues(r.issues))
      .catch(() => setIssues([]));
    api<typeof history>('/api/admin/publish/history')
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);
  const publish = async () => {
    setBusy(true);
    try {
      const result = await api<{ version: string }>('/api/admin/publish', {
        method: 'POST',
        body: { note },
      });
      command.toast(`Published ${result.version}. Kiosks and WAY EZY GO update within seconds.`);
      await command.refreshPublish();
      onClose();
    } catch (e) {
      command.toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const pendingChanges = command.publish.pendingChanges;
  return (
    <Modal
      title="Publish to Kiosk & WAY EZY GO"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={publish}
            disabled={busy || !command.canPublish}
          >
            <Glyph name="upload" size={16} /> {busy ? 'Publishing…' : 'Publish now'}
          </button>
        </>
      }
    >
      <p className="cmd-muted">
        {pendingChanges ? (
          <>
            {pendingChanges} {pendingChanges === 1 ? 'change' : 'changes'} since the last publish.
            Visitors keep seeing the current version until you publish.
          </>
        ) : (
          'There are no recorded changes since the last publish. You can still republish.'
        )}
      </p>
      <label className="cmd-field is-wide">
        <span>Release note (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="e.g. Updated Olive Trattoria offer"
        />
      </label>
      {issues === null ? (
        <p className="cmd-muted">Checking the route graph…</p>
      ) : issues.length ? (
        <div className="notice is-warning">
          <Glyph name="alert" size={18} />
          <div>
            <strong>Route graph warnings</strong>
            <ul>
              {issues.slice(0, 5).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="notice">
          <Glyph name="check" size={18} /> Route graph is healthy — every destination is reachable
          from every kiosk.
        </div>
      )}
      {history.length ? (
        <div className="cmd-history">
          <h3>Recent releases</h3>
          {history.slice(0, 5).map((h) => (
            <div key={h.version}>
              <code>{h.version}</code>
              <span>{h.note || '—'}</span>
              <small>
                {h.publishedBy} · {relativeTime(h.publishedAt)}
              </small>
            </div>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}
