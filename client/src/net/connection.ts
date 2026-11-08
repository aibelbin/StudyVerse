import type { ClientMsg, ServerMsg } from '../../../shared/protocol';

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'stopped';

/** A socket must stay open this long before a drop counts as a recovery and resets the backoff. */
export const STABLE_MS = 5000;

export function backoffDelay(attempt: number): number {
  return [1000, 2000, 4000, 8000][attempt] ?? 10000;
}

/** A WebSocket that reconnects with backoff until stop() is called. */
export class Connection {
  onMessage: (m: ServerMsg) => void = () => {};
  onOpen: () => void = () => {};
  onStatus: (s: ConnStatus) => void = () => {};

  private ws: WebSocket | null = null;
  private attempt = 0;
  private started = false;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private url: string) {}

  connect(): void {
    if (this.stopped || this.ws) return;
    clearTimeout(this.timer);
    this.onStatus(this.started ? 'reconnecting' : 'connecting');
    this.started = true;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.retry();
      return;
    }
    this.ws = ws;
    let openedAt = 0;
    ws.onopen = () => {
      openedAt = Date.now();
      this.onStatus('open');
      this.onOpen();
    };
    ws.onmessage = (e) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped) return;
      if (openedAt && Date.now() - openedAt >= STABLE_MS) this.attempt = 0;
      this.retry();
    };
  }

  private retry(): void {
    this.onStatus('reconnecting');
    this.timer = setTimeout(() => this.connect(), backoffDelay(this.attempt++));
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
    this.ws?.close();
    this.onStatus('stopped');
  }
}
