import sys, numpy as np
from PIL import Image, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
W, H = im.size
x = np.asarray(im, dtype=np.float32) / 255.0

def _box(a, k, axis):
    if k < 1: return a
    pad = [(0,0),(0,0)]; pad[axis] = (k+1, k)
    p = np.pad(a, pad, mode="edge")
    c = np.cumsum(p, axis=axis, dtype=np.float64)
    n = a.shape[axis]
    hi = np.take(c, np.arange(2*k+1, 2*k+1+n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return ((hi - lo) / (2*k+1)).astype(np.float32)

def blur(a, r):
    """Approximate Gaussian (sigma=r) with three box passes per axis."""
    if r <= 0: return a
    w = np.sqrt(12*r*r/3 + 1); k = max(int(round((w-1)/2)), 0)
    if k == 0:  # tiny sigma: 3-tap kernel
        t = min(r*r/2, 0.5)
        for ax in (0, 1):
            p = np.pad(a, [(1,1) if i==ax else (0,0) for i in range(2)], mode="edge")
            a = (1-2*t)*a + t*(np.take(p, range(0, a.shape[ax]), axis=ax) + np.take(p, range(2, a.shape[ax]+2), axis=ax))
        return a.astype(np.float32)
    for ax in (0, 1):
        for _ in range(3): a = _box(a, k, ax)
    return a

def to_lin(c):  return np.where(c <= 0.04045, c/12.92, ((c+0.055)/1.055)**2.4)
def to_srgb(c):
    c = np.clip(c, 0, None)
    return np.where(c <= 0.0031308, c*12.92, 1.055*np.power(c, 1/2.4)-0.055)

lin = to_lin(x)
Y = lin @ np.array([0.2126, 0.7152, 0.0722], np.float32)

# ---- near-field mask: in-focus detail (portrait-mode bokeh = background) + spatial prior
s = 8  # work downsampled for the mask
small = np.asarray(im.convert("L").resize((W//s, H//s), Image.LANCZOS), np.float32)/255
lap = np.abs(small - blur(small, 1.5))
energy = blur(lap, 10)
energy = np.clip((energy - np.percentile(energy, 30)) / (np.percentile(energy, 92) - np.percentile(energy, 30)), 0, 1)
yy, xx = np.mgrid[0:H//s, 0:W//s].astype(np.float32)
yy /= H//s; xx /= W//s
prior = np.clip((yy - 0.22) / 0.45, 0, 1)                      # lower frame = closer to camera
near_s = blur(np.clip(0.55*energy + 0.65*prior, 0, 1), 18)
near = np.asarray(Image.fromarray(near_s, "F").resize((W, H), Image.BILINEAR), np.float32)
near = np.clip(near, 0, 1)**0.9

# ---- 1. tame the club's magenta/purple cast toward a neutral base (white-balance-ish)
lin *= np.array([0.97, 1.03, 0.96], np.float32)

# ---- 2. on-axis flash fill: additive light falling off with distance, plus specular pop
fill = 0.010 * near                                              # flash adds light, most visible in shadows
flash_col = np.array([1.0, 0.99, 0.97], np.float32)              # near-daylight flash
lin = lin + fill[..., None] * flash_col * (0.25 + 0.75*np.clip(lin*5, 0, 1))  # reflects off surfaces, scaled by albedo
Y = lin @ np.array([0.2126, 0.7152, 0.0722], np.float32)
hi = np.clip((Y - 0.32) / 0.35, 0, 1)**2 * near                  # camera-facing bright surfaces (skin, glass, rims)
hi_local = hi - blur(hi, 6)                                       # keep it crisp, not a glow
lin = lin + np.clip(hi_local, 0, None)[..., None] * 0.14 + hi[..., None]*0.015

# ---- 3. negative-film tone response: lifted toe, long soft shoulder (wide latitude)
Y = np.maximum(lin @ np.array([0.2126, 0.7152, 0.0722], np.float32), 1e-6)
exposure = 1.02
def curve(v):
    v = v * exposure
    shoulder = v / (1 + v/1.35)                                   # gentle highlight roll-off
    return shoulder
Yc = curve(Y)
# reduced contrast in near field, natural density in background
toe_near = 0.006; toe_far = 0.0015
toe = toe_far + (toe_near - toe_far)*near
Yc = Yc + toe*(1 - np.clip(Yc/0.25, 0, 1))
gamma_bg = 1.07 - 0.07*near                                       # bg slightly denser, fg flatter
Yc = np.power(np.clip(Yc, 0, None), gamma_bg)
lin = lin * (Yc / Y)[..., None]

# ---- 4. colour: moderate saturation, warm reds, clean blues, cool-green midtone bias
Y = lin @ np.array([0.2126, 0.7152, 0.0722], np.float32)
r, g, b = lin[...,0], lin[...,1], lin[...,2]
mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
sat = (mx - mn) / (mx + 1e-6)
redness = np.clip((r - np.maximum(g, b)) / (r + 1e-6), 0, 1) * np.clip((r - b)/(r+1e-6)*1.5, 0, 1)
magenta = np.clip((np.minimum(r, b) - g) / (mx + 1e-6), 0, 1)
blue = np.clip((b - np.maximum(r, g)) / (b + 1e-6), 0, 1)
# overall moderate saturation, a touch more pulled from loud neon magenta
sat_k = 0.93 - 0.12*magenta + 0.05*blue + 0.05*redness
lin = Y[..., None] + (lin - Y[..., None]) * sat_k[..., None]
# warm the reds slightly (rotate toward orange)
lin[...,1] += 0.06 * redness * lin[...,0]
lin[...,2] -= 0.04 * redness * lin[...,2]
# cool-green bias in midtones (fluorescent ambient mixing)
Ys = to_srgb(np.clip(Y, 0, 1))
mid = np.clip(4*Ys*(1-Ys), 0, 1)**1.5
lin *= (1 + mid[..., None] * np.array([-0.025, 0.018, 0.010], np.float32))

# ---- 5. neutral-cool density floor (film base never prints true black)
floor = np.array([0.0026, 0.0032, 0.0040], np.float32)
lin = floor + lin * (1 - floor)

out = to_srgb(lin)

# ---- 6. grain: smooth, luminance-dependent, mostly monochrome, two scales
rng = np.random.default_rng(35)
def grain_layer(r):
    n = rng.standard_normal((H, W)).astype(np.float32)
    n = blur(n, r)
    return n / (n.std() + 1e-6)
gl = 0.7*grain_layer(0.9) + 0.3*grain_layer(2.2)
gc = np.stack([grain_layer(1.4) for _ in range(3)], -1)
L = out @ np.array([0.2126, 0.7152, 0.0722], np.float32)
amp = 0.008 + 0.010*np.clip(4*L*(1-L), 0, 1) + 0.005*(1 - near)   # more visible in mids & dimmer background
out = out + (gl[..., None] + 0.12*gc) * amp[..., None]

# ---- 7. a whisper of lens/scan softness so grain sits "in" the image
out = np.clip(out, 0, 1)
img = Image.fromarray((out*255 + 0.5).astype(np.uint8), "RGB").filter(ImageFilter.GaussianBlur(0.35))
img.save(dst, quality=94, subsampling=0, optimize=True)
print("saved", dst, img.size)
