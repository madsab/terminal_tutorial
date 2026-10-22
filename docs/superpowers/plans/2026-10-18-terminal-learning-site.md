# Terminal Learning Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Granularity note:** the owner asked for a broad plan to keep development fast. Each task lists its goal, files, the interfaces neighbouring tasks rely on, the tests that prove it, and a done-check. Implementers choose the internals. Write the named tests first (TDD) and commit at the end of each task.

**Goal:** A classroom website where ~30 students solve playful Norwegian tasks in a simulated macOS/Linux/PowerShell terminal, while a pixel-art scene reacts and an admin watches live and starts each task.

**Architecture:** All terminal and scene logic runs in the browser: a home-made shell engine renders through xterm.js, and a Phaser scene draws Tiled maps. Each task is one TypeScript file that the engine, the scene and the task runtime read as data plus small functions. One Node process serves the built front end and relays session state over WebSockets, keeping state in memory and saving it to a JSON file. The whole thing ships as one Docker image.

**Tech Stack:** TypeScript, Vite 8, @xterm/xterm 6, Phaser 4, Tiled (JSON maps), easystarjs (grid pathfinding), Node 22 + `ws` 8, Vitest 5, Playwright (one smoke test), Docker.

**Spec:** `docs/superpowers/specs/2026-10-18-terminal-learning-site-design.md`

## Global Constraints

- All UI text, task text, hints, feedback, ending messages, the admin page and folder names are in **Norwegian**. Everything the terminal prints (prompts, output, errors) is in **English** and mimics the real shell.
- Folder and script names contain **no æ, ø, å**.
- Story feedback is **never printed in the terminal**. It goes in the task window.
- Layout, top to bottom: **task window** (scene, task text and checklist, hint) then **terminal**. Styling is kept separate from logic, because a visual redesign comes later.
- Three OS modes: `mac` (zsh, case-insensitive), `linux` (bash, case-sensitive), `windows` (Windows PowerShell as in Windows Terminal on Windows 11, case-insensitive).
- The **"Vis hint"** section is hidden by default and shows the hint for the student's current state.
- Adding a task = one file in `src/tasks/` + its map + one line in `src/tasks/registry.ts`. No engine, scene or UI edits.
- The admin is protected by the `ADMIN_PASSWORD` env var. Students can never start tasks or reset the session.
- The first ending a student reaches is final and stored on the server. Any ending counts as "ferdig".
- LimeZu art lives in the git-ignored `assets/limezu/`. Placeholder art must work without it.
- The controlled character's head is a **custom photo** from the git-ignored `assets/heads/<character>.png`, pixelated to match the art. Until the owner supplies the photos, a placeholder head is used: a coloured head with the character's initial.
- Deployable as one Docker image, with a configurable base path (`BASE_PATH`) and port (`PORT`).
- 30+ concurrent students with no noticeable lag. Typing never waits on the network.

## Review Focus

