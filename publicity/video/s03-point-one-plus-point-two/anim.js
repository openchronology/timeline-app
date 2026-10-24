// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 3, 0.1 + 0.2 isn't 0.3 (publicity/shorts/3-point-one-plus-point-two.md): a terminal
   that prints 0.30000000000000004, a tenth's binary digits cut off at 53 bits and rounded, a
   number line whose smallest steps widen the further it runs from 1970, and the exact
   fractions OpenChronology stores instead. Everything is drawn (no app capture), after Video 4
   (04-exact-time/anim.js), in the vertical stage. Floating-point numbers are amber, exact ones
   green. Scenes are pure functions of scene time lt; q("word") is when that word is said. */

var R1 = '0.30000000000000004';

/** The first n characters of s, typed from t0 at cps characters a second. */
function typed(s, lt, t0, cps) {
  var n = Math.floor((lt - t0) * (cps || 14));
  return n <= 0 ? '' : s.slice(0, n);
}
/** A brief flash peaking at t. */
function pulse(lt, t, w) {
  return clamp01(1 - Math.abs(lt - t) / (w || 0.22));
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
function mono(x, y, s, size, fill, o) {
  o = o || {};
  return txt(x, y, s, {
    size: size,
    mono: true,
    fill: fill || C.text,
    anchor: o.anchor || 'start',
    weight: o.weight || 600,
  });
}

/* ---------- the terminal ---------- */
/** The sum's answer, its trailing 4 in red, lit by flash (0–1). */
function floatSum(x, y, size, flash) {
  var head = R1.slice(0, -1);
  var fx = x + head.length * size * 0.6;
  return (
    (flash > 0
      ? rect(fx - 0.8, y - size * 0.86, size * 0.6 + 1.6, size * 1.12, C.red, {
          rx: 1,
          op: 0.3 * flash,
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
    mix(C.red, '#ffd9d4', 0.6 * flash) +
    '" font-weight="700">4</tspan></text>'
  );
}
/** The terminal with 0.1 + 0.2 and its answer, at y, h tall, its text scaled by k (1 large, 0
    small); zeros (0–1) shows the "15 zeros" brace and flash lights the 4. */
function sumTerminal(y, h, k, zeros, flash, lt) {
  var x = SAFE.x0,
    w = SAFE.x1 - SAFE.x0;
  var ps = lerp(7, 12, k),
    rs = lerp(9, 10.8, k);
  var tx = x + 6;
  var py = y + lerp(15, 32, k),
    ry = y + lerp(31, 64, k);
  var s = ICON.terminal(x, y, w, h);
  s +=
    mono(tx, py, '>', ps, C.accent) +
    mono(tx + ps * 1.2, py, '0.1 + 0.2', ps, C.text, { weight: 500 });
  s += floatSum(tx, ry, rs, flash);
  if (zeros > 0) {
    // The fifteen zeros after "0.3", bracketed underneath.
    var cw = rs * 0.6,
      z0 = tx + 3 * cw + 0.4,
      z1 = tx + 18 * cw - 0.4,
      by = ry + 4;
    s += G(
      '<path d="M' +
        z0 +
        ' ' +
        by +
        'v2.2H' +
        z1 +
        'v-2.2M' +
        (z0 + z1) / 2 +
        ' ' +
        (by + 2.2) +
        'v2" fill="none" stroke="' +
        C.soft +
        '" stroke-width="0.7"/>' +
        txt((z0 + z1) / 2, by + 13, '15 zeros', { size: 8, fill: C.soft, weight: 600 }),
      { o: zeros },
    );
  }
  if (k > 0.5) {
    // A fresh prompt waits with its cursor.
    var cy = y + h - 14;
    s += G(
      mono(tx, cy, '>', ps, C.accent) +
        (Math.floor(lt * 2) % 2 === 0
          ? rect(tx + ps * 1.2, cy - ps * 0.75, ps * 0.55, ps * 0.9, C.accent, { op: 0.8 })
          : ''),
      { o: (k - 0.5) * 2 },
    );
  }
  return s;
}

/* ---------- Scene 1: ask it ---------- */
var T1 = { y: 80, h: 124 };
SCENES[1] = function (lt, q) {
  var zp = P(lt, q(['fifteen', '15']) - 0.1, 0.4);
  var fl = Math.max(pulse(lt, q('four') + 0.15, 0.3), pulse(lt, q('four') + 0.75, 0.3));
  return sumTerminal(T1.y, T1.h, 1, zp, fl, lt);
};

/* ---------- Scene 2: why ---------- */
/* 0.1 in binary is 0.0001 1001 1001 …: its 53 significant bits run from the first 1 through
   thirteen groups of 1001; the next bits (1001 …) don't fit, so the last group rounds up to
   1010 (0.1 is stored as 0x3FB999999999999A). The middle groups are shown as "…". */
var BITS_IN = '0.0001 1001 1001 … 1001';
var BITS_OUT = ' 1001 1001 1001 1001 1001';
SCENES[2] = function (lt, q) {
  var s = '';
  // The terminal shrinks to the top.
  var sh = smooth(lt / 0.6);
  s += sumTerminal(lerp(T1.y, 72, sh), lerp(T1.h, 42, sh), 1 - sh, 0, 0, lt);
  var BS = 8.5,
    cw = BS * 0.6,
    BX = 12,
    BY = 164;
  var tb = q('binary') - 0.1;
  s += rise(
    txt(SAFE.cx, 132, '0.1 in binary', { size: 8.5, fill: C.soft, weight: 600 }),
    P(lt, tb, 0.4),
  );
  // The bits stream in and run off the right edge.
  var all = BITS_IN + BITS_OUT;
  var shown = typed(all, lt, tb + 0.2, 30);
  var nIn = BITS_IN.length;
  var tf = q('fixed');
  var cut = P(lt, tf, 0.35);
  var tr = q('rounds');
  var flip = lt >= tr;
  var inner = shown.slice(0, nIn);
  if (flip && inner.length === nIn) inner = inner.slice(0, -4) + '1010';
  s += mono(BX, BY, inner.slice(0, flip ? nIn - 4 : nIn), BS, C.text, { weight: 500 });
  if (flip) {
    var fp = P(lt, tr, 0.3);
    var gx = BX + (nIn - 4) * cw;
    s += rect(gx - 0.8, BY - BS * 0.86, 4 * cw + 1.6, BS * 1.12, C.amber, { rx: 1, op: 0.22 * fp });
    s += G(mono(gx, BY, '1010', BS, C.amber, { weight: 700 }), { o: fp, ty: (1 - fp) * -4 });
  }
  // What doesn't fit dims and drifts away past the cut.
  var out = shown.slice(nIn);
  if (out)
    s += G(
      mono(
        BX + nIn * cw,
        BY,
        out,
        BS,
        mix(C.text, C.red, 0.4 + 0.6 * pulse(lt, q('fit') + 0.2, 0.5)),
        { weight: 500 },
      ),
      {
        o: lerp(1, 0.32, cut),
        tx: 4 * cut,
      },
    );
  // The bracket snaps shut over the 53 bits, from the first 1 to the cut.
  var b0 = BX + 5 * cw,
    b1 = BX + nIn * cw + 0.6;
  var bx1 = lerp(178, b1, smooth((lt - tf) / 0.3));
  var by = BY - 11;
  s += G(
    '<path d="M' +
      b0 +
      ' ' +
      (by + 3) +
      'v-3H' +
      bx1 +
      'v3" fill="none" stroke="' +
      C.accent +
      '" stroke-width="0.9"/>' +
      line(bx1 + 1.6, by - 2, bx1 + 1.6, BY + 5, C.accent, 1.1) +
      txt((b0 + b1) / 2, by - 4, '53 bits', { size: 8, fill: C.accent, weight: 700 }),
    { o: cut },
  );
  // "So it rounds": an arrow to the rounded group.
  var rp = P(lt, tr + 0.2, 0.45);
  var ax = BX + (nIn - 2) * cw;
  s += G(
    drawPath(
      'M' + ax + ' ' + (BY + 22) + 'V' + (BY + 6),
      16,
      rp,
      'stroke="' + C.amber + '" stroke-width="0.9"',
    ) +
      '<path d="M' +
      ax +
      ' ' +
      (BY + 4.5) +
      'l-2 3h4z" fill="' +
      C.amber +
      '"/>',
    { o: rp },
  );
  s += rise(txt(ax, BY + 33, 'rounded', { size: 10, fill: C.amber, weight: 700 }), rp, -6);
  return s;
};

/* ---------- Scene 3: now do it with time ---------- */
/* The smallest step between doubles of seconds since 1970 (math.ulp): 2.4 × 10⁻⁷ s today,
   0.25 s at 66 million years ago, 16 s at 4.54 billion years ago. The comb's spacing is a
   picture of the step widening, not to scale. */
var ROWS = [
  ['Today', '¼ µs', 2.2, ['time']],
  ["Dinosaurs' extinction", '¼ s', 8, ['dinosaur']],
  ['Earth forms', '16 s', 26, ['earth']],
];
SCENES[3] = function (lt, q) {
  var s = '';
  var LX = 18,
    Y0 = 84,
    Y1 = 202,
    TX = 30;
  // The line, now at the top, the past below.
  s += drawPath(
    'M' + LX + ' ' + Y0 + 'V' + Y1,
    Y1 - Y0,
    P(lt, 0, 0.7),
    'stroke="' + C.arc + '" stroke-width="1"',
  );
  s += G('<path d="M' + LX + ' ' + (Y1 + 4) + 'l-2.6 -4h5.2z" fill="' + C.arc + '"/>', {
    o: P(lt, 0.5, 0.3),
  });
  s += txt(LX, Y0 - 5, 'now', { size: 7, fill: C.soft, weight: 600 });
  var RY = [96, 138, 180];
  ROWS.forEach(function (r, i) {
    var t0 = q(r[3]) - 0.15;
    var a = P(lt, t0, 0.5);
    if (a <= 0) return;
    var y = RY[i];
    var row =
      '<circle cx="' +
      LX +
      '" cy="' +
      (y - 3) +
      '" r="2.4" fill="' +
      C.moment +
      '"/>' +
      txt(TX, y, r[0], { size: 9.5, anchor: 'start', weight: 700 }) +
      txt(SAFE.x1, y, r[1], { size: 11, mono: true, anchor: 'end', fill: C.amber, weight: 600 });
    // The comb of representable times; its gaps widen as the row arrives.
    var sp = lerp(2.2, r[2], smooth((lt - t0 - 0.2) / 0.8));
    var cy = y + 14,
      cx0 = TX,
      cx1 = SAFE.x1;
    row += line(cx0, cy, cx1, cy, C.soft, 0.6);
    for (var x = cx0 + 1; x <= cx1 + 0.01; x += sp)
      row += line(x.toFixed(2), cy - 7, x.toFixed(2), cy, C.amber, 0.7);
    s += G(row, { o: a, tx: (1 - a) * 14 });
  });
  // The further from 1970, the blurrier: the line warms toward the past.
  var bp = P(lt, q('blurr'), 0.6);
  s += G(
    '<defs><linearGradient id="blur3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' +
      C.amber +
      '" stop-opacity="0"/><stop offset="1" stop-color="' +
      C.amber +
      '" stop-opacity="0.9"/></linearGradient></defs>' +
      rect(LX - 1.2, Y0, 2.4, Y1 - Y0, 'url(#blur3)', { rx: 1.2 }),
    { o: bp },
  );
  return s;
};

/* ---------- Scene 4: store a fraction instead ---------- */
/** A stacked fraction centred at x: numerator over a bar over denominator, bar at y. */
function frac(x, y, n, d, size, fill) {
  var w = Math.max(String(n).length, String(d).length) * size * 0.6 + 2;
  return (
    mono(x, y - size * 0.32, n, size, fill, { anchor: 'middle' }) +
    line(x - w / 2, y, x + w / 2, y, fill, 1.1) +
    mono(x, y + size * 0.98, d, size, fill, { anchor: 'middle' })
  );
}
/** The sum, the third and the stores, faded by o (Scene 5 shrinks them away). */
function fractions(lt, q, all) {
  var s = '',
    FS = 17,
    SY = 92;
  var cue = function (t) {
    return all ? 1 : P(lt, t, 0.35);
  };
  // 1/10 + 2/10 = 3/10, term by term.
  var t1 = all ? 0 : q('tenth') - 0.1,
    t2 = all ? 0 : q('one') - 0.1,
    t3 = all ? 0 : q('ten', 1, q('one')) + 0.1;
  var X = [22, 42, 62, 84, 106];
  s += pop(frac(X[0], SY, '1', '10', FS, C.green), cue(t1), X[0], SY);
  s += pop(
    mono(X[1], SY + 5, '+', FS, C.text, { anchor: 'middle' }) +
      frac(X[2], SY, '2', '10', FS, C.green),
    cue(t2),
    X[2],
    SY,
  );
  s += pop(
    mono(X[3], SY + 5, '=', FS, C.text, { anchor: 'middle' }) +
      frac(X[4], SY, '3', '10', FS, C.green),
    cue(t3),
    X[4],
    SY,
  );
  var cp = cue(t3 + 0.35);
  s += G(
    '<g transform="translate(134 ' + (SY + 1) + ') scale(2.6)">' + check(0, 0, C.green) + '</g>',
    {
      o: cp,
      s: lerp(1.8, 1, cp),
      cx: 134,
      cy: SY,
    },
  );
  // A third of a second stays a third.
  var th = all ? 1 : P(lt, q('third') - 0.2, 0.5);
  var TY = 147;
  s += G(
    frac(52, TY, '1', '3', 22, C.green) +
      mono(70, TY + 7, 's', 16, C.green) +
      txt(90, TY - 3, 'stays', { size: 9, fill: C.soft, anchor: 'start', weight: 600 }) +
      txt(90, TY + 10, 'exactly ⅓', { size: 12, fill: C.text, anchor: 'start', weight: 700 }),
    { o: th, tx: (1 - th) * -18 },
  );
  // Four billion years back, or a billion times zoomed in.
  var bk = all ? 1 : P(lt, q('back') - 0.1, 0.4),
    zm = all ? 1 : P(lt, q('zoom') - 0.1, 0.4);
  s += rise(
    txt(SAFE.cx + 4, 181, '4 billion years back ·', {
      size: 8,
      fill: C.soft,
      weight: 600,
      anchor: 'end',
    }),
    bk,
    4,
  );
  s += rise(
    txt(SAFE.cx + 6.5, 181, 'a billion× zoom', {
      size: 8,
      fill: C.soft,
      weight: 600,
      anchor: 'start',
    }),
    zm,
    4,
  );
  // Exact in every store.
  var ch = all ? 1 : P(lt, q('stores') - 0.3, 0.5);
  var cw = 112;
  s += rise(
    rect(SAFE.cx - cw / 2, 186, cw, 24, C.card, { rx: 5, stroke: C.green, sw: 0.8 }) +
      txt(SAFE.cx, 196, 'exact in the editor,', { size: 7.5, fill: C.text, weight: 600 }) +
      txt(SAFE.cx, 205.4, 'the server and the files', { size: 7.5, fill: C.text, weight: 600 }),
    ch,
    4,
  );
  return s;
}
SCENES[4] = function (lt, q) {
  return fractions(lt, q, false);
};

/* ---------- Scene 5: check it ---------- */
SCENES[5] = function (lt, q) {
  var sh = smooth(lt / 0.5);
  var s = '';
  if (sh < 1)
    s += G(fractions(lt, q, true), { o: 1 - sh, s: lerp(1, 0.4, sh), cx: SAFE.cx, cy: 150 });
  s += shortEnd(P(lt, 0.35, 0.7), 'Every time is a fraction');
  return s;
};
