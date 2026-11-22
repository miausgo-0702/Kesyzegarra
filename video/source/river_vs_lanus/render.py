import cv2, numpy as np, subprocess, sys, math

D = np.load('layers.npz')
FPS = 30
OUT = sys.argv[1]
DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 12.0
OW, OH = 1080, 1920
bg = D['bg'] * (np.array([244, 214, 228], np.float32) / 245.0); Hs, Ws = bg.shape[:2]
rng = np.random.default_rng(3)

def clamp(x, a=0., b=1.): return max(a, min(b, x))
def eo(x): x = clamp(x); return 1 - (1 - x) ** 3
def eo5(x): x = clamp(x); return 1 - (1 - x) ** 5
def eback(x, s=1.7):
    x = clamp(x); x -= 1; return x * x * ((s + 1) * x + s) + 1
def eio(x): x = clamp(x); return x * x * (3 - 2 * x)

class Layer:
    def __init__(self, n):
        x0, y0 = D[n + '_pos']; F = D[n + '_F']; A = D[n + '_A'].astype(np.float32); B = D[n + '_B']
        a = A[..., None]
        Fu = np.where(a < 0.05, F, np.clip((F - (1 - a) * B) / np.maximum(a, 0.05), 0, 255))
        self.x0, self.y0 = float(x0), float(y0)
        self.F = Fu.astype(np.float32); self.A = A; self.h, self.w = A.shape

    def comp(self, canvas, dx=0., dy=0., sc=1., op=1., ang=0., sx=None, add=None, blur=0, mul=1.0):
        if op <= 0.003 or sc <= 0.001: return
        sx = sc if sx is None else sx
        cx, cy = self.w / 2, self.h / 2
        X0 = self.x0 + dx + cx; Y0 = self.y0 + dy + cy
        ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        rad = math.hypot(self.w * sx, self.h * sc) / 2 + 6 if ang else None
        hw = rad if rad else self.w * sx / 2 + 6
        hh = rad if rad else self.h * sc / 2 + 6
        H, W = canvas.shape[:2]
        cx0, cy0 = max(int(X0 - hw), 0), max(int(Y0 - hh), 0)
        cx1, cy1 = min(int(X0 + hw) + 1, W), min(int(Y0 + hh) + 1, H)
        if cx1 <= cx0 or cy1 <= cy0: return
        A_ = np.float32([[ca * sx, -sa * sc, 0], [sa * sx, ca * sc, 0]])
        A_[0, 2] = X0 - cx0 - (A_[0, 0] * cx + A_[0, 1] * cy)
        A_[1, 2] = Y0 - cy0 - (A_[1, 0] * cx + A_[1, 1] * cy)
        size = (cx1 - cx0, cy1 - cy0)
        F = self.F if add is None else self.F + add
        if mul != 1.0: F = F * mul
        F = cv2.warpAffine(F, A_, size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        a = cv2.warpAffine(self.A, A_, size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        if blur > 0.5:
            k = int(blur) * 2 + 1
            F = cv2.GaussianBlur(F, (1, k), 0); a = cv2.GaussianBlur(a, (1, k), 0)
        a = (a * op)[..., None]
        roi = canvas[cy0:cy1, cx0:cx1]
        roi[:] = roi * (1 - a) + np.clip(F, 0, 255) * a

L = {n: Layer(str(n)) for n in D['names']}

def sweep(layer, t, period, t0):
    """diagonal shine band moving across the patch"""
    ph = ((t - t0) % period) / 0.7
    if t < t0 or ph > 1: return None
    yy, xx = np.mgrid[0:layer.h, 0:layer.w].astype(np.float32)
    pos = -60 + (layer.w + layer.h + 120) * ph
    band = np.exp(-((xx + yy * 0.6 - pos) ** 2) / (2 * 14 ** 2))
    return (band * 110)[..., None]

# crowd/camera flashes
FL_ZONES = [(112, 300, 310, 520), (112, 800, 300, 990), (450, 560, 640, 740), (450, 990, 640, 1200)]
flashes = []
for _ in range(int(DUR * 7)):
    z = FL_ZONES[rng.integers(0, len(FL_ZONES))]
    flashes.append((rng.uniform(1.4, DUR), rng.uniform(z[0], z[2]), rng.uniform(z[1], z[3]), rng.uniform(1.5, 3.2)))
fy, fx = np.mgrid[0:Hs, 0:Ws]

def add_flashes(cv, t):
    for (ft, x, y, s) in flashes:
        dt = t - ft
        if 0 <= dt < 0.16:
            k = (1 - dt / 0.16) ** 2
            x0, x1 = int(max(x - 30, 0)), int(min(x + 31, Ws)); y0, y1 = int(max(y - 30, 0)), int(min(y + 31, Hs))
            gx = fx[y0:y1, x0:x1] - x; gy = fy[y0:y1, x0:x1] - y
            g = np.exp(-(gx ** 2 + gy ** 2) / (2 * s * s)) + 0.5 * np.exp(-(gy ** 2) / 1.2 - np.abs(gx) / (5 * s)) \
                + 0.5 * np.exp(-(gx ** 2) / 1.2 - np.abs(gy) / (5 * s))
            cv[y0:y1, x0:x1] += (g * 255 * k)[..., None]

def frame(i):
    t = i / FPS
    cv = bg.copy()
    # outline texts: fade in + slow continuous vertical drift
    o = eo(t / 0.8)
    L['outL'].comp(cv, dy=-30 * (1 - o) + 14 * math.sin(t * 0.5), op=o)
    L['outR'].comp(cv, dy=30 * (1 - o) - 14 * math.sin(t * 0.5), op=o)
    L['hatch'].comp(cv, dx=-60 * (1 - eo((t - 0.6) / 0.8)) + 4 * math.sin(t * 0.9), op=clamp((t - 0.6) / 0.5))
    # panels: red drops from top, maroon rises from bottom
    p = eo5((t - 0.1) / 0.75)
    fr = 2.5 * math.sin(t * 1.1)
    L['redp'].comp(cv, dy=-1150 * (1 - p) + fr, op=1 if t > 0.1 else 0)
    p2 = eo5((t - 0.25) / 0.75)
    L['marp'].comp(cv, dy=1250 * (1 - p2) - fr, op=1 if t > 0.25 else 0)
    if t > 1.2: add_flashes(cv, t)
    # dot grids blink on
    for n, t0 in (('dots1', 0.9), ('dots2', 1.0)):
        tt = t - t0
        if tt > 0:
            fl = 1.0 if tt > 0.4 else [0, 1, 0.3, 1][min(int(tt / 0.1), 3)]
            L[n].comp(cv, dx=3 * math.sin(t * 1.4 + t0), op=fl)
    # stripes slide diagonally
    tt = t - 2.3
    if tt > 0:
        q = eo(tt / 0.6)
        L['stripes'].comp(cv, dx=-220 * (1 - q) + 3 * math.sin(t * 1.7), dy=220 * (1 - q), op=clamp(tt / 0.2))
    # big vertical team names
    tt = t - 0.8
    if tt > 0:
        q = eo5(tt / 0.7)
        L['rp'].comp(cv, dy=520 * (1 - q) + 5 * math.sin(t * 0.8), op=clamp(tt / 0.2), blur=(1 - q) * 25)
        L['lanT'].comp(cv, dy=-520 * (1 - q) - 5 * math.sin(t * 0.8), op=clamp(tt / 0.2), blur=(1 - q) * 25)
    # VS slam
    shake = 0.0
    tt = t - 1.2
    if tt > 0:
        q = eo(tt / 0.22)
        pulse = 1 + 0.045 * max(0, math.cos((t - 3) * 2 * math.pi * 0.9)) ** 10 if t > 3 else 1
        L['vs'].comp(cv, sc=(3.2 - 2.2 * q) * pulse, op=clamp(tt / 0.1), ang=-8 * (1 - q))
        if tt < 0.45: shake = (1 - tt / 0.45) * (tt > 0.18)
    # LPF
    tt = t - 2.55
    if tt > 0:
        L['lpf'].comp(cv, sc=eback(tt / 0.5, 2.5), op=clamp(tt / 0.15), dy=3 * math.sin(t * 2))
    # crests ride in with their panels, then pop / spin
    if t > 0.1:
        tt = t - 0.85
        bump = math.sin(math.pi * clamp(tt / 0.45)) if tt > 0 else 0
        L['river'].comp(cv, dy=-1150 * (1 - p) + fr + 5 * math.sin(t * 1.6) * clamp((t - 1.3) / 0.5),
                        sc=1 + 0.18 * bump + 0.02 * math.sin(t * 2.2) * clamp((t - 1.3) / 0.5),
                        ang=-10 * bump + 1.5 * math.sin(t * 1.3) * clamp((t - 1.3) / 0.5),
                        add=sweep(L['river'], t, 3.0, 3.0))
    if t > 0.25:
        tt = t - 1.5
        spin = 360 * eo5(tt / 1.0) if tt > 0 else 0
        bump = math.sin(math.pi * clamp(tt / 0.5)) if tt > 0 else 0
        k = clamp((t - 2.5) / 0.5)
        L['lanus'].comp(cv, dy=1250 * (1 - p2) - fr - 5 * math.sin(t * 1.6) * k, ang=-spin - 1.5 * math.sin(t * 1.3) * k,
                        sc=1 + 0.15 * bump + 0.02 * math.sin(t * 2.2 + 1) * k, add=sweep(L['lanus'], t, 3.0, 3.6))
    # logo neon
    tt = t - 1.6
    if tt > 0:
        fl = 1.0
        if tt < 0.8: fl = [0.0, 0.9, 0.1, 1, 0.4, 0.0, 1, 0.7][min(int(tt / 0.1), 7)]
        elif (t % 3.7) < 0.08: fl = 0.35
        L['logo'].comp(cv, sc=1.08 - 0.08 * eo(tt / 0.6) + 0.012 * math.sin(t * 2.4), op=fl, dy=2 * math.sin(t * 1.3))
    # 19:00
    tt = t - 2.4
    if tt > 0:
        q = eback(tt / 0.55, 1.5)
        fl = 1.0 if tt > 0.3 else (1 if int(tt / 0.06) % 2 else 0.3)
        L['t19'].comp(cv, dx=260 * (1 - q) - fr, op=fl * clamp(tt / 0.15))
    # white flash on VS impact
    tt = t - 1.42
    if 0 <= tt < 0.25:
        cv = cv + 255 * 0.45 * (1 - tt / 0.25)
    # camera
    s0 = OH / Hs
    e = eio(t / 2.5)
    z = (1 + 0.10 * (1 - e)) * (1.015 + 0.015 * math.sin(t * 0.6))
    ang = 0.6 * math.sin(t * 0.45)
    cx, cy = Ws / 2 + 6 * math.sin(t * 0.7), Hs / 2 + 8 * math.cos(t * 0.5)
    if shake:
        cx += rng.normal(0, 9 * shake); cy += rng.normal(0, 9 * shake); ang += rng.normal(0, 1.2 * shake)
    A_ = cv2.getRotationMatrix2D((cx, cy), ang, z * s0)
    A_[0, 2] += OW / 2 - cx; A_[1, 2] += OH / 2 - cy
    out = cv2.warpAffine(np.clip(cv, 0, 255), A_, (OW, OH), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    # mild sharpen after upscale
    out = cv2.addWeighted(out, 1.35, cv2.GaussianBlur(out, (0, 0), 1.6), -0.35, 0)
    out = out * eo(t / 0.3)
    g = rng.normal(0, 3.5, (OH // 2, OW // 2)).astype(np.float32)
    out = out + cv2.resize(g, (OW, OH))[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)

if __name__ == '__main__':
    if OUT.endswith('.png'):
        for tt in sys.argv[3:]:
            cv2.imwrite(OUT.replace('.png', f'_{tt}.png'), cv2.resize(frame(int(round(float(tt) * FPS))), None, fx=0.5, fy=0.5))
        sys.exit()
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{OW}x{OH}',
                          '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-crf', '21', '-preset', 'medium',
                          '-maxrate', '10M', '-bufsize', '20M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT],
                         stdin=subprocess.PIPE)
    for i in range(int(DUR * FPS)):
        p.stdin.write(frame(i).tobytes())
    p.stdin.close(); p.wait()
