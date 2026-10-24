# common

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The pipeline every video shares, after CMR Scanner's leadership-brief video (`publicity/video/leadership-brief/` there): its build, alignment, captions, mixing, render and encode steps, generalised to any video folder and to scripts in this repository's format, with a scratch voice, the tours' capture of the real app, and a drawing core of OpenChronology's own. See [the video README](../README.md) for the order to run them in.

## Contents

| File                         | What it is for                                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`core.js`](core.js)         | The drawing and timing core: the five looks, text, chips and icons, eased transforms, word cues, the timeline motif, captured shots and `renderAt`. |
| [`build.py`](build.py)       | Builds a video's `timeline.js` (from the script and its alignment, or estimated), `page.html` and folder README.                                    |
| [`narrate.py`](narrate.py)   | Reads a script's narration with a scratch voice (Piper, offline), one clip per scene.                                                               |
| [`prepare.py`](prepare.py)   | Trims each narration clip to its speech and aligns its words with whisper.cpp.                                                                      |
| [`captions.py`](captions.py) | Writes `captions.srt` in the script's wording, timed from the alignment.                                                                            |
| [`audio.py`](audio.py)       | Mixes the trimmed clips onto the video's timeline and normalizes to web loudness.                                                                   |
| [`capture.mjs`](capture.mjs) | Captures a tour's shots of the real editor, frame by frame, from a sample timeline.                                                                 |
| [`render.mjs`](render.mjs)   | Renders a video's page to JPEG frames in parallel pages, or a few stills to check.                                                                  |
| [`render.sh`](render.sh)     | Runs `render.mjs` in the Playwright image.                                                                                                          |
| [`encode.sh`](encode.sh)     | Encodes frames, the mix and the captions into an MP4.                                                                                               |
