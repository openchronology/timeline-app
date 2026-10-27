// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 13, The first archaeologist (publicity/shorts/13-the-first-archaeologist.md): a vertical
   short for history feeds. The Mesopotamia sample (samples/mesopotamia.ochx) in the real editor
   on a phone, captured in shots.json: the Neo-Babylonian years with Nabonidus's find; the find
   in the reader, with its notes and the two kings it's related to; Separate related, and a zoom
   out to 2320–480 BCE with Naram-Sin at the left of the upper track and Nabonidus at the right;
   then out to 3900–400 BCE, where the date Nabonidus gave lands before the first writing. The
   brackets and the pin are drawn beside the phone; the app shows the two real reigns. The
   phone's camera stays close on the part that matters, so the app's own labels read. Scenes are
   pure functions of scene time lt; q("word") is when that word is said. */

/* ---------- the phone, with a camera on each captured frame ---------- */
/* The phone's screen on the stage, and a camera on a shot (1080 × 2850 px): zoom z about the
   shot pixel (fx, fy), which sits at the screen's centre. */
var SCR = { x: 8, y: 82, w: 144, h: 98 };
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
/** The phone showing shot layers [{id, st, c, op, ty}], each through its own camera c. */
function phone(layers) {
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
    var sh = (typeof SHOTS !== 'undefined' && SHOTS[l.id]) || { width: 360, height: 950 };
    var hpx = (SHOT_W * sh.height) / sh.width;
    var op = l.op === undefined ? 1 : l.op;
    if (op <= 0.001) return;
    var c = l.c;
    s +=
      '<image href="' +
      shotFrame(l.id, l.st || 0) +
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
/** A scene whose phone holds across the cuts: the overlays fade with the scene, the phone
    doesn't. */
function overPhone(ph, over, lt, q, svg) {
  var f = Math.min(P(lt, 0, 0.2), 1 - clamp01((lt - (q.dur - 0.15)) / 0.15));
  return { svg: svg || '', keep: ph + G(over, { o: f }), keepIn: true, keepOut: true };
}

/* ---------- where things are in the shots ---------- */
/* The canvas runs from shot x 58 to 1019 across the view. Unseparated (shot "neo"), the line is
   at y 1608 with the find's marker on it; separated (shot "zoom"), the upper track's line is at
   y 1504 and the lower track's at 2271, with "Writing: proto-cuneiform" at 3300 BCE on it. Views
   are in years BCE; the zoom moves as capture.mjs moves it (the span geometrically, eased). */
var NEO = [560, 530],
  MID = [2320, 480],
  WIDE = [3900, 400];
/* The zoom shot's keys (shots.json): NEO until 0.4, MID by 4.4, held to 4.6, WIDE by 7.0. */
var ZK = [
  [0, NEO],
  [0.4, NEO],
  [4.4, MID],
  [4.6, MID],
  [7.0, WIDE],
];
function between(a, b, p) {
  var s0 = a[0] - a[1],
    s1 = b[0] - b[1],
    c0 = (a[0] + a[1]) / 2,
    c1 = (b[0] + b[1]) / 2;
  var e = p * p * (3 - 2 * p);
  var s = Math.exp(Math.log(s0) + (Math.log(s1) - Math.log(s0)) * e);
  var c = Math.abs(s0 - s1) > 1e-9 ? c1 + ((c0 - c1) * (s - s1)) / (s0 - s1) : c0 + (c1 - c0) * e;
  return [c + s / 2, c - s / 2];
}
/** The zoom shot's view at shot time st, on the frame the page shows. */
function zoomView(st) {
  var t = Math.floor(st * 30) / 30;
  if (t <= ZK[0][0]) return ZK[0][1];
  for (var i = 1; i < ZK.length; i++)
    if (t <= ZK[i][0])
      return between(ZK[i - 1][1], ZK[i][1], (t - ZK[i - 1][0]) / (ZK[i][0] - ZK[i - 1][0]));
  return ZK[ZK.length - 1][1];
}
function pxAt(view, bce) {
  return 58 + (961 * (view[0] - bce)) / (view[0] - view[1]);
}
/* The years the brackets measure: Naram-Sin's reign at its marker (2236, the middle of 2254–2218),
   Nabonidus's find and reign at their group (548), and the date Nabonidus's 3,200 years gives. */
var NARAM = 2236,
  NABON = 548,
  FIND = 542,
  HIS = 3742,
  WRITING = 3300;
var Y_NEO = 1608,
  Y_UP = 1504,
  Y_LOW = 2271;

/* The cameras: the unseparated years; the reader's title, notes, related kings and buttons; the
   upper track; the lower track. */
var CAM_NEO = pcam(1.25, 540, 1600);
var CAM_RA = pcam(1, 540, 540),
  CAM_RB = pcam(1, 540, 900),
  CAM_RC = pcam(1, 540, 1600),
  CAM_RD = pcam(1, 540, 1780);
var CAM_UP = pcam(1.12, 540, 1420);
var CAM_LOW = pcam(1.12, 540, 2330);

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
/** A bracket from xa to xb on rail y, its ends pointing at the phone (dir −1: up, +1: down),
    drawn by p, with its label popping in at ly. */
function bracket(xa, xb, y, dir, label, ly, p) {
  if (p <= 0.001) return '';
  var d = 'M' + xa + ' ' + (y + 3.5 * dir) + 'V' + y + 'H' + xb + 'V' + (y + 3.5 * dir);
  var s = drawPath(d, xb - xa + 7, smooth(p * 1.4), 'stroke="' + C.text + '" stroke-width="1"');
  var lp = clamp01((p - 0.45) / 0.55);
  s += pop(
    txt((xa + xb) / 2, ly, label, { size: 8.5, weight: 700, serif: true }),
    lp,
    (xa + xb) / 2,
    ly - 3,
  );
  return s;
}
var RAIL_LOW = 191,
  RAIL_HIGH = 73;

/* ---------- Scene 1: 3,200 years ---------- */
SCENES[1] = function (lt, q) {
  var c = CAM_NEO;
  var ph = phone([{ id: 'neo', c: c }]);
  var sub = txt(80, 74.5, 'c. 540 BCE', { size: 7.6, serif: true, weight: 600, fill: C.soft });
  // A soft pulse on the find as the sentence ends.
  var t = q('old');
  var pulse = P(lt, t, 0.5) * (1 - P(lt, t + 0.9, 0.6));
  var mark = clipScr(ring(c.x(pxAt(NEO, FIND)), c.y(Y_NEO), pulse, 4.2));
  return { svg: sub, keep: ph + mark, keepIn: true, keepOut: true };
};

/* ---------- Scene 2: Nabonidus at Sippar ---------- */
SCENES[2] = function (lt, q) {
  // The reader slides up over the timeline, then reads down: the notes as the temple is
  // named, the related kings as the inscription is.
  var up = smooth(lt / 0.55);
  var c = camMix(CAM_RA, CAM_RB, smooth((lt - (q('rebuilding') - 0.2)) / 0.7));
  c = camMix(c, CAM_RC, smooth((lt - (q('inscription') - 0.6)) / 0.7));
  var ph = phone([
    { id: 'neo', c: CAM_NEO, op: up < 1 ? 1 : 0 },
    { id: 'reader', c: c, ty: (1 - up) * SCR.h },
  ]);
  // The related Naram-Sin row lights on his name.
  var h = P(lt, q(['nara', 'nari']), 0.4);
  var row = clipScr(
    G(
      rect(c.x(51), c.y(1854), (1026 - 51) * c.k, 94 * c.k, C.select, { rx: 1.4, op: 0.18 }) +
        rect(c.x(51), c.y(1854), (1026 - 51) * c.k, 94 * c.k, 'none', {
          rx: 1.4,
          stroke: C.select,
          sw: 1.1,
        }),
      { o: h },
    ),
  );
  return overPhone(ph, row, lt, q, '');
};

/* ---------- Scene 3: put them on one line ---------- */
/* Shot time of the zoom shot in scene 3: separated at NEO until the zoom starts, then out to MID. */
SCENES[3] = function (lt, q) {
  var tSep = q('separate'),
    tRise = q('rise');
  // The reader scrolls to its buttons; Separate related is pressed; the reader goes, and the
  // tracks part on "rise".
  var cr = camMix(CAM_RC, CAM_RD, smooth((lt - 0.2) / 0.8));
  var gone = smooth((lt - (tSep + 0.45)) / 0.5);
  var part = smooth((lt - (tRise - 0.35)) / 0.55);
  var z0 = tRise + 0.6,
    z1 = Math.max(z0 + 3.5, q(['2250', 'twenty']) + 0.6);
  var st = lt < z0 ? 0.3 : 0.4 + 4.0 * clamp01((lt - z0) / (z1 - z0));
  var cz = camMix(CAM_NEO, CAM_UP, part);
  var ph = phone([
    { id: 'neo', c: CAM_NEO, op: 1 - part },
    { id: 'zoom', st: st, c: cz, op: part, ty: (1 - part) * 6 },
    { id: 'reader', c: cr, ty: gone * 24, op: 1 - gone },
  ]);
  // The finger on the reader's own Separate related button.
  var bx = cr.x(380),
    by = cr.y(2100) + gone * 24;
  var fo = P(lt, tSep - 0.5, 0.3) * (1 - P(lt, tSep + 0.4, 0.3));
  var tap = G(finger(bx, by, lt >= tSep && lt < tSep + 0.45), { o: fo });
  // The two kings, ringed once the view holds them both.
  var v = zoomView(st);
  var rp = P(lt, z1 - 0.2, 0.4) * (1 - P(lt, q(['1700', 'seventeen']) + 1.2, 0.5));
  var rings =
    ring(cz.x(pxAt(v, NARAM)), cz.y(Y_UP), rp, 4) + ring(cz.x(pxAt(v, NABON)), cz.y(Y_UP), rp, 4);
  // The gap, beside the phone.
  var br = bracket(
    cz.x(pxAt(v, NARAM)),
    cz.x(pxAt(v, NABON)),
    RAIL_LOW,
    -1,
    '≈ 1,700 years',
    RAIL_LOW + 11,
    clamp01((lt - (q(['1700', 'seventeen']) - 0.2)) / 0.7),
  );
  return overPhone(ph, clipScr(tap + (lt > z0 ? rings : '')), lt, q, br);
};

/* ---------- Scene 4: before writing ---------- */
SCENES[4] = function (lt, q) {
  // The zoom eases out to 3900–400 BCE; the camera drops to the lower track for the first
  // writing and rises back to Naram-Sin for the second bracket.
  var zEnd = 1.7;
  var st = 4.6 + 2.4 * clamp01((lt - 0.05) / (zEnd - 0.05));
  var v = zoomView(st);
  var tW = q('writing'),
    tOut = q(['15', 'fifteen']);
  var c = camMix(CAM_UP, CAM_LOW, smooth((lt - (q('earlier') - 0.3)) / 0.7));
  c = camMix(c, CAM_UP, smooth((lt - (tOut - 0.9)) / 0.7));
  var ph = phone([{ id: 'zoom', st: st, c: c }]);
  var xN = c.x(pxAt(v, NARAM)),
    xB = c.x(pxAt(v, NABON)),
    xH = c.x(pxAt(v, HIS));
  // The first bracket stays, following the zoom.
  var br1 = bracket(xN, xB, RAIL_LOW, -1, '≈ 1,700 years', RAIL_LOW + 11, 1);
  // His date: a pin that drops in from above the phone to below it.
  var tPin = Math.max(q('before'), zEnd);
  var pp = P(lt, tPin, 0.5);
  var pin = '';
  if (pp > 0.001) {
    var dy = (1 - pp) * -14;
    pin = G(
      '<line x1="' +
        xH.toFixed(2) +
        '" y1="' +
        RAIL_HIGH +
        '" x2="' +
        xH.toFixed(2) +
        '" y2="' +
        (RAIL_LOW + 1) +
        '" stroke="' +
        C.select +
        '" stroke-width="0.9" stroke-dasharray="2 1.6"/>' +
        '<circle cx="' +
        xH.toFixed(2) +
        '" cy="' +
        (RAIL_LOW + 1) +
        '" r="2" fill="' +
        C.select +
        '"/>' +
        txt(xH - 2.5, RAIL_LOW + 9, 'his date', {
          size: 6.4,
          weight: 700,
          anchor: 'start',
          fill: C.select,
        }) +
        txt(xH - 2.5, RAIL_LOW + 17, 'c. 3740 BCE', {
          size: 6.4,
          weight: 700,
          anchor: 'start',
          serif: true,
        }),
      { o: pp, ty: dy },
    );
  }
  // The first writing, ringed as it's said.
  var wr = P(lt, tW, 0.4) * (1 - P(lt, tOut - 0.9, 0.4));
  var stem =
    pp > 0.001
      ? G(
          '<line x1="' +
            xH.toFixed(2) +
            '" y1="' +
            SCR.y +
            '" x2="' +
            xH.toFixed(2) +
            '" y2="' +
            (SCR.y + SCR.h) +
            '" stroke="' +
            C.select +
            '" stroke-width="0.9" stroke-dasharray="2 1.6"/>',
          { o: pp },
        )
      : '';
  var wring = clipScr(stem + ring(c.x(pxAt(v, WRITING)), c.y(Y_LOW), wr, 4.4));
  // The second bracket, above the phone, from the pin to Naram-Sin.
  var br2 = bracket(
    xH,
    xN,
    RAIL_HIGH,
    1,
    '~1,500 years',
    RAIL_HIGH - 5,
    clamp01((lt - (tOut - 0.3)) / 0.7),
  );
  return overPhone(ph, wring, lt, q, br1 + pin + br2);
};

/* ---------- Scene 5: every date, with its source ---------- */
SCENES[5] = function (lt, q) {
  var tA = Math.max(1.5, q('thats') - 1.4);
  var away = smooth((lt - tA) / 0.7);
  var ph = G(phone([{ id: 'zoom', st: 7.0, c: CAM_UP }]), {
    o: 1 - away,
    s: lerp(1, 0.6, away),
    cx: 80,
    cy: 131,
    ty: -away * 26,
  });
  var e = P(lt, tA + 0.35, 0.8);
  var end =
    rise(
      txt(80, 92, 'Every date, with', { size: 11, weight: 700, serif: true }) +
        txt(80, 105, 'where it comes from', { size: 11, weight: 700, serif: true }),
      e,
      8,
    ) +
    shortEnd(e, '') +
    rise(
      txt(80, 150, 'timescale.info/athan/mesopotamia', {
        size: 7.4,
        weight: 700,
        serif: true,
      }),
      e,
      8,
    );
  return { svg: end, keep: ph, keepIn: true, noHeadline: true };
};
