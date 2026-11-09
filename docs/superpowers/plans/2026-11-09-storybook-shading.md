# Storybook Shading Implementation Plan

> Executed inline. One full review runs at the end (user preference: no per-step reviews).

**Goal:** implement `docs/superpowers/specs/2026-11-09-storybook-shading-design.md`.

## Task 0: Before screenshots

Take headless shots of the square, the park and the stage at 13:00, 18:30 and 22:00, plus the library, for comparison.

## Task 1: Toon materials

- **`materials.ts`:** add the ramp and `toonMat`; `mat()` and `glow()` become toon.
- **Replace the old materials** with `toonMat` across the client.
- **Tests.**

## Task 2: Quality setting and post pipeline

- **`client/src/world/quality.ts`:** the setting.
- **`client/src/world/post.ts`:** the main target, outline and composite shader, night glow.
- **Wiring:** `game.ts` uses the pipeline; the ✨ button goes in the HUD; the slow-frame hint.

## Task 3: Ground and cloud shadows

- **`client/src/world/ground.ts`:** `paintPlan` and the painted canvas; the outer layer; the cloud-shadow shader patch.
- **Tests.**

## Task 4: Sky

- **Three-colour keys, the sky texture, the sun disc and halo, the moon glow, twinkling stars.**
- **Tests.**

## Task 5: Final checks

- After screenshots at the same spots, plus a Lite check.
- One review.
- README.
- Push.
- Ask before deploying.
