# Scenes, doors and the bank robbery: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The scene fills its window, each level gets the room-to-room navigation the owner specified, the bar and bank get customers, and the bank becomes a robbery with a safe, a code, dynamite, police and money-based endings.

**Architecture:** Navigation that is not a tree (house, bank, the bar's "inngang") uses **doors**: link entries in the VFS that `ls` shows as folders and that `cd` follows *physically*, so `cwd` is always the real room (`~/kjokken`, never `~/soverom/kjokken`), and `cd ..` goes to the real parent. Tasks declare doors next to `tree`, with the same "exists only while visible" rule as scripts. Everything else is task-definition, map-generator and scene work on top of that.

**Tech Stack:** TypeScript, Vitest, Phaser 3, Playwright, the existing map generators (`scripts/make-limezu-maps.ts`, `scripts/make-maps.ts`).

**Spec:** the owner's request of 2026-10-19 (quoted in the session; the essentials are copied into each task below). Base spec: `docs/superpowers/specs/2026-10-18-terminal-learning-site-design.md`.

## Global Constraints

- Command and folder names stay ASCII, like the existing ones (`kjop-hiroshima`, `kjokken`, `spor-om-penger`): **`bar-omrade`**, **`apne-safe`**, **`snakk-med-gammel-mann`**. The owner's "åpne safe 1962" is typed `apne-safe 1962`.
- Exact copy: the old man says **«Jeg husker da dette stedet åpnet i 1962.»** The safe code is **1962**.
- All three OS modes (`MODES` in `tests/shell/helpers.ts`) must pass every task test.
- Texts are Norwegian placeholders the owner edits later; amounts are constants at the top of `eeman-bank.ts`.
- `aleksander-python.ts` and `src/server/index.ts` now use the owner's formatting (double quotes, no semicolons). Keep that style in those files; don't reformat them back.
- Regenerate maps with the scripts, never by hand. The house map content is unchanged by the owner's edit (only reformatted), so regenerating it is safe.

## Review Focus

1. **`cd ..` after walking through a door.** Reach `kjokken` from `soverom`, then `cd ..`: expect `stue` (the real parent) and a prompt showing `~/kjokken` before that, never a growing path. Covered in Task 2.
2. **A cage made in a room reached through a door.** `python -m venv .venv` in `kjokken` (reached via `soverom`) must key the cage `kjokken/.venv` and spawn it at the `kjokken` spot. Covered in Task 4.
3. **`cd safe` before the robbery.** Must fail like any missing folder; after `sudo skrik-gi-meg-penger` it works from every bank room. Covered in Task 6.
4. **Windows paths and Tab.** `cd ..\kjokken`, `cd ~\bad`, Tab-completing a door name, and `ls` showing doors as `d----` directories. Covered in Task 2.
5. **Repeated or late actions during a robbery.** A second `sudo skrik-gi-meg-penger`, wrong codes in a row, or `ta-ut-penger` mid-robbery must never fire a second ending; the first ending is final. Covered in Task 6.

---

### Task 0: Save the owner's pending changes

- [ ] Show the owner `git status` (modified: `public/maps/aleksander-house.json`, `src/server/index.ts`, `src/tasks/aleksander-python.ts`, all reformatting plus a new Aleksander intro). With their OK, commit them as `chore: owner formatting and Aleksander intro` so later diffs stay readable.
- [ ] Done when: `git status` is clean and `npm test` passes.

### Task 1: The scene fills its window

**Root cause:** `scene-view.ts:384` picks the largest *whole-number* zoom for the *whole* map (20×14 tiles = 320×224 px, including empty ceiling tiles round the edges). In a task window at most 440 px tall (`styles.css`, `.task-window`), that gives zoom 1 or 2, so a small map sits in a big dark box.

**Files:**
- Modify: `src/client/scene/map-data.ts` (content bounds), `src/client/scene/scene-view.ts` (fit), `src/client/styles.css` (`.task-window` height)
- Test: `tests/client/scene-fit.test.ts` (new), `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Produces: `contentBounds(data: MapData): Rect` (tiles; the bounding box of non-empty tiles over all tile layers, plus a 1-tile margin, clamped to the map) and `fitView(host: { w: number; h: number }, bounds: Rect, tile: number): { zoom: number; scrollX: number; scrollY: number }`.

- [ ] Write `scene-fit.test.ts`: bounds of each real map exclude the empty outer ring (e.g. the house content starts at column ≥ 0 and is narrower than 20 tiles when the edge columns are empty); `fitView` returns the largest zoom at which the bounds fit (fractions allowed, minimum 1) and centres the bounds in the host.
- [ ] Implement both. The canvas becomes the host's full size (`game.scale.resize(el.clientWidth, el.clientHeight)`), the camera zooms to `fitView(...).zoom` and centres on the bounds. Fractional zoom is the deliberate trade-off: keep `pixelArt: true` and set `roundPixels` so tiles stay sharp; at the zooms this produces (≥3) uneven pixels are not visible.
- [ ] Give the scene more room: `.task-window` height to `clamp(280px, min(60vh, calc(100vh - 330px)), 680px)`. The terminal keeps its `min-height: 270px` (10 Ubuntu rows).
- [ ] Extend the smoke test: at 1440×900 and 1920×1080, for each level the drawn map content covers ≥ 85 % of the scene's width or height (read the camera zoom and bounds via `page.evaluate`, or compare canvas size to the bounds × zoom).
- [ ] Done when: unit + e2e tests pass and a screenshot of each level shows the rooms filling the scene card. Commit `fix: scene fits and fills its window`.

### Task 2: Doors (VFS links that `cd` follows physically)

**Files:**
- Modify: `src/shell/vfs.ts`, `src/shell/engine.ts` (`resolve`), `src/tasks/api.ts`, `src/tasks/runtime.ts`, `docs/writing-tasks.md` (one short section)
- Test: `tests/shell/vfs.test.ts`, `tests/tasks/runtime.test.ts`

**Interfaces:**
- Produces in `Vfs`: `link(dir: string, name: string, target: string): void` (a node that is a directory to `list`/`stat`/`find`, plus a `target` POSIX path); `stat()` gains `target?: string`. Traversal in `get()` jumps to the target when it passes through a link; `remove()` removes the link itself, never the target. Any recursive walker must not follow links.
- Produces in `Shell.resolve`: when a segment is a link, the stack is replaced by the target's segments, so the returned `path` (and so `cwd`) is physical. `ls` and Tab need no change because links stat as `dir`.
- Produces in `api.ts`:
  ```ts
  export interface DoorDef<S> {
    /** Name shown in ls, e.g. "inngang". */
    name: string;
    /** Folders (relative to the root) the door stands in. */
    from: string[];
    /** Folder it leads to, relative to the root ("." is the entrance). */
    to: string;
    /** Omit for always there. A hidden door does not exist. */
    visibleWhen?(s: S): boolean;
  }
  ```
  `TaskDefinition` gains `doors?: DoorDef<S>[]` and `hiddenFolders?: string[]` (real folders hidden from plain `ls`, via `vfs.setHidden`). `TaskCtx` gains `args: string[]` (the script's arguments; `[]` outside a script).
- Produces in `runtime.ts`: `syncScripts()` also syncs doors (add/remove links to match `visibleWhen`), and `runScript` passes `call.args` into the ctx.

- [ ] Tests (runtime test uses a small inline task with a 4-room cycle like the house): `ls` in a room lists its doors as folders; `cd` through a door makes `pwd` the physical path; `cd ..` right after goes to the physical parent (Review Focus 1); a door whose `visibleWhen` is false is "No such file or directory" and appears once the state flips; a script sees `ctx.args` (`foo 1962` → `['1962']`); Windows mode: `cd ..\kjokken`, `cd ~\bad`, Tab completes a door name, `ls` shows it as `d----` (Review Focus 4). Vfs test: removing a link keeps its target.
- [ ] Implement; run `npm test` and `npm run typecheck`.
- [ ] Done when: green. Commit `feat: doors between rooms`.

### Task 3: Homayoon Bar navigation and customers

**Navigation (owner's spec):** entrance → `bar-omrade` or `bord` (the table by the entrance). `bar-omrade` → `inngang`, `bar`, `sofakrok`, `toalettet`, `bord` (a table below the bar). `bar` and `toalettet` lead back only with `cd ..`.

**Files:**
- Modify: `src/tasks/homayoon-bar.ts`, `scripts/make-limezu-maps.ts` (`bar()`), `scripts/make-maps.ts` (placeholder bar), regenerated `public/maps/homayoon-bar*.json`, `src/client/scene/scene-view.ts` (NPC idle life), `scripts/loadtest.ts`, `tests/e2e/smoke.spec.ts`, `src/client/dev/terminal-dev.ts` if it scripts the bar
- Test: `tests/tasks/homayoon-bar.test.ts`, `tests/client/maps.test.ts`, `tests/tasks/runtime.test.ts` (its walk test uses the bar)

**Interfaces:**
- Consumes: `DoorDef`, `TaskDefinition.doors` (Task 2).
- Task data: `tree: { 'bar-omrade': { bar: {}, sofakrok: {}, toalettet: {}, bord: {} }, bord: {} }`; `doors: [{ name: 'inngang', from: ['bar-omrade'], to: '.' }]`; `kjop-hiroshima` in `bar-omrade/bar`.
- Spots: `'.' → inngang`, `bord → bord-inngang`, `bar-omrade → bar-omrade`, `bar-omrade/bar → bar`, `bar-omrade/sofakrok → sofakrok`, `bar-omrade/toalettet → toalett`, `bar-omrade/bord → bord`.

- [ ] Tests: `ls` at the entrance shows exactly `bar-omrade bord`; in `bar-omrade` exactly `bar bord inngang sofakrok toalettet` (+ `tiss` once unlocked); `ls` in `bar` and `toalettet` shows no folders; the full happy path (`cd bar-omrade`, `cd bar`, `kjop-hiroshima`, `cd ..`, `cd toalettet`, `tiss`) ends `toalett` correct; `cd inngang` from `bar-omrade` walks to the `inngang` spot; tiss in `sofakrok`, `bar-omrade`, either `bord` gives its own wrong ending (add short placeholder texts); hints point the new way (`cd bar-omrade` first). Maps test: `REQUIRED` gets the seven spot names, all walkable and mutually reachable, in both the LimeZu and placeholder maps.
- [ ] Map: add the new spots on walkable floor (`bar-omrade` in the open floor in front of the counter, `bord-inngang` by the right-wall tables, `sofakrok` by the couch corner, `bord` by the bottom tables). Add 3–4 customers as `sprites` (LimeZu bodies `Adam`, `Amelia`, `Alex`; seated at tables and on the sofa side, one at the counter), off every spot tile.
- [ ] NPC life (shared with Task 5): body sprites from the `sprites` layer turn to a random facing every 3–7 s (random per NPC, using the existing idle-sheet frames). No walking NPCs.
- [ ] Update the smoke test and load test command sequences to the new path.
- [ ] Done when: `npm test`, `npm run typecheck`, `npm run e2e` pass, and a screenshot shows the customers. Commit `feat: bar rooms and customers`.

### Task 4: Aleksander's house as a ring of rooms

**Navigation (owner's spec):** start in `stue` → `bad`, `soverom`. `soverom` → `kjokken`, `stue`. `kjokken` → `bad`, `soverom`. `bad` → `stue`, `kjokken` (implied by "each corner reaches its neighbours").

**Files:**
- Modify: `src/tasks/aleksander-python.ts` (owner's formatting), `tests/shell/helpers.ts` / `tests/shell/nav.test.ts` only if they use the house tree
- Test: `tests/tasks/aleksander-python.test.ts`

**Interfaces:**
- Task data: the root is `stue`. `tree: { soverom: {}, kjokken: {}, bad: {} }` (drop the `stue` folder and its `SPOTS` key); `hiddenFolders: ['kjokken']` so `ls` in `stue` shows only `bad soverom`; doors `{ name: 'stue', from: ['soverom', 'bad'], to: '.' }`, `{ name: 'kjokken', from: ['soverom', 'bad'], to: 'kjokken' }`, `{ name: 'soverom', from: ['kjokken'], to: 'soverom' }`, `{ name: 'bad', from: ['kjokken'], to: 'bad' }`. The map already has all four spots and areas.

- [ ] Tests: `ls` in each room shows exactly the listed neighbours; walking the ring `stue → soverom → kjokken → bad → stue` ends with `pwd` = home and the scene walked to each spot in turn; a cage made in `kjokken` reached via `soverom` is keyed `kjokken/.venv` and spawned at `kjokken` (Review Focus 2); the existing snake/venv tests still pass with the new paths (fix any that used `cd stue`).
- [ ] Implement; update hints that mention `stue` as a folder.
- [ ] Done when: green. Commit `feat: house rooms connect in a ring`.

### Task 5: Eeman's bank rooms, customers and the old man

**Navigation (owner's spec):** `inngang` → `sofa`, `skranke`, `plante`. Each of those → the other two and `inngang`. (`safe` comes in Task 6.)

**Files:**
- Modify: `src/tasks/eeman-bank.ts`, `scripts/make-limezu-maps.ts` (`bank()`), `scripts/make-maps.ts` (placeholder bank), regenerated `public/maps/eeman-bank*.json`
- Test: `tests/tasks/eeman-bank.test.ts`, `tests/client/maps.test.ts`

**Interfaces:**
- Task data: `tree: { sofa: {}, skranke: {}, plante: {} }`; doors: for each of the three rooms, one door per other room plus `{ name: 'inngang', to: '.' }`. Spots: `'.' → inngang`, `sofa`, `skranke`, `plante`, `safe` (the safe spot is used in Task 6).
- Scripts: `spor-om-penger`, `ta-ut-penger`, `bestikk-kassereren` move to `dir: 'skranke'` (they no longer call `walkTo('skranke')`; being there is the point). `vis-saldo` stays at the entrance (an ATM). New `snakk-med-gammel-mann` in `dir: 'sofa'`: `say` and `feedback` the exact line «Jeg husker da dette stedet åpnet i 1962.», sets `state.heardYear = true`.

- [ ] Tests: `ls` per room shows exactly its doors and scripts; the three teller scripts are "command not found" outside `skranke` and work inside it; `snakk-med-gammel-mann` exists only in `sofa` and produces the exact line; rewrite the existing tests that ran teller scripts from the entrance to `cd skranke` first. Maps test: `inngang skranke sofa plante safe` walkable and reachable (the safe is behind the counter, reached via the open column at x = 14).
- [ ] Map: add the spots (`sofa` in front of the waiting sofa, `plante` by the right plant, `safe` next to the grey cabinet on the staff side). Add the old man as a `Bob` sprite by the sofa, and 2–3 customers in the lobby (one queuing at the counter, one by the plant), off spot tiles. NPC turning comes from Task 3.
- [ ] Done when: green. Commit `feat: bank rooms, customers and the old man`.

### Task 6: The robbery, the safe, the police and money endings

**Owner's spec:** `sudo skrik-gi-meg-penger` starts a robbery (no longer an ending). During a robbery: a `safe` door appears in every room; `ring-politiet` exists only then, and `sudo ring-politiet` gets Eeman arrested (new ending). In `safe`: `apne-safe 1962` opens it; `sudo apne-safe` blows it up with dynamite and some money is lost. Every ending tells the admin how much money Eeman got.

**Files:**
- Modify: `src/tasks/eeman-bank.ts`, `src/client/admin/admin.ts` (number formatting)
- Test: `tests/tasks/eeman-bank.test.ts`, `tests/client/admin-summary.test.ts` if it covers stat cells

**Interfaces:**
- Consumes: `ctx.args`, `DoorDef.visibleWhen` (Task 2); scene effects `robber`, `dynamite`, `police` (Task 7; until then they are unknown effects the scene ignores).
- State adds: `robbing: boolean`, `heardYear: boolean`, `money: number`, `opened: 'kode' | 'dynamitt' | null`, `arrested: boolean` (replaces `robbed`).
- Constants: `SALDO = 1_000`, `SAFE = 2_000_000`, `DYNAMITE_KEEPS = 1_400_000`.
- `skrik-gi-meg-penger`: in `['.', 'sofa', 'skranke', 'plante']`, visible while `!robbing`. With sudo: `robbing = true`, creates the `safe` folder under home (`ctx.vfs.mkdir`), `play('robber')`, says «GI MEG PENGENE!». Without sudo: unchanged (everyone laughs).
- Doors: `{ name: 'safe', from: ['sofa', 'skranke', 'plante'], to: 'safe', visibleWhen: (s) => s.robbing }`. From `safe` only `cd ..` (to the entrance).
- `ring-politiet`: in every room including `safe`, visible while `robbing`, `requiresSudo`. Sudo: `arrested = true`, `play('police')`. Denied: feedback that Eeman's hands shake too much to dial.
- `apne-safe`: in `safe`, visible while `robbing`. Sudo (whatever the args): `opened = 'dynamitt'`, `money = DYNAMITE_KEEPS`, `play('dynamite')`. No sudo, `args[0] === '1962'`: `opened = 'kode'`, `money = SAFE`, `play('cash')`. No code: prints `apne-safe: safen er låst. Bruk: apne-safe <kode>`. Wrong code: prints `apne-safe: feil kode`.
- `ta-ut-penger` sets `money = SALDO`.
- Endings (ids, `correct`, money): `uttak` ✓ 1 000; `bestikkelse` ✗ 0; `ran-kode` ✗ 2 000 000; `ran-dynamitt` ✗ 1 400 000; `arrestert` ✗ 0. Each text ends with the amount, e.g. «Eeman fikk med seg 2 000 000 kr.»
- `stats: (s) => ({ latter: s.laughs, kroner: s.money })` (the admin table already shows each stat as a column). In `admin.ts` format numeric cells with `toLocaleString('nb-NO')`.
- Hints during a robbery: in a room, point to `cd safe`; in `safe` without the code, point to the code ("Kanskje noen i banken husker når den åpnet? Eller bruk makt med `sudo`."); after `heardYear`, point to `apne-safe 1962`.

- [ ] Tests: `cd safe` fails before the robbery and works from each room after it (Review Focus 3); `ls` in `safe` shows `apne-safe ring-politiet` and no folders, and `cd ..` lands at the entrance; `ring-politiet` is "command not found" before the robbery; each ending fires with its id, `correct` flag and `stats.kroner` (1000 / 0 / 2000000 / 1400000 / 0); `sudo apne-safe 1962` still uses dynamite; wrong code and no code print their lines without ending; scene calls include `play robber`, `play dynamite`, `play police` at the right moments; a second `sudo skrik-gi-meg-penger` is "command not found", repeated wrong codes and `sudo ta-ut-penger` mid-robbery fire at most one ending, the first ending is final (Review Focus 5); the full code path `sudo skrik…`, `cd sofa`, `snakk-med-gammel-mann`, `cd safe`, `apne-safe 1962` ends `ran-kode`.
- [ ] Implement; update the intro/steps text if they still say the robbery ends the task.
- [ ] Done when: green. Commit `feat: bank robbery with safe, police and money endings`.

### Task 7: Robber look and the new effects in the scene

**Files:**
- Modify: `src/client/scene/scene-view.ts` (`EFFECTS`, effect playback, hero container), `src/client/scene/placeholder-art.ts` (generated textures)
- Test: `tests/e2e/smoke.spec.ts` (or a scene unit test if the effect logic is pure)

**Interfaces:**
- Consumes: `play('robber' | 'dynamite' | 'police')` from Task 6.
- `robber` is persistent: adds a generated pixel ski mask over the head (photo head or LimeZu head alike) and a small pistol at the hand to the hero container, so both move with Eeman for the rest of the level. `dynamite`: a short flash and smoke burst at the hero. `police`: red/blue flashing over the scene for ~2 s. Textures are generated in code like the existing effects; no new art files.

- [ ] Smoke test: in the bank, after `sudo skrik-gi-meg-penger` + password, the hero container has the mask and gun children (check via `page.evaluate` on the scene), and they are still there after a `cd`.
- [ ] Implement; take a screenshot of the masked Eeman for the owner.
- [ ] Done when: `npm test`, `npm run typecheck`, `npm run e2e` pass. Commit `feat: robber look, dynamite and police effects`.

### Final check

- [ ] `npm test && npm run typecheck && npm run build && npm run e2e`, then play each level by hand in one OS mode and screenshot it. Note anything deferred in the review section of this plan.
