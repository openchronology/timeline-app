// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 25, Tour: Artificial Intelligence, from Llull to Language Models
   (publicity/25-tour-artificial-intelligence.md): the history of AI timeline (samples/ai.ochx)
   in the real editor, captured (shots.json), in a browser window, in the Neural look, with
   callouts in the strip at its left or under it, never over the app's own text: the whole line,
   reasoning as calculation, the founding and the golden years, the Dartmouth workshop read
   with its sources, the two winters, the neural-network thread separated, the one fact the line
   makes visible (the artificial neuron is older than the transistor), 2012, the Transformer,
   the zoom down to the days of March 2023, and the end card.
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
/** Where a year falls in a captured view [y0, y1]: the canvas runs from captured x 72 to 1845. */
function yearX(view, y) {
  return px(72 + ((y - view[0]) / (view[1] - view[0])) * 1773);
}
/** A row of the left strip: a date over a name. */
function stripRow(y, date, name, p, col) {
  var lines = name.split('\n');
  return rise(
    txt(2, y, date, { size: 5, fill: col || C.accent, anchor: 'start', weight: 700 }) +
      lines
        .map(function (l, i) {
          return txt(2, y + 6.6 + i * 6.4, l, { size: 5.4, anchor: 'start', weight: 600 });
        })
        .join(''),
    p,
    4,
  );
}
/** Rows of the strip from y0, one every pitch, each [date, name, time, colour?]. */
function strip(lt, rows, y0, pitch) {
  var s = '';
  rows.forEach(function (r, i) {
    s += stripRow(y0 + i * (pitch || 20), r[0], r[1], P(lt, r[2], 0.5), r[3]);
  });
  return s;
}
/** A big number over a small word, in the strip. */
function stat(y, n, word, p) {
  return pop(
    txt(10, y, n, { size: 13, fill: C.accent, anchor: 'start', weight: 700 }) +
      txt(10, y + 7.5, word, { size: 5.6, fill: C.soft, anchor: 'start', weight: 600 }),
    p,
    18,
    y - 4,
  );
}
/** A short arrow from (x0, y) to (x1, y), drawn to p, with its head at x1. */
function arrowTo(x0, x1, y, p, col) {
  col = col || C.accent;
  if (p <= 0.01) return '';
  var x = lerp(x0, x1, p),
    dir = x1 > x0 ? 1 : -1;
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
/** A chip of the strip: a word in a rounded card, popping in with p. */
function stripChip(x, y, s, p, col) {
  if (p <= 0.001) return '';
  var w = textWidth(s, 5.6) + 8;
  return rise(
    rect(x, y - 6.4, w, 9, C.card, { rx: 2.5, stroke: col || C.accent, sw: 0.6 }) +
      txt(x + w / 2, y, s, { size: 5.6, weight: 700 }),
    p,
    3,
  );
}

/* Scene 1: the whole line, with what the sample holds. */
SCENES[1] = function (lt, q) {
  return (
    tourWindow(lt, 'sweep', 0, true) +
    stat(42, '82', 'moments', P(lt, q('moments'), 0.5)) +
    stat(70, '9', 'eras, as bands', P(lt, q('bands'), 0.5)) +
    stat(98, '2', 'winters', P(lt, q('winters'), 0.5)) +
    stat(126, '29', 'links', P(lt, q('linked'), 0.5))
  );
};

/* Scene 2: reasoning as calculation (the zoom to 1640–1960). */
SCENES[2] = function (lt, q) {
  var tZ = 0.2,
    st = Math.min(5, ((lt - tZ) * 4.5) / Math.max(2, q('leibniz') - tZ));
  return (
    tourWindow(lt, 'precursors', Math.max(0, st), false) +
    strip(
      lt,
      [
        ['1666', 'Leibniz: a calculus of reason', q('leibniz')],
        ['1843', 'Lovelace: symbols, not\njust numbers', q('lovelace')],
        ['1854', 'Boole: logic as algebra', q(['boole', 'buhl', 'bool'])],
        ['1936', "Turing's universal machine", q('turing')],
      ],
      40,
      24,
    )
  );
};

/* Scene 3: a field gets its name (the zoom to 1945–1975). */
SCENES[3] = function (lt, q) {
  var st = Math.min(5, (lt * 4.5) / Math.max(2, q('dartmouth') - 0.3));
  return (
    tourWindow(lt, 'founding', st, false) +
    strip(
      lt,
      [
        ['1950', 'Can machines think?', q('think')],
        ['1956', 'Dartmouth names the field', q('dartmouth')],
        ['1956–1974', 'the golden years', q('golden'), C.arc],
        ['1958', 'LISP', q('lisp')],
        ['1966', 'ELIZA · Shakey', q('eliza')],
      ],
      36,
      22,
    )
  );
};

/* Scene 4: Dartmouth in the reader (View mode on; the reader scrolls to its sources). */
SCENES[4] = function (lt, q) {
  var tO = q('open') + 0.5;
  var st = lt < tO ? (lt * 3.4) / tO : 3.4 + (lt - tO) * 0.9;
  var s = tourWindow(lt, 'dartmouth', Math.min(10, st), false);
  s += rise(
    rect(8, 28, 12, 6.4, C.accent, { rx: 3.2 }) +
      '<circle cx="16.8" cy="31.2" r="2.4" fill="' +
      C.card +
      '"/>' +
      txt(24, 33.2, 'View mode', { size: 5.6, anchor: 'start', weight: 600 }),
    P(lt, 0.3, 0.5),
    4,
  );
  var rows = [
    ['what happened', q('happened')],
    ['how sure its date is', q('sure')],
    ["its picture's credit", q('credit')],
    ['its sources', q('article')],
  ];
  rows.forEach(function (r, i) {
    var a = P(lt, r[1], 0.5),
      y = 52 + i * 20;
    s += rise(
      txt(10, y, r[0], { size: 5.6, anchor: 'start', weight: 600 }) + arrowTo(10, 66, y + 3, a),
      a,
      3,
    );
  });
  return s;
};

/* Scene 5: two winters (the zoom to 1966–1996). */
SCENES[5] = function (lt, q) {
  var st = Math.min(5, (lt * 4.5) / Math.max(2, q(['lighthill', 'light'])));
  var cold = '#7fd4ff';
  return (
    tourWindow(lt, 'winters', st, false) +
    strip(
      lt,
      [
        ['1973', 'the Lighthill report', q(['lighthill', 'light'])],
        ['1974–1980', '❄ the first AI winter', q('first'), cold],
        ['1980–1987', 'the expert systems boom', q('boom'), C.arc],
        ['1987', 'Lisp machines collapse', q('cheaper')],
        ['1987–1993', '❄ the second AI winter', q('second'), cold],
      ],
      36,
      22,
    )
  );
};

/* Scene 6: one thread (zoom out to 1935–2030, then Separate by tags: neural networks). */
var V_THR = [1935, 2030];
SCENES[6] = function (lt, q) {
  var tS = q('separate') + 0.4;
  var st = lt < tS ? (lt * 2.95) / tS : 2.95 + (lt - tS);
  var s = tourWindow(lt, 'thread', Math.min(6, st), false);
  s += stripChip(8, 40, 'Separate by tags', P(lt, q('separate'), 0.4));
  s += stripChip(8, 52, 'neural networks', P(lt, q('choose'), 0.4), C.arc);
  s += strip(
    lt,
    [
      ['1943', 'a neuron as logic', q(['1943', 'nineteen'])],
      ['1958', 'the perceptron learns', q('rosenblatt')],
      ['1969', 'a book proves its limits', q('book')],
      ['1986', 'backpropagation', q('backpropagation')],
    ],
    70,
    20,
  );
  // Under the window: the empty stretch of the upper track, 1969 to 1980.
  var k = P(lt, q('quiet'), 0.9),
    xa = yearX(V_THR, 1969),
    xb = yearX(V_THR, 1980),
    y = WY + WH + 6;
  s += drawPath(
    'M' + xa + ' ' + (y - 2) + 'V' + y + 'H' + xb + 'V' + (y - 2),
    xb - xa + 4,
    k,
    'stroke="' + C.arc + '" stroke-width="0.9"',
  );
  s += G(txt((xa + xb) / 2, y + 7, '11 quiet years', { size: 5.4, fill: C.arc, weight: 700 }), {
    o: k,
  });
  return s;
};

/* Scene 7: the big idea: older than the transistor, and sixty-nine years to win. */
SCENES[7] = function (lt, q) {
  var s = tourWindow(lt, 'older', 0, false);
  var y = WY + WH + 8;
  var x43 = yearX(V_THR, 1943),
    x47 = yearX(V_THR, 1947.95),
    x12 = yearX(V_THR, 2012.75);
  // The pin: the first transistor, December 1947 (not on this timeline).
  var pin = P(lt, q('transistor') - 0.6, 0.5);
  s += G(
    '<path d="M' +
      x47 +
      ' ' +
      (y - 3) +
      'v6" stroke="' +
      C.amber +
      '" stroke-width="0.8"/>' +
      '<circle cx="' +
      x47 +
      '" cy="' +
      (y - 3.5) +
      '" r="1.6" fill="' +
      C.amber +
      '"/>' +
      txt(x47 + 3, y - 2, 'First transistor, Dec. 1947 (not on this timeline)', {
        size: 4.8,
        anchor: 'start',
        fill: C.amber,
        weight: 600,
      }),
    { o: pin, ty: (1 - pin) * -4 },
  );
  var k = P(lt, q(['sixty', '69']), 1.2),
    yb = y + 7;
  s += drawPath(
    'M' + x43 + ' ' + (yb - 2) + 'V' + yb + 'H' + x12 + 'V' + (yb - 2),
    x12 - x43 + 4,
    k,
    'stroke="' + C.accent + '" stroke-width="0.9"',
  );
  s += G(
    txt((x43 + x12) / 2, yb + 7, '1943 → 2012 · 69 years', {
      size: 6,
      fill: C.accent,
      weight: 700,
    }),
    { o: clamp01((k - 0.5) * 2) },
  );
  s += stat(56, '1943', 'the artificial neuron', P(lt, q('neuron'), 0.5));
  s += stat(90, '1947', 'the first transistor', P(lt, q('transistor'), 0.5));
  s += stat(124, '69', 'years to win', P(lt, q(['sixty', '69']), 0.5));
  return s;
};

/* Scene 8: 2012 (Rejoin; the zoom to 2004–2018, where Deep learning begins). */
SCENES[8] = function (lt, q) {
  var st = Math.min(6, (lt * 4) / Math.max(2, q('imagenet')));
  return (
    tourWindow(lt, 'alexnet', st, false) +
    strip(
      lt,
      [
        ['2012', 'AlexNet wins ImageNet', q(['2012', 'twenty'])],
        ['top-5 error', '15.3% vs 26.2%', q('margin')],
        ['2012 →', 'the Deep learning era', q('deep'), C.arc],
        ['2016', 'AlphaGo beats Lee Sedol', q(['alphago', 'alpha'])],
      ],
      40,
      24,
    )
  );
};

/* Scene 9: the Transformer (the pan and zoom to mid-2016 – 2023). */
SCENES[9] = function (lt, q) {
  var st = Math.min(5, (lt * 4.5) / Math.max(2, q('transformer')));
  return (
    tourWindow(lt, 'transformer', st, false) +
    strip(
      lt,
      [
        ['2017', 'Attention Is All You Need', q('transformer')],
        ['2018–2020', 'GPT, BERT, GPT-2, GPT-3', q('larger')],
        ['30 Nov 2022', 'ChatGPT', q(['chatgpt', 'chat'])],
      ],
      44,
      26,
    )
  );
};

/* Scene 10: down to the days (to Nov 2022 – Dec 2023, then 8–26 March 2023). */
SCENES[10] = function (lt, q) {
  var st = Math.min(9, (lt * 9) / Math.max(4, q('summit') + 0.6));
  var s = tourWindow(lt, 'days', st, false);
  var scale = st < 2.5 ? '7 years' : st < 6.5 ? '13 months' : '18 days';
  s += txt(10, 36, 'the window shows', { size: 4.8, fill: C.soft, anchor: 'start', weight: 600 });
  s += txt(10, 48, scale, { size: 11, fill: C.accent, anchor: 'start', weight: 700 });
  s += strip(
    lt,
    [
      ['2023', 'models from Meta, OpenAI,\nAnthropic and Google', q('meta')],
      ['22 Mar 2023', 'the pause letter', q('pause')],
      ['30 May 2023', 'the statement on AI risk', q('extinction')],
      ['Oct–Nov 2023', 'US order · Bletchley summit', q('executive')],
    ],
    64,
    22,
  );
  return s;
};

/* Scene 11: still being written (zoom out to 2023–2025), then the end card. */
function linkIcon(x, y) {
  return (
    '<g fill="none" stroke="' +
    C.accent +
    '" stroke-width="1.1">' +
    '<rect x="' +
    (x - 6) +
    '" y="' +
    (y - 2.2) +
    '" width="7" height="4.4" rx="2.2"/>' +
    '<rect x="' +
    (x - 1) +
    '" y="' +
    (y - 2.2) +
    '" width="7" height="4.4" rx="2.2"/></g>'
  );
}
SCENES[11] = function (lt, q) {
  var tShrink = q('line') - 0.3;
  var k = smooth((lt - tShrink) / 1.1);
  var w = lerp(WW, 150, k),
    x = lerp(WX, 8, k),
    y = lerp(WY, 46, k);
  var e = P(lt, q.end + 0.7, 0.8),
    gone = P(lt, q.end + 0.1, 0.5);
  var s = G(appWindow(x, y, w, 'end', Math.min(4, lt * 1.2)), { o: 1 - gone });
  if (k < 0.05)
    s += strip(
      lt,
      [
        ['2024', 'Nobel prizes: neural\nnetworks and AlphaFold', q('nobel')],
        ['1 Aug 2024', 'the EU AI Act in force', q('europe')],
      ],
      44,
      26,
    );
  var lines = [
    ['Read it', 'no account needed', q('read'), ICON.browser],
    ['Follow one thread', 'Separate by tags', q('read') + 0.5, null],
    ['Build your own', 'and share a link', q('build'), linkIcon],
  ];
  lines.forEach(function (l, i) {
    var a = Math.min(P(lt, l[2], 0.5), 1 - gone),
      ly = 62 + i * 28,
      icon = l[3]
        ? l[3] === ICON.browser
          ? ICON.browser(173, ly - 7, 14, 10)
          : linkIcon(180, ly - 2)
        : '<circle cx="180" cy="' +
          (ly - 2) +
          '" r="3" fill="none" stroke="' +
          C.arc +
          '" stroke-width="1.1"/><circle cx="180" cy="' +
          (ly - 2) +
          '" r="1" fill="' +
          C.arc +
          '"/>';
    s += rise(
      icon +
        txt(192, ly, l[0], { size: 8, anchor: 'start', weight: 700 }) +
        txt(192, ly + 8, l[1], { size: 5.6, anchor: 'start', fill: C.soft, weight: 500 }),
      a,
      5,
    );
  });
  s += G(
    wordmark(160, 70, 16) +
      txt(160, 96, 'timescale.info/athan/artificial-intelligence', {
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
