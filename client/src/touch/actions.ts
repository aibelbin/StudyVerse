export interface TouchAction {
  /** The key the button stands in for (as Input knows it: 'e', ' ', 'c'…). */
  key: string;
  label: string;
  primary?: boolean;
}

export interface PromptButtons {
  actions: TouchAction[];
  /** Show the 8 note keys (piano, drums, guitar, keyboard). */
  piano: boolean;
}

/** Hints that are about moving, which the joystick (or a finger drag) already covers. */
const MOVE = new Set(['w/s', 'a/d', 'wasd', 'drag']);
const SHORT: Record<string, string> = { c: 'Sip', g: 'Give', h: 'Honk', q: 'Leave hole' };
const KEYS: Record<string, string> = { space: ' ', e: 'e', c: 'c', g: 'g', h: 'h', q: 'q' };

function tidy(s: string): string {
  const t = s.replace(/[(].*?[)]/g, '').replace(/\s+/g, ' ').trim();
  const cut = t.length > 18 ? `${t.slice(0, 17).trimEnd()}…` : t;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
}

/** Turns the on-screen hint ("[Space] start a study session · [E] stand up") into touch buttons. */
export function promptActions(text: string | null): PromptButtons {
  const out: PromptButtons = { actions: [], piano: false };
  if (!text) return out;
  const re = /\[([^\]]+)\]\s*([^[·]*)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const tag = m[1].trim().toLowerCase();
    const rest = m[2].trim();
    if (MOVE.has(tag)) continue;
    if (tag === '1–8' || tag === '1-8') {
      out.piano = true;
      continue;
    }
    const key = KEYS[tag];
    if (!key) continue;
    if (key === 'e') {
      const label = !rest || rest.startsWith('or ') ? 'Stop' : tidy(rest);
      out.actions.unshift({ key, label, primary: true });
    } else if (key === ' ') {
      out.actions.push({ key, label: /another/.test(rest) ? 'Study again' : 'Study' });
    } else {
      out.actions.push({ key, label: SHORT[key] ?? tidy(rest) });
    }
  }
  return out;
}
