import { beforeEach, describe, expect, it } from 'vitest';
import type { ErrorCode, ServerMsg } from '../../shared/protocol';
import { DEFAULT_LOOK } from '../../shared/wardrobe';
import { RAINBOW_MS } from '../../shared/weather';
import { ProfileStore } from './db';
import { World, type Conn } from './world';

class FakeConn implements Conn {
  msgs: ServerMsg[] = [];
  send(m: ServerMsg) { this.msgs.push(m); }
  close(_c: ErrorCode) {}
  of<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[] {
    return this.msgs.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
  }
}

const MIN = 60_000;
let t: number;
let roll: number;
let store: ProfileStore;
const world = () => new World(() => t, () => roll, undefined, store);
function joinNew(w: World, name: string) {
  const c = new FakeConn();
  w.join(store.create(name, DEFAULT_LOOK, t).profile, c);
  return c;
}

beforeEach(() => {
  t = 1_000_000;
  roll = 0.9; // rain
  store = new ProfileStore(':memory:');
});

describe('weather', () => {
  it('starts with a 20–40 min spell, sent in the welcome', () => {
    const c = joinNew(world(), 'Ann');
    const wx = c.of('welcome')[0].weather;
    expect(wx.kind).toBe('rain');
    expect(wx.since).toBe(t);
    expect(wx.until - wx.since).toBeGreaterThanOrEqual(20 * MIN);
    expect(wx.until - wx.since).toBeLessThanOrEqual(40 * MIN);
  });

  it('turns rain into a 4 min rainbow, then picks again, telling everyone on each change', () => {
    const w = world();
    const a = joinNew(w, 'Ann'), b = joinNew(w, 'Bo');
    const rain = a.of('welcome')[0].weather;
    w.tick();
    expect(a.of('weather')).toEqual([]); // nothing changed yet
    t = rain.until;
    w.tick();
    expect(b.of('weather').map((m) => m.weather)).toEqual([{ kind: 'rainbow', since: t, until: t + RAINBOW_MS }]);
    roll = 0.2;
    t += RAINBOW_MS;
    w.tick();
    expect(a.of('weather').at(-1)!.weather.kind).toBe('clear');
  });

  it('survives a restart', () => {
    const w1 = world();
    t += 1000;
    w1.forceWeather('cloudy');
    roll = 0.9;
    const c = joinNew(world(), 'Ann');
    expect(c.of('welcome')[0].weather).toMatchObject({ kind: 'cloudy', since: t });
  });

  it('forceWeather starts that weather now and tells everyone', () => {
    const w = world();
    const a = joinNew(w, 'Ann');
    w.forceWeather('rainbow');
    expect(a.of('weather').at(-1)!.weather).toEqual({ kind: 'rainbow', since: t, until: t + RAINBOW_MS });
  });
});
