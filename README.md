# Report Port — Power BI to Rayfin feasibility prototype

A local, deterministic **PBIR compatibility scanner and offline inspection workbench**. It is not a finished Power BI converter. It does not authenticate, execute DAX, deploy Rayfin, or reproduce Power BI visual behavior.

## Run

Requires Bun 1.3.14 or compatible.

```sh
bun install --frozen-lockfile
bun run dev
```

Open http://127.0.0.1:5188. Without an imported catalog, a hand-authored synthetic report is shown. The dev server binds to loopback. No external fonts, telemetry, image requests or model APIs are used by the frontend.

```sh
# Discover reports and print counts/findings. Never writes to the input.
bun run cli scan /path/to/report-repository

# Import one or more PBIR report folders, not the tiny PBIP entry file.
bun run cli import /path/to/Example.Report /path/to/Another.Report

# Export a NEW, standalone offline frontend. .local must exist (import creates it).
bun run cli export /path/to/Example.Report .local/example-offline
cd .local/example-offline
bun install
bun run build
bun run dev
```

The export is **not an authenticated or deployable-as-is Rayfin data app**. It is a standalone React frontend candidate with the inspection UI and a versioned source snapshot of the runtime. The generated README describes the integration gate. No inferred cloud identifiers or deployment commands are executed.

## What works

- Bounded, read-only PBIR directory discovery; symlink rejection.
- Structural validation of required metadata and bounded positions. Recognized schema versions are explicit. This is **not complete validation against Microsoft JSON schemas**.
- Stable normalized artifacts, content fingerprints, page order, positions, parent-group relationships, hidden state, field bindings and source locations.
- Approximate text/shape primitives; explicit data placeholders; page switching, report search, zoom, hidden-object inspection and grouped diagnostics.
- Conservative, **unexecuted** DAX candidates for isolated columns, measures and SUM/AVERAGE/MIN/MAX aggregations. Unsupported context blocks emission.
- Private standalone frontend export, refused overwrites, deterministic output tests.

## What does not work yet

- Raw PBIX extraction, service dashboards, or automatic selection of published reports.
- Live Rayfin/Fabric SDK integration, authentication, model data, RLS/OLS or API-limit verification.
- Filter-context compilation, totals, date hierarchies, drillthrough, bookmarks, actions, cross-highlighting, model sort-by columns, dynamic formatting, mobile layouts or custom visuals.
- Pixel parity, font/theme inheritance, image/resources rendering or faithful rich-text/shape styling. Group coordinates are interpreted as relative, but Power BI parity and group scaling are unverified.
- Full report conversion: every artifact is marked incomplete. Primitive counts and candidate-query counts are **not compatibility percentages**.

The first real corpus currently produces no safe query candidates under the conservative gates. That is an explicit result, not a reason to fabricate values or silently omit filters.

## Privacy and boundaries

- Imported catalogs, exported projects and evidence live under ignored `.local/`. Exported folders additionally ignore all files by default. Review before ever sharing.
- Tests use synthetic fixtures. Real-report testing is opt-in through `REPORTS_ROOT`; no customer fixtures are checked into the converter.
- Only the report definition JSON is read. PBIX data, TMDL models, `.env` files and credentials are not read. Connection strings in definition.pbir are not propagated into generated output.
- Metadata may contain private labels, identifiers and field expressions even without a dataset. Treat `.local` and exported builds as private.
- Normal production builds contain **only the synthetic catalog**, even after local import, to avoid accidentally publishing customer metadata. Use the explicitly private exported project for a build of a real report.
- There is no push, deployment, cloud mutation or query execution path.
- This is a trusted single-user local CLI, not an adversarial multi-user upload service or a filesystem sandbox.

## Checks

```sh
bun run test
bun run typecheck
bun run format:check
bun run build
bunx playwright install chromium
bun run test:browser

# Optional: read-only regression across your own report corpus.
REPORTS_ROOT=/path/to/reports bun run test
```

Browser tests use the production synthetic build, covering query inspection, findings, page switching, search, mobile document overflow and catalog errors. Original Power BI rendering and live data are not tested.

See [ARCHITECTURE.md](ARCHITECTURE.md) and [STATUS.md](STATUS.md).
