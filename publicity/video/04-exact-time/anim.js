// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 4, Exact time: rational numbers (publicity/4-exact-time-rational-numbers.md): a
   terminal that adds 0.1 and 0.2, the comb of representable doubles growing coarse far from
   1970, fractions that stay exact through every store and any zoom, and the displays that
   round only what they show. Every number is in mono type: floating-point results amber,
   exact ones green. Scenes are pure functions of scene time lt; q("word") is when that word
   is said. */

var LANDING = -14182940;

/** The first n characters of s, typed from t0 at cps characters a second. */
function typed(s, lt, t0, cps) {
  var n = Math.floor((lt - t0) * (cps || 14));
  return n <= 0 ? '' : s.slice(0, n);
}
/** A terminal line: a green prompt, then mono text typed from t0 (with a block cursor while
    typing). Returns svg. */
function promptLine(x, y, s, lt, t0, o) {
  o = o || {};
  var size = o.size || 8;
  if (lt < t0 - 0.4) return '';
  var shown = typed(s, lt, t0, o.cps);
  var out = txt(x, y, '>', { size: size, mono: true, fill: C.accent, anchor: 'start' });
  var tx = x + size * 1.2;
  out += txt(tx, y, shown, { size: size, mono: true, anchor: 'start', weight: 500 });
  var typing = shown.length < s.length || lt < t0 + s.length / (o.cps || 14) + 0.5;
  if (typing && Math.floor(lt * 3) % 2 === 0)
    out += rect(
      tx + shown.length * size * 0.6 + 0.4,
      y - size * 0.75,
      size * 0.55,
      size * 0.9,
      C.accent,
      {
        op: 0.8,
      },
    );
  return out;
}
/** A brief flash peaking at t. */
function pulse(lt, t, w) {
  return clamp01(1 - Math.abs(lt - t) / (w || 0.22));
}
function rotG(inner, a, cx, cy, o) {
  if (o <= 0.001) return '';
  return (
    '<g opacity="' +
    o.toFixed(3) +
    '" transform="rotate(' +
    a.toFixed(2) +
    ' ' +
    cx +
    ' ' +
    cy +
    ')">' +
    inner +
    '</g>'
  );
}
function line(x0, y0, x1, y1, col, w, extra) {
  return (
    '<path d="M' +
    x0 +
    ' ' +
    y0 +
    'L' +
    x1 +
    ' ' +
    y1 +
    '" stroke="' +
    col +
    '" stroke-width="' +
    (w || 0.7) +
    '"' +
    (extra || '') +
    '/>'
  );
}

/* ---------- Scene 1: 0.1 + 0.2 ---------- */
var R1 = '0.30000000000000004';
function floatSum(x, y, size, flash) {
  var head = R1.slice(0, -1);
  var fx = x + head.length * size * 0.6;
  return (
    (flash > 0
      ? rect(fx - 0.6, y - size * 0.85, size * 0.6 + 1.2, size * 1.1, C.amber, {
          rx: 0.8,
          op: 0.35 * flash,
        })
      : '') +
    '<text x="' +
    x +
    '" y="' +
    y +
    '" font-family="' +
    MONO +
    '" font-size="' +
    size +
    '" font-weight="600" fill="' +
    C.amber +
    '" text-anchor="start">' +
    head +
    '<tspan fill="' +
    mix(C.amber, '#fff4d6', flash) +
    '" font-weight="700">4</tspan></text>'
  );
}
SCENES[1] = function (lt, q) {
  var s = '';
  var x = 50,
    y = 20,
    w = 220,
    h = 104;
  s += rise(ICON.terminal(x, y, w, h), P(lt, 0, 0.6));
  var t1 = q('add') - 0.2;
  s += promptLine(x + 10, y + 24, '0.1 + 0.2', lt, t1, { size: 9, cps: 10 });
  // The answer types on as it is read out, then its trailing 4 flashes twice.
  var tr = q('says') + 0.6,
    tEnd = Math.max(tr + 2, q('that') - 1.2);
  var shown = typed(R1, lt, tr, R1.length / (tEnd - tr));
  var fl = Math.max(pulse(lt, tEnd + 0.4), pulse(lt, tEnd + 1.0));
  if (shown.length === R1.length) s += floatSum(x + 10, y + 42, 12, fl);
  else if (shown)
    s += txt(x + 10, y + 42, shown, {
      size: 12,
      mono: true,
      fill: C.amber,
      anchor: 'start',
      weight: 600,
    });
  var t2 = q('bug') - 0.4;
  s += promptLine(x + 10, y + 66, '0.1 + 0.2 == 0.3', lt, t2, { size: 9, cps: 14 });
  var fa = P(lt, t2 + 16 / 14 + 0.4, 0.3);
  s += G(txt(x + 10, y + 82, 'false', { size: 10, mono: true, fill: C.amber, anchor: 'start' }), {
    o: fa,
  });
  // "So it rounds": the result's tail is marked as rounding.
  var rp = P(lt, q('rounds'), 0.5);
  s += rise(chip(x + w - 66, y + h - 10, 'floating point', C.amber, { size: 5.4 }), rp, 4);
  return s;
};

