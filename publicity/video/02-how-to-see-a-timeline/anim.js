// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 2, How to see a timeline (publicity/2-how-to-see-a-timeline.md): one sample timeline,
   "A voyage" (eight moments, two durations, one relationship), stays on screen and is read
   mark by mark, zoomed, panned, searched, opened in the reader, separated by tags and read
   in three time displays. A gesture inset at the lower right shows each gesture with a mouse
   and a fingertip. Scenes are pure functions of scene time lt; q("word") is when that word is
   said. Times in this file's views are in years. */

/* ---------- the sample ---------- */
var AY = 96; // the axis
var TRACK_Y = 60; // the "storm" track when separated by tags
var LANDFALL = 1495.2,
  PORT = 1491.5;
// The four moments that crowd into a summary at the whole-voyage zoom.
var CLUSTER = [
  { t: 1492.3, label: 'First storm', storm: true, h: 16 },
  { t: 1492.55, label: 'Calm seas', storm: false, h: 28 },
  { t: 1492.78, label: 'Mast breaks', storm: true, h: 16 },
  { t: 1493.05, label: 'Second storm', storm: true, h: 28 },
];
// The other four moments.
var SINGLES = [
  { t: PORT, label: 'Leaves port', h: 26, first: true },
  { t: LANDFALL, label: 'Landfall', h: 26 },
  { t: 1499.5, label: 'Fort built', h: 18 },
  { t: 1509, label: 'Home again', h: 18 },
];
var DURS = [
  { t0: PORT, t1: LANDFALL, label: 'The crossing', first: true },
  { t0: 1505.5, t1: 1509, label: 'The voyage home' },
];

/* ---------- views (years → x) ---------- */
function V(t0, t1, x0, x1) {
  return { t0: t0, t1: t1, x0: x0 === undefined ? 20 : x0, x1: x1 === undefined ? 300 : x1 };
}
var FIT = V(1488, 1512); // Fit all: the whole voyage
var MID = V(1494.5 - 7.78, 1494.5 + 7.78); // a first step in
var ZOOM = V(1492.675 - 0.575, 1492.675 + 0.575); // the summary opened
var PAN = V(ZOOM.t0 - 0.75, ZOOM.t1 - 0.75); // dragged right
var FOUND = V(LANDFALL - 105 / 20, LANDFALL - 105 / 20 + 14); // Search found Landfall
var S6 = V(1491.0, 1495.8, 10, 156); // the crossing, in the left half
/** Zooms from view a to b: the span changes geometrically, the centre with it. */
function vz(a, b, p) {
  var sa = a.t1 - a.t0,
    sb = b.t1 - b.t0,
    ca = (a.t0 + a.t1) / 2,
    cb = (b.t0 + b.t1) / 2,
    span,
    c;
  if (Math.abs(sa - sb) < 1e-9) {
    span = sa;
    c = lerp(ca, cb, p);
  } else {
    span = lerpLog(sa, sb, p);
    c = cb + ((ca - cb) * (span - sb)) / (sa - sb);
  }
  return V(c - span / 2, c + span / 2, lerp(a.x0, b.x0, p), lerp(a.x1, b.x1, p));
}
function shift(v, dt) {
  return V(v.t0 + dt, v.t1 + dt, v.x0, v.x1);
}
function scaleOf(v) {
  return (v.x1 - v.x0) / (v.t1 - v.t0);
}
/** Rises 0 → 1 → 0 over d seconds from t0. */
function bump(lt, t0, d) {
  var x = (lt - t0) / d;
  return x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x);
}

/* ---------- the ruler ---------- */
/** Decade, year and month ticks for view v at y; labels fade in as there's room for them.
    o.reveal(x) fades each tick in along the axis; o.hl (0–1) lights the labels. */
function ruler(v, y, o) {
  o = o || {};
  var k = scaleOf(v),
    s = '';
  var reveal =
    o.reveal ||
    function () {
      return 1;
    };
  var labCol = o.hl ? mix(C.soft, C.accent, o.hl) : C.soft;
  function tick(t, label, markOp, labOp) {
    var x = vx(v, t);
    if (x < v.x0 - 0.5 || x > v.x1 + 0.5) return;
    var r = reveal(x);
    if (r <= 0) return;
    s += G(
      '<path d="M' + x + ' ' + (y - 1.8) + 'v3.6" stroke="' + C.arc + '" stroke-width="0.7"/>',
      { o: markOp * r },
    );
    if (label && labOp > 0.01)
      s += G(txt(x, y + 9, label, { size: 5, fill: labCol, weight: 500 }), { o: labOp * r });
  }
  var y0 = Math.floor(v.t0),
    y1 = Math.ceil(v.t1);
  var decLab = clamp01((k * 10 - 20) / 10),
    yrMark = clamp01((k - 2.5) / 3),
    yrLab = clamp01((k - 22) / 10),
    moMark = clamp01((k / 12 - 2.5) / 3),
    moLab = clamp01((k / 12 - 15) / 5);
  for (var yr = y0; yr <= y1; yr++) {
    if (yr % 10 === 0) tick(yr, String(yr), 1, Math.max(decLab, yrLab));
    else if (yrMark > 0) tick(yr, String(yr), yrMark, yrLab);
    if (moMark > 0) for (var m = 1; m < 12; m++) tick(yr + m / 12, MONTHS[m], moMark * 0.8, moLab);
  }
  return s;
}

