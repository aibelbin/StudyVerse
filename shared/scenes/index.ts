import { cafe } from './cafe';
import { library } from './library';
import { town } from './town';
import type { SceneDef, Seat } from './types';

export const SCENES: Record<string, SceneDef> = { town, library, cafe };
export const START_SCENE = 'town';
export const START_SPAWN = 'start';

export function getScene(id: string): SceneDef | undefined {
  return SCENES[id];
}

export function findSeat(sceneId: string, seatId: string): Seat | undefined {
  return SCENES[sceneId]?.seats.find((s) => s.id === seatId);
}
