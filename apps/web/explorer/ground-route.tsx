import type { Route } from '../../../packages/domain';

/** Draw in source coordinates, above the architectural plan. Keep strokes legible at every zoom. */
export function GroundRoute({ route, stepIndex }: { route: Route; stepIndex: number | null }) {
  const points = route.nodes.map((n) => `${n.x},${n.y}`).join(' '),
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
  const activeNodes = stepIndex === null ? [] : route.nodes.slice(from, to + 1);
  const activePoints = activeNodes.map((n) => `${n.x},${n.y}`).join(' ');
  const arrows: { x: number; y: number; angle: number }[] = [];
  for (let i = 1; i < route.nodes.length; i++) {
    const a = route.nodes[i - 1],
      b = route.nodes[i],
      length = Math.hypot(a.x - b.x, a.y - b.y);
    for (let offset = 28; offset < length - 12; offset += 48)
      arrows.push({
        x: a.x + ((b.x - a.x) * offset) / length,
        y: a.y + ((b.y - a.y) * offset) / length,
        angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      });
  }
  return (
    <g
      className="directory-route"
      aria-label={`Walking route to ${end.label}`}
      pointerEvents="none"
    >
      <polyline
        className="directory-route-halo"
        points={points}
        fill="none"
        stroke="#fffdf6"
        strokeWidth={16}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        className="directory-route-line"
        points={points}
        fill="none"
        stroke="#075b4b"
        strokeWidth={8}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
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
      <circle
        cx={route.nodes[0].x}
        cy={route.nodes[0].y}
        r={8}
        fill="#075b4b"
        stroke="white"
        strokeWidth={3}
        vectorEffect="non-scaling-stroke"
      />
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