/* ---------- the timeline ---------- */
function stemLabel(x, y, h, label, op) {
  if (op <= 0.01) return '';
  return G(
    '<path d="M' +
      x +
      ' ' +
      y +
      'V' +
      (y - h) +
      '" stroke="' +
      mix(C.moment, C.ground, 0.35) +
      '" stroke-width="0.6"/>' +
      txt(x, y - h - 2, label, { size: 5.6, weight: 600 }),
    { o: op },
  );
}
function pulse(x, y, p, r0) {
  if (p <= 0 || p >= 1) return '';
  r0 = r0 || 3;
  return (
    '<circle cx="' +
    x +
    '" cy="' +
    y +
    '" r="' +
    (r0 + 7 * p).toFixed(2) +
    '" fill="none" stroke="' +
    C.accent +
    '" stroke-width="0.8" opacity="' +
    (1 - p).toFixed(3) +
    '"/>'
  );
}
var CLIP_N = 0;
/** "A voyage" in view v. o: show {moments, others, crossing, home, summary, arc} (0–1 each,
    default 1), pulses {moment, band, summary, arc} (0–1 progress), ring (a title), sep (0–1,
    the storm moments lifted into their own track), ty (vertical pan), axisP (the axis
    drawing in), reveal and hl (the ruler's), dim (0–1, fades the marks but not the ruler). */
function voyage(v, o) {
  o = o || {};
  var sh = o.show || {};
  var show = function (k) {
    return sh[k] === undefined ? 1 : sh[k];
  };
  var pl = o.pulses || {};
  var sep = o.sep || 0;
  var x = function (t) {
    return vx(v, t);
  };
  var edge = function (cx, w) {
    return clamp01((cx - w / 2 - (v.x0 - 6)) / 6) * clamp01((v.x1 + 6 - cx - w / 2) / 6);
  };
  var id = 'vclip' + CLIP_N++;
  var marks = '';
  // Durations beneath the ruler.
  DURS.forEach(function (d) {
    var op = show(d.first ? 'crossing' : 'home');
    var x0 = Math.max(v.x0 - 2, x(d.t0)),
      x1 = Math.min(v.x1 + 2, x(d.t1));
    if (op > 0 && x1 > x0) marks += G(band(x0, x1, AY + 14, d.label), { o: op });
  });
  if (pl.band > 0 && pl.band < 1) {
    var bx0 = x(DURS[0].t0),
      bx1 = x(DURS[0].t1);
    marks += rect(bx0 - 1, AY + 13, bx1 - bx0 + 2, 9, 'none', {
      rx: 2,
      stroke: C.accent,
      sw: 0.8,
      op: 1 - pl.band,
    });
  }
  // The relationship: Leaves port to Landfall, above the axis.
  var ax0 = x(PORT),
    ax1 = x(LANDFALL);
  // Drawn while both its ends are on screen; zoomed far in, a long shallow arc would read as
  // a second axis.
  var inView = function (ax) {
    return clamp01((ax - v.x0 + 24) / 16) * clamp01((v.x1 + 24 - ax) / 16);
  };
  var arcOp = show('arc') > 0 ? Math.min(inView(ax0), inView(ax1)) : 0;
  if (arcOp > 0) {
    marks += G(
      arc(ax0, ax1, AY, show('arc'), {
        h: Math.min(12, (ax1 - ax0) * 0.3),
        color: pl.arc > 0 && pl.arc < 1 ? mix(C.accent, C.arc, pl.arc) : C.arc,
        w: pl.arc > 0 && pl.arc < 1 ? 0.9 + 0.8 * (1 - pl.arc) : 0.9,
      }),
      { o: arcOp },
    );
  }
  // Single moments.
  var dots = '';
  SINGLES.forEach(function (m) {
    var op = show(m.first ? 'moments' : m.label === 'Landfall' ? 'crossing' : 'others');
    if (op <= 0) return;
    var mx = x(m.t);
    var la = edge(mx, textWidth(m.label, 5.6));
    var h = o.stems ? Math.min(m.h, o.stems) : m.h;
    marks += G(stemLabel(mx, AY, h, m.label, la), { o: op, ty: (1 - op) * -6 });
    dots += G(moment(mx, AY, { ring: o.ring === m.label }), { o: op });
    if (m.first) dots += pulse(mx, AY, pl.moment);
  });
  // The four that crowd together: a summary until there's room to draw them apart.
  var sop = show('summary');
  if (sop > 0) {
    var xs = CLUSTER.map(function (m) {
      return x(m.t);
    });
    var gap = Infinity;
    for (var i = 1; i < xs.length; i++) gap = Math.min(gap, xs[i] - xs[i - 1]);
    var split = clamp01((gap - 5.5) / 1.5);
    var xc =
      xs.reduce(function (a, b) {
        return a + b;
      }, 0) / xs.length;
    var labOp = clamp01((gap - 30) / 8);
    CLUSTER.forEach(function (m, j) {
      var mx = lerp(xc, xs[j], split);
      var my = m.storm ? lerp(AY, TRACK_Y, sep) : AY;
      var la = labOp * edge(mx, textWidth(m.label, 5.6));
      marks += G(stemLabel(mx, my, m.h, m.label, la), { o: sop });
      dots += G(moment(mx, my, {}), { o: sop * split });
    });
    if (split < 1)
      dots += G(summary(xc, AY, CLUSTER.length), {
        o: sop * (1 - split),
        s: lerp(1, 0.6, split),
        cx: xc,
        cy: AY,
      });
    dots += pulse(xc, AY, pl.summary, 4.4);
  }
  var axisLine;
  var ap = o.axisP === undefined ? 1 : o.axisP;
  axisLine = drawPath(
    'M' + v.x0 + ' ' + AY + 'H' + v.x1,
    v.x1 - v.x0,
    ap,
    'stroke="' + C.arc + '" stroke-width="0.9"',
  );
  var track = '';
  if (sep > 0)
    track = G(
      '<path d="M' +
        v.x0 +
        ' ' +
        TRACK_Y +
        'H' +
        v.x1 +
        '" stroke="' +
        C.arc +
        '" stroke-width="0.7" stroke-dasharray="2 1.5"/>' +
        chip(v.x0, TRACK_Y - 9, 'storm', C.select, { size: 5 }),
      { o: sep },
    );
  var body =
    track +
    axisLine +
    ruler(v, AY, { reveal: o.reveal, hl: o.hl }) +
    G(marks + dots, { o: o.dim === undefined ? 1 : 1 - o.dim });
  return G(
    '<clipPath id="' +
      id +
      '"><rect x="' +
      (v.x0 - 4) +
      '" y="-20" width="' +
      (v.x1 - v.x0 + 8) +
      '" height="220"/></clipPath><g clip-path="url(#' +
      id +
      ')">' +
      body +
      '</g>',
    { ty: o.ty || 0 },
  );
}
function title() {
  return txt(8, 12, 'A voyage', { size: 9, anchor: 'start', weight: 700 });
}

