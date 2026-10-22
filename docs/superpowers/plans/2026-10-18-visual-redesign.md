# Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Granularity note:** the owner wants broad plans. Each task gives its goal, files, interfaces, the tests that prove it and a done-check. Implementers choose the internals. Commit at the end of each task.

**Goal:** Replace the unstyled placeholder UI with the approved design: a polished task screen with a detailed task panel, terminal windows that look like the real macOS Terminal, Ubuntu GNOME Terminal and Windows Terminal, restyled student screens, and a clearer admin dashboard with the same core. Then rebuild the three levels with the owner's LimeZu art.

**Architecture:** Tasks 1–5 are visual only. Shell, task runtime, server and protocol stay as they are. The screens in `src/client/screens/` and `src/client/admin/admin.ts` build richer DOM, `styles.css` holds every visual rule through CSS custom properties, and a new window-chrome module draws the OS frame around xterm. Tasks 6–8 change the scene: LimeZu tilesets and characters, a script that generates three Tiled maps from declarative layouts, and the placeholder maps kept as a fallback for when the art is missing. Small pure helpers are unit-tested. Everything else is checked with Playwright screenshots.

**Tech Stack:** TypeScript, Vite, @xterm/xterm 6 + `@xterm/addon-fit`, self-hosted fonts via `@fontsource` packages, Vitest, Playwright.

**Spec:** the design canvas https://claude.ai/artifact/4tHPZ7PoUMoJXyNnKtsJWb (artboards: Oppgaveskjerm, the three terminal windows, Oppgavepanel: tilstander, Elev-flyt, Admin, Admin-innlogging, and the level suggestions Bane 1–3). The level layouts were composed from the real LimeZu tiles by `compose.py` (kept with the canvas work; Task 7 ports its layouts). The values below are copied from it so the plan can be followed without opening it. Base spec: `docs/superpowers/specs/2026-10-18-terminal-learning-site-design.md`.

## Global Constraints

- All UI text stays **Norwegian**; everything inside the terminal stays **English**. Don't change task texts, hints or endings.
- Layout order is fixed: **task window (scene + task panel) on top, terminal below**.
- Logic files don't change behaviour. `src/shell/`, `src/tasks/`, `src/server/` and `src/shared/` are off limits, except: the new pure function in `src/shell/modes.ts` (Task 2), and the optional `character.body` data field in `src/tasks/api.ts` plus one line per task file (Task 6).
- **LimeZu art** (free “Modern Interiors”, in the git-ignored `assets/limezu/`) is licensed for **non-commercial use only** and is **never committed** or baked into the Docker image. The map JSON files (tile indices only) are committed. Without the art, every level must still work with the placeholder maps.
- Level content follows what the owner confirmed. Bar: entrance, bar with stools, tables, toilet, no dance floor. Bank: entrance, counter, cashier. House: placeholder rooms soverom/stue/kjokken/bad. Anything else in the canvas suggestions is decoration the owner can remove. Spot names in `spots` objects stay exactly the same, because the task files use them.
- Fonts are **bundled** (npm `@fontsource*`), never loaded from Google at runtime. The school network may block it.
- The Windows look is **Windows Terminal with the Windows PowerShell profile, Campbell scheme (black)**, not the old blue console. (Owner decision, 2026-10-18.)
- The admin keeps its core: password login, “Start neste oppgave”, “Ny økt” with confirm, one table per task with name, terminal, status, ending and stats columns.
- The texts the e2e test looks for stay the same or the test changes in the same commit: `Navnet ditt`, `Neste`, OS buttons named exactly `macOS`/`Linux`/`Windows`, `Venter på at oppgaven starter…`, heading `Oppgave 1: Homayoon Bar`, `Venter på neste oppgave…`, `Passord`, `Logg inn`, `Ingen oppgave startet`, `N elever har koblet til`, `N / M ferdig`, `Start neste oppgave…`.
- Touch targets ≥ 44 px, text contrast ≥ 4.5:1, real `<button>`/`<input>`/`<label>`, visible focus ring.
- Light theme only (classroom projectors).

### Design tokens (from the canvas)

