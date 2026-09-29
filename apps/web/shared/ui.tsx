import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { openState, type Category, type Snapshot, type Tenant } from '../../../packages/domain';
import { categoryIcon, WayIcon } from '../icons/illustrated';
import { Glyph } from '../icons/glyphs';
import { formatTime } from './hooks';
import type { TranslationKey } from './i18n';

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const readableOn = (hex: string) => (luminance(hex) > 0.45 ? '#14213d' : '#ffffff');
const tint = (hex: string, t: number) => {
  const rgb = hexToRgb(hex);
  return `rgb(${rgb.map((v) => Math.round(v + (255 - v) * t)).join(',')})`;
};

/** Tenant logo: uploaded artwork when available, otherwise a clean brand-colour wordmark tile. */
export function LogoTile({
  tenant,
  size = 64,
  className,
}: {
  tenant: Pick<Tenant, 'name' | 'logo' | 'brandColor'>;
  size?: number;
  className?: string;
}) {
  if (tenant.logo)
    return (
      <img
        className={`logo-tile has-image ${className ?? ''}`}
        src={tenant.logo}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, padding: Math.round(size * 0.08) }}
        loading="lazy"
      />
    );
  const words = tenant.name
    .replace(/[^\p{L}\p{N}&' ]/gu, '')
    .split(/\s+/)
    .filter(Boolean);
  const text =
    tenant.name.length <= 9
      ? tenant.name
      : words.length > 1
        ? words
            .slice(0, 2)
            .map((w) => w[0])
            .join('')
        : tenant.name.slice(0, 2);
  const fontSize =
    text.length <= 2 ? size * 0.4 : Math.min(size * 0.3, (size * 1.45) / text.length);
  return (
    <span
      className={`logo-tile ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        padding: `0 ${Math.round(size * 0.06)}px`,
        background: tenant.brandColor,
        color: readableOn(tenant.brandColor),
        fontSize,
      }}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}

const subcategoryIcon = (tenant: Tenant, category?: Category) => {
  const s = tenant.subcategory.toLowerCase();
  if (s.includes('coffee') || s.includes('café') || s.includes('cafe')) return 'dining';
  if (s.includes('sport')) return 'sports';
  if (s.includes('pharmacy')) return 'health';
  if (s.includes('play')) return 'kids';
  return category ? categoryIcon(category.icon) : 'sparkle';
};

/** Illustrated hero banner used when no tenant photography has been uploaded. */
export function HeroArt({
  tenant,
  data,
  height = 240,
  className,
}: {
  tenant: Tenant;
  data: Pick<Snapshot, 'categories'>;
  height?: number | string;
  className?: string;
}) {
  if (tenant.heroImage)
    return (
      <img
        className={`hero-art has-image ${className ?? ''}`}
        src={tenant.heroImage}
        alt=""
        style={{ height }}
        loading="lazy"
      />
    );
  const category = data.categories.find((c) => c.id === tenant.categoryId);
  const accent = category?.color ?? tenant.brandColor;
  const style: CSSProperties = {
    height,
    background: [
      `radial-gradient(circle at 78% 30%, ${tint(accent, 0.55)} 0 18%, transparent 19%)`,
      `radial-gradient(circle at 12% 88%, ${tint(tenant.brandColor, 0.72)} 0 22%, transparent 23%)`,
      `linear-gradient(135deg, ${tint(accent, 0.86)} 0%, ${tint(accent, 0.7)} 100%)`,
    ].join(', '),
  };
  return (
    <div className={`hero-art ${className ?? ''}`} style={style} aria-hidden="true">
      <span className="hero-art-dots" />
      <span className="hero-art-icon">
        <WayIcon name={subcategoryIcon(tenant, category)} size="100%" />
      </span>
      <span className="hero-art-spark one">
        <WayIcon name="sparkle" size="100%" />
      </span>
      <span className="hero-art-word" style={{ color: tint(accent, 0.35) }}>
        {tenant.subcategory || category?.name}
      </span>
    </div>
  );
}

export function OpenBadge({
  tenant,
  timezone,
  t,
}: {
  tenant: Tenant;
  timezone: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}) {
  const state = openState(tenant, new Date(), timezone);
  if (state.state === 'open')
    return (
      <span className={`status-badge ${state.closingSoon ? 'is-warning' : 'is-open'}`}>
        <i aria-hidden="true" />
        {state.closingSoon
          ? t('tenant.closingSoon', { time: formatTime(state.closesAt) })
          : `${t('tenant.openNow')} · ${t('tenant.closesAt', { time: formatTime(state.closesAt) })}`}
      </span>
    );
  if (state.state === 'temporarily-closed')
    return (
      <span className="status-badge is-closed">
        <i aria-hidden="true" />
        {t('tenant.temporarilyClosed')}
      </span>
    );
  if (state.state === 'coming-soon')
    return (
      <span className="status-badge is-soon">
        <i aria-hidden="true" />
        {t('tenant.comingSoon')}
      </span>
    );
  return (
    <span className="status-badge is-closed">
      <i aria-hidden="true" />
      {t('tenant.closed')}
      {state.opensAt ? ` · ${t('tenant.opensAt', { time: formatTime(state.opensAt) })}` : ''}
    </span>
  );
}

export function Toast({
  message,
  onDone,
  tone = 'default',
}: {
  message: string;
  onDone: () => void;
  tone?: 'default' | 'warning';
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(timer);
  }, [message, onDone]);
  return (
    <div className={`toast is-${tone}`} role="status" aria-live="polite">
      <Glyph name={tone === 'warning' ? 'alert' : 'check'} size={22} />
      {message}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  children,
}: {
  icon: string;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <WayIcon name={icon} size={96} />
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
      {children}
    </div>
  );
}

export const floorLabel = (data: Pick<Snapshot, 'floors'>, floorId: string) => {
  const floor = data.floors.find((f) => f.id === floorId);
  return floor ? `${floor.shortName}` : floorId;
};