/* ---------- the legend (Act 1) ---------- */
var LEG = { x: 246, y: 4, w: 68, h: 62 };
function legend(rows) {
  var s = card(LEG.x, LEG.y, LEG.w, LEG.h, { title: 'Legend', titleSize: 6 });
  var gx = LEG.x + 9,
    lx = LEG.x + 18;
  var glyphs = [
    function (y) {
      return moment(gx, y, {});
    },
    function (y) {
      return band(gx - 5, gx + 5, y - 2.5, '', { h: 5 });
    },
    function (y) {
      return summary(gx, y, 4, { r: 3.8 });
    },
    function (y) {
      return arc(gx - 5, gx + 5, y + 2, 1, { h: 4 });
    },
  ];
  ['Moment', 'Duration', 'Summary', 'Relationship'].forEach(function (name, i) {
    var p = rows[i] || 0;
    var y = LEG.y + 22 + i * 10.5;
    s += rise(glyphs[i](y) + txt(lx, y + 2, name, { size: 5.6, anchor: 'start' }), p, 3);
  });
  return s;
}

/* ---------- the gesture inset: mouse and fingertip ---------- */
var INS = { x: 252, y: 126, w: 62, h: 44 };
function mouseBody(x, y, wheel) {
  return (
    rect(x - 5.5, y - 8.5, 11, 17, C.card, { rx: 5.5, stroke: C.soft, sw: 0.7 }) +
    '<path d="M' +
    x +
    ' ' +
    (y - 8.5) +
    'v6" stroke="' +
    C.soft +
    '" stroke-width="0.6"/>' +
    rect(x - 0.8, y - 6.6, 1.6, 3.2, wheel ? C.accent : C.soft, { rx: 0.8 })
  );
}
function insetMode(mode, lt, keys) {
  var lx = INS.x + 15.5,
    rx = INS.x + 46.5,
    cy = INS.y + 18;
  var ph = (lt * 0.8) % 1;
  var s = '';
  var labels = function (a, b) {
    return (
      txt(lx, INS.y + 40, a, { size: 4.4, fill: C.soft, weight: 500 }) +
      txt(rx, INS.y + 40, b, { size: 4.4, fill: C.soft, weight: 500 })
    );
  };
  var divider =
    '<path d="M' +
    (INS.x + 31) +
    ' ' +
    (INS.y + 6) +
    'V' +
    (INS.y + 36) +
    '" stroke="' +
    C.faint +
    '" stroke-width="0.6"/>';
  if (mode === 'zoom') {
    var sp = (lt * 1.6) % 1;
    s += mouseBody(lx, cy + 3, true);
    for (var k = 0; k < 2; k++) {
      var cp = (sp + k * 0.5) % 1;
      s += G(
        '<path d="M' +
          (lx - 2) +
          ' ' +
          (cy - 7 - cp * 4) +
          'l2-1.8 2 1.8" fill="none" stroke="' +
          C.accent +
          '" stroke-width="0.7"/>',
        { o: Math.sin(Math.PI * cp) },
      );
    }
    var d = lerp(3.6, 9, smooth(ph < 0.75 ? ph / 0.75 : 1));
    var fo = ph < 0.85 ? 1 : (1 - ph) / 0.15;
    s += G(finger(rx - d, cy, 0) + finger(rx + d, cy, 0), { o: fo });
    s += labels('scroll', 'pinch');
    s += divider;
  } else if (mode === 'drag' || mode === 'dragv') {
    var dp = smooth(ph < 0.8 ? ph / 0.8 : 1),
      fo2 = ph < 0.85 ? 1 : (1 - ph) / 0.15;
    var hz = mode === 'drag';
    var dx = hz ? lerp(-7, 7, dp) : 0,
      dy = hz ? 0 : Math.sin(dp * Math.PI * 2) * 6;
    s += G(pointer(lx - 2 + dx, cy - 5 + dy), { o: fo2 });
    s += G(finger(rx + dx, cy + dy, 0), { o: fo2 });
    s +=
      '<path d="M' +
      (hz ? lx - 8 + ' ' + (cy + 9) + 'h16' : lx + 7 + ' ' + (cy - 7) + 'v14') +
      '" stroke="' +
      C.faint +
      '" stroke-width="1"/>';
    s += labels('drag', 'drag');
    s += divider;
  } else if (mode === 'tap') {
    var tp = (lt * 0.9) % 1;
    s += pointer(lx - 2, cy - 4);
    if (tp < 0.6) s += pulse(lx - 2, cy - 4, tp / 0.6, 1.5);
    s += finger(rx, cy, tp < 0.6 ? tp / 0.6 : 0);
    s += labels('click', 'tap');
    s += divider;
  } else if (mode === 'keys') {
    var w = 0,
      ws = keys.map(function (kk) {
        return Math.max(9, textWidth(kk, 6, true) + 6);
      });
    ws.forEach(function (ww) {
      w += ww + 4;
    });
    w -= 4;
    var kx = INS.x + INS.w / 2 - w / 2;
    var which = Math.floor((lt * 1.6) % keys.length);
    keys.forEach(function (kk, i) {
      var down = keys.length === 1 ? bump((lt * 1.2) % 1, 0, 0.5) : i === which ? 1 : 0;
      s += G(keycap(kx, cy + 2, kk), { ty: down * 0.8 });
      if (down > 0)
        s += rect(kx, cy - 5 + down * 0.8, ws[i], 10, C.accent, { rx: 1.6, op: 0.18 * down });
      kx += ws[i] + 4;
    });
    s += txt(INS.x + INS.w / 2, INS.y + 40, 'keyboard', { size: 4.4, fill: C.soft, weight: 500 });
  }
  return s;
}
/** The inset over segments [[start, mode, keys]]; shown from the first start to `end`. */
function inset(lt, segs, end) {
  if (!segs.length || lt < segs[0][0] - 0.4) return '';
  var op = P(lt, segs[0][0] - 0.3, 0.4) * (end === undefined ? 1 : 1 - P(lt, end, 0.4));
  var s = card(INS.x, INS.y, INS.w, INS.h, {});
  var cur = 0;
  for (var i = 0; i < segs.length; i++) if (lt >= segs[i][0]) cur = i;
  var p = cur === 0 ? 1 : P(lt, segs[cur][0], 0.35);
  if (cur > 0 && p < 1) s += G(insetMode(segs[cur - 1][1], lt, segs[cur - 1][2]), { o: 1 - p });
  s += G(insetMode(segs[cur][1], lt, segs[cur][2]), { o: cur === 0 ? 1 : p });
  return G(s, { o: op });
}

