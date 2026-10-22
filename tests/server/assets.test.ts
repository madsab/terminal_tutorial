import { afterAll, beforeAll, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../src/server/index.js';

let server: Awaited<ReturnType<typeof startServer>>;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'tq-assets-'));
  mkdirSync(join(root, 'heads'));
  mkdirSync(join(root, 'limezu'));
  mkdirSync(join(root, 'secret'));
  writeFileSync(join(root, 'heads', 'a.png'), 'PNG');
  writeFileSync(join(root, 'limezu', 'tiles.png'), 'PNG');
  writeFileSync(join(root, 'secret', 'x.txt'), 'nope');
  writeFileSync(join(root, 'outside.txt'), 'nope');
  const staticDir = mkdtempSync(join(tmpdir(), 'tq-static-'));
  server = await startServer({ port: 0, basePath: '/tq', dataDir: root, staticDir, assetsDir: root });
});
afterAll(() => server.close());

test('serves head photos and LimeZu art from the assets folder', async () => {
  const head = await fetch(`${server.url}/tq/local-assets/heads/a.png`);
  expect(head.status).toBe(200);
  expect(head.headers.get('content-type')).toBe('image/png');
  expect((await fetch(`${server.url}/tq/local-assets/limezu/tiles.png`)).status).toBe(200);
});

test('missing files are 404 so the client can fall back to placeholder art', async () => {
  expect((await fetch(`${server.url}/tq/local-assets/heads/none.png`)).status).toBe(404);
});

test('only heads/ and limezu/ are served, and never anything outside', async () => {
  expect((await fetch(`${server.url}/tq/local-assets/secret/x.txt`)).status).toBe(404);
  expect((await fetch(`${server.url}/tq/local-assets/heads/..%2Foutside.txt`)).status).toBe(404);
  expect((await fetch(`${server.url}/tq/local-assets/..%2Foutside.txt`)).status).toBe(404);
});
