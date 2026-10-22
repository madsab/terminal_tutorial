import { describe, expect, test } from 'vitest';
import { defineTask } from '../../src/tasks/api.js';
import { runTaskScript } from '../../src/tasks/testing.js';
import { TaskRuntime } from '../../src/tasks/runtime.js';
import { RecordingScene } from '../../src/tasks/testing.js';
import { MODES } from './helpers.js';

interface S {
  ran: number;
  denied: number;
  sudoRuns: number;
}

const task = defineTask<S>({
  id: 'sudo-test',
  title: 'sudo',
  user: 'eeman',
  host: 'bank',
  map: 'eeman-bank.json',
  character: { name: 'Eeman', head: 'eeman.png' },
  tree: { rom: {} },
  spots: { '.': 'inngang' },
  commands: ['cd', 'ls', 'pwd', 'clear', 'sudo'],
  sudoPassword: 'pw',
  scripts: {
    trygt: { dir: '.', run: (ctx) => void ctx.state.ran++ },
    farlig: {
      dir: '.',
      requiresSudo: true,
      run(ctx) {
        ctx.state.ran++;
        if (ctx.sudo) ctx.state.sudoRuns++;
        return 'done';
      },
      onDenied: (ctx) => void ctx.state.denied++,
    },
  },
  initialState: { ran: 0, denied: 0, sudoRuns: 0 },
  steps: [],
  endings: [],
  hints: [],
});

const run = (mode: (typeof MODES)[number], lines: string[]) => runTaskScript(task, mode, lines);
const PROMPT = { mac: 'Password:', linux: '[sudo] password for eeman: ', windows: 'Password: ' } as const;

describe.each(MODES)('permission-gated scripts and sudo (%s)', (mode) => {
  test('a requiresSudo script fails without sudo with a realistic English permission error', async () => {
    const r = await run(mode, ['farlig']);
    if (mode === 'windows') {
      expect(r.output[0]).toContain('farlig : Access is denied.');
      expect(r.output[0]).toContain('UnauthorizedAccessException');
    } else {
      expect(r.output[0]).toContain('farlig: Permission denied');
    }
    expect(r.output[0]).toContain('sudo farlig');
    expect(r.state).toMatchObject({ ran: 0, denied: 1 });
  });

  test('a harmless script runs without sudo and with it', async () => {
    const r = await run(mode, ['trygt', 'sudo trygt', 'pw']);
    expect(r.state.ran).toBe(2);
    expect(r.state.denied).toBe(0);
  });

  test('sudo asks for the password with hidden input, in the shell\'s own words', async () => {
    const rt = new TaskRuntime(task, mode, new RecordingScene());
    const first = await rt.shell.run('sudo farlig');
    expect(first.requestInput).toMatchObject({ prompt: PROMPT[mode], hidden: true });
    expect(first.output).toBe('');
    expect(rt.state.ran).toBe(0);
  });

  test('the right password runs the script as root', async () => {
    const r = await run(mode, ['sudo farlig', 'pw']);
    expect(r.output[0]).toBe('done');
    expect(r.state).toMatchObject({ ran: 1, sudoRuns: 1, denied: 0 });
  });

  test('./name works with sudo too', async () => {
    const r = await run(mode, [mode === 'windows' ? 'sudo .\\farlig' : 'sudo ./farlig', 'pw']);
    expect(r.state.sudoRuns).toBe(1);
  });

  test('a wrong password gives Sorry, try again. and asks again', async () => {
    const r = await run(mode, ['sudo farlig', 'feil', 'pw']);
    expect(r.output[0]).toBe('Sorry, try again.\ndone');
    expect(r.state.sudoRuns).toBe(1);
  });

  test('three wrong passwords give up', async () => {
    const r = await run(mode, ['sudo farlig', 'a', 'b', 'c']);
    expect(r.output[0]).toBe('Sorry, try again.\nSorry, try again.\nsudo: 3 incorrect password attempts');
    expect(r.state.ran).toBe(0);
  });

  test('the password is remembered after one success, and sudo -k forgets it', async () => {
    const r = await run(mode, ['sudo farlig', 'pw', 'sudo farlig', 'sudo -k', 'sudo farlig', 'pw']);
    expect(r.output[1]).toBe('done');
    expect(r.state.sudoRuns).toBe(3);
    const forgot = await new TaskRuntime(task, mode, new RecordingScene());
    await forgot.shell.run('sudo farlig').then((x) => x.requestInput!.resume('pw'));
    await forgot.shell.run('sudo -k');
    expect((await forgot.shell.run('sudo farlig')).requestInput).toBeDefined();
  });

  test('sudo on an unknown command gives the real error, with no password prompt', async () => {
    const rt = new TaskRuntime(task, mode, new RecordingScene());
    const r = await rt.shell.run('sudo nope');
    expect(r.requestInput).toBeUndefined();
    expect(r.ok).toBe(false);
    if (mode === 'windows') expect(r.output).toBe("'nope' is not recognized as an internal or external command,\noperable program or batch file.");
    else expect(r.output).toBe('sudo: nope: command not found');
  });

  test('sudo with no command prints usage', async () => {
    const r = await run(mode, ['sudo']);
    expect(r.output[0]).toMatch(/^usage: sudo/);
  });

  test('library commands run under sudo', async () => {
    const r = await run(mode, ['sudo ls', 'pw']);
    expect(r.output[0]).toContain('rom');
  });

  test('a hidden script is not there to sudo either', async () => {
    const r = await run(mode, ['cd rom', 'sudo farlig']);
    expect(r.output[1]).toMatch(/not found|not recognized/);
  });

  test('commandRun for sudo is emitted once, when it is really finished', async () => {
    const rt = new TaskRuntime(task, mode, new RecordingScene());
    const seen: string[] = [];
    rt.shell.on((e) => e.type === 'commandRun' && seen.push(`${e.name}:${e.ok}`));
    const first = await rt.shell.run('sudo farlig');
    expect(seen).toEqual([]);
    const second = await first.requestInput!.resume('nope');
    await second.requestInput!.resume('pw');
    expect(seen).toEqual(['farlig:true', 'sudo:true']);
  });
});

describe('unix builtins', () => {
  test.each(['mac', 'linux'] as const)('%s: sudo cd is command not found, like the real thing', async (mode) => {
    const rt = new TaskRuntime(task, mode, new RecordingScene());
    expect((await rt.shell.run('sudo cd rom')).output).toBe('sudo: cd: command not found');
  });

  test('sudo with an unknown option', async () => {
    const rt = new TaskRuntime(task, 'linux', new RecordingScene());
    expect((await rt.shell.run('sudo -z ls')).output).toBe("sudo: invalid option -- 'z'\nusage: sudo -h | -K | -k | -V");
  });
});
