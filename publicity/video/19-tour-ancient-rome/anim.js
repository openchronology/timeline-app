// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 19, Tour: Ancient Rome, from the Founding to the Fall (publicity/19-tour-ancient-rome.md):
   the Rome sample in the real editor, captured (shots.json), in a browser window, with the
   Archive look's callouts around the window, never over the app's own text: the whole sweep,
   the seven kings and the founding read as legend, the Republic's struggle and first road,
   Hannibal's war link by link, Cannae in Rome's own calendar, the eclipse that fixes Pydna,
   the Ides of March in the Julian calendar, the emperors' dynasties, Roman law in a track of
   its own, Constantine, the end in the West, and the Eastern Empire's thousand years more.
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
/** A ring that pulses twice from t0, then rests. */
function pulse(lt, cx, cy, r, t0) {
  var a = P(lt, t0, 0.5);
  if (a <= 0.01) return '';
  var w = Math.max(0, Math.sin(Math.min(1, (lt - t0) / 1.6) * Math.PI * 2));
  return ring(cx, cy, r * (1 + 0.25 * w), a);
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
/** A band's outline traced left to right (its top and bottom edges together), to p. */
function sweep(x0, y0, x1, y1, p) {
  if (p <= 0.01) return '';
  var a = px(x0) - 0.8,
    b = lerp(a, px(x1) + 0.8, p),
    t = py(y0) - 0.8,
    u = py(y1) + 0.8;
  return (
    '<path d="M' +
    b +
    ' ' +
    t +
    'H' +
    a +
    'V' +
    u +
    'H' +
    b +
    (p > 0.99 ? 'V' + t : '') +
    '" fill="none" stroke="' +
    C.select +
    '" stroke-width="0.9" stroke-linejoin="round"/>'
  );
}
/** The pointer moving to (x, y) from (fx, fy), arriving at tA, then fading at tGone. */
function pointerTo(lt, fx, fy, x, y, tA, tGone) {
  var m = smooth((lt - (tA - 1.1)) / 1.1);
  return pointer(lerp(fx, x, m), lerp(fy, y, m), {
    o: Math.min(P(lt, tA - 1.3, 0.3), 1 - P(lt, tGone, 0.4)),
  });
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
/** The app's arc between captured x a and b over the axis at captured y `axis`
    (relationships.ts arcPath, lift = min(150, 18 + 0.3·distance) CSS px, at the 1.5 scale),
    traced in the selection colour to p. */
function arcOver(a, b, axis, p) {
  if (p <= 0.01) return '';
  var lift = 1.5 * Math.min(150, 18 + (0.3 * Math.abs(b - a)) / 1.5);
  var d =
    'M' +
    px(a) +
    ' ' +
    py(axis) +
    'Q' +
    px((a + b) / 2) +
    ' ' +
    py(axis - 2 * lift) +
    ' ' +
    px(b) +
    ' ' +
    py(axis);
  return drawPath(
    d,
    px(b) - px(a) + (2 * lift * WH) / 1080,
    p,
    'stroke="' + C.select + '" stroke-width="0.7"',
  );
}
/** A bracket under captured x0–x1 at stage y, drawn left to right to p. */
function bracket(x0, x1, y, p, col) {
  var a = px(x0),
    b = px(x1);
  return drawPath(
    'M' + a + ' ' + (y - 2) + 'V' + y + 'H' + b + 'V' + (y - 2),
    b - a + 4,
    p,
    'stroke="' + (col || C.select) + '" stroke-width="0.9"',
  );
}
/** The View mode switch, as a small label at the top of the left strip. */
function viewModeChip(lt, t0) {
  return rise(
    rect(8, 28, 12, 6.4, C.accent, { rx: 3.2 }) +
      '<circle cx="16.8" cy="31.2" r="2.4" fill="' +
      C.card +
      '"/>' +
      txt(24, 33.2, 'View mode', { size: 5.6, anchor: 'start', weight: 600 }),
    P(lt, t0, 0.5),
    4,
  );
}

/* Scene 1: the whole sweep, with what the sample holds. */
SCENES[1] = function (lt, q) {
  var s = tourWindow(lt, 'sweep', lt, true);
  var stats = [
    // Bands are named before moments, so the durations come first.
    ['49', 'durations', q('bands')],
    ['133', 'moments', q('moments')],
    ['62', 'links', q('linked')],
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

/* Scene 2: the zoom to the seven kings, then the founding in the reader, labelled legend. */
var KINGS = {
  y0: 637,
  y1: 652,
  bands: [
    [185, 423],
    [432, 700],
    [704, 899],
    [903, 1062],
    [1071, 1306],
    [1317, 1591],
    [1595, 1758],
  ],
};
var FOUND = { edge: 285, tags: 327, precision: [521, 573], hist: 608, open: 2.9 };
SCENES[2] = function (lt, q) {
  // The founding shot starts as "centuries" ends, its zoom played 1.5× so the reader opens on
  // "founding".
  var tF = q('centuries') + 0.6;
  var s;
  if (lt < tF) {
    s = tourWindow(lt, 'kings', lt, false);
    // The kings, left to right, from "seven".
    var t7 = q('seven');
    var hl = '';
    KINGS.bands.forEach(function (b, i) {
      hl += outline(b[0], KINGS.y0, b[1], KINGS.y1, P(lt, t7 + i * 0.35, 0.5));
    });
    s += G(hl, { o: 1 - P(lt, tF - 0.5, 0.4) });
  } else {
    s = tourWindow(lt, 'founding', (lt - tF) * 1.5, false);
    s += viewModeChip(lt, tF + 0.2);
    s += readerCallouts(lt, FOUND.edge, [
      ['legend', FOUND.tags, q('legend')],
      ['Date precision', FOUND.precision[0] + 14, q('reckoning')],
      ['Historical dates', FOUND.hist, q('21st')],
    ]);
    s += outline(320, FOUND.precision[0], 1600, FOUND.precision[1], P(lt, q('reckoning'), 0.9));
  }
  // The kings in the left column, below where the reader's callouts go; they give way to
  // "legend".
  var gone = 1 - P(lt, q('legend') - 0.4, 0.5);
  s += G(
    rise(
      txt(10, 120, '7', { size: 13, serif: true, fill: C.accent, anchor: 'start', weight: 600 }) +
        txt(10, 127.5, 'kings, by tradition', { size: 5.4, anchor: 'start', weight: 600 }),
      P(lt, q('seven'), 0.5),
      4,
    ) +
      rise(
        txt(10, 140, '753–509 BCE', {
          size: 5,
          serif: true,
          fill: C.accent,
          anchor: 'start',
          weight: 600,
        }) + txt(10, 146.6, '244 years', { size: 5.4, anchor: 'start', weight: 600 }),
        P(lt, q('two'), 0.5),
        4,
      ),
    { o: gone },
  );
  return s;
};

/* Scene 3: the pan to the early Republic; the Conflict of the Orders end to end; 312 BCE. */
var EARLY = { orders: [250, 637, 1636, 652], s312: [1469, 564] };
SCENES[3] = function (lt, q) {
  var s = tourWindow(lt, 'republic', lt, false);
  var rows = [
    ['509 BCE', 'two consuls a year', q('consuls')],
    ['494–287 BCE', 'Conflict of the Orders', q('plebeians')],
    ['450 BCE', 'the Twelve Tables', q('tables')],
    ['312 BCE', 'Via Appia, Aqua Appia', q('road')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(32 + i * 20, r[0], r[1], P(lt, r[2], 0.5));
  });
  var o = EARLY.orders;
  var tA = q('plebeians'),
    tB = q('ends');
  s += sweep(o[0], o[1], o[2], o[3], clamp01((lt - tA) / Math.max(1, tB - tA)));
  s += pulse(lt, EARLY.s312[0], EARLY.s312[1], 3.2, q('312'));
  return s;
};

/* Scene 4: Hannibal's war: the arcs from Saguntum to Zama, in turn. */
var HANN = { axis: 564, sag: 342, alps: 441, tras: 493, cannae: 579, zama: 1678 };
SCENES[4] = function (lt, q) {
  var s = tourWindow(lt, 'hannibal', lt, false);
  var h = HANN;
  s +=
    arcOver(h.sag, h.alps, h.axis, P(lt, q('crosses'), 0.7)) +
    arcOver(h.alps, h.tras, h.axis, P(lt, q('trasimene'), 0.7)) +
    arcOver(h.tras, h.cannae, h.axis, P(lt, q('cannae'), 0.7)) +
    arcOver(h.cannae, h.zama, h.axis, P(lt, q('zama'), 1));
  var rows = [
    ['219 BCE', 'Saguntum', q('saguntum')],
    ['218 BCE', 'the Alps', q('alps')],
    ['217 BCE', 'Lake Trasimene', q('trasimene')],
    ['216 BCE', 'Cannae', q('cannae')],
    ['202 BCE', 'Zama', q('zama')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(32 + i * 20, r[0], r[1], P(lt, r[2], 0.5));
  });
  return s;
};

/* Scene 5: Cannae in the reader: a day in Rome's own calendar. */
var CANNAE = { edge: 285, precision: [456, 532], hist: 551, cal: 584, open: 0.4 };
SCENES[5] = function (lt, q) {
  var tO = q('open');
  var s = tourWindow(lt, 'cannae', lt - tO + CANNAE.open + 0.1, false);
  s += viewModeChip(lt, 0.2);
  s += readerCallouts(lt, CANNAE.edge, [
    ['Date precision', (CANNAE.precision[0] + CANNAE.precision[1]) / 2, q('precision')],
    ['Historical dates', (CANNAE.hist + CANNAE.cal) / 2, q('historical')],
  ]);
  s += G(outline(320, 540, 900, 597, P(lt, q('2nd'), 0.9)), {
    o: 1 - P(lt, q('precision') - 0.3, 0.4),
  });
  s += outline(320, CANNAE.precision[0], 1600, CANNAE.precision[1], P(lt, q('precision'), 0.9));
  var d = P(lt, q('2nd'), 0.6);
  s += rise(
    txt(10, 132, 'the source gives', { size: 4.8, fill: C.soft, anchor: 'start', weight: 500 }) +
      txt(10, 141, '2 August 216 BCE', {
        size: 6,
        serif: true,
        fill: C.accent,
        anchor: 'start',
        weight: 700,
      }) +
      txt(10, 148, "in Rome's own calendar", { size: 4.8, anchor: 'start', weight: 600 }),
    d,
    4,
  );
  return s;
};

/* Scene 6: Pydna in the reader, and the eclipse that pins it: Livy's date against the sky's. */
var PYDNA = { precision: [509, 585], open: 2.5 };
SCENES[6] = function (lt, q) {
  var tO = q('pydna');
  var s = tourWindow(lt, 'pydna', Math.max(0, lt - tO + PYDNA.open + 0.1), false);
  s += outline(320, PYDNA.precision[0], 1600, PYDNA.precision[1], P(lt, q('eclipsed'), 0.9));
  // A small calendar strip, June to September, in the left column.
  var top = 46,
    perDay = 0.62; // stage units a day, from 1 June
  function dy(day) {
    return top + day * perDay;
  }
  var cal = P(lt, q('livy') - 0.4, 0.6);
  var months = [
    ['Jun', 0],
    ['Jul', 30],
    ['Aug', 61],
    ['Sep', 92],
    ['', 122],
  ];
  var c =
    txt(10, 36, 'the eclipse', { size: 4.8, fill: C.soft, anchor: 'start', weight: 500 }) +
    '<path d="M12 ' +
    dy(0) +
    'V' +
    dy(122) +
    '" stroke="' +
    C.line +
    '" stroke-width="0.7"/>';
  months.forEach(function (m) {
    c +=
      '<path d="M10.6 ' +
      dy(m[1]) +
      'H13.4" stroke="' +
      C.line +
      '" stroke-width="0.6"/>' +
      (m[0]
        ? txt(15, dy(m[1] + 15) + 1.6, m[0], { size: 4.4, fill: C.soft, anchor: 'start' })
        : '');
  });
  s += G(c, { o: cal });
  // Livy's day, then the sky's.
  var lv = P(lt, q('livy'), 0.5),
    sk = P(lt, q('astronomers'), 0.5);
  s += G(
    '<circle cx="12" cy="' +
      dy(95) +
      '" r="1.5" fill="' +
      C.text +
      '"/>' +
      txt(34, dy(95) - 1, 'Livy', { size: 4.6, fill: C.soft, anchor: 'start', weight: 600 }) +
      txt(34, dy(95) + 5, '4 September', { size: 5, serif: true, anchor: 'start', weight: 700 }),
    { o: lv },
  );
  s += G(
    '<circle cx="12" cy="' +
      dy(20) +
      '" r="1.5" fill="' +
      C.accent +
      '"/>' +
      txt(34, dy(20) - 1, 'the sky', { size: 4.6, fill: C.soft, anchor: 'start', weight: 600 }) +
      txt(34, dy(20) + 5, '21 June', {
        size: 5,
        serif: true,
        fill: C.accent,
        anchor: 'start',
        weight: 700,
      }),
    { o: sk },
  );
  // The bracket last, with the gap.
  var br = P(lt, q('calendar'), 0.8);
  s += drawPath(
    'M29 ' + dy(20) + 'H31V' + dy(95) + 'H29',
    dy(95) - dy(20) + 4,
    br,
    'stroke="' + C.select + '" stroke-width="0.9"',
  );
  s += G(
    txt(34, (dy(20) + dy(95)) / 2 + 1.8, '~2½ months', {
      size: 5,
      anchor: 'start',
      fill: C.select,
      weight: 700,
    }),
    { o: P(lt, q('calendar') + 0.5, 0.5) },
  );
  return s;
};

/* Scene 7: the fast pan from the Gracchi to Caesar, settling on the Rubicon. */
SCENES[7] = function (lt, q) {
  var tR = q('rubicon');
  // The shot's 2.2 s pan, timed to settle as the Rubicon is named.
  var st = lt < tR - 2.2 ? 0 : lt - (tR - 2.2);
  var s = tourWindow(lt, 'gracchi', st, false);
  var rows = [
    ['133 BCE', 'the Gracchi', q('gracchae')],
    ['107–82 BCE', 'Marius and Sulla', q('marius')],
    ['71 BCE', 'Spartacus', q('spartacus')],
    ['67 BCE', 'Pompey', q('pompey')],
    ['49 BCE', 'the Rubicon', tR],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(32 + i * 20, r[0], r[1], P(lt, r[2], 0.5));
  });
  return s;
};

/* Scene 8: the Ides of March, in the reader, from the Julian calendar on. */
var IDES = {
  edge: 285,
  julian: [360, 564],
  hist: [513, 575],
  related: [324, 731, 1596, 901],
  open: 4.5,
};
SCENES[8] = function (lt, q) {
  var tO = q('ides');
  // The zoom plays from the scene's start, holds on the settled view, and the reader opens on "Ides".
  var st = lt < tO ? Math.min(IDES.open - 0.2, lt) : IDES.open + 0.1 + (lt - tO);
  var s = tourWindow(lt, 'ides', st, false);
  s += G(pulse(lt, IDES.julian[0], IDES.julian[1], 3, q('1st')), {
    o: 1 - P(lt, tO - 0.2, 0.3),
  });
  s += rise(
    txt(10, 38, 'from 1 January', { size: 4.8, fill: C.soft, anchor: 'start', weight: 500 }) +
      txt(10, 46, '45 BCE', {
        size: 6.6,
        serif: true,
        fill: C.accent,
        anchor: 'start',
        weight: 700,
      }) +
      txt(10, 53, 'Julian days', { size: 5.2, anchor: 'start', weight: 600 }),
    P(lt, q('1st'), 0.5),
    4,
  );
  s += readerCallouts(lt, IDES.edge, [
    ['Historical dates', (IDES.hist[0] + IDES.hist[1]) / 2, tO + 0.6],
    ['Related to', (IDES.related[1] + IDES.related[3]) / 2, q('links')],
  ]);
  s += outline(320, IDES.hist[0], 900, IDES.hist[1], P(lt, tO + 0.6, 0.9));
  var r = IDES.related;
  s += pointerTo(lt, px(1300), py(980), px(760), py(770), q('links') + 0.6, q.end + 3);
  s += outline(r[0], r[1], r[2], r[3], P(lt, q('cicero'), 0.9));
  return s;
};

/* Scene 9: Augustus to Marcus Aurelius: the dynasties in turn; 80 CE. */
var PRIN = {
  y0: 640,
  y1: 649,
  julio: [98, 820],
  flavian: [848, 1039],
  antonine: [1055, 1792],
  s80: [917, 564],
};
SCENES[9] = function (lt, q) {
  var s = tourWindow(lt, 'emperors', lt, false);
  var p = PRIN;
  s += outline(p.julio[0], p.y0, p.julio[1], p.y1, P(lt, q('julio'), 0.9));
  s += outline(p.flavian[0], p.y0, p.flavian[1], p.y1, P(lt, q('flavians'), 0.9));
  s += outline(p.antonine[0], p.y0, p.antonine[1], p.y1, P(lt, q('antonines'), 0.9));
  s += pulse(lt, p.s80[0], p.s80[1], 3.2, q('after'));
  var rows = [
    ['31 BCE', 'Actium', q('actium')],
    ['27 BCE', 'Augustus', q('augustus')],
    ['27 BCE–68 CE', 'Julio-Claudians', q('julio')],
    ['69–96 CE', 'Flavians', q('flavians')],
    ['96–192 CE', 'Nerva–Antonines', q('antonines')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(32 + i * 20, r[0], r[1], P(lt, r[2], 0.5));
  });
  return s;
};

/* Scene 10: Separate by tags, law: one thread in a track of its own; 90 BCE to 212 CE. */
var LAW = { italians: 973, free: 1356, by: 545, sep: 2.3 };
SCENES[10] = function (lt, q) {
  var tS = q('law');
  var st = lt < tS ? Math.min(LAW.sep - 0.1, lt) : LAW.sep + (lt - tS);
  var s = tourWindow(lt, 'law', st, false);
  s += rise(chip(8, 30, 'Separate by tags', C.accent, { size: 5.2 }), P(lt, q('separate'), 0.5), 4);
  s += rise(chip(8, 44, 'law', C.accent, { size: 5.2, solid: true }), P(lt, tS, 0.5), 4);
  var list = [
    ['the Twelve Tables', q('tables')],
    ['Italians, 90 BCE', q('italians')],
    ['all free men, 212 CE', q('free')],
    ['the Edict of Milan', q('milan')],
    ["Justinian's Code", q('code')],
  ];
  list.forEach(function (r, i) {
    var y = 66 + i * 13;
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
  // A thin bracket under the two citizenship moments' stems, on "every free man".
  var b = P(lt, q('free'), 0.8),
    a = px(LAW.italians),
    z = px(LAW.free),
    y = py(LAW.by);
  s += drawPath(
    'M' + a + ' ' + (y - 2) + 'V' + y + 'H' + z + 'V' + (y - 2),
    z - a + 4,
    b,
    'stroke="' + C.select + '" stroke-width="0.8"',
  );
  s += G(
    txt((a + z) / 2, y + 5.4, '301 years', {
      size: 4.4,
      serif: true,
      fill: C.select,
      weight: 700,
    }),
    { o: P(lt, q('free') + 0.5, 0.5) },
  );
  return s;
};

/* Scene 11: rejoined; the crisis, the Tetrarchy, Constantine, and the two halves from 395. */
var LATE = {
  tetrarchy: [522, 657, 663, 671],
  constantine: [618, 618, 834, 632],
  east: [1247, 618, 1847, 632],
  west: [1247, 657, 1822, 671],
};
SCENES[11] = function (lt, q) {
  var s = tourWindow(lt, 'constantine', lt, false);
  var L = LATE;
  s += outline(
    L.tetrarchy[0],
    L.tetrarchy[1],
    L.tetrarchy[2],
    L.tetrarchy[3],
    P(lt, q('four'), 0.9),
  );
  s += outline(
    L.constantine[0],
    L.constantine[1],
    L.constantine[2],
    L.constantine[3],
    P(lt, q('constantine'), 0.9),
  );
  s += outline(L.east[0], L.east[1], L.east[2], L.east[3], P(lt, q('395'), 0.9));
  s += outline(L.west[0], L.west[1], L.west[2], L.west[3], P(lt, q('395') + 0.3, 0.9));
  var rows = [
    ['235–284 CE', 'the crisis', q('third')],
    ['293 CE', 'the Tetrarchy', q('four')],
    ['312 CE', 'the Milvian Bridge', q('milvian')],
    ['330 CE', 'Constantinople', q('founds')],
    ['395 CE', 'the empire divides', q('395')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(32 + i * 20, r[0], r[1], P(lt, r[2], 0.5));
  });
  return s;
};

/* Scene 12: the end in the West: the zoom eases to a stop at 476. */
var WEST = { s476: [1774, 564] };
SCENES[12] = function (lt, q) {
  // The 3.5 s zoom, slowed to ease to a stop as 476 is said.
  var s = tourWindow(lt, 'west', (lt * 3.5) / Math.max(3.5, q('476')), false);
  s += pulse(lt, WEST.s476[0], WEST.s476[1], 3.4, q('476'));
  var rows = [
    ['410 CE', 'Visigoths sack Rome', q('visigoths')],
    ['455 CE', 'Vandals sack Rome', q('vandals')],
    ['476 CE', 'the last western emperor', q('476')],
    ['475–476 CE', 'Romulus Augustulus', q('romulus')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(32 + i * 20, r[0], r[1], P(lt, r[2], 0.5));
  });
  return s;
};

/* Scene 13: zoom out to 1480 CE; the bracket under the eastern band; the fall in the reader. */
var EAST = { from: 256, to: 1805, y: 676, edge: 285, hist: [513, 575] };
SCENES[13] = function (lt, q) {
  var tC = q('until');
  var s;
  if (lt < tC) {
    s = tourWindow(lt, 'east', lt, false);
    var b = P(lt, 3.1, 1.4);
    s += bracket(EAST.from, EAST.to, py(EAST.y), b, C.accent);
    s += G(
      txt((px(EAST.from) + px(EAST.to)) / 2, py(EAST.y) + 7, '977 more years', {
        size: 5.4,
        serif: true,
        fill: C.accent,
        weight: 700,
      }),
      { o: P(lt, 3.9, 0.5) },
    );
  } else {
    s = tourWindow(lt, 'fall', lt - tC + 0.5, false);
    s += readerCallouts(lt, EAST.edge, [
      ['Historical dates', (EAST.hist[0] + EAST.hist[1]) / 2, tC + 0.6],
    ]);
    s += outline(320, EAST.hist[0], 900, EAST.hist[1], P(lt, tC + 0.6, 0.9));
  }
  s += stripRow(32, '476 CE', 'the West ends', P(lt, 0.4, 0.5));
  s += stripRow(52, '1453 CE', 'the East ends', P(lt, q('1453') - 0.6, 0.5));
  return s;
};

/* Scene 14: the window steps aside for what a class can do; the end card. */
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
SCENES[14] = function (lt, q) {
  var k = smooth((lt - 0.2) / 1.1);
  var w = lerp(WW, 150, k),
    x = lerp(WX, 8, k),
    y = lerp(WY, 46, k);
  var s = appWindow(x, y, w, 'east', 99);
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
      'an era, a dynasty, a unit',
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
  var e = P(lt, q.end + 0.6, 0.8);
  s += G(
    rect(-20, -24, 360, 210, C.ground) +
      wordmark(160, 70, 16) +
      txt(160, 96, 'timescale.info/athan/rome', {
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
