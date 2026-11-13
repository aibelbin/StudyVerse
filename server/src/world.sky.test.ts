import { beforeEach, describe, expect, it } from 'vitest';
import type { ErrorCode, ServerMsg } from '../../shared/protocol';
import { DEFAULT_LOOK } from '../../shared/wardrobe';
import { ProfileStore } from './db';
import { World, type Conn } from './world';

class FakeConn implements Conn {
  msgs: ServerMsg[] = [];
  closed: { code: ErrorCode; message?: string } | null = null;
  send(m: ServerMsg) { this.msgs.push(m); }
  close(code: ErrorCode, message?: string) { this.closed = { code, message }; }
  of<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[] {
    return this.msgs.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
  }
}

let t: number;
let store: ProfileStore;
let w: World;

function joinNew(name: string) {
  const profile = store.create(name, DEFAULT_LOOK, t).profile;
  const c = new FakeConn();
  w.join(profile, c);
  return { id: profile.id, c };
}
const save = (id: string, name: string, edges: [number, number][]) => w.handle(id, { t: 'saveConstellation', name, edges });

beforeEach(() => {
  t = new Date(2026, 10, 10, 22).getTime();
  store = new ProfileStore(':memory:');
  w = new World(() => t, Math.random, undefined, store);
});

describe('constellations', () => {
  it('refuses bad shapes and names', () => {
    const a = joinNew('Ann');
    const bad: [string, [number, number][]][] = [
      ['', [[0, 1]]],
      ['x'.repeat(25), [[0, 1]]],
      ['Self', [[3, 3]]],
      ['Far', [[0, 120]]],
      ['Twice', [[0, 1], [1, 0]]],
      ['Many', Array.from({ length: 9 }, (_, i) => [i, i + 1] as [number, number])],
      ['None', []],
    ];
    for (const [name, edges] of bad) save(a.id, name, edges);
    expect(a.c.of('error').map((e) => e.code)).toEqual(bad.map(() => 'bad_star'));
    expect(a.c.of('sky')).toEqual([]);
    expect(store.constellations()).toEqual([]);
  });

  it('keeps one per player and tells everyone', () => {
    const a = joinNew('Ann'), b = joinNew('Bo');
    save(a.id, 'Kettle', [[0, 1], [1, 2]]);
    for (const x of [a, b]) expect(x.c.of('sky').at(-1)!.constellations).toEqual([{ owner: a.id, ownerName: 'Ann', name: 'Kettle', edges: [[0, 1], [1, 2]] }]);
    t += 1000;
    save(a.id, 'Teapot', [[5, 6]]);
    expect(a.c.of('error').at(-1)!.code).toBe('bad_star'); // too soon
    t += 1000;
    save(a.id, 'Teapot', [[5, 6]]);
    expect(b.c.of('sky').at(-1)!.constellations).toEqual([{ owner: a.id, ownerName: 'Ann', name: 'Teapot', edges: [[5, 6]] }]);
    t += 1000;
    save(b.id, 'Cat', [[7, 8]]);
    expect(a.c.of('sky').at(-1)!.constellations.map((k) => k.name)).toEqual(['Teapot', 'Cat']);
  });

  it('sends the sky with the welcome', () => {
    const a = joinNew('Ann');
    expect(a.c.of('welcome')[0].constellations).toEqual([]);
    save(a.id, 'Kettle', [[0, 1]]);
    const c = joinNew('Cy');
    expect(c.c.of('welcome')[0].constellations.map((k) => k.name)).toEqual(['Kettle']);
  });
});
