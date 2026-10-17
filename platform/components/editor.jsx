// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// The editor on a platform page: frames /editor/frame and adds the platform's actions to it,
// such as stars, forks, sharing and reports.
import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import StarButton from './star-button.jsx';
import VersionActions from './version-actions.jsx';
import ShareDialog from './share-dialog.jsx';
import ReportDialog from './report-dialog.jsx';
/** The page to share for a link fragment of the editor (see src/links.ts). */
function sharedAddress(path, fragment) {
  const base = location.origin + path;
  const [kind, rest] = fragment ? [fragment.slice(0, fragment.indexOf('/')), fragment] : [];
  if (kind === 'moment' || kind === 'duration')
    return `${base}/${kind}s/${rest.slice(kind.length + 1)}`;
  return fragment ? base + '#' + fragment : base;
}
export default function Editor({
  id,
  // Its page (#148): /<owner>/<slug>, or /<owner>/<id> until it has a slug.
  path = id ? '/timelines/' + id : null,
  canShare = false,
  fresh = false,
  sample = false,
  timeline,
  signedIn = false,
  comparisonIds,
  comparisonSources = [],
  forkId,
  focus,
  // Starts the editor's tour (#172), from the help.
  tour = false,
  // A draft in this browser to open (#188), from the dashboard.
  draft,
}) {
  const frame = useRef(null),
    router = useRouter(),
    [local, setLocal] = useState(false),
    [actions, setActions] = useState(null),
    [share, setShare] = useState(null),
    [report, setReport] = useState(null);
  const offer = (fragment, title) =>
    setShare({
      url: sharedAddress(path, fragment),
      title,
      embed:
        timeline?.visibility === 'public'
          ? `${location.origin}/embed/${id}${fragment ? '#' + fragment : ''}`
          : null,
      settings: canShare ? path + '/settings' : null,
    });
  // The frame can finish loading before this page's script runs (and misses onLoad).
  useEffect(() => {
    const document = frame.current?.contentDocument;
    if (document?.readyState === 'complete' && document.location.pathname === '/editor/frame')
      setActions(document.getElementById('platform-timeline-actions'));
  }, []);
  useEffect(() => {
    function message(event) {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'openchronology:local') {
        setLocal(true);
        window.history.replaceState(null, '', '/editor');
      }
      // The address follows what is open in the timeline, so it can be copied as a link.
      if (event.data?.type === 'openchronology:link' && id && event.data.timeline === id) {
        const fragment = typeof event.data.fragment === 'string' ? event.data.fragment : '';
        window.history.replaceState(
          window.history.state,
          '',
          path + (fragment ? '#' + fragment : ''),
        );
      }
      if (event.data?.type === 'openchronology:share' && id && event.data.timeline === id)
        offer(
          typeof event.data.fragment === 'string' ? event.data.fragment : null,
          String(event.data.title ?? timeline?.title ?? 'Timeline').slice(0, 300),
        );
      // Reporting a moment or duration in it (#115).
      if (
        event.data?.type === 'openchronology:report' &&
        id &&
        event.data.timeline === id &&
        ['moment', 'duration'].includes(event.data.kind) &&
        typeof event.data.id === 'string'
      )
        setReport({
          target: { kind: event.data.kind, timeline: id, id: event.data.id },
          title: String(event.data.title ?? 'Untitled').slice(0, 300),
        });
      // Saved: this timeline's page shows what was saved; a new one's page opens (at its
      // address, #148).
      if (event.data?.type === 'openchronology:published' && event.data.id === id) router.refresh();
      else if (
        event.data?.type === 'openchronology:published' &&
        /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(event.data.id)
      )
        router.replace('/timelines/' + event.data.id);
    }
    window.addEventListener('message', message);
    return () => window.removeEventListener('message', message);
  }, [router, id, path, timeline?.visibility, canShare]);
  return (
    <>
      {id &&
        !local &&
        actions &&
        createPortal(
          <nav className="timeline-navigation" aria-label="Timeline navigation">
            <StarButton
              id={id}
              count={timeline?.star_count}
              starred={timeline?.starred}
              signedIn={signedIn}
            />
            {!timeline?.comparison && (
              <a target="_top" href={path + '/pulls'}>
                Pull requests
              </a>
            )}
            {timeline?.comparison && (
              <>
                <span>Read-only comparison · Sources:</span>
                {comparisonSources.map((source) => (
                  <a target="_top" key={source.id} href={source.path}>
                    {source.title}
                  </a>
                ))}
                <a target="_top" href={path + '/history'}>
                  History
                </a>
              </>
            )}
            <button type="button" onClick={() => offer(null, timeline?.title || 'Timeline')}>
              Share
            </button>
            {canShare && (
              <a target="_top" href={path + '/settings'}>
                Sharing &amp; settings
              </a>
            )}
            {!canShare && (
              <button
                type="button"
                className="report-button"
                onClick={() =>
                  setReport({
                    target: { kind: 'timeline', timeline: id },
                    title: timeline?.title || 'Timeline',
                  })
                }
              >
                Report
              </button>
            )}
            {timeline && !timeline.comparison && (
              <VersionActions
                timeline={timeline}
                signedIn={signedIn}
                onGuestFork={() =>
                  frame.current?.contentWindow?.postMessage(
                    { type: 'openchronology:guest-fork', id },
                    location.origin,
                  )
                }
              />
            )}
          </nav>,
          actions,
        )}
      {timeline?.moderation && (
        <p className="notice moderation-notice" role="status">
          Moderators restricted this timeline
          {timeline.moderation.reason ? `: ${timeline.moderation.reason}` : '.'} It is private, and
          only you and the site’s administrators can open it.{' '}
          <a href="/account#moderation">
            {timeline.moderation.appealed_at ? 'See your review request' : 'Ask for a review'}
          </a>
        </p>
      )}
      <iframe
        ref={frame}
        onLoad={() =>
          setActions(
            frame.current?.contentDocument?.getElementById('platform-timeline-actions') ?? null,
          )
        }
        title="Timeline editor"
        className="editor-frame"
        src={
          '/editor/frame' +
          (sample ? '?demo=dense' : fresh ? '?new=1' : '') +
          (tour ? (sample || fresh ? '&' : '?') + 'tour=1' : '') +
          (draft
            ? (sample || fresh || tour ? '&' : '?') + 'draft=' + encodeURIComponent(draft)
            : '') +
          (forkId
            ? '#guest-fork/' + forkId
            : comparisonIds
              ? '#compare/' + comparisonIds.join(',')
              : id
                ? '#timeline/' + id + (focus ? '/' + focus : '')
                : '')
        }
      />
      {id && <ShareDialog share={share} onClose={() => setShare(null)} />}
      {id && <ReportDialog report={report} onClose={() => setReport(null)} />}
    </>
  );
}
