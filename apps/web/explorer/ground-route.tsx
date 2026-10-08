import type { Floor, Route, RouteNode } from '../../../packages/domain';
import { routeFloorSegments } from '../../../packages/routing';

const polyline = (nodes: RouteNode[]) => nodes.map((n) => `${n.x},${n.y}`).join(' ');

/** Draw in source coordinates, above the architectural plan. Keep strokes legible at every zoom. */
export function GroundRoute({
  route,
  stepIndex,
  floorId = route.nodes[0].floorId,
  floors = [],
}: {
  route: Route;
  stepIndex: number | null;
  floorId?: string;
  floors?: Pick<Floor, 'id' | 'name' | 'level'>[];
}) {
  const floor = (id: string) => floors.find((item) => item.id === id);
  // A multi-floor route is drawn one floor at a time; each floor shows only its own legs.
  const segments = routeFloorSegments(route).filter((segment) => segment.floorId === floorId);
  const start = route.nodes[0],
    end = route.nodes.at(-1)!;
  const previousId =
    stepIndex === null || stepIndex === 0 ? route.nodes[0].id : route.steps[stepIndex - 1]?.nodeId;
  const currentId = stepIndex === null ? undefined : route.steps[stepIndex]?.nodeId;
  const from = Math.max(
    0,
    route.nodes.findIndex((n) => n.id === previousId),
  );
  const to = Math.max(
    from,
    route.nodes.findIndex((n) => n.id === currentId),
  );
  const activeNodes =
    stepIndex === null ? [] : route.nodes.slice(from, to + 1).filter((n) => n.floorId === floorId);
  const activePoints = polyline(activeNodes);
  const arrows: { x: number; y: number; angle: number }[] = [];
  for (const { nodes } of segments)
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1],
        b = nodes[i],
        length = Math.hypot(a.x - b.x, a.y - b.y);
      for (let offset = 28; offset < length - 12; offset += 48)
        arrows.push({
          x: a.x + ((b.x - a.x) * offset) / length,
          y: a.y + ((b.y - a.y) * offset) / length,
          angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
        });
    }
  // Where the route leaves or joins this floor by lift or escalator.
  const changes = route.transitions.flatMap((t) => {
    const leaving = t.fromFloorId === floorId,
      node = route.nodes.find((n) => n.id === (leaving ? t.fromNodeId : t.toNodeId));
    if (!node || (!leaving && t.toFloorId !== floorId)) return [];
    const other = floor(leaving ? t.toFloorId : t.fromFloorId),
      name = other?.name ?? (leaving ? t.toFloorId : t.fromFloorId),
      up = (other?.level ?? 0) > (floor(floorId)?.level ?? 0);
    return [
      {
        node,
        leaving,
        text: leaving
          ? `${t.type === 'lift' ? 'Lift' : 'Escalator'} ${up ? '↑' : '↓'} ${name}`
          : `From ${name}`,
      },
    ];
  });
  if (!segments.length) return null;
  return (
    <g
      className="directory-route"
      data-route-floor={floorId}
      aria-label={`Walking route to ${end.label}`}
      pointerEvents="none"
    >
      {segments.map(({ nodes }, i) => (
        <g key={i}>
          <polyline
            className="directory-route-halo"
            points={polyline(nodes)}
            fill="none"
            stroke="#fffdf6"
            strokeWidth={16}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            className="directory-route-line"
            points={polyline(nodes)}
            fill="none"
            stroke="#075b4b"
            strokeWidth={8}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
      {activeNodes.length > 1 && (
        <>
          <polyline
            className="directory-route-active-halo"
            points={activePoints}
            fill="none"
            stroke="#fffdf6"
            strokeWidth={17}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            className="directory-route-active-line"
            points={activePoints}
            fill="none"
            stroke="#b48645"
            strokeWidth={9}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
      {arrows.map((a, i) => (
        <path
          key={i}
          d="M-3-3L1 0L-3 3"
          transform={`translate(${a.x} ${a.y}) rotate(${a.angle})`}
          fill="none"
          stroke="white"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      ))}
      {start.floorId === floorId && (
        <circle
          cx={start.x}
          cy={start.y}
          r={8}
          fill="#075b4b"
          stroke="white"
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {end.floorId === floorId && (
        <>
          <circle
            cx={end.x}
            cy={end.y}
            r={11}
            fill="white"
            stroke="#075b4b"
            strokeWidth={4}
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={end.x} cy={end.y} r={5} fill="#075b4b" />
        </>
      )}
      {changes.map(({ node, leaving, text }) => (
        // The plan is turned a quarter for landscape display; turn the label back upright.
        <g
          key={`${node.id}-${leaving}`}
          className="directory-route-floor-change"
          data-floor-change={leaving ? 'leave' : 'arrive'}
          transform={`translate(${node.x} ${node.y}) rotate(90)`}
        >
          <circle r={9} fill="#b48645" stroke="white" strokeWidth={2.5} />
          <path
            d={leaving ? 'M0 4V-4M-3.5-0.5L0-4L3.5-0.5' : 'M-4 0H4M0.5-3.5L4 0L0.5 3.5'}
            fill="none"
            stroke="white"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <text x={13} y={4} className="directory-route-floor-label">
            {text}
          </text>
        </g>
      ))}
      {activeNodes.length > 1 && (
        <circle
          className="directory-route-next"
          cx={activeNodes.at(-1)!.x}
          cy={activeNodes.at(-1)!.y}
          r={7}
          fill="#b48645"
          stroke="white"
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
}
