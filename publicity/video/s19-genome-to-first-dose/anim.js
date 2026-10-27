// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 19, From genome to first dose: 332 days (publicity/shorts/19-genome-to-first-dose.md): a
   vertical short for history and science feeds. The COVID-19 sample (samples/covid-19.ochx) in
   the real editor on a phone, captured in shots.json: 8–14 January 2020 around the genome's
   publication; one zoom out to the whole of 2020 along the band From genome to first authorised
   dose, with the days counted along it (65, then 198); the zoom in to 29 November – 13 December,
   where the band ends under Margaret Keenan's dose (326, then 332 days); the band opened in the
   reader; and the end card. The phone's camera stays close on the timeline, so the app's own
   labels read. Scenes are pure functions of scene time lt; q("word") is when that word is said. */

/* ---------- the phone, with a camera on the captured frame ---------- */
/* The phone's screen on the stage, and a camera on the shot (1080 × 1920 px): zoom z about the
   shot pixel (fx, fy), which sits at the screen's centre. */
var SCR = { x: 8, y: 80, w: 144, h: 98 };
var SHOT_W = 1080;
function pcam(z, fx, fy) {
  var k = (z * SCR.w) / SHOT_W;
  return {
    z: z,
    fx: fx,
    fy: fy,
    k: k,
    x: function (px) {
      return SCR.x + SCR.w / 2 + (px - fx) * k;
    },
    y: function (py) {
      return SCR.y + SCR.h / 2 + (py - fy) * k;
    },
  };
}
function camMix(a, b, p) {
  return pcam(lerp(a.z, b.z, p), lerp(a.fx, b.fx, p), lerp(a.fy, b.fy, p));
}
/** One shot layer's image through camera c, shifted down by ty. */
function shotImage(id, st, c, ty, op) {
  var sh = (typeof SHOTS !== 'undefined' && SHOTS[id]) || { width: 360, height: 640 };
  var hpx = (SHOT_W * sh.height) / sh.width;
  return (
    '<image href="' +
    shotFrame(id, st) +
    '" x="' +
    c.x(0).toFixed(2) +
    '" y="' +
    (c.y(0) + (ty || 0)).toFixed(2) +
    '" width="' +
    (SHOT_W * c.k).toFixed(2) +
    '" height="' +
    (hpx * c.k).toFixed(2) +
    '" opacity="' +
    op.toFixed(3) +
    '"/>'
  );
}
/** The phone showing shot layers [{id, st, op, ty, c}] through camera c (or the layer's own). */
function phone(c, layers, bg) {
  var b = 4.6,
    r = 8;
  var s =
    rect(SCR.x - b - 0.8, SCR.y - b + 1.6, SCR.w + 2 * b + 1.6, SCR.h + 2 * b, '#000', {
      rx: r + b,
      op: 0.22,
    }) +
    rect(SCR.x - b, SCR.y - b, SCR.w + 2 * b, SCR.h + 2 * b, '#15191c', { rx: r + b }) +
    '<defs><clipPath id="scr-clip">' +
    rect(SCR.x, SCR.y, SCR.w, SCR.h, '#000', { rx: r }) +
    '</clipPath></defs>' +
    '<g clip-path="url(#scr-clip)">' +
    rect(SCR.x, SCR.y, SCR.w, SCR.h, bg || '#f3ead7');
  layers.forEach(function (l) {
    var op = l.op === undefined ? 1 : l.op;
    if (op <= 0.001) return;
    s += shotImage(l.id, l.st, l.c || c, l.ty, op);
  });
  return s + '</g>';
}
/** Clips marks to the phone's screen. */
function clipScr(inner) {
  return inner ? '<g clip-path="url(#scr-clip)">' + inner + '</g>' : '';
}

/* ---------- where things are in the shots ---------- */
/* The canvas runs from shot x 58 to 1019 across the view; the moments' line is at y 1142. The
   band From genome to first authorised dose is at y 1235 in January, 1264 across the year and
   1294 in December. In the reader, its title is at 190–350, the note at 640–1100 ("332 days" on
   its third line) and Related to below. The sample's times are UTC. */
function day(s) {
  return Date.parse(s.length > 10 ? s : s + 'T00:00:00Z') / 86400000;
}
function pxAt(view, s) {
  var l = day(view[0]),
    r = day(view[1]);
  return 58 + (961 * (day(s) - l)) / (r - l);
}
var V_JAN = ['2020-01-08', '2020-01-14'],
  V_YEAR = ['2019-12-20', '2021-01-05'],
  V_DEC = ['2020-11-29', '2020-12-13'];
var Y_LINE = 1142,
  Y_BAND_YEAR = 1264,
  Y_BAND_DEC = 1294;
var GENOME = '2020-01-11T01:05:00Z',
  KEENAN = '2020-12-08T06:31:00Z';

/* The cameras: the timeline (moments' titles above the line, bands and lower titles below), and
   the reader's top (title, span, tags and note) and its foot (the note's end and Related to). */
