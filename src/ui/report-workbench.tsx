import { useState } from 'react';
import type { ConvertedReport, ReportCatalog, ReportPage, ReportVisual } from '../report-model';
import { reportIssues, reportSummary } from '../report-model';
import { visualBounds } from '../offline-layout';

export function ReportWorkbench({ catalog }: { catalog: ReportCatalog }) {
  const [reportId, setReportId] = useState(0);
  const [search, setSearch] = useState('');
  const report = catalog.reports[reportId];
  return (
    <div className="workbench">
      <header className="masthead">
        <div className="brand-mark">P↗</div>
        <div>
          <strong>Report Port</strong>
          <span className="subtitle">POWER BI → FABRIC APPS</span>
        </div>
        <span className="local-pill">● Local / offline</span>
      </header>
      <div className="workspace">
        <aside className="report-sidebar">
          <div className="eyebrow">SOURCE LIBRARY</div>
          <h2>
            Reports <small>{catalog.reports.length}</small>
          </h2>
          <label className="search-label">
            Find a report
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reports…"
            />
          </label>
          <nav aria-label="Reports">
            {catalog.reports.map((r, i) =>
              r.name.toLowerCase().includes(search.toLowerCase()) ? (
                <button
                  key={r.fingerprint + ':' + i}
                  aria-current={i === reportId ? 'true' : undefined}
                  className={i === reportId ? 'report-link active' : 'report-link'}
                  onClick={() => setReportId(i)}
                >
                  <span>{r.name}</span>
                  <small>
                    {r.pages.length} pages · {r.pages.reduce((n, p) => n + p.visuals.length, 0)} objects
                  </small>
                </button>
              ) : null,
            )}
          </nav>
          <div className="sidebar-note">
            <strong>No data leaves this tool.</strong>
            <p>Report definitions are inspected locally. No model queries or cloud deployments run here.</p>
          </div>
        </aside>
        {report ? (
          <ReportView
            key={report.fingerprint + reportId}
            report={report}
          />
        ) : (
          <main className="startup">
            <h1>No reports imported</h1>
            <p>Use the CLI to import a PBIR report folder.</p>
          </main>
        )}
      </div>
    </div>
  );
}
function ReportView({ report }: { report: ConvertedReport }) {
  const [pageId, setPageId] = useState(report.pages[0]?.id ?? '');
  const [mode, setMode] = useState<'layout' | 'compatibility'>('layout');
  const page = report.pages.find((p) => p.id === pageId);
  const summary = reportSummary(report);
  const issues = reportIssues(report);
  const issueCounts = Object.entries(Object.groupBy(issues, (i) => i.code)).sort(
    (a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0),
  );
  return (
    <main className="report-main">
      <div className="report-heading">
        <div>
          <div className="eyebrow">CONVERSION WORKBENCH / 0.1</div>
          <h1>{report.name}</h1>
          <p>Inspect what can be carried over, and what still needs engineering.</p>
        </div>
        <span className="review-badge">NOT READY TO DEPLOY</span>
      </div>
      <section
        className="metrics"
        aria-label="Report summary"
      >
        <Metric
          label="Pages"
          value={summary.pages}
        />
        <Metric
          label="Visual objects"
          value={summary.visuals}
        />
        <Metric
          label="Layout primitives"
          value={summary.primitives}
        />
        <Metric
          label="Blocking findings"
          value={summary.blockers}
        />
      </section>
      <div className="offline-banner">
        <strong>Offline inspection, not a finished migration.</strong>
        <span>
          Data visuals are placeholders. Power BI appearance, DAX results, RLS and Rayfin deployment are unverified.
        </span>
      </div>
      <div
        className="view-tabs"
        aria-label="Workbench views"
      >
        <button
          aria-pressed={mode === 'layout'}
          onClick={() => setMode('layout')}
        >
          Layout & bindings
        </button>
        <button
          aria-pressed={mode === 'compatibility'}
          onClick={() => setMode('compatibility')}
        >
          Compatibility findings <span>{issues.length}</span>
        </button>
      </div>
      {mode === 'layout' ? (
        <>
          <nav
            className="page-tabs"
            aria-label="Report pages"
          >
            {report.pages.map((p) => (
              <button
                key={p.id}
                aria-current={p.id === pageId ? 'page' : undefined}
                onClick={() => setPageId(p.id)}
              >
                {p.name}
                {p.hidden ? ' · hidden page' : ''}
              </button>
            ))}
          </nav>
          {page && (
            <PageView
              key={page.id}
              page={page}
            />
          )}
        </>
      ) : (
        <section className="compatibility">
          <h2>Explicit gaps, no silent substitutions</h2>
          <p>
            These are findings, not a percentage of report fidelity. A visual type being recognized does not mean its
            behavior is supported.
          </p>
          {issueCounts.map(([code, group]) => (
            <details key={code}>
              <summary>
                <span
                  className={group?.some((i) => i.severity === 'blocker') ? 'severity blocker' : 'severity warning'}
                >
                  {group?.some((i) => i.severity === 'blocker') ? 'BLOCKER' : 'WARNING'}
                </span>
                <strong>{code.replaceAll('_', ' ')}</strong>
                <span>{group?.length}</span>
              </summary>
              <ul>
                {group?.map((i, n) => (
                  <li key={i.source + n}>
                    <p>{i.message}</p>
                    <code>{i.source}</code>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      )}
      <footer>
        Source fingerprint <code>{report.fingerprint.slice(0, 16)}</code> · deterministic artifact · no customer dataset
        extracted
      </footer>
    </main>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function PageView({ page }: { page: ReportPage }) {
  const [scale, setScale] = useState(0.6);
  const [showHidden, setShowHidden] = useState(false);
  const [visualId, setVisualId] = useState<string | null>(null);
  const selected = page.visuals.find((v) => v.id === visualId);
  return (
    <div className="page-view">
      <div className="canvas-panel">
        <div className="canvas-toolbar">
          <span>
            {page.width} × {page.height} px
          </span>
          <label>
            Zoom{' '}
            <input
              aria-label="Canvas zoom"
              type="range"
              min="25"
              max="100"
              step="5"
              value={scale * 100}
              onChange={(e) => setScale(Number(e.target.value) / 100)}
            />
            {Math.round(scale * 100)}%
          </label>
          <label>
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            Hidden objects
          </label>
        </div>
        <div
          className="canvas-scroll"
          role="region"
          aria-label="Report layout canvas"
          tabIndex={0}
        >
          <div style={{ width: page.width * scale, height: page.height * scale }}>
            <div
              className="report-canvas"
              style={{
                width: page.width,
                height: page.height,
                transform: 'scale(' + scale + ')',
                background: page.background ?? '#fff',
              }}
            >
              {page.visuals
                .filter((v) => v.type !== 'group')
                .map((v) => {
                  const bounds = visualBounds(page, v);
                  return bounds.hidden && !showHidden ? null : (
                    <VisualPreview
                      key={v.id}
                      visual={v}
                      page={page}
                      selected={v.id === visualId}
                      select={() => setVisualId(v.id)}
                    />
                  );
                })}
            </div>
          </div>
        </div>
        <div className="canvas-legend">
          <span>◇ Layout approximations</span>
          <span>▧ Data placeholders</span>
          <span>Click any object to inspect</span>
        </div>
      </div>
      <aside
        className="inspector"
        aria-label="Visual inspector"
      >
        {selected ? (
          <>
            <button
              className="inspector-back"
              onClick={() => setVisualId(null)}
            >
              ← All objects
            </button>
            <VisualInspector visual={selected} />
          </>
        ) : (
          <>
            <div className="eyebrow">INSPECTOR</div>
            <h2>Look under the surface</h2>
            <p>
              Select an object on the canvas to inspect its source position, field bindings and conversion blockers.
            </p>
            <h3>Page findings</h3>
            {page.issues.length ? (
              page.issues.map((i, n) => (
                <p
                  className="finding"
                  key={i.code + n}
                >
                  {i.message}
                </p>
              ))
            ) : (
              <p>No page-level findings detected. This does not establish behavioral parity.</p>
            )}
            <h3>All objects</h3>
            <div className="object-list">
              {page.visuals.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVisualId(v.id)}
                >
                  {v.type}
                  <small>{v.id.slice(0, 10)}</small>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
function VisualPreview({
  visual: v,
  page,
  selected,
  select,
}: {
  visual: ReportVisual;
  page: ReportPage;
  selected: boolean;
  select: () => void;
}) {
  const b = visualBounds(page, v);
  const title = v.title || v.type;
  return (
    <button
      className={
        'visual ' +
        (selected ? 'selected ' : '') +
        (v.layout === 'primitive' ? 'primitive ' : '') +
        (b.hidden ? 'hidden-visual' : '')
      }
      style={{
        left: b.x,
        top: b.y,
        width: b.width,
        height: b.height,
        zIndex: v.position.z,
        background: v.background ?? undefined,
        color: v.color ?? undefined,
      }}
      onClick={select}
      aria-label={'Inspect ' + title + ' (' + v.id + ')'}
    >
      {v.layout === 'primitive' ? (
        <span className="primitive-text">{v.text || v.title}</span>
      ) : (
        <>
          <span className="visual-kind">{v.type}</span>
          <span className="visual-title">{title}</span>
          <span className="no-data">{v.type === 'card' || v.type === 'cardVisual' ? '—' : '▧'}</span>
          <span className="data-label">NO DATA · INSPECTION ONLY</span>
        </>
      )}
    </button>
  );
}
function VisualInspector({ visual: v }: { visual: ReportVisual }) {
  return (
    <>
      <div className="eyebrow">VISUAL / {v.type}</div>
      <h2>{v.title}</h2>
      <code className="visual-id">{v.id}</code>
      <dl className="positions">
        <dt>Position</dt>
        <dd>
          {v.position.x.toFixed(1)}, {v.position.y.toFixed(1)}
        </dd>
        <dt>Size</dt>
        <dd>
          {v.position.width.toFixed(1)} × {v.position.height.toFixed(1)}
        </dd>
        <dt>Parent</dt>
        <dd>{v.parentId ?? 'Page'}</dd>
      </dl>
      <h3>Field bindings</h3>
      {v.bindings.length ? (
        <ul className="bindings">
          {v.bindings.map((b, i) => (
            <li key={b.role + i}>
              <span>
                {b.role} / {b.kind}
              </span>
              <strong>{b.label}</strong>
              <code>{b.table ? b.table + ' → ' + b.property : b.queryRef}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p>No data bindings.</p>
      )}
      <h3>Query plan</h3>
      {v.query.status === 'candidate' ? (
        <>
          <p className="finding">Unexecuted candidate only. No parity claim.</p>
          <pre>{v.query.dax}</pre>
          <p>{v.query.notes.join(' ')}</p>
        </>
      ) : v.query.status === 'blocked' ? (
        <>
          <strong className="blocked-text">Blocked — no executable DAX emitted</strong>
          <ul>
            {v.query.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>
      ) : (
        <p>No query.</p>
      )}
      <h3>Findings</h3>
      {v.issues.map((i, n) => (
        <div
          className="finding"
          key={i.code + n}
        >
          <strong>{i.code.replaceAll('_', ' ')}</strong>
          <p>{i.message}</p>
        </div>
      ))}
      <details>
        <summary>Source location</summary>
        <code>{v.source}</code>
      </details>
    </>
  );
}
