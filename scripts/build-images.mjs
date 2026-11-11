// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Prebuilt images of the server packages' tools stages (#605): the system packages and Rust
// that the .deb and .rpm Dockerfiles' native-tools and package-tools stages install, built from
// those stages and published to GitHub's container registry, so a package build doesn't depend
// on the distributions' mirrors. An image's tag is a hash of its stages (and the stage they start
// from), the target's base image and PostgreSQL version, so a changed stage never uses an old
// image: scripts/server-package.mjs builds the stage itself until one is published.
//
//   node scripts/build-images.mjs [--push] [--stage native-tools|package-tools] [target ...]
//
// Without --push the images are loaded into the local Docker. With --push (build-images.yml)
// they are pushed, and with one target and stage the image's name and digest are written to
// $GITHUB_OUTPUT for its attestation. OCH_TOOL_IMAGES names another repository.
import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, appendFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serverTargets } from './server-targets.mjs';

/** Where the images are published. */
export const TOOL_IMAGES = 'ghcr.io/openchronology/server-build';
/** The tools stages, by the Dockerfile argument that replaces each with an image. */
export const TOOL_STAGES = { 'native-tools': 'NATIVE_TOOLS', 'package-tools': 'PACKAGE_TOOLS' };
/** The targets built from a Dockerfile with tools stages: the .deb and .rpm ones. */
export const toolTargets = () =>
  Object.keys(serverTargets).filter((name) => ['deb', 'rpm'].includes(serverTargets[name].format));
export const dockerfileOf = (target) =>
  target.format === 'rpm' ? 'deploy/rpm-server/Dockerfile' : 'deploy/debian-server/Dockerfile';

/** A Dockerfile's stages by name, each its text from its FROM line to the next. */
export function dockerStages(text) {
  const stages = new Map();
  let name = '';
  let lines = [];
  for (const line of text.split('\n')) {
    const from = /^FROM\s+\S+(?:\s+AS\s+(\S+))?\s*$/i.exec(line);
    if (from) {
      stages.set(name, lines.join('\n'));
      name = from[1] || `stage-${stages.size}`;
      lines = [];
    }
    lines.push(line);
  }
  stages.set(name, lines.join('\n'));
  return stages;
}

/** The hash a tools stage's image is tagged with: its stage and `base`, and the target's base and PostgreSQL. */
export function toolStageKey(dockerfile, stage, target) {
  const stages = dockerStages(dockerfile);
  if (!stages.has(stage) || !stages.has('base'))
    throw new Error(`The Dockerfile has no ${stage} stage`);
  return createHash('sha256')
    .update(
      JSON.stringify({
        base: target.base,
        pg: target.pg ?? null,
        stages: [stages.get('base'), stages.get(stage)],
      }),
    )
    .digest('hex')
    .slice(0, 16);
}

/** A target's tools stage image, as tagged for its Dockerfile. */
export async function toolImage(name, stage, repo = TOOL_IMAGES) {
  const target = serverTargets[name];
  const dockerfile = await readFile(dockerfileOf(target), 'utf8');
  return `${repo}:${name}-${stage}-${toolStageKey(dockerfile, stage, target)}`;
}

/** The build arguments every build of a target's Dockerfile takes. */
export function targetArgs(target) {
  return [
    '--build-arg',
    `BASE=${target.base}`,
    ...(target.format === 'deb' ? ['--build-arg', `PG_MAJOR=${target.pg}`] : []),
    // OCH_UBUNTU_MIRROR: an Ubuntu archive mirror closer than archive.ubuntu.com.
    ...(target.format === 'deb' && process.env.OCH_UBUNTU_MIRROR
      ? ['--build-arg', `UBUNTU_MIRROR=${process.env.OCH_UBUNTU_MIRROR}`]
      : []),
  ];
}

/** An image's digest in its registry, or null when it isn't published (or can't be reached). */
export function publishedDigest(ref) {
  return new Promise((done) => {
    execFile(
      'docker',
      ['buildx', 'imagetools', 'inspect', ref, '--format', '{{json .Manifest}}'],
      { timeout: 60_000 },
      (error, stdout) => {
        if (error) return done(null);
        try {
          const digest = JSON.parse(stdout).digest;
          done(/^sha256:[0-9a-f]{64}$/.test(digest) ? digest : null);
        } catch {
          done(null);
        }
      },
    );
  });
}

/**
 * The build arguments that give a target's build its published tools images, pinned by digest,
 * for scripts/server-package.mjs. A stage without one is built as before. OCH_TOOL_IMAGES=off
 * builds every stage; another value names a different repository.
 */
export async function prebuiltToolArgs(name) {
  const repo = process.env.OCH_TOOL_IMAGES || TOOL_IMAGES;
  if (repo === 'off') return [];
  const args = [];
  for (const [stage, arg] of Object.entries(TOOL_STAGES)) {
    const ref = await toolImage(name, stage, repo);
    const digest = await publishedDigest(ref);
    if (digest) {
      console.log(`Using the published ${ref}@${digest}`);
      args.push('--build-arg', `${arg}=${ref}@${digest}`);
    } else console.log(`No published ${ref}: building the ${stage} stage`);
  }
  return args;
}

const run = (command, args) =>
  new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', fail);
    child.on('exit', (code) =>
      code === 0 ? done() : fail(new Error(`${command} ${args[0]} ${args[1]} failed`)),
    );
  });

async function main(argv) {
  const push = argv.includes('--push');
  const at = argv.indexOf('--stage');
  const stages = at >= 0 ? [argv[at + 1]] : Object.keys(TOOL_STAGES);
  const names = argv.filter((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1));
  for (const stage of stages) if (!TOOL_STAGES[stage]) throw new Error(`Unknown stage ${stage}`);
  for (const name of names)
    if (!toolTargets().includes(name)) throw new Error(`${name} has no tools images`);
  const built = [];
  for (const name of names.length ? names : toolTargets()) {
    const target = serverTargets[name];
    for (const stage of stages) {
      const ref = await toolImage(name, stage, process.env.OCH_TOOL_IMAGES || TOOL_IMAGES);
      console.log(`Building ${ref}`);
      const dir = await mkdtemp(join(tmpdir(), 'och-image-'));
      const metadata = join(dir, 'metadata.json');
      try {
        await run('docker', [
          'buildx',
          'build',
          '--progress=plain',
          '--file',
          dockerfileOf(target),
          '--target',
          stage,
          ...targetArgs(target),
          '--label',
          'org.opencontainers.image.source=https://github.com/openchronology/timeline-app',
          '--label',
          `org.opencontainers.image.description=OpenChronology's ${name} server package ${stage} (scripts/build-images.mjs)`,
          '--tag',
          ref,
          '--metadata-file',
          metadata,
          push ? '--push' : '--load',
          '.',
        ]);
        const digest = JSON.parse(await readFile(metadata, 'utf8'))['containerimage.digest'];
        console.log(`Built ${ref}${digest ? `@${digest}` : ''}`);
        built.push({ ref, digest });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  }
  if (push && built.length === 1 && process.env.GITHUB_OUTPUT) {
    const [{ ref, digest }] = built;
    await appendFile(process.env.GITHUB_OUTPUT, `image=${ref.split(':')[0]}\ndigest=${digest}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
