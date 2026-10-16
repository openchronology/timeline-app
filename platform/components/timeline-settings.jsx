// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { dismissOnBackdrop } from '../../src/dialogs.ts';
import { CONTENT_LABELS } from '../../src/content-labels.ts';
import { api } from '../lib/api.js';
import { RESERVED_NAMES, slugFromTitle, timelinePath } from '../../src/addresses.ts';
import HelpTip from './help-tip.jsx';
/** A storage size, as the account page writes it. */
const size = (bytes) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(bytes >= 104857600 ? 0 : 1)} MB`
    : `${Math.max(bytes ? 1 : 0, Math.round(bytes / 1024))} KB`;
export default function TimelineSettings({
  initial,
  initialMembers,
  calendar = false,
  listing = null,
  origin = '',
}) {
  const router = useRouter(),
    dialog = useRef(null),
    historyDialog = useRef(null),
    [timeline, setTimeline] = useState(initial),
    [members, setMembers] = useState(initialMembers),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [addressError, setAddressError] = useState('');
  useEffect(() => dismissOnBackdrop(dialog.current), []);
  useEffect(() => dismissOnBackdrop(historyDialog.current), []);
  const base = 'timelines/' + timeline.id;
  async function mutate(path, method, data) {
    if (busy) return;
    setBusy(true);
    setError('');
    setAddressError('');
    try {
      const s = await api('session');
      const value = await api(base + path, { method, csrf: s.csrf, data });
      if (path === '/settings') {
        setTimeline(value);
        historyDialog.current?.close();
      }
      if (path === '/members') setMembers((await api(base + '/members')).members);
      if (path === '') router.replace('/');
      // Its page moves to its new address (#148).
      else if (data && 'slug' in data) router.replace(timelinePath(value) + '/settings');
      else router.refresh();
    } catch (e) {
      (data && 'slug' in data ? setAddressError : setError)(e.message);
    } finally {
      setBusy(false);
    }
  }
  function member(event) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    void mutate('/members', 'POST', { username: f.get('username'), role: f.get('role') });
  }
  return (
    <>
      <h1>Sharing &amp; settings</h1>
      <section>
        <h2>
          Visibility
          <HelpTip topic="sharing#links" about="visibility">
            Private timelines open only for you and those you add. Public ones are for anyone, in
            search and with their saved history.
          </HelpTip>
        </h2>
        <label>
          Who can view this timeline?
          <select
            value={timeline.visibility}
            disabled={busy}
            onChange={(e) => mutate('/settings', 'PATCH', { visibility: e.target.value })}
          >
            <option value="private">Private — invited accounts only</option>
            <option value="public" disabled={timeline.publication_restricted}>
              Public — anyone can view upstream
            </option>
          </select>
        </label>
        <p className="muted">
          Public timelines appear in search and expose their saved history. Signed-in viewers can
          fork and recommend changes; only writers and the owner can change upstream.
        </p>
        {listing && !listing.listed && (
          <p className="muted">
            Browsing lists the public timelines of established accounts. This account becomes
            established once it has a confirmed email (or signs in with Google, GitHub or Facebook)
            and is {listing.fullDays} days old, or {listing.newcomerDays} days old and starred or
            forked by an established account. Until then its public timelines can be opened by link,
            found by search and seen on its profile.
          </p>
        )}
        <p>
          Share: <a href={timelinePath(timeline)}>{origin + timelinePath(timeline)}</a>
        </p>
        {timeline.publication_restricted && (
          <p className="muted">This copy contains private upstream data and must remain private.</p>
        )}
        <label>
          <input
            type="checkbox"
            checked={timeline.allow_private_forks}
            disabled={busy}
            onChange={(e) => mutate('/settings', 'PATCH', { allowPrivateForks: e.target.checked })}
          />
          Allow invited readers to fork this timeline while private
        </label>
        <p className="muted">
          Forks have independent owners and collaborators. Revoking access stops future upstream
          reads and syncs, but cannot erase copies already made.
        </p>
      </section>
      <section>
        <h2>
          Address
          <HelpTip topic="sharing#addresses" about="addresses">
            The timeline’s link: your name and this slug. Its other addresses keep leading here.
          </HelpTip>
        </h2>
        {RESERVED_NAMES.has(timeline.owner) ? (
          <p className="muted">
            @{timeline.owner} is also the name of one of the site&apos;s own pages, so its timelines
            are at <code>/timelines/</code> and their IDs.
          </p>
        ) : (
          <form
            className="address-form"
            onSubmit={(e) => {
              e.preventDefault();
              void mutate('/settings', 'PATCH', {
                slug: new FormData(e.currentTarget).get('slug'),
              });
            }}
          >
            <label>
              <span>
                {origin}/{timeline.owner}/
              </span>
              <input
                name="slug"
                key={timeline.slug ?? ''}
                defaultValue={timeline.slug ?? slugFromTitle(timeline.title ?? '')}
                aria-label="Address"
                placeholder="for example fall-of-rome"
                pattern="[a-z0-9][a-z0-9_\-]{0,63}"
                title="1–64 lowercase letters, digits, hyphens or underscores, starting with a letter or digit"
                maxLength={64}
                required
              />
            </label>
            <button disabled={busy}>Save address</button>
            {timeline.slug && (
              <button
                type="button"
                disabled={busy}
                onClick={() => mutate('/settings', 'PATCH', { slug: null })}
              >
                Use its ID
              </button>
            )}
            {addressError && (
              <p className="error" role="alert">
                {addressError}
              </p>
            )}
          </form>
        )}
        <p className="muted">
          Without an address of its own, a timeline is at its ID. Links to its earlier addresses
          keep leading here, until another of your timelines takes one of them.
        </p>
      </section>
      <section>
        <h2>
          Sensitive content
          <HelpTip topic="moderation#sensitive-content-labels" about="sensitive content">
            Readers are warned before a labelled timeline opens, and its images stay blurred until
            they choose to see them.
          </HelpTip>
        </h2>
        <p className="muted">
          Educational, historical, medical, artistic and news depictions of nudity, violence or
          disturbing events are allowed when labelled; pornography and gore for its own sake are
          not. Readers are warned before a labelled timeline opens, its images stay blurred until
          they show them, and it is left out of featured timelines and of browsing by readers who
          aren’t signed in. Label single moments and durations in their details instead.
        </p>
        <fieldset className="content-labels" disabled={busy}>
          <legend>This timeline contains</legend>
          {CONTENT_LABELS.map(([key, name]) => {
            const moderated = (timeline.moderator_labels ?? []).includes(key);
            return (
              <label key={key} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={moderated || (timeline.content_labels ?? []).includes(key)}
                  disabled={moderated}
                  onChange={(e) => {
                    const labels = new Set(timeline.content_labels ?? []);
                    if (e.target.checked) labels.add(key);
                    else labels.delete(key);
                    void mutate('/settings', 'PATCH', { labels: [...labels] });
                  }}
                />
                {name}
                {moderated && <span className="muted"> (added by moderators)</span>}
              </label>
            );
          })}
        </fieldset>
      </section>
      <section>
        <h2>
          Data retention
          <HelpTip
            topic="retention#keeping-only-the-last-year-or-month-or-week"
            about="data retention"
          >
            Keeps only the last stretch of a timeline that keeps growing, such as a log: older
            moments are deleted for good.
          </HelpTip>
        </h2>
        {calendar ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void mutate('/settings', 'PATCH', {
                retention: new FormData(e.currentTarget).get('retention'),
              });
            }}
          >
            <label>
              Keep only the last
              <input
                name="retention"
                key={timeline.retention ?? ''}
                defaultValue={timeline.retention ?? ''}
                placeholder="for example 1 year or 90 days"
                maxLength={200}
                required
              />
            </label>
            <button disabled={busy}>Keep only this period</button>
            {timeline.retention && (
              <button
                type="button"
                disabled={busy}
                onClick={() => mutate('/settings', 'PATCH', { retention: null })}
              >
                Keep everything
              </button>
            )}
          </form>
        ) : (
          <p className="muted">
            Only timelines shown as a calendar (Gregorian time display) can keep a period: the
            server needs to know what time it is in them.
          </p>
        )}
        <p className="muted">
          About once an hour the server deletes moments and durations older than this, and the saved
          history from before then, apart from what forks, pull requests and newer history still
          need. That frees storage; deleted data cannot be restored.
          {timeline.retention && timeline.retention_applied_at && (
            <>
              {' '}
              Last applied {new Date(timeline.retention_applied_at).toLocaleString()}
              {timeline.retention_removed != null &&
                `, deleting ${Number(timeline.retention_removed).toLocaleString()} moments and durations`}
              .
            </>
          )}
        </p>
      </section>
      <section>
        <h2>
          Saved history
          <HelpTip topic="retention#not-keeping-saved-history" about="saved history">
            Each save keeps what it changed, so past revisions can be opened. Logs nobody reviews
            can do without.
          </HelpTip>
        </h2>
        {timeline.keep_history ? (
          <>
            <p className="muted">
              Each save keeps the earlier version of what it changed, so past revisions can be
              opened and exported, forks can sync, and pull requests can be reviewed. That takes
              about as much storage again as the timeline itself. High-volume timelines such as
              logs, whose past revisions nobody reviews, can do without.
            </p>
            <button disabled={busy} onClick={() => historyDialog.current.showModal()}>
              Stop keeping saved history…
            </button>
            <dialog ref={historyDialog}>
              <h2>Stop keeping saved history?</h2>
              <p>
                Past revisions are deleted now, freeing about {size(timeline.history_bytes ?? 0)},
                apart from those forks and pull requests still use. From then on saves keep only who
                saved and when: only the latest revision can be opened, forks of this timeline
                cannot sync with it once it changes, and it takes no pull requests.
              </p>
              <p>Deleted revisions cannot be restored. Export one first if you need it.</p>
              <div className="actions">
                <button disabled={busy} onClick={() => historyDialog.current.close()}>
                  Cancel
                </button>
                <button
                  disabled={busy}
                  className="danger"
                  onClick={() => mutate('/settings', 'PATCH', { keepHistory: false })}
                >
                  Delete saved history
                </button>
              </div>
              <p role="alert">{error}</p>
            </dialog>
          </>
        ) : (
          <>
            <p>
              This timeline does not keep saved history: saves keep only who saved and when, and
              only the latest revision can be opened.
            </p>
            <button
              disabled={busy}
              onClick={() => mutate('/settings', 'PATCH', { keepHistory: true })}
            >
              Keep saved history from now on
            </button>
            <p className="muted">
              History starts from the current state, with one copy of it (about{' '}
              {size(Number(timeline.storage_bytes ?? 0))}) charged to your storage; later saves are
              charged what they change.
            </p>
          </>
        )}
      </section>
      <section>
        <h2>
          Collaborators
          <HelpTip topic="collaboration#custody-and-permissions" about="collaborators">
            Viewers read, contributors propose changes, and writers save them and merge pull
            requests.
          </HelpTip>
        </h2>
        {members.map((m) => (
          <p key={m.username}>
            @{m.username} · {m.role}{' '}
            <button
              disabled={busy}
              onClick={() => mutate('/members', 'DELETE', { username: m.username })}
            >
              Remove
            </button>
          </p>
        ))}
        <form onSubmit={member}>
          <label>
            Username
            <input name="username" required maxLength={32} />
          </label>
          <label>
            Access
            <select name="role">
              <option value="viewer">Viewer — read</option>
              <option value="contributor">Contributor — propose changes</option>
              <option value="writer">Writer — merge and publish upstream</option>
            </select>
          </label>
          <button disabled={busy}>Add or update collaborator</button>
        </form>
      </section>
      <p className="error" role="alert">
        {error}
      </p>
      <section>
        <h2>Delete timeline</h2>
        <p>
          This permanently deletes the timeline, pull requests and their comments. Independently
          owned forks remain. Saved ancestors needed by those forks or other reviews are retained.
        </p>
        <button className="danger" disabled={busy} onClick={() => dialog.current.showModal()}>
          Delete timeline…
        </button>
        <dialog ref={dialog}>
          <h2>Delete this timeline?</h2>
          <p>This action cannot be undone. Export a copy first if you want to retain its data.</p>
          <div className="actions">
            <button disabled={busy} onClick={() => dialog.current.close()}>
              Cancel
            </button>
            <button disabled={busy} className="danger" onClick={() => mutate('', 'DELETE', {})}>
              Delete permanently
            </button>
          </div>
          <p role="alert">{error}</p>
        </dialog>
      </section>
    </>
  );
}
