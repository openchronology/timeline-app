// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Links to files on a computer (#433): the `file:///` sources the desktop's file populator gives
// each moment. They open only in the desktop app, in the file's own app, and never reach a
// server: the editor leaves them out of everything it sends one (withoutLocalFiles), and the
// server refuses a request carrying one (hasLocalFiles), so local paths, which name the user
// and their folders, are never stored there.

/**
 * Whether a value is a string that looks like a file link (`file://` before anything else; text
 * such as "File: the report" isn't one).
 */
export function isLocalFileLink(value: unknown): value is string {
  return typeof value === 'string' && /^\s*file:\/\//i.test(value);
}
/**
 * A file link as a source may hold one: `file:///…` (or `file://localhost/…`) naming an absolute
 * path, without credentials, at most 4,096 characters; null otherwise.
 */
export function localFileURL(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096 || !isLocalFileLink(value)) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'file:' &&
      (url.hostname === '' || url.hostname === 'localhost') &&
      !url.username &&
      !url.password &&
      url.pathname.length > 1 &&
      url.href.length <= 4096
      ? url.href
      : null;
  } catch {
    return null;
  }
}
/**
 * Photos a thumbnail can be made of (#440), by extension: the desktop's file populator's photos
 * (src-tauri/src/populate.rs).
 */
const PHOTOS = new Set(
  'jpg jpeg heic heif avif png webp tif tiff dng cr2 cr3 nef arw raf orf rw2 iiq'.split(' '),
);
/** The first of a list of sources that is a photo on this computer (#440); null when none is. */
export function localPhoto(value: unknown): string | null {
  for (const item of Array.isArray(value) ? value.slice(0, 100) : []) {
    const url = localFileURL(item);
    const extension = url?.split('.').at(-1)?.toLowerCase();
    if (url && extension && PHOTOS.has(extension)) return url;
  }
  return null;
}
/** The file's name, from the last part of its link's path ("IMG_0042.jpg"). */
export function localFileName(url: string): string {
  const last = new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? url;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
/**
 * `value` (JSON data) without any file link: taken out of lists, and properties that are one
 * left out; and how many were removed. `value` itself is unchanged.
 */
export function withoutLocalFiles<T>(value: T): { value: T; removed: number } {
  let removed = 0;
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v))
      return v.flatMap((item) => (isLocalFileLink(item) ? (removed++, []) : [strip(item)]));
    if (v && typeof v === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(v)) {
        if (isLocalFileLink(item)) removed++;
        else result[key] = strip(item);
      }
      return result;
    }
    return v;
  };
  const stripped = strip(value) as T;
  return removed ? { value: stripped, removed } : { value, removed };
}
/** Whether JSON data holds a file link anywhere. */
export function hasLocalFiles(value: unknown): boolean {
  if (isLocalFileLink(value)) return true;
  if (Array.isArray(value)) return value.some(hasLocalFiles);
  if (value && typeof value === 'object') return Object.values(value).some(hasLocalFiles);
  return false;
}
