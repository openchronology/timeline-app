// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 15, Tour: Ancient Egypt, from Narmer to Cleopatra (publicity/15-tour-ancient-egypt.md):
   the Egypt sample in the real editor, captured (shots.json), in a browser window, with the
   Archive look's callouts around the window, never over the app's own text: the whole sweep,
   one named chronology and the Second Intermediate Period's split, the pyramid age, a moment
   read with its date precision, two overlapping reigns, Kadesh and the treaty, the writings
   separated into their own track, the Rosetta decree's Julian date, Cleopatra's last weeks,
   and one zoom out to show she lived closer to the Moon landing than to the Great Pyramid.
   Scenes are pure functions of scene time lt; q("word") is when that word is said. */

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
/** A short arrow from (x0, y) to (x1, y), drawn to p, with its head at x1. */
function arrowTo(x0, x1, y, p, col) {
  col = col || C.accent;
  var x = lerp(x0, x1, p);
  if (p <= 0.01) return '';
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
/** A ring of the selection colour around a captured pixel (cx, cy), r stage units, drawn to p. */
function ring(cx, cy, r, p) {
  if (p <= 0.01) return '';
  return (
    '<circle cx="' +
    px(cx) +
    '" cy="' +
    py(cy) +
    '" r="' +
    r * lerp(1.6, 1, p) +
    '" fill="none" stroke="' +
    C.select +
    '" stroke-width="0.9" opacity="' +
    p.toFixed(3) +
    '"/>'
  );
}
/** An outline of the selection colour around captured pixels x0–x1, y0–y1, drawn to p. */
function outline(x0, y0, x1, y1, p) {
  if (p <= 0.01) return '';
  var x = px(x0) - 0.8,
    y = py(y0) - 0.8,
    w = px(x1) - px(x0) + 1.6,
    h = py(y1) - py(y0) + 1.6;
  return drawPath(
    'M' + x + ' ' + y + 'h' + w + 'v' + h + 'h' + -w + 'z',
    2 * (w + h),
    p,
    'stroke="' + C.select + '" stroke-width="0.9" stroke-linejoin="round"',
  );
}
/** The pointer moving to (x, y) from (fx, fy), arriving at tA, pressing at tP. */
function pointerTo(lt, fx, fy, x, y, tA, tP, tGone) {
  var m = smooth((lt - (tA - 1.1)) / 1.1);
  var s = pointer(lerp(fx, x, m), lerp(fy, y, m), {
    o: Math.min(P(lt, tA - 1.3, 0.3), 1 - P(lt, tGone, 0.4)),
  });
  var press = clamp01((lt - tP) / 0.5);
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
/** A legend row: a swatch of the bands' colour and its name. */
function legendRow(y, col, name, p) {
  return rise(
    rect(10, y - 3.6, 9, 4, col, { rx: 1 }) +
      txt(23, y, name, { size: 5.4, anchor: 'start', weight: 600 }),
    p,
    4,
  );
}
/** Callouts to the reader's left edge (captured x `edge`), at captured heights. */
function readerCallouts(lt, edge, parts, gone) {
  var s = '';
  parts.forEach(function (pt) {
    var a = P(lt, pt[2], 0.6);
    s += G(
      txt(10, py(pt[1]) + 1.8, pt[0], { size: 5, anchor: 'start', weight: 600, serif: true }) +
        arrowTo(pt[3] || 50, px(edge) - 1, py(pt[1]), a),
      { o: a * (gone === undefined ? 1 : gone) },
    );
  });
  return s;
}

/* Scene 1: the whole sweep, with what the sample holds. */
SCENES[1] = function (lt, q) {
  var s = tourWindow(lt, 'sweep', lt, true);
  var stats = [
    ['92', 'moments', q('moments')],
    ['81', 'durations', q('bands')],
    ['57', 'links', q('linked')],
  ];
  stats.forEach(function (st, i) {
    var y = 40 + i * 26,
      a = P(lt, st[2], 0.5);
    s += pop(
      txt(10, y, st[0], { size: 13, serif: true, fill: C.accent, anchor: 'start', weight: 600 }) +
        txt(10, y + 7.5, st[1], { size: 5.6, fill: C.soft, anchor: 'start', weight: 600 }),
      a,
      18,
      y - 4,
    );
  });
  return s;
};

/* Scene 2: the zoom to 1820–1500 BCE; the legend, the chronology, and where Egypt split. */
SCENES[2] = function (lt, q) {
  var tZ = 0.4;
  var settle = tZ + 4.6;
  var leg = txt(10, 34, 'the bands', { size: 4.6, fill: C.soft, anchor: 'start', weight: 500 });
  var s =
    tourWindow(lt, 'split', lt - tZ, false) +
    G(leg, { o: P(lt, settle - 0.6, 0.5) }) +
    legendRow(44, '#1f3a5f', 'periods', P(lt, settle - 0.4, 0.5)) +
    legendRow(54, '#8a8f99', 'dynasties', P(lt, settle - 0.2, 0.5)) +
    legendRow(64, '#b08a4a', 'reigns', P(lt, settle, 0.5));
  // The book card: the one chronology the timeline follows.
  var b = P(lt, q('oxford'), 0.6);
  s += rise(
    card(8, 76, 62, 44, {}) +
      txt(12, 85, 'Dates', { size: 4.8, fill: C.soft, anchor: 'start', weight: 600 }) +
      txt(12, 93, 'Shaw (ed.),', { size: 5.2, serif: true, anchor: 'start', weight: 600 }) +
      txt(12, 100, 'The Oxford History', {
        size: 5.2,
        serif: true,
        italic: true,
        anchor: 'start',
        weight: 600,
      }) +
      txt(12, 106.5, 'of Ancient Egypt', {
        size: 5.2,
        serif: true,
        italic: true,
        anchor: 'start',
        weight: 600,
      }) +
      txt(12, 114, '2000', { size: 5, serif: true, fill: C.accent, anchor: 'start', weight: 600 }),
    b,
    5,
  );
  // A bracket under the dynasty bands that run at once, inside the window.
  var k = P(lt, q('split'), 0.9);
  var bx0 = px(SPLIT_X0),
    bx1 = px(SPLIT_X1),
    by = py(SPLIT_Y);
  s += drawPath(
    'M' + bx0 + ' ' + (by - 2) + 'V' + by + 'H' + bx1 + 'V' + (by - 2),
    bx1 - bx0 + 4,
    k,
    'stroke="' + C.select + '" stroke-width="0.9"',
  );
  return s;
};
/* The Second Intermediate Period's dynasties in the split shot's last frame (captured x). */
var SPLIT_X0 = 1015,
  SPLIT_X1 = 1570,
  SPLIT_Y = 672;

/* Scene 3: back and into the Old Kingdom: the pyramids, and the arcs between them, in turn. */
var PYR = {
  axis: 564,
  step: 296,
  dahshur: 579,
  great: 721,
  sphinx: 790,
  djoser: [297, 657, 375, 671],
};
/** The app's arc between captured x a and b (relationships.ts arcPath, at the capture's 1.5
    scale), traced in the selection colour to p. */
function arcOver(a, b, p) {
  if (p <= 0.01) return '';
  var lift = 1.5 * Math.min(150, 18 + (0.3 * Math.abs(b - a)) / 1.5);
  var d =
    'M' +
    px(a) +
    ' ' +
    py(PYR.axis) +
    'Q' +
    px((a + b) / 2) +
    ' ' +
    py(PYR.axis - 2 * lift) +
    ' ' +
    px(b) +
    ' ' +
    py(PYR.axis);
  return drawPath(
    d,
    px(b) - px(a) + (2 * lift * WH) / 1080,
    p,
    'stroke="' + C.select + '" stroke-width="1.1"',
  );
}
SCENES[3] = function (lt, q) {
  var tZ = q('zoom') - 0.2;
  // The shot's 4.5 s zoom, played a little faster so it settles as the Step Pyramid is named.
  var s = tourWindow(lt, 'pyramids', (lt - tZ) * 1.4, false);
  var rows = [
    ['about 2667 BCE', 'Step Pyramid', q('step')],
    ['about 2600 BCE', 'Dahshur', q('sneferu')],
    ['about 2566 BCE', 'Great Pyramid', q('khufu')],
    ['about 2550 BCE', 'the Sphinx', q('sphinx')],
  ];
  var y0 = 34,
    pitch = 22;
  rows.forEach(function (r, i) {
    var a = P(lt, r[2], 0.5);
    s += stripRow(y0 + i * pitch, r[0], r[1], a);
    if (i)
      s += drawPath(
        'M7 ' + (y0 + (i - 1) * pitch + 9) + 'V' + (y0 + i * pitch - 5),
        pitch - 14,
        a,
        'stroke="' + C.arc + '" stroke-width="0.7"',
      );
  });
  // In the window: Djoser's reign, then the arcs from the Step Pyramid to Dahshur to Giza.
  var fade = (1 - P(lt, q('century') + 1.2, 0.6)) * P(lt, tZ + 4.5 / 1.4, 0.3);
  s += G(
    outline(PYR.djoser[0], PYR.djoser[1], PYR.djoser[2], PYR.djoser[3], P(lt, q('step'), 0.8)) +
      arcOver(PYR.step, PYR.dahshur, P(lt, q('sneferu'), 1)) +
      arcOver(PYR.dahshur, PYR.great, P(lt, q('khufu'), 1)) +
      ring(PYR.sphinx, PYR.axis, 3.2, P(lt, q('sphinx'), 0.6)),
    { o: fade },
  );
  var c = P(lt, q('century'), 0.6);
  s += rise(
    card(8, 124, 62, 22, {}) +
      txt(39, 133, 'a little over', { size: 4.8, fill: C.soft, weight: 500 }) +
      txt(39, 141, 'a century', { size: 7, serif: true, fill: C.accent, weight: 700 }),
    c,
    4,
  );
  return s;
};

/* Scene 4: Khufu's reign up close; the Diary of Merer in the reader, and how sure its date is. */
var MERER = { edge: 285, notes: 450, precision: 563, related: 763, open: 4.2 };
SCENES[4] = function (lt, q) {
  // The shot's zoom plays from the scene's start; the reader opens on "Merer".
  var tO = q('diary');
  var st =
    lt < tO ? Math.min(3.6, (lt * 3.6) / Math.max(1, tO - 0.3)) : MERER.open - 0.1 + (lt - tO);
  var s = tourWindow(lt, 'merer', Math.max(0, st), false);
  var vm = P(lt, 0.3, 0.5);
  s += rise(
    rect(8, 28, 12, 6.4, C.accent, { rx: 3.2 }) +
      '<circle cx="16.8" cy="31.2" r="2.4" fill="' +
      C.card +
      '"/>' +
      txt(24, 33.2, 'View mode', { size: 5.6, anchor: 'start', weight: 600 }),
    vm,
    4,
  );
  s += readerCallouts(lt, MERER.edge, [
    ['what it was', MERER.notes, q('logbook')],
    ['Date precision', MERER.precision, q('sure')],
    ['linked to', MERER.related, q('later')],
  ]);
  s += outline(318, 545, 1560, 602, P(lt, q('sure'), 0.9));
  var e = P(lt, q('estimate'), 0.6);
  s += rise(
    txt(10, 140, 'every early date:', { size: 4.8, fill: C.soft, anchor: 'start', weight: 500 }) +
      txt(10, 148, 'an estimate', {
        size: 7,
        serif: true,
        fill: C.accent,
        anchor: 'start',
        weight: 700,
      }),
    e,
    4,
  );
  return s;
};

/* Scene 5: the New Kingdom: Thutmose III's reign, and Hatshepsut's inside it. */
var NK = {
  hatshepsut: [562, 677, 893, 691],
  thutmose: [428, 657, 1625, 671],
};
SCENES[5] = function (lt, q) {
  var s = tourWindow(lt, 'empire', lt - 0.2, false);
  var h = P(lt, q('hatshepsut'), 0.9),
    t = P(lt, q('thutmose'), 0.9);
  s += outline(NK.hatshepsut[0], NK.hatshepsut[1], NK.hatshepsut[2], NK.hatshepsut[3], h);
  s += outline(NK.thutmose[0], NK.thutmose[1], NK.thutmose[2], NK.thutmose[3], t);
  s += stripRow(32, '1473–1458 BCE', 'Hatshepsut', h);
  s += stripRow(50, '1479–1425 BCE', 'Thutmose III', t);
  var rows = [
    ['about 1471 BCE', 'Punt', q('punt')],
    ['about 1457 BCE', 'Megiddo', q('megiddo')],
    ['about 1435 BCE', 'images erased', q('images')],
  ];
  s += G('<path d="M8 70H68" stroke="' + C.line + '" stroke-width="0.6"/>', {
    o: P(lt, q('punt'), 0.5),
  });
  rows.forEach(function (r, i) {
    s += stripRow(82 + i * 20, r[0], r[1], P(lt, r[2], 0.5));
  });
  return s;
};

/* Scene 6: Ramesses II's reign; Kadesh in the reader, then the treaty it links to. */
var KAD = { edge: 285, related: 734, treaty: [500, 791], open: 3.8, click: 7 };
SCENES[6] = function (lt, q) {
  var tO = q('open'),
    tF = q('follow'),
    tClick = tF + 0.8;
  var st = Math.min(KAD.click - 0.2, KAD.open + (lt - tO));
  var s = tourWindow(lt, 'kadesh', Math.max(0, st), false);
  var x = P(lt, tClick, 0.45);
  if (x > 0)
    s += G(appWindow(WX, WY, WW, 'kadesh', KAD.click + 0.1 + Math.max(0, lt - tClick)), { o: x });
  var r = P(lt, q('66'), 0.6);
  s += rise(
    txt(10, 38, '66 years', {
      size: 9,
      serif: true,
      fill: C.accent,
      anchor: 'start',
      weight: 700,
    }) +
      txt(10, 46, 'Ramesses II', { size: 5.4, anchor: 'start', weight: 600 }) +
      txt(10, 53, '1279–1213 BCE', { size: 4.8, serif: true, fill: C.soft, anchor: 'start' }),
    r,
    4,
  );
  var gone = 1 - P(lt, tClick, 0.4);
  s += readerCallouts(
    lt,
    KAD.edge,
    [
      ['his reign', KAD.related, q('his')],
      ['the treaty', KAD.treaty[1], q('treaty')],
    ],
    gone,
  );
  s += pointerTo(
    lt,
    px(1300),
    py(950),
    px(KAD.treaty[0]),
    py(KAD.treaty[1]),
    tF + 0.6,
    tClick,
    tClick + 0.8,
  );
  var k = P(lt, tClick + 0.4, 0.6);
  s += rise(
    txt(10, 126, 'read on:', { size: 4.8, fill: C.soft, anchor: 'start', weight: 500 }) +
      txt(10, 134, 'the treaty', { size: 6.6, serif: true, anchor: 'start', weight: 700 }) +
      txt(10, 141, 'about 1259 BCE', { size: 4.8, serif: true, fill: C.accent, anchor: 'start' }),
    k,
    4,
  );
  return s;
};

/* Scene 7: Separate by tags, writing: the record in a track of its own. */
SCENES[7] = function (lt, q) {
  var tS = q('separate');
  var s = tourWindow(lt, 'writing', lt - tS + 0.4, false);
  var ptr = pointerTo(
    lt,
    200,
    110,
    px(SEP_BUTTON[0]),
    py(SEP_BUTTON[1]),
    tS - 0.3,
    tS - 0.3,
    tS + 1.2,
  );
  s += rise(chip(8, 30, 'Separate by tags', C.accent, { size: 5.2 }), P(lt, tS - 0.2, 0.5), 4);
  s += rise(
    chip(8, 44, 'writing', C.accent, { size: 5.2, solid: true }),
    P(lt, q('writing'), 0.5),
    4,
  );
  var list = [
    ['labels at Abydos', q('labels')],
    ['the Narmer Palette', q('narmer')],
    ["the Palermo Stone's annals", q('palermo')],
    ['the Pyramid Texts', q('pyramid')],
    ['the Story of Sinuhe', q('story')],
    ['letters and treaties', q('letters')],
    ['Manetho', q('manetho')],
  ];
  list.forEach(function (r, i) {
    var y = 62 + i * 13;
    s += rise(
      '<circle cx="11" cy="' +
        (y - 1.8) +
        '" r="1.4" fill="' +
        C.moment +
        '"/>' +
        txt(15, y, r[0], { size: 5.2, anchor: 'start', weight: 600 }),
      P(lt, r[1], 0.5),
      3,
    );
  });
  return s + ptr;
};
var SEP_BUTTON = [587, 41];

/* Scene 8: the Rosetta Stone's decree, dated to the day in its own calendar. */
var ROS = { edge: 285, hist: 562, cal: 595, open: 0.6 };
SCENES[8] = function (lt, q) {
  var s = tourWindow(lt, 'rosetta', lt - q('rosetta') + ROS.open + 0.1, false);
  var d = P(lt, q('27'), 0.6);
  s += rise(
    txt(10, 36, 'the source gives', { size: 4.8, fill: C.soft, anchor: 'start', weight: 500 }) +
      txt(10, 45, '27 March 196 BCE', {
        size: 6.4,
        serif: true,
        fill: C.accent,
        anchor: 'start',
        weight: 700,
      }),
    d,
    4,
  );
  s += readerCallouts(lt, ROS.edge, [
    ['Historical dates', (ROS.hist + ROS.cal) / 2, q('historical')],
  ]);
  s += rise(
    txt(10, 53, 'in the Julian calendar', { size: 5.2, anchor: 'start', weight: 600 }),
    P(lt, q('julian'), 0.6),
    4,
  );
  s += outline(318, 545, 760, 612, P(lt, q('historical'), 0.9));
  var o = P(lt, q('own'), 0.6);
  s += rise(
    txt(10, 132, "the timeline's own", { size: 4.8, fill: C.soft, anchor: 'start', weight: 500 }) +
      txt(10, 141, '196-03 BCE', { size: 6.4, mono: true, anchor: 'start', weight: 600 }),
    o,
    4,
  );
  return s;
};

/* Scene 9: Cleopatra VII's reign, then on to the day the bands end. */
SCENES[9] = function (lt, q) {
  // The shot zooms to 72–27 BCE in its first 3 s, holds, then zooms on (5.5–9 s) from "August".
  var tA = q('august') - 0.3;
  var st = lt < 3 ? lt : lt < tA ? 3 + Math.min(2.5, (lt - 3) * 0.2) : 5.5 + (lt - tA);
  var s = tourWindow(lt, 'cleopatra', st, false);
  var rows = [
    ['51 BCE', 'queen', q('throne')],
    ['48–44 BCE', 'Caesar', q('caesar')],
    ['41–31 BCE', 'Antony', q('antony')],
    ['2 Sep 31 BCE', 'Actium', q('actium')],
    ['1 Aug 30 BCE', 'Alexandria falls', q('falls')],
    ['Aug 30 BCE', 'her death', q('dead')],
    ['30 BCE', 'a Roman province', q('roman')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(30 + i * 17.5, r[0], r[1], P(lt, r[2], 0.5));
  });
  return s;
};

/* Scene 10: zoom out on the same scale to 2010 CE; two brackets and the 1969 pin. */
var MOON = { pyramid: 125, cleo: 1080, apollo: 1833, axis: 564 };
SCENES[10] = function (lt, q) {
  var k = smooth(lt / 0.8);
  var y = lerp(WY, 10, k);
  var s = appWindow(WX, y, WW, 'moon', lt - 0.2);
  var bottom = y + WH;
  function bx(c) {
    return WX + (c / 1920) * WW;
  }
  var gp = bx(MOON.pyramid),
    cl = bx(MOON.cleo),
    ap = bx(MOON.apollo);
  var a = P(lt, q('closer') - 0.6, 1.0),
    b = P(lt, q('moon') - 0.2, 1.0);
  var y1 = bottom + 4;
  s += drawPath(
    'M' + gp + ' ' + (y1 - 2) + 'V' + y1 + 'H' + cl + 'V' + (y1 - 2),
    cl - gp + 4,
    a,
    'stroke="' + C.soft + '" stroke-width="0.8"',
  );
  s += G(
    txt((gp + cl) / 2, y1 + 7, 'Great Pyramid → Cleopatra: about 2,540 years', {
      size: 5,
      serif: true,
      fill: C.text,
    }),
    { o: P(lt, q('closer') + 0.2, 0.5) },
  );
  s += drawPath(
    'M' + cl + ' ' + (y1 + 10) + 'V' + (y1 + 12) + 'H' + ap + 'V' + (y1 + 10),
    ap - cl + 4,
    b,
    'stroke="' + C.accent + '" stroke-width="0.8"',
  );
  s += G(
    txt((cl + ap) / 2, y1 + 19, 'Cleopatra → Apollo 11: 1,998 years', {
      size: 5,
      serif: true,
      fill: C.accent,
    }),
    { o: P(lt, q('moon') + 0.4, 0.5) },
  );
  // The pin, ours, at 1969 on the ruler.
  var pin = P(lt, q('pyramid') + 0.3, 0.6);
  var pyy = y + (MOON.axis / 1080) * WH;
  s += G(
    '<path d="M' +
      ap +
      ' ' +
      (pyy - 2) +
      'V' +
      (pyy - 14) +
      '" stroke="' +
      C.accent +
      '" stroke-width="0.8"/>' +
      '<circle cx="' +
      ap +
      '" cy="' +
      (pyy - 15) +
      '" r="2" fill="' +
      C.accent +
      '"/>' +
      txt(ap - 3, pyy - 24, 'Apollo 11, 1969', {
        size: 5,
        serif: true,
        anchor: 'end',
        fill: C.accent,
        weight: 700,
      }) +
      txt(ap - 3, pyy - 18.5, '(not on this timeline)', {
        size: 4.4,
        anchor: 'end',
        fill: C.soft,
        weight: 500,
      }),
    { o: pin, ty: (1 - pin) * -6 },
  );
  return s;
};

/* Scene 11: the window steps aside for what a class can do; the end card. */
function linkIcon(x, y) {
  var st = 'fill="none" stroke="' + C.accent + '" stroke-width="1.1"';
  return (
    '<rect x="' +
    (x - 6) +
    '" y="' +
    (y - 2.4) +
    '" width="7" height="4.8" rx="2.4" ' +
    st +
    '/>' +
    '<rect x="' +
    (x - 1) +
    '" y="' +
    (y - 2.4) +
    '" width="7" height="4.8" rx="2.4" ' +
    st +
    '/>'
  );
}
SCENES[11] = function (lt, q) {
  var k = smooth((lt - 0.2) / 1.1);
  var w = lerp(WW, 150, k),
    x = lerp(WX, 8, k),
    y = lerp(10, 46, k);
  var s = appWindow(x, y, w, 'moon', 99);
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
      'a period, a dynasty, a unit',
      q('build'),
      function (cx, cy) {
        return G(ICON.person(cx - 4, cy + 1, C.soft) + ICON.person(cx + 4, cy + 1, C.accent), {
          s: 0.55,
          cx: cx,
          cy: cy,
        });
      },
    ],
    [
      'Share it',
      'a link, or embedded in your class page',
      q('share'),
      function (cx, cy) {
        return linkIcon(cx, cy);
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
      txt(160, 96, 'timescale.info/athan/ancient-egypt', {
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
