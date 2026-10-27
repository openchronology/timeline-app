// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 22, Tour: The COVID-19 pandemic, 2019–2023 (publicity/22-tour-covid-19.md): the sample
   samples/covid-19.ochx in the real editor, captured (shots.json), in a browser window, with
   the Archive look's callouts around the window, never over the app's own text: the whole
   pandemic, thirty days in January zoomed into, the measures of spring 2020, the counts and
   WHO's estimate, the vaccine thread, Margaret Keenan's dose in the reader, the variants as WHO
   named them, and the end of the emergency. Neutral throughout: dates and sources, as the
   script says. Scenes are pure functions of scene time lt; q("word") is when that word is said. */

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
  return G(appWindow(WX, WY, WW, id, Math.max(0, st)), { o: p, ty: (1 - p) * 10 });
}
/** An outline around captured pixels (x0, y0)–(x1, y1), shown by p. */
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
/** A row of the left strip: a serif date over a name. */
function stripRow(y, date, name, p) {
  return G(
    txt(10, y, date, { size: 5, serif: true, fill: C.accent, anchor: 'start', weight: 600 }) +
      txt(10, y + 6.4, name, { size: 5.4, anchor: 'start', weight: 600 }),
    { o: p, ty: (1 - p) * 4 },
  );
}
/** A one-line row of the strip: a short serif date, then a name. */
function stripLine(y, date, name, p) {
  return G(
    txt(10, y, date, { size: 4.8, serif: true, fill: C.accent, anchor: 'start', weight: 600 }) +
      txt(31, y, name, { size: 5.2, anchor: 'start', weight: 600 }),
    { o: p, ty: (1 - p) * 3 },
  );
}
/** A callout under the window: a tick up to captured x (unless o.noTick), and a label. */
function underCallout(x, label, p, o) {
  o = o || {};
  var X = px(x),
    by = WY + WH;
  return G(
    (o.noTick
      ? ''
      : '<path d="M' +
        X +
        ' ' +
        (by + 1) +
        'V' +
        (by + 4) +
        '" stroke="' +
        C.accent +
        '" stroke-width="0.7"/>') +
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
/** A label inside the window, on a card, at captured pixel (x, y) (its centre, or its start). */
function tag(x, y, label, p, o) {
  o = o || {};
  var w = textWidth(label, 5) + 6;
  var x0 = o.start ? px(x) : px(x) - w / 2;
  return rise(
    rect(x0, py(y) - 4.4, w, 7.4, C.card, { rx: 1.6, stroke: C.accent, sw: 0.6 }) +
      txt(x0 + w / 2, py(y) + 1.4, label, { size: 5, serif: true, fill: C.accent, weight: 700 }),
    p,
    2,
  );
}
/** Separate by tags and its tag, as chips in the strip; the pointer presses the button. */
var SEP_BUTTON = [1031, 27];
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
/** A strip label with an arrow to the reader's text edge at captured y. */
var READER_EDGE = 539;
function pointAt(y, label, p, o) {
  o = o || {};
  var Y = py(y);
  return G(
    txt(10, Y + 1.8, label, { size: 5, anchor: 'start', weight: 600, serif: true }) +
      arrowTo(o.from || 58, px(READER_EDGE) - 1.5, Y, p),
    { o: p },
  );
}

/* ---------- Scene 1: the whole pandemic ---------- */
SCENES[1] = function (lt, q) {
  var s = tourWindow(lt, 'whole', 0, true);
  var stats = [
    [100, 'moments', q('moments')],
    [27, 'durations', q(['bands', 'bans'])],
    [41, 'links', q('linked')],
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

/* ---------- Scene 2: thirty days in January (zoom to 4 Jan – 3 Feb 2020) ---------- */
SCENES[2] = function (lt, q) {
  // The shot zooms in 6 s from the whole span; it starts as the narration says "zoom".
  var tZ = q('zoom') - 0.2;
  var s = tourWindow(lt, 'january', lt - tZ, false);
  // 31 December, just off the left edge once the zoom has arrived.
  var c = P(lt, q('last'), 0.6),
    arrived = P(lt, tZ + 6, 0.6);
  var Y = py(556);
  s += rise(
    txt(10, Y - 12, '31 Dec 2019', {
      size: 6,
      serif: true,
      fill: C.accent,
      anchor: 'start',
      weight: 700,
    }) + txt(10, Y - 5, 'a cluster reported', { size: 5.2, anchor: 'start', weight: 600 }),
    c,
    4,
  );
  s += arrowTo(10, WX - 2, Y, arrived);
  s += G(
    txt(10, Y + 7, 'just before', { size: 4.6, serif: true, fill: C.soft, anchor: 'start' }) +
      txt(10, Y + 13, 'the left edge', { size: 4.6, serif: true, fill: C.soft, anchor: 'start' }),
    { o: arrived },
  );
  // The origin: stated as open, in the look's small serif, under the window.
  s += underCallout(960, 'origin: still under investigation', P(lt, q('came'), 0.6), {
    noTick: true,
    size: 5.6,
  });
  return s;
};

/* ---------- Scene 3: one thread, measures ---------- */
var SPAIN = [460, 552, 730, 566];
SCENES[3] = function (lt, q) {
  var tS = q('separate');
  // The shot widens from January to the year (0–1.6 s) and separates at 2 s: on "separate".
  var s = tourWindow(lt, 'measures', lt - tS + 2, false);
  s += separating(lt, tS, q('measures'), 'measures');
  s += stripRow(62, '11 Mar 2020', 'WHO: a pandemic', P(lt, q('pandemic') - 0.2, 0.5));
  var rows = [
    ['9 Mar', 'Italy', q('italy')],
    ['14 Mar', 'Spain', q('spain')],
    ['17 Mar', 'France', q('france')],
    ['23 Mar', 'England', q('england')],
    ['25 Mar', 'India', q('india')],
    ['23 Mar', 'New Zealand', q('zealand')],
    ['26 Mar', 'South Africa', q('africa')],
  ];
  rows.forEach(function (r, i) {
    s += stripLine(82 + i * 8.4, r[0], r[1], P(lt, r[2], 0.4));
  });
  var o = P(lt, q('olympics'), 0.5);
  s += G(
    stripLine(82 + 7 * 8.4 + 3, '24 Mar', 'Olympics', 1) +
      txt(31, 82 + 8 * 8.4 + 2, 'postponed', { size: 5.2, anchor: 'start', weight: 600 }),
    { o: o, ty: (1 - o) * 3 },
  );
  // Spain's and France's lockdowns share one band at this zoom.
  var g = P(lt, q('spain') + 0.4, 0.5) * (1 - P(lt, q('olympics'), 0.6));
  s += outline(SPAIN[0], SPAIN[1], SPAIN[2], SPAIN[3], g);
  s += underCallout(
    (SPAIN[0] + SPAIN[2]) / 2,
    '+ 1 more: two lockdowns with nearly the same dates',
    g,
    { size: 5, anchor: 'start' },
  );
  return s + separatePointer(lt, tS);
};

/* ---------- Scene 4: what the counts say, and don't ---------- */
var ONE_M = [432, 430, 560, 550],
  SIX_M = [1156, 374, 1288, 450];
SCENES[4] = function (lt, q) {
  var tS = q('pull') + 0.3,
    tO = q('open') - 0.2;
  if (lt < tO) {
    var s = tourWindow(lt, 'counts', lt - tS + 0.4, false);
    s += separating(lt, tS, q('counts'), 'milestone');
    s += outline(ONE_M[0], ONE_M[1], ONE_M[2], ONE_M[3], P(lt, q('one'), 0.5));
    s += outline(SIX_M[0], SIX_M[1], SIX_M[2], SIX_M[3], P(lt, q('six'), 0.5));
    s += rise(
      txt(10, 68, 'confirmed:', {
        size: 5.6,
        serif: true,
        fill: C.accent,
        anchor: 'start',
        weight: 700,
      }) +
        txt(10, 75, 'tested and', { size: 5.2, anchor: 'start', weight: 600 }) +
        txt(10, 81.5, 'reported', { size: 5.2, anchor: 'start', weight: 600 }),
      P(lt, q('tested'), 0.5),
      4,
    );
    return s + separatePointer(lt, tS);
  }
  // The reader: WHO's estimate, its range, its sources.
  var r = tourWindow(lt, 'excess', 0.5 + (lt - tO), false);
  r += viewModeChip(8, 33, P(lt, tO, 0.4));
  r += rise(
    txt(10, 50, '14.9 million', {
      size: 7.6,
      serif: true,
      fill: C.accent,
      anchor: 'start',
      weight: 700,
    }) +
      txt(10, 57, 'excess deaths, 2020–21', {
        size: 4.6,
        fill: C.soft,
        anchor: 'start',
        weight: 600,
      }),
    P(lt, q(['149', 'fourteen', '14']), 0.5),
    4,
  );
  r += pointAt(482, 'range 13.3–16.6 m', P(lt, q('nearly'), 0.5));
  r += pointAt(604, 'its sources', P(lt, q('timeline'), 0.5));
  // "An estimate": the word in the note, outlined, on the narration's last "estimate".
  var e = P(lt, q('estimate', 2) - 0.2, 0.5);
  r += outline(582, 470, 658, 494, e, { pad: 0.4 });
  r += underCallout(620, 'an estimate, not a count', e, { size: 5.6 });
  return r;
};

/* ---------- Scene 5: one thread, vaccines ---------- */
var VBAND = [138, 474, 1480, 488],
  TRIAL_X = 400;
SCENES[5] = function (lt, q) {
  var tS = q('separate'),
    t65 = q(['65', 'sixty']);
  var s = tourWindow(lt, 'vaccines', lt - tS + 0.4, false);
  s += separating(lt, tS, q('vaccine'), 'vaccine');
  s += outline(
    VBAND[0],
    VBAND[1],
    VBAND[2],
    VBAND[3],
    P(lt, q('band'), 0.5) * (1 - 0.6 * P(lt, t65, 0.5)),
  );
  // 65 days: a bracket from the genome (11 Jan) to the first trial dose (16 Mar).
  var x0 = px(VBAND[0]),
    x1 = px(TRIAL_X),
    by = py(312);
  s += drawPath(
    'M' + x0 + ' ' + (by + 2) + 'V' + by + 'H' + x1 + 'V' + (by + 2),
    x1 - x0 + 4,
    P(lt, t65, 0.7),
    'stroke="' + C.accent + '" stroke-width="0.7" fill="none"',
  );
  s += tag(VBAND[0] + 26, 288, '65 days to the first trial dose', P(lt, t65 + 0.4, 0.5), {
    start: true,
  });
  var rows = [
    ['11 Jan 2020', 'Genome published', q('genomes')],
    ['16 Mar 2020', 'First trial dose', q(['16th', 'sixteenth'])],
    ['27 Jul 2020', 'Phase 3 trials', q('july')],
    ['9 Nov 2020', 'First results', q('november')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(62 + i * 19, r[0], r[1], P(lt, r[2], 0.5));
  });
  return s + separatePointer(lt, tS);
};

/* ---------- Scene 6: read a moment, the first dose ---------- */
SCENES[6] = function (lt, q) {
  // The shot opens the reader at 0.4 s; it opens as the narration says "read".
  var tO = q('read');
  var s = tourWindow(lt, 'keenan', lt - tO + 0.4, false);
  s += viewModeChip(8, 33, P(lt, 0.2, 0.5));
  var rows = [
    ['2 Dec 2020', 'UK authorises', q('december')],
    ['8 Dec, 06:31 GMT', 'The first dose', q('six')],
    ['11 Dec 2020', 'US authorises', q('united')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(46 + i * 15, r[0], r[1], P(lt, r[2], 0.5));
  });
  // The UK's authorisation among the related entities.
  s += outline(539, 670, 1381, 703, P(lt, q('december') + 0.3, 0.5) * (1 - P(lt, q('six'), 0.5)), {
    pad: 0.3,
  });
  // How precisely, and where from.
  var pr = P(lt, q('precisely'), 0.5);
  s += outline(539, 520, 1030, 542, pr, { pad: 0.4 });
  s += pointAt(531, 'how precisely', pr, { from: 46 });
  s += pointAt(584, 'where from', P(lt, q('comes'), 0.5), { from: 46 });
  return s;
};

/* ---------- Scene 7: one thread, variants ---------- */
var DELTA_W = [856, 826, 1023, 840],
  OMICRON_W = [1090, 826, 1211, 840];
SCENES[7] = function (lt, q) {
  var OM = ['omicron', 'amakron'];
  var tS = q('separate'),
    tR = q('waves') - 0.2;
  var reading = lt >= tR;
  var s = reading
    ? tourWindow(lt, 'omicron', 0.6 + (lt - tR), false)
    : tourWindow(lt, 'variants', lt - tS + 0.4, false);
  if (!reading) s += separating(lt, tS, q('variants'), 'variant');
  else s += viewModeChip(8, 33, 1);
  var rows = [
    ['Dec 2020', 'Alpha, Beta', q('alpha')],
    ['Jan 2021', 'Gamma', q('gamma')],
    ['May 2021', 'Delta', q('delta')],
    ['31 May', 'Greek letters', q('greek')],
    ['26 Nov', 'Omicron', q(OM)],
  ];
  var y0 = 68;
  s += G(
    txt(10, y0 - 8, 'WHO designates', {
      size: 4.8,
      serif: true,
      fill: C.soft,
      anchor: 'start',
      weight: 600,
    }),
    { o: P(lt, q('designates'), 0.5) },
  );
  rows.forEach(function (r, i) {
    s += stripLine(y0 + i * 9, r[0], r[1], P(lt, r[2], 0.4));
  });
  if (!reading) {
    var d = P(lt, q('delta'), 0.5),
      o = P(lt, q(OM), 0.5);
    s += outline(DELTA_W[0], DELTA_W[1], DELTA_W[2], DELTA_W[3], d * (1 - 0.6 * o));
    s += outline(OMICRON_W[0], OMICRON_W[1], OMICRON_W[2], OMICRON_W[3], o);
    return s + separatePointer(lt, tS);
  }
  // The reader: the Omicron wave among its related entities, dated roughly.
  var r = P(lt, q('roughly') - 0.3, 0.5);
  s += outline(539, 641, 1381, 674, r, { pad: 0.3 });
  s += underCallout(960, 'waves: dated roughly', r, { noTick: true });
  return s;
};

/* ---------- Scene 8: the end of the emergency ---------- */
var PHEIC_END = [1554, 609],
  US_END = [1607, 597];
SCENES[8] = function (lt, q) {
  var tR = q(['1191', 'one', 'eleven']) - 0.4;
  var s;
  if (lt < tR) {
    // The zoom (5 s of shot) plays at 0.75 speed, arriving as "no longer" is said.
    s = tourWindow(lt, 'end', (lt - 0.2) * 0.75, false);
    var e1 = P(lt, q('no'), 0.5),
      e2 = P(lt, q('emergency'), 0.5);
    s += outline(PHEIC_END[0] - 7, PHEIC_END[1] - 8, PHEIC_END[0] + 7, PHEIC_END[1] + 8, e1, {
      pad: 0,
    });
    s += outline(US_END[0] - 7, US_END[1] - 8, US_END[0] + 7, US_END[1] + 8, e2, { pad: 0 });
    s += underCallout(PHEIC_END[0], 'WHO: 5 May', e1, { anchor: 'end', size: 5 });
    s += underCallout(US_END[0], 'US: 11 May', e2, { anchor: 'start', size: 5 });
  } else {
    s = tourWindow(lt, 'pheic-end', 0.5 + (lt - tR), false);
    s += viewModeChip(8, 33, 1);
    var d = P(lt, tR + 0.3, 0.5);
    s += outline(539, 658, 1381, 691, d, { pad: 0.3 });
    s += rise(
      txt(10, 52, '1,191 days', {
        size: 8,
        serif: true,
        fill: C.accent,
        anchor: 'start',
        weight: 700,
      }) +
        txt(10, 59, '30 Jan 2020 – 5 May 2023', {
          size: 4.4,
          fill: C.soft,
          anchor: 'start',
          weight: 600,
        }),
      d,
      4,
    );
    var m = P(lt, q(['7', 'seven']), 0.5);
    s += outline(900, 446, 968, 470, m, { pad: 0.4 });
    s += pointAt(458, 'reported', m, { from: 34 });
    s += stripRow(110, '11 May 2023', 'US emergency ends', P(lt, q('united'), 0.5));
  }
  return s;
};

/* ---------- Scene 9: your class's timeline ---------- */
SCENES[9] = function (lt, q) {
  var k = smooth((lt - 0.2) / 1.1);
  var w = lerp(WW, 150, k),
    x = lerp(WX, 8, k),
    y = lerp(WY, 46, k);
  var s = appWindow(x, y, w, 'whole', 0);
  var lines = [
    ['Read it', 'no account needed', q('anyone')],
    ['Build one', 'a year, a country, a topic', q('build')],
    ['Share it', 'a link, or embedded in your class page', q('share')],
  ];
  lines.forEach(function (l, i) {
    var a = P(lt, l[2], 0.5),
      ly = 34 + i * 17;
    s += rise(
      check(166, ly - 2.4, C.accent) +
        txt(174, ly, l[0], { size: 7.2, serif: true, anchor: 'start', weight: 700 }) +
        txt(174, ly + 7, l[1], { size: 5, anchor: 'start', weight: 600, fill: C.soft }),
      a,
      4,
    );
  });
  var e = P(lt, Math.min(q.end - 0.8, q('share') + 0.8), 0.8);
  s += rise(
    wordmark(240, 104, 9) +
      txt(240, 120, 'timescale.info/athan/covid-19', {
        size: 5.4,
        mono: true,
        fill: C.accent,
        weight: 600,
      }) +
      txt(240, 130, 'github.com/openchronology/timeline-app', {
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
