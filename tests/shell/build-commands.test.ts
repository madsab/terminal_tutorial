import { expect, test } from 'vitest';
import { buildCommands } from '../../src/shell/commands/index.js';

test('an entry that is a command line resolves by its first word', () => {
  expect(Object.keys(buildCommands('mac', ['pip install pet_python']))).toEqual(['pip', 'pip3']);
});

test('python implies source (and Activate.ps1 on windows)', () => {
  expect(buildCommands('mac', ['python'])).toHaveProperty('source');
  expect(buildCommands('windows', ['python'])).toHaveProperty(['Activate.ps1']);
});

test('unknown commands still throw', () => {
  expect(() => buildCommands('mac', ['nope arg'])).toThrow('Unknown command in library: nope');
});
