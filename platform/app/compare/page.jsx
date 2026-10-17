// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Comparing timelines at /compare?timelines=<id>,<id>…: two or more, up to the account's
// limit, in one editor.
import Editor from '../../components/editor.jsx';
import { accountCompareLimit, currentSession } from '../../lib/session.js';
export const dynamic = 'force-dynamic';
export default async function ComparePage({ searchParams }) {
  const query = await searchParams;
  const ids = [...new Set((typeof query.timelines === 'string' ? query.timelines : '').split(','))];
  const current = await currentSession(),
    limit = accountCompareLimit(current);
  if (
    ids.length < 2 ||
    ids.length > limit ||
    ids.some((id) => !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))
  )
    return (
      <main className="platform">
        <h1>Compare timelines</h1>
        <p>
          Select two to {limit} timelines in the <a href="/">timeline browser</a>
          {!current.user && limit < 8 ? '; signed in, you can compare up to 8' : ''}.
        </p>
      </main>
    );
  return (
    <main className="editor-page">
      <Editor comparisonIds={ids} />
    </main>
  );
}
