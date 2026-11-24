import numpy as np, cv2, json
from PIL import Image
L='/home/user/Kesyzegarra/aura-flyer/layers/'
meta=json.load(open(L+'meta.json'))
for n in ('p_left','p_right'):
    im=np.array(Image.open(L+n+'.png').convert('RGBA')).astype(np.float32)
    seg=np.array(Image.open(f'isnet-general-use/mask_{n}.png').convert('L')).astype(np.float32)/255
    a_layer=im[...,3]/255
    sub=np.clip((seg-.18)/.6,0,1)
    sub=cv2.GaussianBlur(sub,(0,0),0.8)
    a_fg=np.minimum(sub,a_layer)
    rgb=im[...,:3].astype(np.uint8)
    # fondo: quitar al sujeto (dilatado) e inpaint, luego desenfoque fuerte
    hole=(cv2.dilate((sub>.25).astype(np.uint8),np.ones((9,9),np.uint8),2)*255)
    bgc=cv2.inpaint(cv2.cvtColor(rgb,cv2.COLOR_RGB2BGR),hole,12,cv2.INPAINT_TELEA)
    bgc=cv2.GaussianBlur(bgc,(0,0),7)
    bgc=cv2.cvtColor(bgc,cv2.COLOR_BGR2RGB).astype(np.float32)*0.78  # un poco más oscuro = más profundidad
    x,y,w,h=meta[n]; a_bg=np.zeros_like(a_layer)   # solo el rectángulo de la foto
    a_bg[653-y:1194-y, 97-x:659-x]=1
    Image.fromarray(np.dstack([bgc,a_bg*255]).clip(0,255).astype(np.uint8)).save(L+n+'_bg.png')
    Image.fromarray(np.dstack([im[...,:3],a_fg*255]).clip(0,255).astype(np.uint8)).save(L+n+'_fg.png')
print('ok')
