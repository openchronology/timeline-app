// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// The timelines this account started in this browser and hasn't saved to the server (#188):
// each kept until it is saved or deleted, and opened in the editor at /editor?draft=….
import { useEffect, useState } from 'react';
import { deleteDraft, listDrafts } from '../../src/draft-store.ts';
import { momentsText } from '../../src/wording.ts';
export default function BrowserDrafts({ userId }) {
  const [drafts, setDrafts] = useState([]);
  const refresh = () =>
    listDrafts(userId)
      .then(setDrafts)
      .catch(() => setDrafts([]));
  useEffect(() => {
    void refresh();
  }, [userId]);
  if (!drafts.length) return null;
  return (
    <section id="dashboard-drafts">
      <h2>Drafts in this browser</h2>
      <p className="muted">
        Timelines you started here and haven’t saved to the server. Each stays in this browser until
        you save it to the server or delete it.
      </p>
      <div className="timeline-grid">
        {drafts.map((draft) => (
          <article className="timeline-card" key={draft.id} data-draft={draft.id}>
            <h3>
              <a href={'/editor?draft=' + encodeURIComponent(draft.id)}>
                {draft.title || 'Untitled timeline'}
              </a>
            </h3>
            <p className="muted">
              {momentsText(draft.moments)}
              {draft.updated && ` · edited ${new Date(draft.updated).toLocaleString()}`}
            </p>
            <button
              type="button"
              aria-label={`Delete the draft “${draft.title || 'Untitled timeline'}”`}
              onClick={() => {
                if (!confirm(`Delete the draft “${draft.title || 'Untitled timeline'}” for good?`))
                  return;
                void deleteDraft(draft.id).then(refresh);
              }}
            >
              Delete
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