/* ---------- Act 1 · The marks ---------- */
SCENES[1] = function (lt, q) {
  var ap = P(lt, 0.3, 1.6);
  var reveal = function (x) {
    return P(lt, 0.9 + ((x - 20) / 280) * 1.4, 0.4);
  };
  var hl = bump(lt, q('ruler'), 1.4);
  var keep =
    G(title(), { o: P(lt, 0.2, 0.6) }) +
    voyage(FIT, {
      show: { moments: 0, others: 0, crossing: 0, home: 0, summary: 0, arc: 0 },
      axisP: ap,
      reveal: reveal,
      hl: hl,
    }) +
    G(legend([]), { o: P(lt, 0.8, 0.6) });
  var s = '';
  var e = P(lt, q('earlier'), 0.5),
    l = P(lt, q('later'), 0.5);
  s += G(
    '<path d="M38 128H24m3-2.2L24 128l3 2.2" fill="none" stroke="' +
      C.soft +
      '" stroke-width="0.8"/>' +
      txt(42, 130, 'earlier', { size: 6, anchor: 'start', fill: C.soft }),
    { o: e, tx: (1 - e) * 6 },
  );
  s += G(
    '<path d="M282 128H296m-3-2.2L296 128l-3 2.2" fill="none" stroke="' +
      C.soft +
      '" stroke-width="0.8"/>' +
      txt(278, 130, 'later', { size: 6, anchor: 'end', fill: C.soft }),
    { o: l, tx: (1 - l) * -6 },
  );
  return { svg: s, keep: keep, keepOut: true };
};

SCENES[2] = function (lt, q) {
  var tm = q('dot'),
    tb = q('band'),
    ts = q('number'),
    ta = q('arc');
  var lm = q('moment'),
    ld = q('duration'),
    ls = q('summary'),
    lr = q('relationship');
  var keep =
    title() +
    voyage(FIT, {
      show: {
        moments: P(lt, tm, 0.6),
        others: P(lt, tm + 0.9, 0.8),
        crossing: P(lt, tb, 0.6),
        home: P(lt, tb + 0.9, 0.8),
        summary: P(lt, ts, 0.6),
        arc: P(lt, ta, 1.0),
      },
      pulses: {
        moment: clamp01((lt - tm - 0.3) / 1.0),
        band: clamp01((lt - tb - 0.3) / 1.0),
        summary: clamp01((lt - ts - 0.3) / 1.0),
        arc: clamp01((lt - ta - 0.6) / 1.2),
      },
    }) +
    legend([P(lt, lm, 0.5), P(lt, ld, 0.5), P(lt, ls, 0.5), P(lt, lr, 0.5)]);
  return { svg: '', keep: keep, keepIn: true, keepOut: true };
};

