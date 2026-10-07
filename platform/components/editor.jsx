// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import VersionActions from './version-actions.jsx';
export default function Editor({
  id,
  canShare = false,
  fresh = false,
  sample = false,
  timeline,
  signedIn = false,
  comparisonIds,
  comparisonSources = [],
  forkId,
}) {
  const frame = useRef(null),
    router = useRouter(),
    [local, setLocal] = useState(false),
    [actions, setActions] = useState(null);
  useEffect(() => {
    function message(event) {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'openchronology:local') {
        setLocal(true);
        window.history.replaceState(null, '', '/editor');
      }
      if (
        event.data?.type === 'openchronology:published' &&
        /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(event.data.id)
      )
        router.replace('/timelines/' + event.data.id);
    }
    window.addEventListener('message', message);
    return () => window.removeEventListener('message', message);
  }, [router]);
  return (
    <>
      {id &&
        !local &&
        actions &&
        createPortal(
          <nav className="timeline-navigation" aria-label="Timeline navigation">
            {!timeline?.comparison && (
              <a target="_top" href={'/timelines/' + id + '/pulls'}>
                Pull requests
              </a>
            )}
            {timeline?.comparison && (
              <>
                <span>Read-only comparison · Sources:</span>
                {comparisonSources.map((source) => (
                  <a target="_top" key={source.id} href={'/timelines/' + source.id}>
                    {source.title}
                  </a>
                ))}
                <a target="_top" href={'/timelines/' + id + '/history'}>
                  History
                </a>
              </>
            )}
            {canShare && (
              <a target="_top" href={'/timelines/' + id + '/settings'}>
                Sharing &amp; settings
              </a>
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
          (forkId
            ? '#guest-fork/' + forkId
            : comparisonIds
              ? '#compare/' + comparisonIds.join(',')
              : id
                ? '#timeline/' + id
                : '')
        }
      />
    </>
  );
}
