import { commandNotFound } from '../modes.js';
import type { Command, CommandContext, RunResult } from '../engine.js';

const fail = (output: string): RunResult => ({ output, ok: false });

/** The venv folder an activate script belongs to, or undefined when the path is not one. */
function venvDirOf(ctx: CommandContext, path: string): string | undefined {
  const entry = ctx.vfs.stat(path);
  const expected = ctx.mode === 'windows' ? 'activate.ps1' : 'activate';
  if (entry?.kind !== 'file' || entry.name.toLowerCase() !== expected) return undefined;
  const dir = path.split('/').slice(0, -2).join('/') || '/';
  return ctx.vfs.exists(`${dir}/pyvenv.cfg`) ? dir : undefined;
}

/** `source` and `.` on zsh/bash, and running (or dot-sourcing) Activate.ps1 on PowerShell. */
export const source: Command = (ctx) => {
  const { shell, args, mode, name } = ctx;
  const arg = args[0];
  if (arg === undefined) {
    if (mode === 'windows') return fail(commandNotFound(mode, name, ctx.line, ctx.col));
    return fail(mode === 'mac' ? `${name}: not enough arguments` : `bash: ${name}: filename argument required\n${name}: usage: ${name} filename [arguments]`);
  }
  const res = shell.resolve(arg);
  if (!res.entry) {
    if (mode === 'windows') return fail(commandNotFound(mode, arg, ctx.line, ctx.col));
    return fail(mode === 'mac' ? `${name}: no such file or directory: ${arg}` : `bash: ${name}: ${arg}: file not found`);
  }
  const dir = venvDirOf(ctx, res.path);
  if (dir) {
    shell.env.venv = dir.slice(dir.lastIndexOf('/') + 1);
    shell.env.venvPath = dir;
    ctx.emit({ type: 'custom', name: 'venvActivated', data: { path: dir } });
  }
  return { output: '' };
};

/** `deactivate` only exists while an environment is active, like the shell function the real activate defines. */
export const deactivate: Command = (ctx) => {
  const { shell } = ctx;
  if (!shell.env.venv) return fail(commandNotFound(ctx.mode, ctx.name, ctx.line, ctx.col));
  const path = shell.env.venvPath;
  delete shell.env.venv;
  delete shell.env.venvPath;
  ctx.emit({ type: 'custom', name: 'venvDeactivated', data: { path } });
  return { output: '' };
};
