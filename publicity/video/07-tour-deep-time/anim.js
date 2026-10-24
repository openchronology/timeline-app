// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 7, Tour: deep time (publicity/7-tour-deep-time.md): the real app, captured, making one
   long zoom from Fit all over Earth's 4.5 billion years down to the second of the Apollo 11
   landing, then changing Time display to Gregorian without moving the view. The callouts,
   the depth gauge and the inset sit around the browser frame. Scenes are pure functions of
   scene time lt; q("word") is when that word is said.

   PATH is the camera: each scene's shots, with keyframed views in million years from 2000 CE
   (the sample's display) at scene times. shots.json is written from it (the same views in
   stored seconds) and captured; the overlays below place themselves with the same views. */

var MYR = 31557600e6, // stored seconds (s since 1970) in a million Julian years
  Y2000 = 946684800,
  APOLLO = (-14182940 - Y2000) / MYR, // the landing, in million years from 2000
  YR = 1e-6, // a year, in million years
  SEC = 1 / MYR;
var V_FIT = [-5448, 908], // Fit all, as the app sets it
  V_EONS = [-4800, -200],
  V_PHAN = [-570, 30],
  V_HUMAN = [-7.6, 0.4],
  V_HIST = [-0.0128, 0.0002],
  V_DECADE = [APOLLO - 6 * YR, APOLLO + 4 * YR],
  V_SECOND = [APOLLO - 4 * SEC, APOLLO + 4 * SEC];

/* The browser frame and where the app's chart lies in its 1920 × 1080 capture. */
var WX = 6,
  WY = 24,
  WW = 250,
  WH = (WW * 9) / 16,
  K = WW / 1920;
var AX0 = 72,
  AX1 = 1851,
  DOT_Y = 373; // the app's axis, in capture pixels (1280 × 720 at 1.5×)
function ux(px) {
  return WX + px * K;
}
function uy(py) {
  return WY + py * K;
}
/** Where stored time t (million years) is across the window, for the view v = [left, right]. */
function atX(v, t) {
  return ux(AX0 + ((t - v[0]) / (v[1] - v[0])) * (AX1 - AX0));
}

/* The camera between keyframes, as capture.mjs moves it: the span geometrically, the centre
   so that the point both views share stays put. */
function between(a, b, p, linear) {
  var s0 = a[1] - a[0],
    s1 = b[1] - b[0],
    c0 = (a[0] + a[1]) / 2,
    c1 = (b[0] + b[1]) / 2;
  var e = linear ? p : p * p * (3 - 2 * p);
  var s = Math.exp(Math.log(s0) + (Math.log(s1) - Math.log(s0)) * e);
  var c =
    Math.abs(s0 - s1) > 1e-12 * Math.max(s0, s1)
      ? c1 + ((c0 - c1) * (s - s1)) / (s0 - s1)
      : c0 + (c1 - c0) * e;
  return [c - s / 2, c + s / 2];
}
function viewAt(keys, t) {
  if (t <= keys[0].t) return keys[0].view;
  for (var i = 1; i < keys.length; i++)
    if (t <= keys[i].t)
      return between(
        keys[i - 1].view,
        keys[i].view,
        (t - keys[i - 1].t) / (keys[i].t - keys[i - 1].t),
        keys[i].ease === 'linear',
      );
  return keys[keys.length - 1].view;
}
function hold(v, t0, t1) {
  return [
    { t: t0, view: v },
    { t: t1, view: v },
  ];
}
/** A move from view a to b between scene times t0 and t1, held before and after. */
function move(a, b, t0, t1, dur) {
  return [
    { t: 0, view: a },
    { t: t0, view: a },
    { t: t1, view: b },
    { t: dur, view: b },
  ];
}

/* Time display → Gregorian, through the real dialog. */
var GREGORIAN_JS =
  "(()=>{const m=document.getElementById('presentation-mode');m.value='gregorian';" +
  "m.dispatchEvent(new Event('change'));const e=document.getElementById('presentation-epoch');" +
  "e.value='unix';e.dispatchEvent(new Event('change'));})()";
