// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { REPORT_CATEGORIES, REPORT_TEXT } from '../../server/report-categories.mjs';
const CATEGORY = Object.fromEntries(REPORT_CATEGORIES);
const KIND = {
  timeline: 'Timeline',
  comment: 'Comment',
  plugin: 'Plugin',
  suite: 'Plugin suite',
  user: 'Account',
};
/** What restricting each kind of thing does (server/moderation.mjs). */
const EFFECT = {
  timeline: 'Restricting makes it private: only its owner and administrators can open it.',
  comment: 'Restricting hides its text from everyone.',
  plugin: 'Restricting removes it from the library and refuses new versions.',
  suite: 'Restricting removes it from the library and refuses new versions.',
  user: 'Restricting suspends the account, ending its sessions and API keys.',
};
const when = (time) => new Date(time).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
/**
 * One case in the review queue (#115): what was reported, the reports, and the decisions open
 * to an administrator. `decide(action, reason)` sends one.
 */
export function ReportCase({ item, busy, decide }) {
  const appealing = item.status === 'restricted' && item.appealed_at && !item.appeal_decided_at;
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
                dismissed: 'Dismissed',
                lifted: 'Restricted, then lifted',
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
        </>
      )}
      {item.status === 'restricted' && (
        <div className="actions">
          {appealing && (
            <button disabled={busy} onClick={() => decide('uphold')}>
              Keep the restriction
            </button>
          )}
          <button disabled={busy} onClick={() => decide('lift')}>
            Lift the restriction
          </button>
        </div>
      )}
    </article>
  );
}
