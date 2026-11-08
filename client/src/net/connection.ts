import type { ClientMsg, ServerMsg } from '../../../shared/protocol';

export type ConnStatus = 'connecting' | 'open' | 'reconnecting' | 'stopped';

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
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private url: string) {}

  connect(): void {
    if (this.stopped) return;
    this.onStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
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
      this.onStatus('reconnecting');
      this.timer = setTimeout(() => this.connect(), backoffDelay(this.attempt++));
    };
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
