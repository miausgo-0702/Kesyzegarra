import sys, math, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
CX, CY = 1330, 1980            # sharp centre (smile) in source pixels
OUT_W, OUT_H = 1080, 1920      # 9:16
PW, PH = 936, 1560             # photo window
S = 1.5                        # working scale relative to the photo window
BG = (20, 11, 7)

im = Image.open(src).convert("RGB")
W, H = im.size
# crop source to the window aspect, keeping the subject centred
cw = int(H * PW / PH)
x0 = int(np.clip(CX - cw/2, 0, W - cw))
im = im.crop((x0, 0, x0 + cw, H))
ww, wh = int(PW*S), int(PH*S)
k = ww / cw
im = im.resize((ww, wh), Image.LANCZOS)
cx, cy = (CX - x0) * k, CY * k

x = np.asarray(im, np.float32) / 255
lin = x ** 2.2

# ---- spin + zoom blur, accumulated in linear light so highlights streak and bloom
acc = np.zeros_like(lin)
n = 41
for i in range(n):
    t = i/(n-1) - 0.5
    a = math.radians(14 * t)                # +-7 deg twist
    s = 1.0 + 0.10 * (t + 0.5)              # 0..10% push-in
    ca, sa = math.cos(a)/s, math.sin(a)/s
    # inverse affine: output (u,v) -> input
    A = (ca, -sa, cx - ca*cx + sa*cy, sa, ca, cy - sa*cx - ca*cy)
    layer = Image.fromarray((np.clip(lin,0,1)**(1/2.2)*255).astype(np.uint8)).transform(
        (ww, wh), Image.AFFINE, A, resample=Image.BILINEAR, fillcolor=(0,0,0))
    l = (np.asarray(layer, np.float32)/255) ** 2.2
    acc += l
blur = acc / n

# sharp core around the face, a ghosted sharp echo outside it
yy, xx = np.mgrid[0:wh, 0:ww].astype(np.float32)
d = np.sqrt(((xx-cx)/(ww*0.30))**2 + ((yy-cy)/(ww*0.36))**2)
# sharp zone widened to hold both drinks (source px: centre 1380,1900; radii 1400x1150)
ex, ey, rx, ry = (1380 - x0)*k, 1900*k, 1400*k, 1150*k
dc = np.sqrt(((xx-ex)/rx)**2 + ((yy-ey)/ry)**2)
core = np.clip(1 - (dc-0.80)/0.35, 0, 1)**1.4
core = core[..., None]
mix = lin*core + blur*(1-core)
mix = mix*0.86 + lin*0.14*(1-core)      # faint double-exposure ghost

# ---- highlight bloom
Y = mix @ np.array([0.2126,0.7152,0.0722], np.float32)
gain = 1.45 - 0.37*core[..., 0]
mix = mix*gain[..., None]
Y = Y*gain
hi = np.clip((Y-0.30)/0.6, 0, 1)
bl = np.asarray(Image.fromarray((hi*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(24)), np.float32)/255
bl *= (1 - 0.85*core[..., 0])          # no orange haze over the drinks
mix = mix + bl[..., None]*np.array([0.75, 0.36, 0.11], np.float32)

# ---- warm amber grade (gradient map blended with warmed original colour)
out = np.clip(mix, 0, None) ** (1/2.2)
L = np.clip(out @ np.array([0.299,0.587,0.114], np.float32), 0, 1)
stops = np.array([0.0, 0.18, 0.45, 0.72, 1.0])
cols = np.array([[8,5,3],[60,22,6],[178,76,22],[246,150,70],[255,236,205]], np.float32)/255
gm = np.stack([np.interp(L, stops, cols[:,c]) for c in range(3)], -1)
warm = out * np.array([1.08, 0.92, 0.72], np.float32)
graded = gm*0.66 + warm*0.34
# keep skin/drinks a bit truer inside the sharp core
# drinks and skin keep their real colours, with only a warm tilt
# vivid, punchy drink colours: S-curve contrast + vibrance on the untouched source
natural = np.clip(x*1.04, 0, 1)
natural = natural + 0.18*(natural - 0.5)*(1 - np.abs(2*natural - 1))      # gentle S-curve
nL = natural @ np.array([0.299,0.587,0.114], np.float32)
chroma = np.abs(natural - nL[..., None]).max(-1, keepdims=True)
vib = 1.25 + 0.35*np.clip(chroma/0.35, 0, 1)                              # colourful things get the most push
natural = np.clip(nL[..., None] + (natural - nL[..., None])*vib, 0, 1)
natural *= np.array([1.02, 1.0, 0.97], np.float32)                         # tiny warm tie-in
# contrast: crush toward deep brown blacks (outside only)
graded = np.clip((graded - 0.03)/0.97, 0, 1) ** 1.18
graded = graded*(1-0.92*core) + natural*0.92*core
# vignette
v = np.clip(1 - 0.55*np.clip(d-0.6, 0, 1.4)**1.3, 0.25, 1)
v = (v*(1-core[...,0]) + np.maximum(v, 0.92)*core[...,0])[..., None]
graded *= v
# fine grain
rng = np.random.default_rng(9)
graded += rng.standard_normal(graded.shape[:2]).astype(np.float32)[..., None]*(0.012 - 0.008*core)
photo = Image.fromarray((np.clip(graded,0,1)*255+0.5).astype(np.uint8)).resize((PW, PH), Image.LANCZOS)
# crisp the sharp zone (drinks, hands, smile)
sharp = photo.filter(ImageFilter.UnsharpMask(radius=1.6, percent=120, threshold=2))
cm = Image.fromarray((core[..., 0]*255).astype(np.uint8)).resize((PW, PH), Image.BILINEAR)
photo = Image.composite(sharp, photo, cm)

# ---- poster: dark frame + caption
canvas = Image.new("RGB", (OUT_W, OUT_H), BG)
px, py = (OUT_W-PW)//2, (OUT_H-PH)//2 + 20
canvas.paste(photo, (px, py))
draw = ImageDraw.Draw(canvas)
F = "/usr/share/fonts/opentype/inter/"
bold = ImageFont.truetype(F+"Inter-Bold.otf", 40)
reg = ImageFont.truetype(F+"Inter-Regular.otf", 40)
parts = [("One ", bold), ("more ", reg), ("for the ", bold), ("memories.", reg)]
tw = sum(draw.textlength(t, font=f) for t, f in parts)
xx0 = (OUT_W - tw)/2; ty = py - 72
for t, f in parts:
    draw.text((xx0, ty), t, font=f, fill=(245, 240, 235))
    xx0 += draw.textlength(t, font=f)
canvas.save(dst, quality=95, subsampling=0)
print("saved", dst, canvas.size)
