// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useEffect, useRef, useState } from 'react';
import { dismissOnBackdrop } from '../../src/dialogs.ts';
/** Social sites' own share pages: a link to each, without their scripts. */
const SITES = [
  ['Facebook', (url) => `https://www.facebook.com/sharer/sharer.php?u=${url}`],
  ['X', (url, text) => `https://x.com/intent/tweet?url=${url}&text=${text}`],
  ['LinkedIn', (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${url}`],
  ['Reddit', (url, text) => `https://www.reddit.com/submit?url=${url}&title=${text}`],
  ['Bluesky', (url, text) => `https://bsky.app/intent/compose?text=${text}%20${url}`],
  ['Email', (url, text) => `mailto:?subject=${text}&body=${url}`],
];
const SIZES = {
  responsive: ['100%', 480],
  large: [800, 480],
  small: [480, 360],
};
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
async function copy(text, field) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    field?.select();
    document.execCommand('copy');
  }
}
/**
 * Shares a timeline, or a moment, duration, search or view in it: its address, social sites,
 * the device's own share sheet, and (for public timelines) the code that embeds it.
 * `share` is { url, title, embed (an /embed/ address, public timelines only), settings }.
 */
export default function ShareDialog({ share, onClose }) {
  const dialog = useRef(null),
    link = useRef(null),
    code = useRef(null),
    [status, setStatus] = useState(''),
    [size, setSize] = useState('responsive'),
    [native, setNative] = useState(false);
  // Closes with the editor's exit animation, and on a click outside it, like its dialogs.
  useEffect(() => dismissOnBackdrop(dialog.current), []);
  useEffect(() => {
    setNative(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);
  useEffect(() => {
    setStatus('');
    if (share && !dialog.current?.open) dialog.current?.showModal();
    if (!share && dialog.current?.open) dialog.current.close();
  }, [share]);
  const url = share ? encodeURIComponent(share.url) : '',
    text = share ? encodeURIComponent(share.title) : '';
  const [width, height] = SIZES[size];
  const embed = share?.embed
    ? `<iframe src="${escape(share.embed)}" title="${escape(share.title)}" width="${width}" height="${height}" style="border:0;max-width:100%" loading="lazy" allow="fullscreen"></iframe>`
    : '';
  return (
    <dialog
      ref={dialog}
      className="share-dialog"
      aria-labelledby="share-heading"
      onClose={() => onClose()}
    >
      {share && (
        <>
          <div className="dialog-heading">
            <h2 id="share-heading">Share</h2>
            <button type="button" aria-label="Close" onClick={() => dialog.current.close()}>
              ×
            </button>
          </div>
          <p className="share-title">{share.title}</p>
          <label>
            Link
            <span className="share-row">
              <input ref={link} readOnly value={share.url} onFocus={(e) => e.target.select()} />
              <button
                type="button"
                onClick={() => copy(share.url, link.current).then(() => setStatus('Link copied.'))}
              >
                Copy link
              </button>
            </span>
          </label>
          {share.embed ? (
            <ul className="share-sites" aria-label="Share on">
              {native && (
                <li>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.share({ title: share.title, url: share.url }).catch(() => {})
                    }
                  >
                    Share…
                  </button>
                </li>
              )}
              {SITES.map(([name, address]) => (
                <li key={name}>
                  <a href={address(url, text)} target="_blank" rel="noopener noreferrer">
                    {name}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-hint">
              Only people who can open this timeline can follow the link.{' '}
              {share.settings ? (
                <>
                  Make it public in <a href={share.settings}>Sharing &amp; settings</a> to post it
                  or embed it elsewhere.
                </>
              ) : (
                'A public timeline can be posted and embedded elsewhere.'
              )}
            </p>
          )}
          {share.embed && (
            <details className="share-embed">
              <summary>Embed on a website</summary>
              <label>
                Size
                <select value={size} onChange={(e) => setSize(e.target.value)}>
                  <option value="responsive">Page width × 480</option>
                  <option value="large">800 × 480</option>
                  <option value="small">480 × 360</option>
                </select>
              </label>
              <label>
                HTML
                <textarea ref={code} readOnly rows={4} value={embed} />
              </label>
              <button
                type="button"
                onClick={() =>
                  copy(embed, code.current).then(() => setStatus('Embed code copied.'))
                }
              >
                Copy embed code
              </button>
              <p className="field-hint">
                Services that discover oEmbed can embed the timeline from its link alone.
              </p>
            </details>
          )}
          <p role="status" className="field-hint">
            {status}
          </p>
        </>
      )}
    </dialog>
  );
}
