import { describe, expect, it } from 'vitest';
import { inlineCode, splitTitle } from '../../src/client/dom.js';

describe('splitTitle', () => {
  it('splits on the first ": "', () => {
    expect(splitTitle('Oppgave 1: Homayoon Bar')).toEqual({ eyebrow: 'Oppgave 1', name: 'Homayoon Bar' });
    expect(splitTitle('A: B: C')).toEqual({ eyebrow: 'A', name: 'B: C' });
  });
  it('has no eyebrow without a separator', () => {
    expect(splitTitle('Fri lek')).toEqual({ eyebrow: null, name: 'Fri lek' });
  });
});

describe('inlineCode', () => {
  it('splits on backtick pairs', () => {
    expect(inlineCode('Skriv `ls` nå')).toEqual([
      { code: false, text: 'Skriv ' },
      { code: true, text: 'ls' },
      { code: false, text: ' nå' },
    ]);
  });
  it('keeps an unmatched backtick literal', () => {
    expect(inlineCode('a `b')).toEqual([{ code: false, text: 'a `b' }]);
  });
  it('handles plain text, empty text and several pairs', () => {
    expect(inlineCode('bare tekst')).toEqual([{ code: false, text: 'bare tekst' }]);
    expect(inlineCode('')).toEqual([]);
    expect(inlineCode('`a` og `b`')).toEqual([
      { code: true, text: 'a' },
      { code: false, text: ' og ' },
      { code: true, text: 'b' },
    ]);
  });
});
