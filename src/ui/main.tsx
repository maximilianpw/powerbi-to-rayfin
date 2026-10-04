import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { catalogSchema } from '../report-model';
import { ReportWorkbench } from './report-workbench';
import './workbench.css';

const element = document.getElementById('root');
if (!element) throw new Error('APP_ROOT_MISSING');
const root = createRoot(element);
root.render(
  <main className="startup">
    <h1>Opening the workbench…</h1>
    <p>Reading the local report catalog.</p>
  </main>,
);
try {
  const response = await fetch('./catalog.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('CATALOG_REQUEST_FAILED');
  const raw: unknown = await response.json();
  const catalog = catalogSchema.parse(raw);
  root.render(
    <StrictMode>
      <ReportWorkbench catalog={catalog} />
    </StrictMode>,
  );
} catch {
  root.render(
    <main className="startup">
      <h1>Could not open the catalog</h1>
      <p role="alert">The catalog is missing or invalid. Run the import command, then reload.</p>
      <button onClick={() => location.reload()}>Retry</button>
    </main>,
  );
}
