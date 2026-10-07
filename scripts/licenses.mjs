// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve from the package that declares the dependency. pnpm does not hoist
// fraction.js to this application's node_modules directory.
const mapEntry = import.meta.resolve('rational-ordered-map');
const fractionEntry = createRequire(mapEntry).resolve('fraction.js');

async function licenseAt(name, entry) {
  let directory = dirname(entry);
  while (true) {
    try {
      const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      if (manifest.name === name)
        return `${name}/LICENSE\n\n${await readFile(join(directory, 'LICENSE'), 'utf8')}`;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Cannot find license for ${name}`);
    directory = parent;
  }
}

export function dependencyLicenses() {
  return Promise.all([
    licenseAt('rational-ordered-map', fileURLToPath(mapEntry)),
    licenseAt('fraction.js', fractionEntry),
  ]);
}
