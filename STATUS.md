# Milestone status

## Delivered

First offline milestone: deterministic PBIR ingestion, conservative compatibility findings, local inspection UI, and standalone offline React frontend export. **Not a working Power BI-to-Rayfin data/report migration yet.**

- Read-only corpus scan: **12 reports, 32 pages, 1,374 visual objects**.
- Two representative reports imported into the local catalog: **5 pages total**.
- Both private exported frontends installed and built successfully.
- No inferred data, live queries, authentication, cloud mutations, pushes or deployments.
- Existing changes in the source repository were left untouched.

## Verification performed

| Check                                                | Result                                | What it proves                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Unit/filesystem/export tests with real corpus opt-in | 55 passed                             | Parsing, deterministic output, narrow DAX grammar, blocked unsupported context, input/output guardrails, source corpus repeatability |
| TypeScript check                                     | Passed                                | Strict typing, unused-code checks                                                                                                    |
| Formatting check                                     | Passed                                | Source formatting                                                                                                                    |
| Main production build                                | Passed                                | Offline app builds; only synthetic catalog bundled                                                                                   |
| Playwright production browser suite                  | 4 passed                              | Query inspection, object-list return, compatibility findings, page switching, search, mobile overflow, failed-catalog recovery       |
| Local real-report browser smoke check                | 2 reports / 5 pages; zero page errors | Imported metadata displays, page/object controls work, mobile document fits                                                          |
| Two generated frontend builds                        | Passed                                | Exported source is independently buildable                                                                                           |

Browser automation in the collaborative T3 preview failed to capture a snapshot. A separate Playwright Chromium run verified the real local preview and saved private evidence under `.local/evidence`. This is a screenshot of our own inspector, **not evidence of Power BI visual parity**.

## Important findings

The real corpus produced **zero unblocked DAX candidates** under the current deliberately conservative rules. Filters, date hierarchies, drillthrough, visual objects/formatting that may contain state, sort behavior, bookmarks and/or unsupported visual features require more work. This is a meaningful feasibility result, not a successful report migration.

Static shapes and text are approximate. Data visuals are labeled placeholders. Primitive counts are not supported-report percentages. No numeric correctness can be claimed without model access or reference outputs.

## Independent review and follow-up

A read-only review identified filesystem race/partial-export risks, projection identity loss, unreported unread assets, and malformed page-order handling. Changes made:

- Read through no-follow file handles with identity/size checks.
- Stage complete exports, lock destinations against concurrent exports from this tool, refuse overwrite and promote only successful output.
- Use atomic catalog replacement with private temporary directories.
- Preserve named value projections, reject duplicate projection identities, stabilize role ordering.
- Add regressions for context outside the query object, unknown definition files, resource omission and invalid page ordering.
- Explicitly document the trusted single-user threat model. Ancestor-path races by a malicious concurrent process remain outside the guarantees; this is not a hosted upload sandbox.

## Remaining gates

1. Fine-grained filter/query semantics and a result-binding contract.
2. Full schema validation and optional safe model metadata indexing.
3. Actual chart/table data renderers (not just placeholders).
4. Official Rayfin dataapp integration and delegated semantic-model connector.
5. Power BI reference results and rendering comparison.
6. Restricted-user RLS/OLS checks, performance/API limits and approved test deployment.

The development server can stay running for inspection. No recurring or overnight background implementation task was scheduled. This file records a completed first milestone, not a promise of ongoing autonomous work.