/* ---------- Scene 2: time is a number ---------- */
function miniTerminal(x, y) {
  return (
    ICON.terminal(x, y, 140, 34) +
    txt(x + 7, y + 15, '>', { size: 6, mono: true, fill: C.accent, anchor: 'start' }) +
    txt(x + 14, y + 15, '0.1 + 0.2', { size: 6, mono: true, anchor: 'start', weight: 500 }) +
    floatSum(x + 7, y + 27, 6.5, 0)
  );
}
SCENES[2] = function (lt, q) {
  var s = '';
  s += G(miniTerminal(90, 0), { o: 0.55 });
  var AY = 130;
  var v = view(20, 300, -36500000, 20200000);
  var lx = vx(v, LANDING),
    zx = vx(v, 0);
  // The axis draws itself; its ticks align when the number arrives.
  s += drawPath(
    'M20 ' + AY + 'H300',
    280,
    P(lt, 0.2, 1.2),
    'stroke="' + C.arc + '" stroke-width="0.9"',
  );
  var tk = P(lt, q('count') - 0.2, 0.6);
  s += G(axis(v, AY, calendarTicks(v.t0, v.t1, 6), { mono: true, tickSize: 5 }), { o: tk });
  s += G(txt(zx, AY + 17, '0 s', { size: 4.6, mono: true, fill: C.soft, weight: 500 }), { o: tk });
  // The date label, then it slides down into the count of seconds.
  var da = P(lt, q('times') - 0.2, 0.5);
  var sl = smooth((lt - q('moment')) / 1.1);
  var dy = lerp(56, 92, sl),
    dxx = lerp(160, lx, sl);
  s += G(
    txt(dxx, dy, '1969-07-20 20:17:40 UTC', { size: lerp(8.5, 6, sl), mono: true, weight: 500 }),
    {
      o: da * (1 - 0.55 * sl),
    },
  );
  var na = P(lt, q('moment') + 0.7, 0.5);
  s += rise(
    txt(lx, 106, String(LANDING), { size: 12, mono: true, weight: 600, fill: C.text }) +
      txt(lx, 115, 'seconds since 1970', { size: 5.4, fill: C.soft, weight: 500 }),
    na,
    -6,
  );
  // The moment on the axis beneath it.
  s += G(line(lx, 119, lx, AY, mix(C.moment, C.ground, 0.35), 0.6) + moment(lx, AY, {}), {
    o: P(lt, q('moment') + 1.1, 0.5),
  });
  // Further from 1970, coarser.
  var fp = P(lt, q('further'), 0.7);
  var cp = P(lt, q('coarser'), 0.5);
  var arrow = function (x0, x1) {
    var d = x1 > x0 ? -1 : 1;
    return (
      drawPath(
        'M' + x0 + ' ' + (AY + 26) + 'H' + x1,
        Math.abs(x1 - x0),
        fp,
        'stroke="' + C.amber + '" stroke-width="0.8"',
      ) +
      G('<path d="M' + x1 + ' ' + (AY + 26) + 'l' + d * 3 + ' -2v4z" fill="' + C.amber + '"/>', {
        o: fp,
      })
    );
  };
  s += arrow(zx - 6, 28) + arrow(zx + 6, 296);
  s += G(
    txt(30, AY + 35, 'coarser', { size: 5.4, mono: true, fill: C.amber, anchor: 'start' }) +
      txt(294, AY + 35, 'coarser', { size: 5.4, mono: true, fill: C.amber, anchor: 'end' }),
    { o: cp },
  );
  return s;
};