var CAM = pcam(1.05, 540, 1185);
var CAM_READ = pcam(1, 540, 530);
var CAM_READ_FOOT = pcam(1, 540, 1225);

/* The zoom's two halves: out from January to the year (shot "out", 3 s), and in from the year to
   December (shot "in", 4 s), which begins at the end of Scene 2 and settles early in Scene 3. */
var OUT_DUR = 3,
  IN_DUR = 4,
  IN_LEAD = 2.4; // seconds of the zoom in played before Scene 3 begins

/** A ring that draws attention to (x, y), growing in with p. */
function ring(x, y, p, r) {
  if (p <= 0.001) return '';
  r = r || 4.4;
  return (
    '<circle cx="' +
    x.toFixed(2) +
    '" cy="' +
    y.toFixed(2) +
    '" r="' +
    (r * lerp(1.7, 1, p)).toFixed(2) +
    '" fill="none" stroke="' +
    C.select +
    '" stroke-width="1.1" opacity="' +
    p.toFixed(3) +
    '"/>'
  );
}
/** A callout under the phone, centred at x, popping in with p. */
var CO_Y = 196;
function callout(x, s, p, size) {
  if (p <= 0.001) return '';
  size = size || 10;
  var w = textWidth(s, size) + 16;
  return pop(
    rect(x - w / 2, CO_Y - size - 1.5, w, size + 7, C.card, { rx: 4, stroke: C.line, sw: 0.7 }) +
      txt(x, CO_Y + 0.6, s, { size: size, weight: 700, serif: true }),
    p,
    x,
    CO_Y - 2,
  );
}
/** The days counted so far along the band: a highlight from x0 to x1 over the band at y. */
function span(x0, x1, y, o, h) {
  if (o <= 0.001 || x1 <= x0) return '';
  h = h || 5.4;
  return G(
    rect(x0 - 1, y - h / 2, x1 - x0 + 2, h, C.select, { rx: 1.6, op: 0.18 }) +
      rect(x0 - 1, y - h / 2, x1 - x0 + 2, h, 'none', { rx: 1.6, stroke: C.select, sw: 1 }),
    { o: o },
  );
}
/** A tick standing on the band at x, for a day counted. */
function tick(x, y, p) {
  if (p <= 0.001) return '';
  return G(rect(x - 0.5, y - 5.5, 1, 11, C.select), { o: p });
}
/** The counter under the phone: "n days", popping in with p, the number running from n0 to n1
    with r. */
function counter(n0, n1, r, p) {
  var n = Math.round(lerp(n0, n1, ease(clamp01(r))));
  return callout(80, n + ' days', p, 11);
}
/** A scene whose phone holds across the cuts: the overlays fade with the scene, the phone
    doesn't. */
function overPhone(ph, over, lt, q, svg) {
  var f = Math.min(P(lt, 0, 0.2), 1 - clamp01((lt - (q.dur - 0.15)) / 0.15));
  return { svg: svg || '', keep: ph + G(over, { o: f }), keepIn: true, keepOut: true };
}

/* ---------- Scene 1: one post (already whole at frame 0) ---------- */
SCENES[1] = function (lt, q) {
  var ph = phone(CAM, [{ id: 'jan', st: 0 }]);
  var ring1 = clipScr(ring(CAM.x(pxAt(V_JAN, GENOME)), CAM.y(Y_LINE), 1, 5));
  var co = callout(80, '11 Jan 2020 · 01:05 UTC', 1, 9);
  return { svg: '', keep: ph + ring1 + co, keepIn: true, keepOut: true };
};

/* ---------- Scene 2: the year (out to 2020, the days counted, and the turn toward December) -- */
SCENES[2] = function (lt, q) {
  var tOut = 2.4;
  var op = clamp01((lt - 0.05) / (tOut - 0.05));
  var tIn = q.dur - IN_LEAD;
  var ip = clamp01((lt - tIn) / IN_DUR);
  var ph = phone(CAM, [lt < tIn ? { id: 'out', st: OUT_DUR * op } : { id: 'in', st: IN_DUR * ip }]);
  // The genome's callout gives way as the zoom begins.
  var co0 = G(callout(80, '11 Jan 2020 · 01:05 UTC', 1, 9), { o: 1 - P(lt, 0.05, 0.3) });
  // Along the band, from the genome: to the first trial dose on "sixty", to Phase 3 on "July".
  var t65 = Math.max(tOut, q(['sixty', '65'])),
    t198 = Math.max(t65 + 1, q('july'));
  var x0 = CAM.x(pxAt(V_YEAR, '2020-01-11')),
    x65 = CAM.x(pxAt(V_YEAR, '2020-03-16')),
    x198 = CAM.x(pxAt(V_YEAR, '2020-07-27'));
  var r1 = clamp01((lt - t65) / 0.8),
    r2 = clamp01((lt - t198) / 1);
  var xe = lerp(x0, x65, ease(r1));
  if (r2 > 0) xe = lerp(x65, x198, ease(r2));
  var mo = P(lt, t65, 0.2) * (1 - P(lt, tIn - 0.3, 0.3));
  var y = CAM.y(Y_BAND_YEAR);
  var marks = '';
  if (lt >= tOut) {
    marks =
      span(x0, xe, y, mo) +
      tick(x65, y, P(lt, t65 + 0.7, 0.2) * (1 - P(lt, tIn - 0.3, 0.3))) +
      tick(x198, y, P(lt, t198 + 0.9, 0.2) * (1 - P(lt, tIn - 0.3, 0.3)));
  }
  var cnt = '';
  if (lt >= t65) {
    cnt = r2 > 0 ? counter(65, 198, r2, 1) : counter(0, 65, r1, P(lt, t65, 0.3));
  }
  return overPhone(ph, clipScr(marks), lt, q, co0 + cnt);
};

