// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { imageURL } from './plugins.js';
import type { TimelineDocument } from './core.js';
let assets: Record<string, string> = {};
let offline = false;
export function configureImages(value?: Record<string, string> | null, localOnly = false) {
  assets = value ?? {};
  offline = localOnly;
}
export function imageSource(url: string | null): string | null {
  return url ? (assets[url] ?? (offline ? null : url)) : null;
}
export function imagesOffline() {
  return offline;
}
/** Copy public CORS-readable icons as raster data; never called with networking in the standalone build. */
export async function embedImages(
  document: TimelineDocument,
  localOnly: boolean,
): Promise<TimelineDocument> {
  const fields = (document.plugins ?? []).flatMap((p) =>
    p.manifest.fields.filter((f) => f.kind === 'image-url').map((f) => f.metadataKey),
  );
  const urls = new Set<string>();
  for (const e of document.events) {
    const entries = [
      e.metadata,
      ...Object.values(e.metadata)
        .filter(Array.isArray)
        .flatMap((items) => items.map((i) => i?.metadata ?? {})),
    ];
    for (const m of entries)
      for (const key of fields) {
        const url = imageURL(m[key]);
        if (url) urls.add(url);
      }
  }
  const result: Record<string, string> = {};
  let total = 0;
  for (const url of urls) {
    const data = document.assets?.[url];
    if (data) {
      result[url] = data;
      total += data.length;
    }
  }
  if (!localOnly) {
    const queue = [...urls].filter((url) => !result[url]).slice(0, 64),
      deadline = Date.now() + 6000;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (queue.length && Date.now() < deadline) {
          const url = queue.shift()!;
          const data = await new Promise<string | null>((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.referrerPolicy = 'no-referrer';
            const finish = (data: string | null) => {
              clearTimeout(timer);
              img.onload = img.onerror = null;
              resolve(data);
            };
            const timer = setTimeout(() => finish(null), 1500);
            img.onerror = () => finish(null);
            img.onload = () => {
              try {
                const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
                const canvas = documentCanvas();
                canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
                canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
                canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
                finish(canvas.toDataURL('image/png'));
              } catch {
                finish(null);
              }
            };
            img.src = url;
          });
          if (
            data &&
            data.length <= 2097152 &&
            total + data.length <= 8388608 &&
            Object.keys(result).length < 200
          ) {
            result[url] = data;
            total += data.length;
          }
        }
      }),
    );
  }
  const { assets: previous, ...withoutAssets } = document;
  return { ...withoutAssets, ...(Object.keys(result).length ? { assets: result } : {}) };
}
function documentCanvas() {
  return window.document.createElement('canvas');
}