| token | value | use |
| --- | --- | --- |
| `--ground` | `#F2F0EB` | page background |
| `--surface` | `#FFFFFF` | cards |
| `--surface-2` | `#F8F7F4` | table header, subtle fills |
| `--line` | `#E2DFD8` | card borders |
| `--ink` | `#17191E` | text, dark buttons, command chips |
| `--ink-2` | `#4A4F5C` | secondary text, eyebrows |
| `--accent` / `--accent-soft` | `#2251C9` / `#E8EEFC` | primary action, current step, feedback box (text `#1A3A8F`) |
| `--ok` / `--ok-soft` | `#1D7A46` / `#E5F3EA` | done steps, correct ending (text `#14532F`) |
| `--bad` / `--bad-soft` | `#B23B22` / `#FCEDE6` | wrong ending, danger (text `#7A2712`) |
| `--hint` / `--hint-soft` | `#6E4700` / `#FFF6E0` | hint box (border `#E8D7AE`) |

Type: display **Bricolage Grotesque** 700 (titles), body **IBM Plex Sans** 400/500/600, code chips **IBM Plex Mono**. Eyebrows: 12 px, 600, uppercase, `letter-spacing: .08em`, `--ink-2`. Radii: cards 14 px, controls 10 px, chips 6 px. Card shadow only on the scene card and terminal window.

### Terminal windows (from the canvas)

| | macOS Terminal (Basic) | Ubuntu GNOME Terminal | Windows Terminal |
| --- | --- | --- | --- |
| frame | radius 10, title bar 28 px `#ECEBEB`, bottom border `#D4D3D3`, traffic lights 12 px `#FF5F57` `#FEBC2E` `#28C840` at left, gap 8 | radius 12, header bar 46 px `#303030`, `+` at left, title centred (Ubuntu 500, 14 px, white), search + menu icons, then three 24 px round `#4A4A4A` buttons (min, max, close) | radius 8, tab row 40 px `#202020`, active tab `#0C0C0C` (radius 8 8 0 0, 220 px) with blue `>_` icon, “Windows PowerShell”, ×; then `+` and `⌄`; caption buttons 46×40 (─ ☐ ✕) at right |
| title | `<cwd basename or user at home> — -zsh — <cols>×<rows>` | `<user>@<host>: <prompt dir>` | `Windows PowerShell` (fixed) |
| body | `#FFFFFF`, fg `#000000`, Menlo 13 px, block cursor `#7F7F7F`, no blink | `#300A24`, fg `#EEEEEC`, Ubuntu Mono 16 px, Tango palette, block cursor, blink | `#0C0C0C`, fg `#CCCCCC`, Cascadia Mono 14 px (fallback Consolas), Campbell palette, bar cursor, blink |

Campbell: black `#0C0C0C` red `#C50F1F` green `#13A10E` yellow `#C19C00` blue `#0037DA` magenta `#881798` cyan `#3A96DD` white `#CCCCCC`, bright: `#767676` `#E74856` `#16C60C` `#F9F1A5` `#3B78FF` `#B4009E` `#61D6D6` `#F2F2F2`.
Tango (GNOME): black `#2E3436` red `#CC0000` green `#4E9A06` yellow `#C4A000` blue `#3465A4` magenta `#75507B` cyan `#06989A` white `#D3D7CF`, bright: `#555753` `#EF2929` `#8AE234` `#FCE94F` `#729FCF` `#AD7FA8` `#34E2E2` `#EEEEEC`.

The chrome is decoration: its buttons are `aria-hidden` spans, not controls.

## Review Focus

1. **Fonts that load after xterm opens.** xterm measures the cell size when it opens. If Ubuntu Mono arrives later, letters overlap and the cursor drifts. Expected: the terminal looks right on the first paint, even on a cold cache. Owner: Task 2 (wait for the font before `open`, refit on `document.fonts` load).
2. **Resizing while typing.** Window resize or the task panel wrapping changes the column count mid-line. Expected: a long half-typed command stays intact and editable, with the cursor in the right place. Owner: Task 2 (manual Playwright check: type 120 chars, resize 1440→1024, keep typing, submit).
3. **Laptop screens.** Most students have 1366×768 or 1440×900 screens. Expected: scene, task panel and a usable terminal (≥ 10 rows) all fit without page scroll at 1366×768. Below ~1000 px wide the panel stacks under the scene and the page scrolls. Owner: Task 3, checked in Task 9.
4. **Deployed without the art.** The Docker image never contains `assets/limezu/`. If the volume isn't mounted, or one tileset file is renamed, the level must not render garbage tiles or a black box. Expected: that level silently uses its placeholder map, logs one warning, and the task still plays. Owner: Task 6 (test the fallback choice) and Task 7 (keep the placeholder maps).
5. **Many cages in one room.** Task 2 lets a student make 10+ cages in one room, and today they pile up on one tile with a few pixels of jitter. With real art, that becomes an unreadable heap and may cover the character. Expected: each new cage takes the next free floor tile in that room, and the name labels stay readable. Owner: Task 8.

