// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 18, The Dow took 25 years to get back (publicity/shorts/18-twenty-five-years-back.md): a
   vertical short for history and economics feeds. The Great Depression sample
   (samples/great-depression.ochx) in the real editor on a phone, captured in shots.json: the
   whole line after Fit all, with the band The Dow below its 1929 peak reaching to 1954; a zoom
   into mid-1929 to early 1933 with Separate by tags on market, where a counter follows the Dow
   from 381.17 down to 41.22; a zoom out to 1926–1961 where the climb back is eight times the
   fall; the moment The Dow regains its 1929 peak in the reader, its note's footnote about 1936
   underlined; and the end card. The phone's camera stays close on the track that matters, so
   the app's own labels read. Scenes are pure functions of scene time lt; q("word") is when that
   word is said. */

/* ---------- the phone, with a camera on the captured frame ---------- */
/* The phone's screen on the stage, and a camera on the shot (1080 × 4500 px: a tall window, so
   the separated tracks keep the editor's full label size): zoom z about the shot pixel (fx, fy),
   which sits at the screen's centre. */
var SCR = { x: 6, y: 74, w: 148, h: 100 };
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
  var sh = (typeof SHOTS !== 'undefined' && SHOTS[id]) || { width: 360, height: 1500 };
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
function smoothstep(x) {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
}

/* ---------- where things are in the shots ---------- */
/* The canvas runs from shot x 58 to 1019 across the view. Unseparated, the axis is at y 2433 and
   the band The Dow below its 1929 peak at 2525 (Fit all: x 390–878). Separated on market, the
   tagged track's line is at 2286, The Dow below its 1929 peak at 2377 and The Dow, peak to bottom
   at 2406. In the reader, the note's lines are centred at y 578, 659, 740, 821, 903 and 985, its
   sentence "That counts prices alone…" starting at x 302 of the third; Sources and Related to
   are at 1120–1570. Times are the sample's, at UTC−5. */
function day(s) {
  return Date.parse(s + 'T00:00:00-05:00') / 86400000;
}
function pxAt(view, s) {
  var l = day(view[0]),
    r = day(view[1]);
  return 58 + (961 * (day(s) - l)) / (r - l);
}
var V_SLIDE = ['1929-06-01', '1933-02-01'],
  V_OUT = ['1926-01-01', '1961-01-01'];
var Y_AXIS = 2433,
  Y_FIT_BAND = 2525,
  Y_SEP = 2286,
  Y_SLIDE = 2406,
  Y_BELOW = 2377;

/* The cameras: the whole line, close on the axis and its bands; the market's track; the reader's
   top (title, date, tag and note) and its foot (Sources and Related to). */
var Z = 1.125;
var CAM_FIT = pcam(Z, 540, 2470);
var CAM_SEP = pcam(Z, 540, 2310);
var CAM_READ = pcam(0.88, 540, 606);
var CAM_READ_FOOT = pcam(0.88, 540, 1180);

/** A band outlined from left to right, the outline growing with p. */
function outline(x0, x1, y, p, h) {
  if (p <= 0.001) return '';
  h = h || 4.4;
  var w = (x1 - x0 + 2) * smooth(p);
  return (
    rect(x0 - 1, y - h / 2, w, h, C.select, { rx: 1.6, op: 0.16 }) +
    rect(x0 - 1, y - h / 2, w, h, 'none', { rx: 1.6, stroke: C.select, sw: 1 })
  );
}
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
var CO_Y = 194;
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
/** A bracket under the phone from xa to xb at y, drawn by p, its label under it. */
function bracket(xa, xb, y, label, p) {
  if (p <= 0.001) return '';
  var d = 'M' + xa + ' ' + (y - 3.5) + 'V' + y + 'H' + xb + 'V' + (y - 3.5);
  var s = drawPath(d, xb - xa + 7, smooth(p * 1.4), 'stroke="' + C.text + '" stroke-width="1"');
  var lp = clamp01((p - 0.3) / 0.3);
  s += pop(
    txt((xa + xb) / 2, y + 9.5, label, { size: 8.5, weight: 700, serif: true }),
    lp,
    (xa + xb) / 2,
    y + 6,
  );
  return s;
}
/** A scene whose phone holds across the cuts: the overlays fade with the scene, the phone
    doesn't. */
