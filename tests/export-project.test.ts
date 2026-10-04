import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { exportOfflineProject } from '../src/export-project';
import { privateOutputPath, projectRoot } from '../src/local-output';
import { syntheticReport } from '../src/synthetic-report';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function workspace() {
  await mkdir(join(projectRoot, '.local'), { recursive: true });
  const dir = await mkdtemp(join(projectRoot, '.local/export-test-'));
  dirs.push(dir);
  return dir;
}
async function files(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function visit(dir: string) {
    for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path);
      else result[path] = await readFile(join(root, path), 'utf8');
    }
  }
  await visit('');
  return result;
}
test('exports a standalone frontend deterministically without cloud configuration', async () => {
  const root = await workspace();
  await exportOfflineProject(syntheticReport(), join(root, 'one'));
  await exportOfflineProject(syntheticReport(), join(root, 'two'));
  const generated = await files(join(root, 'one'));
  expect(generated).toEqual(await files(join(root, 'two')));
  expect(generated['README.md']).toContain('NOT a deployed or authenticated Rayfin project');
  expect(generated['.gitignore']).toBe('*\n');
  expect(generated['public/catalog.json']).toContain('offline-only');
  expect(generated['package.json']).not.toContain('rayfin up');
});
test('refuses overwrites', async () => {
  const root = await workspace();
  const out = join(root, 'export');
  await exportOfflineProject(syntheticReport(), out);
  await expect(exportOfflineProject(syntheticReport(), out)).rejects.toThrow();
});
test('export write boundary refuses symlinked parents', async () => {
  const root = await workspace();
  await symlink(projectRoot, join(root, 'link'));
  await expect(exportOfflineProject(syntheticReport(), join(root, 'link/export'))).rejects.toThrow(
    'OUTPUT_SYMLINK_REJECTED',
  );
});
test('invalid input does not leave a partial project', async () => {
  const root = await workspace();
  const report = syntheticReport();
  report.pages[0] && (report.pages[0].width = -1);
  await expect(exportOfflineProject(report, join(root, 'broken'))).rejects.toThrow();
  expect(await readdir(root)).toEqual([]);
});
test('refuses outputs outside ignored local directory', async () => {
  await expect(privateOutputPath(join(projectRoot, 'public/report.json'))).rejects.toThrow(
    'OUTPUT_MUST_BE_INSIDE_LOCAL',
  );
  await expect(privateOutputPath(join(projectRoot, '.local/../README.md'))).rejects.toThrow(
    'OUTPUT_MUST_BE_INSIDE_LOCAL',
  );
});
test('refuses symlinked output paths', async () => {
  const root = await workspace();
  await symlink(projectRoot, join(root, 'link'));
  await expect(privateOutputPath(join(root, 'link/private.json'))).rejects.toThrow('OUTPUT_SYMLINK_REJECTED');
});
