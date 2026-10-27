// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 21, Tour: The Great Depression, 1929–1941 (publicity/21-tour-the-great-depression.md):
   the economic-history sample (samples/great-depression.ochx) in the real editor, captured
   (shots.json), in a browser window, with the Archive look's callouts around the window, never
   over the app's own text: the whole slump, the business cycle as bands, the Crash down to the
   hour, the Dow's fall, the banking and world threads separated by tags, the Emergency Banking
   Act in the reader, the Hundred Days, the Second New Deal and the relapse of 1937, the farm
   thread, and the war that ended it. Scenes are pure functions of scene time lt; q("word") is
   when that word is said. */

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
/* Where a date falls in a captured frame: the editor draws a view's bounds from pixel 72 to
   1848. Dates are New York standard time (UTC−05:00), as the sample's display is. */
function ny(iso) {
  return Date.parse(iso.length === 10 ? iso + 'T00:00:00-05:00' : iso + ':00-05:00');
}
function V(a, b) {
  return [ny(a), ny(b)];
}
function dx(view, iso) {
  return 72 + ((ny(iso) - view[0]) / (view[1] - view[0])) * 1776;
}
/* The shots' views (as in shots.json). */
var FIT = V('1913-01-08', '1961-11-15'),
  CYCLE = V('1919-06-01', '1943-01-01'),
  AUTUMN = V('1929-08-28', '1929-11-18'),
  DAY = V('1929-10-24T08:00', '1929-10-24T16:00'),
  SLIDE = V('1929-08-01', '1933-03-01'),
  BANK = V('1929-06-01', '1934-06-01'),
  WORLD = V('1929-01-01', '1942-01-01'),
  HUNDRED = V('1933-02-25', '1933-07-15'),
  SECOND = V('1934-12-15', '1938-12-31'),
  WAR = V('1938-12-01', '1942-12-31');
/* Rows in the captured frame: the axis, and the duration bands under it (one per row). */
var AXIS = 564;
function bandY(row) {
  return 625 + row * 19.6;
}
/* In a separated frame: the upper track's axis and its bands. */
var UP_AXIS = 489;
function upBandY(row) {
  return 527 + row * 12;
}