Also covered inside their tasks: long names and long task text (Tasks 3 and 5), and keeping expanded admin sections open across re-renders (Task 5).

---

### Task 1: Foundations (tokens, fonts, base styles)

**Goal:** Every page gets the design's fonts, colour tokens and base element styles. The old placeholder rules go.

**Files:**
- Modify: `package.json` (add `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`, `@fontsource-variable/bricolage-grotesque`, `@fontsource/ubuntu`, `@fontsource/ubuntu-mono`; verify the exact names on npm), `src/client/styles.css` (rewrite: `:root` tokens, base body/button/input/focus/code styles, utility classes `.eyebrow`, `.card`, `.chip`, `.btn` + `.btn-primary`/`.btn-dark`/`.btn-danger`/`.btn-link`, `.visually-hidden`), `index.html` and `admin.html` (inline SVG `>_` favicon so `/favicon.ico` stops returning 404).
- Create: `src/client/fonts.ts`, which imports the `@fontsource` CSS (only the weights listed under Design tokens) and is imported by `main.ts` and `admin/admin.ts`.

**Done-check:** `npm run build` succeeds. Both pages render in Plex Sans on the `--ground` background with no console errors. The built `dist/` contains the font files, and no request goes to fonts.googleapis.com.

- [ ] Implement, build, check in the browser, commit (`style: design tokens, bundled fonts, base styles`).

### Task 2: Terminal windows

**Goal:** The terminal sits inside a realistic OS window frame, fills its frame and resizes with it. Colours, fonts and cursor match the table above.

**Files:**
- Modify: `src/shell/modes.ts` (add the pure function below), `src/client/terminal/themes.ts` (Campbell for windows, full Tango for linux, cursor style and blink per mode), `src/client/terminal/xterm-shell.ts` (fit addon, ResizeObserver, font wait, title callback), `src/client/dev/terminal.html` + `terminal-dev.ts` (show the chrome too), `package.json` (`@xterm/addon-fit`).
- Create: `src/client/terminal/window-chrome.ts`.
- Test: `tests/shell/modes.test.ts` (new) or add to `tests/shell/nav.test.ts`.

**Interfaces:**
- Produces: `windowTitle(mode: OsMode, p: { user: string; host: string; cwd: string; home: string; cols: number; rows: number }): string` in `modes.ts`.
- Produces: `mountTerminalWindow(host: HTMLElement, mode: OsMode): { body: HTMLElement; setTitle(text: string): void }` in `window-chrome.ts`. It appends `.term-window.term-<mode>` with the chrome and returns the element xterm should open in.
- Changes: `mountTerminal(el, shell, mode, opts?: { onTitle?(title: string): void }): MountedTerminal`. It calls `onTitle` after every prompt and every resize. `Shell` already exposes `user`, `host`, `cwd`, `home`; if any is private, add a read-only getter without changing behaviour.

**Tests (write first):**
- `windowTitle('mac', {user:'homayoon', host:'bar', cwd:'/Users/homayoon', home:'/Users/homayoon', cols:80, rows:24})` → `'homayoon — -zsh — 80×24'`
- the same with `cwd:'/Users/homayoon/bar'` → `'bar — -zsh — 80×24'`
- `windowTitle('linux', {user:'homayoon', host:'bar', cwd:'/home/homayoon/bar', home:'/home/homayoon', …})` → `'homayoon@bar: ~/bar'`, and at home → `'homayoon@bar: ~'`
- `windowTitle('windows', …)` → `'Windows PowerShell'`

**Notes:** before `term.open`, wait for `document.fonts.load('<size>px "<family>"')` for the mode's bundled family (Ubuntu Mono). Menlo and Cascadia are system fonts and fall back if missing. Refit on container resize, debounced to one animation frame. The line editor's wrap-aware redraw already reads `term.cols`, so a refit followed by `redraw()` is enough.

**Done-check:** unit tests green. `/src/client/dev/terminal.html` and the task preview show each of the three windows matching the canvas. Review Focus 1 and 2 checked by hand in Playwright.

