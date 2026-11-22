import cv2, numpy as np, subprocess, sys, math

SRC = 'src.jpg'
OUT = sys.argv[1] if len(sys.argv) > 1 else 'aura_night.mp4'
FPS, DUR = 30, 8.0
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

def ease(x):
    x = np.clip(x, 0, 1)
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2

FOC = 1100.0
THICK = 22
SLICES = 9

def project(g, theta, z0, dx, dy, tilt):
    h, w = g['a'].shape
    cx, cy = g['cx'], g['cy']
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = []
    for (u, v) in src:
        X = g['x0'] + u - cx
        Y = g['y0'] + v - cy
        # small tilt around x axis
        Yt = Y * math.cos(tilt) - z0 * math.sin(tilt)
        Zt = Y * math.sin(tilt) + z0 * math.cos(tilt)
        xr = X * math.cos(theta) + Zt * math.sin(theta)
        zr = -X * math.sin(theta) + Zt * math.cos(theta)
        k = FOC / (FOC + zr)
        dst.append([cx + dx + xr * k, cy + dy + Yt * k])
    return cv2.getPerspectiveTransform(src, np.float32(dst))

def draw_group(canvas, g, theta, dx, dy, tilt, hue):
    rgb = hue_shift(g['rgb'], hue)
    c, sn = math.cos(theta), math.sin(theta)
    # extrusion slices (only visible when turned)
    layers = []
    if abs(sn) > 0.03:
        for i in range(SLICES, 0, -1):
            z0 = THICK * i / SLICES
            layers.append(z0)
    layers.append(0.0)
    # far -> near : larger z0*cos is farther
    layers.sort(key=lambda z: -z * c)
    for z0 in layers:
        Mx = project(g, theta, z0, dx, dy, tilt)
        a = cv2.warpPerspective(g['a'], Mx, (W, H), flags=cv2.INTER_LINEAR)
        if z0 == 0.0:
            col = cv2.warpPerspective(rgb, Mx, (W, H), flags=cv2.INTER_LINEAR)
            # back side slightly darker, specular flash near edge-on
            shade = 0.78 + 0.22 * max(c, 0) if c < 0 else 1.0
            flash = max(0.0, 1 - abs(c) * 3.0) * 0.35
            col = col * shade + flash
        else:
            col = cv2.warpPerspective(rgb, Mx, (W, H), flags=cv2.INTER_LINEAR)
            col = col * 0.55 + np.float32([0.25, 0.12, 0.22]) * 0.3  # chrome-ish side
        a3 = a[..., None]
        canvas[:] = canvas * (1 - a3) + col * a3

# soft drop shadow helper not needed; glow instead
def glow(layer_alpha, color_img):
    gl = cv2.GaussianBlur(color_img * layer_alpha[..., None], (0, 0), 18)
    return gl

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

# ---------- timeline ----------
# each group spins 360 twice per loop, staggered
def spin_angle(t, delay):
    tot = 0.0
    for start in (0.6 + delay, 4.6 + delay):
        tot += ease((t - start) / 1.6)
    return 2 * math.pi * tot

delays = [0.0, 0.25, 0.5]

def frame(i):
    t = i / FPS
    ph = 2 * math.pi * t / DUR
    canvas = background(t)
    # glow behind letters
    glow_layer = np.zeros_like(canvas)
    params = []
    for k, g in enumerate(groups):
        th = spin_angle(t, delays[k]) + 0.12 * math.sin(ph * 2 + k)
        dy = 7 * math.sin(ph * 2 + k * 1.3)
        dx = 4 * math.sin(ph + k)
        tilt = 0.08 * math.sin(ph * 2 + k * 0.9)
        hue = math.degrees(th) % 360 if math.degrees(th) % 360 > 1 else 0
        hue = 180 * (1 - math.cos(th)) / 2 * (1 if math.sin(th) >= 0 else -1)
        params.append((g, th, dx, dy, tilt, hue))
    gl = np.zeros_like(canvas)
    for g, th, dx, dy, tilt, hue in params:
        Mx = project(g, th, 0, dx, dy, tilt)
        a = cv2.warpPerspective(g['a'], Mx, (W, H))
        col = cv2.warpPerspective(hue_shift(g['rgb'], hue), Mx, (W, H))
        gl += col * a[..., None]
    gl = cv2.GaussianBlur(gl, (0, 0), 22)
    canvas = canvas + gl * (0.35 + 0.15 * math.sin(ph * 4))
    for g, th, dx, dy, tilt, hue in params:
        draw_group(canvas, g, th, dx, dy, tilt, hue)
    canvas = canvas * (1 - logo_a) + im * logo_a
    # film grain
    canvas = canvas + rng.normal(0, 0.018, (H, W, 1)).astype(np.float32)
    return (np.clip(canvas, 0, 1) * 255).astype(np.uint8)

if __name__ == '__main__':
    only = sys.argv[2] if len(sys.argv) > 2 else None
    if only:
        for i in map(int, only.split(',')):
            cv2.imwrite(f'f{i:03d}.png', frame(i))
        sys.exit()
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24',
                          '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                          '-vf', 'scale=1080:1920:flags=lanczos',
                          '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
                          '-movflags', '+faststart', OUT], stdin=subprocess.PIPE)
    for i in range(N):
        p.stdin.write(frame(i).tobytes())
    p.stdin.close(); p.wait()
    print('done', OUT)
