import { NAME_MAX } from '../../shared/constants';
import { normalizeLook } from '../../shared/wardrobe';
import type { ClientMsg } from '../../shared/protocol';
import { TOY_ACTIONS, type ToyAction } from '../../shared/toys';
import type { Anim, EmoteKind, Look } from '../../shared/types';

const ANIMS: Anim[] = ['idle', 'walk', 'sit'];
const EMOTES: EmoteKind[] = ['wave', 'clap', 'flex', 'coffee'];

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
