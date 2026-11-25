# Arma la versión narrada: corta la voz por frases, la limpia y ajusta los tiempos del video a la voz.
# Uso: python3 armar_voz.py <dir_con_wavs_fuente> <dir_salida>
import re, json, subprocess, sys, os
SRC, OUT = sys.argv[1], sys.argv[2]
R = 1.08     # velocidad de la voz (1.08 = 8% más ágil, mismo tono)
LEAD = 0.35  # la voz arranca 0,35 s después del inicio de cada escena
# (archivo, inicio, fin, [momentos clave en tiempo del archivo]) por escena
CLIPS = [
 ("49c8f2bf", 0.30, 7.10,  [0.38, 3.94, 6.14]),                 # gancho
 ("49c8f2bf", 7.50, 14.85, [None, 7.54, 9.12, 12.46]),           # logo
 ("8d018db7", 0.00, 7.57,  [None, 2.38, None, 3.26]),            # terminal
 ("8d018db7", 7.57, 13.95, [None, 10.20, None, 12.48]),          # panel
 ("768ba84d", 0.45, 7.45,  [None, 2.78, None, 3.90]),            # productos
 ("768ba84d", 7.45, 14.48, [None, 9.68, None, 11.72]),           # asistente
 ("768ba84d", 14.48, 19.10,[None, 16.38, None]),                 # celular
 ("da5f385b", 0.00, 9.80,  [None]),                              # funciones
 ("da5f385b", 9.80, 21.30, [10.00, 11.20, 13.60, 16.12, 17.40, 19.42, 19.90]),  # soporte + CTA
]
TILE_WORDS = [-0.25, 0.00, 0.45, 0.90, 1.72, 3.48, 4.66, 5.60, 6.74]  # punto de venta, caja, stock, fiado, compras, reportes, cámaras, usuarios, respaldo
TAIL, HOLD = 0.45, 3.2

html = open('video.html').read()
scenes = list(re.finditer(r'<div class="scene" data-s="([\d.]+)" data-e="([\d.]+)">(.*?)(?=<div class="scene"|<div class="foot")', html, re.S))
t, starts, plan = 0.0, [], []
for i, (m, c) in enumerate(zip(scenes, CLIPS)):
    f, a, b, keys = c
    vd = (b - a) / R
    lead = 0.15 if i == 0 else LEAD
    dur = lead + vd + (HOLD if i == len(CLIPS) - 1 else TAIL)
    if i == 7: dur += 0.3
    starts.append(t)
    plan.append(dict(scene=i, start=round(t, 3), voice_at=round(t + lead, 3), file=f, a=a, b=b))
    v = lambda w: t + lead + (w - a) / R - 0.12   # aparece un poquito antes de la palabra
    body = m.group(3)
    ins = re.findall(r'data-in="([\d.]+)"', body)
    old_s = float(m.group(1))
    new = []
    for k, o in enumerate(ins):
        w = keys[k] if k < len(keys) else None
        nt = v(w) if w is not None else t + (float(o) - old_s)
        if i == 0 and k == 0: nt = 0.15
        new.append(nt)
    for k in range(1, len(new)):  # nunca antes que el anterior
        new[k] = max(new[k], new[k-1] + 0.1)
    it = iter(new)
    body2 = re.sub(r'data-in="[\d.]+"', lambda _: f'data-in="{next(it):.2f}"', body)
    end = 999 if i == len(CLIPS) - 1 else t + dur
    seg = f'<div class="scene" data-s="{t:.2f}" data-e="{end:.2f}">' + body2
    html = html.replace(m.group(0), seg, 1)
    if i == 7: tiles = [t + LEAD + w / R for w in TILE_WORDS]
    if i == 8: ring_t, cta_t = new[0], new[5]
    t += dur
TOTAL = t
html = html.replace('35.7 + (+tl.dataset.tile) * 0.22', 'TILE_T[+tl.dataset.tile]')
html = html.replace('const DURATION = 48;', f'const DURATION = {TOTAL:.2f};\nconst TILE_T = {json.dumps([round(x,2) for x in tiles])};')
html = html.replace('41.2', f'{ring_t+0.5:.2f}').replace('40.7', f'{ring_t:.2f}').replace('44.2', f'{cta_t+0.8:.2f}')
html = html.replace('t > 8.3 && t < 40.4', f't > {starts[2]:.2f} && t < {starts[8]-0.2:.2f}')
open('video-voz.html', 'w').write(html)

# ---- Audio: limpieza + cortes + ubicación ----
clean = 'highpass=f=85,lowpass=f=11500,afftdn=nf=-42:nr=14:tn=1,equalizer=f=250:t=q:w=1:g=-2.5,equalizer=f=3200:t=q:w=1.2:g=2.5,equalizer=f=7500:t=q:w=1.5:g=-1.5,acompressor=threshold=-22dB:ratio=3:attack=8:release=120:makeup=4'
os.makedirs(OUT, exist_ok=True)
for f in sorted({c[0] for c in CLIPS}):
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',f'{SRC}/{f}.wav','-af',clean,'-ar','48000',f'{OUT}/{f}_limpio.wav'], check=True)
inputs, filt = [], []
for k, p in enumerate(plan):
    inputs += ['-i', f"{OUT}/{p['file']}_limpio.wav"]
    d = int(round(p['voice_at'] * 1000))
    L = (p['b'] - p['a']) / R
    filt.append(f"[{k}]atrim={p['a']}:{p['b']},asetpts=PTS-STARTPTS,atempo={R},afade=t=in:d=0.04,afade=t=out:st={L-0.08:.3f}:d=0.08,adelay={d}:all=1[c{k}]")
filt.append(''.join(f'[c{k}]' for k in range(len(plan))) + f'amix=inputs={len(plan)}:normalize=0,apad,atrim=0:{TOTAL:.2f},loudnorm=I=-15:TP=-1.5:LRA=9,aresample=48000,pan=stereo|c0=c0|c1=c0[out]')
subprocess.run(['ffmpeg','-y','-loglevel','error',*inputs,'-filter_complex',';'.join(filt),'-map','[out]',f'{OUT}/voz_final.wav'], check=True)
json.dump(dict(total=TOTAL, plan=plan), open(f'{OUT}/plan.json','w'), indent=1)
print('Duración total:', round(TOTAL, 2))
for p in plan: print(p)
