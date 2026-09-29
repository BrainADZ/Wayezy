import { useEffect, useState } from 'react';
import { Glyph } from '../../icons/glyphs';
import { api } from '../../shared/api';
import { useCommand, type DeviceRuntime, type PublishStatus } from '../data';
import { Badge, BarList, Empty, LineChart, PageHeader, Panel, relativeTime, StatCard } from '../ui';
import type { AnalyticsSummary } from './Analytics';

interface DashboardData {
  today: AnalyticsSummary['totals'] | null;
  week: AnalyticsSummary | null;
  devices: DeviceRuntime[];
  activeTenants: number;
  totalTenants: number;
  campaigns: {
    id: string;
    name: string;
    advertiser: string;
    state: string;
    startDate: string;
    endDate: string;
    targetType: string;
  }[];
  alerts: { level: string; message: string; deviceId: string }[];
  recentChanges: {
    id: number;
    at: string;
    userEmail: string;
    action: string;
    entityType: string;
    summary: string;
  }[];
  publish: PublishStatus;
}

export const healthTone = (health: DeviceRuntime['health']) =>
  health === 'online'
    ? 'green'
    : health === 'warning' || health === 'maintenance'
      ? 'amber'
      : health === 'unprovisioned'
        ? 'neutral'
        : 'red';
export const healthLabel: Record<DeviceRuntime['health'], string> = {
  online: 'Online',
  warning: 'Warning',
  offline: 'Offline',
  maintenance: 'Maintenance',
  disabled: 'Disabled',
  unprovisioned: 'Not provisioned',
};
export const campaignTone = (state: string) =>
  state === 'Live'
    ? 'green'
    : state === 'Scheduled'
      ? 'blue'
      : state === 'Paused' || state === 'Off-air'
        ? 'amber'
        : 'neutral';

