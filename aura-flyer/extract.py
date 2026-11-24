import cv2, numpy as np, json, sys
from PIL import Image
src = cv2.imread(sys.argv[1]); out = sys.argv[2]
H,W = src.shape[:2]
# element boxes (x0,y0,x1,y1)
E = {
 'logo':    (225,55,535,160),
 'tagline': (225,168,535,192),
 'l1':      (92,220,668,314),
 'l2':      (128,316,622,414),
 'l3':      (86,426,672,536),
 'guest':   (93,555,285,638),
 'badge':   (498,556,664,606),
 's1':      (95,1212,205,1318),
 's2':      (222,1225,385,1307),
 's3':      (398,1225,545,1305),
 's4':      (568,1220,665,1312),
}
PH = (97,653,659,1194)   # photo rect
POP = (659,780,740,1060) # right person / plant pop-out area
POPL = (28,795,97,870)
POPT = (515,615,645,653)
mask = np.zeros((H,W),np.uint8)
for b in E.values(): mask[b[1]-8:b[3]+8, b[0]-8:b[2]+10]=255
for b in (POP,POPL,PH,POPT): mask[b[1]-6:b[3]+6, b[0]-6:b[2]+6]=255
keep = (mask==0).astype(np.float32)
f = src.astype(np.float32)
fill=None
for sg in (160,60,20):
    num = cv2.GaussianBlur(f*keep[...,None],(0,0),sg); den = cv2.GaussianBlur(keep,(0,0),sg)[...,None]
    cur = num/np.maximum(den,1e-6)
    if fill is None: fill=cur
    else:
        w = np.clip(den*4,0,1); fill = cur*w+fill*(1-w)
mf = cv2.GaussianBlur((mask>0).astype(np.float32),(0,0),3)[...,None]
plate = (f*(1-mf)+fill*mf).clip(0,255).astype(np.uint8)
cv2.imwrite(f'{out}/bg.jpg', plate, [cv2.IMWRITE_JPEG_QUALITY,92])

def matte(b, pad=4, k=38.0):
    x0,y0,x1,y1 = b[0]-pad,b[1]-pad,b[2]+pad,b[3]+pad
    o = src[y0:y1,x0:x1].astype(np.float32); p = plate[y0:y1,x0:x1].astype(np.float32)
    d = np.sqrt(((o-p)**2).sum(2))
    a = np.clip((d-22)/k,0,1)
    a = cv2.GaussianBlur(a,(0,0),0.6)
    af = np.maximum(a,1e-3)[...,None]
    fg = np.clip((o-(1-af)*p)/af,0,255)
    rgba = np.dstack([fg[...,::-1], a*255]).astype(np.uint8)
    return rgba,(x0,y0,x1-x0,y1-y0)
meta={}
for n,b in E.items():
    rgba,geo = matte(b); Image.fromarray(rgba,'RGBA').save(f'{out}/{n}.png'); meta[n]=geo
# photo: inpaint the names + subtitle so they can be re-typeset live
ph = src[PH[1]:PH[3], PH[0]:PH[2]].copy()
g = cv2.cvtColor(ph,cv2.COLOR_BGR2GRAY)
tm = np.zeros(g.shape,np.uint8)
for (x0,y0,x1,y1) in [(50,395,250,488),(310,395,525,488),(95,488,470,535)]:
    tm[y0:y1,x0:x1] = (g[y0:y1,x0:x1]>120).astype(np.uint8)*255
tm = cv2.dilate(tm, np.ones((5,5),np.uint8), 2)
ph = cv2.inpaint(ph, tm, 6, cv2.INPAINT_TELEA)
# photo halves with right pop-out
full = np.dstack([src[...,::-1], np.zeros((H,W),np.uint8)])
full[PH[1]:PH[3], PH[0]:PH[2],:3] = ph[...,::-1]; full[PH[1]:PH[3], PH[0]:PH[2],3]=255
for P in (POP,POPL,POPT):
    rgba,_ = matte(P,pad=0,k=30); full[P[1]:P[3],P[0]:P[2],3] = np.maximum(full[P[1]:P[3],P[0]:P[2],3], rgba[...,3])

mid=378
Image.fromarray(full[PH[1]:PH[3], POPL[0]:mid]).save(f'{out}/p_left.png'); meta['p_left']=(POPL[0],PH[1],mid-POPL[0],PH[3]-PH[1])
Image.fromarray(full[POPT[1]:PH[3], mid:POP[2]]).save(f'{out}/p_right.png'); meta['p_right']=(mid,POPT[1],POP[2]-mid,PH[3]-POPT[1])
json.dump(meta,open(f'{out}/meta.json','w'))
print(meta)
