import { psError, type OsMode } from '../modes.js';
import type { Command, CommandContext, RunResult, Shell } from '../engine.js';
import type { Entry } from '../vfs.js';
import type { LibraryEntry } from './index.js';

const ok = (output: string): RunResult => ({ output });
const fail = (output: string): RunResult => ({ output, ok: false });

const LS_DATE = 'Oct 18 12:00';
const PS_DATE = '10/18/2026   2:30 PM';
const MAC_LS_FLAGS = '@ABCFGHILOPRSTUWabcdefghiklmnopqrstuvwxy1%,';
const LINUX_LS_FLAGS = 'abcdfghiklmnopqrstuvxABCDFGHILNQRSTUXZ1';

const joinPath = (dir: string, name: string) => (dir === '/' ? `/${name}` : `${dir}/${name}`);

// ---------- cd ----------

const cd: Command = (ctx) => {
  const { shell, args, mode } = ctx;
  if (mode === 'windows') return cdPowerShell(ctx);

  const isBash = mode === 'linux';
  let rest = args;
  while (rest[0] === '-L' || rest[0] === '-P') rest = rest.slice(1);
  if (isBash && rest[0]?.length > 1 && rest[0].startsWith('-') && rest[0] !== '--') {
    return fail(`bash: cd: ${rest[0]}: invalid option\ncd: usage: cd [-L|[-P [-e]] [-@]] [dir]`);
  }
  if (rest.length > 1) {
    return fail(isBash ? 'bash: cd: too many arguments' : `cd: string not in pwd: ${rest[0]}`);
  }
  const arg = rest[0];
  if (arg === undefined) {
    shell.setCwd(shell.home);
    return ok('');
  }
  if (arg === '-') {
    if (!shell.oldpwd) return fail('bash: cd: OLDPWD not set');
    const target = shell.oldpwd;
    shell.setCwd(target);
    return ok(target);
  }
  const res = shell.resolve(arg);
  if (!res.entry) return fail(isBash ? `bash: cd: ${arg}: No such file or directory` : `cd: no such file or directory: ${arg}`);
  if (res.entry.kind !== 'dir') return fail(isBash ? `bash: cd: ${arg}: Not a directory` : `cd: not a directory: ${arg}`);
  shell.setCwd(res.path);
  return ok('');
};

function cdPowerShell({ shell, args, name, line, col, text }: CommandContext): RunResult {
  const err = (message: string, category: string, id: string): RunResult =>
    fail(psError({ name, message, category, id: `${id},Microsoft.PowerShell.Commands.SetLocationCommand`, line, col, underline: text.length }));
  if (args.length > 1) {
    return err(
      `A positional parameter cannot be found that accepts argument '${args[1]}'.`,
      'InvalidArgument: (:) [Set-Location], ParameterBindingException',
      'PositionalParameterNotFound',
    );
  }
  if (args.length === 0) return ok('');
  const res = shell.resolve(args[0]);
  if (res.badDrive) {
    return err(
      `Cannot find drive. A drive with the name '${res.badDrive}' does not exist.`,
      `ObjectNotFound: (${res.badDrive}:String) [Set-Location], DriveNotFoundException`,
      'DriveNotFound',
    );
  }
  const shown = shell.display(res.path);
  if (!res.entry) {
    return err(`Cannot find path '${shown}' because it does not exist.`, `ObjectNotFound: (${shown}:String) [Set-Location], ItemNotFoundException`, 'PathNotFound');
  }
  if (res.entry.kind !== 'dir') {
    return err(
      `Cannot set location because path '${shown}' is not a container.`,
      `InvalidArgument: (${shown}:String) [Set-Location], InvalidOperationException`,
      'PathIsNotContainer',
    );
  }
  shell.setCwd(res.path);
  return ok('');
}

// ---------- ls ----------

interface Row {
  name: string;
  kind: Entry['kind'];
  hidden: boolean;
  path: string;
}

