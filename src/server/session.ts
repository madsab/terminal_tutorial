import { mkdirSync, readFileSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { AdminServerMsg, MyResult, Os, Row, Stats } from '../shared/protocol.js';

export interface TaskInfo {
  id: string;
  title: string;
  intro?: string;
}

interface Student {
  clientId: string;
  name: string;
  os: Os;
}

interface Result {
  status: 'jobber' | 'ferdig';
  steps: number;
  stats: Stats;
  endingId?: string;
  correct?: boolean;
}

export interface SessionSnapshot {
  students: Student[];
  started: string[];
  current: string | null;
  results: Record<string, Record<string, Result>>;
  freeplay?: boolean;
}

const SAVE_DELAY_MS = 250;

/** The whole classroom session: who joined, which tasks started, and how each student is doing. */
export class Session {
  private students = new Map<string, Student>();
  private started: string[] = [];
  private results: Record<string, Record<string, Result>> = {};
  private inFreeplay = false;
  private timer?: NodeJS.Timeout;
  private saving: Promise<void> = Promise.resolve();
  private readonly file: string;

  constructor(
    private readonly dataDir: string,
    private readonly tasks: TaskInfo[],
  ) {
    this.file = join(dataDir, 'session.json');
    this.load();
  }

  get current(): string | null {
    return this.started.at(-1) ?? null;
  }

  get freeplay(): boolean {
    return this.inFreeplay;
  }

  private hasTask(id: string) {
    return this.tasks.some((t) => t.id === id);
  }

  join(clientId: string, name: string, os: Os): void {
    this.students.set(clientId, { clientId, name, os });
    this.changed();
  }

  /** Records progress. Only the current task takes progress, and a finished student stays finished. */
  progress(clientId: string, taskId: string, stepsDone: boolean[], stats: Stats): void {
    if (this.inFreeplay || !this.students.has(clientId) || taskId !== this.current) return;
    const table = (this.results[taskId] ??= {});
    if (table[clientId]?.status === 'ferdig') return;
    table[clientId] = { status: 'jobber', steps: stepsDone.filter(Boolean).length, stats };
    this.changed();
  }

  /** The first ending is final. Returns false when it is ignored. */
  end(clientId: string, taskId: string, endingId: string, correct: boolean, stats: Stats): boolean {
    if (this.inFreeplay || !this.students.has(clientId) || !this.started.includes(taskId)) return false;
    const table = (this.results[taskId] ??= {});
    if (table[clientId]?.status === 'ferdig') return false;
    table[clientId] = { status: 'ferdig', steps: table[clientId]?.steps ?? 0, stats, endingId, correct };
    this.changed();
    return true;
  }

  /** Starts the next task in the order. Returns its id, or null when there are no more. */
  startNext(): string | null {
    const next = this.tasks[this.started.length];
    if (!next) return null;
    this.started.push(next.id);
    this.changed();
    return next.id;
  }

  /** Lets students roam all tasks once the last one has started. Freezes the results. */
  startFreeplay(): boolean {
    if (this.inFreeplay || this.started.length < this.tasks.length) return false;
    this.inFreeplay = true;
    this.changed();
    return true;
  }

  reset(): void {
    this.students.clear();
    this.started = [];
    this.results = {};
    this.inFreeplay = false;
    this.changed();
  }

  resultFor(clientId: string, taskId: string): MyResult | undefined {
    const r = this.results[taskId]?.[clientId];
    if (r?.status !== 'ferdig' || r.endingId === undefined) return undefined;
    return { endingId: r.endingId, correct: r.correct ?? false, stats: r.stats };
  }

  rows(taskId: string): Row[] {
    return [...this.students.values()].map((s) => {
      const r = this.results[taskId]?.[s.clientId];
      const row: Row = { clientId: s.clientId, name: s.name, os: s.os, status: r?.status ?? 'venter', stats: r?.stats ?? {} };
      if (r?.status === 'ferdig') {
        row.endingId = r.endingId;
        row.correct = r.correct;
      } else if (r) row.steps = r.steps;
      return row;
    });
  }

  adminState(): Extract<AdminServerMsg, { type: 'state' }> {
    const next = this.tasks[this.started.length];
    return {
      type: 'state',
      currentTaskId: this.current,
      nextTask: next ? { taskId: next.id, title: next.title } : null,
      tasks: this.started.map((id) => ({ taskId: id, title: this.tasks.find((t) => t.id === id)!.title, intro: this.tasks.find((t) => t.id === id)!.intro, rows: this.rows(id) })),
      students: this.students.size,
      freeplay: this.inFreeplay,
    };
  }

  snapshot(): SessionSnapshot {
    return {
      students: [...this.students.values()],
      started: [...this.started],
      current: this.current,
      results: structuredClone(this.results),
      freeplay: this.inFreeplay,
    };
  }

  // ---- persistence ----

  private changed(): void {
    this.timer ??= setTimeout(() => void this.flush(), SAVE_DELAY_MS).unref();
  }

  /** Writes the state now (atomic: temp file, then rename). */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const json = JSON.stringify(this.snapshot());
    this.saving = this.saving.then(async () => {
      try {
        mkdirSync(this.dataDir, { recursive: true });
        await writeFile(`${this.file}.tmp`, json);
        await rename(`${this.file}.tmp`, this.file);
      } catch (err) {
        console.error('Kunne ikke lagre økten:', err);
      }
    });
    return this.saving;
  }

  private load(): void {
    let snap: SessionSnapshot;
    try {
      snap = JSON.parse(readFileSync(this.file, 'utf8'));
    } catch {
      return;
    }
    const known = (id: unknown) => typeof id === 'string' && this.hasTask(id);
    const order = this.tasks.slice(0, snap.started?.length ?? 0).map((t) => t.id);
    if (!Array.isArray(snap.students) || !Array.isArray(snap.started) || !snap.started.every(known) || snap.started.join() !== order.join()) {
      console.warn('Ignorerer ugyldig session.json, starter på nytt.');
      return;
    }
    this.students = new Map(snap.students.map((s) => [s.clientId, s]));
    this.started = snap.started;
    this.results = snap.results ?? {};
    this.inFreeplay = snap.freeplay === true && this.started.length === this.tasks.length;
  }
}
