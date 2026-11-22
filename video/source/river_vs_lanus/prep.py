import cv2, numpy as np
src=cv2.imread('/root/.claude/uploads/644ebc2f-86f6-5665-8422-0e518f737ee6/55856d23-image.jpg')
H,W=src.shape[:2]; f=src.astype(np.float32)
def gc(rect,it=6):
    m=np.zeros((H,W),np.uint8); b=np.zeros((1,65),np.float64); fg=np.zeros((1,65),np.float64)
    cv2.grabCut(src,m,rect,b,fg,it,cv2.GC_INIT_WITH_RECT)
    m=np.where((m==1)|(m==3),255,0).astype(np.uint8)
    n,l,st,_=cv2.connectedComponentsWithStats(m); k=1+np.argmax(st[1:,4]); m=(l==k).astype(np.uint8)*255
    cs,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE); m[:]=0; cv2.drawContours(m,cs,-1,255,-1)
    return m
river=gc((108,535,195,245)); lanus=gc((425,742,228,232))
b,g,r=[f[...,i] for i in range(3)]
# logo: purple neon + glow + white text, in box
lb=(190,50,570,232)
x0,y0,x1,y1=lb
pur=((b-g>35)&(b>90)).astype(np.uint8)*255
wht=((f.min(2)>215)).astype(np.uint8)*255
logo=np.zeros((H,W),np.uint8)
box=np.zeros((H,W),np.uint8); box[y0:y1,x0:x1]=1
# white text only counts in left (red) part or near purple
near=cv2.dilate(pur,np.ones((25,25),np.uint8))
redzone=np.zeros((H,W),np.uint8); redzone[:, 100:318]=1
logo=((pur>0)|((wht>0)&((redzone>0)|(near>0))))&(box>0)
logo=logo.astype(np.uint8)*255
logo=cv2.dilate(logo,np.ones((15,15),np.uint8))&(box*255)
# 19:00
tb=np.zeros((H,W),np.uint8); tb[408:492,478:622]=255
t19=cv2.dilate(((f.min(2)>170)&(tb>0)).astype(np.uint8)*255,np.ones((7,7),np.uint8))
cv2.imwrite('m_river.png',river);cv2.imwrite('m_lanus.png',lanus);cv2.imwrite('m_logo.png',logo);cv2.imwrite('m_19.png',t19)
viz=src.copy()
for m,c in ((river,(0,255,0)),(lanus,(255,255,0)),(logo,(0,255,255)),(t19,(255,0,255))):
    cs,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE); cv2.drawContours(viz,cs,-1,c,2)
cv2.imwrite('viz.png',viz)
wm=np.zeros((H,W),np.uint8)
wm[530:785,105:305]=((f[530:785,105:305].min(2)>185)*255).astype(np.uint8)
wm=cv2.morphologyEx(wm,cv2.MORPH_CLOSE,np.ones((5,5),np.uint8))
n,l,st,_=cv2.connectedComponentsWithStats(wm); k=1+np.argmax(st[1:,4]); wm=(l==k).astype(np.uint8)*255
cs,_=cv2.findContours(wm,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE); river=np.zeros_like(wm); cv2.drawContours(river,cs,-1,255,-1)
river=cv2.dilate(river,np.ones((3,3),np.uint8))
circ=np.zeros((H,W),np.uint8); cv2.circle(circ,(538,857),117,255,-1)
lanus=lanus&circ
lanus=cv2.morphologyEx(lanus,cv2.MORPH_CLOSE,np.ones((7,7),np.uint8))
cv2.imwrite('m_river.png',river);cv2.imwrite('m_lanus.png',lanus)
viz=src.copy()
for m,c in ((river,(0,255,0)),(lanus,(255,255,0))):
    cs,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE); cv2.drawContours(viz,cs,-1,c,1)
cv2.imwrite('viz.png',np.hstack([viz[520:800,90:320],viz[730:990,410:670][:280] if False else cv2.resize(viz[730:990,410:670],(230,280))]))