/* Once the display reads dates, capture.mjs still writes the bounds in million years: this
   rewrites them as the Gregorian times they are, just before Go reads them. */
var BOUNDS_AS_DATES_JS =
  '(()=>{const iso=(t)=>{const w=Math.floor(t),f=t-w;return new Date(w*1000).toISOString()' +
  ".replace('.000Z','')+(f>0?f.toFixed(6).slice(1):'')+'Z';};window.addEventListener('click'," +
  "(e)=>{if(e.target.id!=='apply-bounds')return;for(const id of ['left-bound','right-bound']){" +
  'const el=document.getElementById(id),m=/^(\\S+) million years$/.exec(el.value);' +
  'if(m)el.value=iso(' +
  Y2000 +
  '+Number(m[1])*' +
  MYR +
  ');}},true);})()';

/** Each scene's shots: { id, from (scene time), dur, keys, setup, actions }. */
function PATH(id, q) {
  var d = q.dur;
  if (id === 1) return [{ id: 's1', from: 0, dur: d, keys: hold(V_FIT, 0, d) }];
  if (id === 2) return [{ id: 's2', from: 0, dur: d, keys: move(V_FIT, V_EONS, 0.6, q.end, d) }];
  if (id === 3) {
    var z3 = q('zoom') - 0.2;
    return [{ id: 's3', from: 0, dur: d, keys: move(V_EONS, V_PHAN, z3, q('cambrian'), d) }];
  }
  if (id === 4) {
    var z4 = q('keep') - 0.1;
    return [{ id: 's4', from: 0, dur: d, keys: move(V_PHAN, V_HUMAN, z4, q('earliest'), d) }];
  }
  if (id === 5) {
    // The narration names farming two seconds in: start the move as the scene opens.
    return [{ id: 's5', from: 0, dur: d, keys: move(V_HUMAN, V_HIST, 0.3, q('farming'), d) }];
  }
  // Scene 6: down to a decade around the landing (the furthest "million years" still reads
  // cleanly: below about a year the ruler can only print offsets like "Δ 1e-13 million
  // years"), change Time display to Gregorian, then on down to the second in dates.
  var c = q('change'),
    split = c + 2.4,
    z6 = q('still') - 0.2,
    z7 = Math.max(split + 0.4, q('moves') + 1.3),
    z7end = Math.min(d - 1, Math.max(z7 + 3.5, q('seconds')));
  return [
    {
      id: 's6a',
      from: 0,
      dur: split,
      keys: move(V_HIST, V_DECADE, z6, Math.min(z6 + 4.5, c - 1.2), split),
      actions: [
        { t: c + 0.1, do: 'click', selector: '#presentation-button' },
        { t: c + 0.9, do: 'eval', js: GREGORIAN_JS },
        { t: c + 1.8, do: 'click', selector: '#presentation-save' },
        { t: c + 1.8, do: 'eval', js: BOUNDS_AS_DATES_JS },
      ],
    },
    {
      id: 's6b',
      from: split,
      dur: d - split,
      keys: move(V_DECADE, V_SECOND, z7 - split, z7end - split, d - split),
      setup: [
        { do: 'click', selector: '#presentation-button' },
        { do: 'eval', js: GREGORIAN_JS },
        { do: 'click', selector: '#presentation-save' },
        { do: 'eval', js: BOUNDS_AS_DATES_JS },
      ],
    },
  ];
}
/** The end card waits for the zoom to land on the second. */
function endCard(q) {
  var sh = PATH(6, q)[1];
  return Math.max(q('one'), sh.from + sh.keys[2].t + 1.4);
}
/** The view and the shot frame at scene time lt. */
function camera(id, q, lt) {
  var shots = PATH(id, q),
    sh = shots[0];
  for (var i = 0; i < shots.length; i++) if (lt >= shots[i].from) sh = shots[i];
  return { id: sh.id, st: lt - sh.from, v: viewAt(sh.keys, lt - sh.from) };
}
function app(cam) {
  return appWindow(WX, WY, WW, cam.id, cam.st, { url: 'deep-time.ochx' });
}

