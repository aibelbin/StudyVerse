import { describe, expect, it } from 'vitest';
import { Feed, feedText } from './feed';

describe('Feed', () => {
  it('keeps only the newest 50 events', () => {
    const f = new Feed();
    for (let i = 0; i < 60; i++) f.push('arrive', `e${i}`, i);
    const all = f.recent(100);
    expect(all).toHaveLength(50);
    expect(all[0].text).toBe('e10');
    expect(all[49].text).toBe('e59');
  });

  it('returns the most recent n in chronological order', () => {
    const f = new Feed();
    ['a', 'b', 'c'].forEach((t, i) => f.push('arrive', t, i));
    expect(f.recent(2).map((e) => e.text)).toEqual(['b', 'c']);
  });
});

describe('feedText', () => {
  it('matches the spec copy', () => {
    expect(feedText.arrive('Sam')).toBe('🌷 Sam arrived');
    expect(feedText.leave('Sam')).toBe('👋 Sam headed home');
    expect(feedText.start('Sam', 50, 'in the Library')).toBe('📚 Sam started a 50 min session in the Library');
    expect(feedText.finish('Sam', 50)).toBe('✨ Sam finished a 50 min session!');
    expect(feedText.quit('Sam', 12, 25)).toBe('🥀 Sam left 12 min into a 25 min session');
    expect(feedText.quitDisconnect('Sam', 12, 25)).toBe("🥀 Sam disconnected and didn't come back, 12 min into a 25 min session");
    expect(feedText.cheer('Sam', 'Alex', '💪')).toBe('Sam cheered Alex 💪');
  });
});
