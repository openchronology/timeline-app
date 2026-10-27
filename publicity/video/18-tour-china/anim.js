// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 18, Tour: China, from the Neolithic to 1949 (publicity/18-tour-china.md): the China
   sample in the real editor, captured (shots.json), in a browser window, with the Archive look's
   callouts around the window, never over the app's own text: the whole sweep, the zoom to where
   the dates begin and 841 BCE in the reader, the Zhou's eight centuries and the Qin's fifteen
   years, the ideas separated into a track, the Records of the Grand Historian read, the
   centuries of division, the inventions and the Diamond Sutra's two calendars, the Yuan and the
   Ming, and the last emperors to 1949. Scenes are pure functions of scene time lt; q("word") is
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
/** The window rising into place at the start of a scene (or already there). */
function tourWindow(lt, id, st, rising) {
  var p = rising ? P(lt, 0.15, 0.9) : 1;
  return G(appWindow(WX, WY, WW, id, st), { o: p, ty: (1 - p) * 10 });
}
/** What's drawn over the window, clipped to it. */
var CLIP =
  '<clipPath id="win"><rect x="' +
  WX +
  '" y="' +
  WY +
  '" width="' +
  WW +
  '" height="' +
  WH +
  '"/></clipPath>';
function clipped(inner) {
  return CLIP + '<g clip-path="url(#win)">' + inner + '</g>';
}

/* Time on the captured line. The editor draws a view's span across captured x 72–1848. */
/** A date as a decimal astronomical year (−220 for 221 BCE). */
function yr(y, m, d) {
  return (y < 0 ? y + 1 : y) + ((m || 1) - 1) / 12 + ((d || 1) - 1) / 365;
}
function V(a, b) {
  return [yr.apply(null, a), yr.apply(null, b)];
}
/** Captured x of decimal year t in view v. */
function cx(t, v) {
  return 72 + ((t - v[0]) / (v[1] - v[0])) * 1776;
}
/** The view part p of the way along a linear pan from v0 to v1. */
function pan(v0, v1, p) {
  p = clamp01(p);
  return [lerp(v0[0], v1[0], p), lerp(v0[1], v1[1], p)];
}
/* The shots' views (as in shots.json). */
var FIT = V([-5600], [2060]),
  ZHOU = V([-1100], [50]),
  THOUGHT = V([-800], [2010]),
  DIV0 = V([-350], [850]),
  DIV = V([-250], [950]),
  INV = V([-400], [1200]),
  MING0 = V([1240], [1440]),
  MING = V([1260], [1460]),
  QING0 = V([1815], [1940]),
  QING = V([1830], [1955]),
  Y1912 = V([1911, 9, 1], [1912, 4, 1]);
/* Captured rows: the axis, and the first, second and third rows of bands under it. */
var AXIS = 564,
  ROW = [625, 645, 664];

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
/** A ring of the selection colour around a captured pixel (x, y), r stage units, drawn to p. */
function ring(x, y, r, p) {
  if (p <= 0.01) return '';
  return (
    '<circle cx="' +
    px(x) +
    '" cy="' +
    py(y) +
    '" r="' +
    r * lerp(1.6, 1, p) +
    '" fill="none" stroke="' +
    C.select +
    '" stroke-width="0.9" opacity="' +
    p.toFixed(3) +
    '"/>'
  );
}
/** An outline of the selection colour around captured pixels x0–x1, y0–y1, drawn to p (or to
    p[0] at opacity p[1], as pulse gives it). */
