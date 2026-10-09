// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Combines tinybench (in-memory, PostgreSQL) and criterion (SQLite) results into one
// self-contained HTML report: a chart per operation, latency against timeline size.
// Usage: node bench/report.mjs   (reads bench/results/node.json and native-store/target/criterion)
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { OPERATIONS } from './run.mjs';

const RESULTS = resolve(process.env.BENCH_RESULTS_DIR ?? 'bench/results');
const CRITERION = resolve(process.env.BENCH_CRITERION_DIR ?? 'native-store/target/criterion');
/** Fixed series order and categorical slots 1–3 (validated all-pairs, light and dark). */
const BACKENDS = [
  ['postgres', 'PostgreSQL', 1],
  ['sqlite', 'SQLite (desktop)', 2],
  ['memory', 'In-memory (browser)', 3],
];
const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
/** Criterion reports nanoseconds; per-sample means come from sample.json (time / iterations). */
async function criterionRows() {
  const rows = [];
  for (const [operation] of OPERATIONS) {
    const dir = join(CRITERION, operation, 'sqlite');
    for (const size of await readdir(dir).catch(() => [])) {
      if (!/^\d+$/.test(size)) continue;
      try {
        const estimates = JSON.parse(
          await readFile(join(dir, size, 'new', 'estimates.json'), 'utf8'),
        );
        const sample = JSON.parse(await readFile(join(dir, size, 'new', 'sample.json'), 'utf8'));
        const perIteration = sample.times
          .map((t, i) => t / sample.iters[i] / 1e6)
          .sort((a, b) => a - b);
        const mean = estimates.mean.point_estimate / 1e6;
        rows.push({
          backend: 'sqlite',
          size: Number(size),
          operation,
          mean,
          sd: estimates.std_dev.point_estimate / 1e6,
          p50: estimates.median.point_estimate / 1e6,
          p99: percentile(perIteration, 0.99),
          rme:
            (100 *
              (estimates.mean.confidence_interval.upper_bound - estimates.mean.point_estimate)) /
            estimates.mean.point_estimate,
          samples: sample.iters.reduce((a, b) => a + b, 0),
        });
      } catch {
        /* A missing or partial criterion run leaves that point out. */
      }
    }
  }
  return rows;
}
const ms = (v) =>
  v >= 1000
    ? (v / 1000).toPrecision(3) + ' s'
    : v >= 1
      ? v.toPrecision(3) + ' ms'
      : (v * 1000).toPrecision(3) + ' µs';
