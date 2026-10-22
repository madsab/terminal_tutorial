import type { Command, CommandContext, RunResult } from '../engine.js';
import { pipRun } from './pip.js';

const fail = (output: string): RunResult => ({ output, ok: false });

const VENV_USAGE = [
  'usage: venv [-h] [--system-site-packages] [--symlinks | --copies] [--clear]',
  '            [--upgrade] [--without-pip] [--prompt PROMPT] [--upgrade-deps]',
  '            [--without-scm-ignore-files]',
  '            ENV_DIR [ENV_DIR ...]',
].join('\n');

/** Lays out the files of a fresh environment, as the real venv module does for the OS. */
function createVenv(ctx: CommandContext, path: string): void {
  const { vfs, mode } = ctx;
  vfs.mkdir(path);
  vfs.addFile(path, 'pyvenv.cfg', 'home = /usr/local/bin\ninclude-system-site-packages = false\nversion = 3.12.4\n');
  if (mode === 'windows') {
    for (const f of ['Activate.ps1', 'activate.bat', 'deactivate.bat', 'pip.exe', 'python.exe']) vfs.addFile(`${path}/Scripts`, f);
    vfs.mkdir(`${path}/Include`);
    vfs.mkdir(`${path}/Lib/site-packages`);
  } else {
    for (const f of ['activate', 'Activate.ps1', 'pip', 'pip3', 'python', 'python3']) vfs.addFile(`${path}/bin`, f);
    vfs.mkdir(`${path}/include`);
    vfs.mkdir(`${path}/lib/python3.12/site-packages`);
  }
  ctx.emit({ type: 'custom', name: 'venvCreated', data: { path } });
}

function venv(ctx: CommandContext, args: string[]): RunResult {
  const dirs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-h' || args[i] === '--help') return { output: VENV_USAGE };
    if (args[i] === '--prompt') i++;
    else if (!args[i].startsWith('--')) dirs.push(args[i]);
  }
  if (dirs.length === 0) return fail(`${VENV_USAGE}\nvenv: error: the following arguments are required: ENV_DIR`);
  for (const dir of dirs) {
    const res = ctx.shell.resolve(dir);
    if (res.entry?.kind === 'dir') continue; // already there: real venv just reuses it
    if (res.entry) return fail(`Error: [Errno 17] File exists: '${ctx.shell.display(res.path)}'`);
    try {
      createVenv(ctx, res.path);
    } catch {
      return fail(`Error: [Errno 20] Not a directory: '${ctx.shell.display(res.path)}'`);
    }
  }
  return { output: '' };
}

export const python: Command = (ctx) => {
  const [first, ...rest] = ctx.args;
  if (first === undefined) {
    return { output: 'Python 3.12.4 (main, Jun  6 2024, 18:26:44)\nType "help", "copyright", "credits" or "license" for more information.' };
  }
  if (first === '--version' || first === '-V') return { output: 'Python 3.12.4' };
  if (first === '-m') {
    const [module, ...margs] = rest;
    if (module === 'venv') return venv(ctx, margs);
    if (module === 'pip') return pipRun(ctx, margs);
    return fail(`${ctx.name}: No module named ${module ?? ''}`);
  }
  const abs = ctx.shell.display(ctx.shell.resolve(first).path);
  return fail(`${ctx.name}: can't open file '${abs}': [Errno 2] No such file or directory`);
};

export const pip: Command = (ctx) => pipRun(ctx, ctx.args);
