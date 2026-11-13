import { FOR_SALE_MAX, GALLERY_PHOTOS, isJpeg, PAINT_GAP_MS, PAINTING_MAX_BYTES, PAINTINGS_MAX, pngSize, sizeOk } from '../../shared/art';
import { isMug, MUG_PRICE, type Mug } from '../../shared/mug';
import type { ClientMsg } from '../../shared/protocol';
import type { Store } from './db';
import { feedText } from './feed';
import type { Port } from './port';

type PaintMsg = Extract<ClientMsg, { t: 'paint' }>;

const STUDIO = 'studio';

/** The art studio: paint at an easel, hang paintings for sale, buy prints of other people's work. */
export class Studio {
  /** Profile id -> when they last hung a painting. */
  private lastPaintAt = new Map<string, number>();

  constructor(private store: Store, private port: Port) {}

  paint(p: string, msg: PaintMsg): void {
    const err = (message: string) => this.port.error(p, 'bad_art', message);
    if (this.port.sceneOf(p) !== STUDIO) return err('Paint at an easel in the studio.');
    const now = this.port.now();
    const last = this.lastPaintAt.get(p);
    if (last !== undefined && now - last < PAINT_GAP_MS) return err('Let the paint dry a moment before the next one.');
    const png = Buffer.from(msg.png, 'base64');
    if (png.length > PAINTING_MAX_BYTES) return err('That painting is too detailed to save.');
    const photo = msg.mode === 'photo';
    if (photo) {
      if (!isJpeg(png)) return err("That doesn't look like a photo.");
    } else {
      const size = pngSize(png);
      if (!size) return err("That doesn't look like a painting.");
      if (!sizeOk(msg.mode, size.w, size.h)) return err('That canvas is the wrong size.');
    }
    if (this.store.paintingCount(p) >= PAINTINGS_MAX) return err(`You've made ${PAINTINGS_MAX} paintings, the most anyone can keep.`);
    const forSale = msg.forSale && !photo;
    if (forSale && this.store.forSaleCount(p) >= FOR_SALE_MAX) return err(`You already have ${FOR_SALE_MAX} paintings for sale.`);
    const title = msg.title;
    this.store.addPainting(p, title, msg.price, msg.mode, png, forSale, now);
    this.lastPaintAt.set(p, now);
    this.sendPortfolio(p);
    if (photo) this.sendGallery();
    if (forSale) {
      this.sendGallery();
      this.port.feed('art', feedText.art(this.port.nameOf(p) ?? 'Someone', title));
    }
  }

  /** The artist takes a painting off the wall or hangs it again (within the for-sale cap); an admin may take any down. */
  setSale(p: string, id: number, on: boolean): void {
    const painting = this.store.painting(id);
    if (!painting || (painting.artist !== p && (on || !this.port.isAdmin(p)))) return this.port.error(p, 'bad_art', "That painting isn't yours.");
    if (painting.mode === 'photo') return this.port.error(p, 'bad_art', "Photos aren't for sale.");
    const artist = painting.artist;
    if (on && !painting.forSale && this.store.forSaleCount(artist) >= FOR_SALE_MAX) {
      return this.port.error(p, 'bad_art', `You already have ${FOR_SALE_MAX} paintings for sale.`);
    }
    this.store.setForSale(id, artist, on);
    this.sendPortfolio(artist);
    if (painting.forSale !== on) this.sendGallery();
  }

  buyPrint(p: string, id: number): void {
    const price = this.store.painting(id)?.price ?? 0;
    const r = this.store.buyPrint(p, id, this.port.isAdmin(p) ? 0 : price, this.port.now());
    if (!r.ok) {
      switch (r.reason) {
        case 'gone': return this.port.error(p, 'bad_art', "That one isn't for sale any more");
        case 'own': return this.port.error(p, 'bad_art', "That's your own painting");
        case 'owned': return this.port.error(p, 'bad_art', 'You already have a print');
        case 'kp': return this.port.error(p, 'no_kp', `A print costs ${price} ✨ KP. Keep studying!`);
      }
    }
    this.port.walletChanged(p);
    this.port.walletChanged(r.artist);
    this.sendPortfolio(p);
    this.sendGallery();
    this.port.feed('art', feedText.bought(this.port.nameOf(p) ?? 'Someone', r.title, this.port.nameOf(r.artist) ?? 'someone', r.price));
  }

  /** A new mug from the pottery wheel. */
  throwMug(p: string, mug: Mug): void {
    if (!isMug(mug)) return this.port.error(p, 'bad_mug', "That glaze isn't on the shelf.");
    if (!this.store.setMug(p, mug, this.port.isAdmin(p) ? 0 : MUG_PRICE)) return this.port.error(p, 'no_kp', `A mug costs ${MUG_PRICE} ✨ KP. Keep studying!`);
    this.port.walletChanged(p);
    this.port.mugChanged(p, mug);
    this.port.feed('art', feedText.mug(this.port.nameOf(p) ?? 'Someone'));
  }

  /** Everything for sale and the newest photos, to one player or (no toId) to everyone in the studio. */
  sendGallery(toId?: string): void {
    const msg = { t: 'gallery' as const, forSale: this.store.forSale(), photos: this.store.photos(GALLERY_PHOTOS) };
    if (toId) this.port.send(toId, msg);
    else this.port.toScene(STUDIO, msg);
  }

  /** The player's own paintings and the prints they hold. */
  sendPortfolio(id: string): void {
    this.port.send(id, { t: 'portfolio', mine: this.store.byArtist(id), prints: this.store.prints(id) });
  }
}
