import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import type { Device } from '../../../../packages/domain';
import { Glyph } from '../../icons/glyphs';
import { api } from '../../shared/api';
import {
  deleteResource,
  errorMessage,
  fieldErrors,
  saveResource,
  useCommand,
  type DeviceRuntime,
} from '../data';
import {
  Badge,
  ConfirmButton,
  DataTable,
  Drawer,
  Modal,
  NumberField,
  PageHeader,
  Panel,
  SelectField,
  TextField,
  relativeTime,
} from '../ui';
import { healthLabel, healthTone } from './Dashboard';

export default function Devices() {
  const command = useCommand();
  const { data } = command;
  const canWrite = command.can('devices', 'write');
  const [runtime, setRuntime] = useState<DeviceRuntime[]>(command.deviceRuntime);
  const [editing, setEditing] = useState<{ device: Device; isNew: boolean } | null>(null);
  const [provision, setProvision] = useState<{ deviceId: string; url: string } | null>(null);
  const [idle, setIdle] = useState(data.devices[0]?.idleTimeout ?? 10);

  useEffect(() => {
    const load = () =>
      api<DeviceRuntime[]>('/api/admin/devices/runtime')
        .then(setRuntime)
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const rt = (id: string) => runtime.find((r) => r.id === id);
  const floorName = (id: string) => data.floors.find((f) => f.id === id)?.shortName ?? id;
  const blank = (): Device => {
    const floor = data.floors[0];
    return {
      id: '',
      name: '',
      floorId: floor?.id ?? '',
      locationDescription: '',
      routeStartNode:
        data.nodes.find((n) => n.floorId === floor?.id && n.type === 'kiosk')?.id ??
        data.nodes.find((n) => n.floorId === floor?.id)?.id ??
        '',
      deviceGroup: 'default',
      screenOrientation: 'PORTRAIT',
      status: 'ACTIVE',
      idleTimeout: 10,
      defaultLanguage: 'en',
    };
  };

  const applyIdle = async () => {
    try {
      await api('/api/admin/devices/idle-timeout', { method: 'POST', body: { seconds: idle } });
      command.toast(`Idle timeout set to ${idle} seconds on every kiosk. Publish to apply.`);
      await command.reload();
    } catch (e) {
      command.toast(errorMessage(e), 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Screens & devices"
        subtitle="Kiosk health, provisioning and remote configuration. Status comes from device heartbeats every 30 seconds."
        actions={
          canWrite ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setEditing({ device: blank(), isNew: true })}
            >
              <Glyph name="plus" size={16} /> Add kiosk
            </button>
          ) : null
        }
      />
      <div className="cmd-grid-2">
        <Panel title="Fleet status">
          <div className="cmd-fleet">
            {(['online', 'warning', 'offline', 'maintenance', 'unprovisioned'] as const).map(
              (h) => (
                <div key={h} className={`cmd-fleet-cell is-${healthTone(h)}`}>
                  <strong>{runtime.filter((r) => r.health === h).length}</strong>
                  <span>{healthLabel[h]}</span>
                </div>
              ),
            )}
          </div>
        </Panel>
        <Panel
          title="Idle advertising timeout"
          subtitle="One setting for every kiosk (default 10 seconds). Individual kiosks can be adjusted in their settings."
        >
          <div className="cmd-inline-form">
            <NumberField
              label="Seconds without a touch"
              value={idle}
              onChange={setIdle}
              min={10}
              max={600}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={applyIdle}
              disabled={!canWrite || !Number.isFinite(idle) || idle < 10}
            >
              Apply to all kiosks
            </button>
          </div>
        </Panel>
      </div>
      <DataTable
        rows={data.devices}
        searchText={(d) => `${d.id} ${d.name} ${d.locationDescription} ${d.deviceGroup}`}
        onRowClick={(d) => setEditing({ device: structuredClone(d), isNew: false })}
        columns={[
          {
            key: 'health',
            header: 'Status',
            sort: (d) => rt(d.id)?.health ?? '',
            render: (d) => {
              const r = rt(d.id);
              return r ? (
                <span className="cmd-cell-title">
                  <Badge tone={healthTone(r.health)}>{healthLabel[r.health]}</Badge>
                  <small>{r.healthReason}</small>
                </span>
              ) : (
                '—'
              );
            },
          },
          {
            key: 'id',
            header: 'Device',
            sort: (d) => d.id,
            render: (d) => (
              <span className="cmd-cell-title">
                <strong>{d.name}</strong>
                <small>
                  <code>{d.id}</code>
                </small>
              </span>
            ),
          },
          {
            key: 'location',
            header: 'Location',
            render: (d) => (
              <span className="cmd-cell-title">
                <span>{d.locationDescription}</span>
                <small>
                  {floorName(d.floorId)} · start {d.routeStartNode}
                </small>
              </span>
            ),
          },
          {
            key: 'group',
            header: 'Group',
            sort: (d) => d.deviceGroup,
            render: (d) => d.deviceGroup,
          },
          { key: 'idle', header: 'Idle', render: (d) => `${d.idleTimeout}s`, align: 'right' },
          {
            key: 'heartbeat',
            header: 'Last heartbeat',
            sort: (d) => rt(d.id)?.lastHeartbeatAt ?? '',
            render: (d) => relativeTime(rt(d.id)?.lastHeartbeatAt),
          },
          { key: 'version', header: 'Software', render: (d) => rt(d.id)?.softwareVersion || '—' },
          {
            key: 'sync',
            header: 'Content',
            render: (d) => {
              const r = rt(d.id);
              if (!r?.lastContentVersion) return <span className="cmd-muted">—</span>;
              return r.lastContentVersion === command.publish.version ? (
                <Badge tone="green">Up to date</Badge>
              ) : (
                <Badge tone="amber">Sync pending</Badge>
              );
            },
          },
          {
            key: 'orientation',
            header: 'Screen',
            render: (d) => d.screenOrientation.toLowerCase(),
          },
        ]}
      />
      {editing ? (
        <DeviceEditor
          initial={editing.device}
          isNew={editing.isNew}
          runtime={rt(editing.device.id)}
          onClose={() => setEditing(null)}
          onProvision={(deviceId, url) => {
            setEditing(null);
            setProvision({ deviceId, url });
          }}
        />
      ) : null}
      {provision ? (
        <ProvisionDialog
          deviceId={provision.deviceId}
          url={provision.url}
          onClose={() => setProvision(null)}
        />
      ) : null}
    </>
  );
}

function DeviceEditor({
  initial,
  isNew,
  runtime,
  onClose,
  onProvision,
}: {
  initial: Device;
  isNew: boolean;
  runtime?: DeviceRuntime;
  onClose: () => void;
  onProvision: (deviceId: string, url: string) => void;
}) {
  const command = useCommand();
  const { data } = command;
  const canWrite = command.can('devices', 'write');
  const [device, setDevice] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Device>(key: K, value: Device[K]) =>
    setDevice((d) => ({ ...d, [key]: value }));
  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const result = await saveResource('devices', device, isNew ? undefined : initial.id);
      await command.reload();
      const key = (result as { deviceKey?: { provisioningUrl: string } }).deviceKey;
      command.toast(
        isNew
          ? 'Kiosk created. Open the provisioning link on the device.'
          : 'Kiosk saved. Publish to push configuration.',
      );
      if (key) onProvision(device.id, key.provisioningUrl);
      else onClose();
    } catch (e) {
      setErrors(fieldErrors(e));
      command.toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const rotate = async () => {
    try {
      const result = await api<{ provisioningUrl: string }>(
        `/api/admin/devices/${encodeURIComponent(initial.id)}/rotate-key`,
        { method: 'POST', body: {} },
      );
      onProvision(initial.id, result.provisioningUrl);
    } catch (e) {
      command.toast(errorMessage(e), 'error');
    }
  };
  const remove = async () => {
    try {
      await deleteResource('devices', initial.id);
      command.toast('Kiosk removed.');
      await command.reload();
      onClose();
    } catch (e) {
      command.toast(errorMessage(e), 'error');
    }
  };
  return (
    <Drawer
      title={isNew ? 'Add kiosk' : initial.name}
      subtitle={
        runtime
          ? `${healthLabel[runtime.health]} · last heartbeat ${relativeTime(runtime.lastHeartbeatAt)}`
          : undefined
      }
      onClose={onClose}
      footer={
        <>
          {!isNew && canWrite ? (
            <ConfirmButton
              label={
                <>
                  <Glyph name="trash" size={16} /> Remove
                </>
              }
              onConfirm={remove}
            />
          ) : (
            <span />
          )}
          <span className="cmd-foot-spacer" />
          {!isNew && canWrite ? (
            <button type="button" className="btn btn-outline" onClick={rotate}>
              <Glyph name="key" size={16} />{' '}
              {runtime?.provisioned ? 'Re-issue device key' : 'Provision device'}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            onClick={save}
            disabled={busy || !canWrite}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <fieldset className="cmd-form" disabled={!canWrite}>
        {isNew ? (
          <TextField
            label="Device ID"
            value={device.id}
            onChange={(v) => set('id', v.toUpperCase())}
            placeholder="K-005"
            error={errors.id}
          />
        ) : null}
        <TextField
          label="Friendly name"
          value={device.name}
          onChange={(v) => set('name', v)}
          error={errors.name}
        />
        <TextField
          label="Location"
          value={device.locationDescription}
          onChange={(v) => set('locationDescription', v)}
          error={errors.locationDescription}
        />
        <TextField
          label="Device group"
          value={device.deviceGroup}
          onChange={(v) => set('deviceGroup', v)}
          hint="Used for ad targeting, e.g. entrances"
        />
        <SelectField
          label="Floor"
          value={device.floorId}
          onChange={(v) =>
            setDevice((d) => ({
              ...d,
              floorId: v,
              routeStartNode:
                data.nodes.find((n) => n.floorId === v && n.type === 'kiosk')?.id ??
                data.nodes.find((n) => n.floorId === v)?.id ??
                '',
            }))
          }
          options={data.floors.map((f) => ({ value: f.id, label: `${f.shortName} · ${f.theme}` }))}
        />
        <SelectField
          label="Start node (You are here)"
          value={device.routeStartNode}
          onChange={(v) => set('routeStartNode', v)}
          options={data.nodes
            .filter((n) => n.floorId === device.floorId)
            .sort((a, b) => (a.type === 'kiosk' ? -1 : b.type === 'kiosk' ? 1 : 0))
            .map((n) => ({
              value: n.id,
              label: `${n.label}${n.type === 'kiosk' ? ' (kiosk)' : ''} · ${n.id}`,
            }))}
          error={errors.routeStartNode}
          hint="Place kiosk markers precisely in Floors & Maps"
        />
        <SelectField
          label="Status"
          value={device.status}
          onChange={(v) => set('status', v as Device['status'])}
          options={[
            { value: 'ACTIVE', label: 'Active' },
            { value: 'MAINTENANCE', label: 'Maintenance' },
            { value: 'DISABLED', label: 'Disabled' },
          ]}
        />
        <SelectField
          label="Orientation"
          value={device.screenOrientation}
          onChange={(v) => set('screenOrientation', v as Device['screenOrientation'])}
          options={[
            { value: 'PORTRAIT', label: 'Portrait' },
            { value: 'LANDSCAPE', label: 'Landscape' },
          ]}
        />
        <NumberField
          label="Idle timeout (seconds)"
          value={device.idleTimeout}
          onChange={(v) => set('idleTimeout', v)}
          min={10}
          max={600}
          error={errors.idleTimeout}
        />
        <SelectField
          label="Default language"
          value={device.defaultLanguage}
          onChange={(v) => set('defaultLanguage', v)}
          options={data.venue.languages.map((l) => ({
            value: l,
            label: l === 'hi' ? 'हिन्दी (Hindi)' : 'English',
          }))}
        />
      </fieldset>
      {runtime && !isNew ? (
        <dl className="cmd-dl">
          <dt>Provisioned</dt>
          <dd>{runtime.provisioned ? 'Yes' : 'No key issued'}</dd>
          <dt>Software</dt>
          <dd>{runtime.softwareVersion || '—'}</dd>
          <dt>Content version</dt>
          <dd>{runtime.lastContentVersion || '—'}</dd>
          <dt>Reported status</dt>
          <dd>
            <code>{JSON.stringify(runtime.lastStatus)}</code>
          </dd>
        </dl>
      ) : null}
    </Drawer>
  );
}

function ProvisionDialog({
  deviceId,
  url,
  onClose,
}: {
  deviceId: string;
  url: string;
  onClose: () => void;
}) {
  const [qr, setQr] = useState('');
  const command = useCommand();
  useEffect(() => {
    QRCode.toDataURL(url, { width: 280, margin: 1 }).then(setQr);
  }, [url]);
  return (
    <Modal
      title={`Provision ${deviceId}`}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <p>
        Open this link once in the kiosk browser (or scan it from the kiosk camera). The key is
        stored on the device and removed from the address bar. It is shown only now.
      </p>
      <div className="cmd-provision">
        {qr ? <img src={qr} alt="Provisioning QR code" /> : null}
        <code>{url}</code>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() =>
            // navigator.clipboard only exists on HTTPS / localhost; plain-HTTP LAN demos get the fallback message.
            Promise.resolve()
              .then(() => navigator.clipboard.writeText(url))
              .then(() => command.toast('Link copied.'))
              .catch(() => command.toast('Copy failed — select the link manually.', 'error'))
          }
        >
          <Glyph name="copy" size={16} /> Copy link
        </button>
      </div>
    </Modal>
  );
}
