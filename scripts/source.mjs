// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Build from an explicit allowlist: never archive working directories or secrets wholesale.
import { cp, mkdir, mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const desktop = process.argv.includes('--desktop');
const vendorFlag = process.argv.indexOf('--rust-vendor');
const nativeVendor = vendorFlag < 0 ? null : process.argv[vendorFlag + 1];
if (vendorFlag >= 0 && !nativeVendor) throw new Error('--rust-vendor requires a directory');
const temporary = await mkdtemp(join(tmpdir(), 'openchronology-source-'));
const root = join(temporary, 'openchronology');
await mkdir(root);
try {
  for (const name of [
    'src',
    'platform',
    'server',
    'scripts',
    'legal',
    'docs',
    'deploy',
    'native-store',
    'src-tauri',
    'vendor',
    '.github',
    'test',
  ]) {
    await cp(name, join(root, name), {
      recursive: true,
      filter: (path) => {
        // Test artifacts, local databases, compiler outputs, and private configuration do not belong in releases.
        const part = basename(path);
        return (
          !['target', 'node_modules', 'build', '.git', 'artifacts', '.next', 'public'].includes(part) &&
          !part.startsWith('.env') &&
          !/\.(?:och|ochx|sqlite|db)(?:-wal|-shm|-journal)?$/.test(part)
        );
      },
    });
  }
  for (const name of [
    'LICENSE',
    'NOTICE',
    'THIRD_PARTY.md',
    'README.md',
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    '.yarnrc.yml',
    'tsconfig.json',
    'compose.yml',
    '.env.example',
    '.dockerignore',
    '.gitignore',
  ]) {
    try {
      await cp(name, join(root, name));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  // The browser map tarball includes the original TypeScript in its source maps.
  // Include recovered preferred source as well as the original archive and notices.
  const mapEntry = fileURLToPath(import.meta.resolve('rational-ordered-map'));
  const mapDir = dirname(mapEntry);
  const preferred = join(root, 'third-party-source', 'rational-ordered-map', 'src');
  await mkdir(preferred, { recursive: true });
  for (const name of await readdir(mapDir)) {
    if (!name.endsWith('.js.map')) continue;
    const data = JSON.parse(await readFile(join(mapDir, name), 'utf8'));
    if (!data.sourcesContent) throw new Error('Missing preferred source for rational-ordered-map');
    for (let i = 0; i < data.sources.length; i++) {
      if (!data.sources[i].startsWith('../src/') || !data.sources[i].endsWith('.ts'))
        throw new Error('Unexpected source map path');
      await writeFile(join(preferred, basename(data.sources[i])), data.sourcesContent[i]);
    }
  }
  await cp(join(dirname(mapDir), 'LICENSE'), join(dirname(preferred), 'LICENSE'));
  await cp(join(dirname(mapDir), 'package.json'), join(dirname(preferred), 'package.json'));
  await cp(
    'vendor/rational-map-build-support/tsconfig.json',
    join(dirname(preferred), 'tsconfig.json'),
  );
  await cp('vendor/rational-map-build-support/scripts', join(dirname(preferred), 'scripts'), {
    recursive: true,
  });
  await writeFile(
    join(dirname(preferred), 'REBUILD.txt'),
    'Preferred TypeScript sources recovered from the pinned package source maps.\nBuild support is included under the upstream MIT license.\nTo rebuild: npm install --ignore-scripts, then npm run build.\nTo update the application archive: npm pack --ignore-scripts and replace\nvendor/rational-ordered-map-0.1.0.tgz in the OpenChronology source tree.\nUpdate the file dependency lock with your package manager before rebuilding.\n',
  );
  const fractionEntry = createRequire(mapEntry).resolve('fraction.js');
  const fractionRoot = dirname(dirname(fractionEntry));
  // The actual package root contains src/fraction.js (the preferred implementation).
  await cp(fractionRoot, join(root, 'third-party-source', 'fraction.js'), {
    recursive: true,
    filter: (path) => basename(path) !== 'node_modules',
  });
  const copied = new Set();
  async function runtimeSource(name, from) {
    let directory = dirname(from.resolve(name));
    while (true) {
      try {
        const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
        if (pkg.name !== name) throw new Error('Not the package root');
        const key = `${pkg.name.replaceAll('/', '-')}-${pkg.version}`;
        if (copied.has(key)) return;
        copied.add(key);
        await cp(directory, join(root, 'third-party-source', key), {
          recursive: true,
          filter: (path) => basename(path) !== 'node_modules',
        });
        const resolver = createRequire(join(directory, 'package.json'));
        for (const dependency of Object.keys(pkg.dependencies ?? {}))
          await runtimeSource(dependency, resolver);
        for (const dependency of Object.keys(pkg.optionalDependencies ?? {})) {
          try {
            await runtimeSource(dependency, resolver);
          } catch (error) {
            if (error.code !== 'MODULE_NOT_FOUND') throw error;
          }
        }
        return;
      } catch (error) {
        if (error.code !== 'ENOENT' && error.message !== 'Not the package root') throw error;
        const parent = dirname(directory);
        if (parent === directory) throw new Error(`Cannot find source root for ${name}`);
        directory = parent;
      }
    }
  }
  await runtimeSource('pg', createRequire(import.meta.url));
  if (desktop) {
    const destination = join(root, 'rust-dependencies');
    const { stdout } = await exec(
      'cargo',
      [
        'vendor',
        '--locked',
        '--manifest-path',
        'src-tauri/Cargo.toml',
        '--sync',
        'native-store/Cargo.toml',
        destination,
      ],
      { maxBuffer: 8 * 1024 * 1024 },
    );
    await mkdir(join(root, '.cargo'), { recursive: true });
    // cargo config paths are relative to the directory above .cargo.
    await writeFile(
      join(root, '.cargo', 'config.toml'),
      stdout.replaceAll(destination, 'rust-dependencies'),
    );
  } else if (nativeVendor) {
    await cp(nativeVendor, join(root, 'rust-dependencies'), { recursive: true });
    await mkdir(join(root, '.cargo'), { recursive: true });
    await writeFile(
      join(root, '.cargo', 'config.toml'),
      '[source.crates-io]\nreplace-with = "vendored-sources"\n[source.vendored-sources]\ndirectory = "rust-dependencies"\n',
    );
  }
  const description = `OpenChronology source snapshot\nCopyright (c) 2026 Athan Clark. GPL-3.0-only.\n\nThis archive contains first-party source, lockfiles, build and installation scripts,\nvendored SQLite sources, and preferred sources of bundled browser dependencies.\n${desktop ? 'Rust crate sources are included with a cargo vendor configuration.\n' : nativeVendor ? 'Rust crate sources for the native converter are included; desktop packages require their own archive.\n' : 'This web source archive does not include Rust crate sources; use the desktop source archive for compiled native distributions.\n'}Install npm dependencies using npm ci (or the documented pnpm/Yarn alternatives).\nUse npm run build to build web assets. See README.md and docs/licensing.md.\nThird-party sources retain their own copyrights and licenses.\n`;
  await writeFile(join(root, 'SOURCE-README.txt'), description);
  await mkdir('dist', { recursive: true });
  const output = resolve(`dist/openchronology-${desktop ? 'desktop' : 'web'}-source.tar.gz`);
  await exec('tar', ['-czf', output, '-C', temporary, 'openchronology']);
  console.log(`Source snapshot: ${output}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
