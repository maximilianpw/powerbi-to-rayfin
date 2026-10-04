import { createHash } from 'node:crypto';
import { z } from 'zod';
import { at, array, compareText, object, stableJson, string } from './json-boundary.ts';
import { compileDaxCandidate } from './dax-compiler.ts';
import {
  reportSchema,
  type ConvertedReport,
  type ReportBinding,
  type ReportIssue,
  type ReportPage,
  type ReportVisual,
} from './report-model.ts';

export type ReportFiles = ReadonlyMap<string, unknown>;
const positionSchema = z.object({
  x: z.number().finite().min(-100000).max(100000),
  y: z.number().finite().min(-100000).max(100000),
  z: z.number().finite().default(0),
  width: z.number().min(0).max(20000),
  height: z.number().min(0).max(20000),
  tabOrder: z.number().finite().default(0),
});
const visualSchema = z.looseObject({
  name: z.string().min(1),
  position: positionSchema,
  visual: z.looseObject({ visualType: z.string().min(1) }).optional(),
  visualGroup: z.record(z.string(), z.unknown()).optional(),
  parentGroupName: z.string().optional(),
  isHidden: z.boolean().optional(),
});
const pageSchema = z.looseObject({
  name: z.string().min(1),
  displayName: z.string(),
  width: z.number().positive().max(20000),
  height: z.number().positive().max(20000),
  visibility: z.string().optional(),
});
const nativePlaceholders = new Set([
  'card',
  'cardVisual',
  'clusteredColumnChart',
  'columnChart',
  'barChart',
  'clusteredBarChart',
  'lineChart',
  'tableEx',
  'slicer',
]);
const primitives = new Set(['textbox', 'shape']);

