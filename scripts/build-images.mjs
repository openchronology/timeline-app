// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Prebuilt images of the server packages' tools stages (#605): the system packages and Rust
// that the .deb and .rpm Dockerfiles' native-tools and package-tools stages install, built from
// those stages and published to GitHub's container registry, so a package build doesn't depend
// on the distributions' mirrors. An image's tag is a hash of its stages (and the stage they start
// from), the target's base image and PostgreSQL version, so a changed stage never uses an old
// image: scripts/server-package.mjs builds the stage itself until one is published.
//
//   node scripts/build-images.mjs [--push] [--stage native-tools|package-tools] [target|image ...]
//   node scripts/build-images.mjs --find desktop-build
//
// It also builds images from a whole Dockerfile (IMAGES): the Linux desktop build image, which
// the desktop jobs run in when --find finds it published, and the PostgreSQL CI image, which
// ci.yml's PostgreSQL job runs in.
// Without --push the images are loaded into the local Docker. With --push (build-images.yml)
// they are pushed, and with one target and stage the image's name and digest are written to
// $GITHUB_OUTPUT for its attestation. OCH_TOOL_IMAGES names another repository.
import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, appendFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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

/**
 * Images built from a whole Dockerfile, its folder the build context, tagged with a hash of the
 * Dockerfile and the other files it copies: the Linux desktop build image (deploy/desktop-build)
 * and the PostgreSQL CI image (deploy/postgres-ci). OCH_DESKTOP_IMAGES and OCH_POSTGRES_IMAGES
 * name other repositories for them.
 */
export const IMAGES = {
  'desktop-build': {
    dockerfile: 'deploy/desktop-build/Dockerfile',
    files: [],
    repo: () => process.env.OCH_DESKTOP_IMAGES || 'ghcr.io/openchronology/desktop-build',
    description: "OpenChronology's Linux desktop build image (scripts/build-images.mjs)",
  },
  'postgres-ci': {
    dockerfile: 'deploy/postgres-ci/Dockerfile',
    files: ['deploy/postgres-ci/och-ci-postgres'],
    repo: () => process.env.OCH_POSTGRES_IMAGES || 'ghcr.io/openchronology/postgres-ci',
    description:
      "OpenChronology's PostgreSQL CI image: PostgreSQL 16 with pgmp (scripts/build-images.mjs)",
  },
};
/** A whole-Dockerfile image's reference, tagged with a hash of its Dockerfile, then its files. */
export async function wholeImage(name) {
  const { dockerfile, files, repo } = IMAGES[name];
  const hash = createHash('sha256');
  for (const file of [dockerfile, ...files]) hash.update(await readFile(file, 'utf8'));
  return `${repo()}:${hash.digest('hex').slice(0, 16)}`;
}
// OCH_UBUNTU_MIRROR: an Ubuntu archive mirror closer than archive.ubuntu.com.
const imageArgs = () =>
  process.env.OCH_UBUNTU_MIRROR
    ? ['--build-arg', `UBUNTU_MIRROR=${process.env.OCH_UBUNTU_MIRROR}`]
    : [];

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

const run = (command, args, stdio = 'inherit') =>
  new Promise((done, fail) => {
    const child = spawn(command, args, { stdio });
    child.on('error', fail);
    child.on('exit', (code) =>
      code === 0 ? done() : fail(new Error(`${command} ${args[0]} ${args[1]} failed`)),
    );
  });

/**
 * Builds one image, loaded into the local Docker or pushed; returns its digest when pushed. With
 * `log` console.error, nothing is written to standard output (--find).
 */
async function buildImage(ref, args, description, push, log = console.log) {
  log(`Building ${ref}`);
  const dir = await mkdtemp(join(tmpdir(), 'och-image-'));
  const metadata = join(dir, 'metadata.json');
  try {
    await run(
      'docker',
      [
        'buildx',
        'build',
        '--progress=plain',
        ...args.slice(0, -1),
        '--label',
        'org.opencontainers.image.source=https://github.com/openchronology/timeline-app',
        '--label',
        `org.opencontainers.image.description=${description}`,
        '--tag',
        ref,
        '--metadata-file',
        metadata,
        push ? '--push' : '--load',
        args.at(-1),
      ],
      log === console.error ? ['ignore', 2, 2] : 'inherit',
    );
    const digest = JSON.parse(await readFile(metadata, 'utf8'))['containerimage.digest'];
    log(`Built ${ref}${digest ? `@${digest}` : ''}`);
    return { ref, digest };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main(argv) {
  const push = argv.includes('--push');
  // --find <image>: the published image's pinned reference as `image=<ref>@<digest>`, or an
  // empty `image=` when there is none, for $GITHUB_OUTPUT (desktop.yml, ci.yml). With --push
  // as well, an image that isn't published is built and pushed first (ci.yml's postgres-image,
  // so a pull request that changes the image tests it).
  const find = argv.indexOf('--find');
  if (find >= 0) {
    const name = argv[find + 1];
    if (!IMAGES[name]) throw new Error(`Unknown image ${name}`);
    const ref = await wholeImage(name);
    let digest = await publishedDigest(ref);
    if (!digest && push) {
      const { dockerfile, description } = IMAGES[name];
      const args = ['--file', dockerfile, ...imageArgs(), dirname(dockerfile)];
      ({ digest } = await buildImage(ref, args, description, true, console.error));
    }
    console.error(digest ? `Using the published ${ref}@${digest}` : `No published ${ref}`);
    console.log(`image=${digest ? `${ref}@${digest}` : ''}`);
    return;
  }
  const at = argv.indexOf('--stage');
  const stages = at >= 0 ? [argv[at + 1]] : Object.keys(TOOL_STAGES);
  const names = argv.filter((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1));
  for (const stage of stages) if (!TOOL_STAGES[stage]) throw new Error(`Unknown stage ${stage}`);
  for (const name of names)
    if (!toolTargets().includes(name) && !IMAGES[name])
      throw new Error(`${name} is neither a server target with tools images nor an image`);
  const built = [];
  for (const name of names.length ? names : [...toolTargets(), ...Object.keys(IMAGES)]) {
    if (IMAGES[name]) {
      const { dockerfile, description } = IMAGES[name];
      const args = ['--file', dockerfile, ...imageArgs(), dirname(dockerfile)];
      built.push(await buildImage(await wholeImage(name), args, description, push));
      continue;
    }
    const target = serverTargets[name];
    for (const stage of stages) {
      const ref = await toolImage(name, stage, process.env.OCH_TOOL_IMAGES || TOOL_IMAGES);
      const args = ['--file', dockerfileOf(target), '--target', stage, ...targetArgs(target), '.'];
      const description = `OpenChronology's ${name} server package ${stage} (scripts/build-images.mjs)`;
      built.push(await buildImage(ref, args, description, push));
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
