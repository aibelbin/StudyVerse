import { pointInPolygon } from '../geometry';
import { merge, shift } from './kit';
import { edges } from './town/edges';
import { lake, water } from './town/lake';
import { meadows } from './town/meadows';
import { park } from './town/park';
import { parking } from './town/parking';
import { playground } from './town/playground';
import { GOLF_BOX } from '../golf';
import { inAny, PATHS, scatter, TOWN_DZ, ZEN_BOX } from './town/scatter';
import { south, STAGE_BOX } from './town/south';
import { STAGE } from './town/stage';
import { square, squareDoors, squareSpawns } from './town/square';
import { woods } from './town/woods';
import type { Decor, Door, SceneDef, Spawn, Water } from './types';

// Everything laid out for the 150×100 town, then moved north to make room for the south strip.
const base = merge(square, parking, lake, woods, park, playground);
const at = <T extends { z: number }>(o: T): T => ({ ...o, z: o.z + TOWN_DZ });
const pt = ([x, z]: [number, number]): [number, number] => [x, z + TOWN_DZ];
const townWater: Water = {
  outline: water.outline.map(pt),
  landings: water.landings.map(at),
  sailPaths: water.sailPaths.map((s) => ({ ...s, points: s.points.map(pt) })),
};
const doors: Door[] = squareDoors.map((d) => ({ ...d, box: at(d.box) }));
const spawns: Spawn[] = squareSpawns.map(at);
const placed = merge(shift(merge(base, meadows(base, water.outline)), 0, TOWN_DZ), edges);
const zones = merge(placed, south(placed, townWater.outline));

const MAP = { x: 0, z: 0, w: 144, d: 124 };
const lots = zones.decor.filter((d) => d.kind === 'parking').map((d) => ({ x: d.x, z: d.z, w: d.w ?? 0, d: d.d ?? 0 }));
const free = (pad: number) => (x: number, z: number) =>
  !inAny(PATHS, x, z, pad) && !inAny(zones.colliders, x, z, pad) && !inAny(lots, x, z, pad) && !pointInPolygon(townWater.outline, x, z)
  && !zones.toys.some((t) => Math.hypot(t.x - x, t.z - z) < t.radius + 0.5)
  && !inAny([STAGE_BOX, ZEN_BOX, GOLF_BOX], x, z, pad); // keep the stage, the zen corner and the golf course tidy

const grass: Decor[] = scatter(9001, 1100, MAP, free(0.3)).map(([x, z], i) => ({ kind: 'grass', x, z, seed: i }));
const rocks: Decor[] = scatter(9002, 110, MAP, free(0.8)).map(([x, z], i) => ({ kind: 'rock', x, z, rot: i * 1.7, seed: 50 + i }));

const paths: Decor[] = PATHS.map((b) => ({ kind: 'path', x: b.x, z: b.z, w: b.w, d: b.d }));

export const town: SceneDef = {
  id: 'town',
  name: 'Town',
  where: 'in town',
  size: { w: 150, d: 130 },
  theme: {
    indoor: false,
    floor: '#9fd38a',
    floorAccent: '#8cc77a',
    background: ['#9fd0f2', '#fde9d6'],
    fog: { color: '#fbe7d4', near: 34, far: 78 },
    hemi: { sky: '#fff3e0', ground: '#7fae6a', intensity: 1.7 },
    sun: { color: '#fff0d6', intensity: 2.4, x: 12, y: 22, z: 10 },
  },
  decor: [...paths, ...zones.decor, ...grass, ...rocks],
  colliders: zones.colliders,
  slots: zones.slots,
  toys: zones.toys,
  life: zones.life,
  water: townWater,
  parking: zones.parking,
  stage: STAGE,
  props: zones.props,
  doors,
  spawns,
};