/* ---------- Act 2 · Moving around ---------- */
/** Scene 3's view at lt: two steps of zoom, a drag, then the keys' nudges. */
function s3View(lt, q) {
  var z1a = q('scroll'),
    z1b = Math.max(z1a + 1.2, q('side', 2)),
    z2a = q('zoom', 2) - 0.2,
    z2b = Math.max(z2a + 2.5, q('inside') + 0.5);
  var v = vz(FIT, MID, smooth((lt - z1a) / (z1b - z1a)));
  if (lt > z2a) v = vz(MID, ZOOM, smooth((lt - z2a) / (z2b - z2a)));
  var td = q('drag');
  if (lt > td) v = shift(v, -0.75 * smooth((lt - td - 0.2) / 2.0));
  var tk = q('arrow');
  v = shift(v, 0.12 * Math.sin(Math.PI * 2 * clamp01((lt - tk - 0.2) / 1.6)));
  var tz = q('plus');
  var zb = bump(lt, tz + 0.1, 1.8);
  if (zb > 0) {
    var c = (v.t0 + v.t1) / 2,
      half = ((v.t1 - v.t0) / 2) * (1 - 0.25 * zb);
    v = V(c - half, c + half);
  }
  return v;
}
SCENES[3] = function (lt, q) {
  var v = s3View(lt, q);
  var tu = q('up');
  var ty = -7 * Math.sin(Math.PI * 2 * clamp01((lt - tu - 0.1) / 1.6));
  var keep = title() + G(legend([1, 1, 1, 1]), { o: 1 - P(lt, 0.2, 0.6) }) + voyage(v, { ty: ty });
  var segs = [
    [q('scroll'), 'zoom'],
    [q('drag'), 'drag'],
    [tu, 'dragv'],
    [q('arrow'), 'keys', ['←', '→']],
    [q('plus'), 'keys', ['+', '−']],
  ];
  return { svg: inset(lt, segs), keep: keep, keepIn: true, keepOut: true };
};

var TOOLS = [
  'Search',
  'Separate by tags',
  'Time display',
  '−',
  '＋',
  'Fit all',
  'Center axis',
  'Full screen',
];
var TB_Y = 31;
function toolbarX() {
  var w = 0;
  TOOLS.forEach(function (l) {
    w += buttonWidth(l) + 3;
  });
  w += 2 * 12; // the key caps either side
  var x = 160 - w / 2 + 12,
    xs = [];
  TOOLS.forEach(function (l) {
    xs.push(x);
    x += buttonWidth(l) + 3;
  });
  return xs;
}
SCENES[4] = function (lt, q) {
  var xs = toolbarX();
  var tLost = q(['lost', 'lust']),
    tFit = q('fit'),
    tSearch = q('search'),
    tSlash = q('slash'),
    tFinds = q('finds'),
    tTakes = q('takes'),
    tFull = q('full'),
    tF = q('f', 1, q('screen') + 0.05),
    tEsc = q('escape');
  // The view: back to Fit all, then Search takes it to Landfall.
  var v = vz(PAN, FIT, smooth((lt - tFit - 0.2) / 1.6));
  if (lt > tTakes) v = vz(FIT, FOUND, smooth((lt - tTakes - 0.1) / 1.6));
  var ring = lt > tTakes + 0.6 ? 'Landfall' : null;
  var fs = P(lt, tFull + 0.2, 0.7) * (1 - P(lt, tEsc + 0.2, 0.7));
  var keep = title() + voyage(v, { ring: ring });
  // The toolbar.
  var lit = function (i) {
    var l = TOOLS[i];
    var sweep = bump(lt, tLost - 0.1 + i * 0.12, 0.6) * 0.6;
    var on = 0;
    if (l === 'Fit all') on = bump(lt, tFit - 0.1, 2.0);
    if (l === 'Search') on = Math.max(bump(lt, tSearch - 0.1, 1.6), bump(lt, tSlash, 1.0));
    if (l === 'Full screen') on = Math.max(bump(lt, tFull - 0.1, 1.6), bump(lt, tF, 1.0));
    return Math.max(sweep, on > 0 ? Math.min(1, on * 1.6) : 0);
  };
  var tb = '';
  TOOLS.forEach(function (l, i) {
    tb += button(xs[i], TB_Y, l, lit(i));
  });
  var lastX = xs[xs.length - 1] + buttonWidth('Full screen') + 3;
  var slashP = bump(lt, tSlash - 0.1, 1.0),
    fP = bump(lt, tF - 0.1, 1.0);
  tb += G(keycap(xs[0] - 12, TB_Y, '/'), { ty: slashP * 0.8 });
  tb += G(keycap(lastX, TB_Y, 'F'), { ty: fP * 0.8 });
  if (slashP > 0)
    tb += rect(xs[0] - 12, TB_Y - 7 + slashP * 0.8, 9, 10, C.accent, { rx: 1.6, op: 0.2 * slashP });
  if (fP > 0) tb += rect(lastX, TB_Y - 7 + fP * 0.8, 9, 10, C.accent, { rx: 1.6, op: 0.2 * fP });
  var s = G(tb, { o: lerp(1, 0.12, fs) });
  // The search box: "landfall", typed.
  var sb = P(lt, tFinds - 0.2, 0.4) * (1 - P(lt, tTakes + 1.6, 0.5));
  if (sb > 0) {
    var word = 'landfall',
      n = Math.round(clamp01((lt - tFinds) / 0.9) * word.length);
    var bx = xs[0] - 12,
      by = TB_Y + 6;
    var box =
      rect(bx, by, 74, 11, C.card, { rx: 2, stroke: C.accent, sw: 0.7 }) +
      ICON.magnifier(bx + 5.5, by + 5, 2.2) +
      txt(bx + 11, by + 7.6, word.slice(0, n), { size: 5.4, anchor: 'start', mono: true }) +
      rect(bx + 11 + n * 3.24, by + 2.6, 0.6, 6, C.accent, {
        op: Math.floor(lt * 2) % 2 ? 1 : 0.2,
      });
    s += rise(box, sb, -3);
  }
  // Full screen: the timeline's frame opens out to the whole window.
  if (fs > 0) {
    var fx0 = lerp(14, 2, fs),
      fx1 = lerp(306, 318, fs),
      fy0 = lerp(48, 0, fs),
      fy1 = lerp(124, 174, fs),
      L = 9,
      br = '';
    [
      [fx0, fy0, 1, 1],
      [fx1, fy0, -1, 1],
      [fx0, fy1, 1, -1],
      [fx1, fy1, -1, -1],
    ].forEach(function (c) {
      br +=
        '<path d="M' +
        (c[0] + c[2] * L) +
        ' ' +
        c[1] +
        'H' +
        c[0] +
        'V' +
        (c[1] + c[3] * L) +
        '" fill="none" stroke="' +
        C.accent +
        '" stroke-width="1.2" stroke-linecap="round"/>';
    });
    s += G(br, { o: Math.min(1, fs * 1.5) });
  }
  var segs = [
    [tFit, 'tap'],
    [tSlash, 'keys', ['/']],
    [tFull, 'tap'],
    [tF, 'keys', ['F']],
    [tEsc, 'keys', ['Esc']],
  ];
  s += inset(lt, segs);
  return { svg: s, keep: keep, keepIn: true, keepOut: true };
};

