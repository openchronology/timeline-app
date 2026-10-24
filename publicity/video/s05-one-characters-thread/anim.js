// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 5, Check one character's thread (publicity/shorts/5-one-characters-thread.md): a
   vertical short for writers. Three characters' threads tangle into a knot; then the made-up
   world "The Ember Crown" (samples/saga.ochx) in the real editor on a phone, captured in
   shots.json: the whole world in years After the Reckoning, the saga with Mirelle's thread
   separated by tags; then Shift or scale times… drawn over the dimmed phone, her track sliding
   a year later and back on Undo; and the end card. Scenes are pure functions of scene time lt;
   q("word") is when that word is said. */

/* The sample's own colours and shapes (samples/saga.mjs). */
var EMBER = '#e0603a',
  TIDE = '#6fa3d8',
  SHADOW = '#9a7fd1',
  GOLD = '#d9a441';
function shape(x, y, kind, col, r) {
  r = r || 2.6;
  var edge = ' stroke="' + C.ground + '" stroke-width="0.6"';
  if (kind === 'diamond')
    return (
      '<path d="M' +
      x +
      ' ' +
      (y - r * 1.25) +
      'l' +
      r * 1.25 +
      ' ' +
      r * 1.25 +
      'l' +
      -r * 1.25 +
      ' ' +
      r * 1.25 +
      'l' +
      -r * 1.25 +
      ' ' +
      -r * 1.25 +
      'z" fill="' +
      col +
      '"' +
      edge +
      '/>'
    );
  if (kind === 'square')
    return rect(x - r, y - r, 2 * r, 2 * r, col, { rx: 0.4 }).replace('/>', edge + '/>');
  return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + col + '"' + edge + '/>';
}
/** A ring that draws attention to (x, y), growing in with p. */
function ring(x, y, p, r, col) {
  if (p <= 0.001) return '';
  r = r || 4;
  return (
    '<circle cx="' +
    x.toFixed(2) +
    '" cy="' +
    y.toFixed(2) +
    '" r="' +
    (r * lerp(1.6, 1, p)).toFixed(2) +
    '" fill="none" stroke="' +
    (col || C.strong) +
    '" stroke-width="1" opacity="' +
    p.toFixed(3) +
    '"/>'
  );
}

/* ---------- the phone, with a camera on the captured frame ---------- */
/* The phone's screen on the stage, and a camera on the shot (1080 × 1800 px): zoom z about the
   shot pixel (fx, fy), which sits at the screen's centre. */
var SCR = { x: 5, y: 72, w: 150, h: 136 };
var SHOT_W = 1080;
function pcam(z, fx, fy) {
  var k = (z * SCR.w) / SHOT_W;
  return {
    z: z,
    fx: fx,
    fy: fy,
    k: k,
    x: function (px) {
      return SCR.x + SCR.w / 2 + (px - fx) * k;
    },
    y: function (py) {
      return SCR.y + SCR.h / 2 + (py - fy) * k;
    },
  };
}
function camMix(a, b, p) {
  return pcam(lerp(a.z, b.z, p), lerp(a.fx, b.fx, p), lerp(a.fy, b.fy, p));
}
/** The phone showing shot layers [{id, st, op}] through camera c. */
function phone(c, layers) {
  var b = 5,
    r = 9;
  var s =
    rect(SCR.x - b - 0.8, SCR.y - b + 1.6, SCR.w + 2 * b + 1.6, SCR.h + 2 * b, '#000', {
      rx: r + b,
      op: 0.25,
    }) +
    rect(SCR.x - b, SCR.y - b, SCR.w + 2 * b, SCR.h + 2 * b, '#0c0f18', {
      rx: r + b,
      stroke: C.line,
      sw: 0.5,
    }) +
    '<defs><clipPath id="scr-clip">' +
    rect(SCR.x, SCR.y, SCR.w, SCR.h, '#000', { rx: r }) +
    '</clipPath></defs>' +
    '<g clip-path="url(#scr-clip)">' +
    rect(SCR.x, SCR.y, SCR.w, SCR.h, '#141b2e');
  layers.forEach(function (l) {
    var sh = (typeof SHOTS !== 'undefined' && SHOTS[l.id]) || { width: 480, height: 640 };
    var hpx = (SHOT_W * sh.height) / sh.width;
    var op = l.op === undefined ? 1 : l.op;
    if (op <= 0.001) return;
    s +=
      '<image href="' +
      shotFrame(l.id, l.st) +
      '" x="' +
      c.x(0).toFixed(2) +
      '" y="' +
      c.y(0).toFixed(2) +
      '" width="' +
      (SHOT_W * c.k).toFixed(2) +
      '" height="' +
      (hpx * c.k).toFixed(2) +
      '" opacity="' +
      op.toFixed(3) +
      '"/>';
  });
  return s + '</g>';
}
/** Clips marks to the phone's screen. */
function clipScr(inner) {
  return inner ? '<g clip-path="url(#scr-clip)">' + inner + '</g>' : '';
}
/** A label chip, centred at x, its colour lit by p. */
function tag(x, y, s, col, lit, o) {
  o = o || {};
  var size = o.size || 6.8;
  var w = textWidth(s, size) + 10;
  return (
    rect(x - w / 2, y - 8, w, 11.5, mix(C.card, col, 0.25 * lit), {
      rx: 5.75,
      stroke: mix(C.line, col, 0.4 + 0.6 * lit),
      sw: 0.7 + 0.4 * lit,
      op: 0.97,
    }) + txt(x, y + 0.6, s, { size: size, weight: 700, serif: true })
  );
}

