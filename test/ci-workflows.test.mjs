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
