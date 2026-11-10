import { merge, plant } from './kit';
import { simpleToy } from './kitToys';
import type { SceneDef, Spot } from './types';

const FRAME_XS = [-6.3, -4.5, -2.7, -0.9, 0.9, 2.7, 4.5, 6.3];

export const GALLERY_FRAMES: Spot[] = Array.from({ length: 16 }, (_, i) => ({
  id: `g${i}`,
  kind: 'wall' as const,
  x: FRAME_XS[i % 8],
  z: -5.86,
  y: i < 8 ? 2.35 : 1.3,
  rot: 0,
}));

const EASELS: [number, number][] = [[-4.5, 0.2], [0, 1.0], [4.5, 0.2]];

const parts = merge(
  plant(-7.3, -4.8), plant(7.3, -4.8), plant(-7.3, 4.8), plant(7.3, 4.8),
  simpleToy('gallery', 'gallery', 0, -4.6, 3),
  simpleToy('easel-1', 'easel', -4.5, 0.2, 1.6, { x: -4.5, z: 0.2, w: 0.9, d: 0.9 }),
  simpleToy('easel-2', 'easel', 0, 1.0, 1.6, { x: 0, z: 1.0, w: 0.9, d: 0.9 }),
  simpleToy('easel-3', 'easel', 4.5, 0.2, 1.6, { x: 4.5, z: 0.2, w: 0.9, d: 0.9 }),
  {
    decor: [
      { kind: 'galleryWall', x: 0, z: -5.92, w: 15 },
      { kind: 'sign', x: 0, z: -5.9, y: 2.95, label: '🎨 the gallery' },
      { kind: 'rug', x: 0, z: 0.6, w: 12, d: 3.2, color: '#f4e3cf', accent: '#e9d2b8' },
      ...EASELS.map(([x, z]) => ({ kind: 'pendant' as const, x, z, y: 2.3 })),
      ...EASELS.map(([x, z]) => ({ kind: 'stool' as const, x, z: z + 1.2 })),
    ],
    colliders: [],
  },
);

export const studio: SceneDef = {
  id: 'studio',
  name: 'Studio',
  where: 'in the Studio',
  size: { w: 16, d: 12 },
  theme: {
    indoor: true,
    floor: '#d9c8b4',
    floorAccent: '#cbb59d',
    background: '#3b3140',
    fog: null,
    hemi: { sky: '#fff3e6', ground: '#a78a74', intensity: 1.05 },
    sun: { color: '#ffe9cf', intensity: 1.45, x: -4, y: 12, z: 8 },
    wall: '#fbf3e4',
    trim: '#b07f5a',
  },
  ...parts,
  doors: [{ id: 'to-village', box: { x: 0, z: 5.6, w: 1.6, d: 0.8 }, toScene: 'village', toSpawn: 'studio-door' }],
  spawns: [{ id: 'entrance', x: 0, z: 4.4, facing: Math.PI }],
};
