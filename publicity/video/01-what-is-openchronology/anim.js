// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 1, What is OpenChronology? (publicity/1-what-is-openchronology.md): one axis that stays
   on screen, three examples of what it holds, and where it runs. Scenes are pure functions of
   scene time lt; q("word") is when that word is said. */

var AXIS_Y = 92;

SCENES[1] = function (lt, q) {
  var s = '';
  var p = P(lt, 0.2, 1.4);
  s += drawPath('M20 ' + AXIS_Y + 'H300', 280, p, 'stroke="' + C.arc + '" stroke-width="1.1"');
  var items = [
    [70, 'A war', q('war'), 20],
    [160, 'A story', q('story'), 26],
    [250, "A server's logs", q('server'), 20],
  ];
  items.forEach(function (it) {
    var a = P(lt, it[2], 0.6);
    s += G(moment(it[0], AXIS_Y, { label: it[1], h: it[3], labelSize: 8, r: 3.4 }), {
      o: a,
      ty: (1 - a) * -14,
    });
  });
  return s;
};

/* A zoom from three centuries into the night of the Apollo 11 landing. */
var LANDING = -14182940,
  STEP = LANDING + 23915;
SCENES[2] = function (lt, q) {
  var s = '';
  var tz0 = q('zoom') - 0.4,
    tz1 = Math.min(q.end, tz0 + 9);
  var z = smooth((lt - tz0) / (tz1 - tz0));
  var span = lerpLog(330 * 31557600, 9 * 3600, z);
  var centre0 = -4.3e9,
    centre1 = LANDING + 3 * 3600;
  var s0 = 330 * 31557600,
    s1 = 9 * 3600;
  var centre = centre1 + ((centre0 - centre1) * (span - s1)) / (s0 - s1);
  var v = view(20, 300, centre - span / 2, centre + span / 2);
  var x = function (t) {
    return vx(v, t);
  };
  // Durations beneath the axis, moments above.
  var bands = [
    [Date.UTC(1861, 3, 12) / 1000, Date.UTC(1865, 3, 9) / 1000, 'Civil War'],
    [Date.UTC(1941, 11, 7) / 1000, Date.UTC(1945, 8, 2) / 1000, 'World War II'],
    [Date.UTC(1969, 6, 16, 13, 32) / 1000, Date.UTC(1969, 6, 24, 16, 50) / 1000, 'Apollo 11'],
  ];
  var bandsIn = P(lt, 0.2, 0.6);
  bands.forEach(function (b, i) {
    var x0 = Math.max(18, x(b[0])),
      x1 = Math.min(302, x(b[1]));
    if (x1 > 18 && x0 < 302) s += G(band(x0, x1, AXIS_Y + 6 + i * 9, b[2]), { o: bandsIn });
  });
  var moments = [
    [Date.UTC(1776, 6, 4) / 1000, 'Declaration of Independence', 18],
    [Date.UTC(1903, 11, 17) / 1000, 'First powered flight', 28],
    [LANDING, 'The Eagle has landed', 18],
    [STEP, 'First step on the Moon', 30],
  ];
  moments.forEach(function (m, i) {
    var mx = x(m[0]);
    if (mx < 16 || mx > 304) return;
    // Near the end, the landing and the step show their times.
    var sub = z > 0.8 && i >= 2 ? (i === 2 ? '20:17:40 UTC' : '02:56:15 UTC') : '';
    // The first step's label waits until it has drawn apart from the landing's.
    var apart = i === 3 ? clamp01((Math.abs(mx - x(LANDING)) - 30) / 20) : 1;
    s += G(moment(mx, AXIS_Y, { label: apart > 0 ? m[1] : '', h: m[2], sub: sub }), {
      o: P(lt, 0.3 + i * 0.15, 0.5) * (i === 3 ? lerp(0.35, 1, apart) : 1),
    });
  });
  s += axis(v, AXIS_Y, calendarTicks(v.t0, v.t1, 6));
  // The fraction: every time is stored exactly.
  var fp = P(lt, q('fraction'), 0.6);
  s += pop(
    card(232, 128, 70, 30, {}) +
      txt(267, 141, '1/3 s', { size: 11, mono: true, fill: C.accent, weight: 600 }) +
      txt(267, 152, 'stored exactly', { size: 5.5, fill: C.soft }),
    fp,
    267,
    143,
  );
  // The depth of the zoom.
  s += G(
    txt(20, 30, 'span: ' + spanText(span), { size: 6, anchor: 'start', fill: C.soft, mono: true }),
    { o: P(lt, tz0, 0.5) },
  );
  return s;
};
function spanText(span) {
  var y = span / 31557600;
  if (y >= 2) return Math.round(y) + ' years';
  var d = span / 86400;
  if (d >= 2) return Math.round(d) + ' days';
  return Math.round(span / 3600) + ' hours';
}

