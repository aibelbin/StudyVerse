import { NAME_MAX } from '../../shared/constants';
import { HATS } from '../../shared/looks';
import type { ClientMsg } from '../../shared/protocol';
import type { Anim, EmoteKind, Hat, Look } from '../../shared/types';

const ANIMS: Anim[] = ['idle', 'walk', 'sit'];
const EMOTES: EmoteKind[] = ['wave', 'clap', 'flex', 'coffee'];
const COLOR = /^#[0-9a-fA-F]{6}$/;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

export function isLook(v: unknown): v is Look {
  if (!v || typeof v !== 'object') return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.body === 'string' && COLOR.test(l.body) &&
    typeof l.skin === 'string' && COLOR.test(l.skin) &&
    HATS.includes(l.hat as Hat)
  );
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
        if (!isLook(m.look)) return null;
        out.look = { body: m.look.body, skin: m.look.skin, hat: m.look.hat };
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
    case 'updateLook':
      return isLook(m.look) ? { t: 'updateLook', look: { body: m.look.body, skin: m.look.skin, hat: m.look.hat } } : null;
    default:
      return null;
  }
}
