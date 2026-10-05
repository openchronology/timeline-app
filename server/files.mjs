import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { HttpError } from './store.mjs';
import { validateDocument } from '../dist/core.mjs';
export class TimelineFiles {
  constructor(binary = process.env.OCH_CONVERTER ?? resolve('native-store/target/release/och-convert')) { this.binary = binary; this.enabled = existsSync(binary); this.active = 0; }
  async convert(operation, input) {
    if (!this.enabled) throw new HttpError(503, 'SQLite file exchange is not configured on this server.');
    if (this.active >= 2) throw new HttpError(503, 'File conversion is busy. Try again shortly.');
    this.active++;
    let directory;
    try {
      directory = await mkdtemp(join(tmpdir(), 'openchronology-convert-'));
      const path = join(directory, 'timeline.och');
      if (operation === 'read') {
        if (input.length > 32 * 1024 * 1024 || !input.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) throw new HttpError(400, 'Expected an OpenChronology SQLite .och file.');
        await writeFile(path, input, { mode: 0o600 });
      }
      const stdout = await new Promise((resolve, reject) => {
        const child = execFile(this.binary, [operation, path], { timeout: 20000, maxBuffer: 32 * 1024 * 1024, encoding: 'buffer', env: { PATH: process.env.PATH, OCH_CONVERSION_LIMITS: '1' } }, (error, stdout) => error ? reject(new HttpError(error.killed ? 422 : 400, error.killed ? 'Timeline conversion exceeded its time limit.' : 'Invalid or unsupported timeline file.')) : resolve(stdout));
        child.stdin.on('error', () => {});
        child.stdin.end(operation === 'write' ? JSON.stringify(input) : undefined);
      });
      if (operation === 'read') return validateDocument(JSON.parse(stdout.toString()));
      if ((await stat(path)).size > 32 * 1024 * 1024) throw new HttpError(413, 'SQLite export exceeds 32 MiB.');
      return await readFile(path);
    } finally { this.active--; if (directory) await rm(directory, { recursive: true, force: true }); }
  }
}
