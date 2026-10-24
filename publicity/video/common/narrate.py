# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
"""Reads a video's narration with a scratch voice (Piper, offline), one clip per scene.

Usage: python3 common/narrate.py <video folder> [scene numbers...]

Writes audio/sceneNN.wav from each scene's VO in the script, so the video can be timed,
captioned and watched before the narration is recorded. A real recording replaces a clip:
save it as audio/sceneNN.mp3 (or .wav) and run prepare.py, exactly as for the scratch voice.

Piper and its voice are downloaded once into common/tts/ (not in git) and run in the
python:3.12-slim image. Words a voice would misread are respelled for it by SAY below and by
the video's own "say" map in video.json; captions keep the script's spelling.
"""
import json, os, re, subprocess, sys, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build import parse_script

COMMON = os.path.dirname(os.path.abspath(__file__))
TTS = os.path.join(COMMON, "tts")
VOICE = "en_US-lessac-high"
VOICE_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/"
UID = f"{os.getuid()}:{os.getgid()}"
# Respellings every video shares.
SAY = [
    (r"\.ochx\b", " dot O-C-H-X"), (r"\.och\b", " dot O-C-H"), (r"\bochx\b", "O-C-H-X"),
    (r"timescale\.info", "timescale dot info"), (r"OpenChronology", "Open Chronology"),
    (r"\bGPL\b", "G-P-L"), (r"\bUTC\b", "U-T-C"), (r"\bHTML\b", "H-T-M-L"), (r"\bmacOS\b", "mac O-S"),
    (r"\bSI\b", "S-I"), (r"\bAPI\b", "A-P-I"), (r"\bOAuth\b", "oh-auth"), (r"\bpgmp\b", "P-G-M-P"),
    (r"\bSQLite\b", "S-Q-Lite"), (r"\bPostgreSQL\b", "Postgres-Q-L"), (r"\bjournald\b", "journal-D"),
    (r"\bsyslog\b", "sys-log"), (r"\bnginx\b", "engine-X"), (r"\bBigInt\b", "big-int"),
]


def ensure_piper():
    os.makedirs(os.path.join(TTS, "voices"), exist_ok=True)
    for ext in (".onnx", ".onnx.json"):
        path = os.path.join(TTS, "voices", VOICE + ext)
        if not os.path.exists(path):
            urllib.request.urlretrieve(VOICE_URL + VOICE + ext, path)
    if not os.path.exists(os.path.join(TTS, "pip", "piper")):
        subprocess.run(["docker", "run", "--rm", "--user", UID, "-e", "HOME=/tmp", "-v", f"{TTS}:/t",
                        "python:3.12-slim", "pip", "install", "-q", "--target", "/t/pip", "piper-tts"], check=True)


def spoken(text, extra):
    for pattern, repl in SAY + [(re.escape(k), v) for k, v in extra.items()]:
        text = re.sub(pattern, repl, text)
    return text


def main(folder, only):
    folder = os.path.abspath(folder)
    cfg = json.load(open(os.path.join(folder, "video.json")))
    scenes = parse_script(os.path.join(folder, cfg["script"]))
    ensure_piper()
    os.makedirs(os.path.join(folder, "audio"), exist_ok=True)
    for sc in scenes:
        if only and sc["id"] not in only:
            continue
        name = f"scene{sc['id']:02d}.wav"
        text = spoken(sc["vo"], cfg.get("say", {}))
        subprocess.run(["docker", "run", "--rm", "-i", "--user", UID, "-e", "HOME=/tmp", "-e", "PYTHONPATH=/t/pip",
                        "-v", f"{TTS}:/t", "-v", f"{folder}/audio:/o", "python:3.12-slim", "python", "-m", "piper",
                        "-m", f"/t/voices/{VOICE}.onnx", "--length-scale", str(cfg.get("pace", 1.25)),
                        "--sentence-silence", "0.35", "-f", f"/o/{name}"],
                       input=text, text=True, check=True, capture_output=True)
        print("scene", sc["id"], "->", "audio/" + name)


if __name__ == "__main__":
    main(sys.argv[1], [int(x) for x in sys.argv[2:]])
