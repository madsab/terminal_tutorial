import { describe, expect, test } from 'vitest';
import { LineEditor } from '../../src/client/terminal/line-editor.js';

const typed = (text: string) => {
  const e = new LineEditor();
  e.type(text);
  return e;
};

describe('LineEditor', () => {
  test('typing appends at the cursor', () => {
    const e = typed('cd bar');
    expect(e.buffer).toBe('cd bar');
    expect(e.cursor).toBe(6);
  });

  test('backspace removes the character before the cursor, and is safe on an empty line', () => {
    const e = typed('cd bax');
    e.backspace();
    e.type('r');
    expect(e.buffer).toBe('cd bar');
    const empty = new LineEditor();
    empty.backspace();
    expect(empty.buffer).toBe('');
    expect(empty.cursor).toBe(0);
  });

  test('left/right move the cursor and typing inserts there', () => {
    const e = typed('cd br');
    e.left();
    e.left();
    e.type('a');
    expect(e.buffer).toBe('cd abr');
    e.right();
    e.right();
    e.right();
    expect(e.cursor).toBe(6);
    e.left();
    e.backspace();
    expect(e.buffer).toBe('cd ar');
  });

  test('left and right stop at the ends', () => {
    const e = typed('ab');
    e.right();
    expect(e.cursor).toBe(2);
    e.home();
    e.left();
    expect(e.cursor).toBe(0);
    e.end();
    expect(e.cursor).toBe(2);
  });

  test('delete removes the character under the cursor', () => {
    const e = typed('abc');
    e.home();
    e.del();
    expect(e.buffer).toBe('bc');
  });

  test('submit returns the line, clears it and records history', () => {
    const e = typed('ls');
    expect(e.submit()).toBe('ls');
    expect(e.buffer).toBe('');
    expect(e.cursor).toBe(0);
  });

  test('up and down walk history and restore the unfinished line', () => {
    const e = new LineEditor();
    for (const l of ['ls', 'cd bar', 'pwd']) {
      e.type(l);
      e.submit();
    }
    e.type('dra');
    e.up();
    expect(e.buffer).toBe('pwd');
    e.up();
    expect(e.buffer).toBe('cd bar');
    e.up();
    e.up();
    expect(e.buffer).toBe('ls');
    e.down();
    expect(e.buffer).toBe('cd bar');
    e.down();
    e.down();
    expect(e.buffer).toBe('dra');
    e.down();
    expect(e.buffer).toBe('dra');
    expect(e.cursor).toBe(3);
  });

  test('history skips empty lines and consecutive duplicates', () => {
    const e = new LineEditor();
    for (const l of ['ls', 'ls', '', 'pwd']) {
      e.type(l);
      e.submit();
    }
    e.up();
    e.up();
    expect(e.buffer).toBe('ls');
    e.up();
    expect(e.buffer).toBe('ls');
  });

  test('Ctrl+C clears the line without recording history', () => {
    const e = typed('rm -rf');
    e.ctrlC();
    expect(e.buffer).toBe('');
    e.up();
    expect(e.buffer).toBe('');
  });

  test('hidden input echoes nothing, still collects the text and keeps it out of history', () => {
    const e = new LineEditor();
    e.hidden = true;
    e.type('geheim');
    expect(e.display()).toBe('');
    expect(e.buffer).toBe('geheim');
    e.backspace();
    expect(e.submit()).toBe('geheim'.slice(0, -1));
    e.hidden = false;
    e.up();
    expect(e.buffer).toBe('');
  });

  test('hidden input ignores history keys and cursor moves', () => {
    const e = new LineEditor();
    e.type('ls');
    e.submit();
    e.hidden = true;
    e.type('ab');
    e.up();
    e.left();
    expect(e.buffer).toBe('ab');
    expect(e.cursor).toBe(2);
  });

  test('clearLine resets the buffer but keeps history (Ctrl+U style)', () => {
    const e = typed('abc');
    e.clearLine();
    expect(e.buffer).toBe('');
  });

  test('setBuffer replaces the line and puts the cursor at the end (Tab)', () => {
    const e = typed('cd ba');
    e.setBuffer('cd bar/');
    expect(e.cursor).toBe(7);
  });
});
