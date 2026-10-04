# Architecture and extension points

## Scope

This first milestone proves metadata ingestion, deterministic artifacts, offline inspection and private source export. It does not prove that any real report can yet be fully ported.

## Ownership

- `src/pbir-files.ts`: discovers report folders, bounds input traversal/size and reads JSON with no-follow file handles. No TMDL, PBIX, `.env` or cloud reads. Reports unread assets without opening them.
- `src/pbir-parser.ts`: translates PBIR into the inspection representation. Recognizes a structural subset, reports unsupported behavior, validates page order and detects bad groups.
- `src/dax-compiler.ts`: accepts a narrow strict query expression grammar and explicit context blockers. Emits review-only DAX, never executes it. Unknown options, duplicate projection identities and count-function variants are blocked.
- `src/report-model.ts`: normalized artifact schema, source locations, diagnostics, summary and verification status.
- `src/offline-layout.ts`: group-relative coordinate and visibility interpretation. Original Power BI parity remains unverified.
- `src/ui/`: pure React inspection UI. Definitions are rendered as inert text and CSS geometry; no HTML injection, remote assets or arbitrary code execution.
- `src/local-output.ts`: confines generated artifacts to ignored `.local`, rejects pre-existing symlinks, atomically replaces catalogs.
- `src/export-project.ts`: validates input, locks a destination against concurrent exports from this tool, stages a complete frontend and renames it into place. Refuses existing output.
- `src/cli.ts`: command orchestration and safe errors.

The parser is independent of React and Rayfin. The output currently embeds a versioned copy of the runtime source. A distributable shared runtime package is the next step; do not regenerate over user changes.

## Determinism

Input JSON is canonicalized before SHA-256 hashing. Paths, object keys and query roles are ordered with an explicit code-unit comparator, not host locale. Page order and projection array order remain semantically significant. Artifacts contain no clock, random IDs or absolute source path. Export staging uses temporary paths, but those paths are not embedded.

Direct dependencies are version-pinned and the main project has a Bun lockfile. Exported source is byte-repeatable for the same input and converter source; dependency resolution in a newly exported project is not transitively frozen until its own lockfile is generated.

## Query safety

A candidate is an isolated query expression, not a compiled Power BI visual. It preserves referenced tables/measures and named measure projections; it does not infer model sort-by columns, implicit date tables, formatting, totals or runtime interactions. No execution interface exists. A candidate must never be wired automatically to a live connector merely because it parsed.

All real reports currently have blocked query emission. The synthetic fixture demonstrates the narrow supported expression grammar only.

## Trust model

Trusted, single-user local development. Static input/output symlinks are rejected; reads use a no-follow handle and verify file identity, and writes are staged. These defenses are not a sandbox against another process racing ancestor directory replacement. Do not expose the CLI as a hosted file-upload service without a separate threat model and OS-level isolation.

Plain CSS is used for this small inspection shell and source-coordinate-driven layout. Authentication, routing frameworks, StyleX, persistence and cloud infrastructure are deliberately not introduced for the offline milestone.

## Next milestones

1. Parse full Microsoft JSON schemas and produce feature-level capability reports rather than broad conservative blockers.
2. Add semantic-model metadata indexing without exporting credentials or source connection expressions. Check unresolved field references before compiling.
3. Implement one explicit filter/aggregation subset with synthetic fixtures and an output-binding contract. Require Power BI reference query/results before claiming equivalence.
4. Integrate the official Rayfin dataapp scaffold and semantic-model connector in an authorized development workspace. No handwritten substitute authentication.
5. Implement actual data renderers behind that binding contract, then validate totals, blanks, sort order, dynamic formatting and RLS/OLS under restricted identities.
6. Add charts/interactions incrementally based on report-level coverage, with explicit rejection for unsupported behavior.

## Primary documentation

- https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-report
- https://learn.microsoft.com/en-us/fabric/apps/overview
- https://learn.microsoft.com/en-us/fabric/apps/data-apps-template