/* ---------- Scene 3: the comb gets coarse ---------- */
var WINS = [
  // [point x on the line, window x, title, spacing text, tooth spacing in units, cue]
  [58, 11, '4.54 billion years ago', 'every 16 s', 20, 'earth'],
  [160, 113, '66 million years ago', 'every 0.25 s', 7, 'dinosaur'],
  [262, 215, 'Today', 'every 0.00000024 s', 2.6, 'today'],
];
SCENES[3] = function (lt, q) {
  var s = '';
  var LY = 22,
    WY = 50,
    WW = 94,
    WH = 76;
  s += drawPath(
    'M14 ' + LY + 'H306',
    292,
    P(lt, 0, 0.8),
    'stroke="' + C.arc + '" stroke-width="0.9"',
  );
  var teethY = WY + 58;
  WINS.forEach(function (wd, i) {
    var px = wd[0],
      wx = wd[1];
    var t0 = q(wd[5]) - 0.2;
    s += G(
      '<circle cx="' +
        px +
        '" cy="' +
        LY +
        '" r="2.2" fill="' +
        C.moment +
        '"/>' +
        txt(px, LY - 5, wd[2], { size: 5, fill: C.soft, weight: 500 }),
      { o: P(lt, 0.3 + (2 - i) * 0.2, 0.5) },
    );
    var a = P(lt, t0, 0.9);
    if (a <= 0) return;
    // The magnifier's cone from the point to the window.
    var cone =
      '<path d="M' +
      px +
      ' ' +
      LY +
      'L' +
      wx +
      ' ' +
      WY +
      'M' +
      px +
      ' ' +
      LY +
      'L' +
      (wx + WW) +
      ' ' +
      WY +
      '" stroke="' +
      C.line +
      '" stroke-width="0.6"/>';
    var inner = card(wx, WY, WW, WH, {});
    inner += txt(wx + WW / 2, WY + 14, i === 2 ? 'Today' : wd[2], { size: 6, weight: 700 });
    inner += txt(wx + WW / 2, WY + 25, wd[3], {
      size: 5.4,
      mono: true,
      fill: C.amber,
      weight: 600,
    });
    // The comb: evenly spaced teeth, the representable doubles.
    var lx0 = wx + 5,
      lx1 = wx + WW - 5;
    inner += line(lx0, teethY, lx1, teethY, C.soft, 0.6);
    var sp = wd[4];
    var first = wx + 7;
    for (var tx = first; tx <= lx1 + 0.01; tx += sp)
      inner += line(tx.toFixed(2), teethY - 9, tx.toFixed(2), teethY, C.amber, 0.7);
    s += G(cone, { o: a }) + G(inner, { o: a, s: lerp(0.15, 1, a), cx: px, cy: LY });
    if (i === 0) s += collision(lt, q, first, teethY, a);
  });
  // A timeline spanning billions of years needs better.
  var ep = P(lt, q('enough'), 0.6);
  s += rise(
    txt(160, 146, 'too coarse for a timeline that spans billions of years', {
      size: 5.6,
      fill: C.amber,
      mono: true,
      weight: 500,
    }),
    ep,
  );
  return s;
};
/* Two moments ten seconds apart (at 26 s and 36 s) snap onto the tooth at 32 s. One unit of
   the window is 0.8 s; teeth every 16 s are 20 units apart. */
