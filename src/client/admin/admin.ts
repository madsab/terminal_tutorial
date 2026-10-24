import '../fonts.js';
import type { AdminMsg, AdminServerMsg, AdminTaskTable, Row } from '../../shared/protocol.js';
import { appendInlineCode, el } from '../dom.js';
import { createNet } from '../net.js';
import { wordmark } from '../screens/join.js';
import { osLabel } from '../screens/pick-os.js';
import { read, write } from '../storage.js';
import { formatStat, summarize, type Summary } from './summary.js';

type State = Extract<AdminServerMsg, { type: 'state' }>;

const root = document.getElementById('admin')!;
let password = '';
let lastState: State | null = null;
let authFailed = false;
let connected = false;
/** Whether the current task's intro is shown above the results. Kept across reloads. */
let showIntro = read('tq.adminIntro') === '1';
/** Earlier tasks the admin expanded. Survives re-renders. */
const openTasks = new Set<string>();

const net = createNet<AdminServerMsg, AdminMsg>({
  onStatus(c) {
    connected = c;
    if (lastState) renderState();
  },
  onOpen() {
    if (password) net.send({ type: 'auth', password });
  },
  onMessage(msg) {
    if (msg.type === 'authFailed') {
      authFailed = true;
      password = '';
      lastState = null;
      renderLogin();
    } else if (msg.type === 'state') {
      authFailed = false;
      lastState = msg;
      renderState();
    }
  },
});

function renderLogin(): void {
  document.body.classList.add('admin-dark');
  const card = el('form', 'card admin-login');
  const input = el('input', '', undefined, { id: 'admin-pw', type: 'password', placeholder: 'Passord', autocomplete: 'current-password', required: '' });
  const label = el('label', 'field-label', 'Passord', { for: 'admin-pw' });
  card.append(wordmark(), el('h1', '', 'Admin'), label, input, el('button', 'btn btn-primary', 'Logg inn', { type: 'submit' }));
  if (authFailed) {
    const err = el('p', 'error admin-error', undefined, { role: 'alert' });
    err.append(el('span', 'error-icon', '!', { 'aria-hidden': 'true' }), document.createTextNode('Feil passord.'));
    card.append(err);
  }
  card.addEventListener('submit', (e) => {
    e.preventDefault();
    password = input.value;
    write('tq.adminPw', password);
    net.send({ type: 'auth', password });
  });
  root.replaceChildren(card);
  input.focus();
}

function statusPill(r: Row): HTMLElement {
  if (r.status === 'ferdig') return el('span', 'pill pill-ok', 'Ferdig');
  // The protocol does not carry the task's step count, so no "n av m".
  if (r.status === 'jobber') return el('span', 'pill pill-work', `Jobber · ${r.steps ?? 0} ✓`);
  return el('span', 'pill pill-wait', 'Venter');
}

function table(rows: Row[]): HTMLElement {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.stats)))];
  const t = el('table', 'results');
  const head = el('tr');
  ['Navn', 'Terminal', 'Status', 'Slutt'].forEach((h) => head.append(el('th', '', h)));
  for (const k of keys) head.append(el('th', 'num', k));
  const thead = el('thead');
  thead.append(head);
  t.append(thead);
  const body = el('tbody');
  for (const r of [...rows].sort((a, b) => a.name.localeCompare(b.name, 'nb'))) {
    const tr = el('tr', `status-${r.status}`, undefined, { 'data-client': r.clientId });
    const status = el('td');
    status.append(statusPill(r));
    const ending = el('td', r.endingId ? (r.correct ? 'ending-ok' : 'ending-bad') : '');
    if (r.endingId) ending.textContent = `${r.correct ? '✓' : '✗'} ${r.endingId}`;
    tr.append(el('td', 'name-cell', r.name), el('td', '', osLabel(r.os)), status, ending);
    for (const k of keys) tr.append(el('td', 'num', formatStat(r.stats[k])));
    body.append(tr);
  }
  t.append(body);
  const box = el('div', 'table-scroll');
  box.append(t);
  return box;
}

function tile(label: string, value: number, cls: string): HTMLElement {
  const t = el('div', `card stat-tile ${cls}`);
  t.append(el('span', 'eyebrow', label), el('span', 'stat-value', String(value)));
  return t;
}

function progressBar(s: Summary): HTMLElement {
  const bar = el('div', 'stack', undefined, { 'aria-hidden': 'true' });
  const pct = (n: number) => `${s.total ? (n / s.total) * 100 : 0}%`;
  for (const [cls, n] of [['stack-ok', s.done], ['stack-work', s.working], ['stack-wait', s.waiting]] as const) {
    const seg = el('span', cls);
    seg.style.width = pct(n);
    bar.append(seg);
  }
  return bar;
}

