// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 20, Tour: The U.S. Civil War, 1861–1865 (publicity/20-tour-us-civil-war.md): the
   Civil War sample (samples/civil-war.ochx) in the real editor, captured (shots.json), in a
   browser window, with the Archive look's callouts around the window, never over the app's own
   text: the whole span, the slavery thread, the 1850s and the secession winter zoomed into,
   the Cornerstone Speech in the reader, the commands as bands, the West and the Black
   soldiers separated by tags, autumn 1862, July 1863 and April 1865, the surrenders after
   Appomattox, the war's cost in its band's notes, and Reconstruction. Scenes are pure
   functions of scene time lt; q("word") is when that word is said. */

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
/** The window rising into place at the start of a scene (or already there). */
function tourWindow(lt, id, st, rising) {
  var p = rising ? P(lt, 0.15, 0.9) : 1;
  return G(appWindow(WX, WY, WW, id, st), { o: p, ty: (1 - p) * 10 });
}

/* ---------- where a date falls in a captured frame ---------- */
/** Seconds of a local date (YYYY-MM-DD, or YYYY-MM-DDTHH:MM) at UTC−5, as the sample stores it. */
function T(s) {
  return Date.parse(s.length > 10 ? s + ':00-05:00' : s + 'T00:00:00-05:00') / 1000;
}
/** The timeline's drawing area in captured pixels: the view spans x 72–1848. */
var AX0 = 72,
  AX1 = 1848;
/* Each moving shot's keyframes, as in shots.json: [t, left, right, linear?]. */
var KEYS = {
  fit: [[0, '1819-06-01', '1878-01-01']],
  slavery: [[0, '1819-06-01', '1878-01-01']],
  fifties: [
    [0, '1819-06-01', '1878-01-01'],
    [5, '1849-01-01', '1861-06-01'],
  ],
  secession: [
    [0, '1849-01-01', '1861-06-01'],
    [4, '1860-10-01', '1861-03-20'],
    [5, '1860-10-01', '1861-03-20'],
    [15, '1860-12-05', '1861-06-20', true],
  ],
  commands: [[0, '1861-02-01', '1869-06-01']],
  west: [[0, '1861-02-01', '1865-08-01']],
  y1862: [
    [0, '1861-02-01', '1865-08-01'],
    [4, '1862-07-01', '1863-01-20'],
  ],
  july1863: [
    [0, '1863-05-10', '1863-07-31'],
    [6, '1863-06-24', '1863-07-24'],
  ],
  black: [
    [0, '1862-06-01', '1865-06-01'],
    [3, '1862-06-01', '1865-06-01'],
    [5.5, '1863-04-20', '1863-07-10'],
    [7, '1863-04-20', '1863-07-10'],
    [9.5, '1862-06-01', '1865-06-01'],
  ],
  april1865: [
    [0, '1865-02-01', '1865-06-15'],
    [3, '1865-03-25', '1865-05-01'],
  ],
  tail: [
    [0, '1865-03-25', '1865-05-01'],
    [2.5, '1865-03-15', '1865-12-20'],
  ],
  after: [
    [0, '1860-12-01', '1866-01-01'],
    [3, '1865-06-01', '1877-12-31'],
  ],
};
/** The view between two keyframes, as capture.mjs moves it: the span geometrically, the
    centre so that the target stays put. */
