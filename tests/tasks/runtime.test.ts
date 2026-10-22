import { describe, expect, test } from 'vitest';
import { runTaskScript } from '../../src/tasks/testing.js';
import { example } from '../../src/tasks/example.js';
import { MODES } from '../shell/helpers.js';
import { defineTask } from '../../src/tasks/api.js';

describe.each(MODES)('TaskRuntime (%s)', (mode) => {
  test('entering a mapped folder walks the scene there, going outside returns to the entrance', async () => {
    const r = await runTaskScript(example, mode, ['cd a', 'cd ..', 'cd ..', 'cd /']);
    expect(r.sceneCalls).toEqual([
      ['walkTo', 'bar'],
      ['walkTo', 'inngang'],
      ['walkTo', 'inngang'],
      ['walkTo', 'inngang'],
    ]);
  });

  test('a folder without a spot walks to the nearest ancestor spot', async () => {
    const r = await runTaskScript(example, mode, ['cd a', 'cd dyp']);
    expect(r.sceneCalls.at(-1)).toEqual(['walkTo', 'bar']);
  });

  test('a script runs only in its folder', async () => {
    const away = await runTaskScript(example, mode, ['hei']);
    expect(away.state.greeted).toBe(0);
    expect(away.output[0]).toMatch(/hei/);
    const there = await runTaskScript(example, mode, ['cd a', 'hei', './hei']);
    expect(there.state.greeted).toBe(2);
    expect(there.output.slice(1)).toEqual(['Hei!', 'Hei!']);
  });

  test('visibleWhen hides and shows a script in ls', async () => {
    const r = await runTaskScript(example, mode, ['cd b', 'ls', 'cd ..', 'cd a', 'hei', 'cd ..', 'cd b', 'ls']);
    expect(r.output[1]).not.toContain('bonus');
    expect(r.output.at(-1)).toContain('bonus');
  });

  test('a script that is not visible yet is command not found', async () => {
    const r = await runTaskScript(example, mode, ['cd b', 'bonus']);
    expect(r.output[1]).toMatch(/bonus/);
    expect(r.state.bonus).toBe(0);
  });

  test('the first matching hint wins and follows state and folder', async () => {
    const start = await runTaskScript(example, mode, []);
    expect(start.update.hint).toBe('Skriv ls.');
    const inA = await runTaskScript(example, mode, ['cd a']);
    expect(inA.update.hint).toBe('Skriv hei.');
    const greeted = await runTaskScript(example, mode, ['cd a', 'hei']);
    expect(greeted.update.hint).toBe('Gå til b.');
  });

  test('steps, stats and feedback are reported', async () => {
    const r = await runTaskScript(example, mode, ['cd a', 'hei']);
    expect(r.update.stepsDone).toEqual([true, false]);
    expect(r.update.stats).toEqual({ hilsener: 1 });
    expect(r.update.feedback).toBe('Du sa hei!');
    expect(r.update.stepTexts).toEqual(['Si hei (1)', 'Fullfør']);
  });

  test('a goal\'s completion text appears only once it is done', async () => {
    const start = await runTaskScript(example, mode, []);
    expect(start.update.stepCompletionTexts).toEqual([undefined, undefined]);
    const r = await runTaskScript(example, mode, ['cd a', 'hei']);
    expect(r.update.stepCompletionTexts).toEqual(['Du har sagt hei 1 gang(er).', undefined]);
  });

  test('an ending fires once, first match wins, and then locks the task', async () => {
    const r = await runTaskScript(example, mode, ['cd a', 'hei', 'hei', 'hei', 'hei']);
    expect(r.update.ending).toEqual({ id: 'ferdig', text: 'Ferdig!', correct: true });
    expect(r.state.greeted).toBe(2);
    expect(r.endings).toBe(1);
  });

  test('scene commands from scripts reach the scene api', async () => {
    const r = await runTaskScript(example, mode, ['cd a', 'hei']);
    expect(r.sceneCalls).toContainEqual(['say', 'Hei!']);
  });
});

test('onUpdate returns an unsubscribe function', async () => {
  const { TaskRuntime } = await import('../../src/tasks/runtime.js');
  const { RecordingScene } = await import('../../src/tasks/testing.js');
  const rt = new TaskRuntime(example, 'linux', new RecordingScene());
  let n = 0;
  const off = rt.onUpdate(() => n++);
  await rt.shell.run('ls');
  off();
  await rt.shell.run('ls');
  expect(n).toBe(1);
});

interface HouseState {
  open: boolean;
  args: string[];
}

