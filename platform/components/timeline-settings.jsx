// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// A timeline's sharing and settings: visibility, address, image, collaborators, content
// labels, saved history and deletion.
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { dismissOnBackdrop } from '../../src/dialogs.ts';
import { CONTENT_LABELS } from '../../src/content-labels.ts';
import { api } from '../lib/api.js';
import { RESERVED_NAMES, slugFromTitle, timelinePath } from '../../src/addresses.ts';
import HelpTip from './help-tip.jsx';
import { ADD_COLLABORATOR, ROLE_OPTIONS, VISIBILITY_OPTIONS } from '../../src/wording.ts';
/** The longest alt text the server keeps (src/timeline-image.ts). */
const IMAGE_ALT_LENGTH = 1000;
/**
 * A link as an image may be linked (the server checks it as src/plugins.ts's imageURL does):
 * an https address without credentials, normalized; null otherwise.
 */
function imageURL(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
/** A storage size, as the account page writes it. */
const size = (bytes) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(bytes >= 104857600 ? 0 : 1)} MB`
    : `${Math.max(bytes ? 1 : 0, Math.round(bytes / 1024))} KB`;
/**
 * A timeline's settings page (/<owner>/<timeline>/settings), for those who may share it (the
 * page is a 404 for anyone else, and the API checks every change again).
 *
 * Each change goes to the API at once: PATCH /api/timelines/<id>/settings with the one field
 * that changed (visibility, allowPrivateForks, slug, image, labels, retention or keepHistory), which
 * answers the timeline's metadata as it is now, with its printed retention period and
 * `history_bytes`; POST and DELETE /api/timelines/<id>/members to add or remove a collaborator;
 * DELETE /api/timelines/<id> to delete it.
 *
 * @param {object} props
 * @param {object} props.initial the timeline's metadata, read by the page, with `retention`
 *   (its period as its display writes it, or null) and `history_bytes` (what turning saved
 *   history off would free)
 * @param {{username: string, role: string}[]} props.initialMembers its collaborators
 * @param {boolean} [props.calendar] it displays Gregorian dates (and is not a comparison), so
 *   it can keep only a recent period: the server must know what time it is in it
 * @param {{listed: boolean, newcomerDays: number, fullDays: number}|null} [props.listing]
 *   whether browsing lists it (#103), and the days the standing rules use, to explain why not
 * @param {string} [props.origin] the site's origin, to show its full address
 */
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
    // A refused address or image is shown next to its field rather than at the end of the page.
    [addressError, setAddressError] = useState(''),
    [imageError, setImageError] = useState(''),
    // The image's link as typed, and its size once its preview loads (oEmbed needs it).
    [imageLink, setImageLink] = useState(initial.image?.url ?? ''),
    [imageSize, setImageSize] = useState(null);
  // A click outside either confirmation dialog closes it.
  useEffect(() => dismissOnBackdrop(dialog.current), []);
  useEffect(() => dismissOnBackdrop(historyDialog.current), []);
  const base = 'timelines/' + timeline.id;
  /**
   * Sends one change and shows its result; one at a time, so a click while one is being sent
   * is ignored.
   *
   * The page isn't given the CSRF token, so it reads GET /api/session for it first: the API
   * refuses a write on a cookie session without it in X-CSRF-Token. After a settings change
   * the timeline shown is the answer (and the history dialog closes); after a members change
   * the list is read again; after deleting, the dashboard opens. A new address moves the page
   * to it; anything else refreshes the page's server-rendered parts.
   *
   * @param {string} path after /api/timelines/<id>: '/settings', '/members', or '' (itself)
   * @param {string} method PATCH, POST or DELETE
   * @param {object} data the JSON body
   */
  async function mutate(path, method, data) {
    if (busy) return;
    setBusy(true);
    setError('');
    setAddressError('');
    setImageError('');
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
      (data && 'slug' in data
        ? setAddressError
        : data && 'image' in data
          ? setImageError
          : setError)(e.message);
    } finally {
      setBusy(false);
    }
  }
  /** Sets the image from its form: its link and alt text, with its size when it loaded. */
  function setImage(event) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    const url = imageURL(f.get('url'));
    if (!url) return setImageError('Link an image by its https:// address.');
    void mutate('/settings', 'PATCH', {
      image: { url, alt: f.get('alt'), ...(imageSize?.url === url ? imageSize.size : {}) },
    });
  }
  /** The preview of the link being typed: the image, if it is a usable link. */
  const preview = imageURL(imageLink);
  /** Adds a collaborator, by username, with the role chosen. */
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
            {/* The same words as the editor's sharing dialog (#187). */}
            {VISIBILITY_OPTIONS.map(([value, label]) => (
              <option
                key={value}
                value={value}
                // A private fork's copy holds the upstream's private data: it can't be public.
                disabled={value === 'public' && timeline.publication_restricted}
              >
                {label}
              </option>
            ))}
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
          // The field is keyed by the saved slug, so it shows the saved one after a change; a
          // timeline without a slug suggests one from its title. The server checks it again.
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
          Image
          <HelpTip topic="images#a-timelines-own-image" about="the timeline’s image">
            Shown above its title, on its card wherever timelines are listed, and when its link is
            shared.
          </HelpTip>
        </h2>
        {/* Keyed by the saved image, so the fields show it again after a change. */}
        <form className="image-form" key={timeline.image?.url ?? ''} onSubmit={setImage}>
          <div className="image-preview">
            {preview ? (
              <img
                src={preview}
                alt=""
                referrerPolicy="no-referrer"
                onLoad={(e) =>
                  setImageSize({
                    url: preview,
                    size: { width: e.target.naturalWidth, height: e.target.naturalHeight },
                  })
                }
              />
            ) : (
              <span className="timeline-card-placeholder" aria-hidden="true" />
            )}
          </div>
          <label>
            Link to the image
            <input
              name="url"
              type="url"
              defaultValue={timeline.image?.url ?? ''}
              onChange={(e) => setImageLink(e.target.value)}
              placeholder="https://upload.wikimedia.org/…"
              pattern="https://.*"
              title="An https:// address"
              maxLength={4096}
              required
            />
          </label>
          <label>
            Alt text
            <input
              name="alt"
              defaultValue={timeline.image?.alt ?? ''}
              placeholder="What the image shows, for those who can’t see it"
              maxLength={IMAGE_ALT_LENGTH}
            />
          </label>
          <div className="actions">
            <button disabled={busy}>{timeline.image ? 'Replace image' : 'Set image'}</button>
            {timeline.image && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setImageLink('');
                  void mutate('/settings', 'PATCH', { image: null });
                }}
              >
                Remove image
              </button>
            )}
          </div>
          {imageError && (
            <p className="error" role="alert">
              {imageError}
            </p>
          )}
        </form>
        <p className="muted">
          Link an image where it is hosted, such as Wikimedia Commons or your own site: the server
          keeps the link, not a copy, and exports carry a copy for offline use. Link only images you
          may share; the same rules and reports apply as to every image.
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
          aren’t signed in. Label single events in their details instead.
        </p>
        <fieldset className="content-labels" disabled={busy}>
          <legend>This timeline contains</legend>
          {CONTENT_LABELS.map(([key, name]) => {
            // Labels moderators added (#115) are shown checked and can't be removed by the owner;
            // the owner's own labels are sent whole, as the new set, on each change.
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
        {/* The period is written as the timeline's display reads it ("1 year", "90 days"); the
            server parses it with the timeline's calendar and prints it back the same way. */}
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
          About once an hour the server deletes events older than this, and the saved history from
          before then, apart from what forks, pull requests and newer history still need. That frees
          storage; deleted data cannot be restored.
          {timeline.retention && timeline.retention_applied_at && (
            <>
              {' '}
              Last applied {new Date(timeline.retention_applied_at).toLocaleString()}
              {timeline.retention_removed != null &&
                `, deleting ${Number(timeline.retention_removed).toLocaleString()} events`}
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
            {/* A confirmation, with its own copy of the error, since the page behind is inert. */}
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
              {ROLE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy}>{ADD_COLLABORATOR}</button>
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
