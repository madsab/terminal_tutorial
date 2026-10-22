import { describe, expect, test } from 'vitest';
import { eemanBank } from '../../src/tasks/eeman-bank.js';
import { taskOrder } from '../../src/tasks/registry.js';
import { runTaskScript } from '../../src/tasks/testing.js';
import { MODES } from '../shell/helpers.js';

const PW = 'bank123';
const run = (mode: (typeof MODES)[number], lines: string[]) => runTaskScript(eemanBank, mode, lines);
/** Run the lines from the counter: the teller scripts only exist in `skranke`. */
const atCounter = (mode: (typeof MODES)[number], lines: string[]) => run(mode, ['cd skranke', ...lines]).then((r) => ({ ...r, output: r.output.slice(1) }));
const names = (out: string) => out.split(/\s+/).filter(Boolean);
const PERMISSION = /Permission denied|Access is denied/;
const NOT_FOUND = /not found|not recognized/i;
const ROB = ['sudo skrik-gi-meg-penger', PW];
const ROOMS = ['sofa', 'skranke', 'plante'];
const plays = (calls: unknown[][]) => calls.filter((c) => c[0] === 'play').map((c) => c[1]);
const where = (r: Awaited<ReturnType<typeof run>>) => r.runtime.relative(r.runtime.shell.cwd);

test('is registered third in the task order and the task text gives the password', () => {
  expect(taskOrder[2]).toBe(eemanBank);
  expect(eemanBank.intro).toContain(PW);
  expect(eemanBank.sudoPassword).toBe(PW);
});

