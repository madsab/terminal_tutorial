import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import WebSocket from 'ws';
import { startServer } from '../../src/server/index.js';

const TASKS = [
  { id: 't1', title: 'Ett' },
  { id: 't2', title: 'To' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Msg = any;

class Client {
  msgs: Msg[] = [];
  private ws: WebSocket;
  private opened: Promise<void>;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (d) => this.msgs.push(JSON.parse(d.toString())));
    this.opened = new Promise((ok) => this.ws.on('open', () => ok()));
  }
  async send(msg: unknown) {
    await this.opened;
    this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  /** Resolves with the first message (old or new) matching the predicate. */
  async waitFor(pred: (m: Msg) => boolean, ms = 2000): Promise<Msg> {
    const end = Date.now() + ms;
    for (;;) {
      const hit = this.msgs.find(pred);
      if (hit) return hit;
      if (Date.now() > end) throw new Error(`timeout; got ${JSON.stringify(this.msgs)}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  /** The newest admin state, once `pred` holds for it. */
  async state(pred: (s: Msg) => boolean = () => true): Promise<Msg> {
    const end = Date.now() + 2000;
    for (;;) {
      const s = [...this.msgs].reverse().find((m) => m.type === 'state');
      if (s && pred(s)) return s;
      if (Date.now() > end) throw new Error(`no matching state; last ${JSON.stringify(s)}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  close() {
    this.ws.close();
  }
}

let servers: Awaited<ReturnType<typeof startServer>>[] = [];
let clients: Client[] = [];
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients = [];
  await Promise.all(servers.map((s) => s.close()));
  servers = [];
});

async function setup(opts: { adminPassword?: string; dataDir?: string } = {}) {
  const dataDir = opts.dataDir ?? mkdtempSync(join(tmpdir(), 'tq-class-'));
  const server = await startServer({
    port: 0,
    basePath: '/',
    dataDir,
    staticDir: dataDir,
    tasks: TASKS,
    adminPassword: 'adminPassword' in opts ? opts.adminPassword : 'pw',
  });
  servers.push(server);
  const wsUrl = `${server.url.replace('http', 'ws')}/ws`;
  const connect = () => {
    const c = new Client(wsUrl);
    clients.push(c);
    return c;
  };
  const student = async (clientId: string, name = clientId, os = 'mac') => {
    const c = connect();
    await c.send({ type: 'hello', clientId, name, os });
    await c.waitFor((m) => m.type === 'task');
    return c;
  };
  const admin = async (password = 'pw') => {
    const c = connect();
    await c.send({ type: 'auth', password });
    return c;
  };
  return { server, dataDir, connect, student, admin };
}

describe('classroom over WebSocket', () => {
  test('a joining student is told there is no task yet', async () => {
    const { student } = await setup();
    const a = await student('aaaaaaaa');
    expect(a.msgs[0]).toEqual({ type: 'task', taskId: null });
  });

  test('admin auth: wrong password fails, right one succeeds and gets the state', async () => {
    const { admin } = await setup();
    const bad = await admin('nope');
    await bad.waitFor((m) => m.type === 'authFailed');
    const good = await admin();
    await good.waitFor((m) => m.type === 'authOk');
    const st = await good.state();
    expect(st).toMatchObject({ currentTaskId: null, nextTask: { taskId: 't1' }, tasks: [] });
  });

  test('without ADMIN_PASSWORD nobody can become admin', async () => {
    const { admin } = await setup({ adminPassword: undefined });
    const a = await admin('');
    await a.waitFor((m) => m.type === 'authFailed');
    const b = await admin('undefined');
    await b.waitFor((m) => m.type === 'authFailed');
  });

  test('a student cannot start tasks or reset the session', async () => {
    const { student, admin } = await setup();
    const s = await student('aaaaaaaa');
    await s.send({ type: 'startNext' });
    await s.send({ type: 'newSession' });
    await s.send({ type: 'auth', password: 'wrong' });
    const a = await admin();
    const st = await a.state((x) => x.students === 1);
    expect(st.currentTaskId).toBeNull();
    expect(s.msgs.filter((m) => m.type === 'reset' || (m.type === 'task' && m.taskId))).toEqual([]);
  });

  test('startNext pushes the task to every student at once, even mid-task', async () => {
    const { student, admin } = await setup();
    const a = await student('aaaaaaaa');
    const b = await student('bbbbbbbb', 'B', 'windows');
    const adm = await admin();
    await adm.send({ type: 'startNext' });
    for (const c of [a, b]) await c.waitFor((m) => m.type === 'task' && m.taskId === 't1');
    await adm.send({ type: 'startNext' });
    for (const c of [a, b]) await c.waitFor((m) => m.type === 'task' && m.taskId === 't2');
    await adm.send({ type: 'startNext' });
    const st = await adm.state((x) => x.tasks.length === 2);
    expect(st.currentTaskId).toBe('t2');
    expect(st.nextTask).toBeNull();
  });

  test('a double-clicked Start neste oppgave only starts one task', async () => {
    const { admin } = await setup();
    const adm = await admin();
    await adm.state();
    await adm.send({ type: 'startNext', after: null });
    await adm.send({ type: 'startNext', after: null });
    const st = await adm.state((x) => x.currentTaskId === 't1');
    await new Promise((r) => setTimeout(r, 150));
    expect((await adm.state()).currentTaskId).toBe('t1');
    expect(st.tasks).toHaveLength(1);
  });

  test('progress and endings reach the admin table, first ending wins', async () => {
    const { student, admin } = await setup();
    const a = await student('aaaaaaaa', 'Ola', 'mac');
    const adm = await admin();
    await adm.send({ type: 'startNext' });
    await a.waitFor((m) => m.taskId === 't1');
    await a.send({ type: 'progress', taskId: 't1', stepsDone: [true, false], stats: { hiroshimaer: 2 } });
    let st = await adm.state((x) => x.tasks[0]?.rows[0]?.status === 'jobber');
    expect(st.tasks[0].rows[0]).toMatchObject({ name: 'Ola', os: 'mac', steps: 1, stats: { hiroshimaer: 2 } });
    await a.send({ type: 'ended', taskId: 't1', endingId: 'toalett', correct: true, stats: { hiroshimaer: 2 } });
    await a.send({ type: 'ended', taskId: 't1', endingId: 'bar', correct: false, stats: { hiroshimaer: 9 } });
    st = await adm.state((x) => x.tasks[0]?.rows[0]?.status === 'ferdig');
    expect(st.tasks[0].rows[0]).toMatchObject({ endingId: 'toalett', correct: true });
  });

  test('two tabs with the same clientId share one row and both get task updates (Review Focus 4)', async () => {
    const { student, admin } = await setup();
    const tab1 = await student('aaaaaaaa', 'Ola');
    const tab2 = await student('aaaaaaaa', 'Ola');
    const other = await student('bbbbbbbb', 'Ola');
    const adm = await admin();
    const st = await adm.state((x) => x.students === 2);
    expect(st.students).toBe(2);
    await adm.send({ type: 'startNext' });
    for (const c of [tab1, tab2, other]) await c.waitFor((m) => m.taskId === 't1');
    const rows = (await adm.state((x) => x.tasks.length === 1)).tasks[0].rows;
    expect(rows.map((r: Msg) => r.clientId)).toEqual(['aaaaaaaa', 'bbbbbbbb']);
  });

  test('a reload after an ending gets the ending back', async () => {
    const { student, admin, connect } = await setup();
    const a = await student('aaaaaaaa');
    const adm = await admin();
    await adm.send({ type: 'startNext' });
    await a.waitFor((m) => m.taskId === 't1');
    await a.send({ type: 'ended', taskId: 't1', endingId: 'bar', correct: false, stats: { n: 1 } });
    await adm.state((x) => x.tasks[0]?.rows[0]?.status === 'ferdig');
    a.close();
    const again = connect();
    await again.send({ type: 'hello', clientId: 'aaaaaaaa', name: 'A', os: 'mac' });
    const t = await again.waitFor((m) => m.type === 'task');
    expect(t).toEqual({ type: 'task', taskId: 't1', myResult: { endingId: 'bar', correct: false, stats: { n: 1 } } });
  });

  test('a server restart restores the session from JSON (Review Focus 3)', async () => {
    const first = await setup();
    const a = await first.student('aaaaaaaa', 'Ola');
    const adm = await first.admin();
    await adm.send({ type: 'startNext' });
    await a.waitFor((m) => m.taskId === 't1');
    await a.send({ type: 'ended', taskId: 't1', endingId: 'toalett', correct: true, stats: { n: 3 } });
    await adm.state((x) => x.tasks[0]?.rows[0]?.status === 'ferdig');
    await first.server.close();
    const second = await setup({ dataDir: first.dataDir });
    const back = await second.student('aaaaaaaa', 'Ola');
    expect(back.msgs[0]).toEqual({ type: 'task', taskId: 't1', myResult: { endingId: 'toalett', correct: true, stats: { n: 3 } } });
    const adm2 = await second.admin();
    expect((await adm2.state()).tasks[0].rows[0]).toMatchObject({ name: 'Ola', status: 'ferdig' });
  });

  test('freeplay: only an admin after the last task, sent to everyone, also late joiners', async () => {
    const { student, admin, connect } = await setup();
    const a = await student('aaaaaaaa');
    const adm = await admin();
    await a.send({ type: 'freeplay' });
    await adm.send({ type: 'startNext' });
    await adm.send({ type: 'freeplay' });
    await adm.send({ type: 'startNext' });
    await adm.state((x) => x.currentTaskId === 't2');
    expect(a.msgs.some((m) => m.type === 'freeplay')).toBe(false);
    await adm.send({ type: 'freeplay' });
    await a.waitFor((m) => m.type === 'freeplay');
    expect((await adm.state((x) => x.freeplay)).freeplay).toBe(true);
    const late = connect();
    await late.send({ type: 'hello', clientId: 'bbbbbbbb', name: 'B', os: 'linux' });
    expect(await late.waitFor((m) => m.type === 'freeplay' || m.type === 'task')).toEqual({ type: 'freeplay' });
  });

  test('newSession tells students to reset and empties the table', async () => {
    const { student, admin } = await setup();
    const a = await student('aaaaaaaa');
    const adm = await admin();
    await adm.send({ type: 'startNext' });
    await adm.send({ type: 'newSession' });
    await a.waitFor((m) => m.type === 'reset');
    const st = await adm.state((x) => x.tasks.length === 0 && x.students === 0);
    expect(st.currentTaskId).toBeNull();
  });

  test('stale progress for another task is ignored', async () => {
    const { student, admin } = await setup();
    const a = await student('aaaaaaaa');
    const adm = await admin();
    await adm.send({ type: 'startNext' });
    await a.waitFor((m) => m.taskId === 't1');
    await a.send({ type: 'progress', taskId: 't2', stepsDone: [true], stats: {} });
    await a.send({ type: 'progress', taskId: 't1', stepsDone: [true], stats: {} });
    const st = await adm.state((x) => x.tasks[0]?.rows[0]?.status === 'jobber');
    expect(st.tasks[0].rows[0].steps).toBe(1);
  });

  test('garbage input never crashes the server and invalid hellos are ignored', async () => {
    const { connect, student } = await setup();
    const c = connect();
    for (const bad of ['not json', '{}', '[]', 'null', '{"type":"hello"}', '{"type":"hello","clientId":"x","name":"A","os":"amiga"}',
      JSON.stringify({ type: 'hello', clientId: 'a'.repeat(500), name: 'A', os: 'mac' }), '{"type":"progress"}', '{"type":"ended","taskId":1}']) {
      await c.send(bad);
    }
    await new Promise((r) => setTimeout(r, 100));
    expect(c.msgs.filter((m) => m.type === 'task')).toEqual([]);
    const ok = await student('goodclient', 'Ok');
    expect(ok.msgs[0].type).toBe('task');
  });

  test('names are trimmed and limited in length', async () => {
    const { student, admin } = await setup();
    await student('aaaaaaaa', `  ${'x'.repeat(200)}  `);
    const adm = await admin();
    await adm.send({ type: 'startNext' });
    const st = await adm.state((x) => x.tasks[0]?.rows.length === 1);
    expect(st.tasks[0].rows[0].name.length).toBeLessThanOrEqual(40);
  });
});
