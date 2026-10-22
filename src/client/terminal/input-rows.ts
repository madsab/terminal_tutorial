import type { IBuffer } from '@xterm/xterm';

/**
 * How many rows the cursor sits below the first row of the input line it is on. Read from xterm's buffer because a
 * resize reflows wrapped rows. `cursorY` is relative to the visible page (`baseY`), `getLine` takes an absolute index.
 */
export function inputRowsUp(buf: Pick<IBuffer, 'baseY' | 'cursorY' | 'getLine'>): number {
  const y = buf.baseY + buf.cursorY;
  let start = y;
  while (start > 0 && buf.getLine(start)?.isWrapped) start--;
  return y - start;
}
