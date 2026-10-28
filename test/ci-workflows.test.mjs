// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The CI workflows and the Docker builds they run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// The Playwright image (#351): its browsers are the ones the playwright package drives, so the
// image's version is the package's.
test("every Playwright image is the playwright package's version", async () => {
  const { devDependencies, dependencies } = JSON.parse(await readFile('package.json', 'utf8'));
  const version = devDependencies?.playwright ?? dependencies?.playwright;
  const images = [];
  for (const name of await readdir('.github/workflows')) {
    const text = await readFile(`.github/workflows/${name}`, 'utf8');
    for (const [, tag] of text.matchAll(/mcr\.microsoft\.com\/playwright:v([\w.-]+)/g))
      images.push({ name, tag });
  }
  assert(images.length > 0, 'the browser jobs run in the Playwright image');
  for (const { name, tag } of images) assert.equal(tag, `${version}-noble`, name);
});

// The server packages' builds (#367): a stalled mirror fails a download in seconds and is
// retried, and a hung step fails in minutes instead of holding the runner for the job's limit.
const dockerfiles = async () => {
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(path);
      else if (/^Dockerfile/.test(entry.name)) files.push(path);
    }
  };
  await walk('deploy');
  return files;
};
// Each stage's name, parent (an earlier stage or an image) and commands.
const stages = (text) =>
  text
    .split(/^(?=FROM )/m)
    .filter((part) => part.startsWith('FROM '))
    .map((part) => {
      const [, parent, name] = part.match(/^FROM\s+(\S+)(?:\s+AS\s+(\S+))?/i);
      return { name, parent, body: part };
    });
// Whether a stage, or a stage it starts from, configures the package manager before it runs.
const configures = (all, stage, config, use) => {
  for (let s = stage; s; s = all.find((t) => t.name && t.name === s.parent)) {
    const at = s.body.search(config);
    if (at >= 0 && (s !== stage || at < stage.body.search(use))) return true;
  }
  return false;
};

test('every Dockerfile stage that runs apt gives it retries and a timeout', async () => {
  let checked = 0;
  for (const file of await dockerfiles()) {
    const all = stages(await readFile(file, 'utf8'));
    for (const stage of all) {
      if (!/apt-get/.test(stage.body)) continue;
      checked++;
      const label = `${file}: FROM ${stage.parent}${stage.name ? ' AS ' + stage.name : ''}`;
      assert(configures(all, stage, /Acquire::Retries "3"/, /apt-get/), `${label}: retries`);
      assert(configures(all, stage, /Acquire::http::Timeout "30"/, /apt-get/), `${label}: timeout`);
      assert(configures(all, stage, /Acquire::https::Timeout "30"/, /apt-get/), label);
    }
  }
  assert(checked >= 8, `apt runs in ${checked} stages`);
});

test('every Dockerfile stage that runs dnf gives it retries and a timeout', async () => {
  let checked = 0;
  for (const file of await dockerfiles()) {
    const all = stages(await readFile(file, 'utf8'));
    for (const stage of all) {
      if (!/\bdnf (-y )?install/.test(stage.body)) continue;
      checked++;
      const config = /a retries=3\\ntimeout=30' \/etc\/dnf\/dnf\.conf/;
      assert(configures(all, stage, config, /dnf (-y )?install/), `${file}: ${stage.name}`);
    }
  }
  assert(checked >= 2, `dnf runs in ${checked} stages`);
});

test('every download with curl in a Dockerfile retries and gives up on a stall', async () => {
  let checked = 0;
  for (const file of await dockerfiles()) {
    const all = stages(await readFile(file, 'utf8'));
    for (const stage of all) {
      for (const [call] of stage.body.matchAll(/\bcurl -[^\n]*/g)) {
        checked++;
        const flags =
          /--retry 3/.test(call) && /--speed-limit/.test(call) && /--max-time/.test(call);
        const curlrc = configures(
          all,
          stage,
          /speed-limit = 1024\\nspeed-time = 30\\nmax-time = 180/,
          /\bcurl -/,
        );
        assert(flags || curlrc, `${file}: ${call}`);
      }
    }
  }
  assert(checked >= 7, `curl runs ${checked} times`);
});

test('the server packages build and install with their own time limits', async () => {
  const text = await readFile('.github/workflows/server-packages.yml', 'utf8');
  // A step runs from its "- " to the next step or job.
  const steps = text.split(/\n(?=\s*- (?:name|uses|run):)/);
  for (const name of [
    'Build the package',
    'Install, run, upgrade and remove it in a fresh container',
  ]) {
    const step = steps.find((s) => s.trim().startsWith(`- name: ${name}\n`));
    assert(step, name);
    const minutes = Number(step.match(/^\s+timeout-minutes: (\d+)$/m)?.[1]);
    assert(minutes > 0 && minutes <= 20, `${name}: timeout-minutes ${minutes}`);
  }
  assert.match(
    await readFile('scripts/server-package.mjs', 'utf8'),
    /'--progress=plain'/,
    'docker build prints its progress',
  );
});

