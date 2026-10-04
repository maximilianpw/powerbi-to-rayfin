import { lstat, readdir, open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, sep, basename, join } from 'node:path';
import { parsePbirReport, type ReportFiles } from './pbir-parser';
import { compareText } from './json-boundary';

export class PbirInputError extends Error {
  constructor(
    readonly code: string,
    readonly file: string,
    options?: ErrorOptions,
  ) {
    super(code + ': ' + file, options);
    this.name = 'PbirInputError';
  }
}
async function isDirectory(path: string) {
  const s = await lstat(path);
  if (s.isSymbolicLink()) throw new PbirInputError('INPUT_SYMLINK_REJECTED', path);
  return s.isDirectory();
}
export async function discoverReports(input: string): Promise<string[]> {
  const root = resolve(input);
  if (!(await isDirectory(root))) throw new PbirInputError('INPUT_DIRECTORY_REQUIRED', root);
  const found: string[] = [];
  let visited = 0;
  async function visit(dir: string, depth: number): Promise<void> {
    if (++visited > 20000 || depth > 20) throw new PbirInputError('DISCOVERY_LIMIT_EXCEEDED', dir);
    const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => compareText(a.name, b.name));
    if (entries.some((e) => e.name === 'definition.pbir' && e.isFile())) {
      found.push(dir);
      return;
    }
    for (const e of entries)
      if (!e.name.startsWith('.') && e.name !== 'node_modules' && e.isDirectory() && !e.isSymbolicLink())
        await visit(join(dir, e.name), depth + 1);
  }
  await visit(root, 0);
  return found;
}
export async function readPbirFiles(input: string): Promise<ReportFiles> {
  const requested = resolve(input);
  if (!(await isDirectory(requested))) throw new PbirInputError('INPUT_DIRECTORY_REQUIRED', requested);
  const root = await realpath(requested);
  const files = new Map<string, unknown>();
  let total = 0;
  const unread: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true }))
    if (['StaticResources', 'CustomVisuals', 'mobileState.json'].includes(entry.name)) unread.push(entry.name);
  async function readJson(path: string): Promise<void> {
    const full = join(root, path);
    const resolved = await realpath(full);
    const rel = relative(root, resolved);
    if (rel === '..' || rel.startsWith('..' + sep) || (await lstat(full).then((s) => s.isSymbolicLink())))
      throw new PbirInputError('INPUT_PATH_ESCAPE', path);
    const handle = await open(full, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      const current = await lstat(full);
      if (!stat.isFile() || stat.ino !== current.ino || stat.dev !== current.dev)
        throw new PbirInputError('INPUT_CHANGED_DURING_READ', path);
      const checked = relative(root, await realpath(full));
      if (checked === '..' || checked.startsWith('..' + sep)) throw new PbirInputError('INPUT_PATH_ESCAPE', path);
      total += stat.size;
      if (stat.size > 8 * 1024 * 1024 || total > 64 * 1024 * 1024) throw new PbirInputError('INPUT_SIZE_LIMIT', path);
      const text = await handle.readFile('utf8');
      if (Buffer.byteLength(text) > 8 * 1024 * 1024) throw new PbirInputError('INPUT_SIZE_LIMIT', path);
      try {
        const content: unknown = JSON.parse(text);
        files.set(path, content);
      } catch (cause) {
        throw new PbirInputError('INPUT_JSON_INVALID', path, { cause });
      }
    } finally {
      await handle.close();
    }
  }
  await readJson('definition.pbir');
  async function visit(dir: string, depth: number): Promise<void> {
    if (depth > 8 || files.size > 20000) throw new PbirInputError('INPUT_TREE_LIMIT', dir);
    for (const e of (await readdir(join(root, dir), { withFileTypes: true })).sort((a, b) =>
      compareText(a.name, b.name),
    )) {
      if (e.name.startsWith('.')) continue;
      const path = dir + '/' + e.name;
      if (e.isSymbolicLink()) throw new PbirInputError('INPUT_SYMLINK_REJECTED', path);
      if (e.isDirectory()) await visit(path, depth + 1);
      else if (e.isFile() && e.name.endsWith('.json')) await readJson(path);
      else unread.push(path);
    }
  }
  if (!(await isDirectory(join(root, 'definition'))))
    throw new PbirInputError('PBIR_DEFINITION_REQUIRED', 'definition');
  await visit('definition', 0);
  if (unread.length) files.set('scanner/unread.json', unread.sort(compareText));
  return files;
}
export async function loadPbirReport(input: string) {
  return parsePbirReport(basename(resolve(input)).replace(/\.Report$/, ''), await readPbirFiles(input));
}
