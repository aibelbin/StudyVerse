import { describe, expect, it } from 'vitest';
import { cleanName, isLook, parseClientMsg } from './validate';

const look = { body: '#aabbcc', eyes: 'dot', hat: 'cap', top: 'none', face: 'none', back: 'none', neck: 'none' };

describe('parseClientMsg', () => {
  it('parses use with an optional small integer arg', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'use', toyId: 'bell', action: 'ring', x: 1 }))).toEqual({ t: 'use', toyId: 'bell', action: 'ring' });
    expect(parseClientMsg(JSON.stringify({ t: 'use', toyId: 'piano', action: 'note', arg: 7 }))).toEqual({ t: 'use', toyId: 'piano', action: 'note', arg: 7 });
  });
  it('rejects bad use messages', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'use', toyId: 'bell', action: 'explode' }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'use', toyId: 'x'.repeat(41), action: 'ring' }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'use', toyId: 'piano', action: 'note', arg: 8 }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'use', toyId: 'piano', action: 'note', arg: 1.5 }))).toBeNull();
  });
  it('parses sit by slotId', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'sit', slotId: 'a' }))).toEqual({ t: 'sit', slotId: 'a' });
    expect(parseClientMsg(JSON.stringify({ t: 'sit', seatId: 'a' }))).toBeNull();
  });
  it('parses chat, trimming and dropping control characters', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'chat', text: '  hi\u0007 there  ' }))).toEqual({ t: 'chat', text: 'hi  there' });
    expect(parseClientMsg(JSON.stringify({ t: 'chat', text: 'yo', to: 'p2' }))).toEqual({ t: 'chat', text: 'yo', to: 'p2' });
    expect(parseClientMsg(JSON.stringify({ t: 'chat', text: '   ' }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'chat', text: 'x'.repeat(201) }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'chat', text: 'hi', to: 3 }))).toBeNull();
  });

  it('parses reactions and acts from the allowed sets only', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'react', id: 4, emoji: '🎉' }))).toEqual({ t: 'react', id: 4, emoji: '🎉' });
    expect(parseClientMsg(JSON.stringify({ t: 'react', id: 4, emoji: '💩' }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'react', id: 1.5, emoji: '👍' }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'act', kind: 'dance' }))).toEqual({ t: 'act', kind: 'dance' });
    expect(parseClientMsg(JSON.stringify({ t: 'act', kind: 'moonwalk' }))).toBeNull();
  });

  it('parses sips and coffee gifts', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'sip' }))).toEqual({ t: 'sip' });
    expect(parseClientMsg(JSON.stringify({ t: 'offerCoffee', to: 'p1' }))).toEqual({ t: 'offerCoffee', to: 'p1' });
    expect(parseClientMsg(JSON.stringify({ t: 'offerCoffee', to: 5 }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'answerCoffee', fromId: 'p1', accept: true }))).toEqual({ t: 'answerCoffee', fromId: 'p1', accept: true });
    expect(parseClientMsg(JSON.stringify({ t: 'answerCoffee', fromId: 'p1', accept: 'yes' }))).toBeNull();
  });

  it('accepts a truck tilt within range and refuses a wild one', () => {
    const base = { t: 'move', x: 1, z: 2, facing: 0, anim: 'sit' };
    expect(parseClientMsg(JSON.stringify({ ...base, tilt: { y: 0.1, pitch: 0.2, roll: -0.1, extra: 1 } }))).toEqual({ ...base, tilt: { y: 0.1, pitch: 0.2, roll: -0.1 } });
    expect(parseClientMsg(JSON.stringify({ ...base, tilt: { y: 9, pitch: 0, roll: 0 } }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ ...base, tilt: { y: 0, pitch: 4, roll: 0 } }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ ...base, tilt: 'flat' }))).toBeNull();
  });

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
    expect(parseClientMsg(JSON.stringify({ t: 'hello', inviteCode: 'x', name: 'Sam', look: { ...look, hat: 'tiara' } }))).toBeNull();
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

