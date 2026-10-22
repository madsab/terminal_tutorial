/**
 * Simulates a class: 60 students join, get a task, send progress and finish, while one admin watches.
 * Measures (1) admin "start next" -> every student has the task, and (2) a student's "ended" -> it shows on the admin client.
 * Passes when p95 < 200 ms for both. Usage:
 *   npx tsx scripts/loadtest.ts                       # starts its own server
 *   npx tsx scripts/loadtest.ts --url http://host:8080/base --password SECRET [--clients 60]
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';
import { startServer } from '../src/server/index.js';
import { taskOrder } from '../src/tasks/registry.js';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const N = Number(arg('clients') ?? 60);
const LIMIT_MS = 200;

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

function open(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

async function main() {
  let stop: (() => Promise<void>) | undefined;
  let base = arg('url');
  const password = arg('password') ?? 'loadtest';
  if (!base) {
    const server = await startServer({ port: 0, basePath: '/', dataDir: mkdtempSync(join(tmpdir(), 'tq-load-')), staticDir: tmpdir(), adminPassword: password });
    base = server.url;
    stop = server.close;
  }
  const wsUrl = `${base.replace(/\/$/, '').replace(/^http/, 'ws')}/ws`;
  const taskId = taskOrder[0].id;

  // Admin.
  const admin = await open(wsUrl);
  const endedSentAt = new Map<string, number>();
  const endedSeen = new Map<string, number>();
  admin.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type !== 'state') return;
    const now = performance.now();
    for (const row of msg.tasks.at(-1)?.rows ?? []) {
      if (row.status === 'ferdig' && endedSentAt.has(row.clientId) && !endedSeen.has(row.clientId)) endedSeen.set(row.clientId, now);
    }
  });
  admin.send(JSON.stringify({ type: 'auth', password }));

  // Students.
  const gotTask = new Map<string, number>();
  const students = await Promise.all(
    Array.from({ length: N }, async (_, i) => {
      const id = `load-client-${String(i).padStart(3, '0')}`;
      const ws = await open(wsUrl);
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'task' && msg.taskId === taskId && !gotTask.has(id)) gotTask.set(id, performance.now());
      });
      ws.send(JSON.stringify({ type: 'hello', clientId: id, name: `Elev ${i}`, os: ['mac', 'linux', 'windows'][i % 3] }));
      return { id, ws };
    }),
  );
  await new Promise((r) => setTimeout(r, 300));

  // 1. Admin starts the task.
  const t0 = performance.now();
  admin.send(JSON.stringify({ type: 'startNext' }));
  await waitUntil(() => gotTask.size === N, 'every student to get the task');
  const startLatencies = [...gotTask.values()].map((t) => t - t0);

  // Progress from everyone, then everyone finishes at once.
  for (const s of students) s.ws.send(JSON.stringify({ type: 'progress', taskId, stepsDone: [true, false], stats: { hiroshimaer: 1 } }));
  await new Promise((r) => setTimeout(r, 300));
  for (const s of students) {
    endedSentAt.set(s.id, performance.now());
    s.ws.send(JSON.stringify({ type: 'ended', taskId, endingId: 'toalett', correct: true, stats: { hiroshimaer: 1 } }));
  }
  await waitUntil(() => endedSeen.size === N, 'every ending to reach the admin');
  const endLatencies = [...endedSeen].map(([id, t]) => t - endedSentAt.get(id)!);

  const report = (label: string, v: number[]) => {
    const p95 = percentile(v, 95);
    console.log(`${label.padEnd(34)} p50 ${percentile(v, 50).toFixed(1)} ms   p95 ${p95.toFixed(1)} ms   max ${Math.max(...v).toFixed(1)} ms`);
    return p95;
  };
  console.log(`${N} clients`);
  const a = report('start next -> all have the task', startLatencies);
  const b = report('ended -> visible on admin', endLatencies);

  for (const s of students) s.ws.close();
  admin.close();
  await stop?.();
  const pass = a < LIMIT_MS && b < LIMIT_MS;
  console.log(pass ? `PASS (p95 < ${LIMIT_MS} ms)` : `FAIL (p95 >= ${LIMIT_MS} ms)`);
  process.exit(pass ? 0 : 1);
}

async function waitUntil(cond: () => boolean, what: string, ms = 10_000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
