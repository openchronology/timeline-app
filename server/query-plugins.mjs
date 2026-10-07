// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { validateInstalledPlugins } from '../dist/core.mjs';
import { HttpError } from './store.mjs';
/** A read-only comparison may project the union of eight ordinary 32-plugin documents. */
export function queryPlugins(value) {
  if (
    !Array.isArray(value) ||
    value.length > 256 ||
    Buffer.byteLength(JSON.stringify(value)) > 1048576
  )
    throw new HttpError(400, 'Comparison plugin projection exceeds its budget.');
  try {
    const plugins = value.map((plugin) => validateInstalledPlugins([plugin])[0]);
    if (new Set(plugins.map((plugin) => plugin.manifest.id)).size !== plugins.length)
      throw new Error('Duplicate plugin IDs.');
    return plugins;
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}
