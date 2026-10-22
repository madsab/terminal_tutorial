# Result Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a student finishes a task (pass or fail) a dialog pops up over a blurred background and tells the details: result, ending text, which goals were reached, and the stats.

**Architecture:** A pure function `resultSummary(update)` turns the final `TaskUpdate` into what the dialog shows, so it is unit-testable in plain node. A small component `showResultDialog(summary, opts)` builds a native `<dialog>` and opens it with `showModal()`, which gives the focus trap, Esc-to-close and a `::backdrop` for free; the blur is CSS `backdrop-filter` on that backdrop. `task.ts` opens it when the ending arrives, after a short delay so the last scene animation is seen first. The ending card in the task panel stays, so the result can be read again after the dialog is closed.

**Tech Stack:** TypeScript, native `<dialog>`, CSS, Vitest, Playwright.

**Spec:** the owner's request (2026-10-19), quoted here because there is no spec file:

> Write a plan for implementing a better feedback for when you have completed a task (pass/fail). Show it as a dialog popup that blurs the background and tells the details.

Plan granularity is milestone-level on purpose (owner preference: broad plans, fast pace).

## Global Constraints

- All player-facing text stays Norwegian. Reuse the existing headings «Godt jobbet!» (pass) and «Oi da!» (fail) from `ending-card.ts`; the ending text is the owner's text from the task definition and is shown verbatim. Do not edit task texts, step texts or endings (see `tasks/lessons.md`).
- Build DOM with the `el()` helper and `textContent` only; never `innerHTML`.
- Styling uses the existing tokens in `styles.css` (`--ok`, `--ok-soft`, `--ok-text`, `--bad`, `--bad-soft`, `--bad-text`, `--surface`, `--r-control`); pass is green, fail is red, and the result is never shown by colour alone (icon + heading text too).
- The dialog is a presentation of the ending only: it must not change what is sent to the server (`onEnded`, `pendingEnded`) or the admin view.
- `npm test`, `npm run typecheck` and `npm run e2e` all green at the end of each task.

## Review Focus

1. **Leaving the task while the dialog is open or pending** (admin starts the next task, `destroy()`, reload): the delay timer is cleared and the `<dialog>` is closed and removed; nothing is left blurring the page. Pinned in Task 2's e2e (the next task starts while the dialog is open).
2. **Keyboard and focus:** Esc closes it, focus lands on the close button when it opens and returns to the page after, Tab stays inside. Pinned in Task 2's e2e (press Escape, assert the dialog is gone and the panel's ending card is still visible).
3. **Closing it must not re-open it:** `render` runs on every update; the dialog opens exactly once per ending. Pinned in Task 2's e2e (close it, then the page is quiet for 1 s and the dialog count is 0).
4. **Goals not reached** (the funny/wrong endings finish with some goals undone, e.g. Homayoon passing out): the list shows each goal with ✓ or ○ so the student sees what was missed; a failed task never shows all-green. Pinned in Task 1's unit tests.
5. **No `backdrop-filter` support or reduced motion:** the backdrop falls back to a dark semi-opaque layer with no blur, and the open animation is off under `prefers-reduced-motion`. Covered by the CSS in Task 1 (`@supports not (backdrop-filter: blur(1px))`, existing reduced-motion pattern).

---

### Task 1: The dialog component and its content

**Files:**
- Create: `src/client/screens/result-summary.ts` (pure)
- Create: `src/client/screens/result-dialog.ts` (DOM)
- Modify: `src/client/styles.css` (dialog, backdrop blur, fallback, reduced motion, narrow screens)
- Test: `tests/client/result-summary.test.ts`

