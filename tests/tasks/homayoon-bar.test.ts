import { describe, expect, test } from 'vitest';
import { homayoonBar } from '../../src/tasks/homayoon-bar.js';
import { taskOrder } from '../../src/tasks/registry.js';
import { runTaskScript } from '../../src/tasks/testing.js';
import { MODES } from '../shell/helpers.js';

const names = (out: string) => out.split(/\s+/).filter(Boolean);
const run = (mode: (typeof MODES)[number], lines: string[]) => runTaskScript(homayoonBar, mode, lines);

test('is registered first in the task order', () => {
  expect(taskOrder[0]).toBe(homayoonBar);
});

const HAPPY = ['cd bar-omrade', 'cd bar', 'kjop-hiroshima', 'cd ..'];

describe.each(MODES)('Homayoon Bar (%s)', (mode) => {
  const ALL = ['bar-omrade', 'bar', 'bord', 'inngang', 'sofakrok', 'toalettet', 'tiss', 'kjop-hiroshima'];
  const ls = (out: string) => names(out).filter((n) => ALL.includes(n));
  const unlocked = [...HAPPY, 'ls'];

  test('ls at the entrance shows exactly bar-omrade and bord', async () => {
    const r = await run(mode, ['ls']);
    expect(ls(r.output[0])).toEqual(['bar-omrade', 'bord']);
  });

  test('ls in bar-omrade shows the rooms and the way back, tiss once unlocked', async () => {
    const r = await run(mode, ['cd bar-omrade', 'ls', ...unlocked]);
    expect(ls(r.output[1])).toEqual(['bar', 'bord', 'inngang', 'sofakrok', 'toalettet']);
    expect(ls(r.output[6])).toEqual(['bar', 'bord', 'inngang', 'sofakrok', 'tiss', 'toalettet']);
  });

  test('bar and toalettet have no folders, only cd .. leads back', async () => {
    const r = await run(mode, ['cd bar-omrade', 'cd bar', 'ls', 'cd ..', 'cd toalettet', 'ls']);
    expect(ls(r.output[2])).toEqual(['kjop-hiroshima']);
    expect(ls(r.output[5])).toEqual([]);
  });

  test('cd inngang from bar-omrade walks to the entrance spot', async () => {
    const r = await run(mode, ['cd bar-omrade', 'cd inngang']);
    expect(r.sceneCalls.filter((c) => c[0] === 'walkTo').map((c) => c[1])).toEqual(['bar-omrade', 'inngang']);
  });

  test('buying a drink in the bar counts it and completes step 1', async () => {
    const r = await run(mode, ['cd bar-omrade', 'cd bar', 'ls', 'kjop-hiroshima']);
    expect(ls(r.output[2])).toEqual(['kjop-hiroshima']);
    expect(r.state.drinks).toBe(1);
    expect(r.update.stepsDone).toEqual([true, false]);
    expect(r.update.stats).toEqual({ hiroshimaer: 1 });
    expect(r.update.stepTexts[0]).toContain('1');
    expect(r.update.stepCompletionTexts[0]).toMatch(/blæren/);
  });

  test('the script prints nothing in the terminal, feedback goes to the task window', async () => {
    const r = await run(mode, ['cd bar-omrade', 'cd bar', 'kjop-hiroshima']);
    expect(r.output[2]).toBe('');
    expect(r.update.feedback).toMatch(/Hiroshima/);
    expect(r.sceneCalls).toContainEqual(['play', 'drink']);
  });

  test('kjop-hiroshima outside the bar is command not found', async () => {
    const r = await run(mode, ['kjop-hiroshima', 'cd bord', 'kjop-hiroshima']);
    expect(r.state.drinks).toBe(0);
    expect(r.output[0]).toContain('kjop-hiroshima');
    expect(r.output[0]).toMatch(/not found|not recognized/);
    expect(r.output[2]).toMatch(/not found|not recognized/);
  });

  test('the script also runs as ./name (.\\name on Windows)', async () => {
    const r = await run(mode, ['cd bar-omrade', 'cd bar', mode === 'windows' ? '.\\kjop-hiroshima' : './kjop-hiroshima']);
    expect(r.state.drinks).toBe(1);
  });

  test('after the first drink tiss exists in every room', async () => {
    const r = await run(mode, [...HAPPY, 'ls', 'cd bord', 'ls', 'cd ..', 'cd toalettet', 'ls']);
    expect(ls(r.output[4])).toEqual(['bar', 'bord', 'inngang', 'sofakrok', 'tiss', 'toalettet']);
    expect(ls(r.output[6])).toEqual(['tiss']);
    expect(ls(r.output[9])).toEqual(['tiss']);
  });

  test('tiss does not exist before the first drink', async () => {
    const r = await run(mode, ['tiss', 'cd bar-omrade', 'cd toalettet', 'tiss']);
    expect(r.output[0]).toMatch(/not found|not recognized/);
    expect(r.output[3]).toMatch(/not found|not recognized/);
    expect(r.update.ending).toBeUndefined();
  });

  test('tiss in the toilet is the right ending', async () => {
    const r = await run(mode, [...HAPPY, 'cd toalettet', 'tiss']);
    expect(r.update.ending).toMatchObject({ id: 'toalett', correct: true });
    expect(r.update.stepsDone).toEqual([true, true]);
    expect(r.endings).toBe(1);
  });

  test('sjekk-opp-jente only exists at the sofakrok, and sends the girl running', async () => {
    const r = await run(mode, ['sjekk-opp-jente', 'cd bar-omrade', 'sjekk-opp-jente', 'cd sofakrok', 'sjekk-opp-jente', 'ls']);
    expect(r.output[0]).toMatch(/not found|not recognized/);
    expect(r.output[2]).toMatch(/not found|not recognized/);
    expect(r.state.girlGone).toBe(true);
    expect(r.sceneCalls).toContainEqual(['say', 'Du er digg']);
    expect(r.sceneCalls).toContainEqual(['play', 'girl-flee']);
    expect(names(r.output[5])).not.toContain('sjekk-opp-jente');
    expect(r.update.ending).toBeUndefined();
  });

  test('kake is reachable from inngang and bar-omrade, and spis-kake removes the cake once', async () => {
    for (const via of [[], ['cd bar-omrade']]) {
      const r = await run(mode, [...via, 'ls', 'cd kake', 'ls', 'spis-kake', 'ls']);
      const n = via.length;
      expect(names(r.output[n])).toContain('kake');
      expect(names(r.output[n + 2])).toContain('spis-kake');
      expect(r.state.cakeEaten).toBe(true);
      expect(r.sceneCalls).toContainEqual(['say', 'mmmm digg kake, mann']);
      expect(r.sceneCalls).toContainEqual(['play', 'spis-kake']);
      expect(names(r.output[n + 4])).not.toContain('spis-kake');
    }
  });

  test('spis-kake is command not found away from the cake', async () => {
    const r = await run(mode, ['spis-kake']);
    expect(r.output[0]).toMatch(/not found|not recognized/);
    expect(r.state.cakeEaten).toBe(false);
  });

  const drinks = (n: number) => Array(n).fill('kjop-hiroshima');

  test('ten Hiroshimas is still fine, no ending', async () => {
    const r = await run(mode, ['cd bar-omrade', 'cd bar', ...drinks(10)]);
    expect(r.state.drinks).toBe(10);
    expect(r.update.ending).toBeUndefined();
  });

  test('the eleventh Hiroshima plays besvim right after drink', async () => {
    const r = await run(mode, ['cd bar-omrade', 'cd bar', ...drinks(11)]);
    const plays = r.sceneCalls.filter((c) => c[0] === 'play').map((c) => c[1]);
    expect(plays.slice(-2)).toEqual(['drink', 'besvim']);
  });

  test('ten Hiroshimas never play besvim', async () => {
    const r = await run(mode, ['cd bar-omrade', 'cd bar', ...drinks(10)]);
    expect(r.sceneCalls).not.toContainEqual(['play', 'besvim']);
  });

  test('the eleventh Hiroshima makes Homayoon pass out', async () => {
    const r = await run(mode, ['cd bar-omrade', 'cd bar', ...drinks(11)]);
    expect(r.update.ending).toMatchObject({ id: 'besvimte', correct: false });
    expect(r.endings).toBe(1);
    expect(r.update.stats).toEqual({ hiroshimaer: 11 });
  });

  test('passing out is final: tiss in the toilet afterwards does not change it', async () => {
    const r = await run(mode, ['cd bar-omrade', 'cd bar', ...drinks(11), 'cd ..', 'cd toalettet', 'tiss']);
    expect(r.update.ending?.id).toBe('besvimte');
    expect(r.endings).toBe(1);
  });

  test.each([
    ['entrance', [...HAPPY, 'cd ..', 'tiss'], 'inngang'],
    ['bar-omrade', [...HAPPY, 'tiss'], 'bar-omrade'],
    ['bar', ['cd bar-omrade', 'cd bar', 'kjop-hiroshima', 'tiss'], 'bar'],
    ['sofakrok', [...HAPPY, 'cd sofakrok', 'tiss'], 'sofakrok'],
    ['table by the entrance', ['cd bar-omrade', 'cd bar', 'kjop-hiroshima', 'cd ..', 'cd ..', 'cd bord', 'tiss'], 'bord'],
    ['table below the bar', [...HAPPY, 'cd bord', 'tiss'], 'bord-under-baren'],
  ])('tiss at the %s gives its own funny ending', async (_where, lines, id) => {
    const r = await run(mode, lines);
    expect(r.update.ending).toMatchObject({ id, correct: false });
    expect(r.update.ending?.text.length).toBeGreaterThan(5);
    expect(r.update.stepsDone[1]).toBe(false);
  });

  test('the first ending is final: later commands do not change it', async () => {
    const r = await run(mode, ['cd bar-omrade', 'cd bar', 'kjop-hiroshima', 'tiss', 'cd ..', 'cd toalettet', 'tiss', 'kjop-hiroshima']);
    expect(r.update.ending?.id).toBe('bar');
    expect(r.endings).toBe(1);
  });

  test('hints follow the spec', async () => {
    const hint = async (lines: string[]) => (await run(mode, lines)).update.hint;
    expect(await hint([])).toBe('Skriv `ls` for å se hvor Homayoon kan gå.');
    expect(await hint(['ls'])).toBe('Bruk `cd bar-omrade` for å gå inn i baren.');
    expect(await hint(['cd bar-omrade'])).toBe('Bruk `ls` for å se rommene, og gå til baren med `cd bar`.');
    expect(await hint(['cd bar-omrade', 'cd bar'])).toBe('Bruk `ls` for å se hva du kan gjøre, og skriv `kjop-hiroshima`.');
    expect(await hint([...HAPPY.slice(0, 3)])).toBe('Homayoon må tisse! Bruk `cd ..` for å gå ut av baren.');
    expect(await hint(HAPPY)).toBe('Bruk `ls` for å se etter toalettet, og gå dit med `cd`.');
    expect(await hint([...HAPPY, 'cd bord'])).toBe('Bruk `ls` for å se etter toalettet, og gå dit med `cd`.');
    expect(await hint([...HAPPY, 'cd toalettet'])).toBe('Skriv `tiss`.');
  });

  test('hints inside bar-omrade rooms lead back to the bar area, not the entrance', async () => {
    for (const room of ['sofakrok', 'bord', 'toalettet']) {
      expect((await run(mode, ['cd bar-omrade', `cd ${room}`])).update.hint).toBe('Bruk `cd ..` for å gå tilbake til bar-området, og så `cd bar`.');
    }
    expect((await run(mode, ['cd bord'])).update.hint).toMatch(/inngangen/);
  });

  test('hints help from places the story did not plan for', async () => {
    expect((await run(mode, ['cd bord'])).update.hint).toMatch(/cd \.\./);
    expect((await run(mode, ['cd ..'])).update.hint).toMatch(/cd ~/);
  });

  test('Review Focus 5: kjop-hiroshima 10 times gives exactly 10 drinks', async () => {
    const r = await run(mode, ['cd bar-omrade', 'cd bar', ...Array(10).fill('kjop-hiroshima')]);
    expect(r.state.drinks).toBe(10);
    expect(r.update.stats).toEqual({ hiroshimaer: 10 });
    expect(r.update.ending).toBeUndefined();
  });

  test('the scene follows the character between rooms and returns to the entrance outside the tree', async () => {
    const r = await run(mode, ['cd bar-omrade', 'cd bar', 'cd ..', 'cd bord', 'cd ..', 'cd ..', 'cd bord', 'cd ..', 'cd ..']);
    expect(r.sceneCalls.filter((c) => c[0] === 'walkTo').map((c) => c[1])).toEqual([
      'bar-omrade', 'bar', 'bar-omrade', 'bord', 'bar-omrade', 'inngang', 'bord-inngang', 'inngang', 'inngang',
    ]);
  });
});

test('Tab completes the script name in the bar', async () => {
  const r = await run('linux', ['cd bar-omrade', 'cd bar']);
  expect(r.runtime.shell.complete('kjop-h').replacement).toBe('kjop-hiroshima ');
});

test('PowerShell runs the script regardless of letter case, Linux does not', async () => {
  expect((await run('windows', ['cd bar-omrade', 'cd bar', 'KJOP-HIROSHIMA'])).state.drinks).toBe(1);
  expect((await run('linux', ['cd bar-omrade', 'cd bar', 'KJOP-HIROSHIMA'])).state.drinks).toBe(0);
});
