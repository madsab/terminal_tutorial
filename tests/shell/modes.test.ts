import { describe, expect, test } from 'vitest';
import { windowTitle } from '../../src/shell/modes.js';

const mac = { user: 'homayoon', host: 'bar', home: '/Users/homayoon', cols: 80, rows: 24 };
const lin = { user: 'homayoon', host: 'bar', home: '/home/homayoon', cols: 80, rows: 24 };

describe('windowTitle', () => {
  test('mac at home shows the user', () => {
    expect(windowTitle('mac', { ...mac, cwd: '/Users/homayoon' })).toBe('homayoon — -zsh — 80×24');
  });
  test('mac in a folder shows its name and the size', () => {
    expect(windowTitle('mac', { ...mac, cwd: '/Users/homayoon/bar', cols: 100, rows: 30 })).toBe('bar — -zsh — 100×30');
  });
  test('mac at root', () => {
    expect(windowTitle('mac', { ...mac, cwd: '/' })).toBe('/ — -zsh — 80×24');
  });
  test('linux shows user@host and the prompt dir', () => {
    expect(windowTitle('linux', { ...lin, cwd: '/home/homayoon/bar' })).toBe('homayoon@bar: ~/bar');
    expect(windowTitle('linux', { ...lin, cwd: '/home/homayoon' })).toBe('homayoon@bar: ~');
    expect(windowTitle('linux', { ...lin, cwd: '/etc' })).toBe('homayoon@bar: /etc');
  });
  test('windows is fixed', () => {
    expect(windowTitle('windows', { ...mac, cwd: '/Users/homayoon/bar' })).toBe('Windows PowerShell');
  });
});
