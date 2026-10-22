import type { Command, CommandSet } from '../engine.js';
import type { OsMode } from '../modes.js';
import { navLibrary } from './nav.js';
import { pip, python } from './python.js';
import { sudo } from './sudo.js';
import { deactivate, source } from './venv.js';

export interface LibraryEntry {
  /** Name tasks use in `commands: [...]`. */
  canonical: string;
  /** Names the shell accepts per OS, including aliases. */
  aliases: Record<OsMode, string[]>;
  run: Command;
}

const named = (canonical: string, aliases: LibraryEntry['aliases'], run: Command): LibraryEntry => ({
  canonical,
  aliases,
  run: Object.assign(run, { canonical }),
});
const same = (...names: string[]) => ({ mac: names, linux: names, windows: names });

const pythonLibrary: LibraryEntry[] = [
  named('python', same('python', 'python3'), python),
  named('pip', same('pip', 'pip3'), pip),
  named('source', { mac: ['source', '.'], linux: ['source', '.'], windows: ['Activate.ps1', '.'] }, source),
  named('deactivate', same('deactivate'), deactivate),
  named('sudo', same('sudo'), sudo),
];

export const library: Record<string, LibraryEntry> = Object.fromEntries([...navLibrary, ...pythonLibrary].map((e) => [e.canonical, e]));

/** Commands a library command needs in order to be usable, enabled along with it. */
const implied: Record<string, string[]> = { python: ['source'] };

/** Registers library commands, by canonical name, under every alias the mode's shell has for them. */
export function buildCommands(mode: OsMode, names: string[]): CommandSet {
  const set: CommandSet = {};
  // An entry may be a whole command line (`pip install pet_python`); its first word names the library command.
  const words = names.map((n) => n.trim().split(/\s+/)[0]);
  const wanted = new Set(words.flatMap((w) => [w, ...(implied[w] ?? [])]));
  for (const n of wanted) {
    const entry = library[n];
    if (!entry) throw new Error(`Unknown command in library: ${n}`);
    for (const alias of entry.aliases[mode]) set[alias] = entry.run;
  }
  return set;
}
