// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 16, Tour: Ancient Mesopotamia (publicity/16-tour-mesopotamia.md): the sample timeline
   in the real editor, captured (shots.json), in a browser window, with the Archive look's
   callouts around the window, never over the app's own text: the whole sweep, the first cities
   and writing, Sumer to Ur, the law thread separated, the Code of Hammurabi read with its
   sources and links, how sure the dates are, the Assyrian kings as bands, Babylon's last king,
   the fall of Babylon down to the day, and the epilogue. Scenes are pure functions of scene
   time lt; q("word") is when that word is said. */

/* The window: its place on the stage, and a captured pixel (1920 × 1080) in stage units. */
var WX = 76,
  WY = 22,
  WW = 236,
  WH = (WW * 9) / 16;
function px(x) {
  return WX + (x / 1920) * WW;
}
function py(y) {
  return WY + (y / 1080) * WH;
}
/* The editor draws the view [l, r] across captured pixels 72 to 1848. */
var AX0 = 72,
  AX1 = 1848;
var YEAR = 31556952;
/** Stored seconds at the start of 1 January of year n BCE (proleptic Gregorian, near enough
    for placing callouts: a day's error is far under a pixel at these scales). */
function bce(n) {
  return (1 - n - 1970) * YEAR;
}
/** The captured pixel of time t in view v = [l, r]. */
function vpx(v, t) {
  return AX0 + ((t - v[0]) / (v[1] - v[0])) * (AX1 - AX0);
}
/** The view between keyframes, as capture.mjs moves it (a zoom into a point). */
function between(a, b, p) {
  var s0 = a[1] - a[0],
    s1 = b[1] - b[0],
    c0 = (a[0] + a[1]) / 2,
    c1 = (b[0] + b[1]) / 2;
  var e = smooth(p);
  var s = Math.exp(Math.log(s0) + (Math.log(s1) - Math.log(s0)) * e);
  var c =
    Math.abs(s0 - s1) > 1e-12 * Math.max(s0, s1)
      ? c1 + ((c0 - c1) * (s - s1)) / (s0 - s1)
      : c0 + (c1 - c0) * e;
  return [c - s / 2, c + s / 2];
}
function viewAt(keys, st) {
  if (st <= keys[0][0]) return keys[0][1];
  for (var i = 1; i < keys.length; i++)
    if (st <= keys[i][0])
      return between(
        keys[i - 1][1],
        keys[i][1],
        (st - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]),
      );
  return keys[keys.length - 1][1];
}

/** The window rising into place at the start of a scene (or already there). */
function tourWindow(lt, id, st, rising) {
  var p = rising ? P(lt, 0.15, 0.9) : 1;
  return G(appWindow(WX, WY, WW, id, st), { o: p, ty: (1 - p) * 10 });
}
/** A short arrow from (x0, y) to (x1, y), drawn to p, with its head at x1. */
function arrowTo(x0, x1, y, p, col) {
  col = col || C.accent;
  if (p <= 0.01) return '';
  var x = lerp(x0, x1, p);
  var dir = x1 > x0 ? 1 : -1;
  return (
    '<path d="M' +
    x0 +
    ' ' +
    y +
    'H' +
    x +
    '" stroke="' +
    col +
    '" stroke-width="0.7"/>' +
    '<path d="M' +
    x +
    ' ' +
    y +
    'l' +
    -2.6 * dir +
    ' -1.6v3.2z" fill="' +
    col +
    '"/>'
  );
}
/** A row of the left strip: a serif date over a name. */
function stripRow(y, date, name, p) {
  return rise(
    txt(10, y, date, { size: 5, serif: true, fill: C.accent, anchor: 'start', weight: 600 }) +
      txt(10, y + 6.6, name, { size: 5.4, anchor: 'start', weight: 600 }),
    p,
    4,
  );
}
/** A highlight drawn round part of the captured frame (captured pixels), lit to a. */
function ring(x0, y0, x1, y1, a, col) {
  if (a <= 0.01) return '';
  var x = px(x0) - 0.8,
    y = py(y0) - 0.8;
  return rect(x, y, px(x1) - px(x0) + 1.6, py(y1) - py(y0) + 1.6, 'none', {
    rx: 1.4,
    stroke: col || C.select,
    sw: 0.8,
    op: a,
  });
}
/** A pointer moving to (x, y) from (x0, y0) over [t0, t1], pressing at t1. */
function pointerTo(lt, x0, y0, x, y, t0, t1) {
  var m = smooth((lt - t0) / (t1 - t0));
  var s = pointer(lerp(x0, x, m), lerp(y0, y, m), {
    o: Math.min(P(lt, t0 - 0.1, 0.3), 1 - P(lt, t1 + 0.9, 0.4)),
  });
  var press = clamp01((lt - t1) / 0.5);
  if (press > 0 && press < 1)
    s +=
      '<circle cx="' +
      x +
      '" cy="' +
      y +
      '" r="' +
      (1 + 5 * press) +
      '" fill="none" stroke="' +
      C.select +
      '" stroke-width="0.6" opacity="' +
      (1 - press) +
      '"/>';
  return s;
}
/** A number that counts up to n as p goes 0 → 1. */
function countUp(n, p) {
  return String(Math.round(n * clamp01(p)));
}

