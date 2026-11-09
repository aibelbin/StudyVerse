import { describe, expect, it } from 'vitest';
import { awardFor, dayOf, treeStage } from './rewards';

describe('awardFor', () => {
  it('pays a minute per minute plus a first-of-the-day bonus', () => {
    expect(awardFor({ lastDay: null, streak: 0 }, '2026-11-09', 25)).toEqual({ kp: 30, streak: 1, bonus: 5 });
  });
  it('only pays the bonus once a day', () => {
    expect(awardFor({ lastDay: '2026-11-09', streak: 1 }, '2026-11-09', 25)).toEqual({ kp: 25, streak: 1, bonus: 0 });
  });
  it('grows the streak on consecutive days, across month ends', () => {
    expect(awardFor({ lastDay: '2026-11-08', streak: 2 }, '2026-11-09', 10)).toEqual({ kp: 25, streak: 3, bonus: 15 });
    expect(awardFor({ lastDay: '2026-10-31', streak: 1 }, '2026-11-01', 10)).toMatchObject({ streak: 2 });
  });
  it('resets after a missed day and caps the bonus', () => {
    expect(awardFor({ lastDay: '2026-11-07', streak: 9 }, '2026-11-09', 10)).toMatchObject({ streak: 1, bonus: 5 });
    expect(awardFor({ lastDay: '2026-11-08', streak: 20 }, '2026-11-09', 10)).toMatchObject({ streak: 21, bonus: 35 });
  });
});

describe('dayOf and treeStage', () => {
  it('formats local days', () => {
    expect(dayOf(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });
  it('grows the tree in stages', () => {
    expect([0, 59, 60, 200, 360, 599, 600, 5000].map(treeStage)).toEqual([0, 0, 1, 2, 3, 3, 4, 4]);
  });
});
