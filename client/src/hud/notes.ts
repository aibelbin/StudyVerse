import { NOTE_MAX } from '../../../shared/constants';
import type { Note } from '../../../shared/types';
import { h } from './dom';
import type { Hud } from './hud';

export const ago = (ms: number) => {
  const m = Math.round(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60);
  return hr < 24 ? `${hr} h ago` : `${Math.round(hr / 24)} d ago`;
};

/** The town notice board: read everyone's notes, pin your own, take yours down. */
export class NotesBoard {
  private list = h('div', { className: 'notes-list' });
  private open = false;
  private notes: Note[] = [];

  /** Admins can take down anyone's note. */
  adminDelete: ((id: number) => void) | null = null;

  constructor(private hud: Hud, private myId: () => string | null, private send: (m: { t: 'getNotes' } | { t: 'postNote'; text: string } | { t: 'deleteNote'; id: number }) => void) {}

  show(): void {
    const input = h('textarea', { maxLength: NOTE_MAX, rows: 2, placeholder: 'Pin a note for the town… (study group? a win? a nice quote?)' });
    const count = h('small', { textContent: `0/${NOTE_MAX}` });
    input.addEventListener('input', () => (count.textContent = `${[...input.value].length}/${NOTE_MAX}`));
    const post = () => {
      if (!input.value.trim()) return;
      this.send({ t: 'postNote', text: input.value });
      input.value = '';
      count.textContent = `0/${NOTE_MAX}`;
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        post();
      }
    });
    this.open = true;
    this.hud.openModal(h('div', { className: 'notes' },
      h('h2', { textContent: '📌 Notice board' }),
      this.list,
      h('div', { className: 'notes-new' }, input, h('div', { className: 'row' }, count, h('button', { className: 'primary', type: 'button', textContent: 'Pin it', onclick: post }))),
    ), () => (this.open = false));
    this.render();
    this.send({ t: 'getNotes' });
    input.focus();
  }

  set(notes: Note[]): void {
    this.notes = notes;
    if (this.open) this.render();
  }

  private render(): void {
    const me = this.myId();
    const now = Date.now();
    this.list.replaceChildren(...(this.notes.length
      ? this.notes.map((n, i) => h('div', { className: `note c${i % 5}` },
        h('p', { textContent: n.text }),
        h('div', { className: 'row' },
          h('small', { textContent: `— ${n.name}, ${ago(now - n.at)}` }),
          n.authorId === me ? h('button', { className: 'mini', type: 'button', title: 'Take it down', textContent: '✕', onclick: () => this.send({ t: 'deleteNote', id: n.id }) })
            : this.adminDelete ? h('button', { className: 'mini', type: 'button', title: 'Take it down (admin)', textContent: '🗑', onclick: () => this.adminDelete?.(n.id) }) : '')))
      : [h('p', { className: 'sub', textContent: 'Nothing pinned yet. Be the first!' })]));
  }
}