function overPhone(ph, over, lt, q, svg) {
  var f = Math.min(P(lt, 0, 0.2), 1 - clamp01((lt - (q.dur - 0.15)) / 0.15));
  return { svg: svg || '', keep: ph + G(over, { o: f }), keepIn: true, keepOut: true };
}

/* ---------- Scene 1: twenty-five years (the cover, whole at frame 0) ---------- */
SCENES[1] = function (lt, q) {
  var c = CAM_FIT;
  var ph = phone(c, [{ id: 'fit', st: 0.5 }]);
  // The band brightens as "twenty-five years" is said.
  var t = q('25');
  var band = outline(c.x(390), c.x(878), c.y(Y_FIT_BAND), P(lt, t, 0.9));
  var co = callout(80, 'Sept 3, 1929 → Nov 23, 1954', 1, 9);
  return overPhone(ph, clipScr(band), lt, q, co);
};

/* ---------- Scene 2: down (the zoom into the slide, separated on market) ---------- */
/* The Dow's closes the sample's notes give, for the counter: it follows the band's dates. */
var DOW = [
  ['1929-09-03', 381.17],
  ['1929-10-28', 260.64],
  ['1929-10-29', 230.07],
  ['1929-11-13', 198.6],
  ['1930-04-17', 294],
  ['1932-07-08', 41.22],
];
function dowAt(d) {
  if (d <= day(DOW[0][0])) return DOW[0][1];
  for (var i = 1; i < DOW.length; i++) {
    var a = day(DOW[i - 1][0]),
      b = day(DOW[i][0]);
    if (d <= b) return lerp(DOW[i - 1][1], DOW[i][1], (d - a) / (b - a));
  }
  return DOW[DOW.length - 1][1];
}
SCENES[2] = function (lt, q) {
  var tZ = 1.3;
  var zp = clamp01((lt - 0.05) / (tZ - 0.05));
  var tSep = Math.max(tZ + 0.1, q('track'));
  var x = P(lt, tSep, 0.5);
  var c = camMix(CAM_FIT, CAM_SEP, smooth((lt - tSep) / 0.7));
  var ph = phone(c, [
    { id: 'zoom', st: 1.5 * smooth(zp) },
    { id: 'sep', st: 0, op: x, ty: (1 - x) * 8 },
  ]);
  // The cursor follows the band from the peak to the bottom as the fall is told.
  var t0 = Math.max(tSep + 0.8, q('black')),
    t1 = Math.max(t0 + 2, q('41'));
  var f = clamp01((lt - t0) / (t1 - t0));
  var dPeak = day('1929-09-03'),
    dBot = day('1932-07-08');
  var dNow = lerp(dPeak, dBot, smoothstep(f));
  var xa = CAM_SEP.x(pxAt(V_SLIDE, '1929-09-03')),
    xb = CAM_SEP.x(pxAt(V_SLIDE, '1932-07-08'));
  var marks = '';
  var cur = P(lt, t0 - 0.3, 0.3) * (1 - P(lt, t1 + 0.6, 0.3));
  if (cur > 0.001 && lt >= tSep + 0.7) {
    var cx = CAM_SEP.x(pxAt(V_SLIDE, new Date(dNow * 86400000).toISOString().slice(0, 10)));
    marks += G(
      rect(cx - 0.5, SCR.y, 1, SCR.h, C.select, { op: 0.85 }) +
        outline(xa, cx, CAM_SEP.y(Y_SLIDE), 1, 4.2),
      { o: cur },
    );
  }
  if (lt >= t1) marks += ring(xb, CAM_SEP.y(Y_SEP), P(lt, t1, 0.35));
  // The counter, the chip and the bracket under the phone.
  var shown = P(lt, t0 - 0.3, 0.3);
  var v = dowAt(dNow);
  var counter = shown
    ? G(
        txt(14, 209, v.toFixed(2), { size: 15, weight: 700, serif: true, anchor: 'start' }) +
          txt(63, 209, 'the Dow', { size: 6.5, fill: C.soft, anchor: 'start', weight: 600 }),
        { o: shown },
      )
    : '';
  var tPct = Math.max(t1 + 0.3, q('89'));
  var pct = pop(chip(100, 207, '−89%', C.select, { size: 10, solid: true }), P(lt, tPct, 0.35));
  var br = bracket(xa, xb, 185, '2 years 10 months', clamp01((lt - tPct - 0.4) / 0.9));
  return overPhone(ph, clipScr(marks), lt, q, counter + pct + br);
};

