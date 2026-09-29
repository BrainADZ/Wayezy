'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Accessibility,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  CornerUpLeft,
  CornerUpRight,
  Globe,
  Heart,
  MapPin,
  Menu,
  Navigation,
  Phone,
  QrCode,
  Search,
  SlidersHorizontal,
  Store,
  Tag,
  X,
} from 'lucide-react';
import { isOpen, type Snapshot } from '../../../packages/domain';
import { findRoute } from '../../../packages/routing';
import { findGroundDirectoryRoute } from '../../../packages/routing/ground-directory';
import { search } from '../../../packages/search';
import type { Device } from '../../../packages/domain';
import type { PublicConfig } from '../shared/content';
import { analytics } from '../shared/analytics';
import { QrPanel, type QrRequest } from '../kiosk/QrPanel';
import { mapPlaces, placeColor, type MapPlace } from './explorer-model';
import { PlaceIcon } from './place-icon';
import { ExplorerMap } from './explorer-map';
import { groundPublicData } from './ground-public-data';
import retailIcon from '@material-design-icons/svg/outlined/shopping_bag.svg';
import diningIcon from '@material-design-icons/svg/outlined/restaurant.svg';
import homeDecorIcon from '@material-design-icons/svg/outlined/chair.svg';
import entertainmentIcon from '@material-design-icons/svg/outlined/theaters.svg';

type Panel = 'search' | 'details' | 'plan' | 'steps';
type SearchTab = 'Categories' | 'Popular' | 'Amenities';

function StepIcon({ text, connector }: { text: string; connector: boolean }) {
  const Icon = connector
    ? ArrowUpDown
    : text.includes('arrived')
      ? MapPin
      : text.includes('left')
        ? CornerUpLeft
        : text.includes('right')
          ? CornerUpRight
          : ArrowUp;
  return <Icon size={22} aria-hidden="true" />;
}

