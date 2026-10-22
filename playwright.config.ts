import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8123;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: 'npm run build && node dist/server/server/index.js',
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { PORT: String(PORT), ADMIN_PASSWORD: 'e2e-pw', BASE_PATH: '/', DATA_DIR: mkdtempSync(join(tmpdir(), 'tq-e2e-')) },
  },
});
