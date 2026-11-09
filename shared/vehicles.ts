import { pointInPolygon, type Box } from './geometry';
import type { SceneDef } from './scenes/types';
import { BOAT_SPEED, boatOnWater, type ToyKind } from './toys';

export interface VehicleSpec {
  /** Top speed, m/s. */
  speed: number;
  medium: 'water' | 'land';
  /** Glides back to where it started once nobody is steering. */
  home: boolean;
  /** Collision radius for driving on land. */
  radius: number;
}

export const VEHICLES: Partial<Record<ToyKind, VehicleSpec>> = {
  rowboat: { speed: BOAT_SPEED, medium: 'water', home: true, radius: 0.7 },
  truck: { speed: 7, medium: 'land', home: false, radius: 1.1 },
};

/** Slot poses whose sitter steers the vehicle with their moves. */
export const CONTROLLER_POSES = ['row', 'drive'] as const;

const hitsBox = (b: Box, x: number, z: number, r: number) => Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r;

/**
 * May a vehicle of this kind sit at (x, z)? Boats need water all round; land vehicles need to be
 * inside the map, off the water and clear of colliders (with a little slack for the client's sliding).
 */
export function vehicleOk(kind: ToyKind, def: SceneDef, x: number, z: number): boolean {
  const spec = VEHICLES[kind];
  if (!spec) return false;
  if (spec.medium === 'water') return boatOnWater(def.water?.outline, x, z);
  const r = spec.radius * 0.7;
  if (Math.abs(x) > def.size.w / 2 - r || Math.abs(z) > def.size.d / 2 - r) return false;
  if (def.water && [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dz]) => pointInPolygon(def.water!.outline, x + dx, z + dz))) return false;
  return !def.colliders.some((b) => hitsBox(b, x, z, r * 0.6));
}
