// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { dismissOnBackdrop } from '../../src/dialogs.ts';
import { REPORT_CATEGORIES, REPORT_TEXT } from '../../server/report-categories.mjs';
/**
 * Reports something to the site's administrators (#115; server/moderation.mjs), signed in or
 * not. `report` is { target, title }: `target` as POST /api/reports takes it ({kind, timeline,
 * id}), `title` what the reader sees it called.
 */
export default function ReportDialog({ report, onClose }) {
  const dialog = useRef(null),
    [category, setCategory] = useState(''),
    [details, setDetails] = useState(''),
    [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [sending, setSending] = useState(false),
    [sent, setSent] = useState(false);
  // Closes with the editor's exit animation, and on a click outside it, like its dialogs.
  useEffect(() => dismissOnBackdrop(dialog.current), []);
  useEffect(() => {
    setCategory('');
    setDetails('');
    setStatus('');
    setError('');
    setSent(false);
    if (report && !dialog.current?.open) dialog.current?.showModal();
    if (!report && dialog.current?.open) dialog.current.close();
  }, [report]);
  async function submit(event) {
    event.preventDefault();
    if (!category) {
      setError('Choose what is wrong.');
      return;
    }
    setSending(true);
    setError('');
    try {
      // Signed out, the session's sign-in token guards the request instead of an account's.
      const { csrf } = await api('session');
      await api('reports', {
        method: 'POST',
        csrf,
        data: { target: report.target, category, details },
      });
      setSent(true);
      setStatus('Thank you. The site’s administrators will review your report.');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSending(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="report-dialog"
      aria-labelledby="report-heading"
      onClose={() => onClose()}
    >
      {report && (
        <form onSubmit={submit}>
          <div className="dialog-heading">
            <h2 id="report-heading">Report</h2>
            <button type="button" aria-label="Close" onClick={() => dialog.current.close()}>
              ×
            </button>
          </div>
          <p className="share-title">{report.title}</p>
          {sent ? (
            <>
              <p role="status">{status}</p>
              <div className="actions">
                <button type="button" onClick={() => dialog.current.close()}>
                  Close
                </button>
              </div>
            </>
          ) : (
            <>
              <fieldset className="report-categories">
                <legend>What is wrong?</legend>
                {REPORT_CATEGORIES.map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="radio"
                      name="report-category"
                      value={key}
                      checked={category === key}
                      onChange={() => {
                        setCategory(key);
                        setError('');
                      }}
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              {category === 'child_abuse' && (
                <p className="field-hint">
                  Do not copy, download or share the material, even to report it. If a child is in
                  immediate danger, contact the police.
                </p>
              )}
              {category === 'copyright' && (
                <p className="field-hint">
                  Rights holders can also send a formal notice as the{' '}
                  <a href="/legal#copyright" target="_top">
                    copyright policy
                  </a>{' '}
                  describes.
                </p>
              )}
              <label>
                Details (optional)
                <textarea
                  rows={4}
                  maxLength={REPORT_TEXT}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="What should the administrators look at, and why?"
                />
              </label>
              <p className="field-hint">
                Reports go to this site’s administrators. The owner is not told who reported it.
              </p>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <div className="actions">
                <button type="button" onClick={() => dialog.current.close()}>
                  Cancel
                </button>
                <button type="submit" className="primary" disabled={sending}>
                  {sending ? 'Sending…' : 'Send report'}
                </button>
              </div>
            </>
          )}
        </form>
      )}
    </dialog>
  );
}
