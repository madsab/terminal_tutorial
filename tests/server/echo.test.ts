import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { startServer } from '../../src/server/index.js';

let server: Awaited<ReturnType<typeof startServer>>;

beforeAll(async () => {
  const staticDir = mkdtempSync(join(tmpdir(), 'tq-static-'));
  writeFileSync(join(staticDir, 'index.html'), '<html>hello</html>');
  mkdirSync(join(staticDir, 'assets'));
  server = await startServer({
    port: 0,
    basePath: '/tq',
    dataDir: mkdtempSync(join(tmpdir(), 'tq-data-')),
    staticDir,
  });
});
afterAll(() => server.close());

test('serves the page under the base path', async () => {
  const res = await fetch(`${server.url}/tq/`);
  expect(res.status).toBe(200);
  expect(await res.text()).toContain('hello');
});

test('404 outside the base path', async () => {
  expect((await fetch(`${server.url}/other/`)).status).toBe(404);
});

test('answers ping with pong over WebSocket', async () => {
  const ws = new WebSocket(`${server.url.replace('http', 'ws')}/tq/ws`);
  const reply = await new Promise<string>((resolve, reject) => {
    ws.on('open', () => ws.send(JSON.stringify({ type: 'ping' })));
    ws.on('message', (d) => resolve(d.toString()));
    ws.on('error', reject);
  });
  ws.close();
  expect(JSON.parse(reply)).toEqual({ type: 'pong' });
});

test('a malformed URL gets 400 and does not take the server down', async () => {
  const res = await fetch(`${server.url}/tq/%E0%A4%A`);
  expect(res.status).toBe(400);
  expect((await fetch(`${server.url}/tq/`)).status).toBe(200);
});

test('the base path without a trailing slash redirects, so relative asset links resolve', async () => {
  const res = await fetch(`${server.url}/tq`, { redirect: 'manual' });
  expect(res.status).toBe(301);
  expect(res.headers.get('location')).toBe('/tq/');
});

test('/admin/ redirects to /admin for the same reason', async () => {
  const res = await fetch(`${server.url}/tq/admin/`, { redirect: 'manual' });
  expect(res.status).toBe(301);
  expect(res.headers.get('location')).toBe('/tq/admin');
});