const escape = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
/** One log–log chart: x = timeline size, y = mean latency with ±1 SD whiskers, a line per backend. */
function chart(operation, title, rows) {
  const W = 440,
    H = 260,
    m = { l: 58, r: 112, t: 14, b: 40 };
  const sizes = [...new Set(rows.map((r) => r.size))].sort((a, b) => a - b);
  // A log axis cannot show mean − SD at or below zero; such whiskers stop at mean / 10.
  const floor = (r) => Math.max(r.mean - r.sd, r.mean / 10);
  const lows = rows.map((r) => Math.max(floor(r), 1e-4)),
    highs = rows.map((r) => r.mean + r.sd);
  const y0 = Math.floor(Math.log10(Math.min(...lows))),
    y1 = Math.ceil(Math.log10(Math.max(...highs)));
  const x0 = Math.log10(sizes[0]) - 0.15,
    x1 = Math.log10(sizes.at(-1)) + 0.15;
  const x = (s) => m.l + ((Math.log10(s) - x0) / (x1 - x0)) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - (Math.log10(v) - y0) / (y1 - y0 || 1)) * (H - m.t - m.b);
  const parts = [];
  for (let e = y0; e <= y1; e++) {
    const v = 10 ** e;
    parts.push(
      `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`,
      `<text class="tick" x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${ms(v)}</text>`,
    );
  }
  for (const s of sizes)
    parts.push(
      `<text class="tick" x="${x(s)}" y="${H - m.b + 16}" text-anchor="middle">${s.toLocaleString('en')}</text>`,
    );
  parts.push(
    `<text class="axis" x="${(m.l + W - m.r) / 2}" y="${H - 6}" text-anchor="middle">Moments in the timeline (log)</text>`,
  );
  const labels = [];
  for (const [key, name, slot] of BACKENDS) {
    const series = rows.filter((r) => r.backend === key).sort((a, b) => a.size - b.size);
    if (!series.length) continue;
    const path = series.map((r, i) => `${i ? 'L' : 'M'}${x(r.size)},${y(r.mean)}`).join(' ');
    parts.push(`<path class="line s${slot}" d="${path}"/>`);
    for (const r of series) {
      const lo = floor(r),
        hi = r.mean + r.sd,
        clipped = r.mean - r.sd < lo;
      parts.push(
        `<line class="whisker s${slot}" x1="${x(r.size)}" x2="${x(r.size)}" y1="${y(hi)}" y2="${y(r.mean)}"/>`,
        `<line class="whisker s${slot}${clipped ? ' clipped' : ''}" x1="${x(r.size)}" x2="${x(r.size)}" y1="${y(r.mean)}" y2="${y(lo)}"/>`,
        `<circle class="dot s${slot}" cx="${x(r.size)}" cy="${y(r.mean)}" r="4"/>`,
        `<circle class="hit" cx="${x(r.size)}" cy="${y(r.mean)}" r="12" tabindex="0" data-tip="${escape(
          `${name} · ${r.size.toLocaleString('en')} moments\nmean ${ms(r.mean)} ± ${ms(r.sd)}\nmedian ${ms(r.p50)} · p99 ${ms(r.p99)}\n${r.samples} samples · ±${r.rme.toFixed(1)}%`,
        )}"/>`,
      );
    }
    const last = series.at(-1);
    labels.push({ y: y(last.mean), name, slot });
  }
  // Direct labels at the line ends, nudged apart so they never overlap.
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 14);
  for (const l of labels)
    parts.push(
      `<text class="label" x="${W - m.r + 8}" y="${l.y + 4}"><tspan class="key s${l.slot}">●</tspan> ${escape(l.name)}</text>`,
    );
  return `<figure class="chart"><figcaption>${escape(title)}</figcaption>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escape(title)}: latency by timeline size">${parts.join('')}</svg></figure>`;
}
const bytes = (v) =>
  v >= 1e9
    ? (v / 1e9).toPrecision(3) + ' GB'
    : v >= 1e6
      ? (v / 1e6).toPrecision(3) + ' MB'
      : (v / 1e3).toPrecision(3) + ' kB';
/**
 * A capacity chart: medians against timeline size on log axes, a line per platform (the
 * throttled browser dashed in the browser's color), and reference lines such as the 100 ms
 * and 1 s responsiveness limits, so crossings are visible.
 */
