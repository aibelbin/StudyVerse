import * as THREE from 'three';
import type { SceneDef } from '../../../shared/scenes/types';
import { STAGE_FLOOR } from '../toys/parkMath';

/**
 * The stage spotlights' beams: soft additive cones from each lamp head to the stage floor plus a
 * warm pool of light, fading on while anyone is on the stage. No real lights, to keep the GPU cool.
 */
export class StageFx {
  readonly root = new THREE.Group();
  private mats: THREE.MeshBasicMaterial[] = [];
  private level = 0;

  constructor(def: SceneDef) {
    const st = def.stage;
    if (!st) return;
    const target = new THREE.Vector3(st.stage.x, STAGE_FLOOR, st.stage.z + 0.6);
    for (const d of def.decor.filter((x) => x.kind === 'spotlight')) {
      const from = new THREE.Vector3(d.x, 3, d.z);
      const dir = target.clone().sub(from);
      const len = dir.length();
      const beamMat = new THREE.MeshBasicMaterial({ color: '#fff1c9', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, len, 20, 1, true), beamMat);
      cone.geometry.translate(0, -len / 2, 0); // tip at the lamp
      cone.position.copy(from);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
      this.root.add(cone);
      this.mats.push(beamMat);
    }
    const poolMat = new THREE.MeshBasicMaterial({ color: '#ffe3a1', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.scale.set(1.3, 0.8, 1);
    pool.position.set(target.x, STAGE_FLOOR + 0.03, target.z);
    this.root.add(pool);
    this.mats.push(poolMat);
  }

  /** occupied: someone is on the stage; night 0..1 makes the beams stronger in the dark. */
  update(dt: number, occupied: boolean, night: number): void {
    if (!this.mats.length) return;
    const want = occupied ? 1 : 0;
    this.level += (want - this.level) * Math.min(1, dt * 4);
    const beam = this.level * (0.025 + 0.14 * night);
    const pool = this.level * (0.12 + 0.25 * night);
    this.mats.forEach((m, i) => (m.opacity = i === this.mats.length - 1 ? pool : beam));
  }
}
