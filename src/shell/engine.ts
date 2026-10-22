import { MODE_SPECS, commandNotFound, displayPath, promptText, psError, type OsMode } from './modes.js';
import type { Entry, Vfs } from './vfs.js';

export type ShellEvent =
  | { type: 'cwdChanged'; from: string; to: string }
  | { type: 'commandRun'; name: string; args: string[]; ok: boolean }
  | { type: 'custom'; name: string; data?: unknown };

export interface RunResult {
  /** Text to print, lines joined by \n, no trailing newline. */
  output: string;
  clear?: boolean;
  /** Defaults to true. A failed command emits commandRun with ok=false. */
  ok?: boolean;
  requestInput?: { prompt: string; hidden: boolean; resume(input: string): Promise<RunResult> | RunResult };
}

export interface CommandContext {
  args: string[];
  shell: Shell;
  vfs: Vfs;
  mode: OsMode;
  emit(e: ShellEvent): void;
  /** The name as typed, and the statement it came from (PowerShell errors quote them). */
  name: string;
  line: string;
  col: number;
  /** The statement's own text (without other statements on the line). */
  text: string;
}

export type Command = ((ctx: CommandContext) => Promise<RunResult> | RunResult) & { canonical?: string };
export type CommandSet = Record<string, Command>;

export interface ScriptCall {
  /** Script name as stored in the filesystem. */
  name: string;
  /** POSIX path of the folder the script lives in. */
  dir: string;
  args: string[];
  shell: Shell;
  /** Run through sudo. */
  sudo: boolean;
  /** The statement, for PowerShell error records. */
  line: string;
  col: number;
  text: string;
}
export type ScriptHandler = (call: ScriptCall) => Promise<RunResult> | RunResult | undefined;

export interface ShellOptions {
  mode: OsMode;
  vfs: Vfs;
  user: string;
  host: string;
  home: string;
  commands: CommandSet;
}

interface Segment {
  tokens: string[];
  /** What follows this segment. */
  op: ';' | '&&' | null;
  /** 1-based column of the segment's first character. */
  col: number;
  /** The statement's own text, for PowerShell's underline. */
  text: string;
}

type Tokenized = { segments: Segment[] } | { error: string };

