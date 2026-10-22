import { describe, expect, test } from 'vitest';
import { MODES, make } from './helpers.js';

const PY = ['cd', 'ls', 'pwd', 'clear', 'python', 'pip', 'source', 'deactivate'];
const mk = (mode: (typeof MODES)[number]) => make(mode, undefined, PY);
const activate = (mode: string, name = '.venv') => (mode === 'windows' ? `${name}\\Scripts\\Activate.ps1` : `source ${name}/bin/activate`);
const files = (mode: string, name = '.venv') => (mode === 'windows' ? `${name}/Scripts/Activate.ps1` : `${name}/bin/activate`);

const NOT_FOUND = (mode: string, name: string) =>
  mode === 'mac' ? `zsh: command not found: ${name}` : mode === 'linux' ? `bash: ${name}: command not found` : `The term '${name}' is not recognized`;

describe.each(MODES)('python -m venv (%s)', (mode) => {
  test.each(['python', 'python3'])('%s -m venv creates the environment files', async (py) => {
    const t = mk(mode);
    expect(await t.run(`${py} -m venv .venv`)).toBe('');
    expect(t.vfs.exists(`${t.home}/${files(mode)}`)).toBe(true);
    expect(t.vfs.exists(`${t.home}/.venv/pyvenv.cfg`)).toBe(true);
    expect(t.events.filter((e) => e.type === 'custom')).toEqual([{ type: 'custom', name: 'venvCreated', data: { path: `${t.home}/.venv` } }]);
  });

  test('the environment folder has the layout of the real thing', async () => {
    const t = mk(mode);
    await t.run('python -m venv bur');
    const names = t.vfs.list(`${t.home}/bur`, { all: true }).map((e) => e.name).sort();
    expect(names).toEqual(mode === 'windows' ? ['Include', 'Lib', 'Scripts', 'pyvenv.cfg'] : ['bin', 'include', 'lib', 'pyvenv.cfg']);
  });

  test('re-running venv for an existing name creates nothing', async () => {
    const t = mk(mode);
    await t.run('python -m venv .venv');
    await t.run('python -m venv .venv');
    expect(t.events.filter((e) => e.type === 'custom')).toHaveLength(1);
    expect(t.vfs.list(t.home, { all: true }).filter((e) => e.name.startsWith('.venv'))).toHaveLength(1);
  });

  test('several cages can live in one room and in other rooms', async () => {
    const t = mk(mode);
    await t.run('python -m venv bur1');
    await t.run('python -m venv bur2');
    await t.run('python -m venv bar/bur3');
    expect(t.vfs.exists(`${t.home}/bur2/pyvenv.cfg`)).toBe(true);
    expect(t.vfs.exists(`${t.home}/bar/bur3/pyvenv.cfg`)).toBe(true);
    expect(t.events.filter((e) => e.type === 'custom')).toHaveLength(3);
  });

  test('venv without a name prints the real usage error', async () => {
    const t = mk(mode);
    const out = await t.run('python -m venv');
    expect(out).toContain('usage: venv [-h]');
    expect(out).toContain('venv: error: the following arguments are required: ENV_DIR');
  });

  test('--version, a missing script and an unknown module', async () => {
    const t = mk(mode);
    expect(await t.run('python --version')).toBe('Python 3.12.4');
    expect(await t.run('python foo.py')).toMatch(/^python: can't open file '.*foo\.py': \[Errno 2\] No such file or directory$/);
    expect(await t.run('python -m nope')).toMatch(/No module named nope$/);
  });

  test('a name that is already a file is an error', async () => {
    const t = make(mode, (v, h) => v.addFile(h, 'fil'), PY);
    expect(await t.run('python -m venv fil')).toMatch(/File exists/);
  });
});

describe.each(MODES)('activating (%s)', (mode) => {
  test('activation sets env.venv, the prompt gets (.venv) and deactivate removes it', async () => {
    const t = mk(mode);
    await t.run('python -m venv .venv');
    const before = t.shell.prompt();
    expect(await t.run(activate(mode))).toBe('');
    expect(t.shell.env.venv).toBe('.venv');
    expect(t.shell.prompt()).toBe(`(.venv) ${before}`);
    expect(await t.run('deactivate')).toBe('');
    expect(t.shell.env.venv).toBeUndefined();
    expect(t.shell.prompt()).toBe(before);
    expect(t.events.filter((e) => e.type === 'custom').map((e) => (e as { name: string }).name)).toEqual([
      'venvCreated', 'venvActivated', 'venvDeactivated',
    ]);
  });

  test('the prompt keeps the prefix after cd to another room', async () => {
    const t = mk(mode);
    await t.run('python -m venv .venv');
    await t.run(activate(mode));
    await t.run('cd bar');
    expect(t.shell.prompt().startsWith('(.venv) ')).toBe(true);
  });

  test('deactivate is only a command while an environment is active', async () => {
    const t = mk(mode);
    expect(await t.run('deactivate')).toContain(NOT_FOUND(mode, 'deactivate'));
  });

  test('activating a second environment replaces the first', async () => {
    const t = mk(mode);
    await t.run('python -m venv a1');
    await t.run('python -m venv b2');
    await t.run(activate(mode, 'a1'));
    await t.run(activate(mode, 'b2'));
    expect(t.shell.env.venv).toBe('b2');
    expect(t.shell.prompt().startsWith('(b2) ')).toBe(true);
  });

  test('works from another room with a relative path', async () => {
    const t = mk(mode);
    await t.run('python -m venv bar/bur');
    await t.run(mode === 'windows' ? 'bar\\bur\\Scripts\\Activate.ps1' : 'source bar/bur/bin/activate');
    expect(t.shell.env.venv).toBe('bur');
  });
});

describe('activation forms', () => {
  test.each(['mac', 'linux'] as const)('%s: source and . both work', async (mode) => {
    const t = mk(mode);
    await t.run('python -m venv .venv');
    await t.run('. .venv/bin/activate');
    expect(t.shell.env.venv).toBe('.venv');
    await t.run('deactivate');
    await t.run('source ./.venv/bin/activate');
    expect(t.shell.env.venv).toBe('.venv');
  });

  test('windows: with and without a leading .\\ and dot-sourced', async () => {
    const t = mk('windows');
    await t.run('python -m venv .venv');
    for (const form of ['.venv\\Scripts\\activate', '.\\.venv\\Scripts\\Activate', '.\\.venv\\Scripts\\Activate.ps1', '.venv\\Scripts\\activate.ps1', '. .\\.venv\\Scripts\\Activate.ps1', '.venv/Scripts/Activate.ps1']) {
      await t.run('deactivate');
      await t.run(form);
      expect(t.shell.env.venv, form).toBe('.venv');
    }
  });

  test('unix cannot run the activate file directly', async () => {
    const t = mk('linux');
    await t.run('python -m venv .venv');
    expect(await t.run('./.venv/bin/activate')).toBe('bash: ./.venv/bin/activate: Permission denied');
    expect((await mk('mac').run('./nope/bin/activate'))).toBe('zsh: no such file or directory: ./nope/bin/activate');
  });

  test('source of a missing file and with no argument', async () => {
    expect(await mk('linux').run('source nope/bin/activate')).toBe('bash: source: nope/bin/activate: file not found');
    expect(await mk('linux').run('. nope/bin/activate')).toBe('bash: .: nope/bin/activate: file not found');
    expect(await mk('mac').run('source nope/bin/activate')).toBe('source: no such file or directory: nope/bin/activate');
    expect(await mk('linux').run('source')).toContain('filename argument required');
    expect(await mk('mac').run('source')).toBe('source: not enough arguments');
    expect(await mk('windows').run('nope\\Scripts\\Activate.ps1')).toContain('is not recognized');
  });

  test('letter case follows the file system: mac finds BUR, linux does not', async () => {
    const m = mk('mac');
    await m.run('python -m venv bur');
    await m.run('source BUR/bin/activate');
    expect(m.shell.env.venv).toBe('bur');
    const l = mk('linux');
    await l.run('python -m venv bur');
    await l.run('python -m venv BUR');
    expect(l.vfs.exists(`${l.home}/BUR/pyvenv.cfg`)).toBe(true);
  });
});

describe.each(MODES)('pip install (%s)', (mode) => {
  const PIP = [
    'Collecting pet_python',
    '  Downloading pet_python-1.0.0-py3-none-any.whl.metadata (2.1 kB)',
    'Downloading pet_python-1.0.0-py3-none-any.whl (12 kB)',
    'Installing collected packages: pet_python',
    'Successfully installed pet_python-1.0.0',
  ].join('\n');

  test.each(['pip install pet_python', 'pip3 install pet_python', 'python -m pip install pet_python', 'pip install pet-python', 'pip install --upgrade Pet_Python'])(
    '%s looks like real pip',
    async (cmd) => {
      const t = mk(mode);
      expect(await t.run(cmd)).toBe(PIP);
    },
  );

  test('emits pipInstall with the active environment, or null', async () => {
    const t = mk(mode);
    await t.run('pip install pet_python');
    await t.run('python -m venv .venv');
    await t.run(activate(mode));
    await t.run('pip install pet_python');
    await t.run('deactivate');
    await t.run('pip install pet_python');
    const installs = t.events.filter((e) => e.type === 'custom' && (e as { name: string }).name === 'pipInstall');
    expect(installs.map((e) => (e as { data: unknown }).data)).toEqual([
      { package: 'pet_python', venvPath: null },
      { package: 'pet_python', venvPath: `${t.home}/.venv` },
      { package: 'pet_python', venvPath: null },
    ]);
  });

  test('repeated installs each add another python (unlike real pip)', async () => {
    const t = mk(mode);
    for (let i = 0; i < 3; i++) expect(await t.run('pip install pet_python')).toBe(PIP);
    expect(t.events.filter((e) => e.type === 'custom')).toHaveLength(3);
  });

  test('unknown packages, no requirement and unknown commands', async () => {
    const t = mk(mode);
    expect(await t.run('pip install requests')).toBe(
      'ERROR: Could not find a version that satisfies the requirement requests (from versions: none)\nERROR: No matching distribution found for requests',
    );
    expect(await t.run('pip install')).toBe('ERROR: You must give at least one requirement to install (see "pip help install")');
    expect(await t.run('pip frobnicate')).toBe('ERROR: unknown command "frobnicate"');
    expect(t.events.filter((e) => e.type === 'custom')).toHaveLength(0);
  });

  test('pip --version', async () => {
    expect(await mk(mode).run('pip --version')).toMatch(/^pip 24\.0 from .*site-packages[\\/]pip \(python 3\.12\)$/);
  });
});
