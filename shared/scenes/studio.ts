import { GALLERY_WALL } from '../art';
import { merge, plant } from './kit';
import { simpleToy } from './kitToys';
import type { Box } from '../geometry';
import type { SceneDef, Spot } from './types';

const FRAME_XS = [-6.3, -4.5, -2.7, -0.9, 0.9, 2.7, 4.5, 6.3];

const GALLERY_FRAMES: Spot[] = Array.from({ length: GALLERY_WALL }, (_, i) => ({
  id: `g${i}`,
  kind: 'wall' as const,
  x: FRAME_XS[i % 8],
  z: -5.86,
  y: i < 8 ? 2.35 : 1.3,
  rot: 0,
}));

export const BOOTH_BOX: Box = { x: -6.6, z: -1, w: 2.6, d: 2 };
export const BOOTH_CAM = { x: -3.2, y: 1.6, z: -1, lookAt: { x: -7.5, y: 1.0, z: -1 } };

/** Cork board pins (the client's photo cards, not cabin-style spots): two rows of four on the east wall. */
export const CORK_PINS: Spot[] = Array.from({ length: 8 }, (_, i) => ({
  id: `c${i}`,
  kind: 'wall' as const,
  x: 6.2 + [-0.84, -0.28, 0.28, 0.84][i % 4],
  z: -2.56,
  y: i < 4 ? 1.55 : 0.95,
  rot: 0,
}));

const EASELS: [number, number][] = [[-4.5, 0.2], [0, 1.0], [4.5, 0.2]];

const parts = merge(
  plant(-7.3, -4.8), plant(7.3, -4.8), plant(-7.3, 4.8), plant(7.3, 4.8),
  simpleToy('gallery', 'gallery', 0, -4.6, 3),
  simpleToy('booth', 'photoBooth', -2.9, -1, 2.4), // just behind BOOTH_CAM, so the tripod never shows in the photo
  simpleToy('wheel', 'wheel', 6.6, 2.2, 1.6, { x: 6.6, z: 2.2, w: 0.9, d: 0.9 }),
  simpleToy('easel-1', 'easel', -4.5, 0.2, 1.6, { x: -4.5, z: 0.2, w: 0.9, d: 0.9 }),
  simpleToy('easel-2', 'easel', 0, 1.0, 1.6, { x: 0, z: 1.0, w: 0.9, d: 0.9 }),
  simpleToy('easel-3', 'easel', 4.5, 0.2, 1.6, { x: 4.5, z: 0.2, w: 0.9, d: 0.9 }),
  {
    decor: [
      { kind: 'galleryWall', x: 0, z: -5.92, w: 15 },
      { kind: 'curtain', x: -7.9, z: -1, rot: Math.PI / 2, w: 2.6 },
      { kind: 'corkBoard', x: 6.2, z: -2.6, y: 1.25, w: 2.4, h: 1.3 }, // freestanding, facing the camera
      { kind: 'potteryWheel', x: 6.6, z: 2.2 },
      { kind: 'sign', x: 0, z: -5.9, y: 2.95, label: '🎨 the gallery' },
      { kind: 'rug', x: 0, z: 0.6, w: 12, d: 3.2, color: '#f4e3cf', accent: '#e9d2b8' },
      ...EASELS.map(([x, z]) => ({ kind: 'pendant' as const, x, z, y: 2.3 })),
      ...EASELS.map(([x, z]) => ({ kind: 'stool' as const, x, z: z + 1.2 })),
    ],
    colliders: [{ x: 6.2, z: -2.6, w: 2.5, d: 0.3 }],
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
  spots: GALLERY_FRAMES,
  doors: [{ id: 'to-village', box: { x: 0, z: 5.6, w: 1.6, d: 0.8 }, toScene: 'village', toSpawn: 'studio-door' }],
  spawns: [{ id: 'entrance', x: 0, z: 4.4, facing: Math.PI }],
};
