import { cafe } from './cafe';
import { studio } from './studio';
import { library } from './library';
import { town } from './town';
import type { SceneDef, Slot } from './types';

export const SCENES: Record<string, SceneDef> = { town, library, cafe, studio };
export const START_SCENE = 'town';
export const START_SPAWN = 'start';

export function findSlot(sceneId: string, slotId: string): Slot | undefined {
  return SCENES[sceneId]?.slots.find((s) => s.id === slotId);
}