function collision(lt, q, first, ty, a) {
  var s = '';
  var mp = P(lt, q('two') - 0.1, 0.5) * a;
  if (mp <= 0) return '';
  var xa = first + 26 / 0.8,
    xb = first + 36 / 0.8,
    xt = first + 32 / 0.8;
  var snap = smooth((lt - q('become')) / 0.6);
  var ax = lerp(xa, xt, snap),
    bx = lerp(xb, xt, snap);
  var landed = q('become') + 0.6;
  var shake =
    lt > landed ? Math.sin((lt - landed) * 70) * 1.4 * Math.max(0, 1 - (lt - landed) / 0.5) : 0;
  var my = ty - 11;
  // The true gap before the snap.
  s += G(
    line(xa, my - 7, xa, my - 9, C.soft, 0.5) +
      line(xb, my - 7, xb, my - 9, C.soft, 0.5) +
      line(xa, my - 8, xb, my - 8, C.soft, 0.5) +
      txt((xa + xb) / 2, my - 10.5, '10 s', { size: 4.6, mono: true, fill: C.green, weight: 500 }),
    { o: mp * (1 - snap) },
  );
  // Each moment drops a dashed guide to the line while it is apart.
  s += G(
    line(xa, my, xa, ty, C.moment, 0.4, ' stroke-dasharray="1 1"') +
      line(xb, my, xb, ty, C.moment, 0.4, ' stroke-dasharray="1 1"'),
    { o: mp * (1 - snap) * 0.8 },
  );
  s += G(
    moment(ax + shake, my + snap * 4, { r: 2.2 }) +
      moment(bx + shake, my + snap * 4, { r: 2.2, color: C.blue }),
    { o: mp },
  );
  var hit = P(lt, landed, 0.3);
  s += G(
    '<circle cx="' +
      (xt + shake) +
      '" cy="' +
      (my + 4) +
      '" r="4.2" fill="none" stroke="' +
      C.red +
      '" stroke-width="0.8"/>' +
      txt(xt, ty + 11, 'same time', { size: 5.4, fill: C.red, weight: 700 }),
    { o: hit },
  );
  return s;
}

/* ---------- Scene 4: a fraction is exact ---------- */
SCENES[4] = function (lt, q) {
  var s = '';
  var x = 14,
    y = 6,
    w = 172,
    h = 78;
  s += rise(ICON.terminal(x, y, w, h), P(lt, 0, 0.5));
  var t1 = q('tenth', 2) - 0.2;
  s += promptLine(x + 10, y + 26, '1/10 + 2/10', lt, t1, { size: 9, cps: 9 });
  var pa = P(lt, q('three') + 0.2, 0.4);
  s += pop(
    txt(x + 10, y + 52, '3/10', {
      size: 16,
      mono: true,
      fill: C.green,
      anchor: 'start',
      weight: 600,
    }),
    pa,
    x + 30,
    y + 46,
  );
  s += G(check(x + 62, y + 47, C.green), { o: pa });
  // 1/3 writes itself and stays.
  var cx = 196,
    cw = 112;
  var tp = P(lt, q('third') - 0.3, 0.5);
  s += rise(card(cx, y, cw, h, {}), tp);
  var wp = clamp01((lt - q('third')) / 0.9);
  s +=
    '<clipPath id="w13"><rect x="' +
    (cx + 20) +
    '" y="' +
    (y + 20) +
    '" width="' +
    (72 * wp).toFixed(2) +
    '" height="40"/></clipPath>' +
    '<g clip-path="url(#w13)">' +
    txt(cx + cw / 2, y + 48, '1/3', { size: 24, mono: true, fill: C.green, weight: 600 }) +
    '</g>';
  s += G(
    txt(cx + cw / 2, y + 66, 'exactly a third, forever', { size: 5.6, fill: C.soft, weight: 500 }),
    {
      o: P(lt, q('stays'), 0.5),
    },
  );
  // The fraction diagram: two whole numbers, any size.
  var fd = P(lt, q('fraction') - 0.2, 0.6);
  var grow = smooth((lt - q('large')) / 1.4);
  var bw = lerp(70, 150, grow),
    bx = 160 - bw / 2;
  var dg = '';
  dg += rect(bx, 100, bw, 20, C.card, { rx: 2, stroke: C.green, sw: 0.7 });
  dg += txt(160, 112.5, 'whole number', { size: 6, fill: C.text });
  dg += line(bx - 6, 127, bx + bw + 6, 127, C.text, 1);
  dg += rect(bx, 134, bw, 20, C.card, { rx: 2, stroke: C.green, sw: 0.7 });
  dg += txt(160, 146.5, 'whole number', { size: 6, fill: C.text });
  dg += txt(bx - 12, 112.5, 'numerator', { size: 5.6, fill: C.soft, anchor: 'end', weight: 500 });
  dg += txt(bx - 12, 146.5, 'denominator', { size: 5.6, fill: C.soft, anchor: 'end', weight: 500 });
  s += rise(dg, fd);
  var ap = P(lt, q('large'), 0.5);
  var arrows =
    '<path d="M' +
    (bx - 2) +
    ' 160H' +
    (bx + bw + 2) +
    '" stroke="' +
    C.green +
    '" stroke-width="0.7"/>' +
    '<path d="M' +
    (bx - 3) +
    ' 160l3 -2v4zM' +
    (bx + bw + 3) +
    ' 160l-3 -2v4z" fill="' +
    C.green +
    '"/>';
  s += G(
    arrows +
      txt(bx + bw + 14, 129.5, 'any size', {
        size: 7,
        fill: C.green,
        anchor: 'start',
        weight: 700,
      }),
    {
      o: ap,
    },
  );
  return s;
};

