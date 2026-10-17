// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The editor at /editor: a new (?new=1), sample (?demo=dense), forked (?fork=) or browser
// draft (?draft=) timeline, with the tour on ?tour=1.
import Editor from '../../components/editor.jsx';
export const dynamic = 'force-dynamic';
export default async function EditorPage({ searchParams }) {
  const query = await searchParams;
  const forkId =
    typeof query.fork === 'string' &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(query.fork)
      ? query.fork
      : undefined;
  return (
    <main className="editor-page">
      <Editor
        sample={query.demo === 'dense'}
        fresh={query.new === '1' || !!forkId}
        forkId={forkId}
        tour={query.tour === '1'}
        draft={
          typeof query.draft === 'string' && /^[a-z0-9-]{1,64}$/.test(query.draft)
            ? query.draft
            : undefined
        }
      />
    </main>
  );
}
