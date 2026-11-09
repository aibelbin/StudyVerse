import { bookshelf, merge, plant, studyDesk } from './kit';
import { simpleToy } from './kitToys';
import type { SceneDef } from './types';

const parts = merge(
  studyDesk('lib-1', -5.5, -2), studyDesk('lib-2', -2.5, -2), studyDesk('lib-3', 2.5, -2), studyDesk('lib-4', 5.5, -2),
  studyDesk('lib-5', -5.5, 1.8), studyDesk('lib-6', -2.5, 1.8), studyDesk('lib-7', 2.5, 1.8), studyDesk('lib-8', 5.5, 1.8),
  bookshelf(-6, -5.6), bookshelf(-3, -5.6), bookshelf(3, -5.6), bookshelf(6, -5.6),
  bookshelf(-7.6, 0, 3, Math.PI / 2), bookshelf(7.6, 0, 3, -Math.PI / 2),
  plant(-7.3, -4.3), plant(7.3, -4.3), plant(-7.3, 4.6), plant(7.3, 4.6),
  simpleToy('quotes', 'quotes', -6, -4.9, 1.4),
  {
    decor: [
      { kind: 'window', x: 0, z: -5.95, w: 2.2, y: 0, color: '#9fb8d8' },
      { kind: 'sunbeam', x: 0, z: -5.9, w: 2.2 },
      { kind: 'frame', x: -7.93, z: -3.6, y: 1.7, rot: Math.PI / 2, w: 1.1, h: 0.8, seed: 3 },
      { kind: 'frame', x: 7.93, z: 3.4, y: 1.7, rot: -Math.PI / 2, w: 0.9, h: 0.7, seed: 8 },
      { kind: 'frame', x: -7.93, z: 3.4, y: 1.6, rot: Math.PI / 2, w: 0.7, h: 0.9, seed: 5 },
      { kind: 'rug', x: 0, z: -0.1, w: 2.4, d: 7.5, color: '#d98c8c', accent: '#f2c4b0' },
      { kind: 'sign', x: 0, z: -5.92, y: 2.55, label: 'shhh… studying 📚' },
    ],
  },
);

export const library: SceneDef = {
  id: 'library',
  name: 'Library',
  where: 'in the Library',
  size: { w: 16, d: 12 },
  theme: {
    indoor: true,
    floor: '#c99f78',
    floorAccent: '#b88e69',
    background: '#3d2f3a',
    fog: null,
    hemi: { sky: '#fff2e0', ground: '#a07a5a', intensity: 1.05 },
    sun: { color: '#ffe2b8', intensity: 1.5, x: 6, y: 12, z: 8 },
    wall: '#f0dcc4',
    trim: '#b07f5a',
  },
  ...parts,
  doors: [{ id: 'to-town', box: { x: 0, z: 5.6, w: 1.6, d: 0.8 }, toScene: 'town', toSpawn: 'from-library' }],
  spawns: [{ id: 'entrance', x: 0, z: 4.2, facing: Math.PI }],
};