/* ---------- Scene 3: twenty-two years up (the zoom out, still separated) ---------- */
SCENES[3] = function (lt, q) {
  var tZ = 2.6;
  var zp = clamp01((lt - 0.05) / (tZ - 0.05));
  var c = CAM_SEP;
  var ph = phone(c, [{ id: 'out', st: 3 * smooth(zp) }]);
  var marks = '';
  if (zp >= 1)
    marks += ring(
      c.x(pxAt(V_OUT, '1954-11-23')),
      c.y(Y_SEP),
      P(lt, Math.max(tZ, q('november')), 0.35),
    );
  // Two bars to one scale: 1,039 days down, 8,173 back.
  var full = 136,
    x0 = 12;
  var b1 = ease(P(lt, 0.2, 0.6)) * ((full * 1039) / 8173);
  var b2 = smooth(clamp01((lt - q('22')) / 2.4)) * full;
  var bars =
    G(
      txt(x0, 188, 'Down · 2 yrs 10 mos', { size: 7, anchor: 'start', weight: 700 }) +
        rect(x0, 190.5, Math.max(b1, 0.01), 4.2, C.text, { rx: 1.2 }),
      { o: P(lt, 0.2, 0.3) },
    ) +
    G(
      txt(x0, 203, 'Back · 22 yrs 4 mos', { size: 7, anchor: 'start', weight: 700 }) +
        rect(x0, 205.5, Math.max(b2, 0.01), 4.2, C.select, { rx: 1.2 }),
      { o: P(lt, q('22'), 0.3) },
    );
  return overPhone(ph, clipScr(marks), lt, q, bars);
};

/* ---------- Scene 4: the footnote (the reader) ---------- */
/* The reader's own background, round the shot's edges when the camera is wider than it. */
var READER_BG = '#fafbf6';
var NOTE = [
  [740, 302, 935],
  [821, 51, 928],
  [903, 51, 886],
  [985, 51, 645],
];
SCENES[4] = function (lt, q) {
  var up = smooth((lt - 0.1) / 0.6);
  var dy = (1 - up) * (SCR.h + 6);
  var foot = smooth((lt - (q('timelines') - 0.2)) / 0.8);
  var rc = camMix(CAM_READ, CAM_READ_FOOT, foot);
  var ph = phone(
    CAM_SEP,
    [
      { id: 'out', st: 3, op: up < 1 ? 1 : 0 },
      { id: 'reader', st: 1.1, c: rc, ty: dy, op: up > 0 ? 1 : 0 },
    ],
    up >= 1 ? READER_BG : undefined,
  );
  // The highlight sweeps the sentence about 1936 with the narration, line by line.
  var ta = q('count'),
    tb = Math.max(ta + 1.5, q('1936') + 0.4);
  var h = clamp01((lt - ta) / (tb - ta));
  var total = 0;
  NOTE.forEach(function (l) {
    total += l[2] - l[1];
  });
  var done = h * total,
    marks = '';
  NOTE.forEach(function (l) {
    var len = l[2] - l[1],
      w = Math.max(0, Math.min(len, done));
    done -= len;
    if (w <= 0) return;
    marks +=
      rect(rc.x(l[1]), rc.y(l[0] - 30) + dy, w * rc.k, 60 * rc.k, C.select, { op: 0.2 }) +
      rect(rc.x(l[1]), rc.y(l[0] + 30) + dy, w * rc.k, 0.8, C.select);
  });
  return overPhone(ph, clipScr(marks), lt, q, '');
};

/* ---------- Scene 5: the whole Depression (back to Fit all, then the end card) ---------- */
SCENES[5] = function (lt, q) {
  var back = smooth((lt - 0.05) / 0.45);
  var zp = clamp01((lt - 0.2) / 1.6);
  var ph = phone(
    CAM_FIT,
    [
      { id: 'back', st: 2 * smooth(zp), op: back },
      { id: 'reader', st: 1.1, c: CAM_READ_FOOT, op: 1 - back },
    ],
    back < 0.5 ? READER_BG : undefined,
  );
  var away = smooth((lt - 2.2) / 0.5);
  ph = G(ph, {
    o: 1 - away,
    s: lerp(1, 0.6, away),
    cx: 80,
    cy: 124,
    ty: -away * 26,
  });
  var e = P(lt, 2.6, 0.7);
  return {
    svg: shortEnd(e, 'timescale.info/athan/great-depression'),
    keep: ph,
    keepIn: true,
    noHeadline: true,
  };
};
