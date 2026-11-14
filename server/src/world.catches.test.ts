import { beforeEach, describe, expect, it } from 'vitest';
import type { SpeciesId } from '../../shared/catches';
import type { ErrorCode, ServerMsg } from '../../shared/protocol';
import { SCENES } from '../../shared/scenes';
import type { SceneDef } from '../../shared/scenes/types';
import { DEFAULT_LOOK } from '../../shared/wardrobe';
import { ProfileStore } from './db';
import { World, type Conn } from './world';

class FakeConn implements Conn {
  msgs: ServerMsg[] = [];
  send(m: ServerMsg) { this.msgs.push(m); }
  close(_c: ErrorCode) {}
  of<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[] {
    return this.msgs.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
  }
}

const town: SceneDef = {
  id: 'town', name: 'Town', where: 'here', size: { w: 80, d: 40 }, theme: SCENES.town.theme,
  colliders: [], decor: [], slots: [], doors: [],
  life: [{ kind: 'butterflies', x: 20, z: 10, r: 5, count: 4, seed: 1 }],
  spawns: [{ id: 'start', x: 0, z: 0, facing: 0 }],
  toys: [{ id: 'fish-1', kind: 'fishing', x: 2, z: 0, radius: 1.5 }],
};

let t: number;
let roll: number;
let store: ProfileStore;
let w: World;

function joinNew(name: string) {
  const profile = store.create(name, DEFAULT_LOOK, t).profile;
  const c = new FakeConn();
  w.join(profile, c);
  return { id: profile.id, c, profile };
}
const fish = (id: string, species: SpeciesId, hour = 12) => w.handle(id, { t: 'catch', kind: 'fish', species, hour });
const bug = (id: string, species: SpeciesId, hour = 12) => w.handle(id, { t: 'catch', kind: 'bug', species, hour });
const goTo = (id: string, x: number, z: number) => { t += 10_000; w.handle(id, { t: 'move', x, z, facing: 0, anim: 'idle' }); };

beforeEach(() => {
  t = 1_000_000;
  roll = 0.1; // clear weather to start
  store = new ProfileStore(':memory:');
  w = new World(() => t, () => roll, { town }, store);
});

describe('catches', () => {
  it('refuses what could not have happened', () => {
    const a = joinNew('Ann');
    w.handle(a.id, { t: 'catch', kind: 'fish', species: 'shark' as SpeciesId, hour: 12 }); // unknown
    fish(a.id, 'butterfly'); // a bug sent as a fish
    fish(a.id, 'moonfish', 12); // night only
    fish(a.id, 'rainbowTrout'); // rain only
    bug(a.id, 'bee'); // no bees in this scene
    bug(a.id, 'firefly', 22); // night, but no fireflies here
    goTo(a.id, 10, 0);
    fish(a.id, 'carp'); // too far from the fishing spot
    expect(a.c.of('error').map((e) => e.code)).toEqual(Array(7).fill('bad_catch'));
    expect(a.c.of('caught')).toEqual([]);
    expect(store.journal(a.id)).toEqual([]);
  });

  it('a first catch pays 3 KP once, tells the feed, pops for others; best size is kept', () => {
    const a = joinNew('Ann'), b = joinNew('Bo');
    const kp0 = store.wallet(a.id).kp;
    roll = 0.9;
    fish(a.id, 'carp');
    expect(a.c.of('caught')).toEqual([{ t: 'caught', species: 'carp', size: 56, first: true }]);
    expect(a.c.of('wallet').at(-1)!.wallet.kp).toBe(kp0 + 3);
    expect(b.c.of('feed').at(-1)!.event.text).toBe('🎣 Ann caught their first carp!');
    expect(b.c.of('catchPop')).toEqual([{ t: 'catchPop', id: a.id, species: 'carp' }]);
    expect(a.c.of('catchPop')).toEqual([]);

    t += 4000;
    fish(a.id, 'carp'); // 5 s cooldown
    expect(a.c.of('error').at(-1)!.code).toBe('bad_catch');
    t += 1000;
    roll = 0.1;
    fish(a.id, 'carp');
    expect(a.c.of('caught').at(-1)).toEqual({ t: 'caught', species: 'carp', size: 24, first: false });
    expect(store.wallet(a.id).kp).toBe(kp0 + 3);
    expect(store.journal(a.id)).toEqual([{ species: 'carp', count: 2, best: 56, firstAt: 1_000_000 }]);
  });

  it('bugs come from the scene life, with a 3 s cooldown and no size', () => {
    const a = joinNew('Ann');
    bug(a.id, 'moth', 22);
    expect(a.c.of('caught').at(-1)).toEqual({ t: 'caught', species: 'moth', first: true });
    t += 2000;
    bug(a.id, 'butterfly');
    expect(a.c.of('error').at(-1)!.code).toBe('bad_catch');
    t += 1000;
    bug(a.id, 'butterfly');
    expect(a.c.of('caught').at(-1)).toEqual({ t: 'caught', species: 'butterfly', first: true });
    fish(a.id, 'carp'); // fish and bugs have separate cooldowns
    expect(a.c.of('caught').at(-1)!.species).toBe('carp');
    expect(a.c.of('feed').map((f) => f.event.text)).toContain('🦋 Ann caught their first moth!');
  });

  it('rain-only species need the server weather to be rain', () => {
    const a = joinNew('Ann');
    w.forceWeather('rain');
    fish(a.id, 'rainbowTrout');
    bug(a.id, 'blueButterfly');
    expect(a.c.of('caught').map((m) => m.species)).toEqual(['rainbowTrout', 'blueButterfly']);
  });

  it('sends the journal in the welcome and on request', () => {
    const a = joinNew('Ann');
    expect(a.c.of('welcome')[0].journal).toEqual([]);
    bug(a.id, 'butterfly');
    w.handle(a.id, { t: 'getJournal' });
    expect(a.c.of('journal').at(-1)!.entries).toEqual([{ species: 'butterfly', count: 1, best: null, firstAt: t }]);
    const c = new FakeConn();
    w.join(a.profile, c);
    expect(c.of('welcome')[0].journal.map((e) => e.species)).toEqual(['butterfly']);
  });
});
