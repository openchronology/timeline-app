# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Trims each narration clip to its speech and aligns its words with whisper.cpp.
"""Prepares a video's narration clips: trims each to its speech and aligns its words.

Usage: python3 common/prepare.py <video folder> [scene numbers...]   (default: every scene)

For each scene it reads audio/sceneNN.mp3, or audio/sceneNN.wav (a recording, record-button
clicks and all, or the scratch voice from narrate.py), and writes:
  cuts.json                 where the speech starts and ends in the clip
  trim/sceneNN.wav          the speech alone, 48 kHz, with 40 ms fades (used in the mix)
  transcripts/sceneNN.json  whisper.cpp's word timings for the trimmed clip (used for cues)

video.json's "segmentWords" (a list of scenes, off by default) fills in words whisper.cpp missed
in a scratch clip: a sentence of audio/sceneNN.segments.json (from narrate.py) with no word in
the transcript gets its words spread over the sentence's own time, so a list of one-word
sentences can't lose its cues.

Everything runs in Docker: linuxserver/ffmpeg for audio, and whisper.cpp built once from
source in debian:13 into common/whisper/ (not in git).
"""
import json, os, re, subprocess, sys, wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build import parse_script

COMMON = os.path.dirname(os.path.abspath(__file__))
UID = f"{os.getuid()}:{os.getgid()}"
WHISPER = "whisper/whisper.cpp/build/bin/whisper-cli"
MODEL = "whisper/ggml-small.en.bin"


def ffmpeg(folder):
    return ["docker", "run", "--rm", "--user", UID, "-v", f"{folder}:/v", "--entrypoint", "ffmpeg",
            "linuxserver/ffmpeg", "-hide_banner", "-nostats", "-y"]


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, text=True, **kw)


