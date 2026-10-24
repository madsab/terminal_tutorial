import type { ClientMsg, MyResult, ServerMsg } from '../shared/protocol.js';
import type { TaskUpdate } from '../tasks/api.js';
import { findTask, taskOrder } from '../tasks/registry.js';
import { createNet } from './net.js';
import { renderEnding } from './screens/ending.js';
import { renderJoin } from './screens/join.js';
import { renderPickOs } from './screens/pick-os.js';
import { mountTaskScreen } from './screens/task.js';
import { renderWaiting } from './screens/waiting.js';
import { defaultOs, loadIdentity, read, saveIdentity, write } from './storage.js';

/** The student app: join -> pick OS -> waiting -> task -> ending (-> freeplay), driven by the server. */
export function startStudentApp(root: HTMLElement): void {
  const id = loadIdentity();
  let name = id.name;
  let os = id.os ?? defaultOs(navigator.userAgent);
  let active: { taskId: string; kind: 'task' | 'ending' | 'freeplay'; destroy?: () => void } | null = null;
  let lastProgress = '';
  let pendingEnded: Extract<ClientMsg, { type: 'ended' }> | null = null;
  let lastProgressMsg: Extract<ClientMsg, { type: 'progress' }> | null = null;
  let identified = false;
  let waitingFor: 'task' | 'setup' = 'setup';

  const net = createNet<ServerMsg, ClientMsg>({
    onOpen() {
      if (identified) hello();
    },
    onMessage(msg) {
      if (msg.type === 'task') onTask(msg.taskId, msg.myResult);
      else if (msg.type === 'freeplay') onFreeplay();
      else if (msg.type === 'reset') onReset();
    },
  });

  const hello = () => {
    net.send({ type: 'hello', clientId: id.clientId, name, os });
    // Re-send state the server may have missed while the connection was down.
    if (lastProgressMsg && !pendingEnded) net.send(lastProgressMsg);
    if (pendingEnded) net.send(pendingEnded);
  };

  const clearActive = () => {
    active?.destroy?.();
    active = null;
    lastProgress = '';
    lastProgressMsg = null;
    pendingEnded = null;
  };

  const showWaiting = () => {
    waitingFor = 'task';
    clearActive();
    renderWaiting(root, { name, os, onChange: showSetup });
  };

  function showSetup(): void {
    waitingFor = 'setup';
    clearActive();
    renderJoin(root, {
      name,
      onSubmit(n) {
        name = n;
        renderPickOs(root, {
          os,
          onBack: showSetup,
          onPick(picked) {
            os = picked;
            saveIdentity(name, os);
            identified = true;
            hello();
            showWaiting();
          },
        });
      },
    });
  }

  function onTask(taskId: string | null, myResult?: MyResult): void {
    if (!identified || waitingFor === 'setup') return;
    write('tq.freeplay', ''); // a new freeplay starts on task 1
    if (taskId === null) return showWaiting();
    if (active?.taskId === taskId && active.kind !== 'freeplay') return; // same task again after a reconnect: keep playing
    const def = findTask(taskId);
    clearActive();
    if (!def) {
      root.textContent = `Ukjent oppgave «${taskId}». Last siden på nytt.`;
      return;
    }
    if (myResult) {
      renderEnding(root, def, myResult, { name, os });
      active = { taskId, kind: 'ending' };
      return;
    }
    const screen = mountTaskScreen(root, {
      def,
      mode: os,
      student: { name, os },
      waitingNote: true,
      // Called once at mount too, which tells the admin the student has the task open.
      onProgress: (u) => sendProgress(taskId, u),
      onEnded(u) {
        pendingEnded = { type: 'ended', taskId, endingId: u.ending!.id, correct: u.ending!.correct, stats: u.stats };
        net.send(pendingEnded);
      },
    });
    active = { taskId, kind: 'task', destroy: screen.destroy };
  }

  function onFreeplay(): void {
    if (!identified || waitingFor === 'setup') return;
    if (active?.kind === 'freeplay') return; // reconnect: keep playing
    const saved = Number(read('tq.freeplay'));
    showFreeplay(Number.isInteger(saved) && saved >= 0 && saved < taskOrder.length ? saved : 0);
  }

  /** Mounts task `i` from scratch. Nothing is sent to the server, so the admin never sees freeplay. */
  function showFreeplay(i: number): void {
    const def = taskOrder[i];
    clearActive();
    write('tq.freeplay', String(i));
    const screen = mountTaskScreen(root, {
      def,
      mode: os,
      student: { name, os },
      nav: {
        title: def.title,
        onPrev: i > 0 ? () => showFreeplay(i - 1) : undefined,
        onNext: i < taskOrder.length - 1 ? () => showFreeplay(i + 1) : undefined,
      },
      onRetry: () => showFreeplay(i),
    });
    active = { taskId: def.id, kind: 'freeplay', destroy: screen.destroy };
  }

  function sendProgress(taskId: string, u: TaskUpdate): void {
    const msg: ClientMsg = { type: 'progress', taskId, stepsDone: u.stepsDone, stats: u.stats };
    const key = JSON.stringify([msg.stepsDone, msg.stats]);
    if (key === lastProgress) return;
    lastProgress = key;
    lastProgressMsg = msg;
    net.send(msg);
  }

  function onReset(): void {
    write('tq.freeplay', '');
    waitingFor = 'task';
    clearActive();
    hello();
    showWaiting();
  }

  if (name && id.os) {
    identified = true;
    showWaiting();
  } else showSetup();
}
