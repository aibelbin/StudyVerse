import { NAME_MAX } from '../../shared/constants';
import { normalizeLook } from '../../shared/wardrobe';
import { isPetKind } from '../../shared/pets/kinds';
import type { ClientMsg } from '../../shared/protocol';
import { TOY_ACTIONS, type ToyAction } from '../../shared/toys';
import { DRINKS, type Anim, type Drink, type EmoteKind, type Look } from '../../shared/types';

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
      if (!isNum(m.x) || !isNum(m.z) || !isNum(m.facing) || !['idle', 'walk', 'sit'].includes(m.anim as string)) return null;
      return { t: 'pet', x: m.x, z: m.z, facing: m.facing, anim: m.anim as 'idle' | 'walk' | 'sit' };
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
