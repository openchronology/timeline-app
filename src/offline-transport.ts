// The single-file build substitutes this module, excluding the HTTP implementation entirely.
export async function requestApi<T>(
  _path: string,
  _method?: string,
  _data?: unknown,
  _csrf?: string | null,
): Promise<T> {
  throw new Error('This offline file uses JSON import and export.');
}
export async function importSqlite(_file: File, _csrf?: string | null): Promise<unknown> {
  throw new Error('This offline file exchanges .ochx JSON timelines only.');
}
export async function exportSqlite(
  _path: string,
  _data?: unknown,
  _csrf?: string | null,
): Promise<Blob> {
  throw new Error('This offline file exchanges .ochx JSON timelines only.');
}
