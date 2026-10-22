import { describe, expect, test } from 'vitest';
import { backoffDelay } from '../../src/client/net.js';
import { defaultOs, newClientId } from '../../src/client/storage.js';

describe('backoffDelay', () => {
  test('grows from half a second and caps at five seconds', () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(backoffDelay)).toEqual([500, 1000, 2000, 4000, 5000, 5000, 5000]);
  });
});

describe('storage helpers', () => {
  test('defaultOs guesses from the user agent', () => {
    expect(defaultOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac');
    expect(defaultOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
    expect(defaultOs('Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
    expect(defaultOs('')).toBe('mac');
  });

  test('client ids look like the server accepts them and differ', () => {
    const a = newClientId();
    expect(a).toMatch(/^[\w-]{4,64}$/);
    expect(newClientId()).not.toBe(a);
  });
});
