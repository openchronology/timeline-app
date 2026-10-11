// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Viewport windows of server timelines kept across page loads, so that reopening a timeline
 * shows its last views without asking the server. A record holds one window of one
 * timeline revision, keyed by scope (server and user), timeline, revision, plugins and the
 * window itself: a revision's windows never change, so restored ones are exact. Saving
 * writes only new windows and deletes those the page released or that belong to an older
 * revision; past the stored budget or the keeping time, the least recently saved windows of
 * other timelines go first. The policy is plain data here; the page stores it in IndexedDB.
 */
import type { StoredWindow } from './remote-cache.js';

/** Windows of all timelines together, and how long an unsaved window is kept. */
export const STORED_BYTES = 64 * 1024 * 1024;
export const KEEP_FOR = 30 * 24 * 3600 * 1000;
const SEPARATOR = '\u0001';

/** A short, stable digest of a text (53-bit cyrb53), to key a plugin set without storing it. */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef,
    h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
/** Server origin and user ("guest" when signed out): whose windows these are. */
export function storeScope(origin: string, user: string | null): string {
  return origin + SEPARATOR + (user ?? 'guest');
}
/** Every revision of a timeline, for forgetting it. */
export function timelinePrefix(scope: string, timeline: string): string {
  return [scope, timeline, ''].join(SEPARATOR);
}
/** One revision of a timeline with one plugin set: the windows that may be restored together. */
export function versionPrefix(
  scope: string,
  timeline: string,
  revision: string,
  plugins: string,
): string {
  return [scope, timeline, revision, plugins, ''].join(SEPARATOR);
}
export function windowKey(prefix: string, w: StoredWindow): string {
  return prefix + [w.threshold, w.lower, w.upper].join(SEPARATOR);
}
/** A stored window's size and when it was saved, without its contents. */
export interface Catalogued {
  key: string;
  bytes: number;
  saved: number;
}
export interface SavePlan {
  put: { key: string; value: StoredWindow; bytes: number }[];
  remove: string[];
}
/**
 * What to write for a timeline's cached windows: windows not stored yet, and the removal of
 * this timeline's other stored windows (released by the page, or of other revisions or
 * plugins). Then, over the budget or past the keeping time, other stored windows from the
 * least recently saved. The windows being saved are never removed.
 */
export function planSave(
  catalog: readonly Catalogued[],
  timeline: string,
  version: string,
  windows: readonly StoredWindow[],
  now: number,
  budget = STORED_BYTES,
  keepFor = KEEP_FOR,
): SavePlan {
  const current = new Map(windows.map((w) => [windowKey(version, w), w]));
  const stored = new Set(catalog.map((c) => c.key));
  const put = [...current]
    .filter(([key]) => !stored.has(key))
    .map(([key, value]) => ({ key, value, bytes: JSON.stringify(value.frame).length * 2 }));
  const remove = new Set(
    catalog.filter((c) => c.key.startsWith(timeline) && !current.has(c.key)).map((c) => c.key),
  );
  for (const c of catalog) if (now - c.saved > keepFor && !current.has(c.key)) remove.add(c.key);
  let total =
    put.reduce((sum, p) => sum + p.bytes, 0) +
    catalog.filter((c) => !remove.has(c.key)).reduce((sum, c) => sum + c.bytes, 0);
  for (const c of [...catalog].sort((a, b) => a.saved - b.saved)) {
    if (total <= budget) break;
    if (remove.has(c.key) || current.has(c.key)) continue;
    remove.add(c.key);
    total -= c.bytes;
  }
  return { put, remove: [...remove] };
}

/** IndexedDB storage of the windows ("windows") and their sizes ("catalog"). */
export class WindowStore {
  private db?: Promise<IDBDatabase>;
  constructor(private name = 'openchronology-viewports') {}
  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => {
        for (const store of ['windows', 'catalog']) request.result.createObjectStore(store);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      this.db = undefined;
      throw error;
    });
    return this.db;
  }
  private async run<T>(
    mode: IDBTransactionMode,
    work: (tx: IDBTransaction) => () => T,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(['windows', 'catalog'], mode);
      const result = work(tx);
      tx.oncomplete = () => resolve(result());
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  }
  /** The stored windows of one timeline revision. */
  load(version: string): Promise<StoredWindow[]> {
    return this.run('readonly', (tx) => {
      const request = tx.objectStore('windows').getAll(IDBKeyRange.bound(version, version + '￿'));
      return () => request.result as StoredWindow[];
    });
  }
  /** Stores a timeline revision's cached windows (see planSave); returns the plan applied. */
  async save(timeline: string, version: string, windows: readonly StoredWindow[]) {
    const catalog = await this.run('readonly', (tx) => {
      const store = tx.objectStore('catalog'),
        keys = store.getAllKeys(),
        values = store.getAll();
      return () =>
        (keys.result as string[]).map((key, i) => ({
          key,
          ...(values.result[i] as { bytes: number; saved: number }),
        }));
    });
    const now = Date.now(),
      plan = planSave(catalog, timeline, version, windows, now);
    if (!plan.put.length && !plan.remove.length) return plan;
    await this.run('readwrite', (tx) => {
      const store = tx.objectStore('windows'),
        sizes = tx.objectStore('catalog');
      for (const key of plan.remove) {
        store.delete(key);
        sizes.delete(key);
      }
      for (const { key, value, bytes } of plan.put) {
        store.put(value, key);
        sizes.put({ bytes, saved: now }, key);
      }
      return () => undefined;
    });
    return plan;
  }
  /** Deletes every stored window under a prefix (a scope, timeline or revision). */
  forget(prefix: string): Promise<void> {
    return this.run('readwrite', (tx) => {
      const range = IDBKeyRange.bound(prefix, prefix + '￿');
      tx.objectStore('windows').delete(range);
      tx.objectStore('catalog').delete(range);
      return () => undefined;
    });
  }
  clear(): Promise<void> {
    return this.run('readwrite', (tx) => {
      tx.objectStore('windows').clear();
      tx.objectStore('catalog').clear();
      return () => undefined;
    });
  }
}
