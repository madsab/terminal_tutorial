# Goals, Heads and Homayoon Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reveal goals one at a time, seat the photo head on the body, and give Homayoon a lying-down pass-out and a yellow pee stain.

**Architecture:** Goal visibility is a pure helper used by the task panel's `render`. The head fix and both Homayoon effects live in the Phaser `View` in `scene-view.ts`; the task only asks for a new `besvim` animation, so tasks stay scene-agnostic.

**Tech Stack:** TypeScript, Phaser 3, Vitest, Playwright.

**Spec:** the owner's change list (2026-10-19), quoted here because there is no spec file:

> **General:** The floating heads are displayed too high for the body, adjust it down by one tile. Only show the first goal, then when that is complete, show the next goal.
> **Task 1 Homayoon Bar:** Drinking until passing out rotates Homayoon so that he's lying on the floor. "tiss" makes a wet yellow stain on the place he is standing.

Plan granularity is milestone-level on purpose (owner preference: broad plans, fast pace).

## Global Constraints

- All player-facing text stays Norwegian. Do not edit the owner's task texts, step texts, endings or command lists (see `tasks/lessons.md`).
- The working tree already holds uncommitted work: the `besvimte` ending (`PASS_OUT_ABOVE = 10`) in `src/tasks/homayoon-bar.ts` and its tests. It is the baseline for Task 3; keep it as is and commit it with Task 3.
- Scene calls never block the terminal (existing `ActionQueue` rule). New effects go through `play(anim)`.
- `npm test`, `npm run typecheck` and `npm run e2e` all green at the end of each task.

## Review Focus

1. **Steps completed out of order** (e.g. Eeman tries the bank before running `ls`): only steps up to the first unfinished one show; a later finished step appears already ticked once it is reached. Pinned in Task 1's tests.
2. **Robber mask and gun after the head moves:** they must stay on Eeman's face and hand, with and without a head photo. Existing e2e `the robber mask and gun stay on Eeman…` plus Task 2's screenshot check.
3. **Pass-out after many fast drinks:** the queue keeps only the 2 newest plays, so `besvim` must be queued after `drink` on the same command so it is never dropped. Pinned in Task 3's task test (order of scene calls).
4. **Ten drinks must not lie him down:** `besvim` only on drink number 11. Pinned in Task 3's task test.
5. **Stain where he actually ends up:** `tiss` run right after a `cd` must stain the tile he walked to, not the one he left. Covered because `beginPlay` runs only after the queued walk finishes; Task 4's e2e checks the stain position after a `cd`.

---

### Task 1: Show goals one at a time

**Files:**
- Create: `src/client/screens/steps.ts`
- Modify: `src/client/screens/task.ts` (`render`, the `steps.replaceChildren` block)
- Test: `tests/client/steps.test.ts`

**Interfaces:**
- Produces: `visibleStepCount(stepsDone: boolean[]): number` — steps `0 .. n-1` are shown.

Decisions: the counter (`1 av 3`) and progress bar keep showing the full total; only future step texts are hidden. The admin view is unchanged (the teacher sees every step). After an ending, the same rule applies (passing out leaves step 2 visible but unticked).

- [ ] **Step 1: Write failing tests** in `tests/client/steps.test.ts`:

```ts
expect(visibleStepCount([])).toBe(0);
expect(visibleStepCount([false, false, false])).toBe(1);
expect(visibleStepCount([true, false, false])).toBe(2);
expect(visibleStepCount([true, true])).toBe(2);
expect(visibleStepCount([false, true, false])).toBe(1); // out of order: step 2 stays hidden
```

- [ ] **Step 2: Run** `npx vitest run tests/client/steps.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** `visibleStepCount` (index of the first `false` + 1, or the length when all are done) and use it in `render` to slice `u.stepTexts` before mapping to `<li>`s.
- [ ] **Step 4: Run** `npm test && npm run typecheck` — PASS. Open `/?task=homayoon-bar` (`npm run dev`) and see only "Hjelp Homayoon å drikke en Hiroshima"; after `kjop-hiroshima` the toilet goal appears.
- [ ] **Step 5: Commit** `feat: reveal task goals one at a time`

---

### Task 2: Seat the photo head on the body

**Files:**
- Modify: `src/client/scene/scene-view.ts` (`create`: head sprite y; `putOnRobberGear`: mask and gun y)

The LimeZu 16x32 body (`Adam_idle_16x16.png`, down frame) is empty in rows 0–8; the drawn head spans rows 9–22 and shoulders start at row 23. Today the photo sits at rows 0–15, i.e. above the real head. **Decision:** lower the photo by 8 px (head sprite `y` from `-16` to `-8`), so the photo's top meets the hair line and its bottom rests on the shoulders. The request said "one tile"; a full 16 px tile would put the photo over the torso, so flag the value to the owner with the screenshot and change the one constant if they want more.

- Add a named constant `PHOTO_HEAD_Y = -8` next to `LABEL_DEPTH`; use it only for the LimeZu body (the non-LimeZu placeholder body keeps `-14`).
- `putOnRobberGear` currently derives positions from `this.head.y`. Keep them where they are on the body: mask at `this.head.y` when the photo is visible, `-11` when it is hidden (today's `-16 + 5`); gun at `-8` (today's `-16 + 8`).

- [ ] **Step 1: Implement** the constant and the robber-gear offsets.
- [ ] **Step 2: Verify** `npm run typecheck && npm run e2e` — PASS (robber test still finds mask and gun). Look at `test-results/robber.png` and a preview screenshot of `/?task=homayoon-bar`: the photo sits on the shoulders, the mask covers Eeman's face, the gun is at hand height.
- [ ] **Step 3: Commit** `fix: lower the photo head onto the body`

---

### Task 3: Homayoon lies down when he passes out

**Files:**
- Modify: `src/tasks/homayoon-bar.ts` (`kjop-hiroshima.run`)
- Modify: `src/client/scene/scene-view.ts` (`beginPlay`, new `passOut()`)
- Modify: `docs/writing-tasks.md:114` (add `besvim` to the `play(anim)` list: "Homayoon legger seg ned på gulvet og blir liggende")
- Test: `tests/tasks/homayoon-bar.test.ts`, `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Produces: scene animation name `'besvim'` (persistent: the hero stays lying).

