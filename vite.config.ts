import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { syntheticReport } from './src/synthetic-report.ts';
import { catalogSchema } from './src/report-model.ts';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-report-catalog',
      configureServer(server) {
        server.middlewares.use('/catalog.json', async (_req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          try {
            const content = await readFile(new URL('./.local/catalog.json', import.meta.url), 'utf8');
            const raw: unknown = JSON.parse(content);
            res.end(JSON.stringify(catalogSchema.parse(raw)));
          } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
              res.end(JSON.stringify({ version: 1, reports: [syntheticReport()] }));
            else {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'CATALOG_INVALID: rerun the import command.' }));
            }
          }
        });
      },
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'catalog.json',
          source: JSON.stringify({ version: 1, reports: [syntheticReport()] }),
        });
      },
    },
  ],
  server: { host: '127.0.0.1', port: 5188, strictPort: true, fs: { strict: true } },
  preview: { host: '127.0.0.1', port: 5188, strictPort: true },
});
