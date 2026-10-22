import { createHash, timingSafeEqual } from 'node:crypto';
import type { WebSocket } from 'ws';
import { OS_LIST, type AdminServerMsg, type Os, type ServerMsg, type Stats } from '../shared/protocol.js';
import type { Session } from './session.js';

const NAME_MAX = 40;
const ADMIN_BATCH_MS = 40;
const PING_MS = 25_000;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{4,64}$/.test(v);
const isShort = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

function cleanStats(v: unknown): Stats | undefined {
  if (!isObject(v)) return undefined;
  const entries = Object.entries(v);
  if (entries.length > 20) return undefined;
  const out: Stats = {};
  for (const [k, n] of entries) {
    if (k.length > 40 || typeof n !== 'number' || !Number.isFinite(n)) return undefined;
    out[k] = n;
  }
  return out;
}

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Routes WebSocket traffic between students, admins and the session. */
export class Hub {
  private byClient = new Map<string, Set<WebSocket>>();
  private clientOf = new WeakMap<WebSocket, string>();
  private admins = new Set<WebSocket>();
  private adminTimer?: NodeJS.Timeout;
  private pinger: NodeJS.Timeout;

  constructor(
    private readonly session: Session,
    private readonly adminPassword: string | undefined,
    private readonly sockets: () => Iterable<WebSocket>,
  ) {
    this.pinger = setInterval(() => {
      for (const ws of this.sockets()) if (ws.readyState === ws.OPEN) ws.ping();
    }, PING_MS);
    this.pinger.unref();
  }

  close(): void {
    clearInterval(this.pinger);
    clearTimeout(this.adminTimer);
  }

  attach(ws: WebSocket): void {
    ws.on('message', (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!isObject(msg) || typeof msg.type !== 'string') return;
      try {
        this.handle(ws, msg);
      } catch (err) {
        console.error('Feil i meldingshåndtering:', err);
      }
    });
    ws.on('close', () => this.drop(ws));
    ws.on('error', () => this.drop(ws));
  }

  private send(ws: WebSocket, msg: ServerMsg | AdminServerMsg): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  private drop(ws: WebSocket): void {
    this.admins.delete(ws);
    const id = this.clientOf.get(ws);
    if (id) this.byClient.get(id)?.delete(ws);
  }

  private handle(ws: WebSocket, msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'ping':
        return this.send(ws, { type: 'pong' });
      case 'hello': {
        if (!isId(msg.clientId) || typeof msg.name !== 'string' || !OS_LIST.includes(msg.os as Os)) return;
        const name = msg.name.trim().slice(0, NAME_MAX);
        if (!name) return;
        const previous = this.clientOf.get(ws);
        if (previous && previous !== msg.clientId) this.byClient.get(previous)?.delete(ws);
        this.clientOf.set(ws, msg.clientId);
        const set = this.byClient.get(msg.clientId) ?? new Set();
        set.add(ws);
        this.byClient.set(msg.clientId, set);
        this.session.join(msg.clientId, name, msg.os as Os);
        this.sendTask(ws, msg.clientId);
        return this.scheduleAdmin();
      }
      case 'progress': {
        const id = this.clientOf.get(ws);
        const stats = cleanStats(msg.stats);
        if (!id || !isShort(msg.taskId) || !stats || !Array.isArray(msg.stepsDone) || msg.stepsDone.length > 50) return;
        this.session.progress(id, msg.taskId, msg.stepsDone.map(Boolean), stats);
        return this.scheduleAdmin();
      }
      case 'ended': {
        const id = this.clientOf.get(ws);
        const stats = cleanStats(msg.stats);
        if (!id || !isShort(msg.taskId) || !isShort(msg.endingId) || typeof msg.correct !== 'boolean' || !stats) return;
        this.session.end(id, msg.taskId, msg.endingId, msg.correct, stats);
        return this.scheduleAdmin();
      }
      case 'auth': {
        const ok =
          this.adminPassword !== undefined &&
          this.adminPassword !== '' &&
          typeof msg.password === 'string' &&
          timingSafeEqual(digest(msg.password), digest(this.adminPassword));
        if (!ok) return this.send(ws, { type: 'authFailed' });
        this.admins.add(ws);
        this.send(ws, { type: 'authOk' });
        return this.send(ws, this.session.adminState());
      }
      case 'startNext': {
        if (!this.admins.has(ws)) return;
        // A double-click sends the same `after` twice: only the first one still matches.
        if ('after' in msg && msg.after !== this.session.current) return this.scheduleAdmin();
        if (this.session.startNext()) this.broadcastTask();
        return this.scheduleAdmin();
      }
      case 'newSession': {
        if (!this.admins.has(ws)) return;
        this.session.reset();
        for (const [id, set] of this.byClient) {
          for (const s of set) this.send(s, { type: 'reset' });
          this.byClient.delete(id);
        }
        return this.scheduleAdmin();
      }
    }
  }

  private sendTask(ws: WebSocket, clientId: string): void {
    const taskId = this.session.current;
    const myResult = taskId ? this.session.resultFor(clientId, taskId) : undefined;
    this.send(ws, myResult ? { type: 'task', taskId, myResult } : { type: 'task', taskId });
  }

  private broadcastTask(): void {
    for (const [id, set] of this.byClient) for (const ws of set) this.sendTask(ws, id);
  }

  /** Batches bursts of updates (30 students finishing together) into one admin push. */
  private scheduleAdmin(): void {
    if (this.adminTimer || this.admins.size === 0) return;
    this.adminTimer = setTimeout(() => {
      this.adminTimer = undefined;
      const state = this.session.adminState();
      for (const ws of this.admins) this.send(ws, state);
    }, ADMIN_BATCH_MS);
    this.adminTimer.unref();
  }
}