function rowsFor(shell: Shell, dir: string, all: boolean): Row[] {
  const rows: Row[] = shell.vfs
    .list(dir, { all })
    .map((e) => ({ ...e, path: joinPath(dir, e.name) }));
  return rows;
}

function sortRows(mode: OsMode, rows: Row[]): Row[] {
  const key = (n: string) => n.replace(/^\./, '').toLowerCase();
  const cmp =
    mode === 'mac'
      ? (a: Row, b: Row) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
      : (a: Row, b: Row) => key(a.name).localeCompare(key(b.name)) || (a.name < b.name ? -1 : 1);
  return [...rows].sort(cmp);
}

function unixName(mode: OsMode, r: Row): string {
  if (mode !== 'linux') return r.name;
  if (r.kind === 'dir') return `\x1b[01;34m${r.name}\x1b[0m`;
  if (r.kind === 'script') return `\x1b[01;32m${r.name}\x1b[0m`;
  return r.name;
}

function childDirs(shell: Shell, path: string): number {
  return shell.vfs.list(path, { all: true }).filter((e) => e.kind === 'dir').length;
}

function longListing(shell: Shell, mode: OsMode, rows: Row[], withTotal: boolean): string[] {
  const mac = mode === 'mac';
  const info = rows.map((r) => {
    const dir = r.kind === 'dir';
    const dirs = dir ? childDirs(shell, r.path) : 0;
    const count = dir ? shell.vfs.list(r.path, { all: true }).length : 0;
    return {
      r,
      perms: dir ? 'drwxr-xr-x' : r.kind === 'script' ? '-rwxr-xr-x' : '-rw-r--r--',
      links: dir ? 2 + dirs : 1,
      size: dir ? (mac ? 64 + 32 * count : 4096) : r.kind === 'script' ? 124 : (shell.vfs.stat(r.path)?.content?.length ?? 0),
      blocks: dir ? (mac ? 0 : 4) : mac ? 8 : 4,
    };
  });
  const lw = Math.max(...info.map((i) => String(i.links).length), 1);
  const sw = Math.max(...info.map((i) => String(i.size).length), 1);
  const group = mac ? 'staff' : shell.user;
  const lines = info.map((i) => {
    const name = unixName(mode, i.r);
    return mac
      ? `${i.perms} ${String(i.links).padStart(lw + 2)} ${shell.user}  ${group}  ${String(i.size).padStart(sw)} ${LS_DATE} ${name}`
      : `${i.perms} ${String(i.links).padStart(lw)} ${shell.user} ${group} ${String(i.size).padStart(sw)} ${LS_DATE} ${name}`;
  });
  const total = info.reduce((n, i) => n + i.blocks, 0);
  return withTotal ? [`total ${total}`, ...lines] : lines;
}