/* The phone's cameras: the canvas of the whole world; the top of the editor (its toolbar);
   the separated tracks. */
var CAM_WORLD = pcam(1, 540, 1030);
var CAM_TOP = pcam(1, 540, 490);
var CAM_MID = pcam(1, 540, 900);
var CAM_TRACKS = pcam(1.45, 530, 1152);

/** A scene whose phone holds across the cuts: the overlays (drawn over the phone) fade with the
    scene, the phone doesn't. */
function overPhone(ph, over, lt, q, o) {
  o = o || {};
  var f = Math.min(P(lt, 0, 0.2), 1 - clamp01((lt - (q.dur - 0.15)) / 0.15));
  return { svg: '', keep: ph + G(over, { o: f }), keepIn: o.keepIn !== false, keepOut: true };
}

/* ---------- Scene 1: many threads, one knot ---------- */
var CAST = [
  // [x, y, rotation, shape, colour, name lines]
  [38, 99, -9, 'diamond', EMBER, ['Ash']],
  [80, 92, 0, 'circle', TIDE, ['Mirelle']],
  [122, 99, 9, 'square', SHADOW, ['The Hollow', 'King']],
];
SCENES[1] = function (lt) {
  var s = '';
  // The threads, behind the cards: each leaves its card, loops through the knot, and leaves.
  var tight = smooth(lt / 4.6);
  var K = { x: 80, y: 170 };
  var R = lerp(19, 10.5, tight);
  CAST.forEach(function (c, i) {
    var a = (c[2] * Math.PI) / 180;
    var sx = c[0] - 17 * Math.sin(a),
      sy = c[1] + 17 * Math.cos(a);
    var phi = (i * 2 * Math.PI) / 3 + lt * 0.12;
    var loop = function (th) {
      var rr = R * (1 + 0.22 * Math.sin(2 * th + i * 1.7));
      return [K.x + rr * Math.cos(th), K.y + 0.72 * rr * Math.sin(th)];
    };
    var pts = [];
    var E = loop(phi);
    for (var u = 0; u <= 1.0001; u += 0.05) {
      var cx = sx,
        cy = (sy + E[1]) / 2 + 6;
      pts.push([
        (1 - u) * (1 - u) * sx + 2 * u * (1 - u) * cx + u * u * E[0],
        (1 - u) * (1 - u) * sy + 2 * u * (1 - u) * cy + u * u * E[1],
      ]);
    }
    var turns = 1.35;
    for (var v = 0; v <= 1.0001; v += 0.02) pts.push(loop(phi + v * turns * 2 * Math.PI));
    var L = pts[pts.length - 1],
      X = [76 + i * 4, 207];
    for (var w = 0.05; w <= 1.0001; w += 0.05)
      pts.push([
        (1 - w) * (1 - w) * L[0] + 2 * w * (1 - w) * L[0] + w * w * X[0],
        (1 - w) * (1 - w) * L[1] + 2 * w * (1 - w) * (X[1] - 6) + w * w * X[1],
      ]);
    s +=
      '<path d="M' +
      pts
        .map(function (p) {
          return p[0].toFixed(2) + ' ' + p[1].toFixed(2);
        })
        .join('L') +
      '" fill="none" stroke="' +
      c[4] +
      '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>';
  });
  // The three character cards, fanned.
  CAST.forEach(function (c) {
    var card3 =
      rect(c[0] - 20, c[1] - 17, 40, 34, C.card, { rx: 3, stroke: c[4], sw: 0.8 }) +
      shape(c[0], c[1] - 6, c[3], c[4], 4.2);
    c[5].forEach(function (l, k) {
      card3 += txt(c[0], c[1] + (c[5].length > 1 ? 6 + k * 7 : 9.5), l, {
        size: c[5].length > 1 ? 6.6 : 7.6,
        weight: 700,
        serif: true,
      });
    });
    s += '<g transform="rotate(' + c[2] + ' ' + c[0] + ' ' + c[1] + ')">' + card3 + '</g>';
  });
  return s;
};

