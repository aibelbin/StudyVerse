import { describe, expect, it } from 'vitest';
import { wantsLink } from './voice';

describe('wantsLink', () => {
  const on = { voice: true, dnd: false };
  it('links two people who both turned voice on', () => {
    expect(wantsLink(on, on)).toBe(true);
  });
  it('never links when either has voice off or is in do-not-disturb', () => {
    expect(wantsLink(on, { voice: false, dnd: false })).toBe(false);
    expect(wantsLink({ voice: false, dnd: false }, on)).toBe(false);
    expect(wantsLink(on, { voice: true, dnd: true })).toBe(false);
    expect(wantsLink({ voice: true, dnd: true }, on)).toBe(false);
  });
});
