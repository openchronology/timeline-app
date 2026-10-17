// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// One case in the administrators' report queue (#115): what was reported and why, and the
// decisions that can be taken on it.
import { REPORT_CATEGORIES, REPORT_TEXT } from '../../server/report-categories.mjs';
import { CONTENT_LABELS, describeLabels } from '../../src/content-labels.ts';
/** Each report category's name, by its key. */
const CATEGORY = Object.fromEntries(REPORT_CATEGORIES);
/** What each kind of reported thing is called. */
const KIND = {
  timeline: 'Timeline',
  comment: 'Comment',
  plugin: 'Plugin',
  suite: 'Plugin suite',
  user: 'Account',
};
/** What restricting each kind of thing does (server/moderation.mjs). */
const EFFECT = {
  timeline:
    'Restricting makes it private: only its owner and administrators can open it. Labelling warns readers before it opens and blurs its images; its owner cannot remove the labels.',
  comment: 'Restricting hides its text from everyone.',
  plugin: 'Restricting removes it from the library and refuses new versions.',
  suite: 'Restricting removes it from the library and refuses new versions.',
  user: 'Restricting suspends the account, ending its sessions and API keys.',
};
/** A time to the minute, in UTC, so every administrator reads the same one. */
const when = (time) => new Date(time).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
/**
 * One case in the review queue (#115): what was reported, the reports, and the decisions open
 * to an administrator. `decide(action, reason)` sends one.
 *
 * An open case can be restricted, dismissed or, for a timeline, labelled; a decision in force
 * can be lifted, or upheld when its owner asked for a review. The server checks each of these
 * again (server/moderation.mjs), under a lock, so two administrators can't both decide a case.
 *
 * @param {object} props
 * @param {object} props.item a case from GET /api/admin/reports: its target (`target_kind`,
 *   `target`, `path`, null once the target is gone, and `owner`), `status` (open, restricted,
 *   labelled, dismissed or lifted), its `reports`, the decision (`reason`, `labels`,
 *   `decided_at`) and any review the owner asked for (`appeal`, `appealed_at`,
 *   `appeal_outcome`, `appeal_decided_at`)
 * @param {boolean} props.busy a change is being sent: the buttons wait
 * @param {(action: string, reason?: string, labels?: string[]) => void} props.decide sends a
 *   decision (the page adds the confirmation password and code)
 */
export function ReportCase({ item, busy, decide }) {
  // The owner asked for a review of the decision, and no administrator has answered it yet.
  const appealing = item.status === 'restricted' && item.appealed_at && !item.appeal_decided_at;
  // The reason and labels are uncontrolled fields, read from the page when a button is pressed.
  const reason = () => document.getElementById('reason-' + item.id)?.value ?? '';
  return (
    <article className="timeline-card report-case">
      <h2>
        {KIND[item.target_kind]}:{' '}
        {item.path ? (
          <a href={item.path}>{item.target?.title || 'Untitled'}</a>
        ) : (
          <span className="muted">no longer exists</span>
        )}
        {item.urgent && <span className="badge danger"> Urgent</span>}
      </h2>
      {item.target_kind === 'comment' && item.target?.text && (
        <blockquote className="preserve-text">{item.target.text}</blockquote>
      )}
      <p className="muted">
        {item.owner ? '@' + item.owner : 'No owner'} · {item.report_count} report
        {item.report_count === 1 ? '' : 's'} · opened {when(item.created_at)}
      </p>
      <ul className="report-list">
        {item.reports.map((r, i) => (
          <li key={i}>
            <strong>{CATEGORY[r.category] ?? r.category}</strong>
            {/* A report about one moment or duration of a timeline links to its page. */}
            {r.entity_id && (
              <>
                {' '}
                ·{' '}
                <a href={`${item.path}/${r.entity_kind}s/${encodeURIComponent(r.entity_id)}`}>
                  {r.entity_kind} {r.entity_id}
                </a>
              </>
            )}{' '}
            · {r.reporter ? '@' + r.reporter : 'signed out'} · {when(r.created_at)}
            {r.details && <p className="preserve-text">{r.details}</p>}
          </li>
        ))}
      </ul>
      {item.status !== 'open' && (
        <p>
          <strong>
            {
              {
                restricted: 'Restricted',
                labelled: `Labelled: ${describeLabels(item.labels ?? []).toLowerCase()}`,
                dismissed: 'Dismissed',
                // A lifted case keeps the labels it had, which tells a lifted label from a
                // lifted restriction.
                lifted: item.labels ? 'Labelled, then lifted' : 'Restricted, then lifted',
              }[item.status]
            }
          </strong>
          {item.decided_at && ` ${when(item.decided_at)}`}
          {item.reason && (
            <>
              : <span className="preserve-text">{item.reason}</span>
            </>
          )}
        </p>
      )}
      {item.appealed_at && (
        <p>
          <strong>Review requested {when(item.appealed_at)}:</strong>{' '}
          <span className="preserve-text">{item.appeal}</span>
          {item.appeal_outcome && ` (${item.appeal_outcome})`}
        </p>
      )}
      {item.status === 'open' && (
        <>
          <label>
            Reason, sent to the owner if you restrict (a note on the record if you dismiss)
            <textarea id={'reason-' + item.id} rows={3} maxLength={REPORT_TEXT} />
          </label>
          <p className="field-hint">{EFFECT[item.target_kind]}</p>
          <div className="actions">
            {/* Nothing is left to restrict once the target is gone; it can still be dismissed. */}
            <button
              className="danger"
              disabled={busy || !item.path}
              onClick={() => decide('restrict', reason())}
            >
              Restrict
            </button>
            <button disabled={busy} onClick={() => decide('dismiss', reason())}>
              Dismiss
            </button>
          </div>
          {item.target_kind === 'timeline' && item.path && (
            <fieldset className="report-labels" id={'labels-' + item.id}>
              <legend>Or label it as containing</legend>
              {CONTENT_LABELS.map(([key, name]) => (
                <label key={key} className="checkbox-label">
                  <input type="checkbox" value={key} />
                  {name}
                </label>
              ))}
              <button
                disabled={busy}
                onClick={() =>
                  decide(
                    'label',
                    reason(),
                    [
                      ...document.querySelectorAll(`#labels-${CSS.escape(item.id)} input:checked`),
                    ].map((box) => box.value),
                  )
                }
              >
                Label
              </button>
            </fieldset>
          )}
        </>
      )}
      {(item.status === 'restricted' || item.status === 'labelled') && (
        <div className="actions">
          {appealing && (
            <button disabled={busy} onClick={() => decide('uphold')}>
              {item.status === 'labelled' ? 'Keep the labels' : 'Keep the restriction'}
            </button>
          )}
          <button disabled={busy} onClick={() => decide('lift')}>
            {item.status === 'labelled' ? 'Remove the labels' : 'Lift the restriction'}
          </button>
        </div>
      )}
    </article>
  );
}
