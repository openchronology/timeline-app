# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Reads a script's narration with a scratch voice (Kokoro, offline), one clip per scene.
"""Reads a video's narration with a scratch voice (Kokoro, offline), one clip per scene.

Usage: python3 common/narrate.py <video folder> [scene numbers...]

Writes audio/sceneNN.wav from each scene's VO in the script, so the video can be timed,
captioned and watched before the narration is recorded. A real recording replaces a clip:
save it as audio/sceneNN.mp3 (or .wav) and run prepare.py, exactly as for the scratch voice.

Kokoro (82M) and its voice are downloaded once into common/tts/kokoro/ (not in git) and run
in the python:3.12-slim image, one container per video. Words a voice would misread are
respelled for it by SAY below and by the video's own "say" map in video.json; a respelling
can also give exact phonemes in Kokoro's own notation, as "[word](/phonemes/)". Captions keep
the script's spelling. video.json's "pace" (1.25: higher reads slower) and "silence" (seconds
between sentences, 0.35) set how quickly it reads; the shorts read faster.
"""
import json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build import parse_script

COMMON = os.path.dirname(os.path.abspath(__file__))
TTS = os.path.join(COMMON, "tts", "kokoro")
VOICE = "af_heart"
SPEED = 1.15  # Kokoro's speed at pace 1.0; a scene reads at SPEED / pace
UID = f"{os.getuid()}:{os.getgid()}"
# Respellings every video shares.
SAY = [
    (r"\.ochx\b", " dot O C H X"), (r"\.och\b", " dot O C H"), (r"\bochx\b", "O C H X"),
    (r"timescale\.info", "timescale dot info"), (r"OpenChronology", "Open Chronology"),
    (r"\bmacOS\b", "mac O S"), (r"\bOAuth\b", "oh auth"), (r"\bpgmp\b", "P G M P"),
    (r"\bSQLite\b", "S Q Lite"), (r"\bPostgreSQL\b", "Postgres Q L"), (r"\bjournald\b", "journal D"),
    (r"\bnginx\b", "engine X"), (r"\bBigInt\b", "big int"), (r"\bsystemd\b", "system D"),
    (r"\bTolkien's", "[Tolkien's](/tˈɔlkinz/)"), (r"\bSauron's", "[Sauron's](/sˈWɹɑnz/)"),
]


def ensure_kokoro():
    if not os.path.exists(os.path.join(TTS, "pip", "kokoro")):
        os.makedirs(TTS, exist_ok=True)
        pip = ["docker", "run", "--rm", "--user", UID, "-e", "HOME=/tmp", "-v", f"{TTS}:/t", "python:3.12-slim",
               "pip", "install", "-q", "--target", "/t/pip"]
        subprocess.run(pip + ["--extra-index-url", "https://download.pytorch.org/whl/cpu", "torch", "kokoro", "soundfile"],
                       check=True)
        subprocess.run(pip + ["--no-deps", "https://github.com/explosion/spacy-models/releases/download/"
                              "en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl"], check=True)


def spoken(text, extra):
    for pattern, repl in SAY:
        text = re.sub(pattern, repl, text)
    if extra:  # in one pass, longest first, so "Mirelle's" is not also respelled as "Mirelle"
        keys = sorted(extra, key=len, reverse=True)
        text = re.sub("|".join(map(re.escape, keys)), lambda m: extra[m.group(0)], text)
    return text


def sentences(text):
    """The text split after each sentence's full stop, question or exclamation mark."""
    return [s for s in re.split(r"(?<=[.?!])\s+(?=[A-Z\"'\[])", text.strip()) if s]


def speak(jobs):
    """Runs in the container: reads [{out, sentences, speed, silence}] and writes each clip."""
    import numpy as np, soundfile as sf, torch
    from kokoro import KPipeline
    torch.set_num_threads(int(os.environ.get("THREADS", "4")))
    pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    for job in jobs:
        gap = np.zeros(int(24000 * job["silence"]), dtype=np.float32)
        parts = []
        for s in job["sentences"]:
            parts += [a.numpy() for _, _, a in pipe(s, voice=VOICE, speed=job["speed"])] + [gap]
        sf.write(job["out"], np.concatenate(parts[:-1]), 24000)
        print("scene", job["id"], "->", "audio/" + os.path.basename(job["out"]), flush=True)


def main(folder, only):
    folder = os.path.abspath(folder)
    cfg = json.load(open(os.path.join(folder, "video.json")))
    scenes = parse_script(os.path.join(folder, cfg["script"]))
    ensure_kokoro()
    os.makedirs(os.path.join(folder, "audio"), exist_ok=True)
    jobs = [{"id": sc["id"], "out": f"/o/scene{sc['id']:02d}.wav", "speed": SPEED / cfg.get("pace", 1.25),
             "silence": cfg.get("silence", 0.35), "sentences": sentences(spoken(sc["vo"], cfg.get("say", {})))}
            for sc in scenes if not only or sc["id"] in only]
    subprocess.run(["docker", "run", "--rm", "-i", "--user", UID, "-e", "HOME=/tmp", "-e", "HF_HOME=/t/hf",
                    "-e", "PYTHONPATH=/t/pip", "-e", f"THREADS={os.environ.get('THREADS', '4')}",
                    "-v", f"{TTS}:/t", "-v", f"{COMMON}:/c:ro", "-v", f"{folder}/audio:/o", "python:3.12-slim",
                    "python", "-W", "ignore", "/c/narrate.py", "--speak"],
                   input=json.dumps(jobs), text=True, check=True, stderr=subprocess.DEVNULL)


if __name__ == "__main__":
    if sys.argv[1:] == ["--speak"]:
        speak(json.load(sys.stdin))
    else:
        main(sys.argv[1], [int(x) for x in sys.argv[2:]])
