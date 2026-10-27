// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 14, Tour: Abraham Lincoln, 1809–1865 (publicity/14-tour-abraham-lincoln.md): the
   biography sample (samples/lincoln.ochx) in the real editor, captured (shots.json), in a
   browser window, with the Archive look's callouts around the window, never over the app's own
   text: the whole life, his homes and his family separated by tags, the frontier and New Salem
   zoomed into, the House Divided speech in the reader, the slavery thread, 1862 to 1865 in
   order, and the night of 14–15 April down to the hour. Scenes are pure functions of scene time
   lt; q("word") is when that word is said. */

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
/** A row of the left strip: a serif date over a name; lit (0–1) darkens it, dim fades it. */
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
/** The control and its tag in the strip, the pointer pressing Separate by tags at tS. */
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

/* ---------- Scene 1: the whole life ---------- */
SCENES[1] = function (lt, q) {
  var s = tourWindow(lt, 'whole', 0, true);
  var stats = [
    [126, 'moments', q(['hundred', '126'])],
    [38, 'durations', q(['thirty', '38'])],
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

/* ---------- Scene 2: where he lived (home separated) ---------- */
/* The home bands in the separated frame (captured pixels): [x0, x1]. */
var HOME_Y = [521, 533];
var PLACES = [
  ['1809–1816', 'Kentucky', ['two', 'kentucky'], 95, 331],
  ['1816–1830', 'Indiana', ['indiana'], 333, 737],
  ['1831–1837', 'New Salem', ['salem'], 782, 955],
  ['1837–1861', 'Springfield', ['springfield'], 957, 1686],
  ['1861–1865', 'Washington', ['washington'], 1688, 1812],
];
SCENES[2] = function (lt, q) {
  var tS = q('separate');
  var s = tourWindow(lt, 'homes', lt - tS + 0.4, false);
  s += separating(lt, tS, q('home'), 'home');
  var times = PLACES.map(function (p) {
    return q(p[2]);
  });
  PLACES.forEach(function (pl, i) {
    var a = P(lt, times[i], 0.5),
      next = i + 1 < times.length ? times[i + 1] : 1e9;
    var dim = P(lt, next, 0.5);
    s += stripRow(64 + i * 18, pl[0], pl[1], a, dim);
    s += outline(pl[3], HOME_Y[0], pl[4], HOME_Y[1], a * (1 - 0.65 * dim));
  });
  // The Lincoln Home: 1844–1861, under its band.
  s += tag(1430, 575, '1844–1861', P(lt, times[3] + 0.4, 0.5));
  return s + separatePointer(lt, tS);
};

/* ---------- Scene 3: Kentucky and Indiana (zoom 1809–1831) ---------- */
SCENES[3] = function (lt, q) {
  // Shot time: the zoom (0–4 s) into 1809–1818 plays as it's said; the pan on to 1828
  // (5–11.5 s) runs from his mother's death to his sister's.
  var tZ = q('zoom') - 0.2,
    tP0 = q('mother') - 2,
    tP1 = q('sister') + 0.5;
  var st =
    lt < tP0 ? Math.min(4.6, lt - tZ) : 5 + 6.5 * smooth((lt - tP0) / Math.max(1, tP1 - tP0));
  var s = tourWindow(lt, 'frontier', st, false);
  var rows = [
    ['Dec 1816', 'Move to Indiana', q('indiana'), 7],
    ['Oct 1818', 'His mother dies', q('mother'), 9],
    ['Dec 1819', 'A stepmother', q('stepmother'), 0],
    ['Jan 1828', 'His sister dies', q('sister'), 0],
    ['Spring 1828', 'Flatboat to New Orleans', q('flatboat'), 19],
  ];
  var age = 0,
    ageT = -1;
  rows.forEach(function (r, i) {
    s += stripRow(64 + i * 18, r[0], r[1], P(lt, r[2], 0.5));
    if (r[3] && lt >= r[2]) {
      age = r[3];
      ageT = r[2];
    }
  });
  // The age counter: the number turns over as each age is named.
  var a = P(lt, q('seven') - 0.2, 0.5);
  var flip = P(lt, ageT, 0.35);
  s += rise(
    card(8, 28, 60, 26, {}) +
      txt(16, 46, 'age', { size: 6, serif: true, fill: C.soft, anchor: 'start', weight: 600 }) +
      G(
        txt(34, 47.5, String(age || 7), {
          size: 14,
          serif: true,
          fill: C.accent,
          anchor: 'start',
          weight: 700,
        }),
        {
          o: flip,
          ty: (1 - flip) * 3,
        },
      ),
    a,
    4,
  );
  return s;
};

/* ---------- Scene 4: New Salem (pan 1831–1837) ---------- */
SCENES[4] = function (lt, q) {
  var s = tourWindow(lt, 'salem', lt - 0.3, false);
  var rows = [
    ['Jul 1831', 'Arrives in New Salem', q(['1831', '1830', 'settles'])],
    ['Spring 1832', 'Captain of volunteers', q('militia')],
    ['Aug 1832', 'Loses his first election', q('loses')],
    ['Aug 1834', 'Elected to the Illinois House', q('wins')],
    ['Sep 1836', 'Licensed to practice law', q('lawyer')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(30 + i * 22, r[0], r[1], P(lt, r[2], 0.5));
  });
  // Lost, then won: the link between the two elections, drawn on "two years later".
  var l = P(lt, q('two'), 0.8);
  var y0 = 30 + 2 * 22,
    y1 = 30 + 3 * 22;
  s += drawPath(
    'M8 ' + (y0 + 2) + 'C2 ' + (y0 + 6) + ' 2 ' + (y1 - 6) + ' 8 ' + (y1 - 3),
    26,
    l,
    'stroke="' + C.arc + '" stroke-width="0.8"',
  );
  s += G(
    txt(68, y0 + 14, 'two years later', {
      size: 4.6,
      fill: C.soft,
      anchor: 'end',
      weight: 500,
      serif: true,
    }),
    {
      o: l,
    },
  );
  return s;
};

/* ---------- Scene 5: one thread, family ---------- */
var EDDIE = [1230, 1347, 563],
  WILLIE = [1377, 1716, 563];
SCENES[5] = function (lt, q) {
  var tS = q('pull') + 0.3;
  var s = tourWindow(lt, 'family', lt - tS + 0.4, false);
  s += separating(lt, tS, q('family'), 'family');
  var rows = [
    ['1842', 'Marries Mary Todd', q('marries')],
    ['1843–1853', 'Four sons', q('four')],
    ['1846–1850', 'Eddie', q('eddie')],
    ['1850–1862', 'Willie', q(['willie', 'willy'])],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(64 + i * 18, r[0], r[1], P(lt, r[2], 0.5));
  });
  var e = P(lt, q('eddie'), 0.5),
    w = P(lt, q(['willie', 'willy']), 0.5);
  s += outline(EDDIE[0], EDDIE[2] - 7, EDDIE[1], EDDIE[2] + 7, e * (1 - 0.6 * w));
  s += outline(WILLIE[0], WILLIE[2] - 7, WILLIE[1], WILLIE[2] + 7, w);
  s += underCallout((EDDIE[0] + EDDIE[1]) / 2, 'not quite four', P(lt, q('before'), 0.5));
  s += underCallout((WILLIE[0] + WILLIE[1]) / 2, 'eleven', P(lt, q(['eleven', '11']), 0.5));
  return s + separatePointer(lt, tS);
};

/* ---------- Scene 6: five years away (zoom 1847–1855) ---------- */
var AWAY_BAND = [712, 716, 1692, 730],
  PEORIA = [1540, 564];
SCENES[6] = function (lt, q) {
  // Shot time: the zoom to 1846–1855 (0–5 s), then on the act, closer to 1853–1855 (6–8.5 s), as the act's effect is said.
  var tPush = q('opens') - 0.5;
  var st = lt < tPush ? Math.min(5.8, lt - 0.2) : 6 + (lt - tPush);
  var s = tourWindow(lt, 'away', st, false);
  var rows = [
    ['1847–1849', 'U.S. House', q('congress')],
    ['1849–1854', 'Away from politics', q('away')],
    ['May 1854', 'Kansas–Nebraska Act', q('kansas')],
    ['Oct 1854', 'Peoria speech', q('peoria')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(30 + i * 24, r[0], r[1], P(lt, r[2], 0.5));
  });
  s += stripLink(30 + 2 * 24, 30 + 3 * 24, P(lt, q('follow'), 0.8));
  s += outline(
    AWAY_BAND[0],
    AWAY_BAND[1],
    AWAY_BAND[2],
    AWAY_BAND[3],
    P(lt, q('away'), 0.5) * (1 - P(lt, tPush, 0.3)),
  );
  s += outline(
    PEORIA[0] - 24,
    PEORIA[1] - 24,
    PEORIA[0] + 24,
    PEORIA[1] + 24,
    P(lt, q('peoria'), 0.5),
    {
      pad: 0,
    },
  );
  return s;
};

/* ---------- Scene 7: read a speech, follow its links ---------- */
/* The reader in the captured frame: the left edge of its text, and where its parts are. */
var READER = { edge: 329, said: 449, sources: 570, related: 690, debates: [560, 690] };
SCENES[7] = function (lt, q) {
  var tO = q('open'),
    tClick = q('debates') + 0.4;
  // Shot time: the speech opens at 0.5 s and the debates are chosen at 5 s; the shot waits
  // between them until the narration reaches the debates.
  var st = lt < tClick ? Math.min(4.8, 0.5 + Math.max(-0.5, lt - tO)) : 5 + (lt - tClick);
  var s = tourWindow(lt, 'reader', st, false);
  s += viewModeChip(8, 33, P(lt, 0.3, 0.5));
  var gone = 1 - P(lt, tClick, 0.4);
  var parts = [
    ['what he said', py(READER.said), q('said')],
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
  s += pointerTo(lt, px(1300), py(950), px(READER.debates[0]), py(READER.debates[1]), tClick);
  // The debates: seven in eight weeks; then the race lost, and two years later.
  var dv = P(lt, q('seven'), 0.5);
  s += rise(
    txt(10, 54, '7 debates', {
      size: 8,
      serif: true,
      fill: C.accent,
      anchor: 'start',
      weight: 700,
    }) +
      txt(10, 62, 'Aug 21 – Oct 15, 1858', {
        size: 4.8,
        fill: C.soft,
        anchor: 'start',
        weight: 600,
      }) +
      txt(10, 69, 'Ottawa to Alton', { size: 4.8, fill: C.soft, anchor: 'start', weight: 600 }),
    dv,
    4,
  );
  var lost = P(lt, q('lost'), 0.5),
    pres = P(lt, q('president'), 0.6);
  s += rise(
    txt(10, 96, '1858', { size: 8, serif: true, fill: C.soft, anchor: 'start', weight: 600 }) +
      txt(10, 103, 'loses the Senate race', {
        size: 4.8,
        fill: C.soft,
        anchor: 'start',
        weight: 500,
      }),
    lost,
    4,
  );
  s += rise(
    txt(10, 120, '1860', { size: 8, serif: true, fill: C.accent, anchor: 'start', weight: 700 }) +
      txt(10, 127, 'president-elect', { size: 4.8, fill: C.text, anchor: 'start', weight: 600 }),
    pres,
    4,
  );
  s += drawPath('M14 106V112', 6, pres, 'stroke="' + C.soft + '" stroke-width="0.6"');
  return s;
};

/* ---------- Scene 8: the war and the argument ---------- */
var PRES_BAND = [229, 1768, 684],
  WAR_BAND = [270, 1762, 722];
SCENES[8] = function (lt, q) {
  var tS = q('separate');
  // The slavery shot widens in 2 s and separates at 2.4 s; played at double speed until then.
  var tW = tS - 0.6;
  var st = lt - tW < 1.2 ? (lt - tW) * 2 : 1.2 + (lt - tW);
  var s = lt < tW ? tourWindow(lt, 'war', 0, false) : tourWindow(lt, 'slavery', st, false);
  // The two bands, bracketed together.
  var b1 = P(lt, q('presidency'), 0.5) * (1 - P(lt, tW, 0.3)),
    b2 = P(lt, q('war'), 0.5) * (1 - P(lt, tW, 0.3));
  s += outline(PRES_BAND[0], PRES_BAND[2] - 7, PRES_BAND[1], PRES_BAND[2] + 7, b1);
  s += outline(WAR_BAND[0], WAR_BAND[2] - 7, WAR_BAND[1], WAR_BAND[2] + 7, b2);
  s += G(
    stripRow(34, 'Mar 1861 – Apr 1865', 'President', 1) +
      txt(10, 48, '4 years, 6 weeks', { size: 4.8, fill: C.soft, anchor: 'start', weight: 500 }) +
      stripRow(62, 'Apr 1861 – Apr 1865', 'Civil War', b2 > 0 ? 1 : 0),
    { o: Math.max(b1, 0) },
  );
  // Then the thread: slavery, from 1837 to 1865.
  var sep = P(lt, tS - 0.2, 0.5);
  s += G(separating(lt, tS, q('slavery'), 'slavery'), { o: sep });
  var rows = [
    ['1837', 'Lincoln–Stone protest', q('protest')],
    ['1865', 'Thirteenth Amendment', q('amendment')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(70 + i * 30, r[0], r[1], P(lt, r[2], 0.5));
  });
  s += stripLink(70, 100, P(lt, q('amendment') - 0.4, 0.8));
  s += G(
    txt(14, 88, 'one argument', {
      size: 4.8,
      fill: C.soft,
      anchor: 'start',
      weight: 500,
      serif: true,
    }),
    {
      o: P(lt, q('argument'), 0.5),
    },
  );
  return s + separatePointer(lt, tS);
};

/* ---------- Scene 9: 1862 to 1865, in the order the links give ---------- */
SCENES[9] = function (lt, q) {
  var tZ = q('zoom') - 0.1,
    tPan = q('new') + 0.8,
    tEnd = q('wins') + 0.2;
  var rate = 11 / Math.max(4, tEnd - tPan);
  var s =
    lt < tPan
      ? tourWindow(lt, 'y1862', lt - tZ, false)
      : tourWindow(lt, 'pan', (lt - tPan) * rate, false);
  var phase = P(lt, q('august') - 0.4, 0.6);
  var first = [
    ['22 Jul 1862', 'Read to the cabinet', q('july')],
    ['17 Sep', 'Antietam', q('antietam')],
    ['22 Sep', 'Preliminary proclamation', q('preliminary')],
    ['1 Jan 1863', 'Emancipation Proclamation', q('new')],
  ];
  first.forEach(function (r, i) {
    var a = P(lt, r[2], 0.5);
    s += G(stripRow(30 + i * 24, r[0], r[1], a), { o: 1 - phase });
    if (i) s += G(stripLink(30 + (i - 1) * 24, 30 + i * 24, a), { o: 1 - phase });
  });
  var second = [
    ['23 Aug 1864', 'The Blind Memorandum', q('august')],
    ['8 Nov 1864', 'Re-elected', q('wins')],
    ['4 Mar 1865', 'Second inaugural', q('inaugural')],
  ];
  second.forEach(function (r, i) {
    var a = P(lt, r[2], 0.5);
    s += stripRow(30 + i * 24, r[0], r[1], a);
    if (i) s += stripLink(30 + (i - 1) * 24, 30 + i * 24, a);
  });
  s += rise(
    txt(10, 112, '“With malice', {
      size: 6.4,
      serif: true,
      anchor: 'start',
      weight: 600,
      fill: C.accent,
    }) +
      txt(10, 120, 'toward none”', {
        size: 6.4,
        serif: true,
        anchor: 'start',
        weight: 600,
        fill: C.accent,
      }),
    P(lt, q('malice'), 0.6),
    4,
  );
  return s;
};

/* ---------- Scene 10: down to the hour ---------- */
var SHOT_X = 368,
  DIES_X = 1567;
SCENES[10] = function (lt, q) {
  var tZ = 0.2,
    rate = 1,
    tT = q('funeral') - 0.2;
  var s =
    lt < tT
      ? tourWindow(lt, 'night', (lt - tZ) * rate, false)
      : tourWindow(lt, 'train', lt - tT, false);
  var rows = [
    ['9 Apr', 'Lee surrenders', q('lee')],
    ['14 Apr, 22:15', "Shot at Ford's Theatre", q('shot')],
    ['15 Apr, 07:22', 'Lincoln dies', q('dies')],
    ['21 Apr – 3 May', 'The funeral train', q('funeral')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(30 + i * 24, r[0], r[1], P(lt, r[2], 0.5));
    if (i) s += stripLink(30 + (i - 1) * 24, 30 + i * 24, P(lt, r[2], 0.6));
  });
  var gone = 1 - P(lt, tT, 0.3);
  s += G(
    underCallout(SHOT_X, '22:15', P(lt, Math.max(q('quarter'), 6.2), 0.5), { mono: true }) +
      underCallout(DIES_X, '07:22', P(lt, Math.max(q('7'), 6.6), 0.5), { mono: true }),
    { o: gone },
  );
  s += rise(
    txt(10, 136, '12 days', { size: 8, serif: true, fill: C.accent, anchor: 'start', weight: 700 }),
    P(lt, q(['twelve', '12']), 0.5),
    4,
  );
  return s;
};

/* ---------- Scene 11: read it, or make your own ---------- */
SCENES[11] = function (lt, q) {
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
      txt(242, 118, 'timescale.info/athan/abraham-lincoln', {
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
