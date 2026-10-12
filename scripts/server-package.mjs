// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Builds the server packages with Docker, into server-artifacts/ as
// openchronology-server-<target>-amd64.<deb|rpm>: .deb from deploy/debian-server, .rpm from
// deploy/rpm-server (#116).
// Usage: node scripts/server-package.mjs [debian13|ubuntu24.04|rocky10|fedora44 ...]
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
  const out = await mkdtemp(join('server-artifacts', '.build-'));
  // Debian: <upstream>-1~deb13, PostgreSQL named by the target. RPM: version <upstream> and
  // release 1.el10, PostgreSQL as the distribution ships it.
  const formatArgs =
    target.format === 'rpm'
      ? [
          '--file',
          'deploy/rpm-server/Dockerfile',
          '--build-arg',
          `RPM_VERSION=${upstream}`,
          '--build-arg',
          `RPM_RELEASE=1.${target.dist}`,
        ]
      : [
          '--file',
          'deploy/debian-server/Dockerfile',
          '--build-arg',
          `PG_MAJOR=${target.pg}`,
          '--build-arg',
          `DEB_VERSION=${upstream}-1~${target.suffix}`,
        ];
  console.log(`Building openchronology-server ${upstream} for ${name} (${target.base})`);
  await new Promise((done, fail) => {
    const build = spawn(
      'docker',
      [
        'buildx',
        'build',
        ...formatArgs,
        '--target',
        'export',
        '--output',
        `type=local,dest=${out}`,
        '--build-arg',
        `BASE=${target.base}`,
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
  // Docker exports the distribution-named file; it is published under the target's asset name.
  const [built] = await readdir(out);
  await rename(join(out, built), join('server-artifacts', serverPackage(name)));
  await rm(out, { recursive: true });
  console.log(`Wrote server-artifacts/${serverPackage(name)} (${built})`);
}
