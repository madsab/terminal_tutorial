/** Pure line-editing state: buffer, cursor and history. No terminal code in here. */
export class LineEditor {
  buffer = '';
  cursor = 0;
  /** Password mode: nothing is echoed, history and cursor keys are ignored. */
  hidden = false;
  private history: string[] = [];
  /** Index into history while browsing, or history.length when on the live line. */
  private pos = 0;
  private draft = '';

  display(): string {
    return this.hidden ? '' : this.buffer;
  }

  type(text: string): void {
    this.buffer = this.buffer.slice(0, this.cursor) + text + this.buffer.slice(this.cursor);
    this.cursor += text.length;
  }

  backspace(): void {
    if (this.cursor === 0) return;
    this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
    this.cursor--;
  }

  del(): void {
    this.buffer = this.buffer.slice(0, this.cursor) + this.buffer.slice(this.cursor + 1);
  }

  left(): void {
    if (!this.hidden && this.cursor > 0) this.cursor--;
  }

  right(): void {
    if (!this.hidden && this.cursor < this.buffer.length) this.cursor++;
  }

  home(): void {
    if (!this.hidden) this.cursor = 0;
  }

  end(): void {
    if (!this.hidden) this.cursor = this.buffer.length;
  }

  up(): void {
    if (this.hidden || this.pos === 0) return;
    if (this.pos === this.history.length) this.draft = this.buffer;
    this.pos--;
    this.setBuffer(this.history[this.pos]);
  }

  down(): void {
    if (this.hidden || this.pos >= this.history.length) return;
    this.pos++;
    this.setBuffer(this.pos === this.history.length ? this.draft : this.history[this.pos]);
  }

  setBuffer(text: string): void {
    this.buffer = text;
    this.cursor = text.length;
  }

  clearLine(): void {
    this.setBuffer('');
  }

  /** Ctrl+C: abandon the line. */
  ctrlC(): void {
    this.clearLine();
    this.pos = this.history.length;
  }

  /** Enter: returns the line and starts a fresh one. */
  submit(): string {
    const line = this.buffer;
    if (!this.hidden && line.trim() && this.history.at(-1) !== line) this.history.push(line);
    this.clearLine();
    this.pos = this.history.length;
    this.draft = '';
    return line;
  }
}
