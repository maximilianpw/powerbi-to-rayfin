import { z } from 'zod';
export const objectSchema = z.record(z.string(), z.unknown());
export function object(value: unknown): Record<string, unknown> {
  const result = objectSchema.safeParse(value);
  return result.success ? result.data : {};
}
export function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
export function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
export function at(value: unknown, ...path: string[]): unknown {
  return path.reduce<unknown>((v, k) => object(v)[k], value);
}
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
/** Stable JSON serialization; locale, filesystem traversal and object insertion order do not affect output. */
export function stableJson(value: unknown): string {
  function sort(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(sort);
    if (v !== null && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(object(v))
          .sort(([a], [b]) => compareText(a, b))
          .map(([k, x]) => [k, sort(x)]),
      );
    return v;
  }
  return JSON.stringify(sort(value), null, 2) + '\n';
}
