import type { Response } from 'express';

/**
 * Server-Sent Events hub. Kiosks and WAY EZY GO subscribe to /api/stream and refetch the
 * snapshot when a `published` event arrives. Clients fall back to polling if SSE is blocked.
 */
export class RealtimeHub {
  private clients = new Set<Response>();
  private timer: NodeJS.Timeout;

  constructor() {
    this.timer = setInterval(() => this.send('ping', { at: Date.now() }), 25_000);
    this.timer.unref();
  }

  get size() {
    return this.clients.size;
  }

  subscribe(res: Response, initial: Record<string, unknown>) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 5000\n\n');
    this.write(res, 'hello', initial);
    this.clients.add(res);
    res.on('close', () => this.clients.delete(res));
  }

  send(event: string, data: Record<string, unknown>) {
    for (const client of this.clients) this.write(client, event, data);
  }

  private write(res: Response, event: string, data: Record<string, unknown>) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  close() {
    clearInterval(this.timer);
    for (const client of this.clients) client.end();
    this.clients.clear();
  }
}
