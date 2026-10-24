# video

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The source of the ten explainer videos, after CMR Scanner's leadership-brief video: every frame is drawn in SVG as a pure function of time, and each element appears on the word in the narration that introduces it. One folder per video holds only its scenes (`anim.js`) and settings; everything they share is in [`common/`](common/README.md). Each video's scenes, acts, on-screen text and narration are read straight from its script in [`publicity/`](../README.md), so the script stays the one place they're written.

The tours (Videos 5, 6, 7 and 9) also show the real app: [`common/capture.mjs`](common/capture.mjs) opens a sample timeline from [`samples/`](samples/README.md) in the built editor and records each shot frame by frame, and the scenes place those frames in a browser window.

Narration recordings, trimmed audio, captured shots, rendered frames and MP4s are not in git (see `.gitignore`).

## Contents

| File                                                                        | What it is for                                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [`.gitignore`](.gitignore)                                                  | Keeps narration, audio, captured shots, frames, stills, the tools and MP4s out of git.      |
| [`common/`](common/README.md)                                               | The pipeline every video shares: drawing core, build, narration, alignment, render, encode. |
| [`samples/`](samples/README.md)                                             | The tours' sample timelines (`.ochx`) and the data they're built from.                      |
| [`01-what-is-openchronology/`](01-what-is-openchronology/README.md)         | Video 1: What is OpenChronology?                                                            |
| [`02-how-to-see-a-timeline/`](02-how-to-see-a-timeline/README.md)           | Video 2: How to see a timeline.                                                             |
| [`03-website-desktop-or-offline/`](03-website-desktop-or-offline/README.md) | Video 3: Website, desktop or offline?                                                       |
| [`04-exact-time/`](04-exact-time/README.md)                                 | Video 4: Exact time, rational numbers.                                                      |
| [`05-tour-usa/`](05-tour-usa/README.md)                                     | Video 5: Tour, the United States.                                                           |
| [`06-tour-a-story/`](06-tour-a-story/README.md)                             | Video 6: Tour, a story's timeline.                                                          |
| [`07-tour-deep-time/`](07-tour-deep-time/README.md)                         | Video 7: Tour, deep time.                                                                   |
| [`08-working-together/`](08-working-together/README.md)                     | Video 8: Working together.                                                                  |
| [`09-timelines-from-logs/`](09-timelines-from-logs/README.md)               | Video 9: Timelines from logs.                                                               |
| [`10-run-your-own-server/`](10-run-your-own-server/README.md)               | Video 10: Run your own server.                                                              |

## Making a video

Needs Docker (the `linuxserver/ffmpeg`, `debian:13`, `python:3.12-slim` and `mcr.microsoft.com/playwright:v1.58.2-noble` images), Python 3, and the repository's `node_modules` and `dist/` (`npm ci`, `npm run build:editor`). From `publicity/video/`, for a video folder `V`:

```sh
python3 common/narrate.py V      # scratch narration with Piper (skip if you've recorded audio/sceneNN.mp3)
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
