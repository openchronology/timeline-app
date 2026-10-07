// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
export const releaseVersion =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const exec = promisify(execFile);
export async function buildInfo({
  cwd = process.env.OCH_BUILD_CONTEXT ?? process.cwd(),
  env = process.env,
} = {}) {
  let commit = env.OCH_BUILD_COMMIT || '',
    version = env.OCH_BUILD_VERSION || '',
    dirty = false;
  if (version && !releaseVersion.test(version))
    throw new Error('OCH_BUILD_VERSION must be a version tag, such as v1.2.3');
  if (commit && !/^[a-f0-9]{40,64}$/i.test(commit))
    throw new Error('OCH_BUILD_COMMIT must be a full Git commit hash');
  const git = async (...args) =>
    (await exec('git', ['-c', 'safe.directory=*', '-C', cwd, ...args])).stdout.trim();
  if (!commit) {
    try {
      commit = await git('rev-parse', 'HEAD');
      try {
        const tag = await git('describe', '--tags', '--exact-match', 'HEAD');
        if (!version && releaseVersion.test(tag)) version = tag;
      } catch {}
      dirty = !!(await git('status', '--porcelain', '--untracked-files=normal'));
    } catch {
      // Matching source archives carry their immutable identity without requiring .git.
      try {
        const saved = JSON.parse(await readFile(resolve(cwd, 'build-info.json'), 'utf8'));
        commit = saved.commit ?? '';
        version = version || saved.version || '';
        dirty = !!saved.dirty;
      } catch {}
    }
  }
  if (commit && !/^[a-f0-9]{40,64}$/i.test(commit))
    throw new Error('Invalid archived build commit');
  if (version && !releaseVersion.test(version)) throw new Error('Invalid archived build version');
  return {
    commit,
    version,
    dirty,
    label: (version || commit || 'unversioned source') + (dirty ? ' (modified)' : ''),
  };
}
export async function writeBuildInfo() {
  const info = await buildInfo();
  await mkdir('dist', { recursive: true });
  await writeFile('dist/build-info.json', JSON.stringify(info, null, 2) + '\n');
  return info;
}
