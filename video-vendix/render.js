// Renderiza video.html a MP4 (1080x1920, 30 fps).
// Uso:  node render.js                          -> vendix-promo.mp4
//       node render.js --contacto "📞 0342 123-4567"
//       node render.js --html video-voz.html --audio voz_final.wav --out vendix-promo-voz.mp4
//       node render.js --stills 2,6,10          -> capturas de prueba
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const FPS = 30;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const contacto = opt('--contacto');
  const url = 'file://' + path.join(__dirname, opt('--html') || 'video.html') + (contacto ? '?contacto=' + encodeURIComponent(contacto) : '');
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);

  const stills = opt('--stills');
  if (stills) {
    for (const t of stills.split(',').map(Number)) {
      await page.evaluate(t => render(t), t);
      await page.screenshot({ path: path.join(opt('--out') || '.', `still-${t}.jpg`), type: 'jpeg', quality: 80 });
    }
    await browser.close();
    return;
  }

  const out = opt('--out') || path.join(__dirname, 'vendix-promo.mp4');
  const dur = await page.evaluate(() => window.DURATION);
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    ...(opt('--audio') ? ['-i', opt('--audio')] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo']), '-shortest',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '192k', out], { stdio: ['pipe', 'ignore', 'inherit'] });
  const total = Math.round(dur * FPS);
  for (let f = 0; f < total; f++) {
    await page.evaluate(t => render(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 150 === 0) console.log(`frame ${f}/${total}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
  console.log('Listo:', out);
})();
