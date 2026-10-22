import { defineTask } from './api.js';

interface State {
  greeted: number;
  bonus: number;
}

/** A tiny task used by the runtime tests. Not part of the class. */
export const example = defineTask<State>({
  id: 'example',
  title: 'Eksempel',
  user: 'test',
  host: 'testmaskin',
  map: 'homayoon-bar.json',
  character: { name: 'Test', head: 'test.png' },
  tree: { a: { dyp: {} }, b: {} },
  spots: { '.': 'inngang', a: 'bar', b: 'toalett' },
  commands: ['cd', 'ls', 'pwd', 'clear'],
  scripts: {
    hei: {
      dir: 'a',
      run(ctx) {
        ctx.state.greeted++;
        ctx.feedback('Du sa hei!');
        ctx.scene.say('Hei!');
        return 'Hei!';
      },
    },
    bonus: {
      dir: 'b',
      visibleWhen: (s) => s.greeted > 0,
      run(ctx) {
        ctx.state.bonus++;
      },
    },
  },
  initialState: { greeted: 0, bonus: 0 },
  steps: [
    {
      text: (s) => `Si hei (${s.greeted})`,
      done: (s) => s.greeted >= 1,
      textOnCompletion: (s) => `Du har sagt hei ${s.greeted} gang(er).`,
    },
    { text: 'Fullfør', done: (s) => s.greeted >= 2 },
  ],
  endings: [
    { id: 'ferdig', text: 'Ferdig!', correct: true, when: (s) => s.greeted >= 2 },
    { id: 'alternativ', text: 'Alternativ', correct: false, when: (s) => s.greeted >= 2 },
  ],
  hints: [
    { when: (s) => s.greeted > 0, text: 'Gå til b.' },
    { when: (_s, cwd) => cwd === 'a', text: 'Skriv hei.' },
    { when: () => true, text: 'Skriv ls.' },
  ],
  stats: (s) => ({ hilsener: s.greeted }),
});
