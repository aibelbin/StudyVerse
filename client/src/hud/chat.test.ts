import { describe, expect, it } from 'vitest';
import type { ChatMsg } from '../../../shared/types';
import { GLOBAL, tabOf, unreadCount } from './chat';

const m = (id: number, from: string, to: string | null): ChatMsg => ({ id, from, fromName: from, to, text: 'x', at: 0, reactions: {} });

describe('chat tabs', () => {
  it('files messages under Everyone or the other person', () => {
    expect(tabOf(m(1, 'a', null), 'me')).toBe(GLOBAL);
    expect(tabOf(m(2, 'a', 'me'), 'me')).toBe('a');
    expect(tabOf(m(3, 'me', 'b'), 'me')).toBe('b');
  });

  it('counts unread messages from others after the last read id', () => {
    const msgs = [m(1, 'a', null), m(2, 'me', null), m(3, 'a', null), m(4, 'a', 'me'), m(5, 'b', 'me')];
    expect(unreadCount(msgs, GLOBAL, 'me', 0)).toBe(2);
    expect(unreadCount(msgs, GLOBAL, 'me', 1)).toBe(1);
    expect(unreadCount(msgs, 'a', 'me', 0)).toBe(1);
    expect(unreadCount(msgs, 'a', 'me', 4)).toBe(0);
  });
});
