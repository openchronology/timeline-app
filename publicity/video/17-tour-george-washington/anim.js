// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 17, Tour: George Washington, 1732–1799 (publicity/17-tour-george-washington.md): the
   biography sample (samples/washington.ochx) in the real editor, captured (shots.json), in a
   browser window, with the Archive look's callouts around the window, never over the app's own
   text: the whole life, his birth in two calendars in the reader, the Virginia boyhood, the
   young officer, eight and a half years in command down to the Ten Crucial Days, the
   resignation, two terms as president, the slavery thread separated by tags, the will in the
   reader, and December 1799. Scenes are pure functions of scene time lt; q("word") is when
   that word is said. */

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
/** Shot time for scene time lt, piecewise linear through anchors [[lt, st], …] (held
    before the first and after the last). */
function track(lt, anchors) {
  if (lt <= anchors[0][0]) return anchors[0][1];
  for (var i = 1; i < anchors.length; i++) {
    var a = anchors[i - 1],
      b = anchors[i];
    if (lt <= b[0]) return lerp(a[1], b[1], (lt - a[0]) / Math.max(0.01, b[0] - a[0]));
  }
  return anchors[anchors.length - 1][1];
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
/** An underline beneath captured pixels x0–x1 at y, drawn to p. */
function underline(x0, x1, y, p) {
  return drawPath(
    'M' + px(x0) + ' ' + py(y) + 'H' + px(x1),
    px(x1) - px(x0),
    p,
    'stroke="' + C.accent + '" stroke-width="0.8"',
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
/** The pointer travelling from (x0, y0) to (x1, y1), pressing at tP and leaving after
    (or staying, with stay). */
function pointerTo(lt, x0, y0, x1, y1, tP, stay) {
  var m = smooth((lt - (tP - 1.2)) / 1.0);
  var o = P(lt, tP - 1.4, 0.3);
  if (!stay) o = Math.min(o, 1 - P(lt, tP + 1.0, 0.4));
  return (
    pointer(lerp(x0, x1, m), lerp(y0, y1, m), { o: o }) +
    (stay ? '' : ripple(x1, y1, clamp01((lt - tP) / 0.5)))
  );
}
/** A pulsing ring at stage point (x, y), from t0. */
function pulse(lt, x, y, t0) {
  if (lt < t0) return '';
  var k = ((lt - t0) % 1.4) / 1.4;
  return (
    '<circle cx="' +
    x +
    '" cy="' +
    y +
    '" r="' +
    (1.6 + 4 * k) +
    '" fill="none" stroke="' +
    C.select +
    '" stroke-width="0.8" opacity="' +
    (1 - k) * P(lt, t0, 0.3) +
    '"/>' +
    '<circle cx="' +
    x +
    '" cy="' +
    y +
    '" r="1.6" fill="' +
    C.select +
    '" opacity="' +
    P(lt, t0, 0.3) +
    '"/>'
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
/** A row of the left strip: a serif date over a name; dim fades it once the next is said. */
function stripRow(y, date, name, p, dim) {
  return G(
    txt(10, y, date, { size: 5, serif: true, fill: C.accent, anchor: 'start', weight: 600 }) +
      txt(10, y + 6.4, name, { size: 5.4, anchor: 'start', weight: 600 }),
    { o: p * (dim === undefined ? 1 : lerp(1, 0.45, dim)), ty: (1 - p) * 4 },
  );
}
/** Rows of the strip from y, step apart, each lit on its cue and dimmed on the next. */
function stripRows(lt, rows, y, step) {
  var s = '';
  rows.forEach(function (r, i) {
    var next = i + 1 < rows.length ? rows[i + 1][2] : 1e9;
    s += stripRow(y + i * step, r[0], r[1], P(lt, r[2], 0.5), P(lt, next, 0.5));
  });
  return s;
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
/** A big serif figure over a caption, in the strip. */
function figure(y, big, caption, p, o) {
  o = o || {};
  return rise(
    txt(10, y, big, {
      size: o.size || 8,
      serif: true,
      fill: o.fill || C.accent,
      anchor: 'start',
      weight: 700,
    }) +
      (caption
        ? txt(10, y + 7, caption, { size: 4.8, fill: C.soft, anchor: 'start', weight: 600 })
        : ''),
    p,
    4,
  );
}

/* ---------- Scene 1: the whole life ---------- */
SCENES[1] = function (lt, q) {
  var s = tourWindow(lt, 'whole', 0, true);
  var stats = [
    [115, 'moments', q('moment')],
    [40, 'durations', q('bands')],
    [40, 'links', q('sources')],
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

/* ---------- Scene 2: born on the eleventh, or the twenty-second ---------- */
/* The reader in the captured frame: its text's left edge, the plugin rows' baselines (under
   each value) and the related entry. */
var BIRTH = {
  edge: 329,
  rows: [
    [560, 1280, 583],
    [560, 755, 616],
    [560, 722, 649],
  ],
  related: [800, 838],
};
SCENES[2] = function (lt, q) {
  // Shot time: the zoom to 1731–1733 (0–2.5 s) plays faster, so that Born at Popes Creek
  // opens (3.2 s) as "the date needs a note" is said; then the reader holds.
  var tO = Math.max(2, q('date'));
  var st = track(lt, [
    [0, 0],
    [tO - 0.4, 2.5],
    [tO, 3.2],
    [tO + 2.5, 5.7],
  ]);
  var s = tourWindow(lt, 'birth', st, false);
  s += viewModeChip(8, 33, P(lt, 0.2, 0.5));
  // The plugin rows, underlined in turn: the calendar, the date as written, the conversion.
  var cues = [q('puts'), q(['written', 'writ']), q('julian')];
  BIRTH.rows.forEach(function (r, i) {
    s += underline(r[0], r[1], r[2], P(lt, cues[i], 0.6));
  });
  // The callout: the same day in both calendars.
  var c1 = P(lt, q(['written', 'writ']), 0.5),
    c2 = P(lt, q(['22', 'twenty']), 0.5);
  s += figure(56, '11 Feb 1731/32', 'Old Style (Julian)', c1, { size: 6.4 });
  s += G(txt(10, 76, '=', { size: 7, serif: true, fill: C.soft, anchor: 'start' }), { o: c2 });
  s += figure(88, '22 Feb 1732', 'Gregorian', c2, { size: 6.4 });
  // The pointer comes to rest on the related entry.
  s += pointerTo(
    lt,
    px(1300),
    py(980),
    px(BIRTH.related[0]),
    py(BIRTH.related[1]) + 1,
    q('switched'),
    true,
  );
  s += figure(116, '11 days', 'dropped in Sep 1752', P(lt, q(['11', 'eleven'], 2), 0.5), {
    size: 7,
  });
  return s;
};

/* ---------- Scene 3: youth ---------- */
SCENES[3] = function (lt, q) {
  // Shot time: 1731–1755 (held to 1.5 s), into 1733–1745 by 5 s, then a slow pan to
  // 1746–1755 by 14 s, from the father's death to Lawrence's.
  var st = track(lt, [
    [0, 0],
    [q('ferry') - 0.4, 3.6],
    [q('father') + 0.6, 5.2],
    [q('surveying'), 8.5],
    [q('barbados'), 11.5],
    [q('lawrence', 2), 13.2],
    [q('vernon'), 14],
  ]);
  var s = tourWindow(lt, 'youth', st, false);
  var rows = [
    ['1738', 'Move to Ferry Farm', q('ferry')],
    ['1743', 'His father dies, at eleven', q('father')],
    ['1748', 'Surveying for Lord Fairfax', q('surveying')],
    ['1751–52', 'In Barbados: smallpox', q('barbados')],
    ['1752', 'Lawrence dies', q('lawrence', 2)],
    ['1754', 'Leases Mount Vernon', q('vernon')],
  ];
  s += stripRows(lt, rows, 30, 19);
  return s;
};

/* ---------- Scene 4: the Virginia Regiment ---------- */
SCENES[4] = function (lt, q) {
  // Shot time: on to 1753–1759 (0–2 s), into the summer of 1754 (3.5–5.5 s), held, back out
  // (7.5–10 s) and a pan to Fort Duquesne (to 12.5 s).
  var st = track(lt, [
    [0, 0],
    [1.6, 2],
    [q(['jumonville', 'juminville', 'glen']) - 2.2, 3.5],
    [q(['jumonville', 'juminville', 'glen']) - 0.2, 5.5],
    [q('braddock') - 2.4, 7.5],
    [q('braddock') + 0.2, 10],
    [q(['duquesne', 'duquess', 'fell']) + 0.4, 12.5],
  ]);
  var s = tourWindow(lt, 'regiment', st, false);
  var rows = [
    ['Oct 1753', 'Mission to the French', q(['twenty', '21'])],
    ['28 May 1754', 'Jumonville Glen', q(['jumonville', 'juminville', 'glen'])],
    ['3 Jul 1754', 'Fort Necessity', q('necessity')],
    ['9 Jul 1755', 'Braddock’s defeat', q('braddock')],
    ['Aug 1755', 'Commanding the Regiment', q('command')],
    ['25 Nov 1758', 'Fort Duquesne taken', q(['duquesne', 'duquess', 'fell'])],
  ];
  s += stripRows(lt, rows, 30, 19);
  return s;
};

/* ---------- Scene 5: eight and a half years ---------- */
SCENES[5] = function (lt, q) {
  // Shot time: the widen to 1774–1784 (0–2 s), held, the long zoom into the ten days (4–10 s),
  // held, and back out to 1777–1782 (11.5–15 s).
  var st = track(lt, [
    [0, 0],
    [1.8, 2],
    [q('ten') - 0.6, 4],
    [q('princeton') + 0.6, 10],
    [q('valley') - 1.6, 11.5],
    [q('yorktown') + 0.4, 15],
  ]);
  var s = tourWindow(lt, 'revolution', st, false);
  var years = P(lt, q('eight'), 0.5),
    days = P(lt, q('crucial'), 0.5),
    out = P(lt, q('valley') - 0.8, 0.5);
  // The counter: eight and a half years, then ten days.
  s += figure(36, '8½ years', 'Jun 1775 – Dec 1783', years * (1 - 0.5 * days), { size: 9 });
  s += G(txt(12, 54, '↓', { size: 7, fill: C.soft, anchor: 'start' }), { o: days });
  s += figure(66, '10 days', '25 Dec 1776 – 3 Jan 1777', days * (1 - 0.5 * out), { size: 9 });
  var ten = [
    ['25 Dec', 'Crossing the Delaware', q('crossing')],
    ['26 Dec', 'Trenton', q('trenton')],
    ['3 Jan 1777', 'Princeton', q('princeton')],
  ];
  s += G(stripRows(lt, ten, 86, 16), { o: 1 - out });
  var after = [
    ['1777–78', 'Valley Forge', q('valley')],
    ['28 Jun 1778', 'Monmouth', q('monmouth')],
    ['19 Oct 1781', 'Yorktown', q('yorktown')],
  ];
  s += G(stripRows(lt, after, 86, 16), { o: out });
  return s;
};

/* ---------- Scene 6: handing it back ---------- */
/* Where the commander-in-chief band ends in the shot's last frame (captured pixels). */
var RESIGN_END = [1325, 684];
SCENES[6] = function (lt, q) {
  // The pan reaches the band's end just before he hands back his commission.
  var st = track(lt, [
    [0, 0],
    [q('handed') - 0.3, 9],
  ]);
  var s = tourWindow(lt, 'newburgh', st, false);
  var rows = [
    ['15 Mar 1783', 'The Newburgh address', q(['newburgh', 'newberg'])],
    ['23 Dec 1783', 'Resigns his commission', q('annapolis')],
  ];
  s += stripRow(36, rows[0][0], rows[0][1], P(lt, rows[0][2], 0.5));
  s += stripRow(66, rows[1][0], rows[1][1], P(lt, rows[1][2], 0.5));
  s += stripLink(36, 66, P(lt, rows[1][2], 0.8));
  s += G(
    txt(10, 86, 'at Annapolis', { size: 4.8, fill: C.soft, anchor: 'start', serif: true }) +
      txt(10, 92, 'and home', { size: 4.8, fill: C.soft, anchor: 'start', serif: true }),
    { o: P(lt, q('home'), 0.5) },
  );
  s += pulse(lt, px(RESIGN_END[0]), py(RESIGN_END[1]), q('handed'));
  return s;
};

/* ---------- Scene 7: two terms ---------- */
SCENES[7] = function (lt, q) {
  var st = track(lt, [
    [0, 0],
    [0.8, 1],
    [q('farewell') + 0.4, 14],
  ]);
  var s = tourWindow(lt, 'presidency', st, false);
  // The two terms, lit in turn.
  var t1 = P(lt, q('president'), 0.5),
    t2 = P(lt, q('two'), 0.5);
  s += rise(chip(8, 30, 'First term', C.blue, { size: 5, solid: t2 < 0.5 }), t1, 3);
  s += rise(chip(8, 43, 'Second term', C.blue, { size: 5, solid: t2 >= 0.5 }), t2, 3);
  var rows = [
    ['1787', 'The Convention', q('convention')],
    ['30 Apr 1789', 'First inauguration', q('president')],
    ['1791', 'The first Bank', q('bank')],
    ['1793', 'Neutrality', q('neutrality')],
    ['1794', 'The Whiskey Rebellion', q('whiskey')],
    ['1794', 'The Jay Treaty', q('jay')],
    ['1796', 'The Farewell Address', q('farewell')],
  ];
  s += stripRows(lt, rows, 57, 13.5);
  return s;
};

/* ---------- Scene 8: one thread, slavery ---------- */
var SEP_BUTTON = [710, 41];
/* The named moments in the separated frame (captured x of each marker in the slavery track):
   His father dies, Buys William Lee, and the group that holds Ona Judge and Hercules. */
var FATHER_X = 410,
  LEE_X = 995,
  ESCAPES_X = 1677;
SCENES[8] = function (lt, q) {
  var tS = q('separate') + 0.3;
  var s = tourWindow(lt, 'slavery', lt - tS + 0.4, false);
  s += rise(chip(8, 30, 'Separate by tags', C.accent, { size: 5.2 }), P(lt, tS - 0.2, 0.5), 4);
  s += rise(
    chip(8, 44, 'slavery', C.accent, { size: 5.2, solid: true }),
    P(lt, q('slavery'), 0.5),
    4,
  );
  var tH = q('hercules');
  var rows = [
    ['1743', 'Ten people, inherited at 11', q('ten')],
    ['1768', 'William Lee', q('william')],
    ['1796', 'Ona Judge', q('judge')],
    ['1797', 'Hercules', tH],
  ];
  s += stripRows(lt, rows, 62, 19);
  s += underCallout(FATHER_X, 'ten people', P(lt, q('ten'), 0.5));
  s += underCallout(LEE_X, 'William Lee', P(lt, q('william'), 0.5));
  s += underCallout(
    ESCAPES_X,
    lt < tH ? 'Ona Judge' : 'Ona Judge, Hercules',
    P(lt, q('judge'), 0.5),
    { anchor: 'end' },
  );
  s += pointerTo(lt, 200, 110, px(SEP_BUTTON[0]), py(SEP_BUTTON[1]), tS);
  return s;
};

/* ---------- Scene 9: the will ---------- */
var WILL = { related: [500, 726] };
SCENES[9] = function (lt, q) {
  // Shot time: the will opens at 0.5 s; Martha frees them is chosen at 5 s, as it's said
  // (the shot waits between).
  var tClick = q('sooner') - 0.4;
  var st = lt < tClick ? Math.min(4.8, lt) : 5 + (lt - tClick);
  var s = tourWindow(lt, 'will', st, false);
  s += viewModeChip(8, 33, 1);
  var rows = [
    ['9 Jul 1799', 'His will', q('will')],
    ['1 Jan 1801', 'Martha frees them', q('sooner')],
  ];
  s += stripRow(52, rows[0][0], rows[0][1], P(lt, rows[0][2], 0.5));
  s += stripRow(80, rows[1][0], rows[1][1], P(lt, rows[1][2], 0.5));
  s += stripLink(52, 80, P(lt, rows[1][2], 0.8));
  s += figure(110, '153', 'dower people, not', P(lt, q(['153', 'hundred']), 0.5), { size: 10 });
  s += G(
    txt(10, 124, 'theirs to free', { size: 4.8, fill: C.soft, anchor: 'start', weight: 600 }),
    { o: P(lt, q(['153', 'hundred']), 0.5) },
  );
  s += pointerTo(lt, px(1300), py(980), px(WILL.related[0]), py(WILL.related[1]), tClick);
  return s;
};

/* ---------- Scene 10: December 1799 ---------- */
SCENES[10] = function (lt, q) {
  var tShrink = q('timeline') - 0.6;
  var st = track(lt, [
    [0, 0],
    [q('snow') + 0.4, 5.5],
  ]);
  var k = smooth((lt - tShrink) / 1.1);
  var w = lerp(WW, 150, k),
    x = lerp(WX, 8, k),
    y = lerp(WY, 46, k);
  var s = appWindow(x, y, w, 'death', st);
  var rows = [
    ['12 Dec', 'A ride in the snow', q('ride')],
    ['14 Dec, 22:30', 'Dies at Mount Vernon', q('died')],
    ['18 Dec', 'Funeral and burial', q('band')],
  ];
  var gone = 1 - P(lt, tShrink - 0.4, 0.4);
  var strip = '';
  rows.forEach(function (r, i) {
    strip += stripRow(36 + i * 24, r[0], r[1], P(lt, r[2], 0.5));
    if (i)
      strip += stripLink(
        36 + (i - 1) * 24,
        36 + i * 24,
        P(lt, Math.max(r[2], rows[i - 1][2]), 0.6),
      );
  });
  s += G(strip, { o: gone });
  // Where the bands of his life end together (captured x 583, in the shot's last frame).
  var ends = P(lt, q('band'), 0.5) * gone;
  if (ends > 0.01)
    s += G(
      '<path d="M' +
        px(583) +
        ' ' +
        py(612) +
        'V' +
        py(736) +
        '" stroke="' +
        C.select +
        '" stroke-width="0.8" stroke-dasharray="1.6 1.2"/>' +
        txt(px(583), py(740) + 5, '14 Dec 1799', {
          size: 4.6,
          serif: true,
          fill: C.accent,
          weight: 700,
        }),
      { o: ends },
    );
  var e = P(lt, tShrink + 0.6, 0.8);
  s += rise(
    wordmark(242, 84, 9) +
      txt(242, 102, 'George Washington, 1732–1799', {
        size: 7,
        serif: true,
        fill: C.text,
        weight: 700,
      }) +
      txt(242, 114, 'timescale.info/athan/george-washington', {
        size: 5,
        mono: true,
        fill: C.accent,
        weight: 600,
      }) +
      txt(242, 128, 'github.com/openchronology/timeline-app', {
        size: 4.8,
        mono: true,
        fill: C.soft,
        weight: 500,
      }),
    e,
    6,
  );
  return s;
};
