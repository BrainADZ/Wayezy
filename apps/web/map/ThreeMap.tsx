import { Html, MapControls } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Floor, RouteNode, Snapshot } from '../../../packages/domain';
import { WayIcon } from '../icons/illustrated';
import {
  boundsOf,
  buildFloorModel,
  dimFill,
  mapColors,
  selectedFill,
  shade,
  type FloorModel,
  type MapFocus,
  type Pt,
  type RoutePiece,
  type UnitModel,
} from './model';
import type { MapViewProps } from './types';

/**
 * Lightweight 2.5D / 3D indoor map (React Three Fiber).
 *
 * Soft architectural extrusion with vertex-shaded faces (no real-time lights or shadows, so it
 * stays fast on kiosk GPUs), a fixed isometric camera (pan + zoom only, no confusing rotation),
 * progressive route drawing driven by the shared playback ref, and an exploded multi-floor view.
 */

const PITCH_FLOOR = 47;
const YAW_FLOOR = -14;
const PITCH_EXPLODED = 27;
const YAW_EXPLODED = -24;
const FOV = 30;
const SLAB = 1.4;
const UNIT_HEIGHT = 4.6;
const FLOOR_GAP = 46;
const ROUTE_Y = 0.45;

interface Frame {
  floor: Floor;
  mpu: number;
  elevation: number;
}

const toWorld = (frame: Frame, x: number, y: number): [number, number] => [
  (x - frame.floor.width / 2) * frame.mpu,
  (y - frame.floor.height / 2) * frame.mpu,
];

/* ------------------------------------------------------------------ */
/* Geometry builders                                                    */
/* ------------------------------------------------------------------ */

function shapeFrom(frame: Frame, points: [number, number][], holes: [number, number][][] = []) {
  // Shape space (sx, sy) maps to world (x, -z) after rotating the mesh −90° about X.
  const toShape = ([x, y]: [number, number]) => {
    const [wx, wz] = toWorld(frame, x, y);
    return new THREE.Vector2(wx, -wz);
  };
  const shape = new THREE.Shape(points.map(toShape));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(toShape)));
  return shape;
}

/** Bakes directional shading into vertex colours: tops are full colour, south faces lighter, west faces darker. */
function shadeVertices(geometry: THREE.BufferGeometry, topFactor = 1) {
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i++) {
    const nx = normals.getX(i);
    const ny = normals.getY(i);
    const nz = normals.getZ(i);
    let f: number;
    if (Math.abs(nz) > 0.9) f = nz > 0 ? topFactor : 0.7;
    else f = 0.8 - ny * 0.09 + nx * 0.06; // ny < 0 in shape space faces the camera (south)
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = f;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function extrude(
  frame: Frame,
  points: [number, number][],
  depth: number,
  holes: [number, number][][] = [],
  bevel = 0,
) {
  const geometry = new THREE.ExtrudeGeometry(shapeFrom(frame, points, holes), {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 1,
    curveSegments: 4,
  });
  return shadeVertices(geometry);
}

function railGeometry(frame: Frame, outline: [number, number][], height: number) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < outline.length; i++) {
    const [ax, az] = toWorld(frame, ...outline[i]);
    const [bx, bz] = toWorld(frame, ...outline[(i + 1) % outline.length]);
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 0.05) continue;
    const box = new THREE.BoxGeometry(length, height, 0.12);
    box.rotateY(-Math.atan2(bz - az, bx - ax));
    box.translate((ax + bx) / 2, height / 2, (az + bz) / 2);
    parts.push(box.index ? box.toNonIndexed() : box);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged ?? new THREE.BufferGeometry();
}

/* ------------------------------------------------------------------ */
/* Floor                                                                */
/* ------------------------------------------------------------------ */