/* Scene 1: the whole sweep, with what the sample holds. */
SCENES[1] = function (lt, q) {
  var s = tourWindow(lt, 'sweep', 0, true);
  var stats = [
    [90, 'moments', q('moments')],
    [38, 'durations', q('bands')],
    [40, 'links', q('linked')],
  ];
  stats.forEach(function (st, i) {
    var y = 44 + i * 30,
      a = P(lt, st[2] - 0.2, 0.5),
      n = P(lt, st[2] - 0.2, 0.9);
    s += pop(
      txt(10, y, countUp(st[0], n), {
        size: 14,
        serif: true,
        fill: C.accent,
        anchor: 'start',
        weight: 600,
      }) + txt(10, y + 8, st[1], { size: 5.8, fill: C.soft, anchor: 'start', weight: 600 }),
      a,
      20,
      y - 4,
    );
  });
  return s;
};

/* Scene 2: the zoom into the fourth millennium. */
SCENES[2] = function (lt, q) {
  var tZ = q('zoom') - 0.1;
  var s = tourWindow(lt, 'uruk', lt - tZ, false);
  var rows = [
    ['3500 BCE', 'Cylinder seals', q('seals')],
    ['3450 BCE', 'The White Temple', q('temple')],
    ['3400 BCE', 'Wheeled wagons', q('wagons')],
    ['3300 BCE', 'Writing', q('writing')],
    ['3200 BCE', 'Counting in sixties', q(['sixties', '60s'])],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(26 + i * 19, r[0], r[1], P(lt, r[2], 0.5));
  });
  // Every one of these dates is approximate.
  var a = P(lt, q('hour') - 0.2, 0.6);
  s += rise(
    card(8, 124, 62, 16, {}) +
      txt(39, 134, 'Dates here: about', { size: 5.6, serif: true, fill: C.text, weight: 600 }),
    a,
    4,
  );
  return s;
};

/* Scene 3: from the city-states to the empire, and Ur. */
var SUMER_KEYS = [
  [0, [bce(4100), bce(2800)]],
  [3, [bce(2470), bce(2160)]],
  [16, [bce(2270), bce(1950)]],
];
SCENES[3] = function (lt, q) {
  var s = tourWindow(lt, 'sumer', lt, false);
  var rows = [
    ['2450 BCE', 'Lagash fights Umma', q('lagash')],
    ['2334 BCE', 'Sargon of Akkad', q('sargon')],
    ['2285 BCE', 'Enheduanna', q(['enheduanna', 'anheduana'])],
    ['2154 BCE', 'Akkad falls', q('akkad', 2)],
    ['2112 BCE', 'Ur rises', q('ur')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(26 + i * 19, r[0], r[1], P(lt, r[2], 0.5));
  });
  // The Sargon band, lit as he's named (it moves with the pan).
  var v = viewAt(SUMER_KEYS, lt);
  var a = Math.min(P(lt, q('sargon'), 0.4), 1 - P(lt, q('daughter'), 0.6));
  var x0 = Math.max(0, vpx(v, bce(2334))),
    x1 = Math.min(1920, vpx(v, bce(2279)));
  if (x1 > x0) s += ring(x0, SARGON_Y0, x1, SARGON_Y1, a);
  var m = P(lt, q('six') + 0.4, 0.6);
  s += rise(
    txt(WX + WW, WY + WH + 7, 'middle chronology', {
      size: 5,
      serif: true,
      italic: true,
      fill: C.soft,
      anchor: 'end',
      weight: 500,
    }),
    m,
    3,
  );
  return s;
};
var SARGON_Y0 = 636,
  SARGON_Y1 = 654;

