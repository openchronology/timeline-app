// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// Reviewing a pull request: its changes and discussion, and merging, closing or rebasing it.
import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../lib/api.js';
import ReportDialog from './report-dialog.jsx';
import {
  changeText,
  exactTimeText,
  movedDurationsText,
  REBASE_PULL_REQUEST,
} from '../../src/wording.ts';
/**
 * A pull request's page (/<owner>/<timeline>/pulls/<id>): what it changes, the buttons the
 * reader may use on it, and its discussion.
 *
 * The page renders it with the pull request and the first page of comments, read on the server
 * (server/collaboration.mjs), and it then talks to /api/timelines/<id>/proposals/<pull>…. The
 * pull request carries what the reader may do (`canMerge`, `canUpdate`, `canClose`, decided by
 * the server from their access and authorship), and the server checks each again.
 *
 * The CSRF token is not given to the page, so each write first reads GET /api/session for it:
 * the API refuses a write on a cookie session without it in X-CSRF-Token.
 *
 * @param {object} props
 * @param {string} props.timelineId the timeline the pull request is for
 * @param {object} props.initial the pull request, as Collaboration.get gives it: its title,
 *   body, author, status, `revision`, `base_revision`, `upstreamRevision` (the timeline's
 *   current one), the source fork if any, `changes` and the reader's permissions
 * @param {{comments: object[], next: string|null}} props.initialComments the first page of
 *   comments and the cursor of the next
 * @param {boolean} props.signedIn whether the reader may comment
 * @param {string} [props.username] the reader's username, so they are not offered to report
 *   their own comments
 */
