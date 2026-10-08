import { useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import '../styles/go.css';
import '../styles/explorer.css';
import {
  openState,
  zonedParts,
  type Poi,
  type Snapshot,
  type Tenant,
} from '../../../packages/domain';
import { findRoute } from '../../../packages/routing';
import { findDirectoryRoute } from '../../../packages/routing/ground-directory';
import { directoryFloorIds } from '../../../packages/domain/reference/directory-route-graph';
import { groundPublicData } from '../explorer/ground-public-data';
import { search } from '../../../packages/search';
import { Logo } from '../brand/Logo';
import { CentreLogo } from '../brand/CentreLogo';
import { Glyph } from '../icons/glyphs';
import { poiIcon, WayIcon } from '../icons/illustrated';
import { stepGlyph, stepPieceIndex } from '../kiosk/RoutePanel';
import { FloorSwitcher, MapRenderer } from '../map/MapRenderer';
import { ExplorerMap } from '../explorer/explorer-map';
import { mapPlaces } from '../explorer/explorer-model';
import { focusOnPoints, routePieces } from '../map/model';
import type { MapMode, MapView, ZoomCommand } from '../map/types';
import { useRoutePlayback } from '../map/useRoutePlayback';
import { analytics } from '../shared/analytics';
import { ApiError, api, get } from '../shared/api';
import { useContent } from '../shared/content';
import { formatTime, usePrefersReducedMotion } from '../shared/hooks';
import { useI18n } from '../shared/i18n';
import { EmptyState, HeroArt, LogoTile, OpenBadge } from '../shared/ui';

interface RouteRequest {
  startNodeId: string;
  destinationId: string;
  accessible: boolean;
  deviceId: string;
  signed: boolean;
}

type Resolution =
  | { status: 'loading' }
  | { status: 'ready'; request: RouteRequest }
  | { status: 'expired' }
  | { status: 'invalid' }
  | { status: 'browse' };

function useRouteRequest(data: Snapshot | null, allowUnsigned: boolean | undefined): Resolution {
  const [resolution, setResolution] = useState<Resolution>({ status: 'loading' });
  useEffect(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const tokenMatch = path.match(/^\/go\/r\/([\w-]+\.[\w-]+)$/);
    if (tokenMatch) {
      get<{ startNodeId: string; destinationId: string; accessible: boolean; deviceId: string }>(
        `/api/route-tokens/${tokenMatch[1]}`,
      )
        .then((r) => setResolution({ status: 'ready', request: { ...r, signed: true } }))
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 410)
            setResolution({ status: 'expired' });
          else if (error instanceof ApiError && error.status === 0)
            setResolution({ status: 'invalid' });
          else setResolution({ status: 'invalid' });
        });
      return;
    }
    const destination = params.get('d') ?? params.get('destination');
    if (destination && data) {
      if (allowUnsigned === false) {
        setResolution({ status: 'invalid' });
        return;
      }
      const device = data.devices.find((d) => d.id === params.get('dev')) ?? data.devices[0];
      const start = params.get('s');
      setResolution({
        status: 'ready',
        request: {
          destinationId: destination,
          startNodeId:
            start && (data.nodes.some((n) => n.id === start) || start.startsWith('ground-entry-'))
              ? start
              : destination.startsWith('ground-')
                ? 'ground-entry-starbucks'
                : device.routeStartNode,
          accessible: params.get('a') === '1',
          deviceId: device.id,
          signed: false,
        },
      });
      return;
    }
    if (data) setResolution({ status: 'browse' });
  }, [data, allowUnsigned]);
  return resolution;
}

export default function GoApp() {
  const { data, config, status, online } = useContent();
  const { t } = useI18n();
  const resolution = useRouteRequest(data, config?.allowUnsignedDeepLinks);
  const [override, setOverride] = useState<RouteRequest | null>(null);
  const groundData = useMemo(() => (data ? groundPublicData(data) : null), [data]);

  useEffect(() => {
    document.documentElement.classList.add('go-root');
    document.title = 'WAY EZY GO';
    return () => document.documentElement.classList.remove('go-root');
  }, []);
  useEffect(() => {
    analytics.configure({ app: 'go', deviceId: '' });
    analytics.newSession();
  }, []);

  if (!data) {
    return (
      <div className="go-shell go-center">
        <Logo height={44} product="GO" />
        {status === 'error' ? (
          <EmptyState
            icon="map"
            title="Directory unavailable"
            body="Check your connection and try again."
          />
        ) : (
          <span className="splash-loader" />
        )}
      </div>
    );
  }
  const request = override ?? (resolution.status === 'ready' ? resolution.request : null);
  const routeData = groundData ?? data;
  if (request)
    return (
      <GoRoute
        key={`${request.destinationId}-${request.startNodeId}`}
        data={routeData}
        request={request}
        online={online}
        onChangeDestination={() => window.location.assign('/go')}
        onPick={setOverride}
      />
    );
  if (resolution.status === 'loading') {
    return (
      <div className="go-shell go-center">
        <Logo height={44} product="GO" />
        <span className="splash-loader" />
      </div>
    );
  }
  return (
    <GoBrowse
      data={groundData ?? data}
      notice={
        resolution.status === 'expired'
          ? { title: t('go.expired.title'), body: t('go.expired.body') }
          : resolution.status === 'invalid'
            ? { title: t('go.invalid.title'), body: t('go.expired.body') }
            : null
      }
      onPick={setOverride}
    />
  );
}

