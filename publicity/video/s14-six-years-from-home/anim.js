// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 14, Six years from home (publicity/shorts/14-six-years-from-home.md): a vertical short
   for history feeds. The George Washington sample (samples/washington.ochx) in the real editor
   on a phone, captured in shots.json: his whole life; a zoom into 1774–1782, the Revolution;
   Separate by tags on land lifts his homes into a track of their own, where the band "Six years
   away from Mount Vernon" runs from the day he left to the day he rode back in, with a bracket
   of six years and four months; then that moment in the reader, in View mode; and the end card.
   The phone's camera stays close on the track that matters, so the app's own labels read.
   Scenes are pure functions of scene time lt; q("word") is when that word is said. */

/* The sample's own colours (samples/washington.mjs): his homes, his offices. */
var HOME = '#4f6b3a',
  OFFICE = '#1f3a5f';

/* ---------- the phone, with a camera on the captured frame ---------- */
/* The phone's screen on the stage, and a camera on the shot (1080 × 4500 px: a tall window, so
   the separated tracks keep the editor's full label size): zoom z about the shot pixel (fx, fy),
   which sits at the screen's centre. */
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
    var lc = l.c || c;
    var sh = (typeof SHOTS !== 'undefined' && SHOTS[l.id]) || { width: 360, height: 1500 };
    var hpx = (SHOT_W * sh.height) / sh.width;
    var op = l.op === undefined ? 1 : l.op;
    if (op <= 0.001) return;
    s +=
      '<image href="' +
      shotFrame(l.id, l.st) +
      '" x="' +
      lc.x(0).toFixed(2) +
      '" y="' +
      (lc.y(0) + (l.ty || 0)).toFixed(2) +
      '" width="' +
      (SHOT_W * lc.k).toFixed(2) +
      '" height="' +
      (hpx * lc.k).toFixed(2) +
      '" opacity="' +
      op.toFixed(3) +
      '"/>';
  });
  return s + '</g>';
}
/** Clips marks to the phone's screen. */
function clipScr(inner) {
  return inner ? '<g clip-path="url(#scr-clip)">' + inner + '</g>' : '';
}

/* ---------- where things are in the shots ---------- */
/* The canvas runs from shot x 58 to 1019 across the view. Unseparated, the main line is at
   y 2430 (the chapter heading "Revolution" on it, the Commander-in-chief band at 2641, the
   Revolutionary War band at 2700); separated on land, the tagged track's line is at y 2286, its
   Mount Vernon band at 2378 and its "Six years away" band at 2437. Times are the sample's, at
   UTC−5. */
function day(s) {
  return Date.parse(s + 'T00:00:00-05:00') / 86400000;
}
function pxAt(view, s) {
  var l = day(view[0]),
    r = day(view[1]);
  return 58 + (961 * (day(s) - l)) / (r - l);
}
var V_REV = ['1774-01-01', '1782-06-01'];
var LEFT = '1775-05-04',
  BACK = '1781-09-09';
var Y_AWAY = 2437,
  Y_LAND = 2286;

/* The cameras: the whole life and the Revolution on the main line; the land track; the reader's
   top (title, date, tags and note) and its foot (sources and Related to). */
var CAM_LIFE = pcam(1.05, 540, 2475);
var CAM_REV = pcam(1.05, 540, 2490);
var CAM_LAND = pcam(1.05, 540, 2215);
var CAM_READ = pcam(1, 540, 530);
var CAM_READ_FOOT = pcam(1, 540, 1235);

/** A bracket under the phone from xa to xb, drawn by p, with its label popping in. */
var BR_Y = 188;
function bracket(xa, xb, label, p) {
  if (p <= 0.001) return '';
  var y = BR_Y;
  var d = 'M' + xa + ' ' + (y - 3.5) + 'V' + y + 'H' + xb + 'V' + (y - 3.5);
  var s = drawPath(d, xb - xa + 7, smooth(p * 1.4), 'stroke="' + C.text + '" stroke-width="1"');
  var lp = clamp01((p - 0.45) / 0.55);
  s += pop(
    txt((xa + xb) / 2, y + 12.5, label, { size: 10, weight: 700, serif: true }),
    lp,
    (xa + xb) / 2,
    y + 8.5,
  );
  return s;
}
/** A band outlined while it's named, the outline growing in with p. */
function outline(x0, x1, y, p, h) {
  if (p <= 0.001) return '';
  h = h || 5.4;
  return G(
    rect(x0 - 1, y - h / 2, x1 - x0 + 2, h, C.select, { rx: 1.6, op: 0.18 }) +
      rect(x0 - 1, y - h / 2, x1 - x0 + 2, h, 'none', { rx: 1.6, stroke: C.select, sw: 1 }),
    { o: p },
  );
}
/** A small readout under the phone, centred at x. */
function readout(x, y, s, p) {
  var w = textWidth(s, 8) + 14;
  return pop(
    rect(x - w / 2, y - 8.5, w, 13, C.card, { rx: 6.5, stroke: C.line, sw: 0.7 }) +
      txt(x, y + 1.2, s, { size: 8, weight: 700, serif: true }),
    p,
    x,
    y - 2,
  );
}
/** A scene whose phone holds across the cuts: the overlays fade with the scene, the phone
    doesn't. */
function overPhone(ph, over, lt, q, svg) {
  var f = Math.min(P(lt, 0, 0.2), 1 - clamp01((lt - (q.dur - 0.15)) / 0.15));
  return { svg: svg || '', keep: ph + G(over, { o: f }), keepIn: true, keepOut: true };
}

