// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import Editor from '../../components/editor.jsx';
export const dynamic = 'force-dynamic';
export default async function ComparePage({ searchParams }) {
  const query = await searchParams;
  const ids = [...new Set((typeof query.timelines === 'string' ? query.timelines : '').split(','))];
  if (
    ids.length < 2 ||
    ids.length > 8 ||
    ids.some((id) => !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))
  )
    return (
      <main className="platform">
        <h1>Compare timelines</h1>
        <p>
          Select two to eight timelines in the <a href="/">timeline browser</a>.
        </p>
      </main>
    );
  return (
    <main className="editor-page">
      <Editor comparisonIds={ids} />
    </main>
  );
}