function GoHeader({ onShare, onMinimize }: { onShare?: () => void; onMinimize?: () => void }) {
  return (
    <header className="go-header">
      <a href="/go" className="go-brand" aria-label="IREO Boulevard directory home">
        <CentreLogo className="go-centre-logo" />
        <span className="go-product">GO</span>
      </a>
      <span className="go-venue">WAY EZY</span>
      {onMinimize ? (
        <button
          type="button"
          className="go-icon-btn go-minimise-btn"
          onClick={onMinimize}
          aria-label="Minimise map and show place details"
        >
          <Glyph name="compress" size={18} />
          <span>Minimise</span>
        </button>
      ) : null}
      {onShare ? (
        <button
          type="button"
          className="go-icon-btn"
          onClick={onShare}
          aria-label="Share this route"
        >
          <Glyph name="share" size={20} />
        </button>
      ) : null}
    </header>
  );
}

function GoBrowse({
  data,
  notice,
  onPick,
}: {
  data: Snapshot;
  notice: { title: string; body: string } | null;
  onPick: (request: RouteRequest) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const groundDevice = data.devices.find((device) => device.floorId === 'l0');
  const starts = data.nodes
    .filter((node) => node.id.startsWith('ground-entry-'))
    .map((node) => ({
      id: node.id,
      label: node.label,
      deviceId: groundDevice?.id ?? data.devices[0]?.id ?? '',
    }));
  const [startId, setStartId] = useState(starts[0]?.id ?? '');
  const start = starts.find((item) => item.id === startId) ?? starts[0];
  const results = useMemo(
    () => (query.trim() ? search(data, query).slice(0, 12) : []),
    [data, query],
  );
  const brands = data.tenants
    .filter((tenant) => tenant.status !== 'HIDDEN')
    .sort((a, b) => a.name.localeCompare(b.name));
  const pick = (destinationId: string) => {
    if (!start) return;
    onPick({
      destinationId,
      startNodeId: start.id,
      accessible: false,
      deviceId: start.deviceId,
      signed: false,
    });
  };
  return (
    <div className="go-shell">
      <GoHeader />
      <main className="go-browse">
        {notice ? (
          <div className="go-notice" role="alert">
            <WayIcon name="qr" size={44} />
            <div>
              <strong>{notice.title}</strong>
              <span>{notice.body}</span>
            </div>
          </div>
        ) : null}
        <div className="go-browse-intro">
          <span>IREO BOULEVARD DIRECTORY</span>
          <h1>Find your way around</h1>
          <p>Discover the brands on our map and get directions from an entrance.</p>
        </div>
        <label className="go-search">
          <Glyph name="search" size={22} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
          />
        </label>
        <label className="go-start">
          <span>{t('go.chooseStart')}</span>
          <select value={start?.id ?? ''} onChange={(e) => setStartId(e.target.value)}>
            {starts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <div className="go-list-heading">
          <strong>{query.trim() ? 'Search results' : 'Brands on the map'}</strong>
          <span>{query.trim() ? results.length : brands.length} places</span>
        </div>
        <div className="go-list">
          {(query.trim()
            ? results.map((r) => ({ id: r.id, kind: r.kind }))
            : brands.map((p) => ({ id: p.id, kind: 'tenant' as const }))
          ).map(({ id, kind }) => {
            const tenant = kind === 'tenant' ? data.tenants.find((x) => x.id === id) : null;
            const poi = kind === 'poi' ? data.pois.find((x) => x.id === id) : null;
            const floor = data.floors.find((f) => f.id === (tenant?.floorId ?? poi?.floorId));
            return (
              <button key={id} type="button" className="go-list-row" onClick={() => pick(id)}>
                {tenant ? (
                  <LogoTile tenant={tenant} size={44} />
                ) : (
                  <WayIcon name={poi ? poiIcon[poi.type] : 'information'} size={44} />
                )}
                <span>
                  <strong>{tenant?.name ?? poi?.name}</strong>
                  <small>
                    {tenant?.subcategory ?? poi?.description} · {floor?.shortName}
                  </small>
                </span>
                <Glyph name="chevronRight" size={20} />
              </button>
            );
          })}
          {query.trim() && !results.length ? (
            <EmptyState
              icon="search"
              title={t('search.none.title', { query })}
              body={t('search.none.body')}
            />
          ) : null}
        </div>
      </main>
      <footer className="go-footer">
        <Glyph name="lock" size={16} /> {t('go.noApp')}
      </footer>
    </div>
  );
}

function GoRoute({
  data,
  request,
  online,
  onChangeDestination,
  onPick,
}: {
  data: Snapshot;
  request: RouteRequest;
  online: boolean;
  onChangeDestination: () => void;
  onPick: (request: RouteRequest) => void;
}) {
  const { t, tenantText } = useI18n();
  const reducedMotion = usePrefersReducedMotion();
  const tenant = data.tenants.find((x) => x.id === request.destinationId) ?? null;
  const poi = tenant ? null : (data.pois.find((x) => x.id === request.destinationId) ?? null);
  const destination: Tenant | Poi | null = tenant ?? poi;
  const [accessible, setAccessible] = useState(request.accessible);
  const [stepIndex, setStepIndex] = useState(0);
  const [showSteps, setShowSteps] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showRouteOptions, setShowRouteOptions] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [navigationStarted, setNavigationStarted] = useState(false);
  const [guidancePaused, setGuidancePaused] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>('3d');
  const [mapView, setMapView] = useState<MapView>('floor');
  const [zoom, setZoom] = useState<ZoomCommand | null>(null);
  const mapElement = useRef<HTMLElement>(null);
  const [manualFloor, setManualFloor] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<
    (Event & { prompt: () => Promise<void> }) | null
  >(null);
  const startNode = data.nodes.find((n) => n.id === request.startNodeId);
  const startDevice = data.devices.find((d) => d.routeStartNode === request.startNodeId);
  // Ground and First Floor share the surveyed walking graph, joined by lifts and escalators.
  const directoryRoute =
    !!startNode &&
    !!destination &&
    directoryFloorIds.has(startNode.floorId) &&
    directoryFloorIds.has(destination.floorId);
  const directoryPlaces = useMemo(
    () =>
      directoryRoute ? mapPlaces(data).filter((place) => directoryFloorIds.has(place.floorId)) : [],
    [data, directoryRoute],
  );

  const routeOptions = useMemo(() => {
    const calculate = (stepFree: boolean) =>
      destination && startNode
        ? directoryRoute
          ? findDirectoryRoute(startNode.id, destination.nodeId, stepFree, data.edges, data.nodes)
          : findRoute(
              data.nodes,
              data.edges,
              startNode.id,
              destination.nodeId,
              stepFree,
              data.floors,
            )
        : null;
    return { standard: calculate(false), accessible: calculate(true) };
  }, [data, destination, startNode, directoryRoute]);
  const route = accessible ? routeOptions.accessible : routeOptions.standard;
  const walkways = route
    ? `${route.floorIds.map((id) => data.floors.find((f) => f.id === id)?.name ?? id).join(' → ')} walkways`
    : '';
  const pieces = useMemo(() => routePieces(route, data.floors), [route, data.floors]);
  const signature = route ? `${accessible}:${route.edges.map((e) => e.id).join('|')}` : 'none';
  const playback = useRoutePlayback(pieces, { reducedMotion, key: signature });
  const mapping = useMemo(
    () => (route ? stepPieceIndex(route.steps, pieces) : []),
    [route, pieces],
  );

  useEffect(() => {
    setStepIndex(0);
    setManualFloor(null);
    setArrived(false);
  }, [signature]);
  useEffect(() => {
    if (arrived && !mapExpanded)
      document.getElementById('go-brand-details')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
  }, [arrived, mapExpanded]);
  useEffect(() => {
    if (route)
      analytics.track('route_generated', {
        destinationId: request.destinationId,
        accessible,
        app: 'go',
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as Event & { prompt: () => Promise<void> });
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const step = route?.steps[Math.min(stepIndex, (route?.steps.length ?? 1) - 1)] ?? null;
  const nextStep = route?.steps[stepIndex + 1] ?? null;
  const guiding = mapExpanded && navigationStarted;
  useEffect(() => {
    if (!guiding || !voiceEnabled || guidancePaused || !step || !('speechSynthesis' in window))
      return;
    const announcement = new SpeechSynthesisUtterance(step.text);
    announcement.lang = 'en-IN';
    announcement.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(announcement);
    return () => window.speechSynthesis.cancel();
  }, [guiding, voiceEnabled, guidancePaused, step?.text]);
  // While the full-screen map is open, pinches belong to the map, never to the page.
  useEffect(() => {
    if (!mapExpanded) return;
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const previous = viewport?.content;
    if (viewport)
      viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';
    const block = (event: Event) => event.preventDefault();
    const blockPinch = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };
    document.addEventListener('gesturestart', block);
    document.addEventListener('touchmove', blockPinch, { passive: false });
    return () => {
      if (viewport && previous) viewport.content = previous;
      document.removeEventListener('gesturestart', block);
      document.removeEventListener('touchmove', blockPinch);
    };
  }, [mapExpanded]);

  if (!destination || !startNode) {
    return (
      <div className="go-shell">
        <GoHeader />
        <EmptyState
          icon="destination"
          title="This destination is no longer listed"
          body="It may have moved or closed. Search the directory to find something similar."
        >
          <button type="button" className="btn btn-primary" onClick={onChangeDestination}>
            {t('go.search')}
          </button>
        </EmptyState>
      </div>
    );
  }

  const stepPiece = pieces[mapping[stepIndex] ?? 0];
  const autoFloor =
    playback.phase !== 'arrived' && playback.piece
      ? playback.piece.kind === 'floor'
        ? playback.piece.floorId
        : playback.piece.fromFloorId
      : step
        ? step.connector && stepIndex > 0
          ? (step.toFloorId ?? step.floorId)
          : step.floorId
        : startNode.floorId;
  const floorId = manualFloor ?? autoFloor;
  const directoryFloor = manualFloor ?? step?.floorId ?? startNode.floorId;
  // Frame the segment being animated, then the segment for the step the visitor is reading.
  const framedPiece = manualFloor
    ? null
    : playback.phase !== 'arrived'
      ? playback.piece
      : stepPiece;
  const focus =
    framedPiece && framedPiece.kind === 'floor'
      ? focusOnPoints(
          `go-${signature}-${playback.phase === 'arrived' ? `step-${stepIndex}` : `piece-${playback.pieceIndex}`}`,
          framedPiece.floorId,
          framedPiece.points.map((n) => ({ x: n.x, y: n.y })),
          0.22,
          480,
        )
      : null;
  const floor = data.floors.find((f) => f.id === destination.floorId);
  const share = async () => {
    let url = window.location.href;
    if (!request.signed || accessible !== request.accessible) {
      try {
        const token = await api<{ url: string }>('/api/route-tokens', {
          method: 'POST',
          body: {
            deviceId: request.deviceId,
            startNodeId: request.startNodeId,
            destinationId: request.destinationId,
            accessible,
          },
        });
        url = token.url;
      } catch {
        window.alert('Unable to create a share link right now.');
        return;
      }
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: `WAY EZY GO · ${destination.name}`, url });
      } catch {
        /* user cancelled */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      window.alert('Link copied — paste it into a message.');
    } catch {
      // Share and clipboard APIs need HTTPS; on a plain-HTTP network show the link to copy by hand.
      window.prompt('Copy this link', url);
    }
  };
  const goToStep = (index: number) => {
    if (!route) return;
    if (navigationStarted && mapExpanded) playback.replay();
    else playback.skip();
    setGuidancePaused(false);
    setManualFloor(null);
    setStepIndex(Math.max(0, Math.min(route.steps.length - 1, index)));
    if (index < route.steps.length - 1) setArrived(false);
  };
  const startNavigation = () => {
    if (!navigationStarted) {
      setStepIndex(0);
      playback.replay();
    } else if (playback.phase === 'paused') {
      playback.resume();
    }
    setNavigationStarted(true);
    setGuidancePaused(false);
    setMapExpanded(true);
    setShowRouteOptions(false);
  };

  const togglePause = () => {
    if (guidancePaused) {
      if (playback.phase === 'paused') playback.resume();
      else playback.replay();
      setGuidancePaused(false);
    } else {
      playback.pause();
      setGuidancePaused(true);
    }
  };

  return (
    <div
      className={`go-shell is-route ${mapExpanded ? 'is-map-full' : 'is-map-minimized'}${guiding ? ' is-guiding' : ''}${guidancePaused ? ' is-paused' : ''}${online ? '' : ' is-offline'}`}
    >
      <GoHeader
        onShare={share}
        onMinimize={mapExpanded ? () => setMapExpanded(false) : undefined}
      />
      {guiding && route && step ? (
        <div className="go-guidance" aria-live="polite">
          <div className="go-guidance-primary">
            <span className="go-guidance-icon">
              <Glyph name={stepGlyph[step.kind]} size={26} />
            </span>
            <div className="go-guidance-copy">
              <small>
                STEP {stepIndex + 1} OF {route.steps.length} |{' '}
                {data.floors.find((item) => item.id === step.floorId)?.shortName ?? 'G'} FLOOR
              </small>
              <strong>{step.text}</strong>
              <span>
                {step.kind === 'arrive'
                  ? 'Destination ahead'
                  : directoryRoute
                    ? step.connector
                      ? `Change to ${data.floors.find((f) => f.id === step.toFloorId)?.name ?? 'the next floor'}`
                      : 'Follow the marked route'
                    : `${Math.round(step.distance)} m to this turn`}
              </span>
            </div>
            <button
              type="button"
              className="go-guidance-minimise"
              onClick={() => setMapExpanded(false)}
              aria-label="Minimise map and view brand details"
            >
              <Glyph name="compress" size={20} />
            </button>
          </div>
          {nextStep ? (
            <button
              type="button"
              className="go-guidance-next"
              onClick={() => goToStep(stepIndex + 1)}
            >
              <span>THEN</span> {nextStep.text}
            </button>
          ) : null}
        </div>
      ) : null}
      {!online ? (
        <div className="go-offline">
          <Glyph name="wifiOff" size={16} /> {t('common.offline')}
        </div>
      ) : null}
      <section className="go-destination">
        {tenant ? (
          <LogoTile tenant={tenant} size={52} />
        ) : (
          <WayIcon name={poi ? poiIcon[poi.type] : 'information'} size={52} />
        )}
        <button
          type="button"
          className="go-destination-text"
          onClick={() => {
            if (mapExpanded) setShowProfile(true);
            else
              document.getElementById('go-brand-details')?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <strong>{tenant ? tenantText(tenant, 'name') : destination.name}</strong>
          <span>
            {floor?.shortName} · {tenant ? tenant.unitNumber : floor?.theme}
          </span>
        </button>
        {route ? (
          <div className="go-eta">
            <strong>{directoryRoute ? 'Walk' : t('route.minutes', { n: route.minutes })}</strong>
            <span>
              {directoryRoute
                ? route.floorIds.length > 1
                  ? `via ${route.transitions[0].type}`
                  : (data.floors.find((f) => f.id === route.floorIds[0])?.name ?? '')
                : t('route.metres', { n: route.distance })}
            </span>
          </div>
        ) : null}
      </section>

      {!mapExpanded && arrived ? (
        <div className="go-arrived-banner" role="status">
          <Glyph name="check" size={23} />
          <span>
            <strong>You've arrived at {destination.name}</strong>
            <small>Store details and offers are below.</small>
          </span>
        </div>
      ) : null}

      {!mapExpanded ? (
        <section className="go-route-picker" aria-label="Choose a route">
          <div className="go-section-heading">
            <span>YOUR JOURNEY</span>
            <h2>Choose your directions</h2>
            <p>Start from {startDevice?.locationDescription ?? startNode.label}</p>
          </div>
          <div className="go-route-options">
            {(
              [
                { label: 'Fastest route', value: false, result: routeOptions.standard },
                { label: 'Step-free route', value: true, result: routeOptions.accessible },
              ] as const
            ).map((option) => (
              <button
                key={option.label}
                type="button"
                className={`go-route-option${accessible === option.value ? ' is-selected' : ''}`}
                disabled={!option.result}
                aria-pressed={accessible === option.value}
                onClick={() => {
                  if (accessible !== option.value) setNavigationStarted(false);
                  setAccessible(option.value);
                }}
              >
                <Glyph name={option.value ? 'accessibility' : 'route'} size={22} />
                <span>
                  <strong>{option.label}</strong>
                  <small>
                    {!option.result
                      ? 'Unavailable right now'
                      : directoryRoute
                        ? walkways
                        : `${option.result.minutes} min · ${option.result.distance} m`}
                  </small>
                </span>
                <Glyph name={accessible === option.value ? 'check' : 'chevronRight'} size={18} />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section
        ref={mapElement}
        className={`go-map${directoryRoute ? ' is-ground-route' : ''}`}
        aria-label="Route map"
      >
        <div className="go-map-badge">
          <Glyph name="route" size={15} /> Live route map
        </div>
        {!mapExpanded ? (
          <button type="button" className="go-map-expand" onClick={startNavigation}>
            <Glyph name="expand" size={17} /> Open full map
          </button>
        ) : null}
        {directoryRoute ? (
          <ExplorerMap
            data={data}
            startNodeId={startNode.id}
            places={directoryPlaces}
            floorId={directoryFloor}
            onFloorChange={setManualFloor}
            selectedId={destination.id}
            onSelect={(place) => {
              if (place.id === destination.id) setShowProfile(true);
              else onPick({ ...request, destinationId: place.id, signed: false });
            }}
            route={route}
            stepIndex={stepIndex}
            panelOpen={false}
            focusNodeId={guiding ? step?.nodeId : undefined}
            navigationMode={guiding}
            onFullscreen={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void mapElement.current?.requestFullscreen();
            }}
          />
        ) : (
          <MapRenderer
            mode={mapMode}
            data={data}
            floorId={floorId}
            view={mapView}
            youAreHereLabel={t('map.youAreHere')}
            startNodeId={startNode.id}
            destinationNodeId={destination.nodeId}
            destinationLabel={tenant ? tenant.name : destination.name}
            selectedFeatureId={tenant?.featureId ?? (poi?.featureId || null)}
            pieces={pieces}
            progressRef={playback.progressRef}
            activeConnectorNodeIds={
              step?.connector
                ? [
                    route!.nodes.find(
                      (n) =>
                        n.floorId === step.floorId &&
                        (n.type === 'lift' || n.type === 'escalator' || n.type === 'stairs'),
                    )?.id ?? '',
                  ]
                : null
            }
            focus={focus}
            zoomCommand={zoom}
            reducedMotion={reducedMotion}
            labelMode="route"
            compact
            onFallback={() => setMapMode('svg')}
          />
        )}
        {!directoryRoute && mapView === 'floor' ? (
          <FloorSwitcher
            floors={data.floors}
            floorId={floorId}
            onChange={setManualFloor}
            routeFloorIds={route?.floorIds}
            label={t('map.floor')}
          />
        ) : null}
        {!directoryRoute ? (
          <div className="go-map-tools">
            <button
              type="button"
              className="go-map-btn"
              onClick={() => setMapView(mapView === 'floor' ? 'exploded' : 'floor')}
              aria-pressed={mapView === 'exploded'}
              aria-label={t('map.exploded')}
            >
              <Glyph name="explode" size={20} />
            </button>
            <button
              type="button"
              className="go-map-btn"
              onClick={() => setMapMode(mapMode === '3d' ? 'svg' : '3d')}
              aria-label="Toggle 2D / 3D"
            >
              <span className="go-map-btn-text">{mapMode === '3d' ? '2D' : '3D'}</span>
            </button>
            <button
              type="button"
              className="go-map-btn"
              onClick={() => {
                setManualFloor(null);
                setZoom({ kind: 'reset', nonce: Date.now() });
              }}
              aria-label={t('map.recenter')}
            >
              <Glyph name="locate" size={20} />
            </button>
          </div>
        ) : null}
      </section>

      {guiding && route && step ? (
        <section className="go-nav-dock" aria-label="Navigation controls">
          <div className="go-nav-destination">
            {tenant ? (
              <LogoTile tenant={tenant} size={42} />
            ) : (
              <WayIcon name={poi ? poiIcon[poi.type] : 'destination'} size={42} />
            )}
            <span>
              <strong>{destination.name}</strong>
              <small>
                {route.minutes} min | {route.distance} m | {floor?.shortName}
              </small>
            </span>
            <button
              type="button"
              onClick={() => setShowProfile(true)}
              aria-label="View brand details"
            >
              <Glyph name="chevronUp" size={19} />
            </button>
          </div>
          <div
            className="go-nav-progress"
            role="progressbar"
            aria-label="Route progress"
            aria-valuenow={stepIndex + 1}
            aria-valuemin={0}
            aria-valuemax={route.steps.length}
          >
            <i style={{ width: String(((stepIndex + 1) / route.steps.length) * 100) + '%' }} />
          </div>
          <div className="go-nav-controls">
            <button
              type="button"
              className="go-nav-control"
              onClick={() => goToStep(stepIndex - 1)}
              disabled={stepIndex === 0}
              aria-label="Previous direction"
            >
              <Glyph name="chevronLeft" size={22} />
            </button>
            <button type="button" className="go-nav-control is-main" onClick={togglePause}>
              <Glyph name={guidancePaused ? 'play' : 'pause'} size={17} />{' '}
              {guidancePaused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              className="go-nav-control"
              onClick={() => (nextStep ? goToStep(stepIndex + 1) : onChangeDestination())}
              aria-label={nextStep ? 'Next direction' : 'Done and return to brand search'}
            >
              {nextStep ? (
                <Glyph name="chevronRight" size={22} />
              ) : (
                <Glyph name="check" size={22} />
              )}
            </button>
            <button
              type="button"
              className="go-nav-control"
              onClick={() => setVoiceEnabled((enabled) => !enabled)}
              aria-label={voiceEnabled ? 'Mute spoken directions' : 'Enable spoken directions'}
              aria-pressed={voiceEnabled}
            >
              {voiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            <button type="button" className="go-nav-control is-end" onClick={onChangeDestination}>
              End
            </button>
          </div>
        </section>
      ) : null}
      {route && step ? (
        <section className={`go-sheet${showRouteOptions ? ' is-expanded' : ''}`}>
          <button
            type="button"
            className="go-sheet-handle"
            aria-expanded={showRouteOptions}
            onClick={() => setShowRouteOptions(!showRouteOptions)}
          >
            <span className="go-sheet-grip" aria-hidden="true" />
            <span>{showRouteOptions ? 'Less details' : 'Route details'}</span>
            <Glyph name={showRouteOptions ? 'chevronDown' : 'chevronUp'} size={18} />
          </button>
          {step.connector ? (
            <div className="go-transition">
              <WayIcon
                name={
                  step.kind === 'lift' ? 'lift' : step.kind === 'escalator' ? 'escalator' : 'stairs'
                }
                size={48}
              />
              <div>
                <span>{t('route.floorChange')}</span>
                <strong>{step.text}</strong>
              </div>
            </div>
          ) : null}
          <div className="go-step">
            <span className="go-step-icon">
              {step.kind === 'arrive' ? (
                <WayIcon name="destination" size={36} />
              ) : (
                <Glyph name={stepGlyph[step.kind]} size={28} />
              )}
            </span>
            <div className="go-step-text">
              <span>
                {t('go.nextStep')} ·{' '}
                {t('go.stepOf', { n: stepIndex + 1, total: route.steps.length })}
              </span>
              <strong>{step.text}</strong>
            </div>
          </div>
          <div className="go-progress" aria-hidden="true">
            {route.steps.map((_, i) => (
              <i key={i} className={i <= stepIndex ? 'is-done' : ''} />
            ))}
          </div>
          <div className="go-progress-label">
            <span>{Math.round(((stepIndex + 1) / route.steps.length) * 100)}% of route</span>
            <span>{route.steps.length - stepIndex - 1} steps remaining</span>
          </div>
          <div className="go-step-nav">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => goToStep(stepIndex - 1)}
              disabled={stepIndex === 0}
              aria-label="Previous step"
            >
              <Glyph name="chevronLeft" size={20} />
            </button>
            <button
              type="button"
              className="btn btn-outline go-grow"
              onClick={() => setShowSteps(true)}
            >
              <Glyph name="menu" size={18} /> {t('go.allSteps')}
            </button>
            <button
              type="button"
              className="btn btn-primary go-grow"
              onClick={() => {
                if (stepIndex >= route.steps.length - 1) {
                  setArrived(true);
                  setMapExpanded(false);
                  setShowRouteOptions(false);
                } else goToStep(stepIndex + 1);
              }}
              aria-label={
                stepIndex >= route.steps.length - 1
                  ? 'Confirm arrival and view place details'
                  : undefined
              }
            >
              {stepIndex >= route.steps.length - 1 ? t('route.arrived') : t('go.nextStep')}{' '}
              <Glyph
                name={stepIndex >= route.steps.length - 1 ? 'check' : 'chevronRight'}
                size={20}
              />
            </button>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={accessible}
            className={`go-accessible ${accessible ? 'is-on' : ''}`}
            onClick={() => {
              setAccessible(!accessible);
              if (!accessible)
                analytics.track('accessible_route_selected', {
                  destinationId: request.destinationId,
                  app: 'go',
                });
            }}
          >
            <WayIcon name="accessibility" size={34} />
            <span>
              <strong>{accessible ? t('route.accessible') : t('route.standard')}</strong>
              <small>{accessible ? t('route.accessibleHint') : t('route.standardHint')}</small>
            </span>
            <i className="switch" aria-hidden="true" />
          </button>
          <p className="go-context">
            <Glyph name="pin" size={14} />{' '}
            {t('go.fromKiosk', { place: startDevice?.locationDescription ?? startNode.label })}
            {request.signed ? (
              <>
                {' · '}
                <Glyph name="lock" size={14} /> {t('go.noApp')}
              </>
            ) : null}
          </p>
          {installPrompt ? (
            <button
              type="button"
              className="btn btn-soft go-install"
              onClick={() => installPrompt.prompt().then(() => setInstallPrompt(null))}
            >
              <Glyph name="download" size={18} /> {t('go.install')}
            </button>
          ) : null}
        </section>
      ) : (
        <section className="go-sheet is-unavailable">
          <EmptyState
            icon="directions"
            title={t('route.unavailable.title')}
            body={accessible ? t('route.noAccessible') : t('route.unavailable.body')}
          >
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setAccessible(!accessible)}
            >
              {accessible ? t('route.standard') : t('route.accessible')}
            </button>
          </EmptyState>
        </section>
      )}

      {!mapExpanded ? (
        <>
          {route ? (
            <section className="go-directions-list" aria-label="All directions">
              <div className="go-section-heading">
                <span>STEP BY STEP</span>
                <h2>Directions</h2>
              </div>
              <ol>
                {route.steps.map((item, index) => (
                  <li key={`${item.nodeId}-${index}`}>
                    <button
                      type="button"
                      onClick={() => {
                        goToStep(index);
                        setNavigationStarted(true);
                        setMapExpanded(true);
                      }}
                    >
                      <span className="go-direction-index">{index + 1}</span>
                      <span>
                        <strong>{item.text}</strong>
                        <small>
                          {data.floors.find((floor) => floor.id === item.floorId)?.name}
                        </small>
                      </span>
                      <Glyph name="chevronRight" size={18} />
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          <GoBrandDetails
            data={data}
            tenant={tenant}
            poi={poi}
            walkMinutes={route?.minutes ?? null}
            walkways={directoryRoute ? walkways : null}
          />
          <div className="go-start-bar">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!route}
              onClick={startNavigation}
            >
              <Glyph name={navigationStarted ? 'expand' : 'route'} size={20} />
              {navigationStarted ? 'Return to full map' : 'Start directions'}
              <Glyph name="arrowRight" size={20} />
            </button>
          </div>
        </>
      ) : null}

      {showSteps && route ? (
        <div
          className="go-modal"
          role="dialog"
          aria-modal="true"
          aria-label={t('go.allSteps')}
          onClick={() => setShowSteps(false)}
        >
          <div className="go-modal-card" onClick={(e) => e.stopPropagation()}>
            <header>
              <h2>{t('go.allSteps')}</h2>
              <button
                type="button"
                className="go-icon-btn"
                onClick={() => setShowSteps(false)}
                aria-label={t('common.close')}
              >
                <Glyph name="close" size={20} />
              </button>
            </header>
            <ol className="go-steps">
              {route.steps.map((s, i) => (
                <li key={`${s.nodeId}-${i}`}>
                  <button
                    type="button"
                    className={i === stepIndex ? 'is-active' : ''}
                    onClick={() => {
                      goToStep(i);
                      setShowSteps(false);
                    }}
                  >
                    <span className="go-step-icon is-small">
                      {s.connector ? (
                        <WayIcon
                          name={
                            s.kind === 'lift'
                              ? 'lift'
                              : s.kind === 'escalator'
                                ? 'escalator'
                                : 'stairs'
                          }
                          size={26}
                        />
                      ) : (
                        <Glyph name={stepGlyph[s.kind]} size={18} />
                      )}
                    </span>
                    <span>{s.text}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}

      {showProfile ? (
        <DestinationProfile
          data={data}
          tenant={tenant}
          poi={poi}
          onClose={() => setShowProfile(false)}
          onOther={(id) => {
            setShowProfile(false);
            onPick({ ...request, destinationId: id, signed: false });
          }}
        />
      ) : null}
    </div>
  );
}

function GoBrandDetails({
  data,
  tenant,
  poi,
  walkMinutes,
  walkways,
}: {
  data: Snapshot;
  tenant: Tenant | null;
  poi: Poi | null;
  walkMinutes: number | null;
  walkways: string | null;
}) {
  const { t, tenantText } = useI18n();
  const destination = tenant ?? poi;
  if (!destination) return null;

  const floor = data.floors.find((item) => item.id === destination.floorId);
  const today = new Date();
  const hours = tenant?.hours.find(
    (item) => item.day === zonedParts(today, data.venue.timezone).day,
  );
  const localDate = new Intl.DateTimeFormat('sv-SE', {
    timeZone: data.venue.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(today);
  const offers = tenant
    ? data.offers.filter(
        (offer) =>
          offer.tenantId === tenant.id &&
          offer.status === 'ACTIVE' &&
          offer.start <= localDate &&
          offer.end >= localDate,
      )
    : [];
  const tags = tenant
    ? [...tenant.productTypes, ...tenant.services, ...(tenant.dining?.cuisines ?? [])].slice(0, 10)
    : [];

  return (
    <section id="go-brand-details" className="go-brand-details" aria-label="Place details">
      <div className="go-section-heading">
        <span>PLACE DETAILS</span>
        <h2>{tenant ? tenantText(tenant, 'name') : destination.name}</h2>
        <p>
          {tenant?.subcategory ?? poi?.type} · {floor?.name}
          {tenant ? ` · ${tenant.unitNumber}` : ''}
        </p>
      </div>
      {tenant?.heroImage ? <HeroArt tenant={tenant} data={data} height={190} /> : null}
      <div className="go-brand-facts">
        <div>
          <Glyph name="route" size={19} />
          <span>Walking route</span>
          <strong>
            {walkMinutes === null
              ? 'Unavailable'
              : walkways
                ? walkways
                : walkMinutes === 0
                  ? 'Already here'
                  : `${walkMinutes} min`}
          </strong>
        </div>
        {tenant ? (
          <div>
            <Glyph name="clock" size={19} />
            <span>Today</span>
            <strong>
              {hours && !hours.closed
                ? `${formatTime(hours.open)} – ${formatTime(hours.close)}`
                : 'Closed'}
            </strong>
          </div>
        ) : null}
        {tenant && (tenant.dining || tenant.waitMinutes != null) ? (
          <div>
            <Glyph name="clock" size={19} />
            <span>Estimated wait</span>
            <strong>
              {tenant.waitMinutes == null ? 'Not provided' : `${tenant.waitMinutes} min`}
            </strong>
          </div>
        ) : null}
      </div>
      {tenant ? (
        <p className="go-brand-status">
          <OpenBadge tenant={tenant} timezone={data.venue.timezone} t={t} />
          {tenant.dining?.priceBand ? <span>Price range {tenant.dining.priceBand}</span> : null}
        </p>
      ) : null}
      {offers.length ? (
        <div className="go-brand-section">
          <h3>Current offers</h3>
          {offers.map((offer) => (
            <article key={offer.id} className="go-brand-offer">
              <Glyph name="tag" size={20} />
              <div>
                <strong>{offer.highlight || offer.title}</strong>
                <span>{offer.title}</span>
                <p>{offer.description}</p>
                {offer.terms ? <small>{offer.terms}</small> : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
      <div className="go-brand-section">
        <h3>About this place</h3>
        <p>{tenant ? tenantText(tenant, 'description') : poi?.description}</p>
        {tags.length ? (
          <div className="go-brand-tags">
            {tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        ) : null}
        {tenant?.accessibilityNotes ? (
          <p className="go-brand-accessibility">
            <Glyph name="accessibility" size={18} /> {tenant.accessibilityNotes}
          </p>
        ) : null}
      </div>
      {tenant?.gallery.length ? (
        <div className="go-brand-section">
          <h3>Photos</h3>
          <div className="go-brand-gallery">
            {tenant.gallery.map((url, index) => (
              <img
                key={`${url}-${index}`}
                src={url}
                alt={`${tenant.name} photo ${index + 1}`}
                loading="lazy"
              />
            ))}
          </div>
        </div>
      ) : null}
      {tenant?.phone ||
      tenant?.website ||
      tenant?.dining?.menuUrl ||
      tenant?.dining?.reservationUrl ? (
        <div className="go-brand-section">
          <h3>Contact & links</h3>
          <div className="go-brand-links">
            {tenant?.phone ? (
              <a href={`tel:${tenant.phone.replace(/\s/g, '')}`}>Call store</a>
            ) : null}
            {tenant?.website ? (
              <a href={tenant.website} target="_blank" rel="noopener noreferrer">
                Website
              </a>
            ) : null}
            {tenant?.dining?.menuUrl ? (
              <a href={tenant.dining.menuUrl} target="_blank" rel="noopener noreferrer">
                Menu
              </a>
            ) : null}
            {tenant?.dining?.reservationUrl ? (
              <a href={tenant.dining.reservationUrl} target="_blank" rel="noopener noreferrer">
                Reserve
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DestinationProfile({
  data,
  tenant,
  poi,
  onClose,
  onOther,
}: {
  data: Snapshot;
  tenant: Tenant | null;
  poi: Poi | null;
  onClose: () => void;
  onOther: (id: string) => void;
}) {
  const { t, tenantText } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tenant) analytics.track('tenant_profile_viewed', { destinationId: tenant.id, app: 'go' });
    ref.current?.focus();
  }, [tenant]);
  const tz = data.venue.timezone;
  const floor = data.floors.find((f) => f.id === (tenant?.floorId ?? poi?.floorId));
  const offer = tenant
    ? data.offers.find((o) => o.tenantId === tenant.id && o.status === 'ACTIVE')
    : null;
  const today = zonedParts(new Date(), tz).day;
  const hours = tenant?.hours.find((h) => h.day === today);
  const nearby = tenant
    ? data.tenants
        .filter(
          (x) =>
            x.categoryId === tenant.categoryId &&
            x.id !== tenant.id &&
            openState(x, new Date(), tz).state === 'open',
        )
        .slice(0, 3)
    : [];
  return (
    <div
      className="go-modal is-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={tenant?.name ?? poi?.name}
      onClick={onClose}
    >
      <div className="go-profile" ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="go-icon-btn go-profile-close"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <Glyph name="close" size={20} />
        </button>
        {tenant ? <HeroArt tenant={tenant} data={data} height={180} /> : null}
        <div className="go-profile-body">
          <div className="go-profile-head">
            {tenant ? (
              <LogoTile tenant={tenant} size={64} />
            ) : (
              <WayIcon name={poi ? poiIcon[poi.type] : 'information'} size={64} />
            )}
            <div>
              <h2>{tenant ? tenantText(tenant, 'name') : poi?.name}</h2>
              <span>
                {tenant?.subcategory ?? poi?.type} · {floor?.shortName}{' '}
                {tenant ? `· ${tenant.unitNumber}` : ''}
              </span>
            </div>
          </div>
          {tenant ? (
            <p className="go-hours">
              <OpenBadge tenant={tenant} timezone={tz} t={t} />
              {hours && !hours.closed ? (
                <span>
                  {t('tenant.today')} {formatTime(hours.open)} – {formatTime(hours.close)}
                </span>
              ) : null}
            </p>
          ) : null}
          {tenant && (tenant.dining || tenant.waitMinutes != null) ? (
            <p className="go-profile-wait">
              <Glyph name="clock" size={18} /> Estimated wait:{' '}
              {tenant.waitMinutes == null ? 'Not provided' : `${tenant.waitMinutes} min`}
            </p>
          ) : null}
          <p>{tenant ? tenantText(tenant, 'description') : poi?.description}</p>
          {tenant ? (
            <div className="chip-row">
              {[...(tenant.dining?.cuisines ?? []), ...tenant.productTypes]
                .slice(0, 6)
                .map((tag) => (
                  <span key={tag} className="chip is-static">
                    {tag}
                  </span>
                ))}
            </div>
          ) : null}
          {offer ? (
            <div className="go-offer">
              <WayIcon name="offers" size={40} />
              <div>
                <strong>
                  {offer.highlight} · {offer.title}
                </strong>
                <span>{offer.description}</span>
              </div>
            </div>
          ) : null}
          <div className="go-profile-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              <Glyph name="route" size={18} /> {t('common.directions')}
            </button>
            {tenant?.phone ? (
              <a className="btn btn-outline" href={`tel:${tenant.phone.replace(/\s/g, '')}`}>
                <Glyph name="phone" size={18} /> Call
              </a>
            ) : null}
            {tenant?.dining?.menuUrl ? (
              <a
                className="btn btn-outline"
                href={tenant.dining.menuUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Glyph name="external" size={18} /> {t('tenant.menu')}
              </a>
            ) : null}
            {tenant?.cinema?.bookingUrl ? (
              <a
                className="btn btn-outline"
                href={tenant.cinema.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Glyph name="external" size={18} /> {t('tenant.bookTickets')}
              </a>
            ) : null}
          </div>
          {nearby.length ? (
            <div className="go-nearby">
              <h3>More like this</h3>
              {nearby.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className="go-list-row"
                  onClick={() => onOther(x.id)}
                >
                  <LogoTile tenant={x} size={36} />
                  <span>
                    <strong>{x.name}</strong>
                    <small>
                      {x.subcategory} · {data.floors.find((f) => f.id === x.floorId)?.shortName}
                    </small>
                  </span>
                  <Glyph name="chevronRight" size={18} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
