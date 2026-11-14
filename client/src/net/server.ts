import { artUrl } from '../../../shared/art';

/** Where players should open the game; any other host hands its sign-in over and sends them there. */
export const HOME = import.meta.env.VITE_HOME ?? '';
/** The game server's origin, used only on the HOME page (Vercel); everywhere else the page's own host serves the game. */
export const SERVER = typeof location !== 'undefined' && HOME && location.origin === HOME ? import.meta.env.VITE_SERVER ?? '' : '';

export function wsUrl(loc: { protocol: string; host: string } = location): string {
  return SERVER ? `${SERVER.replace(/^http/, 'ws')}/ws` : `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`;
}

export const art = (id: number) => SERVER + artUrl(id);

/** The sign-in token handed over in the address (`#t=<64 hex>`) by the old address, if any. */
export function handedToken(hash: string): string | null {
  return /^#t=([0-9a-f]{64})$/.exec(hash)?.[1] ?? null;
}

/** Where to send someone who opened the game on another host (with their token), or null to stay. */
export function moveTo(loc: { origin: string; hostname: string; search: string }, token: string | null, home = HOME): string | null {
  if (!home || loc.origin === home || /^(localhost|127\.)/.test(loc.hostname)) return null;
  return home + loc.search + (token ? `#t=${token}` : '');
}
