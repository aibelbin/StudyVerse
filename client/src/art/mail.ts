import type { CabinEntry } from '../../../shared/art';
import { LETTER_MAX, type Letter } from '../../../shared/mail';
import { h } from '../hud/dom';
import type { Hud } from '../hud/hud';
import { ago } from '../hud/notes';

/** Owners whose mailbox flag changed between two rosters (new cabins are left to the village rebuild). */
export function mailFlags(prev: CabinEntry[], next: CabinEntry[]): string[] {
  const was = new Map(prev.map((e) => [e.owner, e.mail]));
  return next.filter((e) => was.has(e.owner) && was.get(e.owner) !== e.mail).map((e) => e.owner);
}

/** The post box: pick someone with a cabin, write up to LETTER_MAX characters, send. */
export function openWriter(hud: Hud, people: { id: string; name: string }[], to: string | undefined, onSend: (to: string, text: string) => void): void {
  if (!people.length) {
    hud.openModal(h('div', {}, h('h2', { textContent: '✉️ Write a letter' }), h('p', { className: 'sub', textContent: 'Nobody else has a cabin yet, so there are no mailboxes to write to.' })));
    return;
  }
  const pick = h('select', {}, ...[...people].sort((a, b) => a.name.localeCompare(b.name)).map((p) => h('option', { value: p.id, textContent: p.name })));
  if (to && people.some((p) => p.id === to)) pick.value = to;
  const input = h('textarea', { maxLength: LETTER_MAX, rows: 5, placeholder: 'Dear friend…' });
  const count = h('small', { textContent: `0/${LETTER_MAX}` });
  input.addEventListener('input', () => (count.textContent = `${[...input.value].length}/${LETTER_MAX}`));
  const send = () => {
    if (!input.value.trim()) return;
    onSend(pick.value, input.value);
    hud.closeModals();
  };
  hud.openModal(h('div', { className: 'notes' },
    h('h2', { textContent: '✉️ Write a letter' }),
    h('label', {}, 'To ', pick),
    h('div', { className: 'notes-new' }, input, h('div', { className: 'row' }, count, h('button', { className: 'primary', type: 'button', textContent: 'Send', onclick: send }))),
  ));
  input.focus();
}

/** Your mailbox: letters newest first, each with Reply and Delete. */
export function openInbox(hud: Hud, letters: Letter[], onReply: (l: Letter) => void, onDelete: (id: number) => void): void {
  const now = Date.now();
  hud.openModal(h('div', { className: 'notes' },
    h('h2', { textContent: '📬 Your mail' }),
    h('div', { className: 'notes-list' }, ...(letters.length
      ? letters.map((l, i) => h('div', { className: `note c${i % 5}` },
        h('p', { textContent: l.text }),
        h('div', { className: 'row' },
          h('small', { textContent: `— ${l.fromName}, ${ago(now - l.at)}` }),
          h('span', {},
            h('button', { className: 'mini', type: 'button', textContent: 'Reply', onclick: () => onReply(l) }),
            h('button', { className: 'mini', type: 'button', title: 'Delete', textContent: '✕', onclick: () => onDelete(l.id) })))))
      : [h('p', { className: 'sub', textContent: 'No letters yet. Write one at the post office!' })])),
  ));
}