function outline(x0, y0, x1, y1, p) {
  var o = 1;
  if (Array.isArray(p)) {
    o = p[1];
    p = p[0];
  }
  if (p <= 0.01) return '';
  var x = px(x0) - 0.8,
    y = py(y0) - 0.8,
    w = px(x1) - px(x0) + 1.6,
    h = py(y1) - py(y0) + 1.6;
  return drawPath(
    'M' + x + ' ' + y + 'h' + w + 'v' + h + 'h' + -w + 'z',
    2 * (w + h),
    p,
    'stroke="' +
      C.select +
      '" stroke-width="0.9" stroke-linejoin="round" opacity="' +
      o.toFixed(3) +
      '"',
  );
}
/** An outline around a band of row r, from decimal year a to b in view v. */
function bandOutline(a, b, r, v, p) {
  return outline(Math.max(72, cx(a, v)), ROW[r] - 8, Math.min(1848, cx(b, v)), ROW[r] + 8, p);
}
/** A pulse, for outline: it draws, then fades back to a faint trace. */
function pulse(lt, t0) {
  return [P(lt, t0, 0.6), 1 - 0.6 * P(lt, t0 + 1.4, 0.8)];
}
/** A bracket over captured x0–x1 at captured y, opening downward, with its label above. */
function bracket(x0, x1, y, p, label, col) {
  if (p <= 0.01) return '';
  col = col || C.accent;
  var a = px(x0),
    b = px(x1),
    yy = py(y);
  return (
    drawPath(
      'M' + a + ' ' + (yy + 2.4) + 'V' + yy + 'H' + b + 'V' + (yy + 2.4),
      b - a + 5,
      p,
      'stroke="' + col + '" stroke-width="0.9"',
    ) +
    G(txt((a + b) / 2, yy - 2.6, label, { size: 5.2, serif: true, fill: col, weight: 700 }), {
      o: P(p, 0.5, 0.5),
    })
  );
}
/** The app's arc between captured x a and b (relationships.ts arcPath, at the capture's 1.5
    scale), traced in the selection colour to p. */