**Interfaces:**
- Produces: `resultSummary(u: TaskUpdate): ResultSummary | null` — `null` when `u.ending` is missing. `ResultSummary = { correct: boolean; title: string; text: string; goals: { text: string; done: boolean }[]; doneCount: number; stats: [string, number][] }`. `title` is «Godt jobbet!» or «Oi da!»; `text` is `u.ending.text`; `goals` pairs `u.stepTexts` with `u.stepsDone` (all goals, in order, including ones never revealed); `stats` is `Object.entries(u.stats)`.
- Produces: `showResultDialog(summary: ResultSummary, opts: { waitingNote: boolean; onClose?(): void }): { close(): void }` — appends a `<dialog class="result-dialog correct|wrong">` to `document.body`, calls `showModal()`, focuses the close button («Lukk»), removes itself from the DOM when closed (button, Esc or `close()`), and calls `onClose` once.

Layout decisions: a round icon (✓ green / ✕ red, `aria-hidden`) next to the heading, the ending text, a «Mål» list (✓/○ per goal, with a visually-hidden «(ferdig)» / «(ikke nådd)» like the existing steps), the stat chips (`stat-chip` class reused), the «Venter på neste oppgave…» note when `waitingNote`, and one primary button «Lukk». Max width ~480px, 16px side gutter on phones. `dialog::backdrop` gets `backdrop-filter: blur(6px)` over a `rgba(20,20,20,.35)` tint; the fallback is a `.6` tint without blur. Open animation: short fade+scale, disabled under `prefers-reduced-motion`.

- [ ] **Step 1: Write failing tests** in `result-summary.test.ts`: `resultSummary` of an update without ending is `null`; of a passing update (`correct: true`, 3 of 3 goals) gives title «Godt jobbet!», `doneCount` 3; of a failing update with `stepsDone: [true, false, false]` gives title «Oi da!», `doneCount` 1 and `goals` containing all three texts with `done` `[true, false, false]` (Review Focus 4); `stats` keeps the order of `u.stats`.
- [ ] **Step 2: Run** `npx vitest run tests/client/result-summary.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** `resultSummary` in `result-summary.ts`.
- [ ] **Step 4: Implement** `showResultDialog` and the CSS as described above.
- [ ] **Step 5: Run** `npm test && npm run typecheck` — PASS.
- [ ] **Step 6: Commit** `feat: result dialog component`

---

### Task 2: Open it when the task ends

**Files:**
- Modify: `src/client/screens/task.ts` (`render`, the `u.ending && !ended` branch; `destroy`)
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `docs/writing-tasks.md` (one line in the section on endings: finishing shows a result dialog with goals and stats)

**Interfaces:**
- Consumes: `resultSummary`, `showResultDialog` from Task 1.

Behaviour: in the ending branch, after the panel ending card is built, schedule `showResultDialog(resultSummary(u)!, { waitingNote: !!opts.waitingNote })` after 900 ms (so the last scene effect plays first; the terminal is already locked). Keep the timer id and the dialog handle; `destroy()` clears the timer and calls `close()`. The dialog is not opened by the reload screen (`renderEnding`): it has no goal data, and the page there is already the result.

- [ ] **Step 1: Implement** the wiring and the cleanup in `destroy()`.
- [ ] **Step 2: Extend e2e** `smoke.spec.ts`: in the existing two-student test, after Ola's ending, `expect(ola.getByRole('dialog'))` shows «Godt jobbet!», the ending text «Ahh, mye bedre!» and a goal list with all goals ticked; Kari's dialog shows «Oi da!» or the wrong-ending result with at least one unticked goal. Then: Esc on Ola closes the dialog and the panel's ending card is still visible (Review Focus 2); a second after closing, no dialog exists (Review Focus 3). Leave Kari's dialog open and have the admin start the next task (or use a preview page + `destroy` path if no next task exists): assert no `dialog` and no blur layer remain (Review Focus 1). Make the existing reload assertion still pass.
- [ ] **Step 3: Run** `npm test && npm run typecheck && npm run e2e` — PASS. Open `/?task=homayoon-bar`, finish it and look at the pass and fail dialogs at 1440 wide and at 390 wide; save screenshots to `test-results/dialog-pass.png` and `dialog-fail.png`.
- [ ] **Step 4: Commit** `feat: show the result in a dialog when a task ends`
