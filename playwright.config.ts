import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://127.0.0.1:5190', viewport: { width: 1440, height: 1000 } },
  webServer: {
    command: 'bun run build && bunx vite preview --host 127.0.0.1 --port 5190',
    port: 5190,
    reuseExistingServer: false,
  },
  reporter: 'list',
});
