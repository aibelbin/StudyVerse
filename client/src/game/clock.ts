let offset = 0;

/** Call with welcome.serverTime so countdowns match the server. */
export function syncClock(serverTime: number): void {
  offset = serverTime - Date.now();
}

export function serverNow(): number {
  return Date.now() + offset;
}
