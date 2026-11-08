import { NAME_MAX } from '../../../shared/constants';
import { BODY_COLORS, EYE_LABELS, EYES, FREE_HATS, itemById } from '../../../shared/wardrobe';
import type { Look } from '../../../shared/types';
import { byId, h } from './dom';

export interface JoinResult {
  inviteCode: string;
  name: string;
  look: Look;
}

export interface JoinOpts {
  mode: 'join' | 'edit';
  name?: string;
  look: Look;
  error?: string;
}

const NAME_KEY = 'vsw-name';

/** Full-screen card for first join (invite code + name + look) or editing your look later. */
export function showJoin(opts: JoinOpts): Promise<JoinResult> {
  const root = byId('join');
  const look: Look = { ...opts.look };
  return new Promise((resolve) => {
    const finish = (r: JoinResult) => {
      root.hidden = true;
      root.replaceChildren();
      resolve(r);
    };
    const code = h('input', { placeholder: 'Invite code', autocomplete: 'off' });
    const name = h('input', {
      placeholder: 'Your name', maxLength: NAME_MAX, autocomplete: 'name',
      value: opts.name ?? localStorage.getItem(NAME_KEY) ?? '', disabled: opts.mode === 'edit',
    });
    const err = h('div', { className: 'err', textContent: opts.error ?? '' });

    const swatches = h('div', { className: 'swatches' });
    const renderSwatches = () => swatches.replaceChildren(...BODY_COLORS.map((c) => {
      const b = h('button', { type: 'button', className: `swatch${look.body === c ? ' on' : ''}`, title: c, onclick: () => { look.body = c; renderSwatches(); } });
      b.style.background = c;
      return b;
    }));
    renderSwatches();
    const choice = (values: readonly string[], label: (v: string) => string, get: () => string, set: (v: string) => void) => {
      const row = h('div', { className: 'hats' });
      const render = () => row.replaceChildren(...values.map((v) =>
        h('button', { type: 'button', className: get() === v ? 'on' : '', textContent: label(v), onclick: () => { set(v); render(); } })));
      render();
      return row;
    };
    const eyes = choice(EYES, (v) => EYE_LABELS[v as keyof typeof EYE_LABELS], () => look.eyes, (v) => { look.eyes = v as Look['eyes']; });
    const hatChoices = opts.mode === 'join' ? FREE_HATS : [...new Set([...FREE_HATS, look.hat])];
    const hats = choice(hatChoices, (v) => (v === 'none' ? 'No hat' : itemById(v)?.name ?? v), () => look.hat, (v) => { look.hat = v; });

    const form = h('form', {
      className: 'glass join-card',
      onsubmit: (e: SubmitEvent) => {
        e.preventDefault();
        const n = name.value.replace(/\s+/g, ' ').trim();
        if (opts.mode === 'join' && !code.value.trim()) {
          err.textContent = 'Enter the invite code your friend gave you.';
          return;
        }
        if (!n || [...n].length > NAME_MAX) {
          err.textContent = `Pick a name (1–${NAME_MAX} characters).`;
          return;
        }
        localStorage.setItem(NAME_KEY, n);
        finish({ inviteCode: code.value.trim(), name: n, look });
      },
    },
      h('h1', { textContent: opts.mode === 'join' ? '📚 Virtual Study World' : '✏️ Your look' }),
      opts.mode === 'join' ? h('div', { className: 'sub', textContent: 'A cozy little town for studying together.' }) : '',
      opts.mode === 'join' ? h('label', { className: 'field' }, 'Invite code', code) : '',
      h('label', { className: 'field' }, 'Name', name),
      h('label', { className: 'field' }, 'Colour', swatches),
      h('label', { className: 'field' }, 'Eyes', eyes),
      h('label', { className: 'field' }, 'Hat', hats),
      opts.mode === 'join' ? h('div', { className: 'sub', textContent: '👕 More outfits in the Boutique: earn ✨ Knowledge Points by studying.' }) : '',
      err,
      h('div', { className: 'actions' },
        h('button', { className: 'primary', type: 'submit', textContent: opts.mode === 'join' ? 'Move in 🏡' : 'Save look' }),
        opts.mode === 'edit'
          ? h('button', { type: 'button', textContent: 'Cancel', onclick: () => finish({ inviteCode: '', name: opts.name ?? '', look: opts.look }) })
          : ''),
    );
    root.replaceChildren(form);
    root.hidden = false;
    (opts.mode === 'join' ? code : form.querySelector('button')!).focus();
  });
}
