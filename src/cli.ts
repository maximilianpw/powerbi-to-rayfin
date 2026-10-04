import { resolve } from 'node:path';
import { discoverReports, loadPbirReport, PbirInputError } from './pbir-files';
import { stableJson } from './json-boundary';
import { reportSummary } from './report-model';
import { writePrivateCatalog } from './local-output';
import { exportOfflineProject } from './export-project';

const help =
  'Usage:\n  bun run cli scan <report-folder-or-repository>\n  bun run cli import <report-folder> [more-report-folders...]\n  bun run cli export <report-folder> <new-path-inside-.local>\n\nRead-only inputs. Import updates the ignored local catalog; export refuses existing directories. No cloud operations.';
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === '--help' || command === undefined) {
    console.log(help);
    return;
  }
  if (command === 'scan' && args.length === 1 && args[0]) {
    const reports = await discoverReports(args[0]);
    if (!reports.length) throw new Error('NO_REPORTS_FOUND');
    const results = [];
    for (const path of reports) {
      try {
        results.push({ status: 'scanned', ...reportSummary(await loadPbirReport(path)) });
      } catch (error) {
        results.push({
          status: 'invalid',
          folder: path,
          error: error instanceof PbirInputError ? error.code : 'PBIR_PARSE_FAILED',
        });
        process.exitCode = 1;
      }
    }
    console.log(stableJson({ version: 1, reports: results }));
    return;
  }
  if (command === 'import' && args.length > 0) {
    const reports = [];
    for (const path of args) reports.push(await loadPbirReport(path));
    await writePrivateCatalog(stableJson({ version: 1, reports }));
    console.log('Imported ' + reports.length + ' report(s) into ignored .local/catalog.json. Run bun run dev.');
    return;
  }
  if (command === 'export' && args.length === 2 && args[0] && args[1]) {
    const report = await loadPbirReport(args[0]);
    const output = await exportOfflineProject(report, resolve(args[1]));
    console.log('Exported offline-only frontend to ' + output + '. Rayfin integration and live data remain blocked.');
    return;
  }
  throw new Error(help);
}
try {
  await main();
} catch (error) {
  if (error instanceof PbirInputError) console.error(error.message);
  else if (error instanceof Error && error.name === 'ZodError')
    console.error(
      'PBIR_SCHEMA_INVALID: required fields or bounded positions do not match the supported structural schema.',
    );
  else console.error(error instanceof Error ? error.message : 'CONVERSION_FAILED');
  process.exitCode = 1;
}
