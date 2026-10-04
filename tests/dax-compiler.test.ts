import { expect, test } from 'bun:test';
import { compileDaxCandidate } from '../src/dax-compiler';
const source = { SourceRef: { Entity: 'Sales' } };
const column = { Column: { Expression: source, Property: 'Region' } };
const measure = { Measure: { Expression: source, Property: 'Revenue' } };
function query(...fields: unknown[]) {
  return { queryState: { Values: { projections: fields.map((field, i) => ({ field, queryRef: 'ref' + i })) } } };
}
test('compiles a scalar measure candidate', () =>
  expect(compileDaxCandidate(query(measure), [])).toMatchObject({
    status: 'candidate',
    dax: `EVALUATE\nROW("ref0", 'Sales'[Revenue])`,
  }));
test('compiles grouped measures without converting measures to sums', () =>
  expect(compileDaxCandidate(query(column, measure), [])).toMatchObject({
    status: 'candidate',
    dax: `EVALUATE\nSUMMARIZECOLUMNS(\n  'Sales'[Region],\n  "ref1", 'Sales'[Revenue]\n)`,
  }));
test('escapes table and member names', () => {
  const result = compileDaxCandidate(
    query({ Measure: { Expression: { SourceRef: { Entity: "O'Brien" } }, Property: 'Odd]Name' } }),
    [],
  );
  expect(result).toMatchObject({ status: 'candidate', dax: `EVALUATE\nROW("ref0", 'O''Brien'[Odd]]Name])` });
});
test.each([
  [0, 'SUM'],
  [1, 'AVERAGE'],
  [3, 'MIN'],
  [4, 'MAX'],
])('aggregation %s maps to %s', (code, fn) => {
  const result = compileDaxCandidate(query({ Aggregation: { Expression: column, Function: code } }), []);
  expect(result.status).toBe('candidate');
  if (result.status === 'candidate') expect(result.dax).toContain(fn + "('Sales'[Region])");
});
test('unknown aggregations are blocked', () =>
  expect(compileDaxCandidate(query({ Aggregation: { Expression: column, Function: 99 } }), []).status).toBe('blocked'));
test('does not drop unknown query or projection properties', () => {
  expect(compileDaxCandidate({ ...query(measure), sortDefinition: {} }, []).status).toBe('blocked');
  expect(
    compileDaxCandidate(
      { queryState: { Values: { projections: [{ field: measure, queryRef: 'x', futureProperty: true }] } } },
      [],
    ).status,
  ).toBe('blocked');
});
test('blocks unsupported context and empty projections', () => {
  expect(compileDaxCandidate(query(measure), ['filter not compiled']).status).toBe('blocked');
  expect(compileDaxCandidate(query(), []).status).toBe('blocked');
});
test('query role ordering does not change deterministic output', () => {
  const a = {
    queryState: {
      Y: { projections: [{ field: measure, queryRef: 'm' }] },
      Category: { projections: [{ field: column, queryRef: 'c' }] },
    },
  };
  const b = { queryState: { Category: a.queryState.Category, Y: a.queryState.Y } };
  expect(compileDaxCandidate(a, [])).toEqual(compileDaxCandidate(b, []));
});
test.each([2, 5, 6, 7, 8])('unverified aggregation %s is blocked', (code) =>
  expect(compileDaxCandidate(query({ Aggregation: { Expression: column, Function: code } }), []).status).toBe(
    'blocked',
  ),
);
test('does not discard duplicate column projections', () =>
  expect(compileDaxCandidate(query(column, column), []).status).toBe('blocked'));
test('absent query does not fabricate data', () =>
  expect(compileDaxCandidate(undefined, [])).toEqual({ status: 'none' }));
test('every candidate is explicitly unexecuted', () => {
  const p = compileDaxCandidate(query(measure), []);
  if (p.status !== 'candidate') throw new Error('fixture');
  expect(p.notes[0]).toContain('UNEXECUTED');
});
