import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  edgeTypes,
  featureKinds,
  nodeTypes,
  type Feature,
  type Floor,
  type Poi,
  type Route,
  type RouteEdge,
  type RouteNode,
} from '../../../../packages/domain';
import { Glyph } from '../../icons/glyphs';
import { api } from '../../shared/api';
import { deleteResource, errorMessage, saveResource, useCommand } from '../data';
import {
  Badge,
  ColorField,
  ConfirmButton,
  NumberField,
  PageHeader,
  Panel,
  SelectField,
  TextField,
  ToggleField,
} from '../ui';
import GroundMapEditor from './GroundMapEditor';

type Tool = 'select' | 'move' | 'node' | 'connect' | 'unit' | 'poi' | 'kiosk' | 'preview';
type Selection =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'feature'; id: string }
  | null;

const tools: { id: Tool; label: string; glyph: string; hint: string }[] = [
  {
    id: 'select',
    label: 'Select',
    glyph: 'cursor',
    hint: 'Click a unit, node or edge to inspect and edit it. Drag empty space to pan.',
  },
  {
    id: 'move',
    label: 'Move node',
    glyph: 'move',
    hint: 'Drag route nodes. Connected corridor distances and walking times update automatically.',
  },
  {
    id: 'node',
    label: 'Add node',
    glyph: 'node',
    hint: 'Click to add a corridor node. It connects to the nearest node automatically.',
  },
  {
    id: 'connect',
    label: 'Connect',
    glyph: 'link',
    hint: 'Click one node, then another, to create a two-way accessible corridor edge.',
  },
  {
    id: 'unit',
    label: 'Draw unit',
    glyph: 'store',
    hint: 'Click corners of a new unit. Click the first corner (or press Finish) to close the shape.',
  },
  {
    id: 'poi',
    label: 'Place amenity',
    glyph: 'pin',
    hint: 'Click to place an amenity (washroom, ATM…) with its own route node.',
  },
  {
    id: 'kiosk',
    label: 'Place kiosk',
    glyph: 'monitor',
    hint: 'Choose a kiosk below, then click where it stands. This sets its “You are here” point.',
  },
  {
    id: 'preview',
    label: 'Preview route',
    glyph: 'route',
    hint: 'Click a start node and a destination node to test routing on the working copy.',
  },
];

const rid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
const nodeColor: Record<RouteNode['type'], string> = {
  corridor: '#94a3b8',
  entrance: '#16a34a',
  tenant: '#005247',
  lift: '#7c5cff',
  escalator: '#0e9f8a',
  stairs: '#6b7489',
  ramp: '#0e9f8a',
  poi: '#ff9f2e',
  kiosk: '#e8457a',
};

