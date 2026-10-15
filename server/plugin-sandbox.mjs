// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Compiles plugin scripts in a sandbox (#157). The server never runs plugin code: plugins run
 * in the browser. It compiles the scripts it is given, to refuse ones that do not compile, and
 * only here: in worker threads that hold nothing but the compiler (dist/plugin-compile-
 * worker.mjs, built from src/plugin-compile-worker.mjs), with an empty environment, under
 * limits on memory and stack, and stopped past a time limit. A worker that exceeds a limit is
 * discarded and replaced; the request's thread is never affected.
 *
 * The compiler is itself bounded (16 KiB of source, 4,096 tokens, 1,024 expression nodes), so
 * no script reaches these limits; they hold whatever the compiler does.
 */
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/** How long one script may take to compile, in milliseconds. */
export const COMPILE_TIME = 2000;
/** Each worker's memory and stack, in MiB. */
export const COMPILE_LIMITS = {
  maxOldGenerationSizeMb: 64,
  maxYoungGenerationSizeMb: 16,
  codeRangeSizeMb: 16,
  stackSizeMb: 4,
};
/** How many scripts' results are remembered (by hash of their source). */
const REMEMBERED = 1000;
const message = {
  time: 'The plugin script took too long to compile.',
  memory: 'The plugin script needed too much memory to compile.',
  failed: 'The plugin script could not be compiled.',
};
/** The worker script: in the application's dist directory, like its static files. */
const compilerFile = () =>
  resolve(process.env.OCH_APP_ROOT ?? process.cwd(), 'dist', 'plugin-compile-worker.mjs');

/**
 * A compiler of plugin scripts: `check(source)` resolves when the script compiles and rejects
 * with the reason when it does not. At most `workers` scripts compile at once; others wait.
 * `file` is the worker script (tests substitute their own).
 */
export function createPluginCompiler({
  file = compilerFile(),
  timeLimit = COMPILE_TIME,
  resourceLimits = COMPILE_LIMITS,
  workers = 2,
} = {}) {
  const results = new Map(),
    idle = [],
    waiting = [];
  let live = 0,
    next = 0,
    closed = false;
  function spawn() {
    live++;
    const worker = new Worker(file, {
      env: {},
      argv: [],
      execArgv: [],
      resourceLimits,
      stdout: true,
      stderr: true,
    });
    worker.unref();
    // The job it is compiling: { id, finish(error, broken) }.
    worker.job = null;
    worker.on('message', (reply) => {
      if (worker.job?.id === reply?.id) worker.job.finish(reply.error ?? null, false);
    });
    worker.on('error', (error) => {
      if (error?.code !== 'ERR_WORKER_OUT_OF_MEMORY')
        console.error('The plugin compiler failed:', error);
      worker.job?.finish(
        error?.code === 'ERR_WORKER_OUT_OF_MEMORY' ? message.memory : message.failed,
        true,
      );
      discard(worker);
    });
    worker.on('exit', () => {
      worker.job?.finish(message.failed, true);
      discard(worker);
    });
    return worker;
  }
  function discard(worker) {
    if (worker.discarded) return;
    worker.discarded = true;
    live--;
    const at = idle.indexOf(worker);
    if (at >= 0) idle.splice(at, 1);
    void worker.terminate();
    // A job waiting for a worker gets a new one.
    if (waiting.length && !closed) waiting.shift()(spawn());
  }
  function acquire() {
    if (idle.length) return Promise.resolve(idle.pop());
    if (live < workers) return Promise.resolve(spawn());
    return new Promise((give) => waiting.push(give));
  }
  function release(worker) {
    if (worker.discarded) return;
    if (waiting.length) waiting.shift()(worker);
    else idle.push(worker);
  }
  /** Compiles `source` in a worker: null when it compiles, else why not (and whether to retry). */
  async function compile(source) {
    const worker = await acquire();
    return new Promise((done) => {
      const id = ++next;
      // A worker that is compiling keeps the process alive until it answers or is stopped.
      worker.ref();
      const timer = setTimeout(() => worker.job?.finish(message.time, true), timeLimit);
      worker.job = {
        id,
        finish(error, broken) {
          if (worker.job?.id !== id) return;
          worker.job = null;
          clearTimeout(timer);
          worker.unref();
          if (broken) discard(worker);
          else release(worker);
          done({ error, broken });
        },
      };
      worker.postMessage({ id, source });
    });
  }
  return {
    async check(source) {
      if (closed) throw new Error('The plugin compiler is closed.');
      const key = createHash('sha256').update(source).digest('base64');
      let result = results.get(key);
      if (!result) {
        result = compile(source);
        results.set(key, result);
        if (results.size > REMEMBERED) results.delete(results.keys().next().value);
      }
      const { error, broken } = await result;
      // A stopped worker may have been unlucky (a busy server); the next check tries again.
      if (broken) results.delete(key);
      if (error) throw new Error(error);
    },
    /** Stops its workers. */
    async close() {
      closed = true;
      await Promise.all([...idle].map((worker) => discard(worker)));
    },
  };
}

let shared = null;
/** The server's compiler, started on first use. */
export function pluginCompiler() {
  return (shared ??= createPluginCompiler());
}
