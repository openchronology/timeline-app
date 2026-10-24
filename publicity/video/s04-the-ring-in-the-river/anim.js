// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 4, The Ring sat in a river for 2,460 years (publicity/shorts/4-the-ring-in-the-river.md):
   a ring of our own drawing on a riverbed under the number, then the Middle-earth sample in the
   real editor on a phone (shots.json) with Separate by tags on "the one ring", its reckonings
   called out as they're named, a zoom into the late Third Age with the two spans as bars, and
   the end card with the fan-chronology disclaimer. Abstract shapes only: no maps, artwork, film
   imagery or logos. Scenes are pure functions of scene time lt; q("word") is when that word is
   said. */

/* ---------- the phone ---------- */
/* The captured screen is 1080 px wide (360 × 1000 CSS px at scale 3: tall, so the separated
   tracks draw at a readable size). The phone shows a window of its rows (s0–s1), so the
   toolbar, the separation panel and the footer sit outside the screen. */
function shotH(id) {
  var sh = (typeof SHOTS !== 'undefined' && SHOTS[id]) || { width: 360, height: 1000 };
  return (1080 * sh.height) / sh.width;
}
function phoneCrop(x, y, w, id, st, s0, s1) {
  var k = w / 1080,
    h = (s1 - s0) * k,
    r = w * 0.06,
    b = w * 0.035;
  var clip = 'pc-' + id + '-' + Math.round(x * 10) + '-' + Math.round(y * 10);
  return (
    '<g>' +
    rect(x - b - 0.8, y - b + 1.6, w + 2 * b + 1.6, h + 2 * b, '#000', { rx: r + b, op: 0.3 }) +
    rect(x - b, y - b, w + 2 * b, h + 2 * b, '#0b0f0d', { rx: r + b, stroke: C.line, sw: 0.5 }) +
    '<clipPath id="' +
    clip +
    '"><rect x="' +
    x +
    '" y="' +
    y +
    '" width="' +
    w +
    '" height="' +
    h.toFixed(2) +
    '" rx="' +
    r +
    '"/></clipPath>' +
    '<g clip-path="url(#' +
    clip +
    ')"><image href="' +
    shotFrame(id, st) +
    '" x="' +
    x +
    '" y="' +
    (y - s0 * k).toFixed(2) +
    '" width="' +
    w +
    '" height="' +
    (shotH(id) * k).toFixed(2) +
    '"/></g></g>'
  );
}
/* The phone, under the headline and just above the caption: the ring's track (rows 840–1700
   once separated) with the top of everything else's. Before Separate by tags the one track
   sits higher (rows 600–1460). */
var P2 = { x: 5, y: 74, w: 150, s0: 840, s1: 1700 },
  P3 = P2,
  PRE = 600;
function px2(sx) {
  return P2.x + (sx * P2.w) / 1080;
}
function py2(sy) {
  return P2.y + ((sy - P2.s0) * P2.w) / 1080;
}

/* A ring of light around a point, pulsing once as p rises. */
function halo(x, y, p) {
  if (p <= 0.001) return '';
  var u = clamp01(p * 1.4);
  return (
    '<circle cx="' +
    x +
    '" cy="' +
    y +
    '" r="3.4" fill="none" stroke="' +
    C.select +
    '" stroke-width="1" opacity="' +
    p.toFixed(3) +
    '"/>' +
    (u < 1
      ? '<circle cx="' +
        x +
        '" cy="' +
        y +
        '" r="' +
        (3.4 + 6 * u).toFixed(2) +
        '" fill="none" stroke="' +
        C.select +
        '" stroke-width="0.7" opacity="' +
        (1 - u).toFixed(3) +
        '"/>'
      : '')
  );
}
/* A reckoning badge: the year in its Age's own reckoning, large, in a rounded gold frame. */
function badge(cx, y, s, p) {
  var w = textWidth(s, 10) + 16;
  return pop(
    rect(cx - w / 2, y - 10, w, 14, C.card, { rx: 7, stroke: C.accent, sw: 0.9 }) +
      txt(cx, y + 0.8, s, { size: 10, serif: true, weight: 700, fill: C.strong }),
    p,
    cx,
    y - 3,
  );
}

