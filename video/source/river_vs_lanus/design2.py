import cv2, numpy as np, subprocess, sys, math
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 12.0
FPS = 30
W, H = 1080, 1920
rng = np.random.default_rng(11)
D = np.load('layers.npz')
SRC = cv2.imread('/root/.claude/uploads/644ebc2f-86f6-5665-8422-0e518f737ee6/55856d23-image.jpg').astype(np.float32)
BLK = '/usr/share/fonts/opentype/inter/InterDisplay-Black.otf'
BLKI = '/usr/share/fonts/opentype/inter/InterDisplay-BlackItalic.otf'
XB = '/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf'

LILAC = np.array([243, 216, 228], np.float32)
RED = (40, 30, 215); MAR = (62, 24, 118); DMAR = (48, 16, 92); WHITE = (255, 255, 255)

def clamp(x, a=0., b=1.): return max(a, min(b, x))
def eo(x): x = clamp(x); return 1 - (1 - x) ** 3
def eo5(x): x = clamp(x); return 1 - (1 - x) ** 5
def eback(x, s=1.7):
    x = clamp(x); x -= 1; return x * x * ((s + 1) * x + s) + 1
def eio(x): x = clamp(x); return x * x * (3 - 2 * x)

class Layer:
    def __init__(self, F, A, x0, y0):
        self.F = F.astype(np.float32); self.A = A.astype(np.float32)
        self.h, self.w = A.shape; self.x0, self.y0 = float(x0), float(y0)

    @staticmethod
    def centered(F, A, cx, cy):
        return Layer(F, A, cx - A.shape[1] / 2, cy - A.shape[0] / 2)

    def comp(self, canvas, dx=0., dy=0., sc=1., op=1., ang=0., sx=None, add=None, blurx=0, F=None, A=None):
        if op <= 0.003 or sc <= 0.001: return
        sx = sc if sx is None else sx
        Fs = self.F if F is None else F
        As = self.A if A is None else A
        cx, cy = self.w / 2, self.h / 2
        X0 = self.x0 + dx + cx; Y0 = self.y0 + dy + cy
        ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        if ang:
            r = math.hypot(self.w * sx, self.h * sc) / 2 + 6; hw = hh = r
        else:
            hw = self.w * sx / 2 + 6; hh = self.h * sc / 2 + 6
        hw += blurx
        cx0, cy0 = max(int(X0 - hw), 0), max(int(Y0 - hh), 0)
        cx1, cy1 = min(int(X0 + hw) + 1, W), min(int(Y0 + hh) + 1, H)
        if cx1 <= cx0 or cy1 <= cy0: return
        M = np.float32([[ca * sx, -sa * sc, 0], [sa * sx, ca * sc, 0]])
        M[0, 2] = X0 - cx0 - (M[0, 0] * cx + M[0, 1] * cy)
        M[1, 2] = Y0 - cy0 - (M[1, 0] * cx + M[1, 1] * cy)
        size = (cx1 - cx0, cy1 - cy0)
        if add is not None: Fs = Fs + add
        Fw = cv2.warpAffine(Fs, M, size, flags=cv2.INTER_LINEAR)
        a = cv2.warpAffine(As, M, size, flags=cv2.INTER_LINEAR)
        if blurx > 0.5:
            k = int(blurx) * 2 + 1
            Fw = cv2.blur(Fw, (k, 1)); a = cv2.blur(a, (k, 1))
        a = (a * op)[..., None]
        roi = canvas[cy0:cy1, cx0:cx1]
        roi[:] = roi * (1 - a) + np.clip(Fw, 0, 255) * a

