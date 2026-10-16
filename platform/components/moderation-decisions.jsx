// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { REPORT_TEXT } from '../../server/report-categories.mjs';
import { describeLabels } from '../../src/content-labels.ts';
const KIND = {
  timeline: 'Your timeline',
  comment: 'Your comment',
  plugin: 'Your plugin',
  suite: 'Your plugin suite',
  user: 'Your account',
};
const day = (time) => new Date(time).toISOString().slice(0, 10);
/**
 * Moderation decisions on what the signed-in account owns (#115; server/moderation.mjs): why
 * each was made, and the one request for a review each allows. Shown only when there are any.
 */
export default function ModerationDecisions({ session }) {
  const [decisions, setDecisions] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    api('moderation')
      .then((result) => active && setDecisions(result.decisions))
      .catch((failure) => active && setError(failure.message));
    return () => {
      active = false;
    };
  }, [reload]);
  async function appeal(event, id) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api(`moderation/${id}/appeal`, {
        method: 'POST',
        csrf: session.csrf,
        data: { appeal: new FormData(event.currentTarget).get('appeal') },
      });
      setReload((n) => n + 1);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  if (!decisions?.length && !error) return null;
  return (
    <section id="moderation">
      <h2>Moderation decisions</h2>
      <p className="muted">
        The site’s administrators restricted or labelled these after reports. You can ask once for
        each to be reviewed.
      </p>
      {decisions?.map((d) => (
        <article className="timeline-card" key={d.id}>
          <h3>
            {KIND[d.target_kind]}
            {d.target?.title && d.target_kind !== 'user' && (
              <> {d.path ? <a href={d.path}>{d.target.title}</a> : `“${d.target.title}”`}</>
            )}
          </h3>
          <p>
            {d.status === 'labelled'
              ? `Labelled as containing ${describeLabels(d.labels ?? []).toLowerCase()}`
              : d.status === 'lifted'
                ? d.labels
                  ? 'Labelled, then lifted'
                  : 'Restricted, then lifted'
                : 'Restricted'}{' '}
            on {day(d.decided_at)}
            {d.reason && (
              <>
                : <span className="preserve-text">{d.reason}</span>
              </>
            )}
          </p>
          {d.appealed_at ? (
            <p className="muted">
              You asked for a review on {day(d.appealed_at)}.{' '}
              {d.appeal_outcome === 'upheld'
                ? 'The administrators kept the restriction.'
                : d.appeal_outcome === 'lifted'
                  ? 'The administrators lifted the restriction.'
                  : 'It awaits a decision.'}
            </p>
          ) : (
            d.status !== 'lifted' && (
              <form onSubmit={(event) => appeal(event, d.id)}>
                <label>
                  Why should this be reviewed?
                  <textarea name="appeal" rows={3} maxLength={REPORT_TEXT} required />
                </label>
                <button disabled={busy}>Ask for a review</button>
              </form>
            )
          )}
        </article>
      ))}
      <p className="error" role="alert">
        {error}
      </p>
    </section>
  );
}