/* Scene 4: Separate by tags, law. */
SCENES[4] = function (lt, q) {
  var tS = q('separate');
  var s = tourWindow(lt, 'law', lt - tS + 0.4, false);
  var bx = px(587),
    by = py(41);
  var ptr = pointerTo(lt, 200, 110, bx, by, tS - 1.4, tS - 0.3);
  s += rise(chip(8, 30, 'Separate by tags', C.accent, { size: 5.2 }), P(lt, tS - 0.2, 0.5), 4);
  s += rise(chip(8, 44, 'law', C.green, { size: 5.2, solid: true }), P(lt, q('law'), 0.5), 4);
  // Under the window, a thread traced left to right through the law track's moments.
  var by0 = WY + WH + 6;
  var marks = [
    [231, 'Urukagina', q(['urukagina', 'yuru'])],
    [561, 'Ur-Nammu', q(['nammu', 'earn'])],
    [776, 'Lipit-Ishtar · Eshnunna', q('lipit')],
    [985, 'Hammurabi', q('hammurabi')],
  ];
  var tr = P(lt, q(['urukagina', 'yuru']) - 0.3, q('hammurabi') - q(['urukagina', 'yuru']) + 0.6);
  var xa = px(AX0),
    xb = px(AX1);
  s += drawPath(
    'M' + xa + ' ' + by0 + 'H' + xb,
    xb - xa,
    tr,
    'stroke="' + C.green + '" stroke-width="0.6"',
  );
  marks.forEach(function (mk) {
    var a = P(lt, mk[2], 0.4),
      x = px(mk[0]);
    s += G(
      '<circle cx="' +
        x +
        '" cy="' +
        by0 +
        '" r="1.3" fill="' +
        C.green +
        '"/>' +
        txt(x, by0 + 7, mk[1], { size: 4.6, serif: true, fill: C.text, weight: 600 }),
      { o: a },
    );
  });
  return s + ptr;
};

/* Scene 5: View mode, the Code of Hammurabi in the reader, then the stele carried to Susa. */
SCENES[5] = function (lt, q) {
  var tO = q('open'),
    tF = q('follow'),
    tClick = tF + 0.9;
  // Shot time: the code opens at 0.5 s and the related entry is chosen at 4 s; the shot waits
  // between them until the narration follows the link.
  var st0 = Math.min(3.8, 0.5 + Math.max(-0.5, lt - tO));
  var s = tourWindow(lt, 'reader', st0, false);
  var x = P(lt, tClick, 0.45);
  if (x > 0) s += G(appWindow(WX, WY, WW, 'reader', 4.1 + Math.max(0, lt - tClick)), { o: x });
  var gone = 1 - P(lt, tClick, 0.4);
  // The Date precision line, lit.
  s += ring(318, 482, 1058, 516, Math.min(P(lt, q(['stele', 'steel']) + 0.4, 0.5), gone));
  // What the reader holds: callouts to the reader's left edge, at its sections.
  var edge = px(285) - 1;
  var parts = [
    ['282 laws, on a stele', py(388), q(['two', '282'])],
    ['how its date is known', py(499), q(['stele', 'steel']) + 0.4],
    ['where it comes from', py(562), q('comes')],
    ["what it's linked to", py(730), q('linked')],
  ];
  parts.forEach(function (pt) {
    var a = P(lt, pt[2], 0.6);
    s += G(
      txt(8, pt[1] + 1.8, pt[0], { size: 4.8, anchor: 'start', weight: 600, serif: true }) +
        arrowTo(56, edge, pt[1], a),
      { o: a * gone },
    );
  });
  var ptr = pointerTo(lt, px(1300), py(950), px(560), py(787), tF - 0.2, tClick);
  // Six centuries later.
  var six = P(lt, q('six'), 0.6);
  s += rise(
    txt(8, 128, '1754', { size: 8.4, serif: true, fill: C.soft, anchor: 'start', weight: 600 }) +
      arrowTo(29, 37, 125, six, C.soft) +
      txt(39, 128, '1158', {
        size: 8.4,
        serif: true,
        fill: C.accent,
        anchor: 'start',
        weight: 600,
      }) +
      txt(8, 136, 'BCE · six centuries later', {
        size: 4.6,
        fill: C.soft,
        anchor: 'start',
        weight: 500,
      }),
    six,
    4,
  );
  return s + ptr;
};

