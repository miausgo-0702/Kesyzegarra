import cv2, numpy as np
src=cv2.imread('/root/.claude/uploads/644ebc2f-86f6-5665-8422-0e518f737ee6/55856d23-image.jpg')
H,W=src.shape[:2]; f=src.astype(np.float32)
rd=lambda n: cv2.imread(n,0)
river,lanus,logo,t19=rd('m_river.png'),rd('m_lanus.png'),rd('m_logo.png'),rd('m_19.png')
# --- clean: remove top elements
clean=src.copy()
tint=np.zeros((H,W),np.uint8); tint[40:240,185:580]=(((f[...,0]-f[...,1])>6)|((f[...,2]-f[...,1])>40)&(f[...,0]>f[...,1]))[40:240,185:580]*255
tint[:, :318]=0
lm=cv2.dilate(logo|tint,np.ones((9,9),np.uint8))
L=lm.copy(); L[:,318:]=0; R=lm.copy(); R[:,:318]=0
tmp=clean.copy(); tmp[R>0]=0
c1=cv2.inpaint(clean,cv2.bitwise_or(L,R),7,cv2.INPAINT_TELEA)
# two-sided: inpaint left half with right masked as unknown too, and vice versa
cl=cv2.inpaint(clean,(lm|np.pad(np.ones((H,W-318),np.uint8)*255,((0,0),(318,0)))[:, :W]*(np.arange(W)[None,:]>=318)).astype(np.uint8),7,cv2.INPAINT_TELEA)
mr=lm.copy(); mr[:,:330]=255
cr=cv2.inpaint(clean,mr,7,cv2.INPAINT_TELEA)
clean[L>0]=cl[L>0]; clean[R>0]=cr[R>0]
md=cv2.dilate(lanus,np.ones((15,15),np.uint8))
cv2.circle(md,(538,857),124,255,-1)
xs=np.arange(W)[None,:]
inside=(xs>=445)&(xs<=650)
mi=(md>0)&inside; mo=(md>0)&~inside
band=np.zeros((H,W),bool); band[700:1010]=True
inside=(xs>=438)&(xs<=652)
mo=(md>0)&~inside
co=cv2.inpaint(clean,((mo|(band&inside))*255).astype(np.uint8),9,cv2.INPAINT_TELEA)
cf0=clean.astype(np.float32); fill=cf0.copy()
for x in range(438,653):
    ys=np.where(md[:,x]>0)[0]
    if len(ys)==0: continue
    t0,t1=ys.min()-4,ys.max()+4
    top_=cf0[t0-6:t0,x].mean(0); bot_=cf0[t1:t1+6,x].mean(0)
    w=np.linspace(0,1,t1-t0)[:,None]
    fill[t0:t1,x]=top_*(1-w)+bot_*w
fill=cv2.GaussianBlur(fill,(0,0),3)
ind=(md>0)&inside
ind2=cv2.dilate(ind.astype(np.uint8),np.ones((9,1),np.uint8))>0
clean[ind2&inside]=np.clip(fill[ind2&inside],0,255).astype(np.uint8)
clean[mo]=co[mo]
for m,kk in ((river,7),(t19,7)):
    md=cv2.dilate(m,np.ones((kk,kk),np.uint8))
    clean=cv2.inpaint(clean,md,9,cv2.INPAINT_TELEA)
cf=clean.astype(np.float32)
# --- plain white background estimate
wh=((cf.min(2)>226)&((cf.max(2)-cf.min(2))<14)).astype(np.uint8)
s=8
sm=cv2.resize(clean,(W//s,H//s),interpolation=cv2.INTER_AREA)
wms=cv2.resize(wh*255,(W//s,H//s),interpolation=cv2.INTER_AREA)
bgs=cv2.inpaint(sm,(wms<250).astype(np.uint8)*255,5,cv2.INPAINT_TELEA)
bgW=cv2.GaussianBlur(cv2.resize(bgs,(W,H),interpolation=cv2.INTER_CUBIC).astype(np.float32),(0,0),6)
bgW=np.maximum(bgW,225)
d=np.clip((bgW-cf).max(2),0,255)
sat=cf.max(2)-cf.min(2)
lab=np.zeros((H,W),np.int16)  # 0 = background
names=[]
def assign(name,box,extra=None):
    x0,y0,x1,y1=box
    m=np.zeros((H,W),bool); m[y0:y1,x0:x1]=True
    if extra is not None: m&=extra
    m&=(lab==0)
    names.append(name); lab[m]=len(names)
strong=(sat>45)
assign('dots2',(330,480,432,502))
assign('dots1',(435,262,588,390))
assign('stripes',(100,966,272,1152))
assign('vs',(282,552,438,838))
assign('lpf',(345,878,412,960))
assign('rp',(0,320,100,1015),strong)
assign('outL',(0,0,105,1070))
assign('hatch',(0,1175,108,1315))
assign('lanT',(655,555,745,920),strong)
assign('outR',(655,0,756,570))
assign('redp',(100,0,337,1015))
assign('marp',(405,355,665,1245))
K={'outL':45,'outR':45,'hatch':45,'dots1':70,'dots2':70}
out={}
for i,n in enumerate(names,1):
    m=(lab==i)
    k=K.get(n,80)
    a=np.clip((d-5)/k,0,1)*m
    ys,xs=np.where(a>0.01)
    if len(ys)==0: print('empty',n); continue
    y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
    out[n]=(x0,y0,cf[y0:y1,x0:x1],a[y0:y1,x0:x1].astype(np.float32),bgW[y0:y1,x0:x1])
# --- top layers from src
def top(name,m,k=None,feather=3):
    ms=cv2.GaussianBlur(m,(feather*2+1,feather*2+1),0).astype(np.float32)/255
    if k: ms=ms*np.clip((np.abs(f-cf).max(2)-4)/k,0,1)
    ys,xs=np.where(ms>0.01); y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
    out[name]=(x0,y0,f[y0:y1,x0:x1],ms[y0:y1,x0:x1],cf[y0:y1,x0:x1])
top('river',river,feather=1); top('lanus',lanus,feather=1)
top('logo',cv2.dilate(logo,np.ones((9,9),np.uint8)),k=70,feather=7)
top('t19',cv2.dilate(t19,np.ones((5,5),np.uint8)),k=90,feather=3)
np.savez_compressed('layers.npz',bg=bgW,names=np.array(list(out.keys())),**{n+'_'+s:v for n,(x0,y0,F,A,B) in out.items() for s,v in (('pos',np.array([x0,y0])),('F',F),('A',A),('B',B))})
cv2.imwrite('chk_clean.png',clean); cv2.imwrite('chk_bgW.png',bgW.astype(np.uint8))
# rebuild check: composite all layers on bgW
c=bgW.copy()
order=['outL','outR','hatch','redp','marp','dots1','dots2','stripes','rp','lanT','vs','lpf','river','lanus','logo','t19']
for n in order:
    x0,y0,F,A,B=out[n]; a=A[...,None]
    Fu=np.where(a<0.05,F,np.clip((F-(1-a)*B)/np.maximum(a,0.05),0,255))
    c[y0:y0+A.shape[0],x0:x0+A.shape[1]]=c[y0:y0+A.shape[0],x0:x0+A.shape[1]]*(1-a)+Fu*a
cv2.imwrite('chk_rebuild.png',np.hstack([src,c.astype(np.uint8),clean]))
print(list(out.keys()))
