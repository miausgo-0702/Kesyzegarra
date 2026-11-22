"""Genera un video-flyer animado (1080x1920, 9:16) con luces de DJ a partir de flyer.jpg.

Uso: python3 make_video.py   ->  crea flyer_dj.mp4 (con beat) y flyer_dj_sin_audio.mp4
"""
import math
import os
import subprocess
import wave

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
W, H, FPS = 1080, 1920, 30
BPM = 128
BEAT = 60.0 / BPM
BEATS = 32                      # 8 compases
DUR = BEATS * BEAT              # 15 s
NF = int(round(DUR * FPS))
SR = 44100
rng = np.random.default_rng(7)

# ---------------------------------------------------------------- imagen base
src = Image.open(os.path.join(HERE, "flyer.jpg")).convert("RGB").resize((W, H), Image.LANCZOS)
base_np = np.asarray(src).astype(np.float32) / 255.0

# máscara de texto blanco (para hacerlo brillar al ritmo)
lum = base_np.mean(axis=2)
sat = base_np.max(axis=2) - base_np.min(axis=2)
white = ((lum > 0.80) & (sat < 0.12)).astype(np.float32)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
# solo logo AURA (arriba) y "WEDE DJ" (abajo), no la sudadera
region = ((yy < 560) | (yy > 1610)).astype(np.float32)
text_mask = white * region
glow_img = Image.fromarray((text_mask * 255).astype(np.uint8))
text_glow = np.asarray(glow_img.filter(ImageFilter.GaussianBlur(18))).astype(np.float32) / 255.0
text_glow_wide = np.asarray(glow_img.filter(ImageFilter.GaussianBlur(45))).astype(np.float32) / 255.0

# máscara "detrás del DJ": zonas oscuras -> ahí las luces pegan más fuerte
dark = np.clip(1.0 - lum * 1.6, 0.15, 1.0)[..., None]

# --------------------------------------------------------------- campos para luces (a media resolución)
S = 2
h2, w2 = H // S, W // S
gy, gx = np.mgrid[0:h2, 0:w2].astype(np.float32) * S

def polar(ox, oy):
    return np.arctan2(gy - oy, gx - ox), np.hypot(gx - ox, gy - oy)

ORIGINS = {
    "tl": (-40, 380), "tr": (W + 40, 380),
    "bl": (120, H + 60), "br": (W - 120, H + 60),
    "top": (W / 2, -80),
}
FIELDS = {k: polar(*v) for k, v in ORIGINS.items()}

PURPLE = np.array([0.62, 0.25, 1.00], np.float32)
MAGENTA = np.array([1.00, 0.20, 0.85], np.float32)
CYAN = np.array([0.25, 0.85, 1.00], np.float32)
WHITE = np.array([1.0, 1.0, 1.0], np.float32)
BLUE = np.array([0.30, 0.35, 1.00], np.float32)

def beam(field, angle, width, reach=2400.0):
    a, r = field
    d = np.angle(np.exp(1j * (a - angle)))  # diferencia angular envuelta
    core = np.exp(-(d / width) ** 2)
    return core * np.exp(-r / reach)

def kick_env(t):
    ph = (t % BEAT) / BEAT
    return math.exp(-ph * 7.0)

# partículas / bokeh
NP = 70
px = rng.uniform(0, W, NP)
py = rng.uniform(0, H, NP)
pv = rng.uniform(40, 140, NP)
pr = rng.uniform(3, 11, NP)
pc = rng.integers(0, 3, NP)
PCOL = [PURPLE, MAGENTA, CYAN]

