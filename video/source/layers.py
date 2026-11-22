import cv2, numpy as np
src=cv2.imread('/root/.claude/uploads/644ebc2f-86f6-5665-8422-0e518f737ee6/a2b99b8a-image.jpg')
Hs,Ws=src.shape[:2]
f=src.astype(np.float32)
Q=np.float32([(10,360),(815,262),(985,1330),(140,1390)])
SW,SH=810,1040
Rq=np.float32([(0,0),(SW,0),(SW,SH),(0,SH)])
M=cv2.getPerspectiveTransform(Q,Rq)
# ---- elements outside screen
EL={ # name: box x0,y0,x1,y1 , kind
 'logo':((425,95,645,205),'t'),
 'dom':((90,1400,355,1495),'t'),
 'band':((725,1400,990,1495),'t'),
 'time':((90,1530,355,1595),'t'),
 'aura':((670,1530,990,1595),'t'),
 'tick':((92,1606,988,1664),'t'),
 'fer':((100,1678,280,1795),'s'),
 'car':((345,1685,510,1782),'s'),
 'wei':((600,1680,725,1800),'s'),
 'hei':((810,1695,970,1790),'s'),
}
med=cv2.medianBlur(src,61).astype(np.float32)
diff=np.abs(f-med).max(2)
union=np.zeros((Hs,Ws),np.uint8)
masks={}
for k,(b,kind) in EL.items():
    x0,y0,x1,y1=b
    m=np.zeros((Hs,Ws),np.uint8)
    m[y0:y1,x0:x1]=(diff[y0:y1,x0:x1]>40)*255
    m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((2,2),np.uint8))
    if kind=='s':
        m=cv2.morphologyEx(m,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
    md=cv2.dilate(m,np.ones((17,17),np.uint8))
    md[:y0-6]=0; md[y1+6:]=0; md[:, :x0-6]=0; md[:, x1+6:]=0
    masks[k]=md
    union|=md
bg=cv2.inpaint(src,union,9,cv2.INPAINT_TELEA)
bgf=bg.astype(np.float32)
out={}
for k,(b,kind) in EL.items():
    x0,y0,x1,y1=b; p=10
    x0-=p;y0-=p;x1+=p;y1+=p
    md=masks[k][y0:y1,x0:x1]
    d=np.abs(f[y0:y1,x0:x1]-bgf[y0:y1,x0:x1]).max(2)
    a=np.clip((d-8)/(90 if kind=='s' else 110),0,1)*(cv2.GaussianBlur(md,(9,9),0)/255)
    out[k]=(x0,y0,f[y0:y1,x0:x1].copy(),bgf[y0:y1,x0:x1].copy(),a)
# ---- screen
scr=cv2.warpPerspective(src,M,(SW,SH),flags=cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE)
b_,g_,r_=[scr[...,i].astype(int) for i in range(3)]
t=((r_>110)&(r_-b_>50)&(r_-g_>45)).astype(np.uint8)*255; t[520:]=0
td=cv2.dilate(t,np.ones((21,21),np.uint8))
sbg=cv2.inpaint(scr,td,9,cv2.INPAINT_TELEA).astype(np.float32)
wr=cv2.GaussianBlur(cv2.dilate(t,np.ones((41,41),np.uint8)),(41,41),0)[...,None]/255.
dk=sbg.copy(); dk[...,2]=np.minimum(dk[...,2],dk[...,:2].max(2)); dk*=0.75
sbg=sbg*(1-wr)+dk*wr
sf=scr.astype(np.float32)
ta=np.clip((np.abs(sf-sbg).max(2)-6)/110,0,1)*cv2.GaussianBlur(cv2.dilate(t,np.ones((31,31),np.uint8)),(15,15),0)/255
np.save('tmask.npy',t)
rows=np.where(t.sum(1)>0)[0]
# split lines by gaps in row profile
prof=t.sum(1)/255
np.savez_compressed('layers.npz',bg=bgf,sbg=sbg,sf=sf,ta=ta,prof=prof,M=M,Q=Q,**{k+'_'+n:v for k,(x0,y0,F,B,A) in out.items() for n,v in (('pos',np.array([x0,y0])),('F',F),('B',B),('A',A))})
cv2.imwrite('chk_bg.png',cv2.resize(bg,None,fx=.5,fy=.5))
cv2.imwrite('chk_sbg.png',cv2.resize(sbg.astype(np.uint8),None,fx=.5,fy=.5))
viz=np.zeros((Hs,Ws),np.float32)
for k,(x0,y0,F,B,A) in out.items(): viz[y0:y0+A.shape[0],x0:x0+A.shape[1]]=np.maximum(viz[y0:y0+A.shape[0],x0:x0+A.shape[1]],A)
cv2.imwrite('chk_alpha.png',(viz[1380:1820]*255).astype(np.uint8))
print([ (i,int(v)) for i,v in enumerate(prof) if i%10==0 and i<460])
