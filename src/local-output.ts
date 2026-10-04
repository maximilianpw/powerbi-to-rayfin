import { lstat, mkdir, writeFile, rename, mkdtemp, rm } from 'node:fs/promises';
import { resolve, relative, sep, dirname, join } from 'node:path';

export const projectRoot = resolve(import.meta.dirname, '..');
/** All private artifacts stay in this project's ignored .local directory. */
export async function privateOutputPath(path: string): Promise<string> {
  const target = resolve(path);
  const root = join(projectRoot, '.local');
  const rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || resolve(root, rel) !== target)
    throw new Error('OUTPUT_MUST_BE_INSIDE_LOCAL: ' + root);
  let current = projectRoot;
  for (const part of relative(projectRoot, target).split(sep)) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error('OUTPUT_SYMLINK_REJECTED');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
  return target;
}
export async function writePrivateCatalog(content: string): Promise<void> {
  const target = await privateOutputPath(join(projectRoot, '.local/catalog.json'));
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(dirname(target), '.catalog-'));
  try {
    const temp = join(staging, 'catalog.json');
    await writeFile(temp, content, { flag: 'wx', mode: 0o600 });
    await privateOutputPath(target);
    await rename(temp, target);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