def text_layer(txt, font, size, fill, stroke=0, stroke_fill=None, outline_only=False, pad=20, spacing=0):
    f = ImageFont.truetype(font, size)
    tmp = ImageDraw.Draw(Image.new('L', (10, 10)))
    bb = tmp.textbbox((0, 0), txt, font=f, stroke_width=stroke)
    w, h = bb[2] - bb[0] + 2 * pad, bb[3] - bb[1] + 2 * pad
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pos = (pad - bb[0], pad - bb[1])
    if outline_only == 'both':
        d.text(pos, txt, font=f, fill=fill + (255,), stroke_width=stroke, stroke_fill=stroke_fill + (255,))
        m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).text(pos, txt, font=f, fill=255)
        arr = np.array(img).astype(np.float32)
        return arr[..., :3][..., ::-1].copy(), arr[..., 3] / 255, np.array(m).astype(np.float32) / 255
    if outline_only:
        d.text(pos, txt, font=f, fill=(0, 0, 0, 0), stroke_width=stroke, stroke_fill=stroke_fill + (255,))
        m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).text(pos, txt, font=f, fill=255)
        a = np.array(img)[..., 3].astype(np.float32) * (1 - np.array(m).astype(np.float32) / 255)
        F = np.zeros((h, w, 3), np.float32); F[:] = stroke_fill
        return F, a / 255
    d.text(pos, txt, font=f, fill=fill + (255,), stroke_width=stroke,
           stroke_fill=(stroke_fill or fill) + (255,))
    arr = np.array(img).astype(np.float32)
    return arr[..., [2, 1, 0]] if False else arr[..., :3][..., ::-1].copy(), arr[..., 3] / 255