/* Scene 6: three readers, and how each date is known. */
SCENES[6] = function (lt, q) {
  // The readers in the order the narration names them: the sack, the Venus tablet, the eclipse.
  var tV = q('tablet') - 0.3,
    tA = q('assyria') - 0.2;
  var s;
  if (lt < tV) s = tourWindow(lt, 'sack', lt + 0.6, false);
  else if (lt < tA) s = tourWindow(lt, 'venus', lt - tV + 0.2, false);
  else s = tourWindow(lt, 'eclipse', lt - tA + 0.2, false);
  // Each reader's dating lines, lit.
  if (lt < tV)
    s += ring(SACK_RING[0], SACK_RING[1], SACK_RING[2], SACK_RING[3], P(lt, q('every'), 0.5));
  else if (lt < tA)
    s += ring(VENUS_RING[0], VENUS_RING[1], VENUS_RING[2], VENUS_RING[3], P(lt, q('venus'), 0.5));
  else s += ring(ECL_RING[0], ECL_RING[1], ECL_RING[2], ECL_RING[3], P(lt, q('dated'), 0.5));
  // The three chronologies, the middle one lit.
  var rows = [
    ['High', '1651'],
    ['Middle', '1595'],
    ['Low', '1531'],
  ];
  var st = P(lt, q('1595') - 0.2, 0.6),
    mid = P(lt, q('middle'), 0.5);
  var strip = txt(8, 40, 'The sack of Babylon', {
    size: 4.8,
    fill: C.soft,
    anchor: 'start',
    weight: 600,
  });
  rows.forEach(function (r, i) {
    var y = 52 + i * 12,
      on = i === 1 ? mid : 0;
    strip +=
      rect(7, y - 6.4, 62, 9.4, C.card, { rx: 2, stroke: on > 0 ? C.accent : C.line, sw: 0.6 }) +
      txt(10, y, r[0], { size: 5.2, anchor: 'start', weight: 600, fill: mix(C.soft, C.text, on) }) +
      txt(66, y, r[1] + ' BCE', {
        size: 5.2,
        serif: true,
        anchor: 'end',
        weight: 600,
        fill: mix(C.soft, C.accent, on),
      });
  });
  s += rise(strip, st, 4);
  return s;
};
var VENUS_RING = [316, 390, 1345, 514],
  SACK_RING = [316, 512, 1424, 548],
  ECL_RING = [316, 580, 1000, 682];

