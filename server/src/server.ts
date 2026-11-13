import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { IceServer } from '../../shared/protocol';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import type { ServerMsg } from '../../shared/protocol';
import { freeOnly } from '../../shared/wardrobe';
import { ProfileStore } from './db';
import { cleanName, isLook, parseClientMsg } from './validate';
import { World, type Conn } from './world';

export interface ServerOptions {
  port: number;
  dbPath: string;
  inviteCode: string;
  staticDir?: string | null;
  now?: () => number;
  tickMs?: number;
  heartbeatMs?: number;
  helloTimeoutMs?: number;
  /** Profile ids with admin powers. */
  adminIds?: string[];
  /** Serve HTTPS + WSS (browsers only allow microphones on secure pages). */
  tls?: { cert: Buffer; key: Buffer } | null;
  iceServers?: IceServer[];
}

export const HEARTBEAT_MS = 20_000;
export const HELLO_TIMEOUT_MS = 60_000;
export const RATE_REFILL_PER_S = 40;
export const RATE_BURST = 80;
export const RATE_MAX_DROPS = 200;
const MAX_FAILED_HELLOS = 3;
const LOOK_UPDATE_MIN_MS = 1000;

export interface RunningServer {
  port: number;
  world: World;
  close(): Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function serveStatic(dir: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  let rel: string;
  try {
    const url = new URL(req.url ?? '/', 'http://local');
    rel = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (rel.split(/[/\\]/).includes('..')) {
    res.writeHead(400).end();
    return;
  }
  let file = join(dir, rel || 'index.html');
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(dir, 'index.html'); // single-page fallback
  }
  try {
    const body = await readFile(file);
    // The page itself is always re-checked (so a deploy shows up on refresh); the hashed build files never change.
    const hashed = /[\\/]assets[\\/]/.test(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const store = new ProfileStore(opts.dbPath);
  const world = new World(opts.now, Math.random, undefined, store);
  world.admins = new Set(opts.adminIds ?? []);
  if (opts.iceServers?.length) world.ice = opts.iceServers;

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health') {
      res.writeHead(200).end('ok');
      return;
    }
    const art = /^\/art\/(\d+)\.png$/.exec(req.url ?? '');
    if (art) {
      const pic = store.paintingPng(Number(art[1]));
      if (pic) res.writeHead(200, { 'content-type': pic.mode === 'photo' ? 'image/jpeg' : 'image/png', 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' }).end(pic.png);
      else res.writeHead(404).end('not found');
      return;
    }
    if (opts.staticDir) {
      serveStatic(opts.staticDir, req, res).catch((err) => {
        console.error('static error', err);
        if (!res.headersSent) res.writeHead(500).end();
        else res.destroy();
      });
    } else res.writeHead(404).end('not found');
  };
  const http = opts.tls ? createHttpsServer({ cert: opts.tls.cert, key: opts.tls.key }, handler) : createServer(handler);

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 128 * 1024 });

  wss.on('connection', (ws: WebSocket) => {
    let playerId: string | null = null;
    let garbage = 0;
    let replaced = false;
    let failedHellos = 0;
    let warnedGarbage = false;
    let tokens = RATE_BURST;
    let lastRefill = performance.now();
    let drops = 0;
    let lastLookUpdate = 0;
    const live = ws as WebSocket & { isAlive?: boolean };
    live.isAlive = true;
    ws.on('pong', () => {
      live.isAlive = true;
    });
    const helloTimer = setTimeout(() => {
      if (!playerId) ws.close(4003, 'hello timeout');
    }, opts.helloTimeoutMs ?? HELLO_TIMEOUT_MS);
    const failHello = (code: 'bad_invite' | 'bad_profile' | 'unknown_token', message: string) => {
      conn.send({ t: 'error', code, message });
      if (++failedHellos >= MAX_FAILED_HELLOS) ws.close(4003, 'too many failed hellos');
    };
    const conn: Conn = {
      send: (msg: ServerMsg) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      },
      close: (code, message) => {
        replaced = true;
        conn.send({ t: 'error', code, message: message ?? 'The town is open in another tab or device.' });
        ws.close(4001, code);
      },
    };

    ws.on('error', (err) => {
      console.warn('ws error:', err.message);
    });

    ws.on('message', (data) => {
      try {
        onMessage(data);
      } catch (err) {
        console.error('message handler error', err);
      }
    });

    const onMessage = (data: unknown) => {
      // Frames already in flight from a replaced tab (or from a socket we are already closing)
      // must not act on the player's new session.
      if (replaced || ws.readyState !== WebSocket.OPEN) return;
      const msg = parseClientMsg(String(data));
      if (!msg) {
        if (!warnedGarbage) {
          warnedGarbage = true;
          console.warn('malformed message from a client (further ones not logged)');
        }
        if (++garbage >= 20) ws.close(4002, 'too many bad messages');
        return;
      }
      if (playerId) {
        const mono = performance.now();
        tokens = Math.min(RATE_BURST, tokens + (Math.max(0, mono - lastRefill) / 1000) * RATE_REFILL_PER_S);
        lastRefill = mono;
        if (tokens >= 1) drops = 0;
        if (tokens < 1) {
          if (++drops >= RATE_MAX_DROPS) ws.close(4004, 'rate limit');
          return;
        }
        tokens -= 1;
        if (msg.t === 'updateLook') {
          const nowMs = Date.now();
          const cur = world.view(playerId)?.look;
          if (nowMs - lastLookUpdate < LOOK_UPDATE_MIN_MS || JSON.stringify(cur) === JSON.stringify(msg.look)) return;
          lastLookUpdate = nowMs;
        }
        world.handle(playerId, msg);
        return;
      }
      if (msg.t !== 'hello') return;
      if (msg.token) {
        const profile = store.findByToken(msg.token);
        if (!profile) {
          failHello('unknown_token', "We don't recognise this device. Please join again.");
          return;
        }
        playerId = profile.id;
        clearTimeout(helloTimer);
        world.join(profile, conn);
        return;
      }
      if (msg.inviteCode !== opts.inviteCode) {
        failHello('bad_invite', "That invite code isn't right.");
        return;
      }
      const name = cleanName(msg.name);
      if (!name || !isLook(msg.look)) {
        failHello('bad_profile', 'Pick a name (1–16 characters) and a look.');
        return;
      }
      const { profile, token } = store.create(name, freeOnly(msg.look!));
      playerId = profile.id;
      clearTimeout(helloTimer);
      world.join(profile, conn, token);
    };

    ws.on('close', () => {
      clearTimeout(helloTimer);
      try {
        if (playerId) world.disconnect(playerId, conn);
      } catch (err) {
        console.error('close handler error', err);
      }
    });
  });

  const timer = setInterval(() => {
    try {
      world.tick();
    } catch (err) {
      console.error('tick error', err);
    }
  }, opts.tickMs ?? 1000);
  const heartbeat = setInterval(() => {
    for (const c of wss.clients) {
      const l = c as WebSocket & { isAlive?: boolean };
      if (l.isAlive === false) {
        c.terminate();
        continue;
      }
      l.isAlive = false;
      c.ping();
    }
  }, opts.heartbeatMs ?? HEARTBEAT_MS);
  await new Promise<void>((resolve) => http.listen(opts.port, resolve));
  const port = (http.address() as AddressInfo).port;

  return {
    port,
    world,
    close: async () => {
      clearInterval(timer);
      clearInterval(heartbeat);
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => http.close(() => r()));
      store.close();
    },
  };
}
