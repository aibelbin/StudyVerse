import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import type { ServerMsg } from '../../shared/protocol';
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
}

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
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const store = new ProfileStore(opts.dbPath);
  const world = new World(opts.now);

  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200).end('ok');
      return;
    }
    if (opts.staticDir) {
      serveStatic(opts.staticDir, req, res).catch((err) => {
        console.error('static error', err);
        if (!res.headersSent) res.writeHead(500).end();
        else res.destroy();
      });
    }
    else res.writeHead(404).end('not found');
  });

  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 8 * 1024 });

  wss.on('connection', (ws: WebSocket) => {
    let playerId: string | null = null;
    let garbage = 0;
    let replaced = false;
    const conn: Conn = {
      send: (msg: ServerMsg) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      },
      close: (code) => {
        replaced = true;
        conn.send({ t: 'error', code, message: 'The town is open in another tab or device.' });
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
      if (replaced) return;
      const msg = parseClientMsg(String(data));
      if (!msg) {
        if (++garbage >= 20) ws.close(4002, 'too many bad messages');
        return;
      }
      if (playerId) {
        if (msg.t === 'updateLook') store.updateLook(playerId, msg.look);
        world.handle(playerId, msg);
        return;
      }
      if (msg.t !== 'hello') return;
      if (msg.token) {
        const profile = store.findByToken(msg.token);
        if (!profile) {
          conn.send({ t: 'error', code: 'unknown_token', message: "We don't recognise this device. Please join again." });
          return;
        }
        playerId = profile.id;
        world.join(profile, conn);
        return;
      }
      if (msg.inviteCode !== opts.inviteCode) {
        conn.send({ t: 'error', code: 'bad_invite', message: "That invite code isn't right." });
        return;
      }
      const name = cleanName(msg.name);
      if (!name || !isLook(msg.look)) {
        conn.send({ t: 'error', code: 'bad_profile', message: 'Pick a name (1–16 characters) and a look.' });
        return;
      }
      const { profile, token } = store.create(name, msg.look);
      playerId = profile.id;
      world.join(profile, conn, token);
    };

    ws.on('close', () => {
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
  await new Promise<void>((resolve) => http.listen(opts.port, resolve));
  const port = (http.address() as AddressInfo).port;

  return {
    port,
    world,
    close: async () => {
      clearInterval(timer);
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      await new Promise<void>((r) => http.close(() => r()));
      store.close();
    },
  };
}
