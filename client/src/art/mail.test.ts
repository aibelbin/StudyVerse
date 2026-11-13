import { describe, expect, it } from 'vitest';
import type { CabinEntry } from '../../../shared/art';
import { mailFlags } from './mail';

const e = (owner: string, mail: boolean): CabinEntry => ({ owner, name: owner, lot: 0, locked: false, mail });

describe('mailFlags', () => {
  it('lists owners whose flag flipped, skipping new and unchanged cabins', () => {
    expect(mailFlags([e('a', false), e('b', true), e('c', false)], [e('a', true), e('b', false), e('c', false), e('d', true)])).toEqual(['a', 'b']);
  });
  it('is empty for the same roster', () => {
    expect(mailFlags([e('a', true)], [e('a', true)])).toEqual([]);
  });
});