export default function Dashboard({ navigate }: { navigate: (section: string) => void }) {
  const command = useCommand();
  const [data, setData] = useState<DashboardData | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api<DashboardData>('/api/admin/dashboard')
        .then((d) => !cancelled && setData(d))
        .catch((e) => command.toast(String(e.message ?? e), 'error'));
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();
  const online = data?.devices.filter((d) => d.health === 'online').length ?? 0;
  const week = data?.week;
  const nameOf = (id: string) =>
    command.data.tenants.find((t) => t.id === id)?.name ??
    command.data.pois.find((p) => p.id === id)?.name ??
    id;

  return (
    <>
      <PageHeader
        eyebrow={command.data.venue.name}
        title={`${greeting}, ${command.user.name}`}
        subtitle="Here’s how your kiosks, directory and campaigns are doing today."
        actions={
          <>
            <a className="btn btn-outline" href="/" target="_blank" rel="noreferrer">
              <Glyph name="monitor" size={16} /> Preview kiosk
            </a>
            {command.can('tenants', 'write') ? (
              <button type="button" className="btn btn-primary" onClick={() => navigate('tenants')}>
                <Glyph name="edit" size={16} /> Edit directory
              </button>
            ) : null}
          </>
        }
      />
      <div className="cmd-stats">
        <StatCard
          icon="phone"
          tone="#16a34a"
          label="Kiosks online"
          value={data ? `${online} / ${data.devices.length}` : '—'}
          hint={
            data
              ? `${data.devices.filter((d) => d.health === 'warning').length} warning · ${data.devices.filter((d) => d.health === 'offline').length} offline`
              : undefined
          }
        />
        <StatCard
          icon="search"
          tone="#1a5cff"
          label="Searches today"
          value={data?.today?.searches ?? '—'}
          hint={
            data?.today
              ? `${data.today.zeroResultSearches} with no results`
              : 'Analyst access required'
          }
        />
        <StatCard
          icon="route"
          tone="#7c5cff"
          label="Route requests today"
          value={data?.today?.routeRequests ?? '—'}
          hint={data?.today ? `${data.today.accessibleRoutes} accessible` : undefined}
        />
        <StatCard
          icon="qr"
          tone="#ff9f2e"
          label="QR hand-offs today"
          value={data?.today?.qrGenerated ?? '—'}
          hint={data?.today ? `${data.today.qrOpened} opened on phones` : undefined}
        />
        <StatCard
          icon="play"
          tone="#e8457a"
          label="Ad plays today"
          value={data?.today?.adImpressions ?? '—'}
          hint={data?.today ? `${data.today.adTaps} taps` : undefined}
        />
      </div>
      <div className="cmd-grid-dashboard">
        <Panel
          title="Kiosk interactions"
          subtitle="Last 7 days · sessions, searches and routes on WAY EZY kiosks"
          className="span-2"
          actions={
            <button type="button" className="btn btn-ghost" onClick={() => navigate('analytics')}>
              View analytics <Glyph name="chevronRight" size={14} />
            </button>
          }
        >
          {week ? (
            <LineChart
              labels={week.daily.map((d) =>
                new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(
                  new Date(`${d.date}T12:00:00Z`),
                ),
              )}
              series={[
                { name: 'Sessions', color: '#1a5cff', values: week.daily.map((d) => d.sessions) },
                { name: 'Searches', color: '#7c5cff', values: week.daily.map((d) => d.searches) },
                { name: 'Routes', color: '#16c8ff', values: week.daily.map((d) => d.routes) },
                { name: 'Ad plays', color: '#e8457a', values: week.daily.map((d) => d.adPlays) },
              ]}
            />
          ) : (
            <Empty icon="chart" title="Analytics are available to Analysts and Admins" />
          )}
          {week?.demoSeedEvents ? (
            <p className="cmd-muted cmd-small">
              Includes {week.demoSeedEvents.toLocaleString('en-IN')} demo-seed events. Clear them in
              System Settings before go-live.
            </p>
          ) : null}
        </Panel>
        <Panel
          title="Live devices"
          actions={
            <button type="button" className="btn btn-ghost" onClick={() => navigate('devices')}>
              Manage <Glyph name="chevronRight" size={14} />
            </button>
          }
        >
          <div className="cmd-device-list">
            {data?.devices.map((d) => {
              const device = command.data.devices.find((x) => x.id === d.id);
              return (
                <div key={d.id} className="cmd-device-row">
                  <i className={`cmd-dot is-${healthTone(d.health)}`} aria-hidden="true" />
                  <strong>{d.id}</strong>
                  <span>{device?.locationDescription}</span>
                  <Badge tone={healthTone(d.health)}>{healthLabel[d.health]}</Badge>
                  <small>{relativeTime(d.lastHeartbeatAt)}</small>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Top searches" subtitle="Last 7 days">
          <BarList
            items={(week?.topSearches ?? [])
              .slice(0, 7)
              .map((s) => ({ label: s.key, value: s.count }))}
          />
        </Panel>
        <Panel title="Top destinations" subtitle="Route requests · last 7 days">
          <BarList
            color="#7c5cff"
            items={(week?.topDestinations ?? [])
              .slice(0, 7)
              .map((s) => ({ label: nameOf(s.key), value: s.count }))}
          />
        </Panel>
        <Panel
          title="Campaigns"
          actions={
            <button type="button" className="btn btn-ghost" onClick={() => navigate('advertising')}>
              All <Glyph name="chevronRight" size={14} />
            </button>
          }
        >
          <div className="cmd-campaign-list">
            {data?.campaigns.map((c) => (
              <div key={c.id} className="cmd-campaign-row">
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    {c.advertiser} · {c.startDate} → {c.endDate}
                  </small>
                </span>
                <Badge tone={campaignTone(c.state)}>{c.state}</Badge>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Alerts">
          {data?.alerts.length ? (
            <ul className="cmd-alerts">
              {data.alerts.map((a) => (
                <li key={a.message} className={`is-${a.level}`}>
                  <Glyph name="alert" size={16} /> {a.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="cmd-muted">No alerts — every kiosk is healthy.</p>
          )}
          <p className="cmd-small cmd-muted">
            {data?.activeTenants ?? '—'} of {data?.totalTenants ?? '—'} tenants active ·{' '}
            {data?.publish.connectedClients ?? 0} live screen connections
          </p>
        </Panel>
        <Panel
          title="Recent changes"
          className="span-2"
          actions={
            command.can('audit') ? (
              <button type="button" className="btn btn-ghost" onClick={() => navigate('audit')}>
                Audit log <Glyph name="chevronRight" size={14} />
              </button>
            ) : undefined
          }
        >
          {data?.recentChanges.length ? (
            <ul className="cmd-activity">
              {data.recentChanges.map((c) => (
                <li key={c.id}>
                  <Badge
                    tone={
                      c.action === 'publish'
                        ? 'violet'
                        : c.action === 'delete'
                          ? 'red'
                          : c.action === 'closure'
                            ? 'amber'
                            : 'blue'
                    }
                  >
                    {c.action}
                  </Badge>
                  <span>{c.summary || `${c.entityType} changed`}</span>
                  <small>
                    {c.userEmail || 'system'} · {relativeTime(c.at)}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cmd-muted">No recent changes to show.</p>
          )}
        </Panel>
      </div>
    </>
  );
}
