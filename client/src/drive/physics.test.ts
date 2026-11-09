import { describe, expect, it } from 'vitest';
import { town } from '../../../shared/scenes/town';
import { DriveWorld, loadRapier, nlerp } from './physics';

describe('nlerp', () => {
  it('blends halfway and stays a unit quaternion', () => {
    const a = { x: 0, y: 0, z: 0, w: 1 };
    const b = { x: 0, y: Math.sin(0.5), z: 0, w: Math.cos(0.5) }; // a 1 rad turn
    const q = nlerp(a, b, 0.5);
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1);
    expect(2 * Math.atan2(q.y, q.w)).toBeCloseTo(0.5, 2);
  });
});

describe('DriveWorld', () => {
  it('moves the drawn truck a little every frame on a 120 Hz screen, not in 60 Hz hops', async () => {
    const dw = new DriveWorld(await loadRapier(), town, { x: 0, z: 0, heading: Math.PI / 2 });
    dw.input = { throttle: 1, steer: 0, brake: false };
    for (let i = 0; i < 120; i++) dw.step(1 / 120, [], []); // get rolling
    let last = dw.pose().x;
    for (let i = 0; i < 60; i++) {
      dw.step(1 / 120, [], []);
      const x = dw.pose().x;
      expect(x - last).toBeGreaterThan(0.005);
      last = x;
    }
  });
});
