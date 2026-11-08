import './style.css';
import { DEFAULT_LOOK } from '../../shared/looks';
import type { ClientMsg } from '../../shared/protocol';
import { Game } from './game/game';
import { byId } from './hud/dom';
import { Hud } from './hud/hud';
import { showJoin } from './hud/joinScreen';
import { Connection } from './net/connection';

const TOKEN_KEY = 'vsw-token';
const hud = new Hud();
const conn = new Connection(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
let game: Game | null = null;
let hello: ClientMsg | null = null;

async function askJoin(error?: string): Promise<void> {
  const r = await showJoin({ mode: 'join', look: DEFAULT_LOOK, error });
  hello = { t: 'hello', inviteCode: r.inviteCode, name: r.name, look: r.look };
  conn.send(hello); // if the socket isn't open yet, onOpen sends it
}

conn.onOpen = () => {
  if (hello) conn.send(hello);
};
conn.onStatus = (s) => hud.setConnection(s);
conn.onMessage = (m) => {
  if (m.t === 'welcome') {
    if (m.token) localStorage.setItem(TOKEN_KEY, m.token);
    hello = { t: 'hello', token: localStorage.getItem(TOKEN_KEY)! };
    hud.show();
    game ??= new Game(byId('c') as HTMLCanvasElement, byId('fade'), hud, (msg) => conn.send(msg));
  }
  if (m.t === 'error' && m.code === 'unknown_token') {
    localStorage.removeItem(TOKEN_KEY);
    hello = null;
    void askJoin();
    return;
  }
  if (m.t === 'error' && (m.code === 'bad_invite' || m.code === 'bad_profile')) {
    hello = null;
    void askJoin(m.message);
    return;
  }
  if (m.t === 'error' && m.code === 'connected_elsewhere') {
    conn.stop();
    byId('gone').hidden = false;
    return;
  }
  game?.onMessage(m);
};

hud.onEditLook = async () => {
  const me = game?.myView();
  if (!me) return;
  const r = await showJoin({ mode: 'edit', name: me.name, look: me.look });
  conn.send({ t: 'updateLook', look: r.look });
};

const token = localStorage.getItem(TOKEN_KEY);
if (token) hello = { t: 'hello', token };
conn.connect();
if (!token) void askJoin();