def from_npz(n, scale):
    x0, y0 = D[n + '_pos']; F = D[n + '_F']; A = D[n + '_A'].astype(np.float32); B = D[n + '_B']
    a = A[..., None]
    Fu = np.where(a < 0.05, F, np.clip((F - (1 - a) * B) / np.maximum(a, 0.05), 0, 255))
    F2 = cv2.resize(Fu, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    A2 = np.clip(cv2.resize(A, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC), 0, 1)
    F2 = cv2.addWeighted(F2, 1.4, cv2.GaussianBlur(F2, (0, 0), 1.5), -0.4, 0)
    return F2, A2

# ---------------- static background ----------------
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
BG = np.empty((H, W, 3), np.float32)
grad = (1 - yy / H)[..., None]
BG[:] = LILAC * (0.96 + 0.06 * grad)
BG += rng.normal(0, 2.0, (H, W, 1)).astype(np.float32)
# soft diagonal hatching in corners
hatch = ((((xx + yy) // 9) % 2 == 0) & ((xx - yy * 0.0) < 9999)).astype(np.float32)
corner = np.clip(1 - np.hypot(xx - 0, yy - H) / 520, 0, 1) + np.clip(1 - np.hypot(xx - W, yy - 0) / 420, 0, 1)
BG -= (hatch * corner * 18)[..., None]
BG = np.clip(BG, 0, 255)

def dots_layer(cols, rows, step, r, color):
    w, h = cols * step + 2 * r + 4, rows * step + 2 * r + 4
    a = np.zeros((h, w), np.float32)
    for i in range(cols):
        for j in range(rows):
            cv2.circle(a, (r + 2 + i * step, r + 2 + j * step), r, 1.0, -1, cv2.LINE_AA)
    F = np.zeros((h, w, 3), np.float32); F[:] = color
    return F, a

# marquee strips (outline team names)
mq_F, mq_A = text_layer('RIVER PLATE  ·  LANÚS  ·  ', BLK, 170, WHITE, stroke=3, stroke_fill=(150, 110, 150), outline_only=True, pad=6)
MQW = mq_A.shape[1]
def marquee(canvas, y, t, speed, op):
    off = (t * speed) % MQW
    reps = W // MQW + 3
    A = np.tile(mq_A, (1, reps)); F = np.tile(mq_F, (1, reps, 1))
    x = int(off)
    Lr = Layer(F[:, x:x + W + 2], A[:, x:x + W + 2] * 0.55, 0, y)
    Lr.comp(canvas, op=op)

# ---------------- bands with stadium photos ----------------
def band(photos, tint, size, ang):
    bw, bh = size
    tiles = [cv2.resize(SRC[y0:y1, x0:x1], (int((x1 - x0) * bh / (y1 - y0)), bh), interpolation=cv2.INTER_CUBIC)
             for (x0, y0, x1, y1) in photos]
    strip = np.concatenate(tiles * (bw // sum(t.shape[1] for t in tiles) + 2), 1)[:, :bw]
    strip = cv2.GaussianBlur(strip, (0, 0), 1.2)
    lum = strip.mean(2, keepdims=True) / 255
    tint = np.array(tint, np.float32)
    F = tint * 0.35 + lum * (tint * 0.9 + 255 * 0.55 * lum)
    # halftone-ish dots + speed lines
    by, bx = np.mgrid[0:bh, 0:bw].astype(np.float32)
    ht = ((np.sin(bx * 0.5) * np.sin(by * 0.5)) > 0.6).astype(np.float32)
    F = F * (1 - 0.10 * ht[..., None])
    sl = (np.abs(((bx - by * 0.18) % 60) - 30) < 1.2).astype(np.float32)
    F = F + 18 * sl[..., None]
    # edge stripes
    F[:10] = F[:10] * 0.4 + 255 * 0.6; F[-10:] = F[-10:] * 0.6
    A = np.ones((bh, bw), np.float32)
    fade = np.clip(np.minimum(bx, bw - 1 - bx) / 160, 0, 1)
    A *= fade
    pad = 260
    Fp = np.zeros((bh + 2 * pad, bw, 3), np.float32); Ap = np.zeros((bh + 2 * pad, bw), np.float32)
    Fp[pad:pad + bh] = F; Ap[pad:pad + bh] = A
    M = cv2.getRotationMatrix2D((bw / 2, bh / 2 + pad), ang, 1)
    return cv2.warpAffine(Fp, M, (bw, bh + 2 * pad)), cv2.warpAffine(Ap, M, (bw, bh + 2 * pad))

ANG = 9
redF, redA = band([(110, 300, 315, 520), (110, 800, 300, 990)], RED, (1500, 400), ANG)
marF, marA = band([(445, 560, 650, 740), (445, 990, 650, 1200)], MAR, (1500, 400), ANG)
RB = Layer.centered(redF, redA, 540, 720)
MB = Layer.centered(marF, marA, 540, 1290)

# crests / logo / lpf
rF, rA = from_npz('river', 1.75); RC = Layer.centered(rF, rA, 250, 735)
lF, lA = from_npz('lanus', 1.6); LC = Layer.centered(lF, lA, 835, 1255)
gF, gA = from_npz('logo', 1.45); LOGO = Layer.centered(gF, gA, 540, 180)
pF, pA = from_npz('lpf', 1.5)
# lpf white interior got keyed out: put it on a white badge
bh_, bw_ = pA.shape
badgeA = np.zeros_like(pA); cv2.rectangle(badgeA, (4, 4), (bw_ - 5, bh_ - 5), 1.0, -1)
pF = pF * pA[..., None] + 255 * (1 - pA[..., None])
LPF = Layer.centered(pF, np.maximum(pA, badgeA * 0.0), 540, 1846)

def rot_text(txt, font, size, fill, cx, cy, ang=ANG, **kw):
    F, A = text_layer(txt, font, size, fill, **kw)
    pad = 60
    F = cv2.copyMakeBorder(F, pad, pad, pad, pad, cv2.BORDER_CONSTANT); A = cv2.copyMakeBorder(A, pad, pad, pad, pad, cv2.BORDER_CONSTANT)
    M = cv2.getRotationMatrix2D((A.shape[1] / 2, A.shape[0] / 2), ang, 1)
    F = cv2.warpAffine(F, M, (A.shape[1], A.shape[0])); A = cv2.warpAffine(A, M, (A.shape[1], A.shape[0]))
    return Layer.centered(F, A, cx, cy)

def shadowed(L, off=(10, 10), color=(40, 10, 60), op=0.45):
    A = cv2.GaussianBlur(L.A, (0, 0), 3) * op
    F = np.zeros_like(L.F); F[:] = color
    return Layer(F, A, L.x0 + off[0], L.y0 + off[1])

T_RIVER = rot_text('RIVER', BLKI, 150, WHITE, 700, 640)
T_PLATE = rot_text('PLATE', BLKI, 150, WHITE, 730, 775)
T_LANUS = rot_text('LANÚS', BLKI, 150, WHITE, 345, 1320)
S_RIVER, S_PLATE, S_LANUS = shadowed(T_RIVER), shadowed(T_PLATE), shadowed(T_LANUS)
# VS: big gradient letters with outline
vF, vA, vM = text_layer('VS', BLKI, 300, WHITE, stroke=10, stroke_fill=WHITE, pad=40, outline_only='both')
g = np.linspace(0, 1, vA.shape[0])[:, None, None]
fillF = np.array(RED, np.float32) * (1 - g) + np.array(DMAR, np.float32) * g
VS_F = (fillF * vM[..., None] + 255.0 * (1 - vM[..., None])).astype(np.float32)
VS = Layer.centered(VS_F, vA, 545, 1005)
VS_SH = shadowed(VS, off=(14, 14), op=0.5)
# lightning slash behind VS
slA = np.zeros((520, 260), np.float32)
pts = np.array([[150, 0], [70, 250], [140, 250], [60, 520], [210, 210], [140, 210], [230, 0]], np.int32)
cv2.fillPoly(slA, [pts], 1.0, cv2.LINE_AA)
slF = np.zeros((520, 260, 3), np.float32); slF[:] = (255, 255, 255)
SLASH = Layer.centered(slF, slA, 545, 1000)

# info block
boxW, boxH = 560, 150
bxF = np.zeros((boxH, boxW, 3), np.float32); bxF[:] = MAR
bxA = np.zeros((boxH, boxW), np.float32)
cv2.fillPoly(bxA, [np.array([[30, 0], [boxW, 0], [boxW - 30, boxH], [0, boxH]], np.int32)], 1.0, cv2.LINE_AA)
BOX = Layer.centered(bxF, bxA, 540, 1590)
T_TIME = Layer.centered(*text_layer('19:00 HS', BLKI, 108, WHITE), 515, 1592)
X_F, X_A = text_layer('✕✕✕', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 34, WHITE, pad=4)
XX = Layer.centered(X_F, X_A, 775, 1545)
pillW, pillH = 600, 74
plF = np.zeros((pillH, pillW, 3), np.float32); plF[:] = RED
plA = np.zeros((pillH, pillW), np.float32)
cv2.fillPoly(plA, [np.array([[20, 0], [pillW, 0], [pillW - 20, pillH], [0, pillH]], np.int32)], 1.0, cv2.LINE_AA)
PILL = Layer.centered(plF, plA, 540, 1718)
T_PILL = Layer.centered(*text_layer('EN VIVO EN AURA BAR', XB, 44, WHITE), 540, 1718)
T_TAG = Layer.centered(*text_layer('LIGA PROFESIONAL', XB, 30, DMAR), 540, 1488)

# decorations
D1 = Layer(*dots_layer(9, 5, 22, 3, MAR), 60, 380)
D2 = Layer(*dots_layer(8, 4, 22, 3, MAR), 820, 1700)
D3 = Layer(*dots_layer(6, 1, 24, 4, RED), 60, 1010)
D4 = Layer(*dots_layer(6, 1, 24, 4, MAR), 880, 1010)
def stripes(n, length, thick, gap, color, ang):
    w = n * gap + 40; h = length + 40
    a = np.zeros((h, w), np.float32)
    for i in range(n):
        cv2.rectangle(a, (20 + i * gap, 20), (20 + i * gap + thick, 20 + length), 1.0, -1)
    F = np.zeros((h, w, 3), np.float32); F[:] = color
    pad = 80
    F = cv2.copyMakeBorder(F, pad, pad, pad, pad, cv2.BORDER_CONSTANT); a = cv2.copyMakeBorder(a, pad, pad, pad, pad, cv2.BORDER_CONSTANT)
    M = cv2.getRotationMatrix2D((a.shape[1] / 2, a.shape[0] / 2), ang, 1)
    return cv2.warpAffine(F, M, (a.shape[1], a.shape[0])), cv2.warpAffine(a, M, (a.shape[1], a.shape[0]))
ST1 = Layer.centered(*stripes(4, 210, 16, 34, RED, -40), 950, 430)
ST2 = Layer.centered(*stripes(4, 210, 16, 34, MAR, -40), 120, 1560)

def sweep(L, t, period, t0):
    ph = ((t - t0) % period) / 0.7
    if t < t0 or ph > 1: return None
    y, x = np.mgrid[0:L.h, 0:L.w].astype(np.float32)
    pos = -80 + (L.w + L.h + 160) * ph
    return (np.exp(-((x + y * 0.6 - pos) ** 2) / (2 * 18 ** 2)) * 110)[..., None]

# flashes in bands
flashes = []
for _ in range(int(DUR * 6)):
    if rng.random() < 0.5:
        x, y = rng.uniform(420, 1040), 720 + rng.uniform(-150, 150) - (rng.uniform(420, 1040) - 540) * math.tan(math.radians(ANG))
    else:
        x, y = rng.uniform(40, 620), 1290 + rng.uniform(-150, 150)
    y = y - (x - 540) * math.tan(math.radians(ANG)) * 0
    flashes.append((rng.uniform(1.2, DUR), x, y, rng.uniform(2.5, 5)))

def add_flashes(cv, t):
    for (ft, x, y, s) in flashes:
        dt = t - ft
        if 0 <= dt < 0.16:
            k = (1 - dt / 0.16) ** 2
            x0, x1 = int(max(x - 50, 0)), int(min(x + 51, W)); y0, y1 = int(max(y - 50, 0)), int(min(y + 51, H))
            gx = xx[y0:y1, x0:x1] - x; gy = yy[y0:y1, x0:x1] - y
            g = np.exp(-(gx ** 2 + gy ** 2) / (2 * s * s)) + 0.5 * np.exp(-(gy ** 2) / 2 - np.abs(gx) / (6 * s)) \
                + 0.5 * np.exp(-(gx ** 2) / 2 - np.abs(gy) / (6 * s))
            cv[y0:y1, x0:x1] += (g * 255 * k)[..., None]

def frame(i):
    t = i / FPS
    cv = BG.copy()
    o = eo(t / 0.8)
    marquee(cv, 300, t, 60, o * 0.9)
    marquee(cv, 1430, t + 7, -50, o * 0.6)
    fl1 = 3 * math.sin(t * 1.2)
    # dots + stripes
    for L_, t0, dx0 in ((D1, 0.5, -1), (D2, 0.6, 1), (D3, 1.3, -1), (D4, 1.35, 1)):
        tt = t - t0
        if tt > 0: L_.comp(cv, dx=dx0 * 80 * (1 - eo(tt / 0.5)) + 3 * math.sin(t * 1.5 + t0 * 4), op=clamp(tt / 0.3))
    for L_, t0, d in ((ST1, 2.6, 1), (ST2, 2.7, -1)):
        tt = t - t0
        if tt > 0:
            q = eo(tt / 0.5)
            L_.comp(cv, dx=d * 200 * (1 - q) + 4 * math.sin(t * 1.3), dy=-d * 200 * (1 - q), op=clamp(tt / 0.2))
    # bands slide in
    p1 = eo5((t - 0.15) / 0.8); p2 = eo5((t - 0.35) / 0.8)
    if t > 0.15: RB.comp(cv, dx=-1600 * (1 - p1) + 6 * math.sin(t * 0.7), dy=fl1, blurx=(1 - p1) * 60)
    if t > 0.35: MB.comp(cv, dx=1600 * (1 - p2) - 6 * math.sin(t * 0.7), dy=-fl1, blurx=(1 - p2) * 60)
    if t > 1.2: add_flashes(cv, t)
    # team names
    for (Ls, Lt, t0, d) in ((S_RIVER, T_RIVER, 1.0, 1), (S_PLATE, T_PLATE, 1.12, 1), (S_LANUS, T_LANUS, 1.2, -1)):
        tt = t - t0
        if tt > 0:
            q = eo5(tt / 0.6)
            dx = d * 500 * (1 - q) + d * 4 * math.sin(t * 0.9)
            Ls.comp(cv, dx=dx, dy=fl1 * d, op=clamp(tt / 0.2), blurx=(1 - q) * 40)
            Lt.comp(cv, dx=dx, dy=fl1 * d, op=clamp(tt / 0.2), blurx=(1 - q) * 40)
    # crests
    tt = t - 0.8
    if tt > 0:
        q = eback(tt / 0.65, 1.6)
        k = clamp((t - 1.6) / 0.5)
        RC.comp(cv, dy=-700 * (1 - eo(tt / 0.5)) + fl1 + 6 * math.sin(t * 1.6) * k, sc=0.6 + 0.4 * q + 0.02 * math.sin(t * 2.2) * k,
                ang=-20 * (1 - q) + 2 * math.sin(t * 1.3) * k, op=clamp(tt / 0.15), add=sweep(RC, t, 3.0, 3.0))
    tt = t - 1.0
    if tt > 0:
        q = eo5(tt / 0.9)
        k = clamp((t - 2.0) / 0.5)
        LC.comp(cv, dx=600 * (1 - q), ang=-400 * (1 - q) - 2 * math.sin(t * 1.3) * k, sc=1 + 0.02 * math.sin(t * 2.2 + 1) * k,
                dy=-fl1 - 6 * math.sin(t * 1.6) * k, op=clamp(tt / 0.15), add=sweep(LC, t, 3.0, 3.6))
    # VS slam
    shake = 0.0
    tt = t - 1.5
    if tt > 0:
        q = eo(tt / 0.22)
        pulse = 1 + 0.05 * max(0, math.cos((t - 3) * 2 * math.pi * 0.9)) ** 10 if t > 3 else 1
        sfl = 1.0 if tt > 0.3 else (1 if int(tt / 0.05) % 2 else 0)
        SLASH.comp(cv, sc=(0.3 + 0.7 * eo(tt / 0.15)) * pulse, op=0.9 * sfl)
        VS_SH.comp(cv, sc=(3.2 - 2.2 * q) * pulse, op=clamp(tt / 0.1) * q, ang=-6 * (1 - q))
        VS.comp(cv, sc=(3.2 - 2.2 * q) * pulse, op=clamp(tt / 0.1), ang=-6 * (1 - q))
        if tt < 0.45: shake = (1 - tt / 0.45) * (tt > 0.18)
    # logo neon
    tt = t - 1.9
    if tt > 0:
        fl = 1.0
        if tt < 0.8: fl = [0.0, 0.9, 0.1, 1, 0.4, 0.0, 1, 0.7][min(int(tt / 0.1), 7)]
        elif (t % 3.7) < 0.08: fl = 0.35
        LOGO.comp(cv, sc=1.08 - 0.08 * eo(tt / 0.6) + 0.012 * math.sin(t * 2.4), op=fl, dy=3 * math.sin(t * 1.3))
    # info
    tt = t - 2.2
    if tt > 0:
        q = eo5(tt / 0.5)
        T_TAG.comp(cv, op=clamp(tt / 0.4), dy=20 * (1 - q))
        BOX.comp(cv, sx=max(0.01, q), sc=1, dy=2 * math.sin(t * 1.8))
        tt2 = tt - 0.25
        if tt2 > 0:
            fl = 1.0 if tt2 > 0.3 else (1 if int(tt2 / 0.06) % 2 else 0.25)
            T_TIME.comp(cv, op=fl, dx=-60 * (1 - eo(tt2 / 0.4)), dy=2 * math.sin(t * 1.8))
            XX.comp(cv, op=fl, dy=2 * math.sin(t * 1.8) - 30 * (1 - eo(tt2 / 0.4)))
    tt = t - 2.6
    if tt > 0:
        q = eback(tt / 0.5, 2.0)
        PILL.comp(cv, sc=max(0.01, q), dy=2 * math.sin(t * 2 + 1))
        if tt > 0.15: T_PILL.comp(cv, op=clamp((tt - 0.15) / 0.2), dy=2 * math.sin(t * 2 + 1))
    tt = t - 2.9
    if tt > 0:
        LPF.comp(cv, sc=eback(tt / 0.5, 2.5), dy=3 * math.sin(t * 2))
    # impact flash
    tt = t - 1.72
    if 0 <= tt < 0.25:
        cv = cv + 255 * 0.45 * (1 - tt / 0.25)
    # camera
    e = eio(t / 2.5)
    z = (1 + 0.10 * (1 - e)) * (1.01 + 0.012 * math.sin(t * 0.6))
    ang = 0.5 * math.sin(t * 0.45)
    cx, cy = W / 2 + 5 * math.sin(t * 0.7), H / 2 + 7 * math.cos(t * 0.5)
    if shake:
        cx += rng.normal(0, 12 * shake); cy += rng.normal(0, 12 * shake); ang += rng.normal(0, 1.2 * shake)
    M = cv2.getRotationMatrix2D((cx, cy), ang, z)
    M[0, 2] += W / 2 - cx; M[1, 2] += H / 2 - cy
    out = cv2.warpAffine(np.clip(cv, 0, 255), M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    out = out * eo(t / 0.3)
    gr = rng.normal(0, 3.5, (H // 2, W // 2)).astype(np.float32)
    out = out + cv2.resize(gr, (W, H))[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)

if __name__ == '__main__':
    if OUT.endswith('.png'):
        for tt in sys.argv[3:]:
            cv2.imwrite(OUT.replace('.png', f'_{tt}.png'), cv2.resize(frame(int(round(float(tt) * FPS))), None, fx=0.5, fy=0.5))
        sys.exit()
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}',
                          '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-crf', '21', '-preset', 'medium',
                          '-maxrate', '10M', '-bufsize', '20M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT],
                         stdin=subprocess.PIPE)
    for i in range(int(DUR * FPS)):
        p.stdin.write(frame(i).tobytes())
    p.stdin.close(); p.wait()