/* ---------- callouts ---------- */
var EONS = [
  ['Hadean', -4567, -4031, '#ae027e', '4,567–4,031', 427],
  ['Archean', -4031, -2500, '#f0047f', '4,031–2,500', 446],
  ['Proterozoic', -2500, -538.8, '#f73563', '2,500–538.8', 466],
  ['Phanerozoic', -538.8, 0, '#9ad9dd', '538.8–today', 446],
];
/** A ring that pulses out from a moment's dot, starting at t0. */
function pulse(x, y, lt, t0, col) {
  var s = '';
  for (var k = 0; k < 2; k++) {
    var p = (lt - t0 - k * 0.55) / 1.1;
    if (p < 0 || p > 1) continue;
    s +=
      '<circle cx="' +
      x.toFixed(2) +
      '" cy="' +
      y.toFixed(2) +
      '" r="' +
      (2 + 6 * ease(p)).toFixed(2) +
      '" fill="none" stroke="' +
      (col || C.select) +
      '" stroke-width="0.8" opacity="' +
      (1 - p).toFixed(3) +
      '"/>';
  }
  // A steady ring while it's being talked about.
  var h = clamp01((lt - t0) / 0.3) * (1 - clamp01((lt - t0 - 2.4) / 0.5));
  if (h > 0)
    s +=
      '<circle cx="' +
      x.toFixed(2) +
      '" cy="' +
      y.toFixed(2) +
      '" r="2.6" fill="none" stroke="' +
      (col || C.select) +
      '" stroke-width="0.7" opacity="' +
      h.toFixed(3) +
      '"/>';
  return s;
}
/** A bracket with ends turned toward the chart (down when dir is 1, up when -1). */
function bracket(x0, x1, y, dir, p, col) {
  var d = 'M' + x0 + ' ' + (y + 3 * dir) + 'V' + y + 'H' + x1 + 'V' + (y + 3 * dir);
  return drawPath(d, x1 - x0 + 6, p, 'stroke="' + (col || C.select) + '" stroke-width="0.8"');
}
/** The right-hand column. */
var COL = 264,
  COLW = 50,
  COLC = COL + COLW / 2;
function colTitle(y, s) {
  return txt(COL, y, s, { size: 4.4, anchor: 'start', fill: C.soft, ls: 0.4, weight: 600 });
}

/* ---------- the depth gauge: the span of the view, on a log scale ---------- */
var GAUGE_Y0 = 52,
  GAUGE_Y1 = 112,
  G_TOP = Math.log10(5e9),
  G_BOT = Math.log10(1 / 31557600);
