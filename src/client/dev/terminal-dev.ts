import '../fonts.js';
import { Shell } from '../../shell/engine.js';
import { buildCommands } from '../../shell/commands/index.js';
import { buildSkeleton, osHome, type OsMode } from '../../shell/modes.js';
import { Vfs } from '../../shell/vfs.js';
import { mountTerminalWindow } from '../terminal/window-chrome.js';
import { mountTerminal } from '../terminal/xterm-shell.js';

const param = new URLSearchParams(location.search).get('os');
const mode: OsMode = param === 'linux' || param === 'windows' ? param : 'mac';
const hosts = { mac: 'macbook', linux: 'ubuntu', windows: 'PC' } as const;

const vfs = new Vfs();
buildSkeleton(vfs, mode, 'homayoon');
const home = osHome(mode, 'homayoon');
for (const d of ['bar-omrade', 'bord', 'bar-omrade/bar', 'bar-omrade/sofakrok', 'bar-omrade/toalettet', 'bar-omrade/bord', 'min mappe']) vfs.mkdir(`${home}/${d}`);
vfs.addScript(`${home}/bar-omrade/bar`, 'kjop-hiroshima');
vfs.mkdir(`${home}/.skjult`);

const shell = new Shell({
  mode,
  vfs,
  user: 'homayoon',
  host: hosts[mode],
  home,
  commands: buildCommands(mode, ['cd', 'ls', 'pwd', 'clear']),
});
shell.scriptHandler = (c) => ({ output: `(${c.name} kjørt)` });
const win = mountTerminalWindow(document.getElementById('term')!, mode);
mountTerminal(win.body, shell, mode, { onTitle: win.setTitle });