/* ---------- Scene 2: the whole world, in its own calendar ---------- */
SCENES[2] = function (lt, q) {
  var c = CAM_WORLD;
  var ph = phone(c, [{ id: 'world', st: 0 }]);
  var s = '';
  // The calendar chip, under the ruler's "0 AR", with a leader up to it.
  var a = P(lt, q('calendar'), 0.5);
  var lx = c.x(77),
    ly = c.y(1078);
  s += G(
    rect(lx - 11, ly - 5.6, 22, 8, 'none', { rx: 4, stroke: C.strong, sw: 0.8 }) +
      '<path d="M' +
      lx +
      ' ' +
      (ly + 2.6) +
      'V' +
      (ly + 10) +
      '" stroke="' +
      C.strong +
      '" stroke-width="0.8"/>',
    { o: a },
  );
  s += pop(tag(lx + 40, ly + 17, 'AR · your own calendar', GOLD, 1, { size: 6.8 }), a, lx, ly + 17);
  // The saga, crowded at the right.
  s += clipScr(ring(c.x(985), c.y(1016), P(lt, q('reckoning'), 0.5), 6));
  // It's made up.
  s += txt(SCR.x + SCR.w / 2, SCR.y + SCR.h - 7, 'An invented world, made for this video', {
    size: 5.6,
    fill: C.soft,
    italic: true,
    weight: 500,
    serif: true,
  });
  var r = P(lt, 0, 0.7);
  return overPhone(rise(ph, r, 12), s, lt, q);
};

/* ---------- Scene 3: Separate by tags, mirelle ---------- */
/* The 'thread' shot: 0–2 s zooms from the whole world to 400.5–425.5 AR; at 2.6 s Mirelle's
   thread is separated; 4.4–6 s it zooms to 417.8–424 AR. Shot pixels of her steps: */
var BORN = [198, 1020],
  VOYAGE = [455, 1066],
  MAP = [563, 1020],
  ESCAPE = [803, 1020];