// The Node.js tarball the .deb and .rpm packages bundle (#369): downloaded once per job outside
// Docker, cached by version, and given to the build, which still checks it.
const workflowSteps = async (file) => {
  const text = await readFile(file, 'utf8');
  return text.split(/\n(?=\s*- (?:name|uses|run):)/);
};

test('the server packages cache the Node.js tarball and give it to the build', async () => {
  const steps = await workflowSteps('.github/workflows/server-packages.yml');
  const at = (pattern) => steps.findIndex((s) => pattern.test(s));
  const version = at(/run: node scripts\/node-tarball\.mjs --print >> "\$GITHUB_OUTPUT"/);
  const cache = at(/uses: actions\/cache@[0-9a-f]{40} # v\d/);
  const download = at(/run: node scripts\/node-tarball\.mjs "\$RUNNER_TEMP\/node-tarball"/);
  const build = at(/- name: Build the package\n/);
  assert(version >= 0, 'a step reads the Node.js version');
  assert(cache > version, 'the cache follows the version');
  assert(download > cache, 'the download follows the cache');
  assert(build > download, 'the build follows the download');
  // Keyed on the version and architecture the Dockerfiles pin, not a version of its own.
  assert.match(
    steps[cache],
    /key: node-tarball-v\$\{\{ steps\.node-runtime\.outputs\.version \}\}-\$\{\{ steps\.node-runtime\.outputs\.arch \}\}/,
  );
  assert.match(steps[cache], /path: \$\{\{ runner\.temp \}\}\/node-tarball\n/);
  assert.match(steps[download], /if: steps\.node-cache\.outputs\.cache-hit != 'true'/);
  const minutes = Number(steps[download].match(/^\s+timeout-minutes: (\d+)$/m)?.[1]);
  assert(minutes > 0 && minutes <= 5, `the download's timeout-minutes ${minutes}`);
  assert.match(
    steps[build],
    /OCH_NODE_TARBALL: \$\{\{ runner\.temp \}\}\/node-tarball\/\$\{\{ steps\.node-runtime\.outputs\.tarball \}\}/,
  );
  assert.match(
    await readFile('scripts/server-package.mjs', 'utf8'),
    /'--build-context', `node-tarball=\$\{dirname\(nodeTarball\)\}`/,
  );
  const { nodeRuntime } = await import('../scripts/server-targets.mjs');
  const workflow = await readFile('.github/workflows/server-packages.yml', 'utf8');
  for (const own of ['nodejs.org/dist', nodeRuntime().version])
    assert(!workflow.includes(own), `the workflow names no Node.js ${own} of its own`);
});

test('the Node.js version comes from the Dockerfiles, which agree', async () => {
  const { nodeRuntime } = await import('../scripts/server-targets.mjs');
  const runtime = nodeRuntime();
  assert.match(runtime.version, /^\d+\.\d+\.\d+$/);
  assert.match(runtime.sha256, /^[0-9a-f]{64}$/);
  assert.equal(runtime.tarball, `node-v${runtime.version}-linux-x64.tar.xz`);
  for (const file of ['deploy/debian-server/Dockerfile', 'deploy/rpm-server/Dockerfile'])
    assert.deepEqual(nodeRuntime(await readFile(file, 'utf8')), runtime, file);
  // The Windows installer bundles the same release (its zip has its own checksum).
  assert.match(
    await readFile('deploy/windows-server/build.ps1', 'utf8'),
    new RegExp(`nodejs\\.org/dist/v${runtime.version}/node-v${runtime.version}-win-x64\\.zip`),
  );
});

test('the package Dockerfiles check the Node.js tarball, given or downloaded', async () => {
  for (const file of ['deploy/debian-server/Dockerfile', 'deploy/rpm-server/Dockerfile']) {
    const all = stages(await readFile(file, 'utf8'));
    const given = all.find((s) => s.name === 'node-tarball');
    assert.equal(given?.parent, 'scratch', `${file}: an empty node-tarball stage by default`);
    const install = all
      .find((s) => s.name === 'package')
      .body.split(/\n(?=RUN )/)
      .find((run) => /node\.tar\.xz/.test(run));
    assert(install, `${file}: the package stage installs Node.js`);
    assert.match(install, /--mount=type=bind,from=node-tarball,target=\/node-tarball/, file);
    assert.match(install, /set -eu;/, `${file}: a failed step fails the build`);
    // Both branches write node.tar.xz, and the one check after them covers either.
    const branches = install.match(
      /if \[ -f "\/node-tarball\/\$tarball" \]; then([\s\S]*?)else([\s\S]*?)fi;([\s\S]*)/,
    );
    assert(branches, `${file}: the given tarball, else a download`);
    const [, ifGiven, ifNot, after] = branches;
    assert.match(ifGiven, /cp "\/node-tarball\/\$tarball" node\.tar\.xz/, file);
    assert.match(ifNot, /curl -fsSL "https:\/\/nodejs\.org\/dist\/[^"]+" -o node\.tar\.xz/, file);
    assert.match(after, /^[\s\\]*echo "\$\{NODE_SHA256\}  node\.tar\.xz" \| sha256sum -c -;/, file);
    assert(after.indexOf('sha256sum -c') < after.indexOf('tar -xJf'), `${file}: checked first`);
  }
});
