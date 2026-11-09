import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Adds the night glow to the picture, then tone-maps it. */
const COMPOSITE = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tBloom;
uniform float bloom;
varying vec2 vUv;

void main() {
  vec3 col = texture2D(tColor, vUv).rgb + texture2D(tBloom, vUv).rgb * bloom;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const BRIGHT = /* glsl */ `
uniform sampler2D tColor;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(c * smoothstep(0.9, 1.6, l), 1.0);
}
`;

const BLUR = /* glsl */ `
uniform sampler2D tColor;
uniform vec2 dir;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tColor, vUv).rgb * 0.227;
  s += texture2D(tColor, vUv + dir * 1.385).rgb * 0.316;
  s += texture2D(tColor, vUv - dir * 1.385).rgb * 0.316;
  s += texture2D(tColor, vUv + dir * 3.231).rgb * 0.070;
  s += texture2D(tColor, vUv - dir * 3.231).rgb * 0.070;
  gl_FragColor = vec4(s, 1.0);
}
`;

function pass(frag: string, uniforms: Record<string, THREE.IUniform>, toneMapped = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped });
}

/**
 * The storybook renderer. By day (and always on Lite) the scene goes straight to the screen. At night
 * on High it goes into an antialiased half-float target, and a quarter-size glow is added on top.
 */
export class Post {
  high = true;
  private main: THREE.WebGLRenderTarget;
  private glowA: THREE.WebGLRenderTarget;
  private glowB: THREE.WebGLRenderTarget;
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private composite: THREE.ShaderMaterial;
  private bright: THREE.ShaderMaterial;
  private blur: THREE.ShaderMaterial;
  private black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  private size = new THREE.Vector2();

  constructor(private renderer: THREE.WebGLRenderer) {
    this.main = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
    this.glowA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.glowB = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.black.needsUpdate = true;
    this.composite = pass(COMPOSITE, { tColor: { value: null }, tBloom: { value: this.black }, bloom: { value: 0 } }, true);
    this.bright = pass(BRIGHT, { tColor: { value: null } });
    this.blur = pass(BLUR, { tColor: { value: null }, dir: { value: new THREE.Vector2() } });
    this.quad.frustumCulled = false;
  }

  /** Call after the renderer's size or pixel ratio changes. */
  resize(): void {
    this.renderer.getDrawingBufferSize(this.size);
    const { x, y } = this.size;
    this.main.setSize(x, y);
    this.glowA.setSize(Math.max(1, x >> 2), Math.max(1, y >> 2));
    this.glowB.setSize(Math.max(1, x >> 2), Math.max(1, y >> 2));
  }

  private draw(m: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = m;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quad, this.cam);
  }

  /** night 0..1 turns on the glow (High only). */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, night: number): void {
    const r = this.renderer;
    if (!this.high || night <= 0.15) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    if (this.main.width <= 1) this.resize();
    r.setRenderTarget(this.main);
    r.render(scene, camera);
    this.bright.uniforms.tColor.value = this.main.texture;
    this.draw(this.bright, this.glowA);
    this.blur.uniforms.tColor.value = this.glowA.texture;
    (this.blur.uniforms.dir.value as THREE.Vector2).set((1 / this.glowA.width) * 1.5, 0);
    this.draw(this.blur, this.glowB);
    this.blur.uniforms.tColor.value = this.glowB.texture;
    (this.blur.uniforms.dir.value as THREE.Vector2).set(0, (1 / this.glowA.height) * 1.5);
    this.draw(this.blur, this.glowA);
    const u = this.composite.uniforms;
    u.tColor.value = this.main.texture;
    u.tBloom.value = this.glowA.texture;
    u.bloom.value = 0.6 * night;
    this.draw(this.composite, null);
  }
}
