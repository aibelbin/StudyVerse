# Storybook Graphics, Rounds 2–4: Nature, Buildings & Props, Characters & Interiors

Date: 2026-11-09
Status: the user asked to "go on with the rest and build" after round 1. This spec uses the defaults recommended in the earlier brainstorm.

**Constraints:**
- No outlines. This is user feedback (see the round 1 spec update).
- More detail and charm, not realism.
- Light enough for a fanless MacBook Air: repeated objects stay instanced (4 template variants per kind), extra geometry goes into those templates, and no new real-time lights.

## Round 2: Nature (`client/src/world/decor.ts`, `instanced.ts`)

- **Fix:** wind sway works with toon materials again. `swayMaterial` accepts any material, not only `MeshStandardMaterial`.
- **Trees** come in four shapes, picked by seed. They have smooth round canopies made of 6–9 clumps in 3 greens, with lighter clumps on top:
  - **Oak:** wide canopy, a short trunk with two branch stubs.
  - **Poplar:** tall, narrow, stacked canopy.
  - **Birch:** white trunk with dark marks, light airy canopy.
  - **Apple:** oak shape with small red fruit.
- **Pines:** four tiers, each a darker cone with a lighter cone on top, and a visible trunk.
- **Bushes:** 4–6 round clumps. Variants get red berries, blue berries, tiny white flowers, or nothing.
- **Flower beds:** about 7 flowers, each with a stem, two leaves, a 5-petal ring around a yellow centre, and a different height. One colour family per bed.
- **Grass tufts:** 5 tapered blades in 2–3 greens. Some get a tiny white flower.
- **Rocks:** 2–3 rounded stones together. Half get a soft moss cap.
- **Lily pads:** a round pad with a notch. Some get a pink or white 6-petal flower.
- **Hedges:** a low base with two rows of uneven round clumps, dotted with small flowers.
- **Water** (lake, koi pond, golf pond, fountain): a shared stylised water material.
  - Its colour slowly shifts with soft light ripples, from world position and time, in the shader.
  - The lake gets a pale foam ring just inside its stone rim.
  - It reuses the cloud-shadow time uniform.

## Round 3: Buildings & props

- **Buildings** (library, café, boutique facades):
  - A stone base course and plank siding (a canvas texture tinted with the wall colour).
  - Windows with frames, cross bars, sills, shutters on both sides, and window boxes of flowers.
  - The door gets a frame, a step and a little lamp above it that glows at night (the street-lamp glow).
  - A tiled roof (canvas scallops in the accent colour) with an overhang, and a chimney.
  - The awning gets cream-and-accent stripes and a scalloped edge.
  - Chimneys puff slow smoke: a small client-side effect with 3–4 puffs per chimney, no shadows.
- **Benches:** four seat slats, three back slats, armrests, dark curved iron legs.
- **Lamp posts:** a plinth, a pole with rings, and a lantern head: a 4-post frame round the glowing globe, a pointed cap and a finial.
- **Cobbles:** stones of varied colour with soft moss in some of the gaps.
- **Signposts:** two new wooden signposts with arrow boards.
  - **On the south path near the square:** "Park & Garden", "Stage & Golf", "Lake".
  - **At the park-path / strip-path junction:** "Zen corner", "Stage", "Mini-golf".
  - Each signpost has a small collider.

## Round 4: Characters & interiors

- **Characters:** a soft lighter belly patch, a white sparkle in each eye, and a slightly rounder body.
- **Pets:** an eye sparkle and a belly patch, the same way.
- **Interior lighting:** lower ambient light, so toon bands show indoors as they do outdoors. Library: hemisphere 1.05, sun 1.5. Café: hemisphere 1.05, sun 1.45.
- **Rugs:** patterned, with a border, inner motifs and a fringe.
- **Plants:** a pot with a rim and soil, and layered leaves (or a small fern).
- **Windows:** framed with cross bars, curtains on both sides and a sill plant. In the library a soft sunbeam slants in: an additive plane, only by day.
- **New decor kinds:**
  - **`frame`:** wall paintings with simple landscapes. Two in the library and two in the café, on the back walls.
  - **`pendant`:** hanging lamps over the café tables, with cords to the top of the scene. They glow at night.
  - **`chalkboard`:** in the café, by the counter, showing the menu (canvas text: "Latte · Matcha · Cocoa · Espresso").
  - **`stringLights`:** small glowing bulbs along the café's back wall.
- **Bookshelves:** small extras on top (a plant, a globe, a stack of books).

## Tests

- **Scenes:** the new decor kinds exist in the library and café, and the two signposts sit off paths and outside colliders.
- **Decor:** every `DecorKind` has a builder (the type checker enforces this), and every builder returns geometry without throwing for each variant seed. This runs in Node with three.js but no WebGL.
- **Headless:** before-and-after screenshots of the park, a tree-heavy meadow, the lake, the square buildings, the library, the café, and a character close up.
