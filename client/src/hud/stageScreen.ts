import { STAGE_TEXT_MAX } from '../../../shared/constants';
import { h } from './dom';
import type { Hud } from './hud';

/** The stage screen's text box: one line for everyone in town to see (empty clears it). */
export function openStageScreen(hud: Hud, current: string | null, onSave: (text: string) => void): void {
  const input = h('input', { type: 'text', maxLength: STAGE_TEXT_MAX, value: current ?? '', placeholder: 'e.g. Calculus review 7pm' });
  const save = () => {
    hud.finishModal();
    onSave(input.value.trim());
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') save();
  });
  hud.openModal(h('div', { className: 'stage-modal' },
    h('h2', { textContent: '🎤 Stage screen' }),
    h('p', { textContent: `Up to ${STAGE_TEXT_MAX} characters. It stays up for two hours. Leave it empty to clear it.` }),
    input,
    h('div', { className: 'actions' },
      h('button', { className: 'primary', textContent: 'Put it up', onclick: save }),
      h('button', { textContent: 'Cancel', onclick: () => hud.closeModals() })),
  ));
  setTimeout(() => input.focus(), 0);
}
