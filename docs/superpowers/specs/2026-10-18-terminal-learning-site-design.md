# Terminal learning site — design

*Date: 2026-10-18. Items marked **(Claude's call)** were decided by Claude during design, not by the owner; they can be overruled.*

## 1. Intent

A website used during a live presentation about the terminal. The presenter (admin) explains a few commands (e.g. `cd`, `ls`), then ~30 students open the site and solve a playful task **by typing real-looking terminal commands**. A pixel-art scene above the terminal reacts to what they type, so they *see* what a command does (e.g. `cd bar` makes the character walk to the bar). The admin watches progress live, then returns to the slides and later starts the next task. The loop repeats per task.

Why: students learn the terminal by doing, in a safe, fun setting, with instant visual feedback, while the presenter keeps the class in sync.

Success looks like: every student can join in seconds, complete a task without lag or confusion, and the admin can see at a glance who is done and which ending they chose.

## 2. Goals

1. **30+ concurrent students with no noticeable lag.**
2. **Easy to add tasks.** A new task is one self-contained file (plus its map), with no changes elsewhere except adding it to the task order list.
3. **Realistic terminal**, in the flavour the student picks: **macOS (zsh), Linux (bash) or Windows (PowerShell)**. Commands, prompts, output formats and error messages should mimic the real thing.
4. **Task window** showing the task, a pixel-art scene, and visible feedback on correct progress.
5. **Hint section**, hidden by default, that shows the *next step based on the student's current state*.
6. **Admin view** with live progress per task and a button to start the next task.

## 3. Non-goals

- No real shell, containers or VMs behind the terminal. It is a simulation.
- No student accounts or login. Name only, stored in the browser.
- No grading or long-term history across classes.
- No in-browser task editor. Tasks are written as code/data files.
- No Windows Command Prompt (cmd.exe). Windows = PowerShell only.
- No phone layout. Students use laptops (desktop browsers).
- No multiple simultaneous classes. One active session at a time.
- No English UI translation.

## 4. Anti-goals (would make it a failure even if it "works")

- Lag or delays in the terminal or scene. Typing must never wait on the server.
- A terminal that behaves unlike the real one. Students must not learn wrong habits or wrong output.
- Task feedback printed into the terminal as fake output. That breaks realism. Feedback goes in the task window.
- Adding a task requires touching engine/UI code.
- Students being able to control the session (start tasks, reset).

## 5. Language

- **Norwegian:** all UI text, task descriptions, hints, feedback, ending messages, admin page, and **folder names**.
- **English:** everything the terminal itself prints (prompts, command output, error messages), exactly as the real terminal would.
- **Folder names avoid æ, ø, å** (e.g. `kjop-hiroshima`, not `kjøp-hiroshima`), since they are awkward to type in terminals. Task text may use æøå. **(Claude's call)**

## 6. The student flow

1. Student opens the site and enters their **name**. Saved in `localStorage` together with a random client id.
2. Student picks **macOS / Linux / Windows**. Saved in `localStorage`, changeable.
3. If the admin hasn't started a task, show a **waiting screen** ("Venter på at oppgaven starter…").
4. When a task is active, the **task screen** shows (layout fixed, top to bottom):
   - **Task window** (top): the pixel-art scene, the task title and step checklist with live feedback, and a **"Vis hint"** button whose content is hidden until clicked.
   - **Terminal** (bottom).
5. On reaching an ending, show a **congratulations/ending message** for that ending. The terminal is then locked and the student waits for the next task. **(Claude's call)**
6. When the admin starts the next task, every student's screen switches to it at once, including students still working on the old one.
7. **Late join / reload:** a student who opens or reloads the page goes straight into the current task, keeping their name and admin-table row (same client id). In-task progress resets on reload. Acceptable because tasks are short. **(Claude's call)**
8. **The server owns results.** The first ending a student reaches in a task is recorded on the server and is final. A student who reloads after finishing sees their ending screen again, not a fresh task. **Any ending counts as "ferdig"**, and the admin table shows which one. **(Claude's call)**

The visual design of the page will be done later as a separate design artifact. Build the layout cleanly, with styling separated from structure, so it can be restyled without touching logic. Only the order (task window on top, terminal below) is fixed now.

## 7. The terminal

### 7.1 Rendering
- **xterm.js** (`@xterm/xterm`, current 6.x) renders the terminal. **(Claude's call, agreed by owner)**
- A small line-editor layer on top: prompt, typing, backspace, left/right cursor, **up/down history**, **Tab completion** of folder names (with the OS-appropriate behaviour), Ctrl+C to abandon a line, `clear`/`cls`.
- Look per OS (font, colours, prompt) should suggest the real thing: macOS Terminal + zsh, a typical Linux bash, Windows Terminal + PowerShell.

### 7.2 Shell engine (our own) **(Claude's call, agreed by owner)**
No existing package covers all three OSes (research summary: just-bash is bash-only, agent-oriented and resets cwd between calls; other simulators are stale; no maintained PowerShell simulator exists). So we write a small engine:

- **Virtual filesystem** defined by the task (folders and, if needed later, files). It can **change during the task**: folders and scripts can appear or disappear based on task state (see `tiss` in task 1).
- **One engine, three OS modes.** A mode supplies: prompt format, path style (`/` vs `\`, `~` vs `C:\...`), case sensitivity (Linux sensitive; macOS and Windows insensitive, like the real defaults), command names and aliases, output formatting, and exact error-message text.
- **Commands for the first task:** navigation and looking around.
  - zsh/bash: `cd` (incl. `cd ..`, `cd ~`, `cd` alone, relative/absolute/multi-segment paths like `cd ../bar`), `ls` (plus common flags like `-a`, `-l`, at least without crashing), `pwd`, `clear`.
  - PowerShell: `Set-Location`/`cd`/`sl`/`chdir`, `Get-ChildItem`/`ls`/`dir`/`gci` (PowerShell's table output format), `Get-Location`/`pwd`, `Clear-Host`/`cls`/`clear`.
  - Unknown commands produce the real "command not found" message for that shell.
- **Each task declares which commands exist.** The engine provides a library of command implementations, and the task picks from it. Tasks 2 and 3 (section 10b/10c) set the minimum the engine must support from the start:
  - **Commands that change the filesystem** (`python -m venv` creates a folder tree). Commands that can be redirected per task go in the library: `python`/`python3 -m venv`, `pip install`, `source`/`.`/`Activate.ps1`, `deactivate`, `sudo`.
  - **Dot-files and `ls -a`** (`Get-ChildItem -Force` on PowerShell), with a per-task override so task 2's cages are always listed.
  - **Shell state that changes the prompt** (active venv prefix `(.venv)`).
  - **Executable scripts** defined by a task, placed in a room, listed by `ls`, and run by name (also `./name`) only while in that room. Their behaviour and output are task-defined. Scripts can appear or disappear based on task state (task 1's `tiss`). Used by tasks 1 and 3.
  - **Permissions**: commands a task marks as needing root fail with the real-style error unless run with `sudo`.
  - **Hidden input mode** for `sudo`'s password prompt.
  - Later tasks will likely add `mkdir`, `mv`, `cat`, `rm`, so design the filesystem as fully mutable by commands, not only by task state.
- **Outside the task's folders:** the task tree sits inside a realistic path (e.g. `/Users/homayoon` on macOS, `/home/homayoon` on Linux, `C:\Users\homayoon` on Windows), so `cd ..` from `~`, `cd /` or `cd C:\` work as in a real shell and `pwd` shows a real-looking path. Parent folders outside the task are mostly empty. The scene keeps the character at the entrance while the student is outside the task tree. **(Claude's call)**
- **Events:** the engine emits structured events (e.g. `cwdChanged {from, to}`, `commandRun`, `commandFailed`) that the task logic and scene consume. The engine knows nothing about bars or drinks.
- Target realism: Windows PowerShell as opened by Windows Terminal on a current Windows 11 install. **(Claude's call)**

## 8. The scene (task window)

- **Style:** classic **3/4 top-down pixel art** (Stardew Valley / old Pokémon style). Chosen by owner.
- **Assets:** **LimeZu "Modern Interiors" free version** (itch.io). Chosen by owner.
  - The owner downloads it manually. The art is **not committed** to a public repository: it goes in a git-ignored assets folder, and the README explains where to place the files. Check the pack's license text before publishing anything.
  - The builder should check that the free pack contains what task 1 needs (a character sprite with walk animation, bar counter, stools, tables, toilet). If something is missing, use a simple placeholder and note it.
- **Rendering:** **Phaser** (current stable). **(Claude's call)**
- **Maps** are made in **Tiled** (free map editor) and loaded by Phaser. The map has an object layer of **named spots** (e.g. `inngang`, `bar`, `toalett`). The task file maps each folder path to a spot. **(Claude's call)** The owner will design the real bar map later. Until then the builder makes a **simple placeholder map** containing only what the owner has described (entrance, bar counter with stools, tables, toilet). Nothing else, such as a dance floor.
- When the student `cd`s into a room, the character **walks** there, avoiding obstacles (simple grid pathfinding). Action events trigger a small animation or effect (e.g. drinking).
- **The controlled character's head is a custom photo** (owner decided), one per task character (Homayoon, Aleksander, Eeman). The owner supplies the photos later. Until then, a placeholder head is used: a coloured head with the character's initial.
  - Photos go in a git-ignored `assets/heads/<character>.png` folder, since they are pictures of real people. **(Claude's call)**
  - The photo is cropped to the head and downscaled/pixelated to match the pixel-art style, then drawn on top of the sprite body. **(Claude's call)**
  - The task file names its character and head image.
- **Objects can be added, moved and removed while a task runs.** Task 2 spawns cages in rooms and snakes that either sit in a cage or wander the house randomly. Task 3 plays action animations at the bank. The task file drives these through a small scene API (e.g. spawn object at spot/room, move, remove, play animation, show speech bubble), so no scene code changes per task.
- The scene must never block the terminal. If an animation is still running when the next command comes, it skips ahead or queues smoothly.

## 9. Tasks: format and authoring

Each task is **one file** in a `tasks/` folder (TypeScript, so authors get autocompletion and type checking), plus its Tiled map. A central ordered list says which tasks the admin steps through. The builder designs the exact API, but a task must be able to declare:

- `id`, Norwegian `title`, and steps (Norwegian text) shown as a checklist.
- OS-independent **folder tree**, and which folders are hidden until a condition is met.
- Which shell **commands** are available, plus **task-specific scripts/commands** with their behaviour and output, and which of them need `sudo`.
- **Task state** (e.g. `drinks: number`) and how events change it. For example, "running `kjop-hiroshima` in `bar` → drinks += 1".
- **Step completion** rules. These drive the checklist feedback.
- **Endings**: id, the folder that triggers it, a Norwegian message, and whether it counts as the "right" ending.
- **Hints**: an ordered list of `(condition on current state + cwd) → Norwegian hint text`. The first matching hint is shown. This is how "hint = next step based on current state" works.
- **Map** file, and the mapping from folder paths to map spots.
- **Extra stats** to report to the admin (e.g. number of drinks).

Authoring must be easy:
- A **dev/preview mode** where a task can be opened directly in the browser without the server or admin (e.g. `?task=homayoon-bar&os=linux`).
- A short **"How to write a task" guide** in the repo, using task 1 as the worked example.
- **Task scripts as tests:** a way to run a sequence of commands against a task in each OS mode and assert the resulting state, step completion, ending and current hint.

## 10. Task 1: "Homayoon Bar" (Oppgave 1)

Commands practised: `cd`, `ls`, `cd ..`, running scripts.

**Story:**
1. Hjelp Homayoon å drikke en Hiroshima (move to the bar and buy one; they may buy as many as they want).
2. Hjelp Homayoon å tisse på toalettet.

**Folders** (start = entrance = home `~`). The room list is a placeholder until the owner's map exists:
```
~                      (inngang)
├── bar/
│   └── kjop-hiroshima       ← script: run it = Homayoon drinks one Hiroshima
├── bord/                    (tables: its own place to walk to; owner confirmed)
└── toalett/
```
Exact room list and names follow the owner's map. Owner confirmed so far: entrance, bar (with stools), tables as their own place, toilet. No dance floor.
- **Actions are scripts** (owner decided), like in task 3. In the bar, `ls` shows the script `kjop-hiroshima`, and running `kjop-hiroshima` makes Homayoon drink one Hiroshima: the task window shows feedback, the drink counter goes up, and the scene animates it. Each run is one more drink, with no limit. Scripts only work in the room they are in. Elsewhere you get the shell's real "command not found" error.
- **The `tiss` script unlocks after the first Hiroshima** (owner decided). Before that it doesn't exist. After the first drink, a `tiss` script appears in **every room** (`~`, `bar`, `bord`, `toalett`), and `ls` shows it.
- **Running `tiss` ends the task.** Each location has its own ending:
  - `tiss` in `toalett` is the **right ending** ("Ahh, mye bedre!").
  - Elsewhere gets a funny ending (e.g. the bartender gets angry; at the entrance: "Rett utenfor døra? Seriøst?").
  - Final texts are placeholders the owner can edit in the task file.
- **Checklist:** step 1 done after ≥1 drink (show count). Step 2 done on the toilet ending. Other endings show their own message.
- **Hints (Norwegian, examples):**
  - At the start: "Skriv `ls` for å se hvor Homayoon kan gå."
  - Hasn't reached the bar: "Bruk `cd bar` for å gå til baren."
  - In the bar, no drink yet: "Bruk `ls` for å se hva du kan gjøre, og skriv `kjop-hiroshima`."
  - After drinking, still in the bar: "Homayoon må tisse! Bruk `cd ..` for å gå ut av baren."
  - After drinking, not at the toilet: "Bruk `ls` for å se etter toalettet, og gå dit med `cd`."
  - At the toilet: "Skriv `tiss`."
- **Reported to admin:** status, ending, number of Hiroshimas.

## 10b. Task 2: "Aleksanders pythonslange" (Python virtual environments)

Commands practised: `cd`, `ls`, `python -m venv`, activating/deactivating a venv, `pip install`. Story and endings are the owner's; mechanics marked as Claude's call.

**Story:** Aleksander has come home from the pet shop with a pet python and needs a place to keep it. The task says to go to the **bedroom** to make the cage, but any room works.

**Folders:** a house with rooms as folders: `soverom/` (bedroom), plus placeholders `stue/`, `kjokken/`, `bad/` until the owner's map exists.

**Mechanics:**
- **A cage is a virtual environment.** `python -m venv <name>` in a room creates a cage with that name, e.g. `python -m venv .venv`. The scene shows a **cage/box with its name written above it** in that room (owner decided).
  - Any name works (`python -m venv bur2`), so a room can hold several cages. Re-running for an existing name doesn't create a new cage, as in real Python. **(Claude's call)**
  - **`ls` shows cages even when the name starts with a period** (owner decided). This is a deliberate deviation from real `ls`, which hides dot-folders. It applies to cages only. **(Claude's call on the scope)**
- **A cage must be activated before snakes can go in it** (owner decided). The command is the real one for the OS:
  - macOS/Linux: `source <name>/bin/activate` (also `. <name>/bin/activate`)
  - PowerShell: `<name>\Scripts\Activate.ps1` (also with a leading `.\`)
  - **The terminal shows that it is in the virtual environment**, using the real prompt prefix, e.g. `(.venv) aleksander@hus soverom %`. `deactivate` closes the cage and removes the prefix.
  - No PowerShell execution-policy error is simulated, because it would derail the lesson. **(Claude's call)**
- **`pip install pet_python`:**
  - With a cage active, a python goes into **the active cage**, wherever the student is standing. **Leaving the room doesn't change this.** The snake still goes into the active cage until the student runs `deactivate` (owner decided; matches real venv behaviour). The scene shows the snake in that cage.
  - With no cage active, the python is **dropped loose** and wanders randomly around the house in the scene.
  - Terminal output mimics real pip ("Collecting pet_python … Successfully installed pet_python-1.0.0"). Unlike real pip, repeated installs into the same cage **do add another python**, because the endings need it. **(Claude's call)**
- `python` and `python3` both work on all three OSes, as if Python were installed from python.org. **(Claude's call)** This avoids the macOS "no `python`" trap derailing the lesson.

**Endings** (owner's). "Over 10" means 11 or more. **(Claude's call)**
- **Right ending:** two different cages each contain at least one python. It triggers the moment that becomes true.
- More than 10 loose pythons in the house: Aleksander dies.
- More than 10 cages in one room: Aleksander dies from cages.
- More than 10 pythons in one cage: Aleksander dies of guilt over the crammed snakes.
- Norwegian ending texts are placeholders the owner edits.

**Hints:** go to the bedroom → create a cage → `ls` to see it → activate it → `pip install pet_python` → make a second cage and activate it (or `deactivate` first) → install a python there.

**Reported to admin:** ending, number of cages, pythons in cages, loose pythons.

**Art note:** LimeZu has no snakes or cages. Draw simple pixel sprites for those in the same style.

## 10c. Task 3: "Eeman i banken" (sudo)

Commands practised: `ls`, running scripts, `sudo`. The owner gave the core idea; the builder designs the full list of actions and endings in that spirit, and the owner edits the texts.

**Story:** Eeman is at the bank and wants to take out money.

**Mechanics:**
- **Actions are scripts** in the bank's folder. `ls` shows them, and **running one performs that action** in the scene. Examples: `spor-om-penger` (asks for money), `skrik-gi-meg-penger`, plus a few more invented by the builder, such as a legitimate withdrawal. They run by name, as the owner described, and also with `./name`. **(Claude's call)** This uses the same script mechanism as task 1 (section 7.2).
- **Harmless actions** run normally.
- **Important actions fail without `sudo`.** The terminal prints a realistic English permission error ("Permission denied", or a "must be run as root"-style message) that points toward `sudo`. The task window shows the funny Norwegian consequence: `skrik-gi-meg-penger` without sudo makes everyone laugh.
- **With `sudo`, the important action succeeds.** `sudo skrik-gi-meg-penger` makes Eeman pull out a (fictional) gun and rob the bank. A legitimate withdrawal also requires `sudo` on its important step.
- **`sudo` asks for a password** like the real one, and **nothing is shown while typing**. That is a real terminal lesson. The password is given in the task text. **(Claude's call)**
- **PowerShell also uses `sudo`.** Current Windows 11 ships a `sudo` command, so the lesson is the same on all three OSes. **(Claude's call)**

**Endings:** at least a legitimate withdrawal (right ending) and the robbery. The builder may add one or two more.

## 11. Admin view

- At `/admin`, protected by a **password** set via an environment variable when starting the server. **(Claude's call)**
- Shows the **current task**, a counter like "22 / 30 ferdig", and a **"Start neste oppgave"** button that pushes the next task (from the ordered list) to all students instantly.
- **One table per task started this session**, with earlier tables kept visible. Columns: name, terminal (macOS/Linux/Windows), status (venter / jobber / ferdig), ending, and task-specific stats (e.g. Hiroshimas). Updates live.
- **"Ny økt"** button clears all students and results (with a confirm), for the next class. **(Claude's call)**
- Admin page is Norwegian.

## 12. Architecture and hosting

- **Hosting:** owner's choice is a university machine, **IDUN at NTNU**, where the owner can run Docker. **Not yet confirmed** that it can serve a site students can reach. The owner will test this. So:
  - Ship **one Docker image** that runs anywhere a container with WebSockets can run. It must work behind a reverse proxy and under a sub-path if needed (configurable base path).
  - **Fallback**, if IDUN can't serve it publicly: any small container host (e.g. Fly.io, Render, Railway) or a university VM, using the same image. A laptop on the classroom network is the last resort, because eduroam often blocks laptop-to-laptop traffic.
  - Provide a **5-minute reachability check** early (a tiny "hello" page plus a WebSocket echo, deployed first) so the owner can test IDUN in the first days, not the night before.
- **One Node.js (TypeScript) server process** that serves the built front end and keeps a **WebSocket** connection to each browser. **(Claude's call)** Library choice (`ws`, Socket.IO, …) is the builder's.
- **Front end:** TypeScript + Vite, xterm.js, Phaser. No heavy UI framework required, though the builder may use one if it helps. **(Claude's call)**
- **All terminal and scene logic runs in the student's browser.** The server only relays:
  - student → server: join (client id, name, OS), progress updates (steps done, stats), ending reached
  - server → students: current task (on connect and when changed), session reset
  - admin ↔ server: auth, start next task, new session, live progress feed
- **State:** in memory, also written to a small JSON file on change, so a server restart doesn't lose the session. **(Claude's call)**
- **Reconnect:** browsers reconnect automatically if the connection drops, and re-send their identity.
- **Load:** 30 students produce a handful of small messages each per task, which is trivial for one process. Include a simple **load-test script** that simulates ≥30 (say 60) clients joining and finishing, to prove the requirement.
- **Deployment deliverables:** a Dockerfile and a plain "run with Node" option, plus README steps for deploying, including putting it behind HTTPS (reverse proxy such as Caddy or nginx) if the host allows. WebSockets must work through that proxy.

## 12b. Timeline and priorities

**First session is next week** (week of 2026-10-19). The owner did not say which tasks must be ready. **Claude's call:** aim for all three, built in this order so that whatever exists is usable:
1. Hosting reachability check (above). Done first, so the owner can test IDUN.
2. Engine and shell (all three OS modes), student flow, admin view, server. Built with tasks 2 and 3 in mind (section 7.2).
3. Task 1, Homayoon Bar, end to end with a placeholder map.
4. Task 2, Aleksander's python.
5. Task 3, Eeman in the bank.
6. Load test, Docker, authoring guide.

**If time runs short:** placeholder art beats missing tasks. The owner's own bar map and the full LimeZu art can be added after the first session. The owner should say early if fewer tasks are needed next week.

## 13. Left to the builder

- Exact task-file API and folder structure of the codebase.
- WebSocket library, pathfinding approach, test framework.
- Exact prompt strings and error texts per OS, matching the real shells.
- Visual styling (to be replaced by a later design), and the app's name (placeholder until the owner names it).
- Placeholder map and placeholder ending texts.