1. **Messy input:** an empty line, extra spaces, quoted names, `cd bar/`, `cd ./bar`, `cd ../bar`, `cd -`, `ls -la`, unknown flags, very long lines. These must never crash and must give real-shell-style output or errors. Tested in Task 2.
2. **Paths per OS:** wrong letter case (works on mac and windows, fails on linux), PowerShell accepting both `\` and `/`, `cd ..` above the task root, `cd ~`, `cd /`, `cd C:\`. Tested in Task 2.
3. **Reload and reconnect:** reloading mid-task, reloading after an ending (the ending screen comes back), a server restart (state restored from JSON), and the admin starting the next task while a student is mid-command. Tested in Task 7.
4. **Same name or same browser twice:** two students with the same name get separate rows, and two tabs with the same client id share one row without double-counting. Tested in Task 7.
5. **Command spam while the scene animates** (e.g. `kjop-hiroshima` 50×, or many `pip install` runs in a row): the terminal stays responsive, the scene skips ahead or queues, and the counts stay exact. Tested in Tasks 5 and 6.

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, Dockerfile, .gitignore, README.md
src/shared/protocol.ts        WebSocket message types (client↔server, admin↔server)
src/shell/vfs.ts              in-memory filesystem (dirs, scripts, venvs, hidden flag)
src/shell/modes.ts            OsMode definitions: prompt, paths, case rules, error texts
src/shell/engine.ts           Shell: parse line → run command → output + events
src/shell/commands/*.ts       one file per command family (nav, python, pip, venv, sudo, scripts)
src/tasks/api.ts              defineTask() + TaskDefinition types
src/tasks/runtime.ts          TaskRuntime: state, events → steps/endings/hints/stats/scene
src/tasks/testing.ts          runTaskScript() helper for task tests
src/tasks/registry.ts         ordered list of tasks
src/tasks/homayoon-bar.ts, aleksander-python.ts, eeman-bank.ts
src/client/main.ts            student app router (join → OS → waiting → task → ending)
src/client/screens/*.ts       one file per screen
src/client/terminal/xterm-shell.ts   line editor on xterm (history, Tab, hidden input)
src/client/scene/scene-view.ts       Phaser scene + SceneApi implementation
src/client/net.ts             WebSocket client with reconnect
src/client/admin/admin.ts     admin page
src/client/styles.css
src/server/index.ts           HTTP static + WS
src/server/session.ts         session store + JSON persistence
public/maps/*.json            Tiled maps (placeholder until the owner's maps arrive)
scripts/loadtest.ts           simulated-client load test
docs/writing-tasks.md         authoring guide
tests/**                      Vitest tests mirroring src/
```

---

### Task 1: Scaffold and a deployable reachability check

**Goal:** A repo that builds, tests, and runs as a Docker image serving a "hello" page and a WebSocket echo, so the owner can test IDUN **on day 1**.

**Files:** `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore` (`node_modules`, `dist`, `assets/limezu`, `assets/heads`, `data/`), `Dockerfile`, `src/server/index.ts`, `src/client/main.ts`, `index.html`, `README.md` (deploy section), `tests/server/echo.test.ts`.

**Interfaces:**
- Produces: `startServer({ port, basePath, dataDir }): Promise<{ close(): Promise<void>; url: string }>`, which serves `dist/` under `basePath` and accepts WS at `${basePath}/ws`.
- Env: `PORT` (default 8080), `BASE_PATH` (default `/`), `ADMIN_PASSWORD`, `DATA_DIR` (default `./data`).

- [ ] `git init`, then add scripts: `dev` (Vite + server with watch), `build`, `start`, `test`.
- [ ] Test `echo.test.ts`: start the server on a random port with `basePath: '/tq'`; `GET /tq/` → 200; a WS to `/tq/ws` echoes `{"type":"ping"}` back as `{"type":"pong"}`.
- [ ] Implement it. The page shows "Tilkoblet ✓" when the WS ping succeeds.
- [ ] Dockerfile: a multi-stage build that runs `node dist/server/index.js`.
- [ ] README: how to build and run the image, plus a reverse-proxy note (WebSocket upgrade headers) and a one-paragraph "test on IDUN" checklist.
- [ ] Done when `npm test` passes, `docker run -p 8080:8080` shows "Tilkoblet ✓" in a browser, and everything is committed. **Tell the owner they can test IDUN now.**

### Task 2: Shell engine core (filesystem, OS modes, navigation)

**Goal:** A UI-free shell that runs `cd`, `ls`, `pwd` and `clear` (plus their PowerShell names and aliases) realistically in all three modes, and emits events.

**Files:** `src/shell/vfs.ts`, `src/shell/modes.ts`, `src/shell/engine.ts`, `src/shell/commands/nav.ts`, `tests/shell/*.test.ts`.

