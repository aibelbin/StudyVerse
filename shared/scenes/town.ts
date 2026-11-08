import { bench, building, lampPost, merge, tree } from './kit';
import type { SceneDef } from './types';

const parts = merge(
  building(-9, -9, 8, 6, 4.2, '#f2dcc0', '#8c5a6e', 'Library'),
  building(9, -9, 7, 6, 3.6, '#f7d0c8', '#5f9a72', 'Café'),
  bench('park-b1', 6, 5, 0),
  bench('park-b2', 6, 11.5, Math.PI),
  bench('park-b3', -6, 5, 0),
  bench('park-b4', -10, 5, 0),
  tree(-16, -1, 1.1), tree(-14, 4, 0.9), tree(-17, 9, 1.2), tree(-12, 12, 1), tree(-3, 12.5, 0.9),
  tree(2.5, 13.5, 1.1), tree(12, 13, 1), tree(16, 9.5, 1.2), tree(17, 3, 0.9), tree(15.5, -1.5, 1),
  tree(-1.5, -10, 1, 'pine'), tree(1.8, -11.5, 1.2, 'pine'), tree(-17, -11, 1.3, 'pine'),
  tree(17, -11, 1.2, 'pine'), tree(15, -13.5, 1, 'pine'), tree(-15, -13.5, 0.9, 'pine'),
  lampPost(-4, -2.6), lampPost(4, -2.6), lampPost(-1.6, 6), lampPost(1.6, 10),
  {
    decor: [
      { kind: 'path', x: 0, z: -4, w: 32, d: 2 },
      { kind: 'path', x: 0, z: 5, w: 2, d: 18 },
      { kind: 'path', x: -9, z: -5.4, w: 1.6, d: 1.4 },
      { kind: 'path', x: 9, z: -5.4, w: 1.6, d: 1.4 },
      { kind: 'pond', x: 6, z: 8, w: 6, d: 4, seed: 4 },
      { kind: 'flowers', x: -12, z: -5.4, seed: 1 }, { kind: 'flowers', x: -6, z: -5.4, seed: 2 },
      { kind: 'flowers', x: 5.6, z: -5.4, seed: 3 }, { kind: 'flowers', x: 12.4, z: -5.4, seed: 4 },
      { kind: 'flowers', x: -8, z: 7.5, seed: 5 }, { kind: 'flowers', x: 3, z: 6.5, seed: 6 },
      { kind: 'bush', x: -13.5, z: -5.6, seed: 7 }, { kind: 'bush', x: 13, z: -5.6, seed: 8 },
      { kind: 'bush', x: 9.5, z: 10.5, seed: 9 }, { kind: 'bush', x: -4, z: 9, seed: 10 },
    ],
    colliders: [{ x: 6, z: 8, w: 5, d: 3 }],
  },
);

export const town: SceneDef = {
  id: 'town',
  name: 'Town',
  where: 'in the park',
  size: { w: 40, d: 30 },
  theme: {
    indoor: false,
    floor: '#9fd38a',
    floorAccent: '#8cc77a',
    background: ['#9fd0f2', '#fde9d6'],
    fog: { color: '#fbe7d4', near: 30, far: 70 },
    hemi: { sky: '#fff3e0', ground: '#7fae6a', intensity: 1.7 },
    sun: { color: '#fff0d6', intensity: 2.4, x: 12, y: 22, z: 10 },
  },
  ...parts,
  doors: [
    { id: 'to-library', box: { x: -9, z: -5.6, w: 1.4, d: 0.8 }, toScene: 'library', toSpawn: 'entrance' },
    { id: 'to-cafe', box: { x: 9, z: -5.6, w: 1.4, d: 0.8 }, toScene: 'cafe', toSpawn: 'entrance' },
  ],
  spawns: [
    { id: 'start', x: 0, z: 0, facing: 0 },
    { id: 'from-library', x: -9, z: -3.6, facing: 0 },
    { id: 'from-cafe', x: 9, z: -3.6, facing: 0 },
  ],
};
