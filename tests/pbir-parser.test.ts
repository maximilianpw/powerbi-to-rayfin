import { describe, expect, test } from 'bun:test';
import { parsePbirReport } from '../src/pbir-parser';
import { syntheticReportFiles } from '../src/synthetic-report';
import { at, object, stableJson } from '../src/json-boundary';
import { reportIssues, reportSummary } from '../src/report-model';
import { visualBounds } from '../src/offline-layout';

const cardPath = 'definition/pages/overview/visuals/revenue/visual.json';
function changed(path: string, patch: Record<string, unknown>) {
  const files = syntheticReportFiles();
  files.set(path, { ...object(files.get(path)), ...patch });
  return files;
}
function codes(files: Map<string, unknown>) {
  return reportIssues(parsePbirReport('Example', files)).map((i) => i.code);
}
describe('PBIR conversion contract', () => {
  test('stable across filesystem enumeration and object key order', () => {
    const files = syntheticReportFiles();
    const first = parsePbirReport('Example', files);
    const reversed = new Map(
      [...files].reverse().map(([p, v]) => [p, Object.fromEntries(Object.entries(object(v)).reverse())]),
    );
    expect(stableJson(parsePbirReport('Example', reversed))).toBe(stableJson(first));
  });
  test('preserves page order, source geometry and measure references', () => {
    const r = parsePbirReport('Example', syntheticReportFiles());
    expect(r.pages.map((p) => p.id)).toEqual(['overview', 'details']);
    const card = r.pages[0]?.visuals.find((v) => v.id === 'revenue');
    expect(card?.position).toMatchObject({ x: 24, y: 28, width: 320, height: 140 });
    expect(card?.bindings[0]).toMatchObject({ kind: 'measure', table: 'Example', property: 'Revenue' });
    expect(card?.query.status).toBe('candidate');
  });
  test('never claims a complete conversion or live data', () => {
    const r = parsePbirReport('Example', syntheticReportFiles());
    expect(reportSummary(r).completeConversion).toBe(false);
    expect(r.verification).toBe('offline-only');
    expect(codes(syntheticReportFiles())).toContain('LIVE_DATA_UNAVAILABLE');
  });
  test('custom visuals are explicit unsupported placeholders', () =>
    expect(codes(syntheticReportFiles())).toContain('VISUAL_TYPE_UNSUPPORTED'));
  test('rejects malformed geometry and missing identity', () => {
    expect(() => parsePbirReport('x', changed(cardPath, { position: { x: 'zero' } }))).toThrow();
    expect(() => parsePbirReport('x', changed(cardPath, { name: 'other' }))).toThrow('PBIR_VISUAL_ID_MISMATCH');
  });
  test('does not silently process unknown schema versions', () =>
    expect(codes(changed(cardPath, { $schema: 'https://example.invalid/schema.json' }))).toContain(
      'PBIR_SCHEMA_UNRECOGNIZED',
    ));
  test('reports unknown top-level visual properties', () =>
    expect(codes(changed(cardPath, { futureBehavior: { enabled: true } }))).toContain('PBIR_PROPERTY_UNHANDLED'));
  test('page filters block otherwise supported queries', () => {
    const files = changed('definition/pages/overview/page.json', {
      filterConfig: { filters: [{ type: 'Categorical' }] },
    });
    const r = parsePbirReport('x', files);
    expect(r.pages[0]?.visuals.find((v) => v.id === 'revenue')?.query.status).toBe('blocked');
  });
  test('report filters block every data query', () => {
    const files = changed('definition/report.json', { filterConfig: { filters: [{}] } });
    expect(
      parsePbirReport('x', files)
        .pages.flatMap((p) => p.visuals)
        .filter((v) => v.bindings.length)
        .every((v) => v.query.status === 'blocked'),
    ).toBe(true);
  });
  test('bookmarks, extensions and drillthrough are accounted for', () => {
    const files = changed('definition/pages/overview/page.json', { pageBinding: { type: 'Drillthrough' } });
    files.set('definition/bookmarks/test.bookmark.json', {});
    files.set('definition/reportExtensions.json', {});
    expect(codes(files)).toEqual(
      expect.arrayContaining(['BOOKMARKS_UNSUPPORTED', 'REPORT_EXTENSIONS_UNSUPPORTED', 'DRILLTHROUGH_UNSUPPORTED']),
    );
  });
  test('hierarchy expressions are not guessed', () => {
    const files = syntheticReportFiles();
    const v = object(files.get(cardPath));
    files.set(cardPath, {
      ...v,
      visual: {
        visualType: 'card',
        query: { queryState: { Values: { projections: [{ field: { HierarchyLevel: {} }, queryRef: 'x' }] } } },
      },
    });
    expect(codes(files)).toContain('FIELD_EXPRESSION_UNSUPPORTED');
  });
  test('connection strings are not copied into the generated artifact', () => {
    const files = changed('definition.pbir', {
      datasetReference: { byConnection: { connectionString: 'PRIVATE_CANARY_SECRET' } },
    });
    const result = parsePbirReport('x', files);
    expect(result.model).toBe('remote-reference');
    expect(stableJson(result)).not.toContain('PRIVATE_CANARY_SECRET');
  });
  test('preserves malicious-looking text as inert text, never HTML', () => {
    const files = changed(cardPath, {
      visual: {
        visualType: 'textbox',
        objects: {
          general: [{ properties: { paragraphs: [{ textRuns: [{ value: '<script>alert(1)</script>' }] }] } }],
        },
      },
    });
    const v = parsePbirReport('x', files).pages[0]?.visuals.find((v) => v.id === 'revenue');
    expect(v?.text).toBe('<script>alert(1)</script>');
  });
  test('missing and cyclic groups are flagged', () => {
    expect(codes(changed(cardPath, { parentGroupName: 'missing' }))).toContain('GROUP_PARENT_MISSING');
    const files = changed(cardPath, { parentGroupName: 'g' });
    files.set('definition/pages/overview/visuals/g/visual.json', {
      ...object(files.get(cardPath)),
      name: 'g',
      visual: undefined,
      visualGroup: {},
      parentGroupName: 'g',
    });
    expect(codes(files)).toContain('GROUP_CYCLE');
  });
  test('group bounds accumulate and inherit hidden state', () => {
    const files = changed(cardPath, { parentGroupName: 'g' });
    files.set('definition/pages/overview/visuals/g/visual.json', {
      ...object(files.get(cardPath)),
      name: 'g',
      visual: undefined,
      visualGroup: {},
      parentGroupName: undefined,
      isHidden: true,
      position: { x: 10, y: 20, z: 0, width: 400, height: 400 },
    });
    const page = parsePbirReport('x', files).pages[0];
    const v = page?.visuals.find((v) => v.id === 'revenue');
    if (!page || !v) throw new Error('fixture missing');
    expect(visualBounds(page, v)).toMatchObject({ x: 34, y: 48, hidden: true });
  });
  test('changes in source alter fingerprint', () => {
    const files = changed(cardPath, { isHidden: true });
    expect(parsePbirReport('x', files).fingerprint).not.toBe(parsePbirReport('x', syntheticReportFiles()).fingerprint);
  });
  test('saved slicer state inside objects blocks DAX', () => {
    const files = syntheticReportFiles();
    const raw = object(files.get(cardPath));
    files.set(cardPath, {
      ...raw,
      visual: { ...object(raw.visual), objects: { general: [{ properties: { filter: {} } }] } },
    });
    expect(parsePbirReport('x', files).pages[0]?.visuals.find((v) => v.id === 'revenue')?.query.status).toBe('blocked');
  });
  test.each([['overview', 'overview'], ['missing', 'details'], ['overview']])(
    'rejects invalid page ordering %j',
    (...order) => {
      expect(() => parsePbirReport('x', changed('definition/pages/pages.json', { pageOrder: order }))).toThrow(
        'PBIR_PAGE_ORDER_INVALID',
      );
    },
  );
  test('unknown container context blocks a query candidate', () => {
    const files = changed(cardPath, { sortDefinition: { sort: [] } });
    expect(parsePbirReport('x', files).pages[0]?.visuals.find((v) => v.id === 'revenue')?.query.status).toBe('blocked');
  });
  test('unhandled JSON definitions produce a blocker', () => {
    const files = syntheticReportFiles();
    files.set('definition/future.json', {});
    expect(codes(files)).toContain('DEFINITION_FILE_UNHANDLED');
  });
  test('source query expressions remain available for manual inspection', () => {
    const report = parsePbirReport('x', syntheticReportFiles());
    expect(at(report.pages[0]?.visuals[0]?.bindings[0]?.expression, 'Measure', 'Property')).toBeTruthy();
  });
});
