import { describe, expect, it } from 'vitest';
import { isIPhone } from './fullscreen';

describe('isIPhone', () => {
  it('spots iPhones but not iPads or Android', () => {
    expect(isIPhone('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5)).toBe(true);
    expect(isIPhone('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(false); // iPad says Mac
    expect(isIPhone('Mozilla/5.0 (Linux; Android 15; Pixel 9)', 'Linux armv8l', 5)).toBe(false);
  });
});