/** The window rising into place at the start of a scene (or already there). */
function tourWindow(lt, id, st, rising) {
  var p = rising ? P(lt, 0.15, 0.9) : 1;
  return G(appWindow(WX, WY, WW, id, st), { o: p, ty: (1 - p) * 10 });
}
/** A brick outline around captured pixels (x0, y0)–(x1, y1), shown by p. */
function outline(x0, y0, x1, y1, p, o) {
  o = o || {};
  if (p <= 0.001) return '';
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
/** An outline around a band from date a to date b in view, on captured row y. */
function bandOutline(view, a, b, y, p, o) {
  o = o || {};
  var h = o.h || 7;
  return outline(Math.max(66, dx(view, a)), y - h, Math.min(1854, dx(view, b)), y + h, p, o);
}
/** A ring around a captured marker at (x, y). */
function ring(x, y, p, r) {
  if (p <= 0.001) return '';
  return (
    '<circle cx="' +
    px(x) +
    '" cy="' +
    py(y) +
    '" r="' +
    (r || 3.4) +
    '" fill="none" stroke="' +
    C.accent +
    '" stroke-width="0.8" opacity="' +
    p +
    '"/>'
  );
}
/** A ring that pulses once, from t. */
function pulse(x, y, lt, t) {
  var k = (lt - t) / 0.9;
  if (k < 0) return '';
  var out = k < 1 ? ring(x, y, 1 - k, 3.4 + 4 * k) : '';
  return out + ring(x, y, P(lt, t, 0.4));
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
/** A row of the left strip: a serif date over a name; dim (0–1) fades it. */
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
/** A big serif figure in the strip, with a small line under it. */
function figure(y, big, small, p, o) {
  o = o || {};
  return rise(
    txt(10, y, big, {
      size: o.size || 9,
      serif: true,
      fill: o.fill || C.accent,
      anchor: 'start',
      weight: 700,
    }) +
      (small
        ? txt(10, y + 7, small, { size: 4.8, fill: C.soft, anchor: 'start', weight: 600 })
        : ''),
    p,
    4,
  );
}
/** A callout under the window: a tick up to captured x, and a label. */
function underCallout(x, label, p, o) {
  o = o || {};
  var X = px(x),
    by = WY + WH;
  return G(
    '<path d="M' +
      X +
      ' ' +
      (by + 1) +
      'V' +
      (by + 4) +
      '" stroke="' +
      C.accent +
      '" stroke-width="0.7"/>' +
      txt(X, by + 10.5, label, {
        size: o.size || 5.4,
        mono: o.mono,
        serif: !o.mono,
        fill: o.fill || C.accent,
        weight: 600,
        anchor: o.anchor,
      }),
    { o: p, ty: (1 - p) * 3 },
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
/** The control and its tag in the strip. */
var SEP_BUTTON = [587, 41];
function separating(lt, tS, tTag, tagName) {
  var s = rise(chip(8, 30, 'Separate by tags', C.accent, { size: 5.2 }), P(lt, tS - 0.2, 0.5), 4);
  s += rise(chip(8, 44, tagName, C.accent, { size: 5.2, solid: true }), P(lt, tTag, 0.5), 4);
  return s;
}
function separatePointer(lt, tS) {
  return pointerTo(lt, 200, 110, px(SEP_BUTTON[0]), py(SEP_BUTTON[1]), tS);
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
/** Shot time for a separating shot: its zoom (0–zoomEnd s) plays from the scene's start,
    holds, and the separation (at sepAt s of the shot) lands on tS. */
function sepTime(lt, tS, zoomEnd, sepAt) {
  var lead = sepAt - zoomEnd;
  return lt < tS - lead ? Math.min(zoomEnd, lt) : sepAt + (lt - tS);
}

/* ---------- Scene 1: the whole slump ---------- */
SCENES[1] = function (lt, q) {
  var s = tourWindow(lt, 'whole', 0, true);
  var stats = [
    [121, 'moments', q(['hundred', '121'])],
    [35, 'durations', q(['thirty', '35'])],
    [40, 'links', q(['forty', '40'])],
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

/* ---------- Scene 2: the cycle as bands (zoom to 1919–1943) ---------- */
var CYCLE_ROWS = { gd: 2, contraction: 3, recovery: 6, recession: 6 };
SCENES[2] = function (lt, q) {
  var s = tourWindow(lt, 'cycle', lt - 0.3, false);
  var tG = q('depression'),
    tC = q('contraction'),
    tR = q('recovery'),
    tX = q('recession');
  s += stripRow(30, 'Aug 1929 – Dec 1941', 'The Great Depression', P(lt, tG, 0.5));
  var rows = [
    ['Aug 1929 – Mar 1933', 'Contraction', tC, '1929-08-01', '1933-03-01', CYCLE_ROWS.contraction],
    ['Mar 1933 – May 1937', 'Recovery', tR, '1933-03-01', '1937-05-01', CYCLE_ROWS.recovery],
    ['May 1937 – Jun 1938', 'Recession', tX, '1937-05-01', '1938-06-01', CYCLE_ROWS.recession],
  ];
  s += G(txt(10, 54, 'NBER business cycle', { size: 4.6, fill: C.soft, anchor: 'start' }), {
    o: P(lt, q('economists'), 0.5),
  });
  rows.forEach(function (r, i) {
    var a = P(lt, r[2], 0.5),
      next = i + 1 < rows.length ? rows[i + 1][2] : 1e9;
    var dim = P(lt, next, 0.5);
    s += stripRow(64 + i * 20, r[0], r[1], a, dim);
    s += bandOutline(CYCLE, r[3], r[4], bandY(r[5]), a * (1 - 0.6 * dim), { h: 6.5 });
  });
  s += bandOutline(
    CYCLE,
    '1929-08-01',
    '1941-12-07',
    bandY(CYCLE_ROWS.gd),
    P(lt, tG, 0.5) * (1 - P(lt, tC - 0.3, 0.5)),
    { h: 6.5 },
  );
  s += underCallout(
    (dx(CYCLE, '1929-08-01') + dx(CYCLE, '1933-03-01')) / 2,
    '43 months',
    P(lt, tC - 0.3, 0.5),
  );
  return s;
};

/* ---------- Scene 3: down to the hour ---------- */
var CRASH = { peak: '1929-09-03', plateau: '1929-10-15' };
SCENES[3] = function (lt, q) {
  // Shot time: the zoom into the autumn (0–4 s) plays from "zoom"; the zoom on into the week
  // (5–8 s) from "week", into the day (9–13 s) from "Thursday", and back out to the week
  // (14–16.5 s) from "Monday".
  var tZ = q('zoom') - 0.2,
    tW = q('week') - 0.6,
    tD = q('thursday') - 0.4,
    tM = q('monday') - 1.2;
  var st =
    lt < tW
      ? Math.min(4.5, lt - tZ)
      : lt < tD
        ? 5 + Math.min(3.5, lt - tW)
        : lt < tM
          ? 9 + Math.min(4.5, (lt - tD) * 1.0)
          : 14 + (lt - tM);
  var s = tourWindow(lt, 'crash', st, false);
  // Phase 1: the autumn.
  var ph2 = P(lt, tW, 0.5),
    ph3 = P(lt, tM, 0.5);
  var aut = [
    ['Sep 3, 1929', 'The Dow peaks: 381.17', q('peaks')],
    ['Oct 15', '“A permanently high plateau”', q('plateau')],
  ];
  aut.forEach(function (r, i) {
    s += G(stripRow(30 + i * 22, r[0], r[1], P(lt, r[2], 0.5)), { o: 1 - ph2 });
  });
  var inAutumn = (1 - P(lt, tW, 0.3)) * (lt > 4 + tZ ? 1 : 0);
  s += G(
    outline(
      dx(AUTUMN, CRASH.peak) - 92,
      400,
      dx(AUTUMN, CRASH.peak) + 92,
      446,
      P(lt, q('peaks'), 0.5),
    ) +
      outline(
        dx(AUTUMN, CRASH.plateau) - 106,
        465,
        dx(AUTUMN, CRASH.plateau) + 106,
        511,
        P(lt, q('plateau'), 0.5),
      ),
    { o: inAutumn },
  );
  // Phase 2: the day, hour by hour.
  var day = [
    ['10:00', 'The opening bell', q('bell'), '1929-10-24T10:00'],
    ['12:00', "The bankers' meeting", q('bankers'), '1929-10-24T12:00'],
    ['13:30', 'Whitney bids for Steel', q('bidding'), '1929-10-24T13:30'],
  ];
  s += G(
    txt(10, 30, 'Oct 24, 1929', {
      size: 5.6,
      serif: true,
      fill: C.accent,
      anchor: 'start',
      weight: 700,
    }) + txt(10, 37, 'Black Thursday', { size: 5.4, anchor: 'start', weight: 600 }),
    { o: ph2 * (1 - ph3) },
  );
  var inDay = lt > tD + 4 && lt < tM + 0.3 ? 1 : 0;
  day.forEach(function (r, i) {
    var a = P(lt, r[2], 0.5);
    s += G(stripRow(52 + i * 20, r[0], r[1], a), { o: 1 - ph3 });
    if (i) s += G(stripLink(52 + (i - 1) * 20, 52 + i * 20, a), { o: 1 - ph3 });
    s += G(ring(dx(DAY, r[3]), AXIS, a, 3.4), { o: inDay });
  });
  // New York time: the bounds caption reads UTC−05:00.
  var ny = P(lt, tD + 3.5, 0.6) * (1 - ph3);
  s += G(
    outline(170, 96, 262, 122, 1, { pad: 0.4, sw: 0.6 }) +
      arrowTo(px(560), px(272), py(109), ny) +
      txt(px(580), py(109) + 1.8, 'New York time', {
        size: 5.4,
        serif: true,
        fill: C.accent,
        anchor: 'start',
        weight: 700,
      }),
    { o: ny },
  );
  // Phase 3: Monday and Tuesday.
  s += G(
    txt(10, 30, 'Oct 28 – 29', {
      size: 5.6,
      serif: true,
      fill: C.accent,
      anchor: 'start',
      weight: 700,
    }) + txt(10, 37, 'Black Monday, Tuesday', { size: 5.4, anchor: 'start', weight: 600 }),
    { o: ph3 },
  );
  s += figure(56, '−23%', 'in two days', P(lt, q('quarter'), 0.5) * ph3, { size: 11 });
  return s;
};

/* ---------- Scene 4: peak to bottom ---------- */
SCENES[4] = function (lt, q) {
  var s = tourWindow(lt, 'slide', lt - 0.1, false);
  var tB = q('band'),
    tT = q('two'),
    tD = q(['89', 'eighty']);
  var o = P(lt, tT, 1.2);
  // The band drawn from end to end on "two years and ten months".
  var x0 = px(dx(SLIDE, '1929-09-03')),
    x1 = px(dx(SLIDE, '1932-07-08')),
    y = py(bandY(6) - 1);
  s += G(
    rect(x0 - 0.8, y - 1.8, (x1 - x0) * o + 1.6, 3.6, 'none', {
      rx: 1.2,
      stroke: C.accent,
      sw: 0.8,
    }),
    { o: P(lt, tB, 0.4) },
  );
  s += stripRow(30, 'Sep 3, 1929', 'The Dow peaks: 381.17', P(lt, tB, 0.5));
  s += stripRow(54, 'Jul 8, 1932', 'The bottom: 41.22', P(lt, q('july'), 0.5));
  s += stripLink(30, 54, P(lt, tT, 1));
  s += figure(84, '2 yr 10 mo', 'peak to bottom', P(lt, tT, 0.5), { size: 8 });
  s += figure(108, '−89%', 'the Dow’s fall', P(lt, tD, 0.5), { size: 12 });
  s += underCallout(dx(SLIDE, '1932-07-08'), '−89%', P(lt, tD, 0.5), { size: 6 });
  return s;
};

/* ---------- Scene 5: one thread, banking ---------- */
var PANICS = [
  ['Nov 1930 – Jan 1931', 'Nashville, New York', ['nashville'], '1930-11-01', '1931-01-31'],
  ['Apr – Aug 1931', 'Chicago', ['chicago'], '1931-04-01', '1931-08-31'],
  ['Sep – Oct 1931', 'After sterling', ['runs'], '1931-09-21', '1931-10-31'],
  ['Feb – Mar 1933', 'State after state', ['winter'], '1933-02-14', '1933-03-06'],
];
SCENES[5] = function (lt, q) {
  var tS = q('separate');
  var s = tourWindow(lt, 'banking', sepTime(lt, tS, 1.6, 2), false);
  s += separating(lt, tS, q('banking'), 'banking');
  var times = PANICS.map(function (p) {
    return q(p[2]);
  });
  PANICS.forEach(function (pn, i) {
    var a = P(lt, times[i], 0.5),
      next = i + 1 < times.length ? times[i + 1] : 1e9;
    var dim = P(lt, next, 0.5);
    s += stripRow(64 + i * 20, pn[0], pn[1], a, dim);
    s += bandOutline(BANK, pn[3], pn[4], upBandY(0), a * (1 - 0.55 * dim), { h: 5 });
  });
  return s + separatePointer(lt, tS);
};

/* ---------- Scene 6: the world ---------- */
var WORLD_STEPS = [
  ['May 1931', 'Vienna: Creditanstalt', ['austria'], '1931-05-11', 'Vienna'],
  ['Jul 1931', 'Berlin: the banks close', ['germany'], '1931-07-13', 'Berlin'],
  ['Sep 1931', 'London leaves gold', ['britain'], '1931-09-21', 'London'],
  ['Dec 1931', 'Tokyo leaves gold', ['japan'], '1931-12-13', 'Tokyo'],
  ['Jan 1933', 'Hitler chancellor', ['hitler'], '1933-01-30', null],
];
SCENES[6] = function (lt, q) {
  var tS = q('choose') + 0.4;
  var s = tourWindow(lt, 'world', sepTime(lt, tS, 1.6, 2), false);
  s += separating(lt, tS, q('world'), 'world');
  var line = '',
    shown = 0;
  WORLD_STEPS.forEach(function (w, i) {
    var t = q(w[2]),
      a = P(lt, t, 0.5);
    s += stripRow(64 + i * 18, w[0], w[1], a);
    s += ring(dx(WORLD, w[3]), UP_AXIS, a * (i < 4 ? 1 - P(lt, q('hitler'), 0.5) * 0.6 : 1), 2.6);
    if (w[4] && lt >= t) shown = i + 1;
  });
  // Vienna → Berlin → London → Tokyo, under the window, a stop at a time.
  var stops = WORLD_STEPS.slice(0, 4);
  var x = 160;
  stops.forEach(function (w, i) {
    var a = P(lt, q(w[2]), 0.5);
    var lbl = w[4];
    var wd = textWidth(lbl, 6, false);
    s += G(
      txt(x, WY + WH + 11, lbl, {
        size: 6,
        serif: true,
        fill: C.accent,
        anchor: 'start',
        weight: 700,
      }),
      { o: a, ty: (1 - a) * 2 },
    );
    x += wd + 4;
    if (i < 3) {
      var a2 = P(lt, q(stops[i + 1][2]) - 0.2, 0.4);
      s += arrowTo(x, x + 8, WY + WH + 9, a2);
      x += 12;
    }
  });
  return s + separatePointer(lt, tS);
};

/* ---------- Scene 7: read a law, follow its links ---------- */
/* The reader in the captured frame: the left edge of its text, and where its parts are. */
var READER = { edge: 329, notes: 450, sources: 560, related: 662, chat: [540, 767] };
SCENES[7] = function (lt, q) {
  var tO = q('open'),
    tClick = q('fireside') + 0.1;
  // Shot time: the act opens at 0.5 s and the fireside chat is chosen at 5 s; the shot waits
  // between them until the narration reaches the chat.
  var st =
    lt < tClick ? Math.min(4.8, 0.5 + Math.max(-0.5, lt - tO)) : 5 + Math.min(0.35, lt - tClick);
  var s = tourWindow(lt, 'reader', st, false);
  s += viewModeChip(8, 33, P(lt, 0.3, 0.5));
  var gone = 1 - P(lt, tClick, 0.4);
  var parts = [
    ['what it did', py(READER.notes), q('did')],
    ['where that comes from', py(READER.sources), q('comes')],
    ["what it's linked to", py(READER.related), q('linked')],
  ];
  var edge = px(READER.edge) - 1;
  parts.forEach(function (pt) {
    var a = P(lt, pt[2], 0.6);
    s += G(
      txt(10, pt[1] + 1.8, pt[0], { size: 5, anchor: 'start', weight: 600, serif: true }) +
        arrowTo(60, edge, pt[1], a),
      { o: a * gone },
    );
  });
  var facts = gone * (1 - P(lt, q('did') - 0.4, 0.4));
  s += G(
    figure(52, 'Mar 9, 1933', 'passed in a single day', P(lt, q('single'), 0.5), { size: 7 }) +
      figure(72, '5 days', 'after the inauguration', P(lt, q('five'), 0.5), { size: 7 }),
    { o: facts },
  );
  s += pointerTo(lt, px(1300), py(950), px(READER.chat[0]), py(READER.chat[1]), tClick);
  var after = P(lt, tClick + 0.4, 0.5);
  s += G(
    figure(56, 'Mar 12', 'the first fireside chat', 1, { size: 7 }) +
      figure(78, '3 days later', '', P(lt, q('three'), 0.5), { size: 7 }) +
      figure(104, 'Mar 13', 'the banks reopen', P(lt, q('reopened'), 0.5), { size: 7 }) +
      G(
        txt(10, 118, 'and the deposits', {
          size: 4.8,
          fill: C.text,
          anchor: 'start',
          weight: 600,
        }) + txt(10, 124.5, 'came back', { size: 4.8, fill: C.text, anchor: 'start', weight: 600 }),
        {
          o: P(lt, q('deposits'), 0.5),
        },
      ),
    { o: after },
  );
  return s;
};

/* ---------- Scene 8: the Hundred Days ---------- */
var HD = [
  ['Mar 31', 'Civilian Conservation Corps', ['civilian'], '1933-03-31'],
  ['May 12', 'Farm relief (and FERA)', ['farm'], '1933-05-12T12:30'],
  ['May 18', 'Tennessee Valley Authority', ['tennessee'], '1933-05-18'],
  ['Jun 16', 'The NRA', ['nra'], '1933-06-16T12:30'],
  ['Jun 16', 'Deposit insurance', ['deposit'], '1933-06-16T12:30'],
];
SCENES[8] = function (lt, q) {
  // The reader closes at 5.4 s of the shot and the view pans to the New Deal by 8 s.
  var s = tourWindow(lt, 'reader', Math.min(8.9, 5.25 + lt), false);
  var tB = q('band');
  s += bandOutline(HUNDRED, '1933-03-09', '1933-06-16', bandY(9), P(lt, tB, 0.6), { h: 6.5 });
  s += underCallout(
    (dx(HUNDRED, '1933-03-09') + dx(HUNDRED, '1933-06-16')) / 2,
    'Mar 9 – Jun 16, 1933',
    P(lt, tB, 0.5),
  );
  HD.forEach(function (h, i) {
    var t = q(h[2]),
      a = P(lt, t, 0.5),
      next = i + 1 < HD.length ? q(HD[i + 1][2]) : 1e9;
    var dim = P(lt, next, 0.5);
    s += stripRow(30 + i * 20, h[0], h[1], a, dim);
    if (i < 4) s += ring(dx(HUNDRED, h[3]), AXIS, a * (1 - 0.5 * dim), i % 2 ? 4.2 : 3.4);
  });
  return s;
};

/* ---------- Scene 9: the Second New Deal, and the relapse ---------- */
SCENES[9] = function (lt, q) {
  var s = tourWindow(lt, 'second', Math.min(4.4, lt * 1.3), false);
  var tBreak = q('breaks');
  var ph = P(lt, q('1937') - 0.3, 0.5);
  var rows = [
    ['May 1935', 'The WPA', q('wpa')],
    ['Jul 1935', 'The Wagner Act', q('wagner')],
    ['Aug 1935', 'Social Security', q('social')],
    ['May 1935', 'The Court ends the NRA', q('strikes')],
    ['Jul 1937', 'The court plan fails', q('fails')],
  ];
  rows.forEach(function (r, i) {
    s += G(stripRow(30 + i * 20, r[0], r[1], P(lt, r[2], 0.5)), { o: 1 - ph });
  });
  var inView = lt > 3.5 ? 1 : 0;
  s += G(
    ring(dx(SECOND, '1935-07-05'), AXIS, P(lt, q('wagner'), 0.5)) +
      ring(dx(SECOND, '1937-07-22'), AXIS, P(lt, q('fails'), 0.5)),
    { o: inView * (1 - ph) },
  );
  // The relapse: the recession band, then the two years' unemployment.
  s += G(
    stripRow(30, 'May 1937 – Jun 1938', 'Recession', 1) +
      figure(66, '14.3%', 'unemployed, 1937', P(lt, q(['14', 'fourteen']), 0.5), { size: 11 }) +
      figure(96, '19.0%', 'unemployed, 1938', P(lt, q(['19', 'nineteen']), 0.5), { size: 11 }),
    { o: ph },
  );
  s += bandOutline(SECOND, '1937-05-01', '1938-06-01', bandY(6), P(lt, tBreak, 0.5), { h: 6.5 });
  s += pulse(dx(SECOND, '1937-07-01'), AXIS, lt, q(['14', 'fourteen']));
  s += pulse(dx(SECOND, '1938-06-28'), AXIS, lt, q(['19', 'nineteen']));
  return s;
};

/* ---------- Scene 10: one thread, the farm ---------- */
SCENES[10] = function (lt, q) {
  var tS = q('farm') + 0.2;
  var s = tourWindow(lt, 'farm', sepTime(lt, tS, 2, 2.4), false);
  s += separating(lt, tS, q('farm'), 'farm');
  var rows = [
    ['1920', 'Farm prices fall', q('prices')],
    ['1930–1939', 'Drought: the Dust Bowl', q('drought')],
    ['Apr 14, 1935', 'Black Sunday', q('black')],
    ['Mar 1936', 'Migrant Mother', q('migrant')],
    ['Apr 14, 1939', 'The Grapes of Wrath', q('grapes')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(62 + i * 18, r[0], r[1], P(lt, r[2], 0.5));
  });
  s += stripLink(62 + 2 * 18, 62 + 4 * 18, P(lt, q('grapes') - 0.3, 0.8));
  // Nine years before: a bracket over the upper track from 1920 to the Crash.
  var b = P(lt, q('nine'), 0.9);
  var bx0 = px(dx(CYCLE, '1920-07-01')),
    bx1 = px(dx(CYCLE, '1929-10-29')),
    by = py(385);
  s += drawPath(
    'M' + bx0 + ' ' + (by + 2) + 'V' + by + 'H' + bx1 + 'V' + (by + 2),
    bx1 - bx0 + 4,
    b,
    'stroke="' + C.accent + '" stroke-width="0.7"',
  );
  s += G(
    txt((bx0 + bx1) / 2, by - 1.6, 'nine years before the Crash', {
      size: 4.8,
      serif: true,
      fill: C.accent,
      weight: 700,
    }),
    { o: b },
  );
  s += bandOutline(CYCLE, '1930-07-01', '1939-10-01', upBandY(0), P(lt, q('drought'), 0.5), {
    h: 5,
  });
  s += underCallout(
    (dx(CYCLE, '1930-07-01') + dx(CYCLE, '1939-10-01')) / 2,
    '1930–1939',
    P(lt, q('drought') + 0.3, 0.5),
  );
  return s + separatePointer(lt, tS);
};

/* ---------- Scene 11: the war, and the long way back ---------- */
SCENES[11] = function (lt, q) {
  var tOut = q('dow') - 0.4;
  var st = lt < tOut ? Math.min(3.4, lt * 1.2) : 3.5 + (lt - tOut);
  var s = tourWindow(lt, 'war', st, false);
  var ph = P(lt, tOut, 0.5);
  var rows = [
    ['Sep 1939', 'War in Europe', q('orders')],
    ['Mar 11, 1941', 'Lend-Lease', q('lend')],
    ['Dec 7, 1941', 'Pearl Harbor', q('pearl')],
  ];
  rows.forEach(function (r, i) {
    s += G(stripRow(30 + i * 20, r[0], r[1], P(lt, r[2], 0.5)), { o: 1 - ph });
  });
  s += G(
    figure(100, '1 in 4', '24.9% jobless, 1933', P(lt, q('worker'), 0.5), { size: 9 }) +
      figure(124, '< 1 in 20', '4.7% jobless, 1942', P(lt, q('fewer'), 0.5), { size: 9 }),
    { o: 1 - ph },
  );
  var inWar = (lt > 2.6 ? 1 : 0) * (1 - P(lt, tOut, 0.3));
  s += G(
    ring(dx(WAR, '1939-09-01'), AXIS, P(lt, q('orders'), 0.5)) +
      ring(dx(WAR, '1941-03-11'), AXIS, P(lt, q('lend'), 0.5)) +
      ring(dx(WAR, '1941-12-07'), AXIS, P(lt, q('pearl'), 0.5)) +
      underCallout(dx(WAR, '1941-12-07'), 'the band ends', P(lt, q('pearl') + 0.4, 0.5)),
    { o: inWar },
  );
  // Then the whole line: the Dow below its 1929 peak, to November 1954.
  var e = P(lt, q('1954') - 0.6, 0.6);
  s += G(
    stripRow(30, 'Sep 1929 – Nov 1954', 'The Dow below its peak', 1) +
      figure(66, '25 years', 'to regain 381.17', e, { size: 9 }),
    { o: ph },
  );
  s += bandOutline(FIT, '1929-09-03', '1954-11-23', bandY(0), e, { h: 6.5 });
  s += underCallout(dx(FIT, '1954-11-23'), 'Nov 1954', e);
  return s;
};

/* ---------- Scene 12: read it, or make your own ---------- */
SCENES[12] = function (lt, q) {
  var k = smooth((lt - 0.2) / 1.1);
  var w = lerp(WW, 150, k),
    x = lerp(WX, 8, k),
    y = lerp(WY, 46, k);
  var s = appWindow(x, y, w, 'whole', 0);
  var lines = [
    ['Open it', q('open')],
    ['Follow the links', q('follow')],
    ['Build one of your own', q('build')],
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
  var e = P(lt, Math.min(q.end - 0.8, q('build') + 0.8), 0.8);
  s += rise(
    wordmark(242, 102, 9) +
      txt(242, 118, 'timescale.info/athan/great-depression', {
        size: 5.4,
        mono: true,
        fill: C.accent,
        weight: 600,
      }) +
      txt(242, 128, 'Free to read, no account needed', { size: 5.6, fill: C.text, weight: 600 }) +
      txt(242, 140, 'github.com/openchronology/timeline-app', {
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