const Unit = memo(function Unit({
  frame,
  unit,
  state,
  reducedMotion,
  onSelect,
}: {
  frame: Frame;
  unit: UnitModel;
  state: 'default' | 'selected' | 'highlight' | 'dim';
  reducedMotion: boolean;
  onSelect?: (featureId: string) => void;
}) {
  const height = unit.tenant?.anchor
    ? UNIT_HEIGHT + 0.8
    : unit.feature.kind === 'service'
      ? UNIT_HEIGHT - 0.6
      : UNIT_HEIGHT;
  const geometry = useMemo(
    () => extrude(frame, unit.feature.points, height, [], 0.08),
    [frame, unit.feature.points, height],
  );
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ vertexColors: true, color: unit.feature.color }),
    [unit.feature.color],
  );
  const group = useRef<THREE.Group>(null);
  const target = useMemo(() => {
    const base = unit.feature.color;
    const color =
      state === 'selected'
        ? selectedFill(base)
        : state === 'dim'
          ? dimFill(base)
          : state === 'highlight'
            ? shade(base, -0.06)
            : base;
    return {
      color: new THREE.Color(color),
      lift: state === 'selected' ? 1.4 : state === 'highlight' ? 0.5 : 0,
      scale: state === 'selected' ? 1.35 : 1,
    };
  }, [state, unit.feature.color]);

  const storefront = useMemo(() => {
    if (!unit.frontEdge) return null;
    const [ax, az] = toWorld(frame, unit.frontEdge[0].x, unit.frontEdge[0].y);
    const [bx, bz] = toWorld(frame, unit.frontEdge[1].x, unit.frontEdge[1].y);
    const length = Math.hypot(bx - ax, bz - az) * 0.72;
    const [cx, cz] = toWorld(
      frame,
      ...(unit.feature.points.reduce(
        (acc, p) => [
          acc[0] + p[0] / unit.feature.points.length,
          acc[1] + p[1] / unit.feature.points.length,
        ],
        [0, 0],
      ) as [number, number]),
    );
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    // Push the glass just outside the unit, away from its centre.
    const out = new THREE.Vector2(mx - cx, mz - cz).normalize().multiplyScalar(0.12);
    return { length, angle: -Math.atan2(bz - az, bx - ax), x: mx + out.x, z: mz + out.y };
  }, [frame, unit.frontEdge, unit.feature.points]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 9);
    g.position.y += (target.lift - g.position.y) * k;
    g.scale.y += (target.scale - g.scale.y) * k;
    material.color.lerp(target.color, k);
  });

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  const interactive = Boolean(onSelect && (unit.tenant || unit.pois.length));
  return (
    <group ref={group}>
      <mesh
        geometry={geometry}
        material={material}
        rotation-x={-Math.PI / 2}
        onClick={
          interactive
            ? (event: ThreeEvent<MouseEvent>) => {
                if (event.delta > 10) return;
                event.stopPropagation();
                onSelect?.(unit.feature.id);
              }
            : undefined
        }
        onPointerOver={interactive ? () => (document.body.style.cursor = 'pointer') : undefined}
        onPointerOut={interactive ? () => (document.body.style.cursor = '') : undefined}
      />
      {storefront && unit.tenant ? (
        <group position={[storefront.x, 0, storefront.z]} rotation-y={storefront.angle}>
          <mesh position={[0, 1.15, 0]}>
            <boxGeometry args={[storefront.length, 2.1, 0.16]} />
            <meshBasicMaterial
              color={state === 'dim' ? '#e3eaf2' : mapColors.glass}
              transparent
              opacity={0.85}
            />
          </mesh>
          <mesh position={[0, height - 0.55, 0]}>
            <boxGeometry args={[storefront.length, 0.7, 0.2]} />
            <meshBasicMaterial color={state === 'dim' ? '#d9dee6' : unit.tenant.brandColor} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
});

function Planters({ frame, outline }: { frame: Frame; outline: [number, number][] }) {
  const pots = useRef<THREE.InstancedMesh>(null);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const positions = useMemo(() => {
    const b = boundsOf(outline.map(([x, y]) => ({ x, y })));
    const pad = 28;
    const spots: Pt[] = [
      { x: b.minX - pad, y: b.minY - pad },
      { x: b.maxX + pad, y: b.minY - pad },
      { x: b.minX - pad, y: b.maxY + pad },
      { x: b.maxX + pad, y: b.maxY + pad },
      { x: (b.minX + b.maxX) / 2 - 90, y: b.minY - pad },
      { x: (b.minX + b.maxX) / 2 + 90, y: b.maxY + pad },
    ];
    return spots.map((s) => toWorld(frame, s.x, s.y));
  }, [frame, outline]);
  useEffect(() => {
    const m = new THREE.Matrix4();
    const green = [
      new THREE.Color('#57b87a'),
      new THREE.Color('#3f9f63'),
      new THREE.Color('#6cc48a'),
    ];
    positions.forEach(([x, z], i) => {
      m.makeTranslation(x, 0.45, z);
      pots.current?.setMatrixAt(i, m);
      m.makeScale(1, 0.85, 1).setPosition(x, 1.55, z);
      leaves.current?.setMatrixAt(i, m);
      leaves.current?.setColorAt(i, green[i % green.length]);
    });
    if (pots.current) pots.current.instanceMatrix.needsUpdate = true;
    if (leaves.current) {
      leaves.current.instanceMatrix.needsUpdate = true;
      if (leaves.current.instanceColor) leaves.current.instanceColor.needsUpdate = true;
    }
  }, [positions]);
  return (
    <>
      <instancedMesh ref={pots} args={[undefined, undefined, positions.length]}>
        <cylinderGeometry args={[0.95, 0.75, 0.9, 12]} />
        <meshBasicMaterial color="#eadfcb" />
      </instancedMesh>
      <instancedMesh ref={leaves} args={[undefined, undefined, positions.length]}>
        <icosahedronGeometry args={[1.35, 1]} />
        <meshBasicMaterial color="#ffffff" />
      </instancedMesh>
    </>
  );
}

function Atrium({ frame, model, dim }: { frame: Frame; model: FloorModel; dim: boolean }) {
  const voidOutline = model.voids[0]?.points;
  const decorOutline = model.decor[0]?.points;
  const rail = useMemo(
    () => (voidOutline ? railGeometry(frame, voidOutline, 1.15) : null),
    [frame, voidOutline],
  );
  const plaza = useMemo(
    () => (decorOutline ? extrude(frame, decorOutline, 0.25) : null),
    [frame, decorOutline],
  );
  useEffect(
    () => () => {
      rail?.dispose();
      plaza?.dispose();
    },
    [rail, plaza],
  );
  const outline = voidOutline ?? decorOutline;
  if (!outline) return null;
  const b = boundsOf(outline.map(([x, y]) => ({ x, y })));
  const [cx, cz] = toWorld(frame, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
  const rx = ((b.maxX - b.minX) / 2) * frame.mpu;
  const rz = ((b.maxY - b.minY) / 2) * frame.mpu;
  return (
    <group>
      {rail ? (
        <mesh geometry={rail}>
          <meshBasicMaterial
            color={dim ? '#e4e9ef' : '#bfdcf5'}
            transparent
            opacity={0.55}
            depthWrite={false}
          />
        </mesh>
      ) : null}
      {plaza ? (
        <>
          <mesh geometry={plaza} rotation-x={-Math.PI / 2}>
            <meshBasicMaterial vertexColors color={dim ? '#eef2f0' : '#dff2ea'} />
          </mesh>
          <mesh
            position={[cx, 0.3, cz]}
            rotation-x={-Math.PI / 2}
            scale={[rx * 0.62, rz * 0.62, 1]}
          >
            <circleGeometry args={[1, 48]} />
            <meshBasicMaterial color={dim ? '#dbe8ee' : mapColors.water} />
          </mesh>
          <mesh
            position={[cx, 0.34, cz]}
            rotation-x={-Math.PI / 2}
            scale={[rx * 0.22, rz * 0.22, 1]}
          >
            <circleGeometry args={[1, 32]} />
            <meshBasicMaterial color="#e3f6fc" />
          </mesh>
          <mesh position={[cx, 1.1, cz]}>
            <cylinderGeometry args={[0.35, 0.6, 1.6, 12]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </>
      ) : null}
      {!dim ? <Planters frame={frame} outline={outline} /> : null}
    </group>
  );
}

function Connectors({ frame, model, dim }: { frame: Frame; model: FloorModel; dim: boolean }) {
  return (
    <group>
      {model.markers
        .filter((m) => m.kind === 'connector')
        .map((m) => {
          const [x, z] = toWorld(frame, m.x, m.y);
          if (m.icon === 'lift') {
            return (
              <group key={m.id} position={[x, 0, z]}>
                <mesh position={[0, 2.2, 0]}>
                  <boxGeometry args={[3.2, 4.4, 3.2]} />
                  <meshBasicMaterial
                    color={dim ? '#e6ebf1' : '#a9d8f3'}
                    transparent
                    opacity={0.7}
                  />
                </mesh>
                <mesh position={[0, 4.45, 0]}>
                  <boxGeometry args={[3.5, 0.3, 3.5]} />
                  <meshBasicMaterial color={dim ? '#cfd6df' : '#5b6b82'} />
                </mesh>
              </group>
            );
          }
          if (m.icon === 'escalator') {
            return (
              <group key={m.id} position={[x, 0, z]}>
                {[-2.2, 2.2].map((offset) => (
                  <group key={offset} position={[0, 0, offset]}>
                    <mesh position={[0, 0.35, 0]}>
                      <boxGeometry args={[9, 0.7, 1.8]} />
                      <meshBasicMaterial color={dim ? '#e2e7ec' : '#8cc9c0'} />
                    </mesh>
                    <mesh position={[0, 0.95, 0.95]}>
                      <boxGeometry args={[9.4, 0.5, 0.18]} />
                      <meshBasicMaterial color={dim ? '#cfd6df' : '#2f4b63'} />
                    </mesh>
                    <mesh position={[0, 0.95, -0.95]}>
                      <boxGeometry args={[9.4, 0.5, 0.18]} />
                      <meshBasicMaterial color={dim ? '#cfd6df' : '#2f4b63'} />
                    </mesh>
                  </group>
                ))}
              </group>
            );
          }
          return (
            <group key={m.id} position={[x, 0, z]}>
              {[0, 1, 2].map((step) => (
                <mesh key={step} position={[step * 1.1 - 1.1, 0.35 + step * 0.35, 0]}>
                  <boxGeometry args={[1.1, 0.7 + step * 0.7, 3]} />
                  <meshBasicMaterial color={dim ? '#dde3ea' : '#6f7f96'} />
                </mesh>
              ))}
            </group>
          );
        })}
    </group>
  );
}

function FloorScene({
  frame,
  model,
  props,
  dim,
  tier,
  showLabels,
}: {
  frame: Frame;
  model: FloorModel;
  props: MapViewProps;
  dim: boolean;
  tier: number;
  showLabels: boolean;
}) {
  const holes = model.voids.map((v) => v.points);
  const slab = useMemo(() => extrude(frame, frame.floor.outline, SLAB, holes, 0), [frame, holes]);
  useEffect(() => () => slab.dispose(), [slab]);
  const group = useRef<THREE.Group>(null);
  const entered = useRef(false);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const targetY = frame.elevation;
    if (!entered.current) {
      g.position.y = props.reducedMotion || props.view === 'exploded' ? targetY : targetY - 7;
      entered.current = true;
    }
    g.position.y += (targetY - g.position.y) * (props.reducedMotion ? 1 : 1 - Math.exp(-dt * 7));
  });
  const highlight = props.highlightFeatureIds ? new Set(props.highlightFeatureIds) : null;
  const routeMode = props.labelMode === 'route';
  const routeNodes = useMemo(
    () =>
      new Set(
        (props.pieces ?? []).flatMap((p) =>
          p.kind === 'floor' ? p.points.map((n) => n.id) : [p.from.id, p.to.id],
        ),
      ),
    [props.pieces],
  );
  // Only dim neighbours on the floor that actually contains the selected unit.
  const selectedHere = Boolean(
    props.selectedFeatureId && model.units.some((u) => u.feature.id === props.selectedFeatureId),
  );

  return (
    <group ref={group}>
      <mesh geometry={slab} rotation-x={-Math.PI / 2} position={[0, -SLAB, 0]}>
        <meshBasicMaterial vertexColors color={dim ? '#f1efea' : mapColors.ground} />
      </mesh>
      <Atrium frame={frame} model={model} dim={dim} />
      {model.units.map((unit) => {
        const selected = unit.feature.id === props.selectedFeatureId;
        const highlighted = Boolean(highlight?.has(unit.feature.id));
        const state: 'default' | 'selected' | 'highlight' | 'dim' = selected
          ? 'selected'
          : highlighted
            ? 'highlight'
            : dim || (highlight && !highlighted) || (selectedHere && !selected)
              ? 'dim'
              : 'default';
        return (
          <Unit
            key={unit.feature.id}
            frame={frame}
            unit={unit}
            state={state}
            reducedMotion={Boolean(props.reducedMotion)}
            onSelect={props.onSelectFeature}
          />
        );
      })}
      <Connectors frame={frame} model={model} dim={dim} />
      {showLabels
        ? model.units.map((unit) => {
            const selected = unit.feature.id === props.selectedFeatureId;
            const highlighted = Boolean(highlight?.has(unit.feature.id));
            // When a destination pin carries the name, the unit's own label would duplicate it.
            // During a route only major anchors stay labelled (faded) as orientation landmarks.
            const visible = selected
              ? !props.destinationLabel
              : routeMode
                ? !dim && unit.priority === 1 && Boolean(unit.tenant)
                : highlighted || (!dim && unit.priority <= tier && unit.tenant);
            if (!visible) return null;
            const [x, z] = toWorld(frame, unit.centroid.x, unit.centroid.y);
            const faded = routeMode || (selectedHere && !selected) || (highlight && !highlighted);
            return (
              <Html
                key={`label-${unit.feature.id}`}
                position={[x, UNIT_HEIGHT + (selected ? 3 : 1.2), z]}
                center
                zIndexRange={[20, 0]}
                className="map3d-html"
                pointerEvents="none"
              >
                <div
                  className={`map3d-label ${unit.priority === 1 ? 'is-major' : ''} ${selected ? 'is-selected' : ''} ${faded ? 'is-faded' : ''}`}
                  data-rank={selected ? 0 : unit.priority}
                >
                  {unit.label}
                </div>
              </Html>
            );
          })
        : null}
      {showLabels
        ? model.markers.map((marker) => {
            const onRoute = marker.nodeIds.some((id) => routeNodes.has(id));
            const visible = routeMode
              ? onRoute
              : !dim && (marker.priority <= Math.max(1, tier) || tier >= 2);
            if (!visible) return null;
            const [x, z] = toWorld(frame, marker.x, marker.y);
            const clickable = Boolean(props.onSelectMarker && marker.poiIds.length);
            return (
              <Html
                key={marker.id}
                position={[x, marker.kind === 'connector' ? 5.6 : 2.4, z]}
                center
                zIndexRange={[30, 10]}
                className="map3d-html"
                pointerEvents={clickable ? 'auto' : 'none'}
              >
                <button
                  type="button"
                  className={`map3d-marker ${onRoute ? 'is-route' : ''}`}
                  aria-label={marker.label}
                  tabIndex={clickable ? 0 : -1}
                  onClick={
                    clickable
                      ? () => props.onSelectMarker?.(marker.poiIds, marker.nodeIds)
                      : undefined
                  }
                >
                  <WayIcon name={marker.icon} size="100%" />
                </button>
              </Html>
            );
          })
        : null}
      {props.view === 'exploded' ? (
        <Html
          position={[
            toWorld(frame, Math.min(...frame.floor.outline.map((p) => p[0])) + 120, 0)[0],
            3,
            toWorld(frame, 0, Math.max(...frame.floor.outline.map((p) => p[1])))[1],
          ]}
          center
          className="map3d-html"
          pointerEvents="none"
        >
          <div className={`map3d-floor-tag ${dim ? 'is-faded' : ''}`}>
            <strong>{frame.floor.shortName}</strong>
            <span>{frame.floor.theme}</span>
          </div>
        </Html>
      ) : null}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Route                                                                */
/* ------------------------------------------------------------------ */

function curveFor(points: THREE.Vector3[], radius = 2.2) {
  const path = new THREE.CurvePath<THREE.Vector3>();
  if (points.length < 2) return path;
  let cursor = points[0].clone();
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const inDir = cur.clone().sub(prev);
    const outDir = next.clone().sub(cur);
    const r = Math.min(radius, inDir.length() / 2, outDir.length() / 2);
    const a = cur.clone().sub(inDir.normalize().multiplyScalar(r));
    const b = cur.clone().add(outDir.normalize().multiplyScalar(r));
    if (a.distanceTo(cursor) > 0.01) path.add(new THREE.LineCurve3(cursor, a));
    if (r > 0.05) path.add(new THREE.QuadraticBezierCurve3(a, cur.clone(), b));
    cursor = b;
  }
  const last = points[points.length - 1];
  if (last.distanceTo(cursor) > 0.01) path.add(new THREE.LineCurve3(cursor, last.clone()));
  return path;
}

const RADIAL = 10;

function RoutePieceMesh({
  piece,
  index,
  frames,
  progressRef,
  reducedMotion,
}: {
  piece: RoutePiece;
  index: number;
  frames: Map<string, Frame>;
  progressRef?: MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  const built = useMemo(() => {
    const worldPoint = (node: RouteNode) => {
      const frame = frames.get(node.floorId)!;
      const [x, z] = toWorld(frame, node.x, node.y);
      return new THREE.Vector3(x, frame.elevation + ROUTE_Y, z);
    };
    const points =
      piece.kind === 'floor'
        ? piece.points.map(worldPoint)
        : [worldPoint(piece.from), worldPoint(piece.to)];
    const deduped = points.filter((p, i) => i === 0 || p.distanceTo(points[i - 1]) > 0.05);
    if (deduped.length < 2) return null;
    const curve =
      piece.kind === 'floor' ? curveFor(deduped) : new THREE.LineCurve3(deduped[0], deduped[1]);
    const length = curve.getLength();
    const segments = Math.max(8, Math.ceil(length * 2));
    const tube = new THREE.TubeGeometry(
      curve,
      segments,
      piece.kind === 'floor' ? 0.62 : 0.4,
      RADIAL,
      false,
    );
    let under: THREE.TubeGeometry | null = null;
    if (piece.kind === 'floor') {
      // Flatten the white casing around the route's own height so it sits just under the blue line.
      const y = deduped[0].y;
      under = new THREE.TubeGeometry(curve, segments, 1.05, RADIAL, false);
      under
        .translate(0, -y, 0)
        .scale(1, 0.22, 1)
        .translate(0, y - 0.12, 0);
    }
    return { curve, length, tube, under, segments };
  }, [piece, frames]);

  useEffect(
    () => () => {
      built?.tube.dispose();
      built?.under?.dispose();
    },
    [built],
  );

  const tubeRef = useRef<THREE.Mesh>(null);
  const underRef = useRef<THREE.Mesh>(null);
  const arrows = useRef<THREE.InstancedMesh>(null);
  const arrowCount = built ? Math.max(1, Math.floor(built.length / 7)) : 1;
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    if (!built) return;
    const progress = progressRef?.current ?? Infinity;
    const f = Math.max(0, Math.min(1, progress - index));
    const perSegment = RADIAL * 6;
    const count = Math.floor(built.segments * f) * perSegment;
    tubeRef.current?.geometry.setDrawRange(0, count);
    underRef.current?.geometry.setDrawRange(0, count);
    if (tubeRef.current) tubeRef.current.visible = f > 0;
    if (underRef.current) underRef.current.visible = f > 0;
    const mesh = arrows.current;
    if (!mesh) return;
    const offset = reducedMotion ? 0.5 : (clock.elapsedTime * 0.35) % 1;
    for (let i = 0; i < arrowCount; i++) {
      const t = (i + offset) / arrowCount;
      if (t > f || f < 1) {
        dummy.scale.setScalar(0);
      } else {
        const p = built.curve.getPointAt(Math.min(0.999, t));
        const tangent = built.curve.getTangentAt(Math.min(0.999, t));
        dummy.position.copy(p).add(new THREE.Vector3(0, 0.78, 0));
        dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
        dummy.scale.setScalar(1);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!built) return null;
  return (
    <group>
      {built.under ? (
        // A flattened, slightly lower white casing so the blue line reads against any floor colour.
        <mesh ref={underRef} geometry={built.under} renderOrder={2}>
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ) : null}
      <mesh ref={tubeRef} geometry={built.tube} renderOrder={3}>
        <meshBasicMaterial color={piece.kind === 'floor' ? mapColors.route : '#6f93ff'} />
      </mesh>
      {piece.kind === 'floor' ? (
        <instancedMesh ref={arrows} args={[undefined, undefined, arrowCount]} renderOrder={4}>
          <coneGeometry args={[0.55, 1.5, 3]} />
          <meshBasicMaterial color="#ffffff" />
        </instancedMesh>
      ) : null}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Markers                                                              */
/* ------------------------------------------------------------------ */

function HereMarker({
  position,
  label,
  reducedMotion,
}: {
  position: THREE.Vector3;
  label: string;
  reducedMotion: boolean;
}) {
  const pulse = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!pulse.current || reducedMotion) return;
    const t = (clock.elapsedTime % 1.8) / 1.8;
    pulse.current.scale.setScalar(1 + t * 2.2);
    (pulse.current.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - t);
  });
  return (
    <group position={position}>
      <mesh ref={pulse} rotation-x={-Math.PI / 2} position={[0, 0.2, 0]}>
        <ringGeometry args={[1.6, 2.4, 40]} />
        <meshBasicMaterial color={mapColors.here} transparent opacity={0.4} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[2.2, 2.2, 0.5, 32]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <cylinderGeometry args={[1.55, 1.55, 0.5, 32]} />
        <meshBasicMaterial color={mapColors.here} />
      </mesh>
      <Html
        position={[0, 4.5, 0]}
        center
        zIndexRange={[60, 40]}
        className="map3d-html"
        pointerEvents="none"
      >
        <div className="map3d-pill is-here">{label}</div>
      </Html>
    </group>
  );
}

function DestinationMarker({
  position,
  label,
  reducedMotion,
}: {
  position: THREE.Vector3;
  label?: string;
  reducedMotion: boolean;
}) {
  const pin = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (pin.current) pin.current.position.y = reducedMotion ? 6 : 6 + Math.sin(t * 2.6) * 0.45;
    if (ring.current && !reducedMotion) {
      const k = (t % 1.6) / 1.6;
      ring.current.scale.setScalar(1 + k * 1.8);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
    }
  });
  return (
    <group position={position}>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.25, 0]}>
        <ringGeometry args={[1.4, 2.1, 40]} />
        <meshBasicMaterial
          color={mapColors.destination}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>
      <group ref={pin} position={[0, 6, 0]}>
        <mesh position={[0, 1.2, 0]}>
          <sphereGeometry args={[1.75, 24, 16]} />
          <meshBasicMaterial color={mapColors.destination} />
        </mesh>
        <mesh position={[0, -1.1, 0]} rotation-x={Math.PI}>
          <coneGeometry args={[1.25, 3.2, 20]} />
          <meshBasicMaterial color="#e2463b" />
        </mesh>
        <mesh position={[0, 1.25, 1.2]}>
          <sphereGeometry args={[0.7, 16, 12]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
      {label ? (
        <Html
          position={[0, 11.5, 0]}
          center
          zIndexRange={[60, 40]}
          className="map3d-html"
          pointerEvents="none"
        >
          <div className="map3d-pill is-destination">{label}</div>
        </Html>
      ) : null}
    </group>
  );
}

