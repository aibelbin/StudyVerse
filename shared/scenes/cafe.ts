import { cafeTable, merge, plant } from './kit';
import { simpleToy } from './kitToys';
import type { SceneDef } from './types';

const parts = merge(
  cafeTable('cafe-1', -4.5, -0.5), cafeTable('cafe-2', -1.5, -0.5), cafeTable('cafe-3', 1.5, -0.5), cafeTable('cafe-4', 4.5, -0.5),
  cafeTable('cafe-5', -4.5, 2.6), cafeTable('cafe-6', 4.5, 2.6),
  plant(-6.4, -4.4), plant(6.4, -4.4), plant(6.4, 4.4), plant(-6.4, 4.4),
  simpleToy('coffee', 'coffee', -2.8, -2.6, 1.5),
  {
    decor: [
      { kind: 'counter', x: -1, z: -3.6, w: 6, d: 0.9 },
      { kind: 'coffeeMachine', x: -2.8, z: -3.65, y: 1.06 },
      { kind: 'cup', x: -1.6, z: -3.5, y: 1.06 }, { kind: 'cup', x: -1.35, z: -3.7, y: 1.06 },
      { kind: 'sign', x: -1, z: -4.92, y: 2.3, label: '☕ MENU ☕' },
      { kind: 'window', x: 4.2, z: -4.95, w: 2, y: 0, color: '#e8a8a8' },
      { kind: 'frame', x: -5.3, z: -4.95, y: 1.8, w: 1, h: 0.75, seed: 2 },
      { kind: 'frame', x: 1.9, z: -4.95, y: 1.9, w: 0.7, h: 0.9, seed: 9 },
      { kind: 'stringLights', x: 0, z: -4.85, y: 2.8, w: 12.5 },
      { kind: 'chalkboard', x: 2.7, z: -3.4, rot: -0.3 },
      ...[[-4.5, -0.5], [-1.5, -0.5], [1.5, -0.5], [4.5, -0.5], [-4.5, 2.6], [4.5, 2.6]].map(([x, z], i) => ({ kind: 'pendant' as const, x, z, y: 2.3, color: i % 2 ? '#7ab8c8' : '#e8c35a' })),
      { kind: 'rug', x: 0, z: 2.6, w: 3, d: 2, color: '#e8b4a8', accent: '#f7dcd2' },
    ],
    colliders: [{ x: -1, z: -3.6, w: 6, d: 0.9 }, { x: 2.7, z: -3.4, w: 0.7, d: 0.4 }],
  },
);

export const cafe: SceneDef = {
  id: 'cafe',
  name: 'Café',
  where: 'in the Café',
  size: { w: 14, d: 10 },
  theme: {
    indoor: true,
    floor: '#e8c9a8',
    floorAccent: '#dab691',
    background: '#3f2e33',
    fog: null,
    hemi: { sky: '#fff0e6', ground: '#b08a70', intensity: 1.05 },
    sun: { color: '#ffe6c8', intensity: 1.45, x: -5, y: 12, z: 8 },
    wall: '#f6d6cf',
    trim: '#9c6b55',
  },
  ...parts,
  doors: [{ id: 'to-town', box: { x: 0, z: 4.6, w: 1.6, d: 0.8 }, toScene: 'town', toSpawn: 'from-cafe' }],
  spawns: [{ id: 'entrance', x: 0, z: 3.4, facing: Math.PI }],
};