- [ ] Write the failing tests, implement, run `npm test`, check screenshots, commit (`feat: OS terminal window chrome, Campbell/Tango themes, fit to frame`).

### Task 3: Task screen and task panel

**Goal:** The task screen matches the Oppgaveskjerm artboard and the three panel states. The panel shows avatar, eyebrow + name, intro with inline code chips, command chips, goals with progress, the latest feedback, a collapsible hint, and an ending card.

**Files:**
- Modify: `src/client/dom.ts` (helpers below), `src/client/screens/task.ts` (new DOM, `student` option, title callback into the chrome), `src/client/screens/ending.ts` (use the shared ending card), `src/client/student.ts` (pass `student: { name, os }`), `src/client/styles.css`.
- Create: `src/client/screens/ending-card.ts`, `src/client/screens/topbar.ts`.
- Test: `tests/client/dom.test.ts` (new).

**Interfaces:**
- Produces in `dom.ts`: `splitTitle(title: string): { eyebrow: string | null; name: string }`, which splits on the first `': '`; and `inlineCode(text: string): Array<{ code: boolean; text: string }>`, which splits on backtick pairs (an unmatched backtick stays literal). A thin DOM wrapper turns the parts into text nodes and `<code>`. Never use `innerHTML`.
- Produces: `endingCard(o: { text: string; correct: boolean; stats: Record<string, number>; waitingNote: boolean }): HTMLElement`. Heading `Godt jobbet!` when correct, `Oi da!` otherwise, then the text, stat chips (`key: value`) and, if `waitingNote`, the dots + `Venter på neste oppgave…`.
- Produces: `renderTopbar(o: { student?: { name: string; os: Os } }): HTMLElement`. Wordmark on the left. Name + `<OS label> · <shell>` pill on the right when a student is given (zsh/bash/PowerShell).
- Changes: `TaskScreenOptions` gains `student?: { name: string; os: Os }`.

**Tests (write first):**
- `splitTitle('Oppgave 1: Homayoon Bar')` → `{ eyebrow: 'Oppgave 1', name: 'Homayoon Bar' }`; `splitTitle('Fri lek')` → `{ eyebrow: null, name: 'Fri lek' }`
- `inlineCode('Skriv `ls` nå')` → `[{code:false,text:'Skriv '},{code:true,text:'ls'},{code:false,text:' nå'}]`; `inlineCode('a `b')` → `[{code:false,text:'a `b'}]`

**Notes:**
- The heading's accessible name stays the full title (`Oppgave 1: Homayoon Bar`): eyebrow and name are spans inside one `<h1>`, with the `': '` in a `.visually-hidden` span.
- Avatar: the head photo if it exists (the same `local-assets/heads/<file>` the scene loads, via `<img>` with `onerror` fallback), otherwise `resolveHead`'s placeholder colour and initial.
- Goals: a `<ol>` of steps with check circles, a counter `n av m` and a progress bar. The current step (first not done) gets the accent ring.
- Feedback box: `role="status"` `aria-live="polite"`, hidden until the first feedback arrives.
- Hint: keep `<details>`/`<summary>`, summary `Trenger du hjelp? Vis hint`, body with `inlineCode`.
- On ending: the ending card replaces the feedback box and hint. Steps stay visible. The terminal stays visible and locked.
- Layout: `#app` is a full-height column. The task window height is `clamp(300px, 46vh, 440px)`. The panel scrolls inside itself. The terminal window takes the remaining height, at least 10 rows. Below 1000 px the panel stacks under the scene and the page scrolls.

**Done-check:** unit tests and `npm run e2e` green. Preview URLs for all three tasks × three OSes match the canvas, including a reached ending (correct and wrong) and a reload that shows the ending screen.

- [ ] Write the failing tests, implement, run `npm test` and `npm run e2e`, check screenshots, commit (`feat: detailed task panel, ending card, topbar`).

### Task 4: Student flow screens

**Goal:** Join, terminal choice and waiting match the Elev-flyt artboard.

**Files:** `src/client/screens/join.ts`, `pick-os.ts`, `waiting.ts`, `src/client/styles.css`.