/* ---------- Scene 5: stored exactly, everywhere ---------- */
var VALUE = '-143271504000000000/1';
var TIERS = [
  ['Editor', 'BigInt fractions', 'editor'],
  ['Server', 'PostgreSQL + pgmp (GMP rationals)', 'database'],
  ['Desktop files', 'SQLite + a rational extension', 'desktop'],
];
function seal(x, y, p) {
  var s =
    rect(x, y - 6, 46, 12, 'none', { rx: 6, stroke: C.green, sw: 0.9 }) +
    check(x + 8, y, C.green) +
    txt(x + 28, y + 1.8, 'no rounding', { size: 5, fill: C.green, weight: 700 });
  return G(s, { o: p, s: lerp(1.6, 1, p), cx: x + 23, cy: y });
}
SCENES[5] = function (lt, q) {
  var s = '';
  var BY = [30, 68, 106],
    BH = 28,
    VX = 196;
  TIERS.forEach(function (t, i) {
    var a = P(lt, 0.2 + i * 0.25, 0.5);
    var lit = pulse(lt, q(t[2]) + 0.5, 0.6);
    var b =
      rect(14, BY[i], 292, BH, mix(C.card, C.green, 0.08 * lit), {
        rx: 3,
        stroke: mix(C.line, C.green, lit),
        sw: 0.6,
      }) +
      txt(22, BY[i] + 12, t[0], { size: 6.6, anchor: 'start', weight: 700 }) +
      txt(22, BY[i] + 22, t[1], { size: 5.6, anchor: 'start', fill: C.soft, weight: 500 });
    s += rise(b, a);
    s += seal(254, BY[i] + BH / 2, P(lt, q(t[2]) + 0.5, 0.35));
  });
  // The value drops through each band at its cue, then out the bottom.
  var stops = [12, BY[0] + 17, BY[1] + 17, BY[2] + 17, 156];
  var times = [0, q('editor'), q('database'), q('desktop'), q('saving')];
  var vy = stops[0];
  for (var k = 1; k < stops.length; k++) {
    var m = smooth((lt - (times[k] - 0.1)) / 0.6);
    if (m > 0) vy = lerp(stops[k - 1], stops[k], m);
  }
  var va = P(lt, 0.4, 0.5);
  s += G(
    rect(VX - 40, vy - 7, 80, 10, C.ground, { rx: 2, op: 0.85 }) +
      txt(VX, vy, VALUE, { size: 6.4, mono: true, fill: C.green, weight: 600 }),
    { o: va },
  );
  var idp = P(lt, q('never'), 0.5);
  s += G(
    check(VX + 48, vy - 2, C.green) +
      txt(VX + 54, vy, 'identical', { size: 6, fill: C.green, anchor: 'start', weight: 700 }),
    { o: idp },
  );
  return s;
};

