import { describe, expect, it } from 'vitest';
import type { ClientMsg } from '../../../shared/protocol';
import { cabinScene } from '../../../shared/scenes/cabin';
import { studio } from '../../../shared/scenes/studio';
import { ArtRooms } from './rooms';
import type { Pictures } from './views';

describe('ArtRooms', () => {
  it('offers spots only in your own cabin; [E] takes down what is there or opens the picker', () => {
    const sent: ClientMsg[] = [];
    const art = new ArtRooms((m) => sent.push(m));
    art.enter(cabinScene({ owner: 'me', name: 'Me', lot: 0, locked: false, mail: false }), { pictures: null, cork: null, shelves: null });
    expect(art.targets('you')).toEqual([]);
    art.onMessage({ t: 'cabinState', state: { owner: 'someone', locked: true, items: [] } }); // another cabin's
    expect(art.latch('me')).toBeNull();
    art.onMessage({ t: 'cabinState', state: { owner: 'me', locked: false, items: [{ spot: 's1', kind: 'bouquet', flower: 'rose' }] } });
    expect(art.latch('me')).toBe(false);
    const [s1, w1] = ['s1', 'w1'].map((id) => art.targets('me').find((t) => t.spot.id === id)!);
    expect(s1.prompt).toMatch(/^\[E\] take down the bouquet/);
    expect(w1.prompt).toBe('[E] hang a painting here');
    const picked: string[] = [];
    art.use(s1.spot, (s) => picked.push(s.id));
    art.use(w1.spot, (s) => picked.push(s.id));
    expect(sent).toEqual([{ t: 'cabin', action: 'clear', spot: 's1' }]);
    expect(picked).toEqual(['w1']);
  });

  it('puts paintings for sale on the gallery frames and photos on the cork board', () => {
    const shown = (calls: unknown[][]) => calls.at(-1)![0] as { id: string; painting: { id: number } | null }[];
    const frames: unknown[][] = [], cork: unknown[][] = [];
    const art = new ArtRooms(() => {});
    const fake = (log: unknown[][]) => ({ set: (...a: unknown[]) => log.push(a) }) as unknown as Pictures;
    art.enter(studio, { pictures: fake(frames), cork: fake(cork), shelves: null });
    const meta = (id: number) => ({ id, artist: 'a', artistName: 'A', title: 't', price: 1, forSale: false, mode: 'photo' as const, sold: 0, at: 0 });
    art.onMessage({ t: 'gallery', forSale: [meta(1)], photos: [meta(2)] });
    expect(shown(frames).every((f) => f.id.startsWith('g'))).toBe(true);
    expect(shown(frames)[0].painting?.id).toBe(1);
    expect(shown(cork).map((f) => f.id)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
    expect(shown(cork)[0].painting?.id).toBe(2);
    expect(shown(cork)[1].painting).toBeNull();
  });
});
