import { describe, expect, it } from 'vitest';
import type { Spot, Toy } from '../../../shared/scenes/types';
import { toyPrompt } from '../toys/registry';
import { pickTarget, type PlacedSlot } from './interaction';

const slot = (id: string, x: number, z: number): PlacedSlot => ({ slot: { id, x, z, facing: 0, pose: 'sit', deskId: 'd' }, x, z });
const toy = (id: string, x: number, z: number, radius = 2): Toy => ({ id, kind: 'bell', x, z, radius });

describe('pickTarget', () => {
  it('picks the nearest free slot in range', () => {
    const t = pickTarget(0, 0, [slot('a', 1, 0), slot('b', 0.5, 0)], new Set(), [], []);
    expect(t).toMatchObject({ kind: 'slot', slot: { id: 'b' } });
  });
  it('skips taken slots', () => {
    const t = pickTarget(0, 0, [slot('a', 1, 0), slot('b', 0.5, 0)], new Set(['b']), [], []);
    expect(t).toMatchObject({ kind: 'slot', slot: { id: 'a' } });
  });
  it('uses where a moving slot is now, not where it was', () => {
    const moved = { ...slot('a', 9, 9), x: 0.4, z: 0 };
    expect(pickTarget(0, 0, [moved], new Set(), [], [])).toMatchObject({ kind: 'slot', slot: { id: 'a' } });
  });
  it('a toy within its radius beats a farther slot', () => {
    const t = pickTarget(0, 0, [slot('a', 1, 0)], new Set(), [{ toy: toy('bell', 0.6, 0), prompt: '[E] ring' }], []);
    expect(t).toMatchObject({ kind: 'toy', toy: { id: 'bell' }, prompt: '[E] ring' });
  });
  it('ignores toys without an E action and toys out of range', () => {
    expect(pickTarget(0, 0, [], new Set(), [{ toy: toy('swing', 0.2, 0), prompt: null }], [])).toBeNull();
    expect(pickTarget(0, 0, [], new Set(), [{ toy: toy('bell', 3, 0), prompt: 'x' }], [])).toBeNull();
  });
  it('prefers a closer player over a toy', () => {
    const t = pickTarget(0, 0, [], new Set(), [{ toy: toy('bell', 1, 0), prompt: 'x' }], [{ id: 'p', x: 0, z: 0.4 }]);
    expect(t).toMatchObject({ kind: 'player', id: 'p' });
  });
  it('a spot in range beats a farther toy', () => {
    const spot: Spot = { id: 'w1', kind: 'wall', x: 0.5, z: 0, y: 1.8, rot: 0 };
    const t = pickTarget(0, 0, [], new Set(), [{ toy: toy('bell', 1, 0), prompt: 'x' }], [], [{ spot, prompt: '[E] hang a painting here' }]);
    expect(t).toMatchObject({ kind: 'spot', spot: { id: 'w1' }, prompt: '[E] hang a painting here' });
  });
  it('ignores spots out of range', () => {
    const spot: Spot = { id: 's1', kind: 'shelf', x: 2, z: 0, y: 1.3, rot: 0 };
    expect(pickTarget(0, 0, [], new Set(), [], [], [{ spot, prompt: 'x' }])).toBeNull();
  });
  it('returns null when nothing is close', () => {
    expect(pickTarget(0, 0, [slot('a', 5, 0)], new Set(), [], [{ id: 'p', x: 0, z: 3 }])).toBeNull();
  });
});

describe('toyPrompt', () => {
  const t = (kind: Toy['kind']): Toy => ({ id: kind, kind, x: 0, z: 0, radius: 1 });
  it('follows the campfire and jukebox state', () => {
    expect(toyPrompt(t('campfire'), { kind: 'campfire', lit: false })).toBe('[E] light the fire');
    expect(toyPrompt(t('campfire'), { kind: 'campfire', lit: true })).toBe('[E] put out the fire');
    expect(toyPrompt(t('jukebox'), { kind: 'jukebox', track: 0, startedAt: 0 })).toBe('[E] turn on the jukebox');
    expect(toyPrompt(t('jukebox'), { kind: 'jukebox', track: 1, startedAt: 0 })).toBe('[E] next song');
    expect(toyPrompt(t('jukebox'), { kind: 'jukebox', track: 3, startedAt: 0 })).toBe('[E] turn off the jukebox');
  });
  it('names simple actions and stays quiet for seat-only toys', () => {
    expect(toyPrompt(t('bell'))).toBe('[E] ring the bell');
    expect(toyPrompt(t('swing'))).toBeNull();
    expect(toyPrompt(t('rowboat'))).toBeNull();
  });
});