function ConnectorPulse({
  position,
  reducedMotion,
}: {
  position: THREE.Vector3;
  reducedMotion: boolean;
}) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const k = reducedMotion ? 0.5 : (clock.elapsedTime % 1.2) / 1.2;
    ring.current.scale.setScalar(1 + k * 1.6);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
  });
  return (
    <mesh ref={ring} position={position} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[3, 4.2, 40]} />
      <meshBasicMaterial color="#ffb020" transparent opacity={0.8} depthWrite={false} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Camera                                                               */
/* ------------------------------------------------------------------ */

/**
 * Approved camera angles only (no free rotation): a soft isometric view for a single floor and a
 * lower, wider angle for the exploded stack so every floor and the connectors between them are visible.
 */
export function directionFor(view: 'floor' | 'exploded') {
  const pitch = THREE.MathUtils.degToRad(view === 'exploded' ? PITCH_EXPLODED : PITCH_FLOOR);
  const yaw = THREE.MathUtils.degToRad(view === 'exploded' ? YAW_EXPLODED : YAW_FLOOR);
  return new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  ).normalize();
}

function CameraRig({
  goal,
  bounds,
  direction,
  zoomCommand,
  onTier,
}: {
  goal: { target: THREE.Vector3; distance: number; key: string } | null;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; fullDistance: number };
  direction: THREE.Vector3;
  zoomCommand?: MapViewProps['zoomCommand'];
  onTier: (tier: number) => void;
}) {
  const { camera, controls } = useThree() as unknown as {
    camera: THREE.PerspectiveCamera;
    controls: {
      target: THREE.Vector3;
      update(): void;
      addEventListener(e: string, fn: () => void): void;
      removeEventListener(e: string, fn: () => void): void;
    } | null;
  };
  const active = useRef<{ target: THREE.Vector3; distance: number } | null>(null);
  const target = useRef(new THREE.Vector3());
  const distance = useRef(bounds.fullDistance);
  const dir = useRef(direction.clone());
  const initialised = useRef(false);
  const tierRef = useRef(-1);

  useEffect(() => {
    if (!goal) return;
    active.current = { target: goal.target.clone(), distance: goal.distance };
    if (!initialised.current) {
      target.current.copy(goal.target);
      distance.current = goal.distance;
      dir.current.copy(direction);
      initialised.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal?.key]);

  useEffect(() => {
    if (!zoomCommand) return;
    if (zoomCommand.kind === 'reset' && goal)
      active.current = { target: goal.target.clone(), distance: goal.distance };
    else
      active.current = {
        target: target.current.clone(),
        distance: distance.current * (zoomCommand.kind === 'in' ? 0.68 : 1.45),
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomCommand?.nonce]);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => (active.current = null);
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);

  useFrame((_, dt) => {
    if (controls && !active.current) {
      // Follow user pan/zoom, clamped to the venue.
      const t = controls.target;
      const clampedX = Math.min(bounds.maxX, Math.max(bounds.minX, t.x));
      const clampedZ = Math.min(bounds.maxZ, Math.max(bounds.minZ, t.z));
      if (clampedX !== t.x || clampedZ !== t.z) {
        const shift = new THREE.Vector3(clampedX - t.x, 0, clampedZ - t.z);
        t.add(shift);
        camera.position.add(shift);
      }
      target.current.copy(t);
      distance.current = camera.position.distanceTo(t);
    } else if (active.current) {
      const k = 1 - Math.exp(-dt * 4.2);
      target.current.lerp(active.current.target, k);
      distance.current += (active.current.distance - distance.current) * k;
      dir.current.lerp(direction, k).normalize();
      if (
        target.current.distanceTo(active.current.target) < 0.05 &&
        Math.abs(distance.current - active.current.distance) < 0.1 &&
        dir.current.distanceTo(direction) < 0.002
      )
        active.current = null;
      camera.position.copy(target.current).addScaledVector(dir.current, distance.current);
      camera.lookAt(target.current);
      if (controls) {
        controls.target.copy(target.current);
        controls.update();
      }
    }
    const ratio = distance.current / bounds.fullDistance;
    const tier = ratio < 1.08 ? 2 : ratio < 1.6 ? 1 : 0;
    if (tier !== tierRef.current) {
      tierRef.current = tier;
      onTier(tier);
    }
  });
  return null;
}

const fitCamera = new THREE.PerspectiveCamera(FOV, 1, 1, 6000);

/**
 * Exact perspective fit: binary-search the camera distance until every corner of the focus box
 * (including unit height) projects inside the viewport with the requested margin.
 */
function fitDistance(
  points: THREE.Vector3[],
  aspect: number,
  padding: number,
  minSize: number,
  direction: THREE.Vector3,
) {
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  const ys = points.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const halfW = Math.max((Math.max(...xs) - Math.min(...xs)) / 2, minSize / 2);
  const halfD = Math.max((Math.max(...zs) - Math.min(...zs)) / 2, (minSize * 0.6) / 2);
  const target = new THREE.Vector3(cx, (Math.min(...ys) + Math.max(...ys)) / 2, cz);
  const corners: THREE.Vector3[] = [];
  for (const x of [cx - halfW, cx + halfW])
    for (const z of [cz - halfD, cz + halfD])
      for (const y of [Math.min(...ys), Math.max(...ys) + UNIT_HEIGHT])
        corners.push(new THREE.Vector3(x, y, z));
  fitCamera.aspect = aspect;
  fitCamera.updateProjectionMatrix();
  const limit = 1 / (1 + padding * 2);
  const v = new THREE.Vector3();
  const fits = (distance: number) => {
    fitCamera.position.copy(target).addScaledVector(direction, distance);
    fitCamera.lookAt(target);
    fitCamera.updateMatrixWorld();
    return corners.every((corner) => {
      v.copy(corner).project(fitCamera);
      return v.z < 1 && Math.abs(v.x) <= limit && Math.abs(v.y) <= limit;
    });
  };
  let lo = 5;
  let hi = 4000;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/* ------------------------------------------------------------------ */
/* Scene                                                                */
/* ------------------------------------------------------------------ */

function Scene(props: MapViewProps) {
  const { data, view, pieces = [], reducedMotion = false } = props;
  const exploded = view === 'exploded';
  const { size } = useThree();
  const aspect = size.width / Math.max(1, size.height);
  const [tier, setTier] = useState(1);
  const floorsByLevel = useMemo(
    () => [...data.floors].sort((a, b) => a.level - b.level),
    [data.floors],
  );
  const frames = useMemo(() => {
    const map = new Map<string, Frame>();
    floorsByLevel.forEach((floor, index) =>
      map.set(floor.id, {
        floor,
        mpu: floor.metresPerUnit,
        elevation: exploded ? index * FLOOR_GAP : 0,
      }),
    );
    return map;
  }, [floorsByLevel, exploded]);
  const models = useMemo(
    () => new Map(floorsByLevel.map((f) => [f.id, buildFloorModel(data as Snapshot, f.id)])),
    [data, floorsByLevel],
  );
  const nodes = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);
  const currentFrame = frames.get(props.floorId) ?? frames.values().next().value!;
  const involved = new Set(
    pieces.flatMap((p) => (p.kind === 'floor' ? [p.floorId] : [p.fromFloorId, p.toFloorId])),
  );

  const worldOf = (node: RouteNode, lift = 0) => {
    const frame = frames.get(node.floorId)!;
    const [x, z] = toWorld(frame, node.x, node.y);
    return new THREE.Vector3(x, frame.elevation + lift, z);
  };

  const direction = useMemo(() => directionFor(view), [view]);

  const floorBounds = useMemo(() => {
    const [minX, minZ] = toWorld(currentFrame, 0, 0);
    const [maxX, maxZ] = toWorld(currentFrame, currentFrame.floor.width, currentFrame.floor.height);
    const outlinePoints = floorsByLevel.flatMap((f) => {
      const frame = frames.get(f.id)!;
      return (exploded || f.id === props.floorId ? f.outline : []).map(([x, y]) => {
        const [wx, wz] = toWorld(frame, x, y);
        return new THREE.Vector3(wx, frame.elevation, wz);
      });
    });
    return {
      minX,
      maxX,
      minZ,
      maxZ,
      fullDistance: fitDistance(outlinePoints, aspect, 0.03, 0, direction),
    };
  }, [currentFrame, floorsByLevel, frames, exploded, props.floorId, aspect, direction]);

  const goal = useMemo(() => {
    const focus: MapFocus | null | undefined = props.focus;
    let points: THREE.Vector3[];
    let key: string;
    let padding = 0.04;
    let minSize = 0;
    if (focus && focus.points.length) {
      const frame = frames.get(focus.floorId ?? props.floorId) ?? currentFrame;
      points = focus.points.map((p) => {
        const [x, z] = toWorld(frame, p.x, p.y);
        return new THREE.Vector3(x, frame.elevation, z);
      });
      if (exploded) {
        // Keep every floor in frame when exploded; bias towards the focused floor.
        for (const f of floorsByLevel)
          for (const [x, y] of f.outline) {
            const fr = frames.get(f.id)!;
            const [wx, wz] = toWorld(fr, x, y);
            points.push(new THREE.Vector3(wx, fr.elevation, wz));
          }
      }
      key = `${focus.key}-${view}-${Math.round(aspect * 100)}`;
      padding = exploded ? 0.02 : (focus.padding ?? 0.1);
      minSize = exploded ? 0 : (focus.minSize ?? 0) * currentFrame.mpu;
    } else {
      points = floorsByLevel.flatMap((f) =>
        exploded || f.id === props.floorId
          ? f.outline.map(([x, y]) => {
              const fr = frames.get(f.id)!;
              const [wx, wz] = toWorld(fr, x, y);
              return new THREE.Vector3(wx, fr.elevation, wz);
            })
          : [],
      );
      key = `floor-${props.floorId}-${view}-${Math.round(aspect * 100)}`;
      padding = 0.02;
    }
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const zs = points.map((p) => p.z);
    const target = new THREE.Vector3(
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
      (Math.min(...zs) + Math.max(...zs)) / 2,
    );
    return { target, distance: fitDistance(points, aspect, padding, minSize, direction), key };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.focus?.key, props.floorId, view, aspect, frames, direction]);

  const start = props.startNodeId ? nodes.get(props.startNodeId) : null;
  const destination = props.destinationNodeId ? nodes.get(props.destinationNodeId) : null;
  const visible = (node: RouteNode | null | undefined) =>
    Boolean(node && (exploded || node.floorId === props.floorId));
  const visiblePieces = pieces
    .map((piece, index) => ({ piece, index }))
    .filter(({ piece }) => exploded || (piece.kind === 'floor' && piece.floorId === props.floorId));
  const floorsToRender = exploded
    ? floorsByLevel
    : floorsByLevel.filter((f) => f.id === props.floorId);

  return (
    <>
      <color attach="background" args={['#eef1f5']} />
      <fog attach="fog" args={['#eef1f5', 420, 900]} />
      <MapControls
        makeDefault
        enableRotate={false}
        enableDamping
        dampingFactor={0.12}
        screenSpacePanning={false}
        minDistance={25}
        maxDistance={floorBounds.fullDistance * 2.2}
        zoomSpeed={0.8}
      />
      <CameraRig
        goal={goal}
        bounds={floorBounds}
        direction={direction}
        zoomCommand={props.zoomCommand}
        onTier={setTier}
      />
      <mesh rotation-x={-Math.PI / 2} position={[0, -SLAB - 0.4, 0]} onClick={undefined}>
        <planeGeometry args={[900, 900]} />
        <meshBasicMaterial color="#e8ecf1" />
      </mesh>
      {floorsToRender.map((floor) => {
        const frame = frames.get(floor.id)!;
        const dim = exploded && pieces.length > 0 && !involved.has(floor.id);
        return (
          <FloorScene
            key={`${floor.id}-${view}`}
            frame={frame}
            model={models.get(floor.id)!}
            props={props}
            dim={dim}
            tier={exploded ? 0 : tier}
            showLabels={!exploded || !dim}
          />
        );
      })}
      {visiblePieces.map(({ piece, index }) => (
        <RoutePieceMesh
          key={`${index}-${piece.kind}-${view}-${props.floorId}`}
          piece={piece}
          index={index}
          frames={frames}
          progressRef={props.progressRef}
          reducedMotion={reducedMotion}
        />
      ))}
      {start && visible(start) ? (
        <HereMarker
          position={worldOf(start, 0)}
          label={props.youAreHereLabel}
          reducedMotion={reducedMotion}
        />
      ) : null}
      {destination && visible(destination) ? (
        <DestinationMarker
          position={worldOf(destination, 0)}
          label={props.destinationLabel}
          reducedMotion={reducedMotion}
        />
      ) : null}
      {(props.activeConnectorNodeIds ?? [])
        .map((id) => nodes.get(id))
        .filter((n): n is RouteNode => visible(n))
        .map((node) => (
          <ConnectorPulse
            key={`pulse-${node.id}`}
            position={worldOf(node, 0.4)}
            reducedMotion={reducedMotion}
          />
        ))}
    </>
  );
}

/**
 * Screen-space label declutter. Pins, markers and higher-priority labels are placed first; a label
 * that would overlap anything already placed is hidden until the camera moves and it fits again.
 * DOM-based so it follows drei <Html> positions exactly, and cheap (~50 rects, 4× per second).
 */
function useLabelDeclutter(container: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const intersects = (a: DOMRect, b: DOMRect) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const run = () => {
      const root = container.current;
      if (!root) return;
      const placed: DOMRect[] = [];
      root
        .querySelectorAll<HTMLElement>('.map3d-pill, .map3d-marker, .map3d-floor-tag')
        .forEach((el) => placed.push(el.getBoundingClientRect()));
      const labels = [...root.querySelectorAll<HTMLElement>('.map3d-label')].sort(
        (a, b) => Number(a.dataset.rank ?? 9) - Number(b.dataset.rank ?? 9),
      );
      for (const label of labels) {
        const r = label.getBoundingClientRect();
        const padded = new DOMRect(r.x - 3, r.y - 2, r.width + 6, r.height + 4);
        const blocked = label.dataset.rank !== '0' && placed.some((p) => intersects(padded, p));
        label.classList.toggle('is-culled', blocked);
        if (!blocked) placed.push(padded);
      }
    };
    const timer = window.setInterval(run, 250);
    run();
    return () => window.clearInterval(timer);
  }, [container]);
}

export default function ThreeMap(props: MapViewProps & { onContextLost?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useLabelDeclutter(containerRef);
  return (
    <div className="map3d" ref={containerRef}>
      <Canvas
        flat
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
        camera={{ fov: FOV, near: 2, far: 2000, position: [0, 180, 160] }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            props.onContextLost?.();
          });
        }}
        aria-label={props.view === 'exploded' ? 'All floors 3D map' : '3D floor map'}
      >
        <Scene {...props} />
      </Canvas>
    </div>
  );
}
