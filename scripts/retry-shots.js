const fs = require('fs'), path = require('path'), puppeteer = require('puppeteer-core');
const OUT = 'C:/Users/HomePC/Documents/phone and desktop screenshots';
const BASE = 'http://localhost:3111';
const routes = fs.readFileSync('C:/Users/HomePC/Documents/routes.txt','utf8').split('\n').map(s=>s.trim()).filter(Boolean);
const want = fs.readFileSync('C:/Users/HomePC/Documents/retry.txt','utf8').split('\n').map(s=>s.trim()).filter(Boolean);
const SCALE = 2;
const DESKTOP = { width:1440, height:900, deviceScaleFactor:SCALE };
const MOBILE = { width:390, height:844, deviceScaleFactor:SCALE, isMobile:true, hasTouch:true };
(async () => {
  const b = await puppeteer.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:'new', args:['--no-sandbox','--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport(DESKTOP);
  await p.goto(`${BASE}/auth/login`, { waitUntil:'networkidle2', timeout:60000 });
  await p.type('input#username','admin',{delay:10});
  await p.type('input[name="password"]','admin123',{delay:10});
  await p.click('button[type="submit"]');
  for (let i=0;i<20;i++){ await new Promise(r=>setTimeout(r,1000));
    const s = await p.evaluate(async()=>{const r=await fetch('/api/auth/session');return r.ok?await r.json():null;}).catch(()=>null);
    if (s && s.user) { console.log('signed in'); break; } }
  let ok=0, bad=0;
  for (const slug of want) {
    const idx = routes.findIndex(r => (r===''?'dashboard-home':r.replace(/\//g,'-')) === slug);
    if (idx < 0) { console.log('  no route for', slug); continue; }
    const route = routes[idx];
    const n = String(idx+1).padStart(3,'0');
    // Warm the route once so the dev compile is not inside the timed capture.
    await p.goto(`${BASE}/dashboard/${route}`, { waitUntil:'domcontentloaded', timeout:180000 }).catch(()=>{});
    await new Promise(r=>setTimeout(r,2500));
    for (const [label, vp] of [['desktop',DESKTOP],['mobile',MOBILE]]) {
      try {
        await p.setViewport(vp);
        await p.goto(`${BASE}/dashboard/${route}`, { waitUntil:'networkidle2', timeout:120000 });
        await new Promise(r=>setTimeout(r,1500));
        await p.screenshot({ path: path.join(OUT, `${n}-${slug}__${label}.png`), fullPage:true });
        ok++;
      } catch(e){ bad++; console.log(`  STILL FAILED ${slug} ${label}: ${e.message.slice(0,60)}`); }
    }
    console.log('  done', slug);
  }
  await b.close();
  console.log(`retry: ${ok} written, ${bad} failed`);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1);});
