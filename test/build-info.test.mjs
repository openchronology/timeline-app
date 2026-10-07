// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildInfo } from '../scripts/build-info.mjs';
test('build identity uses full commits, exact annotated release tags and flags local changes', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'och-build-'));
  const git = (...args) =>
    execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  try {
    git('init', '-b', 'main');
    git('config', 'user.name', 'Build test');
    git('config', 'user.email', 'build@example.invalid');
    await writeFile(join(cwd, 'test.txt'), 'first');
    git('add', 'test.txt');
    git('commit', '-m', 'Initial');
    const commit = git('rev-parse', 'HEAD');
    assert.deepEqual(await buildInfo({ cwd, env: {} }), {
      commit,
      version: '',
      dirty: false,
      label: commit,
    });
    git('tag', '-a', 'v1.2.3', '-m', 'Release');
    assert.equal((await buildInfo({ cwd, env: {} })).label, 'v1.2.3');
    await writeFile(join(cwd, 'test.txt'), 'second');
    assert.equal((await buildInfo({ cwd, env: {} })).label, 'v1.2.3 (modified)');
    git('add', 'test.txt');
    git('commit', '-m', 'Next');
    assert.equal(
      (await buildInfo({ cwd, env: {} })).label,
      git('rev-parse', 'HEAD'),
      'Nearby tags are not this build',
    );
    await writeFile(join(cwd, 'new-source.js'), '// New file');
    assert((await buildInfo({ cwd, env: {} })).dirty);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
test('release overrides and matching source archives retain immutable identity', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'och-archive-'));
  try {
    const env = { OCH_BUILD_COMMIT: 'a'.repeat(40), OCH_BUILD_VERSION: 'v2.0.0' };
    const info = await buildInfo({ cwd, env });
    assert.equal(info.label, 'v2.0.0');
    assert.equal(info.dirty, false);
    await writeFile(join(cwd, 'build-info.json'), JSON.stringify(info));
    assert.deepEqual(await buildInfo({ cwd, env: {} }), info);
    await assert.rejects(buildInfo({ cwd, env: { OCH_BUILD_COMMIT: 'main' } }));
    await assert.rejects(buildInfo({ cwd, env: { OCH_BUILD_VERSION: '<script>' } }));
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
test('both HTML builds include identity and download URLs match runner release assets', async () => {
  const info = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
  for (const file of ['dist/index.html', 'dist/openchronology-offline.html']) {
    const html = await readFile(file, 'utf8');
    assert(html.includes('Build: ' + info.label));
    assert(
      html.includes(
        'https://github.com/openchronology/timeline-app/releases/latest/download/openchronology-offline.html',
      ),
    );
    assert(
      html.includes(
        'https://github.com/openchronology/timeline-app/releases/latest/download/openchronology-desktop-linux-amd64.deb',
      ),
    );
  }
  const { stdout: archive } = await promisify(execFile)(
    'tar',
    ['-xOzf', 'dist/openchronology-web-source.tar.gz', 'openchronology/build-info.json'],
    { encoding: 'utf8' },
  );
  assert.deepEqual(JSON.parse(archive), info);
});