**Interfaces (produces):**
- `type OsMode = 'mac' | 'linux' | 'windows'`
- `class Vfs`: `mkdir(path)`, `addScript(dir, name)`, `remove(path)`, `exists(path)`, `isDir(path)`, `list(dir, { all: boolean }): Entry[]`, `setHidden(path, hidden)`, `setForceVisible(path, visible)`. Paths inside are POSIX. The mode translates them for display.
- `Entry = { name: string; kind: 'dir' | 'script' | 'file'; hidden: boolean }`
- `class Shell`: `constructor(opts: { mode: OsMode; vfs: Vfs; user: string; host: string; home: string; commands: CommandSet })`, `prompt(): string`, `run(line: string): Promise<RunResult>`, `complete(line: string): { replacement: string; options: string[] }`, `on(listener: (e: ShellEvent) => void)`, `env` (mutable shell state, e.g. `env.venv?: string`).
- `RunResult = { output: string; clear?: boolean; requestInput?: { prompt: string; hidden: boolean; resume(input: string): Promise<RunResult> } }`
- `ShellEvent = { type: 'cwdChanged'; from: string; to: string } | { type: 'commandRun'; name: string; args: string[]; ok: boolean } | { type: 'custom'; name: string; data?: unknown }`
- `Command = (ctx: CommandContext) => Promise<RunResult> | RunResult`, where `CommandContext = { args; shell; vfs; mode; emit(e: ShellEvent) }`. `CommandSet` maps names and aliases to Commands.
- The task tree is mounted at the realistic home: `/Users/<user>`, `/home/<user>`, `C:\Users\<user>`.

- [ ] Golden-output tests per mode for: the prompt (zsh `user@host dir %`, bash `user@host:~/dir$`, PowerShell `PS C:\Users\user\dir>`); `ls` (PowerShell table format for `Get-ChildItem`); `cd` (relative, `..`, `~`, absolute, multi-segment, a trailing slash, `cd` alone); `pwd`; the "command not found" text per shell; the "no such directory" text per shell.
- [ ] Review Focus 1 and 2 tests: the messy-input list and the path/case list, in all modes.
- [ ] Tab completion test: unique prefix → completed; several matches → options.
- [ ] Implement. Done when all tests pass, then commit.

### Task 3: Terminal UI (xterm line editor)

**Goal:** A realistic terminal in the browser on top of `Shell`.

**Files:** `src/client/terminal/xterm-shell.ts`, `src/client/terminal/themes.ts`, `src/client/dev/terminal.html` (dev page), `tests/client/line-editor.test.ts`.

**Interfaces:**
- Consumes: `Shell` (Task 2).
- Produces: `mountTerminal(el: HTMLElement, shell: Shell, mode: OsMode): { lock(): void; focus(): void; dispose(): void }`.
- The line-editor logic (buffer, cursor, history) is a pure class, `LineEditor`, so it can be tested without xterm.

- [ ] Tests on `LineEditor`: typing, backspace, left/right, up/down history, Ctrl+C clears the line, hidden-input mode echoes nothing.
- [ ] Implement it, with a per-mode theme: macOS Terminal look, a Linux look, Windows Terminal + PowerShell look.
- [ ] Done when the dev page `?os=linux|mac|windows` lets you navigate a sample tree by hand. Commit.

### Task 4: Task API, runtime, preview mode and test helper

**Goal:** The single-file task format and the runtime that turns shell events into steps, endings, hints, stats and scene commands.

**Files:** `src/tasks/api.ts`, `src/tasks/runtime.ts`, `src/tasks/testing.ts`, `src/tasks/registry.ts`, `src/tasks/example.ts` (tiny test task), `tests/tasks/runtime.test.ts`.