/* ---------- Act 3 · Opening what's there ---------- */
var PANEL = { x: 158, y: 2, w: 156, h: 120 };
var READ = {
  Landfall: {
    time: '1495-03-14',
    tags: ['voyage', 'landfall'],
    bold: 'Land at dawn.',
    note: 'The crew goes ashore on a green island.',
    related: 'Leaves port',
  },
  'Leaves port': {
    time: '1491-07-02',
    tags: ['voyage', 'port'],
    bold: 'Three ships set sail.',
    note: 'They leave the harbour on the morning tide.',
    related: 'Landfall',
  },
};
function picture(x, y, w, h, which) {
  var s = '<g>';
  s += rect(x, y, w, h, mix(C.card, C.blue, 0.18), { rx: 2 });
  s += rect(x, y + h * 0.62, w, h * 0.38, mix(C.card, C.blue, 0.5), { rx: 0 });
  s +=
    '<path d="M' +
    x +
    ' ' +
    (y + h * 0.75) +
    'q8-2 16 0' +
    new Array(Math.max(0, Math.floor(w / 16) - 1) + 1).join('t16 0') +
    '" fill="none" stroke="' +
    mix(C.card, C.blue, 0.25) +
    '" stroke-width="0.6"/>';
  if (which === 'Landfall') {
    s +=
      '<circle cx="' +
      (x + w * 0.78) +
      '" cy="' +
      (y + h * 0.3) +
      '" r="4" fill="' +
      C.amber +
      '" opacity="0.8"/>';
    s +=
      '<path d="M' +
      (x + w * 0.2) +
      ' ' +
      (y + h * 0.63) +
      'q' +
      w * 0.15 +
      ' ' +
      -h * 0.38 +
      ' ' +
      w * 0.34 +
      ' 0z" fill="' +
      C.moment +
      '"/>' +
      '<path d="M' +
      (x + w * 0.33) +
      ' ' +
      (y + h * 0.34) +
      'v-5m0 0q-3 0-4 2m4-2q3 0 4 2" fill="none" stroke="' +
      C.strong +
      '" stroke-width="0.7"/>';
  } else {
    s += rect(x, y + h * 0.42, w * 0.22, h * 0.2, mix(C.card, C.soft, 0.55));
    s += rect(x + w * 0.04, y + h * 0.3, w * 0.07, h * 0.12, mix(C.card, C.soft, 0.4));
    var sx = x + w * 0.55,
      sy = y + h * 0.62;
    s +=
      '<path d="M' +
      (sx - 12) +
      ' ' +
      (sy - 3) +
      'h24l-4 5h-16z" fill="' +
      C.strong +
      '"/>' +
      '<path d="M' +
      sx +
      ' ' +
      (sy - 3) +
      'v-17" stroke="' +
      C.strong +
      '" stroke-width="0.7"/>' +
      '<path d="M' +
      (sx + 0.6) +
      ' ' +
      (sy - 19) +
      'q8 7 0 14z" fill="' +
      C.card +
      '" stroke="' +
      C.soft +
      '" stroke-width="0.4"/>';
  }
  return s + '</g>';
}
function readerContent(name, hl, relPress) {
  var r = READ[name],
    x = PANEL.x + 6,
    w = PANEL.w - 12,
    s = '';
  var row = function (y0, h, p) {
    return p > 0 ? rect(x - 3, y0, w + 6, h, C.accent, { rx: 1.5, op: 0.12 * p }) : '';
  };
  s += row(5, 46, hl.pictures);
  s += picture(x, 8, w, 34, name);
  s += txt(x + w, 47.5, 'Picture credit', { size: 4.4, anchor: 'end', fill: C.soft, weight: 500 });
  s += txt(x, 57, name, { size: 8, anchor: 'start', weight: 700 });
  s += row(59.5, 7, hl.time);
  s += txt(x, 65, r.time, { size: 4.8, anchor: 'start', fill: C.soft, mono: true, weight: 500 });
  s += row(67.5, 11, hl.tags);
  var cx = x;
  r.tags.forEach(function (t) {
    s += chip(cx, 75, t, C.accent, { size: 5 });
    cx += chipWidth(t, { size: 5 }) + 3;
  });
  s += row(80, 15, hl.notes);
  s += txt(x, 86, r.bold, { size: 5.4, anchor: 'start', weight: 700 });
  s += txt(x, 93, r.note, { size: 5.4, anchor: 'start', weight: 500 });
  s += row(97.5, 22, hl.related);
  s += txt(x, 104, 'Related to', { size: 5, anchor: 'start', fill: C.soft, weight: 700 });
  s += rect(x, 107, w, 10.5, relPress > 0 ? mix(C.card, C.accent, 0.2 * relPress) : C.card, {
    rx: 2,
    stroke: relPress > 0 ? mix(C.line, C.accent, relPress) : C.line,
    sw: 0.6,
  });
  s += moment(x + 6, 112.2, { r: 2 });
  s += txt(x + 12, 114.2, r.related, { size: 5.4, anchor: 'start' });
  s +=
    '<path d="M' +
    (x + w - 6) +
    ' 110l2.5 2.2-2.5 2.2" fill="none" stroke="' +
    C.soft +
    '" stroke-width="0.7"/>';
  return s;
}
SCENES[5] = function (lt, q) {
  var tTap = q('tap'),
    tChoose = q('choose'),
    tSwap = q('next') - 0.3,
    tPhone = q('phone');
  var tPick = tChoose + 0.7;
  var swap = P(lt, tSwap, 0.5);
  var ring = swap > 0.5 ? 'Leaves port' : 'Landfall';
  var keep = title() + voyage(FOUND, { ring: ring });
  var s = '',
    over = '';
  // A finger comes in and taps Landfall.
  var lx = vx(FOUND, LANDFALL),
    fin = P(lt, tTap - 0.9, 0.7) * (1 - P(lt, tTap + 0.6, 0.4));
  if (fin > 0)
    over += G(finger(lx + 3, AY + 3, clamp01((lt - tTap) / 0.6)), {
      o: fin,
      tx: (1 - fin) * 14,
      ty: (1 - fin) * 12,
    });
  // The reader slides in from the right.
  var pp = P(lt, tTap + 0.2, 0.7);
  if (pp > 0) {
    var hl = {
      pictures: bump(lt, q('pictures') - 0.1, 1.2),
      time: bump(lt, q('time') - 0.1, 1.0),
      tags: bump(lt, q('tags') - 0.1, 1.0),
      notes: bump(lt, q('notes') - 0.1, 1.0),
      related: bump(lt, q('related') - 0.1, 1.2),
    };
    var press = bump(lt, tPick - 0.2, 0.8);
    var panel =
      rect(PANEL.x + 1, PANEL.y + 1.5, PANEL.w, PANEL.h, '#000', { rx: 3, op: 0.06 }) +
      card(PANEL.x, PANEL.y, PANEL.w, PANEL.h, {});
    var content =
      G(readerContent('Landfall', swap > 0 ? {} : hl, press), { o: 1 - swap }) +
      G(readerContent('Leaves port', {}, 0), { o: swap });
    // Above the timeline; it fades with the scene's end like the rest of the scene.
    over += G(panel + content, { tx: (1 - pp) * 170, o: 1 - clamp01((lt - (q.dur - 0.3)) / 0.3) });
    // Choosing the related entry.
    var cf = P(lt, tChoose, 0.5) * (1 - P(lt, tPick + 0.6, 0.4));
    if (cf > 0)
      over += G(finger(PANEL.x + 40, 113, clamp01((lt - tPick) / 0.6)), {
        o: cf,
        tx: (1 - cf) * 10,
        ty: (1 - cf) * 10,
      });
  }
  // On a phone, the reader fills the screen.
  var ph = P(lt, tPhone, 0.6);
  if (ph > 0) {
    var px = 214,
      py = 148,
      H = 44,
      W = H * 0.5,
      x0 = px - W / 2 + 1.6,
      w0 = W - 3.2;
    var ps =
      ICON.phone(px, py, H) +
      rect(x0, py - H / 2 + 4, w0, 9, mix(C.card, C.blue, 0.18), { rx: 1 }) +
      rect(x0, py - H / 2 + 9.5, w0, 3.5, mix(C.card, C.blue, 0.5)) +
      rect(x0, py - H / 2 + 15, w0 * 0.7, 2.2, C.text, { rx: 1 }) +
      rect(x0, py - H / 2 + 19, w0 * 0.45, 1.4, C.soft, { rx: 0.7 }) +
      rect(x0, py - H / 2 + 22.5, 7, 2.6, C.card, { rx: 1.3, stroke: C.accent, sw: 0.4 }) +
      rect(x0 + 8, py - H / 2 + 22.5, 6, 2.6, C.card, { rx: 1.3, stroke: C.accent, sw: 0.4 }) +
      rect(x0, py - H / 2 + 27, w0, 1.2, C.line, { rx: 0.6 }) +
      rect(x0, py - H / 2 + 30, w0 * 0.85, 1.2, C.line, { rx: 0.6 }) +
      rect(x0, py - H / 2 + 34.5, w0, 4, C.card, { rx: 1, stroke: C.line, sw: 0.4 });
    s += G(ps, { o: ph, s: lerp(0.85, 1, ph), cx: px, cy: py });
  }
  s += inset(lt, [[q('click'), 'tap']]);
  return { svg: s, keep: keep + over, keepIn: true, keepOut: true };
};

