import { useMemo, useState } from 'react';
import type { RouteEdge } from '../../../../packages/domain';
import { groundRouteGraph } from '../../../../packages/domain/reference/ground-floor-route-graph';
import { findGroundDirectoryRoute } from '../../../../packages/routing/ground-directory';
import { Glyph } from '../../icons/glyphs';
import { api } from '../../shared/api';
import { errorMessage, useCommand } from '../data';
import {
  Badge,
  DataTable,
  Drawer,
  PageHeader,
  Panel,
  SelectField,
  TextField,
  ToggleField,
} from '../ui';

export default function GroundRouting() {
  const command = useCommand();
  const graph = useMemo(
    () => groundRouteGraph(command.data.edges, command.data.nodes),
    [command.data.edges, command.data.nodes],
  );
  const byId = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const destinations = graph.nodes
    .filter((node) => node.type === 'tenant')
    .map((node) => ({ value: node.id, label: node.label }));
  const [from, setFrom] = useState('ground-entry-starbucks');
  const [to, setTo] = useState(
    destinations.find((item) => item.value !== 'ground-tenant-starbucks')?.value ??
      destinations[0]?.value ??
      '',
  );
  const [accessible, setAccessible] = useState(false);
  const [closing, setClosing] = useState<RouteEdge | null>(null);
  const [issues, setIssues] = useState<string[] | null>(null);
  const route = useMemo(
    () => (to ? findGroundDirectoryRoute(from, to, accessible, graph.edges, graph.nodes) : null),
    [from, to, accessible, graph.edges, graph.nodes],
  );
  const closedCount = graph.edges.filter((edge) => !edge.active).length;
  const edgeLabel = (edge: RouteEdge) => {
    const a = byId.get(edge.fromNode)!;
    const b = byId.get(edge.toNode)!;
    return `${a.label} (${Math.round(a.x)}, ${Math.round(a.y)}) ↔ ${b.label} (${Math.round(b.x)}, ${Math.round(b.y)})`;
  };
  const validate = async () => {
    try {
      const result = await api<{ issues: string[] }>('/api/admin/routing/validate');
      setIssues(result.issues);
      command.toast(
        result.issues.length
          ? `${result.issues.length} route issue(s) found`
          : 'All confirmed Ground Floor routes are connected.',
        result.issues.length ? 'error' : 'success',
      );
    } catch (error) {
      command.toast(errorMessage(error), 'error');
    }
  };
  const reopen = async (edge: RouteEdge) => {
    try {
      await api('/api/admin/routing/closures', {
        method: 'POST',
        body: { edgeId: edge.id, closed: false, publish: command.canPublish },
      });
      command.toast(
        command.canPublish
          ? 'Walkway reopened and published.'
          : 'Walkway reopened in the working copy.',
      );
      await command.reload();
      await command.refreshPublish();
    } catch (error) {
      command.toast(errorMessage(error), 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Routing"
        subtitle="Ground Floor walking routes follow the architectural plan. Close a walkway here to reroute the kiosk after publishing."
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={validate}>
              <Glyph name="check" size={16} /> Validate routes
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                history.pushState(null, '', '/command/maps');
                dispatchEvent(new PopStateEvent('popstate'));
              }}
            >
              <Glyph name="map" size={16} /> Open map
            </button>
          </>
        }
      />
      <div className="cmd-grid-2">
        <Panel
          title="Route preview"
          subtitle="Uses the same corridor graph and closures as the kiosk."
        >
          <div className="cmd-form is-single">
            <SelectField
              label="From"
              value={from}
              onChange={setFrom}
              options={[
                { value: 'ground-entry-starbucks', label: 'Entry 1 · You Are Here' },
                ...destinations,
              ]}
            />
            <SelectField label="To" value={to} onChange={setTo} options={destinations} />
            <ToggleField
              label="Step-free"
              checked={accessible}
              onChange={setAccessible}
              hint="The drawing does not certify step-free access."
            />
          </div>
          {route ? (
            <div className="cmd-route-result">
              <Badge tone="green">Ground Floor route available</Badge>
              <ol className="cmd-steps">
                {route.steps.map((step, index) => (
                  <li key={index}>{step.text}</li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="notice is-warning">
              {accessible
                ? 'Step-free route is not verified.'
                : 'No confirmed open route between these points.'}
            </div>
          )}
          <p className="cmd-small cmd-muted">
            Metres and walking time are hidden until the plan scale is surveyed. Soulfoods' entrance
            connection is still unverified.
          </p>
        </Panel>
        <Panel
          title="Network status"
          subtitle="Only source-validated Ground Floor corridors are managed here."
        >
          <dl className="cmd-dl">
            <dt>Walking nodes</dt>
            <dd>{graph.nodes.length}</dd>
            <dt>Corridor links</dt>
            <dd>{graph.edges.length}</dd>
            <dt>Closed</dt>
            <dd>{closedCount}</dd>
          </dl>
          {issues &&
            (issues.length ? (
              <ul className="cmd-issues">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : (
              <p className="notice">Confirmed destinations remain reachable from Entry 1.</p>
            ))}
        </Panel>
      </div>
      <Panel
        title="Walkways & closures"
        subtitle="Segment IDs match the walking lines shown in Floors & Maps; admin connections are included."
      >
        <DataTable
          rows={graph.edges}
          searchText={(edge) => `${edge.id} ${edgeLabel(edge)} ${edge.reason}`}
          columns={[
            {
              key: 'state',
              header: 'State',
              render: (edge) =>
                edge.active ? <Badge tone="green">Open</Badge> : <Badge tone="red">Closed</Badge>,
            },
            {
              key: 'segment',
              header: 'Segment',
              render: (edge) => (
                <span className="cmd-cell-title">
                  <strong>{edgeLabel(edge)}</strong>
                  <small>
                    <code>{edge.id}</code>
                  </small>
                </span>
              ),
            },
            {
              key: 'reason',
              header: 'Reason',
              render: (edge) => edge.reason || <span className="cmd-muted">—</span>,
            },
            {
              key: 'action',
              header: '',
              align: 'right',
              render: (edge) =>
                command.can('edges', 'write') ? (
                  edge.active ? (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => setClosing(edge)}
                    >
                      Close
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => void reopen(edge)}
                    >
                      Reopen
                    </button>
                  )
                ) : null,
            },
          ]}
        />
      </Panel>
      {closing && <CloseWalkway edge={closing} onClose={() => setClosing(null)} />}
    </>
  );
}

function CloseWalkway({ edge, onClose }: { edge: RouteEdge; onClose: () => void }) {
  const command = useCommand();
  const [reason, setReason] = useState('Temporarily closed');
  const [publish, setPublish] = useState(command.canPublish);
  const [busy, setBusy] = useState(false);
  return (
    <Drawer
      title="Close walkway"
      subtitle={edge.id}
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
                    ? 'Walkway closed and published. Kiosk routes are updating.'
                    : 'Walkway closed in the working copy. Publish to apply.',
                );
                await command.reload();
                await command.refreshPublish();
                onClose();
              } catch (error) {
                command.toast(errorMessage(error), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            Close walkway
          </button>
        </>
      }
    >
      <div className="cmd-form is-single">
        <TextField label="Reason" value={reason} onChange={setReason} />
        <ToggleField
          label="Publish immediately"
          checked={publish}
          onChange={setPublish}
          hint={
            command.canPublish
              ? 'The kiosk will reroute using the published closure.'
              : 'Your role cannot publish.'
          }
        />
      </div>
    </Drawer>
  );
}
