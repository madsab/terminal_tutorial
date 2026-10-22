import { describe, expect, test } from 'vitest';
import { MODES, make } from './helpers.js';

const NOT_FOUND = {
  mac: 'zsh: command not found: foo',
  linux: 'bash: foo: command not found',
} as const;

describe('prompt', () => {
  test.each([
    ['mac', 'user@macbook ~ % '],
    ['linux', 'user@ubuntu:~$ '],
    ['windows', 'PS C:\\Users\\user> '],
  ] as const)('%s at home', (mode, expected) => {
    expect(make(mode).shell.prompt()).toBe(expected);
  });

  test.each([
    ['mac', 'user@macbook bar % '],
    ['linux', 'user@ubuntu:~/bar$ '],
    ['windows', 'PS C:\\Users\\user\\bar> '],
  ] as const)('%s inside bar', async (mode, expected) => {
    const t = make(mode);
    await t.run('cd bar');
    expect(t.shell.prompt()).toBe(expected);
  });

  test('root prompts', async () => {
    const m = make('mac');
    await m.run('cd /');
    expect(m.shell.prompt()).toBe('user@macbook / % ');
    const l = make('linux');
    await l.run('cd /');
    expect(l.shell.prompt()).toBe('user@ubuntu:/$ ');
    const w = make('windows');
    await w.run('cd C:\\');
    expect(w.shell.prompt()).toBe('PS C:\\> ');
  });

  test.each(MODES)('%s shows the venv prefix', (mode) => {
    const t = make(mode);
    t.shell.env.venv = '.venv';
    expect(t.shell.prompt().startsWith('(.venv) ')).toBe(true);
  });
});