function lsUnix({ shell, args, mode }: CommandContext): RunResult {
  const valid = mode === 'mac' ? MAC_LS_FLAGS : LINUX_LS_FLAGS;
  const flags = new Set<string>();
  const targets: string[] = [];
  let endOfFlags = false;
  for (const a of args) {
    if (!endOfFlags && a === '--') endOfFlags = true;
    else if (!endOfFlags && a.startsWith('--')) {
      if (a === '--all') flags.add('a');
      else if (a === '--almost-all') flags.add('A');
      else if (!/^--(color|group-directories-first|human-readable|classify)(=.*)?$/.test(a) || mode === 'mac') {
        return fail(
          mode === 'mac'
            ? `ls: illegal option -- -\nusage: ls [${MAC_LS_FLAGS}] [--color=when] [-D format] [file ...]`
            : `ls: unrecognized option '${a}'\nTry 'ls --help' for more information.`,
        );
      }
    } else if (!endOfFlags && a.startsWith('-') && a.length > 1) {
      for (const c of a.slice(1)) {
        if (!valid.includes(c)) {
          return fail(
            mode === 'mac'
              ? `ls: illegal option -- ${c}\nusage: ls [${MAC_LS_FLAGS}] [--color=when] [-D format] [file ...]`
              : `ls: invalid option -- '${c}'\nTry 'ls --help' for more information.`,
          );
        }
        flags.add(c);
      }
    } else targets.push(a);
  }
  const showAll = flags.has('a');
  const showAlmost = flags.has('A');
  const long = flags.has('l');
  const oneEach = flags.has('1') || long;
  if (targets.length === 0) targets.push('.');

  const errors: string[] = [];
  const fileRows: Row[] = [];
  const dirs: { arg: string; path: string }[] = [];
  for (const t of targets) {
    const res = shell.resolve(t);
    if (!res.entry) {
      errors.push(mode === 'mac' ? `ls: ${t}: No such file or directory` : `ls: cannot access '${t}': No such file or directory`);
    } else if (res.entry.kind === 'dir') dirs.push({ arg: t, path: res.path });
    else fileRows.push({ ...res.entry, path: res.path, name: t });
  }

  const render = (rows: Row[], withTotal: boolean): string => {
    const sorted = sortRows(mode, rows);
    if (long) return longListing(shell, mode, sorted, withTotal && (mode === 'linux' || sorted.length > 0)).join('\n');
    const names = sorted.map((r) => unixName(mode, r));
    return oneEach ? names.join('\n') : names.join('  ');
  };

  const sections: string[] = [];
  if (fileRows.length) sections.push(render(fileRows, false));
  for (const d of dirs) {
    let rows = rowsFor(shell, d.path, showAll || showAlmost);
    if (showAll) {
      const parent = d.path.slice(0, d.path.lastIndexOf('/')) || '/';
      rows = [
        { name: '.', kind: 'dir', hidden: true, path: d.path },
        { name: '..', kind: 'dir', hidden: true, path: parent },
        ...rows,
      ];
    }
    const body = render(rows, true);
    const head = targets.length > 1 ? `${d.arg}:` : '';
    sections.push([head, body].filter((s) => s !== '').join('\n'));
  }
  const text = [...errors, sections.filter((s) => s !== '').join('\n\n')].filter((s) => s !== '').join('\n');
  return { output: text, ok: errors.length === 0 };
}

function psRow(r: Row, length: number | undefined): string {
  const mode = (r.kind === 'dir' ? 'd' : '-') + (r.kind === 'dir' ? '-' : 'a') + '-' + (r.hidden ? 'h' : '-') + '--';
  return `${mode.padEnd(13)} ${PS_DATE.padStart(20)} ${String(length ?? '').padStart(14)} ${r.name}`;
}

