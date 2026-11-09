import * as THREE from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Soft outlines from depth edges (a deeper shade of the surface's own colour), plus the night glow. */
const COMPOSITE = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tBloom;
uniform vec2 texel;
uniform float cameraNear;
uniform float cameraFar;
uniform float fadeNear;
uniform float fadeFar;
uniform float outline;
uniform float bloom;
uniform float px;
varying vec2 vUv;

float lin(float d) {
  float z = d * 2.0 - 1.0;
  return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
}

void main() {
  vec4 c = texture2D(tColor, vUv);
  vec3 col = c.rgb;
  float d0 = texture2D(tDepth, vUv).x;
  if (outline > 0.0 && d0 < 1.0) {
    float z0 = lin(d0);
    float e = 0.0;
    vec2 o = texel * 1.6 * px; // about 2 px lines, whatever the screen density
    // Only neighbours further away count, so the line sits on the nearer object's edge.
    e = max(e, (lin(texture2D(tDepth, vUv + vec2(o.x, 0.0)).x) - z0) / z0);
    e = max(e, (lin(texture2D(tDepth, vUv - vec2(o.x, 0.0)).x) - z0) / z0);
    e = max(e, (lin(texture2D(tDepth, vUv + vec2(0.0, o.y)).x) - z0) / z0);
    e = max(e, (lin(texture2D(tDepth, vUv - vec2(0.0, o.y)).x) - z0) / z0);
    e = max(e, (lin(texture2D(tDepth, vUv + o * 0.7).x) - z0) / z0);
    e = max(e, (lin(texture2D(tDepth, vUv - o * 0.7).x) - z0) / z0);
    e = max(e, (lin(texture2D(tDepth, vUv + vec2(o.x, -o.y) * 0.7).x) - z0) / z0);
    e = max(e, (lin(texture2D(tDepth, vUv + vec2(-o.x, o.y) * 0.7).x) - z0) / z0);
    float thr = 0.006 + z0 * 0.0002;
    float edge = smoothstep(thr, thr * 2.5, e) * (1.0 - smoothstep(fadeNear, fadeFar, z0));
    col = mix(col, col * 0.32, edge * outline);
  }
  col += texture2D(tBloom, vUv).rgb * bloom;
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
 * The storybook renderer. High: the scene into an antialiased half-float target, then one
 * full-screen pass for outlines (and a quarter-size glow at night). Lite: straight to the screen.
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
    this.main.depthTexture = new THREE.DepthTexture(1, 1);
    this.glowA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.glowB = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.black.needsUpdate = true;
    this.composite = pass(COMPOSITE, {
      tColor: { value: null }, tDepth: { value: null }, tBloom: { value: this.black }, texel: { value: new THREE.Vector2() },
      cameraNear: { value: 0.1 }, cameraFar: { value: 200 }, fadeNear: { value: 30 }, fadeFar: { value: 75 }, outline: { value: 1 }, bloom: { value: 0 }, px: { value: 1 },
    }, true);
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
    (this.composite.uniforms.texel.value as THREE.Vector2).set(1 / x, 1 / y);
    this.composite.uniforms.px.value = this.renderer.getPixelRatio();
  }

  private draw(m: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = m;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quad, this.cam);
  }

  /** night 0..1 turns on the glow; fog sets where outlines fade out. */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, night: number, indoor: boolean): void {
    const r = this.renderer;
    if (!this.high) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    if (this.main.width <= 1) this.resize();
    r.setRenderTarget(this.main);
    r.render(scene, camera);
    const u = this.composite.uniforms;
    u.tColor.value = this.main.texture;
    u.tDepth.value = this.main.depthTexture;
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;
    const fog = scene.fog instanceof THREE.Fog ? scene.fog : null;
    u.fadeNear.value = fog ? fog.near : 40;
    u.fadeFar.value = fog ? fog.far : 120;
    u.outline.value = indoor ? 0.8 : 1;
    const glow = night > 0.15;
    if (glow) {
      this.bright.uniforms.tColor.value = this.main.texture;
      this.draw(this.bright, this.glowA);
      const t = 1 / this.glowA.width;
      this.blur.uniforms.tColor.value = this.glowA.texture;
      (this.blur.uniforms.dir.value as THREE.Vector2).set(t * 1.5, 0);
      this.draw(this.blur, this.glowB);
      this.blur.uniforms.tColor.value = this.glowB.texture;
      (this.blur.uniforms.dir.value as THREE.Vector2).set(0, (1 / this.glowA.height) * 1.5);
      this.draw(this.blur, this.glowA);
    }
    u.tBloom.value = glow ? this.glowA.texture : this.black;
    u.bloom.value = glow ? 0.6 * night : 0;
    this.draw(this.composite, null);
  }
}