function between(a, b, p) {
  var l0 = T(a[1]),
    r0 = T(a[2]),
    l1 = T(b[1]),
    r1 = T(b[2]);
  var s0 = r0 - l0,
    s1 = r1 - l1,
    c0 = (l0 + r0) / 2,
    c1 = (l1 + r1) / 2;
  var e = b[3] ? p : p * p * (3 - 2 * p);
  var s = Math.exp(Math.log(s0) + (Math.log(s1) - Math.log(s0)) * e);
  var c =
    Math.abs(s0 - s1) > 1e-12 * Math.max(s0, s1)
      ? c1 + ((c0 - c1) * (s - s1)) / (s0 - s1)
      : c0 + (c1 - c0) * e;
  return [c - s / 2, c + s / 2];
}
/** The shot's view [left, right] (seconds) at shot time st (in whole frames, as captured). */
function viewOf(id, st) {
  var keys = KEYS[id];
  var t = Math.max(0, Math.floor(st * 30 + 1e-6) / 30);
  if (t <= keys[0][0]) return [T(keys[0][1]), T(keys[0][2])];
  for (var i = 1; i < keys.length; i++)
    if (t <= keys[i][0])
      return between(keys[i - 1], keys[i], (t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
  var k = keys[keys.length - 1];
  return [T(k[1]), T(k[2])];
}
/** The captured x of local date d in shot id at shot time st. */
function dx(id, st, d) {
  var v = viewOf(id, st);
  return AX0 + ((AX1 - AX0) * (T(d) - v[0])) / (v[1] - v[0]);
}

/* ---------- callouts ---------- */
/** A brick outline around captured pixels (x0, y0)–(x1, y1), shown by p. */
function outline(x0, y0, x1, y1, p, o) {
  o = o || {};
  // Kept inside the captured frame: a band panned off the edge is cut at it.
  x0 = Math.max(x0, 8);
  x1 = Math.min(x1, 1912);
  if (p <= 0.001 || x1 - x0 < 4) return '';
  var pad = o.pad === undefined ? 0.8 : o.pad;
  return G(
    rect(px(x0) - pad, py(y0) - pad, px(x1) - px(x0) + 2 * pad, py(y1) - py(y0) + 2 * pad, 'none', {
      rx: 1.2,
      stroke: o.color || C.accent,
      sw: o.sw || 0.8,
    }),
    { o: p },
  );
}
/** A ring around a marker at captured pixel (x, y), drawn in by p (a lit moment) and faded by
    dim once the narration moves on. */
function ring(x, y, p, r, dim) {
  if (p <= 0.001) return '';
  r = r || 2.6;
  var op = p * (1 - 0.6 * (dim || 0));
  return (
    '<circle cx="' +
    px(x) +
    '" cy="' +
    py(y) +
    '" r="' +
    (r + (1 - p) * 2) +
    '" fill="none" stroke="' +
    C.accent +
    '" stroke-width="0.8" opacity="' +
    op +
    '"/>'
  );
}
/** A ripple where the pointer presses, for press in 0–1. */
function ripple(x, y, press) {
  if (press <= 0 || press >= 1) return '';
  return (
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
    '"/>'
  );
}
/** The pointer travelling from (x0, y0) to (x1, y1), pressing at tP and leaving after. */
function pointerTo(lt, x0, y0, x1, y1, tP) {
  var m = smooth((lt - (tP - 1.2)) / 1.0);
  return (
    pointer(lerp(x0, x1, m), lerp(y0, y1, m), {
      o: Math.min(P(lt, tP - 1.4, 0.3), 1 - P(lt, tP + 1.0, 0.4)),
    }) + ripple(x1, y1, clamp01((lt - tP) / 0.5))
  );
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
/** A row of the left strip: a serif date over a name; lit (0–1) shows it, dim fades it. */
function stripRow(y, date, name, p, dim) {
  return G(
    txt(10, y, date, { size: 5, serif: true, fill: C.accent, anchor: 'start', weight: 600 }) +
      txt(10, y + 6.4, name, { size: 5.4, anchor: 'start', weight: 600 }),
    { o: p * (dim === undefined ? 1 : lerp(1, 0.45, dim)), ty: (1 - p) * 4 },
  );
}
/** The thread line between two strip rows (at y0 and y1), drawn to p. */
function stripLink(y0, y1, p) {
  return drawPath(
    'M7 ' + (y0 + 8) + 'V' + (y1 - 5),
    y1 - y0 - 13,
    p,
    'stroke="' + C.arc + '" stroke-width="0.7"',
  );
}
/** A small note in the strip, in the soft colour. */
function stripNote(y, s, p, o) {
  o = o || {};
  return G(
    txt(10, y, s, {
      size: o.size || 4.8,
      fill: o.fill || C.soft,
      anchor: 'start',
      weight: 500,
      serif: o.serif,
    }),
    { o: p, ty: (1 - p) * 3 },
  );
}
/** A large figure in the strip (a number or a span), with a caption under it. */
function figure(y, big, cap, p, o) {
  o = o || {};
  return rise(
    txt(10, y, big, {
      size: o.size || 8,
      serif: true,
      fill: C.accent,
      anchor: 'start',
      weight: 700,
    }) +
      (cap ? txt(10, y + 7, cap, { size: 4.8, fill: C.soft, anchor: 'start', weight: 600 }) : ''),
    p,
    4,
  );
}
/** A label inside the window, on a card, at captured pixel (x, y) (its centre). */
function tag(x, y, label, p) {
  var w = textWidth(label, 5) + 6;
  return rise(
    rect(px(x) - w / 2, py(y) - 4.4, w, 7.4, C.card, { rx: 1.6, stroke: C.accent, sw: 0.6 }) +
      txt(px(x), py(y) + 1.4, label, { size: 5, serif: true, fill: C.accent, weight: 700 }),
    p,
    2,
  );
}
/** An underline under captured pixels x0–x1 at y, drawn left to right to p. */
function underline(x0, x1, y, p) {
  if (p <= 0.01) return '';
  return (
    '<path d="M' +
    px(x0) +
    ' ' +
    py(y) +
    'H' +
    lerp(px(x0), px(x1), p) +
    '" stroke="' +
    C.accent +
    '" stroke-width="0.8" stroke-linecap="round"/>'
  );
}
/** The control and its tag in the strip. */
var SEP_BUTTON = [587, 41];
function separating(lt, tS, tTag, tagName) {
  var s = rise(chip(8, 30, 'Separate by tags', C.accent, { size: 5.2 }), P(lt, tS - 0.2, 0.5), 4);
  s += rise(chip(8, 44, tagName, C.accent, { size: 5.2, solid: true }), P(lt, tTag, 0.5), 4);
  return s;
}
/* (Without the + Event button, as in a view with no room for it, the toolbar shifts right.) */
function separatePointer(lt, tS, bx) {
  return pointerTo(lt, 200, 110, px(bx || SEP_BUTTON[0]), py(SEP_BUTTON[1]), tS);
}
/** The View mode switch, as a small label in the strip. */
function viewModeChip(x, y, p) {
  return rise(
    rect(x, y - 5, 12, 6.4, C.accent, { rx: 3.2 }) +
      '<circle cx="' +
      (x + 8.8) +
      '" cy="' +
      (y - 1.8) +
      '" r="2.4" fill="' +
      C.card +
      '"/>' +
      txt(x + 16, y, 'View mode', { size: 5.6, anchor: 'start', weight: 600 }),
    p,
    4,
  );
}

/* SCENES */
/* ---------- Scene 1: the whole span ---------- */
SCENES[1] = function (lt, q) {
  var s = tourWindow(lt, 'fit', 0, true);
  var stats = [
    [121, 'moments', q(['121', 'hundred'])],
    [40, 'durations', q('40', 2)],
    [40, 'links', q('40', 3)],
  ];
  stats.forEach(function (st, i) {
    var y = 30 + i * 30,
      a = P(lt, st[2], 0.5),
      n = Math.round(st[0] * clamp01((lt - st[2]) / 0.8));
    s += pop(
      card(8, y, 60, 24, {}) +
        txt(38, y + 12.5, String(n), { size: 11, serif: true, fill: C.accent, weight: 700 }) +
        txt(38, y + 19.5, st[1], { size: 5.4, fill: C.soft, weight: 600 }),
      a,
      38,
      y + 12,
    );
  });
  return s;
};

/* ---------- Scene 2: one thread, slavery ---------- */
/* The slavery track's markers in the separated frame (captured pixels): x, on the axis at y. */
var SLAVE_Y = 489;
SCENES[2] = function (lt, q) {
  var tS = q('separate'),
    tT = q('slavery');
  var s = tourWindow(lt, 'slavery', lt - tT + 0.4, false);
  s += separating(lt, tS, tT, 'slavery');
  var rows = [
    ['1820', 'Missouri Compromise', q('missouri'), 95],
    ['1831', "Nat Turner's rebellion", q('nat'), 432],
    ['1845', "Douglass's Narrative", q('frederick'), 857],
    ['1850', 'Fugitive Slave Act', q('fugitive'), 1006],
    ['1854', 'Kansas–Nebraska', q('kansas'), 1132],
    ['1857', 'Dred Scott', q('dred'), 1204],
    ['1863–1865', 'Emancipation', q('emancipation'), 1390],
  ];
  rows.forEach(function (r, i) {
    var a = P(lt, r[2], 0.5),
      next = i + 1 < rows.length ? rows[i + 1][2] : 1e9;
    s += stripRow(62 + i * 15, r[0], r[1], a, P(lt, next, 0.5));
    s += ring(r[3], SLAVE_Y, a, 3.2, P(lt, next, 0.5));
  });
  return s + separatePointer(lt, tS);
};

/* ---------- Scene 3: the 1850s ---------- */
SCENES[3] = function (lt, q) {
  var tZ = q('zoom') - 0.2;
  var s = tourWindow(lt, 'fifties', lt - tZ, false);
  var rows = [
    ['1852', "Uncle Tom's Cabin", q('uncle')],
    ['1854', 'Kansas–Nebraska Act', q('kansas')],
    ['1854–1861', 'Bleeding Kansas', q('seven')],
    ['1857', 'Dred Scott v. Sandford', q(['1857', 'supreme'])],
    ['1859', 'Harpers Ferry', q('john')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(30 + i * 22, r[0], r[1], P(lt, r[2], 0.5));
  });
  s += stripNote(30 + 3 * 22 + 13, 'not citizens', P(lt, q('citizens'), 0.5));
  s += ring(532, 563, P(lt, rows[0][2], 0.5), 3.4);
  s += ring(846, 563, P(lt, rows[1][2], 0.5), 3.4);
  s += outline(848, 617, 1797, 633, P(lt, rows[2][2], 0.5) * (1 - 0.6 * P(lt, rows[3][2], 0.5)));
  var ds = P(lt, rows[3][2], 0.5);
  s += ring(1242, 563, ds, 3.4);
  s += tag(720, 270, '← from the Missouri Compromise, 1820', ds);
  s += ring(1616, 563, P(lt, rows[4][2], 0.5), 3.4);
  return s;
};

/* ---------- Scene 4: secession winter (zoom, then a slow pan right) ---------- */
SCENES[4] = function (lt, q) {
  // Shot time: the zoom (0–4 s) as the election is said; the pan (5–15 s) from South
  // Carolina to the upper South, slowed to reach Fort Sumter as it's named.
  var tP = q('six') - 1.2,
    tE = q('four') + 0.6;
  var st = lt < tP ? Math.min(4.9, lt) : 5 + 10 * clamp01((lt - tP) / Math.max(4, tE - tP));
  var s = tourWindow(lt, 'secession', st, false);
  var rows = [
    ['Nov 6, 1860', 'Lincoln elected', q('lincoln'), '1860-11-06'],
    ['Dec 20', 'South Carolina secedes', q('south'), '1860-12-20'],
    ['Feb 1, 1861', 'Seven states have left', q('seven'), null],
    ['Feb 8', 'The Confederacy founded', q('founded'), '1861-02-08'],
    ['Mar 4', 'Lincoln takes office', q('takes'), null],
    ['Apr 12', 'Fort Sumter', q('sumter'), null],
    ['Apr – Jun', 'Four more secede', q('four'), null],
  ];
  rows.forEach(function (r, i) {
    var a = P(lt, r[2], 0.5);
    s += stripRow(30 + i * 18, r[0], r[1], a);
    if (r[3]) {
      var x = dx('secession', st, r[3]),
        dim = P(lt, r[2] + 2.5, 0.6);
      // Lincoln's marker sits under the sticky heading Election and secession: outline his label.
      if (!i) s += outline(x - 92, 398, x + 92, 447, a * (1 - 0.6 * dim));
      else if (x > 40 && x < 1880) s += ring(x, 563, a, 3.4, dim);
    }
  });
  var deep = P(lt, q('seven'), 0.5) * (1 - P(lt, q('takes'), 0.6));
  s += outline(
    dx('secession', st, '1860-12-20'),
    637,
    dx('secession', st, '1861-02-01'),
    653,
    deep,
  );
  var up = P(lt, q('four'), 0.5);
  s += outline(dx('secession', st, '1861-04-17'), 696, dx('secession', st, '1861-06-08'), 711, up);
  return s;
};

/* ---------- Scene 5: read a moment, and its sources ---------- */
/* The reader in the captured frame: the left edge of its text, its quotation's lines, and
   where its Sources and Related to sit. */
var CORNER = { edge: 329, q1: [329, 1258, 494], q2: [329, 822, 534], sources: 620, related: 737 };
SCENES[5] = function (lt, q) {
  var tO = 0.4;
  var s = tourWindow(lt, 'cornerstone', lt - tO, false);
  s += viewModeChip(8, 33, P(lt, 0.2, 0.5));
  var decl = [
    ['South Carolina', 'Dec 24, 1860', q('south'), 46],
    ['Mississippi', 'Jan 1861', q('mississippi'), 70],
  ];
  decl.forEach(function (d) {
    var a = P(lt, d[2], 0.5);
    s += rise(
      txt(10, d[3], d[0], { size: 5.4, anchor: 'start', weight: 700 }) +
        txt(10, d[3] + 6.4, d[1], {
          size: 5,
          serif: true,
          fill: C.accent,
          anchor: 'start',
          weight: 600,
        }) +
        txt(10, d[3] + 12.4, 'Avalon Project', {
          size: 4.6,
          fill: C.soft,
          anchor: 'start',
          weight: 500,
        }),
      a,
      3,
    );
  });
  // Stephens's words, underlined as the cornerstone is named.
  var tC = q('cornerstone') - 0.3;
  s += underline(CORNER.q1[0], CORNER.q1[1], CORNER.q1[2], clamp01((lt - tC) / 1.0));
  s += underline(CORNER.q2[0], CORNER.q2[1], CORNER.q2[2], clamp01((lt - tC - 1.0) / 0.6));
  var edge = px(CORNER.edge) - 1.5;
  var parts = [
    ['its sources', py(CORNER.sources), q('sources') - 0.4],
    ['its links', py(CORNER.related), q('sources') + 0.2],
  ];
  parts.forEach(function (pt) {
    var a = P(lt, pt[2], 0.5);
    s += G(
      txt(10, pt[1] + 1.8, pt[0], { size: 5, anchor: 'start', weight: 600, serif: true }) +
        arrowTo(40, edge, pt[1], a),
      { o: a },
    );
  });
  return s;
};

/* ---------- Scene 6: bands for commands (command separated) ---------- */
/* The bands in the separated frame (captured pixels): [x0, x1, y]. */
var WAR_BAND = [115, 963, 861],
  MCCLELLAN = [175, 447, 527],
  LEE = [356, 963, 551],
  GRANT = [735, 1795, 527];
SCENES[6] = function (lt, q) {
  var tS = q('band');
  var s = tourWindow(lt, 'commands', lt - tS + 0.4, false);
  s += separating(lt, tS, tS + 0.3, 'command');
  var rows = [
    [
      'Apr 1861 – Apr 1865',
      'The Civil War',
      '4 years less 3 days',
      q('sumter'),
      q('less'),
      WAR_BAND,
    ],
    [
      'Jul 1861 – Nov 1862',
      'McClellan, the East',
      '15 months',
      q('mcclellan'),
      q(['15', 'fifteen']),
      MCCLELLAN,
    ],
    ['Jun 1862 – Apr 1865', 'Lee', 'almost 3 years', q('lee'), q('almost'), LEE],
    ['Mar 1864', 'Grant, general-in-chief', '', q('grant'), 0, GRANT],
  ];
  rows.forEach(function (r, i) {
    var a = P(lt, r[3], 0.5),
      next = i + 1 < rows.length ? rows[i + 1][3] : 1e9,
      dim = P(lt, next, 0.5),
      y = 62 + i * 24;
    s += stripRow(y, r[0], r[1], a, dim);
    if (r[2])
      s += stripNote(y + 13, r[2], P(lt, r[4], 0.5) * lerp(1, 0.45, dim), {
        serif: true,
        fill: C.accent,
      });
    var b = r[5];
    s += outline(b[0], b[2] - 7, b[1], b[2] + 7, a * (1 - 0.6 * dim));
  });
  return s + separatePointer(lt, tS);
};

/* ---------- Scene 7: one front, the West (west separated) ---------- */
SCENES[7] = function (lt, q) {
  var tS = q('separate'),
    tT = q('west');
  var s = tourWindow(lt, 'west', lt - tT + 0.4, false);
  s += separating(lt, tS, tT, 'west');
  var X = function (d) {
    return dx('west', 0, d);
  };
  var rows = [
    ['Feb 1862', 'Fort Donelson', q(['fort', 'donelson']), '1862-02-16'],
    ['Apr 1862', 'Shiloh', q('shiloh'), '1862-04-07'],
    ['Jul 1863', 'Vicksburg', q('vicksburg'), '1863-07-04'],
    ['Nov 1863', 'Chattanooga', q('chattanooga'), '1863-11-24'],
    ['Sep 1864', 'Atlanta', q('atlanta'), '1864-09-02'],
    ['Nov – Dec 1864', 'The march to the sea', q('march'), null],
  ];
  var east = P(lt, q('east'), 0.6);
  rows.forEach(function (r, i) {
    var a = P(lt, r[2], 0.5);
    s += stripRow(62 + i * 15, r[0], r[1], a, east);
    if (r[3]) s += ring(X(r[3]), 489, a, 3, east);
  });
  s += outline(
    X('1864-11-15'),
    532,
    X('1864-12-21'),
    546,
    P(lt, rows[5][2], 0.5) * (1 - 0.6 * east),
  );
  // In the East: the rest, below.
  s += outline(40, 690, 1880, 945, east * 0.9, { color: C.soft, sw: 0.6 });
  s += tag(1560, 652, 'the East, back and forth', east);
  return s + separatePointer(lt, tS);
};

/* ---------- Scene 8: autumn 1862, following the links ---------- */
SCENES[8] = function (lt, q) {
  var tZ = q('zoom') - 0.3;
  var st = lt - tZ;
  var s = tourWindow(lt, 'y1862', st, false);
  var rows = [
    ['Sep 17, 1862', 'Antietam', q('antietam'), '1862-09-17'],
    ['Sep 22', 'Preliminary proclamation', q('preliminary'), '1862-09-22'],
    ['Jan 1, 1863', 'Emancipation Proclamation', q('new'), '1863-01-01'],
  ];
  rows.forEach(function (r, i) {
    var a = P(lt, r[2], 0.5);
    s += stripRow(30 + i * 26, r[0], r[1], a);
    if (i) s += stripLink(30 + (i - 1) * 26, 30 + i * 26, a);
    s += ring(dx('y1862', st, r[3]), 563, a, 3.4);
  });
  s += stripNote(30 + 13, 'the bloodiest single day', P(lt, q('bloodiest'), 0.5));
  s += stripNote(30 + 26 + 13, 'five days later', P(lt, q('five'), 0.5));
  s += tag(780, 860, '≈ 23,000 casualties in a day', P(lt, q(['23000', 'about']), 0.5));
  return s;
};

/* ---------- Scene 9: three weeks in July 1863 ---------- */
SCENES[9] = function (lt, q) {
  var st = lt;
  var s = tourWindow(lt, 'july1863', st, false);
  var X = function (d) {
    return dx('july1863', st, d);
  };
  var rows = [
    ['Jul 1–3', 'Gettysburg', q('gettysburg')],
    ['Jul 4', 'Vicksburg surrenders', q('vicksburg')],
    ['Jul 9', 'Port Hudson surrenders', q('port')],
    ['Jul 13–16', 'New York draft riots', q('draft')],
    ['Jul 18', 'Fort Wagner', q(['54th', 'fifty'])],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(30 + i * 22, r[0], r[1], P(lt, r[2], 0.5));
  });
  s += stripNote(30 + 2 * 22 + 13, 'the Mississippi is the Union’s', P(lt, q('mississippi'), 0.5));
  var a = rows.map(function (r) {
    return P(lt, r[2], 0.5);
  });
  s += outline(X('1863-07-01'), 735, X('1863-07-04'), 750, a[0]);
  s += ring(X('1863-07-04'), 563, a[1], 3.4);
  s += ring(X('1863-07-09'), 563, a[2], 3.4);
  s += outline(X('1863-07-13'), 715, X('1863-07-17'), 731, a[3]);
  s += ring(X('1863-07-18'), 563, a[4], 3.4);
  return s;
};

/* ---------- Scene 10: one thread, Black soldiers ---------- */
SCENES[10] = function (lt, q) {
  var tS = q('pull'),
    tT = q('black');
  // Shot time: separated at 0.4 s and held at 3 s; the zoom into May–June 1863 (3–7 s) as
  // Tubman is named, then back out (7–9.5 s) before Fort Pillow.
  var tIn = q('harriet') - 1.5,
    tOut = q('fort') - 2.5;
  var st =
    lt < tIn
      ? Math.min(3, Math.max(0, lt - tT + 0.4))
      : lt < tOut
        ? Math.min(7, 3 + (lt - tIn))
        : Math.min(9.5, 7 + (lt - tOut));
  var s = tourWindow(lt, 'black', st, false);
  s += separating(lt, tS, tT, 'black soldiers');
  var rows = [
    ['Mar 1863', '“Men of Color, To Arms!”', q('frederick'), '1863-03-02'],
    ['Jun 1863 · 750+ freed', 'Combahee River Raid', q('harriet'), '1863-06-02'],
    ['Apr 1864', 'Fort Pillow', q('pillow'), '1864-04-12'],
    ['Jul 1864', 'The Crater', q('crater'), '1864-07-30'],
    ['Sep 1864', 'New Market Heights', q('market'), '1864-09-29'],
  ];
  rows.forEach(function (r, i) {
    var a = P(lt, r[2], 0.5),
      next = i + 1 < rows.length ? rows[i + 1][2] : 1e9;
    s += stripRow(62 + i * 16, r[0], r[1], a, P(lt, next, 0.5));
    var x = dx('black', st, r[3]);
    if (x > 40 && x < 1880) s += ring(x, 489, a, 3, P(lt, next, 0.5));
  });
  s += figure(
    146,
    '≈ 179,000',
    'in the Union army',
    P(lt, q(['79000', '179000', 'hundred']), 0.5),
    { size: 7.4 },
  );
  return s + separatePointer(lt, tS, 710);
};

/* ---------- Scene 11: April 1865 ---------- */
SCENES[11] = function (lt, q) {
  var st = lt;
  var s = tourWindow(lt, 'april1865', st, false);
  var rows = [
    ['Apr 3', 'Richmond falls', q('richmond'), '1865-04-03'],
    ['Apr 9', 'Lee surrenders', q('lee'), '1865-04-09'],
    ['Apr 14, 22:15', "Lincoln shot at Ford's", q('shot'), '1865-04-14T22:15'],
  ];
  rows.forEach(function (r, i) {
    var a = P(lt, r[2], 0.5);
    s += stripRow(30 + i * 26, r[0], r[1], a);
    if (i) s += stripLink(30 + (i - 1) * 26, 30 + i * 26, a);
    s += ring(dx('april1865', st, r[3]), 563, a, 3.4);
  });
  s += stripNote(30 + 26 + 13, 'five days later', P(lt, q('five'), 0.5));
  return s;
};

/* ---------- Scene 12: after Appomattox (surrender separated) ---------- */
var LAST_BAND = [231, 1568, 527];
SCENES[12] = function (lt, q) {
  // Shot time: the view widens (0–2.5 s) and the surrenders lift into their track at 3 s.
  var st = Math.min(5, lt);
  var s = tourWindow(lt, 'tail', st, false);
  var tS = 3;
  s += separating(lt, tS, tS + 0.3, 'surrender');
  var rows = [
    ['Apr 26', 'Johnston surrenders', q('johnston'), '1865-04-26'],
    ['Jun 2', 'Kirby Smith surrenders', q('kirby'), '1865-06-02'],
    ['Jun 19', 'Juneteenth', q('juneteenth'), '1865-06-19'],
    ['Jun 23', 'Stand Watie, Cherokee', q(['stan', 'stand', 'watie']), '1865-06-23'],
    ['Nov 6', 'The Shenandoah', q('shenandoah'), '1865-11-06'],
  ];
  rows.forEach(function (r, i) {
    var a = P(lt, r[2], 0.5);
    s += stripRow(62 + i * 18, r[0], r[1], a);
    s += ring(dx('tail', st, r[3]), 489, a, 3, P(lt, r[2] + 3, 0.6));
  });
  // The band drawn along, Appomattox to the Shenandoah, and its length at its end.
  var b = smooth(clamp01((lt - 3.6) / Math.max(1, q('november') - 3.6)));
  s += underline(
    LAST_BAND[0],
    lerp(LAST_BAND[0], LAST_BAND[1], b),
    LAST_BAND[2] + 12,
    b > 0.01 ? 1 : 0,
  );
  s += tag(LAST_BAND[1], 440, '211 days', P(lt, q('november'), 0.5));
  return s + separatePointer(lt, tS, 710);
};

/* ---------- Scene 13: the cost, in the war's band ---------- */
/* The reader's notes in the captured frame: the two figures and the last sentence. */
var COST = { trad: [529, 681, 512], hacker: [969, 1126, 553], both: [616, 822, 594] };
SCENES[13] = function (lt, q) {
  var s = tourWindow(lt, 'reader-war', lt - 0.6, false);
  s += viewModeChip(8, 33, P(lt, 0.2, 0.5));
  var t1 = q(['620000', 'six']),
    t2 = q(['750000', 'seven']),
    t3 = q('estimates');
  s += figure(54, '≈ 620,000', 'traditional count', P(lt, t1, 0.5));
  s += figure(80, '≈ 750,000', 'Hacker, 2011', P(lt, t2, 0.5));
  s += stripNote(106, 'estimates', P(lt, t3, 0.5), {
    size: 6.4,
    serif: true,
    fill: C.accent,
  });
  s += underline(COST.trad[0], COST.trad[1], COST.trad[2], clamp01((lt - t1 + 0.2) / 0.8));
  s += underline(COST.hacker[0], COST.hacker[1], COST.hacker[2], clamp01((lt - t2 + 0.2) / 0.8));
  s += underline(COST.both[0], COST.both[1], COST.both[2], clamp01((lt - t3 + 0.6) / 0.8));
  return s;
};

/* ---------- Scene 14: three amendments, twelve years ---------- */
SCENES[14] = function (lt, q) {
  var tC = 0.3;
  var st = Math.max(0, (lt - tC) * 1.3);
  var s = lt < tC ? tourWindow(lt, 'reader-war', 2, false) : tourWindow(lt, 'after', st, false);
  var X = function (d) {
    return dx('after', st, d);
  };
  var rows = [
    ['Dec 1865', 'Thirteenth Amendment', q(['13th', 'thirteenth']), '1865-12-06'],
    ['Jul 1868', 'Fourteenth Amendment', q(['14th', 'fourteenth']), '1868-07-09'],
    ['Feb 1870', 'Fifteenth Amendment', q(['15th', 'fifteenth']), '1870-02-03'],
  ];
  rows.forEach(function (r, i) {
    var a = P(lt, r[2], 0.5);
    s += stripRow(30 + i * 22, r[0], r[1], a);
    if (i) s += stripLink(30 + (i - 1) * 22, 30 + i * 22, a);
    // (The Thirteenth sits under the sticky heading Reconstruction, 1865–1877: no ring there.)
    if (lt >= tC && i) s += ring(X(r[3]), 563, a, 3.4, P(lt, q('reconstruction'), 0.6));
  });
  s += stripNote(30 + 13, 'ending slavery', P(lt, q('ending'), 0.5));
  var r = P(lt, q('reconstruction'), 0.5);
  s += figure(110, '1865–1877', 'Reconstruction, 12 years', r, { size: 7.4 });
  s += stripNote(134, 'Troops leave the statehouses', P(lt, q('troops'), 0.5), { size: 4.6 });
  if (lt >= tC) {
    s += outline(Math.max(AX0, X('1865-05-29')), 617, X('1877-04-24'), 633, r);
    s += ring(X('1877-04-24'), 563, P(lt, q('troops'), 0.5), 3.4);
  }
  return s;
};

/* ---------- Scene 15: read it ---------- */
SCENES[15] = function (lt, q) {
  var k = smooth((lt - 0.2) / 1.1);
  var w = lerp(WW, 150, k),
    x = lerp(WX, 8, k),
    y = lerp(WY, 46, k);
  var s = appWindow(x, y, w, 'fit', 0);
  var lines = [
    ['Open it', q('open')],
    ['Follow the links', q('follow')],
    ['See where every date', q('see')],
  ];
  lines.forEach(function (l, i) {
    var a = P(lt, l[1], 0.5),
      ly = 44 + i * 13;
    s += rise(
      check(184, ly - 2.4, C.accent) +
        txt(192, ly, l[0], { size: 7.6, serif: true, anchor: 'start', weight: 700 }),
      a,
      4,
    );
  });
  s += G(
    txt(192, 44 + 2 * 13 + 8, 'comes from', {
      size: 7.6,
      serif: true,
      anchor: 'start',
      weight: 700,
    }),
    { o: P(lt, q('see'), 0.5) },
  );
  var e = P(lt, Math.min(q.end - 0.6, q('see') + 0.8), 0.8);
  s += rise(
    wordmark(242, 104, 9) +
      txt(242, 120, 'timescale.info/athan/us-civil-war', {
        size: 5.4,
        mono: true,
        fill: C.accent,
        weight: 600,
      }) +
      txt(242, 130, 'Free to read, no account needed', { size: 5.6, fill: C.text, weight: 600 }) +
      txt(242, 142, 'github.com/openchronology/timeline-app', {
        size: 5,
        mono: true,
        fill: C.soft,
        weight: 500,
      }),
    e,
    6,
  );
  return s;
};
