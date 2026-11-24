import sys, numpy as np
from PIL import Image
from rembg import remove, new_session
L='/home/user/Kesyzegarra/aura-flyer/layers/'
sess=new_session(sys.argv[1])
for n in ('p_left','p_right'):
    im=Image.open(L+n+'.png').convert('RGBA')
    rgb=Image.new('RGB',im.size,(0,0,0)); rgb.paste(im,(0,0),im)
    m=remove(rgb,session=sess,only_mask=True)
    m.save(f'mask_{n}.png')
