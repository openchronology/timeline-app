// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The server packages' tools images (scripts/build-images.mjs, #605): an image's tag changes
// with its stage, the stage it starts from and its target, and with nothing else, and each
// .deb and .rpm Dockerfile can take a published image in place of each tools stage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  TOOL_STAGES,
  dockerStages,
  dockerfileOf,
  toolImage,
  toolStageKey,
  toolTargets,
} from '../scripts/build-images.mjs';
import { serverTargets } from '../scripts/server-targets.mjs';

const dockerfile = `ARG BASE=debian
ARG NATIVE_TOOLS=native-tools
FROM \${BASE} AS base
RUN echo retries
FROM base AS native-tools
RUN apt-get install gcc
FROM \${NATIVE_TOOLS} AS native
RUN make
FROM node:24 AS app
RUN npm ci
FROM base AS package-tools
RUN apt-get install curl
FROM scratch AS export
`;
const target = serverTargets.debian13;

test('a Dockerfile splits into its named stages', () => {
  const stages = dockerStages(dockerfile);
  assert.deepEqual(
    [...stages.keys()],
    ['', 'base', 'native-tools', 'native', 'app', 'package-tools', 'export'],
  );
  assert.equal(stages.get('native-tools'), 'FROM base AS native-tools\nRUN apt-get install gcc');
});

test('a tools image tag changes with its stage and the base stage, and nothing else', () => {
  const key = toolStageKey(dockerfile, 'native-tools', target);
  assert.match(key, /^[0-9a-f]{16}$/);
  const edit = (from, to) => toolStageKey(dockerfile.replace(from, to), 'native-tools', target);
  assert.equal(edit('npm ci', 'npm ci --ignore-scripts'), key, 'another stage');
  assert.equal(edit('RUN make', 'RUN make -j4'), key, 'the stage built from it');
  assert.equal(edit('apt-get install curl', 'apt-get install wget'), key, 'the other tools stage');
  assert.notEqual(edit('install gcc', 'install clang'), key, 'its own stage');
  assert.notEqual(edit('echo retries', 'echo retries twice'), key, 'the base stage');
  assert.notEqual(toolStageKey(dockerfile, 'native-tools', { ...target, pg: 16 }), key);
  assert.notEqual(toolStageKey(dockerfile, 'native-tools', serverTargets.fedora44), key);
  assert.throws(() => toolStageKey(dockerfile, 'missing', target), /no missing stage/);
});

test('every .deb and .rpm target has a tools image for each stage', async () => {
  assert.deepEqual(toolTargets(), ['debian13', 'ubuntu24.04', 'rocky10', 'fedora44']);
  const refs = new Set();
  for (const name of toolTargets())
    for (const stage of Object.keys(TOOL_STAGES)) {
      const ref = await toolImage(name, stage);
      assert.match(
        ref,
        new RegExp(`^ghcr\\.io/openchronology/server-build:${name}-${stage}-[0-9a-f]{16}$`),
      );
      refs.add(ref);
    }
  assert.equal(refs.size, 8);
});

test('each Dockerfile builds its tools stages unless given images of them', async () => {
  for (const format of ['deb', 'rpm']) {
    const path = dockerfileOf({ format });
    const text = await readFile(path, 'utf8');
    const stages = dockerStages(text);
    for (const [stage, arg] of Object.entries(TOOL_STAGES)) {
      assert.match(stages.get(''), new RegExp(`^ARG ${arg}=${stage}$`, 'm'), `${path}: ${arg}`);
      assert.match(stages.get(stage), /^FROM base AS /, `${path}: ${stage} starts from base`);
      // The stage that uses it starts from the argument, and no other stage installs packages.
      const user = stage === 'native-tools' ? 'native' : 'package';
      assert.match(stages.get(user), new RegExp(`^FROM \\$\\{${arg}\\} AS ${user}\\n`), path);
      assert.doesNotMatch(stages.get(user), /apt-get|dnf /, `${path}: ${user} installs nothing`);
    }
  }
});

test('the desktop build image is tagged with a hash of its Dockerfile', async () => {
  const { IMAGES, wholeImage } = await import('../scripts/build-images.mjs');
  const { createHash } = await import('node:crypto');
  const { dockerfile } = IMAGES['desktop-build'];
  const hash = createHash('sha256')
    .update(await readFile(dockerfile, 'utf8'))
    .digest('hex')
    .slice(0, 16);
  assert.equal(await wholeImage('desktop-build'), `ghcr.io/openchronology/desktop-build:${hash}`);
});

test('the Linux desktop jobs run in the image only when it is found', async () => {
  const desktop = await readFile('.github/workflows/desktop.yml', 'utf8');
  assert.match(desktop, /--find desktop-build >> "\$GITHUB_OUTPUT"/);
  assert.match(
    desktop,
    /image: \$\{\{ startsWith\(matrix\.target, 'linux-'\) && needs\.image\.outputs\.image \|\| '' \}\}/,
  );
  assert.match(desktop, /if: runner\.os == 'Linux' && !needs\.image\.outputs\.image/);
  const ci = await readFile('.github/workflows/ci.yml', 'utf8');
  assert.match(ci, /image: \$\{\{ needs\.desktop-image\.outputs\.image \}\}/);
  assert.match(ci, /if: \$\{\{ !needs\.desktop-image\.outputs\.image \}\}/);
});