**Interfaces (produces):**
- `defineTask<S>(def: TaskDefinition<S>): TaskDefinition<S>`, where the definition contains:
  - `id`, `title`, `user`, `host`, `map` (Tiled file name)
  - `character: { name: string; head: string }` (head = file name in `assets/heads/`)
  - `tree: TreeSpec` (dirs and scripts, nested object)
  - `spots: Record<string, string>` (folder path → map spot name)
  - `commands: string[]` (names from the command library)
  - `scripts: Record<string, ScriptDef<S>>`, where `ScriptDef = { dir: string; requiresSudo?: boolean; visibleWhen?(s: S): boolean; run(ctx: TaskCtx<S>): string | void }` and the returned string is terminal output
  - `initialState: S`
  - `onEvent?(e: ShellEvent, ctx: TaskCtx<S>): void`
  - `steps: { text: string; done(s: S): boolean }[]`
  - `endings: { id: string; text: string; correct: boolean; when(s: S, e: ShellEvent): boolean }[]`
  - `hints: { when(s: S, cwd: string): boolean; text: string }[]`
  - `stats?(s: S): Record<string, number>`
  - `setup?(ctx)`: extra command registration for task-specific commands
- `TaskCtx<S> = { state: S; cwd: string; vfs: Vfs; shell: Shell; scene: SceneApi; feedback(text: string): void }`
- `SceneApi = { walkTo(spot: string): void; spawn(id: string, kind: string, spot: string, label?: string): void; move(id: string, spot: string): void; wander(id: string): void; remove(id: string): void; play(anim: string): void; say(text: string): void }`. Task 5 implements it, and Task 4 provides a recording fake.
- `class TaskRuntime<S>`: `constructor(def, mode, scene)`, `.shell`, `onUpdate(cb: (u: TaskUpdate) => void): () => void`, where `TaskUpdate = { stepsDone: boolean[]; hint: string; stats: Record<string, number>; ending?: { id; text; correct }; feedback?: string }`.
- `runTaskScript(def, mode, lines: string[]): Promise<{ state; update: TaskUpdate; output: string[]; sceneCalls: unknown[] }>`
- `registry.ts`: `export const taskOrder: TaskDefinition<any>[]`

- [ ] Runtime tests with `example.ts`:
  - entering a mapped folder calls `scene.walkTo`
  - a script runs only in its dir
  - `visibleWhen` hides/shows a script in `ls`
  - the first matching hint wins
  - an ending fires once and then locks
- [ ] Implement scripts as a generic engine feature: a script is run by `name` or `./name`, and is "command not found" elsewhere.
- [ ] Preview mode: `?task=<id>&os=<mode>` opens a task without server or admin.
- [ ] Done when tests pass. Commit.

### Task 5: Scene (Phaser + Tiled + placeholder maps)

**Goal:** A 3/4 top-down pixel-art scene that implements `SceneApi` and never blocks the terminal.

**Files:** `src/client/scene/scene-view.ts`, `src/client/scene/placeholder-art.ts` (generated sprites for when LimeZu is absent, plus snake and cage sprites), `public/maps/homayoon-bar.json`, `public/maps/aleksander-house.json`, `public/maps/eeman-bank.json`, `tests/client/scene-queue.test.ts`.

**Interfaces:**
- Consumes: `SceneApi` type (Task 4).
- Produces: `mountScene(el: HTMLElement, mapName: string, character: { name: string; head: string }): Promise<SceneApi & { destroy(): void }>`.
- Character: a LimeZu (or placeholder) body with a **photo head**. The image loads from `assets/heads/<head>`, is cropped and downscaled to a pixel-art head size, and is drawn above the body so it follows walk animations. If the file is missing, a placeholder head (coloured head with the initial) is used. Add `assets/heads/` to `.gitignore`.
- Maps have an object layer `spots` with named points, plus a collision layer for easystarjs.

- [ ] Placeholder maps containing only what the owner described:
  - bar: entrance, bar counter with stools, tables (`bord`), toilet
  - house: soverom, stue, kjokken, bad
  - bank: entrance, counter
- [ ] Load LimeZu tiles from `assets/limezu/` when present, otherwise fall back to the placeholder art.
- [ ] Review Focus 5 test on the action queue (pure logic, no Phaser): 50 queued `walkTo`/`play` calls collapse so the character ends at the last target, and nothing awaits the animation.
- [ ] Labels above objects (cage names) and wandering entities (loose snakes).
- [ ] Test (pure logic): `resolveHead('homayoon.png')` returns the photo when present and the placeholder spec (colour + initial "H") when missing.
- [ ] Done when the preview mode shows the character walking between rooms. Commit.