/* ---------- Scene 6: zoom without limit ---------- */
function group3(str) {
  var parts = str.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return parts.join('.');
}
/** A tick at k × 10^e seconds, labelled in the SI unit its step calls for. */
function tickLabel(k, e) {
  var unit = e >= 0 ? [0, 's'] : e >= -3 ? [-3, 'ms'] : e >= -6 ? [-6, 'µs'] : [-9, 'ns'];
  var d = e - unit[0];
  if (k === 0) return '0 ' + unit[1];
  var str = String(Math.abs(k));
  if (d >= 0) str += '0'.repeat(d);
  else {
    while (str.length <= -d) str = '0' + str;
    str = str.slice(0, str.length + d) + '.' + str.slice(str.length + d);
  }
  return (k < 0 ? '−' : '') + group3(str) + ' ' + unit[1];
}
SCENES[6] = function (lt, q) {
  var s = '';
  var AY = 98,
    X0 = 20,
    X1 = 300,
    CX = 160;
  var THIRD = 1 / 3;
  var tz0 = q('put') + 0.2,
    tz1 = q('same') - 0.4;
  var z = smooth((lt - tz0) / (tz1 - tz0));
  var span = lerpLog(1, 1e-9, z);
  var t0 = THIRD - span / 2;
  var px = function (t) {
    return CX + ((t - THIRD) / span) * (X1 - X0);
  };
  // Pick the finest step (1, 2 or 5 × 10^e) whose labels still fit.
  var e = 0,
    m = 1;
  for (var ee = 0; ee >= -10; ee--) {
    var fits = false;
    [5, 2, 1].forEach(function (mm) {
      var st = mm * Math.pow(10, ee);
      var wLab = textWidth(tickLabel(Math.ceil(t0 / st) * mm, ee), 5, true) + 6;
      if ((span / st) * wLab <= 280) {
        e = ee;
        m = mm;
        fits = true;
      }
    });
    if (!fits) break;
  }
  var step = m * Math.pow(10, e);
  s += line(X0, AY, X1, AY, C.arc, 0.9);
  var axIn = P(lt, 0.1, 0.6);
  var ticks = '';
  // Minor ticks between the labelled ones.
  var ms = m > 1 ? Math.pow(10, e) : step / 10;
  for (var j = Math.ceil(t0 / ms); j * ms <= t0 + span; j++) {
    var mx = px(j * ms);
    if (mx >= X0 && mx <= X1)
      ticks += line(mx.toFixed(2), AY - 1, mx.toFixed(2), AY + 1, C.line, 0.5);
  }
  for (var k = Math.ceil(t0 / step); k * step <= t0 + span; k++) {
    var x = px(k * step);
    if (x < X0 - 0.5 || x > X1 + 0.5) continue;
    ticks += line(x.toFixed(2), AY - 1.8, x.toFixed(2), AY + 1.8, C.arc, 0.7);
    ticks += txt(x.toFixed(2), AY + 10, tickLabel(k * m, e), {
      size: 5,
      mono: true,
      fill: C.soft,
      weight: 500,
    });
  }
  s += G(ticks, { o: axIn });
  // Moments at 0 and at 1/3.
  var zx = px(0);
  if (zx > X0 - 4)
    s += G(
      moment(zx, AY, {}) +
        line(zx, AY - 4, zx, AY - 14, mix(C.moment, C.ground, 0.35), 0.6) +
        txt(zx, AY - 17, '0 s', { size: 7, mono: true, weight: 600 }),
      { o: P(lt, 0.3, 0.5) * clamp01((zx - X0 + 4) / 8) },
    );
  var m3 = P(lt, q('moment') - 0.2, 0.5);
  s += G(
    moment(CX, AY, { r: 3, color: C.green }) +
      line(CX, AY - 4, CX, AY - 20, mix(C.green, C.ground, 0.35), 0.6) +
      txt(CX, AY - 24, '1/3 s', { size: 9, mono: true, fill: C.green, weight: 600 }),
    { o: m3 },
  );
  // The depth counter in the corner.
  var n = Math.round(Math.log10(span));
  var cnt =
    '<text x="8" y="10" font-family="' +
    MONO +
    '" font-size="6.4" font-weight="500" fill="' +
    C.soft +
    '" text-anchor="start">span: 1 s' +
    (z > 0.02 && n < 0
      ? ' → 10<tspan dy="-2.6" font-size="4.8">' +
        String(n).replace('-', '−') +
        '</tspan><tspan dy="2.6"> s</tspan>'
      : '') +
    '</text>';
  s += G(cnt, { o: P(lt, 0.2, 0.5) });
  var unitNow = e >= 0 ? 's' : e >= -3 ? 'ms' : e >= -6 ? 'µs' : 'ns';
  s += G(
    txt(312, 10, 'ruler: ' + unitNow, {
      size: 6.4,
      anchor: 'end',
      fill: C.soft,
      mono: true,
      weight: 500,
    }),
    { o: P(lt, 0.2, 0.5) },
  );
  // Still exactly a third, and the same four and a half billion years ago.
  var sp = P(lt, tz1 + 0.1, 0.5);
  s += rise(
    txt(CX, AY + 30, 'still exactly 1/3', { size: 6.4, mono: true, fill: C.green, weight: 600 }),
    sp,
  );
  var fp = P(lt, q('four'), 0.5);
  s += rise(
    chip(
      CX - chipWidth('4.54 billion years ago: exact too', { size: 5.6, mono: true }) / 2,
      AY + 52,
      '4.54 billion years ago: exact too',
      C.green,
      { size: 5.6, mono: true },
    ),
    fp,
  );
  return s;
};

