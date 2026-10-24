// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Writes this tour's shots.json from the camera path in anim.js (PATH) and the narration's cues in
// timeline.js, so the captured zooms stay on the words after a new recording. Then capture again.
// Usage (from the repository root): node publicity/video/08-tour-deep-time/shots.mjs publicity/video/08-tour-deep-time
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
const folder = process.argv[2];
const common = folder + '/../common/';
const ctx = { console, LOOK: 'strata' };
vm.createContext(ctx);
vm.runInContext(readFileSync(common + 'core.js', 'utf8'), ctx);
vm.runInContext(readFileSync(folder + '/timeline.js', 'utf8').replace(/^var TL/m, 'TL'), ctx);
vm.runInContext(readFileSync(folder + '/anim.js', 'utf8'), ctx);
const MYR = 31557600e6,
  Y2000 = 946684800;
const sec = (v) => Number((Y2000 + v * MYR).toPrecision(17));
const shots = [];
for (const sc of ctx.TL.scenes) {
  const q = ctx.cuesFor(sc);
  for (const sh of ctx.PATH(sc.id, q)) {
    const o = {
      id: sh.id,
      dur: +sh.dur.toFixed(3),
      keys: sh.keys.map((k) => ({ t: +k.t.toFixed(3), view: k.view.map(sec) })),
    };
    if (sh.setup) o.setup = sh.setup;
    if (sh.actions) o.actions = sh.actions.map((a) => ({ ...a, t: +a.t.toFixed(3) }));
    shots.push(o);
  }
  if (q.missing.length) console.log('missing', q.missing);
}
writeFileSync(
  folder + '/shots.json',
  JSON.stringify(
    { sample: '../samples/deep-time.ochx', size: [1280, 720], scale: 1.5, shots },
    null,
    2,
  ).replace(
    /\{\s+("(?:t|do)"[^{}\[]*?(?:\[[^\]]*\][^{}]*?)?)\s+\}/g,
    (m, b) => '{ ' + b.replace(/\s*\n\s*/g, ' ') + ' }',
  ) + '\n',
);
console.log(shots.map((s) => s.id + ' ' + s.dur).join('\n'));
