// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// A landing page's explainer video (#379), loaded only when asked for: until then nothing is
// fetched from YouTube; without JavaScript it is a link to watch it there.
import { useState } from 'react';

/**
 * A poster that is a link to the video on YouTube. Clicked (a plain click, with JavaScript),
 * it becomes YouTube's privacy-enhanced player (youtube-nocookie.com), which plays it in
 * place. The player is sent the site's origin as its referrer, which YouTube's embeds need,
 * though the site sends none elsewhere.
 *
 * @param {object} props
 * @param {{watch: string, embed: string}} props.video the page's video (server/landing.mjs)
 * @param {string} props.title what the video is, for the poster and the player
 */
export default function LandingVideo({ video, title }) {
  const [playing, setPlaying] = useState(false);
  if (playing)
    return (
      <div className="landing-video-frame">
        <iframe
          src={video.embed}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  return (
    <a
      className="landing-video-poster"
      href={video.watch}
      onClick={(event) => {
        if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        setPlaying(true);
      }}
    >
      <span className="landing-video-play" aria-hidden="true">
        ▶
      </span>
      <span className="landing-video-title">Play: {title}</span>
    </a>
  );
}
