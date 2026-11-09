import { existsSync, readFileSync } from 'node:fs';
import type { IceServer } from '../../shared/protocol';
import { resolve } from 'node:path';
import { startServer } from './server';

const inviteCode = process.env.INVITE_CODE;
if (!inviteCode) {
  console.error('Set INVITE_CODE to the code your friends will use to join, e.g. INVITE_CODE=cozy npm start');
  process.exit(1);
}

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DB_PATH ?? 'data.db';
const built = resolve('dist/client');
const staticDir = existsSync(built) ? built : null;

// Voice chat needs a secure page: point TLS_CERT / TLS_KEY at a certificate to serve HTTPS directly.
const tls = process.env.TLS_CERT && process.env.TLS_KEY
  ? { cert: readFileSync(process.env.TLS_CERT), key: readFileSync(process.env.TLS_KEY) }
  : null;
// STUN/TURN servers for voice, e.g. ICE_SERVERS='[{"urls":"stun:stun.l.google.com:19302"}]'
let iceServers: IceServer[] | undefined;
if (process.env.ICE_SERVERS) {
  try {
    iceServers = JSON.parse(process.env.ICE_SERVERS) as IceServer[];
  } catch {
    console.error('ICE_SERVERS is not valid JSON; using the default STUN server.');
  }
}

// ADMIN_IDS: comma-separated profile ids with admin powers (∞ KP, the admin panel).
const adminIds = (process.env.ADMIN_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const server = await startServer({ port, dbPath, inviteCode, staticDir, tls, iceServers, adminIds });
const scheme = tls ? 'https' : 'http';
console.log(`🏡 Virtual Study World on ${scheme}://localhost:${server.port}${staticDir ? '' : ' (API only, run `npm run build` for the client)'}`);

const shutdown = () => void server.close().then(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
