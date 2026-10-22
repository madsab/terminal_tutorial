import { displayPath } from '../modes.js';
import type { CommandContext, RunResult } from '../engine.js';

const PACKAGE = 'pet_python';
const VERSION = '1.0.0';

const normalise = (req: string) =>
  req
    .replace(/[=<>!~[].*$/, '')
    .toLowerCase()
    .replace(/[-_.]+/g, '_');

function pipVersion(ctx: CommandContext): string {
  const venv = ctx.shell.env.venvPath as string | undefined;
  if (venv) return `pip 24.0 from ${displayPath(ctx.mode, `${venv}/lib/python3.12/site-packages/pip`)} (python 3.12)`;
  const system = {
    mac: '/Library/Frameworks/Python.framework/Versions/3.12/lib/python3.12/site-packages/pip',
    linux: '/usr/local/lib/python3.12/site-packages/pip',
    windows: `C:\\Users\\${ctx.shell.user}\\AppData\\Local\\Programs\\Python\\Python312\\Lib\\site-packages\\pip`,
  }[ctx.mode];
  return `pip 24.0 from ${system} (python 3.12)`;
}

const fail = (output: string): RunResult => ({ output, ok: false });

/** `pip ...` and `python -m pip ...`. Only pet_python can be installed, and every install adds one more. */
export function pipRun(ctx: CommandContext, args: string[]): RunResult {
  const sub = args[0];
  if (sub === undefined || sub === '--help' || sub === '-h') {
    return { output: '\nUsage:   \n  pip <command> [options]\n\nCommands:\n  install     Install packages.\n  list        List installed packages.\n' };
  }
  if (sub === '--version' || sub === '-V') return { output: pipVersion(ctx) };
  if (sub !== 'install') return fail(`ERROR: unknown command "${sub}"`);

  const reqs = args.slice(1).filter((a) => !a.startsWith('-'));
  if (reqs.length === 0) return fail('ERROR: You must give at least one requirement to install (see "pip help install")');
  const unknown = reqs.find((r) => normalise(r) !== PACKAGE);
  if (unknown) {
    return fail(
      `ERROR: Could not find a version that satisfies the requirement ${unknown} (from versions: none)\nERROR: No matching distribution found for ${unknown}`,
    );
  }
  const venvPath = (ctx.shell.env.venvPath as string | undefined) ?? null;
  for (let i = 0; i < reqs.length; i++) ctx.emit({ type: 'custom', name: 'pipInstall', data: { package: PACKAGE, venvPath } });
  return {
    output: [
      `Collecting ${PACKAGE}`,
      `  Downloading ${PACKAGE}-${VERSION}-py3-none-any.whl.metadata (2.1 kB)`,
      `Downloading ${PACKAGE}-${VERSION}-py3-none-any.whl (12 kB)`,
      `Installing collected packages: ${PACKAGE}`,
      `Successfully installed ${PACKAGE}-${VERSION}`,
    ].join('\n'),
  };
}
