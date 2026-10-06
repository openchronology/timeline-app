export async function requestApi<T>(
  path: string,
  method = 'GET',
  data?: unknown,
  csrf?: string | null,
): Promise<T> {
  if (window.__TAURI__) {
    const reply = await window.__TAURI__.core.invoke<{
      status: number;
      body: T & { error?: string };
    }>('desktop_request', { path, method, data: data ?? null, csrf: csrf ?? null });
    if (reply.status < 200 || reply.status >= 300)
      throw new Error(reply.body.error ?? 'Request failed.');
    return reply.body;
  }
  const response = await fetch('/api/' + path, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Request failed.');
  return result as T;
}
export async function importSqlite(file: File, csrf?: string | null): Promise<unknown> {
  if (file.size > 32 * 1024 * 1024) throw new Error('SQLite upload exceeds 32 MiB.');
  const response = await fetch('/api/files/import', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/vnd.openchronology.sqlite',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: file,
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? 'File import failed.');
  return value.document;
}
export async function exportSqlite(
  path: string,
  data?: unknown,
  csrf?: string | null,
): Promise<Blob> {
  const response = await fetch('/api/' + path, {
    method: data === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: {
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  if (!response.ok) throw new Error((await response.json()).error ?? 'File export failed.');
  return response.blob();
}