def speech_span(folder, wav16):
    """The speech in a clip: from the first to the last sound longer than 0.3 s (clicks are shorter)."""
    out = subprocess.run(ffmpeg(folder) + ["-i", f"/v/{wav16}", "-af", "silencedetect=noise=-40dB:d=0.35", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    marks = [float(l.split(": ")[1].split()[0]) for l in out.splitlines() if "silence_start:" in l or "silence_end:" in l]
    w = wave.open(os.path.join(folder, wav16))
    dur = w.getnframes() / w.getframerate()
    starts, ends = marks[0::2], marks[1::2] + [dur] * (len(marks[0::2]) - len(marks[1::2]))
    sounds, prev = [], 0.0
    for s, e in zip(starts, ends):
        if s > prev:
            sounds.append((prev, s))
        prev = e
    if prev < dur:
        sounds.append((prev, dur))
    speech = [x for x in sounds if x[1] - x[0] > 0.3] or [(0, dur)]
    return max(0, speech[0][0] - 0.15), min(dur, speech[-1][1] + 0.3)


def ensure_whisper():
    if not os.path.exists(os.path.join(COMMON, MODEL)):
        os.makedirs(os.path.join(COMMON, "whisper"), exist_ok=True)
        run(["curl", "-sSL", "-o", os.path.join(COMMON, MODEL),
             "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin"])
    if not os.path.exists(os.path.join(COMMON, WHISPER)):
        run(["docker", "run", "--rm", "-v", f"{COMMON}/whisper:/b", "-w", "/b", "debian:13", "sh", "-c",
             "apt-get update -qq && apt-get install -y -qq git cmake g++ make >/dev/null && "
             "git clone -q --depth 1 https://github.com/ggml-org/whisper.cpp && cd whisper.cpp && "
             "cmake -B build -DGGML_NATIVE=ON -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF >/dev/null && "
             f"cmake --build build -j --target whisper-cli >/dev/null && chown -R {UID} /b"])


def fill_segments(path, segs, cut):
    """Adds to whisper.cpp's transcript at path each narration sentence it has no word in, its
    words spread over the sentence's time by length (times in the clip trimmed from cut)."""
    tr = json.load(open(path))
    said = [t["offsets"]["from"] / 1000 for seg in tr["transcription"] for t in seg["tokens"]
            if re.search(r"[A-Za-z0-9]", t["text"]) and not t["text"].startswith("[")]
    added = 0
    for g in segs:
        s, e = g["start"] - cut, g["end"] - cut
        if e <= 0 or any(s - 0.1 <= x <= e + 0.1 for x in said):
            continue
        words = g["text"].split()
        total = sum(len(w) + 1 for w in words)
        tokens, at = [], max(0.0, s)
        for w in words:
            ms = round(at * 1000)
            tokens.append({"text": " " + w, "offsets": {"from": ms, "to": ms}, "t_dtw": -1})
            at += (e - s) * (len(w) + 1) / total
        tr["transcription"].append({"offsets": {"from": round(max(0.0, s) * 1000), "to": round(e * 1000)},
                                    "text": " " + g["text"], "tokens": tokens})
        added += 1
    tr["transcription"].sort(key=lambda seg: seg["offsets"]["from"])
    json.dump(tr, open(path, "w"), indent=2, ensure_ascii=False)
    if added:
        print(f"  {added} sentence(s) whisper.cpp missed, timed from the narration's own sentences")


def main(folder, only):
    folder = os.path.abspath(folder)
    cfg = json.load(open(os.path.join(folder, "video.json")))
    ids = [sc["id"] for sc in parse_script(os.path.join(folder, cfg["script"]))]
    os.chdir(folder)
    for d in ("wav", "trim", "transcripts"):
        os.makedirs(d, exist_ok=True)
    cuts = json.load(open("cuts.json")) if os.path.exists("cuts.json") else {}
    ensure_whisper()
    for i in only or ids:
        n = f"{i:02d}"
        src = next((f"audio/scene{n}.{e}" for e in ("mp3", "wav", "m4a") if os.path.exists(f"audio/scene{n}.{e}")), None)
        if not src:
            print(f"scene {i}: no recording in audio/, skipped")
            continue
        run(ffmpeg(folder) + ["-loglevel", "error", "-i", f"/v/{src}", "-ar", "16000", "-ac", "1", f"/v/wav/scene{n}.wav"])
        a, b = speech_span(folder, f"wav/scene{n}.wav")
        a += cfg.get("skip", {}).get(str(i), 0)
        cuts[str(i)] = [round(a, 3), round(b, 3)]
        run(ffmpeg(folder) + ["-loglevel", "error", "-ss", str(a), "-to", str(b), "-i", f"/v/{src}",
                              "-af", f"afade=t=in:d=0.04,afade=t=out:st={b - a - 0.04:.3f}:d=0.04", "-ar", "48000",
                              "-ac", "1", "-c:a", "pcm_s16le", f"/v/trim/scene{n}.wav"])
        run(ffmpeg(folder) + ["-loglevel", "error", "-i", f"/v/trim/scene{n}.wav", "-ar", "16000", "-ac", "1", f"/v/wav/scene{n}-trim.wav"])
        run(["docker", "run", "--rm", "-v", f"{folder}:/v", "-v", f"{COMMON}/whisper:/w", "debian:13", "sh", "-c",
             "apt-get update -qq >/dev/null && apt-get install -y -qq libgomp1 >/dev/null 2>&1; "
             f"/w/whisper.cpp/build/bin/whisper-cli -m /w/ggml-small.en.bin -f /v/wav/scene{n}-trim.wav -ojf "
             f"-of /v/transcripts/scene{n} -np -dtw small.en >/dev/null 2>&1 && chown {UID} /v/transcripts/scene{n}.json"])
        if i in cfg.get("segmentWords", []) and os.path.exists(f"audio/scene{n}.segments.json"):
            fill_segments(f"transcripts/scene{n}.json", json.load(open(f"audio/scene{n}.segments.json")), a)
        print(f"scene {i}: speech {a:.2f}-{b:.2f} s ({b - a:.1f} s)")
    json.dump(cuts, open("cuts.json", "w"), indent=1)
    names = sorted(n for n in os.listdir("transcripts") if n.endswith(".json"))
    rows = [(f"[`{n}`]({n})", f"Word timings of scene {int(n[5:7])}'s narration.") for n in names]
    w = max(len(r[0]) for r in rows)
    open("transcripts/README.md", "w").write(
        "# transcripts\n\nGenerated by [`prepare.py`](../../common/prepare.py): whisper.cpp's word timings (JSON, with DTW token times) "
        "for each scene's trimmed narration. Committed, so frames can be rendered without the audio or whisper.\n\n## Contents\n\n"
        f"| {'File'.ljust(w)} | What it is for                        |\n| {'-' * w} | ------------------------------------- |\n"
        + "".join(f"| {a.ljust(w)} | {b.ljust(37)} |\n" for a, b in rows))


if __name__ == "__main__":
    main(sys.argv[1], [int(x) for x in sys.argv[2:]])
