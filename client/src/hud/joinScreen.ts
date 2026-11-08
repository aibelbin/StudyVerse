import { NAME_MAX } from '../../../shared/constants';
import { BODY_COLORS, HAT_LABELS, HATS, SKIN_TONES } from '../../../shared/looks';
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

    const swatches = (colors: readonly string[], key: 'body' | 'skin') => {
      const row = h('div', { className: 'swatches' });
      const render = () => row.replaceChildren(...colors.map((c) => {
        const b = h('button', { type: 'button', className: `swatch${look[key] === c ? ' on' : ''}`, title: c, onclick: () => { look[key] = c; render(); } });
        b.style.background = c;
        return b;
      }));
      render();
      return row;
    };
    const hats = h('div', { className: 'hats' });
    const renderHats = () => hats.replaceChildren(...HATS.map((hat) =>
      h('button', { type: 'button', className: look.hat === hat ? 'on' : '', textContent: HAT_LABELS[hat], onclick: () => { look.hat = hat; renderHats(); } })));
    renderHats();

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
      h('label', { className: 'field' }, 'Outfit colour', swatches(BODY_COLORS, 'body')),
      h('label', { className: 'field' }, 'Skin tone', swatches(SKIN_TONES, 'skin')),
      h('label', { className: 'field' }, 'Hat', hats),
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
