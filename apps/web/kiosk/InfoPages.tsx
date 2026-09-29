import { zonedParts, type Poi, type Snapshot } from '../../../packages/domain';
import { Glyph } from '../icons/glyphs';
import { WayIcon } from '../icons/illustrated';
import { analytics } from '../shared/analytics';
import { useI18n } from '../shared/i18n';
import { EmptyState, HeroArt, LogoTile } from '../shared/ui';

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(
    new Date(`${iso}T12:00:00Z`),
  );

export function OffersPage({
  data,
  onTenant,
  onDirections,
  onBack,
}: {
  data: Snapshot;
  onTenant: (id: string) => void;
  onDirections: (tenantId: string) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const today = zonedParts(new Date(), data.venue.timezone).date;
  const offers = data.offers.filter((o) => o.start <= today && o.end >= today);
  return (
    <section className="info-page">
      <header className="info-page-head">
        <button type="button" className="btn btn-ghost btn-lg" onClick={onBack}>
          <Glyph name="arrowLeft" size={26} /> {t('common.back')}
        </button>
        <div>
          <WayIcon name="offers" size={88} />
          <h1>{t('offers.title')}</h1>
        </div>
      </header>
      {offers.length ? (
        <div className="offer-grid">
          {offers.map((offer, i) => {
            const tenant = data.tenants.find((x) => x.id === offer.tenantId);
            if (!tenant) return null;
            const floor = data.floors.find((f) => f.id === tenant.floorId);
            return (
              <article
                key={offer.id}
                className="offer-tile"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <button
                  type="button"
                  className="offer-tile-main"
                  onClick={() => {
                    analytics.track('offer_opened', {
                      offerId: offer.id,
                      destinationId: tenant.id,
                    });
                    onTenant(tenant.id);
                  }}
                >
                  {offer.image ? (
                    <img src={offer.image} alt="" className="offer-tile-art" />
                  ) : (
                    <HeroArt tenant={tenant} data={data} height={210} className="offer-tile-art" />
                  )}
                  <span className="offer-badge">{offer.highlight}</span>
                  <span className="offer-tile-body">
                    <span className="offer-tenant">
                      <LogoTile tenant={tenant} size={56} />
                      <span>
                        <strong>{tenant.name}</strong>
                        <small>
                          {floor?.shortName} · {tenant.unitNumber}
                        </small>
                      </span>
                    </span>
                    <strong className="offer-title">{offer.title}</strong>
                    <span className="offer-desc">{offer.description}</span>
                    <small className="offer-dates">Until {dateLabel(offer.end)}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-lg offer-go"
                  onClick={() => onDirections(tenant.id)}
                >
                  <WayIcon name="directions" size={38} /> {t('common.directions')}
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon="offers"
          title="New offers are on their way"
          body="Check back soon — offers published in WAY EZY COMMAND appear here automatically."
        />
      )}
    </section>
  );
}

export function EventsPage({
  data,
  onDirections,
  onBack,
}: {
  data: Snapshot;
  onDirections: (destinationId: string) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const today = zonedParts(new Date(), data.venue.timezone).date;
  const events = data.events
    .filter((e) => e.end >= today)
    .sort((a, b) => a.start.localeCompare(b.start));
  return (
    <section className="info-page">
      <header className="info-page-head">
        <button type="button" className="btn btn-ghost btn-lg" onClick={onBack}>
          <Glyph name="arrowLeft" size={26} /> {t('common.back')}
        </button>
        <div>
          <WayIcon name="events" size={88} />
          <h1>{t('events.title')}</h1>
        </div>
      </header>
      {events.length ? (
        <div className="event-list">
          {events.map((event, i) => {
            const live = event.start <= today;
            const start = new Date(`${event.start}T12:00:00Z`);
            return (
              <article
                key={event.id}
                className="event-card"
                style={{ animationDelay: `${i * 60}ms` }}
                onClick={() => analytics.track('event_opened', { eventId: event.id })}
              >
                <div className="event-date">
                  <span>{new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(start)}</span>
                  <strong>{start.getUTCDate()}</strong>
                </div>
                <div className="event-body">
                  <span className={`status-badge ${live ? 'is-open' : 'is-soon'}`}>
                    <i aria-hidden="true" />
                    {live ? t('events.now') : t('events.upcoming')}
                  </span>
                  <h2>{event.title}</h2>
                  <p>{event.description}</p>
                  <p className="event-meta">
                    <Glyph name="clock" size={22} /> {event.timeLabel}
                  </p>
                  <p className="event-meta">
                    <Glyph name="pin" size={22} /> {event.locationLabel}
                  </p>
                  <p className="event-meta">
                    <Glyph name="calendar" size={22} /> {dateLabel(event.start)} –{' '}
                    {dateLabel(event.end)}
                  </p>
                </div>
                {event.destinationId ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={() => onDirections(event.destinationId)}
                  >
                    <WayIcon name="directions" size={38} /> {t('common.directions')}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon="events"
          title="No events right now"
          body="New centre events appear here after they are published."
        />
      )}
    </section>
  );
}

export function HelpPage({
  data,
  supportPhone,
  a11y,
  setA11y,
  onPoi,
  onBack,
}: {
  data: Snapshot;
  supportPhone: string;
  a11y: { largeText: boolean; highContrast: boolean; stepFree: boolean };
  setA11y: (next: { largeText: boolean; highContrast: boolean; stepFree: boolean }) => void;
  onPoi: (poi: Poi) => void;
  onBack: () => void;
}) {
  const { t, lang, setLang } = useI18n();
  const info = data.pois.find((p) => p.type === 'Information');
  const care = data.pois.find((p) => p.type === 'CustomerCare');
  const toggle = (key: keyof typeof a11y, label: string, icon: string) => (
    <button
      type="button"
      role="switch"
      aria-checked={a11y[key]}
      className={`toggle-card ${a11y[key] ? 'is-on' : ''}`}
      onClick={() => setA11y({ ...a11y, [key]: !a11y[key] })}
    >
      <Glyph name={icon} size={34} />
      <span>{label}</span>
      <i className="switch" aria-hidden="true" />
    </button>
  );
  return (
    <section className="info-page">
      <header className="info-page-head">
        <button type="button" className="btn btn-ghost btn-lg" onClick={onBack}>
          <Glyph name="arrowLeft" size={26} /> {t('common.back')}
        </button>
        <div>
          <WayIcon name="help" size={88} />
          <h1>{t('help.title')}</h1>
        </div>
      </header>
      <div className="help-grid">
        {info ? (
          <button type="button" className="help-card" onClick={() => onPoi(info)}>
            <WayIcon name="information" size={84} />
            <strong>{t('help.info')}</strong>
            <span>
              {data.floors.find((f) => f.id === info.floorId)?.shortName} ·{' '}
              {info.hours || info.description}
            </span>
          </button>
        ) : null}
        {care ? (
          <button type="button" className="help-card" onClick={() => onPoi(care)}>
            <WayIcon name="customerCare" size={84} />
            <strong>{t('help.lost')}</strong>
            <span>{care.description}</span>
          </button>
        ) : null}
        <div className="help-card is-static">
          <WayIcon name="phone" size={84} />
          <strong>{t('help.call')}</strong>
          <span className="help-phone">{supportPhone || data.venue.phone}</span>
        </div>
        <div className="help-card is-static">
          <WayIcon name="language" size={84} />
          <strong>{t('lang.label')}</strong>
          <div className="segmented">
            <button
              type="button"
              className={lang === 'en' ? 'is-active' : ''}
              onClick={() => setLang('en')}
            >
              English
            </button>
            <button
              type="button"
              className={lang === 'hi' ? 'is-active' : ''}
              onClick={() => setLang('hi')}
            >
              हिन्दी
            </button>
          </div>
        </div>
      </div>
      <h2 className="section-title">
        <WayIcon name="accessibility" size={56} /> {t('a11y.title')}
      </h2>
      <div className="toggle-grid">
        {toggle('stepFree', t('a11y.stepFree'), 'accessibility')}
        {toggle('largeText', t('a11y.largeText'), 'textSize')}
        {toggle('highContrast', t('a11y.contrast'), 'contrast')}
      </div>
      <p className="help-note">{t('help.accessibleBody')}</p>
    </section>
  );
}
