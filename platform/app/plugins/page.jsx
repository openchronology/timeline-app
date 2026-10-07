// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import Link from 'next/link';
import Form from 'next/form';
import { platformServices } from '../../../server/platform.mjs';
import { createPluginLibrary } from '../../../server/plugins.mjs';
export const dynamic = 'force-dynamic';
export default async function Plugins({ searchParams }) {
  const params = await searchParams;
  const search = typeof params.search === 'string' ? params.search.slice(0, 200) : '';
  const sort = ['popularity', 'alphabetical', 'age'].includes(params.sort)
    ? params.sort
    : 'popularity';
  const page = Math.max(
    1,
    Math.min(10000, Number.isSafeInteger(Number(params.page)) ? Number(params.page) : 1),
  );
  let result, error;
  try {
    const s = await platformServices();
    result = await createPluginLibrary(s.plugins, s.pool).search({ search, page, limit: 12, sort });
  } catch {
    error = 'The plugin library is temporarily unavailable.';
  }
  return (
    <main className="platform">
      <h1>Plugin library</h1>
      <p>
        Official and community plugins add moment icons, colors, shapes, stacks and custom metadata.
        Open a timeline’s Plugins menu to install a definition or publish your own script.
        Definitions travel with timeline exports.
      </p>
      <p className="muted">
        Popularity counts public timelines with the plugin enabled. Age uses first publication;
        bundled official definitions are treated as older.
      </p>
      <Form action="/plugins" className="search-controls">
        <label>
          Search plugins
          <input name="search" maxLength={200} defaultValue={search} />
        </label>
        <label>
          Sort plugins
          <select name="sort" defaultValue={sort}>
            <option value="popularity">By popularity</option>
            <option value="alphabetical">Alphabetical</option>
            <option value="age">Newest first</option>
          </select>
        </label>
        <button>Search</button>
      </Form>
      {error && <p role="status">{error}</p>}
      <div className="timeline-grid">
        {result?.plugins.map((p) => (
          <article className="timeline-card" key={p.id}>
            <h2>{p.name}</h2>
            <p className="muted">
              {p.id} · Version {p.version}
            </p>
            <p>{p.description}</p>
          </article>
        ))}
      </div>
      {result && (
        <nav className="pager" aria-label="Plugin pages">
          {page > 1 && (
            <Link
              href={'/plugins?' + new URLSearchParams({ search, sort, page: String(page - 1) })}
            >
              Previous
            </Link>
          )}
          <span>
            Page {page} of {Math.max(1, result.pages)}
          </span>
          {page < result.pages && (
            <Link
              href={'/plugins?' + new URLSearchParams({ search, sort, page: String(page + 1) })}
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