var RULERS = [
  { word: 'dates', name: 'Dates', reading: '1492-10-12' },
  { word: 'years', name: 'Years', reading: '1492.78 years' },
  { word: 'exact', name: 'Exact', reading: '-15059606400' },
];
SCENES[6] = function (lt, q) {
  var tSep = q('separate'),
    tRej = q('rejoin');
  var v = vz(FOUND, S6, smooth((lt - 0.1) / 1.2));
  var sep = smooth((lt - tSep - 0.4) / 1.1) * (1 - smooth((lt - tRej - 0.3) / 1.1));
  var keep = title() + voyage(v, { sep: sep, stems: 18 });
  var s = '';
  s += rise(
    button(10, 30, 'Separate by tags', bump(lt, tSep - 0.1, 2.2) > 0 ? 1 : 0),
    P(lt, 0.6, 0.5),
  );
  s += rise(
    button(10, 142, 'Rejoin', bump(lt, tRej - 0.1, 2.0) > 0 ? 1 : 0),
    P(lt, tSep + 0.8, 0.5),
  );
  // Three time displays of the same ruler.
  var rx0 = 178,
    rx1 = 308,
    cxr = 246;
  s += G(
    txt(rx0, 29, 'Time display', { size: 6.2, anchor: 'start', weight: 700 }) +
      '<path d="M' +
      (rx0 - 8) +
      ' 22V150" stroke="' +
      C.faint +
      '" stroke-width="0.7"/>',
    { o: P(lt, q('display') - 0.3, 0.5) },
  );
  RULERS.forEach(function (r, i) {
    var y = 54 + i * 36;
    var p = P(lt, q(r.word), 0.6);
    if (p <= 0) return;
    var sy = Math.max(0.02, p);
    var row =
      txt(rx0, y - 10, r.name, { size: 5.4, anchor: 'start', fill: C.soft, weight: 600 }) +
      '<path d="M' +
      rx0 +
      ' ' +
      y +
      'H' +
      rx1 +
      '" stroke="' +
      C.arc +
      '" stroke-width="0.9"/>';
    for (var k = 0; k <= 10; k++) {
      var tx = rx0 + 5 + k * 12;
      row +=
        '<path d="M' + tx + ' ' + (y - 1.6) + 'v3.2" stroke="' + C.arc + '" stroke-width="0.6"/>';
    }
    row += cursorLine(cxr, y - 6, y + 4);
    var w = chipWidth(r.reading, { size: 5.4, mono: true });
    row += chip(cxr - w / 2, y + 13, r.reading, C.select, { size: 5.4, mono: true });
    s +=
      '<g transform="translate(0 ' +
      (y * (1 - sy)).toFixed(2) +
      ') scale(1 ' +
      sy.toFixed(3) +
      ')" opacity="' +
      p.toFixed(3) +
      '">' +
      row +
      '</g>';
  });
  return { svg: s, keep: keep, keepIn: true, keepOut: true };
};

SCENES[7] = function (lt, q) {
  var v = vz(S6, FIT, smooth((lt - 0.3) / 2.0));
  var keep = title() + voyage(v, {});
  var e = P(lt, q('open') - 0.2, 0.8);
  var endCard =
    card(66, 119, 188, 53, { rx: 4 }) +
    wordmark(160, 134, 10) +
    txt(160, 146, 'Open a public timeline · no account needed', { size: 6.4 }) +
    txt(160, 156, 'Next: tours of real timelines', { size: 5.6, fill: C.soft, weight: 500 }) +
    txt(160, 166, 'github.com/openchronology/timeline-app', {
      size: 5.2,
      mono: true,
      fill: C.accent,
      weight: 500,
    });
  return { svg: rise(endCard, e, 10), keep: keep, keepIn: true };
};
