import { parsePbirReport } from './pbir-parser.ts';
/** Hand-authored synthetic fixture. No customer names, filters, data or model expressions. */
export function syntheticReportFiles(): Map<string, unknown> {
  const schema = (kind: string, version: string) =>
    'https://developer.microsoft.com/json-schemas/fabric/item/report/' + kind + '/' + version + '/schema.json';
  const field = (kind: 'Column' | 'Measure', name: string) => ({
    [kind]: { Expression: { SourceRef: { Entity: 'Example' } }, Property: name },
  });
  const visual = (
    name: string,
    type: string,
    x: number,
    y: number,
    width: number,
    height: number,
    projections: unknown[] = [],
  ) => ({
    $schema: schema('definition/visualContainer', '2.5.0'),
    name,
    position: { x, y, z: y, width, height },
    visual: { visualType: type, ...(projections.length ? { query: { queryState: { Values: { projections } } } } : {}) },
  });
  const projection = (kind: 'Column' | 'Measure', name: string) => ({
    field: field(kind, name),
    queryRef: 'Example.' + name,
    nativeQueryRef: name,
  });
  const entries: [string, unknown][] = [
    [
      'definition.pbir',
      {
        $schema: schema('definitionProperties', '2.0.0'),
        version: '4.0',
        datasetReference: { byPath: { path: '../Example.SemanticModel' } },
      },
    ],
    ['definition/report.json', { $schema: schema('definition/report', '3.1.0') }],
    ['definition/pages/pages.json', { pageOrder: ['overview', 'details'] }],
    [
      'definition/pages/overview/page.json',
      {
        $schema: schema('definition/page', '2.0.0'),
        name: 'overview',
        displayName: 'Synthetic overview',
        width: 1100,
        height: 640,
      },
    ],
    [
      'definition/pages/details/page.json',
      {
        $schema: schema('definition/page', '2.0.0'),
        name: 'details',
        displayName: 'Synthetic details',
        width: 1100,
        height: 640,
      },
    ],
    [
      'definition/pages/overview/visuals/revenue/visual.json',
      visual('revenue', 'card', 24, 28, 320, 140, [projection('Measure', 'Revenue')]),
    ],
    [
      'definition/pages/overview/visuals/orders/visual.json',
      visual('orders', 'card', 372, 28, 320, 140, [projection('Measure', 'Orders')]),
    ],
    [
      'definition/pages/overview/visuals/region/visual.json',
      visual('region', 'slicer', 720, 28, 350, 140, [projection('Column', 'Region')]),
    ],
    [
      'definition/pages/overview/visuals/trend/visual.json',
      visual('trend', 'clusteredColumnChart', 24, 198, 668, 400, [
        projection('Column', 'Month'),
        projection('Measure', 'Revenue'),
      ]),
    ],
    [
      'definition/pages/overview/visuals/custom/visual.json',
      visual('custom', 'customExampleVisual', 720, 198, 350, 400),
    ],
    [
      'definition/pages/details/visuals/table/visual.json',
      visual('table', 'tableEx', 24, 28, 1040, 500, [projection('Column', 'Region'), projection('Measure', 'Revenue')]),
    ],
  ];
  return new Map(entries);
}
export function syntheticReport() {
  return parsePbirReport('Synthetic example — no real data', syntheticReportFiles());
}
