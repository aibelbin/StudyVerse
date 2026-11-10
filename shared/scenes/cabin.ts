import { cabinLook, cabinSceneId, lotSpawn, seedOf, type CabinEntry } from '../art';
import { merge, plant, studyDesk } from './kit';
import type { SceneDef, Spot } from './types';

const wall = (id: string, x: number, z: number, y: number, rot: number): Spot => ({ id, kind: 'wall', x, z, y, rot });
const shelf = (id: string, z: number): Spot => ({ id, kind: 'shelf', x: 3.2, z, y: 1.3, rot: -Math.PI / 2 });

/** Where a cabin's owner can hang paintings (wall) and show keepsakes (shelf). */
export const CABIN_SPOTS: Spot[] = [
  wall('w1', -2.4, -2.93, 1.85, 0),
  wall('w2', -0.8, -2.93, 1.85, 0),
  wall('w3', 0.6, -2.93, 1.85, 0),
  wall('w4', -3.43, -1.6, 1.85, Math.PI / 2),
  wall('w5', -3.43, 0.4, 1.65, Math.PI / 2),
  wall('w6', -3.43, 2.0, 1.9, Math.PI / 2),
  shelf('s1', -0.65), shelf('s2', 0.05), shelf('s3', 1.25), shelf('s4', 1.95),
];

/** The inside of one player's cabin: a desk, a bed and spots to decorate. */
export function cabinScene(e: CabinEntry): SceneDef {
  const id = cabinSceneId(e.owner);
  const look = cabinLook(e.owner);
  const parts = merge(
    studyDesk(`${id}-desk`, -1.9, -1.6, ['north']),
    plant(-3.1, 2.4), plant(3.1, 2.4),
    {
      decor: [
        { kind: 'bed', x: 2.3, z: -1.9, w: 1.2, d: 2, seed: seedOf(e.owner) },
        { kind: 'rug', x: 0, z: 0.6, w: 2.4, d: 2, color: look.roof, accent: look.wall },
        { kind: 'window', x: 1.9, z: -2.95, w: 1.4, y: 0, color: '#9fc8e8' },
        { kind: 'sunbeam', x: 1.9, z: -2.9, w: 1.4 },
        { kind: 'stringLights', x: 0, z: -2.85, y: 2.8, w: 6.5 },
        { kind: 'shelf', x: 3.28, z: -0.3, y: 1.3, rot: -Math.PI / 2, w: 1.3 },
        { kind: 'shelf', x: 3.28, z: 1.6, y: 1.3, rot: -Math.PI / 2, w: 1.3 },
        { kind: 'sign', x: -1.2, z: -2.92, y: 2.6, label: `${e.name}'s cabin` },
      ],
      colliders: [{ x: 2.3, z: -1.9, w: 1.2, d: 2 }],
    },
  );
  return {
    id,
    name: `${e.name}'s cabin`,
    where: `at ${e.name}'s cabin`,
    size: { w: 7, d: 6 },
    theme: {
      indoor: true,
      floor: '#d8b58f',
      floorAccent: '#c9a47f',
      background: '#3f2e33',
      fog: null,
      hemi: { sky: '#fff0e6', ground: '#b08a70', intensity: 1.05 },
      sun: { color: '#ffe6c8', intensity: 1.45, x: -5, y: 12, z: 8 },
      wall: look.wall,
      trim: look.roof,
    },
    decor: parts.decor,
    colliders: parts.colliders,
    slots: parts.slots,
    toys: parts.toys,
    life: parts.life,
    spots: CABIN_SPOTS,
    doors: [{ id: 'to-village', box: { x: 0, z: 2.6, w: 1.6, d: 0.8 }, toScene: 'village', toSpawn: lotSpawn(e.lot) }],
    spawns: [{ id: 'entrance', x: 0, z: 1.6, facing: Math.PI }],
  };
}
