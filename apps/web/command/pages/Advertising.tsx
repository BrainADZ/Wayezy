import { useEffect, useMemo, useState } from 'react';
import { campaignLiveState, isOnAir, playlist, screenCampaigns } from '../../../../packages/advertising';
import { campaignStatuses, type Campaign } from '../../../../packages/domain';
import { CentreLogo } from '../../brand/CentreLogo';
import { Glyph } from '../../icons/glyphs';
import { api } from '../../shared/api';
import { deleteResource, errorMessage, fieldErrors, saveResource, useCommand } from '../data';
import {
  Badge,
  ChipSelect,
  ConfirmButton,
  DataTable,
  Drawer,
  NumberField,
  PageHeader,
  Panel,
  SelectField,
  TextArea,
  TextField,
} from '../ui';
import type { AnalyticsSummary } from './Analytics';
import { campaignTone } from './Dashboard';
import { UploadButton } from './MediaLibrary';

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Advertising() {
  const command = useCommand();
  const { data } = command;
  const canWrite = command.can('campaigns', 'write');
  const [editing, setEditing] = useState<{ campaign: Campaign; isNew: boolean } | null>(null);
  const [stats, setStats] = useState<AnalyticsSummary['campaigns']>([]);
  const now = new Date();
  const tz = data.venue.timezone;

  useEffect(() => {
    if (command.can('analytics'))
      api<AnalyticsSummary>('/api/admin/analytics?days=30')
        .then((s) => setStats(s.campaigns))
        .catch(() => undefined);
    const id = window.location.pathname.split('/')[3];
    const campaign = id ? data.campaigns.find((c) => c.id === decodeURIComponent(id)) : null;
    if (campaign) setEditing({ campaign: structuredClone(campaign), isNew: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blank = (): Campaign => {
    const start = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    return {
      id: '',
      name: '',
      advertiser: '',
      description: '',
      status: 'DRAFT',
      startDate: start,
      endDate: end,
      startTime: '10:00',
      endTime: '22:00',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      mediaId: '',
      duration: 10,
      priority: 'NORMAL',
      targetType: 'ALL',
      targets: [],
      tapDestinationId: '',
      notes: '',
    };
  };
  const statFor = (id: string) => stats.find((s) => s.campaignId === id);
  const targetsLabel = (c: Campaign) =>
    c.targetType === 'ALL'
      ? 'All screens'
      : c.targetType === 'FLOOR'
        ? `Floors: ${c.targets.map((t) => data.floors.find((f) => f.id === t)?.shortName ?? t).join(', ')}`
        : c.targetType === 'DEVICE'
          ? `Kiosks: ${c.targets.join(', ')}`
          : `Groups: ${c.targets.join(', ')}`;

  return (
    <>
      <PageHeader
        title="Advertising campaigns"
        subtitle="Idle-screen advertising. Kiosks switch to the scheduled playlist after their idle timeout; any touch returns to a clean home screen."
        actions={
          canWrite ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setEditing({ campaign: blank(), isNew: true })}
            >
              <Glyph name="plus" size={16} /> New campaign
            </button>
          ) : null
        }
      />
      <div className="cmd-grid-2">
        <Panel
          title="On air right now"
          subtitle="What each kiosk plays at this moment"
          className="span-2"
        >
          <div className="cmd-onair">
            {data.devices.map((device) => {
              const list = playlist(screenCampaigns(data.campaigns), device, now, tz);
              return (
                <div key={device.id} className="cmd-onair-device">
                  <strong>{device.name}</strong>
                  <small>
                    Idle after {device.idleTimeout}s ·{' '}
                    {device.status === 'ACTIVE' ? 'Active' : device.status}
                  </small>
                  <div>
                    {list.length ? (
                      list.map((c) => (
                        <span key={c.id} className="cmd-onair-chip">
                          <img src={data.media.find((m) => m.id === c.mediaId)?.url} alt="" />
                          {c.name}
                        </span>
                      ))
                    ) : (
                      <span className="cmd-muted">Venue branding</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
      <DataTable
        rows={screenCampaigns(data.campaigns)}
        searchText={(c) => `${c.name} ${c.advertiser}`}
        onRowClick={(c) => setEditing({ campaign: structuredClone(c), isNew: false })}
        columns={[
          {
            key: 'media',
            header: '',
            width: '64px',
            render: (c) => {
              const m = data.media.find((x) => x.id === c.mediaId);
              return m ? (
                m.kind === 'video' ? (
                  <video className="cmd-thumb" src={m.url} muted />
                ) : (
                  <img className="cmd-thumb" src={m.url} alt="" />
                )
              ) : null;
            },
          },
          {
            key: 'name',
            header: 'Campaign',
            sort: (c) => c.name,
            render: (c) => (
              <span className="cmd-cell-title">
                <strong>{c.name}</strong>
                <small>{c.advertiser}</small>
              </span>
            ),
          },
          {
            key: 'state',
            header: 'Status',
            sort: (c) => campaignLiveState(c, now, tz),
            render: (c) => (
              <Badge tone={campaignTone(campaignLiveState(c, now, tz))}>
                {campaignLiveState(c, now, tz)}
              </Badge>
            ),
          },
          {
            key: 'schedule',
            header: 'Schedule',
            sort: (c) => c.startDate,
            render: (c) => (
              <span className="cmd-cell-title">
                <span>
                  {c.startDate} → {c.endDate}
                </span>
                <small>
                  {c.startTime}–{c.endTime} ·{' '}
                  {c.daysOfWeek.length === 7
                    ? 'Every day'
                    : c.daysOfWeek.map((d) => dayNames[d]).join(', ')}
                </small>
              </span>
            ),
          },
          { key: 'targets', header: 'Targets', render: (c) => targetsLabel(c) },
          {
            key: 'priority',
            header: 'Priority',
            sort: (c) => c.priority,
            render: (c) => (
              <Badge tone={c.priority === 'HIGH' ? 'violet' : 'neutral'}>{c.priority}</Badge>
            ),
          },
          {
            key: 'plays',
            header: 'Plays (30d)',
            sort: (c) => statFor(c.id)?.impressions ?? 0,
            render: (c) => (statFor(c.id)?.impressions ?? 0).toLocaleString('en-IN'),
            align: 'right',
          },
        ]}
      />
      {editing ? (
        <CampaignEditor
          initial={editing.campaign}
          isNew={editing.isNew}
          stats={statFor(editing.campaign.id)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function CampaignEditor({
  initial,
  isNew,
  stats,
  onClose,
}: {
  initial: Campaign;
  isNew: boolean;
  stats?: AnalyticsSummary['campaigns'][number];
  onClose: () => void;
}) {
  const command = useCommand();
  const { data } = command;
  const canWrite = command.can('campaigns', 'write');
  const [campaign, setCampaign] = useState<Campaign>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Campaign>(key: K, value: Campaign[K]) =>
    setCampaign((c) => ({ ...c, [key]: value }));
  const media = data.media.find((m) => m.id === campaign.mediaId);
  const groups = useMemo(
    () => [...new Set(data.devices.map((d) => d.deviceGroup))],
    [data.devices],
  );
  const onAirNow = isOnAir(campaign, new Date(), data.venue.timezone);

  const save = async (statusOverride?: Campaign['status']) => {
    setBusy(true);
    setErrors({});
    const payload = {
      ...campaign,
      status: statusOverride ?? campaign.status,
      id: isNew ? campaign.id || undefined : campaign.id,
    };
    try {
      await saveResource('campaigns', payload, isNew ? undefined : initial.id);
      const shouldPublish = command.canPublish && payload.status !== 'DRAFT' && payload.status !== 'PAUSED';
      if (shouldPublish) {
        await api('/api/admin/publish', {
          method: 'POST',
          body: { note: `Campaign: ${campaign.name}` },
        });
        command.toast(
          statusOverride
            ? `${campaign.name} is ${statusOverride === 'ACTIVE' ? 'live' : 'scheduled'} on targeted screens.`
            : `${campaign.name} saved and published. It will play during its schedule.`,
        );
      } else if (command.canPublish) {
        command.toast(`${campaign.name || 'Campaign'} saved as a draft. Use Save & publish to show it on screens.`);
      } else {
        command.toast(`${campaign.name || 'Campaign'} saved. Ask a publisher to send it to screens.`);
      }
      await command.reload();
      onClose();
    } catch (e) {
      setErrors(fieldErrors(e));
      command.toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    try {
      await deleteResource('campaigns', initial.id);
      if (command.canPublish) {
        await api('/api/admin/publish', {
          method: 'POST',
          body: { note: `Campaign deleted: ${initial.name}` },
        });
      }
      command.toast(command.canPublish ? 'Campaign deleted from screens.' : 'Campaign deleted. Publish changes to update screens.');
      await command.reload();
      onClose();
    } catch (e) {
      command.toast(errorMessage(e), 'error');
    }
  };

  const targetOptions =
    campaign.targetType === 'FLOOR'
      ? data.floors.map((f) => ({ value: f.id, label: `${f.shortName} · ${f.theme}` }))
      : campaign.targetType === 'DEVICE'
        ? data.devices.map((d) => ({ value: d.id, label: d.name }))
        : groups.map((g) => ({ value: g, label: g }));

  return (
    <Drawer
      wide
      title={isNew ? 'New ad campaign' : initial.name}
      subtitle={
        isNew
          ? 'Details, media, schedule, targeting and priority.'
          : `${campaign.advertiser} · ${onAirNow ? 'On air now' : 'Not on air now'}`
      }
      onClose={onClose}
      footer={
        <>
          {!isNew && canWrite ? (
            <ConfirmButton
              label={
                <>
                  <Glyph name="trash" size={16} /> Delete
                </>
              }
              onConfirm={remove}
            />
          ) : (
            <span />
          )}
          <span className="cmd-foot-spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => void save()}
            disabled={busy || !canWrite}
          >
            {campaign.status === 'DRAFT' ? 'Save draft' : 'Save changes'}
          </button>
          {command.canPublish ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                void save(
                  new Date(`${campaign.startDate}T00:00:00`) > new Date() ? 'SCHEDULED' : 'ACTIVE',
                )
              }
              disabled={busy || !canWrite}
            >
              <Glyph name="upload" size={16} /> Save & publish
            </button>
          ) : null}
        </>
      }
    >
      <div className="cmd-campaign-layout">
        <fieldset className="cmd-form" disabled={!canWrite}>
          <h3 className="cmd-form-section">1 · Campaign details</h3>
          <TextField
            label="Campaign name"
            value={campaign.name}
            onChange={(v) => set('name', v)}
            error={errors.name}
          />
          <TextField
            label="Advertiser"
            value={campaign.advertiser}
            onChange={(v) => set('advertiser', v)}
            error={errors.advertiser}
          />
          <TextArea
            label="Description"
            value={campaign.description}
            onChange={(v) => set('description', v)}
            rows={2}
            maxLength={1000}
          />
          <SelectField
            label="Status"
            value={campaign.status}
            onChange={(v) => set('status', v as Campaign['status'])}
            options={campaignStatuses.map((s) => ({
              value: s,
              label: s[0] + s.slice(1).toLowerCase(),
            }))}
          />
          <SelectField
            label="Priority"
            value={campaign.priority}
            onChange={(v) => set('priority', v as Campaign['priority'])}
            options={['HIGH', 'NORMAL', 'LOW'].map((p) => ({
              value: p,
              label: p[0] + p.slice(1).toLowerCase(),
            }))}
          />

          <h3 className="cmd-form-section">2 · Media</h3>
          <SelectField
            label="Creative"
            value={campaign.mediaId}
            onChange={(v) => set('mediaId', v)}
            options={[{ value: '', label: 'Select creative' }, ...data.media.map((m) => ({
              value: m.id,
              label: `${m.name} · ${m.kind}${m.duration ? ` · ${m.duration}s` : ''}`,
            }))]}
            error={errors.mediaId}
            wide
          />
          <div className="cmd-field is-wide">
            <UploadButton
              label="Upload new creative"
              onUploaded={async (asset) => {
                await command.reload();
                set('mediaId', asset.id);
              }}
            />
            <span className="cmd-field-hint">
              Portrait 1080×1920 images (JPEG/PNG/WebP) or MP4/WebM video. Videos play muted.
            </span>
          </div>
          <NumberField
            label="Play duration (seconds)"
            value={campaign.duration}
            onChange={(v) => set('duration', v)}
            min={5}
            max={300}
            error={errors.duration}
          />

          <h3 className="cmd-form-section">3 · Schedule</h3>
          <TextField
            label="Start date"
            type="date"
            value={campaign.startDate}
            onChange={(v) => set('startDate', v)}
            error={errors.startDate}
          />
          <TextField
            label="End date"
            type="date"
            value={campaign.endDate}
            onChange={(v) => set('endDate', v)}
            error={errors.endDate}
          />
          <TextField
            label="Daily start time"
            type="time"
            value={campaign.startTime}
            onChange={(v) => set('startTime', v)}
            error={errors.startTime}
          />
          <TextField
            label="Daily end time"
            type="time"
            value={campaign.endTime}
            onChange={(v) => set('endTime', v)}
            error={errors.endTime}
          />
          <ChipSelect
            label="Days"
            options={dayNames.map((d, i) => ({ value: String(i), label: d }))}
            value={campaign.daysOfWeek.map(String)}
            onChange={(v) => set('daysOfWeek', v.map(Number).sort())}
            error={errors.daysOfWeek}
          />

          <h3 className="cmd-form-section">4 · Screen targeting</h3>
          <SelectField
            label="Show on"
            value={campaign.targetType}
            onChange={(v) =>
              setCampaign((c) => ({ ...c, targetType: v as Campaign['targetType'], targets: [] }))
            }
            options={[
              { value: 'ALL', label: 'All screens' },
              { value: 'FLOOR', label: 'Selected floors' },
              { value: 'DEVICE', label: 'Selected kiosks' },
              { value: 'GROUP', label: 'Device groups' },
            ]}
          />
          {campaign.targetType !== 'ALL' ? (
            <ChipSelect
              label="Targets"
              options={targetOptions}
              value={campaign.targets}
              onChange={(v) => set('targets', v)}
              error={errors.targets}
            />
          ) : null}
          <SelectField
            label="Tap destination (reporting)"
            value={campaign.tapDestinationId}
            onChange={(v) => set('tapDestinationId', v)}
            options={[
              { value: '', label: 'None' },
              ...data.tenants.map((t) => ({ value: t.id, label: t.name })),
            ]}
            hint="Touching an ad always returns to Home; taps are recorded against the campaign"
          />
          <TextArea
            label="Internal notes"
            value={campaign.notes}
            onChange={(v) => set('notes', v)}
            rows={2}
          />
        </fieldset>
        <aside className="cmd-campaign-preview">
          <h3 className="cmd-form-section">Kiosk preview</h3>
          <div className="cmd-kiosk-frame">
            {media ? (
              media.kind === 'video' ? (
                <video src={media.url} autoPlay muted loop playsInline />
              ) : (
                <img src={media.url} alt="" />
              )
            ) : (
              <span className="cmd-muted">Choose media</span>
            )}
            <div className="cmd-kiosk-chrome">
              <CentreLogo />
              <span>Touch anywhere to explore</span>
            </div>
          </div>
          {stats ? (
            <div className="cmd-campaign-stats">
              <div>
                <strong>{stats.impressions}</strong>
                <span>impressions</span>
              </div>
              <div>
                <strong>{stats.completions}</strong>
                <span>completed</span>
              </div>
              <div>
                <strong>{stats.taps}</strong>
                <span>taps</span>
              </div>
              <div>
                <strong>{stats.errors}</strong>
                <span>errors</span>
              </div>
            </div>
          ) : (
            <p className="cmd-muted cmd-small">
              Proof-of-play appears here once kiosks play this campaign.
            </p>
          )}
        </aside>
      </div>
    </Drawer>
  );
}
