import { CHAT_MAX, NAME_MAX, PLOT_SPOTS, STAGE_TEXT_MAX } from '../../shared/constants';
import { isFlower, type Flower } from '../../shared/garden';
import { normalizeLook } from '../../shared/wardrobe';
import { isPetKind } from '../../shared/pets/kinds';
import { GARDEN_ACTIONS, type AdminAction, type ClientMsg, type GardenAction } from '../../shared/protocol';
import { FEATURE_KINDS, isGift, STATUS_MINUTES, STATUS_TEXT_MAX, type Feature } from '../../shared/gifts';
import { ANNOUNCE_MAX } from '../../shared/constants';
import { PAINT_B64_MAX, PAINT_MODES, PRICE_RANGE, SPOT_PICK_KINDS, TITLE_MAX, type PaintMode, type SpotPick } from '../../shared/art';
import { isMug } from '../../shared/mug';
import { LETTER_MAX } from '../../shared/mail';
import { isConstellationInput } from '../../shared/stars';
import { isSpecies } from '../../shared/catches';
import { TOY_ACTIONS, type ToyAction } from '../../shared/toys';
import { ACTS, DRINKS, PET_ANIMS, REACTIONS, type Act, type Anim, type Drink, type EmoteKind, type Look, type PetAnim } from '../../shared/types';

const ANIMS: Anim[] = ['idle', 'walk', 'sit'];
const EMOTES: EmoteKind[] = ['wave', 'clap', 'flex', 'coffee'];

/** Largest WebRTC signalling payload we relay (an SDP offer with candidates fits comfortably). */
export const RTC_MAX = 12_000;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

export function isLook(v: unknown): v is Look {
  return normalizeLook(v) !== null;
}

export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const n = v.replace(/\s+/g, ' ').trim();
  return n.length >= 1 && [...n].length <= NAME_MAX ? n : null;
}

