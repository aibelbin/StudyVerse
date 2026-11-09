import { NAME_MAX } from '../../../shared/constants';
import { PET_KINDS } from '../../../shared/pets/kinds';
import type { PetKind, Wallet } from '../../../shared/types';
import { h } from './dom';

export interface PetsTabDeps {
  wallet(): Wallet | null;
  petOut(): boolean;
  adopt(kind: PetKind, name: string): void;
  setOut(on: boolean): void;
}

/** The wardrobe's Pets tab: adopt with KP, switch between pets you own, rename, bring out or put away. */
export function petsTab(d: PetsTabDeps) {
  return {
    id: 'pets',
    label: '🐾 Pets',
    render(refresh: () => void): HTMLElement {
      const w = d.wallet();
      const name = h('input', { maxLength: NAME_MAX, placeholder: 'Name your pet', value: w?.pet?.name ?? '' });
      // The name saves as soon as you press Enter or click away (not only via Adopt / Rename).
      const saveName = () => {
        const n = name.value.replace(/\s+/g, ' ').trim();
        if (w?.pet && n && n !== w.pet.name) {
          d.adopt(w.pet.kind, n);
          setTimeout(refresh, 300);
        }
      };
      name.addEventListener('change', saveName);
      name.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') name.blur();
      });
      const cells = PET_KINDS.map((p) => {
        const owned = !!w?.pets.includes(p.kind);
        const active = w?.pet?.kind === p.kind;
        const afford = !!w?.admin || (w?.kp ?? 0) >= p.price;
        const go = () => {
          const n = name.value.replace(/\s+/g, ' ').trim() || p.label;
          d.adopt(p.kind, n);
          setTimeout(refresh, 300);
        };
        return h('div', { className: `item${active ? ' on' : ''}${owned ? '' : ' locked'}` },
          h('span', { className: 'pet-emoji', textContent: p.emoji }),
          h('b', { textContent: p.label }),
          h('small', { textContent: active ? 'Your pet' : owned ? 'Adopted' : `✨ ${p.price}` }),
          active
            ? h('button', { type: 'button', className: 'mini', textContent: 'Rename', onclick: go })
            : h('button', { type: 'button', className: 'mini buy', disabled: !owned && !afford, textContent: owned ? 'Switch' : afford ? 'Adopt' : 'Need KP', onclick: go }));
      });
      return h('div', {},
        h('p', { className: 'sub', textContent: 'Pets follow you around town, wander off to sniff things, make friends and nap while you study. Each kind has its own personality 🐾' }),
        ...(w?.pet ? [h('p', { className: 'sub', textContent: `Your pet: ${w.pet.name} the ${PET_KINDS.find((k) => k.kind === w.pet!.kind)?.label.toLowerCase() ?? 'pet'}` })] : []),
        h('label', { className: 'field' }, w?.pet ? 'Name (press Enter to save)' : 'Name', name),
        h('div', { className: 'wardrobe-grid' }, ...cells),
        w?.pet
          ? h('div', { className: 'actions' }, h('button', { type: 'button', textContent: d.petOut() ? 'Put away (P)' : 'Bring out (P)', onclick: () => { d.setOut(!d.petOut()); setTimeout(refresh, 300); } }))
          : '');
    },
  };
}