function gaugeY(years) {
  return lerp(GAUGE_Y0, GAUGE_Y1, (G_TOP - Math.log10(years)) / (G_TOP - G_BOT));
}
function spanText(years) {
  var r = function (x) {
    return x >= 10 ? String(Math.round(x)) : (Math.round(x * 10) / 10).toFixed(1).replace('.0', '');
  };
  if (years >= 1e9) return r(years / 1e9) + ' billion years';
  if (years >= 1e6) return r(years / 1e6) + ' million years';
  if (years >= 1e3) return (Math.round(years / 1e3) * 1e3).toLocaleString('en-US') + ' years';
  if (years >= 2) return Math.round(years) + ' years';
  var s = years * 31557600;
  if (s >= 2 * 86400) return Math.round(s / 86400) + ' days';
  if (s >= 2 * 3600) return Math.round(s / 3600) + ' hours';
  if (s >= 120) return Math.round(s / 60) + ' minutes';
  return Math.round(s) + ' seconds';
}
function gauge(v) {
  var years = (v[1] - v[0]) * 1e6;
  var s = colTitle(30, 'SPAN OF THE VIEW');
  s += txt(COL, 40, spanText(years), { size: 6.6, anchor: 'start', weight: 700, fill: C.accent });
  var gx = COL + 3;
  s +=
    '<path d="M' +
    gx +
    ' ' +
    GAUGE_Y0 +
    'V' +
    GAUGE_Y1 +
    '" stroke="' +
    C.line +
    '" stroke-width="1.2" stroke-linecap="round"/>';
  [
    [1e9, 'a billion years'],
    [1e6, 'a million years'],
    [1e3, 'a thousand years'],
    [1, 'a year'],
    [1 / 365.25, 'a day'],
    [1 / 31557600, 'a second'],
  ].forEach(function (m) {
    var y = gaugeY(m[0]);
    s +=
      '<path d="M' +
      (gx - 1.6) +
      ' ' +
      y.toFixed(2) +
      'h3.2" stroke="' +
      C.soft +
      '" stroke-width="0.6"/>' +
      txt(gx + 5, y + 1.6, m[1], { size: 4.4, anchor: 'start', fill: C.soft, weight: 500 });
  });
  var my = gaugeY(years);
  s +=
    '<path d="M' +
    gx +
    ' ' +
    GAUGE_Y0 +
    'V' +
    my.toFixed(2) +
    '" stroke="' +
    C.accent +
    '" stroke-width="1.2" stroke-linecap="round"/>' +
    '<circle cx="' +
    gx +
    '" cy="' +
    my.toFixed(2) +
    '" r="2" fill="' +
    C.accent +
    '" stroke="' +
    C.ground +
    '" stroke-width="0.7"/>';
  return s;
}

/* ---------- scenes ---------- */
/** The frame stays across cuts (the zoom is one move); the scene's callouts, drawn over it,
    fade in and out with the scene. */
function finish(lt, q, win, over, last) {
  var f = Math.min(P(lt, 0, 0.4), last ? 1 : 1 - clamp01((lt - (q.dur - 0.3)) / 0.3));
  return { svg: '', keep: win + G(over, { o: f }), keepIn: true, keepOut: true };
}
SCENES[1] = function (lt, q) {
  var cam = camera(1, q, lt),
    v = cam.v,
    s = '';
  var a = P(lt, 0.2, 0.9);
  var win = G(app(cam), { o: a, ty: (1 - a) * 10 });
  // The eons light in order, on the app's own bands and in the column.
  var e0 = q('bands');
  s += colTitle(30, 'THE FOUR EONS');
  s += G(
    txt(COL, 37, 'million years ago', { size: 4.4, anchor: 'start', fill: C.soft, weight: 500 }),
    {
      o: P(lt, e0, 0.5),
    },
  );
  EONS.forEach(function (e, i) {
    var p = P(lt, e0 + 0.3 + i * 0.45, 0.5);
    var x0 = atX(v, e[1]),
      x1 = atX(v, e[2]),
      y = uy(e[5]);
    s += G(
      rect(x0 - 0.5, y - 0.6, x1 - x0 + 1, 17 * K + 1.2, 'none', {
        rx: 0.8,
        stroke: C.strong,
        sw: 0.6,
      }),
      { o: p * (1 - 0.6 * P(lt, e0 + 3.2, 0.8)) },
    );
    var ry = 48 + i * 15;
    s += rise(
      rect(COL, ry - 4.6, 3.2, 9, e[3], { rx: 0.8 }) +
        txt(COL + 6, ry, e[0], { size: 5.6, anchor: 'start', weight: 700 }) +
        txt(COL + 6, ry + 6, e[4], {
          size: 4.4,
          anchor: 'start',
          fill: C.soft,
          mono: true,
          weight: 500,
        }),
      p,
      3,
    );
  });
  // The knot at the right edge: the Phanerozoic, where the museum lives.
  var b = P(lt, q(['crammed', 'sliver']), 0.9);
  var bx0 = atX(v, -538.8) - 1,
    bx1 = atX(v, 0) + 1;
  s += bracket(bx0, bx1, 45, 1, b);
  s += G(
    txt((bx0 + bx1) / 2, 40.5, 'everything with bones, leaves or names', {
      size: 5,
      fill: C.select,
      anchor: 'middle',
    }),
    { o: P(lt, q(['crammed', 'sliver']) + 0.4, 0.6) },
  );
  return finish(lt, q, win, s);
};

