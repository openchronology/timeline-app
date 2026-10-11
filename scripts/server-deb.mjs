// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Builds the server .deb packages (deploy/debian-server) with Docker, into server-artifacts/
// as openchronology-server-<target>-amd64.deb.
// Usage: node scripts/server-deb.mjs [debian13|ubuntu24.04 ...]
//   RELEASE_TAG=v1.2.3 builds a release version (the checkout must be that tag).
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { releaseVersion } from './build-info.mjs';
import { serverPackage, serverTargets, upstreamVersion } from './server-targets.mjs';

const exec = promisify(execFile);
const chosen = process.argv.slice(2);
for (const name of chosen)
  if (!serverTargets[name])
    throw new Error(`Unknown target ${name}; use ${Object.keys(serverTargets).join(', ')}`);

const git = async (...args) => (await exec('git', args)).stdout.trim();
const commit = await git('rev-parse', 'HEAD');
const tag = process.env.RELEASE_TAG || '';
if (tag) {
  if (!releaseVersion.test(tag)) throw new Error('Invalid release tag');
  if ((await git('rev-parse', tag + '^{commit}')) !== commit)
    throw new Error('The checkout must match the release tag');
}
// Development builds sort before their release and in time order: 0.1.0~dev.20261011.abcdef1.
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const stamp = (await git('show', '-s', '--format=%cd', '--date=format:%Y%m%d%H%M', 'HEAD')).trim();
const upstream = tag ? upstreamVersion(tag) : `${version}~dev.${stamp}.${commit.slice(0, 7)}`;

await mkdir('server-artifacts', { recursive: true });
for (const name of chosen.length ? chosen : Object.keys(serverTargets)) {
  const target = serverTargets[name];
  const debVersion = `${upstream}-1~${target.suffix}`;
  const out = await mkdtemp(join('server-artifacts', '.build-'));
  console.log(
    `Building openchronology-server ${debVersion} (${target.base}, PostgreSQL ${target.pg})`,
  );
  await new Promise((done, fail) => {
    const build = spawn(
      'docker',
      [
        'buildx',
        'build',
        '--file',
        'deploy/debian-server/Dockerfile',
        '--target',
        'export',
        '--output',
        `type=local,dest=${out}`,
        '--build-arg',
        `BASE=${target.base}`,
        '--build-arg',
        `PG_MAJOR=${target.pg}`,
        '--build-arg',
        `DEB_VERSION=${debVersion}`,
        '--build-arg',
        `OCH_BUILD_COMMIT=${commit}`,
        '--build-arg',
        `OCH_BUILD_VERSION=${tag}`,
        '.',
      ],
      { stdio: 'inherit' },
    );
    build.on('error', fail);
    build.on('exit', (code) => (code === 0 ? done() : fail(new Error(`Building ${name} failed`))));
  });
  // Docker exports the Debian-named file; it is published under the target's asset name.
  const [built] = await readdir(out);
  await rename(join(out, built), join('server-artifacts', serverPackage(name)));
  await rm(out, { recursive: true });
  console.log(`Wrote server-artifacts/${serverPackage(name)} (${built})`);
}