/** Turns untrusted text into a well-formed ClientMsg (fresh object, no extra fields) or null. */
export function parseClientMsg(raw: string): ClientMsg | null {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;

  switch (m.t) {
    case 'hello': {
      const out: Extract<ClientMsg, { t: 'hello' }> = { t: 'hello' };
      if (m.token !== undefined) {
        if (!isStr(m.token, 128)) return null;
        out.token = m.token;
      }
      if (m.inviteCode !== undefined) {
        if (!isStr(m.inviteCode, 64)) return null;
        out.inviteCode = m.inviteCode;
      }
      if (m.name !== undefined) {
        if (!isStr(m.name, 64)) return null;
        out.name = m.name;
      }
      if (m.look !== undefined) {
        const look = normalizeLook(m.look);
        if (!look) return null;
        out.look = look;
      }
      return out;
    }
    case 'move':
      if (!isNum(m.x) || !isNum(m.z) || !isNum(m.facing) || !ANIMS.includes(m.anim as Anim)) return null;
      if (m.tilt !== undefined) {
        const tl = m.tilt as Record<string, unknown> | null;
        const ok = typeof tl === 'object' && tl !== null && isNum(tl.y) && isNum(tl.pitch) && isNum(tl.roll)
          && tl.y >= -1 && tl.y <= 3 && Math.abs(tl.pitch) <= Math.PI && Math.abs(tl.roll) <= Math.PI;
        if (!ok) return null;
        return { t: 'move', x: m.x, z: m.z, facing: m.facing, anim: m.anim as Anim, tilt: { y: tl.y as number, pitch: tl.pitch as number, roll: tl.roll as number } };
      }
      return { t: 'move', x: m.x, z: m.z, facing: m.facing, anim: m.anim as Anim };
    case 'enterScene':
      return isStr(m.doorId, 64) ? { t: 'enterScene', doorId: m.doorId } : null;
    case 'sit':
      return isStr(m.slotId, 64) ? { t: 'sit', slotId: m.slotId } : null;
    case 'stand':
      return { t: 'stand' };
    case 'cancelSession':
      return { t: 'cancelSession' };
    case 'startSession':
      if (!Number.isInteger(m.focusMin) || !Number.isInteger(m.breakMin)) return null;
      return { t: 'startSession', focusMin: m.focusMin as number, breakMin: m.breakMin as number };
    case 'emote': {
      if (!EMOTES.includes(m.kind as EmoteKind)) return null;
      if (m.targetId !== undefined && !isStr(m.targetId, 64)) return null;
      const out: Extract<ClientMsg, { t: 'emote' }> = { t: 'emote', kind: m.kind as EmoteKind };
      if (m.targetId !== undefined) out.targetId = m.targetId as string;
      return out;
    }
    case 'use': {
      if (!isStr(m.toyId, 40) || !TOY_ACTIONS.includes(m.action as ToyAction)) return null;
      const out: Extract<ClientMsg, { t: 'use' }> = { t: 'use', toyId: m.toyId, action: m.action as ToyAction };
      if (m.arg !== undefined) {
        if (!Number.isInteger(m.arg) || (m.arg as number) < 0 || (m.arg as number) > 7) return null;
        out.arg = m.arg as number;
      }
      return out;
    }
    case 'getNotes':
      return { t: 'getNotes' };
    case 'postNote':
      return typeof m.text === 'string' && m.text.length <= 400 ? { t: 'postNote', text: m.text } : null;
    case 'deleteNote':
      return Number.isInteger(m.id) ? { t: 'deleteNote', id: m.id as number } : null;
    case 'setDnd':
      return typeof m.on === 'boolean' ? { t: 'setDnd', on: m.on } : null;
    case 'brew':
      if (!DRINKS.includes(m.drink as Drink) || !Number.isInteger(m.stars)) return null;
      return { t: 'brew', drink: m.drink as Drink, stars: Math.max(1, Math.min(3, m.stars as number)) };
    case 'chat': {
      if (typeof m.text !== 'string') return null;
      const text = m.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
      if (!text || text.length > CHAT_MAX) return null;
      if (m.to !== undefined && !isStr(m.to, 64)) return null;
      return m.to === undefined ? { t: 'chat', text } : { t: 'chat', text, to: m.to as string };
    }
    case 'react':
      return Number.isInteger(m.id) && (REACTIONS as readonly string[]).includes(m.emoji as string) ? { t: 'react', id: m.id as number, emoji: m.emoji as string } : null;
    case 'garden': {
      if (!isStr(m.toyId, 40) || !GARDEN_ACTIONS.includes(m.action as GardenAction)) return null;
      if (m.spot !== undefined && !(Number.isInteger(m.spot) && (m.spot as number) >= 0 && (m.spot as number) < PLOT_SPOTS)) return null;
      if (m.flower !== undefined && !isFlower(m.flower)) return null;
      return {
        t: 'garden', toyId: m.toyId, action: m.action as GardenAction,
        ...(m.spot !== undefined ? { spot: m.spot as number } : {}),
        ...(m.flower !== undefined ? { flower: m.flower as Flower } : {}),
      };
    }
    case 'golfTee':
    case 'golfHoled':
    case 'golfPickUp':
      return Number.isInteger(m.hole) && (m.hole as number) >= 1 && (m.hole as number) <= 6 ? { t: m.t, hole: m.hole as number } : null;
    case 'golfShot':
      if (!(Number.isInteger(m.hole) && (m.hole as number) >= 1 && (m.hole as number) <= 6)) return null;
      return m.penalty === true ? { t: 'golfShot', hole: m.hole as number, penalty: true } : { t: 'golfShot', hole: m.hole as number };
    case 'golfBall':
      return isNum(m.x) && isNum(m.y) && isNum(m.z) ? { t: 'golfBall', x: m.x, y: m.y, z: m.z } : null;
    case 'golfQuit':
      return { t: 'golfQuit' };
    case 'buyGift':
      return isGift(m.gift) ? { t: 'buyGift', gift: m.gift } : null;
    case 'sendGift':
      return isStr(m.to, 64) && isGift(m.gift) ? { t: 'sendGift', to: m.to, gift: m.gift } : null;
    case 'giveItem':
      return Number.isInteger(m.id) && isStr(m.to, 64) ? { t: 'giveItem', id: m.id as number, to: m.to } : null;
    case 'useKeepsake':
      return Number.isInteger(m.id) ? { t: 'useKeepsake', id: m.id as number } : null;
    case 'setStatus': {
      if (typeof m.emoji !== 'string' || typeof m.text !== 'string') return null;
      const clean = (v: string) => v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
      const minutes = m.minutes === null || m.minutes === undefined ? null : (STATUS_MINUTES as readonly number[]).includes(m.minutes as number) ? (m.minutes as number) : undefined;
      if (minutes === undefined || m.emoji.length > 16 || [...clean(m.text)].length > STATUS_TEXT_MAX) return null;
      return { t: 'setStatus', emoji: clean(m.emoji), text: clean(m.text), minutes };
    }
    case 'admin':
      return parseAdmin(m);
    case 'throwMug':
      return isMug(m.mug) ? { t: 'throwMug', mug: { shape: m.mug.shape, glaze: m.mug.glaze, accent: m.mug.accent } } : null;
    case 'paint': {
      if (typeof m.title !== 'string') return null;
      const title = m.title.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!title || [...title].length > TITLE_MAX) return null;
      if (!Number.isInteger(m.price) || (m.price as number) < PRICE_RANGE[0] || (m.price as number) > PRICE_RANGE[1]) return null;
      if (typeof m.forSale !== 'boolean' || !PAINT_MODES.includes(m.mode as PaintMode)) return null;
      if (typeof m.png !== 'string' || m.png.length === 0 || m.png.length > PAINT_B64_MAX || !/^[A-Za-z0-9+/=]+$/.test(m.png)) return null;
      return { t: 'paint', title, price: m.price as number, forSale: m.forSale, mode: m.mode as PaintMode, png: m.png };
    }
    case 'setSale':
      return Number.isInteger(m.id) && typeof m.on === 'boolean' ? { t: 'setSale', id: m.id as number, on: m.on } : null;
    case 'buyPrint':
      return Number.isInteger(m.id) ? { t: 'buyPrint', id: m.id as number } : null;
    case 'getGallery':
      return { t: 'getGallery' };
    case 'getPortfolio':
      return { t: 'getPortfolio' };
    case 'cabin':
      return parseCabin(m);
    case 'sendLetter': {
      if (!isStr(m.to, 64) || typeof m.text !== 'string') return null;
      const text = m.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
      return text && [...text].length <= LETTER_MAX ? { t: 'sendLetter', to: m.to, text } : null;
    }
    case 'getMail':
      return { t: 'getMail' };
    case 'readMail':
      return { t: 'readMail' };
    case 'deleteLetter':
      return Number.isInteger(m.id) ? { t: 'deleteLetter', id: m.id as number } : null;
    case 'saveConstellation': {
      if (typeof m.name !== 'string') return null;
      const name = m.name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!isConstellationInput(name, m.edges)) return null;
      return { t: 'saveConstellation', name, edges: m.edges.map(([a, b]) => [a, b] as [number, number]) };
    }
    case 'catch':
      if ((m.kind !== 'fish' && m.kind !== 'bug') || !isSpecies(m.species) || !isNum(m.hour)) return null;
      return { t: 'catch', kind: m.kind, species: m.species, hour: Math.min(23, Math.max(0, Math.floor(m.hour))) };
    case 'getJournal':
      return { t: 'getJournal' };
    case 'buySeed':
      return isFlower(m.flower) ? { t: 'buySeed', flower: m.flower } : null;
    case 'stageText': {
      if (typeof m.text !== 'string') return null;
      const text = m.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
      return [...text].length > STAGE_TEXT_MAX ? null : { t: 'stageText', text };
    }
    case 'act':
      return ACTS.includes(m.kind as Act) ? { t: 'act', kind: m.kind as Act } : null;
    case 'sip':
      return { t: 'sip' };
    case 'offerCoffee':
      return isStr(m.to, 64) ? { t: 'offerCoffee', to: m.to } : null;
    case 'answerCoffee':
      return isStr(m.fromId, 64) && typeof m.accept === 'boolean' ? { t: 'answerCoffee', fromId: m.fromId, accept: m.accept } : null;
    case 'setVoice':
      return typeof m.on === 'boolean' ? { t: 'setVoice', on: m.on } : null;
    case 'rtc':
      return isStr(m.to, 64) && isStr(m.data, RTC_MAX) ? { t: 'rtc', to: m.to, data: m.data } : null;
    case 'adoptPet': {
      const name = cleanName(m.name);
      return isPetKind(m.kind) && name ? { t: 'adoptPet', kind: m.kind, name } : null;
    }
    case 'setPetOut':
      return typeof m.on === 'boolean' ? { t: 'setPetOut', on: m.on } : null;
    case 'pet':
      if (!isNum(m.x) || !isNum(m.z) || !isNum(m.facing) || !PET_ANIMS.includes(m.anim as PetAnim)) return null;
      return { t: 'pet', x: m.x, z: m.z, facing: m.facing, anim: m.anim as PetAnim };
    case 'buy':
      return isStr(m.itemId, 40) ? { t: 'buy', itemId: m.itemId } : null;
    case 'updateLook':
    {
      const look = normalizeLook(m.look);
      return look ? { t: 'updateLook', look } : null;
    }
    default:
      return null;
  }
}

