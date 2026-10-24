# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Mixes a video's narration clips onto its timeline, normalized to web loudness.
"""Mixes a video's narration: each trimmed clip at its scene's voice start, normalized to web loudness.

Usage: python3 common/audio.py <video folder>

Reads timeline.js and trim/sceneNN.wav; writes mix.wav (stereo, 48 kHz, the video's length).
"""
import json, os, re, subprocess, sys

folder = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
TL = json.loads(re.search(r"var TL = (.*);\s*$", open(os.path.join(folder, "timeline.js")).read(), re.S).group(1))
ins, filt, labels = [], [], []
for sc in TL["scenes"]:
    if not os.path.exists(os.path.join(folder, "trim", f"scene{sc['id']:02d}.wav")):
        continue
    k = len(labels)
    ins += ["-i", f"/v/trim/scene{sc['id']:02d}.wav"]
    ms = int(round((sc["start"] + sc["voice"]) * 1000))
    filt.append(f"[{k}]adelay={ms}[a{k}]")
    labels.append(f"[a{k}]")
if not labels:
    sys.exit("no trimmed narration in trim/: run narrate.py or record, then prepare.py")
filt.append("".join(labels) + f"amix=inputs={len(labels)}:normalize=0,apad,atrim=0:{TL['total']},"
            "loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,pan=stereo|c0=c0|c1=c0[out]")
subprocess.run(["docker", "run", "--rm", "--user", f"{os.getuid()}:{os.getgid()}", "-v", f"{folder}:/v",
                "--entrypoint", "ffmpeg", "linuxserver/ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *ins,
                "-filter_complex", ";".join(filt), "-map", "[out]", "-c:a", "pcm_s16le", "/v/mix.wav"], check=True)
print("mix.wav:", TL["total"], "s")
