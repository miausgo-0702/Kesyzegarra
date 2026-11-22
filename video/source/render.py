import cv2, numpy as np, subprocess, sys, math

D = np.load('layers.npz')
FPS = 30
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 12.0
OUT = sys.argv[1]
OW, OH = 1080, 1920
bg = D['bg']; Hs, Ws = bg.shape[:2]
sbg = D['sbg']; sf = D['sf']; ta = D['ta']
SH, SW = sbg.shape[:2]
Q = D['Q']; M = D['M']; Minv = np.linalg.inv(M)
rng = np.random.default_rng(7)

def clamp(x, a=0., b=1.): return max(a, min(b, x))
def eo(x): x = clamp(x); return 1 - (1 - x) ** 3
def eback(x, s=1.7):
    x = clamp(x); x -= 1; return x * x * ((s + 1) * x + s) + 1
def eio(x): x = clamp(x); return x * x * (3 - 2 * x)

class Layer:
    def __init__(self, x0, y0, F, A, B=None):
        A = A.astype(np.float32)
        if B is not None:
            a = np.maximum(A, 0.05)[..., None]
            Fu = np.clip((F - (1 - A[..., None]) * B) / a, 0, 255)
            Fu = np.where(A[..., None] < 0.05, F, Fu)
        else:
            Fu = F
        self.x0, self.y0 = float(x0), float(y0)
        self.F = Fu.astype(np.float32); self.A = A
        self.h, self.w = A.shape

    def comp(self, canvas, dx=0., dy=0., sc=1., op=1., blur=0, sx=None, rgbsplit=0):
        if op <= 0.003: return
        sx = sc if sx is None else sx
        cx, cy = self.w / 2, self.h / 2
        X0 = self.x0 + dx + cx; Y0 = self.y0 + dy + cy
        hw = self.w * max(sx, 1) / 2 + 12 + abs(rgbsplit); hh = self.h * max(sc, 1) / 2 + 12
        rx0 = int(math.floor(X0 - hw)); ry0 = int(math.floor(Y0 - hh))
        rx1 = int(math.ceil(X0 + hw)); ry1 = int(math.ceil(Y0 + hh))
        H, W = canvas.shape[:2]
        cx0, cy0, cx1, cy1 = max(rx0, 0), max(ry0, 0), min(rx1, W), min(ry1, H)
        if cx1 <= cx0 or cy1 <= cy0: return
        A_ = np.float32([[sx, 0, X0 - cx0 - sx * cx], [0, sc, Y0 - cy0 - sc * cy]])
        size = (cx1 - cx0, cy1 - cy0)
        F = cv2.warpAffine(self.F, A_, size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        a = cv2.warpAffine(self.A, A_, size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        if blur > 0.5:
            k = int(blur) * 2 + 1
            F = cv2.GaussianBlur(F, (k, 1), 0); a = cv2.GaussianBlur(a, (k, 1), 0)
        a = a * op
        roi = canvas[cy0:cy1, cx0:cx1]
        if rgbsplit:
            s = int(round(rgbsplit))
            for ch, sh in ((0, -s), (1, 0), (2, s)):
                Fc = np.roll(F[..., ch], sh, 1); ac = np.roll(a, sh, 1)
                roi[..., ch] = roi[..., ch] * (1 - ac) + Fc * ac
        else:
            roi[:] = roi * (1 - a[..., None]) + F * a[..., None]

EL = {}
for k in ['logo', 'dom', 'band', 'time', 'aura', 'tick', 'fer', 'car', 'wei', 'hei']:
    x0, y0 = D[k + '_pos']
    EL[k] = Layer(x0, y0, D[k + '_F'], D[k + '_A'], D[k + '_B'])

# darken inpainted areas under moving elements
U = np.zeros((Hs, Ws), np.float32)
for L_ in EL.values():
    x0, y0 = int(L_.x0), int(L_.y0)
    U[y0:y0 + L_.h, x0:x0 + L_.w] = np.maximum(U[y0:y0 + L_.h, x0:x0 + L_.w], L_.A)
U = cv2.GaussianBlur(cv2.dilate(U, np.ones((15, 15), np.uint8)), (0, 0), 8)
bg = bg * (1 - 0.55 * np.clip(U, 0, 1))[..., None]

# ticker rows (3 lines) as separate wrapping strips
tk = EL['tick']
prof = tk.A.sum(1)
rows = []
inrow = False
for y, v in enumerate(prof):
    if v > 3 and not inrow: inrow, s = True, y
    if v <= 3 and inrow:
        inrow = False
        if y - s > 4: rows.append((s, y))
if inrow: rows.append((s, len(prof)))

rows = [(0, 32), (32, 47), (47, tk.h)]
SPANS = []
for (r0, r1) in rows:
    xs = np.where(tk.A[r0:r1].max(0) > 0.15)[0]
    SPANS.append((int(xs.min()), int(xs.max()) + 1))

# title groups in rect space
tm = np.load('tmask.npy')
n, lab, st, cen = cv2.connectedComponentsWithStats(tm)
groups = {0: np.zeros_like(tm), 1: np.zeros_like(tm), 2: np.zeros_like(tm)}
for i in range(1, n):
    if st[i, 4] < 15: continue
    cy = cen[i][1]
    g = 0 if cy < 168 else (1 if cy < 318 else 2)
    groups[g][lab == i] = 255
TITLE = []
for g in range(3):
    m = cv2.GaussianBlur(cv2.dilate(groups[g], np.ones((31, 31), np.uint8)), (15, 15), 0) / 255.
    a = ta * m
    ys, xs = np.where(a > 0.01)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    TITLE.append(Layer(x0, y0, sf[y0:y1, x0:x1], a[y0:y1, x0:x1], sbg[y0:y1, x0:x1]))

# screen geometry
smask = np.zeros((Hs, Ws), np.float32)
cv2.fillConvexPoly(smask, Q.astype(np.int32), 1.0)
smask = cv2.GaussianBlur(smask, (5, 5), 0)
bx0, by0 = int(Q[:, 0].min()) - 4, int(Q[:, 1].min()) - 4
bx1, by1 = int(Q[:, 0].max()) + 4, int(Q[:, 1].max()) + 4
T = np.array([[1, 0, -bx0], [0, 1, -by0], [0, 0, 1]], np.float64)
MinvR = T @ Minv
smR = smask[by0:by1, bx0:bx1][..., None]

# off-screen look: near-black with sheen
yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32)
sheen = np.clip(1 - np.abs((xx * 0.55 + yy * 0.45) - 330) / 160, 0, 1) ** 2
OFF = np.stack([14 + 22 * sheen, 6 + 10 * sheen, 6 + 8 * sheen], -1).astype(np.float32)
OFF += sbg * 0.035
scan = np.ones((SH, 1, 1), np.float32); scan[::3] = 0.80; scan[1::3] = 0.95

# light leaks (low res)
LW, LH = 270, 472
ly, lx = np.mgrid[0:LH, 0:LW].astype(np.float32)
def blob(cx, cy, r):
    return np.exp(-(((lx - cx) ** 2 + (ly - cy) ** 2) / (2 * r * r)))
LEAKC = np.array([40, 120, 255], np.float32) / 255.

def screen_frame(t):
    T0 = 0.9
    te = t - T0
    if te < 0:
        return OFF.copy(), 0.0
    c = sbg.copy()
    # titles
    tg = te - 1.05
    if tg > 0:
        p = eo(tg / 0.5)
        gl = max(0, 1 - tg / 0.6)
        TITLE[0].comp(c, dx=-(1 - p) * 260 + 2.5 * math.sin(t * 1.7), dy=1.5 * math.sin(t * 2.3),
                      op=clamp(tg / 0.25), blur=gl * 14, rgbsplit=gl * 10)
    tg = te - 1.25
    if tg > 0:
        p = eo(tg / 0.5)
        gl = max(0, 1 - tg / 0.6)
        TITLE[1].comp(c, dx=(1 - p) * 260 - 2.5 * math.sin(t * 1.7 + 1), dy=1.5 * math.sin(t * 2.1 + 2),
                      op=clamp(tg / 0.25), blur=gl * 14, rgbsplit=gl * 10)
    tg = te - 1.55
    if tg > 0:
        p = eback(tg / 0.55)
        fl = 1.0
        if tg < 0.7:  # neon flicker on
            fl = [1, 0.2, 1, 0.1, 0.9, 0.3, 1][min(int(tg / 0.1), 6)]
        elif (t % 3.4) < 0.12:
            fl = 0.45
        TITLE[2].comp(c, sc=0.6 + 0.4 * p, dy=2 * math.sin(t * 2.7), op=fl * clamp(tg / 0.15))
    # CRT turn-on
    if te < 0.13:
        out = OFF.copy()
        p = eo(te / 0.13)
        w = SW * p; h = 3
        g = np.exp(-((yy - SH / 2) ** 2) / (2 * (h + 6 * (1 - p) + 2) ** 2))
        g *= (np.abs(xx - SW / 2) < w / 2 + 1)
        out = out + g[..., None] * 255
        return np.clip(out, 0, 255), 0.4 * p
    if te < 0.42:
        p = eo((te - 0.13) / 0.29)
        h = max(4, int(SH * p))
        sq = cv2.resize(c, (SW, h), interpolation=cv2.INTER_AREA)
        out = OFF * 0.3
        out = out.copy()
        y0 = (SH - h) // 2
        out[y0:y0 + h] = sq
        wht = (1 - p) * 0.85 + 0.15
        out[y0:y0 + h] = out[y0:y0 + h] * (1 - wht) + 255 * wht
        edge = np.exp(-((yy - y0) ** 2) / 18) + np.exp(-((yy - (y0 + h)) ** 2) / 18)
        out = out + edge[..., None] * 200
        return np.clip(out, 0, 255), 0.4 + 0.5 * p
    # settled / settling
    k = max(0.0, 1 - (te - 0.42) / 1.3)  # decay of turn-on artifacts
    glitch = 0.0
    for gt in (6.6, 9.7):
        if 0 <= t - gt < 0.28: glitch = 1 - (t - gt) / 0.28
    out = c
    over = 0.55 * k ** 2
    flick = 1 + 0.04 * math.sin(t * 47) + 0.03 * math.sin(t * 13.3)
    out = out * flick * (1 + over) + 255 * over * 0.35
    jit = k * 18 + glitch * 40
    if jit > 0.5:
        out = out.copy()
        nb = int(6 + 10 * glitch)
        for _ in range(nb):
            y = rng.integers(0, SH - 10); hh = rng.integers(4, 40 if glitch else 18)
            sh = int(rng.normal(0, jit))
            out[y:y + hh] = np.roll(out[y:y + hh], sh, 1)
    split = int(round(1 + k * 8 + glitch * 9))
    out = out.copy()
    out[..., 0] = np.roll(out[..., 0], -split, 1)
    out[..., 2] = np.roll(out[..., 2], split, 1)
    # rolling bar
    ry = ((t * 230) % (SH + 300)) - 150
    bar = np.exp(-((yy[:, :1] - ry) ** 2) / (2 * 45 ** 2))[..., None]
    out = out * (1 + 0.10 * bar) + 10 * bar
    nz = 6 + 60 * k ** 1.5 + 50 * glitch
    out = out + rng.normal(0, nz, (SH // 2, SW // 2, 1)).astype(np.float32).repeat(2, 0).repeat(2, 1)
    out = out * scan
    return np.clip(out, 0, 255), 1.0 - 0.1 * k

def frame(i):
    t = i / FPS
    cv = bg.copy()
    # light leaks
    L = (blob(40 + 30 * math.sin(t * 0.6), 60 + 20 * math.sin(t * 0.9), 70) * (0.35 + 0.15 * math.sin(t * 1.3)) +
         blob(250 + 15 * math.sin(t * 0.7 + 1), 300 + 60 * math.sin(t * 0.45), 60) * (0.30 + 0.15 * math.sin(t * 1.1 + 2)) +
         blob(-20 + 300 * ((t * 0.09) % 1.4), 200 + 40 * math.sin(t), 45) * 0.25)
    L = cv2.resize(L.astype(np.float32), (Ws, Hs))[..., None] * LEAKC * 255
    cv = 255 - (255 - cv) * (255 - L) / 255
    # screen
    s, glow = screen_frame(t)
    sw = cv2.warpPerspective(s, MinvR, (bx1 - bx0, by1 - by0), flags=cv2.INTER_LINEAR)
    roi = cv[by0:by1, bx0:bx1]
    roi[:] = roi * (1 - smR) + sw * smR
    # glow spill from the screen onto the bezel
    if glow > 0:
        small = cv2.resize(sw * smR, None, fx=0.125, fy=0.125, interpolation=cv2.INTER_AREA)
        small = cv2.GaussianBlur(small, (0, 0), 9)
        gl = cv2.resize(small, (bx1 - bx0, by1 - by0))
        roi[:] = roi + gl * (1 - smR) * 0.55 * glow
    # logo: neon flicker in + gentle float
    tl = t - 0.15
    if tl > 0:
        fl = 1.0
        if tl < 0.8:
            fl = [0.0, 0.8, 0.1, 1, 0.3, 0.0, 1, 0.6][min(int(tl / 0.1), 7)]
        elif (t % 4.1) < 0.08:
            fl = 0.4
        EL['logo'].comp(cv, dy=-(1 - eo(tl / 0.6)) * 40 + 3 * math.sin(t * 1.6), op=fl)
    # info blocks
    for k, t0, dirx in (('dom', 2.4, -1), ('band', 2.55, 1), ('time', 2.75, -1), ('aura', 2.9, 1)):
        tt = t - t0
        if tt > 0:
            p = eback(tt / 0.65, 1.3)
            EL[k].comp(cv, dx=dirx * (1 - p) * 330, dy=2.2 * math.sin(t * 1.9 + t0 * 3),
                       op=clamp(tt / 0.3), blur=max(0, 1 - tt / 0.4) * 18)
    # ticker: rows scroll alternating directions
    tt = t - 3.15
    if tt > 0:
        op = clamp(tt / 0.4)
        L_ = EL['tick']
        tmpF = L_.F; tmpA = L_.A
        F2 = tmpF.copy(); A2 = tmpA.copy()
        for j, (r0, r1) in enumerate(rows):
            xa, xb = SPANS[j]
            seg_F = tmpF[r0:r1, xa:xb]; seg_A = tmpA[r0:r1, xa:xb]
            gap = 10
            per = (xb - xa) + gap
            reps = L_.w // per + 3
            tf = np.zeros((r1 - r0, per * reps, 3), np.float32); tA = np.zeros((r1 - r0, per * reps), np.float32)
            for q in range(reps):
                tf[:, q * per:q * per + xb - xa] = seg_F; tA[:, q * per:q * per + xb - xa] = seg_A
            off = int((t * 40) % per)
            if j % 2: off = per - off
            o0 = off + per - xa
            F2[r0:r1] = tf[:, o0:o0 + L_.w]; A2[r0:r1] = tA[:, o0:o0 + L_.w]
        fade = np.clip(np.minimum(np.arange(L_.w), L_.w - 1 - np.arange(L_.w)) / 30, 0, 1)[None, :]
        L_.F, L_.A = F2, A2 * fade
        L_.comp(cv, dy=(1 - eo(tt / 0.5)) * 25, op=op)
        L_.F, L_.A = tmpF, tmpA
    # sponsors pop
    for j, k in enumerate(('fer', 'car', 'wei', 'hei')):
        tt = t - (3.4 + j * 0.15)
        if tt > 0:
            p = eback(tt / 0.55, 2.2)
            EL[k].comp(cv, sc=max(0.01, p), dy=(1 - eo(tt / 0.4)) * 60 + 4 * math.sin(t * 2.2 + j * 1.3),
                       op=clamp(tt / 0.2))
    # camera
    s0 = OH / Hs
    e = eio(t / 2.8)
    zin = 1 + 0.08 * (1 - e)
    z = zin * (1.025 + 0.02 * math.sin(t * 0.7))
    ang = 0.5 * math.sin(t * 0.55) + 1.5 * (1 - eio(t / 2.6))
    if 6.6 <= t < 6.75 or 9.7 <= t < 9.85:  # camera shake with the glitch
        ang += rng.normal(0, 0.4)
    cx, cy = Ws / 2 + 8 * math.sin(t * 0.8), Hs / 2 + 10 * math.cos(t * 0.6) - (Hs / 2 - 870) * (1 - e)
    A_ = cv2.getRotationMatrix2D((cx, cy), ang, z * s0)
    A_[0, 2] += OW / 2 - cx; A_[1, 2] += OH / 2 - cy
    out = cv2.warpAffine(cv, A_, (OW, OH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    # beat flash (subtle pulse every ~0.5s after everything is in)
    if t > 4:
        out = out * (1 + 0.035 * max(0, math.cos(t * 2 * math.pi * 1.0)) ** 8)
    # fade in from black at start
    out = out * eo(t / 0.35)
    # grain
    g = rng.normal(0, 5, (OH // 2, OW // 2, 1)).astype(np.float32)
    out = out + cv2.resize(g, (OW, OH))[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)

if __name__ == '__main__':
    if OUT.endswith('.png'):
        for tt in sys.argv[3:]:
            cv2.imwrite(OUT.replace('.png', f'_{tt}.png'), cv2.resize(frame(int(float(tt) * FPS)), None, fx=0.5, fy=0.5))
        sys.exit()
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{OW}x{OH}',
                          '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-crf', '23', '-preset', 'medium', '-maxrate', '10M', '-bufsize', '20M',
                          '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], stdin=subprocess.PIPE)
    for i in range(int(DUR * FPS)):
        p.stdin.write(frame(i).tobytes())
    p.stdin.close(); p.wait()
