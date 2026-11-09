/** Local calendar day, 'YYYY-MM-DD', for streaks and the town's daily total. */
export function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayOf(new Date(y, m - 1, d + 1, 12).getTime());
}

export const STREAK_BONUS = 5;
export const STREAK_CAP = 7;

/**
 * Knowledge Points for a finished focus phase: 1 per minute, plus a daily bonus of
 * 5 × streak (capped at 7 days) on the first finish of each day.
 */
export function awardFor(prev: { lastDay: string | null; streak: number }, today: string, focusMin: number): { kp: number; streak: number; bonus: number } {
  if (prev.lastDay === today) return { kp: focusMin, streak: Math.max(prev.streak, 1), bonus: 0 };
  const streak = prev.lastDay && nextDay(prev.lastDay) === today ? prev.streak + 1 : 1;
  const bonus = STREAK_BONUS * Math.min(streak, STREAK_CAP);
  return { kp: focusMin + bonus, streak, bonus };
}

/** Knowledge-tree growth stage for the town's minutes today. */
export const TREE_STAGES = [0, 60, 180, 360, 600];
export function treeStage(minutes: number): number {
  let s = 0;
  for (let i = 0; i < TREE_STAGES.length; i++) if (minutes >= TREE_STAGES[i]) s = i;
  return s;
}
