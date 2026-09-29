import { useMemo, useState } from 'react';
import type { Route, RouteEdge, VerticalConnector } from '../../../../packages/domain';
import { Glyph } from '../../icons/glyphs';
import { AdminIcon } from '../../icons/admin';
import { api } from '../../shared/api';
import { deleteResource, errorMessage, fieldErrors, saveResource, useCommand } from '../data';
import {
  Badge,
  ChipSelect,
  ConfirmButton,
  DataTable,
  Drawer,
  PageHeader,
  Panel,
  SelectField,
  TextField,
  ToggleField,
} from '../ui';

export default function Routing() {
  const command = useCommand();
  const { data } = command;
  const canWrite = command.can('edges', 'write');
  const [floor, setFloor] = useState('');
  const [onlyClosed, setOnlyClosed] = useState(false);
  const [closing, setClosing] = useState<RouteEdge | null>(null);
  const [connector, setConnector] = useState<{ item: VerticalConnector; isNew: boolean } | null>(
    null,
  );
  const nodeById = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);
  const floorOf = (e: RouteEdge) => nodeById.get(e.fromNode)?.floorId ?? '';
  const edgeLabel = (e: RouteEdge) =>
    `${nodeById.get(e.fromNode)?.label ?? e.fromNode} ↔ ${nodeById.get(e.toNode)?.label ?? e.toNode}`;

  const rows = data.edges.filter(
    (e) =>
      (!floor || floorOf(e) === floor) &&
      (!onlyClosed || !e.active) &&
      nodeById.get(e.fromNode)?.floorId === nodeById.get(e.toNode)?.floorId,
  );
  const closedCount = data.edges.filter((e) => !e.active).length;

  // Several amenities can share one access node (e.g. washrooms + accessible washroom); list each node once.
  const destinationLabels = new Map<string, string[]>();
  for (const t of data.tenants)
    destinationLabels.set(t.nodeId, [
      ...(destinationLabels.get(t.nodeId) ?? []),
      `${t.name} · ${t.unitNumber}`,
    ]);
  for (const p of data.pois)
    destinationLabels.set(p.nodeId, [
      ...(destinationLabels.get(p.nodeId) ?? []),
      `${p.name} · ${data.floors.find((f) => f.id === p.floorId)?.shortName}`,
    ]);
  const destinations = [...destinationLabels].map(([value, labels]) => ({
    value,
    label: labels.join(' / '),
  }));
  const [from, setFrom] = useState(data.devices[0]?.routeStartNode ?? '');
  const [to, setTo] = useState(
    data.tenants.find((t) => t.id === 'olive-trattoria')?.nodeId ?? destinations[0]?.value ?? '',
  );
  const [accessible, setAccessible] = useState(false);
  const [result, setResult] = useState<{ route: Route | null } | null>(null);

  const previewRoute = async () => {
    try {
      setResult(
        await api<{ route: Route | null }>('/api/admin/routing/preview', {
          method: 'POST',
          body: { fromNodeId: from, toNodeId: to, accessible },
        }),
      );
    } catch (e) {
      command.toast(errorMessage(e), 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Routing"
        subtitle="Corridor closures, vertical connectors and route testing. The A* engine avoids closed and restricted edges; accessible routes also avoid stairs and escalators."
        actions={
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              window.history.pushState(null, '', '/command/maps');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }}
          >
            <Glyph name="map" size={16} /> Open map editor
          </button>
        }
      />
      <div className="cmd-grid-2">
        <Panel
          title="Route preview"
          subtitle="Tests the working copy — including unpublished changes"
        >
          <div className="cmd-form is-single">
            <SelectField
              label="From kiosk"
              value={from}
              onChange={setFrom}
              options={data.devices.map((d) => ({ value: d.routeStartNode, label: d.name }))}
            />
            <SelectField label="To" value={to} onChange={setTo} options={destinations} />
            <ToggleField
              label="Accessible (step-free)"
              checked={accessible}
              onChange={setAccessible}
            />
            <button type="button" className="btn btn-primary" onClick={previewRoute}>
              <Glyph name="route" size={16} /> Preview route
            </button>
          </div>
          {result ? (
            result.route ? (
              <div className="cmd-route-result">
                <div className="cmd-route-metrics">
                  <span>
                    <strong>{result.route.minutes}</strong> min
                  </span>
                  <span>
                    <strong>{result.route.distance}</strong> m
                  </span>
                  <span>
                    {result.route.floorIds
                      .map((f) => data.floors.find((x) => x.id === f)?.shortName)
                      .join(' → ')}
                  </span>
                  {accessible ? <Badge tone="blue">Step-free</Badge> : null}
                </div>
                <ol className="cmd-steps">
                  {result.route.steps.map((s, i) => (
                    <li key={i} className={s.connector ? 'is-connector' : ''}>
                      {s.connector ? (
                        <AdminIcon
                          name={
                            s.kind === 'lift'
                              ? 'lift'
                              : s.kind === 'escalator'
                                ? 'escalator'
                                : 'stairs'
                          }
                          size={20}
                        />
                      ) : null}
                      {s.text}
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="notice is-error">
                <Glyph name="alert" size={16} /> No route is available
                {accessible ? ' without stairs or escalators' : ''}. Check closures or connectors.
              </div>
            )
          ) : null}
        </Panel>
        <Panel
          title="Vertical connectors"
          subtitle="Lifts, escalators and stairs that link floors"
          actions={
            canWrite ? (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() =>
                  setConnector({
                    item: {
                      id: '',
                      name: '',
                      type: 'lift',
                      direction: 'BOTH',
                      accessible: true,
                      nodeIds: [],
                    },
                    isNew: true,
                  })
                }
              >
                <Glyph name="plus" size={14} /> Add
              </button>
            ) : undefined
          }
        >
          <div className="cmd-connectors">
            {data.connectors.map((c) => (
              <button
                key={c.id}
                type="button"
                className="cmd-connector-row"
                onClick={() => setConnector({ item: structuredClone(c), isNew: false })}
              >
                <AdminIcon
                  name={
                    c.type === 'lift' ? 'lift' : c.type === 'escalator' ? 'escalator' : 'stairs'
                  }
                  size={24}
                />
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    {c.nodeIds
                      .map(
                        (id) =>
                          data.floors.find((f) => f.id === nodeById.get(id)?.floorId)?.shortName,
                      )
                      .join(' · ')}{' '}
                    · {c.direction === 'BOTH' ? 'two-way' : c.direction.toLowerCase()}
                  </small>
                </span>
                {c.accessible ? (
                  <Badge tone="green">Step-free</Badge>
                ) : (
                  <Badge>Not step-free</Badge>
                )}
              </button>
            ))}
          </div>
        </Panel>
      </div>
      <Panel
        title="Corridors & closures"
        subtitle={`${closedCount} closed right now. Closing a corridor publishes immediately so routes recalculate on every screen.`}
      >
        <DataTable
          rows={rows}
          searchText={(e) => `${e.id} ${edgeLabel(e)} ${e.reason}`}
          filters={
            <>
              <select
                className="cmd-select"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                aria-label="Floor"
              >
                <option value="">All floors</option>
                {data.floors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.shortName}
                  </option>
                ))}
              </select>
              <label className="cmd-check">
                <input
                  type="checkbox"
                  checked={onlyClosed}
                  onChange={(e) => setOnlyClosed(e.target.checked)}
                />{' '}
                Closed only
              </label>
            </>
          }
          columns={[
            {
              key: 'state',
              header: 'State',
              sort: (e) => (e.active ? 1 : 0),
              render: (e) =>
                e.active ? <Badge tone="green">Open</Badge> : <Badge tone="red">Closed</Badge>,
            },
            {
              key: 'edge',
              header: 'Corridor',
              render: (e) => (
                <span className="cmd-cell-title">
                  <strong>{edgeLabel(e)}</strong>
                  <small>
                    <code>{e.id}</code> · {data.floors.find((f) => f.id === floorOf(e))?.shortName}
                  </small>
                </span>
              ),
            },
            { key: 'type', header: 'Type', render: (e) => e.type },
            {
              key: 'distance',
              header: 'Length',
              sort: (e) => e.distance,
              render: (e) => `${e.distance} m`,
              align: 'right',
            },
            { key: 'access', header: 'Step-free', render: (e) => (e.accessible ? 'Yes' : 'No') },
            {
              key: 'reason',
              header: 'Reason',
              render: (e) => e.reason || <span className="cmd-muted">—</span>,
            },
            {
              key: 'action',
              header: '',
              align: 'right',
              render: (e) =>
                canWrite ? (
                  e.active ? (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setClosing(e);
                      }}
                    >
                      Close
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={async (ev) => {
                        ev.stopPropagation();
                        try {
                          await api('/api/admin/routing/closures', {
                            method: 'POST',
                            body: { edgeId: e.id, closed: false, publish: command.canPublish },
                          });
                          command.toast('Corridor reopened.');
                          await command.reload();
                          await command.refreshPublish();
                        } catch (err) {
                          command.toast(errorMessage(err), 'error');
                        }
                      }}
                    >
                      Reopen
                    </button>
                  )
                ) : null,
            },
          ]}
        />
      </Panel>
      {closing ? (
        <CloseDialog edge={closing} label={edgeLabel(closing)} onClose={() => setClosing(null)} />
      ) : null}
      {connector ? (
        <ConnectorEditor
          initial={connector.item}
          isNew={connector.isNew}
          onClose={() => setConnector(null)}
        />
      ) : null}
    </>
  );
}

