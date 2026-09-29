import type { AnalyticsEventName } from '../../../packages/domain';
import { safeStorage } from './storage';

type Props = Record<string, string | number | boolean | null>;
interface QueuedEvent {
  id: string;
  type: AnalyticsEventName;
  deviceId: string;
  sessionId: string;
  app: 'kiosk' | 'go' | 'command';
  occurredAt: string;
  props: Props;
}

const QUEUE_KEY = 'wez-analytics-queue';
const MAX_QUEUE = 2000;

const randomId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/**
 * Privacy-conscious interaction analytics. Events are queued in localStorage and sent in
 * batches; if the network is down they stay queued (with stable IDs) and sync later.
 */
class AnalyticsClient {
  private queue: QueuedEvent[] = safeStorage.get<QueuedEvent[]>(QUEUE_KEY, []);
  private timer: number | null = null;
  private flushing = false;
  app: QueuedEvent['app'] = 'kiosk';
  deviceId = '';
  sessionId = '';

  configure(options: { app: QueuedEvent['app']; deviceId: string }) {
    this.app = options.app;
    this.deviceId = options.deviceId;
    if (this.timer === null && typeof window !== 'undefined') {
      this.timer = window.setInterval(() => void this.flush(), 5000);
      window.addEventListener('online', () => void this.flush());
      window.addEventListener('pagehide', () => this.flush(true));
    }
  }

  newSession() {
    this.sessionId = randomId().slice(0, 24);
    return this.sessionId;
  }

  track(type: AnalyticsEventName, props: Props = {}) {
    const trimmed: Props = {};
    for (const [key, value] of Object.entries(props).slice(0, 20))
      trimmed[key.slice(0, 40)] = typeof value === 'string' ? value.slice(0, 300) : value;
    this.queue.push({
      id: randomId(),
      type,
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      app: this.app,
      occurredAt: new Date().toISOString(),
      props: trimmed,
    });
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
    this.persist();
    if (this.queue.length >= 20) void this.flush();
  }

  get pending() {
    return this.queue.length;
  }

  private persist() {
    safeStorage.set(QUEUE_KEY, this.queue);
  }

  async flush(useBeacon = false) {
    if (this.flushing || !this.queue.length) return;
    const batch = this.queue.slice(0, 100);
    const body = JSON.stringify({ events: batch });
    if (useBeacon && navigator.sendBeacon) {
      if (navigator.sendBeacon('/api/analytics', new Blob([body], { type: 'application/json' }))) {
        this.queue.splice(0, batch.length);
        this.persist();
      }
      return;
    }
    this.flushing = true;
    try {
      const response = await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      });
      // 4xx means the batch itself is unacceptable — drop it rather than retrying forever.
      if (
        response.ok ||
        (response.status >= 400 && response.status < 500 && response.status !== 429)
      ) {
        this.queue.splice(0, batch.length);
        this.persist();
      }
    } catch {
      /* offline: keep queued */
    } finally {
      this.flushing = false;
    }
  }
}

export const analytics = new AnalyticsClient();
