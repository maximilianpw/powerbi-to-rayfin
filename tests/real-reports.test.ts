import { expect, test } from 'bun:test';
import { discoverReports, loadPbirReport } from '../src/pbir-files';
import { stableJson } from '../src/json-boundary';

// Explicit opt-in; never locate customer data or read .env files automatically.
const reportsRoot = process.env.REPORTS_ROOT;
test.skipIf(!reportsRoot)('real PBIR corpus parses twice deterministically without changing source', async () => {
  if (!reportsRoot) return;
  const paths = await discoverReports(reportsRoot);
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) {
    const first = await loadPbirReport(path);
    const second = await loadPbirReport(path);
    expect(stableJson(second)).toBe(stableJson(first));
    expect(first.pages.length).toBeGreaterThan(0);
  }
});