describe('garden', () => {
  const parse = (m: object) => parseClientMsg(JSON.stringify(m));
  it('accepts garden actions with an optional spot and flower', () => {
    expect(parse({ t: 'garden', toyId: 'garden-plot-3', action: 'plant', spot: 2, flower: 'rose' })).toEqual({ t: 'garden', toyId: 'garden-plot-3', action: 'plant', spot: 2, flower: 'rose' });
    expect(parse({ t: 'garden', toyId: 'garden-plot-3', action: 'water' })).toEqual({ t: 'garden', toyId: 'garden-plot-3', action: 'water' });
  });
  it('refuses bad actions, spots and flowers', () => {
    expect(parse({ t: 'garden', toyId: 'garden-plot-3', action: 'dig' })).toBeNull();
    expect(parse({ t: 'garden', toyId: 'garden-plot-3', action: 'plant', spot: 4, flower: 'rose' })).toBeNull();
    expect(parse({ t: 'garden', toyId: 'garden-plot-3', action: 'plant', spot: 1, flower: 'cactus' })).toBeNull();
    expect(parse({ t: 'buySeed', flower: 'lotus' })).toEqual({ t: 'buySeed', flower: 'lotus' });
    expect(parse({ t: 'buySeed', flower: 'weed' })).toBeNull();
  });
});

describe('golf', () => {
  const parse = (m: object) => parseClientMsg(JSON.stringify(m));
  it('accepts holes 1–6, ball positions and quitting', () => {
    expect(parse({ t: 'golfTee', hole: 6 })).toEqual({ t: 'golfTee', hole: 6 });
    expect(parse({ t: 'golfShot', hole: 2, penalty: true })).toEqual({ t: 'golfShot', hole: 2, penalty: true });
    expect(parse({ t: 'golfShot', hole: 2, penalty: 'yes' })).toEqual({ t: 'golfShot', hole: 2 });
    expect(parse({ t: 'golfBall', x: 1, y: 0.2, z: 3 })).toEqual({ t: 'golfBall', x: 1, y: 0.2, z: 3 });
    expect(parse({ t: 'golfQuit' })).toEqual({ t: 'golfQuit' });
  });
  it('refuses other holes and bad numbers', () => {
    expect(parse({ t: 'golfTee', hole: 7 })).toBeNull();
    expect(parse({ t: 'golfHoled', hole: 1.5 })).toBeNull();
    expect(parse({ t: 'golfBall', x: 1, y: 'up', z: 3 })).toBeNull();
  });
});