describe.each(MODES)('Eeman i banken (%s)', (mode) => {
  const ALL = ['bestikk-kassereren', 'ring-politiet', 'skrik-gi-meg-penger', 'spor-om-penger', 'ta-ut-penger', 'vis-saldo', 'snakk-med-gammel-mann', 'apne-safe', 'velt-plante', 'inngang', 'sofa', 'skranke', 'plante', 'safe'];
  const ls = (out: string) => names(out).filter((n) => ALL.includes(n));

  test('ls at the entrance shows the three rooms, the ATM and the shouting, but no phone and no safe', async () => {
    const r = await run(mode, ['ls']);
    expect(ls(r.output[0])).toEqual(['plante', 'skranke', 'skrik-gi-meg-penger', 'sofa', 'vis-saldo']);
  });

  test('every room leads to the other two and back to inngang', async () => {
    const r = await run(mode, ['cd sofa', 'ls', 'cd skranke', 'ls', 'cd plante', 'ls']);
    expect(ls(r.output[1])).toEqual(['inngang', 'plante', 'skranke', 'skrik-gi-meg-penger', 'snakk-med-gammel-mann']);
    expect(ls(r.output[3])).toEqual(['bestikk-kassereren', 'inngang', 'plante', 'skrik-gi-meg-penger', 'sofa', 'spor-om-penger', 'ta-ut-penger']);
    expect(ls(r.output[5])).toEqual(['inngang', 'skranke', 'skrik-gi-meg-penger', 'sofa', 'velt-plante']);
  });

  test('cd inngang from a room goes back to the entrance spot', async () => {
    const r = await run(mode, ['cd plante', 'cd inngang']);
    expect(r.sceneCalls.filter((c) => c[0] === 'walkTo').map((c) => c[1])).toEqual(['plante', 'inngang']);
  });

  test('the teller scripts are command not found outside skranke and work inside it', async () => {
    const r = await run(mode, ['spor-om-penger', 'ta-ut-penger', 'bestikk-kassereren', 'cd sofa', 'ta-ut-penger', 'cd skranke', 'spor-om-penger']);
    for (const i of [0, 1, 2, 4]) expect(r.output[i]).toMatch(/not found|not recognized/i);
    expect(r.output[6]).toBe('');
    expect(r.update.feedback).toMatch(/pent om penger/);
  });

  test('snakk-med-gammel-mann exists only in sofa and gives the exact line', async () => {
    const r = await run(mode, ['snakk-med-gammel-mann', 'cd sofa', 'snakk-med-gammel-mann']);
    expect(r.output[0]).toMatch(/not found|not recognized/i);
    expect(r.output[2]).toBe('');
    expect(r.update.feedback).toBe('Jeg husker da dette stedet åpnet i 1962.');
    expect(r.sceneCalls).toContainEqual(['say', 'Jeg husker da dette stedet åpnet i 1962.']);
    expect(r.state.heardYear).toBe(true);
  });

  test('harmless actions run without sudo, print nothing and give feedback in the task window', async () => {
    const r = await run(mode, ['vis-saldo', 'cd skranke', 'spor-om-penger']);
    expect(r.output.filter((_, i) => i !== 1)).toEqual(['', '']);
    expect(r.update.feedback).toMatch(/Hvis du har en konto/);
    expect(r.update.ending).toBeUndefined();
    expect(r.state.checked).toBe(true);
  });

  test('also runs as ./name (.\\name on Windows)', async () => {
    const r = await run(mode, [mode === 'windows' ? '.\\vis-saldo' : './vis-saldo']);
    expect(r.state.checked).toBe(true);
  });

  test('skrik-gi-meg-penger without sudo: a permission error pointing to sudo, everyone laughs in the task window, no ending', async () => {
    const r = await run(mode, ['skrik-gi-meg-penger']);
    expect(r.output[0]).toMatch(PERMISSION);
    expect(r.output[0]).toContain('sudo skrik-gi-meg-penger');
    expect(r.update.feedback).toMatch(/lo av/);
    expect(r.sceneCalls).toContainEqual(['play', 'laugh']);
    expect(r.update.ending).toBeUndefined();
    expect(r.state.robbing).toBe(false);
  });

  test('the non-sudo attempt of the other important actions does not end the task either', async () => {
    const r = await atCounter(mode, ['ta-ut-penger', 'bestikk-kassereren', 'cd inngang', 'skrik-gi-meg-penger']);
    for (const i of [0, 1, 3]) expect(r.output[i]).toMatch(PERMISSION);
    expect(r.update.ending).toBeUndefined();
    expect(r.update.stepsDone).toEqual([false, false]);
  });

  test('sudo skrik-gi-meg-penger starts a robbery, it is no longer an ending', async () => {
    const r = await run(mode, ['ls', ...ROB]);
    expect(r.update.ending).toBeUndefined();
    expect(r.endings).toBe(0);
    expect(r.state.robbing).toBe(true);
    expect(r.sceneCalls).toContainEqual(['say', 'GI MEG PENGENE!']);
    expect(plays(r.sceneCalls)).toEqual(['robber']);
  });

  test('robber is played exactly once for a sudo robbery and never for a refused one', async () => {
    expect(plays((await run(mode, ['skrik-gi-meg-penger'])).sceneCalls)).not.toContain('robber');
    expect(plays((await run(mode, ROB)).sceneCalls).filter((a) => a === 'robber')).toHaveLength(1);
  });

  test.each(['.', ...ROOMS])('skrik-gi-meg-penger works from %s', async (room) => {
    const r = await run(mode, [...(room === '.' ? [] : [`cd ${room}`]), ...ROB]);
    expect(r.state.robbing).toBe(true);
  });

  test.each(['.', ...ROOMS])('before the robbery `cd safe` from %s fails like any missing folder', async (room) => {
    const cdRoom = room === '.' ? [] : [`cd ${room}`];
    const missing = await run(mode, [...cdRoom, 'cd nope']);
    const r = await run(mode, [...cdRoom, 'cd safe', 'ls']);
    const at = cdRoom.length;
    expect(r.output[at]).not.toBe('');
    expect(r.output[at]).toBe(missing.output[at].replaceAll('nope', 'safe'));
    expect(where(r)).toBe(room);
    expect(ls(r.output[at + 1])).not.toContain('safe');
  });

  test.each(['.', ...ROOMS])('after the robbery `cd safe` works from %s', async (room) => {
    const r = await run(mode, [...ROB, ...(room === '.' ? [] : [`cd ${room}`]), 'ls', 'cd safe']);
    expect(ls(r.output.at(-2)!)).toContain('safe');
    expect(r.output.at(-1)).toBe('');
    expect(where(r)).toBe('safe');
    expect(r.sceneCalls.at(-1)).toEqual(['walkTo', 'safe']);
  });

  test('ls in safe shows only apne-safe and ring-politiet, no folders, and `cd ..` goes back to the entrance', async () => {
    const r = await run(mode, [...ROB, 'cd sofa', 'cd safe', 'ls', 'cd ..']);
    const out = r.output[3];
    if (mode === 'windows') {
      expect(ls(out)).toEqual(['apne-safe', 'ring-politiet']);
      expect(out).not.toMatch(/^d/m);
    } else {
      expect(names(out)).toEqual(['apne-safe', 'ring-politiet']);
    }
    expect(where(r)).toBe('.');
    expect(r.sceneCalls.at(-1)).toEqual(['walkTo', 'inngang']);
  });

  test('ring-politiet and apne-safe are command not found before the robbery', async () => {
    const r = await run(mode, ['ring-politiet', 'sudo ring-politiet', 'apne-safe 1962', 'cd sofa', 'ring-politiet']);
    for (const i of [0, 1, 2, 4]) expect(r.output[i]).toMatch(NOT_FOUND);
    expect(r.update.ending).toBeUndefined();
  });

  test('during the robbery ring-politiet is in every room and in safe', async () => {
    const r = await run(mode, [...ROB, 'ls', 'cd sofa', 'ls', 'cd skranke', 'ls', 'cd plante', 'ls', 'cd safe', 'ls']);
    for (const i of [1, 3, 5, 7, 9]) expect(ls(r.output[i])).toContain('ring-politiet');
  });

  test('a second sudo skrik-gi-meg-penger is command not found, in every room', async () => {
    const r = await run(mode, [...ROB, 'sudo skrik-gi-meg-penger', 'skrik-gi-meg-penger', 'cd sofa', 'skrik-gi-meg-penger', 'cd safe', 'skrik-gi-meg-penger']);
    for (const i of [1, 2, 4, 6]) expect(r.output[i]).toMatch(NOT_FOUND);
    expect(plays(r.sceneCalls)).toEqual(['robber']);
    expect(r.update.ending).toBeUndefined();
  });

  test('ring-politiet without sudo: a permission error, his hands shake, no ending', async () => {
    const r = await run(mode, [...ROB, 'ring-politiet']);
    expect(r.output[1]).toMatch(PERMISSION);
    expect(r.update.feedback).toMatch(/ringer ikke politiet/);
    expect(r.update.ending).toBeUndefined();
    expect(r.state.arrested).toBe(false);
  });

  test('apne-safe without a code prints the usage line and does not end the task', async () => {
    const r = await run(mode, [...ROB, 'cd safe', 'apne-safe']);
    expect(r.output[2]).toBe('apne-safe: safen er låst. Bruk: apne-safe <kode>');
    expect(r.update.ending).toBeUndefined();
    expect(r.state.opened).toBeNull();
  });

  test('apne-safe with a wrong code prints `feil kode` and does not end the task', async () => {
    const r = await run(mode, [...ROB, 'cd safe', 'apne-safe 1234', 'apne-safe 1963']);
    expect(r.output.slice(2)).toEqual(['apne-safe: feil kode', 'apne-safe: feil kode']);
    expect(r.update.ending).toBeUndefined();
    expect(r.update.stats.kroner).toBe(0);
  });

  test('sudo apne-safe 1962 still uses dynamite', async () => {
    const r = await run(mode, [...ROB, 'cd safe', 'sudo apne-safe 1962', PW]);
    expect(r.update.ending?.id).toBe('ran-dynamitt');
    expect(plays(r.sceneCalls)).toEqual(['robber', 'dynamite']);
  });

  test('the old man is gone once the bank is being robbed', async () => {
    const r = await run(mode, [...ROB, 'cd sofa', 'ls', 'snakk-med-gammel-mann']);
    expect(ls(r.output[2])).not.toContain('snakk-med-gammel-mann');
    expect(r.output[3]).toMatch(NOT_FOUND);
    expect(r.state.heardYear).toBe(false);
  });

  test('the full code path: hear the year from the old man, then open the safe with it', async () => {
    const r = await run(mode, ['cd sofa', 'snakk-med-gammel-mann', ...ROB, 'cd safe', 'apne-safe 1962']);
    expect(r.update.ending).toMatchObject({ id: 'ran-kode', correct: true });
    expect(r.update.stats.kroner).toBe(2_000_000);
    expect(r.endings).toBe(1);
  });

  const ENDINGS: [string, string[], boolean, number, string, string[]][] = [
    ['uttak', ['cd skranke', 'sudo ta-ut-penger', PW], true, 1_000, '1 000', ['cash']],
    ['bestikkelse', ['cd skranke', 'sudo bestikk-kassereren', PW], false, 0, '0', ['cash']],
    ['ran-kode', [...ROB, 'cd safe', 'apne-safe 1962'], true, 2_000_000, '2 000 000', ['robber', 'cash']],
    ['ran-dynamitt', [...ROB, 'cd safe', 'sudo apne-safe', PW], true, 1_400_000, '1 400 000', ['robber', 'dynamite']],
    ['arrestert', [...ROB, 'sudo ring-politiet', PW], false, 0, '0', ['robber', 'police']],
  ];

  test.each(ENDINGS)('ending %s: correct flag, money in stats and in the text, scene effects', async (id, lines, correct, kroner, text, effects) => {
    const before = await run(mode, lines.slice(0, -2));
    expect(before.update.ending).toBeUndefined();
    const r = await run(mode, lines);
    expect(r.update.ending).toMatchObject({ id, correct });
    expect(r.update.ending!.text.endsWith(`Eeman fikk med seg ${text} kr.`)).toBe(true);
    expect(r.update.stats).toEqual({ latter: 0, kroner });
    expect(plays(r.sceneCalls)).toEqual(effects);
    expect(r.endings).toBe(1);
  });

  test('sudo ring-politiet from inside safe also gets Eeman arrested', async () => {
    const r = await run(mode, [...ROB, 'cd safe', 'sudo ring-politiet', PW]);
    expect(r.update.ending?.id).toBe('arrestert');
  });

  test('velt-plante exists only in plante', async () => {
    const r = await run(mode, ['velt-plante', 'cd sofa', 'velt-plante', 'cd plante', 'ls']);
    for (const i of [0, 2]) expect(r.output[i]).toMatch(NOT_FOUND);
    expect(ls(r.output[4])).toContain('velt-plante');
  });

  test('velt-plante without sudo: permission error and Eeman says she should not', async () => {
    const r = await run(mode, ['cd plante', 'velt-plante']);
    expect(r.output[1]).toMatch(PERMISSION);
    expect(r.sceneCalls).toContainEqual(['say', 'Burde nok ikke gjøre det']);
    expect(plays(r.sceneCalls)).toEqual([]);
    expect(r.state.plantFallen).toBe(false);
  });

  test('sudo velt-plante knocks the plant over, with no ending and no step progress', async () => {
    const r = await run(mode, ['cd plante', 'sudo velt-plante', PW]);
    expect(plays(r.sceneCalls)).toEqual(['velt-plante']);
    expect(r.state.plantFallen).toBe(true);
    expect(r.update.ending).toBeUndefined();
    expect(r.update.stepsDone).toEqual([false, false]);
  });

  test('stats start at no laughs and no money, and count the laughs', async () => {
    expect((await run(mode, [])).update.stats).toEqual({ latter: 0, kroner: 0 });
    expect((await run(mode, ['skrik-gi-meg-penger', 'skrik-gi-meg-penger'])).update.stats).toEqual({ latter: 2, kroner: 0 });
  });

  test('sudo ta-ut-penger is the legitimate withdrawal, the right ending', async () => {
    const r = await run(mode, ['ls', 'vis-saldo', 'cd skranke', 'ta-ut-penger', 'sudo ta-ut-penger', PW]);
    expect(r.update.ending).toMatchObject({ id: 'uttak', correct: true });
    expect(r.update.stepsDone).toEqual([true, true]);
  });

  test('the money step only completes once money is taken: a robbery in progress is not enough', async () => {
    const robbing = await run(mode, ['ls', ...ROB]);
    expect(robbing.state.robbing).toBe(true);
    expect(robbing.update.stepsDone).toEqual([true, false]);
    const done = await run(mode, ['ls', ...ROB, 'cd safe', 'apne-safe 1962']);
    expect(done.update.stepsDone).toEqual([true, true]);
  });

  test('sudo bestikk-kassereren is an extra ending', async () => {
    const r = await atCounter(mode, ['sudo bestikk-kassereren', PW]);
    expect(r.update.ending).toMatchObject({ id: 'bestikkelse', correct: false });
  });

  test('a wrong password does nothing, the right one then works', async () => {
    const r = await atCounter(mode, ['sudo ta-ut-penger', 'feil', PW]);
    expect(r.output[0]).toBe('Sorry, try again.');
    expect(r.update.ending?.id).toBe('uttak');
  });

  test('three wrong passwords give up and the task goes on', async () => {
    const r = await atCounter(mode, ['sudo ta-ut-penger', 'a', 'b', 'c', 'cd inngang', 'vis-saldo']);
    expect(r.output[0]).toContain('3 incorrect password attempts');
    expect(r.update.ending).toBeUndefined();
    expect(r.state.checked).toBe(true);
  });

  test('repeated wrong codes and then the right one fire exactly one ending', async () => {
    const r = await run(mode, [...ROB, 'cd safe', 'apne-safe 1', 'apne-safe 2', 'apne-safe', 'apne-safe 3', 'apne-safe 1962', 'apne-safe 1962']);
    expect(r.update.ending?.id).toBe('ran-kode');
    expect(r.endings).toBe(1);
  });

  test('a robber cannot withdraw legally: ta-ut-penger does not exist mid-robbery', async () => {
    const r = await run(mode, [...ROB, 'cd skranke', 'ls', 'sudo ta-ut-penger', PW, 'ta-ut-penger']);
    expect(r.update.ending).toBeUndefined();
    expect(r.state.withdrawn).toBe(false);
    expect(names(r.output[ROB.length + 1])).not.toContain('ta-ut-penger');
    expect(r.output.join('\n')).toMatch(/not found|not recognized|not the name/i);
    expect(r.update.hint ?? '').not.toContain('ta-ut-penger');
  });

  test.each([
    ['ran-kode', ['cd safe', 'apne-safe 1962'], 2_000_000],
    ['ran-dynamitt', ['cd safe', 'sudo apne-safe', PW], 1_400_000],
    ['arrestert', ['sudo ring-politiet', PW], 0],
  ] as const)('the first ending (%s) is final: ta-ut-penger, ring-politiet and apne-safe after it change nothing', async (id, lines, kroner) => {
    const after = ['cd safe', 'sudo ring-politiet', PW, 'apne-safe 1962', 'sudo apne-safe', PW, 'cd ..', 'cd skranke', 'sudo ta-ut-penger', PW, 'ta-ut-penger'];
    const r = await run(mode, [...ROB, ...lines, ...after]);
    expect(r.update.ending?.id).toBe(id);
    expect(r.update.stats.kroner).toBe(kroner);
    expect(r.endings).toBe(1);
    expect(plays(r.sceneCalls)).toHaveLength(2);
  });

  test('the first ending (uttak) is final: shouting for money after it does not start a robbery', async () => {
    const r = await run(mode, ['cd skranke', 'sudo ta-ut-penger', PW, 'sudo skrik-gi-meg-penger', PW, 'cd safe']);
    expect(r.update.ending?.id).toBe('uttak');
    expect(r.state.robbing).toBe(false);
    expect(r.endings).toBe(1);
  });

  test('a wrong sudo password does not start the robbery', async () => {
    const r = await run(mode, ['sudo skrik-gi-meg-penger', 'feil']);
    expect(plays(r.sceneCalls)).not.toContain('robber');
  });

  test('hints follow the story', async () => {
    const hint = async (lines: string[]) => (await run(mode, lines)).update.hint;
    expect(await hint([])).toMatch(/`ls`/);
    expect(await hint(['ls'])).toMatch(/cd skranke/);
    expect(await hint(['ls', 'skrik-gi-meg-penger'])).toMatch(/`sudo skrik-gi-meg-penger`.*Passordet/);
    expect(await hint(['ls', 'vis-saldo'])).toMatch(/cd skranke/);
    expect(await hint(['ls', 'cd skranke'])).toMatch(/Kjør et av skriptene/);
  });

  test('hints during the robbery lead to the safe and to the code', async () => {
    const hint = async (lines: string[]) => (await run(mode, lines)).update.hint;
    expect(await hint(ROB)).toMatch(/`cd safe`/);
    expect(await hint([...ROB, 'cd plante'])).toMatch(/`cd safe`/);
    expect(await hint([...ROB, 'cd safe'])).toContain('Vi må bruke makt for å få den opp. `sudo`');
    expect(await hint([...ROB, 'cd safe', 'apne-safe 1'])).toContain('Vi må bruke makt');
    expect(await hint(['cd sofa', 'snakk-med-gammel-mann', ...ROB])).toMatch(/`cd safe`/);
    expect(await hint(['cd sofa', 'snakk-med-gammel-mann', ...ROB, 'cd safe'])).toMatch(/`apne-safe 1962`/);
  });
});