function arcOver(a, b, p) {
  if (p <= 0.01) return '';
  var lift = 1.5 * Math.min(150, 18 + (0.3 * Math.abs(b - a)) / 1.5);
  var d =
    'M' +
    px(a) +
    ' ' +
    py(AXIS) +
    'Q' +
    px((a + b) / 2) +
    ' ' +
    py(AXIS - 2 * lift) +
    ' ' +
    px(b) +
    ' ' +
    py(AXIS);
  return drawPath(
    d,
    px(b) - px(a) + (2 * lift * WH) / 1080,
    p,
    'stroke="' + C.select + '" stroke-width="1.1"',
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
/** Callouts to the reader's left edge (captured x `edge`), at captured heights. */
function readerCallouts(lt, edge, parts, gone) {
  var s = '';
  parts.forEach(function (pt) {
    var a = P(lt, pt[2], 0.6);
    s += G(
      txt(10, py(pt[1]) + 1.8, pt[0], { size: 5, anchor: 'start', weight: 600, serif: true }) +
        arrowTo(pt[3] || 52, px(edge) - 1, py(pt[1]), a),
      { o: a * (gone === undefined ? 1 : gone) },
    );
  });
  return s;
}
/** The View mode switch, on, in the left strip. */
function viewModeChip(y, p) {
  return rise(
    rect(8, y, 12, 6.4, C.accent, { rx: 3.2 }) +
      '<circle cx="16.8" cy="' +
      (y + 3.2) +
      '" r="2.4" fill="' +
      C.card +
      '"/>' +
      txt(24, y + 5.2, 'View mode', { size: 5.6, anchor: 'start', weight: 600 }),
    p,
    4,
  );
}
/** A small note in the left strip: a soft line over a serif one. */
function note(y, a, b, p) {
  return rise(
    txt(10, y, a, { size: 4.8, fill: C.soft, anchor: 'start', weight: 500 }) +
      txt(10, y + 7.6, b, { size: 6, serif: true, fill: C.accent, anchor: 'start', weight: 700 }),
    p,
    4,
  );
}

/* Scene 1: the whole sweep, with what the sample holds. */
SCENES[1] = function (lt, q) {
  var s = tourWindow(lt, 'sweep', lt, true);
  var stats = [
    ['122', 'moments', q('moments')],
    ['40', 'durations', q('bands')],
    ['45', 'links', q('source')],
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
  // A soft bracket under the window's right-hand part: 500 BCE to 1949.
  var k = P(lt, q('last'), 1.0);
  var a = px(cx(yr(-500), FIT)),
    b = px(cx(yr(1949), FIT)),
    y = WY + WH + 3;
  s += drawPath(
    'M' + a + ' ' + (y - 2) + 'V' + y + 'H' + b + 'V' + (y - 2),
    b - a + 4,
    k,
    'stroke="' + C.soft + '" stroke-width="0.8"',
  );
  s += G(txt((a + b) / 2, y + 7, 'the last 2,500 years', { size: 5, serif: true, fill: C.text }), {
    o: P(lt, q('last') + 0.5, 0.5),
  });
  return s;
};

/* Scene 2: the zoom to 2200–700 BCE: the dashed Xia, the oracle bones, then 841 BCE read. */
var EARLY = {
  xia: [228, 637, 782, 654],
  oracle: [1197, 564],
  edge: 285,
  precision: 580,
  sources: 660,
  related: 778,
  open: 6,
};
SCENES[2] = function (lt, q) {
  var tZ = q('zoom') - 0.2;
  var tO = q('history') + 1.0;
  var st = lt < tO ? clamp01((lt - tZ) / 5.2) * 5.2 : EARLY.open - 0.05 + (lt - tO);
  var s = tourWindow(lt, 'early', Math.max(0, st), false);
  var gone = 1 - P(lt, tO - 1.2, 0.5);
  // The dashed band: traditional, and the callout beside it.
  var tT = q('tradition');
  var c = P(lt, tT, 0.6);
  var yX = py((EARLY.xia[1] + EARLY.xia[3]) / 2);
  s += G(
    txt(10, yX - 10, 'Traditional', {
      size: 6.4,
      serif: true,
      fill: C.accent,
      anchor: 'start',
      weight: 700,
    }) +
      txt(10, yX - 3, 'not yet confirmed', { size: 5, anchor: 'start', weight: 600 }) +
      txt(10, yX + 3, 'by writing', { size: 5, anchor: 'start', weight: 600 }) +
      arrowTo(54, px(EARLY.xia[0]) - 1.5, yX, P(lt, tT + 0.3, 0.6)) +
      outline(EARLY.xia[0], EARLY.xia[1], EARLY.xia[2], EARLY.xia[3], pulse(lt, tT)),
    { o: c * gone },
  );
  // The oracle bones.
  s += G(ring(EARLY.oracle[0], EARLY.oracle[1], 3.4, P(lt, q('oracle'), 0.6)), {
    o: gone * (1 - P(lt, q('conventional'), 0.6)),
  });
  s += G(
    rise(
      txt(10, 36, 'the first we can read', {
        size: 4.8,
        fill: C.soft,
        anchor: 'start',
        weight: 500,
      }) +
        txt(10, 44, 'oracle bones', {
          size: 6.4,
          serif: true,
          fill: C.accent,
          anchor: 'start',
          weight: 700,
        }) +
        txt(10, 51, 'about 1250 BCE', { size: 4.8, serif: true, fill: C.soft, anchor: 'start' }),
      P(lt, q('oracle'), 0.6),
      4,
    ),
    { o: gone },
  );
  s += G(note(126, 'dates before 841 BCE', 'approximate', P(lt, q('conventional'), 0.6)), {
    o: gone,
  });
  // View mode, then the reader's parts.
  s += G(viewModeChip(28, P(lt, tO - 0.9, 0.5)), { o: 1 });
  s += readerCallouts(lt, EARLY.edge, [
    ['Date precision', EARLY.precision, tO + 0.7],
    ['its two sources', EARLY.sources, tO + 1.3],
    ['linked to', EARLY.related, tO + 1.9],
  ]);
  return s;
};

/* Scene 3: 1100 BCE to 50 CE: the Zhou's eight centuries, then the Qin's fifteen years. */
SCENES[3] = function (lt, q) {
  var st = Math.min(4.9, lt * 1.4);
  var s = tourWindow(lt, 'zhou', st, false);
  var settled = P(lt, 4.9 / 1.4, 0.3);
  var zA = cx(yr(-1046), ZHOU),
    zB = cx(yr(-256), ZHOU),
    qA = cx(yr(-221), ZHOU),
    qB = cx(yr(-206), ZHOU);
  s += G(
    bracket(zA, zB, 250, P(lt, q('eight'), 1.2), 'Zhou · ~790 years') +
      bracket(qA, qB, 250, P(lt, q(['15', 'fifteen']), 0.6), 'Qin · 15'),
    { o: settled },
  );
  var rows = [
    ['1046–256 BCE', 'Zhou', q('zhou')],
    ['221 BCE', 'Qin unifies China', q('221')],
    ['221–210 BCE', 'the First Emperor', q('emperor')],
    ['221–206 BCE', 'Qin', q(['15', 'fifteen'])],
    ['202 BCE–220 CE', 'Han', q('han')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(32 + i * 22, r[0], r[1], P(lt, r[2], 0.5));
  });
  return s;
};

/* Scene 4: Separate by tags, thought: the ideas in a track of their own. */
var SEP_BUTTON = [710, 41];
var THOUGHT_Y = 489;
SCENES[4] = function (lt, q) {
  var tS = q('separate');
  var s = tourWindow(lt, 'thought', lt - tS + 0.4, false);
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
    chip(8, 44, 'thought', C.accent, { size: 5.2, solid: true }),
    P(lt, q('thought'), 0.5),
    4,
  );
  var list = [
    ['Confucius', yr(-551), q('confucius')],
    ['Laozi', yr(-571), q(['laozi', 'laow', 'lao'])],
    ['Sunzi', yr(-500), q(['sunzi', 'soon', 'sun'])],
    ['the books burned', yr(-213), q('books')],
    ['the Imperial Academy', yr(-124), q('learning')],
    ['examinations, to 1905', yr(1905, 9, 2), q('examinations')],
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
      P(lt, r[2], 0.5),
      3,
    );
  });
  // A second pointer traces the track, from moment to moment as each is named.
  var tr = '';
  var t0 = list[0][2];
  if (lt > t0 - 0.6) {
    var x = cx(list[0][1], THOUGHT);
    for (var i = 1; i < list.length; i++) {
      var m = smooth((lt - (list[i][2] - 0.5)) / 0.7);
      x = lerp(x, cx(list[i][1], THOUGHT), m);
    }
    var o = Math.min(P(lt, t0 - 0.6, 0.4), 1 - P(lt, list[list.length - 1][2] + 2, 0.5));
    tr = pointer(px(x), py(THOUGHT_Y) + 2.5, { o: o });
  }
  return s + ptr + tr;
};