# ---------------------------------------------------------------- render
def render(i):
    t = i / FPS
    beat_i = int(t / BEAT)
    k = kick_env(t)
    bar_pos = beat_i % 4
    section = beat_i // 8           # cambia el "show" cada 2 compases

    # zoom suave + golpe de zoom con el bombo
    z = 1.0 + 0.035 * (t / DUR) + 0.012 * k
    cw, ch = W / z, H / z
    x0 = min(max((W - cw) / 2 + 6 * math.sin(t * 0.7), 0.0), W - cw)
    y0 = (H - ch) / 2
    img = src.resize((W, H), Image.BILINEAR, box=(x0, y0, x0 + cw, y0 + ch))
    frame = np.asarray(img).astype(np.float32) / 255.0
    frame *= 0.80 + 0.12 * k        # respira con el ritmo

    light = np.zeros((h2, w2, 3), np.float32)

    # láseres en abanico desde los costados
    n = 5
    sweep = math.sin(t * 1.6) * 0.35
    for side, base_ang, col in (("tl", 0.25, PURPLE if section % 2 == 0 else CYAN),
                                ("tr", math.pi - 0.25, MAGENTA if section % 2 == 0 else PURPLE)):
        sgn = 1 if side == "tl" else -1
        for j in range(n):
            ang = base_ang + sgn * (j * 0.13 + sweep)
            b = beam(FIELDS[side], ang, 0.010, 1600)
            light += b[..., None] * col * (1.6 + 1.2 * k)

    # cañones de luz desde abajo (detrás del DJ), cruzándose
    for side, col, ph in (("bl", MAGENTA, 0.0), ("br", BLUE, 1.7)):
        ang = -math.pi / 2 + 0.55 * math.sin(t * 0.9 + ph)
        b = beam(FIELDS[side], ang, 0.09, 1500)
        light += b[..., None] * col * 0.55

    # cenital que gira
    ang = math.pi / 2 + 0.45 * math.sin(t * 1.25)
    light += beam(FIELDS["top"], ang, 0.12, 1800)[..., None] * PURPLE * 0.5

    # haz blanco de "strobe" en compases alternos
    if section % 2 == 1 and bar_pos in (0, 2):
        for side in ("tl", "tr"):
            ang = (0.55 if side == "tl" else math.pi - 0.55) + 0.2 * math.sin(t * 3)
            light += beam(FIELDS[side], ang, 0.03, 1400)[..., None] * WHITE * 1.2 * k

    light_full = np.asarray(
        Image.fromarray(np.clip(light * 255, 0, 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)
    ).astype(np.float32) / 255.0
    light_full *= dark

    # bokeh flotando hacia arriba
    bok = np.zeros((H, W, 3), np.float32)
    for p in range(NP):
        y = (py[p] - pv[p] * t) % (H + 40) - 20
        x = px[p] + 18 * math.sin(t * 0.8 + p)
        r = pr[p]
        x1, x2 = int(max(0, x - 3 * r)), int(min(W, x + 3 * r))
        y1, y2 = int(max(0, y - 3 * r)), int(min(H, y + 3 * r))
        if x2 <= x1 or y2 <= y1:
            continue
        d2 = (xx[y1:y2, x1:x2] - x) ** 2 + (yy[y1:y2, x1:x2] - y) ** 2
        tw = 0.5 + 0.5 * math.sin(t * 4 + p * 1.3)
        bok[y1:y2, x1:x2] += np.exp(-d2 / (r * r))[..., None] * PCOL[pc[p]] * (0.35 + 0.5 * tw)

    # brillo del texto al ritmo
    tg = (text_glow * 0.9 + text_glow_wide * 0.8)[..., None]
    tcol = PURPLE if section % 2 == 0 else MAGENTA
    tglow = tg * tcol * (0.35 + 0.9 * k)

    # mezcla tipo "screen"
    add = light_full + bok + tglow
    out = 1.0 - (1.0 - frame) * (1.0 - np.clip(add, 0, 1))

    # flash estroboscópico en el 1 de cada compás (y doble en el último compás)
    flash = 0.0
    if bar_pos == 0:
        flash = 0.22 * k ** 3
    if beat_i >= BEATS - 4:
        ph = (t % (BEAT / 2)) / (BEAT / 2)
        flash = max(flash, 0.28 * math.exp(-ph * 9))
    out = out + (1.0 - out) * flash

    # viñeta
    vig = 1.0 - 0.35 * (((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.75)) ** 2)
    out *= vig[..., None]

    # intro desde negro con destello
    if t < 0.6:
        a = t / 0.6
        out = out * a + (1 - a) * 0.9 * (t < 0.08)
    # salida suave para que el loop no salte
    if t > DUR - 0.25:
        out *= (DUR - t) / 0.25 * 0.6 + 0.4

    return (np.clip(out, 0, 1) * 255).astype(np.uint8)

# ---------------------------------------------------------------- audio (beat house sintetizado)
def make_audio(path):
    n = int(DUR * SR)
    a = np.zeros(n, np.float32)
    tt = np.arange(int(0.45 * SR)) / SR
    kick = np.sin(2 * np.pi * (45 * tt + 90 * (1 - np.exp(-tt * 30)) / 30)) * np.exp(-tt * 9)
    nl = int(0.06 * SR)
    hat = rng.standard_normal(nl).astype(np.float32)
    hat = np.diff(hat, prepend=0) * np.exp(-np.arange(nl) / SR * 70)
    cl = int(0.2 * SR)
    clap = rng.standard_normal(cl).astype(np.float32) * np.exp(-np.arange(cl) / SR * 22)
    bl = int(BEAT / 2 * SR)
    bt = np.arange(bl) / SR
    notes = [55.0, 55.0, 65.41, 49.0]  # A, A, C, G
    chords = [[220, 261.6, 329.6], [220, 261.6, 329.6], [261.6, 329.6, 392.0], [196, 246.9, 293.7]]

    def put(sig, start, g):
        s = int(start * SR)
        e = min(n, s + len(sig))
        if s < n:
            a[s:e] += sig[: e - s] * g

    for b in range(BEATS):
        t0 = b * BEAT
        bar = (b // 4) % 4
        put(kick, t0, 0.9)
        put(hat, t0 + BEAT / 2, 0.25)
        if b % 2 == 1:
            put(clap, t0, 0.35)
        f = notes[bar]
        bass = np.sign(np.sin(2 * np.pi * f * bt)) * 0.5 + np.sin(2 * np.pi * f * bt)
        put(bass * np.exp(-bt * 6), t0 + BEAT / 2, 0.22)
        if b % 4 in (0, 3) and b >= 8:
            sl = int(0.25 * SR)
            st = np.arange(sl) / SR
            stab = sum(np.sin(2 * np.pi * fr * st) + 0.3 * np.sin(4 * np.pi * fr * st) for fr in chords[bar])
            put(stab * np.exp(-st * 12), t0 + (BEAT * 0.75 if b % 4 == 3 else 0), 0.10)
    a /= np.max(np.abs(a)) + 1e-6
    a = np.tanh(a * 1.4) * 0.85
    pcm = (a * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())

if __name__ == "__main__":
    wav = os.path.join(HERE, "_beat.wav")
    make_audio(wav)
    silent = os.path.join(HERE, "flyer_dj_sin_audio.mp4")
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
         "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", silent],
        stdin=subprocess.PIPE,
    )
    for i in range(NF):
        ff.stdin.write(render(i).tobytes())
        if i % 60 == 0:
            print(f"frame {i}/{NF}", flush=True)
    ff.stdin.close()
    ff.wait()
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", silent, "-i", wav, "-c:v", "copy",
         "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
         os.path.join(HERE, "flyer_dj.mp4")],
        check=True,
    )
    os.remove(wav)
    print("listo")