function topbar(st: State): HTMLElement {
  const bar = el('header', 'admin-topbar');
  const left = el('div', 'admin-topbar-left');
  left.append(wordmark(), el('span', 'admin-badge', 'Admin'));
  const right = el('div', 'admin-topbar-right');
  const live = el('span', `live ${connected ? 'on' : 'off'}`);
  live.append(el('i', 'live-dot', undefined, { 'aria-hidden': 'true' }), document.createTextNode(connected ? 'Live' : 'Kobler til…'));
  right.append(live, el('span', 'admin-students', `${st.students} elever har koblet til`));
  bar.append(left, right);
  return bar;
}

function hero(st: State, current: AdminTaskTable | undefined, s: Summary): HTMLElement {
  const h = el('section', 'card admin-hero');
  const text = el('div', 'hero-text');
  text.append(el('span', 'eyebrow', 'Pågår nå'), el('h1', '', current ? current.title : 'Ingen oppgave startet'));
  if (current) text.append(el('p', 'counter', `${s.done} / ${s.total} ferdig`));

  let next: HTMLButtonElement;
  if (st.nextTask || !st.currentTaskId) {
    next = el('button', 'btn btn-primary start-next', st.nextTask ? `Start neste oppgave: ${st.nextTask.title}` : 'Ingen flere oppgaver', { type: 'button' });
    next.disabled = !st.nextTask;
    next.addEventListener('click', () => {
      next.disabled = true;
      net.send({ type: 'startNext', after: st.currentTaskId });
    });
  } else {
    // Every task has run: let the students roam freely.
    next = el('button', 'btn btn-primary start-freeplay', st.freeplay ? 'Freeplay pågår' : 'Freeplay', { type: 'button' });
    next.disabled = st.freeplay;
    next.addEventListener('click', () => {
      next.disabled = true;
      net.send({ type: 'freeplay' });
    });
  }
  const reset = el('button', 'btn btn-outline-danger new-session', 'Ny økt', { type: 'button' });
  reset.addEventListener('click', () => {
    if (confirm('Dette fjerner alle elever og resultater. Fortsette?')) net.send({ type: 'newSession' });
  });
  const intro = el('button', 'btn btn-outline intro-toggle', showIntro ? 'Skjul intro' : 'Vis intro', { type: 'button', 'aria-pressed': String(showIntro) });
  intro.disabled = !current?.intro;
  intro.addEventListener('click', () => {
    showIntro = !showIntro;
    write('tq.adminIntro', showIntro ? '1' : '0');
    renderState();
  });
  const actions = el('div', 'admin-actions');
  actions.append(intro, next, reset);
  h.append(text, actions);
  return h;
}

function endingChips(s: Summary): HTMLElement {
  const wrap = el('div', 'ending-chips');
  for (const e of s.endings) wrap.append(el('span', `ending-chip ${e.correct ? 'ok' : 'bad'}`, `${e.correct ? '✓' : '✗'} ${e.id} · ${e.count}`));
  return wrap;
}

function renderState(): void {
  const st = lastState;
  if (!st) return;
  document.body.classList.remove('admin-dark');
  const wrap = el('div', 'admin-main');
  const current = st.tasks.find((t) => t.taskId === st.currentTaskId);
  const s = summarize(current ? current.rows : []);
  wrap.append(topbar(st));
  const main = el('main', 'admin-content');
  main.append(hero(st, current, s));
  if (current?.intro && showIntro) {
    const card = el('section', 'card admin-intro');
    const p = el('p', '');
    appendInlineCode(p, current.intro);
    card.append(p);
    main.append(card);
  }

  if (current) {
    const tiles = el('div', 'stat-tiles');
    tiles.append(tile('Ferdig', s.done, 'ok'), tile('Jobber', s.working, 'work'), tile('Venter', s.waiting, 'wait'), tile('Riktig slutt', s.correct, 'ok'));
    main.append(tiles, progressBar(s));
    if (s.endings.length) main.append(endingChips(s));
    const sec = el('section', 'task-table', undefined, { 'data-task': current.taskId });
    sec.append(table(current.rows));
    main.append(sec);
  }

  for (const t of [...st.tasks].reverse()) {
    if (t === current) continue;
    const ts = summarize(t.rows);
    const det = el('details', 'card task-table earlier', undefined, { 'data-task': t.taskId });
    det.open = openTasks.has(t.taskId);
    det.addEventListener('toggle', () => {
      if (det.open) openTasks.add(t.taskId);
      else openTasks.delete(t.taskId);
    });
    const sum = el('summary', '');
    sum.append(el('span', 'earlier-title', t.title), el('span', 'earlier-count', `${ts.done} / ${ts.total} ferdig`));
    det.append(sum, table(t.rows));
    main.append(det);
  }
  wrap.append(main);
  root.replaceChildren(wrap);
}

password = read('tq.adminPw') ?? '';
if (!password) renderLogin();