describe('stageText', () => {
  it('cleans and trims the text, allows empty (clears), and refuses over 60 characters', () => {
    expect(parseClientMsg(JSON.stringify({ t: 'stageText', text: '  Calculus\n7pm ' }))).toEqual({ t: 'stageText', text: 'Calculus 7pm' });
    expect(parseClientMsg(JSON.stringify({ t: 'stageText', text: '' }))).toEqual({ t: 'stageText', text: '' });
    expect(parseClientMsg(JSON.stringify({ t: 'stageText', text: 'x'.repeat(61) }))).toBeNull();
    expect(parseClientMsg(JSON.stringify({ t: 'stageText', text: 5 }))).toBeNull();
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

describe('studio and cabin messages', () => {
  const p = (o: object) => parseClientMsg(JSON.stringify(o));
  const paint = { t: 'paint', title: ' Sun\tset  ', price: 5, forSale: true, mode: 'pixel', png: 'iVBORw0KGgo=' };
  it('parses paint and cleans the title', () => {
    expect(p(paint)).toEqual({ ...paint, title: 'Sun set' });
  });
  it('rejects bad paint', () => {
    expect(p({ ...paint, price: 0 })).toBeNull();
    expect(p({ ...paint, title: 'x'.repeat(25) })).toBeNull();
    expect(p({ ...paint, png: 'not base64!' })).toBeNull();
    expect(p({ ...paint, mode: 'oil' })).toBeNull();
  });
  it('accepts photo mode', () => {
    expect(p({ ...paint, mode: 'photo' })).toEqual({ ...paint, title: 'Sun set', mode: 'photo' });
  });
  it('parses and rejects throwMug', () => {
    const mug = { shape: 'tall', glaze: '#ffffff', accent: '#2a2430' };
    expect(p({ t: 'throwMug', mug: { ...mug, x: 1 } })).toEqual({ t: 'throwMug', mug });
    expect(p({ t: 'throwMug', mug: { ...mug, shape: 'cube' } })).toBeNull();
    expect(p({ t: 'throwMug', mug: { ...mug, glaze: '#123456' } })).toBeNull();
    expect(p({ t: 'throwMug' })).toBeNull();
  });
  it('parses and rejects setSale, buyPrint and the getters', () => {
    expect(p({ t: 'setSale', id: 3, on: true })).toEqual({ t: 'setSale', id: 3, on: true });
    expect(p({ t: 'setSale', id: 3 })).toBeNull();
    expect(p({ t: 'buyPrint', id: 3 })).toEqual({ t: 'buyPrint', id: 3 });
    expect(p({ t: 'buyPrint', id: 1.5 })).toBeNull();
    expect(p({ t: 'getGallery' })).toEqual({ t: 'getGallery' });
    expect(p({ t: 'getPortfolio' })).toEqual({ t: 'getPortfolio' });
  });
  it('parses and rejects cabin actions', () => {
    expect(p({ t: 'cabin', action: 'place', spot: 'wall1', item: { kind: 'painting', id: 2, x: 1 } })).toEqual({ t: 'cabin', action: 'place', spot: 'wall1', item: { kind: 'painting', id: 2 } });
    expect(p({ t: 'cabin', action: 'place', spot: 'wall1', item: { kind: 'sword', id: 2 } })).toBeNull();
    expect(p({ t: 'cabin', action: 'clear', spot: 'wall1' })).toEqual({ t: 'cabin', action: 'clear', spot: 'wall1' });
    expect(p({ t: 'cabin', action: 'clear', spot: 'toolongspot' })).toBeNull();
    expect(p({ t: 'cabin', action: 'lock', on: false })).toEqual({ t: 'cabin', action: 'lock', on: false });
    expect(p({ t: 'cabin', action: 'lock' })).toBeNull();
  });
});

describe('letters and constellations', () => {
  const p = (o: object) => parseClientMsg(JSON.stringify(o));
  it('parses sendLetter, cleaning the text', () => {
    expect(p({ t: 'sendLetter', to: 'b', text: ' hi\nthere ', x: 1 })).toEqual({ t: 'sendLetter', to: 'b', text: 'hi there' });
    expect(p({ t: 'sendLetter', to: 'b', text: 'x'.repeat(280) })).toEqual({ t: 'sendLetter', to: 'b', text: 'x'.repeat(280) });
  });
  it('rejects bad letters', () => {
    expect(p({ t: 'sendLetter', to: 'b', text: '   ' })).toBeNull();
    expect(p({ t: 'sendLetter', to: 'b', text: 'x'.repeat(281) })).toBeNull();
    expect(p({ t: 'sendLetter', to: '', text: 'hi' })).toBeNull();
    expect(p({ t: 'sendLetter', to: 'b' })).toBeNull();
  });
  it('parses the mail getters and deleteLetter', () => {
    expect(p({ t: 'getMail' })).toEqual({ t: 'getMail' });
    expect(p({ t: 'readMail' })).toEqual({ t: 'readMail' });
    expect(p({ t: 'deleteLetter', id: 4 })).toEqual({ t: 'deleteLetter', id: 4 });
    expect(p({ t: 'deleteLetter', id: '4' })).toBeNull();
    expect(p({ t: 'admin', action: 'deleteLetter', id: 4 })).toEqual({ t: 'admin', action: 'deleteLetter', id: 4 });
    expect(p({ t: 'admin', action: 'deleteLetter' })).toBeNull();
  });
  it('parses saveConstellation as a fresh copy with a cleaned name', () => {
    expect(p({ t: 'saveConstellation', name: ' Big\tBear ', edges: [[0, 1], [1, 2]], x: 1 })).toEqual({ t: 'saveConstellation', name: 'Big Bear', edges: [[0, 1], [1, 2]] });
  });
  it('rejects bad constellations', () => {
    expect(p({ t: 'saveConstellation', name: ' ', edges: [[0, 1]] })).toBeNull();
    expect(p({ t: 'saveConstellation', name: 'Bear', edges: [] })).toBeNull();
    expect(p({ t: 'saveConstellation', name: 'Bear', edges: [[0, 1], [1, 0]] })).toBeNull();
    expect(p({ t: 'saveConstellation', name: 'Bear', edges: [[0, 120]] })).toBeNull();
    expect(p({ t: 'saveConstellation', edges: [[0, 1]] })).toBeNull();
  });
});
