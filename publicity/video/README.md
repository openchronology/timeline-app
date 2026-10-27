# video

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The source of the thirteen explainer videos and the ten vertical shorts, after CMR Scanner's leadership-brief video: every frame is drawn in SVG as a pure function of time, and each element appears on the word in the narration that introduces it. One folder per video holds only its scenes (`anim.js`) and settings; everything they share is in [`common/`](common/README.md). Each video's scenes, acts, on-screen text and narration are read straight from its script in [`publicity/`](../README.md), so the script stays the one place they're written.

The tours (Videos 5, 6, 7 and 8) the logs, AI and investigations videos (10, 12, 13) also show the real app: [`common/capture.mjs`](common/capture.mjs) opens a sample timeline from [`samples/`](samples/README.md) in the built editor and records each shot frame by frame, and the scenes place those frames in a browser window.

The shorts (`s01-…` to `s10-…`, scripts in [`publicity/shorts/`](../shorts/README.md)) use the same pipeline with `"format": "vertical"` in their `video.json`: a 1080 × 1920 stage, the narration burned in as captions a few words at a time, a headline from each scene's on-screen text, and the real app captured at phone size.

Narration recordings, trimmed audio, captured shots, rendered frames and MP4s are not in git (see `.gitignore`).

## Contents

| File                                                                              | What it is for                                                                              |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`.gitignore`](.gitignore)                                                        | Keeps narration, audio, captured shots, frames, stills, the tools and MP4s out of git.      |
| [`common/`](common/README.md)                                                     | The pipeline every video shares: drawing core, build, narration, alignment, render, encode. |
| [`samples/`](samples/README.md)                                                   | The tours' sample timelines (`.ochx`) and the data they're built from.                      |
| [`01-what-is-openchronology/`](01-what-is-openchronology/README.md)               | Video 1: What is OpenChronology?                                                            |
| [`02-how-to-see-a-timeline/`](02-how-to-see-a-timeline/README.md)                 | Video 2: How to see a timeline.                                                             |
| [`03-website-desktop-or-offline/`](03-website-desktop-or-offline/README.md)       | Video 3: Website, desktop or offline?                                                       |
| [`04-exact-time/`](04-exact-time/README.md)                                       | Video 4: Exact time, rational numbers.                                                      |
| [`05-tour-usa/`](05-tour-usa/README.md)                                           | Video 5: Tour, the United States.                                                           |
| [`06-tour-a-story/`](06-tour-a-story/README.md)                                   | Video 6: Tour, a story's timeline.                                                          |
| [`07-tour-a-canon/`](07-tour-a-canon/README.md)                                   | Video 7: Tour, keeping a canon (Middle-earth).                                              |
| [`08-tour-deep-time/`](08-tour-deep-time/README.md)                               | Video 8: Tour, deep time.                                                                   |
| [`09-working-together/`](09-working-together/README.md)                           | Video 9: Working together.                                                                  |
| [`10-timelines-from-logs/`](10-timelines-from-logs/README.md)                     | Video 10: Timelines from logs.                                                              |
| [`11-run-your-own-server/`](11-run-your-own-server/README.md)                     | Video 11: Run your own server.                                                              |
| [`12-ai-and-automation/`](12-ai-and-automation/README.md)                         | Video 12: Timelines from AI and automation.                                                 |
| [`13-investigations-causal-factors/`](13-investigations-causal-factors/README.md) | Video 13: Investigations, from timeline to causal factors.                                  |
| [`17-tour-george-washington/`](17-tour-george-washington/README.md)               | Video 17: Tour, George Washington.                                                          |
| [`s01-1776-to-the-moon/`](s01-1776-to-the-moon/README.md)                         | Short 1: 1776 to one second on the Moon.                                                    |
| [`s02-the-last-six-seconds/`](s02-the-last-six-seconds/README.md)                 | Short 2: you're the last six seconds.                                                       |
| [`s03-point-one-plus-point-two/`](s03-point-one-plus-point-two/README.md)         | Short 3: 0.1 + 0.2 isn't 0.3.                                                               |
| [`s04-the-ring-in-the-river/`](s04-the-ring-in-the-river/README.md)               | Short 4: the Ring sat in a river for 2,460 years.                                           |
| [`s05-one-characters-thread/`](s05-one-characters-thread/README.md)               | Short 5: check one character's thread.                                                      |
| [`s06-a-class-timeline/`](s06-a-class-timeline/README.md)                         | Short 6: a class timeline nobody can wreck.                                                 |
| [`s07-one-html-file/`](s07-one-html-file/README.md)                               | Short 7: a whole app in one HTML file.                                                      |
| [`s08-paged-at-2-58/`](s08-paged-at-2-58/README.md)                               | Short 8: 2:58 a.m., everything's down.                                                      |
| [`s09-i-asked-an-ai/`](s09-i-asked-an-ai/README.md)                               | Short 9: I asked an AI to build a timeline.                                                 |
| [`s10-why-did-it-happen/`](s10-why-did-it-happen/README.md)                       | Short 10: why did it happen?                                                                |
| [`s14-six-years-from-home/`](s14-six-years-from-home/README.md)                   | Short 14: six years from home.                                                              |

## Making a video

Needs Docker (the `linuxserver/ffmpeg`, `debian:13`, `python:3.12-slim` and `mcr.microsoft.com/playwright:v1.58.2-noble` images), Python 3, and the repository's `node_modules` and `dist/` (`npm ci`, `npm run build:editor`). From `publicity/video/`, for a video folder `V`:

```sh
python3 common/narrate.py V      # scratch narration with Kokoro (skip if you've recorded audio/sceneNN.mp3)
python3 common/prepare.py V      # trim and align each clip (the first run builds whisper.cpp: a few minutes)
python3 common/build.py V        # timeline.js, page.html and V/README.md
python3 common/captions.py V     # captions.srt
python3 common/audio.py V        # mix.wav
common/render.sh V               # frames/ (a few minutes a video)
common/encode.sh V               # V/V.mp4
```

For a tour, first build the samples and capture its shots (in the Playwright image, from the repository's root):

```sh
node publicity/video/samples/build.mjs
docker run --rm --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD:/app" -w /app \
  mcr.microsoft.com/playwright:v1.58.2-noble node publicity/video/common/capture.mjs publicity/video/V
```

`build.py` works before anything is recorded: without an alignment it estimates each word's time from the script, so scenes can be drafted, and `common/render.sh V --at 4,12.5,30` renders stills at those times into `V/stills/` to check them. A missing cue word (a `q("…")` the narration doesn't say) is reported when rendering.

### Recording the narration

Read each script's Appendix A, one clip per scene, and save them as `V/audio/scene01.mp3` …; clicks at the ends are trimmed. Then run `prepare.py`, `build.py`, `captions.py`, `audio.py`, `render.sh` and `encode.sh` again. If a take changes the wording, change the script's `VO` first: captions take their spelling from there. If a cue word is gone, change the word in that scene's `q(...)` call in `anim.js`.