/* ---------- Scene 1: in the river ---------- */
/* A wavy line across the frame at y, amplitude a, wavelength L, drifting with phase ph. */
function wave(y, a, L, ph) {
  var d = 'M-10 ' + y;
  for (var x = -10; x <= 190; x += 4)
    d += 'L' + x + ' ' + (y + a * Math.sin(((x + ph) / L) * 2 * Math.PI)).toFixed(2);
  return d;
}
function river(lt) {
  var top = 164,
    bed = 206;
  var body = wave(top, 1.6, 46, lt * 6) + 'L190 ' + (bed + 20) + 'L-10 ' + (bed + 20) + 'Z';
  var bedPath = wave(bed, 1.2, 70, 13) + 'L190 260L-10 260Z';
  return (
    '<defs><linearGradient id="water" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#1f4a4a"/><stop offset="1" stop-color="#0c2424"/>' +
    '</linearGradient></defs>' +
    '<path d="' +
    body +
    '" fill="url(#water)"/>' +
    '<path d="' +
    wave(top, 1.6, 46, lt * 6) +
    '" fill="none" stroke="#5f8f86" stroke-width="0.9"/>' +
    '<path d="' +
    wave(top + 9, 1.1, 38, -lt * 4 + 9) +
    '" fill="none" stroke="#3d6b66" stroke-width="0.6" opacity="0.7"/>' +
    '<path d="' +
    wave(top + 19, 0.9, 52, lt * 3 + 21) +
    '" fill="none" stroke="#3d6b66" stroke-width="0.5" opacity="0.5"/>' +
    '<path d="' +
    bedPath +
    '" fill="#2a2a1c"/>' +
    '<path d="' +
    wave(bed, 1.2, 70, 13) +
    '" fill="none" stroke="#4a4630" stroke-width="0.7"/>'
  );
}
/* The ring: a gold ellipse lying on the bed, and a glint that flashes once at p. */
function goldRing(x, y, glint) {
  var g = '';
  if (glint > 0 && glint < 1) {
    var s = Math.sin(glint * Math.PI),
      r = 9 * s,
      gx = x + 5,
      gy = y - 2.4;
    g =
      '<path d="M' +
      gx +
      ' ' +
      (gy - r) +
      'Q' +
      gx +
      ' ' +
      gy +
      ' ' +
      (gx + r) +
      ' ' +
      gy +
      'Q' +
      gx +
      ' ' +
      gy +
      ' ' +
      gx +
      ' ' +
      (gy + r) +
      'Q' +
      gx +
      ' ' +
      gy +
      ' ' +
      (gx - r) +
      ' ' +
      gy +
      'Q' +
      gx +
      ' ' +
      gy +
      ' ' +
      gx +
      ' ' +
      (gy - r) +
      'Z" fill="#fff6d0" opacity="' +
      (0.9 * s).toFixed(3) +
      '"/>' +
      '<circle cx="' +
      gx +
      '" cy="' +
      gy +
      '" r="' +
      (6 * s).toFixed(2) +
      '" fill="#ffe9a0" opacity="' +
      (0.25 * s).toFixed(3) +
      '"/>';
  }
  return (
    '<ellipse cx="' +
    x +
    '" cy="' +
    (y + 1.8) +
    '" rx="9" ry="1.6" fill="#000" opacity="0.35"/>' +
    '<ellipse cx="' +
    x +
    '" cy="' +
    y +
    '" rx="7.5" ry="2.7" fill="none" stroke="#8a6a1e" stroke-width="2.6"/>' +
    '<ellipse cx="' +
    x +
    '" cy="' +
    (y - 0.3) +
    '" rx="7.5" ry="2.7" fill="none" stroke="' +
    C.strong +
    '" stroke-width="1.6"/>' +
    '<path d="M' +
    (x - 6) +
    ' ' +
    (y - 1.9) +
    'Q' +
    x +
    ' ' +
    (y - 3.6) +
    ' ' +
    (x + 5.5) +
    ' ' +
    (y - 2) +
    '" fill="none" stroke="#fff3c4" stroke-width="0.6" opacity="0.8"/>' +
    g
  );
}
SCENES[1] = function (lt, q) {
  var glint = clamp01((lt - q('river') + 0.1) / 0.7);
  return (
    river(lt) +
    G(goldRing(80, 199, glint), { s: 1.5, cx: 80, cy: 199 }) +
    txt(SAFE.cx, 120, '2,460', { size: 44, serif: true, weight: 700, fill: C.strong }) +
    txt(SAFE.cx, 138, 'years', { size: 14, serif: true, weight: 600, fill: C.text }) +
    txt(SAFE.cx, 153, 'T.A. 2 → c. T.A. 2463', { size: 7.5, mono: true, fill: C.soft, weight: 500 })
  );
};