SCENES[3] = function (lt, q) {
  var tSep = q('lifts'),
    tBorn = q('born'),
    tVoy = q('voyage'),
    tMap = q('map'),
    tEsc = q('escape');
  var tPress = Math.max(0.7, q('separate') + 0.3);
  var tPan = Math.max(tBorn + 0.7, tVoy - 1.0);
  // Shot time: the zoom into the saga, then the separated frame, then the pan to 418–424.
  var stPre = Math.min(2, lt * 1.05);
  var stPost = lt < tPan ? 3.6 : Math.min(6.2, 4.4 + (lt - tPan) * 2);
  var x = P(lt, tSep, 0.25);
  var c = camMix(
    camMix(CAM_TOP, CAM_MID, smooth((lt - tSep) / 0.9)),
    CAM_TRACKS,
    smooth((lt - tBorn + 0.6) / 0.8),
  );
  var ph = phone(c, [
    { id: 'thread', st: stPre, op: x < 1 ? 1 : 0 },
    { id: 'thread', st: stPost, op: x },
  ]);
  var s = '';
  // The pointer presses Separate by tags and chooses mirelle.
  var bx = c.x(412),
    by = c.y(150);
  var pa = P(lt, tPress - 0.7, 0.4) * (1 - P(lt, tSep - 0.2, 0.3));
  if (pa > 0.001) {
    var press = clamp01((lt - tPress) / 0.5);
    s += G(rect(bx - 19, by - 5.2, 38, 10.4, 'none', { rx: 3, stroke: C.strong, sw: 1 }), {
      o: P(lt, tPress, 0.3) * pa,
    });
    var ca = P(lt, q(['choose', 'shoes']), 0.4);
    s += G(
      rect(bx - 20, by + 9, 46, 16, C.card, { rx: 2.4, stroke: C.line, sw: 0.6 }) +
        check(bx - 13, by + 17.4, TIDE) +
        tag(bx + 7, by + 18.2, 'mirelle', TIDE, 1, { size: 6.4 }),
      { o: ca * pa, ty: (1 - ca) * -3 },
    );
    var m = smooth((lt - (tPress - 0.7)) / 0.6);
    var px = lerp(bx + 30, bx + 4, m),
      py = lerp(by + 40, by + 2, m);
    if (ca > 0.001) {
      px = lerp(px, bx + 8, ca);
      py = lerp(py, by + 19, ca);
    }
    s += pointer(px, py, { o: pa });
    if (press > 0 && press < 1) s += finger(bx + 4, by + 2, press);
  }
  // Everything else, below her track, dims.
  var z = smooth((lt - tSep - 0.3) / 1.0);
  var lowTop = Math.max(SCR.y, c.y(1200));
  s += clipScr(rect(SCR.x, lowTop, SCR.w, SCR.y + SCR.h - lowTop, C.ground, { op: 0.6 * z }));
  // Her steps, glowing as they're named.
  var before = 1 - P(lt, tPan, 0.3);
  var after = P(lt, tPan + 0.7, 0.3);
  var step = function (pt, t, label, ly, op, next) {
    var a = P(lt, t, 0.4) * op;
    if (a <= 0.001) return '';
    var lit = clamp01(1 - (lt - (next || t + 1)) / 0.5) * a;
    var X = c.x(pt[0]),
      Y = c.y(pt[1]);
    var hw = (textWidth(label, 6.8) + 10) / 2;
    var lx = Math.max(SAFE.x0 + hw, Math.min(SAFE.x1 - hw, X));
    return G(
      clipScr(ring(X, Y, lit, 4.2)) +
        '<path d="M' +
        X +
        ' ' +
        (Y + 3.5) +
        'L' +
        lx +
        ' ' +
        (ly - 8) +
        '" stroke="' +
        mix(C.line, TIDE, lit) +
        '" stroke-width="0.7"/>' +
        tag(lx, ly, label, TIDE, lit),
      { o: a },
    );
  };
  var yA = c.y(1200) + 5;
  s += step(BORN, tBorn, 'born at sea', yA, before, tPan);
  s += step(VOYAGE, tVoy, 'the voyage', yA, after, tMap);
  s += step(MAP, tMap, 'the map', yA + 15, after, tEsc);
  s += step(ESCAPE, tEsc, 'the escape', yA, after, tEsc + 1.4);
  return overPhone(ph, s, lt, q);
};