**Notes:**
- Join: card with wordmark, `Velkommen!`, one line of intro (`Du skal løse små oppdrag ved å skrive kommandoer i en terminal.`), a labelled input (keep placeholder `Navnet ditt`), dark `Neste →` button.
- Pick OS: eyebrow `Steg 2 av 2`, three full-width tile buttons, each with a CSS mini window preview (no images) plus label and subtitle (`Terminal · zsh`, `Terminal · bash`, `Windows Terminal · PowerShell`). Each button keeps the accessible name `macOS`/`Linux`/`Windows` through `aria-label`; the subtitle is linked with `aria-describedby`. The current choice gets the accent border.
- Waiting: centred card, `>_` tile with a blinking cursor (CSS, respects `prefers-reduced-motion`), the existing heading, `Følg med på tavla. Oppgaven dukker opp her av seg selv.`, a name · OS pill, and the `Endre navn eller terminal` link-button.

**Done-check:** `npm run e2e` green. Screenshots of the three screens match the canvas at 1440 px and still work at 390 px wide.

- [ ] Implement, run e2e, check screenshots, commit (`feat: restyled join, terminal choice and waiting screens`).

### Task 5: Admin

**Goal:** The admin matches the Admin artboards. Same data and actions, easier to read at a glance.

**Files:**
- Modify: `src/client/admin/admin.ts`, `src/client/styles.css`.
- Create: `src/client/admin/summary.ts`.
- Test: `tests/client/admin-summary.test.ts`.

**Interfaces:**
- Produces: `summarize(rows: Row[]): { total: number; done: number; working: number; waiting: number; correct: number; endings: Array<{ id: string; correct: boolean; count: number }> }`. Endings are sorted by count descending, then by id.

**Tests (write first):** rows with statuses `ferdig` ×3 (endings `toalett` ✓, `toalett` ✓, `bar` ✗), `jobber` ×1, `venter` ×1 → `{ total: 5, done: 3, working: 1, waiting: 1, correct: 2, endings: [{id:'toalett',correct:true,count:2},{id:'bar',correct:false,count:1}] }`; an empty list → all zeros and `endings: []`.