/* Scene 5: the Records of the Grand Historian in the reader, and what it links to. */
var SHIJI = { edge: 285, notes: 470, precision: 580, sources: 660, related: 778, open: 0.6 };
SCENES[5] = function (lt, q) {
  var tO = q('open');
  var s = tourWindow(lt, 'shiji', Math.max(0, lt - tO - 0.3 + SHIJI.open), false);
  s += readerCallouts(lt, SHIJI.edge, [
    ['what it is', SHIJI.notes, q('what')],
    ['how sure', SHIJI.precision, q('sure')],
    ['where from', SHIJI.sources, q('comes')],
    ['linked to', SHIJI.related, q('linked')],
  ]);
  s += outline(318, 560, 800, 600, P(lt, q('sure'), 0.9) * (1 - P(lt, q('comes'), 0.5)));
  var tT = q('tables');
  s += pointerTo(lt, px(1200), py(950), px(560), py(SHIJI.related) + 1, tT, tT + 0.2, q.dur + 1);
  s += note(132, "Sima Qian's tables:", 'from 841 BCE', P(lt, tT + 0.3, 0.6));
  return s;
};

/* Scene 6: 250 BCE to 950 CE: centuries apart, the Sui's reunion, then the Tang. */
SCENES[6] = function (lt, q) {
  var st = Math.min(5, lt * 0.45);
  var v = pan(DIV0, DIV, st / 5);
  var s = tourWindow(lt, 'division', st, false);
  var hanEnd = cx(yr(220, 12, 11), v),
    sui = cx(yr(589), v);
  var over =
    bracket(hanEnd, sui, 250, P(lt, q('four'), 1.2), '~370 years apart') +
    bandOutline(yr(581, 3, 8), yr(618), 1, v, pulse(lt, q('again'))) +
    ring(cx(yr(690), v), AXIS, 3.2, P(lt, q(['wu', 'zetian']), 0.6));
  s += clipped(over);
  var rows = [
    ['220', 'the Han ends', q('han')],
    ['589', 'the Sui reunite China', q('589')],
    ['605', 'the Grand Canal', q('grand')],
    ['618–907', 'Tang', q('tang')],
    ['690–705', 'Wu Zetian', q(['wu', 'zetian'])],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(32 + i * 22, r[0], r[1], P(lt, r[2], 0.5));
  });
  return s;
};

