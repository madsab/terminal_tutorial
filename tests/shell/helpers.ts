import { Shell, type ShellEvent } from '../../src/shell/engine.js';
import { buildCommands } from '../../src/shell/commands/index.js';
import { buildSkeleton, osHome } from '../../src/shell/modes.js';
import { Vfs } from '../../src/shell/vfs.js';
import type { OsMode } from '../../src/shell/modes.js';

export const MODES: OsMode[] = ['mac', 'linux', 'windows'];
export const HOSTS: Record<OsMode, string> = { mac: 'macbook', linux: 'ubuntu', windows: 'PC' };

// eslint-disable-next-line no-control-regex
export const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

export function make(mode: OsMode, setup?: (vfs: Vfs, home: string) => void, commandNames: string[] = ['cd', 'ls', 'pwd', 'clear']) {
  const vfs = new Vfs();
  buildSkeleton(vfs, mode, 'user');
  const home = osHome(mode, 'user');
  vfs.mkdir(`${home}/bar`);
  vfs.mkdir(`${home}/bord`);
  vfs.mkdir(`${home}/toalett`);
  vfs.addScript(`${home}/bar`, 'kjop');
  setup?.(vfs, home);
  const shell = new Shell({
    mode,
    vfs,
    user: 'user',
    host: HOSTS[mode],
    home,
    commands: buildCommands(mode, commandNames),
  });
  const events: ShellEvent[] = [];
  shell.on((e) => events.push(e));
  /** Runs a line and returns the output without colour codes. */
  const run = async (line: string) => plain((await shell.run(line)).output);
  return { shell, vfs, home, events, run };
}
