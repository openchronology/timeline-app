#!/bin/sh
# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Encodes a video's frames/, mix.wav and captions.srt into an MP4: H.264 1080p30, AAC, and an
# English caption track. Without mix.wav, the MP4 is silent (a draft for checking timing).
# Usage: common/encode.sh <video folder> [output.mp4]
set -e
cd "$1"
out="${2:-$(basename "$PWD").mp4}"
total=$(python3 -c "import json,re;print(json.loads(re.search(r'var TL = (.*);', open('timeline.js').read(), re.S).group(1))['total'])")
if [ -f mix.wav ]; then audio="-i /v/mix.wav"; amap="-map 1:a -c:a aac -b:a 192k"; sub=2; else audio=""; amap=""; sub=1; fi
# -t, not -shortest: the caption track ends before the video does.
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/v" --entrypoint ffmpeg linuxserver/ffmpeg \
  -hide_banner -loglevel error -y -framerate 30 -i /v/frames/%05d.jpg $audio -i /v/captions.srt \
  -map 0:v $amap -map $sub:s -c:v libx264 -preset slow -crf 20 -tune animation -pix_fmt yuv420p \
  -c:s mov_text -metadata:s:s:0 language=eng -movflags +faststart -t "$total" "/v/$out"
echo "$PWD/$out"
