import { existsSync } from 'node:fs';
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

const server = await startServer({ port, dbPath, inviteCode, staticDir });
console.log(`🏡 Virtual Study World on http://localhost:${server.port}${staticDir ? '' : ' (API only, run `npm run build` for the client)'}`);

const shutdown = () => void server.close().then(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