/* ---------- Scene 3: December (the zoom settles; 326, then 332 days) ---------- */
SCENES[3] = function (lt, q) {
  var ip = clamp01((IN_LEAD + lt) / IN_DUR);
  var ph = phone(CAM, [{ id: 'in', st: IN_DUR * ip }]);
  var settled = IN_DUR - IN_LEAD;
  var t326 = Math.max(settled * 0.6, q('december')),
    t332 = Math.max(t326 + 1, q('december', 2));
  var marks = '';
  var o = P(lt, settled, 0.25);
  if (o > 0) {
    var yl = CAM.y(Y_LINE);
    marks +=
      ring(CAM.x(pxAt(V_DEC, '2020-12-02')), yl, P(lt, Math.max(t326, settled), 0.35) * o) +
      ring(CAM.x(pxAt(V_DEC, KEENAN)), yl, P(lt, Math.max(t332, settled), 0.35) * o);
    // The band's end, under Margaret Keenan's moment, once her dose is said.
    var xe = CAM.x(pxAt(V_DEC, KEENAN));
    marks += G(span(CAM.x(58), xe, CAM.y(Y_BAND_DEC), 1), {
      o: P(lt, Math.max(q('keenan'), settled), 0.4),
    });
  }
  // The counter: 198 from Scene 2 gives way to 326 on "December", then 332 on the second "December".
  var cnt;
  if (lt < t326) cnt = G(counter(198, 198, 1, 1), { o: 1 - P(lt, 0.4, 0.3) });
  else if (lt < t332) cnt = counter(326, 326, 1, P(lt, t326, 0.3));
  else cnt = counter(326, 332, clamp01((lt - t332) / 0.6), 1);
  return overPhone(ph, clipScr(marks), lt, q, cnt);
};

/* ---------- Scene 4: open it (the reader slides up; "332 days" lit) ---------- */
SCENES[4] = function (lt, q) {
  var up = smooth((lt - 0.1) / 0.6);
  var foot = smooth((lt - Math.max(3.2, q('line') + 0.4)) / 0.9);
  var rc = camMix(CAM_READ, CAM_READ_FOOT, foot);
  var dy = (1 - up) * (SCR.h + 6);
  var ph = phone(CAM, [
    { id: 'in', st: IN_DUR, op: 1 - clamp01((up - 0.85) / 0.15) },
    { id: 'reader', st: 1.1, c: rc, ty: dy },
  ]);
  // "332 days" in the note, lit as it's said.
  var h = P(lt, Math.max(0.8, q(['three', '332'])), 0.5);
  var lit = '';
  if (h > 0) {
    var hx0 = rc.x(RD.x0),
      hx1 = rc.x(RD.x1),
      hy = rc.y(RD.y) + dy;
    lit = G(
      rect(hx0 - 1, hy - RD.h / 2, (hx1 - hx0 + 2) * smooth(h), RD.h, C.select, {
        rx: 1.4,
        op: 0.28,
      }),
      { o: 1 },
    );
  }
  return overPhone(ph, clipScr(lit), lt, q, '');
};
/* "332 days" in the reader's note, in shot pixels (its third line). */
var RD = { x0: 300, x1: 505, y: 835, h: 0 };
RD.h = 54 * CAM_READ.k;

/* ---------- Scene 5: one line, and the end card ---------- */
SCENES[5] = function (lt, q) {
  var back = smooth((lt - 0.05) / 0.5);
  var tA = Math.max(0.6, q('thats') - 0.35);
  var away = smooth((lt - tA) / 0.6);
  var ph = G(
    phone(CAM, [
      { id: 'out', st: OUT_DUR, op: back },
      { id: 'reader', st: 1.1, c: CAM_READ_FOOT, op: 1 - back },
    ]),
    { o: 1 - away, s: lerp(1, 0.6, away), cx: 80, cy: 129, ty: -away * 26 },
  );
  var e = P(lt, tA + 0.3, 0.7);
  var end =
    shortEnd(e, 'Any span of time, one line') +
    rise(
      txt(80, 205, 'timescale.info/athan/covid-19', {
        size: 6.6,
        weight: 700,
        serif: true,
      }),
      e,
      8,
    );
  return { svg: end, keep: ph, keepIn: true, noHeadline: true };
};