- [ ] **Step 1: Write failing task tests** (inside the existing `describe.each(MODES)`):

```ts
test('the eleventh Hiroshima plays besvim right after drink', async () => {
  const r = await run(mode, ['cd bar-omrade', 'cd bar', ...drinks(11)]);
  const plays = r.sceneCalls.filter((c) => c[0] === 'play').map((c) => c[1]);
  expect(plays.slice(-2)).toEqual(['drink', 'besvim']);
});

test('ten Hiroshimas never play besvim', async () => {
  const r = await run(mode, ['cd bar-omrade', 'cd bar', ...drinks(10)]);
  expect(r.sceneCalls).not.toContainEqual(['play', 'besvim']);
});
```

- [ ] **Step 2: Run** `npx vitest run tests/tasks/homayoon-bar.test.ts` — the first new test FAILS.
- [ ] **Step 3: Implement** in `kjop-hiroshima.run`: after `ctx.scene.play("drink")`, call `ctx.scene.play("besvim")` when `ctx.state.drinks > PASS_OUT_ABOVE`.
- [ ] **Step 4: Implement** `passOut()` in the scene, called from `beginPlay` for `'besvim'`: stop the walk animation, show the idle frame, tween `this.hero.angle` to `90` and `this.hero.x` by `-T` over ~400 ms (rotating around the feet puts the body one tile to the right; the shift centres him on his tile), then `finish()`. Mark it persistent (e.g. a `lyingDown` flag) so later `play` bounces skip the y-yoyo and he stays down. Skip the generic icon/bounce branch for `'besvim'`.
- [ ] **Step 5: Add e2e test** `Homayoon lies on the floor after passing out` in `smoke.spec.ts`: open `/?task=homayoon-bar`, wait for `.scene[data-zoom]`, type `cd bar-omrade`, `cd bar`, then `kjop-hiroshima` ×11; `expect.poll` on `getScene('view').hero.angle` until `90` (same `__game` evaluate pattern as the robber test); save `test-results/besvim.png`.
- [ ] **Step 6: Run** `npm test && npm run typecheck && npm run e2e` — PASS; check `besvim.png` shows him lying on the floor, not inside the bar counter.
- [ ] **Step 7: Commit** (includes the already-present `besvimte` ending and its tests) `feat: Homayoon passes out lying on the floor`

---

### Task 4: Yellow stain where Homayoon pees

**Files:**
- Modify: `src/client/scene/scene-view.ts` (`beginPlay` for `'tiss'`, new `peeStain()`)
- Modify: `docs/writing-tasks.md:114` (`tiss` now also leaves a yellow stain)
- Test: `tests/e2e/smoke.spec.ts`

No task change: `tiss` already calls `ctx.scene.play("tiss")` in every folder.

- [ ] **Step 1: Implement** `peeStain()`, called from `beginPlay` for `'tiss'` before the existing icon/bounce: an ellipse named `'tiss-stain'` at `(hero.x, hero.y - 1)`, about 14×6 px, colour `0xe8d33a` at alpha `0.75`, depth `1.5` (over floor and walls, under furniture and the hero). It is a scene child, not a hero child, so it stays on the floor. Tween its scale from `0.2` to `1` over ~600 ms so it spreads.
- [ ] **Step 2: Add e2e test** `tiss leaves a yellow stain under Homayoon`: open `/?task=homayoon-bar`, run `cd bar-omrade`, `cd bar`, `kjop-hiroshima`, `cd ..`, `cd sofakrok`, `tiss`; `expect.poll` until `getScene('view').children.list` has an object named `tiss-stain`; assert its `x`/`y` are within 2 px of the hero's (stain is on the tile he walked to); save `test-results/tiss.png`.
- [ ] **Step 3: Run** `npm test && npm run typecheck && npm run e2e` — PASS; check `tiss.png` shows a yellow puddle at his feet.
- [ ] **Step 4: Commit** `feat: tiss leaves a yellow stain on the floor`
