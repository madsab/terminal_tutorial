import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { RunResult, Shell } from '../../shell/engine.js';
import { windowTitle, type OsMode } from '../../shell/modes.js';
import { inputRowsUp } from './input-rows.js';
import { LineEditor } from './line-editor.js';
import { bundledFont, colorPrompt, terminalOptions, visibleLength } from './themes.js';

export interface MountedTerminal {
  lock(): void;
  focus(): void;
  dispose(): void;
}

const crlf = (s: string) => s.replace(/\r?\n/g, '\r\n');

/** Splits keyboard/paste data into single keys and escape sequences. */
function splitKeys(data: string): string[] {
  return data.match(/\x1b\[[0-9;]*[A-Za-z~]|\x1b.|[\s\S]/g) ?? [];
}

export interface MountOptions {
  /** Called after every prompt and every resize with the window title text. */
  onTitle?(title: string): void;
}

export function mountTerminal(el: HTMLElement, shell: Shell, mode: OsMode, opts: MountOptions = {}): MountedTerminal {
  const term = new Terminal({ convertEol: false, scrollback: 1000, ...terminalOptions[mode] });
  const fit = new FitAddon();
  term.loadAddon(fit);
  let disposed = false;
  let frame = 0;
  let observer: ResizeObserver | undefined;
  const editor = new LineEditor();
  let locked = false;
  let promptText = '';
  let promptLen = 0;
  /** Where a pending hidden-input prompt sends the line. */
  let pendingInput: ((line: string) => Promise<void>) | null = null;
  /** Keys are handled one after another, so a slow command never reorders typing. */
  let queue: Promise<void> = Promise.resolve();
  /** Cursor offset (in chars after the prompt) the screen currently shows. */
  let shownCursor = 0;

  const cols = () => Math.max(term.cols, 1);

  const emitTitle = () =>
    opts.onTitle?.(windowTitle(mode, { user: shell.user, host: shell.host, cwd: shell.cwd, home: shell.home, cols: term.cols, rows: term.rows }));

  function writePrompt(text: string) {
    emitTitle();
    promptText = text;
    promptLen = visibleLength(text);
    shownCursor = 0;
    term.write(colorPrompt(mode, text));
  }

  /**
   * Repaint the input line, wrap-aware, then put the cursor where the editor says. `rowsUp` is how far the cursor sits
   * below the start of the line: counted from what was drawn last, unless a resize reflowed it (then see refit).
   */
  function redraw(rowsUp = Math.floor((promptLen + shownCursor) / cols())) {
    const c = cols();
    const text = editor.display();
    let out = (rowsUp > 0 ? `\x1b[${rowsUp}A` : '') + '\r' + colorPrompt(mode, promptText) + '\x1b[J' + text;
    const endPos = promptLen + text.length;
    const curPos = promptLen + (editor.hidden ? 0 : editor.cursor);
    if (text.length > 0 && endPos % c === 0) out += ' \r'; // force the pending wrap
    const upRows = Math.floor(endPos / c) - Math.floor(curPos / c);
    if (upRows > 0) out += `\x1b[${upRows}A`;
    out += '\r' + (curPos % c > 0 ? `\x1b[${curPos % c}C` : '');
    term.write(out);
    shownCursor = editor.hidden ? 0 : editor.cursor;
  }

  function showResult(r: RunResult) {
    if (r.clear) term.write('\x1b[2J\x1b[3J\x1b[H');
    if (r.output) term.write(crlf(r.output) + '\r\n');
  }

  async function settle(r: RunResult): Promise<void> {
    showResult(r);
    if (r.requestInput) {
      const ri = r.requestInput;
      editor.hidden = ri.hidden;
      promptText = ri.prompt;
      promptLen = visibleLength(ri.prompt);
      shownCursor = 0;
      term.write(ri.prompt);
      pendingInput = async (line) => {
        pendingInput = null;
        editor.hidden = false;
        term.write('\r\n');
        await settle(await ri.resume(line));
      };
      return;
    }
    writePrompt(shell.prompt());
  }

  async function submit() {
    const line = editor.submit();
    if (pendingInput) {
      const p = pendingInput;
      await p(line);
      return;
    }
    term.write('\r\n');
    let result: RunResult;
    try {
      result = await shell.run(line);
    } catch (err) {
      result = { output: `error: ${(err as Error).message}`, ok: false };
    }
    await settle(result);
  }

  function tab() {
    if (editor.hidden || pendingInput) return;
    const before = editor.buffer.slice(0, editor.cursor);
    const after = editor.buffer.slice(editor.cursor);
    const { replacement, options } = shell.complete(before);
    if (replacement !== before) {
      editor.setBuffer(replacement + after);
      editor.cursor = replacement.length;
      redraw();
    } else if (options.length > 1) {
      term.write('\r\n' + options.join('  ') + '\r\n');
      writePrompt(promptText);
      shownCursor = 0;
      redraw();
    }
  }

  async function key(k: string) {
    if (locked) return;
    switch (k) {
      case '\r':
        return submit();
      case '\x7f':
      case '\b':
        editor.backspace();
        break;
      case '\x1b[3~':
        editor.del();
        break;
      case '\x1b[A':
        editor.up();
        break;
      case '\x1b[B':
        editor.down();
        break;
      case '\x1b[C':
        editor.right();
        break;
      case '\x1b[D':
        editor.left();
        break;
      case '\x1b[H':
      case '\x01':
        editor.home();
        break;
      case '\x1b[F':
      case '\x05':
        editor.end();
        break;
      case '\x15':
        editor.clearLine();
        break;
      case '\x0c':
        term.write('\x1b[2J\x1b[3J\x1b[H');
        writePrompt(promptText);
        break;
      case '\t':
        return tab();
      case '\x03':
        editor.ctrlC();
        if (pendingInput) pendingInput = null;
        editor.hidden = false;
        term.write('^C\r\n');
        writePrompt(shell.prompt());
        return;
      default:
        if (k >= ' ' && !k.startsWith('\x1b')) editor.type(k);
        else return;
    }
    redraw();
  }

  const sub = term.onData((data) => {
    for (const k of splitKeys(data)) queue = queue.then(() => key(k));
  });

  /** Refit to the container; if the grid changed, repaint the input line for the new width. */
  function refit() {
    if (disposed || !term.element) return;
    const { cols: c, rows: r } = term;
    fit.fit();
    if (term.cols === c && term.rows === r) return;
    // xterm reflowed the wrapped rows, so the line start is read from its buffer. xterm parses writes asynchronously:
    // the callback runs once every earlier write is in the buffer, so cursorY is current (it is stale while typing).
    if (term.cols !== c && !locked) term.write('', () => !disposed && redraw(inputRowsUp(term.buffer.active)));
    emitTitle();
  }

  const onFonts = () => refit();

  writePrompt(shell.prompt());

  // xterm measures the cell size when it opens, so the font must be ready first.
  const family = bundledFont[mode];
  const fontReady = family ? document.fonts.load(`${terminalOptions[mode].fontSize}px "${family}"`).catch(() => []) : Promise.resolve([]);
  void fontReady.then(() => {
    if (disposed) return;
    term.open(el);
    fit.fit();
    redraw();
    emitTitle();
    term.focus();
    observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(refit);
    });
    observer.observe(el);
    document.fonts.addEventListener('loadingdone', onFonts);
  });

  return {
    lock() {
      locked = true;
      term.options.cursorBlink = false;
    },
    focus: () => term.focus(),
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      document.fonts.removeEventListener('loadingdone', onFonts);
      sub.dispose();
      term.dispose();
    },
  };
}
