import * as THREE from 'three';
import { artUrl, type CabinItem, type PaintingMeta } from '../../../shared/art';
import type { Spot } from '../../../shared/scenes/types';
import { bouquetMesh, giftSprite } from '../world/items';
import { disposeTree, mat, mesh } from '../world/materials';
import { PALETTE as P } from '../world/palette';

const loader = new THREE.TextureLoader();
const textures = new Map<number, THREE.Texture>();

/** A painting's texture, loaded once per id (pixel art stays crisp). */
function paintingTexture(p: PaintingMeta): THREE.Texture {
  let tex = textures.get(p.id);
  if (!tex) {
    tex = loader.load(artUrl(p.id));
    tex.colorSpace = THREE.SRGBColorSpace;
    if (p.mode === 'pixel') {
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
    }
    textures.set(p.id, tex);
  }
  return tex;
}

/** Wooden frames on a wall; each shows a painting, or stays an empty frame. */
export class Pictures {
  readonly root = new THREE.Group();
  private planes = new Map<string, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>();

  constructor(frames: Spot[], size = 0.8) {
    const wood = mat(P.woodDark);
    const t = 0.06;
    const bar = (w: number, h: number) => new THREE.BoxGeometry(w, h, 0.04);
    const plane = new THREE.PlaneGeometry(size, size);
    for (const f of frames) {
      const g = new THREE.Group();
      g.position.set(f.x, f.y, f.z);
      g.rotation.y = f.rot;
      const o = size / 2 + t / 2;
      g.add(
        mesh(bar(size + t * 2, t), wood, 0, o, 0.02, false),
        mesh(bar(size + t * 2, t), wood, 0, -o, 0.02, false),
        mesh(bar(t, size), wood, -o, 0, 0.02, false),
        mesh(bar(t, size), wood, o, 0, 0.02, false),
      );
      const pic = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      pic.position.z = 0.025;
      pic.visible = false;
      g.add(pic);
      this.planes.set(f.id, pic);
      this.root.add(g);
    }
  }

  set(items: { id: string; painting: PaintingMeta | null }[]): void {
    for (const { id, painting } of items) {
      const pic = this.planes.get(id);
      if (!pic) continue;
      if (!painting) {
        pic.visible = false;
        continue;
      }
      const tex = paintingTexture(painting);
      if (pic.material.map !== tex) {
        pic.material.map = tex;
        pic.material.needsUpdate = true;
      }
      pic.visible = true;
    }
  }
}

/** Keepsakes and bouquets standing on cabin shelves. */
export class Shelves {
  readonly root = new THREE.Group();
  private bySpot: Map<string, Spot>;

  constructor(spots: Spot[]) {
    this.bySpot = new Map(spots.map((s) => [s.id, s]));
  }

  set(items: CabinItem[]): void {
    for (const c of [...this.root.children]) {
      this.root.remove(c);
      disposeTree(c);
    }
    for (const it of items) {
      const s = this.bySpot.get(it.spot);
      if (!s || it.kind === 'painting') continue;
      let obj: THREE.Object3D;
      if (it.kind === 'bouquet' || it.flower) {
        obj = bouquetMesh(it.flower);
        obj.scale.setScalar(2.2);
      } else {
        const sp = giftSprite(it.gift);
        sp.center.set(0.5, 0); // stand on the shelf rather than sink into it
        obj = sp;
      }
      obj.position.set(s.x, s.y + 0.05, s.z);
      this.root.add(obj);
    }
  }
}