/* Three small timelines: history, a story, deep time. */
function panel(x, y, w, h, title, inner) {
  return card(x, y, w, h, { title: title, titleSize: 6.2 }) + inner;
}
SCENES[3] = function (lt, q) {
  var s = '',
    w = 92,
    h = 92,
    y = 40;
  var a1 = P(lt, q('students'), 0.6),
    a2 = P(lt, q('writers'), 0.6),
    a3 = P(lt, q('teachers'), 0.6);
  // (1) The United States.
  var v1 = view(14, 92, 1770, 2010),
    ay = y + 50;
  var p1 =
    axis(
      v1,
      ay,
      [
        [1800, '1800'],
        [1900, '1900'],
        [2000, '2000'],
      ],
      { tickSize: 4.4 },
    ) +
    band(vx(v1, 1861), vx(v1, 1865) + 2, ay + 5, '', { h: 5 }) +
    txt(vx(v1, 1863), ay + 16, 'Civil War', { size: 4.4, fill: C.soft }) +
    moment(vx(v1, 1776), ay, { label: '1776', h: 12, labelSize: 4.6 }) +
    moment(vx(v1, 1969), ay, { label: 'Apollo 11', h: 20, labelSize: 4.6 });
  s += G(panel(6, y, w, h, 'The United States', p1), { o: a1, tx: (1 - a1) * -12 });
  // (2) A story: two characters' tracks, linked.
  var bx = 114,
    p2 = '';
  p2 +=
    txt(bx + 8, y + 32, 'Ash', { size: 4.6, anchor: 'start', fill: C.red }) +
    txt(bx + 8, y + 64, 'Mirelle', { size: 4.6, anchor: 'start', fill: C.blue });
  p2 +=
    '<path d="M' +
    (bx + 8) +
    ' ' +
    (y + 42) +
    'H' +
    (bx + w - 8) +
    'M' +
    (bx + 8) +
    ' ' +
    (y + 74) +
    'H' +
    (bx + w - 8) +
    '" stroke="' +
    C.arc +
    '" stroke-width="0.7"/>';
  [22, 40, 66].forEach(function (dx) {
    p2 += moment(bx + dx, y + 42, { color: C.red, r: 2.2 });
  });
  [30, 52, 70].forEach(function (dx) {
    p2 += moment(bx + dx, y + 74, { color: C.blue, r: 2.2 });
  });
  p2 += arc(bx + 22, bx + 70, y + 42, P(lt, q('writers') + 0.6, 0.8), { h: 10, color: C.select });
  s += G(panel(bx, y, w, h, "A story's timeline", p2), { o: a2, ty: (1 - a2) * 10 });
  // (3) Deep time: eon bands and the sliver of human history.
  var cx = 222,
    v3 = view(cx + 8, cx + w - 8, -4600, 0),
    p3 = '';
  var eons = [
    [-4567, -4031, '#ae027e'],
    [-4031, -2500, '#f0047f'],
    [-2500, -538.8, '#f73563'],
    [-538.8, 0, '#9ad9dd'],
  ];
  eons.forEach(function (e) {
    p3 += rect(vx(v3, e[0]), y + 46, vx(v3, e[1]) - vx(v3, e[0]), 8, e[2], { op: 0.85 });
  });
  p3 += txt(cx + 8, y + 66, '4.5 billion years', { size: 4.4, anchor: 'start', fill: C.soft });
  var sliver = vx(v3, -0.3);
  p3 += rect(sliver - 0.4, y + 40, 0.8, 20, C.select);
  var mg = P(lt, q(['slice', 'thin']), 0.8);
  p3 += G(
    ICON.magnifier(sliver - 6, y + 30, 6) +
      txt(sliver + 2, y + 84, 'all of human history', { size: 4.4, fill: C.text, anchor: 'end' }),
    { o: mg },
  );
  s += G(panel(cx, y, w, h, 'Deep time', p3), { o: a3, tx: (1 - a3) * 12 });
  return s;
};

SCENES[4] = function (lt, q) {
  var s = '';
  s += '<path d="M20 30H300" stroke="' + C.arc + '" stroke-width="0.9"/>';
  var icons = [
    [
      70,
      'Website',
      q('website'),
      function (x, y) {
        return ICON.browser(x - 18, y - 13, 36, 24, { url: 'timescale.info' });
      },
    ],
    [
      160,
      'Desktop app',
      q('desktop'),
      function (x, y) {
        return ICON.laptop(x, y, 1.3);
      },
    ],
    [
      250,
      'Offline file',
      q('file'),
      function (x, y) {
        return G(ICON.file(x, y + 1, '.html'), { s: 1.4, cx: x, cy: y });
      },
    ],
  ];
  icons.forEach(function (ic) {
    var a = P(lt, ic[2], 0.5);
    s += pop(ic[3](ic[0], 62) + txt(ic[0], 92, ic[1], { size: 7 }), a, ic[0], 62);
  });
  var gp = P(lt, q('free'), 0.5);
  s += rise(
    chip(
      160 - chipWidth('Free software · GPL v3', { size: 6.5 }) / 2,
      112,
      'Free software · GPL v3',
      C.accent,
      { size: 6.5 },
    ),
    gp,
  );
  // The end card.
  var e = P(lt, q('start'), 0.8);
  s += G(
    rect(0, 0, 320, 180, C.ground, { op: 0.97 }) +
      wordmark(160, 70, 16) +
      txt(160, 92, 'timescale.info', { size: 8, mono: true, fill: C.accent, weight: 500 }) +
      txt(160, 120, 'Next: How to see a timeline', { size: 7.5 }) +
      txt(160, 131, 'and a video for what you do', { size: 6.5, fill: C.soft, weight: 500 }) +
      txt(160, 146, 'github.com/openchronology/timeline-app', {
        size: 5.6,
        mono: true,
        fill: C.soft,
        weight: 500,
      }),
    { o: e },
  );
  return s;
};