function CloseDialog({
  edge,
  label,
  onClose,
}: {
  edge: RouteEdge;
  label: string;
  onClose: () => void;
}) {
  const command = useCommand();
  const [reason, setReason] = useState('Floor cleaning');
  const [publish, setPublish] = useState(command.canPublish);
  const [busy, setBusy] = useState(false);
  return (
    <Drawer
      title="Close corridor"
      subtitle={label}
      onClose={onClose}
      footer={
        <>
          <span className="cmd-foot-spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api('/api/admin/routing/closures', {
                  method: 'POST',
                  body: { edgeId: edge.id, closed: true, reason, publish },
                });
                command.toast(
                  publish
                    ? 'Corridor closed and published — routes are recalculating on every screen.'
                    : 'Corridor closed in the working copy. Publish to apply.',
                );
                await command.reload();
                await command.refreshPublish();
                onClose();
              } catch (e) {
                command.toast(errorMessage(e), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            Close corridor
          </button>
        </>
      }
    >
      <div className="cmd-form is-single">
        <TextField label="Reason (shown to staff)" value={reason} onChange={setReason} />
        <ToggleField
          label="Publish immediately"
          checked={publish}
          onChange={setPublish}
          hint={command.canPublish ? 'Recommended for safety closures' : 'Your role cannot publish'}
        />
      </div>
    </Drawer>
  );
}