### Task 6: Task 1, Homayoon Bar

**Goal:** Oppgave 1, playable end to end in preview mode on all three OSes.

**Files:** `src/tasks/homayoon-bar.ts`, `tests/tasks/homayoon-bar.test.ts`.

- [ ] Tests (`runTaskScript`, each in all three modes):
  - `ls` at start shows `bar bord toalett` and no `tiss`
  - `cd bar; kjop-hiroshima` makes drinks = 1 and step 1 done
  - `kjop-hiroshima` in `bord` is "command not found"
  - after the first drink, `tiss` is listed in `~`, `bar`, `bord` and `toalett`
  - `tiss` in `toalett` gives the correct ending
  - `tiss` at the entrance, bar or tables gives the matching funny ending
  - the hint sequence follows spec §10
  - Review Focus 5: `kjop-hiroshima` 50× gives drinks = 50 exactly
- [ ] Implement it, with Norwegian texts from spec §10 (ending texts are placeholders).
- [ ] Done when tests pass and a manual preview run reaches the toilet ending. Commit.

### Task 7: Server session, student flow and admin page

**Goal:** The live classroom loop: join → pick OS → wait → task → ending, with the admin table and "Start neste oppgave".

**Files:** `src/shared/protocol.ts`, `src/server/session.ts`, `src/server/index.ts` (extend), `src/client/net.ts`, `src/client/screens/{join,pick-os,waiting,task,ending}.ts`, `src/client/admin/admin.ts`, `admin.html`, `src/client/styles.css`, `tests/server/session.test.ts`, `tests/e2e/smoke.spec.ts`.

**Interfaces (produces):**
- `ClientMsg = { type: 'hello'; clientId; name; os } | { type: 'progress'; taskId; stepsDone; stats } | { type: 'ended'; taskId; endingId; correct; stats }`
- `ServerMsg = { type: 'task'; taskId: string | null; myResult?: { endingId; correct; stats } } | { type: 'reset' }`
- `AdminMsg = { type: 'auth'; password } | { type: 'startNext' } | { type: 'newSession' }`
- `AdminServerMsg = { type: 'state'; currentTaskId; tasks: { taskId; rows: Row[] }[] } | { type: 'authFailed' }`
- `Row = { clientId; name; os; status: 'venter' | 'jobber' | 'ferdig'; endingId?; stats }`
- `class Session`: `constructor(dataDir)`, `join`, `progress`, `end` (first ending wins), `startNext()`, `reset()`, `snapshot()`. Persisted to `DATA_DIR/session.json` on every change, with writes debounced.

- [ ] Session tests:
  - first ending wins
  - `startNext` walks `taskOrder`
  - `reset` clears everything
  - a restored snapshot equals the pre-restart state (Review Focus 3)
  - same name with different clientIds gives two rows; the same clientId twice gives one row (Review Focus 4)
  - a non-admin socket sending `startNext` is ignored
- [ ] Student screens, with the name and OS saved in `localStorage` (read and write inside try/catch). Waiting screen: "Venter på at oppgaven starter…". A reload after an ending shows the ending screen again. A reload mid-task restarts the task. An incoming `task` message switches tasks immediately, even mid-task.
- [ ] Admin page at `/admin`:
  - password login
  - current task and a counter like "22 / 30 ferdig"
  - one table per started task, with columns navn / terminal / status / slutt plus the task's stats
  - "Start neste oppgave"
  - "Ny økt" (with confirm)
- [ ] The net client reconnects with backoff and re-sends `hello`.
- [ ] Playwright smoke test: admin logs in and starts task 1; two students join (mac and windows) and play to the toilet and entrance endings; the admin table shows both endings.
- [ ] Done when tests pass. Commit.

### Task 8: Task 2, Aleksander's python (venv)

**Goal:** Oppgave 2 with real-looking venv commands and the cage/snake scene.

