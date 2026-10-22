# Bank Panic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When Eeman robs the bank with `sudo skrik-gi-meg-penger`, every character except the staff behind the counter runs out through the entrance, screaming.

**Architecture:** The map's `sprites` layer gets an optional `staff` flag, so "who is behind the skranke" is data in the map, not a coordinate guess in the scene. The `robber` animation in `scene-view.ts` additionally sends every non-staff map character to the `inngang` spot along the pathfinder route, with a scream bubble, and removes them. The task is unchanged: `robber` is already played on a successful robbery, so tasks stay scene-agnostic and nothing new can be dropped from the 2-play queue.

**Tech Stack:** TypeScript, Phaser 3, Vitest, Playwright.

**Spec:** the owner's change list (2026-10-19), quoted here because there is no spec file:

> **Task 3: Eeman bank** — When sudo skrik-gi-meg-penger all npcs except those behind skranke has to run out of the bank and scream.

Plan granularity is milestone-level on purpose (owner preference: broad plans, fast pace).

## Global Constraints

- All player-facing text stays Norwegian (scream text, e.g. «AAAH!»). Do not edit the owner's task texts, step texts, endings or command lists (see `tasks/lessons.md`).
- Scene calls never block the terminal (existing `ActionQueue` rule); the stampede runs on Phaser tweens and never delays `finish()` of the `robber` play.
- Only the successful `sudo skrik-gi-meg-penger` triggers it. The refused attempt (no sudo) still only laughs.
- `npm test`, `npm run typecheck` and `npm run e2e` all green at the end of each task.

## Review Focus

1. **Refused shout (no sudo or wrong password):** nobody runs; `robber` is not played. Already covered by the task tests; add one assertion that no `robber` play appears.
2. **Fast follow-up commands:** `ring-politiet` or `apne-safe` right after the robbery must not stop the stampede or drop the robber gear (the stampede is part of `robber`, so it cannot be dropped). Pinned in Task 2's e2e (run robbery then `cd safe` and `ring-politiet` immediately).
3. **Cashiers stay:** both characters on the staff row (`Amelia`, `Bob` at y = 3) remain visible and keep their idle turning after the stampede. Pinned in Task 2's e2e.
4. **Map without the flag or without an `inngang` spot** (the other maps, placeholder maps): the stampede does nothing and nothing throws. Pinned by a scene-level unit test of the helper that picks who flees.
5. **Unreachable exit:** a character whose path to `inngang` is null just fades out instead of freezing. Covered in Task 2's implementation step.

---

### Task 1: Mark the staff in the map

**Files:**
- Modify: `src/client/scene/map-data.ts` (`SpriteObject` gets `staff?: boolean`; `parseMap` reads the `staff` property of a sprites-layer object)
- Modify: `scripts/make-limezu-maps.ts` (`SpriteObj` gets `staff?`; the Tiled export writes it as a bool property; set it on the two cashiers in `bank()`)
- Modify: `public/maps/eeman-bank.json` (regenerate with `npx tsx scripts/make-limezu-maps.ts`; if the LimeZu assets are missing and the script cannot run, add the `staff: true` bool property to the two cashier objects by hand)
- Modify: `scripts/make-maps.ts` and its placeholder bank only if it has the same cashiers (check; otherwise skip)
- Test: `tests/client/maps.test.ts`

**Interfaces:**
- Produces: `SpriteObject.staff?: boolean` — true means "stays when the bank is robbed".

- [ ] **Step 1: Write failing tests** in `maps.test.ts`: parsing `eeman-bank.json` gives exactly two sprites with `staff === true`, both at y = 4 tiles (feet row, `y = 64`); the three lobby characters have no `staff`. Parsing a map whose sprite has no property leaves `staff` undefined.
- [ ] **Step 2: Run** `npx vitest run tests/client/maps.test.ts` — FAIL.
- [ ] **Step 3: Implement** the parse, the type, the generator flag and the regenerated map. Diff the JSON: only the two cashier objects may change.
- [ ] **Step 4: Run** `npm test && npm run typecheck` — PASS.
- [ ] **Step 5: Commit** `feat: mark bank staff in the map`

---

### Task 2: Everyone else runs out screaming

**Files:**
- Modify: `src/client/scene/scene-view.ts` (`placeSprites` keeps a list of the non-staff body characters; `beginPlay` for `'robber'` also calls new `stampede()`)
- Modify: `docs/writing-tasks.md:114` (`robber` now also makes everyone except the staff run out through the entrance)
- Test: `tests/tasks/eeman-bank.test.ts`, `tests/client/stampede.test.ts` (new, for the pure helper), `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Produces: pure helper `fleeing(sprites: SpriteObject[]): SpriteObject[]` (e.g. in a new `src/client/scene/stampede.ts`) — body characters (`Adam`/`Alex`/`Amelia`/`Bob`) without `staff`; keeps the scene testable without Phaser.
- Consumes: `findPath(blocked, from, to)` from `pathfinder.ts`, `data.spots['inngang']`, `SpriteObject.staff` from Task 1.

Behaviour (decisions the implementer cannot make alone):
- Each fleeing character gets a random start delay of 0–400 ms, shows a speech bubble «AAAH!» above it (depth above the characters, destroyed on arrival), turns to face each step, and walks the `findPath` route from its tile to the `inngang` tile at about twice the hero's walking speed. A null path or missing `inngang` spot makes it fade out in place.
- At `inngang` it steps one tile off the bottom edge, then is destroyed and its idle-turn timer stops (the existing `sprite.active` check already ends it).
- Persistent: they do not come back. The `snakk-med-gammel-mann` script still works afterwards; flag this to the owner in the final message (the old man has left the sofa but still "talks", which keeps the code route playable).
- `robber`'s own `finish()` timing (500 ms) is unchanged.

- [ ] **Step 1: Write failing tests:** `stampede.test.ts` — `fleeing([...])` returns the three lobby characters of the real `eeman-bank.json`, none of the cashiers, and `[]` for a map with no body sprites or only staff. In `eeman-bank.test.ts` (inside the existing `describe.each(MODES)`): a refused `skrik-gi-meg-penger` records no `['play','robber']`, a sudo one records exactly one.
- [ ] **Step 2: Run** `npx vitest run tests/client/stampede.test.ts tests/tasks/eeman-bank.test.ts` — the new tests FAIL.
- [ ] **Step 3: Implement** `fleeing` and `stampede()` per the behaviour above; call it from `beginPlay` for `'robber'` right after `putOnRobberGear()`.
- [ ] **Step 4: Add e2e test** `everyone but the cashiers runs out of the bank`: open `/?task=eeman-bank`, wait for `.scene[data-zoom]`, run `sudo skrik-gi-meg-penger` + password, then immediately `cd safe` and `ring-politiet`; `expect.poll` until the scene's active body-character sprites number 2 (the cashiers, found via the `__game` evaluate pattern of the existing robber test); also assert the robber mask/gun are still on Eeman. Save a screenshot mid-run to `test-results/panic.png`.
- [ ] **Step 5: Run** `npm test && npm run typecheck && npm run e2e` — PASS; look at `panic.png` (scream bubbles, lobby running toward the exit) and the final state (only cashiers left).
- [ ] **Step 6: Commit** `feat: bank customers run out screaming when Eeman robs it`
