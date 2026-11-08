import { describe, expect, it } from 'vitest';
import { cleanName, isLook, parseClientMsg } from './validate';

const look = { body: '#aabbcc', skin: '#112233', hat: 'cap' };

describe('parseClientMsg', () => {
  it('parses a valid move and drops extra fields', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'move', x: 1, z: 2, facing: 0.5, anim: 'walk', evil: true }))).toEqual({
      t: 'move', x: 1, z: 2, facing: 0.5, anim: 'walk',
    });
  });
  it('rejects non-numeric coordinates', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'move', x: '1', z: 2, facing: 0, anim: 'walk' }))).toBeNull();
  });
  it('rejects unknown types, garbage and arrays', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'explode' }))).toBeNull();
    expect(parseClientMsg('not json')).toBeNull();
    expect(parseClientMsg('[1,2]')).toBeNull();
  });
  it('parses hello with a token or with invite + profile', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'hello', token: 'abc' }))).toEqual({ t: 'hello', token: 'abc' });
    expect(parseClientMsg(JSON.stringify({ t: 'hello', inviteCode: 'cozy', name: 'Sam', look }))).toEqual({
      t: 'hello', inviteCode: 'cozy', name: 'Sam', look,
    });
  });
  it('rejects hello with a bad look', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'hello', inviteCode: 'x', name: 'Sam', look: { ...look, hat: 'crown' } }))).toBeNull();
  });
  it('requires integer session lengths', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'startSession', focusMin: 25, breakMin: 5 }))).toEqual({ t: 'startSession', focusMin: 25, breakMin: 5 });
    expect(parseClientMsg(JSON.stringify({ t: 'startSession', focusMin: 2.5, breakMin: 5 }))).toBeNull();
  });
  it('parses emotes with an optional target', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'emote', kind: 'clap' }))).toEqual({ t: 'emote', kind: 'clap' });
    expect(parseClientMsg(JSON.stringify({ t: 'emote', kind: 'flex', targetId: 'p2' }))).toEqual({ t: 'emote', kind: 'flex', targetId: 'p2' });
    expect(parseClientMsg(JSON.stringify({ t: 'emote', kind: 'dance' }))).toBeNull();
  });
});

describe('cleanName', () => {
  it('trims and collapses whitespace', () => expect(cleanName('  Sam   the  owl ')).toBe('Sam the owl'));
  it('rejects empty and too long names', () => {
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('x'.repeat(17))).toBeNull();
    expect(cleanName('x'.repeat(16))).toBe('x'.repeat(16));
    expect(cleanName(42)).toBeNull();
  });
});

describe('isLook', () => {
  it('accepts valid looks and rejects bad colours', () => {
    expect(isLook(look)).toBe(true);
    expect(isLook({ ...look, body: 'red' })).toBe(false);
    expect(isLook(null)).toBe(false);
  });
});
