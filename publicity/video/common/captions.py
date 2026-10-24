# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Writes a video's captions.srt in the script's wording, timed from the narration.
"""Writes a video's captions.srt: the script's wording, timed from the narration's alignment.

Usage: python3 common/captions.py <video folder>

Words said beyond the script (a longer phrasing in a take) are kept; mishearings are not.
Without an alignment, the estimated word times from build.py are used.
"""
import difflib, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build import parse_script

norm = lambda w: re.sub(r"[^a-z0-9]", "", w.lower())


def raw_words(folder, i):
    path = os.path.join(folder, "transcripts", f"scene{i:02d}.json")
    if not os.path.exists(path):
        return None
    out = []
    for seg in json.load(open(path))["transcription"]:
        first = True
        for tok in seg["tokens"]:
            tx = tok["text"]
            if tx.startswith("[_") or "<|" in tx:
                continue
            t = tok.get("t_dtw", -1)
            t = t / 100 if t is not None and t >= 0 else tok["offsets"]["from"] / 1000
            brk = out and re.search(r"[.!?—-]$", out[-1][0]) and re.match(r"[A-Z]", tx)
            if tx.startswith(" ") or not out or first or brk:
                out.append([tx.strip(), t])
            else:
                out[-1][0] += tx
            first = False
    return [w for w in out if norm(w[0])]


def ts(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def main(folder):
    folder = os.path.abspath(folder)
    cfg = json.load(open(os.path.join(folder, "video.json")))
    vo = {sc["id"]: sc["vo"] for sc in parse_script(os.path.join(folder, cfg["script"]))}
    TL = json.loads(re.search(r"var TL = (.*);\s*$", open(os.path.join(folder, "timeline.js")).read(), re.S).group(1))
    cues = []
    for sc in TL["scenes"]:
        i = sc["id"]
        script = vo[i].split()
        heard = raw_words(folder, i) if i not in TL.get("estimated", []) else None
        base = sc["start"] + sc["voice"]
        words = []
        if heard:
            S, H = [norm(w) for w in script], [norm(w[0]) for w in heard]
            for op, a1, a2, b1, b2 in difflib.SequenceMatcher(a=S, b=H, autojunk=False).get_opcodes():
                if op == "equal":
                    words += [(script[a1 + k], heard[b1 + k][1]) for k in range(a2 - a1)]
                elif op == "insert":
                    if b1 == 0:
                        continue
                    words += [(heard[b1 + k][0], heard[b1 + k][1]) for k in range(b2 - b1)]
                elif op == "delete":
                    t = heard[min(b1, len(heard) - 1)][1]
                    words += [(w, t) for w in script[a1:a2]]
                else:
                    # A respelled word ("dot O-C-H-X") reads back as the script's (".ochx").
                    tt = [heard[min(b1 + k, b2 - 1)][1] for k in range(a2 - a1)]
                    words += list(zip(script[a1:a2], tt))
        else:
            times = dict(enumerate(t for _, t in sc["words"]))
            k = 0
            for w in script:
                words.append((w, times.get(k, times.get(len(times) - 1, 0))))
                if norm(w):
                    k += 1
        chunk = []

        def flush(end):
            if chunk:
                cues.append([base + chunk[0][1], end, " ".join(w for w, _ in chunk)])

        for w, t in words:
            text = " ".join(x for x, _ in chunk + [(w, t)])
            if chunk and (len(text) > 80 or (len(text) > 50 and re.search(r"[.,;:]$", chunk[-1][0]))):
                flush(base + t - 0.05)
                chunk = []
            chunk.append((w, t))
        flush(base + sc["speech"] + 0.4)
    lines = []
    for n, (a, b, text) in enumerate(cues, 1):
        if n < len(cues):
            b = min(b, cues[n][0] - 0.02)
        if len(text) > 42:
            ws = text.split()
            best = min(range(1, len(ws)), key=lambda k: abs(len(" ".join(ws[:k])) - len(text) / 2))
            text = " ".join(ws[:best]) + "\n" + " ".join(ws[best:])
        lines.append(f"{n}\n{ts(a)} --> {ts(b)}\n{text}\n")
    open(os.path.join(folder, "captions.srt"), "w").write("\n".join(lines))
    print(len(cues), "captions")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
