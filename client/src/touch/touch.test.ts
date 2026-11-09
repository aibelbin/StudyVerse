import { describe, expect, it, vi } from 'vitest';
import { Input } from '../game/input';
import { promptActions } from './actions';
import { isTouchDevice } from './detect';
import { stickVector } from './stick';

describe('promptActions', () => {
  const keys = (t: string) => promptActions(t).actions.map((a) => [a.key, a.label, !!a.primary]);

  it('turns hints into a main button and small ones', () => {
    expect(keys('[Space] start a study session · [E] stand up')).toEqual([['e', 'Stand up', true], [' ', 'Study', false]]);
    expect(keys('[Space] start another round · [E] stand up')[1]).toEqual([' ', 'Study again', false]);
    expect(keys('[C] sip your latte (3 left) · [G] give it to someone')).toEqual([['c', 'Sip', false], ['g', 'Give', false]]);
    expect(keys('[E] feed the koi')).toEqual([['e', 'Feed the koi', true]]);
  });

  it('leaves movement to the joystick and spots instruments', () => {
    expect(keys('[W/S] drive · [A/D] steer · [H] honk · [E] hop out')).toEqual([['e', 'Hop out', true], ['h', 'Honk', false]]);
    expect(keys('[WASD] row · [E] get out')).toEqual([['e', 'Get out', true]]);
    const piano = promptActions('[1–8] play · [E] stand up');
    expect(piano.piano).toBe(true);
    expect(piano.actions).toEqual([{ key: 'e', label: 'Stand up', primary: true }]);
  });

  it('handles golf, stargazing, focusing and long labels', () => {
    expect(keys('⛳ Hole 2 · par 3 · strokes 1  —  drag back from anywhere and let go to putt · [Q] leave the hole')).toEqual([['q', 'Leave hole', false]]);
    expect(keys('✨ Stargazing… [E] or move to stop')).toEqual([['e', 'Stop', true]]);
    expect(keys('Focusing… [E] leave early')).toEqual([['e', 'Leave early', true]]);
    expect(keys('[E] play hole 2 · Windmill (par 3) ⛳')).toEqual([['e', 'Play hole 2', true]]);
    expect(keys("[E] water Samantha-Lou's garden 💧")[0][1]).toBe("Water Samantha-Lo…");
    expect(promptActions(null)).toEqual({ actions: [], piano: false });
    expect(keys('💐 [G] give your bouquet of roses to someone, or put it in your plot\'s vase')).toEqual([['g', 'Give', false]]);
  });
});

describe('joystick', () => {
  it('has a dead zone, scales smoothly and clamps at the rim', () => {
    expect(stickVector(3, 0, 60)).toEqual({ x: 0, z: 0 });
    const half = stickVector(30, 0, 60);
    expect(half.x).toBeGreaterThan(0.35);
    expect(half.x).toBeLessThan(0.5);
    const far = stickVector(0, -200, 60);
    expect(far.z).toBeCloseTo(-1);
    expect(far.x).toBeCloseTo(0);
  });

  it('walks at the stick strength and drives with it, but keys win', () => {
    vi.stubGlobal('addEventListener', () => {}); // Node has no window events
    const i = new Input();
    vi.unstubAllGlobals();
    i.stick = { x: 0, z: -0.5 };
    expect(i.axis()).toEqual({ x: 0, z: -0.5 });
    expect(i.driveAxis().throttle).toBeCloseTo((0.5 - 0.15) / 0.75);
    expect(i.driveAxis().steer).toBe(0);
    i.press('d');
    expect(i.axis()).toEqual({ x: 1, z: 0 });
    expect(i.driveAxis()).toEqual({ throttle: 0, steer: -1 });
    i.release('d');
    let ran = 0;
    i.on('e', () => ran++);
    i.press('e');
    expect(ran).toBe(1);
  });
});

describe('touch detection', () => {
  const mm = (coarse: boolean, hover: boolean) => (q: string) => ({ matches: q.includes('coarse') ? coarse : hover });
  it('turns on for touch-first devices, with URL overrides', () => {
    expect(isTouchDevice('', mm(true, false))).toBe(true);
    expect(isTouchDevice('', mm(false, true))).toBe(false);
    expect(isTouchDevice('', mm(true, true))).toBe(false); // a touch laptop with a mouse
    expect(isTouchDevice('?touch', mm(false, true))).toBe(true);
    expect(isTouchDevice('?touch=0', mm(true, false))).toBe(false);
  });
});
