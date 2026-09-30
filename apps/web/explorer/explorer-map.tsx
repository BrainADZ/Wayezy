'use client';

import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
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

type Point = { x: number; y: number };
type Camera = Point & { zoom: number; bearing: number };

function rotatePoint(point: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180,
    cos = Math.cos(radians),
    sin = Math.sin(radians);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

function normalizeBearing(degrees: number) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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
  navigationMode = false,
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
  navigationMode?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const groundCamera = useRef<SVGGElement>(null);
  const compass = useRef<HTMLButtonElement>(null);
  const suppressClick = useRef(false);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{
    start: Camera;
    anchor: Point;
    origin: Point;
    distance: number;
    angle: number;
    rotating: boolean;
    moved: boolean;
  } | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 750, y: 500, zoom: 1, bearing: 0 });
  // The live camera. `committed` is what the SVG itself currently renders; while a gesture
  // or animation runs, the difference is shown as a GPU transform on the stage, so the
  // heavy architectural SVG is repainted once per gesture instead of on every frame.
  const cameraRef = useRef(camera);
  const committed = useRef(camera);
  const userAdjusted = useRef(false);
  const navigationKey = useRef('');
  const [recenterNonce, setRecenterNonce] = useState(0);
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
  const maxZoom = isGround ? 6 : 3;
  // Phones can turn the plan with two fingers and navigation turns it heading-up; the stage
  // is then a square covering the viewport diagonal so no blank corners show mid-rotation.
  const rotatable = isGround && (navigationMode || size.width < 720);
  const stageWidth = isGround
    ? rotatable
      ? Math.ceil(Math.hypot(size.width, size.height)) + 24
      : Math.ceil(size.width * 1.3)
    : size.width;
  const stageHeight = isGround
    ? rotatable
      ? stageWidth
      : Math.ceil(size.height * 1.3)
    : size.height;
  // Map units per CSS pixel at zoom 1.
  const unitsPerPixel = isGround ? groundScale : baseWidth / size.width;
  const groundTransform = (current: Camera) =>
    `translate(${groundCenter.x} ${groundCenter.y}) rotate(${-current.bearing}) scale(${current.zoom}) translate(${-current.x} ${-current.y})`;
  const viewBoxFor = (current: Camera) => {
    const w = baseWidth / current.zoom,
      h = (w * size.height) / size.width;
    return `${current.x - w / 2} ${current.y - h / 2} ${w} ${h}`;
  };
  // Screen points are CSS pixels relative to the centre of the map viewport.
  const screenToMap = (screen: Point, current: Camera): Point => {
    const turned = rotatePoint(screen, current.bearing);
    return {
      x: current.x + (turned.x * unitsPerPixel) / current.zoom,
      y: current.y + (turned.y * unitsPerPixel) / current.zoom,
    };
  };
  // The camera that shows map point `anchor` at screen point `screen`.
  const cameraFor = (anchor: Point, screen: Point, zoom: number, bearing: number): Camera => {
    const turned = rotatePoint(screen, bearing);
    return {
      x: anchor.x - (turned.x * unitsPerPixel) / zoom,
      y: anchor.y - (turned.y * unitsPerPixel) / zoom,
      zoom,
      bearing,
    };
  };
  function constrainCamera(next: Camera): Camera {
    const zoom = clamp(next.zoom, 1, maxZoom);
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
      x: clamp(next.x, centerX - rangeX, centerX + rangeX),
      y: clamp(next.y, centerY - rangeY, centerY + rangeY),
      bearing: rotatable ? normalizeBearing(next.bearing) : 0,
    };
  }
  function paint(current: Camera) {
    if (isGround) {
      // Express the live camera relative to the rendered one as a compositor-only transform.
      const base = committed.current,
        shift = rotatePoint({ x: base.x - current.x, y: base.y - current.y }, -current.bearing),
        pixels = current.zoom / groundScale;
      if (stage.current)
        stage.current.style.transform = `translate3d(${shift.x * pixels}px, ${shift.y * pixels}px, 0) rotate(${base.bearing - current.bearing}deg) scale(${current.zoom / base.zoom})`;
    } else svg.current?.setAttribute('viewBox', viewBoxFor(current));
    if (compass.current) compass.current.style.transform = `rotate(${-current.bearing}deg)`;
  }
  function previewCamera(next: Camera) {
    cameraRef.current = constrainCamera(next);
    if (!paintFrame.current)
      paintFrame.current = requestAnimationFrame(() => {
        paintFrame.current = 0;
        paint(cameraRef.current);
      });
  }
  function commitCamera(next?: Camera) {
    if (next) cameraRef.current = constrainCamera(next);
    cancelAnimationFrame(paintFrame.current);
    paintFrame.current = 0;
    const current = cameraRef.current;
    committed.current = current;
    // Render the SVG at the final camera and drop the stage transform in the same frame.
    if (isGround) {
      groundCamera.current?.setAttribute('transform', groundTransform(current));
      if (stage.current) stage.current.style.transform = '';
    } else svg.current?.setAttribute('viewBox', viewBoxFor(current));
    if (compass.current) compass.current.style.transform = `rotate(${-current.bearing}deg)`;
    setCamera(current);
  }
  function animateCamera(next: Camera, duration = 480) {
    cancelAnimationFrame(animationFrame.current);
    const from = { ...cameraRef.current },
      target = constrainCamera(next),
      turn = normalizeBearing(target.bearing - from.bearing),
      started = performance.now();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return commitCamera(target);
    const frame = (now: number) => {
      const progress = Math.min(1, (now - started) / duration),
        t = 1 - Math.pow(1 - progress, 3);
      if (progress >= 1) return commitCamera(target);
      cameraRef.current = {
        x: from.x + (target.x - from.x) * t,
        y: from.y + (target.y - from.y) * t,
        zoom: from.zoom * Math.pow(target.zoom / from.zoom, t),
        bearing: from.bearing + turn * t,
      };
      paint(cameraRef.current);
      animationFrame.current = requestAnimationFrame(frame);
    };
    animationFrame.current = requestAnimationFrame(frame);
  }
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
      bearing: 0,
    });
  }, [isReference, floorId, isGround ? groundCenter.x : 0, isGround ? groundCenter.y : 0]);
  const floor = data.floors.find((item) => item.id === floorId) ?? data.floors[0];
  const features = data.features.filter((item) => item.floorId === floorId);
  const floorNodes = data.nodes.filter((node) => node.floorId === floorId);
  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  const start = byId.get(startNodeId ?? '');
  const selected = places.find((item) => item.id === selectedId);

  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height),
      }),
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  // Pinching the map must never zoom the whole page (iOS Safari ignores touch-action alone).
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const block = (event: Event) => event.preventDefault();
    const blockPinch = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };
    element.addEventListener('gesturestart', block);
    element.addEventListener('gesturechange', block);
    element.addEventListener('touchstart', blockPinch, { passive: false });
    element.addEventListener('touchmove', blockPinch, { passive: false });
    return () => {
      element.removeEventListener('gesturestart', block);
      element.removeEventListener('gesturechange', block);
      element.removeEventListener('touchstart', blockPinch);
      element.removeEventListener('touchmove', blockPinch);
    };
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
      bearing: 0,
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
        bearing: 0,
      });
    }
  }, [searchFocusId, isGround, groundStatus.state]);

  useEffect(() => {
    if (!isGround || !route || navigationMode || groundStatus.state !== 'ready') return;
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
      bearing: 0,
    });
  }, [route, isGround, navigationMode, groundStatus.state, size.width, size.height]);

  useEffect(() => {
    if (!isGround || !focusNodeId || !route || navigationMode) return;
    const node = route.nodes.find((n) => n.id === focusNodeId);
    if (node) {
      const point = sourceToDisplay(node);
      animateCamera({
        x: point.x + ((groundInset.right - groundInset.left) * groundScale) / 4,
        y: point.y + ((groundInset.bottom - groundInset.top) * groundScale) / 4,
        zoom: 2,
        bearing: 0,
      });
    }
  }, [focusNodeId, isGround, route, navigationMode, size.width, size.height]);

  // Turn-by-turn: zoom in on the current step and turn the plan so the walking direction
  // points up. Re-frames on every step change; a manual pan/pinch is kept until then.
  useEffect(() => {
    if (!isGround || !navigationMode || !route || groundStatus.state !== 'ready') {
      navigationKey.current = '';
      return;
    }
    const key = `${route.nodes.map((n) => n.id).join()}|${stepIndex}|${recenterNonce}`;
    if (key !== navigationKey.current) {
      navigationKey.current = key;
      userAdjusted.current = false;
    } else if (userAdjusted.current) return;
    const index = clamp(stepIndex ?? 0, 0, Math.max(0, route.steps.length - 1));
    const previousId = index === 0 ? route.nodes[0].id : route.steps[index - 1]?.nodeId;
    const from = Math.max(
      0,
      route.nodes.findIndex((n) => n.id === previousId),
    );
    const to = Math.max(
      from + 1,
      route.nodes.findIndex((n) => n.id === route.steps[index]?.nodeId),
    );
    let leg = route.nodes.slice(from, to + 1).map(sourceToDisplay);
    if (leg.length < 2 && from > 0)
      leg = route.nodes.slice(from - 1, from + 1).map(sourceToDisplay);
    const origin = leg[0];
    if (!origin) return;
    const total = leg
      .slice(1)
      .reduce((sum, p, i) => sum + Math.hypot(p.x - leg[i].x, p.y - leg[i].y), 0);
    const ahead =
      leg.find((p) => Math.hypot(p.x - origin.x, p.y - origin.y) > total * 0.35) ?? leg.at(-1)!;
    const bearing =
      total > 0
        ? (Math.atan2(ahead.y - origin.y, ahead.x - origin.x) * 180) / Math.PI + 90
        : cameraRef.current.bearing;
    // Keep the step clear of the guidance card above and the controls dock below.
    const spare = Math.max(0, size.height - 200);
    const top = Math.min(200, spare / 2),
      bottom = Math.min(200, spare / 2),
      side = Math.min(56, size.width / 6);
    const local = leg.map((p) => rotatePoint({ x: p.x - origin.x, y: p.y - origin.y }, -bearing));
    const minX = Math.min(...local.map((p) => p.x)),
      maxX = Math.max(...local.map((p) => p.x)),
      minY = Math.min(...local.map((p) => p.y)),
      maxY = Math.max(...local.map((p) => p.y));
    const availableWidth = Math.max(120, size.width - side * 2),
      availableHeight = Math.max(120, size.height - top - bottom);
    const zoom = clamp(
      Math.min(
        (availableWidth * groundScale) / Math.max(1, maxX - minX),
        (availableHeight * groundScale) / Math.max(1, maxY - minY),
      ),
      2.8,
      4.8,
    );
    const pixels = zoom / groundScale;
    // Centre the step in the free area, but never let the walker's position leave it.
    const screen = {
      x: clamp(-((minX + maxX) / 2) * pixels, -size.width / 2 + side, size.width / 2 - side),
      y: clamp(
        (top - bottom) / 2 - ((minY + maxY) / 2) * pixels,
        -size.height / 2 + top + 28,
        size.height / 2 - bottom - 28,
      ),
    };
    animateCamera(cameraFor(origin, screen, zoom, bearing), 650);
  }, [
    isGround,
    navigationMode,
    route,
    stepIndex,
    recenterNonce,
    groundStatus.state,
    size.width,
    size.height,
  ]);

  function zoomAt(factor: number, screen: Point = { x: 0, y: 0 }) {
    cancelAnimationFrame(animationFrame.current);
    userAdjusted.current = true;
    const previous = cameraRef.current;
    const zoom = clamp(previous.zoom * factor, 1, maxZoom);
    previewCamera(cameraFor(screenToMap(screen, previous), screen, zoom, previous.bearing));
    if (wheelCommit.current) clearTimeout(wheelCommit.current);
    wheelCommit.current = setTimeout(() => commitCamera(), 140);
  }
  function zoomStep(factor: number) {
    userAdjusted.current = true;
    const current = cameraRef.current;
    animateCamera({ ...current, zoom: clamp(current.zoom * factor, 1, maxZoom) }, 300);
  }
  function screenPoint(event: { clientX: number; clientY: number }): Point {
    const rect = root.current!.getBoundingClientRect();
    return {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2,
    };
  }
  // (Re)start a gesture from the current pointers, so lifting or adding a finger never jumps.
  function beginGesture(moved: boolean) {
    const [a, b] = [...pointers.current.values()];
    if (!a) {
      gesture.current = null;
      return;
    }
    const centre = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a;
    gesture.current = {
      start: { ...cameraRef.current },
      anchor: screenToMap(centre, cameraRef.current),
      origin: centre,
      distance: b ? Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) : 0,
      angle: b ? (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI : 0,
      rotating: false,
      moved: moved || !!b,
    };
  }
  function endPointer(event: PointerEvent) {
    if (!pointers.current.delete(event.pointerId)) return;
    const moved = !!gesture.current?.moved;
    if (pointers.current.size) return beginGesture(moved);
    gesture.current = null;
    suppressClick.current = moved && event.type === 'pointerup';
    if (moved) commitCamera();
  }

  return (
    <div ref={root} className={`explorer-map${isGround ? ' is-ground' : ''}`}>
      <div
        className="explorer-map-gestures"
        onClickCapture={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
          }
        }}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          if (
            !isGround &&
            !pointers.current.size &&
            (event.target as Element).closest('[role="button"]')
          )
            return;
          if (!pointers.current.size) suppressClick.current = false;
          cancelAnimationFrame(animationFrame.current);
          pointers.current.set(event.pointerId, screenPoint(event));
          beginGesture(!!gesture.current?.moved);
        }}
        onPointerMove={(event) => {
          if (!pointers.current.has(event.pointerId)) return;
          pointers.current.set(event.pointerId, screenPoint(event));
          const current = gesture.current;
          if (!current) return;
          const [a, b] = [...pointers.current.values()];
          const centre = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a;
          if (
            !current.moved &&
            Math.hypot(centre.x - current.origin.x, centre.y - current.origin.y) < 8
          )
            return;
          current.moved = true;
          userAdjusted.current = true;
          if (!event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.setPointerCapture(event.pointerId);
          let zoom = current.start.zoom,
            bearing = current.start.bearing;
          if (b) {
            zoom = (current.start.zoom * Math.hypot(b.x - a.x, b.y - a.y)) / current.distance;
            if (rotatable) {
              // A small dead zone keeps a plain pinch from twisting the map.
              const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
              let turn = normalizeBearing(angle - current.angle);
              if (!current.rotating && Math.abs(turn) > 14) {
                current.rotating = true;
                current.angle += Math.sign(turn) * 14;
                turn = normalizeBearing(angle - current.angle);
              }
              if (current.rotating) bearing = current.start.bearing - turn;
            }
          }
          zoom = clamp(zoom, 1, maxZoom);
          previewCamera(cameraFor(current.anchor, centre, zoom, bearing));
        }}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onWheel={(event) => {
          if (pointers.current.size) return;
          const pixels =
            event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1);
          zoomAt(Math.exp(-clamp(pixels, -100, 100) * 0.0018), screenPoint(event));
        }}
      >
        <div
          ref={stage}
          className="explorer-map-stage"
          style={
            isGround
              ? {
                  width: stageWidth,
                  height: stageHeight,
                  left: (size.width - stageWidth) / 2,
                  top: (size.height - stageHeight) / 2,
                }
              : undefined
          }
        >
          <svg
            ref={svg}
            className="explorer-map-svg"
            style={{
              cursor: camera.zoom <= 1 ? 'default' : 'grab',
              background: isGround ? '#f5f1e8' : undefined,
            }}
            viewBox={
              isGround
                ? `${groundCenter.x - (groundScale * stageWidth) / 2} ${groundCenter.y - (groundScale * stageHeight) / 2} ${groundScale * stageWidth} ${groundScale * stageHeight}`
                : viewBoxFor(camera)
            }
            aria-label={`${floor?.name ?? 'Mall'} interactive map`}
            role="group"
          >
            {isGround ? (
              <g ref={groundCamera} className="ground-camera" transform={groundTransform(camera)}>
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
                        <path
                          d="M-700 -110H1700M-700 830H1700"
                          stroke="#fff"
                          strokeDasharray="15 8"
                        />
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
                          stroke={
                            selected?.tenant?.featureId === feature.id ? '#8fb2ed' : '#d3d5d2'
                          }
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
                    <g
                      transform={`translate(${start.x} ${start.y}) rotate(${isReference ? 0 : 20})`}
                    >
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
                        !['lift', 'escalator', 'stairs'].includes(
                          byId.get(place.nodeId)?.type ?? '',
                        )),
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
                            <path
                              d="M-8 26L0 36L8 26"
                              fill={color}
                              stroke="white"
                              strokeWidth="2"
                            />
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
        </div>
      </div>
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
        <p>Scroll, pinch or use + / − to zoom. Drag to move.</p>
      </aside>
      <button
        ref={compass}
        type="button"
        className="explorer-compass"
        aria-label="North — turn map north up"
        style={{ transform: `rotate(${-camera.bearing}deg)` }}
        onClick={() => {
          userAdjusted.current = true;
          animateCamera({ ...cameraRef.current, bearing: 0 }, 360);
        }}
      >
        <span>N</span>
        <i aria-hidden="true" />
      </button>
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
          aria-label={navigationMode && isGround ? 'Recentre on my route' : 'Fit map'}
          onClick={() => {
            if (navigationMode && isGround) return setRecenterNonce((n) => n + 1);
            animateCamera({
              x: isGround ? groundCenter.x : isReference ? 470 : 750,
              y: isGround ? groundCenter.y : isReference ? 510 : 500,
              zoom: 1,
              bearing: 0,
            });
          }}
        >
          <LocateFixed size={20} />
        </button>
        <div>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={camera.zoom >= maxZoom}
            onClick={() => zoomStep(1.45)}
          >
            <Plus size={22} />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            disabled={camera.zoom <= 1}
            onClick={() => zoomStep(1 / 1.45)}
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
