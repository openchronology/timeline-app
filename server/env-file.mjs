// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Reads a KEY=value configuration file (#118) as systemd's EnvironmentFile and Docker Compose
 * read it, so every reader of /etc/openchronology/openchronology.env (or .env) agrees:
 *
 *   - `#` or `;` begins a comment only at the start of a line. A `#` inside a value is part of
 *     it: ADMIN_INITIAL_PASSWORD=abc#def is "abc#def". (Node's own --env-file and
 *     process.loadEnvFile end the value at the `#`, so passwords containing one were cut short.)
 *   - Whitespace around the value is dropped; a value in matching quotes keeps everything
 *     inside them, with \" \\ \n \t escapes in double quotes.
 *   - A line ending in a backslash continues on the next.
 *   - `export KEY=value` is accepted.
 */
import { readFileSync } from 'node:fs';

const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ESCAPES = { n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\', $: '$', '`': '`' };

/** The settings in a configuration file's text, in order. */
export function parseEnvFile(text) {
  const result = {};
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    while (line.endsWith('\\') && i + 1 < lines.length) line = line.slice(0, -1) + lines[++i];
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;
    const equals = trimmed.indexOf('=');
    if (equals < 0) continue;
    const key = trimmed
      .slice(0, equals)
      .replace(/^export\s+/, '')
      .trim();
    if (!KEY.test(key)) continue;
    result[key] = value(trimmed.slice(equals + 1).trim());
  }
  return result;
}
function value(text) {
  const quote = text[0];
  if ((quote === '"' || quote === "'") && text.length >= 2 && text.endsWith(quote)) {
    const inner = text.slice(1, -1);
    return quote === "'" ? inner : inner.replace(/\\(.)/g, (m, c) => ESCAPES[c] ?? m);
  }
  return text;
}
/**
 * Loads a configuration file into the environment, without overriding what is set already
 * (systemd, a shell or Compose may have). Returns false when the file does not exist.
 */
export function loadEnvFile(path, env = process.env) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  for (const [key, setting] of Object.entries(parseEnvFile(text))) env[key] ??= setting;
  return true;
}
/** Loads the file OCH_CONFIG names, as the packages' commands pass it. */
export function loadConfiguration(env = process.env) {
  if (env.OCH_CONFIG && !loadEnvFile(env.OCH_CONFIG, env))
    throw new Error(`The configuration ${env.OCH_CONFIG} does not exist.`);
}
