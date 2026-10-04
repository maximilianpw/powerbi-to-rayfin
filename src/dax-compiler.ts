import { z } from 'zod';
import { compareText } from './json-boundary.ts';
import type { QueryPlan } from './report-model.ts';

const source = z.object({ SourceRef: z.object({ Entity: z.string().min(1).max(512) }).strict() }).strict();
const member = z.object({ Expression: source, Property: z.string().min(1).max(512) }).strict();
const column = z.object({ Column: member }).strict();
const measure = z.object({ Measure: member }).strict();
const aggregation = z
  .object({
    Aggregation: z
      .object({ Expression: column, Function: z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(4)]) })
      .strict(),
  })
  .strict();
const field = z.union([column, measure, aggregation]);
const projection = z
  .object({
    field,
    queryRef: z.string().min(1).max(512),
    nativeQueryRef: z.string().optional(),
    displayName: z.string().optional(),
    active: z.boolean().optional(),
  })
  .strict();
const query = z
  .object({ queryState: z.record(z.string(), z.object({ projections: z.array(projection) }).strict()) })
  .strict();
const functions: Readonly<Record<0 | 1 | 3 | 4, string>> = { 0: 'SUM', 1: 'AVERAGE', 3: 'MIN', 4: 'MAX' };
function table(name: string) {
  return "'" + name.replaceAll("'", "''") + "'";
}
function property(name: string) {
  return '[' + name.replaceAll(']', ']]') + ']';
}
function expression(f: z.infer<typeof field>): string {
  if ('Column' in f) return table(f.Column.Expression.SourceRef.Entity) + property(f.Column.Property);
  if ('Measure' in f) return table(f.Measure.Expression.SourceRef.Entity) + property(f.Measure.Property);
  const fn = functions[f.Aggregation.Function];
  if (!fn) throw new Error('DAX_AGGREGATION_INVALID');
  return fn + '(' + expression(f.Aggregation.Expression) + ')';
}
/** Emits review-only DAX for a deliberately small, filter-free query subset. Never executes it. */
export function compileDaxCandidate(input: unknown, contextBlockers: readonly string[]): QueryPlan {
  if (input === undefined) return { status: 'none' };
  const parsed = query.safeParse(input);
  const reasons = [...contextBlockers];
  if (!parsed.success) reasons.push('Query contains an unsupported expression, ordering, or query option.');
  if (reasons.length || !parsed.success) return { status: 'blocked', reasons: [...new Set(reasons)] };
  const projections = Object.entries(parsed.data.queryState)
    .sort(([a], [b]) => compareText(a, b))
    .flatMap(([, s]) => s.projections);
  if (!projections.length) return { status: 'blocked', reasons: ['Query has no projections.'] };
  if (projections.some((p) => p.active === false))
    return { status: 'blocked', reasons: ['Inactive projections require hierarchy/drill semantics.'] };
  const columns = projections.filter((p) => 'Column' in p.field).map((p) => expression(p.field));
  if (
    new Set(columns).size !== columns.length ||
    new Set(projections.map((p) => p.queryRef)).size !== projections.length
  )
    return { status: 'blocked', reasons: ['Duplicate projection identity needs explicit result mapping.'] };
  const values = projections
    .filter((p) => !('Column' in p.field))
    .map((p) => '"' + p.queryRef.replaceAll('"', '""') + '", ' + expression(p.field));
  const body = columns.length
    ? 'SUMMARIZECOLUMNS(\n  ' + [...columns, ...values].join(',\n  ') + '\n)'
    : values.length
      ? 'ROW(' + values.join(', ') + ')'
      : null;
  if (body === null) return { status: 'blocked', reasons: ['No executable projection.'] };
  return {
    status: 'candidate',
    dax: 'EVALUATE\n' + body,
    notes: [
      'UNEXECUTED: review-only query, not a verified Power BI equivalent.',
      'No limits, totals, model sort-by columns, or interaction context inferred. Do not execute automatically.',
    ],
  };
}
