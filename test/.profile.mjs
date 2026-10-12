import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { generateTimeline } from '../bench/generate.mjs';
const SIZE = Number(process.env.SIZE ?? 4000), MODE = process.env.MODE ?? 'wheel';
const server = createServer(async (req, res) => {
  const name = req.url === '/' ? 'index.html' : req.url.slice(1).split('?')[0];
  try { res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(await readFile('dist/' + name)); }
  catch { res.statusCode = 404; res.end(); }
}).listen(5182);
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto('http://localhost:5182/');
const doc = generateTimeline(SIZE);
await page.locator('#json-file').setInputFiles({ name: 'p.ochx', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
await page.waitForFunction((t) => document.getElementById('timeline-title').value === t, doc.title, { timeout: 120000 });
await page.waitForTimeout(1000);
const box = await page.locator('#timeline-stage').boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
// Frame times: rAF gaps.
await page.evaluate(() => { window.__gaps = []; let last = null; const t = (n) => { if (last !== null) window.__gaps.push(n - last); last = n; requestAnimationFrame(t); }; requestAnimationFrame(t); });
if (process.env.TRACE) await b.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });
await cdp.send('Profiler.start');
const started = Date.now();
await page.mouse.move(cx, cy);
const SINGLE = '.event-marker:not(.group):not(.duration-point)';
if (MODE === 'cancel' || MODE === 'delete' || MODE === 'typing') {
  // Zoom in until single moments show.
  for (let i = 0; i < 12 && !(await page.locator(SINGLE).count()); i++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(300); }
}
for (let r = 0; r < 4; r++) {
  if (MODE === 'typing') { if (r === 0) { await page.locator(SINGLE).first().click({ force: true }); await page.locator('#event-title').waitFor(); await page.locator('#event-title').press('End'); } await page.keyboard.type('abcdef', { delay: 120 }); await page.waitForTimeout(300); continue; }
  if (MODE === 'cancel') { await page.locator(SINGLE).first().click({ force: true }); await page.locator('#event-title').waitFor(); await page.locator('#event-title').press('End'); await page.keyboard.type('x'); await page.waitForTimeout(300); await page.locator('#event-cancel').click(); await page.waitForTimeout(400); continue; }
  if (MODE === 'delete') { await page.locator(SINGLE).first().click({ force: true }); await page.locator('#event-delete').click(); await page.locator('#delete-confirm').click(); await page.waitForTimeout(400); await page.locator('#undo-button').click(); await page.waitForTimeout(400); continue; }
  if (MODE === 'wheel') { for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, r % 2 ? 120 : -120); await page.waitForTimeout(60); } }
  else { await page.mouse.down(); for (let i = 1; i <= 20; i++) await page.mouse.move(cx + (r % 2 ? -1 : 1) * i * 15, cy); await page.mouse.up(); }
  await page.waitForTimeout(400);
}
const { profile } = await cdp.send('Profiler.stop');
if (process.env.TRACE) { const buf = await b.stopTracing(); const ev = JSON.parse(buf.toString()).traceEvents; const tot = new Map(); for (const e of ev) if (e.ph === 'X' && e.dur) tot.set(e.name, (tot.get(e.name) ?? 0) + e.dur); console.log('--- trace (ms)'); for (const [k, v] of [...tot].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log((v / 1000).toFixed(0).padStart(8), k); }
const gaps = await page.evaluate(() => window.__gaps);
const elapsed = Date.now() - started;
// Self time by function.
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas; let total = 0;
profile.samples.forEach((id, i) => { const n = byId.get(id); const f = n.callFrame; const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0)); total += dt[i] ?? 0; });
// Inclusive time for selected functions.
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const incl = new Map();
profile.samples.forEach((id, i) => { const seen = new Set(); for (let x = id; x !== undefined; x = parent.get(x)) { const f = byId.get(x).callFrame; const k = f.functionName || '(anon)'; if (seen.has(k)) continue; seen.add(k); incl.set(k, (incl.get(k) ?? 0) + (dt[i] ?? 0)); } });
const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 30);
const topIncl = [...incl].filter(([k]) => !['(root)', '(program)', '(idle)', '(anon)'].includes(k)).sort((a, b) => b[1] - a[1]).slice(0, 30);
console.log(`size ${SIZE} ${MODE}: ${elapsed} ms; frames ${gaps.length}; longest ${Math.max(...gaps).toFixed(0)} ms; median ${gaps.sort((a,b)=>a-b)[gaps.length>>1].toFixed(0)} ms; profiled ${(total/1000).toFixed(0)} ms`);
const callers = new Map();
profile.samples.forEach((id, i) => { const n = byId.get(id); const f = n.callFrame.functionName; if (!['parse','sub','compare','from','combine','toApproximateNumber','gcd','_Rational','div','newFraction'].includes(f)) return; let p = parent.get(id); while (p !== undefined && ['parse','sub','compare','from','combine','toApproximateNumber','gcd','_Rational','div','newFraction','mul','add','(anon)','__classPrivateFieldGet','parseDecimal'].includes(byId.get(p).callFrame.functionName)) p = parent.get(p); const c = p === undefined ? '?' : byId.get(p).callFrame.functionName + ':' + (byId.get(p).callFrame.lineNumber+1); callers.set(c, (callers.get(c) ?? 0) + (dt[i] ?? 0)); });
const kids = new Map();
const sum = (id) => { let t = 0; const st = [id]; while (st.length) { const x = st.pop(); t += (selfById.get(x) ?? 0); for (const c of byId.get(x).children ?? []) st.push(c); } return t; };
const selfById = new Map(); profile.samples.forEach((id, i) => selfById.set(id, (selfById.get(id) ?? 0) + (dt[i] ?? 0)));
for (const n of profile.nodes) if (n.callFrame.functionName === (process.env.FN ?? 'drawFrame')) for (const c of n.children ?? []) { const f = byId.get(c).callFrame; const k = (f.functionName || '(anon)') + ':' + (f.lineNumber + 1); kids.set(k, (kids.get(k) ?? 0) + sum(c)); }
console.log('--- children of ' + (process.env.FN ?? 'drawFrame') + ' (ms)'); for (const [k, v] of [...kids].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log((v / 1000).toFixed(0).padStart(8), k);
console.log('--- rational arithmetic by caller (ms)'); for (const [k, v] of [...callers].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log((v / 1000).toFixed(0).padStart(8), k);
console.log('--- self (ms)'); for (const [k, v] of top) console.log((v / 1000).toFixed(1).padStart(8), k);
console.log('--- inclusive (ms)'); for (const [k, v] of topIncl) console.log((v / 1000).toFixed(1).padStart(8), k);
await b.close(); server.close();
