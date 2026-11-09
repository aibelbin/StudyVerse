import { describe, expect, it } from 'vitest';
import { SCENES } from './scenes';
import { vehicleOk } from './vehicles';

const town = SCENES.town;

describe('vehicleOk', () => {
  it('keeps boats on the water and trucks on land', () => {
    const boat = town.toys.find((t) => t.kind === 'rowboat')!;
    expect(vehicleOk('rowboat', town, boat.x, boat.z)).toBe(true);
    expect(vehicleOk('truck', town, boat.x, boat.z)).toBe(false);
    expect(vehicleOk('rowboat', town, 0, -13.5)).toBe(false);
    expect(vehicleOk('truck', town, 0, -13.5)).toBe(true);
  });
  it('keeps trucks out of buildings and inside the map', () => {
    expect(vehicleOk('truck', town, -12, -21)).toBe(false); // the Library
    expect(vehicleOk('truck', town, 74.9, 0)).toBe(false);
  });
  it('every truck starts somewhere it may be', () => {
    for (const t of town.toys.filter((x) => x.kind === 'truck')) expect(vehicleOk('truck', town, t.x, t.z), t.id).toBe(true);
  });
  it('is false for things that are not vehicles', () => {
    expect(vehicleOk('bell', town, 0, 0)).toBe(false);
  });
});
