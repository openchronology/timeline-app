// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { buildHtml } from '../scripts/html.mjs';

test('editor and community controllers find their required elements in every shipped template', async () => {
  const required = new Set();
  for (const path of ['src/app.ts', 'src/community-ui.ts']) {
    const source = ts.createSourceFile(
      path,
      await readFile(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    function visit(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ['el', 'input', 'text'].includes(node.expression.text) &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        required.add(node.arguments[0].text);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  for (const path of ['src/index.html', 'dist/index.html', 'dist/openchronology-offline.html']) {
    const html = await readFile(path, 'utf8');
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    const available = new Set(ids);
    assert.equal(available.size, ids.length, `Duplicate IDs in ${path}`);
    assert.deepEqual(
      [...required].filter((id) => !available.has(id)),
      [],
      `Missing controller elements in ${path}`,
    );
  }
});

test('development template rebuild keeps current markup and legal notices in the served HTML', async () => {
  await buildHtml();
  const html = await readFile('dist/index.html', 'utf8');
  assert(html.includes('id="pull-button"') && html.includes('id="propose-button"'));
  assert(html.includes('© 2026 Athan Clark'));
  assert(!html.includes('<!-- OPENCHRONOLOGY_LEGAL -->'));
});