export default function MapEditor() {
  const command = useCommand();
  const { data } = command;
  const canNodes = command.can('nodes', 'write');
  const canFeatures = command.can('features', 'write');
  const [floorId, setFloorId] = useState(data.floors[0]?.id ?? '');
  const floor = data.floors.find((f) => f.id === floorId) as Floor | undefined;
  const [tool, setTool] = useState<Tool>('select');
  const [selection, setSelection] = useState<Selection>(null);
  const [layers, setLayers] = useState({ units: true, nodes: true, edges: true, labels: true });
  const [pending, setPending] = useState<string | null>(null);
  const [draft, setDraft] = useState<[number, number][]>([]);
  const [kioskDevice, setKioskDevice] = useState(data.devices[0]?.id ?? '');
  const [preview, setPreview] = useState<{
    from?: string;
    to?: string;
    accessible: boolean;
    route?: Route | null;
  }>({ accessible: false });
  const [issues, setIssues] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, w: 1400, h: 900 });
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);

  useEffect(() => {
    if (floor) setView({ x: -20, y: -20, w: floor.width + 40, h: floor.height + 40 });
    setSelection(null);
    setPending(null);
    setDraft([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorId]);

  const nodes = useMemo(
    () => data.nodes.filter((n) => n.floorId === floorId),
    [data.nodes, floorId],
  );
  const nodeById = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);
  const edges = useMemo(
    () =>
      data.edges.filter(
        (e) =>
          nodeById.get(e.fromNode)?.floorId === floorId ||
          nodeById.get(e.toNode)?.floorId === floorId,
      ),
    [data.edges, nodeById, floorId],
  );
  const features = useMemo(
    () => data.features.filter((f) => f.floorId === floorId),
    [data.features, floorId],
  );

  // Client-side connectivity check (treat edges as undirected) to highlight stranded nodes.
  const unreachable = useMemo(() => {
    if (!data.nodes.length) return new Set<string>();
    const adjacency = new Map<string, string[]>();
    for (const e of data.edges) {
      if (!e.active) continue;
      adjacency.set(e.fromNode, [...(adjacency.get(e.fromNode) ?? []), e.toNode]);
      adjacency.set(e.toNode, [...(adjacency.get(e.toNode) ?? []), e.fromNode]);
    }
    const start = data.devices[0]?.routeStartNode ?? data.nodes[0].id;
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length)
      for (const next of adjacency.get(queue.shift()!) ?? [])
        if (!seen.has(next)) (seen.add(next), queue.push(next));
    return new Set(data.nodes.filter((n) => !seen.has(n.id)).map((n) => n.id));
  }, [data.nodes, data.edges, data.devices]);

  const toPlan = (clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return [Math.round(p.x / 5) * 5, Math.round(p.y / 5) * 5];
  };
  const metres = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.max(
      0.5,
      Math.round(Math.hypot(a.x - b.x, a.y - b.y) * (floor?.metresPerUnit ?? 0.1) * 10) / 10,
    );
  const walkEdge = (id: string, from: RouteNode, to: RouteNode): RouteEdge => {
    const distance = metres(from, to);
    return {
      id,
      fromNode: from.id,
      toNode: to.id,
      distance,
      type: 'corridor',
      weight: 1,
      direction: 'BOTH',
      active: true,
      accessible: true,
      restricted: false,
      estimatedTime: Math.max(1, Math.round((distance / 1.3) * 10) / 10),
      reason: '',
    };
  };
  const nearestNode = (x: number, y: number, exclude?: string) => {
    let best: RouteNode | null = null;
    let d = Infinity;
    for (const n of nodes) {
      if (n.id === exclude) continue;
      const dist = Math.hypot(n.x - x, n.y - y);
      if (dist < d) {
        d = dist;
        best = n;
      }
    }
    return best;
  };

  const run = useCallback(
    async (fn: () => Promise<unknown>, success: string) => {
      try {
        await fn();
        command.toast(success);
        await command.reload();
      } catch (e) {
        command.toast(errorMessage(e), 'error');
      }
    },
    [command],
  );

  const createNodeWithLink = async (
    x: number,
    y: number,
    type: RouteNode['type'],
    label: string,
  ) => {
    const node: RouteNode = {
      id: rid(`${floorId}-n`),
      floorId,
      x,
      y,
      label,
      type,
      connectorId: '',
      landmark: false,
    };
    const near = nearestNode(x, y);
    await saveResource('nodes', node);
    if (near) await saveResource('edges', walkEdge(rid(`${floorId}-e`), near, node));
    return node;
  };

  const onCanvasClick = async (event: React.MouseEvent<SVGSVGElement>) => {
    if (
      panRef.current &&
      (Math.abs(event.clientX - panRef.current.sx) > 4 ||
        Math.abs(event.clientY - panRef.current.sy) > 4)
    )
      return;
    const [x, y] = toPlan(event.clientX, event.clientY);
    if (tool === 'node' && canNodes) {
      await run(async () => {
        const node = await createNodeWithLink(x, y, 'corridor', 'Corridor');
        setSelection({ kind: 'node', id: node.id });
      }, 'Node added and linked to the nearest node.');
    } else if (tool === 'unit' && canFeatures) {
      if (draft.length >= 3 && Math.hypot(draft[0][0] - x, draft[0][1] - y) < 20)
        await finishUnit();
      else setDraft([...draft, [x, y]]);
    } else if (tool === 'poi' && canNodes && command.can('pois', 'write')) {
      await run(async () => {
        const node = await createNodeWithLink(x, y, 'poi', 'New amenity');
        const poi: Poi = {
          id: rid('poi'),
          name: 'New amenity',
          type: 'Washroom',
          floorId,
          nodeId: node.id,
          featureId: '',
          accessible: true,
          description: 'Describe this amenity.',
          hours: '',
          status: 'HIDDEN',
        };
        await saveResource('pois', poi);
        setSelection({ kind: 'node', id: node.id });
      }, 'Amenity placed (hidden until you name it in Amenities & POIs).');
    } else if (tool === 'kiosk' && canNodes && command.can('devices', 'write')) {
      const device = data.devices.find((d) => d.id === kioskDevice);
      if (!device) return;
      await run(async () => {
        const node = await createNodeWithLink(x, y, 'kiosk', `${device.name} kiosk`);
        await saveResource('devices', { ...device, floorId, routeStartNode: node.id }, device.id);
        setSelection({ kind: 'node', id: node.id });
      }, `${device.name} now starts routes from this point.`);
    } else if (tool === 'select') {
      setSelection(null);
    }
  };

  const finishUnit = async () => {
    if (draft.length < 3) return;
    const feature: Feature = {
      id: rid('feature'),
      floorId,
      label: 'New unit',
      kind: 'unit',
      points: draft,
      color: '#e6ecf4',
    };
    setDraft([]);
    await run(async () => {
      await saveResource('features', feature);
      setSelection({ kind: 'feature', id: feature.id });
    }, 'Unit created. Assign a tenant in the inspector.');
  };

  const onNodeClick = async (node: RouteNode, event: React.MouseEvent) => {
    event.stopPropagation();
    if (tool === 'connect' && canNodes) {
      if (!pending) setPending(node.id);
      else if (pending !== node.id) {
        const from = nodeById.get(pending)!;
        setPending(null);
        await run(
          () => saveResource('edges', walkEdge(rid(`${floorId}-e`), from, node)),
          'Edge created.',
        );
      }
    } else if (tool === 'preview') {
      if (!preview.from || preview.to)
        setPreview({ accessible: preview.accessible, from: node.id });
      else {
        const next = { ...preview, to: node.id };
        try {
          const result = await api<{ route: Route | null }>('/api/admin/routing/preview', {
            method: 'POST',
            body: { fromNodeId: next.from, toNodeId: node.id, accessible: next.accessible },
          });
          setPreview({ ...next, route: result.route });
        } catch (e) {
          command.toast(errorMessage(e), 'error');
        }
      }
    } else {
      setSelection({ kind: 'node', id: node.id });
    }
  };

  const onNodePointerDown = (node: RouteNode, event: ReactPointerEvent) => {
    if (tool !== 'move' || !canNodes) return;
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    setDrag({ id: node.id, x: node.x, y: node.y });
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drag) {
      const [x, y] = toPlan(event.clientX, event.clientY);
      setDrag({ ...drag, x, y });
    } else if (panRef.current && event.buttons === 1) {
      const svg = svgRef.current!;
      const scale = view.w / svg.clientWidth;
      setView((v) => ({
        ...v,
        x: panRef.current!.vx - (event.clientX - panRef.current!.sx) * scale,
        y: panRef.current!.vy - (event.clientY - panRef.current!.sy) * scale,
      }));
    }
  };
  const onPointerUp = async () => {
    if (!drag) return;
    const node = nodeById.get(drag.id)!;
    const moved = { ...node, x: drag.x, y: drag.y };
    setDrag(null);
    if (node.x === drag.x && node.y === drag.y) return;
    await run(async () => {
      await saveResource('nodes', moved, node.id);
      for (const edge of data.edges.filter(
        (e) =>
          (e.fromNode === node.id || e.toNode === node.id) &&
          ['corridor', 'entrance', 'ramp', 'travelator'].includes(e.type),
      )) {
        const other = nodeById.get(edge.fromNode === node.id ? edge.toNode : edge.fromNode)!;
        if (other.floorId !== node.floorId) continue;
        const distance = metres(moved, other);
        await saveResource(
          'edges',
          { ...edge, distance, estimatedTime: Math.max(1, Math.round((distance / 1.3) * 10) / 10) },
          edge.id,
        );
      }
    }, 'Node moved; connected distances updated.');
  };

  const zoom = (factor: number) =>
    setView((v) => ({
      x: v.x + (v.w * (1 - factor)) / 2,
      y: v.y + (v.h * (1 - factor)) / 2,
      w: v.w * factor,
      h: v.h * factor,
    }));
  const validate = async () => {
    try {
      const result = await api<{ ok: boolean; issues: string[]; nodes: number; edges: number }>(
        '/api/admin/routing/validate',
      );
      setIssues(result.issues);
      command.toast(
        result.ok
          ? `Graph healthy · ${result.nodes} nodes · ${result.edges} edges`
          : `${result.issues.length} routing issue(s) found`,
        result.ok ? 'success' : 'error',
      );
    } catch (e) {
      command.toast(errorMessage(e), 'error');
    }
  };

  const selectedNode = selection?.kind === 'node' ? nodeById.get(selection.id) : null;
  const selectedEdge =
    selection?.kind === 'edge' ? data.edges.find((e) => e.id === selection.id) : null;
  const selectedFeature =
    selection?.kind === 'feature' ? data.features.find((f) => f.id === selection.id) : null;
  const routeOnFloor = preview.route?.nodes.filter((n) => n.floorId === floorId) ?? [];
  const tenantByFeature = new Map(data.tenants.map((t) => [t.featureId, t]));

  if (floorId === 'l0' || floorId === 'l1')
    return <GroundMapEditor key={floorId} floorId={floorId} onFloorChange={setFloorId} />;
  if (!floor) return <PageHeader title="Floors & maps" subtitle="Add a floor to start mapping." />;

  return (
    <>
      <PageHeader
        title="Floors & maps"
        subtitle="Edit unit shapes, route nodes, corridors, amenities and kiosk positions. Edits change the working copy; publish when ready."
        actions={
          <>
            <div className="segmented" role="tablist" aria-label="Floor">
              {[...data.floors]
                .sort((a, b) => b.level - a.level)
                .map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={f.id === floorId}
                    className={f.id === floorId ? 'is-active' : ''}
                    onClick={() => setFloorId(f.id)}
                  >
                    {f.shortName}
                  </button>
                ))}
            </div>
            <button type="button" className="btn btn-outline" onClick={validate}>
              <Glyph name="check" size={16} /> Validate graph
            </button>
          </>
        }
      />
      <div className="cmd-map-editor">
        <aside className="cmd-map-tools">
          <h3>Tools</h3>
          {tools.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tool === t.id ? 'is-active' : ''}
              onClick={() => {
                setTool(t.id);
                setPending(null);
                setDraft([]);
              }}
              aria-pressed={tool === t.id}
              title={t.hint}
            >
              <Glyph name={t.glyph} size={18} /> {t.label}
            </button>
          ))}
          <p className="cmd-small cmd-muted">{tools.find((t) => t.id === tool)?.hint}</p>
          {tool === 'unit' && draft.length ? (
            <div className="cmd-tool-extra">
              <span>{draft.length} corners</span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={finishUnit}
                disabled={draft.length < 3}
              >
                Finish unit
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setDraft([])}>
                Cancel
              </button>
            </div>
          ) : null}
          {tool === 'kiosk' ? (
            <SelectField
              label="Kiosk"
              value={kioskDevice}
              onChange={setKioskDevice}
              options={data.devices.map((d) => ({ value: d.id, label: d.name }))}
            />
          ) : null}
          {tool === 'preview' ? (
            <div className="cmd-tool-extra">
              <ToggleField
                label="Accessible"
                checked={preview.accessible}
                onChange={(v) => setPreview({ accessible: v })}
              />
              <span className="cmd-small">
                {preview.from ? `From ${nodeById.get(preview.from)?.label}` : 'Click a start node'}
              </span>
              {preview.from && !preview.to ? (
                <span className="cmd-small">…now click a destination node</span>
              ) : null}
            </div>
          ) : null}
          <h3>Layers</h3>
          {(Object.keys(layers) as (keyof typeof layers)[]).map((key) => (
            <label key={key} className="cmd-check">
              <input
                type="checkbox"
                checked={layers[key]}
                onChange={(e) => setLayers({ ...layers, [key]: e.target.checked })}
              />{' '}
              {key[0].toUpperCase() + key.slice(1)}
            </label>
          ))}
          <h3>Legend</h3>
          <ul className="cmd-legend">
            {(
              [
                'corridor',
                'tenant',
                'poi',
                'kiosk',
                'lift',
                'escalator',
                'stairs',
                'entrance',
              ] as const
            ).map((t) => (
              <li key={t}>
                <i style={{ background: nodeColor[t] }} /> {t}
              </li>
            ))}
            <li>
              <i className="is-line is-closed" /> closed edge
            </li>
            <li>
              <i className="is-line is-inaccessible" /> not step-free
            </li>
            <li>
              <i style={{ background: '#d33c3c' }} /> unreachable node
            </li>
          </ul>
        </aside>
        <div className="cmd-map-canvas">
          <div className="cmd-map-zoom">
            <button
              type="button"
              className="cmd-icon-btn"
              onClick={() => zoom(0.8)}
              aria-label="Zoom in"
            >
              <Glyph name="plus" size={16} />
            </button>
            <button
              type="button"
              className="cmd-icon-btn"
              onClick={() => zoom(1.25)}
              aria-label="Zoom out"
            >
              <Glyph name="minus" size={16} />
            </button>
            <button
              type="button"
              className="cmd-icon-btn"
              onClick={() => setView({ x: -20, y: -20, w: floor.width + 40, h: floor.height + 40 })}
              aria-label="Fit floor"
            >
              <Glyph name="expand" size={16} />
            </button>
          </div>
          <svg
            ref={svgRef}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            className={`cmd-map-svg tool-${tool}`}
            onClick={onCanvasClick}
            onPointerDown={(e) => {
              // Remember where the press started: a drag pans the canvas, a still press is a click.
              panRef.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
            }}
            onPointerMove={onPointerMove}
            onPointerUp={() => {
              void onPointerUp();
              window.setTimeout(() => (panRef.current = null), 0);
            }}
            onWheel={(e) => zoom(e.deltaY > 0 ? 1.1 : 0.9)}
            role="application"
            aria-label={`${floor.shortName} map editor`}
          >
            <polygon
              className="cmd-map-ground"
              points={floor.outline.map((p) => p.join(',')).join(' ')}
              fill="#f5f2ec"
              stroke="#d9d2c3"
              strokeWidth={3}
            />
            {layers.units
              ? features.map((f) => {
                  const tenant = tenantByFeature.get(f.id);
                  const selected = selection?.kind === 'feature' && selection.id === f.id;
                  const cx = f.points.reduce((s, p) => s + p[0], 0) / f.points.length;
                  const cy = f.points.reduce((s, p) => s + p[1], 0) / f.points.length;
                  return (
                    <g
                      key={f.id}
                      onClick={(e) => {
                        if (tool === 'select') {
                          e.stopPropagation();
                          setSelection({ kind: 'feature', id: f.id });
                        }
                      }}
                    >
                      <polygon
                        points={f.points.map((p) => p.join(',')).join(' ')}
                        fill={f.kind === 'void' ? '#dfe9f2' : f.color}
                        stroke={selected ? '#005247' : '#ffffff'}
                        strokeWidth={selected ? 5 : 2}
                        className="cmd-map-feature"
                      />
                      {layers.labels ? (
                        <text x={cx} y={cy} textAnchor="middle" className="cmd-map-label">
                          {tenant?.name ?? f.label}
                        </text>
                      ) : null}
                    </g>
                  );
                })
              : null}
            {draft.length ? (
              <polyline
                points={draft.map((p) => p.join(',')).join(' ')}
                fill="rgba(0,82,71,0.12)"
                stroke="#005247"
                strokeWidth={3}
                strokeDasharray="8 6"
              />
            ) : null}
            {layers.edges
              ? edges.map((e) => {
                  const a =
                    drag?.id === e.fromNode
                      ? { ...nodeById.get(e.fromNode)!, x: drag.x, y: drag.y }
                      : nodeById.get(e.fromNode);
                  const b =
                    drag?.id === e.toNode
                      ? { ...nodeById.get(e.toNode)!, x: drag.x, y: drag.y }
                      : nodeById.get(e.toNode);
                  if (!a || !b) return null;
                  if (a.floorId !== b.floorId) {
                    const here = a.floorId === floorId ? a : b;
                    return (
                      <circle
                        key={e.id}
                        cx={here.x}
                        cy={here.y}
                        r={14}
                        fill="none"
                        stroke="#7c5cff"
                        strokeWidth={3}
                        strokeDasharray="4 4"
                      />
                    );
                  }
                  const selected = selection?.kind === 'edge' && selection.id === e.id;
                  return (
                    <line
                      key={e.id}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      className={`cmd-map-edge ${!e.active ? 'is-closed' : ''} ${!e.accessible ? 'is-inaccessible' : ''} ${selected ? 'is-selected' : ''}`}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (tool === 'select' || tool === 'move')
                          setSelection({ kind: 'edge', id: e.id });
                      }}
                    />
                  );
                })
              : null}
            {routeOnFloor.length > 1 ? (
              <polyline
                points={routeOnFloor.map((n) => `${n.x},${n.y}`).join(' ')}
                fill="none"
                stroke="#005247"
                strokeWidth={9}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.85}
              />
            ) : null}
            {layers.nodes
              ? nodes.map((n) => {
                  const pos = drag?.id === n.id ? drag : n;
                  const selected =
                    (selection?.kind === 'node' && selection.id === n.id) ||
                    pending === n.id ||
                    preview.from === n.id ||
                    preview.to === n.id;
                  return (
                    <circle
                      key={n.id}
                      cx={pos.x}
                      cy={pos.y}
                      r={n.type === 'corridor' ? 6 : 9}
                      fill={unreachable.has(n.id) ? '#d33c3c' : nodeColor[n.type]}
                      stroke={selected ? '#14213d' : '#ffffff'}
                      strokeWidth={selected ? 4 : 2}
                      className="cmd-map-node"
                      onClick={(e) => void onNodeClick(n, e)}
                      onPointerDown={(e) => onNodePointerDown(n, e)}
                    >
                      <title>{`${n.label} (${n.type}) · ${n.id}`}</title>
                    </circle>
                  );
                })
              : null}
          </svg>
        </div>
        <aside className="cmd-map-inspector">
          {selectedNode ? (
            <NodeInspector
              key={selectedNode.id}
              node={selectedNode}
              onDone={() => setSelection(null)}
            />
          ) : selectedEdge ? (
            <EdgeInspector
              key={selectedEdge.id}
              edge={selectedEdge}
              onDone={() => setSelection(null)}
            />
          ) : selectedFeature ? (
            <FeatureInspector
              key={selectedFeature.id}
              feature={selectedFeature}
              onDone={() => setSelection(null)}
            />
          ) : preview.route !== undefined && tool === 'preview' ? (
            <Panel title="Route preview">
              {preview.route ? (
                <>
                  <p>
                    <strong>{preview.route.distance} m</strong> · {preview.route.minutes} min ·{' '}
                    {preview.route.floorIds.length} floor(s){' '}
                    {preview.accessible ? <Badge tone="blue">Accessible</Badge> : null}
                  </p>
                  <ol className="cmd-steps">
                    {preview.route.steps.map((s, i) => (
                      <li key={i}>{s.text}</li>
                    ))}
                  </ol>
                </>
              ) : (
                <div className="notice is-warning">
                  No route between these nodes with the current graph
                  {preview.accessible ? ' (step-free only)' : ''}.
                </div>
              )}
            </Panel>
          ) : (
            <Panel title={`${floor.shortName} · ${floor.theme}`}>
              <dl className="cmd-dl">
                <dt>Units</dt>
                <dd>{features.filter((f) => f.kind === 'unit').length}</dd>
                <dt>Route nodes</dt>
                <dd>{nodes.length}</dd>
                <dt>Edges</dt>
                <dd>{edges.length}</dd>
                <dt>Scale</dt>
                <dd>1 unit = {floor.metresPerUnit} m</dd>
                <dt>Unreachable</dt>
                <dd>{nodes.filter((n) => unreachable.has(n.id)).length}</dd>
              </dl>
              {issues ? (
                issues.length ? (
                  <ul className="cmd-issues">
                    {issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="notice">
                    <Glyph name="check" size={16} /> Every destination is reachable from every
                    kiosk.
                  </div>
                )
              ) : (
                <p className="cmd-muted cmd-small">
                  Select something on the map to edit it, or run “Validate graph”.
                </p>
              )}
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}

function NodeInspector({ node, onDone }: { node: RouteNode; onDone: () => void }) {
  const command = useCommand();
  const [draft, setDraft] = useState(node);
  const canWrite = command.can('nodes', 'write');
  const pois = command.data.pois.filter((p) => p.nodeId === node.id);
  const tenants = command.data.tenants.filter((t) => t.nodeId === node.id);
  const devices = command.data.devices.filter((d) => d.routeStartNode === node.id);
  const edges = command.data.edges.filter((e) => e.fromNode === node.id || e.toNode === node.id);
  const save = async () => {
    try {
      await saveResource('nodes', draft, node.id);
      command.toast('Node saved.');
      await command.reload();
    } catch (e) {
      command.toast(errorMessage(e), 'error');
    }
  };
  return (
    <Panel title="Route node" subtitle={node.id}>
      <fieldset className="cmd-form is-single" disabled={!canWrite}>
        <TextField
          label="Label"
          value={draft.label}
          onChange={(v) => setDraft({ ...draft, label: v })}
        />
        <SelectField
          label="Type"
          value={draft.type}
          onChange={(v) => setDraft({ ...draft, type: v as RouteNode['type'] })}
          options={nodeTypes.map((t) => ({ value: t, label: t }))}
        />
        <NumberField label="X" value={draft.x} onChange={(v) => setDraft({ ...draft, x: v })} />
        <NumberField label="Y" value={draft.y} onChange={(v) => setDraft({ ...draft, y: v })} />
        <TextField
          label="Vertical connector ID"
          value={draft.connectorId}
          onChange={(v) => setDraft({ ...draft, connectorId: v })}
          hint="Groups lift/escalator nodes across floors"
        />
        <ToggleField
          label="Landmark"
          checked={draft.landmark}
          onChange={(v) => setDraft({ ...draft, landmark: v })}
          hint="Used in turn-by-turn instructions"
        />
      </fieldset>
      <dl className="cmd-dl">
        <dt>Edges</dt>
        <dd>{edges.length}</dd>
        <dt>Linked</dt>
        <dd>
          {[
            ...tenants.map((t) => t.name),
            ...pois.map((p) => p.name),
            ...devices.map((d) => d.name),
          ].join(' · ') || '—'}
        </dd>
      </dl>
      <div className="cmd-inspector-actions">
        <button type="button" className="btn btn-primary" onClick={save} disabled={!canWrite}>
          Save node
        </button>
        <ConfirmButton
          label="Delete"
          disabled={!canWrite || tenants.length + pois.length + devices.length > 0}
          onConfirm={async () => {
            try {
              await deleteResource('nodes', node.id);
              command.toast('Node and its edges deleted.');
              await command.reload();
              onDone();
            } catch (e) {
              command.toast(errorMessage(e), 'error');
            }
          }}
        />
      </div>
      {tenants.length + pois.length + devices.length > 0 ? (
        <p className="cmd-small cmd-muted">
          Reassign linked tenants, amenities or kiosks before deleting this node.
        </p>
      ) : null}
    </Panel>
  );
}

function EdgeInspector({ edge, onDone }: { edge: RouteEdge; onDone: () => void }) {
  const command = useCommand();
  const [draft, setDraft] = useState(edge);
  const canWrite = command.can('edges', 'write');
  const from = command.data.nodes.find((n) => n.id === edge.fromNode);
  const to = command.data.nodes.find((n) => n.id === edge.toNode);
  const save = async () => {
    try {
      await saveResource('edges', draft, edge.id);
      command.toast('Edge saved.');
      await command.reload();
    } catch (e) {
      command.toast(errorMessage(e), 'error');
    }
  };
  const toggleClosure = async () => {
    try {
      await api('/api/admin/routing/closures', {
        method: 'POST',
        body: {
          edgeId: edge.id,
          closed: edge.active,
          reason: draft.reason || 'Temporarily closed',
          publish: command.canPublish,
        },
      });
      command.toast(edge.active ? 'Corridor closed. Routes now avoid it.' : 'Corridor reopened.');
      await command.reload();
      await command.refreshPublish();
    } catch (e) {
      command.toast(errorMessage(e), 'error');
    }
  };
  return (
    <Panel
      title="Corridor edge"
      subtitle={`${from?.label ?? edge.fromNode} ↔ ${to?.label ?? edge.toNode}`}
    >
      <div className={`notice ${edge.active ? '' : 'is-error'}`}>
        <Glyph name={edge.active ? 'check' : 'alert'} size={16} />{' '}
        {edge.active ? 'Open to visitors' : `Closed — ${edge.reason || 'no reason given'}`}
      </div>
      <fieldset className="cmd-form is-single" disabled={!canWrite}>
        <SelectField
          label="Type"
          value={draft.type}
          onChange={(v) => setDraft({ ...draft, type: v as RouteEdge['type'] })}
          options={edgeTypes.map((t) => ({ value: t, label: t }))}
        />
        <NumberField
          label="Distance (m)"
          value={draft.distance}
          onChange={(v) => setDraft({ ...draft, distance: v })}
          step={0.1}
        />
        <NumberField
          label="Walking time (s)"
          value={draft.estimatedTime}
          onChange={(v) => setDraft({ ...draft, estimatedTime: v })}
          step={1}
        />
        <NumberField
          label="Weight"
          value={draft.weight}
          onChange={(v) => setDraft({ ...draft, weight: v })}
          step={0.1}
          hint="Above 1 discourages this edge"
        />
        <SelectField
          label="Direction"
          value={draft.direction}
          onChange={(v) => setDraft({ ...draft, direction: v as RouteEdge['direction'] })}
          options={[
            { value: 'BOTH', label: 'Two-way' },
            { value: 'FORWARD', label: 'One-way (from → to)' },
          ]}
        />
        <ToggleField
          label="Step-free accessible"
          checked={draft.accessible}
          onChange={(v) => setDraft({ ...draft, accessible: v })}
        />
        <ToggleField
          label="Restricted (staff only)"
          checked={draft.restricted}
          onChange={(v) => setDraft({ ...draft, restricted: v })}
        />
        <TextField
          label="Closure reason"
          value={draft.reason}
          onChange={(v) => setDraft({ ...draft, reason: v })}
          placeholder="Floor cleaning"
        />
      </fieldset>
      <div className="cmd-inspector-actions">
        <button type="button" className="btn btn-primary" onClick={save} disabled={!canWrite}>
          Save edge
        </button>
        <button
          type="button"
          className={`btn ${edge.active ? 'btn-danger' : 'btn-outline'}`}
          onClick={toggleClosure}
          disabled={!canWrite}
        >
          {edge.active ? 'Close corridor' : 'Reopen corridor'}
        </button>
        <ConfirmButton
          label="Delete"
          disabled={!canWrite}
          onConfirm={async () => {
            try {
              await deleteResource('edges', edge.id);
              command.toast('Edge deleted.');
              await command.reload();
              onDone();
            } catch (e) {
              command.toast(errorMessage(e), 'error');
            }
          }}
        />
      </div>
      {command.canPublish ? (
        <p className="cmd-small cmd-muted">
          Closing or reopening publishes immediately so kiosks reroute within seconds.
        </p>
      ) : null}
    </Panel>
  );
}

function FeatureInspector({ feature, onDone }: { feature: Feature; onDone: () => void }) {
  const command = useCommand();
  const { data } = command;
  const [draft, setDraft] = useState(feature);
  const canWrite = command.can('features', 'write');
  const tenant = data.tenants.find((t) => t.featureId === feature.id);
  const poi = data.pois.find((p) => p.featureId === feature.id);
  const [assign, setAssign] = useState(tenant?.id ?? '');
  const save = async () => {
    try {
      await saveResource('features', draft, feature.id);
      if (assign !== (tenant?.id ?? '') && assign && command.can('tenants', 'write')) {
        const target = data.tenants.find((t) => t.id === assign)!;
        const cx = feature.points.reduce((s, p) => s + p[0], 0) / feature.points.length;
        const cy = feature.points.reduce((s, p) => s + p[1], 0) / feature.points.length;
        const nodeOnFloor =
          target.floorId === feature.floorId
            ? target.nodeId
            : data.nodes
                .filter(
                  (n) =>
                    n.floorId === feature.floorId && (n.type === 'tenant' || n.type === 'corridor'),
                )
                .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0]
                ?.id;
        await saveResource(
          'tenants',
          {
            ...target,
            featureId: feature.id,
            floorId: feature.floorId,
            nodeId: nodeOnFloor ?? target.nodeId,
          },
          target.id,
        );
      }
      command.toast('Unit saved.');
      await command.reload();
    } catch (e) {
      command.toast(errorMessage(e), 'error');
    }
  };
  return (
    <Panel title="Map unit" subtitle={feature.id}>
      <fieldset className="cmd-form is-single" disabled={!canWrite}>
        <TextField
          label="Label"
          value={draft.label}
          onChange={(v) => setDraft({ ...draft, label: v })}
        />
        <SelectField
          label="Kind"
          value={draft.kind}
          onChange={(v) => setDraft({ ...draft, kind: v as Feature['kind'] })}
          options={featureKinds.map((k) => ({ value: k, label: k }))}
        />
        <ColorField
          label="Fill colour"
          value={draft.color}
          onChange={(v) => setDraft({ ...draft, color: v })}
        />
        <SelectField
          label="Assigned tenant"
          value={assign}
          onChange={setAssign}
          options={[
            { value: '', label: tenant ? 'Keep current' : 'Unassigned' },
            ...data.tenants.map((t) => ({
              value: t.id,
              label: `${t.name} (${data.floors.find((f) => f.id === t.floorId)?.shortName} · ${t.unitNumber})`,
            })),
          ]}
          hint="Assigning moves the tenant listing to this unit"
        />
      </fieldset>
      <dl className="cmd-dl">
        <dt>Corners</dt>
        <dd>{feature.points.length}</dd>
        <dt>Linked</dt>
        <dd>{tenant?.name ?? poi?.name ?? '—'}</dd>
      </dl>
      <div className="cmd-inspector-actions">
        <button type="button" className="btn btn-primary" onClick={save} disabled={!canWrite}>
          Save unit
        </button>
        <ConfirmButton
          label="Delete"
          disabled={!canWrite || Boolean(tenant)}
          onConfirm={async () => {
            try {
              await deleteResource('features', feature.id);
              command.toast('Unit deleted.');
              await command.reload();
              onDone();
            } catch (e) {
              command.toast(errorMessage(e), 'error');
            }
          }}
        />
      </div>
      {tenant ? (
        <p className="cmd-small cmd-muted">
          Move {tenant.name} to another unit before deleting this one.
        </p>
      ) : null}
    </Panel>
  );
}
