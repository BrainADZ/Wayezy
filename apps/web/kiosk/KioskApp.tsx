import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../styles/kiosk.css';
import { idleTransition } from '../../../packages/advertising';
import { openState, type Poi, type Snapshot, type Tenant } from '../../../packages/domain';
import { findRoute, nearestByCost, travelCosts } from '../../../packages/routing';
import { Logo } from '../brand/Logo';
import { Glyph } from '../icons/glyphs';
import { categoryIcon, WayIcon } from '../icons/illustrated';
import { FloorSwitcher, MapRenderer, MapToolbar } from '../map/MapRenderer';
import {
  focusOnFeature,
  focusOnFloor,
  focusOnPoints,
  routePieces,
  type MapFocus,
} from '../map/model';
import type { MapMode, MapView, ZoomCommand } from '../map/types';
import { useRoutePlayback } from '../map/useRoutePlayback';
import { analytics } from '../shared/analytics';
import { useContent, type PublicConfig } from '../shared/content';
import { APP_VERSION, resolveDeviceIdentity, type DeviceIdentity } from '../shared/device';
import { formatClock, useNow, usePrefersReducedMotion } from '../shared/hooks';
import { useI18n } from '../shared/i18n';
import { EmptyState, LogoTile, OpenBadge, Toast } from '../shared/ui';
import { AdMode } from './AdMode';
import { EventsPage, HelpPage, OffersPage } from './InfoPages';
import { PoiSheet, TenantSheet } from './PlaceSheet';
import { QrPanel, type QrRequest } from './QrPanel';
import { RoutePanel, RouteSummary, TransitionBanner } from './RoutePanel';
import { SearchOverlay } from './SearchOverlay';

type Target = { kind: 'tenant'; id: string } | { kind: 'poi'; id: string };
type Screen =
  | { name: 'home' }
  | { name: 'category'; categoryId: string }
  | { name: 'place'; target: Target; collapsed?: boolean }
  | { name: 'route'; target: Target }
  | { name: 'offers' }
  | { name: 'events' }
  | { name: 'help' };

const amenityShortcuts: {
  type: Poi['type'] | 'Accessibility';
  icon: string;
  key:
    | 'amenity.Parking'
    | 'amenity.Washroom'
    | 'amenity.ATM'
    | 'amenity.Lift'
    | 'amenity.Information'
    | 'amenity.Accessibility';
}[] = [
  { type: 'Parking', icon: 'parking', key: 'amenity.Parking' },
  { type: 'Washroom', icon: 'washroom', key: 'amenity.Washroom' },
  { type: 'ATM', icon: 'atm', key: 'amenity.ATM' },
  { type: 'Lift', icon: 'lift', key: 'amenity.Lift' },
  { type: 'Information', icon: 'information', key: 'amenity.Information' },
  { type: 'Accessibility', icon: 'accessibility', key: 'amenity.Accessibility' },
];

export default function KioskApp() {
  const { data, config, status, online, updateCount } = useContent();
  const identity = useMemo(() => resolveDeviceIdentity(), []);

  useEffect(() => {
    document.documentElement.classList.add('kiosk-root');
    document.title = 'WAY EZY · Kiosk';
    return () => document.documentElement.classList.remove('kiosk-root');
  }, []);

  if (!data) {
    return (
      <div className="kiosk-stage kiosk-splash">
        <Logo height={150} />
        {status === 'error' ? (
          <EmptyState
            icon="map"
            title="The directory is starting up"
            body="We’re connecting to the centre’s directory. This screen will refresh automatically."
          />
        ) : (
          <span className="splash-loader" aria-label="Loading" />
        )}
      </div>
    );
  }
  return (
    <Kiosk
      data={data}
      config={config}
      online={online}
      updateCount={updateCount}
      identity={identity}
    />
  );
}