/* Scene 7: Separate by tags, invention; then the Diamond Sutra and its two calendars. */
var INV_Y = 489;
var SUTRA = { edge: 285, date: 226, hist: 568, cal: 601, open: 4.8 };
SCENES[7] = function (lt, q) {
  var tI = q('invention');
  var tD = q('diamond');
  var tS = Math.max(q('compass') + 1.2, tD - SUTRA.open + 0.4);
  var s;
  if (lt < tS) s = tourWindow(lt, 'invention', Math.min(3.4, Math.max(0, lt - tI + 0.6)), false);
  else s = tourWindow(lt, 'sutra', lt - tS, false);
  var inv = 1 - P(lt, tS - 0.5, 0.4);
  s += G(rise(chip(8, 30, 'invention', C.accent, { size: 5.2, solid: true }), P(lt, tI, 0.5), 4), {
    o: inv,
  });
  var list = [
    ['irrigation', yr(-256, 7, 1), q('irrigation')],
    ['paper', yr(105), q('paper')],
    ['a seismoscope', yr(132), q('seismoscope')],
    ['paper money', yr(1023), q('money')],
    ['movable type', yr(1040), q('movable')],
    ['gunpowder', yr(1044), q('gunpowder')],
    ['the compass needle', yr(1088), q('compass')],
  ];
  var rings = '';
  list.forEach(function (r, i) {
    var y = 48 + i * 12.5,
      a = P(lt, r[2], 0.5);
    s += G(
      rise(
        '<circle cx="11" cy="' +
          (y - 1.8) +
          '" r="1.4" fill="' +
          C.moment +
          '"/>' +
          txt(15, y, r[0], { size: 5.2, anchor: 'start', weight: 600 }),
        a,
        3,
      ),
      { o: inv },
    );
    if (i !== 5) rings += ring(cx(r[1], INV), INV_Y, 3, a);
  });
  s += G(rings, { o: inv });
  // The reader: the Julian date the sources give, and the line's Gregorian one.
  var tR = tS + SUTRA.open;
  var j = P(lt, Math.max(tR + 0.4, q('julian')), 0.6),
    g = P(lt, Math.max(tR + 1, q('gregorian')), 0.6);
  s += G(
    txt(10, py(SUTRA.hist) - 4, 'Julian', {
      size: 4.8,
      fill: C.soft,
      anchor: 'start',
      weight: 600,
    }) +
      txt(10, py(SUTRA.hist) + 3, '11 May 868', {
        size: 6,
        serif: true,
        fill: C.accent,
        anchor: 'start',
        weight: 700,
      }) +
      arrowTo(52, px(SUTRA.edge) - 1, py(SUTRA.hist) + 1, j),
    { o: j },
  );
  s += G(
    txt(10, py(SUTRA.date) - 4, 'Gregorian', {
      size: 4.8,
      fill: C.soft,
      anchor: 'start',
      weight: 600,
    }) +
      txt(10, py(SUTRA.date) + 3, '15 May 868', {
        size: 6,
        serif: true,
        fill: C.accent,
        anchor: 'start',
        weight: 700,
      }) +
      arrowTo(52, px(SUTRA.edge) - 1, py(SUTRA.date) + 1, g),
    { o: g },
  );
  s += G(
    txt(10, (py(SUTRA.date) + py(SUTRA.hist)) / 2 + 2, '=', {
      size: 9,
      serif: true,
      fill: C.soft,
      anchor: 'start',
    }),
    {
      o: Math.min(j, g),
    },
  );
  s += outline(318, 553, 720, 614, P(lt, q('keeps'), 0.9));
  return s;
};

/* Scene 8: 1260 to 1460: the Yuan, the Ming, Zheng He, Beijing, Tumu and the wall. */
SCENES[8] = function (lt, q) {
  var st = Math.min(5, lt * 0.8);
  var v = pan(MING0, MING, st / 5);
  var s = tourWindow(lt, 'ming', st, false);
  var yong = cx(yr(1402, 7, 26), v);
  var over =
    bandOutline(
      yr(1260, 5, 13),
      yr(1294, 2, 27),
      2,
      v,
      pulse(lt, q(['kublai', 'kablai', 'khan'])),
    ) +
    ring(cx(yr(1279, 3, 23), v), AXIS, 3.2, P(lt, q('1279'), 0.6)) +
    bandOutline(yr(1402, 7, 26), yr(1424, 8, 21), 2, v, pulse(lt, q('emperor'))) +
    bandOutline(yr(1405, 7, 20), yr(1433), 1, v, pulse(lt, q('fleets'))) +
    arcOver(yong, cx(yr(1405, 7, 20), v), P(lt, q('zheng'), 0.8)) +
    arcOver(yong, cx(yr(1420, 11, 6), v), P(lt, q('beijing'), 1)) +
    ring(cx(yr(1449, 9, 10), v), AXIS, 3.2, P(lt, q('tumu'), 0.6)) +
    bandOutline(yr(1449, 9, 10), yr(1644), 1, v, pulse(lt, q('wall')));
  s += clipped(over);
  var rows = [
    ['1279', 'the Yuan rule all China', q('1279')],
    ['1368', 'the Ming', q('ming')],
    ['1405–1433', 'Zheng He’s voyages', q('zheng')],
    ['1420', 'Beijing, the Forbidden City', q('beijing')],
    ['1449', 'Tumu; the wall rebuilt', q('tumu')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(32 + i * 22, r[0], r[1], P(lt, r[2], 0.5));
  });
  return s;
};

