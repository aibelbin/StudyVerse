import { cabinLook, cabinSceneId, LOT_XS, lotSpawn, ROW_D, seedOf, villageRows, villageSize, type CabinEntry } from '../art';
import { building, lampPost, merge, tree, type Parts } from './kit';
import { edges, GATE_GAP } from './town/edges';
import { simpleToy } from './kitToys';
import { OUTDOOR_THEME } from './town';
import type { Door, SceneDef, Spawn } from './types';

/** One lot: a cabin with its door and doorstep spawn, or a free lot with flowers and a sign. */
function lot(k: number, x: number, z: number, e: CabinEntry | undefined, doors: Door[], spawns: Spawn[]): Partial<Parts> {
  if (!e) {
    return {
      decor: [
        { kind: 'flowers', x: x - 1.2, z: z - 0.6, seed: k * 3 + 1 },
        { kind: 'flowers', x: x + 0.9, z: z - 1.3, seed: k * 3 + 2 },
        { kind: 'bush', x: x - 1.5, z: z + 1.3, seed: k * 3 + 3 },
        { kind: 'signpost', x: x + 1.6, z: z + 1.9, label: 'free lot' },
      ],
      colliders: [{ x: x + 1.6, z: z + 1.9, w: 0.3, d: 0.3 }],
    };
  }
  const look = cabinLook(e.owner);
  const dx = x - 0.7; // the cabin decor draws its door 0.7 m left of centre
  doors.push({ id: `cabin-${e.owner}`, box: { x: dx, z: z + 2.8, w: 1.4, d: 0.8 }, toScene: cabinSceneId(e.owner), toSpawn: 'entrance' });
  spawns.push({ id: lotSpawn(k), x: dx, z: z + 3.6, facing: 0 });
  return {
    decor: [
      { kind: 'cabin', x, z, w: 5, d: 4.5, h: 2.6, color: look.wall, accent: look.roof, label: (e.locked ? '🔒 ' : '') + e.name, seed: seedOf(e.owner) },
      { kind: 'flowers', x: x - 1.9, z: z + 2.6, seed: k * 3 + 1 },
      { kind: 'flowers', x: x + 1.9, z: z + 2.6, seed: k * 3 + 2 },
      { kind: 'mailbox', x: x + 1.9, z: z + 2.9, accent: e.mail ? 'up' : 'down' },
    ],
    colliders: [{ x, z, w: 5, d: 4.5 }, { x: x + 1.9, z: z + 2.9, w: 0.4, d: 0.4 }],
    toys: [{ id: `mailbox-${e.owner}`, kind: 'mailbox', x: x + 1.9, z: z + 2.9, radius: 1.2 }],
  };
}

/** The village: the gate from town at the south edge, the studio and post office by it, then rows of six cabin lots going north. */
export function villageScene(roster: CabinEntry[]): SceneDef {
  const size = villageSize(roster.length);
  const hd = size.d / 2;
  const rowZ = (r: number) => hd - 18 - ROW_D * r;
  const doors: Door[] = [
    { id: 'to-town', box: { x: 0, z: hd - 2.6, w: 2.4, d: 1.2 }, toScene: 'town', toSpawn: 'from-village' },
    { id: 'to-studio', box: { x: -14, z: hd - 6.9, w: 1.4, d: 0.8 }, toScene: 'studio', toSpawn: 'entrance' },
  ];
  const spawns: Spawn[] = [
    { id: 'gate', x: 0, z: hd - 4.2, facing: Math.PI },
    { id: 'studio-door', x: -14, z: hd - 5.8, facing: 0 },
  ];
  const rows: Partial<Parts>[] = [];
  for (let r = 0; r < villageRows(roster.length); r++) {
    const z = rowZ(r);
    rows.push(
      { decor: [{ kind: 'path', x: 0, z, w: 50, d: 2 }] },
      lampPost(-2.2, z + 1.6), lampPost(2.2, z + 1.6),
      tree(-22.5, z - 8, 1.1), tree(22.5, z - 8, 1.1),
    );
    LOT_XS.forEach((x, c) => {
      const k = 6 * r + c;
      rows.push(lot(k, x, z - 4.5, roster.find((e) => e.lot === k), doors, spawns));
    });
  }
  const parts = merge(
    edges(size.w, size.d, undefined, [{ side: 'south', at: 0, w: GATE_GAP }]),
    {
      decor: [
        { kind: 'path', x: 0, z: 0, w: 3, d: size.d - 4 },
        { kind: 'path', x: -7, z: hd - 6.9, w: 14, d: 2 },
        { kind: 'path', x: 7, z: hd - 6.9, w: 14, d: 2 },
        { kind: 'mound', x: 0, z: -hd + 6, w: 5 },
        { kind: 'observatory', x: 0, z: -hd + 6 },
        { kind: 'gate', x: 0, z: hd - 1.5, label: 'Town' },
        { kind: 'signpost', x: 2.4, z: hd - 6, label: 'Cabins|Studio' },
      ],
      colliders: [{ x: 2.4, z: hd - 6, w: 0.3, d: 0.3 }],
    },
    building(-14, hd - 11, 10, 7, 4, '#fbf3e4', '#b07f5a', 'Studio'),
    building(14, hd - 11, 8, 6, 3.6, '#f3e3d0', '#5a7a9c', 'Post office'),
    simpleToy('post', 'postBox', 14, hd - 7.4, 1.6),
    simpleToy('stargaze', 'observatory', 0, -hd + 8.5, 2.2, { x: 0, z: -hd + 6, w: 3, d: 3 }),
    ...rows,
    {
      life: [
        { kind: 'butterflies', x: 0, z: 0, r: 20, count: 10, seed: 71 },
        { kind: 'birds', x: 0, z: hd - 10, r: 8, count: 4, seed: 72 },
      ],
    },
  );
  return {
    id: 'village',
    name: 'Village',
    where: 'in the village',
    size,
    theme: OUTDOOR_THEME,
    decor: parts.decor,
    colliders: parts.colliders,
    slots: parts.slots,
    toys: parts.toys,
    life: parts.life,
    doors,
    spawns,
  };
}
