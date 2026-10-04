import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { discoverReports, loadPbirReport, readPbirFiles } from '../src/pbir-files';
import { syntheticReportFiles } from '../src/synthetic-report';
const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'pbir-test-'));
  dirs.push(root);
  for (const [p, v] of syntheticReportFiles()) {
    await mkdir(dirname(join(root, p)), { recursive: true });
    await writeFile(join(root, p), JSON.stringify(v));
  }
  return root;
}
test('finds and loads an actual PBIR folder without modifying input', async () => {
  const root = await fixture();
  const before = await readFile(join(root, 'definition.pbir'), 'utf8');
  expect(await discoverReports(root)).toEqual([root]);
  expect((await loadPbirReport(root)).pages).toHaveLength(2);
  expect(await readFile(join(root, 'definition.pbir'), 'utf8')).toBe(before);
});
test('unread assets and non-JSON definitions produce explicit findings', async () => {
  const root = await fixture();
  await mkdir(join(root, 'StaticResources'));
  await writeFile(join(root, 'definition/unknown.bin'), 'bytes');
  const report = await loadPbirReport(root);
  expect(report.issues.filter((i) => i.code === 'REPORT_RESOURCE_UNREAD').map((i) => i.source)).toEqual([
    'StaticResources',
    'definition/unknown.bin',
  ]);
});
test('rejects symlinked report metadata', async () => {
  const root = await fixture();
  await symlink(join(root, 'definition.pbir'), join(root, 'definition', 'outside.json'));
  await expect(readPbirFiles(root)).rejects.toThrow('INPUT_SYMLINK_REJECTED');
});
test('rejects a symlinked input root', async () => {
  const root = await fixture();
  await symlink(root, root + '-link');
  try {
    await expect(readPbirFiles(root + '-link')).rejects.toThrow('INPUT_SYMLINK_REJECTED');
  } finally {
    await rm(root + '-link');
  }
});
test('reports malformed JSON without printing its contents', async () => {
  const root = await fixture();
  await writeFile(join(root, 'definition/report.json'), 'SECRET INVALID JSON');
  await expect(readPbirFiles(root)).rejects.toThrow('INPUT_JSON_INVALID');
});
test('ignores hidden directories and does not read model or env files', async () => {
  const root = await fixture();
  await writeFile(join(root, '.env'), 'do not read');
  await mkdir(join(root, '.hidden'));
  await symlink('/does/not/exist', join(root, '.hidden/definition.pbir'));
  expect([...(await readPbirFiles(root))].some(([p]) => p.includes('.env'))).toBe(false);
});