/* Scene 9: 1830 to 1955: wars, the Taiping, Cixi; 1912 up close; the Republic to 1949. */
var Q1912 = { abdication: yr(1912, 2, 12) };
SCENES[9] = function (lt, q) {
  // The shot pans (0–5 s), holds, zooms to 1911–12 (6–8.5 s), holds, and zooms back (10–12.5 s).
  var tIn = q('1912') - 1.4,
    tOut = q('republic') - 0.4;
  var st;
  if (lt < tIn) st = Math.min(5.9, lt * 1.2);
  else if (lt < tIn + 2.5) st = 6 + (lt - tIn);
  else if (lt < tOut) st = Math.min(9.9, 8.5 + (lt - tIn - 2.5));
  else st = Math.min(12.9, 10 + (lt - tOut));
  var s = tourWindow(lt, 'qing', st, false);
  var v = pan(QING0, QING, st / 5);
  var wide = st < 6 || st >= 12.5 ? 1 : 0;
  var first = (1 - P(lt, tIn - 0.4, 0.4)) * wide;
  var later = P(lt, tOut + 2.6, 0.3);
  var over = G(
    bandOutline(yr(1839, 9, 4), yr(1842, 8, 29), 1, v, P(lt, q('opium'), 0.6)) +
      bandOutline(yr(1856, 10, 8), yr(1860, 10, 24), 1, v, P(lt, q('opium') + 0.5, 0.6)) +
      bandOutline(yr(1850, 12, 1), yr(1864, 8, 1), 2, v, P(lt, q(['taiping', 'tie']), 0.6)) +
      bandOutline(
        yr(1861, 11, 11),
        yr(1908, 11, 15),
        1,
        v,
        P(lt, q(['cixi', 'tsuh', 'holding']), 0.6),
      ),
    { o: first },
  );
  over += G(
    bandOutline(
      yr(1927, 8, 1),
      yr(1949, 12, 7),
      0,
      QING,
      P(lt, Math.max(q('civil'), tOut + 2.6), 0.6),
    ) +
      bandOutline(yr(1937, 7, 7), yr(1945, 9, 2), 2, QING, P(lt, q('japan'), 0.6)) +
      ring(1772, AXIS, 3.4, P(lt, q('proclaims'), 0.6)) +
      arcOver(cx(yr(1842, 8, 29), QING), cx(yr(1997, 7, 1), QING), P(lt, q('link'), 1.6)),
    { o: later },
  );
  // Up close: the abdication.
  var close = st >= 8.5 && st < 10 ? 1 : 0;
  over += G(ring(1440, AXIS, 3.4, P(lt, q('abdicates'), 0.6)), {
    o: close,
  });
  s += clipped(over);
  var rows = [
    ['1839–42, 1856–60', 'two Opium Wars', q('opium')],
    ['1850–64', 'the Taiping Rebellion', q(['taiping', 'tie', 'rebellion'])],
    ['1861–1908', 'Cixi in power', q(['cixi', 'tsuh', 'holding'])],
    ['12 Feb 1912', 'the last emperor abdicates', q('abdicates')],
    ['1 Oct 1949', 'the People’s Republic', q('proclaims')],
    ['1842 → 1997', 'Nanking to Hong Kong', q('link')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(30 + i * 20, r[0], r[1], P(lt, r[2], 0.5));
  });
  return s;
};

/* Scene 10: the window steps aside for what a class can do; the end card. */
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
SCENES[10] = function (lt, q) {
  var k = smooth((lt - 0.2) / 1.1);
  var w = lerp(WW, 150, k),
    x = lerp(WX, 8, k),
    y = lerp(WY, 46, k);
  var s = appWindow(x, y, w, 'sweep', 99);
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
      'Every moment',
      'its sources and its dating',
      q('check'),
      function (cx, cy) {
        return linkIcon(cx, cy);
      },
    ],
    [
      'Make one',
      'as a class, or one each',
      q('build'),
      function (cx, cy) {
        return G(ICON.person(cx - 4, cy + 1, C.soft) + ICON.person(cx + 4, cy + 1, C.accent), {
          s: 0.55,
          cx: cx,
          cy: cy,
        });
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
      txt(160, 96, 'timescale.info/athan/china', {
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
