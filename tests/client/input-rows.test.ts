import { describe, expect, it } from 'vitest';
import { inputRowsUp } from '../../src/client/terminal/input-rows.js';

/** A fake buffer: `wrapped[i]` says whether absolute row i continues the row above it. */
const fake = (wrapped: boolean[], baseY: number, cursorY: number) => ({
  baseY,
  cursorY,
  getLine: (y: number) => (y >= 0 && y < wrapped.length ? { isWrapped: wrapped[y] } : undefined),
}) as unknown as Parameters<typeof inputRowsUp>[0];

describe('inputRowsUp', () => {
  it('is 0 for an unwrapped line', () => {
    expect(inputRowsUp(fake([false, false, false], 0, 2))).toBe(0);
  });

  it('counts the rows of a wrapped line', () => {
    expect(inputRowsUp(fake([false, false, true, true], 0, 3))).toBe(2);
  });

  it('uses the absolute row once the terminal has scrolled (baseY > 0)', () => {
    // 30 rows of scrollback, then a 3-row wrapped input line at absolute rows 30..32 with the cursor on the last.
    const wrapped = Array.from({ length: 33 }, (_, i) => i === 31 || i === 32);
    expect(inputRowsUp(fake(wrapped, 30, 2))).toBe(2);
  });

  it('ignores a wrapped row at page index cursorY when the current line is not wrapped', () => {
    // Absolute row 2 (== cursorY) is a stale wrapped scrollback row; the real cursor row is 22 and unwrapped.
    const wrapped = Array.from({ length: 23 }, (_, i) => i === 1 || i === 2);
    expect(inputRowsUp(fake(wrapped, 20, 2))).toBe(0);
  });
});
