// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The CI workflows' Playwright image (#351): its browsers are the ones the playwright package
// drives, so the image's version is the package's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

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
