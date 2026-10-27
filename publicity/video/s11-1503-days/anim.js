// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 11, Lincoln was president 1,503 days (publicity/shorts/11-1503-days.md): a vertical
   short for history feeds. The Abraham Lincoln sample (samples/lincoln.ochx) in the real editor
   on a phone, captured in shots.json: the presidency across 1861–1865; Separate by tags on war
   lifts the Civil War into a track of its own, with two bars to one scale and the share; a zoom
   into the 39 days between the inauguration and Fort Sumter; a pan to the 6 days between
   Appomattox and his death; then the whole life, and the end card. The phone's camera stays
   close on the track that matters, so the app's own labels read. Scenes are pure functions of
   scene time lt; q("word") is when that word is said. */

/* The sample's own colours (samples/lincoln.mjs): office and war. */
var OFFICE = '#1f3a5f',
  WAR = '#9c3b2a';

/* ---------- the phone, with a camera on the captured frame ---------- */
/* The phone's screen on the stage, and a camera on the shot (1080 × 4500 px: a tall window, so
   the separated tracks keep the editor's full label size): zoom z about the shot pixel (fx, fy),
   which sits at the screen's centre. */
var SCR = { x: 8, y: 82, w: 144, h: 94 };
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
/** The phone showing shot layers [{id, st, op, ty}] through camera c. */
function phone(c, layers) {
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
    rect(SCR.x, SCR.y, SCR.w, SCR.h, '#f3ead7');
  layers.forEach(function (l) {
    var sh = (typeof SHOTS !== 'undefined' && SHOTS[l.id]) || { width: 360, height: 1500 };
    var hpx = (SHOT_W * sh.height) / sh.width;
    var op = l.op === undefined ? 1 : l.op;
    if (op <= 0.001) return;
    s +=
      '<image href="' +
      shotFrame(l.id, l.st) +
      '" x="' +
      c.x(0).toFixed(2) +
      '" y="' +
      (c.y(0) + (l.ty || 0)).toFixed(2) +
      '" width="' +
      (SHOT_W * c.k).toFixed(2) +
      '" height="' +
      (hpx * c.k).toFixed(2) +
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
/* The canvas runs from shot x 58 to 1019 across the view. Separated, the war track's line is at
   y 2285 (its bands from 2378) and the rest's at 3050 (the presidency band at 3232 over the
   four years, 3259 and 3230 in the two close views); unseparated, the presidency band is at
   y 2613 under the line at 2432. Times are the sample's, at UTC−5. */
function day(s) {
  return Date.parse(s.length === 10 ? s + 'T00:00:00-05:00' : s + ':00-05:00') / 86400000;
}
function pxAt(view, s) {
  var l = day(view[0]),
    r = day(view[1]);
  return 58 + (961 * (day(s) - l)) / (r - l);
}
var V_WAR = ['1860-12-15', '1865-06-01'],
  V_START = ['1861-02-20', '1861-05-01'],
  V_END = ['1865-03-25', '1865-04-20'];
var PRES = ['1861-03-04T12:00', '1865-04-15T07:22'],
  CIVIL = ['1861-04-12', '1865-04-09'];
var Y_WAR = 2285,
  Y_REST = 3050,
  Y_PRES = 2613;

/* The cameras: the presidency band unseparated; the war track and the rest over the four years;
   the war track and the rest close up (scenes 3–4); the whole life's track. */
var CAM_PRES = pcam(1.15, 540, 2470);
var CAM_WAR = pcam(1.15, 540, 2290);
var CAM_WAR_NEAR = pcam(1.2, 540, 2230);
var CAM_REST_NEAR = pcam(1.2, 540, 3005);
var CAM_END_REST = pcam(1.2, 540, 3060);
var CAM_LIFE = pcam(1, 540, 3060);

/** A ring that draws attention to (x, y), growing in with p. */
function ring(x, y, p, r, col) {
  if (p <= 0.001) return '';
  r = r || 3.6;
  return (
    '<circle cx="' +
    x.toFixed(2) +
    '" cy="' +
    y.toFixed(2) +
    '" r="' +
    (r * lerp(1.7, 1, p)).toFixed(2) +
    '" fill="none" stroke="' +
    (col || C.select) +
    '" stroke-width="1.1" opacity="' +
    p.toFixed(3) +
    '"/>'
  );
}
/** A bracket under the phone from xa to xb, drawn by p, with its label popping in. */
var BR_Y = 187;
function bracket(xa, xb, label, p) {
  if (p <= 0.001) return '';
  var y = BR_Y;
  var d = 'M' + xa + ' ' + (y - 3.5) + 'V' + y + 'H' + xb + 'V' + (y - 3.5);
  var s = drawPath(d, xb - xa + 7, smooth(p * 1.4), 'stroke="' + C.text + '" stroke-width="1"');
  var lp = clamp01((p - 0.45) / 0.55);
  s += pop(
    txt((xa + xb) / 2, y + 13, label, { size: 11, weight: 700, serif: true }),
    lp,
    (xa + xb) / 2,
    y + 9,
  );
  return s;
}
/** A scene whose phone holds across the cuts: the overlays fade with the scene, the phone
    doesn't. */
function overPhone(ph, over, lt, q, svg) {
  var f = Math.min(P(lt, 0, 0.2), 1 - clamp01((lt - (q.dur - 0.15)) / 0.15));
  return { svg: svg || '', keep: ph + G(over, { o: f }), keepIn: true, keepOut: true };
}

/* ---------- Scene 1: 1,503 days ---------- */
SCENES[1] = function (lt, q) {
  var c = CAM_PRES;
  var ph = phone(c, [{ id: 'pres', st: 0 }]);
  var sub = txt(80, 74, 'March 4, 1861 → April 15, 1865', {
    size: 7.6,
    serif: true,
    weight: 600,
    fill: C.soft,
  });
  // The presidency band brightens as "president" is said.
  var g = P(lt, q('president'), 0.6);
  var x0 = c.x(pxAt(V_WAR, PRES[0])),
    x1 = c.x(pxAt(V_WAR, PRES[1])),
    y = c.y(Y_PRES);
  var glow = G(
    rect(x0 - 1, y - 2.6, x1 - x0 + 2, 5.2, C.select, { rx: 1.6, op: 0.25 }) +
      rect(x0 - 1, y - 2.6, x1 - x0 + 2, 5.2, 'none', { rx: 1.6, stroke: C.select, sw: 1 }),
    { o: g },
  );
  return { svg: sub, keep: ph + clipScr(glow), keepIn: true, keepOut: true };
};

/* ---------- Scene 2: the war on its own track ---------- */
function commas(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
/* The two bars share one scale: the presidency's 1,503 days across BAR_X0–BAR_X1. */
var BAR_X0 = 12,
  BAR_X1 = 118;
function barX(s) {
  return BAR_X0 + ((BAR_X1 - BAR_X0) * (day(s) - day(PRES[0]))) / (day(PRES[1]) - day(PRES[0]));
}
/** A bar from date a to date b, grown by p, its count counting up. */
function bar(a, b, y, col, name, days, p) {
  if (p <= 0.001) return '';
  var x0 = barX(a),
    x1 = barX(b);
  var w = (x1 - x0) * ease(p);
  var n = Math.round(days * ease(p));
  return (
    rect(x0, y, w, 8, col, { rx: 1.6 }) +
    G(
      txt(x0 + 3, y + 5.9, name + ' · ' + commas(n) + ' days', {
        size: 5.6,
        weight: 700,
        anchor: 'start',
        fill: C.card,
      }),
      { o: clamp01((p - 0.25) * 3) },
    )
  );
}
SCENES[2] = function (lt, q) {
  var tSep = q('track');
  var x = P(lt, tSep, 0.45);
  var c = camMix(CAM_PRES, CAM_WAR, smooth((lt - tSep) / 0.6));
  var ph = phone(c, [
    { id: 'pres', st: 0, op: 1 - x },
    { id: 'sep', st: 0, op: x, ty: (1 - x) * 5 },
  ]);
  // The control, named as the app names it, over the top of the screen.
  var ca = P(lt, tSep - 0.6, 0.35) * (1 - P(lt, tSep + 1.6, 0.4));
  var label = 'Separate by tags · war';
  var cw = textWidth(label, 6.2) + 12;
  var ctl = pop(
    rect(80 - cw / 2, SCR.y + 3, cw, 11, C.card, { rx: 5.5, stroke: WAR, sw: 0.8 }) +
      txt(80, SCR.y + 10.6, label, { size: 6.2, weight: 700 }),
    ca,
    80,
    SCR.y + 8,
  );
  // The war's band, outlined once it has lifted into its track.
  var tw = P(lt, tSep + 0.5, 0.5) * (1 - P(lt, tSep + 2.2, 0.5));
  var bx0 = c.x(pxAt(V_WAR, CIVIL[0])),
    bx1 = c.x(pxAt(V_WAR, CIVIL[1]));
  var trk = clipScr(
    G(
      rect(bx0 - 1, c.y(2378) - 3, bx1 - bx0 + 2, 6, 'none', {
        rx: 1.6,
        stroke: C.select,
        sw: 1,
      }),
      { o: tw },
    ),
  );
  // The two bars, to one scale, and the share.
  var b1 = clamp01((lt - (tSep + 0.5)) / 0.9);
  var b2 = clamp01((lt - q('covers')) / 1.0);
  var bars =
    bar(PRES[0], PRES[1], 183.5, OFFICE, 'Presidency', 1503, b1) +
    bar(CIVIL[0], CIVIL[1], 194, WAR, 'Civil War', 1458, b2);
  var k = P(lt, q(['97', 'ninety']), 0.35);
  var chipS = pop(
    rect(122, 186, 28, 14, C.card, { rx: 7, stroke: C.select, sw: 1 }) +
      txt(136, 196.2, '97%', { size: 9, weight: 700, serif: true }),
    k,
    136,
    193,
  );
  return overPhone(ph, ctl + trk, lt, q, bars + chipS);
};

/* ---------- Scene 3: thirty-nine days ---------- */
SCENES[3] = function (lt, q) {
  var tZ = Math.max(1.5, q(['39', 'thirty']) - 0.1);
  var st = 3 * clamp01((lt - 0.1) / (tZ - 0.1));
  var tIn = q('inauguration'),
    tSu = q('sumter');
  // The camera closes in on the war track as the view zooms, drops to the inauguration in the
  // track below as it's named, and rises back to Fort Sumter.
  var c = camMix(CAM_WAR, CAM_WAR_NEAR, smooth((lt - 0.1) / (tZ - 0.1)));
  c = camMix(c, CAM_REST_NEAR, smooth((lt - (tIn - 0.45)) / 0.5));
  c = camMix(c, CAM_WAR_NEAR, smooth((lt - (tSu - 0.45)) / 0.5));
  var ph = phone(c, [{ id: 'start', st: st }]);
  var pxA = pxAt(V_START, '1861-03-04'),
    pxB = pxAt(V_START, '1861-04-12');
  var s = '';
  if (lt >= tZ)
    s += clipScr(
      ring(c.x(pxA), c.y(Y_REST), P(lt, tIn, 0.4), 4.6) +
        ring(c.x(pxB), c.y(Y_WAR), P(lt, tSu, 0.4), 4.6),
    );
  var near = CAM_WAR_NEAR;
  var br = bracket(
    near.x(pxA),
    near.x(pxB),
    '39 days',
    clamp01((lt - Math.max(tZ, q(['39', 'thirty']))) / 0.7),
  );
  return overPhone(ph, s, lt, q, br);
};

/* ---------- Scene 4: six days ---------- */
SCENES[4] = function (lt, q) {
  var tP = Math.max(1.7, q('six') + 0.2);
  var st = 3.2 * clamp01((lt - 0.05) / (tP - 0.05));
  var tShot = q('shot');
  // Along the war track to Appomattox; then down to the presidency band's end as he is shot.
  var c = camMix(CAM_WAR_NEAR, CAM_END_REST, smooth((lt - (tShot - 0.5)) / 0.55));
  var ph = phone(c, [{ id: 'end', st: st }]);
  var pxA = pxAt(V_END, '1865-04-09'),
    pxB = pxAt(V_END, PRES[1]);
  var s = '';
  if (lt >= tP)
    s += clipScr(
      ring(c.x(pxA), c.y(Y_WAR), P(lt, Math.max(tP, q('surrendered')), 0.4), 4.6) +
        ring(c.x(pxB), c.y(3230), P(lt, tShot + 0.1, 0.4), 3.6),
    );
  var br = bracket(c.x(pxA), c.x(pxB), '6 days', clamp01((lt - tP) / 0.7));
  return overPhone(ph, s, lt, q, br);
};

/* ---------- Scene 5: his whole life, and the end card ---------- */
SCENES[5] = function (lt, q) {
  var zp = smooth(clamp01((lt - 0.05) / 2.2));
  var st = 2.5 * zp;
  var c = camMix(CAM_END_REST, CAM_LIFE, zp);
  var tA = Math.max(2.4, q('free') - 0.7);
  var away = smooth((lt - tA) / 0.7);
  var ph = G(phone(c, [{ id: 'fit', st: st }]), {
    o: 1 - away,
    s: lerp(1, 0.6, away),
    cx: 80,
    cy: 129,
    ty: -away * 26,
  });
  var e = P(lt, tA + 0.35, 0.8);
  var end =
    shortEnd(e, '') +
    rise(
      txt(80, 150, 'timescale.info/athan/abraham-lincoln', {
        size: 7.4,
        weight: 700,
        serif: true,
      }),
      e,
      8,
    );
  return { svg: end, keep: ph, keepIn: true, noHeadline: true };
};
