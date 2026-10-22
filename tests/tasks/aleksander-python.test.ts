import { describe, expect, test } from 'vitest';
import { aleksanderPython } from '../../src/tasks/aleksander-python.js';
import { taskOrder } from '../../src/tasks/registry.js';
import { runTaskScript } from '../../src/tasks/testing.js';
import type { OsMode } from '../../src/shell/modes.js';
import { MODES } from '../shell/helpers.js';

const run = (mode: OsMode, lines: string[]) => runTaskScript(aleksanderPython, mode, lines);
const act = (mode: OsMode, name = '.venv') => (mode === 'windows' ? `${name}\\Scripts\\Activate.ps1` : `source ${name}/bin/activate`);
const names = (out: string) => out.split(/\s+/).filter(Boolean);
const spawns = (r: Awaited<ReturnType<typeof run>>, kind: string) => r.sceneCalls.filter((c) => c[0] === 'spawn' && c[2] === kind);

test('is registered second in the task order', () => {
  expect(taskOrder[1]).toBe(aleksanderPython);
});

describe.each(MODES)('Aleksanders pythonslange (%s)', (mode) => {
  test('ls shows a dot-named cage even without -a', async () => {
    const r = await run(mode, ['cd soverom', 'python -m venv .venv', 'ls']);
    expect(names(r.output[2])).toContain('.venv');
  });

  test('the cage appears in its room with its name written above it', async () => {
    const r = await run(mode, ['cd soverom', 'python -m venv .venv']);
    expect(r.sceneCalls).toContainEqual(['spawn', 'cage:soverom/.venv', 'cage', 'soverom', '.venv']);
    expect(r.update.stats).toMatchObject({ bur: 1, pythonerIBur: 0, pythonerLoes: 0 });
  });

  test('any room works and any name works', async () => {
    const r = await run(mode, ['cd kjokken', 'python -m venv bur2']);
    expect(r.sceneCalls).toContainEqual(['spawn', 'cage:kjokken/bur2', 'cage', 'kjokken', 'bur2']);
  });

  test('re-running venv for an existing name creates no second cage', async () => {
    const r = await run(mode, ['cd soverom', 'python -m venv .venv', 'python -m venv .venv']);
    expect(r.update.stats.bur).toBe(1);
    expect(spawns(r, 'cage')).toHaveLength(1);
  });

  test('pip with no active cage drops a loose snake that wanders', async () => {
    const r = await run(mode, ['cd soverom', 'pip install pet_python']);
    expect(r.update.stats).toMatchObject({ pythonerLoes: 1, pythonerIBur: 0 });
    expect(r.sceneCalls).toContainEqual(['spawn', 'snake-1', 'snake', 'soverom']);
    expect(r.sceneCalls).toContainEqual(['wander', 'snake-1']);
  });

  test('pip with an active cage puts the snake in that cage, even after cd to another room', async () => {
    const r = await run(mode, ['cd soverom', 'python -m venv .venv', act(mode), 'cd ..', 'cd kjokken', 'pip install pet_python']);
    expect(r.update.stats).toMatchObject({ pythonerIBur: 1, pythonerLoes: 0 });
    expect(r.sceneCalls).toContainEqual(['spawn', 'snake-1', 'snake', 'cage:soverom/.venv']);
    expect(r.sceneCalls.some((c) => c[0] === 'wander')).toBe(false);
  });

  test('after deactivate a new snake is loose again', async () => {
    const r = await run(mode, ['cd soverom', 'python -m venv .venv', act(mode), 'pip install pet_python', 'deactivate', 'pip install pet_python']);
    expect(r.update.stats).toMatchObject({ pythonerIBur: 1, pythonerLoes: 1 });
  });

  test('the right ending: two different cages with a python each, the moment it becomes true', async () => {
    const r = await run(mode, [
      'cd soverom', 'python -m venv bur1', act(mode, 'bur1'), 'pip install pet_python',
      'deactivate', 'python -m venv bur2', act(mode, 'bur2'),
    ]);
    expect(r.update.ending).toBeUndefined();
    const done = await run(mode, [
      'cd soverom', 'python -m venv bur1', act(mode, 'bur1'), 'pip install pet_python',
      'python -m venv bur2', act(mode, 'bur2'), 'pip install pet_python',
    ]);
    expect(done.update.ending).toMatchObject({ id: 'vellykket', correct: true });
    expect(done.update.stepsDone.every(Boolean)).toBe(true);
    expect(done.endings).toBe(1);
  });

  test('two snakes in the same cage is not enough', async () => {
    const r = await run(mode, ['cd soverom', 'python -m venv bur1', act(mode, 'bur1'), 'pip install pet_python', 'pip install pet_python']);
    expect(r.update.ending).toBeUndefined();
  });

  test('cages in two different rooms count', async () => {
    const r = await run(mode, [
      'cd soverom', 'python -m venv a', act(mode, 'a'), 'pip install pet_python', 'deactivate', 'cd ..', 'cd kjokken',
      'python -m venv b', act(mode, 'b'), 'pip install pet_python',
    ]);
    expect(r.update.ending?.id).toBe('vellykket');
  });

  test('11 loose pythons: Aleksander dies, 10 do not', async () => {
    const ten = await run(mode, ['cd soverom', ...Array(10).fill('pip install pet_python')]);
    expect(ten.update.ending).toBeUndefined();
    const eleven = await run(mode, ['cd soverom', ...Array(11).fill('pip install pet_python')]);
    expect(eleven.update.ending).toMatchObject({ id: 'doed-loese', correct: false });
  });

  test('11 cages in one room: Aleksander dies from cages, 10 do not', async () => {
    const cages = (n: number) => Array.from({ length: n }, (_, i) => `python -m venv bur${i}`);
    expect((await run(mode, ['cd soverom', ...cages(10)])).update.ending).toBeUndefined();
    expect((await run(mode, ['cd soverom', ...cages(11)])).update.ending).toMatchObject({ id: 'doed-bur', correct: false });
  });

  test('10 cages in each of two rooms is fine', async () => {
    const cages = (n: number) => Array.from({ length: n }, (_, i) => `python -m venv bur${i}`);
    const r = await run(mode, ['cd soverom', ...cages(10), 'cd ..', 'cd kjokken', ...cages(10)]);
    expect(r.update.ending).toBeUndefined();
    expect(r.update.stats.bur).toBe(20);
  });

  test('11 pythons in one cage: Aleksander dies of guilt, 10 do not', async () => {
    const base = ['cd soverom', 'python -m venv bur', act(mode, 'bur')];
    expect((await run(mode, [...base, ...Array(10).fill('pip install pet_python')])).update.ending).toBeUndefined();
    const r = await run(mode, [...base, ...Array(11).fill('pip install pet_python')]);
    expect(r.update.ending).toMatchObject({ id: 'doed-skyld', correct: false });
  });

  test('the first ending is final', async () => {
    const r = await run(mode, ['cd soverom', ...Array(11).fill('pip install pet_python'), 'python -m venv x', act(mode, 'x'), 'pip install pet_python']);
    expect(r.update.ending?.id).toBe('doed-loese');
    expect(r.endings).toBe(1);
  });

  test('Review Focus 5: many pip installs in a row keep exact counts', async () => {
    const r = await run(mode, ['cd soverom', 'python -m venv bur', act(mode, 'bur'), ...Array(10).fill('pip install pet_python')]);
    expect(r.update.stats).toMatchObject({ pythonerIBur: 10, bur: 1 });
  });

  test('the soverom hint works from the bathroom, which has no soverom door', async () => {
    const r = await run(mode, ['cd bad']);
    const cmd = /`(cd [^`]+)`/.exec(r.update.hint ?? '')![1];
    expect(cmd).toBe('cd ~/soverom');
    const after = await run(mode, ['cd bad', mode === 'windows' ? 'cd ~\\soverom' : cmd, 'python -m venv .venv']);
    expect(after.update.stats.bur).toBe(1);
  });

  test('hints follow the story', async () => {
    const hint = async (lines: string[]) => (await run(mode, lines)).update.hint;
    expect(await hint([])).toMatch(/cd ~\/soverom/);
    expect(await hint(['cd soverom'])).toMatch(/python -m venv/);
    expect(await hint(['cd soverom', 'python -m venv .venv'])).toMatch(/`ls`/);
    const activateHint = await hint(['cd soverom', 'python -m venv .venv', 'ls']);
    expect(activateHint).toContain(mode === 'windows' ? '.venv\\Scripts\\Activate.ps1' : 'source .venv/bin/activate');
    expect(await hint(['cd soverom', 'python -m venv .venv', 'ls', act(mode)])).toMatch(/pip install pet_python/);
    expect(await hint(['cd soverom', 'python -m venv .venv', 'ls', act(mode), 'pip install pet_python'])).toMatch(/nytt bur/);
    const second = await hint(['cd soverom', 'python -m venv .venv', 'ls', act(mode), 'pip install pet_python', 'python -m venv bur2']);
    expect(second).toMatch(/deactivate/);
    expect(await hint(['cd soverom', 'python -m venv .venv', 'ls', act(mode), 'pip install pet_python', 'python -m venv bur2', 'deactivate', act(mode, 'bur2')])).toMatch(/pip install pet_python/);
  });

  test('the activation hint sends you back to the room when you are elsewhere', async () => {
    const r = await run(mode, ['cd soverom', 'python -m venv .venv', 'ls', 'cd ..', 'cd kjokken']);
    expect(r.update.hint).toContain('cd ~/soverom');
  });

  test('steps tick off along the way', async () => {
    const r = await run(mode, ['cd soverom', 'python -m venv .venv', act(mode), 'pip install pet_python']);
    expect(r.update.stepsDone).toEqual([true, true, true, true, false]);
  });
});

describe.each(MODES)('Aleksanders hus som en ring (%s)', (mode) => {
  const ls = (out: string) => names(out).filter((n) => ['stue', 'soverom', 'kjokken', 'bad'].includes(n));

  test('ls in each room shows exactly the neighbours', async () => {
    const r = await run(mode, ['ls', 'cd soverom', 'ls', 'cd kjokken', 'ls', 'cd bad', 'ls']);
    expect(ls(r.output[0])).toEqual(['bad', 'soverom']);
    expect(ls(r.output[2])).toEqual(['kjokken', 'stue']);
    expect(ls(r.output[4])).toEqual(['bad', 'soverom']);
    expect(ls(r.output[6])).toEqual(['kjokken', 'stue']);
  });

  test('walking the ring ends at home, the scene visiting each spot', async () => {
    const r = await run(mode, ['cd soverom', 'cd kjokken', 'cd bad', 'cd stue']);
    expect(r.sceneCalls.filter((c) => c[0] === 'walkTo').map((c) => c[1])).toEqual(['soverom', 'kjokken', 'bad', 'stue']);
    expect(r.runtime.shell.prompt()).toMatch(mode === 'windows' ? /aleksander> $/ : /~ ?[%$] $/);
  });

  test('a cage made in kjokken via soverom is keyed kjokken/.venv and spawned there', async () => {
    const r = await run(mode, ['cd soverom', 'cd kjokken', 'python -m venv .venv']);
    expect(r.sceneCalls).toContainEqual(['spawn', 'cage:kjokken/.venv', 'cage', 'kjokken', '.venv']);
  });

  test('cd .. after a door goes to the real parent', async () => {
    const r = await run(mode, ['cd soverom', 'cd kjokken', 'cd ..', 'ls']);
    expect(ls(r.output[3])).toEqual(['bad', 'soverom']);
    expect(r.runtime.shell.prompt()).toMatch(mode === 'windows' ? /aleksander> $/ : /~ ?[%$] $/);
  });
});

test('the prompt shows the cage like the real shell', async () => {
  const r = await run('mac', ['cd soverom', 'python -m venv .venv', 'source .venv/bin/activate']);
  expect(r.runtime.shell.prompt()).toBe('(.venv) aleksander@hus soverom % ');
});
