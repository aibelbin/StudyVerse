import './style.css';
import { DEFAULT_LOOK } from '../../shared/wardrobe';
import type { ClientMsg } from '../../shared/protocol';
import { Extras } from './game/extras';
import { Game } from './game/game';
import { byId } from './hud/dom';
import { Hud } from './hud/hud';
import { showJoin } from './hud/joinScreen';
import { openBarista } from './coffee/barista';
import { openStageScreen } from './hud/stageScreen';
import { GardenPanel } from './hud/garden';
import { NotesBoard } from './hud/notes';
import { Wardrobe } from './hud/wardrobe';
import { Voice } from './voice/voice';
import { petsTab } from './hud/petsTab';
import type { Wallet } from '../../shared/types';
import { Connection } from './net/connection';
import { ChatPanel } from './hud/chat';

const TOKEN_KEY = 'vsw-token';
const hud = new Hud();
const conn = new Connection(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
let game: Game | null = null;
let hello: ClientMsg | null = null;
let wallet: Wallet | null = null;
let refreshGarden: () => void = () => {};

const wardrobe = new Wardrobe({
  hud,
  name: () => game?.myView()?.name ?? '',
  look: () => game?.myView()?.look ?? DEFAULT_LOOK,
  wallet: () => wallet,
  buy: (itemId) => conn.send({ t: 'buy', itemId }),
  save: (look) => conn.send({ t: 'updateLook', look }),
  extraTabs: [petsTab({
    wallet: () => wallet,
    petOut: () => !!game?.myView()?.pet,
    adopt: (kind, name) => conn.send({ t: 'adoptPet', kind, name }),
    setOut: (on) => conn.send({ t: 'setPetOut', on }),
  })],
});

const chat = new ChatPanel(byId('chat'));
chat.onSend = (text, to) => conn.send(to ? { t: 'chat', text, to } : { t: 'chat', text });
chat.onReact = (id, emoji) => conn.send({ t: 'react', id, emoji });
chat.onPing = (m) => {
  if (!game?.myView()?.dnd) hud.toast(`💬 ${m.fromName}: ${m.text.length > 50 ? `${m.text.slice(0, 47)}…` : m.text}`, 5000);
};
hud.onOpenDm = (id, name) => chat.openDm(id, name);

const voice = new Voice(() => game?.myView()?.id ?? null, (to, data) => conn.send({ t: 'rtc', to, data }));
const refreshVoiceHud = () => {
  hud.voiceState = !voice.on ? 'off' : voice.muted ? 'muted' : 'on';
};
hud.onToggleVoice = async () => {
  if (voice.on) {
    voice.disable();
    conn.send({ t: 'setVoice', on: false });
  } else {
    if (game?.myView()?.dnd) {
      hud.toast('🔕 Turn off do-not-disturb to join voice.');
      return;
    }
    try {
      await voice.enable();
      conn.send({ t: 'setVoice', on: true });
      hud.toast('🎙️ You are on voice. People nearby can hear you. V mutes.', 5000);
    } catch (err) {
      hud.toast(`🎙️ ${err instanceof Error ? err.message : 'Could not use the microphone.'}`, 7000);
    }
  }
  refreshVoiceHud();
};

const board = new NotesBoard(hud, () => game?.myView()?.id ?? null, (m) => conn.send(m));
const toggleDnd = () => {
  const me = game?.myView();
  if (!me) return;
  if (!me.dnd && voice.on) {
    voice.disable();
    refreshVoiceHud();
  }
  conn.send({ t: 'setDnd', on: !me.dnd });
};
hud.onToggleDnd = toggleDnd;

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
  if (m.t === 'notes') board.set(m.list);
  if (m.t === 'rtc') void voice.onSignal(m.from, m.data);
  if (m.t === 'chat') {
    chat.add(m.msg);
    if (m.msg.to === null) game?.chatBubble(m.msg.from, m.msg.text);
  }
  if (m.t === 'chatReact') chat.setReactions(m.id, m.reactions);
  if (m.t === 'online') for (const p of m.list) chat.setName(p.id, p.name);
  if (m.t === 'welcome') {
    setWallet(m.wallet);
    voice.ice = m.ice;
    hud.meId = m.you.id;
    chat.setMe(m.you.id);
    for (const p of m.online) chat.setName(p.id, p.name);
    chat.load(m.chat);
    if (voice.on) conn.send({ t: 'setVoice', on: true }); // after a reconnect
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
        if (toy.kind === 'board') board.show();
        if (toy.kind === 'coffee') openBarista(hud, (drink, stars) => conn.send({ t: 'brew', drink, stars }));
        if (toy.kind === 'stageScreen') {
          const st = game?.toyState(toy.id);
          openStageScreen(hud, st?.kind === 'stageScreen' ? st.text : null, (text) => conn.send({ t: 'stageText', text }));
        }
      };
      const g = game;
      const gardenPanel = new GardenPanel(hud, {
        plot: (id) => {
          const s = g.toyState(id);
          return s?.kind === 'plot' ? s : null;
        },
        wallet: () => wallet,
        holding: () => g.myView()?.holding ?? null,
        send: (msg) => conn.send(msg),
      });
      game.onOpenGarden = (id) => gardenPanel.open(id);
      refreshGarden = () => gardenPanel.refresh();
      hud.quality = game.quality;
      hud.onToggleQuality = () => {
        hud.quality = g.toggleQuality();
      };
      game.onToggleDnd = toggleDnd;
      game.onChatKey = () => chat.focus();
      game.voice = voice;
      game.onPetKey = () => {
        if (!wallet?.pet) {
          hud.toast('🐾 Adopt a pet in the Boutique first (✏️ → Pets).');
          return;
        }
        conn.send({ t: 'setPetOut', on: !game?.myView()?.pet });
      };
      game.onVoiceKey = () => {
        if (!voice.on) return;
        voice.setMuted(!voice.muted);
        refreshVoiceHud();
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
  if (m.t === 'toyState' || m.t === 'wallet' || m.t === 'playerUpdated') refreshGarden();
};

hud.onEditLook = () => {
  if (game?.myView()) wardrobe.open('style');
};
hud.onEndBreak = () => conn.send({ t: 'cancelSession' });

const token = localStorage.getItem(TOKEN_KEY);
if (token) hello = { t: 'hello', token };
conn.connect();
if (!token) void askJoin();
