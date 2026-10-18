// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// One set of words (#187): the editor's sharing dialog says what the website's settings say,
// and points in time are "moments" wherever people read about them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import ts from 'typescript';
import {
  ADD_COLLABORATOR,
  REBASE_PULL_REQUEST,
  ROLE_OPTIONS,
  SAVE_TO_SERVER,
  VISIBILITY_OPTIONS,
  momentsText,
} from '../dist/core.mjs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const markup = read('src/index.html');
const words = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
/** The options of the editor's <select id="…">, as [value, text]. */
const options = (id) =>
  [
    ...new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)</select`)
      .exec(markup)[1]
      .matchAll(/<option value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/g),
  ].map(([, value, text]) => [value, words(text)]);

test('the editor’s sharing dialog uses the website’s words', () => {
  assert.deepEqual(options('visibility'), VISIBILITY_OPTIONS);
  assert.deepEqual(options('member-role'), ROLE_OPTIONS);
  assert.match(
    markup,
    new RegExp(`<form id="member-form">[\\s\\S]*?>${ADD_COLLABORATOR}</button>`),
  );
  assert.match(markup, new RegExp(`<button id="pull-rebase">${REBASE_PULL_REQUEST}</button`));
  assert.match(markup, new RegExp(`<button id="publish-button"[^>]*>${SAVE_TO_SERVER}</button>`));
  assert.equal(momentsText(1), '1 moment');
  assert.equal(momentsText(3n), '3 moments');
});

test('what people read calls a moment or a duration an event (#209)', () => {
  // "Events (moments and durations)" explains the word; a count names each kind on purpose.
  const allowed = [/[Ee]vents \(moments? (and|or) durations?\)/, /\$\{|…/];
  const found = [];
  const visible = (text, where) => {
    const plain = text.replace(/\s+/g, ' ').trim();
    if (
      /\b(moments? (and|or) durations?|durations? (and|or) moments?)\b/i.test(plain) &&
      !allowed.some((a) => a.test(plain))
    )
      found.push(`${where}: ${plain.slice(0, 120)}`);
  };
  // The editor's markup: text between tags, and labels, titles and placeholders.
  for (const [, text] of markup.matchAll(/>([^<>]+)</g)) visible(text, 'src/index.html');
  for (const [, text] of markup.matchAll(/(?:aria-label|title|placeholder)="([^"]+)"/g))
    visible(text, 'src/index.html');
  // Strings and JSX text that read as words (with a space), in the editor and the website.
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(new URL('../' + dir, import.meta.url))) {
      const path = `${dir}/${name}`;
      if (statSync(new URL('../' + path, import.meta.url)).isDirectory()) walk(path);
      else if (/\.(ts|jsx)$/.test(name)) files.push(path);
    }
  };
  for (const dir of ['src', 'platform/app', 'platform/components', 'platform/lib']) walk(dir);
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      read(file),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.jsx') ? ts.ScriptKind.JSX : ts.ScriptKind.TS,
    );
    const visit = (node) => {
      if (ts.isJsxText(node)) visible(node.text, file);
      else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (/[A-Z]\w* |\w \w/.test(node.text) || /^[+＋] ?[A-Z]/.test(node.text))
          visible(node.text, file);
      } else if (ts.isTemplateExpression(node)) {
        const text = [node.head, ...node.templateSpans.map((s) => s.literal)]
          .map((part) => part.text)
          .join(' … ');
        if (/\w \w/.test(text)) visible(text, file);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(found, []);
});
