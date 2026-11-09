# Storybook Graphics, Round 1: Shading and Light

Date: 2026-11-09
Status: approved in chat. **Update after the first deploy:** the user found the outlines odd, so they were removed. The post pipeline now only runs at night, for the glow.

The user chose:
- A "cosy storybook" look: stylised, not realistic.
- A pass over four areas, each its own round: shading & light, nature, buildings & props, characters & interiors.

This round covers shading and light. It includes:
- toon shading everywhere
- soft outlines on everything
- a painterly ground
- a storybook sky
- drifting cloud shadows
- night glow
- a High/Lite switch

Everything must stay light enough for a fanless MacBook Air.

## 1. Toon materials

- **Shared ramp** (`client/src/world/materials.ts`): one 4-band gradient map. It's a `DataTexture`, 4 × 1, with nearest filtering. The bands are about 0.45, 0.68, 0.86 and 1.0.
- **`toonMat(params)`:** returns a `MeshToonMaterial` with that ramp.
  - It accepts what `MeshStandardMaterial` takes (colour, map, emissive and emissiveIntensity, transparent, opacity, side, flatShading, depthWrite) and ignores roughness and metalness.
  - `mat()` and `glow()` return toon materials, still cached, so the code that changes glow brightness at night keeps working.
- **Replacing the old materials:** every `new THREE.MeshStandardMaterial(...)` and lit `MeshLambertMaterial(...)` in the client becomes `toonMat(...)`. Materials that must stay unlit keep `MeshBasicMaterial`: sprites, labels, beams, the sky and particles.
- **Shadows:** shadow casting and receiving are unchanged. The shadow camera keeps its current size.

## 2. Post-processing pipeline (`client/src/world/post.ts`)

`Post` replaces `renderer.render(scene, camera)` in `game.ts`.

### 1. Main pass

The scene renders into a `WebGLRenderTarget` at canvas size and pixel ratio, with:
- `samples: 4` (antialiasing, WebGL2)
- a `DepthTexture`

### 2. Outline and composite pass (High only)

A full-screen shader:
- **Finding edges:**
  - Reads the colour and the depth from four neighbours, 1.25 px away, scaled by the pixel ratio.
  - Converts depth to distance using the camera's near and far.
  - An edge is where the largest relative depth difference passes a threshold. That threshold rises with distance, so faraway grass doesn't turn into lines.
- **Drawing edges:** the edge colour is `color × 0.5`, a deeper shade of the same colour, mixed in by edge strength.
- **Fading out:** edge strength fades from full to zero between the fog's near and far distances.
- **Skipped pixels:** the sky (depth 1) is never outlined.

### 3. Night glow (High, when `night > 0.15`)

- **Bright parts:** a threshold pass picks out pixels with luminance above 0.8, weighted towards the colours of emissive objects. They go into a quarter-size target.
- **Blur:** two separable blur passes, horizontal then vertical, using a 9-tap Gaussian.
- **Composite:** added in the composite pass, weighted by `0.6 × night`.

### 4. Lite mode

Lite renders straight to the screen with `renderer.render`. There are no extra targets.

### Other details

- **Indoor scenes:** they use the same pipeline. The outline threshold is tuned so book spines read as shapes.
- **Resizing:** resizing the window resizes every target.

## 3. Painterly ground (`client/src/world/ground.ts`)

**Town layer:** for outdoor scenes, the town-sized plane is painted from a 2048 × (2048 × d / w) canvas, generated once per scene with a fixed seed:
- a base green
- about 260 soft radial patches in 4 greens, light and dark
- about 2,500 tiny flower specks in white, pink and yellow, kept away from paths
- darker shade under every tree, bush, building and hedge (a radial dark spot about 1.3 × its size)
- paths, lots and water stay as they are, since they're separate meshes

**Outer layer:** the plane outside the town keeps a repeating 256 px texture in the same greens, so the edge doesn't show.

**Indoors:** floors are unchanged.

## 4. Cloud shadows

Both outdoor ground materials get an `onBeforeCompile` patch:
- It multiplies the colour by a tiling soft-cloud texture (512², generated with a fixed seed, made of soft blobs), sampled at `worldXZ / 60 + time × drift`.
- The strength is 0.18 by day, falling to 0 at night.
- The drift matches the clouds: about 1 m/s along +x.
- High only. Lite gets strength 0.

## 5. Storybook sky (`client/src/world/sky.ts`)

**Colours:** each key in the day cycle gets a third colour, the horizon:

| Key | Top | Horizon | Bottom |
|---|---|---|---|
| Night | #16204a | #2c3270 | #3a3a6a |
| Dawn | #8fb0e8 | #ffc8b0 | #ffe2c8 |
| Day | #7cc4f2 | #cfeaf8 | #fdf0dc |
| Golden | #7fb4e6 | #ffd08a | #ffe6b8 |
| Dusk | #3e3e86 | #f59a9a | #ffc7a0 |

**The sky itself:**
- It becomes a three-stop gradient texture, redrawn only when the colours change (at most once a second).
- By day, a soft sun disc with a halo sprite sits in the sky, in the sun's direction.
- At night, the moon gets bigger with a soft glow sprite, and the stars twinkle.

**Light keys:** sun and hemisphere intensities are tuned for the toon ramp, with brighter highlights and warmer shadows.

## 6. Quality switch

- **Setting:** `Quality = 'high' | 'lite'`, stored in `localStorage['sv-quality']`. The default is `'high'`.
- **Override:** `?lite` forces Lite.
- **Button:** a ✨ button in the status panel toggles it, with the toast "Graphics: High ✨" or "Graphics: Lite 🍃".
- **Slow-frame hint:** if High averages under 40 fps for 5 seconds, a toast suggests Lite once per session. It doesn't switch by itself.
- **What Lite turns off:** outlines, night glow and cloud shadows. Toon shading, the painterly ground and the sky stay.

## 7. Tests

- **Materials:** `toonMat` carries over colour, map, emissive, opacity and side; ignores roughness; and shares the ramp texture.
- **Ramp:** the ramp has 4 rising values.
- **Ground generator:** given a seed, the same canvas gives the same pixels. The shade is darker at a tree's spot than in open grass. This uses a pure helper, `paintPlan(def, seed)`, that returns the shapes.
- **Quality:** the default, the stored value, and the `?lite` override.
- **Sky:** `skyAt` returns three colours, and they change smoothly between keys.
- **Headless:** before-and-after screenshots of the square, the park and the stage at 08:00, 13:00, 18:30 and 22:00, plus inside the library. Also check that Lite renders.
