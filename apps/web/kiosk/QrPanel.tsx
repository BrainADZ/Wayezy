import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { MapPin, ShieldCheck, Smartphone, WifiOff, X } from 'lucide-react';
import { analytics } from '../shared/analytics';
import { api } from '../shared/api';
import type { PublicConfig } from '../shared/content';
import { useI18n } from '../shared/i18n';

export type QrRequest =
  | {
      kind: 'route';
      deviceId: string;
      startNodeId: string;
      destinationId: string;
      accessible: boolean;
      title: string;
      subtitle: string;
    }
  | { kind: 'url'; url: string; title: string; subtitle?: string };

/**
 * QR hand-off. Route QR codes use a signed, short-lived token from the server (/go/r/{token}).
 * If the kiosk is offline and the venue allows it, a plain deep link is used as a fallback.
 */
export function QrPanel({
  request,
  config,
  onClose,
}: {
  request: QrRequest;
  config: PublicConfig | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<{
    status: 'loading' | 'ready' | 'error';
    url?: string;
    image?: string;
    expiresAt?: string;
    message?: string;
  }>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const render = async (url: string, expiresAt?: string) => {
      const image = await QRCode.toDataURL(url, {
        width: 560,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#004c40', light: '#fffdf9' },
      });
      if (!cancelled) setState({ status: 'ready', url, image, expiresAt });
    };
    (async () => {
      if (request.kind === 'url') {
        await render(request.url);
        return;
      }
      try {
        const token = await api<{ url: string; expiresAt: string }>('/api/route-tokens', {
          method: 'POST',
          body: {
            deviceId: request.deviceId,
            startNodeId: request.startNodeId,
            destinationId: request.destinationId,
            accessible: request.accessible,
          },
        });
        await render(token.url, token.expiresAt);
        analytics.track('qr_displayed', {
          destinationId: request.destinationId,
          accessible: request.accessible,
          signed: true,
        });
      } catch {
        if (config?.allowUnsignedDeepLinks) {
          const base = config.publicBaseUrl || window.location.origin;
          const params = new URLSearchParams({
            d: request.destinationId,
            s: request.startNodeId,
            a: request.accessible ? '1' : '0',
            dev: request.deviceId,
          });
          await render(`${base}/go?${params.toString()}`);
          analytics.track('qr_displayed', {
            destinationId: request.destinationId,
            accessible: request.accessible,
            signed: false,
          });
        } else if (!cancelled) {
          setState({ status: 'error', message: t('qr.offline') });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [request, config, t]);

  const minutesLeft = state.expiresAt
    ? Math.max(1, Math.round((new Date(state.expiresAt).getTime() - Date.now()) / 60000))
    : null;

  return (
    <div
      className="qr-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-title"
      onClick={onClose}
    >
      <div className="qr-panel" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="sheet-close"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <X size={25} />
        </button>
        <div className="qr-phone-icon" aria-hidden="true">
          <Smartphone size={35} />
        </div>
        <span className="qr-eyebrow">MOBILE DIRECTIONS</span>
        <h2 id="qr-title">{request.kind === 'route' ? t('qr.title') : request.title}</h2>
        <p className="qr-body">
          {request.kind === 'route'
            ? t('qr.body')
            : (request.subtitle ?? 'Scan with your phone camera.')}
        </p>
        <div className={`qr-frame is-${state.status}`}>
          {state.status === 'ready' && state.image ? <img src={state.image} alt="QR code" /> : null}
          {state.status === 'loading' ? (
            <span className="qr-loading">{t('qr.generating')}</span>
          ) : null}
          {state.status === 'error' ? (
            <span className="qr-error">
              <WifiOff size={40} />
              {state.message}
            </span>
          ) : null}
        </div>
        {request.kind === 'route' ? (
          <div className="qr-destination">
            <MapPin size={22} />
            <span>
              <small>ROUTE DESTINATION</small>
              <strong>{request.title}</strong>
              <em>{request.subtitle}</em>
            </span>
          </div>
        ) : null}
        {minutesLeft ? (
          <p className="qr-expiry">
            <ShieldCheck size={18} /> <span>{t('qr.expires', { n: minutesLeft })}</span>
            <i /> <Smartphone size={17} />
            <span>{t('go.noApp')}</span>
          </p>
        ) : null}
        {request.kind === 'route' ? (
          <button type="button" className="qr-continue" onClick={onClose}>
            View directions on this screen
          </button>
        ) : null}
      </div>
    </div>
  );
}
