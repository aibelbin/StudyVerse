import { beforeEach, describe, expect, it } from 'vitest';
import { PAINTING_MAX_BYTES, type PaintMode } from '../../shared/art';
import type { ErrorCode, ServerMsg } from '../../shared/protocol';
import { SCENES } from '../../shared/scenes';
import { SceneBook } from '../../shared/scenes/book';
import { DEFAULT_LOOK } from '../../shared/wardrobe';
import { ProfileStore } from './db';
import { makePng } from './pngFixture';
import { World, type Conn } from './world';

class FakeConn implements Conn {
  msgs: ServerMsg[] = [];
  closed: { code: ErrorCode; message?: string } | null = null;
  send(m: ServerMsg) { this.msgs.push(m); }
  close(code: ErrorCode, message?: string) { this.closed = { code, message }; }
  of<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }>[] {
    return this.msgs.filter((m) => m.t === t) as Extract<ServerMsg, { t: T }>[];
  }
}

let t: number;
let store: ProfileStore;
let w: World;

function joinNew(name: string) {
  const profile = store.create(name, DEFAULT_LOOK, t).profile;
  const c = new FakeConn();
  w.join(profile, c);
  return { id: profile.id, c };
}
const go = (id: string, x: number, z: number) => {
  t += 10_000;
  w.handle(id, { t: 'move', x, z, facing: 0, anim: 'idle' });
};
const lastError = (c: FakeConn) => c.of('error').at(-1);

function bookFor(c: FakeConn): SceneBook {
  const b = new SceneBook(SCENES);
  b.setRoster(c.of('village').at(-1)?.cabins ?? c.of('welcome').at(-1)!.cabins);
  return b;
}

function through(id: string, sceneId: string, doorId: string, book: SceneBook) {
  const door = book.get(sceneId)!.doors.find((d) => d.id === doorId)!;
  go(id, door.box.x, door.box.z);
  w.handle(id, { t: 'enterScene', doorId });
}

/** Town → gate → village → the studio door. */
function walkToStudio(p: { id: string; c: FakeConn }) {
  through(p.id, 'town', 'to-village', bookFor(p.c));
  through(p.id, 'village', 'to-studio', bookFor(p.c));
  expect(w.view(p.id)!.scene).toBe('studio');
}

const PIXEL = makePng(32, 32).toString('base64');
function paint(id: string, opts: { title?: string; price?: number; forSale?: boolean; mode?: PaintMode; png?: string } = {}) {
  w.handle(id, { t: 'paint', title: opts.title ?? 'Sunset', price: opts.price ?? 12, forSale: opts.forSale ?? true, mode: opts.mode ?? 'pixel', png: opts.png ?? PIXEL });
}
/** Paints again once the drying gap has passed. */
function paintLater(id: string, opts: Parameters<typeof paint>[1] = {}) {
  t += 31_000;
  paint(id, opts);
}

beforeEach(() => {
  t = new Date(2026, 10, 10, 10).getTime();
  store = new ProfileStore(':memory:');
  w = new World(() => t, Math.random, undefined, store);
});