function capacityChart(title, description, series, { unit = ms, guides = [] } = {}) {
  const W = 440,
    H = 260,
    m = { l: 58, r: 124, t: 14, b: 40 };
  const points = series.flatMap((s) => s.points);
  if (!points.length) return '';
  const sizes = [...new Set(points.map((p) => p.size))].sort((a, b) => a - b);
  const values = [...points.map((p) => p.value), ...guides.map((g) => g.value)].filter(
    (v) => v > 0,
  );
  const y0 = Math.floor(Math.log10(Math.min(...values))),
    y1 = Math.ceil(Math.log10(Math.max(...values)));
  const x0 = Math.log10(sizes[0]) - 0.15,
    x1 = Math.log10(sizes.at(-1)) + 0.15;
  const x = (v) => m.l + ((Math.log10(v) - x0) / (x1 - x0 || 1)) * (W - m.l - m.r);
  const y = (v) => m.t + (1 - (Math.log10(v) - y0) / (y1 - y0 || 1)) * (H - m.t - m.b);
  const parts = [];
  for (let e = y0; e <= y1; e++)
    parts.push(
      `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(10 ** e)}" y2="${y(10 ** e)}"/>`,
      `<text class="tick" x="${m.l - 6}" y="${y(10 ** e) + 4}" text-anchor="end">${unit(10 ** e)}</text>`,
    );
  for (const g of guides)
    parts.push(
      `<line class="guide" x1="${m.l}" x2="${W - m.r}" y1="${y(g.value)}" y2="${y(g.value)}"/>`,
      `<text class="guide-label" x="${m.l + 4}" y="${y(g.value) - 4}">${escape(g.label)}</text>`,
    );
  for (const size of sizes)
    parts.push(
      `<text class="tick" x="${x(size)}" y="${H - m.b + 16}" text-anchor="middle">${size.toLocaleString('en')}</text>`,
    );
  parts.push(
    `<text class="axis" x="${(m.l + W - m.r) / 2}" y="${H - 6}" text-anchor="middle">Moments in the timeline (log)</text>`,
  );
  const labels = [];
  for (const s of series) {
    const line = [...s.points].sort((a, b) => a.size - b.size);
    if (!line.length) continue;
    parts.push(
      `<path class="line s${s.slot}${s.dashed ? ' dashed' : ''}" d="${line.map((p, i) => `${i ? 'L' : 'M'}${x(p.size)},${y(p.value)}`).join(' ')}"/>`,
    );
    for (const p of line)
      parts.push(
        `<circle class="dot s${s.slot}" cx="${x(p.size)}" cy="${y(p.value)}" r="4"/>`,
        `<circle class="hit" cx="${x(p.size)}" cy="${y(p.value)}" r="12" tabindex="0" data-tip="${escape(`${s.name} · ${p.size.toLocaleString('en')} moments\n${p.tip ?? unit(p.value)}`)}"/>`,
      );
    labels.push({ y: y(line.at(-1).value), name: s.name, slot: s.slot, dashed: s.dashed });
  }
  labels.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 14);
  for (const l of labels)
    parts.push(
      `<text class="label" x="${W - m.r + 8}" y="${l.y + 4}"><tspan class="key s${l.slot}">${l.dashed ? '◌' : '●'}</tspan> ${escape(l.name)}</text>`,
    );
  return `<figure class="chart"><figcaption>${escape(title)}</figcaption><p class="note">${escape(description)}</p>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escape(title)} by timeline size">${parts.join('')}</svg></figure>`;
}
/** The capacity section: in-browser measurements beside the other platforms' equivalents. */
function capacity(capacityRows, rows) {
  const browser = (metric, throttle) =>
    capacityRows
      .filter((r) => r.platform === 'browser' && r.metric === metric && r.throttle === throttle)
      .map((r) => ({
        size: r.size,
        value: r.value,
        tip: `median ${metric === 'memory' ? bytes(r.value) : ms(r.value)} of ${r.samples.length}`,
      }));
  const measured = (backend, operation) =>
    rows
      .filter((r) => r.backend === backend && r.operation === operation)
      .map((r) => ({ size: r.size, value: r.p50, tip: `median ${ms(r.p50)}` }));
  const stored = (platform) =>
    capacityRows
      .filter((r) => r.platform === platform && r.metric === 'storage')
      .map((r) => ({ size: r.size, value: r.value }));
  const throttles = [...new Set(capacityRows.map((r) => r.throttle))].filter((t) => t > 1);
  const inBrowser = (metric) => [
    { name: 'Browser', slot: 3, points: browser(metric, 1) },
    ...throttles.map((t) => ({
      name: `Browser, ${t}× slower CPU`,
      slot: 3,
      dashed: true,
      points: browser(metric, t),
    })),
  ];
  const responsive = [
    { value: 100, label: '100 ms: feels instant' },
    { value: 1000, label: '1 s: keeps attention' },
  ];
  return [
    capacityChart(
      'Open a timeline',
      'Browser: import the file until the first view is drawn. Desktop: copy and check the file, then draw. Platform: metadata and the first view.',
      [
        ...inBrowser('open'),
        { name: 'SQLite (desktop)', slot: 2, points: measured('sqlite', 'open') },
        { name: 'PostgreSQL', slot: 1, points: measured('postgres', 'open') },
      ],
      { guides: responsive },
    ),
    capacityChart(
      'Redraw after navigating',
      'Browser: from applying new bounds to the drawn view. Desktop and platform: the whole-timeline viewport query.',
      [
        ...inBrowser('redraw'),
        { name: 'SQLite (desktop)', slot: 2, points: measured('sqlite', 'overview-full') },
        { name: 'PostgreSQL', slot: 1, points: measured('postgres', 'overview-full') },
      ],
      { guides: responsive },
    ),
    capacityChart(
      'Pause after an edit',
      'Browser: the longest gap between frames after renaming a browser-only timeline while signed in (redraw and draft save). Desktop and platform: saving one changed moment.',
      [
        ...inBrowser('edit'),
        { name: 'SQLite (desktop)', slot: 2, points: measured('sqlite', 'update') },
        { name: 'PostgreSQL', slot: 1, points: measured('postgres', 'update') },
      ],
      { guides: responsive },
    ),
    capacityChart(
      'Memory and storage',
      'Browser: JavaScript heap held by the open timeline. Desktop: the .och file. Platform: the timeline’s rows (excluding indexes and history).',
      [
        { name: 'Browser memory', slot: 3, points: browser('memory', 1) },
        { name: 'SQLite file', slot: 2, points: stored('sqlite') },
        { name: 'PostgreSQL rows', slot: 1, points: stored('postgres') },
      ],
      { unit: bytes },
    ),
  ].join('\n');
}
function table(rows) {
  const body = [...rows]
    .sort(
      (a, b) =>
        OPERATIONS.findIndex(([o]) => o === a.operation) -
          OPERATIONS.findIndex(([o]) => o === b.operation) ||
        a.size - b.size ||
        a.backend.localeCompare(b.backend),
    )
    .map(
      (r) =>
        `<tr><td>${escape(OPERATIONS.find(([o]) => o === r.operation)[1])}</td><td>${escape(BACKENDS.find(([k]) => k === r.backend)[1])}</td><td>${r.size.toLocaleString('en')}</td><td>${ms(r.mean)}</td><td>${ms(r.sd)}</td><td>${ms(r.p50)}</td><td>${ms(r.p99)}</td><td>±${r.rme.toFixed(1)}%</td><td>${r.samples}</td></tr>`,
    )
    .join('');
  return `<table><thead><tr><th>Operation</th><th>Backend</th><th>Moments</th><th>Mean</th><th>SD</th><th>Median</th><th>p99</th><th>Margin</th><th>Samples</th></tr></thead><tbody>${body}</tbody></table>`;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const node = JSON.parse(
    await readFile(join(RESULTS, 'node.json'), 'utf8').catch(() => '{"rows":[]}'),
  );
  const capacityRows = JSON.parse(
    await readFile(join(RESULTS, 'capacity.json'), 'utf8').catch(() => '{"rows":[]}'),
  ).rows;
  const rows = [...node.rows, ...(await criterionRows())];
  if (!rows.length) throw new Error('No results; run node bench/run.mjs and cargo bench first.');
  await mkdir(RESULTS, { recursive: true });
  await writeFile(
    join(RESULTS, 'results.json'),
    JSON.stringify({ ...node, rows, capacity: capacityRows }, null, 2),
  );
  const charts = OPERATIONS.filter(([o]) => rows.some((r) => r.operation === o))
    .map(([o, title]) =>
      chart(
        o,
        title,
        rows.filter((r) => r.operation === o),
      ),
    )
    .join('\n');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OpenChronology benchmarks</title><style>
:root{color-scheme:light;--surface:#fcfcfb;--page:#f5f6f1;--ink:#0b0b0b;--muted:#52514e;--grid:#e3e3df;--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){color-scheme:dark;--surface:#1a1a19;--page:#121211;--ink:#fff;--muted:#c3c2b7;--grid:#33332f;--s1:#3987e5;--s2:#d95926;--s3:#199e70}}
:root[data-theme=dark]{color-scheme:dark;--surface:#1a1a19;--page:#121211;--ink:#fff;--muted:#c3c2b7;--grid:#33332f;--s1:#3987e5;--s2:#d95926;--s3:#199e70}
body{margin:0;padding:24px 16px;background:var(--page);color:var(--ink);font:14px/1.5 Inter,ui-sans-serif,system-ui,sans-serif}
main{max-width:1440px;margin:0 auto}h1{font:400 30px Georgia,serif;margin:0 0 6px}p{color:var(--muted);margin:0 0 6px}
.grid-charts{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,440px),1fr));gap:16px;margin:20px 0}
.chart{margin:0;background:var(--surface);border-radius:12px;padding:12px}.chart figcaption{font-weight:600;margin:0 0 4px}
svg{width:100%;height:auto;overflow:visible}.grid{stroke:var(--grid);stroke-width:1}.tick,.axis,.label{fill:var(--muted);font-size:11px}.label{fill:var(--ink)}
.line{fill:none;stroke-width:2}.line.dashed{stroke-dasharray:6 4}.guide{stroke:var(--muted);stroke-width:1;stroke-dasharray:2 4}.guide-label{fill:var(--muted);font-size:10px}.chart .note{font-size:12px;margin:0 0 6px}
h2{font:400 22px Georgia,serif;margin:28px 0 4px}.whisker{stroke-width:1.5;opacity:.55}.whisker.clipped{stroke-dasharray:3 3}.dot{stroke:var(--surface);stroke-width:2}
.s1{stroke:var(--s1);fill:var(--s1)}.s2{stroke:var(--s2);fill:var(--s2)}.s3{stroke:var(--s3);fill:var(--s3)}.line.s1,.line.s2,.line.s3{fill:none}.key{stroke:none}
.hit{fill:transparent;cursor:default}.hit:focus{outline:none;stroke:var(--ink);stroke-width:1.5;fill:transparent}
#tip{position:fixed;pointer-events:none;background:var(--surface);color:var(--ink);border:1px solid var(--grid);border-radius:8px;padding:8px 10px;white-space:pre;font-size:12px;box-shadow:0 6px 20px #0003;display:none}
details{background:var(--surface);border-radius:12px;padding:12px}summary{cursor:pointer;font-weight:600}
table{border-collapse:collapse;width:100%;margin-top:10px;font-variant-numeric:tabular-nums;font-size:12px}th,td{text-align:right;padding:4px 8px;border-bottom:1px solid var(--grid)}th:nth-child(-n+2),td:nth-child(-n+2){text-align:left}
.legend{display:flex;flex-wrap:wrap;gap:16px;margin-top:10px}.legend span{display:flex;gap:6px;align-items:center}.legend i{width:16px;height:3px;border-radius:2px}
</style></head><body><main>
<h1>OpenChronology benchmarks</h1>
<p>Mean latency with ±1 standard deviation by timeline size. Both axes are logarithmic. Where the standard deviation exceeds the mean, the lower whisker is dashed and stops at a tenth of the mean. Hover or focus a point for the median, p99 and sample count.</p>
<p>${escape(node.platform ?? '')} · Node ${escape(node.node ?? '')} · ${escape(node.finished ?? '')} · in-memory and PostgreSQL measured with tinybench, SQLite with criterion</p>
<div class="legend">${BACKENDS.map(([, name, slot]) => `<span><i style="background:var(--s${slot})"></i>${escape(name)}</span>`).join('')}</div>
${
  capacityRows.length
    ? `<h2>Capacity</h2><p>Where each platform stops feeling responsive. In-browser figures are medians measured in Chromium (${escape(node.platform ?? '')}), at full speed and with the CPU throttled, which roughly approximates a mid-range phone. Dotted lines mark common responsiveness limits.</p><div class="grid-charts">${capacity(capacityRows, rows)}</div><h2>Latency by operation</h2>`
    : ''
}
<div class="grid-charts">${charts}</div>
<details><summary>All measurements</summary>${table(rows)}</details>
</main><div id="tip" role="tooltip"></div><script>
const tip=document.getElementById('tip');
const show=(t,x,y)=>{tip.textContent=t.dataset.tip;tip.style.display='block';tip.style.left=Math.min(x+12,innerWidth-tip.offsetWidth-8)+'px';tip.style.top=(y+12)+'px'};
for(const t of document.querySelectorAll('.hit')){t.addEventListener('pointermove',e=>show(t,e.clientX,e.clientY));t.addEventListener('focus',()=>{const r=t.getBoundingClientRect();show(t,r.right,r.bottom)});for(const ev of['pointerleave','blur'])t.addEventListener(ev,()=>tip.style.display='none')}
</script></body></html>`;
  await writeFile(join(RESULTS, 'report.html'), html);
  console.log(`Wrote ${join(RESULTS, 'report.html')} (${rows.length} measurements)`);
}
