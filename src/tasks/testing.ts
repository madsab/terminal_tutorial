import { plain } from './plain.js';
import type { SceneApi, TaskDefinition, TaskUpdate } from './api.js';
import type { OsMode } from '../shell/modes.js';
import type { RunResult } from '../shell/engine.js';
import { TaskRuntime } from './runtime.js';

/** A scene that records every call, for tests and for running a task without a browser. */
export class RecordingScene implements SceneApi {
  calls: unknown[][] = [];
  walkTo = (spot: string) => void this.calls.push(['walkTo', spot]);
  spawn = (id: string, kind: string, spot: string, label?: string) =>
    void this.calls.push(label === undefined ? ['spawn', id, kind, spot] : ['spawn', id, kind, spot, label]);
  move = (id: string, spot: string) => void this.calls.push(['move', id, spot]);
  wander = (id: string) => void this.calls.push(['wander', id]);
  remove = (id: string) => void this.calls.push(['remove', id]);
  play = (anim: string) => void this.calls.push(['play', anim]);
  say = (text: string) => void this.calls.push(['say', text]);
}

export interface ScriptRun<S> {
  state: S;
  update: TaskUpdate;
  /** Terminal output of each line, without colour codes. A line answering a hidden prompt has no entry. */
  output: string[];
  sceneCalls: unknown[][];
  /** How many times an update carried a new ending (should be 0 or 1). */
  endings: number;
  runtime: TaskRuntime<S>;
}

/**
 * Runs lines against a task in one OS mode. A line typed while a hidden-input prompt is open
 * (e.g. the sudo password) answers that prompt.
 */
export async function runTaskScript<S>(def: TaskDefinition<S>, mode: OsMode, lines: string[]): Promise<ScriptRun<S>> {
  const scene = new RecordingScene();
  const runtime = new TaskRuntime(def, mode, scene);
  let endings = 0;
  let last: TaskUpdate['ending'];
  runtime.onUpdate((u) => {
    if (u.ending && u.ending !== last) endings++;
    last = u.ending;
  });
  const output: string[] = [];
  let pending: RunResult['requestInput'];
  let carry = '';
  for (const line of lines) {
    if (pending) {
      const r = await pending.resume(line);
      carry += (carry && r.output ? '\n' : '') + plain(r.output);
      pending = r.requestInput;
      if (!pending) {
        output[output.length - 1] = [output.at(-1), carry].filter(Boolean).join('\n');
        carry = '';
      }
      continue;
    }
    const r = await runtime.shell.run(line);
    output.push(plain(r.output));
    pending = r.requestInput;
  }
  return { state: runtime.state, update: runtime.update, output, sceneCalls: scene.calls, endings, runtime };
}
