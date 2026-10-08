// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
export const BROWSER_COPY_MAX_BYTES = 4 * 1024 * 1024;
export const BROWSER_COPY_MAX_EVENTS = 5000;
/** Stack cards and durations also consume UI memory even though they do not add axis points. */
export function browserEntryCount(document: {
  events: { metadata: Record<string, unknown> }[];
  durations?: readonly unknown[];
  plugins?: readonly { manifest: { fields: readonly { kind: string; metadataKey: string }[] } }[];
}): number {
  const keys = new Set([
    'stack',
    ...(document.plugins ?? []).flatMap((p) =>
      p.manifest.fields.filter((f) => f.kind === 'stack').map((f) => f.metadataKey),
    ),
  ]);
  let count = document.events.length + (document.durations?.length ?? 0);
  for (const event of document.events) {
    for (const key of keys) {
      const entries = event.metadata[key];
      if (Array.isArray(entries)) count += entries.length;
    }
    if (count > BROWSER_COPY_MAX_EVENTS) break;
  }
  return count;
}
/** Cap the response stream before parsing JSON, including chunked responses. */
export async function boundedJSON(
  response: Response,
  maximum = BROWSER_COPY_MAX_BYTES,
): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The browser copy response is empty.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    if (Number(response.headers.get('content-length')) > maximum)
      throw new Error('Browser copy exceeds the 4 MiB download limit.');
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximum) throw new Error('Browser copy exceeds the 4 MiB download limit.');
      chunks.push(value);
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(buffer));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
