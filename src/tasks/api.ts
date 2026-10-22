import type { CommandSet, Shell, ShellEvent } from '../shell/engine.js';
import type { OsMode } from '../shell/modes.js';
import type { Vfs } from '../shell/vfs.js';

/** Nested folders. Every key is a folder name; scripts are declared in `scripts`. */
export interface TreeSpec {
  [folder: string]: TreeSpec;
}

/** What a task can ask the scene to do. Implemented by the Phaser scene and by a recording fake in tests. */
export interface SceneApi {
  /** `spot` is a map spot name, or (for spawn/move) the id of an object already in the scene, e.g. a cage. */
  walkTo(spot: string): void;
  spawn(id: string, kind: string, spot: string, label?: string): void;
  move(id: string, spot: string): void;
  wander(id: string): void;
  remove(id: string): void;
  play(anim: string): void;
  say(text: string): void;
}

export interface TaskCtx<S> {
  state: S;
  /** The script's arguments (`foo 1962` gives `['1962']`). `[]` outside a script. */
  args: string[];
  /** Current folder relative to the task root ("." is the entrance). Outside the root it is the absolute POSIX path. */
  cwd: string;
  vfs: Vfs;
  shell: Shell;
  scene: SceneApi;
  /** True while a script runs under `sudo`. */
  sudo: boolean;
  /** Turns an absolute POSIX path (as in event data) into the form `cwd` uses. */
  relative(path: string): string;
  /** Shows a message in the task window. Never printed in the terminal. */
  feedback(text: string): void;
}

export interface ScriptDef<S> {
  /** Folder (relative to the root, "." = entrance), several folders, or "*" for every folder in the tree. */
  dir: string | string[];
  requiresSudo?: boolean;
  /** Omit for always visible. A hidden script does not exist: not in ls, "command not found" when run. */
  visibleWhen?(s: S): boolean;
  /** The returned string is printed in the terminal. */
  run(ctx: TaskCtx<S>): string | void;
  /** Called instead of `run` when a requiresSudo script is run without sudo. Show the consequence in the task window. */
  onDenied?(ctx: TaskCtx<S>): void;
}

/** A door: a folder that `cd` walks through to another room. Shows in `ls` as a folder. */
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

export interface StepDef<S> {
  text: string | ((s: S) => string);
  done(s: S): boolean;
  /** Story text shown under the goal once it is done, before the next goal. */
  textOnCompletion?: string | ((s: S) => string);
}

export interface EndingDef<S> {
  id: string;
  text: string;
  correct: boolean;
  when(s: S, e: ShellEvent): boolean;
}

export interface HintDef<S> {
  when(s: S, cwd: string): boolean;
  /** Commands differ per OS, so a hint may be built from the mode and the state. */
  text: string | ((os: OsMode, s: S) => string);
}

export interface TaskDefinition<S> {
  id: string;
  title: string;
  /** Norwegian task text shown under the title (the story, and e.g. the sudo password). */
  intro?: string;
  user: string;
  host: string;
  /** Tiled map file name in public/maps. */
  map: string;
  /** `head` is a photo in assets/heads; `body` picks the LimeZu character sheet (default Adam). */
  character: { name: string; head: string; body?: 'Adam' | 'Alex' | 'Amelia' | 'Bob' };
  tree: TreeSpec;
  /** Folder (relative to the root) -> map spot. "." is the entrance. */
  spots: Record<string, string>;
  /** Canonical names from the command library. */
  commands: string[];
  /** The password `sudo` accepts. */
  sudoPassword?: string;
  scripts: Record<string, ScriptDef<S>>;
  doors?: DoorDef<S>[];
  /** Real folders (relative to the root) left out of plain `ls`. */
  hiddenFolders?: string[];
  initialState: S;
  onEvent?(e: ShellEvent, ctx: TaskCtx<S>): void;
  steps: StepDef<S>[];
  endings: EndingDef<S>[];
  hints: HintDef<S>[];
  stats?(s: S): Record<string, number>;
  /** Registers task-specific commands, e.g. `ctx.shell.commands['foo'] = ...`. */
  setup?(ctx: TaskCtx<S>): void;
}

export interface TaskUpdate {
  stepTexts: string[];
  stepsDone: boolean[];
  /** A done goal's `textOnCompletion`; undefined for open goals and goals without one. */
  stepCompletionTexts: (string | undefined)[];
  hint: string;
  stats: Record<string, number>;
  ending?: { id: string; text: string; correct: boolean };
  /** Set only on the update that carries a new message. */
  feedback?: string;
}

export function defineTask<S>(def: TaskDefinition<S>): TaskDefinition<S> {
  return def;
}

export type { CommandSet };
