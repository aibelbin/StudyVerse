import { describe, expect, it } from 'vitest';
import { handedToken, moveTo } from './server';

const T = 'a'.repeat(64);

describe('moving to the home address', () => {
  it('reads a handed-over token and nothing else', () => {
    expect(handedToken(`#t=${T}`)).toBe(T);
    expect(handedToken('#t=xyz')).toBeNull();
    expect(handedToken('')).toBeNull();
  });
  it('sends other hosts home with the token, but not home itself or localhost', () => {
    const home = 'https://costudy.vercel.app';
    expect(moveTo({ origin: 'https://old.ts.net:8443', hostname: 'old.ts.net', search: '?debug' }, T, home)).toBe(`${home}?debug#t=${T}`);
    expect(moveTo({ origin: 'https://old.ts.net:8443', hostname: 'old.ts.net', search: '' }, null, home)).toBe(home);
    expect(moveTo({ origin: home, hostname: 'costudy.vercel.app', search: '' }, T, home)).toBeNull();
    expect(moveTo({ origin: 'http://localhost:5173', hostname: 'localhost', search: '' }, T, home)).toBeNull();
    expect(moveTo({ origin: 'https://old.ts.net', hostname: 'old.ts.net', search: '' }, T, '')).toBeNull();
  });
});
