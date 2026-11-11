import { describe, expect, it } from 'vitest';
import type { ClientMsg } from '../../../shared/protocol';
import { cabinScene } from '../../../shared/scenes/cabin';
import { ArtRooms } from './rooms';

describe('ArtRooms', () => {
  it('offers spots only in your own cabin; [E] takes down what is there or opens the picker', () => {
    const sent: ClientMsg[] = [];
    const art = new ArtRooms((m) => sent.push(m));
    art.enter(cabinScene({ owner: 'me', name: 'Me', lot: 0, locked: false }), { pictures: null, shelves: null });
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
});