function issue(
  source: string,
  code: string,
  message: string,
  severity: ReportIssue['severity'] = 'blocker',
): ReportIssue {
  return { source, code, message, severity };
}
function literal(value: unknown): string | null {
  const text = at(value, 'expr', 'Literal', 'Value');
  if (typeof text !== 'string') return null;
  if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replaceAll("''", "'");
  return text;
}
function property(objects: unknown, section: string, key: string): unknown {
  // State-specific and series-specific properties are not general defaults.
  const entries = array(object(objects)[section])
    .map(object)
    .filter((e) => e.selector === undefined || at(e, 'selector', 'id') === 'default');
  const entry = entries.findLast((e) => object(e.properties)[key] !== undefined);
  return at(entry, 'properties', key);
}
function color(value: unknown): string | null {
  const candidate = literal(at(value, 'solid', 'color'));
  return candidate && /^#[a-fA-F0-9]{6}$/.test(candidate) ? candidate : null;
}
function bindings(query: unknown): ReportBinding[] {
  return Object.entries(object(at(query, 'queryState')))
    .sort(([a], [b]) => compareText(a, b))
    .flatMap(([role, state]) =>
      array(at(state, 'projections')).map((value) => {
        const projection = object(value);
        const f = object(projection.field);
        const kind = f.Column ? 'column' : f.Measure ? 'measure' : f.Aggregation ? 'aggregation' : 'unsupported';
        const member = kind === 'aggregation' ? at(f, 'Aggregation', 'Expression', 'Column') : (f.Column ?? f.Measure);
        return {
          role,
          label: string(projection.displayName) || string(projection.nativeQueryRef) || string(projection.queryRef),
          queryRef: string(projection.queryRef),
          kind,
          table: string(at(member, 'Expression', 'SourceRef', 'Entity')),
          property: string(at(member, 'Property')),
          expression: projection.field ?? null,
        };
      }),
    );
}
function hasFilters(raw: unknown): boolean {
  return array(at(raw, 'filterConfig', 'filters')).length > 0;
}
function schemaIssue(raw: unknown, path: string, kind: string, versions: readonly string[]): ReportIssue[] {
  const url = string(at(raw, '$schema'));
  const prefix = 'https://developer.microsoft.com/json-schemas/fabric/item/report/';
  return versions.some((version) => url === prefix + kind + '/' + version + '/schema.json')
    ? []
    : [
        issue(
          path,
          'PBIR_SCHEMA_UNRECOGNIZED',
          'Schema version is outside the explicitly recognized versions; parsing is structural only.',
        ),
      ];
}
function scopeIssues(raw: Record<string, unknown>, path: string): ReportIssue[] {
  const issues: ReportIssue[] = [];
  if (hasFilters(raw))
    issues.push(
      issue(
        path,
        'FILTER_CONTEXT_UNSUPPORTED',
        'Filter declarations are present; effective filter semantics have not been translated.',
      ),
    );
  for (const [key, code] of [
    ['pageBinding', 'DRILLTHROUGH_UNSUPPORTED'],
    ['visualInteractions', 'INTERACTIONS_UNSUPPORTED'],
    ['syncGroup', 'SYNC_SLICER_UNSUPPORTED'],
  ] as const) {
    if (raw[key] !== undefined) issues.push(issue(path, code, 'Unsupported behavior: ' + key + '.'));
  }
  return issues;
}
function unknownKeys(raw: Record<string, unknown>, allowed: readonly string[], source: string): ReportIssue[] {
  return Object.keys(raw)
    .filter((k) => !allowed.includes(k))
    .sort()
    .map((k) => issue(source, 'PBIR_PROPERTY_UNHANDLED', 'Untranslated property: ' + k + '.'));
}
function visualFromFile(raw: unknown, path: string, context: readonly string[]): ReportVisual {
  const v = visualSchema.parse(raw);
  const visual = object(v.visual);
  const type = v.visual?.visualType ?? 'group';
  const objects = object(visual.objects);
  const container = object(visual.visualContainerObjects);
  const text =
    array(property(objects, 'general', 'paragraphs'))
      .map((p) =>
        array(at(p, 'textRuns'))
          .map((t) => string(at(t, 'value')))
          .join(''),
      )
      .join('\n') ||
    literal(property(objects, 'text', 'text')) ||
    '';
  const fields = bindings(visual.query);
  const issues = [
    ...schemaIssue(raw, path, 'definition/visualContainer', ['2.0.0', '2.1.0', '2.2.0', '2.3.0', '2.4.0', '2.5.0']),
    ...scopeIssues(v, path),
    ...unknownKeys(
      v,
      [
        '$schema',
        'name',
        'position',
        'visual',
        'visualGroup',
        'parentGroupName',
        'isHidden',
        'howCreated',
        'annotations',
        'filterConfig',
      ],
      path,
    ),
    ...unknownKeys(
      visual,
      ['visualType', 'query', 'objects', 'visualContainerObjects', 'drillFilterOtherVisuals'],
      path,
    ),
  ];
  if (!v.visual && !v.visualGroup)
    issues.push(issue(path, 'VISUAL_DEFINITION_MISSING', 'Neither visual nor visualGroup is present.'));
  if (v.visual && v.visualGroup)
    issues.push(issue(path, 'VISUAL_GROUP_AMBIGUOUS', 'Both visual and visualGroup are present.'));
  if (type !== 'group' && !primitives.has(type) && !nativePlaceholders.has(type))
    issues.push(issue(path, 'VISUAL_TYPE_UNSUPPORTED', 'No renderer for visual type ' + type + '.'));
  if (type === 'actionButton')
    issues.push(issue(path, 'ACTION_UNSUPPORTED', 'Button actions and bookmark/page navigation are not executed.'));
  if (fields.some((f) => f.kind === 'unsupported'))
    issues.push(
      issue(
        path,
        'FIELD_EXPRESSION_UNSUPPORTED',
        'At least one field uses an unsupported expression (for example, a hierarchy).',
      ),
    );
  if (visual.objects !== undefined || visual.visualContainerObjects !== undefined)
    issues.push(
      issue(
        path,
        'FORMATTING_PARTIAL',
        'Only literal text and basic colors are previewed. Themes, fonts, conditional formatting and other properties are not faithfully rendered.',
        'warning',
      ),
    );
  if (visual.query !== undefined)
    issues.push(
      issue(
        path,
        'LIVE_DATA_UNAVAILABLE',
        'Data visual is a labeled placeholder. No data or model identity is connected.',
      ),
    );
  const contextReasons = [
    ...context,
    ...issues.filter((i) => i.severity === 'blocker' && i.code !== 'LIVE_DATA_UNAVAILABLE').map((i) => i.message),
  ];
  // Slicer state and interactions can be stored inside formatting objects.
  if (visual.objects !== undefined || visual.visualContainerObjects !== undefined)
    contextReasons.push(
      'Visual objects may encode selections, totals or other semantics; only an isolated field query can be inspected.',
    );
  const query = compileDaxCandidate(visual.query, contextReasons);
  if (query.status === 'blocked')
    issues.push(
      issue(path, 'QUERY_COMPILATION_BLOCKED', 'No executable query emitted because semantics are incomplete.'),
    );
  const fill = property(container, 'background', 'color');
  return {
    id: v.name,
    source: path,
    type,
    parentId: v.parentGroupName ?? null,
    hidden: v.isHidden ?? false,
    position: v.position,
    title:
      literal(property(container, 'title', 'text')) ||
      literal(property(objects, 'title', 'text')) ||
      fields.map((f) => f.label).join(' / ') ||
      text ||
      type,
    text,
    background: color(fill) || color(property(objects, 'fill', 'fillColor')),
    color: color(property(objects, 'text', 'fontColor')),
    bindings: fields,
    query,
    issues,
    layout: type === 'group' ? 'group' : primitives.has(type) ? 'primitive' : 'placeholder',
  };
}