const BAN_MINUTES = [60, 24 * 60, 7 * 24 * 60];
const MUTE_MINUTES = [10, 60, 24 * 60];

/** Admin requests: only well-formed ones get to the World (which still checks the sender is an admin). */
function parseAdmin(m: Record<string, unknown>): ClientMsg | null {
  const id = isStr(m.id, 64) ? m.id : null;
  const wrap = (a: AdminAction): ClientMsg => ({ t: 'admin', ...a });
  switch (m.action) {
    case 'list': return wrap({ action: 'list' });
    case 'clearStage': return wrap({ action: 'clearStage' });
    case 'kick': case 'unban': case 'unmute': case 'goto': case 'sendHome':
      return id ? wrap({ action: m.action, id }) : null;
    case 'ban':
      return id && (m.minutes === null || BAN_MINUTES.includes(m.minutes as number)) ? wrap({ action: 'ban', id, minutes: m.minutes as number | null }) : null;
    case 'mute':
      return id && MUTE_MINUTES.includes(m.minutes as number) ? wrap({ action: 'mute', id, minutes: m.minutes as number }) : null;
    case 'feature':
      return FEATURE_KINDS.includes(m.feature as Feature) && typeof m.on === 'boolean' ? wrap({ action: 'feature', feature: m.feature as Feature, on: m.on }) : null;
    case 'announce': {
      if (typeof m.text !== 'string') return null;
      const text = m.text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
      return text && text.length <= ANNOUNCE_MAX ? wrap({ action: 'announce', text }) : null;
    }
    case 'deleteChat': case 'deleteNote': case 'deleteLetter':
      return Number.isInteger(m.id) ? wrap({ action: m.action, id: m.id as number }) : null;
    default: return null;
  }
}

/** Cabin requests: place/clear an item at a spot, or lock the door. */
function parseCabin(m: Record<string, unknown>): ClientMsg | null {
  switch (m.action) {
    case 'lock':
      return typeof m.on === 'boolean' ? { t: 'cabin', action: 'lock', on: m.on } : null;
    case 'clear':
      return isStr(m.spot, 8) ? { t: 'cabin', action: 'clear', spot: m.spot } : null;
    case 'place': {
      const it = m.item as Record<string, unknown> | null;
      if (!isStr(m.spot, 8) || typeof it !== 'object' || it === null) return null;
      if (!SPOT_PICK_KINDS.includes(it.kind as SpotPick['kind']) || !Number.isInteger(it.id)) return null;
      return { t: 'cabin', action: 'place', spot: m.spot, item: { kind: it.kind as SpotPick['kind'], id: it.id as number } };
    }
    default: return null;
  }
}
