import type { ITerminalOptions } from '@xterm/xterm';
import type { OsMode } from '../../shell/modes.js';

const CAMPBELL = {
  black: '#0c0c0c', red: '#c50f1f', green: '#13a10e', yellow: '#c19c00',
  blue: '#0037da', magenta: '#881798', cyan: '#3a96dd', white: '#cccccc',
  brightBlack: '#767676', brightRed: '#e74856', brightGreen: '#16c60c', brightYellow: '#f9f1a5',
  brightBlue: '#3b78ff', brightMagenta: '#b4009e', brightCyan: '#61d6d6', brightWhite: '#f2f2f2',
};

const TANGO = {
  black: '#2e3436', red: '#cc0000', green: '#4e9a06', yellow: '#c4a000',
  blue: '#3465a4', magenta: '#75507b', cyan: '#06989a', white: '#d3d7cf',
  brightBlack: '#555753', brightRed: '#ef2929', brightGreen: '#8ae234', brightYellow: '#fce94f',
  brightBlue: '#729fcf', brightMagenta: '#ad7fa8', brightCyan: '#34e2e2', brightWhite: '#eeeeec',
};

/** Bundled font family per mode. Menlo and Cascadia are system fonts and fall back if missing. */
export const bundledFont: Partial<Record<OsMode, string>> = { linux: 'Ubuntu Mono' };

/** Look-and-feel per OS. Styling only: the logic never reads these. */
export const terminalOptions: Record<OsMode, ITerminalOptions> = {
  // macOS Terminal, "Basic" profile
  mac: {
    fontFamily: 'Menlo, "SF Mono", Monaco, monospace',
    fontSize: 13,
    cursorStyle: 'block',
    cursorBlink: false,
    theme: { background: '#ffffff', foreground: '#000000', cursor: '#7f7f7f', selectionBackground: '#b3d7ff', blue: '#0000c0' },
  },
  // Ubuntu GNOME Terminal
  linux: {
    fontFamily: '"Ubuntu Mono", "DejaVu Sans Mono", Menlo, monospace',
    fontSize: 16,
    cursorStyle: 'block',
    cursorBlink: true,
    theme: { ...TANGO, background: '#300a24', foreground: '#eeeeec', cursor: '#eeeeec', selectionBackground: '#4a2a42' },
  },
  // Windows Terminal, Windows PowerShell profile, Campbell scheme
  windows: {
    fontFamily: '"Cascadia Mono", Consolas, "Courier New", monospace',
    fontSize: 14,
    cursorStyle: 'bar',
    cursorBlink: true,
    theme: { ...CAMPBELL, background: '#0c0c0c', foreground: '#cccccc', cursor: '#ffffff', selectionBackground: '#3a3a3a' },
  },
};

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
export const visibleLength = (s: string) => s.replace(ANSI, '').length;

/** Colours the prompt like the real shell does. */
export function colorPrompt(mode: OsMode, prompt: string): string {
  if (mode === 'linux') {
    const m = /^(\(.*?\) )?(.+?@.+?):(.*)\$ $/.exec(prompt);
    if (m) return `${m[1] ?? ''}\x1b[01;32m${m[2]}\x1b[00m:\x1b[01;34m${m[3]}\x1b[00m$ `;
  }
  return prompt;
}
