import { useMemo, useRef, useState } from 'react';
import type { RouteEdge, RouteNode } from '../../../../packages/domain';
import { groundRouteGraph } from '../../../../packages/domain/reference/ground-floor-route-graph';
import { findGroundDirectoryRoute } from '../../../../packages/routing/ground-directory';
import { GroundFloor } from '../../explorer/ground-floor';
import { Glyph } from '../../icons/glyphs';
import { api } from '../../shared/api';
import { errorMessage, saveResource, useCommand } from '../data';
import { PageHeader, Panel, SelectField, ToggleField } from '../ui';

const sourceWidth = 914.89046;
const sourceHeight = 1455.8265;
const fitted = { x: 0, y: 0, w: sourceHeight, h: sourceWidth };
const ignore = () => {};

/** Ground Floor admin uses the same SVG and walking graph as the customer kiosk. */
export default function GroundMapEditor() {
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
  const [showNetwork, setShowNetwork] = useState(true);
  const [tool, setTool] = useState<'select' | 'node' | 'connect'>('select');
  const [pendingNode, setPendingNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [view, setView] = useState(fitted);
  const [issues, setIssues] = useState<string[] | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const route = useMemo(
    () => (to ? findGroundDirectoryRoute(from, to, accessible, graph.edges, graph.nodes) : null),
    [from, to, accessible, graph.edges, graph.nodes],
  );
  const edge = graph.edges.find((item) => item.id === selectedEdge);

  const zoom = (factor: number) =>
    setView((current) => ({
      x: current.x + (current.w * (1 - factor)) / 2,
      y: current.y + (current.h * (1 - factor)) / 2,
      w: current.w * factor,
      h: current.h * factor,
    }));

  const addNode = async (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const point = new DOMPoint(clientX, clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    const x = Math.round(point.y * 10) / 10;
    const y = Math.round((sourceHeight - point.x) * 10) / 10;
    if (x < 0 || x > sourceWidth || y < 0 || y > sourceHeight) return;
    const node: RouteNode = {
      id: `ground-custom-node-${crypto.randomUUID()}`,
      floorId: 'l0',
      x,
      y,
      label: 'Walkway',
      type: 'corridor',
      connectorId: '',
      landmark: false,
    };
    try {
      await saveResource('nodes', node);
      await command.reload();
      command.toast('Route node added. Use Connect to join it to the walk network, then publish.');
    } catch (error) {
      command.toast(errorMessage(error), 'error');
    }
  };
  const connectNode = async (id: string) => {
    if (!pendingNode) {
      setPendingNode(id);
      return;
    }
    if (pendingNode === id) {
      setPendingNode(null);
      return;
    }
    const fromNode = byId.get(pendingNode)!;
    const toNode = byId.get(id)!;
    setPendingNode(null);
    if (
      graph.edges.some(
        (edge) =>
          (edge.fromNode === fromNode.id && edge.toNode === toNode.id) ||
          (edge.fromNode === toNode.id && edge.toNode === fromNode.id),
      )
    ) {
      command.toast('These nodes are already connected.');
      return;
    }
    const length = Math.hypot(fromNode.x - toNode.x, fromNode.y - toNode.y);
    const edge: RouteEdge = {
      id: `ground-custom-edge-${crypto.randomUUID()}`,
      fromNode: fromNode.id,
      toNode: toNode.id,
      distance: Math.max(0.01, length),
      estimatedTime: Math.max(0.01, length),
      type: 'corridor',
      weight: 1,
      direction: 'BOTH',
      active: true,
      accessible: false,
      restricted: false,
      reason: '',
    };
    try {
      await saveResource('edges', edge);
      await command.reload();
      command.toast('Walkway connected. Preview the route, then publish when ready.');
    } catch (error) {
      command.toast(errorMessage(error), 'error');
    }
  };

  const changeClosure = async () => {
    if (!edge) return;
    try {
      await api('/api/admin/routing/closures', {
        method: 'POST',
        body: {
          edgeId: edge.id,
          closed: edge.active,
          reason: edge.active ? 'Closed by staff' : '',
          publish: command.canPublish,
        },
      });
      command.toast(edge.active ? 'Walkway closed. Routes now avoid it.' : 'Walkway reopened.');
      await command.reload();
      await command.refreshPublish();
    } catch (error) {
      command.toast(errorMessage(error), 'error');
    }
  };
  const validate = async () => {
    try {
      const result = await api<{ issues: string[]; nodes: number; edges: number }>(
        '/api/admin/routing/validate',
      );
      setIssues(result.issues);
      command.toast(
        result.issues.length
          ? `${result.issues.length} route issue(s) found`
          : `Ground route healthy · ${result.nodes} nodes · ${result.edges} links`,
        result.issues.length ? 'error' : 'success',
      );
    } catch (error) {
      command.toast(errorMessage(error), 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Floors & maps"
        subtitle="Ground Floor architecture and walking routes. The source SVG remains the map; closed walkways update kiosk directions after publishing."
        actions={
          <button type="button" className="btn btn-outline" onClick={validate}>
            <Glyph name="check" size={16} /> Validate routes
          </button>
        }
      />
      <div className="cmd-ground-editor">
        <div className="cmd-map-canvas cmd-ground-map-canvas">
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
              onClick={() => setView(fitted)}
              aria-label="Fit floor"
            >
              <Glyph name="expand" size={16} />
            </button>
          </div>
          <svg
            className="cmd-map-svg"
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            role="img"
            aria-label="Ground Floor architectural map and walking routes"
            onClick={(event) => {
              if (tool === 'node' && command.can('nodes', 'write'))
                void addNode(event.currentTarget, event.clientX, event.clientY);
            }}
            onPointerDown={(event) => {
              if (tool !== 'select') return;
              drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!drag.current || !(event.buttons & 1)) return;
              const scaleX = view.w / event.currentTarget.clientWidth;
              const scaleY = view.h / event.currentTarget.clientHeight;
              setView((current) => ({
                ...current,
                x: drag.current!.vx - (event.clientX - drag.current!.x) * scaleX,
                y: drag.current!.vy - (event.clientY - drag.current!.y) * scaleY,
              }));
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onWheel={(event) => zoom(event.deltaY > 0 ? 1.08 : 0.92)}
          >
            <g transform={`translate(${sourceHeight} 0) rotate(90)`}>
              <GroundFloor onBounds={ignore} onStatus={ignore} places={[]} onSelect={ignore} />
              {showNetwork &&
                graph.edges.map((walk) => {
                  const a = byId.get(walk.fromNode)!;
                  const b = byId.get(walk.toNode)!;
                  return (
                    <line
                      key={walk.id}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={walk.active ? '#3976b5' : '#d33c3c'}
                      strokeWidth={selectedEdge === walk.id ? 5 : 2.5}
                      strokeDasharray={walk.active ? undefined : '5 4'}
                      opacity={0.9}
                      className="cmd-ground-edge"
                      pointerEvents={tool === 'select' ? 'auto' : 'none'}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedEdge(walk.id);
                      }}
                    >
                      <title>{`${walk.id} · ${walk.active ? 'open' : 'closed'}`}</title>
                    </line>
                  );
                })}
              {showNetwork &&
                graph.nodes.map((node) => (
                  <circle
                    key={node.id}
                    data-node-id={node.id}
                    cx={node.x}
                    cy={node.y}
                    r={pendingNode === node.id ? 6 : node.id.startsWith('ground-custom-') ? 4.5 : 3}
                    fill={
                      pendingNode === node.id
                        ? '#e67d20'
                        : node.id.startsWith('ground-custom-')
                          ? '#005ba8'
                          : '#224866'
                    }
                    stroke="white"
                    strokeWidth="1.5"
                    className="cmd-ground-node"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (tool === 'connect') void connectNode(node.id);
                    }}
                  >
                    <title>{`${node.label} · ${node.id}`}</title>
                  </circle>
                ))}
              {route && (
                <polyline
                  points={route.nodes.map((node) => `${node.x},${node.y}`).join(' ')}
                  fill="none"
                  stroke="#fff"
                  strokeWidth="10"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              )}
              {route && (
                <polyline
                  points={route.nodes.map((node) => `${node.x},${node.y}`).join(' ')}
                  fill="none"
                  stroke="#087869"
                  strokeWidth="5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              )}
              {route && (
                <circle
                  cx={route.nodes.at(-1)!.x}
                  cy={route.nodes.at(-1)!.y}
                  r="8"
                  fill="#087869"
                  stroke="white"
                  strokeWidth="3"
                  pointerEvents="none"
                />
              )}
            </g>
          </svg>
        </div>
        <aside className="cmd-ground-sidebar">
          <Panel
            title="Route preview"
            subtitle="Uses the same published walking network as the kiosk."
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
                hint="Step-free access has not been verified on this plan."
              />
            </div>
            {route ? (
              <ol className="cmd-steps">
                {route.steps.map((step, index) => (
                  <li key={index}>{step.text}</li>
                ))}
              </ol>
            ) : (
              <p className="notice is-warning">
                {accessible
                  ? 'Step-free route is not verified yet.'
                  : 'No confirmed walking connection to this destination.'}
              </p>
            )}
            <p className="cmd-small cmd-muted">
              Distances are not shown because the architectural drawing has no surveyed metre scale.
              Soulfoods access remains unverified.
            </p>
          </Panel>
          <Panel title="Walkway management">
            <label className="cmd-check">
              <input
                type="checkbox"
                checked={showNetwork}
                onChange={(event) => setShowNetwork(event.target.checked)}
              />{' '}
              Show walk network
            </label>
            <div className="cmd-ground-tools" role="group" aria-label="Route network tools">
              {(
                [
                  ['select', 'Select', 'cursor'],
                  ['node', 'Add node', 'node'],
                  ['connect', 'Connect', 'link'],
                ] as const
              ).map(([id, label, glyph]) => (
                <button
                  key={id}
                  type="button"
                  className={`btn ${tool === id ? 'btn-primary' : 'btn-outline'}`}
                  aria-pressed={tool === id}
                  disabled={id !== 'select' && !command.can('nodes', 'write')}
                  onClick={() => {
                    setTool(id);
                    setPendingNode(null);
                    setShowNetwork(true);
                  }}
                >
                  <Glyph name={glyph} size={15} /> {label}
                </button>
              ))}
            </div>
            <p className="cmd-small cmd-muted">
              {tool === 'node'
                ? 'Click an open walkway on the plan to add a node.'
                : tool === 'connect'
                  ? pendingNode
                    ? 'Click the second node along the visible walkway.'
                    : 'Click two nodes along a visible walkway to connect them.'
                  : 'Select a line to close or reopen it. Drag the map to pan.'}
            </p>
            {edge ? (
              <div className="cmd-ground-edge-detail">
                <strong>{edge.id}</strong>
                <span>
                  {edge.active ? 'Open' : 'Closed'} ·{' '}
                  {edge.id.startsWith('ground-custom-')
                    ? 'admin connection'
                    : 'source-validated corridor'}
                </span>
                <button
                  type="button"
                  className={`btn ${edge.active ? 'btn-danger' : 'btn-outline'}`}
                  disabled={!command.can('edges', 'write')}
                  onClick={changeClosure}
                >
                  {edge.active ? 'Close walkway' : 'Reopen walkway'}
                </button>
              </div>
            ) : (
              <p className="cmd-small cmd-muted">
                Show the network and select a segment to close or reopen it.
              </p>
            )}
            {issues &&
              (issues.length ? (
                <ul className="cmd-issues">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : (
                <p className="notice">All confirmed destinations are reachable.</p>
              ))}
          </Panel>
        </aside>
      </div>
    </>
  );
}
