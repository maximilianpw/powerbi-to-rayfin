import type { ReportPage, ReportVisual } from './report-model';
/** PBIR child positions are interpreted as group-relative; original rendering parity is unverified. */
export function visualBounds(page: ReportPage, visual: ReportVisual) {
  let x = visual.position.x,
    y = visual.position.y,
    hidden = visual.hidden;
  let parentId = visual.parentId;
  const visited = new Set([visual.id]);
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = page.visuals.find((v) => v.id === parentId);
    if (!parent || parent.type !== 'group') break;
    x += parent.position.x;
    y += parent.position.y;
    hidden = hidden || parent.hidden;
    parentId = parent.parentId;
  }
  return { x, y, width: visual.position.width, height: visual.position.height, hidden };
}
