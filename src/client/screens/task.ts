import type { TaskDefinition, TaskUpdate } from '../../tasks/api.js';
import { TaskRuntime } from '../../tasks/runtime.js';
import type { Os } from '../../shared/protocol.js';
import { createDeferredScene } from '../scene/deferred.js';
import { resolveHead } from '../scene/head.js';
import { mountScene, type MountedScene } from '../scene/scene-view.js';
import type { OsMode } from '../../shell/modes.js';
import { mountTerminal } from '../terminal/xterm-shell.js';
import { mountTerminalWindow } from '../terminal/window-chrome.js';
import { appendInlineCode, el, taskHeading } from '../dom.js';
import { endingCard } from './ending-card.js';
import { resultSummary } from './result-summary.js';
import { showResultDialog } from './result-dialog.js';
import { renderTopbar, type TopbarNav } from './topbar.js';
import { visibleStepCount } from './steps.js';

export interface TaskScreenOptions {
  def: TaskDefinition<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  mode: OsMode;
  /** Shown in the top bar (name + OS pill). Omitted in preview mode. */
  student?: { name: string; os: Os };
  onProgress?(update: TaskUpdate): void;
  onEnded?(update: TaskUpdate): void;
  /** Adds "Venter på neste oppgave…" under the ending (classroom mode). */
  waitingNote?: boolean;
  /** Freeplay: the task switcher in the top bar. */
  nav?: TopbarNav;
  /** Freeplay: adds "Prøv igjen" to the ending. */
  onRetry?(): void;
}

/** The character's head photo when it exists, otherwise the placeholder's colour and initial. */
function avatar(head: string): HTMLElement {
  const box = el('div', 'avatar', undefined, { 'aria-hidden': 'true' });
  const fallback = () => {
    const spec = resolveHead(head, new Set());
    if (spec.kind !== 'placeholder') return;
    box.replaceChildren(document.createTextNode(spec.initial));
    box.style.background = spec.color;
  };
  const img = el('img', '', undefined, { alt: '', src: new URL(`local-assets/heads/${head}`, document.baseURI).href });
  img.addEventListener('error', fallback, { once: true });
  box.append(img);
  return box;
}

/** Task window (scene + task panel) on top, terminal below. Styling lives in styles.css. */
export function mountTaskScreen(root: HTMLElement, opts: TaskScreenOptions): { destroy(): void } {
  root.replaceChildren();
  const page = el('div', 'task-screen');
  const win = el('section', 'task-window');
  const sceneHost = el('div', 'scene');

  const panel = el('aside', 'task-panel card');
  const heading = taskHeading(opts.def.title);
  const head = el('div', 'task-head');
  head.append(avatar(opts.def.character.head), heading);

  const intro = el('p', 'task-intro');
  if (opts.def.intro) appendInlineCode(intro, opts.def.intro);
  else intro.hidden = true;

  const commands = el('div', 'task-commands');
  commands.append(el('div', 'eyebrow', 'Kommandoer'));
  const chips = el('div', 'chips');
  for (const c of opts.def.commands) chips.append(el('code', 'chip', c));
  commands.append(chips);

  const goalsHead = el('div', 'goals-head');
  const counter = el('span', 'goals-count');
  goalsHead.append(el('span', 'eyebrow', 'Mål'), counter);
  const bar = el('div', 'progress', undefined, { 'aria-hidden': 'true' });
  const barFill = el('div', 'progress-fill');
  bar.append(barFill);
  const steps = el('ol', 'task-steps');

  const feedback = el('p', 'task-feedback', undefined, { role: 'status', 'aria-live': 'polite' });
  feedback.hidden = true;

  const hint = el('details', 'task-hint');
  hint.append(el('summary', '', 'Trenger du hjelp? Vis hint'));
  const hintText = el('p', 'task-hint-text');
  hint.append(hintText);

  const endingSlot = el('div', 'task-ending');
  endingSlot.hidden = true;

  panel.append(head, intro, commands, goalsHead, bar, steps, feedback, hint, endingSlot);
  win.append(sceneHost, panel);
  const termHost = el('div', 'terminal');
  page.append(renderTopbar({ student: opts.student, nav: opts.nav }), win, termHost);
  root.append(page);

  const scene = createDeferredScene();
  let mounted: MountedScene | undefined;
  let destroyed = false;
  mountScene(sceneHost, opts.def.map, opts.def.character).then(
    (s) => {
      if (destroyed) return s.destroy();
      mounted = s;
      scene.attach(s);
    },
    (err) => console.error('Scene failed', err),
  );
  const runtime = new TaskRuntime(opts.def, opts.mode, scene);
  const termWin = mountTerminalWindow(termHost, opts.mode);
  const terminal = mountTerminal(termWin.body, runtime.shell, opts.mode, { onTitle: termWin.setTitle });
  let ended = false;
  let prevDone = 0;
  let dialogTimer: ReturnType<typeof setTimeout> | undefined;
  let dialog: { close(): void } | undefined;

  const render = (u: TaskUpdate) => {
    const done = u.stepsDone.filter(Boolean).length;
    const current = u.stepsDone.findIndex((d) => !d);
    if (done > prevDone) hint.open = false;
    prevDone = done;
    counter.textContent = `${done} av ${u.stepTexts.length}`;
    barFill.style.width = `${u.stepTexts.length ? (done / u.stepTexts.length) * 100 : 0}%`;
    steps.replaceChildren(
      ...u.stepTexts.slice(0, visibleStepCount(u.stepsDone)).map((text, i) => {
        const isDone = u.stepsDone[i];
        const li = el('li', isDone ? 'step done' : i === current && !u.ending ? 'step current' : 'step');
        li.append(el('span', 'check', isDone ? '✓' : '', { 'aria-hidden': 'true' }));
        const story = u.stepCompletionTexts[i];
        if (story) {
          const body = el('div', 'step-body');
          const storyText = el('p', 'step-story');
          appendInlineCode(storyText, story);
          body.append(el('span', 'step-text', text), el('span', 'visually-hidden', ' (ferdig)'), storyText);
          li.append(body);
        } else {
          li.append(el('span', 'step-text', text));
          if (isDone) li.append(el('span', 'visually-hidden', ' (ferdig)'));
        }
        return li;
      }),
    );
    if (u.feedback) {
      feedback.textContent = u.feedback;
      feedback.hidden = false;
    }
    hintText.replaceChildren();
    appendInlineCode(hintText, u.hint);
    if (u.ending && !ended) {
      ended = true;
      terminal.lock();
      feedback.hidden = true;
      hint.hidden = true;
      endingSlot.hidden = false;
      panel.classList.add('ended');
      endingSlot.replaceChildren(
        endingCard({ text: u.ending.text, correct: u.ending.correct, stats: u.stats, waitingNote: !!opts.waitingNote, onRetry: opts.onRetry }),
      );
      // Let the last scene effect play before the dialog covers it.
      dialogTimer = setTimeout(() => {
        dialog = showResultDialog(resultSummary(u)!, { waitingNote: !!opts.waitingNote, onRetry: opts.onRetry });
      }, 900);
      opts.onEnded?.(u);
    } else if (!u.ending) opts.onProgress?.(u);
  };
  runtime.onUpdate(render);
  render(runtime.update);

  return {
    destroy() {
      destroyed = true;
      clearTimeout(dialogTimer);
      dialog?.close();
      mounted?.destroy();
      terminal.dispose();
      root.replaceChildren();
    },
  };
}