/* ---------- Scene 4: Shift or scale times…, her track a year later, and Undo ---------- */
var SAGA = [
  // [year AR, shape, colour, tagged mirelle]
  [419.2, 'circle', GOLD, false],
  [420.3, 'diamond', EMBER, false],
  [420.9, 'circle', TIDE, true],
  [421.2, 'diamond', GOLD, true],
  [422.1, 'square', SHADOW, true],
  [422.5, 'diamond', EMBER, false],
  [422.6, 'circle', TIDE, true],
  [423.3, 'square', SHADOW, false],
  [423.4, 'diamond', GOLD, true],
];
var SAGA_BANDS = [
  // [from, to, colour, tagged mirelle, row]
  [414, 420.3, EMBER, false, 0],
  [419.5, 421.2, TIDE, true, 0],
  [421.2, 423.3, GOLD, true, 1],
  [422.1, 423.4, SHADOW, false, 1],
];
function phoneTracksDim(dim) {
  return (
    phone(CAM_TRACKS, [{ id: 'thread', st: 99 }]) +
    clipScr(rect(SCR.x, SCR.y, SCR.w, SCR.h, C.ground, { op: dim }))
  );
}
SCENES[4] = function (lt, q) {
  var tLater = q('later'),
    tTag = q(['tagged', 'tag']),
    tUndo = q(['undo', 'and']);
  var dim = lerp(0.6 * 0, 0.82, P(lt, 0, 0.5));
  var ph = phoneTracksDim(dim);
  var s = '';
  // The dialog: its offset fills in on "year"; it closes once the move is made.
  var dp = P(lt, 0.15, 0.45) * (1 - P(lt, tUndo - 1.2, 0.4));
  var dx = 14,
    dy = 77,
    dw = 132;
  if (dp > 0.001) {
    var f1 = P(lt, q('year'), 0.35);
    var glow = P(lt, tTag, 0.3) * (1 - P(lt, tTag + 1.2, 0.5));
    var d =
      rect(dx, dy, dw, 50, C.card, { rx: 3, stroke: C.accent, sw: 0.8 }) +
      txt(dx + 8, dy + 11.5, 'Shift or scale times', {
        size: 8,
        anchor: 'start',
        weight: 700,
        serif: true,
      });
    d += txt(dx + 8, dy + 26, 'Offset', { size: 6.4, anchor: 'start', fill: C.soft, weight: 500 });
    d += rect(dx + 42, dy + 18.5, 82, 10.5, C.ground, {
      rx: 1.6,
      stroke: mix(C.line, C.accent, f1),
      sw: 0.6,
    });
    d += G(txt(dx + 46, dy + 26, '+1 year', { size: 6.6, anchor: 'start', mono: true }), {
      o: f1,
    });
    d += txt(dx + 8, dy + 41, 'Apply to', {
      size: 6.4,
      anchor: 'start',
      fill: C.soft,
      weight: 500,
    });
    d += rect(dx + 42, dy + 33.5, 82, 10.5, C.ground, {
      rx: 1.6,
      stroke: mix(C.line, TIDE, glow),
      sw: 0.6 + 0.5 * glow,
    });
    d +=
      txt(dx + 46, dy + 41, 'with tags ·', { size: 6.4, anchor: 'start' }) +
      tag(dx + 99, dy + 40.4, 'mirelle', TIDE, glow, { size: 6 });
    s += pop(d, dp, 80, dy + 25);
  }
  // A drawn saga: her track slides one year later as one; the rest stays put; Undo puts it back.
  var slide = smooth((lt - tLater) / 1.2) * (1 - smooth((lt - tUndo - 0.15) / 1.0));
  var v = view(16, 144, 417.8, 425.4);
  var cy0 = 133,
    ry = [152, 180],
    ay = 197;
  var t = rect(12, cy0, 136, 76, C.card, { rx: 3, stroke: C.line, sw: 0.6, op: 0.97 });
  t +=
    txt(16, cy0 + 9, 'Tagged mirelle', { size: 5.6, anchor: 'start', fill: TIDE, weight: 700 }) +
    txt(16, cy0 + 37, 'Everything else', {
      size: 5.6,
      anchor: 'start',
      fill: C.soft,
      weight: 700,
    });
  t += '<defs><clipPath id="trk-clip">' + rect(14, cy0, 132, 76, '#000') + '</clipPath></defs>';
  var marks = '';
  [0, 1].forEach(function (r) {
    marks += '<path d="M16 ' + ry[r] + 'H144" stroke="' + C.line + '" stroke-width="0.6"/>';
  });
  var rest = lerp(1, 0.5, clamp01(slide * 2));
  // Ghosts where her thread was.
  var ghost = clamp01(slide * 3);
  SAGA.forEach(function (m) {
    if (m[3])
      marks += G(
        '<circle cx="' +
          vx(v, m[0]) +
          '" cy="' +
          ry[0] +
          '" r="2.6" fill="none" stroke="' +
          C.soft +
          '" stroke-width="0.5" stroke-dasharray="1 0.8"/>',
        { o: ghost * 0.9 },
      );
  });
  SAGA_BANDS.forEach(function (b) {
    var off = b[3] ? slide : 0;
    var y = (b[3] ? ry[0] : ry[1]) + 5 + b[4] * 5;
    marks += G(band(vx(v, b[0] + off), vx(v, b[1] + off), y, '', { h: 3.6, color: b[2] }), {
      o: b[3] ? 1 : rest,
    });
  });
  SAGA.forEach(function (m) {
    var off = m[3] ? slide : 0;
    marks += G(shape(vx(v, m[0] + off), m[3] ? ry[0] : ry[1], m[1], m[2], 2.6), {
      o: m[3] ? 1 : rest,
    });
  });
  t += '<g clip-path="url(#trk-clip)">' + marks + '</g>';
  t += axis(
    v,
    ay,
    ticksEvery(418, 425, 1, function (y) {
      return y % 2 === 0 ? y + ' AR' : '';
    }),
    { tickSize: 5.4, serif: true, color: C.line },
  );
  // "+1 year" over the move.
  var arrowOp = clamp01(slide * 2) * (1 - P(lt, tUndo, 0.3));
  var ax0 = vx(v, 420.9),
    ax1 = vx(v, 421.9);
  t += G(
    '<path d="M' +
      ax0 +
      ' ' +
      (ry[0] - 7) +
      'H' +
      ax1 +
      'm-2 -1.8l2 1.8-2 1.8" fill="none" stroke="' +
      TIDE +
      '" stroke-width="0.9"/>' +
      txt(ax1 + 3, ry[0] - 4.8, '+1 year', {
        size: 6.2,
        fill: TIDE,
        mono: true,
        anchor: 'start',
        weight: 700,
      }),
    { o: arrowOp },
  );
  s += rise(t, P(lt, 0.4, 0.5), 5);
  // The Undo key, in the dialog's place, pressed on "Undo".
  var ua = P(lt, tUndo - 0.9, 0.4);
  if (ua > 0.001) {
    var pr = clamp01((lt - tUndo) / 0.18) * (1 - clamp01((lt - tUndo - 0.35) / 0.2));
    var kw = 50,
      kx = 80 - kw / 2,
      ky = 92;
    var key =
      rect(kx, ky + 3, kw, 22, '#0a0e18', { rx: 4 }) +
      rect(kx, ky + 2.2 * pr, kw, 22, mix(C.card, C.accent, 0.35 * pr), {
        rx: 4,
        stroke: mix(C.soft, C.strong, pr),
        sw: 1,
      }) +
      txt(80, ky + 15 + 2.2 * pr, 'Undo', { size: 11, mono: true, weight: 700 });
    s += pop(key, ua, 80, ky + 11);
    if (pr > 0) s += finger(80 + 9, ky + 13 + 2.2 * pr, clamp01((lt - tUndo) / 0.5));
  }
  return overPhone(ph, s, lt, q);
};

/* ---------- Scene 5: the phone eases away; the end card ---------- */
SCENES[5] = function (lt) {
  var away = smooth(lt / 0.6);
  var ph = G(phoneTracksDim(0.82), { o: 1 - away, s: lerp(1, 0.86, away), cx: 80, cy: 142 });
  return {
    svg: shortEnd(P(lt, 0.5, 0.8), 'Keep your canon straight'),
    keep: ph,
    keepIn: true,
    noHeadline: true,
  };
};
