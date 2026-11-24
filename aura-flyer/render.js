const {chromium}=require('playwright');
const [,,html,outdir,fps,dur,dsf,only]=process.argv;
(async()=>{
 const b=await chromium.launch();
 const p=await b.newPage({viewport:{width:756,height:1344},deviceScaleFactor:+dsf});
 await p.goto('file://'+html+'#render'); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(500);
 const times= only? only.split(',').map(Number) : [...Array(Math.round(fps*dur)).keys()].map(i=>i/fps);
 let i=0; for(const t of times){ await p.evaluate(t=>seek(t),t); await p.screenshot({path:`${outdir}/f${String(i++).padStart(4,'0')}.png`}); }
 await b.close();
})();
