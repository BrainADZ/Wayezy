import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Poi, Snapshot } from '../../../packages/domain';
import { nearestByCost } from '../../../packages/routing';
import { search, suggestAlternatives, type SearchResult } from '../../../packages/search';
import { Glyph } from '../icons/glyphs';
import { categoryIcon, poiIcon, WayIcon } from '../icons/illustrated';
import { analytics } from '../shared/analytics';
import { useDebounced } from '../shared/hooks';
import { useI18n } from '../shared/i18n';
import { LogoTile } from '../shared/ui';
import { Keyboard } from './Keyboard';

const groupOrder: SearchResult['group'][] = [
  'food',
  'shops',
  'entertainment',
  'services',
  'amenities',
];

export function SearchOverlay({
  data,
  query,
  setQuery,
  costs,
  onClose,
  onTenant,
  onPoi,
  onCategory,
}: {
  data: Snapshot;
  query: string;
  setQuery: (value: string) => void;
  costs: Map<string, number>;
  onClose: () => void;
  onTenant: (id: string) => void;
  onPoi: (id: string) => void;
  onCategory: (id: string) => void;
}) {
  const { t, tenantText } = useI18n();
  const [keyboard, setKeyboard] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();
  const results = useMemo(() => (trimmed ? search(data, trimmed) : []), [data, trimmed]);
  const debounced = useDebounced(trimmed, 1400);
  const logged = useRef('');

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // Log settled queries (not every keystroke) and zero-result searches for Command analytics.
  const logSearch = useCallback(
    (term: string) => {
      if (!term || term.length < 2 || logged.current === term) return;
      logged.current = term;
      const count = search(data, term).length;
      analytics.track('search_submitted', { query: term, results: count });
      if (!count) analytics.track('search_no_result', { query: term });
    },
    [data],
  );
  useEffect(() => logSearch(debounced), [debounced, logSearch]);

  // Amenities collapse to the nearest location of each type.
  const grouped = useMemo(() => {
    const map = new Map<SearchResult['group'], SearchResult[]>();
    const seenPoiTypes = new Set<string>();
    const poiById = new Map(data.pois.map((p) => [p.id, p]));
    const amenityResults = results.filter((r) => r.kind === 'poi');
    for (const r of results) {
      let item = r;
      if (r.kind === 'poi') {
        if (!r.poiType || seenPoiTypes.has(r.poiType)) continue;
        seenPoiTypes.add(r.poiType);
        const sameType = amenityResults
          .map((a) => poiById.get(a.id))
          .filter((p): p is Poi => Boolean(p && p.type === r.poiType));
        const nearest = nearestByCost(sameType, costs) ?? poiById.get(r.id)!;
        item = {
          ...r,
          id: nearest.id,
          floorId: nearest.floorId,
          nodeId: nearest.nodeId,
          name: nearest.name,
          clue: nearest.description,
        };
      }
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return groupOrder
      .filter((g) => map.has(g))
      .map((g) => ({ group: g, items: map.get(g)!.slice(0, g === 'amenities' ? 4 : 8) }));
  }, [results, data.pois, costs]);

  const alternatives = useMemo(
    () => (trimmed && !results.length ? suggestAlternatives(data, trimmed) : null),
    [data, trimmed, results.length],
  );
  const floorName = (id: string) => data.floors.find((f) => f.id === id)?.shortName ?? id;
  const pick = (result: SearchResult) => {
    // A visitor who taps a result before the debounce settles still made a search.
    logSearch(trimmed);
    analytics.track('search_result_clicked', {
      query: trimmed,
      destinationId: result.id,
      kind: result.kind,
      position: results.findIndex((r) => r.id === result.id),
    });
    if (result.kind === 'tenant') onTenant(result.id);
    else onPoi(result.id);
  };
  const popular = [
    'Italian food',
    'Coffee',
    'Running shoes',
    'Cinema',
    'Mobile phone',
    'Kids clothes',
    'Washroom',
    'ATM',
  ];

  return (
    <div
      className="search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('search.placeholder')}
    >
      <div className="search-overlay-top">
        <label className="search-field is-active">
          <WayIcon name="search" size={52} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setKeyboard(true)}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            inputMode="none"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            onKeyDown={(e) => {
              if (e.key === 'Enter') setKeyboard(false);
              if (e.key === 'Escape') onClose();
            }}
          />
          {query ? (
            <button
              type="button"
              className="search-clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              <Glyph name="close" size={28} />
            </button>
          ) : null}
        </label>
        <button type="button" className="btn btn-ghost btn-lg" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>

      <div className={`search-results ${keyboard ? 'has-keyboard' : ''}`}>
        {!trimmed ? (
          <section className="search-section">
            <h3>{t('search.popular')}</h3>
            <div className="chip-row">
              {popular.map((term) => (
                <button
                  key={term}
                  type="button"
                  className="chip chip-lg"
                  onClick={() => setQuery(term)}
                >
                  {term}
                </button>
              ))}
            </div>
            <div className="search-categories">
              {data.categories
                .filter((c) => c.primary)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="mini-category"
                    onClick={() => onCategory(c.id)}
                  >
                    <WayIcon name={categoryIcon(c.icon)} size={56} />
                    <span>{c.name}</span>
                  </button>
                ))}
            </div>
          </section>
        ) : results.length ? (
          <>
            <p className="search-count" aria-live="polite">
              {t('search.results', {
                count: grouped.reduce((sum, g) => sum + g.items.length, 0),
                query: trimmed,
              })}
            </p>
            {grouped.map(({ group, items }) => (
              <section className="search-section" key={group}>
                <h3>{t(`group.${group}` as never)}</h3>
                <div className="result-list">
                  {items.map((r, i) => {
                    const tenant =
                      r.kind === 'tenant' ? data.tenants.find((x) => x.id === r.id) : null;
                    const poi = r.kind === 'poi' ? data.pois.find((x) => x.id === r.id) : null;
                    const minutes = costs.get(r.nodeId);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        className="result-row"
                        style={{ animationDelay: `${Math.min(i, 8) * 28}ms` }}
                        onClick={() => pick(r)}
                      >
                        {tenant ? (
                          <LogoTile tenant={tenant} size={76} />
                        ) : (
                          <span className="result-icon">
                            <WayIcon name={poi ? poiIcon[poi.type] : 'information'} size={60} />
                          </span>
                        )}
                        <span className="result-text">
                          <strong>{tenant ? tenantText(tenant, 'name') : r.name}</strong>
                          <span>
                            {tenant
                              ? `${tenant.subcategory || r.category} · ${floorName(r.floorId)} · ${tenant.unitNumber}`
                              : `${t('amenity.nearest')} · ${floorName(r.floorId)}`}
                          </span>
                          {r.clue ? <small>{r.clue}</small> : null}
                        </span>
                        {minutes !== undefined ? (
                          <span className="result-distance">
                            {Math.max(1, Math.round(minutes / 60))} min
                          </span>
                        ) : null}
                        <Glyph name="chevronRight" size={30} />
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        ) : (
          <div className="search-empty">
            <WayIcon name="search" size={110} />
            <h3>{t('search.none.title', { query: trimmed })}</h3>
            <p>{t('search.none.body')}</p>
            {alternatives?.didYouMean ? (
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => setQuery(alternatives.didYouMean!)}
              >
                {t('search.didYouMean')} “{alternatives.didYouMean}”?
              </button>
            ) : null}
            <div className="chip-row is-centered">
              {alternatives?.popular.map((term) => (
                <button
                  key={term}
                  type="button"
                  className="chip chip-lg"
                  onClick={() => setQuery(term)}
                >
                  {term}
                </button>
              ))}
            </div>
            <div className="search-categories">
              {alternatives?.categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="mini-category"
                  onClick={() => onCategory(c.id)}
                >
                  <WayIcon name={categoryIcon(c.icon)} size={56} />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {keyboard ? (
        <Keyboard
          onKey={(key) => setQuery(query + key)}
          onBackspace={() => setQuery(query.slice(0, -1))}
          onSpace={() => setQuery(query.endsWith(' ') || !query ? query : `${query} `)}
          onClear={() => setQuery('')}
          onDone={() => setKeyboard(false)}
          doneLabel={t('search.done')}
        />
      ) : (
        <button type="button" className="keyboard-reopen" onClick={() => setKeyboard(true)}>
          <Glyph name="keyboard" size={30} /> Keyboard
        </button>
      )}
    </div>
  );
}