function lsPowerShell({ shell, args, name, line, col, text }: CommandContext): RunResult {
  const err = (message: string, category: string, id: string): RunResult =>
    fail(psError({ name, message, category, id: `${id},Microsoft.PowerShell.Commands.GetChildItemCommand`, line, col, underline: text.length }));

  let force = false;
  let namesOnly = false;
  let onlyDirs = false;
  let onlyFiles = false;
  const targets: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const lower = a.toLowerCase();
    if (lower === '-force') force = true;
    else if (lower === '-name') namesOnly = true;
    else if (lower === '-directory') onlyDirs = true;
    else if (lower === '-file') onlyFiles = true;
    else if (lower === '-path' || lower === '-literalpath') {
      if (args[i + 1] !== undefined) targets.push(args[++i]);
    } else if (a.startsWith('-') && a.length > 1) {
      return err(
        `A parameter cannot be found that matches parameter name '${a.slice(1)}'.`,
        'InvalidArgument: (:) [Get-ChildItem], ParameterBindingException',
        'NamedParameterNotFound',
      );
    } else targets.push(a);
  }
  if (targets.length === 0) targets.push('.');

  const out: string[] = [];
  for (const t of targets) {
    const res = shell.resolve(t);
    if (res.badDrive) {
      return err(
        `Cannot find drive. A drive with the name '${res.badDrive}' does not exist.`,
        `ObjectNotFound: (${res.badDrive}:String) [Get-ChildItem], DriveNotFoundException`,
        'DriveNotFound',
      );
    }
    const shown = shell.display(res.path);
    if (!res.entry) {
      return err(`Cannot find path '${shown}' because it does not exist.`, `ObjectNotFound: (${shown}:String) [Get-ChildItem], ItemNotFoundException`, 'PathNotFound');
    }
    const isDir = res.entry.kind === 'dir';
    const dir = isDir ? res.path : res.path.slice(0, res.path.lastIndexOf('/')) || '/';
    let rows: Row[] = isDir ? rowsFor(shell, dir, force) : [{ ...res.entry, path: res.path }];
    if (onlyDirs) rows = rows.filter((r) => r.kind === 'dir');
    if (onlyFiles) rows = rows.filter((r) => r.kind !== 'dir');
    rows.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    if (rows.length === 0) continue;
    if (namesOnly) {
      out.push(...rows.map((r) => r.name));
      continue;
    }
    out.push(
      '',
      '',
      `    Directory: ${shell.display(dir)}`,
      '',
      '',
      `${'Mode'.padEnd(13)} ${'LastWriteTime'.padStart(20)} ${'Length'.padStart(14)} Name`,
      `${'----'.padEnd(13)} ${'-------------'.padStart(20)} ${'------'.padStart(14)} ----`,
      ...rows.map((r) => psRow(r, r.kind === 'dir' ? undefined : r.kind === 'script' ? 124 : (shell.vfs.stat(r.path)?.content?.length ?? 0))),
      '',
      '',
    );
  }
  return ok(out.join('\n'));
}

const ls: Command = (ctx) => (ctx.mode === 'windows' ? lsPowerShell(ctx) : lsUnix(ctx));

// ---------- pwd, clear ----------

const pwd: Command = ({ shell, args, mode, name, line, col, text }) => {
  if (mode === 'windows') {
    if (args.length > 0) {
      return fail(
        psError({
          name,
          message: `A positional parameter cannot be found that accepts argument '${args[0]}'.`,
          category: 'InvalidArgument: (:) [Get-Location], ParameterBindingException',
          id: 'PositionalParameterNotFound,Microsoft.PowerShell.Commands.GetLocationCommand',
          line,
          col,
          underline: text.length,
        }),
      );
    }
    return ok(`\nPath\n----\n${shell.display(shell.cwd)}\n\n`);
  }
  const bad = args.find((a) => a.startsWith('-') && a !== '-L' && a !== '-P' && a !== '--');
  if (bad) {
    return fail(mode === 'mac' ? `pwd: bad option: ${bad}` : `bash: pwd: ${bad}: invalid option\npwd: usage: pwd [-LP]`);
  }
  return ok(shell.cwd);
};

const clear: Command = () => ({ output: '', clear: true });

const named = (canonical: string, run: Command): Command => Object.assign(run, { canonical });


export const navLibrary: LibraryEntry[] = [
  { canonical: 'cd', aliases: { mac: ['cd'], linux: ['cd'], windows: ['cd', 'sl', 'chdir', 'Set-Location'] }, run: named('cd', cd) },
  { canonical: 'ls', aliases: { mac: ['ls'], linux: ['ls'], windows: ['ls', 'dir', 'gci', 'Get-ChildItem'] }, run: named('ls', ls) },
  { canonical: 'pwd', aliases: { mac: ['pwd'], linux: ['pwd'], windows: ['pwd', 'gl', 'Get-Location'] }, run: named('pwd', pwd) },
  { canonical: 'clear', aliases: { mac: ['clear'], linux: ['clear'], windows: ['clear', 'cls', 'Clear-Host'] }, run: named('clear', clear) },
];
