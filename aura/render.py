import cv2, numpy as np, subprocess, sys, math

SRC = sys.argv[3] if len(sys.argv) > 3 else 'src.jpg'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'aura_night.mp4'
FPS, DUR = 30, 12.0
N = int(FPS * DUR)

im = cv2.imread(SRC).astype(np.float32) / 255.0
H, W = im.shape[:2]

# ---------- lettering mask ----------
u8 = (im * 255).astype(np.uint8)
gc = np.zeros((H, W), np.uint8); b = np.zeros((1, 65)); f = np.zeros((1, 65))
cv2.grabCut(u8, gc, (58, 300, 665, 730), b, f, 8, cv2.GC_INIT_WITH_RECT)
m = np.where((gc == 1) | (gc == 3), 255, 0).astype(np.uint8)
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(m)
keep = np.zeros_like(m)
for i in range(1, n):
    if st[i, cv2.CC_STAT_AREA] > 1500:
        keep[lab == i] = 255
m = cv2.morphologyEx(keep, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
alpha = cv2.GaussianBlur(m, (0, 0), 1.0).astype(np.float32) / 255.0

# ---------- split into word groups ----------
xs = np.arange(W)
def boundary(pts):
    px, py = zip(*pts)
    return np.interp(xs, px, py)
b1 = boundary([(0, 570), (290, 572), (310, 592), (420, 604), (W, 604)])
b2 = boundary([(0, 858), (552, 858), (566, 838), (W, 838)])
yy = np.arange(H)[:, None]
grp_masks = [(yy < b1[None, :]), (yy >= b1[None, :]) & (yy < b2[None, :]), (yy >= b2[None, :])]

groups = []
for gm in grp_masks:
    a = alpha * gm.astype(np.float32)
    ys, xs_ = np.where(a > 0.02)
    x0, x1, y0, y1 = xs_.min(), xs_.max(), ys.min(), ys.max()
    pad = 4
    x0, y0 = max(x0 - pad, 0), max(y0 - pad, 0)
    x1, y1 = min(x1 + pad, W - 1), min(y1 + pad, H - 1)
    rgb = im[y0:y1 + 1, x0:x1 + 1].copy()
    groups.append(dict(rgb=rgb, a=a[y0:y1 + 1, x0:x1 + 1].copy(), x0=x0, y0=y0,
                       cx=(x0 + x1) / 2, cy=(y0 + y1) / 2))

# ---------- clean background plate ----------
hole = cv2.dilate(m, np.ones((15, 15), np.uint8))
for (x, y, w, h) in [(55, 1192, 112, 116), (183, 1207, 160, 92), (353, 1217, 176, 82), (535, 1190, 176, 114)]:
    cv2.rectangle(hole, (x, y), (x + w, y + h), 255, -1)
s = 4
small = cv2.resize(u8, (W // s, H // s), interpolation=cv2.INTER_AREA)
hs = cv2.resize(hole, (W // s, H // s), interpolation=cv2.INTER_NEAREST)
inp = cv2.inpaint(small, hs, 12, cv2.INPAINT_TELEA)
inp = cv2.GaussianBlur(inp, (0, 0), 6)
inp = cv2.resize(inp, (W, H), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255.0
hb = cv2.GaussianBlur(hole, (0, 0), 6).astype(np.float32)[..., None] / 255.0
plate = im * (1 - hb) + inp * hb
rng = np.random.default_rng(1)
grain_plate = rng.normal(0, 0.025, (H, W, 1)).astype(np.float32)
plate = np.clip(plate + grain_plate * hb, 0, 1)

# logos: feathered static patches from the original
logo_a = np.zeros((H, W), np.float32)
for (x, y, w, h) in [(60, 1198, 102, 106), (188, 1212, 150, 82), (358, 1222, 166, 72), (540, 1196, 166, 104)]:
    cv2.rectangle(logo_a, (x, y), (x + w, y + h), 1.0, -1)
logo_a[1200:1305, :] = 1.0
logo_a = cv2.GaussianBlur(logo_a, (0, 0), 22)[..., None]

# ---------- helpers ----------
def hue_shift(rgb, deg):
    if abs(deg) < 0.5:
        return rgb
    hsv = cv2.cvtColor(rgb, cv2.COLOR_BGR2HSV)  # float: H in [0,360)
    hsv[..., 0] = (hsv[..., 0] + deg) % 360
    return cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)

# ---------- background animation ----------
yv, xv = np.mgrid[0:H, 0:W].astype(np.float32)
stars = rng.random((260, 4)).astype(np.float32)  # x, y, speed, size

def background(t):
    ph = 2 * math.pi * t / DUR
    # slow zoom + rotation (ken burns, loops)
    sc = 1.08 + 0.04 * math.sin(ph)
    ang = 3.0 * math.sin(ph)
    tx = 12 * math.sin(ph); ty = 10 * math.cos(ph)
    M = cv2.getRotationMatrix2D((W / 2, H * 0.45), ang, sc)
    M[0, 2] += tx; M[1, 2] += ty
    bg = cv2.warpAffine(plate, M, (W, H), borderMode=cv2.BORDER_REFLECT)
    # flowing wave distortion of the light leaks
    mx = xv + 9 * np.sin(yv / 140 + ph * 2) + 4 * np.sin(yv / 70 - ph)
    my = yv + 6 * np.sin(xv / 160 - ph * 2)
    bg = cv2.remap(bg, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    # hue cycling, stronger on bright areas
    hsv = cv2.cvtColor(bg, cv2.COLOR_BGR2HSV)
    hsv[..., 0] = (hsv[..., 0] + 360 * t / DUR) % 360
    bg = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
    # sweeping light beam
    beam_x = (t / DUR) * (W + 900) - 450
    d = (xv - beam_x) * 0.85 + (yv - H / 2) * 0.5
    beam = np.exp(-(d / 110) ** 2)[..., None]
    beam_col = hue_shift(np.float32([[[1.0, 0.55, 0.9]]]), 360 * t / DUR)[0, 0]
    bg = bg + beam * beam_col * 0.22
    # pulse
    bg = bg * (0.93 + 0.07 * math.sin(ph * 4))
    # drifting dust
    for sx, sy, sp, sz in stars:
        x = int(sx * W)
        y = int((sy * H - t / DUR * H * (0.3 + sp)) % H)
        if sp < 0.45:
            continue
        br = 0.35 + 0.6 * (0.5 + 0.5 * math.sin(ph * 3 + sx * 40))
        r = 1 if sz < 0.8 else 2
        cv2.circle(bg, (x, y), r, (br, br, br), -1, lineType=cv2.LINE_AA)
    return bg


def ease(x):
    # gentle sine ease-in-out (slow start, slow end)
    x = min(max(x, 0.0), 1.0)
    return 0.5 - 0.5 * math.cos(math.pi * x)

FOC = 950.0      # stronger perspective
THICK = 115      # extrusion depth (px)
SLICES = 58

# per-group helpers: smoothed colour for the extrusion walls, local coords
for g in groups:
    h, w = g['a'].shape
    wl = cv2.GaussianBlur(g['rgb'], (0, 0), 4)
    hsv = cv2.cvtColor(wl, cv2.COLOR_BGR2HSV)
    hsv[..., 1] = np.clip(hsv[..., 1] * 2.2 + 0.25, 0, 1)   # saturated chrome walls
    g['wall'] = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
    g['uu'], g['vv'] = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    # inner edge (bevel rim) to brighten the front face outline
    a8 = (g['a'] * 255).astype(np.uint8)
    er = cv2.erode(a8, np.ones((5, 5), np.uint8)).astype(np.float32) / 255
    g['rim'] = np.clip(g['a'] - er, 0, 1)

def corners(g, theta, z0, dx, dy, tilt):
    h, w = g['a'].shape
    cx, cy = g['cx'], g['cy']
    out = []
    for (u, v) in ((0, 0), (w, 0), (w, h), (0, h)):
        X = g['x0'] + u - cx
        Y = g['y0'] + v - cy
        Yt = Y * math.cos(tilt) - z0 * math.sin(tilt)
        Zt = Y * math.sin(tilt) + z0 * math.cos(tilt)
        xr = X * math.cos(theta) + Zt * math.sin(theta)
        zr = -X * math.sin(theta) + Zt * math.cos(theta)
        k = FOC / (FOC + zr)
        out.append([cx + dx + xr * k, cy + dy + Yt * k])
    return np.float32(out)

def warp_into(canvas, g, img, a, theta, z0, dx, dy, tilt, mode='over', strength=1.0):
    h, w = a.shape
    dst = corners(g, theta, z0, dx, dy, tilt)
    x0 = int(max(math.floor(dst[:, 0].min()) - 2, 0)); x1 = int(min(math.ceil(dst[:, 0].max()) + 2, W))
    y0 = int(max(math.floor(dst[:, 1].min()) - 2, 0)); y1 = int(min(math.ceil(dst[:, 1].max()) + 2, H))
    if x1 - x0 < 2 or y1 - y0 < 2:
        return
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    M = cv2.getPerspectiveTransform(src, dst - np.float32([x0, y0]))
    sz = (x1 - x0, y1 - y0)
    aw = cv2.warpPerspective(a, M, sz, flags=cv2.INTER_LINEAR)[..., None] * strength
    roi = canvas[y0:y1, x0:x1]
    if mode == 'shadow':
        roi *= (1 - aw)
        return
    cw = cv2.warpPerspective(img, M, sz, flags=cv2.INTER_LINEAR)
    roi[:] = roi * (1 - aw) + cw * aw

def draw_group(canvas, g, theta, dx, dy, tilt, hue, t):
    c, sn = math.cos(theta), math.sin(theta)
    front = hue_shift(g['rgb'], hue)
    wall = hue_shift(g['wall'], hue)
    # light from upper-left: face brightness depends on its orientation
    face_light = 0.80 + 0.20 * max(c, 0) + 0.12 * sn
    # moving specular sweep across the front face
    h, w = g['a'].shape
    pos = (0.5 - 0.9 * sn) * (w + h)
    band = np.exp(-(((g['uu'] + g['vv'] * 0.6) - pos * 0.8) / (w * 0.09)) ** 2)[..., None]
    face = front * face_light + band * 0.35 + g['rim'][..., None] * 0.25
    flash = max(0.0, 1 - abs(c) * 2.5) * 0.30
    face = face + flash
    if c < 0:
        face = face * 0.82
    # back cap
    back = (front * 0.85 + band * 0.3 + g['rim'][..., None] * 0.25) * (0.80 + 0.20 * max(-c, 0) - 0.12 * sn)
    # build layer list: (z, kind)
    layers = [(THICK, 'back')]
    for i in range(SLICES - 1, 0, -1):
        layers.append((THICK * i / SLICES, 'wall'))
    layers.append((0.0, 'front'))
    wcache = {}
    step = THICK / SLICES
    i_edge = lambda z: (z % (THICK / 4)) < step * 0.99   # thin bright ridge lines along the depth
    out = []
    for z0, kind in layers:
        if kind == 'front':
            img = face
        elif kind == 'back':
            img = back
        else:
            d = z0 / THICK
            # walls: chrome gradient, darker deeper in, lit by side light
            lit = 0.70 + 0.35 * abs(sn) - 0.55 * d
            q = int(d * 7)
            if q not in wcache:
                wcache[q] = hue_shift(g['wall'], hue + q * 14)
            img = wcache[q] * lit
            if i_edge(z0):
                img = img * 1.25 + 0.12
        out.append((-z0 * c * math.cos(tilt), img, z0))
    return out

# ---------- timeline ----------
SPIN = 5.0          # seconds per full turn (slow)
delays = [0.0, 0.9, 1.8]

def spin_angle(t, delay):
    return 2 * math.pi * ease((t - 1.2 - delay) / SPIN)

def frame(i):
    t = i / FPS
    ph = 2 * math.pi * t / DUR
    canvas = background(t)
    params = []
    for k, g in enumerate(groups):
        # slow turn + permanent gentle 3/4 sway so the depth is always visible
        th = spin_angle(t, delays[k]) + 0.32 * math.sin(ph * 2 + k * 0.8)
        dy = 6 * math.sin(ph * 2 + k * 1.3)
        dx = 3 * math.sin(ph + k)
        tilt = 0.16 + 0.07 * math.sin(ph * 2 + k * 0.9)   # look slightly from above
        sp = spin_angle(t, delays[k])
        hue = 60 * math.sin(sp / 2) ** 2 * (1 if math.sin(sp) >= 0 else -1) if sp > 0 else 0.0
        params.append((g, th, dx, dy, tilt, hue))
    # glow
    gl = np.zeros_like(canvas)
    for g, th, dx, dy, tilt, hue in params:
        warp_into(gl, g, hue_shift(g['rgb'], hue), g['a'], th, 0, dx, dy, tilt)
    gl = cv2.GaussianBlur(gl, (0, 0), 24)
    canvas = canvas + gl * (0.30 + 0.10 * math.sin(ph * 4))
    # contact shadow (projected onto the background)
    sh = np.ones_like(canvas)
    for g, th, dx, dy, tilt, hue in params:
        warp_into(sh, g, None, g['a'], th, THICK, dx + 24, dy + 40, tilt, mode='shadow', strength=0.8)
    sh = cv2.GaussianBlur(sh, (0, 0), 14)
    canvas = canvas * sh
    allL = []
    for g, th, dx, dy, tilt, hue in params:
        for key, img, z0 in draw_group(canvas, g, th, dx, dy, tilt, hue, t):
            allL.append((key, z0 == 0.0, img, g, th, z0, dx, dy, tilt))
    allL.sort(key=lambda L: (L[0], L[1]))  # far -> near, fronts last on ties
    for key, _, img, g, th, z0, dx, dy, tilt in allL:
        warp_into(canvas, g, img, g['a'], th, z0, dx, dy, tilt)
    canvas = canvas * (1 - logo_a) + im * logo_a
    canvas = canvas + rng.normal(0, 0.018, (H, W, 1)).astype(np.float32)
    return (np.clip(canvas, 0, 1) * 255).astype(np.uint8)

if __name__ == '__main__':
    only = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != '-' else None
    if only:
        for i in map(int, only.split(',')):
            cv2.imwrite(f'f{i:03d}.png', frame(i))
        sys.exit()
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24',
                          '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                          '-vf', 'scale=1080:1920:flags=lanczos',
                          '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p',
                          '-movflags', '+faststart', OUT], stdin=subprocess.PIPE)
    for i in range(N):
        p.stdin.write(frame(i).tobytes())
    p.stdin.close(); p.wait()
    print('done', OUT)
