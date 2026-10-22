import type { Command, CommandContext, RunResult } from '../engine.js';

const fail = (output: string): RunResult => ({ output, ok: false });
const USAGE = 'usage: sudo -h | -K | -k | -V';
/** Shell builtins have no program to run as root, so the real sudo cannot find them. */
const BUILTINS = new Set(['cd', 'source', '.', 'deactivate']);
const MAX_ATTEMPTS = 3;

function promptFor(ctx: CommandContext): string {
  if (ctx.mode === 'mac') return 'Password:';
  if (ctx.mode === 'linux') return `[sudo] password for ${ctx.shell.user}: `;
  return 'Password: ';
}

/** sudo with a hidden password prompt. The password comes from the task (`env.sudoPassword`). */
export const sudo: Command = (ctx) => {
  const { shell, mode } = ctx;
  let args = ctx.args;
  let forget = false;
  while (args[0]?.startsWith('-') && args[0].length > 1) {
    const flag = args[0];
    if (flag === '--') {
      args = args.slice(1);
      break;
    }
    if (flag === '-k' || flag === '-K') forget = true;
    else if (flag === '-V') return { output: 'Sudo version 1.9.13p3' };
    else if (flag === '-h') return { output: USAGE };
    else return fail(`sudo: invalid option -- '${flag[1]}'\n${USAGE}`);
    args = args.slice(1);
  }
  if (forget) {
    delete shell.env.sudoOk;
    if (args.length === 0) return { output: '' };
  }
  if (args.length === 0) return fail(`${USAGE}\nusage: sudo -v [-ABkNnS] [-g group] [-h host] [-p prompt] [-u user]`);

  const target = args[0];
  const missing =
    mode === 'windows' ? `'${target}' is not recognized as an internal or external command,\noperable program or batch file.` : `sudo: ${target}: command not found`;
  if ((mode !== 'windows' && BUILTINS.has(target)) || !shell.canRun(target)) return fail(missing);

  const runAsRoot = () => shell.runTokens(args, { line: ctx.line, col: ctx.col, text: ctx.text }, true);
  if (shell.env.sudoOk) return runAsRoot();

  const ask = (attempt: number): NonNullable<RunResult['requestInput']> => ({
    prompt: promptFor(ctx),
    hidden: true,
    async resume(input) {
      if (input === shell.env.sudoPassword) {
        shell.env.sudoOk = true;
        return runAsRoot();
      }
      if (attempt + 1 >= MAX_ATTEMPTS) return fail(`sudo: ${MAX_ATTEMPTS} incorrect password attempts`);
      return { output: 'Sorry, try again.', requestInput: ask(attempt + 1) };
    },
  });
  return { output: '', requestInput: ask(0) };
};
