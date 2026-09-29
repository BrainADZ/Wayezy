'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Expand, LocateFixed, Minus, Plus } from 'lucide-react';
import type { Route, Snapshot } from '../../../packages/domain';
import { placeColor, type MapPlace } from './explorer-model';
import { PlaceIcon } from './place-icon';
import { ReferenceFloor } from './reference-floor';
import { GroundFloor, type GroundFloorStatus } from './ground-floor';
import { GroundRoute } from './ground-route';
import groundModel from '../../../packages/domain/reference/ground-floor-model.json';
import { upperStores } from '../../../packages/domain/reference/upper-floor-layout';
import { referenceStores } from '../../../packages/domain/reference/reference-layout';
import elevatorIcon from '@material-design-icons/svg/outlined/elevator.svg';
import escalatorIcon from '@material-design-icons/svg/outlined/escalator.svg';
import stairsIcon from '@material-design-icons/svg/outlined/stairs.svg';
import locationIcon from '@material-design-icons/svg/outlined/location_on.svg';
import routeIcon from '@material-design-icons/svg/outlined/route.svg';
import { GroundLegendIcon } from './ground-legend-icon';

// Apply the same site projection to geometry, markers, routes and camera targets.
function originalProject(x: number, y: number) {
  const angle = (-20 * Math.PI) / 180;
  return {
    x: 750 + (x - 500) * Math.cos(angle) - (y - 350) * Math.sin(angle),
    y: 500 + (x - 500) * Math.sin(angle) + (y - 350) * Math.cos(angle),
  };
}

