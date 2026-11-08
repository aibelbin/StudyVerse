import { describe, expect, it } from 'vitest';
import { backoffDelay } from './connection';

describe('backoffDelay', () => {
  it('backs off 1, 2, 4, 8 s and then retries every 10 s', () => {
    expect([0, 1, 2, 3, 4, 9].map(backoffDelay)).toEqual([1000, 2000, 4000, 8000, 10000, 10000]);
  });
});
