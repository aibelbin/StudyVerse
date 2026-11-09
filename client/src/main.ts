import './style.css';
import { DEFAULT_LOOK } from '../../shared/wardrobe';
import type { ClientMsg } from '../../shared/protocol';
import { Extras } from './game/extras';
import { Game } from './game/game';
import { byId } from './hud/dom';
import { Hud } from './hud/hud';
import { showJoin } from './hud/joinScreen';
import { Wardrobe } from './hud/wardrobe';
import type { Wallet } from '../../shared/types';
import { Connection } from './net/connection';

const TOKEN_KEY = 'vsw-token';
const hud = new Hud();
const conn = new Connection(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
let game: Game | null = null;
let hello: ClientMsg | null = null;
let wallet: Wallet | null = null;

const wardrobe = new Wardrobe({
  hud,
  name: () => game?.myView()?.name ?? '',
  look: () => game?.myView()?.look ?? DEFAULT_LOOK,
  wallet: () => wallet,
  buy: (itemId) => conn.send({ t: 'buy', itemId }),
  save: (look) => conn.send({ t: 'updateLook', look }),
});

function setWallet(w: Wallet): void {
  wallet = w;
  hud.setWallet(w.kp, w.streak);
  if (wardrobe.isOpen()) wardrobe.refresh();
}

async function askJoin(error?: string): Promise<void> {
  const r = await showJoin({ mode: 'join', look: DEFAULT_LOOK, error });
  hello = { t: 'hello', inviteCode: r.inviteCode, name: r.name, look: r.look };
  conn.send(hello); // if the socket isn't open yet, onOpen sends it
}

conn.onOpen = () => {
  if (hello) conn.send(hello);
};
const gone = () => {
  conn.stop();
  game?.stop();
  byId('gone').hidden = false;
};
conn.onClose = (code) => {
  if (code === 4001) gone();
};
conn.onStatus = (s) => hud.setConnection(s);
conn.onMessage = (m) => {
  if (m.t === 'wallet') setWallet(m.wallet);
  if (m.t === 'welcome') {
    setWallet(m.wallet);
    if (m.token) localStorage.setItem(TOKEN_KEY, m.token);
    hello = { t: 'hello', token: localStorage.getItem(TOKEN_KEY)! };
    hud.show();
    if (!game) {
      game = new Game(byId('c') as HTMLCanvasElement, byId('fade'), hud, (msg) => conn.send(msg));
      const extras = new Extras();
      game.hooks = extras;
      hud.muted = extras.audio.muted;
      hud.onToggleMute = () => {
        extras.audio.setMuted(!extras.audio.muted);
        hud.muted = extras.audio.muted;
      };
      game.onLocalToy = (toy) => {
        if (toy.kind === 'shop') wardrobe.open('hat');
      };
      if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { game });
    }
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
    gone();
    return;
  }
  game?.onMessage(m);
};

hud.onEditLook = () => {
  if (game?.myView()) wardrobe.open('style');
};
hud.onEndBreak = () => conn.send({ t: 'cancelSession' });

const token = localStorage.getItem(TOKEN_KEY);
if (token) hello = { t: 'hello', token };
conn.connect();
if (!token) void askJoin();