/* Scene 7: the Neo-Assyrian kings as bands. */
var ASSY = [bce(886), bce(600)];
SCENES[7] = function (lt, q) {
  var s = tourWindow(lt, 'assyria', lt, false);
  var kings = [
    ['ashurnasirpal', 883, 859],
    ['tiglath', 745, 727],
    ['sargon', 722, 705],
    ['sennacherib', 705, 681],
    ['ashurbanipal', 669, 631],
  ];
  kings.forEach(function (k, i) {
    var a = P(lt, q(k[0]), 0.4);
    var next = i + 1 < kings.length ? q(kings[i + 1][0]) : q('612');
    a = Math.min(a, 1 - 0.6 * P(lt, next, 0.5));
    s += ring(vpx(ASSY, bce(k[1])), KING_Y0, vpx(ASSY, bce(k[2])), KING_Y1, a);
  });
  // The library's arc to the fall of Nineveh, drawn last.
  var xa = px(vpx(ASSY, bce(650))),
    xb = px(vpx(ASSY, bce(612))),
    y = py(559);
  s += arc(xa, xb, y - 1.6, P(lt, q('612'), 1.2), { color: C.select, w: 1, h: 9 });
  var rows = [
    ['883–859', 'Ashurnasirpal II', q('ashurnasirpal')],
    ['745–727', 'Tiglath-Pileser III', q('tiglath')],
    ['722–705', 'Sargon II', q('sargon')],
    ['705–681', 'Sennacherib', q('sennacherib')],
    ['669–631', 'Ashurbanipal', q('ashurbanipal')],
    ['612 BCE', 'Nineveh falls', q('612')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(26 + i * 18.5, r[0], r[1], P(lt, r[2], 0.5));
  });
  return s;
};
var KING_Y0 = 636,
  KING_Y1 = 654;

/* Scene 8: Babylon, and Nabonidus's dig. */
SCENES[8] = function (lt, q) {
  var tN = q('nabonidus') - 0.3;
  var s =
    lt < tN
      ? tourWindow(lt, 'babylon', lt, false)
      : tourWindow(lt, 'nabonidus', lt - tN + 0.2, false);
  var rows = [
    ['605–562', 'Nebuchadnezzar II', q('nebuchadnezzar')],
    ['597 BCE', 'Jerusalem taken', q('jerusalem')],
    ['575 BCE', 'The Ishtar Gate', q('ishtar')],
  ];
  var off = P(lt, tN, 0.5);
  rows.forEach(function (r, i) {
    s += G(stripRow(26 + i * 19, r[0], r[1], P(lt, r[2], 0.5)), { o: 1 - off });
  });
  // He said 3,200 years; it was about 1,700.
  var a = P(lt, q('3200') - 0.2, 0.5),
    b = P(lt, q('1700') - 0.2, 0.5);
  var cardS =
    card(7, 50, 64, 58, {}) +
    txt(39, 60, 'Nabonidus said', { size: 4.8, fill: C.soft, weight: 600 }) +
    txt(
      39,
      74,
      countUp(3200, P(lt, q('3200') - 0.2, 0.9)).replace(/(\d)(\d{3})$/, '$1,$2') + ' years',
      {
        size: 8,
        serif: true,
        fill: C.soft,
        weight: 600,
      },
    );
  var cardB = G(
    txt(39, 86, 'It was about', { size: 4.8, fill: C.soft, weight: 600 }) +
      txt(
        39,
        100,
        countUp(1700, P(lt, q('1700') - 0.2, 0.9)).replace(/(\d)(\d{3})$/, '$1,$2') + ' years',
        {
          size: 8.6,
          serif: true,
          fill: C.accent,
          weight: 700,
        },
      ),
    { o: b },
  );
  s += rise(cardS + cardB, a, 4);
  return s;
};