/* ---------- Scene 7: displays are lenses ---------- */
var LENSES = [
  ['Exact rational', '1/3', 'fraction', C.green, 9],
  ['SI', '333.333 ms', ['si', 'units'], C.amber, 9],
  ['Gregorian', '1970-01-01T00:00:00{+1/3}Z', 'date', C.green, 6.8],
];
SCENES[7] = function (lt, q) {
  var s = '';
  var SX = 18,
    SY = 58,
    SW = 80,
    SH = 58;
  var OX = SX + SW,
    OY = SY + SH / 2;
  var LX = 136,
    LW = 176,
    LH = 34,
    LY = [14, 70, 126];
  // The stored value, locked.
  var keep = pulse(lt, q('stays') + 0.3, 0.8);
  s += rise(
    card(SX, SY, SW, SH, { stroke: mix(C.line, C.green, 0.4 + 0.6 * keep) }) +
      ICON.padlock(SX + SW / 2, SY + 13, 1) +
      txt(SX + SW / 2, SY + 38, '1/3', { size: 16, mono: true, fill: C.green, weight: 600 }) +
      txt(SX + SW / 2, SY + 51, 'stored value', { size: 5.2, fill: C.soft, weight: 500 }),
    P(lt, 0, 0.5),
  );
  var editT = q('type') + 0.1;
  LENSES.forEach(function (l, i) {
    var a = P(lt, q(l[2]) - 0.2, 0.7);
    if (a <= 0) return;
    var ly = LY[i],
      cy = ly + LH / 2;
    var inner =
      '<path d="M' +
      OX +
      ' ' +
      OY +
      'C' +
      (OX + 20) +
      ' ' +
      OY +
      ' ' +
      (LX - 20) +
      ' ' +
      cy +
      ' ' +
      LX +
      ' ' +
      cy +
      '" fill="none" stroke="' +
      C.line +
      '" stroke-width="0.7"/>' +
      card(LX, ly, LW, LH, {}) +
      '<circle cx="' +
      (LX + 11) +
      '" cy="' +
      cy +
      '" r="5" fill="none" stroke="' +
      C.soft +
      '" stroke-width="0.8"/>' +
      line(LX + 14.6, cy + 3.6, LX + 17, cy + 6, C.soft, 1.2) +
      txt(LX + 24, ly + 11, l[0], { size: 5.4, anchor: 'start', fill: C.soft, weight: 600 });
    var reading = l[1];
    if (i === 1 && lt >= editT) {
      // A typed edit: the field is retyped and becomes a new, rounded time.
      reading = typed(l[1], lt, editT + 0.3, 12);
      inner += rect(LX + 22, ly + 15, 64, 15, 'none', { rx: 1.5, stroke: C.amber, sw: 0.6 });
      if (reading.length < l[1].length && Math.floor(lt * 4) % 2 === 0)
        inner += rect(LX + 25 + reading.length * 5.4 + 0.5, ly + 19, 0.7, 8, C.amber);
    }
    inner += txt(LX + 25, ly + 27, reading, {
      size: l[4],
      mono: true,
      fill: l[3],
      anchor: 'start',
      weight: 600,
    });
    if (i === 2) {
      // The leftover fraction in braces.
      var bp = P(lt, q('braces') - 0.3, 0.5);
      var bx = LX + 25 + 19 * l[4] * 0.6;
      inner += G(
        rect(bx - 0.5, ly + 20.5, 6 * l[4] * 0.6 + 1, 9, C.green, { rx: 1, op: 0.18 }) +
          line(bx, ly + 30.5, bx + 6 * l[4] * 0.6, ly + 30.5, C.green, 0.7),
        { o: bp },
      );
    }
    if (i === 1) {
      var wp = P(lt, editT + 1.4, 0.4);
      inner += G(chip(LX + 92, ly + 26, 'you chose a new, rounded time', C.amber, { size: 5 }), {
        o: wp,
        ty: (1 - wp) * 3,
      });
    }
    s += rotG(inner, (1 - a) * 12, OX, OY, a);
  });
  // Leave a field as it is: the stored value stays.
  s += G(check(SX + SW / 2 + 9, SY + 13, C.green), {
    o: P(lt, q('stays'), 0.4) * (1 - P(lt, editT, 0.3)),
  });
  return s;
};