function Kiosk({
  data,
  config,
  online,
  updateCount,
  identity,
}: {
  data: Snapshot;
  config: PublicConfig | null;
  online: boolean;
  updateCount: number;
  identity: DeviceIdentity;
}) {
  const { t, lang, setLang, tenantText } = useI18n();
  const reducedMotion = usePrefersReducedMotion();
  const device =
    data.devices.find((d) => d.id === identity.id) ??
    data.devices.find((d) => d.status === 'ACTIVE') ??
    data.devices[0];
  const startNode = data.nodes.find((n) => n.id === device.routeStartNode) ?? data.nodes[0];

  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [floorId, setFloorId] = useState(device.floorId);
  const [mapView, setMapView] = useState<MapView>('floor');
  const [mapMode, setMapMode] = useState<MapMode>(config?.kioskDefaultMapMode ?? '3d');
  const defaultA11y = useMemo(
    () => ({
      largeText: false,
      highContrast: Boolean(config?.kioskHighContrastDefault),
      stepFree: false,
    }),
    [config?.kioskHighContrastDefault],
  );
  const [a11y, setA11y] = useState(defaultA11y);
  const [accessible, setAccessible] = useState(false);
  const [qr, setQr] = useState<QrRequest | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'default' | 'warning' } | null>(null);
  const [zoom, setZoom] = useState<ZoomCommand | null>(null);
  const [ad, setAd] = useState(false);
  const [categoryFloor, setCategoryFloor] = useState<string>('all');
  const lastInteraction = useRef(Date.now());
  const sessionActive = useRef(false);
  const ignoreClicksUntil = useRef(0);
  const now = useNow(10_000);
  const clock = formatClock(now, data.venue.timezone, lang === 'hi' ? 'hi-IN' : 'en-IN');

  useEffect(() => {
    analytics.configure({ app: 'kiosk', deviceId: device.id });
  }, [device.id]);
  useEffect(() => setAccessible(a11y.stepFree), [a11y.stepFree]);

  const costs = useMemo(
    () => travelCosts(data.nodes, data.edges, startNode.id, accessible),
    [data.nodes, data.edges, startNode.id, accessible],
  );
  const minutesTo = useCallback(
    (nodeId: string) => {
      const c = costs.get(nodeId);
      return c === undefined ? null : Math.max(1, Math.ceil(c / 60));
    },
    [costs],
  );

  /* ---------------- session + idle advertising ---------------- */

  const resetSession = useCallback(() => {
    if (sessionActive.current) analytics.track('session_reset', {});
    sessionActive.current = false;
    setScreen({ name: 'home' });
    setSearchOpen(false);
    setQuery('');
    setQr(null);
    setFloorId(device.floorId);
    setMapView('floor');
    setA11y(defaultA11y);
    setAccessible(false);
    setCategoryFloor('all');
    setLang((device.defaultLanguage as 'en' | 'hi') || 'en');
    setZoom({ kind: 'reset', nonce: Date.now() });
  }, [device.floorId, device.defaultLanguage, defaultA11y, setLang]);

  const interact = useCallback(() => {
    lastInteraction.current = Date.now();
    if (!sessionActive.current) {
      sessionActive.current = true;
      analytics.newSession();
      analytics.track('session_started', {});
    }
  }, []);

  const clientBuild = config?.clientBuild;
  useEffect(() => {
    if (ad) return;
    const timer = window.setInterval(() => {
      if (
        idleTransition(
          'ACTIVE',
          lastInteraction.current,
          Date.now(),
          device.idleTimeout,
          'tick',
        ) === 'AD'
      ) {
        // A new release was deployed: nobody is using the screen, so pick up the new app before attract mode.
        if (clientBuild && !document.querySelector(`script[type="module"][src="${clientBuild}"]`)) {
          let attempted = '';
          try {
            attempted = window.sessionStorage.getItem('wez-reloaded-for') ?? '';
            window.sessionStorage.setItem('wez-reloaded-for', clientBuild);
          } catch {
            /* storage unavailable: reload once per page anyway */
          }
          if (attempted !== clientBuild) {
            window.location.reload();
            return;
          }
        }
        resetSession();
        setAd(true);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [ad, device.idleTimeout, resetSession, clientBuild]);

  const exitAd = useCallback(() => {
    ignoreClicksUntil.current = Date.now() + 650;
    setAd(false);
    resetSession();
    interact();
  }, [resetSession, interact]);

  /* ---------------- heartbeat ---------------- */

  useEffect(() => {
    if (!identity.key) return;
    const started = Date.now();
    const beat = () =>
      fetch(`/api/devices/${encodeURIComponent(identity.id)}/heartbeat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-device-key': identity.key! },
        body: JSON.stringify({
          softwareVersion: APP_VERSION,
          contentVersion: data.version,
          status: {
            online: navigator.onLine,
            queuedEvents: analytics.pending,
            screen: `${window.screen.width}x${window.screen.height}`,
            mapMode,
            uptimeSeconds: Math.round((Date.now() - started) / 1000),
          },
        }),
      }).catch(() => undefined);
    void beat();
    const timer = window.setInterval(beat, 30_000);
    return () => window.clearInterval(timer);
  }, [identity.id, identity.key, data.version, mapMode]);

  useEffect(() => {
    if (updateCount > 0 && (screen.name === 'home' || screen.name === 'category'))
      setToast({ message: t('common.updated'), tone: 'default' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateCount]);

  /* ---------------- navigation helpers ---------------- */

  const tenantById = useCallback(
    (id: string) => data.tenants.find((x) => x.id === id) ?? null,
    [data.tenants],
  );
  const poiById = useCallback(
    (id: string) => data.pois.find((x) => x.id === id) ?? null,
    [data.pois],
  );

  const openTenant = (id: string) => {
    const tenant = tenantById(id);
    if (!tenant) return;
    analytics.track('tenant_profile_viewed', { destinationId: id, categoryId: tenant.categoryId });
    setSearchOpen(false);
    setMapView('floor');
    setFloorId(tenant.floorId);
    setScreen({ name: 'place', target: { kind: 'tenant', id } });
  };
  const openPoi = (id: string) => {
    const poi = poiById(id);
    if (!poi) return;
    setSearchOpen(false);
    setMapView('floor');
    setFloorId(poi.floorId);
    setScreen({ name: 'place', target: { kind: 'poi', id } });
  };
  const openDestination = (id: string) =>
    tenantById(id)
      ? startRoute({ kind: 'tenant', id })
      : poiById(id)
        ? startRoute({ kind: 'poi', id })
        : undefined;
  const openCategory = (categoryId: string) => {
    analytics.track('category_opened', { categoryId });
    setSearchOpen(false);
    const counts = new Map<string, number>();
    for (const tenant of data.tenants.filter((x) => x.categoryId === categoryId))
      counts.set(tenant.floorId, (counts.get(tenant.floorId) ?? 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (best) setFloorId(best);
    setCategoryFloor('all');
    setMapView('floor');
    setScreen({ name: 'category', categoryId });
  };
  const openAmenity = (type: Poi['type'] | 'Accessibility') => {
    if (type === 'Accessibility') {
      setScreen({ name: 'help' });
      return;
    }
    const candidates = data.pois.filter((p) => p.type === type);
    const nearest = nearestByCost(candidates, costs) ?? candidates[0];
    analytics.track('amenity_selected', { type, destinationId: nearest?.id ?? '' });
    if (nearest) openPoi(nearest.id);
    else setToast({ message: `${type} is not listed in this directory yet.`, tone: 'warning' });
  };
  const startRoute = (target: Target) => {
    const destination = target.kind === 'tenant' ? tenantById(target.id) : poiById(target.id);
    if (!destination) return;
    analytics.track('route_requested', { destinationId: target.id, accessible });
    setSearchOpen(false);
    setMapView('floor');
    setFloorId(startNode.floorId);
    setScreen({ name: 'route', target });
    sendToPhone(target);
  };
  const sendToPhone = (target: Target) => {
    const tenant = target.kind === 'tenant' ? tenantById(target.id) : null;
    const poi = target.kind === 'poi' ? poiById(target.id) : null;
    const floor = data.floors.find((f) => f.id === (tenant?.floorId ?? poi?.floorId));
    const r = findRoute(
      data.nodes,
      data.edges,
      startNode.id,
      tenant?.nodeId ?? poi!.nodeId,
      accessible,
      data.floors,
    );
    setQr({
      kind: 'route',
      deviceId: device.id,
      startNodeId: startNode.id,
      destinationId: target.id,
      accessible,
      title: tenant ? tenant.name : poi!.name,
      subtitle: `${floor?.shortName ?? ''} · ${floor?.theme ?? ''}${r ? ` · ${r.minutes} min · ${r.distance} m` : ''}`,
    });
  };
  const goHome = () => {
    setScreen({ name: 'home' });
    setSearchOpen(false);
    setQuery('');
    setMapView('floor');
    setFloorId(device.floorId);
  };

  /* ---------------- route + playback ---------------- */

  const routeTarget = screen.name === 'route' ? screen.target : null;
  const routeDestination = routeTarget
    ? routeTarget.kind === 'tenant'
      ? tenantById(routeTarget.id)
      : poiById(routeTarget.id)
    : null;
  const route = useMemo(
    () =>
      routeDestination
        ? findRoute(
            data.nodes,
            data.edges,
            startNode.id,
            routeDestination.nodeId,
            accessible,
            data.floors,
          )
        : null,
    [routeDestination, data.nodes, data.edges, data.floors, startNode.id, accessible],
  );
  const pieces = useMemo(() => routePieces(route, data.floors), [route, data.floors]);
  const routeSignature = route ? route.edges.map((e) => e.id).join('|') : 'none';
  const playback = useRoutePlayback(pieces, {
    reducedMotion,
    key: `${routeTarget?.id ?? ''}-${routeSignature}`,
  });
  const lastSignature = useRef<{ target: string; signature: string; accessible: boolean } | null>(
    null,
  );

  useEffect(() => {
    if (!routeTarget) {
      lastSignature.current = null;
      return;
    }
    if (route)
      analytics.track('route_generated', {
        destinationId: routeTarget.id,
        accessible,
        distance: route.distance,
        floors: route.floorIds.length,
      });
    else analytics.track('route_failed', { destinationId: routeTarget.id, accessible });
    const previous = lastSignature.current;
    if (
      previous &&
      previous.target === routeTarget.id &&
      previous.accessible === accessible &&
      previous.signature !== routeSignature
    )
      setToast({ message: t('route.updated'), tone: 'warning' });
    lastSignature.current = { target: routeTarget.id, signature: routeSignature, accessible };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeTarget?.id, routeSignature, accessible]);

  // Single-floor view follows the animation from floor to floor.
  useEffect(() => {
    if (screen.name !== 'route' || mapView !== 'floor' || !playback.piece) return;
    const piece = playback.piece;
    const next =
      piece.kind === 'floor'
        ? piece.floorId
        : playback.phase === 'transition'
          ? piece.fromFloorId
          : piece.toFloorId;
    setFloorId(next);
  }, [screen.name, mapView, playback.piece, playback.phase]);

  /* ---------------- map inputs per screen ---------------- */

  const mapInputs = useMemo(() => {
    const base = {
      startNodeId: startNode.id,
      selectedFeatureId: null as string | null,
      destinationNodeId: null as string | null,
      destinationLabel: '',
      highlightFeatureIds: null as string[] | null,
      focus: null as MapFocus | null,
      labelMode: 'auto' as 'auto' | 'route',
    };
    const floor = data.floors.find((f) => f.id === floorId) ?? data.floors[0];
    if (screen.name === 'category') {
      const tenants = data.tenants.filter((x) => x.categoryId === screen.categoryId);
      return {
        ...base,
        highlightFeatureIds: tenants.map((x) => x.featureId),
        focus: focusOnFloor(floor),
      };
    }
    if (screen.name === 'place') {
      if (screen.target.kind === 'tenant') {
        const tenant = tenantById(screen.target.id);
        const feature = data.features.find((f) => f.id === tenant?.featureId);
        return {
          ...base,
          selectedFeatureId: tenant?.featureId ?? null,
          destinationNodeId: tenant?.nodeId ?? null,
          destinationLabel: tenant ? tenantText(tenant, 'name') : '',
          focus: feature
            ? {
                ...focusOnFeature(feature, `${feature.id}-${screen.collapsed ? 'c' : 'o'}`),
                minSize: screen.collapsed ? 700 : 560,
              }
            : null,
        };
      }
      const poi = poiById(screen.target.id);
      const node = data.nodes.find((n) => n.id === poi?.nodeId);
      return {
        ...base,
        selectedFeatureId: poi?.featureId || null,
        destinationNodeId: poi?.nodeId ?? null,
        destinationLabel: poi?.name ?? '',
        focus: node
          ? focusOnPoints(`poi-${poi!.id}`, node.floorId, [{ x: node.x, y: node.y }], 0.4, 520)
          : null,
      };
    }
    if (screen.name === 'route' && routeDestination) {
      const destinationFeature =
        'featureId' in routeDestination && routeDestination.featureId
          ? routeDestination.featureId
          : null;
      const piece = playback.piece;
      let focus: MapFocus | null = null;
      // Exploded view: no focus, so each renderer frames every floor.
      if (mapView === 'exploded') focus = null;
      else if (piece && piece.kind === 'floor')
        focus = focusOnPoints(
          `route-${routeSignature}-${playback.pieceIndex}`,
          piece.floorId,
          piece.points.map((n) => ({ x: n.x, y: n.y })),
          0.3,
          700,
        );
      else if (piece && piece.kind === 'vertical') {
        const node = playback.phase === 'transition' ? piece.from : piece.to;
        focus = focusOnPoints(
          `route-${routeSignature}-${playback.pieceIndex}-${playback.phase}`,
          node.floorId,
          [{ x: node.x, y: node.y }],
          0.4,
          560,
        );
      }
      return {
        ...base,
        selectedFeatureId: destinationFeature,
        destinationNodeId: routeDestination.nodeId,
        destinationLabel:
          'unitNumber' in routeDestination
            ? tenantText(routeDestination as Tenant, 'name')
            : routeDestination.name,
        focus,
        labelMode: 'route' as const,
      };
    }
    return { ...base, focus: focusOnFloor(floor) };
  }, [
    screen,
    data,
    floorId,
    startNode.id,
    tenantById,
    poiById,
    routeDestination,
    playback.piece,
    playback.pieceIndex,
    playback.phase,
    mapView,
    routeSignature,
    tenantText,
  ]);

  const activeConnectorNodeIds =
    screen.name === 'route' &&
    playback.phase === 'transition' &&
    playback.piece?.kind === 'vertical'
      ? [playback.piece.from.id, playback.piece.to.id]
      : null;
  const mapHidden = screen.name === 'offers' || screen.name === 'events' || screen.name === 'help';
  const currentFloor = data.floors.find((f) => f.id === floorId) ?? data.floors[0];

  const onSelectFeature = (featureId: string) => {
    const tenant = data.tenants.find((x) => x.featureId === featureId);
    if (tenant) return openTenant(tenant.id);
    const poi = data.pois.find((p) => p.featureId === featureId);
    if (poi) openPoi(poi.id);
  };

  /* ---------------- render ---------------- */

  const stageClass = [
    'kiosk-stage',
    `screen-${screen.name}`,
    screen.name === 'place' && screen.collapsed ? 'is-collapsed' : '',
    searchOpen ? 'search-open' : '',
    a11y.largeText ? 'a11y-large' : '',
    a11y.highContrast ? 'a11y-contrast' : '',
    reducedMotion ? 'reduced-motion' : '',
  ].join(' ');

  const primaryCategories = data.categories
    .filter((c) => c.primary)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const categoryTenants =
    screen.name === 'category'
      ? data.tenants
          .filter(
            (x) =>
              x.categoryId === screen.categoryId &&
              (categoryFloor === 'all' || x.floorId === categoryFloor),
          )
          .sort((a, b) => a.floorId.localeCompare(b.floorId) || a.name.localeCompare(b.name))
      : [];

  return (
    <div
      className={stageClass}
      onPointerDownCapture={interact}
      onKeyDownCapture={interact}
      onClickCapture={(event) => {
        if (Date.now() < ignoreClicksUntil.current) {
          event.stopPropagation();
          event.preventDefault();
        }
      }}
    >
      <header className="kiosk-header">
        <button type="button" className="kiosk-brand" onClick={goHome} aria-label={t('nav.home')}>
          <Logo height={68} />
        </button>
        <div className="kiosk-venue">
          <strong>{data.venue.name}</strong>
          <span>{data.venue.openingHours}</span>
        </div>
        <div className="kiosk-header-right">
          {!online ? (
            <span className="offline-pill" role="status">
              <Glyph name="wifiOff" size={20} /> {t('common.offline')}
            </span>
          ) : null}
          <div className="kiosk-clock">
            <strong>{clock.time}</strong>
            <span>{clock.date}</span>
          </div>
          <button
            type="button"
            className="lang-toggle"
            onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
            aria-label={t('lang.label')}
          >
            <WayIcon name="language" size={44} />
            <span>{lang === 'en' ? 'हिन्दी' : 'English'}</span>
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setScreen({ name: 'help' })}
            aria-label={t('a11y.title')}
          >
            <WayIcon name="accessibility" size={46} />
          </button>
        </div>
      </header>

      {screen.name === 'home' ? (
        <section className="kiosk-home">
          <div className="home-hero">
            <h1>{t('home.greeting')}</h1>
            <p>{t('home.subtitle')}</p>
          </div>
          <button type="button" className="search-field" onClick={() => setSearchOpen(true)}>
            <WayIcon name="search" size={58} />
            <span>{t('search.placeholder')}</span>
            <span className="search-kbd">
              <Glyph name="keyboard" size={30} />
            </span>
          </button>
          <div className="category-grid">
            {primaryCategories.map((category, i) => (
              <button
                key={category.id}
                type="button"
                className="category-tile"
                style={{ ['--tile' as string]: category.color, animationDelay: `${i * 40}ms` }}
                onClick={() => openCategory(category.id)}
              >
                <span className="category-icon">
                  <WayIcon name={categoryIcon(category.icon)} size="100%" />
                </span>
                <span>{category.name}</span>
              </button>
            ))}
            <button
              type="button"
              className="category-tile is-secondary"
              style={{ ['--tile' as string]: '#f04b4b' }}
              onClick={() => setScreen({ name: 'offers' })}
            >
              <span className="category-icon">
                <WayIcon name="offers" size="100%" />
              </span>
              <span>{t('categories.offers')}</span>
            </button>
            <button
              type="button"
              className="category-tile is-secondary"
              style={{ ['--tile' as string]: '#ffb020' }}
              onClick={() => setScreen({ name: 'events' })}
            >
              <span className="category-icon">
                <WayIcon name="events" size="100%" />
              </span>
              <span>{t('categories.events')}</span>
            </button>
          </div>
          <div className="amenity-row">
            {amenityShortcuts.map((a) => (
              <button
                key={a.type}
                type="button"
                className="amenity-tile"
                onClick={() => openAmenity(a.type)}
              >
                <WayIcon name={a.icon} size={64} />
                <span>{t(a.key)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {screen.name === 'category'
        ? (() => {
            const category = data.categories.find((c) => c.id === screen.categoryId);
            const counts = data.floors.map((f) => ({
              floor: f,
              count: data.tenants.filter(
                (x) => x.categoryId === screen.categoryId && x.floorId === f.id,
              ).length,
            }));
            return (
              <section className="category-screen">
                <header className="category-head">
                  <button type="button" className="btn btn-ghost btn-lg" onClick={goHome}>
                    <Glyph name="arrowLeft" size={26} /> {t('common.back')}
                  </button>
                  <span className="category-head-icon">
                    <WayIcon name={categoryIcon(category?.icon ?? 'sparkle')} size="100%" />
                  </span>
                  <h1>{category?.name}</h1>
                </header>
                <div className="segmented is-large" role="tablist">
                  <button
                    type="button"
                    className={categoryFloor === 'all' ? 'is-active' : ''}
                    onClick={() => setCategoryFloor('all')}
                  >
                    All floors
                  </button>
                  {counts
                    .filter((c) => c.count)
                    .map(({ floor, count }) => (
                      <button
                        key={floor.id}
                        type="button"
                        className={categoryFloor === floor.id ? 'is-active' : ''}
                        onClick={() => {
                          setCategoryFloor(floor.id);
                          setFloorId(floor.id);
                        }}
                      >
                        {floor.shortName} <small>{count}</small>
                      </button>
                    ))}
                </div>
                <div className="tenant-grid">
                  {categoryTenants.map((tenant, i) => {
                    const floor = data.floors.find((f) => f.id === tenant.floorId);
                    const minutes = minutesTo(tenant.nodeId);
                    return (
                      <button
                        key={tenant.id}
                        type="button"
                        className="tenant-card"
                        style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                        onClick={() => openTenant(tenant.id)}
                      >
                        <LogoTile tenant={tenant} size={92} />
                        <span className="tenant-card-text">
                          <strong>{tenantText(tenant, 'name')}</strong>
                          <span>{tenant.subcategory}</span>
                          <small>
                            {floor?.shortName} · {tenant.unitNumber}
                            {minutes ? ` · ${minutes} min` : ''}
                          </small>
                          {openState(tenant, now, data.venue.timezone).state !== 'open' ? (
                            <OpenBadge tenant={tenant} timezone={data.venue.timezone} t={t} />
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })()
        : null}

      {screen.name === 'place' && screen.target.kind === 'tenant' && tenantById(screen.target.id)
        ? (() => {
            const tenant = tenantById(screen.target.id)!;
            return screen.collapsed ? (
              <div className="place-mini">
                <LogoTile tenant={tenant} size={84} />
                <div>
                  <strong>{tenant.name}</strong>
                  <span>
                    {data.floors.find((f) => f.id === tenant.floorId)?.shortName} ·{' '}
                    {tenant.unitNumber}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-lg"
                  onClick={() => setScreen({ ...screen, collapsed: false })}
                >
                  <Glyph name="chevronUp" size={26} /> Details
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-xl"
                  onClick={() => startRoute(screen.target)}
                >
                  <WayIcon name="directions" size={44} /> {t('tenant.getDirections')}
                </button>
              </div>
            ) : (
              <TenantSheet
                data={data}
                tenant={tenant}
                minutes={minutesTo(tenant.nodeId)}
                onClose={goHome}
                onDirections={() => startRoute(screen.target)}
                onViewOnMap={() => setScreen({ ...screen, collapsed: true })}
                onSendToPhone={() => sendToPhone(screen.target)}
                onShowQr={(url, title) => setQr({ kind: 'url', url, title })}
              />
            );
          })()
        : null}

      {screen.name === 'place' && screen.target.kind === 'poi' && poiById(screen.target.id)
        ? (() => {
            const poi = poiById(screen.target.id)!;
            const alternatives = data.pois
              .filter((p) => p.type === poi.type && p.id !== poi.id)
              .map((p) => ({ poi: p, minutes: minutesTo(p.nodeId) }))
              .sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999))
              .slice(0, 5);
            return (
              <PoiSheet
                data={data}
                poi={poi}
                minutes={minutesTo(poi.nodeId)}
                alternatives={alternatives}
                onClose={goHome}
                onDirections={() => startRoute(screen.target)}
                onSendToPhone={() => sendToPhone(screen.target)}
                onSelectPoi={openPoi}
              />
            );
          })()
        : null}

      {screen.name === 'route' && routeDestination ? (
        route ? (
          <>
            <RouteSummary
              data={data}
              route={route}
              destinationName={
                'unitNumber' in routeDestination
                  ? tenantText(routeDestination as Tenant, 'name')
                  : routeDestination.name
              }
              destinationFloorId={routeDestination.floorId}
              floorId={floorId}
              onFloor={(id) => {
                playback.skip();
                setMapView('floor');
                setFloorId(id);
              }}
            />
            <RoutePanel
              route={route}
              pieces={pieces}
              pieceIndex={playback.pieceIndex}
              phase={playback.phase}
              accessible={accessible}
              onAccessible={(value) => {
                setAccessible(value);
                if (value)
                  analytics.track('accessible_route_selected', { destinationId: screen.target.id });
              }}
              onReplay={() => {
                setFloorId(startNode.floorId);
                playback.replay();
              }}
              onSendToPhone={() => sendToPhone(screen.target)}
              onBack={() => setScreen({ name: 'place', target: screen.target })}
              onStartOver={goHome}
              view={mapView}
              onView={(next) => {
                analytics.track('map_view_changed', { view: next });
                setMapView(next);
                if (next === 'floor') setFloorId(routeDestination.floorId);
                playback.replay();
              }}
            />
          </>
        ) : (
          <section className="route-error">
            <EmptyState
              icon="directions"
              title={t('route.unavailable.title')}
              body={accessible ? t('route.noAccessible') : t('route.unavailable.body')}
            >
              <div className="route-error-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-xl"
                  onClick={() => setAccessible(!accessible)}
                >
                  <WayIcon name="accessibility" size={44} />{' '}
                  {accessible ? t('route.standard') : t('route.accessible')}
                </button>
                {data.pois.find((p) => p.type === 'Information') ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-xl"
                    onClick={() => openPoi(data.pois.find((p) => p.type === 'Information')!.id)}
                  >
                    <WayIcon name="information" size={44} /> {t('help.info')}
                  </button>
                ) : null}
                <button type="button" className="btn btn-ghost btn-xl" onClick={goHome}>
                  {t('route.startOver')}
                </button>
              </div>
            </EmptyState>
          </section>
        )
      ) : null}

      {screen.name === 'offers' ? (
        <OffersPage
          data={data}
          onTenant={openTenant}
          onDirections={(id) => startRoute({ kind: 'tenant', id })}
          onBack={goHome}
        />
      ) : null}
      {screen.name === 'events' ? (
        <EventsPage data={data} onDirections={openDestination} onBack={goHome} />
      ) : null}
      {screen.name === 'help' ? (
        <HelpPage
          data={data}
          supportPhone={config?.supportPhone ?? ''}
          a11y={a11y}
          setA11y={setA11y}
          onPoi={(poi) => openPoi(poi.id)}
          onBack={goHome}
        />
      ) : null}

      <div className={`kiosk-map-slot ${mapHidden ? 'is-hidden' : ''}`} aria-hidden={mapHidden}>
        <MapRenderer
          mode={mapMode}
          data={data}
          floorId={floorId}
          view={mapView}
          youAreHereLabel={t('map.youAreHere')}
          pieces={screen.name === 'route' ? pieces : undefined}
          progressRef={screen.name === 'route' ? playback.progressRef : undefined}
          activeConnectorNodeIds={activeConnectorNodeIds}
          zoomCommand={zoom}
          reducedMotion={reducedMotion}
          onSelectFeature={screen.name === 'route' ? undefined : onSelectFeature}
          onSelectMarker={
            screen.name === 'route' ? undefined : (poiIds) => poiIds[0] && openPoi(poiIds[0])
          }
          onFallback={() => setMapMode('svg')}
          {...mapInputs}
        />
        <div className="map-floor-chip">
          <span className="map-floor-code">
            {mapView === 'exploded' ? '3F' : currentFloor.shortName}
          </span>
          <span>
            <strong>{mapView === 'exploded' ? t('map.exploded') : currentFloor.theme}</strong>
            <small>
              {mapView === 'exploded'
                ? data.venue.name
                : `${data.tenants.filter((x) => x.floorId === currentFloor.id).length} places`}
            </small>
          </span>
        </div>
        {mapView === 'floor' ? (
          <FloorSwitcher
            floors={data.floors}
            floorId={floorId}
            label={t('map.floor')}
            routeFloorIds={route && screen.name === 'route' ? route.floorIds : undefined}
            onChange={(id) => {
              if (screen.name === 'route') playback.skip();
              setFloorId(id);
            }}
          />
        ) : null}
        <MapToolbar
          mode={mapMode}
          view={mapView}
          onMode={(mode) => {
            analytics.track('map_view_changed', { mode });
            setMapMode(mode);
          }}
          onView={screen.name === 'route' ? undefined : (next) => setMapView(next)}
          onZoom={(kind) => setZoom({ kind, nonce: Date.now() })}
          labels={{
            zoomIn: t('map.zoomIn'),
            zoomOut: t('map.zoomOut'),
            recenter: t('map.recenter'),
            view3d: t('map.view3d'),
            view2d: t('map.view2d'),
            exploded: t('map.exploded'),
            single: t('map.singleFloor'),
          }}
        />
        {screen.name === 'route' && mapView !== 'exploded' ? (
          <TransitionBanner data={data} piece={playback.piece} phase={playback.phase} />
        ) : null}
        {screen.name === 'route' &&
        mapView !== 'exploded' &&
        playback.phase === 'arrived' &&
        route ? (
          <div className="arrived-chip" role="status">
            <WayIcon name="destination" size={40} /> {t('route.arrived')}
          </div>
        ) : null}
      </div>

      {screen.name !== 'route' && screen.name !== 'place' ? (
        <nav className="kiosk-nav" aria-label="Main">
          {(
            [
              ['home', 'home', 'nav.home'],
              ['offers', 'offers', 'nav.offers'],
              ['events', 'events', 'nav.events'],
              ['help', 'help', 'nav.help'],
            ] as const
          ).map(([name, icon, key]) => (
            <button
              key={name}
              type="button"
              className={screen.name === name ? 'is-active' : ''}
              onClick={() => (name === 'home' ? goHome() : setScreen({ name } as Screen))}
            >
              <WayIcon name={icon} size={52} />
              <span>{t(key)}</span>
            </button>
          ))}
          {config?.showPoweredBy !== false ? (
            <span className="powered-by">Powered by BrainADZ</span>
          ) : null}
        </nav>
      ) : null}

      {searchOpen ? (
        <SearchOverlay
          data={data}
          query={query}
          setQuery={setQuery}
          costs={costs}
          onClose={() => setSearchOpen(false)}
          onTenant={openTenant}
          onPoi={openPoi}
          onCategory={openCategory}
        />
      ) : null}
      {qr ? <QrPanel request={qr} config={config} onClose={() => setQr(null)} /> : null}
      {toast ? (
        <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />
      ) : null}
      {ad ? <AdMode data={data} device={device} onExit={exitAd} /> : null}
    </div>
  );
}