/* ---------- Scene 1: the hook (his whole life, already whole at frame 0) ---------- */
SCENES[1] = function (lt, q) {
  var ph = phone(CAM_LIFE, [{ id: 'zoom', st: 0 }]);
  return { svg: '', keep: ph, keepIn: true, keepOut: true };
};

/* ---------- Scene 2: he leaves (the zoom into 1774–1782) ---------- */
SCENES[2] = function (lt, q) {
  var tEnd = Math.max(2.5, q('philadelphia'));
  var zp = clamp01((lt - 0.05) / (tEnd - 0.05));
  var c = camMix(CAM_LIFE, CAM_REV, smooth(zp));
  var ph = phone(c, [{ id: 'zoom', st: 3.5 * zp }]);
  var s = '';
  // The Commander-in-chief band, outlined as "commanding" is said.
  if (zp >= 1)
    s += clipScr(
      outline(
        c.x(pxAt(V_REV, '1775-06-15')),
        SCR.x + SCR.w + 4,
        c.y(2641),
        P(lt, q('commanding'), 0.4) * (1 - P(lt, q.dur - 0.6, 0.4)),
      ),
    );
  var r = readout(80, 194, 'May 1775', P(lt, q('may'), 0.35));
  return overPhone(ph, s, lt, q, r);
};

/* ---------- Scene 3: the band ---------- */
SCENES[3] = function (lt, q) {
  var tSep = q('pull') + 0.15;
  var x = P(lt, tSep, 0.5);
  var c = camMix(CAM_REV, CAM_LAND, smooth((lt - tSep) / 0.7));
  var ph = phone(c, [
    { id: 'zoom', st: 3.5, op: 1 - x },
    { id: 'sep', st: 0, op: x, ty: (1 - x) * 8 },
  ]);
  // The control, named as the app names it, over the top of the screen.
  var ca = P(lt, tSep - 0.5, 0.35) * (1 - P(lt, tSep + 2, 0.4));
  var label = 'Separate by tags · land';
  var cw = textWidth(label, 6.2) + 12;
  var ctl = pop(
    rect(80 - cw / 2, SCR.y + 3, cw, 11, C.card, { rx: 5.5, stroke: HOME, sw: 0.8 }) +
      txt(80, SCR.y + 10.6, label, { size: 6.2, weight: 700 }),
    ca,
    80,
    SCR.y + 8,
  );
  // The gap's band, outlined once it's in its track, as "gap" is said.
  var land = CAM_LAND;
  var xa = land.x(pxAt(V_REV, LEFT)),
    xb = land.x(pxAt(V_REV, BACK));
  var g = lt >= tSep + 0.7 ? P(lt, q('gap'), 0.45) : 0;
  var marks = clipScr(outline(xa, xb, land.y(Y_AWAY), g));
  // The bracket along the band, left to right, on "six years".
  var br = bracket(xa, xb, '6 years, 4 months', clamp01((lt - q('six')) / 0.8));
  return overPhone(ph, ctl + marks, lt, q, br);
};

/* ---------- Scene 4: on the way to Yorktown (the reader) ---------- */
SCENES[4] = function (lt, q) {
  var up = smooth((lt - 0.1) / 0.55);
  var foot = smooth((lt - (q('stayed') - 0.1)) / 0.7);
  var rc = camMix(CAM_READ, CAM_READ_FOOT, foot);
  var ph = phone(CAM_LAND, [
    { id: 'sep', st: 0, op: 1 - clamp01((up - 0.85) / 0.15) },
    { id: 'reader', st: 1.1, c: rc, ty: (1 - up) * (SCR.h + 6) },
  ]);
  // "his first visit home since May 1775" underlined, across its two lines, as he rides in.
  var u = clamp01((lt - q('finally')) / 0.8);
  var y1 = rc.y(773) + (1 - up) * (SCR.h + 6),
    y2 = rc.y(860) + (1 - up) * (SCR.h + 6);
  var u1 = smooth(clamp01(u / 0.2)),
    u2 = smooth(clamp01((u - 0.2) / 0.8));
  var ul = '';
  var ux0 = rc.x(940),
    ux1 = rc.x(1000),
    vx0 = rc.x(50),
    vx1 = rc.x(722);
  if (u1 > 0) ul += rect(ux0, y1, (ux1 - ux0) * u1, 0.9, C.select);
  if (u2 > 0) ul += rect(vx0, y2, (vx1 - vx0) * u2, 0.9, C.select);
  return overPhone(ph, clipScr(ul), lt, q, '');
};

/* ---------- Scene 5: one line, and the end card ---------- */
SCENES[5] = function (lt, q) {
  // His whole life comes back as the reader fades, then the phone eases away.
  var back = smooth((lt - 0.05) / 0.6);
  var tA = Math.max(1.6, q('thats') - 0.35);
  var away = smooth((lt - tA) / 0.7);
  var ph = G(
    phone(CAM_LIFE, [
      { id: 'zoom', st: 0, op: back },
      { id: 'reader', st: 1.1, c: CAM_READ_FOOT, op: 1 - back },
    ]),
    { o: 1 - away, s: lerp(1, 0.6, away), cx: 80, cy: 129, ty: -away * 26 },
  );
  var e = P(lt, tA + 0.35, 0.8);
  var end =
    shortEnd(e, 'His whole life, one line') +
    rise(
      txt(80, 205, 'timescale.info/athan/george-washington', {
        size: 6.6,
        weight: 700,
        serif: true,
      }),
      e,
      8,
    );
  return { svg: end, keep: ph, keepIn: true, noHeadline: true };
};