export default function PullReview({ timelineId, initial, initialComments, signedIn, username }) {
  const router = useRouter(),
    [p, setProposal] = useState(initial),
    [comments, setComments] = useState(initialComments.comments),
    // Where the next page of comments starts, or null when every comment is shown.
    [cursor, setCursor] = useState(initialComments.next),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    // The comment being reported, for the report dialog; null when it is closed.
    [report, setReport] = useState(null);
  // The pull request's API path, under /api/.
  const base = 'timelines/' + timelineId + '/proposals/' + p.id;
  /** Runs one request at a time, showing its failure; a click while one runs is ignored. */
  async function perform(operation) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  /**
   * Merges, rejects, closes or rebases the pull request: POST …/resolve with the action and the
   * revision of the pull request as shown. The server refuses (409) when it changed since, so
   * no one acts on a version they have not seen. The answer is the pull request as it is now,
   * and the page's server-rendered parts are refreshed too.
   * @param {'merge'|'reject'|'close'|'rebase'} action
   */
  async function resolve(action) {
    await perform(async () => {
      const s = await api('session');
      const value = await api(base + '/resolve', {
        method: 'POST',
        csrf: s.csrf,
        data: { action, revision: p.revision },
      });
      setProposal(value);
      router.refresh();
    });
  }
  /** Appends the next page of comments: GET …/comments?after=<cursor>. */
  async function more() {
    await perform(async () => {
      const page = await api(base + '/comments?' + new URLSearchParams({ after: cursor }));
      setComments((v) => [...v, ...page.comments]);
      setCursor(page.next);
    });
  }
  /**
   * Re-pins a fork's pull request to the fork's latest save: PUT … with the pull request's own
   * title and body, its revision (409 if it changed) and the fork's current head revision.
   * A pull request from a fork is pinned to one save, so saving the fork doesn't change it.
   */
  async function updateFromFork() {
    await perform(async () => {
      const s = await api('session');
      const value = await api(base, {
        method: 'PUT',
        csrf: s.csrf,
        data: {
          title: p.title,
          body: p.body,
          revision: p.revision,
          sourceTimelineId: p.source.id,
          sourceRevisionId: p.source.head_revision_id,
        },
      });
      setProposal(value);
      router.refresh();
    });
  }
  /**
   * Posts a comment (POST …/comments), then reads the first page again so the discussion
   * shows it in order with any that others posted meanwhile.
   */
  async function comment(event) {
    event.preventDefault();
    const form = event.currentTarget,
      body = new FormData(form).get('body');
    await perform(async () => {
      const s = await api('session');
      await api(base + '/comments', { method: 'POST', csrf: s.csrf, data: { body } });
      const page = await api(base + '/comments');
      setComments(page.comments);
      setCursor(page.next);
      form.reset();
    });
  }
  // The server summarizes what the pull request changes, with the first entities of each kind.
  // Counts of added, removed and changed moments and durations, added and removed
  // relationships, the names of changed timeline settings, and example moments and durations
  // with their `before` and `after` versions and times as the timeline displays them; and the
  // durations it leaves alone that move with moments it moves (`moved`, #395).
  const { moments, durations, relationships, settings, examples } = p.changes;
  const kinds = [
    ['moment', examples, moments],
    ['duration', p.changes.durationExamples ?? [], durations],
  ];
  return (
    <>
      <h1>{p.title}</h1>
      <p>
        @{p.author} · {p.status} · Base revision {p.base_revision} · Upstream {p.upstreamRevision}
      </p>
      <p className="preserve-text">{p.body}</p>
      {p.from_fork && (
        <p className="muted">
          Pinned fork checkpoint: <code>{p.source_revision_id}</code>. Saving the fork does not
          update this review automatically.
        </p>
      )}
      <section>
        <h2>Changes</h2>
        {p.changes.unavailable && <p className="notice">{p.changes.unavailable}</p>}
        <p>
          {moments.added} added, {moments.removed} removed, {moments.changed} changed moments.
        </p>
        {durations.added + durations.removed + durations.changed > 0 && (
          <p>
            {durations.added} added, {durations.removed} removed, {durations.changed} changed
            durations.
          </p>
        )}
        {durations.moved > 0 && <p>{movedDurationsText(durations.moved)}</p>}
        {relationships.added + relationships.removed > 0 && (
          <p>
            {relationships.added} added, {relationships.removed} removed relationships.
          </p>
        )}
        {settings.map((k) => (
          <p key={k}>Changed timeline {k}.</p>
        ))}
        {['added', 'removed', 'changed', 'moved'].map((change) => (
          <div key={change}>
            {kinds.map(([kind, list, counts]) => {
              const shown = list.filter((e) => e.change === change);
              return (
                <Fragment key={kind}>
                  {shown.map((example) => {
                    const { before, after } = example;
                    const e = after ?? before;
                    return (
                      <details key={e.id}>
                        {/* Its time as the timeline displays it; the exact one on hover. */}
                        <summary title={exactTimeText(example)}>
                          {changeText(example, kind)}
                        </summary>
                        {/* A changed one shows its old version, then its new one. */}
                        {before && after && example.change === 'changed' && (
                          <pre>{JSON.stringify(before, null, 2)}</pre>
                        )}
                        <pre>{JSON.stringify(e, null, 2)}</pre>
                      </details>
                    );
                  })}
                  {(counts[change] ?? 0) > shown.length && (
                    <p>
                      {counts[change] - shown.length} more {change} {kind}s in the proposed
                      timeline.
                    </p>
                  )}
                </Fragment>
              );
            })}
          </div>
        ))}
      </section>
      <div className="actions">
        {/* Offered when the fork was saved since the pull request was pinned to it. */}
        {p.canUpdate &&
          p.source?.canWrite &&
          p.source.head_revision_id !== p.source_revision_id && (
            <button disabled={busy} onClick={updateFromFork}>
              Update from saved fork
            </button>
          )}
        {p.canMerge && (
          <>
            <button disabled={busy} className="primary" onClick={() => resolve('merge')}>
              Merge
            </button>
            <button disabled={busy} onClick={() => resolve('reject')}>
              Reject
            </button>
          </>
        )}
        {p.canClose && (
          <button disabled={busy} onClick={() => resolve('close')}>
            Close
          </button>
        )}
        {/* Offered to the author once the timeline moved on from the pull request's base. */}
        {p.canUpdate && p.base_revision !== p.upstreamRevision && (
          <button disabled={busy} onClick={() => resolve('rebase')}>
            {REBASE_PULL_REQUEST}
          </button>
        )}
      </div>
      <p className="error" role="alert">
        {error}
      </p>
      <section>
        <h2>Discussion</h2>
        {comments.map((c) => (
          <article className="timeline-card" key={c.id}>
            <p>
              @{c.author} ·{' '}
              {new Date(c.created_at).toISOString().replace('T', ' ').replace('Z', ' UTC')}
            </p>
            {c.removed ? (
              <p className="field-hint">Removed by moderators.</p>
            ) : (
              <p className="preserve-text">{c.body}</p>
            )}
            {c.mine && (
              <button
                type="button"
                className="link-button"
                disabled={busy}
                onClick={() =>
                  confirm('Delete your comment? It cannot be restored.') &&
                  void perform(async () => {
                    const s = await api('session');
                    await api(`${base}/comments/${c.id}`, { method: 'DELETE', csrf: s.csrf });
                    setComments((list) => list.filter((other) => other.id !== c.id));
                  })
                }
              >
                Delete
              </button>
            )}{' '}
            {!c.removed && c.author !== username && (
              <button
                type="button"
                className="link-button"
                onClick={() =>
                  setReport({
                    target: { kind: 'comment', id: String(c.id) },
                    title: `Comment by @${c.author}`,
                  })
                }
              >
                Report
              </button>
            )}
          </article>
        ))}
        {cursor && (
          <button disabled={busy} onClick={more}>
            More comments
          </button>
        )}
        {signedIn ? (
          <form onSubmit={comment}>
            <label>
              Add a comment
              <textarea name="body" required maxLength={20000} />
            </label>
            <button disabled={busy}>Comment</button>
          </form>
        ) : (
          <Link href="/login">Sign in to comment</Link>
        )}
      </section>
      <ReportDialog report={report} onClose={() => setReport(null)} />
    </>
  );
}