var FIRST = [
  ['Earth forms', -4540, 'about 4,540 Ma', 'forms'],
  ['Oldest known minerals', -4404, 'about 4,404 Ma', null],
  ['Early life', -3480, 'about 3,480 Ma', 'stromatolites'],
  ['The Great Oxidation', -2400, 'about 2,400 Ma', 'oxygen'],
];
SCENES[2] = function (lt, q) {
  var cam = camera(2, q, lt),
    v = cam.v,
    s = '';
  var tForms = q('forms');
  s += colTitle(30, 'THE FIRST EONS');
  FIRST.forEach(function (m, i) {
    var t0 = m[3] ? q(m[3]) : tForms + 0.9;
    s += pulse(atX(v, m[1]), uy(DOT_Y), lt, t0);
    var ry = 42 + i * 17,
      p = P(lt, t0, 0.5);
    s += rise(
      txt(COL, ry, m[0], {
        size: 5.4,
        anchor: 'start',
        weight: 700,
        fill: lt > t0 && lt < t0 + 3 ? C.select : C.text,
      }) +
        txt(COL, ry + 6.2, m[2], {
          size: 4.4,
          anchor: 'start',
          fill: C.soft,
          mono: true,
          weight: 500,
        }),
      p,
      3,
    );
  });
  // Microbes, from the stromatolites to the Cambrian.
  var t3 = q(['three', '3']),
    b = P(lt, t3 - 0.2, 1);
  var bx0 = atX(v, -3480),
    bx1 = Math.min(WX + WW - 4, atX(v, -538.8));
  s += bracket(bx0, bx1, uy(700), -1, b, C.green);
  s += G(
    txt((bx0 + bx1) / 2, uy(700) + 9, 'Life is microbial for about 3 billion years', {
      size: 5.6,
      fill: C.green,
    }),
    { o: P(lt, t3 + 0.3, 0.6) },
  );
  return finish(lt, q, app(cam), s);
};

