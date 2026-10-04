import { mkdir, readFile, writeFile, copyFile, lstat, open, mkdtemp, rename, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { ConvertedReport } from './report-model';
import { reportSummary, reportSchema } from './report-model';
import { stableJson } from './json-boundary';
import { privateOutputPath, projectRoot } from './local-output';

/** Export a standalone offline frontend. Cloud integration is deliberately not fabricated. */
export async function exportOfflineProject(report: ConvertedReport, destination: string): Promise<string> {
  const out = await privateOutputPath(destination);
  const validated = reportSchema.parse(report);
  await mkdir(dirname(out), { recursive: true });
  const lockPath = await privateOutputPath(out + '.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  let staging: string | undefined;
  async function assertAbsent() {
    try {
      await lstat(out);
      throw new Error('EXPORT_ALREADY_EXISTS');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  try {
    await assertAbsent();
    staging = await mkdtemp(join(dirname(out), '.export-'));
    await writeOfflineProject(validated, staging);
    await privateOutputPath(out);
    await assertAbsent();
    await rename(staging, out);
    staging = undefined;
    return out;
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true });
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

async function writeOfflineProject(report: ConvertedReport, out: string): Promise<void> {
  const paths = [
    'src/report-model.ts',
    'src/offline-layout.ts',
    'src/ui/main.tsx',
    'src/ui/report-workbench.tsx',
    'src/ui/workbench.css',
    'src/ui/css.d.ts',
    'index.html',
  ];
  for (const path of paths) {
    await mkdir(join(out, path, '..'), { recursive: true });
    await copyFile(join(projectRoot, path), join(out, path));
  }
  const packageText = await readFile(join(projectRoot, 'package.json'), 'utf8');
  const { z } = await import('zod');
  const dependencySchema = z.object({
    dependencies: z.record(z.string(), z.string()),
    devDependencies: z.record(z.string(), z.string()),
  });
  const raw: unknown = JSON.parse(packageText);
  const dependencies = dependencySchema.parse(raw);
  await mkdir(join(out, 'public'), { recursive: true });
  const generated: Record<string, string> = {
    'package.json': stableJson({
      name: 'converted-report-offline',
      version: '0.1.0',
      private: true,
      type: 'module',
      packageManager: 'bun@1.3.14',
      scripts: {
        dev: 'vite --host 127.0.0.1',
        build: 'tsc --noEmit && vite build',
        preview: 'vite preview --host 127.0.0.1',
      },
      ...dependencies,
    }),
    'tsconfig.json': stableJson({
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2024', 'DOM'],
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ['src', 'vite.config.ts'],
    }),
    'vite.config.ts':
      "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({base:'./',plugins:[react()],server:{host:'127.0.0.1'}});\n",
    'public/catalog.json': stableJson({ version: 1, reports: [report] }),
    'conversion-summary.json': stableJson(reportSummary(report)),
    '.gitignore': '*\n',
    'README.md':
      '# Offline report scaffold\n\nGenerated deterministically by powerbi-to-rayfin/0.1.0. This contains private report metadata. All files are ignored by default: do not publish without review.\n\nRun bun install, then bun run dev. Run bun run build for a static build.\n\nThis is NOT a deployed or authenticated Rayfin project. Data visuals are placeholders; no customer dataset was extracted. The offline inspector is included so limitations remain visible. All runtime source is included as a versioned snapshot; regeneration refuses overwrites.\n\n## Fabric Apps integration gate\n\nWhen authorized access is available, create an official Rayfin dataapp project separately, configure the documented semantic model connector and Fabric sign-in flow, and integrate the validated rendering runtime. Do not invent credentials or reuse raw connection strings. Resolve blockers and verify query results, user identity, RLS/OLS and capacity/API limits before deployment. No automatic deployment is supplied.\n\nReferences:\n- https://learn.microsoft.com/en-us/fabric/apps/data-apps-template\n- https://learn.microsoft.com/en-us/fabric/apps/overview\n',
  };
  for (const [path, content] of Object.entries(generated))
    await writeFile(join(out, path), content, { flag: 'wx', mode: 0o600 });
}
