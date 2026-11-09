import { describe, expect, it } from 'vitest';
import { orderPeople, stackItems } from './bag';

describe('the bag', () => {
  it('stacks the same gift or flower into one tile with a count', () => {
    const s = stackItems([
      { id: 1, kind: 'gift', gift: 'bear' }, { id: 2, kind: 'bouquet', flower: 'rose' },
      { id: 3, kind: 'gift', gift: 'bear' }, { id: 4, kind: 'bouquet', flower: 'tulip' },
    ]);
    expect(s.map((x) => [x.key, x.count, x.first.id])).toEqual([['g:bear', 2, 1], ['f:rose', 1, 2], ['f:tulip', 1, 4]]);
  });

  it('lists people nearby first, closest first, then everyone else by name', () => {
    const order = orderPeople([
      { id: 'a', name: 'Zed', dist: null }, { id: 'b', name: 'Amy', dist: null },
      { id: 'c', name: 'Kim', dist: 12 }, { id: 'd', name: 'Bo', dist: 2 },
    ]).map((p) => p.name);
    expect(order).toEqual(['Bo', 'Kim', 'Amy', 'Zed']);
  });
});
