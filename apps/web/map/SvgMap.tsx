import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { RouteNode } from '../../../packages/domain';
import { WayIcon } from '../icons/illustrated';
import {
  boundsOf,
  buildFloorModel,
  dimFill,
  mapColors,
  selectedFill,
  shade,
  type FloorModel,
  type Pt,
  type RoutePiece,
} from './model';
import type { MapViewProps } from './types';

/**
 * 2D / isometric SVG renderer. It is the accessible, low-power and debugging fallback for the
 * 3D renderer and consumes exactly the same model, focus and route-progress inputs.
 */
const ISO_SHEAR = 0.32;
const ISO_SQUASH = 0.5;
const ISO_GAP = 430;

interface ViewBox {
  cx: number;
  cy: number;
  w: number;
}

function roundedPath(points: Pt[], radius: number) {
  if (points.length < 2) return '';
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const a = {
      x: cur.x - ((cur.x - prev.x) / (inLen || 1)) * r,
      y: cur.y - ((cur.y - prev.y) / (inLen || 1)) * r,
    };
    const b = {
      x: cur.x + ((next.x - cur.x) / (outLen || 1)) * r,
      y: cur.y + ((next.y - cur.y) / (outLen || 1)) * r,
    };
    d += ` L${a.x.toFixed(1)},${a.y.toFixed(1)} Q${cur.x.toFixed(1)},${cur.y.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last.x.toFixed(1)},${last.y.toFixed(1)}`;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export default function SvgMap(props: MapViewProps) {
  const { data, floorId, view, pieces = [], progressRef, reducedMotion, compact } = props;
  const exploded = view === 'exploded';
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 700 });
  const floorsByLevel = useMemo(
    () => [...data.floors].sort((a, b) => a.level - b.level),
    [data.floors],
  );
  const models = useMemo(
    () => new Map(floorsByLevel.map((f) => [f.id, buildFloorModel(data, f.id)])),
    [data, floorsByLevel],
  );
  const model = models.get(floorId) ?? models.values().next().value!;
  const levelIndex = useCallback(
    (id: string) =>
      Math.max(
        0,
        floorsByLevel.findIndex((f) => f.id === id),
      ),
    [floorsByLevel],
  );
  const nodesById = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);

  const project = useCallback(
    (x: number, y: number, onFloor: string): Pt => {
      if (!exploded) return { x, y };
      const h = model.floor.height;
      return { x: x + (y - h / 2) * ISO_SHEAR, y: y * ISO_SQUASH - levelIndex(onFloor) * ISO_GAP };
    },
    [exploded, model.floor.height, levelIndex],
  );

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setSize({ w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* -------------------------- view box & camera -------------------------- */

  const worldBounds = useMemo(() => {
    const points: Pt[] = [];
    const floors = exploded ? floorsByLevel : [model.floor];
    for (const f of floors) for (const [x, y] of f.outline) points.push(project(x, y, f.id));
    return boundsOf(points);
  }, [exploded, floorsByLevel, model.floor, project]);

  const fit = useCallback(
    (points: Pt[], padding = 0.06, minSize = 0): ViewBox => {
      const b = boundsOf(points);
      const aspect = size.w / size.h;
      const bw = Math.max(b.maxX - b.minX, minSize);
      const bh = Math.max(b.maxY - b.minY, minSize / aspect);
      const w = Math.max(bw * (1 + padding * 2), bh * (1 + padding * 2) * aspect);
      return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, w };
    },
    [size.w, size.h],
  );

  const [vb, setVb] = useState<ViewBox>(() => ({ cx: 700, cy: 450, w: 1500 }));
  const vbRef = useRef(vb);
  vbRef.current = vb;
  const animation = useRef<number | null>(null);

  const clamp = useCallback(
    (next: ViewBox): ViewBox => {
      const fullW = (worldBounds.maxX - worldBounds.minX) * 1.35;
      const w = Math.min(Math.max(next.w, compact ? 180 : 240), Math.max(fullW, 600));
      const margin = 120;
      return {
        w,
        cx: Math.min(worldBounds.maxX + margin, Math.max(worldBounds.minX - margin, next.cx)),
        cy: Math.min(worldBounds.maxY + margin, Math.max(worldBounds.minY - margin, next.cy)),
      };
    },
    [worldBounds, compact],
  );

  const animateTo = useCallback(
    (target: ViewBox, duration = 700) => {
      if (animation.current) cancelAnimationFrame(animation.current);
      const from = vbRef.current;
      const to = clamp(target);
      if (reducedMotion || duration === 0) {
        setVb(to);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const k = ease(t);
        setVb({
          cx: from.cx + (to.cx - from.cx) * k,
          cy: from.cy + (to.cy - from.cy) * k,
          w: from.w + (to.w - from.w) * k,
        });
        if (t < 1) animation.current = requestAnimationFrame(step);
      };
      animation.current = requestAnimationFrame(step);
    },
    [clamp, reducedMotion],
  );

  const focusKey = props.focus?.key;
  useEffect(() => {
    const focus = props.focus;
    if (focus && focus.points.length) {
      const pts = focus.points.map((p) => project(p.x, p.y, focus.floorId ?? floorId));
      animateTo(fit(pts, focus.padding ?? 0.1, focus.minSize ?? 0));
    } else {
      const floors = exploded ? floorsByLevel : [model.floor];
      const pts: Pt[] = [];
      for (const f of floors) for (const [x, y] of f.outline) pts.push(project(x, y, f.id));
      animateTo(fit(pts, 0.03));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, view, floorId, size.w, size.h]);

  useEffect(() => {
    const command = props.zoomCommand;
    if (!command) return;
    const current = vbRef.current;
    if (command.kind === 'reset') {
      const floors = exploded ? floorsByLevel : [model.floor];
      const pts: Pt[] = [];
      for (const f of floors) for (const [x, y] of f.outline) pts.push(project(x, y, f.id));
      animateTo(fit(pts, 0.03), 500);
    } else animateTo({ ...current, w: current.w * (command.kind === 'in' ? 0.68 : 1.45) }, 350);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.zoomCommand?.nonce]);

  /* -------------------------- gestures -------------------------- */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    moved: number;
    startVb: ViewBox;
    startDistance: number;
    startMid: Pt;
  } | null>(null);
  const movedRef = useRef(0);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (animation.current) cancelAnimationFrame(animation.current);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const list = [...pointers.current.values()];
    const mid =
      list.length === 2
        ? { x: (list[0].x + list[1].x) / 2, y: (list[0].y + list[1].y) / 2 }
        : list[0];
    gesture.current = {
      moved: 0,
      startVb: vbRef.current,
      startDistance:
        list.length === 2 ? Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) : 0,
      startMid: mid,
    };
    movedRef.current = 0;
    const move = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId) || !gesture.current) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.current.values()];
      const g = gesture.current;
      const unitsPerPx = g.startVb.w / size.w;
      if (pts.length >= 2 && g.startDistance > 0) {
        const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const midNow = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        const w = g.startVb.w * (g.startDistance / Math.max(1, distance));
        setVb(
          clamp({
            cx: g.startVb.cx - (midNow.x - g.startMid.x) * unitsPerPx,
            cy: g.startVb.cy - (midNow.y - g.startMid.y) * unitsPerPx,
            w,
          }),
        );
        movedRef.current = 99;
      } else {
        const dx = e.clientX - g.startMid.x;
        const dy = e.clientY - g.startMid.y;
        movedRef.current = Math.max(movedRef.current, Math.hypot(dx, dy));
        if (movedRef.current > 6)
          setVb(
            clamp({
              ...g.startVb,
              cx: g.startVb.cx - dx * unitsPerPx,
              cy: g.startVb.cy - dy * unitsPerPx,
            }),
          );
      }
    };
    const up = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size === 0) {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        gesture.current = null;
      } else {
        const remaining = [...pointers.current.values()][0];
        gesture.current = {
          moved: 0,
          startVb: vbRef.current,
          startDistance: 0,
          startMid: remaining,
        };
      }
    };
    if (pointers.current.size === 1) {
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }
  };

  const onWheel = (event: React.WheelEvent) => {
    const rect = containerRef.current!.getBoundingClientRect();
    const current = vbRef.current;
    const factor = Math.exp(event.deltaY * 0.0015);
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    const h = current.w * (size.h / size.w);
    const nextW = current.w * factor;
    const nextH = nextW * (size.h / size.w);
    setVb(
      clamp({
        w: nextW,
        cx: current.cx + px * (current.w - nextW),
        cy: current.cy + py * (h - nextH),
      }),
    );
  };

  const tap = (fn: () => void) => () => {
    if (movedRef.current <= 6) fn();
  };

  /* -------------------------- route drawing -------------------------- */

  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const flowRefs = useRef<(SVGPathElement | null)[]>([]);
  const visiblePieces = useMemo(
    () =>
      pieces
        .map((piece, index) => ({ piece, index }))
        .filter(
          ({ piece }) => exploded || (piece.kind === 'floor' ? piece.floorId === floorId : false),
        ),
    [pieces, exploded, floorId],
  );

  useEffect(() => {
    let frame = 0;
    const lengths = pathRefs.current.map((p) => (p ? p.getTotalLength() : 0));
    const draw = () => {
      const progress = progressRef?.current ?? pieces.length;
      visiblePieces.forEach(({ index }, i) => {
        const path = pathRefs.current[i];
        const flow = flowRefs.current[i];
        if (!path) return;
        const len = lengths[i] || path.getTotalLength();
        const f = Math.max(0, Math.min(1, progress - index));
        path.style.strokeDasharray = `${len} ${len + 1}`;
        path.style.strokeDashoffset = `${len * (1 - f)}`;
        path.style.opacity = f > 0 ? '1' : '0';
        if (flow) flow.style.opacity = f >= 1 ? '1' : '0';
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [visiblePieces, progressRef, pieces.length]);

  /* -------------------------- render helpers -------------------------- */

  const scale = size.w / vb.w;
  const viewH = vb.w * (size.h / size.w);
  const fontPx = compact ? 12 : Math.min(22, Math.max(12, size.w / 58));
  const fontUnits = fontPx / scale;
  const highlight = props.highlightFeatureIds ? new Set(props.highlightFeatureIds) : null;
  const routeMode = props.labelMode === 'route';
  const routeNodeIds = useMemo(
    () =>
      new Set(
        pieces.flatMap((p) =>
          p.kind === 'floor' ? p.points.map((n) => n.id) : [p.from.id, p.to.id],
        ),
      ),
    [pieces],
  );

  const floorLayer = (m: FloorModel, dimAll: boolean) => {
    const fid = m.floor.id;
    const pr = (x: number, y: number) => project(x, y, fid);
    const poly = (points: [number, number][], dy = 0) =>
      points
        .map(([x, y]) => {
          const p = pr(x, y);
          return `${p.x.toFixed(1)},${(p.y + dy).toFixed(1)}`;
        })
        .join(' ');
    const depth = exploded ? 16 : 9;
    const selectedHere = Boolean(
      props.selectedFeatureId && m.units.some((u) => u.feature.id === props.selectedFeatureId),
    );
    const showLabel = (priority: number, selected: boolean, highlighted: boolean) => {
      // The destination pin already names the selected unit.
      if (selected) return !props.destinationLabel;
      if (highlighted) return true;
      if (routeMode) return priority <= 1 && scale > 0.45;
      if (exploded) return priority <= 1 && scale > 0.45;
      if (priority === 1) return scale > 0.33;
      if (priority === 2) return scale > 0.62;
      return false;
    };
    return (
      <g key={fid} className={`svgmap-floor ${dimAll ? 'is-dim' : ''}`}>
        <polygon points={poly(m.floor.outline, exploded ? 26 : 14)} fill={mapColors.groundEdge} />
        <polygon
          points={poly(m.floor.outline)}
          fill={mapColors.ground}
          stroke={mapColors.outline}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        {m.voids.map((v) => (
          <g key={v.id}>
            <polygon points={poly(v.points)} fill={mapColors.void} />
            <polygon
              points={poly(v.points)}
              fill="none"
              stroke="#9fc3e6"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
              strokeDasharray="1 0"
            />
          </g>
        ))}
        {m.decor.map((d) => {
          const c = pr(
            d.points.reduce((s, p) => s + p[0], 0) / d.points.length,
            d.points.reduce((s, p) => s + p[1], 0) / d.points.length,
          );
          return (
            <g key={d.id} className="svgmap-atrium">
              <polygon
                points={poly(d.points)}
                fill="#e3f3ec"
                stroke="#b9dccd"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
              <ellipse
                cx={c.x}
                cy={c.y}
                rx={exploded ? 95 : 90}
                ry={exploded ? 26 : 48}
                fill={mapColors.water}
                opacity={0.85}
              />
              <ellipse
                cx={c.x}
                cy={c.y}
                rx={exploded ? 34 : 30}
                ry={exploded ? 10 : 16}
                fill="#d7f1fa"
              />
            </g>
          );
        })}
        {m.units.map((u) => {
          const selected = u.feature.id === props.selectedFeatureId;
          const highlighted = Boolean(highlight?.has(u.feature.id));
          const dim =
            (highlight && !highlighted && !selected) ||
            (selectedHere && !selected && !highlight) ||
            dimAll;
          const base = u.feature.color;
          const fill = selected ? selectedFill(base) : dim ? dimFill(base) : base;
          const lift = selected ? (exploded ? 10 : 7) : 0;
          const labelPos = pr(u.centroid.x, u.centroid.y);
          const bbox = boundsOf(u.feature.points.map(([x, y]) => ({ x, y })));
          const labelFits = u.label.length * fontUnits * 0.55 <= (bbox.maxX - bbox.minX) * 1.02;
          const interactive = Boolean(props.onSelectFeature) && (u.tenant || u.pois.length);
          return (
            <g
              key={u.feature.id}
              className={`svgmap-unit ${selected ? 'is-selected' : ''} ${highlighted ? 'is-highlight' : ''} ${interactive ? 'is-interactive' : ''}`}
              onClick={interactive ? tap(() => props.onSelectFeature?.(u.feature.id)) : undefined}
              role={interactive ? 'button' : undefined}
              aria-label={interactive ? u.label : undefined}
            >
              <polygon points={poly(u.feature.points, depth)} fill={shade(fill, -0.28)} />
              <polygon
                points={poly(u.feature.points, -lift)}
                fill={fill}
                stroke={selected ? mapColors.route : highlighted ? shade(base, -0.4) : '#ffffff'}
                strokeWidth={selected ? 3.5 : highlighted ? 2.5 : 1.5}
                vectorEffect="non-scaling-stroke"
              />
              {u.frontEdge && !exploded ? (
                <line
                  x1={u.frontEdge[0].x + (u.frontEdge[1].x - u.frontEdge[0].x) * 0.18}
                  y1={u.frontEdge[0].y + (u.frontEdge[1].y - u.frontEdge[0].y) * 0.18 - lift}
                  x2={u.frontEdge[0].x + (u.frontEdge[1].x - u.frontEdge[0].x) * 0.82}
                  y2={u.frontEdge[0].y + (u.frontEdge[1].y - u.frontEdge[0].y) * 0.82 - lift}
                  stroke={u.tenant ? shade(u.tenant.brandColor, 0.15) : '#b8c4d4'}
                  strokeWidth={Math.max(2, 5 * scale)}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  opacity={dim ? 0.35 : 0.9}
                />
              ) : null}
              {showLabel(u.priority, selected, highlighted) && (labelFits || selected) ? (
                <text
                  x={labelPos.x}
                  y={labelPos.y - lift}
                  className="svgmap-label"
                  fontSize={fontUnits * (u.priority === 1 ? 1.08 : 1)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  opacity={dim ? 0.5 : routeMode && !selected ? 0.6 : 1}
                >
                  {u.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {m.markers.map((marker) => {
          const onRoute = marker.nodeIds.some((id) => routeNodeIds.has(id));
          const visible = routeMode
            ? onRoute
            : exploded
              ? marker.priority <= 1 && scale > 0.5
              : marker.priority === 1
                ? scale > 0.3
                : scale > 0.55;
          if (!visible || dimAll) return null;
          const p = pr(marker.x, marker.y);
          const px = compact ? 26 : Math.min(40, Math.max(24, size.w / 34));
          const sizeUnits = px / scale;
          return (
            <g
              key={marker.id}
              className="svgmap-marker"
              onClick={
                props.onSelectMarker && marker.poiIds.length
                  ? tap(() => props.onSelectMarker?.(marker.poiIds, marker.nodeIds))
                  : undefined
              }
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={sizeUnits * 0.62}
                fill="#ffffff"
                stroke="#e2e8f0"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <svg
                x={p.x - sizeUnits * 0.45}
                y={p.y - sizeUnits * 0.45}
                width={sizeUnits * 0.9}
                height={sizeUnits * 0.9}
                viewBox="0 0 64 64"
                overflow="visible"
              >
                <WayIcon name={marker.icon} size={64} />
              </svg>
            </g>
          );
        })}
      </g>
    );
  };

  const floorsToDraw = exploded ? floorsByLevel.map((f) => models.get(f.id)!) : [model];
  const involvedFloors = new Set(
    pieces.flatMap((p) => (p.kind === 'floor' ? [p.floorId] : [p.fromFloorId, p.toFloorId])),
  );
  const start = props.startNodeId ? nodesById.get(props.startNodeId) : null;
  const destination = props.destinationNodeId ? nodesById.get(props.destinationNodeId) : null;
  const onDisplayedFloor = (node: RouteNode | null | undefined) =>
    Boolean(node && (exploded || node.floorId === floorId));
  const markerScale = 1 / scale;
  const activeConnectors = (props.activeConnectorNodeIds ?? [])
    .map((id) => nodesById.get(id))
    .filter((n): n is RouteNode => Boolean(n && (exploded || n.floorId === floorId)));

  const piecePoints = (piece: RoutePiece): Pt[] =>
    piece.kind === 'floor'
      ? piece.points.map((n) => project(n.x, n.y, n.floorId))
      : [
          project(piece.from.x, piece.from.y, piece.fromFloorId),
          project(piece.to.x, piece.to.y, piece.toFloorId),
        ];

  return (
    <div
      ref={containerRef}
      className={`svgmap ${exploded ? 'is-exploded' : ''}`}
      onPointerDown={onPointerDown}
      onWheel={onWheel}
    >
      <svg
        viewBox={`${vb.cx - vb.w / 2} ${vb.cy - viewH / 2} ${vb.w} ${viewH}`}
        width="100%"
        height="100%"
        role="img"
        aria-label={
          exploded ? 'All floors map' : `${model.floor.shortName} ${model.floor.theme} map`
        }
      >
        {floorsToDraw.map((m) =>
          floorLayer(m, exploded && pieces.length > 0 && !involvedFloors.has(m.floor.id)),
        )}
        {exploded
          ? floorsByLevel.map((f) => {
              const p = project(
                f.outline.reduce((min, pt) => Math.min(min, pt[0]), Infinity) - 40,
                f.height * 0.45,
                f.id,
              );
              return (
                <text
                  key={`label-${f.id}`}
                  x={p.x}
                  y={p.y}
                  className="svgmap-floor-label"
                  fontSize={fontUnits * 1.6}
                  textAnchor="end"
                >
                  {f.shortName}
                </text>
              );
            })
          : null}
        <g className="svgmap-route">
          {visiblePieces.map(({ piece }, i) => {
            const points = piecePoints(piece);
            const d =
              piece.kind === 'floor'
                ? roundedPath(points, 22)
                : `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;
            const width = compact ? 7 : 11;
            return (
              <g key={`piece-${i}`}>
                {piece.kind === 'floor' ? (
                  <path
                    d={d}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={width + 7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    opacity={0.95}
                  />
                ) : null}
                <path
                  ref={(el) => {
                    pathRefs.current[i] = el;
                  }}
                  d={d}
                  fill="none"
                  stroke={mapColors.route}
                  strokeWidth={piece.kind === 'floor' ? width : width - 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  className={piece.kind === 'vertical' ? 'svgmap-route-vertical' : undefined}
                />
                {piece.kind === 'floor' ? (
                  <path
                    ref={(el) => {
                      flowRefs.current[i] = el;
                    }}
                    d={d}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={Math.max(2, width * 0.34)}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    className={reducedMotion ? 'svgmap-flow is-static' : 'svgmap-flow'}
                  />
                ) : null}
              </g>
            );
          })}
        </g>
        {activeConnectors.map((node) => {
          const p = project(node.x, node.y, node.floorId);
          return (
            <circle
              key={`active-${node.id}`}
              cx={p.x}
              cy={p.y}
              r={36 * markerScale}
              className="svgmap-connector-pulse"
            />
          );
        })}
        {start && onDisplayedFloor(start)
          ? (() => {
              const p = project(start.x, start.y, start.floorId);
              return (
                <g
                  className="svgmap-here"
                  transform={`translate(${p.x} ${p.y}) scale(${markerScale})`}
                >
                  <circle r={30} className="svgmap-here-pulse" />
                  <circle r={17} fill="#ffffff" />
                  <circle r={12} fill={mapColors.here} />
                  <g transform="translate(0 -40)">
                    <rect
                      x={-(props.youAreHereLabel.length * 4.6 + 16)}
                      y={-17}
                      width={props.youAreHereLabel.length * 9.2 + 32}
                      height={32}
                      rx={16}
                      fill={mapColors.here}
                    />
                    <text y={5} textAnchor="middle" className="svgmap-pill-text">
                      {props.youAreHereLabel}
                    </text>
                  </g>
                </g>
              );
            })()
          : null}
        {destination && onDisplayedFloor(destination)
          ? (() => {
              const p = project(destination.x, destination.y, destination.floorId);
              const label = props.destinationLabel ?? '';
              return (
                <g
                  className="svgmap-destination"
                  transform={`translate(${p.x} ${p.y}) scale(${markerScale})`}
                >
                  <ellipse rx={26} ry={10} className="svgmap-destination-pulse" />
                  <g className={reducedMotion ? '' : 'svgmap-pin-bob'}>
                    <path
                      d="M0 -58c-15 0-26 11-26 25 0 18 26 33 26 33s26-15 26-33c0-14-11-25-26-25z"
                      fill={mapColors.destination}
                      stroke="#ffffff"
                      strokeWidth={4}
                    />
                    <circle cy={-33} r={9} fill="#ffffff" />
                  </g>
                  {label ? (
                    <g transform="translate(0 -84)">
                      <rect
                        x={-(label.length * 4.9 + 16)}
                        y={-18}
                        width={label.length * 9.8 + 32}
                        height={34}
                        rx={17}
                        fill="#ffffff"
                        stroke="#f1d6d3"
                      />
                      <text y={5} textAnchor="middle" className="svgmap-pill-text is-dark">
                        {label}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })()
          : null}
      </svg>
    </div>
  );
}
