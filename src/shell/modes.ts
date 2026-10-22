import type { Vfs } from './vfs.js';

export type OsMode = 'mac' | 'linux' | 'windows';

export interface ModeSpec {
  shellName: 'zsh' | 'bash' | 'powershell';
  /** Folder and file names ignore letter case (macOS and Windows defaults). */
  caseInsensitive: boolean;
  /** Command names ignore letter case (PowerShell only). */
  commandsCaseInsensitive: boolean;
  sep: '/' | '\\';
}

export const MODE_SPECS: Record<OsMode, ModeSpec> = {
  mac: { shellName: 'zsh', caseInsensitive: true, commandsCaseInsensitive: false, sep: '/' },
  linux: { shellName: 'bash', caseInsensitive: false, commandsCaseInsensitive: false, sep: '/' },
  windows: { shellName: 'powershell', caseInsensitive: true, commandsCaseInsensitive: true, sep: '\\' },
};

/** The task tree is mounted here. Internal paths are POSIX in every mode. */
export function osHome(mode: OsMode, user: string): string {
  return mode === 'linux' ? `/home/${user}` : `/Users/${user}`;
}

/** Realistic, mostly empty parents so `cd ..`, `cd /` and `cd C:\` behave like the real thing. */
export function buildSkeleton(vfs: Vfs, mode: OsMode, user: string): void {
  const top: Record<OsMode, string[]> = {
    mac: ['Applications', 'Library', 'System', 'Users', 'bin', 'etc', 'tmp', 'usr', 'var'],
    linux: ['bin', 'etc', 'home', 'opt', 'tmp', 'usr', 'var'],
    windows: ['Program Files', 'Program Files (x86)', 'Users', 'Windows'],
  };
  for (const d of top[mode]) vfs.mkdir(`/${d}`);
  if (mode !== 'linux') vfs.mkdir(`/Users/${mode === 'mac' ? 'Shared' : 'Public'}`);
  vfs.mkdir(osHome(mode, user));
}

/** POSIX path -> what the student sees. */
export function displayPath(mode: OsMode, path: string): string {
  if (mode !== 'windows') return path;
  return 'C:' + (path === '/' ? '\\' : path.replace(/\//g, '\\'));
}

/** Path shown in the prompt, abbreviated the way each shell does it. */
function promptDir(mode: OsMode, cwd: string, home: string): string {
  const base = cwd === '/' ? '/' : cwd.slice(cwd.lastIndexOf('/') + 1);
  if (mode === 'mac') return cwd === home ? '~' : base;
  if (mode === 'linux') {
    if (cwd === home) return '~';
    return cwd.startsWith(home + '/') ? '~' + cwd.slice(home.length) : cwd;
  }
  return displayPath(mode, cwd);
}

export function promptText(
  mode: OsMode,
  p: { user: string; host: string; cwd: string; home: string; venv?: string },
): string {
  const venv = p.venv ? `(${p.venv}) ` : '';
  const dir = promptDir(mode, p.cwd, p.home);
  if (mode === 'mac') return `${venv}${p.user}@${p.host} ${dir} % `;
  if (mode === 'linux') return `${venv}${p.user}@${p.host}:${dir}$ `;
  return `${venv}PS ${dir}> `;
}

/** Text in the terminal window's title bar, as each OS's terminal app shows it. */
export function windowTitle(
  mode: OsMode,
  p: { user: string; host: string; cwd: string; home: string; cols: number; rows: number },
): string {
  if (mode === 'windows') return 'Windows PowerShell';
  if (mode === 'linux') return `${p.user}@${p.host}: ${promptDir(mode, p.cwd, p.home)}`;
  const dir = p.cwd === p.home ? p.user : promptDir(mode, p.cwd, p.home);
  return `${dir} — -zsh — ${p.cols}×${p.rows}`;
}

export interface PsErrorOpts {
  /** Name shown before the colon, as the student typed it. */
  name: string;
  message: string;
  category: string;
  id: string;
  /** The full line, its 1-based start column for this statement and how many characters get the ~~~ underline. */
  line: string;
  col?: number;
  underline: number;
}

/** A Windows PowerShell 5.1 error record, rendered the way the console prints it. */
export function psError(o: PsErrorOpts): string {
  return [
    `${o.name} : ${o.message}`,
    `At line:1 char:${o.col ?? 1}`,
    `+ ${o.line}`,
    `+ ${' '.repeat((o.col ?? 1) - 1)}${'~'.repeat(Math.max(1, o.underline))}`,
    `    + CategoryInfo          : ${o.category}`,
    `    + FullyQualifiedErrorId : ${o.id}`,
    '',
  ].join('\n');
}

export function commandNotFound(mode: OsMode, name: string, line: string, col: number): string {
  if (mode === 'mac') return `zsh: command not found: ${name}`;
  if (mode === 'linux') return `bash: ${name}: command not found`;
  return psError({
    name,
    message: `The term '${name}' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of the name, or if a path was included, verify that the path is correct and try again.`,
    category: `ObjectNotFound: (${name}:String) [], CommandNotFoundException`,
    id: 'CommandNotFoundException',
    line,
    col,
    underline: name.length,
  });
}