const UNIX_ESCAPE = /[ !"#$&'()*;<>?[\\\]`{|}~]/g;

export class Shell {
  readonly mode: OsMode;
  readonly vfs: Vfs;
  readonly user: string;
  readonly host: string;
  readonly home: string;
  readonly commands: CommandSet;
  /** Mutable shell state, e.g. `venv`. */
  readonly env: { venv?: string; [key: string]: unknown } = {};
  /** Set by the task runtime to execute task scripts. */
  scriptHandler?: ScriptHandler;
  cwd: string;
  oldpwd?: string;
  private listeners: ((e: ShellEvent) => void)[] = [];
  private readonly spec;

  constructor(opts: ShellOptions) {
    this.mode = opts.mode;
    this.vfs = opts.vfs;
    this.user = opts.user;
    this.host = opts.host;
    this.home = opts.home;
    this.spec = MODE_SPECS[opts.mode];
    this.cwd = opts.home;
    if (opts.mode === 'mac') this.oldpwd = opts.home; // zsh starts with OLDPWD = PWD
    this.commands = opts.commands;
  }

  prompt(): string {
    return promptText(this.mode, { user: this.user, host: this.host, cwd: this.cwd, home: this.home, venv: this.env.venv });
  }

  on(listener: (e: ShellEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  emit(e: ShellEvent): void {
    for (const l of [...this.listeners]) l(e);
  }

  display(path: string): string {
    return displayPath(this.mode, path);
  }

  setCwd(to: string): void {
    const from = this.cwd;
    if (from === to) return;
    this.oldpwd = from;
    this.cwd = to;
    this.emit({ type: 'cwdChanged', from, to });
  }

  /**
   * Resolves a typed path against cwd, honouring the mode's separators, `~` and case rules.
   * Existing segments take the stored name's case. Returns undefined `entry` when anything is missing.
   * A PowerShell drive other than C: is reported through `badDrive`.
   */
  resolve(arg: string): { path: string; entry?: Entry; badDrive?: string } {
    let p = arg;
    if (this.mode === 'windows') {
      const m = /^([A-Za-z]):(.*)$/.exec(p);
      if (m) {
        if (m[1].toUpperCase() !== 'C') return { path: '/', badDrive: m[1].toUpperCase() };
        p = m[2].startsWith('\\') || m[2].startsWith('/') ? m[2] : '/' + m[2];
      }
      p = p.replace(/\\/g, '/');
    }
    if (p === '~' || p.startsWith('~/')) p = this.home + p.slice(1);
    const stack = p.startsWith('/') ? [] : this.cwd.split('/').filter(Boolean);
    let missing = false;
    for (const seg of p.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') {
        stack.pop();
        continue;
      }
      const found = missing ? undefined : this.vfs.find('/' + stack.join('/'), seg, this.spec.caseInsensitive);
      if (found === undefined) missing = true;
      stack.push(found ?? seg);
      // A door: continue from the folder it leads to, so the path stays physical.
      const target = missing ? undefined : this.vfs.stat('/' + stack.join('/'))?.target;
      if (target) stack.splice(0, stack.length, ...target.split('/').filter(Boolean));
    }
    const path = '/' + stack.join('/');
    return { path, entry: missing ? undefined : this.vfs.stat(path) };
  }

  async run(line: string): Promise<RunResult> {
    if (!line.trim()) return { output: '' };
    const parsed = this.tokenize(line);
    if ('error' in parsed) return { output: parsed.error, ok: false };
    return this.runSegments(line, parsed.segments, 0, [], false);
  }

  /** Runs statements in order. `&&` stops at the first failure. A hidden-input prompt pauses the chain. */
  private async runSegments(
    line: string,
    segs: Segment[],
    from: number,
    outputs: string[],
    cleared: boolean,
  ): Promise<RunResult> {
    const done = (ok?: boolean): RunResult => ({ output: outputs.join('\n'), clear: cleared || undefined, ok });
    const collect = (r: RunResult) => {
      if (r.clear) outputs = [];
      else if (r.output) outputs = [...outputs, r.output];
      cleared = cleared || !!r.clear;
    };
    for (let i = from; i < segs.length; i++) {
      const seg = segs[i];
      if (seg.tokens.length === 0) continue;
      const result = await this.execute(line, seg);
      if (result.requestInput) {
        const ri = result.requestInput;
        collect({ output: result.output });
        const pending = outputs;
        outputs = [];
        const resumeFrom = (prompt: NonNullable<RunResult['requestInput']>) => async (input: string): Promise<RunResult> => {
          const r = await prompt.resume(input);
          // A wrong password asks again: keep the chain paused until the prompt is really done.
          if (r.requestInput) return { ...r, requestInput: { ...r.requestInput, resume: resumeFrom(r.requestInput) } };
          return this.runSegments(line, segs, i + 1, r.output ? [r.output] : [], !!r.clear);
        };
        return {
          output: pending.join('\n'),
          clear: cleared || undefined,
          requestInput: { ...ri, resume: resumeFrom(ri) },
        };
      }
      collect(result);
      if (result.ok === false && seg.op === '&&') return done(false);
      if (i === segs.length - 1) return done(result.ok);
    }
    return done();
  }

  private lookupCommand(name: string): Command | undefined {
    if (!this.spec.commandsCaseInsensitive) return this.commands[name];
    const lower = name.toLowerCase();
    const key = Object.keys(this.commands).find((k) => k.toLowerCase() === lower);
    return key ? this.commands[key] : undefined;
  }

  private execute(line: string, seg: Segment): Promise<RunResult> {
    return this.runTokens(seg.tokens, { line, col: seg.col, text: seg.text }, false);
  }

  /** True when `name` would run something: a command, or a script in reach. Used by sudo before it asks for a password. */
  canRun(name: string): boolean {
    if (this.lookupCommand(name)) return true;
    if (!this.isPathLike(name)) {
      const stored = this.vfs.find(this.cwd, name, this.spec.commandsCaseInsensitive);
      return stored !== undefined && this.vfs.stat(`${this.cwd === '/' ? '' : this.cwd}/${stored}`)?.kind === 'script';
    }
    return this.resolve(name).entry?.kind === 'script';
  }

  private isPathLike(name: string): boolean {
    return name.includes('/') || (this.mode === 'windows' && name.includes('\\'));
  }

  /** Runs one statement's words (no parsing). `sudo` marks the run as privileged. */
  async runTokens(tokens: string[], where: { line: string; col: number; text: string }, sudo = false): Promise<RunResult> {
    const [name, ...args] = tokens;
    const { line } = where;
    let cmd = this.lookupCommand(name);
    let cmdArgs = args;
    if (!cmd && this.mode === 'windows' && this.isPathLike(name)) {
      // A file run by path (Activate.ps1) runs the command named after it and gets the typed path.
      // PowerShell finds Activate.ps1 when the extension is left off.
      const exact = this.resolve(name).entry;
      const typed = exact ? name : `${name}.ps1`;
      const entry = exact ?? this.resolve(typed).entry;
      const byFile = entry?.kind === 'file' ? this.lookupCommand(entry.name) : undefined;
      if (byFile) {
        cmd = byFile;
        cmdArgs = [typed, ...args];
      }
    }
    let canonical = name;
    let result: RunResult;

    if (cmd) {
      canonical = cmd.canonical ?? name;
      result = await cmd({
        args: cmdArgs,
        shell: this,
        vfs: this.vfs,
        mode: this.mode,
        emit: (e) => this.emit(e),
        name,
        line,
        col: where.col,
        text: where.text,
      });
    } else {
      const r = await this.runPathOrScript(name, args, where, sudo);
      result = r.result;
      canonical = r.script ?? name;
    }
    return this.finish(canonical, cmdArgs, result);
  }

  /** Emits commandRun once the command is really finished, including after a hidden-input prompt. */
  private finish(name: string, args: string[], result: RunResult): RunResult {
    if (result.requestInput) {
      const ri = result.requestInput;
      return { ...result, requestInput: { ...ri, resume: async (input) => this.finish(name, args, await ri.resume(input)) } };
    }
    this.emit({ type: 'commandRun', name, args, ok: result.ok !== false });
    return result;
  }

  private async runPathOrScript(
    name: string,
    args: string[],
    where: { line: string; col: number; text: string },
    sudo: boolean,
  ): Promise<{ result: RunResult; script?: string }> {
    const { line, col } = where;
    const pathLike = this.isPathLike(name);
    if (!pathLike) {
      // Scripts run by bare name, with the shell's command case rules.
      const stored = this.vfs.find(this.cwd, name, this.spec.commandsCaseInsensitive);
      const entry = stored === undefined ? undefined : this.vfs.stat(`${this.cwd === '/' ? '' : this.cwd}/${stored}`);
      if (stored !== undefined && entry?.kind === 'script') {
        return { result: await this.callScript(stored, this.cwd, args, sudo, where), script: stored };
      }
      return { result: { output: commandNotFound(this.mode, name, line, col), ok: false } };
    }
    const res = this.resolve(name);
    if (res.entry?.kind === 'script') {
      const dir = res.path.slice(0, res.path.lastIndexOf('/')) || '/';
      return { result: await this.callScript(res.entry.name, dir, args, sudo, where), script: res.entry.name };
    }
    const fail = (output: string) => ({ result: { output, ok: false } });
    const mac = this.mode === 'mac';
    if (this.mode === 'windows') return fail(commandNotFound(this.mode, name, line, col));
    if (res.entry?.kind === 'dir') return fail(mac ? `zsh: ${name}: is a directory` : `bash: ${name}: Is a directory`);
    if (res.entry) return fail(mac ? `zsh: permission denied: ${name}` : `bash: ${name}: Permission denied`);
    return fail(mac ? `zsh: no such file or directory: ${name}` : `bash: ${name}: No such file or directory`);
  }

  private async callScript(
    name: string,
    dir: string,
    args: string[],
    sudo: boolean,
    where: { line: string; col: number; text: string },
  ): Promise<RunResult> {
    const r = await this.scriptHandler?.({ name, dir, args, shell: this, sudo, ...where });
    return r ?? { output: '' };
  }

  /** Splits a line into statements and words the way the mode's shell does. */
  private tokenize(line: string): Tokenized {
    const ps = this.mode === 'windows';
    const segments: Segment[] = [];
    let tokens: string[] = [];
    let cur = '';
    let inWord = false;
    let segStart = -1;
    const pushWord = () => {
      if (inWord) tokens.push(cur);
      cur = '';
      inWord = false;
    };
    const endSegment = (op: ';' | '&&' | null, end: number) => {
      pushWord();
      const from = segStart < 0 ? 0 : segStart;
      segments.push({ tokens, op, col: from + 1, text: line.slice(from, end).trim() });
      tokens = [];
      segStart = -1;
    };
    const unterminated = (q: string): Tokenized => {
      if (this.mode === 'mac') return { error: `zsh: unmatched ${q}` };
      if (this.mode === 'linux') {
        return { error: `bash: unexpected EOF while looking for matching \`${q}'\nbash: syntax error: unexpected end of file` };
      }
      return {
        error: [
          `The string is missing the terminator: ${q}.`,
          '    + CategoryInfo          : ParserError: (:) [], ParentContainsErrorRecordException',
          '    + FullyQualifiedErrorId : TerminatorExpectedAtEndOfString',
          '',
        ].join('\n'),
      };
    };
    const begin = (i: number) => {
      if (segStart < 0) segStart = i;
      inWord = true;
    };

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === ' ' || c === '\t') {
        pushWord();
      } else if (c === ';') {
        endSegment(';', i);
      } else if (c === '&' && line[i + 1] === '&') {
        if (ps) {
          return {
            error: [
              `At line:1 char:${i + 1}`,
              `+ ${line}`,
              `+ ${' '.repeat(i)}~~`,
              "The token '&&' is not a valid statement separator in this version.",
              '    + CategoryInfo          : ParserError: (:) [], ParentContainsErrorRecordException',
              '    + FullyQualifiedErrorId : InvalidEndOfLine',
              '',
            ].join('\n'),
          };
        }
        endSegment('&&', i);
        i++;
      } else if (c === "'") {
        begin(i);
        const close = this.closeSingleQuote(line, i);
        if (close.end < 0) return unterminated("'");
        cur += close.text;
        i = close.end;
      } else if (c === '"') {
        begin(i);
        let j = i + 1;
        let closed = false;
        for (; j < line.length; j++) {
          const d = line[j];
          if (d === '"') {
            if (ps && line[j + 1] === '"') {
              cur += '"';
              j++;
              continue;
            }
            closed = true;
            break;
          }
          if (d === (ps ? '`' : '\\') && j + 1 < line.length && (ps || '"\\$`'.includes(line[j + 1]))) {
            cur += line[++j];
          } else cur += d;
        }
        if (!closed) return unterminated('"');
        i = j;
      } else if (c === (ps ? '`' : '\\') && i + 1 < line.length) {
        begin(i);
        cur += line[++i];
      } else {
        begin(i);
        cur += c;
      }
    }
    endSegment(null, line.length);
    return { segments: segments.filter((s) => s.tokens.length > 0 || s.op) };
  }

  /** Single quotes are literal; PowerShell also lets '' stand for one quote. */
  private closeSingleQuote(line: string, start: number): { text: string; end: number } {
    let text = '';
    for (let j = start + 1; j < line.length; j++) {
      if (line[j] === "'") {
        if (this.mode === 'windows' && line[j + 1] === "'") {
          text += "'";
          j++;
          continue;
        }
        return { text, end: j };
      }
      text += line[j];
    }
    return { text, end: -1 };
  }

  complete(line: string): { replacement: string; options: string[] } {
    const unchanged = { replacement: line, options: [] as string[] };
    const ci = this.spec.caseInsensitive;
    const ps = this.mode === 'windows';
    let start = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === ' ' && line[i - 1] !== (ps ? '`' : '\\')) start = i + 1;
    }
    const prefix = line.slice(0, start);
    const raw = line.slice(start);
    const first = prefix.trim() === '';

    const startsWith = (name: string, p: string, insensitive: boolean) =>
      insensitive ? name.toLowerCase().startsWith(p.toLowerCase()) : name.startsWith(p);
    const common = (names: string[], insensitive: boolean) => {
      let c = names[0];
      for (const n of names.slice(1)) {
        let k = 0;
        while (k < c.length && k < n.length && (insensitive ? c[k].toLowerCase() === n[k].toLowerCase() : c[k] === n[k])) k++;
        c = c.slice(0, k);
      }
      return c;
    };

    if (first) {
      const names = new Set(Object.keys(this.commands));
      for (const e of this.vfs.list(this.cwd, { all: false })) if (e.kind === 'script') names.add(e.name);
      const ciCmd = this.spec.commandsCaseInsensitive;
      const matches = [...names].filter((n) => startsWith(n, raw, ciCmd)).sort();
      if (matches.length === 0) return unchanged;
      if (matches.length === 1) return { replacement: prefix + matches[0] + ' ', options: [] };
      return { replacement: prefix + common(matches, ciCmd), options: matches };
    }

    // Path completion. `cd` only completes folders.
    const typed = ps
      ? raw.replace(/^['"]/, '').replace(/`(.)/g, '$1')
      : raw.replace(/^['"]/, '').replace(/\\(.)/g, '$1');
    const sepIdx = Math.max(typed.lastIndexOf('/'), ps ? typed.lastIndexOf('\\') : -1);
    const dirPart = typed.slice(0, sepIdx + 1);
    const namePart = typed.slice(sepIdx + 1);
    const typedDir = dirPart.replace(/^\.[\\/]/, '');
    const dirRes = dirPart === '' || /^\.[\\/]$/.test(dirPart) ? { path: this.cwd, entry: this.vfs.stat(this.cwd) } : this.resolve(dirPart);
    if (dirRes.entry?.kind !== 'dir') return unchanged;
    const cmdName = this.lookupCommand(line.trim().split(/\s+/)[0] ?? '')?.canonical;
    const foldersOnly = cmdName === 'cd';
    const entries = this.vfs
      .list(dirRes.path, { all: namePart.startsWith('.') })
      .filter((e) => (!foldersOnly || e.kind === 'dir') && startsWith(e.name, namePart, ci))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (entries.length === 0) return unchanged;

    const escape = (s: string) => {
      if (!ps) return s.replace(UNIX_ESCAPE, '\\$&');
      const text = (dirPart === '' || /^\.[\\/]$/.test(dirPart) ? '.\\' : '') + s;
      return /[ '`]/.test(text) ? `'${text.replace(/'/g, "''")}'` : text;
    };
    const dirTyped = dirPart === '' ? '' : typedDir || dirPart;
    const build = (name: string) => escape(dirTyped + name);

    if (entries.length === 1) {
      const e = entries[0];
      const trail = ps ? '' : e.kind === 'dir' ? '/' : ' ';
      return { replacement: prefix + build(e.name) + trail, options: [] };
    }
    const c = common(entries.map((e) => e.name), ci);
    const options = entries.map((e) => (e.kind === 'dir' && !ps ? `${e.name}/` : e.name));
    return { replacement: prefix + (c.length > namePart.length ? build(c) : raw), options };
  }
}

export { psError };