/* ---------- Scene 2: one track ---------- */
/* The ring shot: Fit all, Separate by tags at shot time 0.6 (on "track"), then the view
   narrows to the ring's own span. Where its moments sit in the last frame: */
var FORGED = [px2(84), py2(1235)],
  TAKEN = [px2(430), py2(1235)]; // S.A. 3441 and T.A. 2 are two years apart: one group here
function ringShotTime(lt, q) {
  return Math.max(0, lt - (q('track') - 0.62));
}
SCENES[2] = function (lt, q) {
  var up = P(lt, 0, 0.5);
  // Before Separate by tags the one track sits higher on the canvas: the window follows it down.
  var s0 = Math.floor(ringShotTime(lt, q) * 30) >= 19 ? P2.s0 : PRE;
  var phone = phoneCrop(P2.x, P2.y, P2.w, 'ring', ringShotTime(lt, q), s0, s0 + P2.s1 - P2.s0);
  var steps = [
    ['S.A. 1600', q('1600'), FORGED],
    ['S.A. 3441', q('cut'), TAKEN],
    ['T.A. 2', q('lost'), TAKEN],
  ];
  var k = -1;
  for (var i = 0; i < steps.length; i++) if (lt >= steps[i][1]) k = i;
  var marks = '';
  // The control, as the app names it, lit as the ring's moments lift into their track.
  var on = P(lt, q('track') - 0.5, 0.4),
    off = P(lt, q('1600') - 0.4, 0.3),
    lbl = 'Separate by tags · the one ring',
    bw = textWidth(lbl, 7.5) + 14;
  marks += G(
    rect(SAFE.cx - bw / 2, 77, bw, 14, mix(C.card, C.accent, 0.25 * on), {
      rx: 3,
      stroke: mix(C.line, C.accent, on),
      sw: 0.6 + 0.5 * on,
    }) + txt(SAFE.cx, 86.8, lbl, { size: 7.5, weight: 700 }),
    { o: on * (1 - off), ty: (1 - on) * 4 },
  );
  if (k >= 0) {
    var s = steps[k],
      p = P(lt, s[1], 0.35),
      bx = Math.max(SAFE.x0 + 30, Math.min(SAFE.x1 - 30, s[2][0] + 18));
    marks =
      drawPath(
        'M' + bx + ' 142 L' + s[2][0] + ' ' + (s[2][1] + 4.5),
        80,
        p,
        'stroke="' + C.select + '" stroke-width="0.8" stroke-dasharray="1.6 1.2"',
      ) +
      halo(s[2][0], s[2][1], p) +
      badge(bx, 152, s[0], p);
  }
  return { svg: '', keep: G(phone, { o: up, ty: (1 - up) * 14 }) + marks, keepOut: true };
};