export function ExplorerMap({
  data,
  startNodeId,
  places,
  floorId,
  onFloorChange,
  selectedId,
  onSelect,
  route,
  stepIndex,
  panelOpen,
  focusNodeId,
  onFullscreen,
  performanceMode = false,
  matchingIds,
  searchFocusId,
}: {
  data: Snapshot;
  startNodeId?: string;
  places: MapPlace[];
  floorId: string;
  onFloorChange: (id: string) => void;
  selectedId?: string;
  onSelect: (place: MapPlace) => void;
  route: Route | null;
  stepIndex: number | null;
  panelOpen: boolean;
  focusNodeId?: string;
  onFullscreen: () => void;
  performanceMode?: boolean;
  matchingIds?: string[];
  searchFocusId?: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const groundCamera = useRef<SVGGElement>(null);
  const suppressClick = useRef(false);
  const drag = useRef<{
    x: number;
    y: number;
    cx: number;
    cy: number;
    moved: boolean;
  } | null>(null);
  const [camera, setCamera] = useState({ x: 750, y: 500, zoom: 1 });
  const cameraRef = useRef(camera);
  const wheelCommit = useRef<ReturnType<typeof setTimeout>>(undefined);
  const paintFrame = useRef(0);
  const animationFrame = useRef(0);
  const [size, setSize] = useState({ width: 1440, height: 850 });
  const arrowId = `route-arrow-${useId().replace(/:/g, '')}`;
  // Ground Floor always uses the architectural source, independent of legacy node IDs.
  const isGround = floorId === 'l0';
  const [groundBounds, setGroundBounds] = useState(groundModel.bounds);
  const [groundStatus, setGroundStatus] = useState<GroundFloorStatus>({ state: 'loading' });
  const isReference = isGround || data.nodes.some((node) => node.id === `reference-${floorId}-c-0`);
  const [connectorId, setConnectorId] = useState<string>();
  useEffect(() => setConnectorId(undefined), [floorId]);
  const project = (x: number, y: number) => (isReference ? { x, y } : originalProject(x, y));
  // A single orientation transform turns the portrait source into a landscape
  // presentation. Its own coordinates and every architectural path stay intact.
  const groundInset = {
    left: panelOpen && size.width > 720 ? 415 : 20,
    right: size.width > 720 ? 210 : 65,
    top: 14,
    bottom: 85,
  };
  const displayBounds = { width: groundBounds.height, height: groundBounds.width };
  const sourceToDisplay = (point: { x: number; y: number }) => ({
    x: point.y - groundBounds.y,
    y: groundBounds.x + groundBounds.width - point.x,
  });
  const groundScale =
    Math.max(
      displayBounds.width / Math.max(160, size.width - groundInset.left - groundInset.right),
      displayBounds.height / Math.max(160, size.height - groundInset.top - groundInset.bottom),
    ) * 1.04;
  const groundCenter = {
    x: displayBounds.width / 2 + ((groundInset.right - groundInset.left) / 2) * groundScale,
    y: displayBounds.height / 2 + ((groundInset.bottom - groundInset.top) / 2) * groundScale,
  };
  const baseWidth = isGround
    ? groundScale * size.width
    : isReference
      ? Math.max(960, (1060 * size.width) / size.height)
      : 1500;
  const width = baseWidth / camera.zoom;
  function constrainCamera(next: typeof camera) {
    const zoom = Math.max(1, Math.min(isGround ? 5 : 3, next.zoom));
    const centerX = isGround
      ? groundCenter.x
      : isReference
        ? panelOpen && size.width > 720
          ? 310
          : 470
        : 750;
    const centerY = isGround ? groundCenter.y : isReference ? 510 : 500;
    const rangeX = (isGround ? displayBounds.width / 2 : isReference ? 480 : 750) * (1 - 1 / zoom);
    const rangeY = (isGround ? displayBounds.height / 2 : isReference ? 510 : 500) * (1 - 1 / zoom);
    return {
      zoom,
      x: Math.max(centerX - rangeX, Math.min(centerX + rangeX, next.x)),
      y: Math.max(centerY - rangeY, Math.min(centerY + rangeY, next.y)),
    };
  }
  function previewCamera(next: typeof camera) {
    next = constrainCamera(next);
    cameraRef.current = next;
    if (!paintFrame.current)
      paintFrame.current = requestAnimationFrame(() => {
        paintFrame.current = 0;
        const current = cameraRef.current;
        const nextWidth = baseWidth / current.zoom;
        const nextHeight = (nextWidth * size.height) / size.width;
        if (isGround)
          groundCamera.current?.setAttribute(
            'transform',
            `translate(${groundCenter.x} ${groundCenter.y}) scale(${current.zoom}) translate(${-current.x} ${-current.y})`,
          );
        else
          svg.current?.setAttribute(
            'viewBox',
            `${current.x - nextWidth / 2} ${current.y - nextHeight / 2} ${nextWidth} ${nextHeight}`,
          );
      });
  }
  function commitCamera(next: typeof camera) {
    previewCamera(next);
    setCamera({ ...cameraRef.current });
  }
  function animateCamera(next: typeof camera) {
    cancelAnimationFrame(animationFrame.current);
    const from = { ...cameraRef.current },
      target = constrainCamera(next),
      started = performance.now();
    // Updating this architectural SVG on every animation frame repaints tens of thousands
    // of source vectors. A single camera commit keeps origin changes responsive.
    if (isGround) return commitCamera(target);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return commitCamera(target);
    const frame = (now: number) => {
      const progress = Math.min(1, (now - started) / 320),
        t = 1 - Math.pow(1 - progress, 3);
      previewCamera({
        x: from.x + (target.x - from.x) * t,
        y: from.y + (target.y - from.y) * t,
        zoom: from.zoom + (target.zoom - from.zoom) * t,
      });
      if (progress < 1) animationFrame.current = requestAnimationFrame(frame);
      else setCamera({ ...cameraRef.current });
    };
    animationFrame.current = requestAnimationFrame(frame);
  }
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);
  useEffect(
    () => () => {
      if (wheelCommit.current) clearTimeout(wheelCommit.current);
      cancelAnimationFrame(paintFrame.current);
      cancelAnimationFrame(animationFrame.current);
    },
    [],
  );
  useEffect(() => {
    cancelAnimationFrame(animationFrame.current);
    cancelAnimationFrame(paintFrame.current);
    paintFrame.current = 0;
    commitCamera({
      x: isGround
        ? groundCenter.x
        : isReference
          ? panelOpen && size.width > 720
            ? 310
            : 470
          : 750,
      y: isGround ? groundCenter.y : isReference ? 510 : 500,
      zoom: isGround ? 1.06 : 1,
    });
  }, [isReference, floorId, isGround ? groundCenter.x : 0, isGround ? groundCenter.y : 0]);
  const height = (width * size.height) / size.width;
  const floor = data.floors.find((item) => item.id === floorId) ?? data.floors[0];
  const features = data.features.filter((item) => item.floorId === floorId);
  const floorNodes = data.nodes.filter((node) => node.floorId === floorId);
  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  const start = byId.get(startNodeId ?? '');
  const selected = places.find((item) => item.id === selectedId);

  useEffect(() => {
    if (!svg.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      }),
    );
    observer.observe(svg.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isGround) return; // Legacy tenant/route coordinates are not module mappings.
    const node = data.nodes.find(
      (item) => item.id === (focusNodeId ?? selected?.nodeId) && item.floorId === floorId,
    );
    if (!node) return;
    const point = project(node.x, node.y);
    // Store selection highlights the marker without moving the visitor's map.
    if (!focusNodeId) return;
    const zoom = focusNodeId ? 1.8 : isReference ? 1.05 : 1.25;
    commitCamera({
      x: point.x - (panelOpen && size.width > 720 ? 210 / zoom : 0),
      y: point.y + (panelOpen && size.width <= 720 ? 160 / zoom : 0),
      zoom,
    });
  }, [focusNodeId, selected?.nodeId, floorId, data.nodes, panelOpen, size.width]);

  useEffect(() => {
    if (!isGround || !searchFocusId || groundStatus.state !== 'ready') return;
    const module = groundModel.modules.find((m) => m.tenantId === searchFocusId);
    const amenity = groundModel.amenities.find((a) => a.id === searchFocusId);
    const point = module
      ? {
          x: module.labelBox.x + module.labelBox.width / 2,
          y: module.labelBox.y + module.labelBox.height / 2,
        }
      : amenity
        ? { x: amenity.point[0], y: amenity.point[1] }
        : undefined;
    if (point) {
      const target = sourceToDisplay(point);
      animateCamera({
        x: target.x + ((groundInset.right - groundInset.left) * groundScale) / 4,
        y: target.y + ((groundInset.bottom - groundInset.top) * groundScale) / 4,
        zoom: 2,
      });
    }
  }, [searchFocusId, isGround, groundStatus.state]);

  useEffect(() => {
    if (!isGround || !route || groundStatus.state !== 'ready') return;
    const points = route.nodes.map(sourceToDisplay),
      xs = points.map((n) => n.x),
      ys = points.map((n) => n.y);
    const minX = Math.min(...xs) - 40,
      maxX = Math.max(...xs) + 40,
      minY = Math.min(...ys) - 55,
      maxY = Math.max(...ys) + 55;
    const routeScale = Math.max(
      (maxX - minX) / Math.max(160, size.width - groundInset.left - groundInset.right),
      (maxY - minY) / Math.max(160, size.height - groundInset.top - groundInset.bottom),
    );
    const zoom = Math.max(1.03, Math.min(3, groundScale / routeScale));
    animateCamera({
      x: (minX + maxX) / 2 + ((groundInset.right - groundInset.left) * groundScale) / (2 * zoom),
      y: (minY + maxY) / 2 + ((groundInset.bottom - groundInset.top) * groundScale) / (2 * zoom),
      zoom,
    });
  }, [route, isGround, groundStatus.state]);

  useEffect(() => {
    if (!isGround || !focusNodeId || !route) return;
    const node = route.nodes.find((n) => n.id === focusNodeId);
    if (node) {
      const point = sourceToDisplay(node);
      animateCamera({
        x: point.x + ((groundInset.right - groundInset.left) * groundScale) / 4,
        y: point.y + ((groundInset.bottom - groundInset.top) * groundScale) / 4,
        zoom: 2,
      });
    }
  }, [focusNodeId, isGround, route]);

  function zoomBy(amount: number, cursor?: { x: number; y: number }) {
    cancelAnimationFrame(animationFrame.current);
    const previous = cameraRef.current;
    const next = {
      ...cameraRef.current,
      zoom: Math.max(1, Math.min(isGround ? 5 : 3, cameraRef.current.zoom + amount)),
    };
    if (cursor) {
      next.x = cursor.x + ((previous.x - cursor.x) * previous.zoom) / next.zoom;
      next.y = cursor.y + ((previous.y - cursor.y) * previous.zoom) / next.zoom;
    }
    previewCamera(next);
    if (wheelCommit.current) clearTimeout(wheelCommit.current);
    wheelCommit.current = setTimeout(() => setCamera({ ...cameraRef.current }), 80);
  }

  return (
    <div className={`explorer-map${isGround ? ' is-ground' : ''}`}>
      <svg
        ref={svg}
        className="explorer-map-svg"
        style={{
          cursor: camera.zoom <= 1 ? 'default' : 'grab',
          background: isGround ? '#f5f1e8' : undefined,
        }}
        viewBox={
          isGround
            ? `${groundCenter.x - baseWidth / 2} ${groundCenter.y - (baseWidth * size.height) / size.width / 2} ${baseWidth} ${(baseWidth * size.height) / size.width}`
            : `${camera.x - width / 2} ${camera.y - height / 2} ${width} ${height}`
        }
        aria-label={`${floor?.name ?? 'Mall'} interactive map`}
        role="group"
        onClickCapture={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
          }
        }}
        onPointerDown={(event) => {
          if (
            event.button !== 0 ||
            !event.isPrimary ||
            cameraRef.current.zoom <= 1 ||
            (!isGround && (event.target as Element).closest('[role="button"]'))
          )
            return;
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            cx: cameraRef.current.x,
            cy: cameraRef.current.y,
            moved: false,
          };
          cancelAnimationFrame(animationFrame.current);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const dx = event.clientX - drag.current.x,
            dy = event.clientY - drag.current.y;
          if (!drag.current.moved && Math.hypot(dx, dy) < 10) return;
          if (!drag.current.moved) event.currentTarget.setPointerCapture(event.pointerId);
          drag.current.moved = true;
          const { cx, cy } = drag.current;
          const nextWidth = baseWidth / cameraRef.current.zoom;
          const nextHeight = (nextWidth * size.height) / size.width;
          previewCamera({
            ...cameraRef.current,
            x: cx - (dx * nextWidth) / size.width,
            y: cy - (dy * nextHeight) / size.height,
          });
        }}
        onPointerUp={() => {
          suppressClick.current = !!drag.current?.moved;
          setCamera({ ...cameraRef.current });
          drag.current = null;
        }}
        onPointerCancel={() => {
          setCamera({ ...cameraRef.current });
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onWheel={(event) => {
          if (drag.current) return;
          const pixels =
            event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1);
          const matrix = isGround
            ? groundCamera.current?.getScreenCTM()
            : event.currentTarget.getScreenCTM();
          const point = matrix
            ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
            : undefined;
          zoomBy(-Math.max(-100, Math.min(100, pixels)) * 0.0012, point);
        }}
      >
        {isGround ? (
          <g
            ref={groundCamera}
            className="ground-camera"
            transform={`translate(${groundCenter.x} ${groundCenter.y}) scale(${camera.zoom}) translate(${-camera.x} ${-camera.y})`}
          >
            <g
              className="ground-orientation"
              data-orientation="landscape"
              transform={`translate(${-groundBounds.y} ${groundBounds.x + groundBounds.width}) rotate(-90)`}
            >
              <GroundFloor
                onBounds={setGroundBounds}
                onStatus={setGroundStatus}
                places={places}
                selectedId={selectedId}
                matchingIds={matchingIds}
                originPoint={start ? { x: start.x, y: start.y } : undefined}
                onSelect={onSelect}
              />
              {route && groundStatus.state === 'ready' && (
                <GroundRoute route={route} stepIndex={stepIndex} />
              )}
            </g>
          </g>
        ) : (
          <>
            <defs>
              <pattern id="site-parking" width="30" height="42" patternUnits="userSpaceOnUse">
                <path d="M0 0H28V34H0" fill="none" stroke="#f8f7f3" strokeWidth="2" />
              </pattern>
              <marker
                id={arrowId}
                markerWidth="5"
                markerHeight="5"
                refX="2.5"
                refY="2.5"
                orient="auto"
              >
                <path d="M1 1L3.5 2.5L1 4" fill="none" stroke="white" strokeWidth="1" />
              </marker>
              <filter id="site-shadow">
                <feDropShadow dx="0" dy="7" stdDeviation="5" floodOpacity=".12" />
              </filter>
            </defs>
            <rect x="-5000" y="-5000" width="10000" height="10000" fill="transparent" />
            {isReference && !isGround && (
              <ReferenceFloor
                data={data}
                selectedId={selectedId}
                floorId={floorId}
                performanceMode={performanceMode}
              />
            )}
            <g transform={isReference ? undefined : 'translate(250 150) rotate(-20 500 350)'}>
              {!isReference && (
                <>
                  <g className="site-surroundings" aria-hidden="true">
                    <path
                      d="M-700 -110H1700M-700 830H1700M-180 -700V1600M1210 -700V1600"
                      fill="none"
                      stroke="#c5c9c7"
                      strokeWidth="37"
                    />
                    <path
                      d="M-700 -110H1700M-700 830H1700M-180 -700V1600M1210 -700V1600"
                      fill="none"
                      stroke="#eeefed"
                      strokeWidth="30"
                    />
                    <path d="M-700 -110H1700M-700 830H1700" stroke="#fff" strokeDasharray="15 8" />
                    <rect x="-160" y="-85" width="120" height="760" rx="28" fill="#e0dfd9" />
                    <rect x="1015" y="5" width="160" height="680" rx="30" fill="#deddd7" />
                    <rect
                      x="1015"
                      y="5"
                      width="160"
                      height="680"
                      rx="30"
                      fill="url(#site-parking)"
                    />
                    <path d="M-130 320L-55 360L-62 465L-124 507L-150 455Z" fill="#99cfdd" />
                    <path d="M380 -290H930V-170H380Z" fill="#dce9c8" />
                    <path
                      d="M-550 50H-290V240H-550ZM-550 400H-290V690H-550ZM1300 230H1630V720H1300Z"
                      fill="#e9e9e6"
                      stroke="#d8d9d4"
                    />
                    <text x="210" y="-100" className="site-street">
                      RIVER ROAD
                    </text>
                    <text x="610" y="840" className="site-street">
                      RIVERSIDE AVENUE
                    </text>
                    <text
                      x="1094"
                      y="350"
                      transform="rotate(90 1094 350)"
                      className="site-parking-label"
                    >
                      P · PARKING
                    </text>
                  </g>
                  <rect x="10" y="18" width="980" height="680" rx="100" fill="#dad8d0" />
                  <rect
                    x="10"
                    y="5"
                    width="980"
                    height="680"
                    rx="100"
                    fill="#eeefed"
                    stroke="#d8d6ce"
                    strokeWidth="5"
                    filter="url(#site-shadow)"
                  />
                  <g aria-hidden="true">
                    {Array.from({ length: 12 }, (_, index) => (
                      <g key={index}>
                        <rect
                          x={70 + index * 72}
                          y="40"
                          width="70"
                          height="58"
                          fill="#fafaf9"
                          stroke="#dfdfdb"
                        />
                        <rect
                          x={70 + index * 72}
                          y="607"
                          width="70"
                          height="48"
                          fill="#fafaf9"
                          stroke="#dfdfdb"
                        />
                      </g>
                    ))}
                    <ellipse
                      cx="470"
                      cy="195"
                      rx="108"
                      ry="78"
                      fill="#e5e3dc"
                      stroke="#fff"
                      strokeWidth="14"
                    />
                    <ellipse cx="470" cy="191" rx="61" ry="46" fill="#d3e6ec" />
                    <text x="470" y="205" textAnchor="middle" className="site-zone">
                      ATRIUM
                    </text>
                    <rect
                      x="250"
                      y="390"
                      width="168"
                      height="102"
                      rx="12"
                      fill="#e8e8e2"
                      stroke="#f7f7f5"
                      strokeWidth="10"
                    />
                    <text x="333" y="448" textAnchor="middle" className="site-zone">
                      LOUNGE
                    </text>
                  </g>
                  {data.edges
                    .filter(
                      (edge) =>
                        edge.active &&
                        byId.get(edge.fromNode)?.floorId === floorId &&
                        byId.get(edge.toNode)?.floorId === floorId,
                    )
                    .map((edge) => {
                      const a = byId.get(edge.fromNode)!,
                        b = byId.get(edge.toNode)!;
                      return (
                        <g key={edge.id}>
                          <path
                            d={`M${a.x} ${a.y}L${b.x} ${b.y}`}
                            stroke="#dedfdd"
                            strokeWidth="52"
                            strokeLinecap="round"
                          />
                          <path
                            d={`M${a.x} ${a.y}L${b.x} ${b.y}`}
                            stroke="#f9faf9"
                            strokeWidth="39"
                            strokeLinecap="round"
                          />
                        </g>
                      );
                    })}
                  {features.map((feature) => (
                    <polygon
                      key={feature.id}
                      points={feature.points.map((point) => point.join(',')).join(' ')}
                      fill={selected?.tenant?.featureId === feature.id ? '#dce7fb' : '#fff'}
                      stroke={selected?.tenant?.featureId === feature.id ? '#8fb2ed' : '#d3d5d2'}
                      strokeWidth="2"
                    />
                  ))}
                </>
              )}
              {route?.nodes.slice(1).map((node, index) => {
                const previous = route.nodes[index];
                if (node.floorId !== floorId || previous.floorId !== floorId) return null;
                const a = project(previous.x, previous.y),
                  b = project(node.x, node.y);
                return (
                  <g key={`route-${index}`} className="explorer-route-line">
                    <path
                      d={`M${a.x} ${a.y}L${b.x} ${b.y}`}
                      stroke="#fff"
                      strokeWidth="14"
                      strokeLinecap="round"
                    />
                    <path
                      d={`M${a.x} ${a.y}L${b.x} ${b.y}`}
                      stroke={stepIndex === index ? '#003f37' : '#005247'}
                      strokeWidth="8"
                      strokeLinecap="round"
                      markerMid={`url(#${arrowId})`}
                    />
                    <path
                      d={`M${(a.x + b.x) / 2} ${(a.y + b.y) / 2}l${(b.x - a.x) / 100} ${(b.y - a.y) / 100}`}
                      stroke="transparent"
                      strokeWidth="3"
                      markerEnd={`url(#${arrowId})`}
                    />
                  </g>
                );
              })}
              {floorNodes
                .filter((node) => ['lift', 'escalator', 'stairs'].includes(node.type))
                .map((node) => (
                  <g
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    className="site-connector"
                    aria-label={`View ${node.type} connections on ${floor?.name}`}
                    onClick={() => setConnectorId(node.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setConnectorId(node.id);
                      }
                    }}
                    transform={`translate(${node.x} ${node.y}) rotate(${isReference ? 0 : 20})`}
                  >
                    <circle r="18" fill="#004c40" stroke="white" strokeWidth="3" />
                    <image
                      href={
                        node.type === 'lift'
                          ? elevatorIcon
                          : node.type === 'stairs'
                            ? stairsIcon
                            : escalatorIcon
                      }
                      x={-12}
                      y={-12}
                      width={24}
                      height={24}
                      style={{ filter: 'brightness(0) invert(1)' }}
                    />
                    <text x="20" y="5" className="site-connector-label">
                      {node.type === 'lift'
                        ? 'Lift ↕'
                        : node.type === 'stairs'
                          ? 'Stairs ↕'
                          : 'Escalator ↕'}
                    </text>
                  </g>
                ))}
              {!isGround && start?.floorId === floorId && (
                <g transform={`translate(${start.x} ${start.y}) rotate(${isReference ? 0 : 20})`}>
                  <image
                    href={locationIcon}
                    x={-15}
                    y={-27}
                    width={30}
                    height={30}
                    style={{
                      filter:
                        'invert(26%) sepia(95%) saturate(3210%) hue-rotate(338deg) brightness(102%) contrast(96%)',
                    }}
                  />
                  <text x="-16" y="-27" textAnchor="end" className="site-here">
                    YOU ARE HERE
                  </text>
                </g>
              )}
            </g>
            {places
              .filter(
                (place) =>
                  !isGround &&
                  place.floorId === floorId &&
                  (place.kind === 'tenant' ||
                    selectedId === place.id ||
                    !['lift', 'escalator', 'stairs'].includes(byId.get(place.nodeId)?.type ?? '')),
              )
              .map((place) => {
                const node = byId.get(place.nodeId);
                if (!node) return null;
                const neighbours = places.filter((other) => other.nodeId === place.nodeId);
                const offset =
                  neighbours.length > 1
                    ? (neighbours.findIndex((other) => other.id === place.id) -
                        (neighbours.length - 1) / 2) *
                      66
                    : 0;
                const reference = [...referenceStores, ...upperStores].find(
                  (s) => `ref-${s.id}` === place.id,
                );
                const color = placeColor(place);
                const point = project(node.x, node.y),
                  active = selectedId === place.id;
                return (
                  <g
                    key={place.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${place.name}`}
                    className={`site-marker ${active ? 'selected' : ''}`}
                    transform={`translate(${point.x + offset} ${point.y - (active ? 46 : isReference ? 0 : 22)})`}
                    onClick={() => onSelect(place)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(place);
                      }
                    }}
                  >
                    <title>{place.name}</title>
                    <circle
                      r={active ? 30 : isReference ? 10 : 17}
                      fill={color}
                      stroke="#fff"
                      strokeWidth={isReference ? 1.5 : 3}
                    />
                    {(!performanceMode || active) && (
                      <foreignObject
                        x={active ? -16 : isReference ? -7 : -10}
                        y={active ? -16 : isReference ? -7 : -10}
                        width={active ? 32 : isReference ? 14 : 20}
                        height={active ? 32 : isReference ? 14 : 20}
                        pointerEvents="none"
                      >
                        <div className="site-pin-icon">
                          <PlaceIcon place={place} size={active ? 32 : isReference ? 14 : 20} />
                        </div>
                      </foreignObject>
                    )}
                    {active && (
                      <>
                        <path d="M-8 26L0 36L8 26" fill={color} stroke="white" strokeWidth="2" />
                        <circle cy="46" r="5" fill={color} stroke="#fff" strokeWidth="2" />
                      </>
                    )}
                    <text
                      x={active ? 42 : reference?.left ? -16 : isReference ? 16 : 25}
                      textAnchor={!active && reference?.left ? 'end' : 'start'}
                      y="4"
                      style={
                        isReference
                          ? {
                              fontSize: active ? 16 : 12,
                              fill: active ? '#555' : color,
                            }
                          : undefined
                      }
                      fill={color}
                      className="site-store-label"
                    >
                      {place.name}
                    </text>
                  </g>
                );
              })}
            {focusNodeId &&
              (() => {
                const node = byId.get(focusNodeId);
                if (!node || node.floorId !== floorId) return null;
                const point = project(node.x, node.y);
                return (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="9"
                    fill="#fff"
                    stroke="#005247"
                    strokeWidth="4"
                  />
                );
              })()}
          </>
        )}
      </svg>
      {isGround && groundStatus.state !== 'ready' && (
        <div
          className="ground-floor-status"
          role={groundStatus.state === 'error' ? 'alert' : 'status'}
        >
          {groundStatus.state === 'error' ? groundStatus.message : 'Preparing your mall directory…'}
        </div>
      )}
      {connectorId && (
        <div className="explorer-connector-card" role="region" aria-label="Floor connections">
          <button
            className="explorer-connector-close"
            aria-label="Close floor connections"
            onClick={() => setConnectorId(undefined)}
          >
            ×
          </button>
          <strong>
            {byId.get(connectorId)?.label} · {floor?.name}
          </strong>
          <small>Choose a connected floor</small>
          {data.edges
            .filter(
              (edge) =>
                edge.active &&
                !edge.restricted &&
                (edge.fromNode === connectorId ||
                  (edge.toNode === connectorId && edge.direction === 'BOTH')),
            )
            .map((edge) => {
              const target = byId.get(edge.fromNode === connectorId ? edge.toNode : edge.fromNode);
              if (!target || target.floorId === floorId) return null;
              const destination = data.floors.find((f) => f.id === target.floorId);
              return (
                <button key={edge.id} onClick={() => onFloorChange(target.floorId)}>
                  {(destination?.level ?? 0) > (floor?.level ?? 0) ? '↑' : '↓'} {destination?.name}{' '}
                  <span>{edge.type === 'lift' ? 'Step-free' : edge.type}</span>
                </button>
              );
            })}
        </div>
      )}
      <aside className="explorer-map-legend" aria-label="Map legend">
        <h3>Map guide</h3>
        {[
          ...(isGround ? [['Entry gate', locationIcon]] : []),
          ['Lift', elevatorIcon],
          ['Escalator', escalatorIcon],
          ['Stairs', stairsIcon],
          ...(isGround
            ? [
                ["Men's toilet", '/icons/way/washroom.svg'],
                ["Women's toilet", '/icons/way/washroom.svg'],
              ]
            : [['Washroom', '/icons/way/washroom.svg']]),
          ['You Are Here', locationIcon],
          ['Route', routeIcon],
        ].map(([label, icon]) => (
          <div
            key={label}
            className={label === 'You Are Here' || label === 'Route' ? 'is-accent' : ''}
          >
            <span>
              {label === 'Route' ? (
                <i className="legend-route-line" />
              ) : isGround ? (
                <GroundLegendIcon kind={label} />
              ) : (
                <img src={icon} alt="" aria-hidden="true" />
              )}
            </span>
            <strong>{label}</strong>
          </div>
        ))}
        {Array.from(
          new Map(
            places
              .filter(
                (place) =>
                  place.floorId === floorId &&
                  place.kind === 'poi' &&
                  ![
                    'Lift',
                    'Escalator',
                    'Stairs',
                    'Washroom',
                    ...(isGround ? ['Entrance'] : []),
                  ].includes(place.poi?.type ?? ''),
              )
              .map((place) => [place.poi?.type, place]),
          ).values(),
        ).map((place) => (
          <div key={place.poi?.type}>
            <span className="legend-amenity" style={{ color: placeColor(place) }}>
              {isGround && place.poi?.type === 'Entrance' ? (
                <GroundLegendIcon kind="Entrance" />
              ) : (
                <PlaceIcon place={place} size={20} />
              )}
            </span>
            <strong>{place.poi?.type.replace(/([a-z])([A-Z])/g, '$1 $2')}</strong>
          </div>
        ))}
        <p>Scroll or use + / − to zoom. Drag when zoomed in.</p>
      </aside>
      <div className="explorer-compass" aria-label="North">
        <span>N</span>
        <i aria-hidden="true" />
      </div>
      <div className="explorer-floor-controls" aria-label="Choose floor">
        {[...data.floors]
          .sort((a, b) => b.level - a.level)
          .map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Show ${item.name}`}
              aria-pressed={floorId === item.id}
              onClick={() => onFloorChange(item.id)}
            >
              <span>{item.shortName}</span>
            </button>
          ))}
      </div>
      <div className="explorer-map-controls">
        <button type="button" aria-label="Toggle fullscreen map" onClick={onFullscreen}>
          <Expand size={20} />
        </button>
        <button
          type="button"
          aria-label="Fit map"
          onClick={() =>
            commitCamera({
              x: isGround ? groundCenter.x : isReference ? 470 : 750,
              y: isGround ? groundCenter.y : isReference ? 510 : 500,
              zoom: 1,
            })
          }
        >
          <LocateFixed size={20} />
        </button>
        <div>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={camera.zoom >= (isGround ? 5 : 3)}
            onClick={() => zoomBy(0.25)}
          >
            <Plus size={22} />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            disabled={camera.zoom <= 1}
            onClick={() => zoomBy(-0.25)}
          >
            <Minus size={22} />
          </button>
        </div>
      </div>
      <div className="explorer-map-brand">
        WAY<span>EZY</span>
        <small>
          {isGround
            ? 'Grand View High Street · Ground Floor'
            : isReference
              ? 'Reference layout · illustrative routes'
              : 'Riverside indoor map'}
        </small>
      </div>
      <div className="explorer-floor-caption">{floor?.name}</div>
    </div>
  );
}
