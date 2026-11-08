import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Connection, backoffDelay } from './connection';

describe('backoffDelay', () => {
  it('backs off 1, 2, 4, 8 s and then retries every 10 s', () => {
    expect([0, 1, 2, 3, 4, 9].map(backoffDelay)).toEqual([1000, 2000, 4000, 8000, 10000, 10000]);
  });
});

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  static failNext = 0;

  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;

  constructor(public url: string) {
    if (FakeWebSocket.failNext > 0) {
      FakeWebSocket.failNext--;
      throw new Error('boom');
    }
    FakeWebSocket.instances.push(this);
  }

  send(_data: string): void {}

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }

  /** Server accepts the connection. */
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  /** Server or network drops the connection. */
  drop(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

const sockets = () => FakeWebSocket.instances;
const last = () => sockets()[sockets().length - 1];

describe('Connection reconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    FakeWebSocket.failNext = 0;
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps backing off when the server accepts then quickly drops the socket', () => {
    const c = new Connection('ws://test');
    c.connect();
    last().open();
    last().drop(); // accepted, then dropped immediately
    vi.advanceTimersByTime(999);
    expect(sockets().length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(sockets().length).toBe(2); // 1 s

    last().open();
    last().drop();
    vi.advanceTimersByTime(1999);
    expect(sockets().length).toBe(2);
    vi.advanceTimersByTime(1);
    expect(sockets().length).toBe(3); // 2 s, not reset to 1 s
  });

  it('a stable connection resets the backoff', () => {
    const c = new Connection('ws://test');
    c.connect();
    last().drop(); // never opened: attempt 1, next after 1 s
    vi.advanceTimersByTime(1000);
    last().drop(); // attempt 2, next after 2 s
    vi.advanceTimersByTime(2000);
    expect(sockets().length).toBe(3);

    last().open();
    vi.advanceTimersByTime(5000);
    last().drop(); // was stable for 5 s: backoff resets
    vi.advanceTimersByTime(999);
    expect(sockets().length).toBe(3);
    vi.advanceTimersByTime(1);
    expect(sockets().length).toBe(4); // 1 s
  });

  it('connect() twice creates only one socket', () => {
    const c = new Connection('ws://test');
    c.connect();
    c.connect();
    expect(sockets().length).toBe(1);
  });

  it('connect() clears a pending reconnect timer', () => {
    const c = new Connection('ws://test');
    c.connect();
    last().open();
    last().drop(); // schedules a retry in 1 s
    c.connect(); // manual reconnect right away
    expect(sockets().length).toBe(2);
    vi.advanceTimersByTime(5000);
    expect(sockets().length).toBe(2); // the old timer must not add a third socket
  });

  it('a synchronous WebSocket constructor failure schedules the next retry', () => {
    FakeWebSocket.failNext = 1;
    const c = new Connection('ws://test');
    expect(() => c.connect()).not.toThrow();
    expect(sockets().length).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(sockets().length).toBe(1);
  });

  it('stop() prevents any further reconnects', () => {
    const c = new Connection('ws://test');
    c.connect();
    last().open();
    c.stop();
    vi.advanceTimersByTime(60000);
    expect(sockets().length).toBe(1);
  });
});
