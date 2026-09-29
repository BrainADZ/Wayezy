import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../styles/kiosk.css';
import '../styles/explorer.css';
import { Logo } from '../brand/Logo';
import { MapExplorer } from '../explorer/map-explorer';
import { useContent } from '../shared/content';
import { APP_VERSION, resolveDeviceIdentity } from '../shared/device';
import { analytics } from '../shared/analytics';
import { AdMode } from './AdMode';

/** Reference kiosk UI backed by COMMAND's published content and device settings. */
export default function ExplorerKiosk() {
  const { data, config, online, status } = useContent();
  const identity = useMemo(() => resolveDeviceIdentity(), []);
  const device =
    data?.devices.find((d) => d.id === identity.id) ??
    data?.devices.find((d) => d.status === 'ACTIVE') ??
    data?.devices[0];
  const [ad, setAd] = useState(false);
  const [session, setSession] = useState(0);
  const lastInteraction = useRef(Date.now());
  const ignoreUntil = useRef(0);
  const sessionActive = useRef(false);
  const interact = useCallback(() => {
    lastInteraction.current = Date.now();
    if (!sessionActive.current) {
      sessionActive.current = true;
      analytics.newSession();
      analytics.track('session_started', {});
    }
  }, []);
  const attract = useCallback(() => {
    if (sessionActive.current) analytics.track('session_reset', {});
    sessionActive.current = false;
    setAd(true);
    setSession((value) => value + 1);
  }, []);
  useEffect(() => {
    document.title = 'WAY EZY · Kiosk';
    document.documentElement.classList.add('explorer-root');
    return () => document.documentElement.classList.remove('explorer-root');
  }, []);
  useEffect(() => {
    const ready = () => {
      lastInteraction.current = Date.now();
    };
    document.addEventListener('way-ezy-map-ready', ready);
    return () => document.removeEventListener('way-ezy-map-ready', ready);
  }, []);
  useEffect(() => {
    if (device) analytics.configure({ app: 'kiosk', deviceId: device.id });
  }, [device?.id]);
  useEffect(() => {
    if (!device || ad) return;
    const timer = window.setInterval(() => {
      const ground = document.querySelector('.ground-floor-source');
      if (
        ground &&
        !['ready', 'error'].includes(ground.getAttribute('data-detection-status') ?? '')
      ) {
        lastInteraction.current = Date.now();
        return;
      }
      if (Date.now() - lastInteraction.current < device.idleTimeout * 1000) return;
      const build = config?.clientBuild;
      if (build && !document.querySelector(`script[type="module"][src="${build}"]`)) {
        try {
          if (sessionStorage.getItem('wez-reloaded-for') !== build) {
            sessionStorage.setItem('wez-reloaded-for', build);
            window.location.reload();
            return;
          }
        } catch {
          /* Storage may be disabled. */
        }
      }
      attract();
    }, 500);
    return () => window.clearInterval(timer);
  }, [device?.idleTimeout, ad, attract, config?.clientBuild]);
  useEffect(() => {
    if (!identity.key || !data) return;
    const started = Date.now();
    const beat = () =>
      fetch(`/api/devices/${encodeURIComponent(identity.id)}/heartbeat`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-device-key': identity.key!,
        },
        body: JSON.stringify({
          softwareVersion: APP_VERSION,
          contentVersion: data.version,
          status: {
            online: navigator.onLine,
            queuedEvents: analytics.pending,
            screen: `${window.screen.width}x${window.screen.height}`,
            mapMode: 'svg',
            uptimeSeconds: Math.round((Date.now() - started) / 1000),
          },
        }),
      }).catch(() => undefined);
    void beat();
    const timer = window.setInterval(beat, 30_000);
    return () => window.clearInterval(timer);
  }, [identity, data?.version]);

  if (!data || !device)
    return (
      <div className="app-loading" role="status">
        <Logo height={96} />
        <p>{status === 'error' ? 'Connecting to the centre directory…' : 'Loading the map…'}</p>
      </div>
    );
  return (
    <div
      className="reference-kiosk"
      onPointerDownCapture={interact}
      onKeyDownCapture={interact}
      onWheelCapture={interact}
      onClickCapture={(event) => {
        if (Date.now() < ignoreUntil.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {!ad && (
        <MapExplorer
          key={`${device.id}-${session}`}
          data={data}
          device={device}
          config={config}
          online={online}
          onReturnToAd={attract}
        />
      )}
      {ad && (
        <div className="reference-attract">
          <AdMode
            data={data}
            device={device}
            onExit={() => {
              ignoreUntil.current = Date.now() + 650;
              setAd(false);
              interact();
            }}
          />
        </div>
      )}
    </div>
  );
}