**Files:** `src/shell/commands/python.ts` (`python`/`python3 -m venv <name>`), `src/shell/commands/venv.ts` (`source`/`.`/`Activate.ps1`, `deactivate`), `src/shell/commands/pip.ts`, `src/tasks/aleksander-python.ts`, `tests/shell/venv.test.ts`, `tests/tasks/aleksander-python.test.ts`.

- [ ] Shell tests, per mode:
  - `python -m venv .venv` creates `.venv/bin/activate` (`.venv\Scripts\Activate.ps1` on windows)
  - activating sets `env.venv` and the prompt gets a `(.venv)` prefix
  - `deactivate` removes the prefix
  - `pip install` output looks like real pip
  - re-running venv for an existing name creates nothing
- [ ] Task tests:
  - `ls` shows cages even when dot-named (force-visible)
  - pip with no active cage gives a loose snake
  - pip with an active cage puts the snake in that cage, even after `cd` to another room
  - two cages with ≥1 snake each gives the correct ending
  - each of the three "over 10" death endings is reached at 11
  - hints follow spec §10b
- [ ] Scene: a labelled cage appears in its room, snakes sit in a cage or wander, all via `SceneApi`.
- [ ] Done when tests pass and a preview run works. Commit.

### Task 9: Task 3, Eeman in the bank (sudo)

**Goal:** Oppgave 3 with `sudo`, a hidden password prompt and permission-gated scripts.

**Files:** `src/shell/commands/sudo.ts`, `src/tasks/eeman-bank.ts`, `tests/shell/sudo.test.ts`, `tests/tasks/eeman-bank.test.ts`.

- [ ] Shell tests, per mode:
  - a script with `requiresSudo` fails without sudo, with a realistic English permission error
  - `sudo <script>` prompts `[sudo] password for <user>:` (PowerShell: Windows sudo style) with hidden input
  - a wrong password gives the real "Sorry, try again." behaviour
  - the right password runs the script; `sudo` on an unknown command gives the real error
- [ ] Task: scripts in the bank (`spor-om-penger`, `skrik-gi-meg-penger`, a legitimate withdrawal flow, plus one or two more of the builder's choice). The password is shown in the task text. Endings: legitimate withdrawal (correct), robbery, plus any extras. Without sudo, the task window shows the Norwegian consequence (everyone laughs).
- [ ] Task tests: both main endings are reachable in all modes, and the non-sudo attempt doesn't end the task.
- [ ] Done when tests pass. Add the task to `registry.ts`. Commit.

### Task 10: Load test, authoring guide, final check

**Goal:** Prove the 30-student requirement and make adding tasks easy for the next person.

**Files:** `scripts/loadtest.ts`, `docs/writing-tasks.md`, `README.md` (final).

- [ ] `loadtest.ts`: 60 simulated WS clients join, receive the task, send progress and endings, while one admin client watches. Measure the time from admin `startNext` until all clients receive it, and from a client's `ended` until it appears on the admin client. Pass when p95 < 200 ms on a laptop.
- [ ] `docs/writing-tasks.md`: a walk-through of `homayoon-bar.ts` covering tree, scripts, state, steps, endings, hints, map spots, preview mode and `runTaskScript` tests.
- [ ] README: run locally, Docker, IDUN/proxy notes, where to put LimeZu files and head photos, `ADMIN_PASSWORD`.
- [ ] Final: the full test suite, the Playwright smoke test and a manual run-through of all three tasks in all three modes. Commit.

---

## Self-review notes

- **Spec coverage:**
  - §6 student flow → T7
  - §7 terminal → T2, T3, T8, T9
  - §8 scene → T5
  - §9 authoring → T4, T10
  - §10/10b/10c → T6, T8, T9
  - §11 admin → T7
  - §12 hosting → T1, T10
  - §12b order → task order (T1 first for the IDUN test)
- **Kept broad by request:** internals, CSS and exact Norwegian copy are left to the implementer, within the Global Constraints and the spec.
