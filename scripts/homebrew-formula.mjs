// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Renders the Homebrew formula (deploy/homebrew/openchronology-server.rb.in) for a platform
// archive (#116): releases publish it to openchronology/homebrew-tap; CI installs it from a
// local tap.
// Usage: node scripts/homebrew-formula.mjs --tarball <file> --url <url> [--version <version>]
//          [--out <formula.rb>]
// Without --version: the release tag's (RELEASE_TAG), or this checkout's development version.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs, promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { freebsdVersion, upstreamVersion } from './server-targets.mjs';

const PGMP =
  'https://codeload.github.com/dvarrazzo/pgmp/tar.gz/1849585416f2bc3d070bf8cef6a659907687ec7f';
const { values } = parseArgs({
  options: {
    tarball: { type: 'string' },
    url: { type: 'string' },
    version: { type: 'string' },
    out: { type: 'string' },
  },
});
if (!values.tarball || !values.url) throw new Error('Supply --tarball and --url.');
if (!values.version) {
  const exec = promisify(execFile);
  const git = async (...args) => (await exec('git', args)).stdout.trim();
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  const stamp = await git('show', '-s', '--format=%cd', '--date=format:%Y%m%d%H%M', 'HEAD');
  values.version = freebsdVersion(
    process.env.RELEASE_TAG
      ? upstreamVersion(process.env.RELEASE_TAG)
      : `${version}~dev.${stamp}.${(await git('rev-parse', 'HEAD')).slice(0, 7)}`,
  );
}
if (!/^[0-9][0-9A-Za-z.]*$/.test(values.version))
  throw new Error('A formula version is dotted letters and digits.');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pgmp = await fetch(PGMP);
if (!pgmp.ok) throw new Error(`Downloading pgmp failed: ${pgmp.status}`);
const formula = (await readFile('deploy/homebrew/openchronology-server.rb.in', 'utf8'))
  .replace('@URL@', values.url)
  .replace('@VERSION@', values.version)
  .replace('@SHA256@', sha256(await readFile(values.tarball)))
  .replace('@PGMP_SHA256@', sha256(Buffer.from(await pgmp.arrayBuffer())));
if (values.out) await writeFile(values.out, formula);
else process.stdout.write(formula);
