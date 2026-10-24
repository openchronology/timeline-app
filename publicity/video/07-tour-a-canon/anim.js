// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 7, Tour: keeping a canon (Middle-earth) (publicity/7-tour-a-canon-middle-earth.md): the
   sample "Middle-earth: an unofficial chronology" (samples/middle-earth.ochx) in the real
   editor, captured in shots.json, in a browser window with the Lore look's callouts beside it:
   the whole canon after Fit all with its Ages and books, the Second Age in its own reckoning
   with the custom display's code, the One Ring's thread separated by tags, two moments' Dating
   context in the reader, and the War of the Ring down to the day with its Shire Reckoning date.
   Scenes are pure functions of scene time lt; q("word") is when that word is said. */

/* The window: its place on the stage, and a captured pixel (1920 × 1080) in stage units. */
var WX = 76,
  WY = 22,
  WW = 236,
  WH = (WW * 9) / 16;
/* The camera on the captured frame: zoomed by CAM.z about the frame's centre (scenes set it). */
var CAM = { z: 1 };
function px(x) {
  return WX + (((x - 960) * CAM.z + 960) / 1920) * WW;
}
function py(y) {
  return WY + (((y - 540) * CAM.z + 540) / 1080) * WH;
}
/** The window's content zoomed by z about the frame's centre, faded in by op (over the window). */
function zoomed(id, st, z, op) {
  if (op <= 0.001) return '';
  var w = 1920 / z,
    h = 1080 / z;
  return G(
    '<svg x="' +
      WX +
      '" y="' +
      WY +
      '" width="' +
      WW +
      '" height="' +
      WH.toFixed(3) +
      '" viewBox="' +
      [(960 - w / 2).toFixed(2), (540 - h / 2).toFixed(2), w.toFixed(2), h.toFixed(2)].join(' ') +
      '" preserveAspectRatio="none">' +
      '<image href="' +
      shotFrame(id, st) +
      '" width="1920" height="1080"/></svg>',
    { o: op },
  );
}
/** The window rising into place at the start of a scene (or already there). */
function tourWindow(lt, id, st, rising) {
  var p = rising ? P(lt, 0.15, 0.9) : 1;
  return G(appWindow(WX, WY, WW, id, st), { o: p, ty: (1 - p) * 10 });
}
/** A gold outline around captured pixels (x0, y0)–(x1, y1), shown by p. */
function outline(x0, y0, x1, y1, p, o) {
  o = o || {};
  if (p <= 0.001) return '';
  var pad = o.pad === undefined ? 0.8 : o.pad;
  return (
    G(
      rect(
        px(x0) - pad,
        py(y0) - pad,
        px(x1) - px(x0) + 2 * pad,
        py(y1) - py(y0) + 2 * pad,
        o.fill ? C.accent : 'none',
        {
          rx: o.rx === undefined ? 1.4 : o.rx,
          stroke: C.strong,
          sw: o.sw || 0.8,
          op: o.fill ? 0.22 : undefined,
        },
      ),
      { o: p },
    ) +
    (o.fill
      ? G(
          rect(
            px(x0) - pad,
            py(y0) - pad,
            px(x1) - px(x0) + 2 * pad,
            py(y1) - py(y0) + 2 * pad,
            'none',
            { rx: o.rx === undefined ? 1.4 : o.rx, stroke: C.strong, sw: o.sw || 0.8 },
          ),
          { o: p },
        )
      : '')
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
/** A row of the left strip: a serif date over a name. */
function stripRow(x, y, date, name, p) {
  return rise(
    txt(x, y, date, { size: 5, serif: true, fill: C.accent, anchor: 'start', weight: 600 }) +
      txt(x, y + 6.4, name, { size: 5.4, anchor: 'start', weight: 600 }),
    p,
    4,
  );
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

/* ---------- Scene 1: the whole canon after Fit all ---------- */
/* The Age bands in the fit frame (captured pixels): [x0, x1, y, label under the window]. */
var AGES = [
  [137, 224, 435, 'Trees'],
  [225, 352, 454, 'First'],
  [353, 1100, 474, 'Second'],
  [1101, 1757, 435, 'Third'],
  [1757, 1786, 435, 'Fourth'],
];
SCENES[1] = function (lt, q) {
  var s = tourWindow(lt, 'fit', 0, true);
  // The Age bands light left to right, from the Years of the Trees to the Fourth Age.
  var t0 = q('trees'),
    t1 = q('fourth');
  var tb = q(['band', 'timeline']);
  AGES.forEach(function (a, i) {
    var at = lerp(t0, t1, i / (AGES.length - 1));
    var p = P(lt, at, 0.5);
    var glow = 1 - 0.55 * P(lt, at + 1.2, 0.8) + 0.55 * P(lt, tb, 0.4);
    if (i < 4) s += outline(a[0], a[2] - 9, a[1], a[2] + 9, p * Math.min(1, glow), { fill: true });
    else s += outline(a[0] - 4, a[2] - 9, a[1] + 4, a[2] + 9, p * Math.min(1, glow));
    var lx = px((a[0] + a[1]) / 2);
    s += rise(
      txt(lx, WY + WH + 9, a[3], { size: 5.2, serif: true, fill: C.accent, weight: 600 }),
      p,
      3,
    );
  });
  // The books that tell it, as tag chips in the strip.
  var books = [
    ['the silmarillion', q(['silmarillion', 'across'])],
    ['the hobbit', q('hobbit')],
    ['the lord of the rings', q('lord')],
  ];
  s += rise(
    txt(8, 40, 'Tagged by book', { size: 5, anchor: 'start', fill: C.soft, weight: 600 }),
    P(lt, q(['silmarillion', 'across']) - 0.3, 0.5),
    3,
  );
  books.forEach(function (b, i) {
    var a = P(lt, b[1], 0.5);
    var y = 54 + i * 15;
    s += pop(chip(8, y, b[0], C.accent, { size: 5, mono: true }), a, 14, y - 2);
  });
  // Each event is tagged with the book that tells it: the chips light together.
  var tg = P(lt, q('tagged'), 0.4) * (1 - P(lt, q('tagged') + 1.2, 0.6));
  if (tg > 0.001)
    books.forEach(function (b, i) {
      var y = 54 + i * 15;
      s += G(
        rect(8, y - 7.5, chipWidth(b[0], { size: 5, mono: true }), 11, 'none', {
          rx: 5.5,
          stroke: C.strong,
          sw: 1.1,
        }),
        { o: tg },
      );
    });
  return s;
};

/* ---------- Scene 2: the Second Age in its own reckoning; the display code ---------- */
/* The first lines of the sample's custom display (middle-earth.mjs, SOURCE), its long line
   broken at its conditions so it fits the card. */
var CODE = [
  ['function print(time: Rational, api: TimeAPI): string {', 'fn'],
  ['  const x = api.div(time, api.rational("31557600"));', ''],
  ['  const fine = …;', 'skip'],
  ['  const age =', ''],
  ['    api.compare(x, api.rational("591")) < 0 ? "F.A. " :', 'fa'],
  ['    api.compare(x, api.rational("4032")) < 0 ? "S.A. " :', 'sa'],
  ['    api.compare(x, api.rational("7053")) < 0 ? "T.A. " :', 'ta'],
  ['    "Fo.A. ";', ''],
  ['  …', 'skip'],
  ['}', ''],
  ['function parse(text: string, api: TimeAPI): Rational {', 'fn2'],
];
var CODE_X = 6,
  CODE_Y = 80,
  CODE_W = 158,
  CODE_LH = 6.5;
function codeLineY(i) {
  return CODE_Y + 15 + i * CODE_LH;
}
SCENES[2] = function (lt, q) {
  // The shot holds the whole canon for 0.4 s, then zooms into the Second Age.
  var tZ = q('years') - 0.2;
  var s = tourWindow(lt, 'second', lt - tZ, false);
  // The code card slides in from the left, like a terminal.
  var cp = P(lt, q('lines'), 0.7);
  var hiSA = P(lt, q('second'), 0.4),
    hiTA = P(lt, q('third'), 0.4),
    hiParse = P(lt, q('read'), 0.4);
  var hl = { sa: hiSA * (1 - 0.6 * hiTA), ta: hiTA * (1 - 0.6 * hiParse), fn2: hiParse };
  var c =
    rect(CODE_X + 1, CODE_Y + 1.5, CODE_W, 88, '#000', { rx: 2.6, op: 0.35 }) +
    rect(CODE_X, CODE_Y, CODE_W, 88, '#0b1410', { rx: 2.6, stroke: C.line, sw: 0.7 }) +
    rect(CODE_X, CODE_Y, CODE_W, 8, mix('#0b1410', C.line, 0.6), { rx: 2.6 }) +
    rect(CODE_X, CODE_Y + 5, CODE_W, 3, mix('#0b1410', C.line, 0.6));
  [0, 1, 2].forEach(function (i) {
    c +=
      '<circle cx="' +
      (CODE_X + 4.5 + i * 3.6) +
      '" cy="' +
      (CODE_Y + 4) +
      '" r="1.1" fill="' +
      [C.red, C.amber, C.green][i] +
      '" opacity="0.8"/>';
  });
  c += txt(CODE_X + CODE_W / 2, CODE_Y + 5.8, 'Time display · Custom code', {
    size: 4.6,
    fill: C.soft,
    weight: 600,
  });
  CODE.forEach(function (l, i) {
    var y = codeLineY(i);
    var h = hl[l[1]] || 0;
    if (h > 0.001)
      c += rect(CODE_X + 2, y - 4.6, CODE_W - 4, 6.2, C.accent, { rx: 1, op: 0.22 * h });
    var fill = l[1] === 'skip' ? C.soft : l[1] === 'fn' || l[1] === 'fn2' ? C.strong : C.text;
    // SVG collapses spaces, so the indent is an offset (a mono character is 0.6 em).
    var indent = l[0].length - l[0].replace(/^ +/, '').length;
    c += txt(CODE_X + 5 + indent * 4.4 * 0.6, y, l[0].trim(), {
      size: 4.4,
      mono: true,
      anchor: 'start',
      fill: fill,
      weight: 500,
    });
  });
  s += G(c, { o: cp, tx: (1 - cp) * -14 });
  // The arrow from the "S.A. " line to a ruler label, which the display printed.
  var ap = P(lt, q('print') + 0.2, 0.8);
  var lx = px(816),
    ly = py(414);
  var y5 = codeLineY(5) - 1.6;
  var x5 = CODE_X + CODE_W - 1;
  s += drawPath(
    'M' +
      x5 +
      ' ' +
      y5 +
      'C' +
      (x5 + 10) +
      ' ' +
      y5 +
      ' ' +
      lx +
      ' ' +
      (ly + 14) +
      ' ' +
      lx +
      ' ' +
      (ly + 3.6),
    40,
    ap,
    'stroke="' + C.strong + '" stroke-width="0.8"',
  );
  var hp = P(lt, q('print') + 0.9, 0.4);
  s += G(
    '<path d="M' +
      lx +
      ' ' +
      (ly + 3.4) +
      'l-1.6 2.6h3.2z" fill="' +
      C.strong +
      '"/>' +
      rect(lx - 6, ly - 2.7, 12, 5.4, 'none', { rx: 2.7, stroke: C.strong, sw: 0.8 }),
    { o: hp },
  );
  return s;
};

/* ---------- Scene 3: Separate by tags, the one ring ---------- */
var THREAD = [
  ['S.A. c. 1600', 'The One Ring forged', 'forged', 0],
  ['S.A. 3441', 'Isildur takes the Ring', 'forged', 0.8],
  ['T.A. 2', 'Isildur slain; the Ring lost', 'lost', 0],
  ['T.A. c. 2463', 'Déagol finds the Ring', 'found', 0],
  ['T.A. 2941', 'Bilbo finds the Ring', 'found', 0.6],
  ['T.A. 3001', "Bilbo's farewell party", 'carried', 0],
  ['T.A. 3018', 'Frodo leaves Bag End', 'carried', 0.6],
  ['T.A. 3019', 'The Ring is destroyed', 'end', 0],
];
SCENES[3] = function (lt, q) {
  var tS = q('separate');
  // The separation runs at shot time 0.6, as the narration says "choose".
  var s = tourWindow(lt, 'ring', Math.max(0, lt - q('choose') + 0.6), false);
  // The pointer goes to Separate by tags and chooses it.
  var bx = px(739),
    by = py(41);
  var m = smooth((lt - (tS - 1.2)) / 1.0);
  var po = Math.min(P(lt, tS - 1.4, 0.3), 1 - P(lt, q('choose') + 0.6, 0.4));
  var ptr = pointer(lerp(240, bx, m), lerp(120, by, m), { o: po });
  ptr += ripple(bx, by, clamp01((lt - (tS - 0.1)) / 0.5));
  // The track that rose: a gold outline around it once it's there.
  var tp = P(lt, q('rises') + 0.2, 0.6);
  s += outline(30, 262, 1890, 590, tp, { sw: 0.7, rx: 2 });
  // The thread, step by step, in the strip, joined by arcs drawn down it.
  var x0 = 13,
    y0 = 30,
    pitch = 17.2;
  var tLink = q('linked');
  THREAD.forEach(function (r, i) {
    var a = P(lt, q(r[2]) + r[3], 0.5);
    s += stripRow(x0, y0 + i * pitch, r[0], r[1], a);
    s += G(moment(8, y0 + i * pitch - 1.6, { r: 1.5 }), { o: a });
    if (i) {
      var ya = y0 + (i - 1) * pitch + 0.4,
        yb = y0 + i * pitch - 3.6;
      var p = Math.max(a * 0.0, P(lt, tLink + (i - 1) * 0.22, 0.4));
      s += drawPath(
        'M8 ' + ya + 'Q3 ' + (ya + yb) / 2 + ' 8 ' + yb,
        pitch,
        Math.max(p, P(lt, q(r[2]) + r[3] + 0.2, 0.6)),
        'stroke="' + C.arc + '" stroke-width="0.7"',
      );
    }
  });
  // "Each step is linked to the next": the arcs brighten in turn.
  THREAD.forEach(function (r, i) {
    if (!i) return;
    var g = P(lt, tLink + (i - 1) * 0.22, 0.3) * (1 - P(lt, tLink + (i - 1) * 0.22 + 0.5, 0.5));
    if (g <= 0.001) return;
    var ya = y0 + (i - 1) * pitch + 0.4,
      yb = y0 + i * pitch - 3.6;
    s += G(
      '<path d="M8 ' +
        ya +
        'Q3 ' +
        (ya + yb) / 2 +
        ' 8 ' +
        yb +
        '" fill="none" stroke="' +
        C.strong +
        '" stroke-width="1.4"/>',
      { o: g },
    );
  });
  return s + ptr;
};

/* ---------- Scene 4: View mode, the reader's Dating context ---------- */
/* Where the reader's Dating context line sits in each frame (captured pixels). */
var DATING_G = [322, 612, 1096, 652],
  DATING_F = [322, 557, 746, 597];
SCENES[4] = function (lt, q) {
  var tO = q('each') - 0.2,
    tF = q('forging') - 0.6;
  // Shot time: Gondolin opens at 0.5 s; the One Ring forged opens at 6.1 s.
  var st0 = Math.min(5.8, 0.5 + Math.max(-0.5, lt - tO));
  var st1 = 6.1 + 0.3 + Math.max(0, lt - tF);
  var x = P(lt, tF, 0.5);
  // Once the reader is open, the camera moves in on it.
  var z = lerp(1, 1.35, smooth((lt - tO - 0.6) / 1.2));
  CAM.z = z;
  var s = tourWindow(lt, 'reader', st0, false);
  s += zoomed('reader', st0, z, z > 1.001 ? 1 : 0);
  s += zoomed('reader', st1, z, x);
  s += viewModeChip(8, 34, P(lt, 0.3, 0.5));
  // The Dating context line lights on each.
  s += outline(
    DATING_G[0],
    DATING_G[1],
    DATING_G[2],
    DATING_G[3],
    P(lt, q('annals'), 0.5) * (1 - x),
    {
      fill: true,
    },
  );
  s += outline(DATING_F[0], DATING_F[1], DATING_F[2], DATING_F[3], P(lt, q('about'), 0.5), {
    fill: true,
  });
  CAM.z = 1;
  // In the strip: the two moments and how sure their dates are.
  var rows = [
    ['F.A. 510', 'The fall of Gondolin', 'from the later annals', q('fall'), q('annals')],
    ['S.A. c. 1600', 'The One Ring forged', 'about this year', q('forging'), q('about')],
  ];
  rows.forEach(function (r, i) {
    var y = 58 + i * 34;
    var a = P(lt, r[3], 0.5),
      b = P(lt, r[4], 0.5);
    s += stripRow(8, y, r[0], r[1], a);
    s += rise(
      txt(8, y + 13.4, r[2], { size: 5, anchor: 'start', fill: C.soft, weight: 500, italic: true }),
      b,
      3,
    );
  });
  // Disagreements stay visible.
  var d = P(lt, q('visible'), 0.6);
  s += rise(
    rect(8, 132, 62, 18, C.card, { rx: 2, stroke: C.accent, sw: 0.6 }) +
      txt(39, 139.6, 'Dating context', { size: 5, weight: 700, serif: true, fill: C.strong }) +
      txt(39, 146.4, 'kept with the date', { size: 4.8, fill: C.soft, weight: 500 }),
    d,
    4,
  );
  return s;
};

/* ---------- Scene 5: down to the day; two calendars ---------- */
var SHIRE_LINE = [322, 542, 762, 610],
  TA_LINE = [322, 358, 462, 392];
SCENES[5] = function (lt, q) {
  var tZ = q('zoom') - 0.4,
    tO = q('each') - 0.3;
  // Shot time: the zoom runs 0.4–7 s; the reader opens at 8 s.
  var st = lt < tO ? Math.min(7.6, lt - tZ) : 7.7 + Math.max(0, lt - tO);
  var z = lerp(1, 1.35, smooth((lt - tO - 0.8) / 1.2));
  CAM.z = z;
  var s = tourWindow(lt, 'war', st, false);
  s += zoomed('war', st, z, z > 1.001 ? 1 : 0);
  // In the strip: from millennia to days.
  var spans = [
    ['T.A. 1–3021', 'the Third Age', q('millenn')],
    ['T.A. 3018–3019', 'the War of the Ring', q('war')],
  ];
  spans.forEach(function (r, i) {
    s += stripRow(8, 34 + i * 20, r[0], r[1], P(lt, r[2], 0.5));
  });
  // Two calendars for one day.
  var a = P(lt, tO + 0.9, 0.5),
    b = P(lt, q('shire'), 0.5);
  s += rise(
    txt(8, 92, 'One day, two calendars', { size: 5, anchor: 'start', fill: C.soft, weight: 600 }),
    P(lt, tO + 0.6, 0.5),
    3,
  );
  s += rise(
    rect(8, 119, 62, 17, C.card, { rx: 2, stroke: C.accent, sw: 0.6 }) +
      txt(12, 126, 'Shire Reckoning', { size: 4.8, anchor: 'start', fill: C.soft, weight: 500 }) +
      txt(12, 133, 'S.R. 1419, 25 Rethe', { size: 5.6, anchor: 'start', serif: true, weight: 700 }),
    b,
    3,
  );
  s += rise(
    rect(8, 98, 62, 17, C.card, { rx: 2, stroke: C.line, sw: 0.6 }) +
      txt(12, 105, "The Age's own", { size: 4.8, anchor: 'start', fill: C.soft, weight: 500 }) +
      txt(12, 112, 'T.A. 3019', { size: 5.6, anchor: 'start', serif: true, weight: 700 }),
    a,
    3,
  );
  s += outline(SHIRE_LINE[0], SHIRE_LINE[1], SHIRE_LINE[2], SHIRE_LINE[3], b, { fill: true });
  s += outline(TA_LINE[0], TA_LINE[1], TA_LINE[2], TA_LINE[3], a, {});
  CAM.z = 1;
  return s;
};

/* ---------- Scene 6: the whole timeline, small; the end card ---------- */
SCENES[6] = function (lt, q) {
  // The window shrinks to the top of the stage, and the end card rises beneath it.
  var k = smooth((lt - 0.2) / 1.6);
  var w = lerp(WW, 120, k),
    x = lerp(WX, 160 - 60, k),
    y = lerp(WY, 10, k);
  var s = appWindow(x, y, w, 'fit', 0);
  var e = P(lt, q('canon') - 0.2, 0.9);
  s += rise(
    txt(160, 104, 'Keep your canon', { size: 14, weight: 700, serif: true }) +
      wordmark(160, 124, 10) +
      addresses(160, 137, 5.8),
    e,
    6,
  );
  s += rise(
    txt(
      160,
      162,
      'An unofficial fan chronology. Not affiliated with or endorsed by the Tolkien Estate.',
      { size: 4.6, fill: C.soft, weight: 500 },
    ),
    P(lt, q('canon') + 0.5, 0.9),
    3,
  );
  return s;
};
