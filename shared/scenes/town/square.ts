import { bench, building, lampPost, merge, type Parts } from '../kit';
import { piano, simpleToy } from '../kitToys';
import type { Door, Spawn } from '../types';

const BANDSTAND = { x: 0, z: -9, r: 3.2 };

const pillars = Array.from({ length: 8 }, (_, k) => {
  const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
  return { x: BANDSTAND.x + Math.sin(a) * 3, z: BANDSTAND.z + Math.cos(a) * 3, w: 0.25, d: 0.25 };
});

const lamps = [-66, -56, -36, -20, -10, 10, 20, 36, 56, 66].map((x) => lampPost(x, 3.3));

export const square: Parts = merge(
  building(-12, -6, 9, 7, 4.4, '#f2dcc0', '#8c5a6e', 'Library'),
  building(12, -6, 8, 6.5, 3.8, '#f7d0c8', '#5f9a72', 'Café'),
  piano('piano', 0, -10),
  simpleToy('fountain', 'fountain', 0, 6, 2.6, { x: 0, z: 6, w: 3.2, d: 3.2 }),
  simpleToy('bell', 'bell', -6, 7, 1.4, { x: -6, z: 7, w: 0.3, d: 0.3 }),
  simpleToy('jukebox', 'jukebox', 17.6, -3.5, 1.4, { x: 17.6, z: -3.5, w: 0.8, d: 0.6 }),
  simpleToy('boutique', 'shop', -19.6, -4, 2.0, { x: -19.6, z: -4.6, w: 2.6, d: 1.2 }),
  simpleToy('board', 'board', -5.6, -2.9, 1.6, { x: -5.6, z: -3.1, w: 1.6, d: 0.25 }),
  bench('sq-b1', -5, -1, 0),
  bench('sq-b2', 5, -1, 0),
  bench('sq-b3', -4.5, 9, Math.PI),
  bench('sq-b4', 4.5, 9, Math.PI),
  ...lamps,
  lampPost(-7, -12), lampPost(7, -12), lampPost(-7, 9.5), lampPost(7, 9.5),
  {
    decor: [
      { kind: 'bandstand', x: BANDSTAND.x, z: BANDSTAND.z, w: BANDSTAND.r },
      { kind: 'knowledgeTree', x: 7.5, z: 5.5 },
      { kind: 'flowers', x: -9, z: 3.6, seed: 1 }, { kind: 'flowers', x: 9, z: 3.6, seed: 2 },
      { kind: 'flowers', x: -15.5, z: -2, seed: 3 }, { kind: 'flowers', x: 15.5, z: -2.3, seed: 4 },
      { kind: 'bush', x: -17.5, z: -2.4, seed: 7 }, { kind: 'bush', x: 7.6, z: -2.4, seed: 8 },
    ],
    colliders: [...pillars, { x: 7.5, z: 5.5, w: 0.7, d: 0.7 }],
    life: [{ kind: 'birds', x: 0, z: 0, r: 9, count: 6, seed: 21 }],
  },
);

export const squareDoors: Door[] = [
  { id: 'to-library', box: { x: -12, z: -2.1, w: 1.4, d: 0.8 }, toScene: 'library', toSpawn: 'entrance' },
  { id: 'to-cafe', box: { x: 12, z: -2.35, w: 1.4, d: 0.8 }, toScene: 'cafe', toSpawn: 'entrance' },
];

export const squareSpawns: Spawn[] = [
  { id: 'start', x: 0, z: 1.5, facing: 0 },
  { id: 'from-library', x: -12, z: -0.4, facing: 0 },
  { id: 'from-cafe', x: 12, z: -0.6, facing: 0 },
];