/* ---------- Scene 8: exact, and open ---------- */
var FINAL = [
  ['4.54 billion years ago', 62, 20, 'billion'],
  ['1969-07-20 20:17:40', 172, 24, 'single'],
  ['+1/3 s', 268, 20, 'third'],
];
SCENES[8] = function (lt, q) {
  var s = '';
  var AY = 96;
  var tog = smooth((lt - q('line')) / 1.0);
  s += G(line(14, AY, 306, AY, C.arc, 0.9), { o: P(lt, q('line') - 0.4, 0.6) });
  var startY = [44, 92, 140];
  FINAL.forEach(function (f, i) {
    var a = P(lt, q(f[3]) - 0.2, 0.5);
    var y = lerp(startY[i], AY, tog);
    var h = lerp(0, f[2], tog);
    s += G(
      (h > 0.5 ? line(f[1], y - 3, f[1], y - h, mix(C.moment, C.ground, 0.35), 0.6) : '') +
        moment(f[1], y, { r: 2.6, color: C.green }) +
        txt(f[1], y - h - (h > 0.5 ? 3 : 6), f[0], {
          size: 6.4,
          mono: true,
          fill: C.green,
          weight: 600,
        }),
      { o: a },
    );
  });
  s += G(
    txt(160, AY + 22, 'no rounding where they are kept', { size: 6, fill: C.soft, weight: 500 }),
    { o: P(lt, q('rounding'), 0.5) },
  );
  // The end card.
  var e = P(lt, q('free'), 0.8);
  s += G(
    rect(-20, -24, 360, 210, C.ground, { op: 0.94 }) +
      txt(160, 52, 'Every time is a fraction. Nothing rounds.', { size: 11, weight: 700 }) +
      wordmark(160, 86, 16) +
      txt(160, 116, 'Source: github.com/openchronology/timeline-app · GPL v3', {
        size: 6.4,
        mono: true,
        fill: C.accent,
        weight: 500,
      }),
    { o: e },
  );
  return s;
};