/** Scenes 3 to 5: the zoom, the names as they're said, and the depth gauge. */
function zoomScene(id, names, extra) {
  return function (lt, q) {
    var cam = camera(id, q, lt),
      v = cam.v,
      s = '';
    names.forEach(function (m) {
      var x = atX(v, m[0]);
      if (x > WX + 2 && x < WX + WW - 2) s += pulse(x, uy(DOT_Y), lt, q(m[1]));
    });
    var keep = app(cam) + G(gauge(v), { o: id === 3 ? P(lt, q('zoom') - 0.4, 0.6) : 1 });
    if (extra) s += extra(lt, q, v);
    return finish(lt, q, keep, s);
  };
}
SCENES[3] = zoomScene(3, [
  [-538.8, 'cambrian'],
  [-470, 'plants'],
  [-375, 'fish'],
  [-251.902, 'dying'],
  [-233, 'dinosaurs'],
  [-66, 'asteroid'],
]);
SCENES[4] = zoomScene(4, [
  [-7, 'earliest'],
  [-0.3, 'species'],
]);
/* Scene 5's inset: Scene 1's whole line, with a marker where the view now is. */
SCENES[5] = zoomScene(
  5,
  [
    [-0.012, 'farming'],
    [-0.0052, 'writing'],
    [-0.00456, 'pyramids'],
  ],
  function (lt, q) {
    var a = P(lt, q('and') + 0.4, 0.6),
      y = 134,
      x0 = COL,
      x1 = COL + COLW - 2;
    var iv = [-4800, 200];
    var s = colTitle(y - 6, 'WHERE WE ARE');
    s += rect(x0, y - 1.6, x1 - x0, 7.2, C.card, { rx: 1.2, stroke: C.line, sw: 0.5 });
    EONS.forEach(function (e) {
      var ex0 = lerp(x0 + 1, x1 - 1, (e[1] - iv[0]) / (iv[1] - iv[0])),
        ex1 = lerp(x0 + 1, x1 - 1, (e[2] - iv[0]) / (iv[1] - iv[0]));
      s += rect(ex0, y, ex1 - ex0, 4, e[3], { op: 0.9 });
    });
    var mx = lerp(x0 + 1, x1 - 1, (0 - iv[0]) / (iv[1] - iv[0]));
    s +=
      '<path d="M' +
      mx +
      ' ' +
      (y - 3) +
      'V' +
      (y + 7) +
      '" stroke="' +
      C.select +
      '" stroke-width="0.7"/>';
    var tp = q(['space', 'see']);
    s += pulse(mx, y + 2, lt, tp);
    s += pulse(mx, y + 2, lt, tp + 1.6);
    s += txt(x1, y + 13.5, 'we are here', { size: 4.4, anchor: 'end', fill: C.soft, weight: 500 });
    return G(s, { o: a });
  },
);

SCENES[6] = function (lt, q) {
  var cam = camera(6, q, lt),
    v = cam.v,
    s = '';
  var c = q('change'),
    flipped = lt >= c + 1.8;
  // A plumb line through the landing: the ruler changes, the moment doesn't move.
  var ax = atX(v, APOLLO);
  var z7 = PATH(6, q)[1];
  z7 = z7.from + z7.keys[1].t;
  var pl = P(lt, c - 1, 0.5) * (1 - P(lt, z7 + 0.3, 0.6));
  s += G(
    '<path d="M' +
      ax.toFixed(2) +
      ' ' +
      uy(90) +
      'V' +
      uy(985) +
      '" stroke="' +
      C.select +
      '" stroke-width="0.7" stroke-dasharray="2 1.6"/>' +
      txt(ax + 2.5, uy(215), 'the same point', { size: 4.6, anchor: 'start', fill: C.select }),
    // (hidden while the dialog is open)
    { o: pl * (P(lt, c + 2, 0.4) + 1 - P(lt, c - 0.3, 0.3)) },
  );
  // How the landing reads, before and after.
  var ry = 134,
    r = P(lt, c - 1, 0.5);
  var before =
    txt(COL, ry, '−0.000030448', {
      size: 5.6,
      anchor: 'start',
      mono: true,
      fill: C.text,
      weight: 600,
    }) +
    txt(COL, ry + 6.5, 'million years', { size: 4.6, anchor: 'start', fill: C.soft, weight: 500 });
  var after =
    txt(COL, ry, '1969-07-20', {
      size: 5.6,
      anchor: 'start',
      mono: true,
      fill: C.select,
      weight: 600,
    }) +
    txt(COL, ry + 7, '20:17:40 UTC', {
      size: 5.6,
      anchor: 'start',
      mono: true,
      fill: C.select,
      weight: 600,
    });
  var f = P(lt, c + 1.9, 0.5);
  var reading =
    colTitle(ry - 8, 'THE LANDING READS') +
    G(before, { o: 1 - f }) +
    G(after, { o: f, ty: (1 - f) * 3 });
  s += G(reading, { o: r });
  // The end card rises over it all.
  var e = P(lt, endCard(q), 0.9);
  s +=
    G(rect(-20, -1, 360, 200, C.ground), { o: 0.94 * e }) +
    G(wordmark(160, 84, 16), { o: e, ty: (1 - e) * 6 });
  return finish(lt, q, app(cam) + gauge(v), s, true);
};
