import { useMemo, useState } from 'react';
import { zonedParts, type Poi, type Snapshot, type Tenant } from '../../../packages/domain';
import { Glyph } from '../icons/glyphs';
import { poiIcon, WayIcon } from '../icons/illustrated';
import { formatTime } from '../shared/hooks';
import { useI18n } from '../shared/i18n';
import { HeroArt, LogoTile, OpenBadge } from '../shared/ui';

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function TenantSheet({
  data,
  tenant,
  minutes,
  onClose,
  onDirections,
  onViewOnMap,
  onSendToPhone,
  onShowQr,
}: {
  data: Snapshot;
  tenant: Tenant;
  minutes: number | null;
  onClose: () => void;
  onDirections: () => void;
  onViewOnMap: () => void;
  onSendToPhone: () => void;
  onShowQr: (url: string, title: string) => void;
}) {
  const { t, tenantText } = useI18n();
  const [showWeek, setShowWeek] = useState(false);
  const tz = data.venue.timezone;
  const today = zonedParts(new Date(), tz).day;
  const category = data.categories.find((c) => c.id === tenant.categoryId);
  const floor = data.floors.find((f) => f.id === tenant.floorId);
  const offer = data.offers.find((o) => o.tenantId === tenant.id);
  const todayHours = tenant.hours.find((h) => h.day === today);
  const nowHhmm = zonedParts(new Date(), tz).hhmm;
  const showtimes = useMemo(
    () =>
      tenant.cinema?.showtimes
        .map((s) => ({ ...s, upcoming: s.times.filter((time) => time >= nowHhmm).slice(0, 4) }))
        .filter((s) => s.upcoming.length) ?? [],
    [tenant.cinema, nowHhmm],
  );

  return (
    <section className="place-sheet" aria-label={tenant.name}>
      <div className="place-hero">
        <HeroArt tenant={tenant} data={data} height="100%" />
        <button
          type="button"
          className="sheet-close"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <Glyph name="close" size={30} />
        </button>
      </div>
      <div className="place-heading is-overlapping">
        <LogoTile tenant={tenant} size={128} className="place-logo" />
        <div>
          <h2>{tenantText(tenant, 'name')}</h2>
          <p className="place-meta">
            <span>{tenant.subcategory || category?.name}</span>
            <span aria-hidden="true">·</span>
            <span>
              <strong>{floor?.shortName}</strong> {floor?.theme}
            </span>
            <span aria-hidden="true">·</span>
            <span>Unit {tenant.unitNumber}</span>
          </p>
          <div className="place-badges">
            <OpenBadge tenant={tenant} timezone={tz} t={t} />
            {minutes !== null ? (
              <span className="status-badge is-neutral">
                <Glyph name="route" size={20} /> {t('route.minutes', { n: minutes })}{' '}
                {t('route.walk')}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="place-body">
        {tenant.status === 'TEMPORARILY_CLOSED' ? (
          <div className="notice is-warning">
            <Glyph name="alert" size={26} /> {t('tenant.closedNotice')}
          </div>
        ) : null}

        <p className="place-summary">{tenantText(tenant, 'shortSummary')}</p>
        <p className="place-description">{tenantText(tenant, 'description')}</p>

        {offer ? (
          <div className="offer-card">
            <WayIcon name="offers" size={72} />
            <div>
              <span className="offer-highlight">{offer.highlight || t('tenant.offer')}</span>
              <strong>{offer.title}</strong>
              <span>{offer.description}</span>
            </div>
          </div>
        ) : null}

        <div className="place-section">
          <h3>{t('tenant.knownFor')}</h3>
          <div className="chip-row">
            {[...(tenant.dining?.cuisines ?? []), ...tenant.productTypes].slice(0, 8).map((tag) => (
              <span key={tag} className="chip chip-lg is-static">
                {tag}
              </span>
            ))}
          </div>
        </div>

        {tenant.dining ? (
          <div className="place-facts">
            <div>
              <h3>{t('tenant.dietary')}</h3>
              <p>{tenant.dining.dietary.join(' · ') || '—'}</p>
            </div>
            <div className="fact-flags">
              {tenant.dining.dineIn ? (
                <span className="flag">
                  <Glyph name="check" size={20} /> {t('tenant.dineIn')}
                </span>
              ) : null}
              {tenant.dining.takeaway ? (
                <span className="flag">
                  <Glyph name="check" size={20} /> {t('tenant.takeaway')}
                </span>
              ) : null}
              {tenant.dining.delivery ? (
                <span className="flag">
                  <Glyph name="check" size={20} /> {t('tenant.delivery')}
                </span>
              ) : null}
              <span className="flag is-price">{tenant.dining.priceBand}</span>
            </div>
            {tenant.dining.menuUrl ? (
              <button
                type="button"
                className="btn btn-soft"
                onClick={() =>
                  onShowQr(tenant.dining!.menuUrl, `${tenant.name} · ${t('tenant.menu')}`)
                }
              >
                <Glyph name="qr" size={22} /> {t('tenant.menu')}
              </button>
            ) : null}
          </div>
        ) : null}

        {showtimes.length ? (
          <div className="place-section">
            <h3>{t('tenant.showtimes')}</h3>
            <div className="showtimes">
              {showtimes.map((show) => (
                <div className="showtime" key={show.id}>
                  <strong>{show.title}</strong>
                  <span>
                    {show.rating} · {show.language} · {Math.floor(show.durationMinutes / 60)}h{' '}
                    {show.durationMinutes % 60}m
                  </span>
                  <div className="showtime-times">
                    {show.upcoming.map((time) => (
                      <span key={time}>{formatTime(time)}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {tenant.cinema?.bookingUrl ? (
              <button
                type="button"
                className="btn btn-soft"
                onClick={() =>
                  onShowQr(tenant.cinema!.bookingUrl, `${tenant.name} · ${t('tenant.bookTickets')}`)
                }
              >
                <Glyph name="qr" size={22} /> {t('tenant.bookTickets')}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="place-section place-hours">
          <button
            type="button"
            className="hours-toggle"
            onClick={() => setShowWeek(!showWeek)}
            aria-expanded={showWeek}
          >
            <Glyph name="clock" size={26} />
            <span>
              <strong>{t('tenant.hours')}</strong>
              <span>
                {t('tenant.today')}:{' '}
                {todayHours && !todayHours.closed
                  ? `${formatTime(todayHours.open)} – ${formatTime(todayHours.close)}`
                  : t('tenant.closed')}
              </span>
            </span>
            <Glyph name={showWeek ? 'chevronUp' : 'chevronDown'} size={26} />
          </button>
          {showWeek ? (
            <div className="hours-week">
              {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                const h = tenant.hours.find((x) => x.day === day);
                return (
                  <div key={day} className={day === today ? 'is-today' : ''}>
                    <span>{days[day]}</span>
                    <span>
                      {h && !h.closed
                        ? `${formatTime(h.open)} – ${formatTime(h.close)}`
                        : t('tenant.closed')}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {tenant.services.length ? (
          <div className="place-section">
            <h3>{t('tenant.services')}</h3>
            <p className="muted">{tenant.services.join(' · ')}</p>
          </div>
        ) : null}
        {tenant.accessibilityNotes ? (
          <div className="place-section a11y-note">
            <WayIcon name="accessibility" size={44} />
            <p>{tenant.accessibilityNotes}</p>
          </div>
        ) : null}
        {tenant.gallery.length ? (
          <div className="place-section">
            <h3>{t('tenant.gallery')}</h3>
            <div className="gallery">
              {tenant.gallery.map((src) => (
                <img key={src} src={src} alt="" loading="lazy" />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="place-actions">
        <button type="button" className="btn btn-primary btn-xl" onClick={onDirections}>
          <WayIcon name="directions" size={48} />
          {t('tenant.getDirections')}
        </button>
        <button type="button" className="btn btn-outline btn-xl" onClick={onViewOnMap}>
          <WayIcon name="map" size={44} />
          {t('tenant.viewOnMap')}
        </button>
        <button type="button" className="btn btn-outline btn-xl" onClick={onSendToPhone}>
          <WayIcon name="phone" size={44} />
          {t('tenant.sendToPhone')}
        </button>
      </div>
    </section>
  );
}

export function PoiSheet({
  data,
  poi,
  minutes,
  alternatives,
  onClose,
  onDirections,
  onSendToPhone,
  onSelectPoi,
}: {
  data: Snapshot;
  poi: Poi;
  minutes: number | null;
  alternatives: { poi: Poi; minutes: number | null }[];
  onClose: () => void;
  onDirections: () => void;
  onSendToPhone: () => void;
  onSelectPoi: (id: string) => void;
}) {
  const { t } = useI18n();
  const floor = data.floors.find((f) => f.id === poi.floorId);
  return (
    <section className="place-sheet is-poi" aria-label={poi.name}>
      <button
        type="button"
        className="sheet-close"
        onClick={onClose}
        aria-label={t('common.close')}
      >
        <Glyph name="close" size={30} />
      </button>
      <div className="place-body">
        <div className="place-heading">
          <span className="poi-icon-tile">
            <WayIcon name={poiIcon[poi.type] ?? 'information'} size={112} />
          </span>
          <div>
            <h2>{poi.name}</h2>
            <p className="place-meta">
              <span>
                <strong>{floor?.shortName}</strong> {floor?.theme}
              </span>
              {poi.hours ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{poi.hours}</span>
                </>
              ) : null}
            </p>
            <div className="place-badges">
              {poi.accessible ? (
                <span className="status-badge is-open">
                  <Glyph name="accessibility" size={20} /> Step-free
                </span>
              ) : null}
              {minutes !== null ? (
                <span className="status-badge is-neutral">
                  <Glyph name="route" size={20} /> {t('route.minutes', { n: minutes })}{' '}
                  {t('route.walk')}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <p className="place-summary">{poi.description}</p>
        {alternatives.length ? (
          <div className="place-section">
            <h3>Other locations</h3>
            <div className="result-list">
              {alternatives.map(({ poi: other, minutes: m }) => (
                <button
                  key={other.id}
                  type="button"
                  className="result-row is-compact"
                  onClick={() => onSelectPoi(other.id)}
                >
                  <span className="result-icon">
                    <WayIcon name={poiIcon[other.type] ?? 'information'} size={48} />
                  </span>
                  <span className="result-text">
                    <strong>{other.name}</strong>
                    <span>
                      {data.floors.find((f) => f.id === other.floorId)?.shortName} ·{' '}
                      {other.description}
                    </span>
                  </span>
                  {m !== null ? <span className="result-distance">{m} min</span> : null}
                  <Glyph name="chevronRight" size={28} />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="place-actions">
        <button type="button" className="btn btn-primary btn-xl" onClick={onDirections}>
          <WayIcon name="directions" size={48} />
          {t('tenant.getDirections')}
        </button>
        <button type="button" className="btn btn-outline btn-xl" onClick={onSendToPhone}>
          <WayIcon name="phone" size={44} />
          {t('tenant.sendToPhone')}
        </button>
      </div>
    </section>
  );
}
