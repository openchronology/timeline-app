// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Every folder says what is in it (#176): a README.md whose contents table lists exactly the
// folder's files and subfolders (CONTRIBUTING.md for the top level), and every code file
// starts with a synopsis of what it is for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { helpPages } from '../server/help.mjs';

const root = new URL('..', import.meta.url).pathname;
/** The repository's files: tracked, and new ones not ignored. */
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter((file) => file && existsSync(root + file));
/** Folders vendored from elsewhere keep their own documentation. */
const vendored = (path) => /^vendor\/[^/]+\//.test(path + '/');
/** `.github/README.md` would replace the repository's front page on GitHub. */
const excluded = (folder) => vendored(folder) || folder === '.github';
const parent = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.');

/** Each folder's entries: its files and its subfolders. */
const entries = new Map();
const add = (folder, name) => {
  if (!entries.has(folder)) entries.set(folder, new Set());
  entries.get(folder).add(name);
};
for (const file of files) {
  let path = file;
  add(parent(path), path.slice(path.lastIndexOf('/') + 1));
  while (path.includes('/')) {
    const folder = parent(path);
    add(parent(folder), folder.slice(folder.lastIndexOf('/') + 1) + '/');
    path = folder;
  }
}
/** The names a contents table lists: its first column's `name`s. */
function listed(markdown) {
  const table = markdown.split(/^## Contents\s*$/m)[1];
  if (table === undefined) return null;
  return [...table.matchAll(/^\|\s*\[`([^`]+)`\]\([^)]+\)\s*\|\s*(.*?)\s*\|\s*$/gm)].map(
    ([, name, description]) => ({ name, description }),
  );
}

test('every folder has a README whose contents list exactly what is in it', () => {
  const problems = [];
  for (const [folder, names] of entries) {
    if (excluded(folder)) continue;
    const readme = folder === '.' ? 'CONTRIBUTING.md' : `${folder}/README.md`;
    if (!existsSync(root + readme)) {
      problems.push(`${readme} is missing`);
      continue;
    }
    const rows = listed(readFileSync(root + readme, 'utf8'));
    if (!rows) {
      problems.push(`${readme} has no "## Contents" table`);
      continue;
    }
    // A README doesn't list itself; at the top level, CONTRIBUTING.md lists the README.
    const expected = new Set([...names].filter((name) => folder === '.' || name !== 'README.md'));
    const found = new Set(rows.map((row) => row.name));
    for (const name of expected)
      if (!found.has(name)) problems.push(`${readme} leaves out ${name}`);
    for (const name of found)
      if (!expected.has(name)) problems.push(`${readme} lists ${name}, which is not there`);
    for (const row of rows)
      if (row.description.length < 10) problems.push(`${readme}: ${row.name} is not described`);
  }
  assert.deepEqual(problems, []);
});

/** Files that can hold a comment, and so begin with a synopsis. */
const CODE =
  /\.(m?js|cjs|jsx|ts|rs|css|html|sh|ps1|py|ya?ml|toml|sql|rb|spec|service|desktop)$|(^|\/)Dockerfile[^/]*$|(^|\/)\.env(\.\w+)?$/;
const GENERATED = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|Cargo\.lock)$/;
/** The comment text in a file's first lines, without its copyright line and directives. */
function synopsis(source) {
  return source
    .split('\n')
    .slice(0, 25)
    .filter((line) => /^\s*(\/\/|\/?\*|#|<!--|--)/.test(line))
    .map((line) =>
      line.replace(/^\s*(\/\/+!?|\/\*+|\*+\/?|#+|<!--|-->|--)\s?/, '').replace(/-->|\*\/$/, ''),
    )
    .map((line) => line.trim())
    .filter((line) => line && !/Copyright \(c\)|SPDX-License|^!\/|^eslint|^@ts-|^\[/.test(line))
    .join(' ');
}

test('every code file begins with a synopsis of what it is for', () => {
  const missing = files.filter(
    (file) =>
      CODE.test(file) &&
      !GENERATED.test(file) &&
      !vendored(file) &&
      synopsis(readFileSync(root + file, 'utf8')).length < 25,
  );
  assert.deepEqual(missing, [], 'Files without a synopsis in their first lines');
});

test('every link in the READMEs leads to a file, and a doc’s heading, that exist', async () => {
  const pages = await helpPages(root);
  const broken = [];
  for (const readme of files.filter((f) => /(^|\/)README\.md$|^CONTRIBUTING\.md$/.test(f))) {
    if (vendored(parent(readme))) continue;
    for (const [, href] of readFileSync(root + readme, 'utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) continue;
      const [path, anchor] = href.split('#');
      const target = normalize(join(dirname(readme), decodeURIComponent(path)));
      if (!existsSync(root + target)) broken.push(`${readme}: ${href}`);
      const doc = /^docs\/([a-z0-9-]+)\.md$/.exec(target);
      if (anchor && doc && !pages.get(doc[1])?.headings.some((h) => h.id === anchor))
        broken.push(`${readme}: ${href} (no such heading)`);
    }
  }
  assert.deepEqual(broken, []);
});
