/** Knowledge-tree growth stage for the whole town's focus minutes today. */
export const TREE_STAGES = [0, 60, 180, 360, 600];

export function treeStage(minutes: number): number {
  let s = 0;
  for (let i = 0; i < TREE_STAGES.length; i++) if (minutes >= TREE_STAGES[i]) s = i;
  return s;
}