function ConnectorEditor({
  initial,
  isNew,
  onClose,
}: {
  initial: VerticalConnector;
  isNew: boolean;
  onClose: () => void;
}) {
  const command = useCommand();
  const { data } = command;
  const canWrite = command.can('connectors', 'write');
  const [item, setItem] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const nodeOptions = data.nodes
    .filter(
      (n) =>
        n.type === 'lift' || n.type === 'escalator' || n.type === 'stairs' || n.type === 'ramp',
    )
    .map((n) => ({
      value: n.id,
      label: `${data.floors.find((f) => f.id === n.floorId)?.shortName} · ${n.label}`,
    }));
  return (
    <Drawer
      title={isNew ? 'New vertical connector' : initial.name}
      subtitle="Groups the lift/escalator/stairs nodes on each floor. Floor-to-floor edges are managed in the map editor."
      onClose={onClose}
      footer={
        <>
          {!isNew && canWrite ? (
            <ConfirmButton
              label="Delete"
              onConfirm={async () => {
                try {
                  await deleteResource('connectors', initial.id);
                  await command.reload();
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
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canWrite}
            onClick={async () => {
              try {
                await saveResource(
                  'connectors',
                  { ...item, id: isNew ? item.id || undefined : item.id },
                  isNew ? undefined : initial.id,
                );
                command.toast('Connector saved.');
                await command.reload();
                onClose();
              } catch (e) {
                setErrors(fieldErrors(e));
                command.toast(errorMessage(e), 'error');
              }
            }}
          >
            Save
          </button>
        </>
      }
    >
      <fieldset className="cmd-form" disabled={!canWrite}>
        <TextField
          label="Name"
          value={item.name}
          onChange={(v) => setItem({ ...item, name: v })}
          error={errors.name}
        />
        <SelectField
          label="Type"
          value={item.type}
          onChange={(v) => setItem({ ...item, type: v as VerticalConnector['type'] })}
          options={['lift', 'escalator', 'stairs', 'ramp'].map((t) => ({ value: t, label: t }))}
        />
        <SelectField
          label="Direction"
          value={item.direction}
          onChange={(v) => setItem({ ...item, direction: v as VerticalConnector['direction'] })}
          options={[
            { value: 'BOTH', label: 'Two-way' },
            { value: 'UP', label: 'Up only' },
            { value: 'DOWN', label: 'Down only' },
          ]}
        />
        <ToggleField
          label="Step-free"
          checked={item.accessible}
          onChange={(v) => setItem({ ...item, accessible: v })}
        />
        <ChipSelect
          label="Nodes (one per floor)"
          options={nodeOptions}
          value={item.nodeIds}
          onChange={(v) => setItem({ ...item, nodeIds: v })}
          error={errors.nodeIds}
        />
      </fieldset>
    </Drawer>
  );
}