export function MapExplorer({
  data: sourceData,
  onReturnToAd,
  device,
  config,
  online,
}: {
  data: Snapshot;
  device: Device;
  config: PublicConfig | null;
  online: boolean;
  onReturnToAd: () => void;
}) {
  const data = useMemo(() => groundPublicData(sourceData), [sourceData]);
  const root = useRef<HTMLDivElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const detailsPanel = useRef<HTMLElement>(null);
  const linkedPlaceOpened = useRef(false);
  const places = useMemo(() => mapPlaces(data), [data]);
  const initialBrand =
    places.find((place) => place.name.toLowerCase() === 'starbucks') ??
    places.find((place) => place.kind === 'tenant');
  const [panel, setPanel] = useState<Panel>(initialBrand ? 'details' : 'search');
  const [selectedId, setSelectedId] = useState<string | undefined>(initialBrand?.id);
  const [floorId, setFloorId] = useState('l0');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<SearchTab>('Popular');
  const [category, setCategory] = useState('');
  const [browseCategory, setBrowseCategory] = useState(initialBrand?.categoryId ?? 'fashion');
  const [floorFilter, setFloorFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [originId, setOriginId] = useState('start');
  const [accessible, setAccessible] = useState(false);
  const [step, setStep] = useState(0);
  const [utility, setUtility] = useState<'menu' | 'language' | 'notifications' | 'offers' | null>(
    null,
  );
  const [now, setNow] = useState<Date | null>(null);
  const [message, setMessage] = useState('');
  const [showRouteQR, setShowRouteQR] = useState(false);
  const selected = places.find((place) => place.id === selectedId);
  const startNode = 'ground-entry-starbucks';
  const origin = originId === 'start' ? undefined : places.find((place) => place.id === originId);
  const originNodeId = origin?.nodeId ?? startNode;
  const routing = panel === 'plan' || panel === 'steps';
  const route = useMemo(
    () =>
      routing && selected
        ? selected.floorId === 'l0' && (origin?.floorId ?? 'l0') === 'l0'
          ? findGroundDirectoryRoute(
              originNodeId,
              selected.nodeId,
              accessible,
              data.edges,
              data.nodes,
            )
          : findRoute(
              data.nodes,
              data.edges,
              originNodeId,
              selected.nodeId,
              accessible,
              data.floors,
            )
        : null,
    [routing, selected, data, originNodeId, accessible],
  );
  const qrRequest = useMemo<QrRequest | null>(
    () =>
      selected && route
        ? {
            kind: 'route',
            deviceId: device.id,
            startNodeId: originNodeId,
            destinationId: selected.id,
            accessible,
            title: selected.name,
            subtitle:
              selected.floorId === 'l0'
                ? 'Ground Floor walking route'
                : `${route.minutes} min · ${route.distance} m`,
          }
        : null,
    [selected, route, device.id, originNodeId, accessible],
  );
  useEffect(() => {
    setStep(0);
    setShowRouteQR(false);
  }, [selectedId, originNodeId, accessible, data.version]);
  useEffect(() => {
    if (panel === 'details' && selectedId) {
      detailsPanel.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedId, panel]);
  useEffect(() => {
    if (routing && selected)
      analytics.track(route ? 'route_generated' : 'route_failed', {
        destinationId: selected.id,
        accessible,
      });
  }, [routing, selectedId, route]);
  useEffect(() => {
    if (!query.trim()) return;
    const timer = window.setTimeout(() => analytics.track('search_submitted', { query }), 600);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (selectedId && !selected) {
      setSelectedId(undefined);
      setPanel('search');
      setShowRouteQR(false);
    }
    if (!data.floors.some((f) => f.id === floorId)) setFloorId('l0');
  }, [data, selectedId, selected, floorId]);
  const activeStep = panel === 'steps' ? route?.steps[step] : undefined;
  const floorName = (id: string) => data.floors.find((floor) => floor.id === id)?.name ?? id;
  const matches = useMemo(() => {
    if (!query.trim())
      return places.filter(
        (place) =>
          (!category || place.categoryId === category) &&
          (!floorFilter || place.floorId === floorFilter) &&
          (tab !== 'Amenities' || place.kind === 'poi'),
      );
    const ids = search(data, query, category, floorFilter).map((result) => result.id);
    return ids
      .map((id) => places.find((place) => place.id === id))
      .filter(
        (place): place is MapPlace => !!place && (tab !== 'Amenities' || place.kind === 'poi'),
      );
  }, [data, query, category, floorFilter, tab, places]);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 3500);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (panel === 'search') searchInput.current?.focus();
  }, [panel]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement).matches('input, textarea, select');
      if (
        (event.key === 'k' && (event.ctrlKey || event.metaKey)) ||
        (event.key === '/' && !typing)
      ) {
        event.preventDefault();
        setPanel('search');
      }
      if (event.key === 'Escape') {
        if (showRouteQR) {
          setShowRouteQR(false);
          return;
        }
        setPanel('search');
        setSelectedId(undefined);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showRouteQR]);
  useEffect(() => {
    if (panel === 'steps')
      document
        .querySelector('.explorer-step[aria-current="step"]')
        ?.scrollIntoView({ block: 'nearest' });
  }, [panel, step]);

  function selectPlace(place: MapPlace) {
    analytics.track(place.kind === 'tenant' ? 'tenant_profile_viewed' : 'amenity_selected', {
      destinationId: place.id,
    });
    setSelectedId(place.id);
    if (place.kind === 'tenant') setBrowseCategory(place.categoryId);
    setFloorId(place.floorId);
    setPanel('details');
    setStep(0);
  }
  function closePanel() {
    setPanel('search');
    setSelectedId(undefined);
  }
  function changeStep(index: number) {
    if (!route?.steps[index]) return;
    setStep(index);
    setFloorId(route.steps[index].floorId);
  }
  function openSearch() {
    setPanel('search');
    searchInput.current?.focus();
    setSelectedId(undefined);
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch {
      setMessage('Fullscreen is not available in this browser.');
    }
  }
  useEffect(() => {
    if (linkedPlaceOpened.current) return;
    const id = new URLSearchParams(location.search).get('place');
    const place = places.find((item) => item.id === id);
    if (place) {
      linkedPlaceOpened.current = true;
      selectPlace(place);
    }
  }, [places]);

  const brandTenant = (place: MapPlace) =>
    places.find(
      (candidate) =>
        candidate.kind === 'tenant' &&
        candidate.name.toLowerCase() === place.name.toLowerCase() &&
        candidate.tenant?.heroImage,
    )?.tenant ?? place.tenant;
  const selectedTenant = selected ? brandTenant(selected) : undefined;
  const tenantOpen =
    selectedTenant && now ? isOpen(selectedTenant, now, data.venue.timezone) : null;
  const availability = selected?.tenant
    ? tenantOpen === null
      ? 'Hours below'
      : tenantOpen
        ? 'Open now'
        : 'Closed'
    : 'Amenity';
  const categoryImages: Record<string, string> = {
    fashion: '/demo/stores/zara.webp',
    dining: '/demo/stores/starbucks.webp',
    home: '/demo/ads/riverside-house.webp',
    entertainment: '/demo/ads/festive-fashion-week.webp',
  };
  const brandImage = (place: MapPlace) =>
    brandTenant(place)?.heroImage || categoryImages[place.categoryId] || '';
  const brandOffer = (place: MapPlace) => {
    if (!place.tenant) return undefined;
    const tenantIds = places
      .filter(
        (candidate) =>
          candidate.kind === 'tenant' && candidate.name.toLowerCase() === place.name.toLowerCase(),
      )
      .map((candidate) => candidate.tenant?.id);
    return data.offers.find(
      (offer) => tenantIds.includes(offer.tenantId) && offer.status === 'ACTIVE',
    );
  };
  const selectedOffer = selected ? brandOffer(selected) : undefined;
  const visibleBrands = Array.from(
    new Map(
      places
        .filter((place) => place.kind === 'tenant' && place.categoryId === browseCategory)
        .sort(
          (a, b) =>
            Number(Boolean(brandImage(b))) - Number(Boolean(brandImage(a))) ||
            a.name.localeCompare(b.name),
        )
        .map((place) => [place.name.toLowerCase(), place]),
    ).values(),
  ).filter((place) => place.name.toLowerCase() !== selected?.name.toLowerCase());
  const browseCategoryName =
    data.categories.find((item) => item.id === browseCategory)?.name ?? 'Brands';
  const todayHours =
    selectedTenant && now
      ? selectedTenant.hours.find((entry) => entry.day === now.getDay())
      : undefined;
  const displayTime = (value?: string) => {
    if (!value) return '';
    const [hour, minute] = value.split(':').map(Number);
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(
      new Date(2026, 0, 1, hour, minute),
    );
  };

  return (
    <div className="map-experience" ref={root}>
      <header className="explorer-header">
        <img className="explorer-brand-logo" src="/Green logo.png" alt="IREO Boulevard" />
        <div className="explorer-venue">
          <strong>{data.venue.name}</strong>
          <span>{online ? data.venue.openingHours : 'Offline · Saved directory'}</span>
        </div>
        <div className="explorer-header-tools">
          <time className="explorer-clock" dateTime={now?.toISOString()}>
            <strong>
              {now
                ? new Intl.DateTimeFormat('en-US', {
                    timeZone: data.venue.timezone,
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(now)
                : '--:-- --'}
            </strong>
            <span>
              {now
                ? new Intl.DateTimeFormat('en-GB', {
                    timeZone: data.venue.timezone,
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  }).format(now)
                : '---, -- --- ----'}
            </span>
          </time>
          <button
            ref={searchTrigger}
            type="button"
            className={`explorer-icon-button ${panel === 'search' ? 'active' : ''}`}
            aria-label="Search the mall"
            aria-expanded={panel === 'search'}
            aria-controls="mall-search-panel"
            onClick={openSearch}
          >
            <Search size={21} />
          </button>
          <button
            type="button"
            className="explorer-icon-button"
            aria-label="Notifications"
            aria-expanded={utility === 'notifications'}
            onClick={() => setUtility(utility === 'notifications' ? null : 'notifications')}
          >
            <Bell size={19} />
          </button>
          <button
            type="button"
            className="explorer-language"
            aria-label="Language"
            aria-expanded={utility === 'language'}
            onClick={() => setUtility(utility === 'language' ? null : 'language')}
          >
            <Globe size={17} /> EN <ChevronDown size={14} />
          </button>
          <button
            type="button"
            className="explorer-icon-button"
            aria-label="Menu"
            aria-expanded={utility === 'menu'}
            onClick={() => setUtility(utility === 'menu' ? null : 'menu')}
          >
            <Menu size={23} />
          </button>
        </div>
        <div className="explorer-header-tagline" aria-label="Find, explore, enjoy">
          <span>FIND</span>
          <span>EXPLORE</span>
          <span>ENJOY</span>
        </div>
        {utility && (
          <div className="explorer-utility">
            <button
              className="explorer-utility-close"
              aria-label="Close menu"
              onClick={() => setUtility(null)}
            >
              <X size={16} />
            </button>
            {utility === 'menu' && (
              <>
                <h3>Explore {data.venue.name}</h3>
                <button onClick={openSearch}>
                  <Search size={18} /> Search the directory
                </button>
                <button
                  onClick={() => {
                    setTab('Amenities');
                    setCategory('');
                    setQuery('');
                    setPanel('search');
                    setUtility(null);
                  }}
                >
                  <Accessibility size={18} /> Amenities
                </button>
                <button onClick={() => setUtility('offers')}>
                  <Store size={18} /> Offers & promotions
                </button>
                <button onClick={onReturnToAd}>
                  <ArrowLeft size={18} /> Back to welcome screen
                </button>
              </>
            )}
            {utility === 'language' && (
              <>
                <h3>Language</h3>
                <p>
                  English <Check size={16} />
                </p>
              </>
            )}
            {utility === 'notifications' && (
              <>
                <h3>Visitor information</h3>
                <p>{data.venue.description}</p>
                <small>{data.venue.address}</small>
              </>
            )}
            {utility === 'offers' && (
              <>
                <h3>Offers & promotions</h3>
                {data.offers
                  .filter((offer) => offer.status === 'ACTIVE')
                  .map((offer) => (
                    <button
                      key={offer.id}
                      onClick={() => {
                        const place = places.find((item) => item.id === offer.tenantId);
                        if (place) selectPlace(place);
                      }}
                    >
                      <span>
                        <b>{offer.title}</b>
                        <small>{offer.description}</small>
                      </span>
                      <ArrowRight size={18} />
                    </button>
                  ))}
                {!data.offers.some((offer) => offer.status === 'ACTIVE') && (
                  <p>No current offers.</p>
                )}
              </>
            )}
          </div>
        )}
      </header>
      <main className="explorer-workspace">
        <ExplorerMap
          data={data}
          startNodeId={originNodeId}
          places={places}
          floorId={floorId}
          onFloorChange={setFloorId}
          selectedId={selectedId}
          onSelect={selectPlace}
          matchingIds={
            panel === 'search' && (query.trim() || category || tab === 'Amenities')
              ? matches.map((place) => place.id)
              : undefined
          }
          searchFocusId={
            panel === 'search' && query.trim()
              ? matches.find((place) => place.floorId === floorId)?.id
              : undefined
          }
          route={route}
          stepIndex={panel === 'steps' ? step : null}
          focusNodeId={activeStep?.nodeId}
          panelOpen={true}
          onFullscreen={fullscreen}
        />
        {routing && (
          <button
            className="explorer-exit-route"
            aria-label="Close directions"
            onClick={closePanel}
          >
            <X size={22} />
          </button>
        )}

        {panel === 'search' && (
          <div
            id="mall-search-panel"
            className="explorer-panel explorer-search-panel"
            role="region"
            aria-label="Search the mall"
          >
            <div className="explorer-search-line">
              <div>
                <Search size={19} />
                <input
                  ref={searchInput}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search the mall..."
                  aria-label="Search stores and amenities"
                />
                {query && (
                  <button
                    aria-label="Clear search"
                    onClick={() => {
                      setQuery('');
                      searchInput.current?.focus();
                    }}
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
              <button
                className="explorer-round-button"
                aria-label="Search filters"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen(!filtersOpen)}
              >
                <SlidersHorizontal size={19} />
              </button>
            </div>
            <div className="explorer-search-tabs" role="tablist" aria-label="Browse places">
              {(['Categories', 'Popular', 'Amenities'] as const).map((item) => (
                <button
                  key={item}
                  role="tab"
                  aria-selected={tab === item}
                  onClick={() => {
                    setTab(item);
                    setCategory('');
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
            {filtersOpen && (
              <div className="explorer-filters">
                {data.floors.length > 1 && (
                  <label>
                    Floor
                    <select
                      aria-label="Filter by floor"
                      value={floorFilter}
                      onChange={(event) => setFloorFilter(event.target.value)}
                    >
                      <option value="">All floors</option>
                      {data.floors.map((floor) => (
                        <option key={floor.id} value={floor.id}>
                          {floor.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  onClick={() => {
                    setFloorFilter('');
                    setCategory('');
                    setQuery('');
                  }}
                >
                  Reset filters
                </button>
              </div>
            )}
            {tab === 'Categories' && (
              <div className="explorer-category-list">
                <button className={!category ? 'selected' : ''} onClick={() => setCategory('')}>
                  All stores
                </button>
                {data.categories.map((item) => (
                  <button
                    key={item.id}
                    className={category === item.id ? 'selected' : ''}
                    onClick={() => setCategory(item.id)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            )}
            {!query && !category && tab === 'Popular' && (
              <div className="explorer-featured-places">
                {places
                  .filter(
                    (place) =>
                      place.kind === 'tenant' && (!floorFilter || place.floorId === floorFilter),
                  )
                  .slice(0, 3)
                  .map((place) => (
                    <button key={place.id} onClick={() => selectPlace(place)}>
                      <span>
                        {place.tenant?.logo ? (
                          <img className="explorer-featured-logo" src={place.tenant.logo} alt="" />
                        ) : (
                          <PlaceIcon place={place} size={30} />
                        )}
                      </span>
                      <b>{place.name}</b>
                      <small>{floorName(place.floorId)}</small>
                    </button>
                  ))}
              </div>
            )}
            <div className="explorer-results-title">
              <span>
                {query ? `Results for “${query}”` : tab === 'Amenities' ? 'Amenities' : 'Directory'}
              </span>
              <small>{matches.length} places</small>
            </div>
            <div className="explorer-search-results">
              {matches.map((place) => (
                <button
                  key={place.id}
                  className="explorer-search-result"
                  onClick={() => selectPlace(place)}
                >
                  {place.tenant?.logo ? (
                    <img className="explorer-search-logo" src={place.tenant.logo} alt="" />
                  ) : (
                    <span className="explorer-place-icon" style={{ color: placeColor(place) }}>
                      <PlaceIcon place={place} />
                    </span>
                  )}
                  <span>
                    <b>{place.name}</b>
                    <small>
                      {floorName(place.floorId)} · {place.category}
                    </small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              ))}
              {matches.length === 0 && (
                <div className="explorer-empty">
                  <Search size={25} />
                  <b>No places found</b>
                  <p>Try a store name, “Italian food”, or “ATM”.</p>
                  <button
                    onClick={() => {
                      setQuery('');
                      setCategory('');
                      setFloorFilter('');
                      setTab('Popular');
                    }}
                  >
                    Show all places
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {panel === 'details' && selected && (
          <aside
            ref={detailsPanel}
            className="explorer-panel explorer-details-panel"
            aria-label={`${selected.name} details`}
          >
            <button type="button" className="explorer-detail-search" onClick={openSearch}>
              <Search size={20} />
              <span>Search shops, dining, home decor, services...</span>
            </button>
            <div className="explorer-detail-categories" aria-label="Browse categories">
              {[
                ['Fashion', 'fashion', retailIcon],
                ['Dining', 'dining', diningIcon],
                ['Home Decor', 'home', homeDecorIcon],
                ['Lifestyle', 'entertainment', entertainmentIcon],
              ].map(([label, categoryId, icon]) => (
                <button
                  key={label}
                  type="button"
                  className={browseCategory === categoryId ? 'active' : ''}
                  onClick={() => {
                    const next = places
                      .filter((place) => place.kind === 'tenant' && place.categoryId === categoryId)
                      .sort(
                        (a, b) => Number(Boolean(brandImage(b))) - Number(Boolean(brandImage(a))),
                      );
                    setBrowseCategory(categoryId);
                    setCategory(categoryId);
                    setQuery('');
                    if (next[0]) selectPlace(next[0]);
                  }}
                >
                  <span>
                    <img src={icon} alt="" />
                  </span>
                  <small>{label}</small>
                </button>
              ))}
              <button type="button" onClick={openSearch}>
                <span className="explorer-more-dots">•••</span>
                <small>More</small>
              </button>
            </div>
            <article className="explorer-featured-brand">
              {brandImage(selected) ? (
                <img
                  className="explorer-detail-hero"
                  src={brandImage(selected)}
                  alt={`${selected.name} storefront`}
                />
              ) : (
                <span
                  className="explorer-brand-placeholder"
                  style={{ color: placeColor(selected) }}
                >
                  <PlaceIcon place={selected} size={44} />
                </span>
              )}
              <div className="explorer-featured-copy">
                <button className="explorer-favourite" aria-label={`Save ${selected.name}`}>
                  <Heart size={20} />
                </button>
                <h1>{selected.name}</h1>
                <p className="explorer-brand-line">
                  {selectedTenant?.subcategory ?? selected.category}
                  {selectedTenant?.productTypes
                    .slice(0, 2)
                    .map((item) => ` · ${item}`)
                    .join('')}
                </p>
                <p className="explorer-unit-line">
                  <b>{floorName(selected.floorId)}</b>
                  <span /> Unit {selected.tenant?.unitNumber ?? selected.name}
                </p>
                {selected.tenant && (
                  <p className="explorer-hours-line">
                    <Clock3 size={16} />
                    <span>
                      {todayHours?.closed
                        ? 'Closed today'
                        : `${displayTime(todayHours?.open)} – ${displayTime(todayHours?.close)}`}
                      <b className={tenantOpen ? 'explorer-open' : 'explorer-closed'}>
                        {availability}
                      </b>
                    </span>
                  </p>
                )}
                <p className="explorer-card-description">
                  {selectedTenant?.description ?? selected.description}
                </p>
              </div>
            </article>
            {selectedOffer && (
              <button className="explorer-offer-strip" type="button">
                <Store size={23} />
                <span>
                  <small>{selectedOffer.title}</small>
                  <b>{selectedOffer.highlight}</b>
                  <em>{selectedOffer.description}</em>
                </span>
                <ChevronRight size={18} />
              </button>
            )}
            <button
              className="explorer-primary explorer-directions-button"
              onClick={() => {
                analytics.track('route_requested', {
                  destinationId: selected.id,
                  accessible: false,
                });
                setAccessible(false);
                setStep(0);
                setPanel('plan');
              }}
            >
              <Navigation size={18} /> <span>Get Directions</span>
            </button>
            {visibleBrands.length > 0 && (
              <section className="explorer-dining-showcase">
                <div className="explorer-section-title">
                  <span>{browseCategoryName.toUpperCase()} AT IREO BOULEVARD</span>
                  <small>{visibleBrands.length + 1} brands</small>
                </div>
                <div className="explorer-brand-list">
                  {visibleBrands.map((brand) => {
                    const offer = brandOffer(brand);
                    const image = brandImage(brand);
                    return (
                      <button
                        key={brand.id}
                        className="explorer-dining-card"
                        onClick={() => selectPlace(brand)}
                      >
                        {image ? (
                          <img
                            loading="lazy"
                            decoding="async"
                            src={image}
                            alt={`${brand.name} storefront`}
                          />
                        ) : (
                          <span
                            className="explorer-list-placeholder"
                            style={{ color: placeColor(brand) }}
                          >
                            <PlaceIcon place={brand} size={32} />
                          </span>
                        )}
                        <span className="explorer-dining-copy">
                          <b>{brand.name}</b>
                          <small>
                            {brandTenant(brand)?.subcategory} <i /> Unit {brand.tenant?.unitNumber}
                          </small>
                          <em>
                            {brand.categoryId === 'dining'
                              ? '◷  15–20 min wait'
                              : floorName(brand.floorId)}
                          </em>
                          {offer ? (
                            <span className="explorer-dining-offer">
                              <Tag size={17} />
                              <span>
                                <b>{offer.highlight}</b>
                                <small>{offer.description}</small>
                              </span>
                              <ChevronRight size={17} />
                            </span>
                          ) : (
                            <span className="explorer-brand-summary">
                              {brandTenant(brand)?.shortSummary || brand.description}
                            </span>
                          )}
                        </span>
                        <Heart className="explorer-dining-heart" size={18} />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            {selected.poi?.accessible && (
              <p className="explorer-accessibility-note">
                <Accessibility size={16} /> Step-free access available
              </p>
            )}
            {selected.tenant && (
              <div className="explorer-contact-links">
                {selected.tenant.phone && (
                  <a href={`tel:${selected.tenant.phone.replace(/\s/g, '')}`}>
                    <Phone size={15} />
                    {selected.tenant.phone}
                  </a>
                )}
                {selected.tenant.website && (
                  <a
                    href={selected.tenant.website}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Visit store website"
                  >
                    <Globe size={18} />
                  </a>
                )}
              </div>
            )}
          </aside>
        )}

        {panel === 'plan' && selected && (
          <aside className="explorer-panel explorer-route-panel" aria-label="Directions planner">
            <div className="explorer-panel-heading">
              <button aria-label="Back to place details" onClick={() => setPanel('details')}>
                <ArrowLeft size={21} />
              </button>
              <h2>Directions</h2>
              <label className="explorer-accessible-toggle">
                Accessible
                <input
                  type="checkbox"
                  checked={accessible}
                  onChange={(event) => {
                    setAccessible(event.target.checked);
                    if (event.target.checked)
                      analytics.track('accessible_route_selected', {
                        destinationId: selected.id,
                      });
                  }}
                />
                <span />
              </label>
            </div>
            <div className="explorer-route-fields">
              <div className="explorer-endpoint-symbols">
                <span />
                <i />
                <MapPin size={17} />
              </div>
              <div>
                <label>
                  <span className="sr-only">Starting point</span>
                  <select
                    aria-label="Starting point"
                    value={originId}
                    onChange={(event) => setOriginId(event.target.value)}
                  >
                    <option value="start">You are here · Entry 1 — Starbucks side</option>
                    {places.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.name} · {floorName(place.floorId)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="sr-only">Destination</span>
                  <select
                    aria-label="Destination"
                    value={selected.id}
                    onChange={(event) => {
                      const place = places.find((item) => item.id === event.target.value);
                      if (place) {
                        setSelectedId(place.id);
                        setFloorId(place.floorId);
                      }
                    }}
                  >
                    {places.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.name} · {floorName(place.floorId)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                aria-label="Swap start and destination"
                onClick={() => {
                  const reverse = origin ?? places.find((place) => place.nodeId === startNode);
                  if (!reverse) {
                    setMessage('Choose a starting place to swap endpoints.');
                    return;
                  }
                  setOriginId(selected.id);
                  setSelectedId(reverse.id);
                  setFloorId(reverse.floorId);
                }}
              >
                <ArrowDownUp size={21} />
              </button>
            </div>
            {route ? (
              <div className="explorer-route-summary">
                <div>
                  <strong>
                    <Navigation size={18} />
                    {selected.floorId === 'l0'
                      ? 'Walking directions'
                      : `${route.minutes} ${route.minutes === 1 ? 'minute' : 'minutes'}`}
                  </strong>
                  <button
                    className="explorer-primary"
                    onClick={() => {
                      setStep(0);
                      setFloorId(route.steps[0]?.floorId ?? selected.floorId);
                      setPanel('steps');
                      setShowRouteQR(true);
                    }}
                  >
                    Start
                  </button>
                </div>
                <p>
                  To {selected.name}
                  {selected.floorId !== 'l0' && ` · ${route.distance} m`}
                  {selected.floorId === 'l0' && (
                    <small style={{ display: 'block', marginTop: 6 }}>
                      Follow the marked walkways to the store frontage.
                    </small>
                  )}
                </p>
                <span>
                  <Accessibility size={14} />
                  {accessible
                    ? 'Use lifts · Step-free route'
                    : selected.floorId === 'l0'
                      ? 'Ground Floor walkways'
                      : 'Fastest available route'}
                </span>
              </div>
            ) : (
              <div className="explorer-empty" role="status">
                <Navigation size={26} />
                <b>
                  {accessible && selected.floorId === 'l0'
                    ? 'Step-free route not verified yet'
                    : 'No route available'}
                </b>
                <p>
                  {selected.floorId === 'l0'
                    ? accessible
                      ? 'Step-free access needs confirmation. Standard walking directions may be available.'
                      : 'An entrance connection for this destination is not confirmed yet.'
                    : selected.floorId !== device.floorId
                      ? 'Connections between floors are pending.'
                      : 'Try another starting point or change the accessible-route setting.'}
                </p>
              </div>
            )}
            {selectedTenant && (
              <section
                className="explorer-route-brand-details"
                aria-label={`${selected.name} information`}
              >
                <div className="explorer-route-brand-heading">
                  {brandImage(selected) ? (
                    <img
                      loading="lazy"
                      decoding="async"
                      src={brandImage(selected)}
                      alt={`${selected.name} storefront`}
                    />
                  ) : (
                    <span style={{ color: placeColor(selected) }}>
                      <PlaceIcon place={selected} size={34} />
                    </span>
                  )}
                  <div>
                    <small>YOUR DESTINATION</small>
                    <h3>{selected.name}</h3>
                    <p>
                      {selectedTenant.subcategory} <i /> {floorName(selected.floorId)} <i /> Unit{' '}
                      {selected.tenant?.unitNumber}
                    </p>
                  </div>
                  <Heart size={19} />
                </div>
                <div className="explorer-route-brand-hours">
                  <Clock3 size={17} />
                  <span>
                    <b>
                      {todayHours?.closed
                        ? 'Closed today'
                        : `${displayTime(todayHours?.open)} – ${displayTime(todayHours?.close)}`}
                    </b>
                    <small className={tenantOpen ? 'explorer-open' : 'explorer-closed'}>
                      {availability}
                    </small>
                  </span>
                </div>
                <p className="explorer-route-brand-description">{selectedTenant.description}</p>
                {selectedOffer && (
                  <div className="explorer-route-brand-offer">
                    <Tag size={18} />
                    <span>
                      <small>{selectedOffer.title}</small>
                      <b>{selectedOffer.highlight}</b>
                      <em>{selectedOffer.description}</em>
                    </span>
                  </div>
                )}
                <div className="explorer-route-brand-info">
                  {selectedTenant.productTypes.length > 0 && (
                    <div>
                      <b>Products</b>
                      <p>{selectedTenant.productTypes.join(' · ')}</p>
                    </div>
                  )}
                  {selectedTenant.services.length > 0 && (
                    <div>
                      <b>Services</b>
                      <p>{selectedTenant.services.join(' · ')}</p>
                    </div>
                  )}
                </div>
                {selectedTenant.phone && (
                  <a
                    className="explorer-route-brand-phone"
                    href={`tel:${selectedTenant.phone.replace(/\s/g, '')}`}
                  >
                    <Phone size={15} /> {selectedTenant.phone}
                  </a>
                )}
              </section>
            )}
          </aside>
        )}

        {panel === 'steps' && selected && route && (
          <aside
            className="explorer-panel explorer-guidance-panel"
            aria-label="Step-by-step directions"
          >
            <div className="explorer-panel-heading">
              <button
                className="explorer-back-label"
                onClick={() => {
                  setPanel('plan');
                  setStep(0);
                }}
              >
                <ArrowLeft size={20} /> Back
              </button>
              <button
                className="explorer-guidance-close"
                aria-label="Close directions panel"
                onClick={closePanel}
              >
                <X size={19} />
              </button>
            </div>
            <button
              type="button"
              className="explorer-reopen-qr"
              onClick={() => setShowRouteQR(true)}
            >
              <QrCode size={17} /> Send route to phone
            </button>
            <div className="explorer-guidance-summary">
              <span>Directions to {selected.name}</span>
              <h2>
                {selected.floorId === 'l0'
                  ? 'Follow the marked route'
                  : `${route.minutes} ${route.minutes === 1 ? 'minute' : 'minutes'} total`}
              </h2>
              <div
                className="explorer-progress"
                role="progressbar"
                aria-label="Route progress"
                aria-valuemin={0}
                aria-valuemax={route.steps.length}
                aria-valuenow={step + 1}
              >
                <div
                  style={{
                    width: `${((step + 1) / route.steps.length) * 100}%`,
                  }}
                />
                <span />
                <MapPin size={15} />
              </div>
            </div>
            <div className="explorer-step-list">
              <h3>{origin?.name ?? 'You are here · Entry 1 — Starbucks side'}</h3>
              {route.steps.map((item, index) => (
                <button
                  key={`${item.nodeId}-${index}`}
                  className="explorer-step"
                  aria-current={step === index ? 'step' : undefined}
                  onClick={() => changeStep(index)}
                >
                  <StepIcon text={item.text} connector={item.connector} />
                  <span>
                    <b>{item.text}</b>
                    <small>
                      {selected.floorId === 'l0'
                        ? item.kind === 'arrive'
                          ? 'Store frontage'
                          : 'Ground Floor'
                        : item.distance
                          ? `${Math.round(item.distance)} m · ${floorName(item.floorId)}`
                          : 'Destination reached'}
                    </small>
                  </span>
                </button>
              ))}
              <h3>{selected.name}</h3>
            </div>
            <div className="explorer-step-controls">
              <button
                aria-label="Previous direction"
                disabled={step === 0}
                onClick={() => changeStep(step - 1)}
              >
                <ArrowLeft size={22} />
              </button>
              {step === route.steps.length - 1 ? (
                <button
                  className="explorer-primary"
                  onClick={() => {
                    setPanel('details');
                    setStep(0);
                  }}
                >
                  <Check size={18} /> Done
                </button>
              ) : (
                <button aria-label="Next direction" onClick={() => changeStep(step + 1)}>
                  <ArrowRight size={22} />
                </button>
              )}
            </div>
          </aside>
        )}
        {message && (
          <div className="explorer-toast" role="status">
            {message}
          </div>
        )}
        {showRouteQR && qrRequest && (
          <QrPanel config={config} request={qrRequest} onClose={() => setShowRouteQR(false)} />
        )}
      </main>
      <footer className="explorer-footer">
        <nav className="explorer-footer-nav" aria-label="Browse categories">
          {[
            { label: 'Retail', categoryId: 'fashion', icon: retailIcon },
            { label: 'Dining', categoryId: 'dining', icon: diningIcon },
            { label: 'Home Decor', categoryId: 'home', icon: homeDecorIcon },
            { label: 'Entertainment', categoryId: 'entertainment', icon: entertainmentIcon },
          ].map(({ label, categoryId, icon }) => (
            <button
              key={label}
              type="button"
              className={panel === 'search' && category === categoryId ? 'is-active' : ''}
              onClick={() => {
                setPanel('search');
                setSelectedId(undefined);
                setTab('Categories');
                setQuery('');
                setCategory(categoryId);
              }}
            >
              <img src={icon} alt="" aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </footer>
    </div>
  );
}
