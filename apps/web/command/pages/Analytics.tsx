import { useEffect, useState } from 'react';
import { Glyph } from '../../icons/glyphs';
import { api } from '../../shared/api';
import { errorMessage, useCommand } from '../data';
import { BarList, DataTable, LineChart, PageHeader, Panel, StatCard } from '../ui';

export interface AnalyticsSummary {
  range: { from: string; to: string };
  totals: {
    sessions: number;
    searches: number;
    zeroResultSearches: number;
    tenantViews: number;
    routeRequests: number;
    routesGenerated: number;
    routeFailures: number;
    accessibleRoutes: number;
    qrGenerated: number;
    qrOpened: number;
    offerOpens: number;
    eventOpens: number;
    adImpressions: number;
    adCompletions: number;
    adTaps: number;
    adErrors: number;
    clientErrors: number;
  };
  qrOpenRate: number;
  daily: {
    date: string;
    sessions: number;
    searches: number;
    routes: number;
    qrOpened: number;
    adPlays: number;
  }[];
  topSearches: { key: string; count: number }[];
  zeroResultTerms: { key: string; count: number }[];
  topDestinations: { key: string; count: number }[];
  topCategories: { key: string; count: number }[];
  devices: {
    deviceId: string;
    sessions: number;
    searches: number;
    routes: number;
    qrDisplayed: number;
    adPlays: number;
  }[];
  campaigns: {
    campaignId: string;
    impressions: number;
    completions: number;
    taps: number;
    errors: number;
  }[];
  demoSeedEvents: number;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Analytics() {
  const command = useCommand();
  const [days, setDays] = useState(7);
  const [deviceId, setDeviceId] = useState('');
  const [floorId, setFloorId] = useState('');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ days: String(days) });
    if (deviceId) params.set('deviceId', deviceId);
    if (floorId) params.set('floorId', floorId);
    api<AnalyticsSummary>(`/api/admin/analytics?${params.toString()}`)
      .then(setSummary)
      .catch((e) => command.toast(errorMessage(e), 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, deviceId, floorId]);

  const nameOf = (id: string) =>
    command.data.tenants.find((t) => t.id === id)?.name ??
    command.data.pois.find((p) => p.id === id)?.name ??
    id;
  const campaignName = (id: string) => command.data.campaigns.find((c) => c.id === id)?.name ?? id;
  const t = summary?.totals;

  const exportCsv = () => {
    if (!summary) return;
    downloadCsv(`way-ezy-analytics-${days}d.csv`, [
      ['Metric', 'Value'],
      ...Object.entries(summary.totals).map(([k, v]) => [k, v]),
      ['qrOpenRatePercent', summary.qrOpenRate],
      [],
      ['Date', 'Sessions', 'Searches', 'Routes', 'QR opened', 'Ad plays'],
      ...summary.daily.map((d) => [
        d.date,
        d.sessions,
        d.searches,
        d.routes,
        d.qrOpened,
        d.adPlays,
      ]),
      [],
      ['Top search', 'Count'],
      ...summary.topSearches.map((s) => [s.key, s.count]),
      [],
      ['Zero-result search', 'Count'],
      ...summary.zeroResultTerms.map((s) => [s.key, s.count]),
      [],
      ['Campaign', 'Impressions', 'Completions', 'Taps', 'Errors'],
      ...summary.campaigns.map((c) => [
        campaignName(c.campaignId),
        c.impressions,
        c.completions,
        c.taps,
        c.errors,
      ]),
    ]);
  };

  const clearDemo = async () => {
    try {
      const result = await api<{ removed: number }>('/api/admin/analytics/clear-demo', {
        method: 'POST',
        body: {},
      });
      command.toast(`Removed ${result.removed} demo-seed events.`);
      setDays((d) => d);
      setSummary(null);
      const refreshed = await api<AnalyticsSummary>(`/api/admin/analytics?days=${days}`);
      setSummary(refreshed);
    } catch (e) {
      command.toast(errorMessage(e), 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Kiosk and WAY EZY GO interaction analytics. These measure screen sessions, searches and route requests — not physical footfall."
        actions={
          <>
            <select
              className="cmd-select"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              aria-label="Date range"
            >
              <option value={1}>Today</option>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
            <select
              className="cmd-select"
              value={floorId}
              onChange={(e) => setFloorId(e.target.value)}
              aria-label="Floor"
            >
              <option value="">All floors</option>
              {command.data.floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.shortName} · {f.theme}
                </option>
              ))}
            </select>
            <select
              className="cmd-select"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              aria-label="Device"
            >
              <option value="">All kiosks</option>
              {command.data.devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-outline"
              onClick={exportCsv}
              disabled={!summary}
            >
              <Glyph name="download" size={16} /> Export CSV
            </button>
          </>
        }
      />
      <div className="cmd-stats">
        <StatCard
          icon="phone"
          tone="#1a5cff"
          label="Kiosk sessions"
          value={t?.sessions.toLocaleString('en-IN') ?? '—'}
          hint={t ? `${t.tenantViews.toLocaleString('en-IN')} profile views` : undefined}
        />
        <StatCard
          icon="search"
          tone="#7c5cff"
          label="Searches"
          value={t?.searches.toLocaleString('en-IN') ?? '—'}
          hint={t ? `${t.zeroResultSearches} zero-result` : undefined}
        />
        <StatCard
          icon="route"
          tone="#16a34a"
          label="Route requests"
          value={t?.routeRequests.toLocaleString('en-IN') ?? '—'}
          hint={t ? `${t.accessibleRoutes} accessible · ${t.routeFailures} failed` : undefined}
        />
        <StatCard
          icon="qr"
          tone="#ff9f2e"
          label="QR hand-offs"
          value={t?.qrGenerated.toLocaleString('en-IN') ?? '—'}
          hint={summary ? `${summary.qrOpenRate}% opened on phones` : undefined}
        />
        <StatCard
          icon="play"
          tone="#e8457a"
          label="Ad impressions"
          value={t?.adImpressions.toLocaleString('en-IN') ?? '—'}
          hint={t ? `${t.adCompletions} completed · ${t.adTaps} taps` : undefined}
        />
      </div>
      <div className="cmd-grid-2">
        <Panel title="Daily activity" className="span-2">
          {summary?.daily.length ? (
            <LineChart
              labels={summary.daily.map((d) =>
                new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(
                  new Date(`${d.date}T12:00:00Z`),
                ),
              )}
              series={[
                {
                  name: 'Sessions',
                  color: '#1a5cff',
                  values: summary.daily.map((d) => d.sessions),
                },
                {
                  name: 'Searches',
                  color: '#7c5cff',
                  values: summary.daily.map((d) => d.searches),
                },
                { name: 'Routes', color: '#16a34a', values: summary.daily.map((d) => d.routes) },
                {
                  name: 'QR opened',
                  color: '#ff9f2e',
                  values: summary.daily.map((d) => d.qrOpened),
                },
                { name: 'Ad plays', color: '#e8457a', values: summary.daily.map((d) => d.adPlays) },
              ]}
            />
          ) : (
            <p className="cmd-muted">No activity in this range yet.</p>
          )}
        </Panel>
        <Panel title="Top searches">
          <BarList
            items={(summary?.topSearches ?? []).map((s) => ({ label: s.key, value: s.count }))}
          />
        </Panel>
        <Panel
          title="Zero-result searches"
          subtitle="Add keywords or synonyms so visitors find these next time"
        >
          <BarList
            color="#d97706"
            items={(summary?.zeroResultTerms ?? []).map((s) => ({ label: s.key, value: s.count }))}
            empty="Every search found something."
          />
        </Panel>
        <Panel title="Top destinations">
          <BarList
            color="#16a34a"
            items={(summary?.topDestinations ?? []).map((s) => ({
              label: nameOf(s.key),
              value: s.count,
            }))}
          />
        </Panel>
        <Panel title="Categories opened">
          <BarList
            color="#7c5cff"
            items={(summary?.topCategories ?? []).map((s) => ({
              label: command.data.categories.find((c) => c.id === s.key)?.name ?? s.key,
              value: s.count,
            }))}
          />
        </Panel>
        <Panel title="Advertising proof-of-play" className="span-2">
          <DataTable
            rows={(summary?.campaigns ?? []).map((c) => ({ ...c, id: c.campaignId }))}
            columns={[
              {
                key: 'name',
                header: 'Campaign',
                render: (r) => <strong>{campaignName(r.campaignId)}</strong>,
                sort: (r) => campaignName(r.campaignId),
              },
              {
                key: 'impressions',
                header: 'Impressions',
                render: (r) => r.impressions.toLocaleString('en-IN'),
                sort: (r) => r.impressions,
                align: 'right',
              },
              {
                key: 'completions',
                header: 'Completed plays',
                render: (r) => r.completions.toLocaleString('en-IN'),
                sort: (r) => r.completions,
                align: 'right',
              },
              {
                key: 'rate',
                header: 'Completion',
                render: (r) =>
                  r.impressions ? `${Math.round((r.completions / r.impressions) * 100)}%` : '—',
                align: 'right',
              },
              {
                key: 'taps',
                header: 'Taps',
                render: (r) => r.taps,
                sort: (r) => r.taps,
                align: 'right',
              },
              {
                key: 'errors',
                header: 'Playback errors',
                render: (r) => r.errors,
                sort: (r) => r.errors,
                align: 'right',
              },
            ]}
            empty="No ad plays recorded in this range."
          />
        </Panel>
        <Panel title="Kiosk breakdown" className="span-2">
          <DataTable
            rows={(summary?.devices ?? []).map((d) => ({ ...d, id: d.deviceId }))}
            columns={[
              {
                key: 'device',
                header: 'Kiosk',
                render: (r) => (
                  <strong>
                    {command.data.devices.find((d) => d.id === r.deviceId)?.name ?? r.deviceId}
                  </strong>
                ),
                sort: (r) => r.deviceId,
              },
              {
                key: 'sessions',
                header: 'Sessions',
                render: (r) => r.sessions,
                sort: (r) => r.sessions,
                align: 'right',
              },
              {
                key: 'searches',
                header: 'Searches',
                render: (r) => r.searches,
                sort: (r) => r.searches,
                align: 'right',
              },
              {
                key: 'routes',
                header: 'Routes',
                render: (r) => r.routes,
                sort: (r) => r.routes,
                align: 'right',
              },
              {
                key: 'qr',
                header: 'QR shown',
                render: (r) => r.qrDisplayed,
                sort: (r) => r.qrDisplayed,
                align: 'right',
              },
              {
                key: 'ads',
                header: 'Ad plays',
                render: (r) => r.adPlays,
                sort: (r) => r.adPlays,
                align: 'right',
              },
            ]}
          />
        </Panel>
      </div>
      {summary?.demoSeedEvents ? (
        <div className="notice is-warning cmd-demo-note">
          <Glyph name="info" size={18} />
          <span>
            This environment includes {summary.demoSeedEvents.toLocaleString('en-IN')} demo-seed
            analytics events so charts are not empty during demos.
          </span>
          {command.can('settings', 'write') ? (
            <button type="button" className="btn btn-outline" onClick={clearDemo}>
              Clear demo data
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
