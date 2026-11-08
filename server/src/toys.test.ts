import { describe, expect, it } from 'vitest';
import type { Toy } from '../../shared/scenes/types';
import { TOY_ACTIONS, TOY_KINDS, type ToyKind, type ToyState } from '../../shared/toys';
import { COOLDOWN_MS, HANDLERS } from './toys';

const toy = (kind: ToyKind): Toy => ({ id: kind, kind, x: 1, z: 2, rot: 0.5, radius: 1 });
const r0 = () => 0;

describe('toy handlers', () => {
  it('every action has a cooldown', () => {
    for (const a of TOY_ACTIONS) expect(COOLDOWN_MS[a]).toBeGreaterThan(0);
  });

  it.each([
    ['merryGoRound', ['push']], ['slide', ['slide']], ['piano', ['note']], ['jukebox', ['next']],
    ['ducks', ['feed']], ['fountain', ['coin']], ['bell', ['ring']], ['chimes', ['ring']],
    ['stones', ['skip']], ['campfire', ['toggle']], ['swing', []], ['seesaw', []], ['telescope', []], ['rowboat', []],
  ] as [ToyKind, string[]][])('%s accepts %j', (kind, actions) => {
    expect(HANDLERS[kind].actions).toEqual(actions);
  });

  it('covers every kind', () => {
    for (const k of TOY_KINDS) expect(HANDLERS[k]).toBeDefined();
  });

  it('pushing speeds the merry-go-round up, capped at 3 rad/s', () => {
    const h = HANDLERS.merryGoRound;
    let s = h.init!(toy('merryGoRound'), 0);
    s = h.apply(s, 'push', undefined, 0, r0).state!;
    expect(s).toMatchObject({ speed0: 1.2, t0: 0 });
    for (let i = 0; i < 5; i++) s = h.apply(s, 'push', undefined, 0, r0).state!;
    expect(s).toMatchObject({ speed0: 3 });
  });

  it('a later push keeps the angle it had reached', () => {
    const h = HANDLERS.merryGoRound;
    let s = h.apply(h.init!(toy('merryGoRound'), 0), 'push', undefined, 0, r0).state!;
    s = h.apply(s, 'push', undefined, 2000, r0).state!;
    expect(s.kind === 'merryGoRound' && s.angle0).toBeGreaterThan(1);
    expect(s).toMatchObject({ t0: 2000 });
  });

  it('the jukebox cycles off → 1 → 2 → 3 → off', () => {
    const h = HANDLERS.jukebox;
    let s: ToyState = h.init!(toy('jukebox'), 0);
    const tracks: number[] = [];
    for (let i = 0; i < 4; i++) {
      s = h.apply(s, 'next', undefined, 500 * i, r0).state!;
      tracks.push(s.kind === 'jukebox' ? s.track : -1);
    }
    expect(tracks).toEqual([1, 2, 3, 0]);
    expect(s).toMatchObject({ startedAt: 1500 });
  });

  it('the campfire toggles', () => {
    const h = HANDLERS.campfire;
    const s = h.apply(h.init!(toy('campfire'), 0), 'toggle', undefined, 0, r0).state!;
    expect(s).toEqual({ kind: 'campfire', lit: true });
    expect(h.apply(s, 'toggle', undefined, 0, r0).state).toEqual({ kind: 'campfire', lit: false });
  });

  it('stones roll 1 to 7 skips', () => {
    expect(HANDLERS.stones.apply(undefined, 'skip', undefined, 0, () => 0).arg).toBe(1);
    expect(HANDLERS.stones.apply(undefined, 'skip', undefined, 0, () => 0.999).arg).toBe(7);
  });

  it('piano notes pass their arg through; stateless toys change no state', () => {
    expect(HANDLERS.piano.apply(undefined, 'note', 5, 0, r0)).toEqual({ arg: 5 });
    expect(HANDLERS.bell.apply(undefined, 'ring', undefined, 0, r0)).toEqual({});
  });

  it('rowboats start at their mooring', () => {
    expect(HANDLERS.rowboat.init!(toy('rowboat'), 0)).toEqual({ kind: 'rowboat', x: 1, z: 2, heading: 0.5, returnFrom: null });
  });
});
