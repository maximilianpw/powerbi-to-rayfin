import { z } from 'zod';

export const issueSchema = z.object({
  code: z.string(),
  severity: z.enum(['blocker', 'warning']),
  message: z.string(),
  source: z.string(),
});
export type ReportIssue = z.infer<typeof issueSchema>;
export const bindingSchema = z.object({
  role: z.string(),
  label: z.string(),
  queryRef: z.string(),
  kind: z.enum(['column', 'measure', 'aggregation', 'unsupported']),
  table: z.string(),
  property: z.string(),
  expression: z.unknown(),
});
export type ReportBinding = z.infer<typeof bindingSchema>;
export const queryPlanSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('candidate'), dax: z.string(), notes: z.array(z.string()) }),
  z.object({ status: z.literal('blocked'), reasons: z.array(z.string()) }),
  z.object({ status: z.literal('none') }),
]);
export type QueryPlan = z.infer<typeof queryPlanSchema>;
export const reportVisualSchema = z.object({
  id: z.string(),
  source: z.string(),
  type: z.string(),
  parentId: z.string().nullable(),
  hidden: z.boolean(),
  position: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    z: z.number().finite(),
    width: z.number().nonnegative().finite(),
    height: z.number().nonnegative().finite(),
    tabOrder: z.number().finite(),
  }),
  title: z.string(),
  text: z.string(),
  background: z.string().nullable(),
  color: z.string().nullable(),
  bindings: z.array(bindingSchema),
  query: queryPlanSchema,
  issues: z.array(issueSchema),
  layout: z.enum(['primitive', 'placeholder', 'group']),
});
export type ReportVisual = z.infer<typeof reportVisualSchema>;
export const reportPageSchema = z.object({
  id: z.string(),
  name: z.string(),
  width: z.number().positive().max(20000),
  height: z.number().positive().max(20000),
  hidden: z.boolean(),
  background: z.string().nullable(),
  visuals: z.array(reportVisualSchema),
  issues: z.array(issueSchema),
});
export type ReportPage = z.infer<typeof reportPageSchema>;
export const reportSchema = z.object({
  version: z.literal(1),
  generator: z.literal('powerbi-to-rayfin/0.1.0'),
  name: z.string(),
  fingerprint: z.string(),
  model: z.enum(['local-reference', 'remote-reference', 'unknown']),
  pages: z.array(reportPageSchema),
  issues: z.array(issueSchema),
  verification: z.literal('offline-only'),
});
export type ConvertedReport = z.infer<typeof reportSchema>;
export const catalogSchema = z.object({ version: z.literal(1), reports: z.array(reportSchema) });
export type ReportCatalog = z.infer<typeof catalogSchema>;

export function reportIssues(report: ConvertedReport): ReportIssue[] {
  return [...report.issues, ...report.pages.flatMap((p) => [...p.issues, ...p.visuals.flatMap((v) => v.issues)])];
}
export function reportSummary(report: ConvertedReport) {
  const visuals = report.pages.flatMap((p) => p.visuals);
  return {
    name: report.name,
    pages: report.pages.length,
    visuals: visuals.length,
    primitives: visuals.filter((v) => v.layout === 'primitive').length,
    placeholders: visuals.filter((v) => v.layout === 'placeholder').length,
    queryCandidates: visuals.filter((v) => v.query.status === 'candidate').length,
    blockers: reportIssues(report).filter((i) => i.severity === 'blocker').length,
    completeConversion: false,
    types: Object.fromEntries(
      [...new Set(visuals.map((v) => v.type))]
        .sort()
        .map((type) => [type, visuals.filter((v) => v.type === type).length]),
    ),
  };
}