describe('studio', () => {
  it('sends the gallery on entering the studio and answers the getters anywhere', () => {
    const a = joinNew('Ann');
    walkToStudio(a);
    expect(a.c.of('gallery').at(-1)).toEqual({ t: 'gallery', forSale: [] });
    w.handle(a.id, { t: 'getPortfolio' });
    expect(a.c.of('portfolio').at(-1)).toEqual({ t: 'portfolio', mine: [], prints: [] });
    const b = joinNew('Bo');
    w.handle(b.id, { t: 'getGallery' });
    expect(b.c.of('gallery')).toHaveLength(1);
  });

  it('hangs a painting for sale: gallery to the studio, portfolio to the artist, a feed line', () => {
    const a = joinNew('Ann');
    const b = joinNew('Bo');
    const out = joinNew('Cy'); // not in the studio
    walkToStudio(a);
    walkToStudio(b);
    const outGalleries = out.c.of('gallery').length;
    paint(a.id);
    for (const c of [a.c, b.c]) {
      expect(c.of('gallery').at(-1)!.forSale).toMatchObject([{ artist: a.id, artistName: 'Ann', title: 'Sunset', price: 12, mode: 'pixel', sold: 0, forSale: true, at: t }]);
    }
    expect(out.c.of('gallery')).toHaveLength(outGalleries);
    expect(a.c.of('portfolio').at(-1)!.mine.map((p) => p.title)).toEqual(['Sunset']);
    expect(b.c.of('portfolio')).toHaveLength(0);
    expect(out.c.of('feed').at(-1)!.event).toMatchObject({ kind: 'art', text: "🎨 Ann hung 'Sunset' in the studio" });
    expect(store.paintingPng(a.c.of('portfolio').at(-1)!.mine[0].id)).toEqual(Buffer.from(PIXEL, 'base64'));
  });

  it('keeps a painting for yourself quietly, and names an untitled one', () => {
    const a = joinNew('Ann');
    walkToStudio(a);
    const galleries = a.c.of('gallery').length;
    const feeds = a.c.of('feed').length;
    paint(a.id, { title: ' ', forSale: false, mode: 'free', png: makePng(64, 64).toString('base64') });
    expect(a.c.of('portfolio').at(-1)!.mine).toMatchObject([{ title: 'Untitled', forSale: false, mode: 'free' }]);
    expect(a.c.of('gallery')).toHaveLength(galleries);
    expect(a.c.of('feed')).toHaveLength(feeds);
  });

  it('refuses painting outside the studio', () => {
    const a = joinNew('Ann');
    paint(a.id);
    expect(lastError(a.c)?.code).toBe('bad_art');
    expect(store.paintingCount(a.id)).toBe(0);
  });

  it('refuses a second painting within 30 s', () => {
    const a = joinNew('Ann');
    walkToStudio(a);
    paint(a.id);
    t += 29_000;
    paint(a.id, { title: 'Again' });
    expect(lastError(a.c)?.code).toBe('bad_art');
    expect(store.paintingCount(a.id)).toBe(1);
    t += 1_000;
    paint(a.id, { title: 'Again' });
    expect(store.paintingCount(a.id)).toBe(2);
  });

  it('refuses a 4th painting for sale but still keeps one for yourself', () => {
    const a = joinNew('Ann');
    walkToStudio(a);
    for (const title of ['One', 'Two', 'Three']) paintLater(a.id, { title });
    const errs = a.c.of('error').length;
    paintLater(a.id, { title: 'Four' });
    expect(a.c.of('error').slice(errs).map((e) => e.code)).toEqual(['bad_art']);
    expect(store.forSaleCount(a.id)).toBe(3);
    paint(a.id, { title: 'Four', forSale: false }); // a refusal doesn't start the drying gap
    expect(store.paintingCount(a.id)).toBe(4);
  });

  it('refuses a painting past the 40 you may keep', () => {
    const a = joinNew('Ann');
    walkToStudio(a);
    for (let i = 0; i < 40; i++) store.addPainting(a.id, `P${i}`, 5, 'pixel', Buffer.from([1]), false, t);
    paint(a.id, { forSale: false });
    expect(lastError(a.c)?.code).toBe('bad_art');
    expect(store.paintingCount(a.id)).toBe(40);
  });

  it('refuses a bad PNG, a wrong size and one over 64 KB with bad_art', () => {
    const a = joinNew('Ann');
    walkToStudio(a);
    const tooBig = Buffer.alloc(PAINTING_MAX_BYTES + 1);
    makePng(32, 32).copy(tooBig);
    const errs = a.c.of('error').length;
    paint(a.id, { png: Buffer.from('not a png at all, really not').toString('base64') });
    paint(a.id, { png: makePng(48, 48).toString('base64') });
    paint(a.id, { mode: 'free', png: makePng(32, 32).toString('base64') });
    paint(a.id, { png: tooBig.toString('base64') });
    expect(a.c.of('error').slice(errs).map((e) => e.code)).toEqual(['bad_art', 'bad_art', 'bad_art', 'bad_art']);
    expect(store.paintingCount(a.id)).toBe(0);
    // exactly 64 KB is fine
    const atMax = Buffer.alloc(PAINTING_MAX_BYTES);
    makePng(32, 32).copy(atMax);
    paint(a.id, { png: atMax.toString('base64') });
    expect(store.paintingCount(a.id)).toBe(1);
  });

  it('buys a print: KP moves, wallets and portfolio are pushed, the feed says so; repeats, own and poor are refused', () => {
    const a = joinNew('Ann');
    const b = joinNew('Bo');
    const poor = joinNew('Cy');
    store.addKp(b.id, 30);
    store.addKp(poor.id, 11);
    walkToStudio(a);
    paint(a.id);
    const id = store.forSale()[0].id;
    walkToStudio(b);

    w.handle(b.id, { t: 'buyPrint', id });
    expect(store.wallet(b.id).kp).toBe(18);
    expect(store.wallet(a.id).kp).toBe(12);
    expect(b.c.of('wallet').at(-1)!.wallet.kp).toBe(18);
    expect(a.c.of('wallet').at(-1)!.wallet.kp).toBe(12);
    expect(b.c.of('portfolio').at(-1)!.prints.map((p) => p.id)).toEqual([id]);
    expect(a.c.of('gallery').at(-1)!.forSale[0].sold).toBe(1);
    expect(a.c.of('feed').at(-1)!.event).toMatchObject({ kind: 'art', text: "🖼️ Bo bought 'Sunset' from Ann for 12 KP" });

    w.handle(b.id, { t: 'buyPrint', id });
    expect(lastError(b.c)).toMatchObject({ code: 'bad_art', message: 'You already have a print' });
    w.handle(a.id, { t: 'buyPrint', id });
    expect(lastError(a.c)).toMatchObject({ code: 'bad_art', message: "That's your own painting" });
    w.handle(poor.id, { t: 'buyPrint', id });
    expect(lastError(poor.c)?.code).toBe('no_kp');
    w.handle(b.id, { t: 'buyPrint', id: 999 });
    expect(lastError(b.c)).toMatchObject({ code: 'bad_art', message: "That one isn't for sale any more" });
    expect(store.wallet(b.id).kp).toBe(18);
    expect(store.wallet(a.id).kp).toBe(12);
    expect(store.wallet(poor.id).kp).toBe(11);
    expect(store.painting(id)!.sold).toBe(1);
  });

  it('an admin pays nothing and the artist still gets the price', () => {
    const a = joinNew('Ann');
    const admin = joinNew('Aibel');
    w.admins = new Set([admin.id]);
    walkToStudio(a);
    paint(a.id);
    w.handle(admin.id, { t: 'buyPrint', id: store.forSale()[0].id });
    expect(store.wallet(admin.id).kp).toBe(0);
    expect(store.wallet(a.id).kp).toBe(12);
    expect(store.prints(admin.id)).toHaveLength(1);
  });

  it('setSale takes a painting down and hangs it again, for the artist only and within the cap', () => {
    const a = joinNew('Ann');
    const b = joinNew('Bo');
    store.addKp(b.id, 30);
    walkToStudio(a);
    walkToStudio(b);
    paint(a.id);
    const id = store.forSale()[0].id;

    w.handle(a.id, { t: 'setSale', id, on: false });
    expect(b.c.of('gallery').at(-1)!.forSale).toEqual([]);
    expect(a.c.of('portfolio').at(-1)!.mine[0].forSale).toBe(false);
    w.handle(b.id, { t: 'buyPrint', id });
    expect(lastError(b.c)?.message).toBe("That one isn't for sale any more");

    w.handle(b.id, { t: 'setSale', id, on: true });
    expect(lastError(b.c)?.code).toBe('bad_art');
    expect(store.painting(id)!.forSale).toBe(false);

    w.handle(a.id, { t: 'setSale', id, on: true });
    expect(b.c.of('gallery').at(-1)!.forSale.map((p) => p.id)).toEqual([id]);

    // relisting respects the cap
    w.handle(a.id, { t: 'setSale', id, on: false });
    for (const title of ['Two', 'Three', 'Four']) paintLater(a.id, { title });
    const errs = a.c.of('error').length;
    w.handle(a.id, { t: 'setSale', id, on: true });
    expect(a.c.of('error').slice(errs).map((e) => e.code)).toEqual(['bad_art']);
    expect(store.painting(id)!.forSale).toBe(false);
    expect(store.forSaleCount(a.id)).toBe(3);
  });
});