/* ---------- Scene 3: found ---------- */
/* The late shot: from the ring's span into T.A. 2380–3060 (Déagol to the end), then on to
   T.A. 2925–3035 (Bilbo, the party, the destruction). The phone narrows to the ring's track. */
function bar(x, y, w, p, label, anchor, col) {
  var lx = anchor === 'end' ? x + w : x;
  return (
    G(txt(lx, y - 2.2, label, { size: 7, anchor: anchor, weight: 700, fill: C.text }), {
      o: P(p, 0, 0.3),
    }) + rect(x, y, Math.max(0.01, w * p), 5, col, { rx: 1.5 })
  );
}
/* The two spans to one scale: 478 years and 78 years, end to end. */
var BX = 14,
  BK = 112 / 478;
function spans(lt, q) {
  var g = P(lt, q('nearly'), q('gollum') - q('nearly') + 0.6),
    b = P(lt, q('78'), 0.9);
  var back = P(lt, q('nearly') - 0.3, 0.3);
  return (
    G(
      rect(P2.x, 160, P2.w, 34, C.ground, { op: 0.92 }) +
        rect(P2.x + 4, 160, P2.w - 8, 0.5, C.line),
      { o: back },
    ) +
    bar(BX, 172, 478 * BK, g, "In Gollum's keeping · ~478 years", 'start', C.accent) +
    bar(BX + 478 * BK, 186, 78 * BK, b, 'Bilbo to Mount Doom · 78 years', 'end', C.green)
  );
}
function phone3(lt) {
  var m = P(lt, 0, 0.7);
  var x = lerp(P2.x, P3.x, m),
    w = lerp(P2.w, P3.w, m),
    s0 = lerp(P2.s0, P3.s0, m),
    s1 = lerp(P2.s1, P3.s1, m);
  return phoneCrop(x, P3.y, w, 'late', lt + 0.3, s0, s1);
}
SCENES[3] = function (lt, q) {
  return { svg: '', keep: phone3(lt) + spans(lt, q), keepIn: true, keepOut: true };
};

/* ---------- Scene 4: keep your canon ---------- */
/* "Nearly five thousand years": the phone steps back out to the ring's whole life (the ring
   shot's last frame) and a gold line runs under it from the forging to the end. Then the phone
   eases down and away and the end card rises with the disclaimer. */
function px3(sx) {
  return P3.x + (sx * P3.w) / 1080;
}
SCENES[4] = function (lt, q) {
  var go = P(lt, q('keeping') - 0.4, 0.9);
  var y = lerp(P3.y, 130, go);
  var back = P(lt, 0.1, 0.5);
  var line = P(lt, q('5000') - 0.2, 1.2);
  var ly = y + ((1290 - P3.s0) * P3.w) / 1080;
  var phone =
    phoneCrop(P3.x, y, P3.w, 'ring', 99, P3.s0, P3.s1) +
    G(phoneCrop(P3.x, y, P3.w, 'late', 99, P3.s0, P3.s1), { o: 1 - back }) +
    G(rect(px3(84), ly, Math.max(0.01, (px3(994) - px3(84)) * line), 2.2, C.select, { rx: 1.1 }), {
      o: back,
    });
  var bars = G(
    spans(99, function () {
      return 0;
    }),
    { o: 1 - clamp01(lt / 0.4) },
  );
  var e = P(lt, q('keeping') + 0.1, 0.7);
  var note = rise(
    txt(SAFE.cx, 202.5, 'An unofficial fan chronology.', { size: 5.6, fill: C.soft, weight: 600 }) +
      txt(SAFE.cx, 209.5, 'Not affiliated with or endorsed by the Tolkien Estate.', {
        size: 5.6,
        fill: C.soft,
        weight: 600,
      }),
    e,
    8,
  );
  return {
    keep: G(phone, { o: 1 - go }) + bars,
    keepIn: true,
    svg: shortEnd(e, 'Keep your canon') + note,
    noHeadline: true,
  };
};
