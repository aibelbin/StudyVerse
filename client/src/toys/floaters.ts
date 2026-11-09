import * as THREE from 'three';
import { textSprite } from '../world/text';

/** Little sprites (♪, ✨, splash rings) that rise or spread and fade, owned by a toy. */
export class Floaters {
  private items: { o: THREE.Object3D; born: number; life: number; tick: (o: THREE.Object3D, k: number) => void }[] = [];
  constructor(private parent: THREE.Object3D) {}

  text(s: string, x: number, y: number, z: number, now: number, size = 0.35, life = 1400): void {
    const sp = textSprite(s, size, { bg: null, font: 64, pad: 6 });
    sp.position.set(x, y, z);
    const drift = (Math.random() - 0.5) * 0.4;
    this.add(sp, now, life, (o, k) => {
      o.position.y = y + k * 0.9;
      o.position.x = x + drift * k;
      (o as THREE.Sprite).material.opacity = 1 - k * k;
    });
  }

  ring(x: number, z: number, now: number, delay = 0, size = 0.9, y = 0.06): void {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 24),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.visible = false;
    this.add(m, now + delay, 900, (o, k) => {
      const s = 0.1 + k * size;
      o.scale.set(s, s, s);
      ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
    });
  }

  add(o: THREE.Object3D, born: number, life: number, tick: (o: THREE.Object3D, k: number) => void): void {
    this.parent.add(o);
    this.items.push({ o, born, life, tick });
  }

  update(now: number): void {
    this.items = this.items.filter((it) => {
      const k = (now - it.born) / it.life;
      if (k >= 1) {
        it.o.removeFromParent();
        it.o.traverse((x) => {
          if (x instanceof THREE.Mesh || x instanceof THREE.Sprite) {
            if (!(x instanceof THREE.Sprite)) x.geometry.dispose();
            const m = x.material as THREE.MeshBasicMaterial;
            m.map?.dispose();
            m.dispose();
          }
        });
        return false;
      }
      it.o.visible = k >= 0; // delayed items wait unseen
      if (k >= 0) it.tick(it.o, k);
      return true;
    });
  }
}
