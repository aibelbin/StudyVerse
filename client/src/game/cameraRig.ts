import * as THREE from 'three';

const OFFSET = new THREE.Vector3(0, 10, 8.5); // about 50° down from horizontal

/** Fixed-angle follow camera (no orbit), so W is always "up the screen". */
export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  private target = new THREE.Vector3();
  private zoom = 1;
  private zoomTarget = 1;

  snap(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.apply();
  }

  zoomTo(k: number): void {
    this.zoomTarget = k;
  }

  follow(x: number, z: number, dt: number): void {
    const k = 1 - Math.exp(-dt * 6);
    this.target.x += (x - this.target.x) * k;
    this.target.z += (z - this.target.z) * k;
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-dt * 4));
    this.apply();
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private apply(): void {
    this.camera.position.copy(this.target).addScaledVector(OFFSET, this.zoom);
    this.camera.lookAt(this.target.x, 0.8, this.target.z);
  }
}
