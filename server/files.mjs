// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// SQLite .och file exchange: converts timelines to and from OpenChronology's SQLite file
// format by running the native och-convert binary (native-store/), at most two at a time.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { HttpError } from './store.mjs';
import { mebibytes, timelineFileBytes } from './limits.mjs';
import { validateDocument } from '../dist/core.mjs';
export class TimelineFiles {
  /**
   * `limit`: the largest .och file read or written, in bytes (TIMELINE_FILE_BYTES; #202),
   * which och-convert also applies to its input and output.
   */
  constructor(
    binary = process.env.OCH_CONVERTER ?? resolve('native-store/target/release/och-convert'),
    limit = timelineFileBytes(),
  ) {
    this.binary = binary;
    this.enabled = existsSync(binary);
    this.active = 0;
    this.limit = limit;
  }
  /**
   * The HttpError for a failed conversion, saying which limit stopped it (#202): its time
   * (Node's timeout, or SIGXCPU from its CPU limit), the file size (SIGXFSZ from its output
   * limit, its input refused, or output past maxBuffer), or its memory (a failed allocation
   * aborts it). Anything else is a file it could not read or a document it refused.
   */
  failure(operation, error, stderr) {
    const size =
      operation === 'write'
        ? `SQLite export exceeds ${mebibytes(this.limit)}.`
        : `Timeline exceeds the ${mebibytes(this.limit)} file limit.`;
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return new HttpError(413, size);
    if (error.killed || error.signal === 'SIGXCPU' || error.signal === 'SIGKILL')
      return new HttpError(422, 'Timeline conversion exceeded its time limit.');
    if (error.signal === 'SIGXFSZ' || /exceeds conversion limit/.test(stderr))
      return new HttpError(413, size);
    if (error.signal === 'SIGABRT' || /memory allocation/.test(stderr))
      return new HttpError(413, 'Timeline conversion exceeded its memory limit.');
    return new HttpError(400, 'Invalid or unsupported timeline file.');
  }
  async convert(operation, input) {
    if (!this.enabled)
      throw new HttpError(503, 'SQLite file exchange is not configured on this server.');
    if (this.active >= 2) throw new HttpError(503, 'File conversion is busy. Try again shortly.');
    this.active++;
    let directory;
    try {
      directory = await mkdtemp(join(tmpdir(), 'openchronology-convert-'));
      const path = join(directory, 'timeline.och');
      if (operation === 'read') {
        if (input.length > this.limit)
          throw new HttpError(413, `SQLite upload exceeds ${mebibytes(this.limit)}.`);
        if (!input.subarray(0, 16).equals(Buffer.from('SQLite format 3\0')))
          throw new HttpError(400, 'Expected an OpenChronology SQLite .och file.');
        await writeFile(path, input, { mode: 0o600 });
      }
      const stdout = await new Promise((resolve, reject) => {
        const child = execFile(
          this.binary,
          [operation, path],
          {
            timeout: 20000,
            // A document read from a file is about as large as the file, or smaller.
            maxBuffer: 2 * this.limit,
            encoding: 'buffer',
            env: {
              PATH: process.env.PATH,
              OCH_CONVERSION_LIMITS: '1',
              OCH_FILE_BYTES: String(this.limit),
            },
          },
          (error, stdout, stderr) =>
            error ? reject(this.failure(operation, error, String(stderr ?? ''))) : resolve(stdout),
        );
        child.stdin.on('error', () => {});
        child.stdin.end(operation === 'write' ? JSON.stringify(input) : undefined);
      });
      if (operation === 'read') return validateDocument(JSON.parse(stdout.toString()));
      if ((await stat(path)).size > this.limit)
        throw new HttpError(413, `SQLite export exceeds ${mebibytes(this.limit)}.`);
      return await readFile(path);
    } finally {
      this.active--;
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  }
}