/* Scene 9: the fall of Babylon, down to the day. */
SCENES[9] = function (lt, q) {
  var tZ = 0.3,
    tR = q(['twelfth', '12th']) - 0.2;
  var s =
    lt < tR
      ? tourWindow(lt, 'fall', lt - tZ, false)
      : tourWindow(lt, 'fall-reader', lt - tR + 0.2, false);
  // Under the window, while the zoom runs: the ruler's unit.
  var d = P(lt, tZ + 5.6, 0.5) * (1 - P(lt, tR, 0.3));
  s += G(
    txt(WX + WW, WY + WH + 7, 'the ruler counts days', {
      size: 5,
      serif: true,
      italic: true,
      fill: C.soft,
      anchor: 'end',
      weight: 500,
    }),
    { o: d },
  );
  // The two calendars, once the reader is open.
  var c = P(lt, q('sixth') - 0.2, 0.8);
  var g = FALL_DATES;
  s += ring(g[0][0], g[0][1], g[0][2], g[0][3], P(lt, q('ruler'), 0.5));
  s += ring(g[1][0], g[1][1], g[1][2], g[1][3], P(lt, q('julian'), 0.5));
  s += G(
    txt(8, py(g[0][1]) + 3, 'proleptic', { size: 5, anchor: 'start', weight: 600, serif: true }) +
      txt(8, py(g[0][1]) + 9, 'Gregorian', { size: 5, anchor: 'start', weight: 600, serif: true }) +
      arrowTo(36, px(g[0][0]) - 2, py((g[0][1] + g[0][3]) / 2), c) +
      G(
        txt(8, py(g[1][1]) + 3, 'Julian', {
          size: 5,
          anchor: 'start',
          weight: 600,
          serif: true,
          fill: C.accent,
        }) + arrowTo(36, px(285) - 1, py((g[1][1] + g[1][3]) / 2), P(lt, q('julian'), 0.6)),
        { o: P(lt, q('julian'), 0.5) },
      ),
    { o: P(lt, q('ruler'), 0.5) },
  );
  return s;
};
var FALL_DATES = [
  [320, 240, 392, 272],
  [552, 499, 764, 531],
];

/* Scene 10: the epilogue, Fit all, what a class can do, and the end card. */
SCENES[10] = function (lt, q) {
  var tF = q('six') - 0.3;
  var k = smooth((lt - tF - 0.4) / 1.1);
  var w = lerp(WW, 150, k),
    x = lerp(WX, 8, k),
    y = lerp(WY, 46, k);
  var s = lt < tF ? tourWindow(lt, 'epilogue', lt, false) : appWindow(x, y, w, 'sweep', 0);
  var lines = [
    [
      'Read it',
      'no account needed',
      q('read'),
      function (cx, cy) {
        return ICON.browser(cx - 7, cy - 5, 14, 10);
      },
    ],
    [
      'Build one',
      'as a class, or one each',
      q('read') + 0.7,
      function (cx, cy) {
        return G(ICON.person(cx - 4, cy + 1, C.soft) + ICON.person(cx + 4, cy + 1, C.accent), {
          s: 0.55,
          cx: cx,
          cy: cy,
        });
      },
    ],
    [
      'Every date',
      'with its source',
      q('read') + 1.4,
      function (cx, cy) {
        return (
          '<circle cx="' +
          cx +
          '" cy="' +
          cy +
          '" r="3" fill="none" stroke="' +
          C.accent +
          '" stroke-width="1.1"/>' +
          '<path d="M' +
          cx +
          ' ' +
          (cy - 1.8) +
          'V' +
          cy +
          'l1.4 1" fill="none" stroke="' +
          C.accent +
          '" stroke-width="0.9"/>'
        );
      },
    ],
  ];
  lines.forEach(function (l, i) {
    var a = P(lt, l[2], 0.5),
      ly = 62 + i * 28;
    s += rise(
      l[3](180, ly - 2) +
        txt(192, ly, l[0], { size: 8, serif: true, anchor: 'start', weight: 700 }) +
        txt(192, ly + 8, l[1], { size: 5.6, anchor: 'start', fill: C.soft, weight: 500 }),
      a,
      5,
    );
  });
  // The end card.
  var e = P(lt, q.end + 0.6, 0.8);
  s += G(
    rect(-20, -24, 360, 210, C.ground) +
      wordmark(160, 70, 16) +
      txt(160, 96, 'timescale.info/athan/mesopotamia', {
        size: 7,
        mono: true,
        fill: C.accent,
        weight: 600,
      }) +
      txt(160, 108, 'github.com/openchronology/timeline-app', {
        size: 6,
        mono: true,
        fill: C.soft,
        weight: 500,
      }),
    { o: e, ty: (1 - e) * 6 },
  );
  return s;
};
