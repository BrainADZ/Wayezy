import { useEffect, useMemo, useRef, useState } from 'react';
import { playlist, screenCampaigns } from '../../../packages/advertising';
import type { Device, Snapshot } from '../../../packages/domain';
import { Logo } from '../brand/Logo';
import { CentreLogo } from '../brand/CentreLogo';
import { analytics } from '../shared/analytics';
import { useI18n } from '../shared/i18n';
import { HeroArt, LogoTile } from '../shared/ui';

type Slide =
  | {
      kind: 'campaign';
      key: string;
      campaignId: string;
      mediaUrl: string;
      mediaKind: 'image' | 'video';
      duration: number;
      advertiser: string;
      name: string;
    }
  | {
      kind: 'house';
      key: string;
      duration: number;
      tenantId?: string;
      title: string;
      highlight?: string;
      body: string;
      eventLabel?: string;
    };

/**
 * Idle advertising (K09). Plays the device's scheduled playlist with soft cross-fades; falls
 * back to venue branding if nothing is booked. Any touch exits —
 * handled by the parent, which also resets the visitor session.
 */
export function AdMode({
  data,
  device,
  onExit,
}: {
  data: Snapshot;
  device: Device;
  onExit: () => void;
}) {
  const { t } = useI18n();
  const [playlistMinute, setPlaylistMinute] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setPlaylistMinute((minute) => minute + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const slides = useMemo<Slide[]>(() => {
    const media = new Map(data.media.map((m) => [m.id, m]));
    const campaignSlides: Slide[] = playlist(
      screenCampaigns(data.campaigns),
      device,
      new Date(),
      data.venue.timezone,
    )
      .map((c) => {
        const asset = media.get(c.mediaId);
        return asset
          ? ({
              kind: 'campaign',
              key: c.id,
              campaignId: c.id,
              mediaUrl: asset.url,
              mediaKind: asset.kind,
              duration: c.duration,
              advertiser: c.advertiser,
              name: c.name,
            } as Slide)
          : null;
      })
      .filter((s): s is Slide => Boolean(s));
    if (campaignSlides.length) return campaignSlides;
    return [
      {
        kind: 'house',
        key: 'brand',
        duration: 10,
        title: 'IREO Boulevard',
        body: 'Explore stores, offers and directions on the interactive map.',
      },
    ];
  }, [data, device, playlistMinute]);

  const [index, setIndex] = useState(0);
  const slide = slides[index % slides.length];
  const started = useRef(0);

  useEffect(() => {
    started.current = performance.now();
    if (slide.kind === 'campaign')
      analytics.track('ad_started', {
        campaignId: slide.campaignId,
        deviceId: device.id,
        media: slide.mediaKind,
      });
    const timer = window.setTimeout(() => {
      if (slide.kind === 'campaign')
        analytics.track('ad_completed', { campaignId: slide.campaignId, seconds: slide.duration });
      setIndex((i) => (i + 1) % slides.length);
    }, slide.duration * 1000);
    return () => window.clearTimeout(timer);
  }, [slide, slides.length, device.id]);

  const fail = () => {
    if (slide.kind === 'campaign') analytics.track('ad_error', { campaignId: slide.campaignId });
    setIndex((i) => (i + 1) % slides.length);
  };

  const exit = () => {
    if (slide.kind === 'campaign')
      analytics.track('ad_tapped', {
        campaignId: slide.campaignId,
        seconds: Math.round((performance.now() - started.current) / 1000),
      });
    onExit();
  };

  const tenant =
    slide.kind === 'house' && slide.tenantId
      ? data.tenants.find((x) => x.id === slide.tenantId)
      : null;

  return (
    <div
      className="ad-mode"
      role="button"
      tabIndex={0}
      aria-label={t('ad.touch')}
      onPointerDown={exit}
      onKeyDown={exit}
    >
      <div className="ad-slide" key={`${slide.key}-${index}`}>
        {slide.kind === 'campaign' ? (
          slide.mediaKind === 'video' ? (
            <video
              className="ad-media"
              src={slide.mediaUrl}
              autoPlay
              muted
              playsInline
              loop
              onError={fail}
            />
          ) : (
            <img
              className="ad-media is-image"
              src={slide.mediaUrl}
              alt={`${slide.advertiser} — ${slide.name}`}
              onError={fail}
            />
          )
        ) : (
          <div className="ad-house">
            {tenant ? (
              <HeroArt tenant={tenant} data={data} height="100%" className="ad-house-art" />
            ) : (
              <div className="ad-house-art is-brand" />
            )}
            <div className="ad-house-copy">
              {tenant ? (
                <LogoTile tenant={tenant} size={140} />
              ) : (
                <CentreLogo className="ad-centre-logo" />
              )}
              {slide.highlight ? <span className="ad-highlight">{slide.highlight}</span> : null}
              <h1>{slide.title}</h1>
              <p>{slide.body}</p>
              {slide.eventLabel ? <p className="ad-event-label">{slide.eventLabel}</p> : null}
            </div>
          </div>
        )}
      </div>
      <div className="ad-chrome">
        <Logo height={70} tagline={false} theme="dark" />
        <span className="ad-touch">
          <span className="ad-touch-dot" /> {t('ad.touch')}
        </span>
      </div>
      <div className="ad-progress" aria-hidden="true">
        {slides.map((s, i) => (
          <i
            key={s.key}
            className={i === index % slides.length ? 'is-active' : ''}
            style={
              i === index % slides.length ? { animationDuration: `${slide.duration}s` } : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
