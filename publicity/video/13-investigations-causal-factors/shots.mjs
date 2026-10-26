// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Writes shots.json for Video 13: the shots of the made-up investigation
// (samples/investigation.ochx) in the real editor. Compare needs the procedure's .ochx as a
// file, so its text is put into the shot's action here rather than copied by hand.
// Usage: node publicity/video/13-investigations-causal-factors/shots.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const here = new URL('.', import.meta.url).pathname;
const procedure = readFileSync(`${here}../samples/investigation-procedure.ochx`, 'utf8');
/** Seconds since 1970 of h:mi:s on a day of October 2026, UTC. */
const u = (day, h, mi, s = 0) => Date.UTC(2026, 9, day, h, mi, s) / 1000;
// The views: the night's last forty minutes, the last eighty seconds, both of the picker's
// crossings, the week before, the stack, the last two minutes, and the shift.
const NIGHT = [u(16, 2, 5), u(16, 2, 45)];
const LAST = [u(16, 2, 33, 5), u(16, 2, 34, 25)];
const CROSSINGS = [u(16, 2, 29), u(16, 2, 35, 30)];
const WEEK = [u(12, 0, 0), u(16, 12, 0)];
const STACK = [u(16, 2, 33, 10), u(16, 2, 34, 40)];
const TWO = [u(16, 2, 31, 30), u(16, 2, 34, 50)];
const SHIFT = [u(15, 19, 30), u(16, 3, 30)];
const key = (t, view) => ({ t, view });
const click = (text) =>
  `(() => { const b = [...document.querySelectorAll('button, summary')].find((e) => e.textContent.trim() === ${JSON.stringify(text)} && e.offsetParent); if (b) b.click(); })()`;
/** The presentation size (A− / A+), as Ctrl-scroll sets it, anchored at the stage's top. */
const size = (k) =>
  `(() => { const s = document.getElementById('timeline-stage'); const r = s.getBoundingClientRect(); const now = Number(s.dataset.uiScale) || 1; const d = -Math.log(${k} / now) / 0.002; s.dispatchEvent(new WheelEvent('wheel', { deltaY: d, ctrlKey: true, clientX: r.left + r.width / 2, clientY: r.top, bubbles: true, cancelable: true })); })()`;
const addProcedure = `(() => { document.getElementById('compare-button').click(); const f = new File([${JSON.stringify(procedure)}], 'investigation-procedure.ochx', { type: 'application/json' }); const t = new DataTransfer(); t.items.add(f); const i = document.getElementById('compare-file'); i.files = t.files; i.dispatchEvent(new Event('change', { bubbles: true })); })()`;
const viewMode = { do: 'viewMode', on: true };
/** Scrolls the open dialog to fraction f of the way down, as a reader would. */
const scroll = (f) =>
  `(() => { for (const e of document.querySelectorAll('dialog[open], dialog[open] *')) if (e.scrollHeight > e.clientHeight + 4 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = ${f} * (e.scrollHeight - e.clientHeight); })()`;

const shots = [
  {
    // Scene 2: the night, the last eighty seconds, the collision's exact time, both crossings.
    id: 'sequence',
    dur: 17,
    keys: [key(0, NIGHT), key(3, NIGHT), key(7, LAST), key(12.5, LAST), key(14.5, CROSSINGS)],
    actions: [
      { t: 7.6, do: 'open', title: 'Collision' },
      { t: 9.4, do: 'eval', js: click('Exact rational coordinate') },
      { t: 12.3, do: 'press', key: 'Escape' },
    ],
  },
  {
    // Scene 3: the conditions under the night, the week they come from, the collision's stack.
    id: 'conditions',
    dur: 15,
    keys: [key(0, NIGHT), key(3, NIGHT), key(6.5, WEEK), key(8.5, WEEK), key(11.5, STACK)],
    actions: [{ t: 8.8, do: 'eval', js: size(0.72) }],
  },
  {
    // Scene 4: the arcs, the collision in the reader, Separate all connected, the week, the
    // last two minutes.
    id: 'link',
    dur: 17,
    setup: [viewMode],
    keys: [key(0, NIGHT), key(9.2, NIGHT), key(11.5, WEEK), key(13, WEEK), key(15.5, TWO)],
    actions: [
      { t: 4, do: 'open', title: 'Collision' },
      { t: 6.6, do: 'eval', js: scroll(0.35) },
      { t: 7.0, do: 'eval', js: scroll(0.7) },
      { t: 7.4, do: 'eval', js: scroll(1) },
      { t: 9, do: 'eval', js: click('Separate all connected') },
    ],
  },
  {
    // Scene 5: the causal factors over the week, the root cause in the reader, the night.
    id: 'factors',
    dur: 15,
    setup: [viewMode],
    keys: [key(0, WEEK), key(9.5, WEEK), key(12, LAST)],
    actions: [
      { t: 3, do: 'open', title: 'No risk review' },
      { t: 9.2, do: 'press', key: 'Escape' },
    ],
  },
  {
    // Scene 7: Compare with the written procedure, over the shift.
    id: 'compare',
    dur: 14,
    keys: [key(0, SHIFT)],
    actions: [
      { t: 0.1, do: 'eval', js: addProcedure },
      { t: 0.5, do: 'click', selector: '#compare-start' },
    ],
  },
];
writeFileSync(
  `${here}shots.json`,
  JSON.stringify({ sample: '../samples/investigation.ochx', shots }, null, 2) + '\n',
);