const house = defineTask<HouseState>({
  id: 'house',
  title: 'Hus',
  user: 'test',
  host: 'testmaskin',
  map: 'homayoon-bar.json',
  character: { name: 'Test', head: 'test.png' },
  tree: { stue: {}, kjokken: {}, bad: {}, soverom: {}, kjeller: {} },
  spots: { '.': 'inngang', stue: 'bar' },
  commands: ['cd', 'ls', 'pwd', 'clear'],
  hiddenFolders: ['kjeller'],
  doors: [
    { name: 'kjokken', from: ['stue'], to: 'kjokken' },
    { name: 'bad', from: ['kjokken'], to: 'bad' },
    { name: 'soverom', from: ['bad'], to: 'soverom' },
    { name: 'stue', from: ['soverom'], to: 'stue' },
    { name: 'inngang', from: ['stue'], to: '.' },
    { name: 'hemmelig', from: ['stue'], to: 'kjeller', visibleWhen: (s) => s.open },
  ],
  scripts: {
    foo: {
      dir: '*',
      run(ctx) {
        ctx.state.args = ctx.args;
      },
    },
    open: {
      dir: 'stue',
      run(ctx) {
        ctx.state.open = true;
      },
    },
  },
  initialState: { open: false, args: ['unset'] },
  steps: [],
  endings: [],
  hints: [],
});

describe.each(MODES)('Doors (%s)', (mode) => {
  const sep = mode === 'windows' ? '\\' : '/';
  const pwd = async (lines: string[]) => (await runTaskScript(house, mode, [...lines, 'pwd'])).output.at(-1)!;

  test('ls lists doors as folders', async () => {
    const r = await runTaskScript(house, mode, ['cd stue', 'ls']);
    expect(r.output[1]).toContain('kjokken');
    expect(r.output[1]).toContain('inngang');
    expect(r.output[1]).not.toContain('hemmelig');
  });

  test('cd through a door makes pwd physical, and cd .. goes to the real parent', async () => {
    const home = (await runTaskScript(house, mode, ['pwd'])).runtime.home;
    const there = await pwd(['cd stue', 'cd kjokken']);
    expect(there).toMatch(/kjokken\s*$/);
    expect(there).not.toMatch(/stue/);
    const back = await runTaskScript(house, mode, ['cd stue', 'cd kjokken', 'cd ..']);
    expect(back.runtime.shell.cwd).toBe(home);
    const loop = await runTaskScript(house, mode, ['cd stue', 'cd kjokken', 'cd bad', 'cd soverom', 'cd stue', 'cd kjokken']);
    expect(loop.runtime.shell.cwd).toBe(`${home}/kjokken`);
    expect(loop.runtime.shell.prompt()).not.toMatch(/stue.*kjokken/);
  });

  test('a door to the entrance leads home', async () => {
    const r = await runTaskScript(house, mode, ['cd stue', 'cd inngang']);
    expect(r.runtime.shell.cwd).toBe(r.runtime.home);
  });

  test('a hidden door does not exist until the state flips', async () => {
    const r = await runTaskScript(house, mode, ['cd stue', 'cd hemmelig', 'open', 'ls', 'cd hemmelig']);
    expect(r.output[1]).toMatch(mode === 'windows' ? /Cannot find path/ : /no such file or directory/i);
    expect(r.output[3]).toContain('hemmelig');
    expect(r.runtime.shell.cwd).toBe(`${r.runtime.home}/kjeller`);
  });

  test('hiddenFolders are left out of plain ls', async () => {
    const r = await runTaskScript(house, mode, ['ls']);
    expect(r.output[0]).not.toContain('kjeller');
    expect(r.output[0]).toContain('kjokken');
  });

  test('a script sees its arguments', async () => {
    const r = await runTaskScript(house, mode, ['foo 1962']);
    expect(r.state.args).toEqual(['1962']);
    const none = await runTaskScript(house, mode, ['foo']);
    expect(none.state.args).toEqual([]);
  });

  test('Tab completes a door name', async () => {
    const r = await runTaskScript(house, mode, ['cd stue']);
    const c = r.runtime.shell.complete('cd kjo');
    expect(c.replacement).toMatch(/^cd (\.\\)?kjokken/);
  });

  test('path forms with separators work through physical paths', async () => {
    const home = (await runTaskScript(house, mode, [])).runtime.home;
    const a = await runTaskScript(house, mode, ['cd stue', 'cd kjokken', `cd ..${sep}bad`]);
    expect(a.runtime.shell.cwd).toBe(`${home}/bad`);
    const b = await runTaskScript(house, mode, ['cd stue', 'cd kjokken', `cd ~${sep}bad`]);
    expect(b.runtime.shell.cwd).toBe(`${home}/bad`);
  });
});

test('Windows ls shows a door as a d---- row', async () => {
  const r = await runTaskScript(house, 'windows', ['cd stue', 'ls']);
  expect(r.output[1]).toMatch(/^d----.*kjokken$/m);
});