describe('ls', () => {
  test('mac/linux list names on one line, hiding dot entries', async () => {
    for (const mode of ['mac', 'linux'] as const) {
      const t = make(mode, (v, h) => v.mkdir(`${h}/.skjult`));
      expect(await t.run('ls')).toBe('bar  bord  toalett');
    }
  });

  test('ls -a shows dot entries including . and ..', async () => {
    const t = make('linux', (v, h) => v.mkdir(`${h}/.skjult`));
    expect(await t.run('ls -a')).toBe('.  ..  bar  bord  .skjult  toalett');
    const mac = make('mac', (v, h) => v.mkdir(`${h}/.skjult`));
    expect(await mac.run('ls -a')).toBe('.  ..  .skjult  bar  bord  toalett');
  });

  test('ls -la and -l give a long listing with total', async () => {
    const t = make('linux');
    const out = (await t.run('ls -l')).split('\n');
    expect(out[0]).toBe('total 12');
    expect(out[1]).toMatch(/^drwxr-xr-x 2 user user\s+4096 Oct 18 12:00 bar$/);
    const bar = make('linux');
    expect((await bar.run('ls -la')).split('\n').length).toBe(6);
    const mac = make('mac');
    expect((await mac.run('ls -l')).split('\n')[1]).toMatch(/^drwxr-xr-x\s+2 user\s+staff\s+96 Oct 18 12:00 bar$/);
  });

  test('scripts show in ls and are marked executable in long format', async () => {
    const t = make('linux');
    await t.run('cd bar');
    expect(await t.run('ls')).toBe('kjop');
    expect(await t.run('ls -l')).toMatch(/-rwxr-xr-x 1 user user\s+\d+ Oct 18 12:00 kjop/);
  });

  test('ls with a directory argument', async () => {
    for (const mode of ['mac', 'linux'] as const) {
      expect(await make(mode).run('ls bar')).toBe('kjop');
    }
  });

  test('ls of a missing path', async () => {
    expect(await make('mac').run('ls nope')).toBe('ls: nope: No such file or directory');
    expect(await make('linux').run('ls nope')).toBe("ls: cannot access 'nope': No such file or directory");
  });

  test('unknown flags print the real usage error', async () => {
    expect(await make('mac').run('ls -z')).toMatch(/^ls: illegal option -- z\nusage: ls \[/);
    expect(await make('linux').run('ls -z')).toBe("ls: invalid option -- 'z'\nTry 'ls --help' for more information.");
  });

  test('PowerShell Get-ChildItem table', async () => {
    const t = make('windows');
    const lines = (await t.run('ls')).split('\n');
    expect(lines.slice(0, 3)).toEqual(['', '', '    Directory: C:\\Users\\user']);
    expect(lines).toContain(`Mode${' '.repeat(17)}LastWriteTime         Length Name`);
    const rows = lines.filter((l) => /^d-----/.test(l));
    expect(rows.map((r) => r.split(/\s+/).at(-1))).toEqual(['bar', 'bord', 'toalett']);
  });

  test('PowerShell aliases and case-insensitive command names', async () => {
    const t = make('windows');
    const a = await t.run('ls');
    for (const cmd of ['dir', 'gci', 'Get-ChildItem', 'GET-CHILDITEM', 'LS']) expect(await t.run(cmd)).toBe(a);
  });

  test('PowerShell -Force shows hidden, unknown parameter errors like PowerShell', async () => {
    const t = make('windows', (v, h) => v.mkdir(`${h}/.skjult`));
    expect(await t.run('ls')).not.toContain('.skjult');
    expect(await t.run('ls -Force')).toContain('.skjult');
    expect(await t.run('ls -la')).toContain("A parameter cannot be found that matches parameter name 'la'.");
  });

  test('an empty folder prints nothing', async () => {
    for (const mode of MODES) {
      const t = make(mode);
      await t.run('cd bord');
      expect(await t.run('ls')).toBe('');
    }
  });
});

describe('pwd', () => {
  test('prints the full path', async () => {
    expect(await make('mac').run('pwd')).toBe('/Users/user');
    expect(await make('linux').run('pwd')).toBe('/home/user');
    const t = make('windows');
    expect(await t.run('pwd')).toBe('\nPath\n----\nC:\\Users\\user\n\n');
    expect(await t.run('Get-Location')).toBe(await t.run('gl'));
  });
});

describe('cd', () => {
  test.each(MODES)('%s: relative, ./, trailing slash, .. and ../sibling', async (mode) => {
    const t = make(mode);
    const sep = mode === 'windows' ? '\\' : '/';
    await t.run('cd bar');
    expect(t.events.at(-2)).toMatchObject({ type: 'cwdChanged', to: `${t.home}/bar` });
    await t.run('cd ..');
    await t.run('cd ./bar');
    await t.run('cd ../bord');
    await t.run('cd ..');
    await t.run(`cd bar${sep}`);
    expect(t.shell.cwd).toBe(`${t.home}/bar`);
    await t.run('cd ..');
    expect(t.shell.cwd).toBe(t.home);
  });

  test.each(MODES)('%s: multi-segment, ~ and absolute', async (mode) => {
    const t = make(mode);
    await t.run('cd bar/..');
    expect(t.shell.cwd).toBe(t.home);
    await t.run('cd bar');
    await t.run('cd ~');
    expect(t.shell.cwd).toBe(t.home);
    await t.run('cd bar');
    await t.run(`cd ${mode === 'windows' ? `C:\\Users\\user\\bord` : `${t.home}/bord`}`);
    expect(t.shell.cwd).toBe(`${t.home}/bord`);
  });

  test('cd alone goes home on unix, stays on PowerShell 5.1', async () => {
    for (const mode of ['mac', 'linux'] as const) {
      const t = make(mode);
      await t.run('cd bar');
      await t.run('cd');
      expect(t.shell.cwd).toBe(t.home);
    }
    const w = make('windows');
    await w.run('cd bar');
    expect(await w.run('cd')).toBe('');
    expect(w.shell.cwd).toBe(`${w.home}/bar`);
  });

  test('cd - returns to the previous folder on unix and prints it', async () => {
    const t = make('linux');
    await t.run('cd bar');
    expect(await t.run('cd -')).toBe('/home/user');
    expect(t.shell.cwd).toBe(t.home);
    expect(await make('linux').run('cd -')).toBe('bash: cd: OLDPWD not set');
    expect(await make('mac').run('cd -')).toBe('/Users/user');
  });

  test('PowerShell cd - is an error, as in Windows PowerShell 5.1', async () => {
    const t = make('windows');
    await t.run('cd bar');
    expect(await t.run('cd -')).toContain("Cannot find path 'C:\\Users\\user\\bar\\-' because it does not exist.");
    expect(t.shell.cwd).toBe(`${t.home}/bar`);
  });

  test('missing folder errors per shell', async () => {
    expect(await make('mac').run('cd nope')).toBe('cd: no such file or directory: nope');
    expect(await make('linux').run('cd nope')).toBe('bash: cd: nope: No such file or directory');
    const out = await make('windows').run('cd nope');
    expect(out.split('\n')).toEqual([
      "cd : Cannot find path 'C:\\Users\\user\\nope' because it does not exist.",
      'At line:1 char:1',
      '+ cd nope',
      '+ ~~~~~~~',
      '    + CategoryInfo          : ObjectNotFound: (C:\\Users\\user\\nope:String) [Set-Location], ItemNotFoundException',
      '    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.SetLocationCommand',
      '',
    ]);
  });

  test('cd into a script is not a directory', async () => {
    const t = make('linux');
    await t.run('cd bar');
    expect(await t.run('cd kjop')).toBe('bash: cd: kjop: Not a directory');
    const m = make('mac');
    await m.run('cd bar');
    expect(await m.run('cd kjop')).toBe('cd: not a directory: kjop');
  });

  test('too many arguments', async () => {
    expect(await make('linux').run('cd a b')).toBe('bash: cd: too many arguments');
    expect(await make('mac').run('cd a b')).toBe('cd: string not in pwd: a');
    expect(await make('windows').run('cd a b')).toContain("A positional parameter cannot be found that accepts argument 'b'.");
  });

  test('cd never goes above the root', async () => {
    for (const mode of MODES) {
      const t = make(mode);
      for (let i = 0; i < 6; i++) await t.run('cd ..');
      expect(t.shell.cwd).toBe('/');
      await t.run('cd ..');
      expect(t.shell.cwd).toBe('/');
    }
  });

  test('cd .. from home reaches the parent and cd / reaches the root', async () => {
    const t = make('linux');
    await t.run('cd ..');
    expect(t.shell.cwd).toBe('/home');
    expect(t.shell.prompt()).toBe('user@ubuntu:/home$ ');
    await t.run('cd /');
    expect(t.shell.cwd).toBe('/');
    expect(await t.run('ls')).toContain('home');
  });

  test('PowerShell accepts both slashes, / and C:\\', async () => {
    const t = make('windows');
    await t.run('cd bar/..');
    expect(t.shell.cwd).toBe(t.home);
    await t.run('cd bar\\..');
    expect(t.shell.cwd).toBe(t.home);
    await t.run('cd /');
    expect(t.shell.cwd).toBe('/');
    await t.run('cd C:\\Users');
    expect(t.shell.cwd).toBe('/Users');
    await t.run('Set-Location user\\bar');
    expect(t.shell.cwd).toBe('/Users/user/bar');
    expect(await t.run('cd D:\\')).toContain("Cannot find drive. A drive with the name 'D' does not exist.");
    await t.run('chdir ~');
    expect(t.shell.cwd).toBe(t.home);
    await t.run('sl bar');
    expect(t.shell.cwd).toBe(`${t.home}/bar`);
  });
});

describe('letter case', () => {
  test('linux is case-sensitive', async () => {
    const t = make('linux');
    expect(await t.run('cd BAR')).toBe('bash: cd: BAR: No such file or directory');
    expect(t.shell.cwd).toBe(t.home);
    expect(await t.run('LS')).toBe('bash: LS: command not found');
  });

  test('mac and windows folders are case-insensitive, the canonical name is used', async () => {
    for (const mode of ['mac', 'windows'] as const) {
      const t = make(mode);
      expect(await t.run('cd BAR')).toBe('');
      expect(t.shell.cwd).toBe(`${t.home}/bar`);
    }
  });

  test('mac commands stay case-sensitive, PowerShell commands are not', async () => {
    expect(await make('mac').run('LS')).toBe('zsh: command not found: LS');
    expect(await make('windows').run('LS')).toContain('Mode');
  });
});

describe('command not found', () => {
  test('per shell', async () => {
    expect(await make('mac').run('foo')).toBe(NOT_FOUND.mac);
    expect(await make('linux').run('foo')).toBe(NOT_FOUND.linux);
    expect((await make('windows').run('foo')).split('\n')).toEqual([
      "foo : The term 'foo' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of the name, or if a path was included, verify that the path is correct and try again.",
      'At line:1 char:1',
      '+ foo',
      '+ ~~~',
      '    + CategoryInfo          : ObjectNotFound: (foo:String) [], CommandNotFoundException',
      '    + FullyQualifiedErrorId : CommandNotFoundException',
      '',
    ]);
  });

  test('./name for a missing file', async () => {
    expect(await make('linux').run('./foo')).toBe('bash: ./foo: No such file or directory');
    expect(await make('mac').run('./foo')).toBe('zsh: no such file or directory: ./foo');
    expect(await make('windows').run('.\\foo')).toContain("The term '.\\foo' is not recognized");
  });
});

describe('clear', () => {
  test.each(MODES)('%s clears the screen', async (mode) => {
    const t = make(mode);
    for (const cmd of mode === 'windows' ? ['clear', 'cls', 'Clear-Host'] : ['clear']) {
      const r = await t.shell.run(cmd);
      expect(r.clear).toBe(true);
      expect(r.output).toBe('');
    }
  });
});

describe('messy input', () => {
  test.each(MODES)('%s: empty, blank and long lines never crash', async (mode) => {
    const t = make(mode);
    expect(await t.run('')).toBe('');
    expect(await t.run('     ')).toBe('');
    expect(await t.run('\t')).toBe('');
    const long = 'x'.repeat(20000);
    expect(typeof (await t.run(long))).toBe('string');
    expect(typeof (await t.run(`cd ${long}`))).toBe('string');
    expect(typeof (await t.run(`ls ${'a '.repeat(5000)}`))).toBe('string');
    expect(t.shell.cwd).toBe(t.home);
  });

  test.each(MODES)('%s: extra spaces and quoted names', async (mode) => {
    const t = make(mode, (v, h) => v.mkdir(`${h}/min mappe`));
    await t.run('   cd     bar   ');
    expect(t.shell.cwd).toBe(`${t.home}/bar`);
    await t.run('cd ..');
    await t.run('cd "bar"');
    expect(t.shell.cwd).toBe(`${t.home}/bar`);
    await t.run('cd ..');
    await t.run("cd 'min mappe'");
    expect(t.shell.cwd).toBe(`${t.home}/min mappe`);
    await t.run('cd ..');
    await t.run('cd "min mappe"');
    expect(t.shell.cwd).toBe(`${t.home}/min mappe`);
  });

  test('unix escaped space, PowerShell backtick', async () => {
    const t = make('linux', (v, h) => v.mkdir(`${h}/min mappe`));
    await t.run('cd min\\ mappe');
    expect(t.shell.cwd).toBe(`${t.home}/min mappe`);
    const w = make('windows', (v, h) => v.mkdir(`${h}/min mappe`));
    await w.run('cd min` mappe');
    expect(w.shell.cwd).toBe(`${w.home}/min mappe`);
  });

  test('an unclosed quote is a shell error, not a crash', async () => {
    expect(await make('mac').run('cd "bar')).toBe('zsh: unmatched "');
    expect(await make('linux').run('cd "bar')).toContain('unexpected EOF while looking for matching');
    expect(await make('windows').run('cd "bar')).toContain('The string is missing the terminator: ".');
  });

  test('; chains commands, && stops on failure (unix only)', async () => {
    const t = make('linux');
    expect(await t.run('cd bar; ls')).toBe('kjop');
    expect(await t.run('cd nope && ls')).toBe('bash: cd: nope: No such file or directory');
    expect(await t.run('cd .. && pwd')).toBe('/home/user');
    const w = make('windows');
    expect(await w.run('cd bar; ls')).toContain('kjop');
  });

  test.each(['mac', 'linux'] as const)('%s: unknown flags to cd and pwd do not crash', async (mode) => {
    const t = make(mode);
    expect(typeof (await t.run('cd -x'))).toBe('string');
    expect(typeof (await t.run('pwd -P'))).toBe('string');
    expect(await t.run('pwd -P')).toBe(t.home);
  });
});

describe('events', () => {
  test('cd emits cwdChanged then commandRun; failures set ok=false', async () => {
    const t = make('linux');
    await t.run('cd bar');
    await t.run('cd nope');
    await t.run('foo');
    expect(t.events).toEqual([
      { type: 'cwdChanged', from: '/home/user', to: '/home/user/bar' },
      { type: 'commandRun', name: 'cd', args: ['bar'], ok: true },
      { type: 'commandRun', name: 'cd', args: ['nope'], ok: false },
      { type: 'commandRun', name: 'foo', args: [], ok: false },
    ]);
  });

  test('a PowerShell alias emits the canonical command name', async () => {
    const t = make('windows');
    await t.run('Set-Location bar');
    await t.run('dir');
    const runs = t.events.filter((e) => e.type === 'commandRun').map((e) => (e as { name: string }).name);
    expect(runs).toEqual(['cd', 'ls']);
  });

  test('cd to the same folder does not emit cwdChanged', async () => {
    const t = make('linux');
    await t.run('cd .');
    expect(t.events.filter((e) => e.type === 'cwdChanged')).toEqual([]);
  });

  test('on() returns an unsubscribe function', async () => {
    const t = make('linux');
    const seen: string[] = [];
    const off = t.shell.on((e) => seen.push(e.type));
    await t.run('ls');
    off();
    await t.run('ls');
    expect(seen).toEqual(['commandRun']);
  });
});

describe('scripts', () => {
  test('a script runs by name and ./name through the handler, only where it lives', async () => {
    for (const mode of MODES) {
      const t = make(mode);
      const calls: string[] = [];
      t.shell.scriptHandler = (c) => {
        calls.push(`${c.name}@${c.dir}`);
        return { output: 'drikker' };
      };
      expect(await t.run('kjop')).not.toBe('drikker');
      await t.run('cd bar');
      expect(await t.run('kjop')).toBe('drikker');
      expect(await t.run(mode === 'windows' ? '.\\kjop' : './kjop')).toBe('drikker');
      expect(calls).toEqual([`kjop@${t.home}/bar`, `kjop@${t.home}/bar`]);
      expect(t.events.filter((e) => e.type === 'commandRun' && (e as { name: string }).name === 'kjop').length).toBe(3);
    }
  });

  test('a script without a handler does nothing; hidden-by-task scripts do not run', async () => {
    const t = make('linux');
    await t.run('cd bar');
    expect(await t.run('kjop')).toBe('');
    t.vfs.remove(`${t.home}/bar/kjop`);
    expect(await t.run('kjop')).toBe('bash: kjop: command not found');
  });
});

describe('Tab completion', () => {
  test('unique prefix completes, folders get a trailing slash', () => {
    const t = make('linux');
    expect(t.shell.complete('cd ba')).toEqual({ replacement: 'cd bar/', options: [] });
    expect(t.shell.complete('ls to')).toEqual({ replacement: 'ls toalett/', options: [] });
  });

  test('several matches extend to the common prefix and list the options', () => {
    const t = make('linux', (v, h) => v.mkdir(`${h}/bar2`));
    expect(t.shell.complete('cd b')).toEqual({ replacement: 'cd b', options: ['bar/', 'bar2/', 'bord/'] });
    expect(t.shell.complete('cd ba')).toEqual({ replacement: 'cd bar', options: ['bar/', 'bar2/'] });
  });

  test('no match leaves the line alone', () => {
    expect(make('mac').shell.complete('cd zzz')).toEqual({ replacement: 'cd zzz', options: [] });
  });

  test('case rules apply: mac completes BA, linux does not', () => {
    expect(make('mac').shell.complete('cd BA').replacement).toBe('cd bar/');
    expect(make('linux').shell.complete('cd BA').replacement).toBe('cd BA');
  });

  test('first word completes command names and scripts in cwd', async () => {
    const t = make('linux');
    expect(t.shell.complete('cl')).toEqual({ replacement: 'clear ', options: [] });
    await t.run('cd bar');
    expect(t.shell.complete('kj')).toEqual({ replacement: 'kjop ', options: [] });
  });

  test('PowerShell prefixes .\\ and does not add a trailing backslash', () => {
    const t = make('windows');
    expect(t.shell.complete('cd ba')).toEqual({ replacement: 'cd .\\bar', options: [] });
    expect(t.shell.complete('Set-Loc')).toEqual({ replacement: 'Set-Location ', options: [] });
  });

  test('names with spaces are escaped on unix and quoted in PowerShell', () => {
    const u = make('linux', (v, h) => v.mkdir(`${h}/min mappe`));
    expect(u.shell.complete('cd mi').replacement).toBe('cd min\\ mappe/');
    const w = make('windows', (v, h) => v.mkdir(`${h}/min mappe`));
    expect(w.shell.complete('cd mi').replacement).toBe("cd '.\\min mappe'");
  });

  test('completing a path with a directory part', () => {
    const t = make('linux');
    expect(t.shell.complete('cd bar/').replacement).toBe('cd bar/');
    expect(t.shell.complete('ls ../user/to').replacement).toBe('ls ../user/toalett/');
  });
});
