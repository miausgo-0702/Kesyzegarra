const { chromium } = require('playwright');
const fs = require('fs');
const [,, html, outDir, fpsArg, onlyArg] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.addInitScript(() => { window.__render = true; });
  await p.goto('file://' + html);
  await p.evaluate(() => document.fonts.ready);
  const fps = +fpsArg, total = await p.evaluate(() => window.TOTAL);
  fs.mkdirSync(outDir, { recursive: true });
  const times = onlyArg ? onlyArg.split(',').map(Number) : [...Array(Math.round(total * fps)).keys()].map(i => i / fps);
  for (let i = 0; i < times.length; i++) {
    const d = await p.evaluate(t => { Math.random = (() => { let s = Math.floor(t * 1000) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; })(); frame(t); return document.getElementById('c').toDataURL('image/jpeg', 0.92); }, times[i]);
    fs.writeFileSync(`${outDir}/f${String(i).padStart(5, '0')}.jpg`, Buffer.from(d.split(',')[1], 'base64'));
  }
  await b.close();
})();