**Notes:**
- Login: centred white card on a dark (`--ink`) page, wordmark, `Admin`, a label `Passord` on an input that keeps the placeholder, `Logg inn`, and the `Feil passord.` error with an icon.
- Dashboard: a dark top bar (wordmark, `Admin` badge, a live dot driven by `createNet`'s `onStatus`: green `Live` / grey `Kobler til…`, plus `N elever har koblet til`). Hero: eyebrow `Pågår nå`, the current task title (or `Ingen oppgave startet`), the line `N / M ferdig`, primary `Start neste oppgave: <title>` and outlined danger `Ny økt`. Four stat tiles (Ferdig, Jobber, Venter, Riktig slutt), a stacked progress bar (ok / accent / grey), ending chips (✓/✗ `id · count`).
- Table: status pills (`Ferdig`, `Jobber · n av m` (m = the task's step count; if the protocol doesn't carry it, show `Jobber · n ✓`), `Venter`), OS label, ending with ✓/✗ icon, stats columns right-aligned in mono. It sits in an `overflow-x: auto` box. Keep the `data-client` / `data-task` attributes and the `status-*` row classes.
- Earlier tasks: one `<details>` per task, collapsed by default, their open state kept across re-renders (keep open task ids in a `Set`).

**Done-check:** unit tests and `npm run e2e` green. With ~6 fake students (Playwright tabs or the load-test script), the admin screenshots match the canvas. Expanding an earlier task survives the next state update.

- [ ] Write the failing test, implement, run tests and e2e, check screenshots, commit (`feat: admin dashboard redesign`).

### Task 6: LimeZu scene pipeline

**Goal:** The scene can draw LimeZu tilesets and a LimeZu character with walking in four directions, falls back cleanly when the art is missing, and has in-style sprites for what the free pack lacks.

**What's in the free pack** (checked 2026-10-18, `assets/limezu/`):
- `Interiors_free/{16x16,32x32,48x48}/Interiors_free_*.png` (furniture) and `Room_Builder_free_*.png` (floors, walls, room borders). Use the **16×16** sheets: the scene's `T = 16`.
- `Characters_free/{Adam,Alex,Amelia,Bob}_16x16.png`. Each frame is 16×32. Row 0 holds four idle frames (right, up, left, down). `*_run_16x16.png` and `*_idle_anim_16x16.png` are 24 frames in one row: 6 per direction in the same order.
- **Missing:** toilet, bathtub, cage, snake. Draw these as small sprites in `placeholder-art.ts` style: dark 1 px outline, flat colours, 16 px grid. The canvas shows a first version.

**Files:**
- Modify: `src/client/scene/scene-view.ts`, `src/client/scene/placeholder-art.ts`, `src/client/scene/map-data.ts`, `src/tasks/api.ts` (add `character.body?: 'Adam' | 'Alex' | 'Amelia' | 'Bob'`, default `'Adam'`), the three task files (Homayoon `Adam`, Aleksander `Alex`, Eeman `Alex`, or the owner's choice).
- Create: `src/client/scene/map-choice.ts`.
- Test: `tests/client/map-choice.test.ts`.

**Interfaces:**
- Produces: `chooseMap(map: string, missingTilesets: ReadonlySet<string>): string`. It returns `map` when every tileset loaded, else the placeholder twin (`homayoon-bar.json` → `homayoon-bar.placeholder.json`).
- Produces: tileset paths keep their folder below `limezu/`. A tileset `image` of `…/limezu/Interiors_free/16x16/Interiors_free_16x16.png` loads from `local-assets/limezu/Interiors_free/16x16/Interiors_free_16x16.png`. Today's loader keeps only the base name, which can't find files in subfolders. The server already serves subpaths.
- Produces: map layers `ground`, `walls`, `furniture`, `above` (drawn over the character: shelf tops, plant crowns, door frames), `collision`, plus the `spots` object layer. A missing optional layer is skipped.

**Tests (write first):** `chooseMap('homayoon-bar.json', new Set())` → `'homayoon-bar.json'`; with `new Set(['Interiors_free_16x16'])` → `'homayoon-bar.placeholder.json'`.

**Notes:**
- Load order: fetch the map JSON, probe its tilesets (Phaser `loaderror`), then build from `chooseMap`'s result. Log one `console.warn` in Norwegian, as today.
- Character: the body sprite comes from the LimeZu sheet, with walk = run frames (6 fps) in the direction of travel and idle facing the last direction. With a head photo, the photo head is drawn over the LimeZu head, aligned to the sprite's top 16×16. **Without a photo, show the plain LimeZu character.** That replaces the coloured initial in the scene. (Claude's call, a change from the spec. The owner can veto it.) The task panel avatar (Task 3) keeps the photo-or-initial rule.
- Scale the scene by whole numbers only (zoom 2×, 3×, … to the largest that fits), centred on the map's edge colour. Fractional FIT scaling makes pixel art uneven.

**Done-check:** test green. With `assets/limezu/` present, the bar preview shows the LimeZu character walking in four directions on the existing placeholder layout. With the folder renamed, every level shows its placeholder map and the tasks still finish. Existing scene tests stay green.

- [ ] Write the failing test, implement, run `npm test`, check both cases in Playwright, commit (`feat: LimeZu tilesets and characters with placeholder fallback`).

### Task 7: The three levels

**Goal:** Homayoon Bar, Aleksanders hus and Eeman i banken are rebuilt with LimeZu art, following the canvas suggestions (Bane 1–3), and stay editable in Tiled.

**Files:**
- Create: `scripts/make-limezu-maps.ts`. It describes each level declaratively (floors, wall faces, ceiling strips, furniture as `{ sheet, col, row, w, h, x, y, blocks: boolean, aboveRows?: number }`, spots) and writes Tiled JSON. It's the TypeScript port of `docs/superpowers/plans/2026-10-18-level-layouts.py`, which holds the exact tile coordinates used for the canvas images.
- Modify: `public/maps/homayoon-bar.json`, `aleksander-house.json`, `eeman-bank.json` (overwritten with the LimeZu versions). Rename today's files to `*.placeholder.json` and point `scripts/make-maps.ts` at the new names. `tests/client/maps.test.ts` runs every check for both variants of each map.
- Modify: `README.md` (LimeZu section: folder layout as downloaded, the licence line, how to regenerate the maps, that Tiled can open them).

**Layouts** (from the canvas; house and bank keep today's size):
- **Bar, 20 × 14** (owner's sketch; board “Bane 1: Homayoon Bar (etter skissen)”, function `homayoon_bar_v2` in the layout script). Dark wood floor and wall. A U-shaped bar along the top wall: four bottle shelves on the wall, one-tile arms down both sides (cols 5 and 14), an 8-tile front counter, and the bartender (Bob, static NPC; the story mentions him) inside. No bar stools (owner removed them). Entrance: a double door in the top wall, top right (cols 15–16). Tables against the right wall (two) and the bottom wall (three), plus a corner table bottom right, **each with stools**. A couch corner on the left: one L-shaped couch (sofa facing down joined to a sofa facing right) around a coffee table. Toilet room bottom left (teal tiles), with its door in its top wall. Its right wall (col 3) runs up from row 5, making a hallway down the left side to the toilet door. Spots: `inngang` inside the door, `bar` in front of the counter, `bord` between the bottom tables, `toalett` inside the toilet room.
- **House, 20 × 14.** Four rooms with doors between neighbours: soverom top-left (wood floor, bed, curtains, plant), stue top-right (herringbone floor, fireplace, bookshelf, sofa, rug, palm; the start, `.`), kjokken bottom-left (yellow tiles, fridge, counters with fruit, table), bad bottom-right (teal tiles, mirror, toilet sprite). **Keep the middle of each room open**, at least 3 × 2 free tiles around the spot, for cages and wandering snakes.
- **Bank, 16 × 10.** Grey wall, stone lobby floor, herringbone behind the counter. A 12-tile counter with glass windows, and the cashiers (Amelia, Bob) as static NPC sprites behind it. Grey cabinet as the safe, plus a world map, window, waiting sofa, rug and plants. Entrance gap at the bottom centre. Spots: `inngang` at the door, `skranke` on the rug in front of the counter.

**Done-check:** `npx tsx scripts/make-limezu-maps.ts` regenerates all three files. `npm test` is green, including the map tests (spots exist, are walkable and reach each other) for LimeZu and placeholder variants. Playwright screenshots of each level match the canvas boards. Each task's full happy path (from `src/tasks/testing.ts` scripts) still ends correctly in the preview.

- [ ] Port the layouts, generate, run tests, compare screenshots, commit (`feat: LimeZu maps for all three levels`).

### Task 8: Scene details for the levels

**Goal:** The levels feel alive and stay readable when tasks spawn things.

**Files:** `src/client/scene/scene-view.ts`, `src/client/scene/placeholder-art.ts`, `scripts/make-limezu-maps.ts`, `tests/client/scene-queue.test.ts` (or a new `tests/client/placement.test.ts`).

**Interfaces:**
- Produces: `nextFreeTile(area: Rect, spot: Point, taken: ReadonlySet<string>, blocked: boolean[][]): Point | null` (pure, in a new `src/client/scene/placement.ts`). It returns the walkable, untaken tile in `area` nearest to `spot`, with ties broken by row then column.
- Produces: each room spot may have a matching rectangle object in the `spots` layer (name `<spot>-area`). Without one, the area is a 5 × 3 box around the spot.

**Tests (write first):** an empty 5 × 3 area → the spot itself; spot taken → an orthogonal neighbour; whole area taken or blocked → `null`. When it returns `null`, the scene falls back to today's jitter.

**Notes:** cages use `nextFreeTile`. Snakes inside a cage stay on the cage's tile. Entity labels stay on top of `above`. Swap the emoji effects (`🍺 💦 🔫 😂 💵`) for small pixel icons in the same style, keeping the same `play(anim)` names. The cashiers face down, using the idle frame.

**Done-check:** test green. In the house preview, `python -m venv` run 12 times in `soverom` gives 12 cages side by side with readable labels. Screenshots of the drink, tiss, rob and laugh effects look in-style.

- [ ] Write the failing test, implement, run tests, check screenshots, commit (`feat: cage placement and pixel effects`).

### Task 9: Verification pass

**Goal:** Proof that the whole thing works and looks right.

- [ ] `npm run typecheck && npm test && npm run e2e && npm run build` all green.
- [ ] Playwright screenshots into `.playwright-mcp/shots/after-*`: each task × each OS at 1440×900 and 1366×768, a correct and a wrong ending, the student flow, admin login + dashboard, and each level with and without `assets/limezu/`. Compare with the canvas and the `before-*` shots.
- [ ] Review Focus 1–5 checked and noted in the commit message.
- [ ] `README.md`: one line saying fonts are bundled and the Windows look is Windows Terminal (Campbell).

## Out of scope (seen while screenshotting, not part of this plan)

- `ls` prints names on one line joined by two spaces instead of fitting them into columns, so long listings wrap mid-name (e.g. `ta-ut-pe|nger` in Eeman i banken). Real `ls` fits columns to the terminal width. Fixing it means passing `cols` into the shell, which is a logic change.
- Homayoon Bar has no `intro` text. The panel hides the intro block when there isn't one; writing it is up to the owner.
