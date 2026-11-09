import type { Toy } from '../../shared/scenes/types';
import { CAIRN_GAP_MS } from '../../shared/constants';
import { emptyPlot } from '../../shared/garden';
import { SPIN_MAX, SPIN_PUSH, spinAt, toppleChance, type ToyAction, type ToyKind, type ToyState } from '../../shared/toys';

/** Pure rules for one kind of toy. world.ts handles range, slots, cooldowns and broadcasting. */
export interface ToyHandler {
  actions: ToyAction[];
  /** Initial state for toys late joiners need to see. Stateless toys have none. */
  init?: (toy: Toy, now: number) => ToyState;
  /** New state (if it changed) and the arg the event carries (e.g. the stone-skip roll). */
  apply(state: ToyState | undefined, action: ToyAction, arg: number | undefined, now: number, rand: () => number): {
    state?: ToyState;
    arg?: number;
  };
}

export const COOLDOWN_MS: Record<ToyAction, number> = {
  note: 100, honk: 800, ring: 1500, coin: 1500, feed: 3000, skip: 2000, push: 500, slide: 2000, toggle: 1000, next: 1000,
  stack: CAIRN_GAP_MS,
};

const none: ToyHandler = { actions: [], apply: () => ({}) };
const event = (action: ToyAction): ToyHandler => ({ actions: [action], apply: () => ({}) });

export const HANDLERS: Record<ToyKind, ToyHandler> = {
  swing: none,
  seesaw: none,
  telescope: none,
  shop: none,
  board: none,
  quotes: none,
  coffee: none,
  stageScreen: none,
  plot: { actions: [], init: () => emptyPlot(), apply: () => ({}) },
  golfTee: none,
  golfBoard: { actions: [], init: () => ({ kind: 'golfBoard', day: '', top: [], paid: [] }), apply: () => ({}) },
  cushions: {
    actions: [],
    init: () => ({ kind: 'meditate', startedAt: null }),
    apply: () => ({}),
  },
  koi: event('feed'),
  drums: { actions: ['note'], apply: (_s, _a, arg) => ({ arg }) },
  guitar: { actions: ['note'], apply: (_s, _a, arg) => ({ arg }) },
  keys: { actions: ['note'], apply: (_s, _a, arg) => ({ arg }) },
  cairn: {
    actions: ['stack'],
    init: () => ({ kind: 'cairn', height: 0, seed: 1, record: 0, recordBy: null }),
    /** One more stone, or a topple (arg 1) back to nothing. The record is kept by world.ts, which knows who stacked. */
    apply(state, _a, _arg, _now, rand) {
      const s = state?.kind === 'cairn' ? state : { kind: 'cairn' as const, height: 0, seed: 1, record: 0, recordBy: null };
      const h = s.height + 1;
      if (rand() < toppleChance(h)) return { state: { ...s, height: 0, seed: s.seed + 1 + Math.floor(rand() * 997) }, arg: 1 };
      return { state: { ...s, height: h }, arg: 0 };
    },
  },
  truck: {
    actions: ['honk'],
    init: (toy) => ({ kind: 'truck', x: toy.x, z: toy.z, heading: toy.rot ?? 0, returnFrom: null }),
    apply: () => ({}),
  },
  rowboat: {
    actions: [],
    init: (toy) => ({ kind: 'rowboat', x: toy.x, z: toy.z, heading: toy.rot ?? 0, returnFrom: null }),
    apply: () => ({}),
  },
  slide: event('slide'),
  ducks: event('feed'),
  fountain: event('coin'),
  bell: event('ring'),
  chimes: event('ring'),
  piano: { actions: ['note'], apply: (_s, _a, arg) => ({ arg }) },
  stones: { actions: ['skip'], apply: (_s, _a, _arg, _now, rand) => ({ arg: 1 + Math.floor(rand() * 7) }) },
  merryGoRound: {
    actions: ['push'],
    init: (_toy, now) => ({ kind: 'merryGoRound', angle0: 0, speed0: 0, t0: now }),
    apply(state, _a, _arg, now) {
      const s = state?.kind === 'merryGoRound' ? state : { angle0: 0, speed0: 0, t0: now };
      const { angle, speed } = spinAt(s, now);
      return { state: { kind: 'merryGoRound', angle0: angle, speed0: Math.min(SPIN_MAX, speed + SPIN_PUSH), t0: now } };
    },
  },
  jukebox: {
    actions: ['next'],
    init: (_toy, now) => ({ kind: 'jukebox', track: 0, startedAt: now }),
    apply(state, _a, _arg, now) {
      const track = state?.kind === 'jukebox' ? state.track : 0;
      return { state: { kind: 'jukebox', track: (track + 1) % 4, startedAt: now } };
    },
  },
  campfire: {
    actions: ['toggle'],
    init: () => ({ kind: 'campfire', lit: false }),
    apply: (state) => ({ state: { kind: 'campfire', lit: !(state?.kind === 'campfire' && state.lit) } }),
  },
};