/** Parse report metadata without reading the model or embedded dataset. Connection strings are never exported; expressions are never executed. */
export function parsePbirReport(name: string, files: ReportFiles): ConvertedReport {
  const definition = object(files.get('definition.pbir'));
  if (!files.has('definition.pbir') || !files.has('definition/report.json'))
    throw new Error('PBIR_REQUIRED_FILE_MISSING');
  const report = object(files.get('definition/report.json'));
  const issues = [
    issue(
      'definition/report.json',
      'OFFLINE_VALIDATION_ONLY',
      'No live query, RLS, original rendering, or Rayfin deployment has been validated.',
      'warning',
    ),
    issue(
      'definition/report.json',
      'BEHAVIOR_NOT_PORTED',
      'This artifact is an offline inspection scaffold, not a completed interactive report migration.',
    ),
    ...schemaIssue(definition, 'definition.pbir', 'definitionProperties', ['1.0.0', '2.0.0']),
    ...schemaIssue(report, 'definition/report.json', 'definition/report', ['1.0.0', '2.0.0', '3.0.0', '3.1.0']),
    ...scopeIssues(report, 'definition/report.json'),
  ];
  if (files.has('definition/reportExtensions.json'))
    issues.push(
      issue(
        'definition/reportExtensions.json',
        'REPORT_EXTENSIONS_UNSUPPORTED',
        'Report-level measures or extensions require explicit translation.',
      ),
    );
  if ([...files.keys()].some((k) => k.startsWith('definition/bookmarks/')))
    issues.push(
      issue(
        'definition/bookmarks',
        'BOOKMARKS_UNSUPPORTED',
        'Bookmark state, actions and default visibility require validation.',
      ),
    );
  if ([...files.keys()].some((k) => k.endsWith('/mobile.json')))
    issues.push(
      issue(
        'definition/pages',
        'MOBILE_LAYOUT_UNSUPPORTED',
        'Mobile-specific visual layout is not translated.',
        'warning',
      ),
    );
  if (report.themeCollection !== undefined)
    issues.push(
      issue(
        'definition/report.json',
        'THEME_NOT_RESOLVED',
        'Theme inheritance and bundled assets are not resolved.',
        'warning',
      ),
    );
  issues.push(
    ...unknownKeys(
      report,
      ['$schema', 'themeCollection', 'objects', 'resourcePackages', 'settings', 'filterConfig', 'annotations'],
      'definition/report.json',
    ),
  );
  for (const path of files.keys()) {
    if (path === 'scanner/unread.json') continue;
    if (
      !/^(definition\.pbir|definition\/(report\.json|version\.json|reportExtensions\.json|bookmarks\/[^/]+\.json|pages\/pages\.json|pages\/[^/]+\/page\.json|pages\/[^/]+\/visuals\/[^/]+\/(visual|mobile)\.json))$/.test(
        path,
      )
    )
      issues.push(issue(path, 'DEFINITION_FILE_UNHANDLED', 'Definition file is not translated.'));
  }
  for (const unread of array(files.get('scanner/unread.json')))
    issues.push(
      issue(
        string(unread),
        'REPORT_RESOURCE_UNREAD',
        'Resource or non-JSON metadata was not read; this is a partial definition scan.',
        'warning',
      ),
    );
  const context = issues
    .filter((i) => i.severity === 'blocker' && i.code !== 'BEHAVIOR_NOT_PORTED')
    .map((i) => i.message);
  const pages: ReportPage[] = [];
  for (const [path, value] of [...files].sort(([a], [b]) => compareText(a, b))) {
    const match = /^definition\/pages\/([^/]+)\/page.json$/.exec(path);
    if (!match) continue;
    const p = pageSchema.parse(value);
    if (p.name !== match[1]) throw new Error('PBIR_PAGE_ID_MISMATCH: ' + path);
    const pageIssues = [
      ...scopeIssues(p, path),
      ...schemaIssue(p, path, 'definition/page', ['1.0.0', '2.0.0']),
      ...unknownKeys(
        p,
        [
          '$schema',
          'name',
          'displayName',
          'displayOption',
          'height',
          'width',
          'filterConfig',
          'pageBinding',
          'objects',
          'visibility',
          'visualInteractions',
          'annotations',
        ],
        path,
      ),
    ];
    const prefix = 'definition/pages/' + p.name + '/visuals/';
    const visuals = [...files]
      .filter(([f]) => f.startsWith(prefix) && /^([^/]+)\/visual.json$/.test(f.slice(prefix.length)))
      .map(([f, v]) => {
        const visual = visualFromFile(v, f, [
          ...context,
          ...pageIssues.filter((i) => i.severity === 'blocker').map((i) => i.message),
        ]);
        if (f !== prefix + visual.id + '/visual.json') throw new Error('PBIR_VISUAL_ID_MISMATCH: ' + f);
        return visual;
      })
      .sort((a, b) => a.position.z - b.position.z || compareText(a.id, b.id));
    // Keep local coordinates unchanged. Group offsets are resolved by the renderer and checked here.
    for (const visual of visuals) {
      let current: ReportVisual | undefined = visual;
      const seen = new Set<string>();
      while (current?.parentId) {
        if (seen.has(current.id)) {
          visual.issues.push(issue(visual.source, 'GROUP_CYCLE', 'Cyclic parent group reference.'));
          break;
        }
        seen.add(current.id);
        const parent = visuals.find((v) => v.id === current?.parentId);
        if (!parent || parent.type !== 'group') {
          visual.issues.push(
            issue(visual.source, 'GROUP_PARENT_MISSING', 'Parent group is missing or is not a group.'),
          );
          break;
        }
        current = parent;
      }
    }
    pages.push({
      id: p.name,
      name: p.displayName,
      width: p.width,
      height: p.height,
      hidden: p.visibility === 'HiddenInViewMode',
      background: color(property(p.objects, 'background', 'color')),
      visuals,
      issues: pageIssues,
    });
  }
  if (!pages.length) throw new Error('PBIR_NO_PAGES');
  const rawOrder = at(files.get('definition/pages/pages.json'), 'pageOrder');
  const order = rawOrder === undefined ? [] : z.array(z.string().min(1)).parse(rawOrder);
  if (
    rawOrder !== undefined &&
    (new Set(order).size !== order.length ||
      order.length !== pages.length ||
      order.some((id) => !pages.some((p) => p.id === id)))
  )
    throw new Error('PBIR_PAGE_ORDER_INVALID');
  if (rawOrder === undefined)
    issues.push(
      issue(
        'definition/pages/pages.json',
        'PAGE_ORDER_INFERRED',
        'No page order declared; pages ordered by stable ID.',
        'warning',
      ),
    );
  pages.sort((a, b) => {
    const ai = order.indexOf(a.id),
      bi = order.indexOf(b.id);
    return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi) || compareText(a.id, b.id);
  });
  const fingerprint = createHash('sha256')
    .update(stableJson(Object.fromEntries(files)))
    .digest('hex');
  const reference = object(definition.datasetReference);
  return reportSchema.parse({
    version: 1,
    generator: 'powerbi-to-rayfin/0.1.0',
    name,
    fingerprint,
    model: reference.byPath ? 'local-reference' : reference.byConnection ? 'remote-reference' : 'unknown',
    pages,
    issues,
    verification: 'offline-only',
  });
}
