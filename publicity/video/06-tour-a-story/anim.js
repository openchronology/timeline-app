// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 6, Tour: a story's timeline (publicity/6-tour-a-storys-timeline.md): the sample world
   "The Ember Crown" (samples/saga.ochx) in the real editor, captured in shots.json: the whole
   world after Fit all, the saga zoomed to 414–424 AR, Mirelle's thread separated by tags, the
   prophecy at Greyfen in the reader; then Shift or scale times… drawn over a dimmed still, and
   where the work is kept. Scenes are pure functions of scene time lt; q("word") is when that
   word is said. */

/* The browser window every tour scene shows the app in, and the map from a captured frame's
   pixels (1920 × 1080) to scene units, optionally zoomed into the pixel (fx, fy) by z. */
var WIN = { x: 35, y: 12, w: 250 };
var K = WIN.w / 1920;
function cam(z, fx, fy) {
  z = z || 1;
  fx = fx === undefined ? 960 : fx;
  fy = fy === undefined ? 540 : fy;
  return {
    z: z,
    fx: fx,
    fy: fy,
    x: function (px) {
      return WIN.x + fx * K + (px - fx) * K * z;
    },
    y: function (py) {
      return WIN.y + fy * K + (py - fy) * K * z;
    },
  };
}
/** The app window showing shot `id` at shot time st, seen through camera c (zoomed and
    clipped to the window), with o.op fading an overlay frame (o.next at o.nextSt) on top. */
function app(id, st, c, o) {
  o = o || {};
  var s = appWindow(WIN.x, WIN.y, WIN.w, id, st);
  var h = (WIN.w * 9) / 16;
  var layer = function (sid, sst, op) {
    return (
      '<image href="' +
      shotFrame(sid, sst) +
      '" x="' +
      c.x(0).toFixed(2) +
      '" y="' +
      c.y(0).toFixed(2) +
      '" width="' +
      (WIN.w * c.z).toFixed(2) +
      '" height="' +
      (h * c.z).toFixed(2) +
      '" opacity="' +
      op.toFixed(3) +
      '" clip-path="url(#win-clip)"/>'
    );
  };
  var zoomed = c.z > 1.001 || c.fx !== 960 || c.fy !== 540;
  s +=
    '<defs><clipPath id="win-clip">' + rect(WIN.x, WIN.y, WIN.w, h, '#000') + '</clipPath></defs>';
  if (zoomed) s += rect(WIN.x, WIN.y, WIN.w, h, '#141b2e') + layer(id, st, 1);
  if (o.next && o.op > 0.001) s += layer(o.next, o.nextSt, o.op);
  return s;
}
/** Clips scene marks to the app window. */
function clipWin(inner) {
  return inner ? '<g clip-path="url(#win-clip)">' + inner + '</g>' : '';
}
function winH() {
  return (WIN.w * 9) / 16;
}

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
/** A gold ring that draws attention to (x, y), growing in with p. */
function ring(x, y, p, r) {
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
    C.strong +
    '" stroke-width="0.9" opacity="' +
    p.toFixed(3) +
    '"/>'
  );
}
/** A callout card with one line of text, its width fitted to the text. */
function callout(x, y, s, o) {
  o = o || {};
  var size = o.size || 5.6;
  var w = textWidth(s, size) + 12;
  return (
    rect(x, y, w, 13, C.card, { rx: 2.4, stroke: C.accent, sw: 0.7, op: 0.97 }) +
    txt(x + 6, y + 8.9, s, { size: size, anchor: 'start', weight: 600, serif: o.serif })
  );
}
function calloutWidth(s, size) {
  return textWidth(s, size || 5.6) + 12;
}

/* ---------- Scene 1: the whole world after Fit all ---------- */
SCENES[1] = function (lt, q) {
  var c = cam(1);
  var s = rise(app('fit', 0, c), P(lt, 0, 0.9), 4);
  // The callout names the time display and draws a leader to the "400 AR" ruler label.
  var label = 'Time display: years After the Reckoning (AR)';
  var cx = 58,
    cy = 98;
  var a = P(lt, q('counted'), 0.6);
  s += rise(callout(cx, cy, label), a, 4);
  var lx = c.x(1708),
    ly = c.y(331);
  var x0 = cx + calloutWidth(label),
    y0 = cy + 6.5;
  var lp = P(lt, q('ruler'), 0.8);
  s += drawPath(
    'M' + x0 + ' ' + y0 + 'H' + (lx - 14) + 'L' + (lx - 3) + ' ' + (ly + 3.4),
    lx - x0 + 16,
    lp,
    'stroke="' + C.accent + '" stroke-width="0.7"',
  );
  s += G(rect(lx - 9, ly - 3.6, 18, 7.2, 'none', { rx: 3.6, stroke: C.strong, sw: 0.8 }), {
    o: P(lt, q('ruler') + 0.7, 0.4),
  });
  // The saga, packed into the last few years at the right.
  s += ring(c.x(1792), c.y(298), P(lt, q('packed'), 0.6), 7);
  return s;
};

/* ---------- Scene 2: zoom into 414–424 AR; the legend ---------- */
SCENES[2] = function (lt, q) {
  var c = cam(1);
  // The shot holds the whole world for 0.5 s, then zooms in for 5.5 s.
  var st = Math.max(0, lt - (q('zoom') - 0.3));
  var s = app('zoom', st, c);
  // The legend, one row per character as each is named, in an empty corner of the frame.
  var rows = [
    ['diamond', EMBER, 'Ash', q('ash')],
    ['circle', TIDE, 'Mirelle', q('mirelle')],
    ['square', SHADOW, 'the Hollow King', q('hollow')],
    ['circle', GOLD, 'gold: the world', q('hollow') + 1.1],
  ];
  var lx = 50,
    ly = 96;
  var first = P(lt, rows[0][3] - 0.2, 0.5);
  s += G(rect(lx, ly, 74, 46, C.card, { rx: 2.4, stroke: C.line, sw: 0.6, op: 0.96 }), {
    o: first,
  });
  rows.forEach(function (r, i) {
    var a = P(lt, r[3], 0.5);
    var y = ly + 10 + i * 10;
    s += G(
      shape(lx + 9, y - 1.8, r[0], r[1], 2.4) +
        txt(lx + 16, y, r[2], { size: 5.4, anchor: 'start', weight: 600 }),
      { o: a, tx: (1 - a) * -5 },
    );
  });
  // Journeys and wars are bands: a soft bracket beside the band rows.
  var bp = P(lt, q('bands'), 0.6);
  if (bp > 0.001)
    s += G(
      rect(c.x(112), c.y(336), (1708 - 112) * K, 54 * K, 'none', {
        rx: 1.6,
        stroke: C.strong,
        sw: 0.7,
      }),
      { o: bp * (1 - P(lt, q('bands') + 2.6, 0.6)) },
    );
  // Where paths cross: Ash and Mirelle meet.
  s += ring(c.x(1327), c.y(298), P(lt, q('cross'), 0.5), 4.2);
  return s;
};

/* ---------- Scene 3: Separate by tags, mirelle ---------- */
SCENES[3] = function (lt, q) {
  var tSep = q('moves');
  // Before: the saga as it was; after, the separated tracks, with a gentle zoom on her track.
  var x = P(lt, tSep, 0.6);
  var z = smooth((lt - tSep - 0.2) / 1.6);
  var c = cam(lerp(1, 1.25, z), lerp(960, 1500, z), lerp(540, 380, z));
  var s = app('separate', x < 1 ? 0.5 : 2, c, { next: 'separate', nextSt: 2, op: x });
  // The pointer presses Separate by tags and chooses mirelle.
  var bx = WIN.x + 975 * K,
    by = WIN.y + 33 * K;
  var pa = P(lt, q('separate') - 0.6, 0.5) * (1 - P(lt, tSep - 0.1, 0.25));
  if (pa > 0.001) {
    var press = clamp01((lt - q('separate')) / 0.5);
    s += G(rect(bx - 19, by - 4.6, 38, 9.2, 'none', { rx: 2, stroke: C.strong, sw: 0.8 }), {
      o: P(lt, q('separate'), 0.3) * pa,
    });
    var ca = P(lt, q('choose'), 0.4);
    s += G(chip(bx - 14, by + 18, 'mirelle', TIDE, { size: 5.6 }), {
      o: ca * pa,
      ty: (1 - ca) * -3,
    });
    s += pointer(bx + 2, by + 1, { o: pa });
    if (press > 0 && press < 1) s += finger(bx + 2, by + 1, press);
  }
  // The lower track (everything else) dims slightly.
  var h = winH();
  var lowTop = Math.max(WIN.y, c.y(590));
  s += G(rect(WIN.x, lowTop, WIN.w, WIN.y + h - lowTop, C.ground), { o: 0.38 * z });
  // Her thread, on its own.
  var lab = 'Her thread, on its own';
  s += rise(callout(c.x(440), c.y(250), lab, { serif: true, size: 6 }), P(lt, tSep + 1.4, 0.6), 4);
  // The parts of her thread as they're named.
  s += clipWin(
    ring(c.x(1185), c.y(456), P(lt, q('voyage'), 0.5), 4) +
      ring(c.x(1277), c.y(410), P(lt, q('chart'), 0.5), 4) +
      ring(c.x(1561), c.y(410), P(lt, q('escape'), 0.5), 4),
  );
  return s;
};

/* ---------- Scene 4: the prophecy's arcs, the reader, and following a link ---------- */
SCENES[4] = function (lt, q) {
  var tOpen = q('opening'),
    tFollow = tOpen + 1.9;
  // Shot time: 0–0.9 before the reader opens (it opens at shot time 1), then the reader;
  // the link is followed at shot time 5.
  var st =
    lt < tOpen
      ? Math.min(0.9, lt * 0.2)
      : lt < tFollow
        ? Math.min(4.85, 1 + (lt - tOpen))
        : 5 + (lt - tFollow);
  var z = smooth((lt - tOpen - 0.1) / 1.2);
  var c = cam(lerp(1, 1.6, z), 960, 540);
  var s = app('reader', st, c);
  // Before the reader: the prophecy, and the arcs to the shard and to the crown reforged.
  var arcOp = 1 - z;
  if (arcOp > 0.001) {
    var px0 = c.x(993),
      y0 = c.y(298);
    var link = function (toPx, ctrl, p) {
      var x1 = c.x(toPx);
      return (
        drawPath(
          'M' + px0 + ' ' + y0 + 'Q' + (px0 + x1) / 2 + ' ' + c.y(ctrl) + ' ' + x1 + ' ' + y0,
          (x1 - px0) * 1.6 + 30,
          p,
          'stroke="' + C.strong + '" stroke-width="1.2" stroke-linecap="round"',
        ) + ring(x1, y0, P(p, 0.85, 0.15), 3.6)
      );
    };
    var glow = 1;
    s += clipWin(
      G(
        ring(px0, y0, P(lt, q('prophecy'), 0.5), 3.6) +
          link(1177, 152, P(lt, q('shard'), 0.8)) +
          link(1687, -58, P(lt, q('crown'), 1.1)),
        { o: arcOp * glow },
      ),
    );
  }
  // The pointer moves to "The crown reforged" in Related to and follows it.
  var rx = c.x(560),
    ry = c.y(641);
  var pa = P(lt, tFollow - 1.4, 0.4) * (1 - P(lt, tFollow + 1.2, 0.4));
  if (pa > 0.001) {
    var m = smooth((lt - (tFollow - 1.4)) / 1.1);
    var px = lerp(rx + 40, rx, m),
      py = lerp(ry + 30, ry, m);
    s += pointer(px, py, { o: pa });
    var press = clamp01((lt - tFollow + 0.1) / 0.5);
    if (press > 0 && press < 1) s += finger(px, py, press);
  }
  return s;
};

/* ---------- Scene 5: Shift or scale times…, drawn over a dimmed still ---------- */
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
  // [from, to, title, colour, tagged mirelle, row]
  [414, 420.3, "Ash's apprenticeship", EMBER, false, 0],
  [419.5, 421.2, "Mirelle's voyage", TIDE, true, 1],
  [421.2, 423.3, 'The long road north', GOLD, true, 2],
  [422.1, 423.4, "The Hollow King's war", SHADOW, false, 0],
];
SCENES[5] = function (lt, q) {
  var s = app('zoom', 99, cam(1));
  var h = winH();
  s += rect(WIN.x, WIN.y, WIN.w, h, C.ground, { op: 0.8 });
  // The right-click menu, with Shift or scale times… highlighted.
  var mx = 46,
    my = 22;
  var tMenu = q('right'),
    tChoose = q('choose');
  var tDialog = q('move');
  var menuOp = P(lt, tMenu, 0.4) * (1 - P(lt, tDialog + 0.2, 0.4));
  if (menuOp > 0.001) {
    var menu = rect(mx, my, 80, 40, C.card, { rx: 2, stroke: C.line, sw: 0.6 });
    [0, 1, 3].forEach(function (i) {
      menu += rect(mx + 6, my + 6 + i * 8.6, 44 - i * 6, 3, C.line, { rx: 1.5 });
    });
    var hl = P(lt, tChoose, 0.3);
    menu += rect(mx + 2, my + 20.5, 76, 9, mix(C.card, C.accent, 0.28 * hl), {
      rx: 1.4,
      stroke: hl > 0 ? C.accent : undefined,
      sw: 0.6,
    });
    menu += txt(mx + 6, my + 26.9, 'Shift or scale times…', {
      size: 5.6,
      anchor: 'start',
      weight: 600,
    });
    s += pop(menu, menuOp, mx, my);
    s += pointer(
      mx - 1 + lerp(0, 30, smooth((lt - tChoose + 0.6) / 0.6)),
      my - 2 + lerp(0, 24, smooth((lt - tChoose + 0.6) / 0.6)),
      {
        o: menuOp,
      },
    );
  }
  // The dialog, drawn simply: its two fields fill in.
  var dp = P(lt, tDialog, 0.5);
  var dx = 82,
    dy = 18,
    dw = 156;
  if (dp > 0.001) {
    var d =
      rect(dx, dy, dw, 52, C.card, { rx: 2.6, stroke: C.accent, sw: 0.7 }) +
      txt(dx + 8, dy + 11, 'Shift or scale times', {
        size: 6.6,
        anchor: 'start',
        weight: 700,
        serif: true,
      });
    var f1 = P(lt, q('year'), 0.4),
      f2 = P(lt, q('tagged'), 0.4);
    d += txt(dx + 8, dy + 25, 'Offset', { size: 5.2, anchor: 'start', fill: C.soft, weight: 500 });
    d += rect(dx + 52, dy + 18.5, 96, 9, C.ground, { rx: 1.4, stroke: C.line, sw: 0.5 });
    d += G(txt(dx + 56, dy + 24.8, '+1 year', { size: 5.4, anchor: 'start', mono: true }), {
      o: f1,
    });
    d += txt(dx + 8, dy + 39, 'Apply to', {
      size: 5.2,
      anchor: 'start',
      fill: C.soft,
      weight: 500,
    });
    d += rect(dx + 52, dy + 32.5, 96, 9, C.ground, { rx: 1.4, stroke: C.line, sw: 0.5 });
    d += G(
      txt(dx + 56, dy + 38.8, 'with tags · ', { size: 5.4, anchor: 'start' }) +
        chip(dx + 82, dy + 37.5, 'mirelle', TIDE, { size: 5 }),
      { o: f2 },
    );
    s += rise(d, dp, 5);
  }
  // A drawn saga: her thread slides one year later as one; the rest stays put.
  var tMove = q('moves'),
    tUndo = q('one', 2);
  var slide = smooth((lt - tMove) / 1.4) * (1 - smooth((lt - tUndo - 0.3) / 1.2));
  var v = view(44, 278, 413.6, 425);
  var ay = 104;
  var tl = P(lt, tDialog + 0.6, 0.6);
  var t = '';
  t += axis(
    v,
    ay,
    ticksEvery(414, 425, 1, function (y) {
      return y % 2 === 0 ? y + ' AR' : '';
    }),
    { tickSize: 4.6, serif: true, color: C.line },
  );
  // Ghosts where her thread was.
  var ghost = clamp01(slide * 3);
  SAGA.forEach(function (m) {
    if (m[3])
      t += G(
        '<circle cx="' +
          vx(v, m[0]) +
          '" cy="' +
          ay +
          '" r="2.4" fill="none" stroke="' +
          C.soft +
          '" stroke-width="0.5" stroke-dasharray="1 0.8"/>',
        { o: ghost * 0.9 },
      );
  });
  SAGA_BANDS.forEach(function (b) {
    var off = b[4] ? slide : 0;
    var x0 = vx(v, b[0] + off),
      x1 = vx(v, b[1] + off);
    var y = ay + 13 + b[5] * 8;
    t += G(band(x0, x1, y, b[2], { h: 6, color: b[3], textFill: '#141b2e' }), {
      o: b[4] ? 1 : lerp(1, 0.45, clamp01(slide * 2)),
    });
  });
  SAGA.forEach(function (m) {
    var off = m[3] ? slide : 0;
    t += G(shape(vx(v, m[0] + off), ay, m[1], m[2], 2.3), {
      o: m[3] ? 1 : lerp(1, 0.45, clamp01(slide * 2)),
    });
  });
  // "+1 year" over the move.
  var arrowOp = clamp01(slide * 2) * (1 - P(lt, tUndo, 0.4));
  var ax0 = vx(v, 420.9),
    ax1 = vx(v, 421.9);
  t += G(
    '<path d="M' +
      ax0 +
      ' ' +
      (ay - 9) +
      'H' +
      ax1 +
      'm-2 -1.6l2 1.6-2 1.6" fill="none" stroke="' +
      TIDE +
      '" stroke-width="0.8"/>' +
      txt((ax0 + ax1) / 2, ay - 12, '+1 year', { size: 5, fill: TIDE, mono: true }),
    { o: arrowOp },
  );
  s += rise(
    rect(36, 82, 248, 66, C.card, { rx: 2.6, stroke: C.line, sw: 0.6, op: 0.94 }) + t,
    tl,
    5,
  );
  // One Undo puts it back.
  var up = P(lt, tUndo, 0.4);
  s += pop(chip(246, 92, 'Undo', C.accent, { size: 6 }), up, 260, 88);
  return s;
};

/* ---------- Scene 6: where the work is kept; the end card ---------- */
SCENES[6] = function (lt, q) {
  var s = '';
  var a1 = P(lt, q('yours'), 0.5),
    l1 = P(lt, q('desktop'), 0.5),
    a2 = P(lt, q('server'), 0.5),
    l2 = P(lt, q('private'), 0.5);
  // The desktop app: a laptop and .och files.
  var lx = 92,
    iy = 56;
  s += pop(
    ICON.laptop(lx, iy, 1.7) +
      G(ICON.file(lx - 30, iy + 2, '.och', { color: C.accent }), { s: 1.1, cx: lx - 30, cy: iy }) +
      G(ICON.file(lx + 30, iy + 2, '.och', { color: C.accent }), { s: 1.1, cx: lx + 30, cy: iy }),
    a1,
    lx,
    iy,
  );
  s += rise(
    txt(lx, iy + 32, 'Desktop app', { size: 7.4, weight: 700, serif: true }) +
      txt(lx, iy + 41, 'files on your computer', { size: 5.8, fill: C.soft, weight: 500 }),
    l1,
    4,
  );
  // A server: a browser with a padlock over it.
  var rx = 228;
  s += pop(
    ICON.browser(rx - 22, iy - 15, 44, 28, { url: 'your server' }) +
      G(ICON.padlock(rx, iy + 1, P(lt, q('private'), 0.5)), { s: 1.9, cx: rx, cy: iy + 1 }),
    a2,
    rx,
    iy,
  );
  s += rise(
    txt(rx, iy + 32, 'On a server', { size: 7.4, weight: 700, serif: true }) +
      txt(rx, iy + 41, 'private until you share it', { size: 5.8, fill: C.soft, weight: 500 }),
    l2,
    4,
  );
  // The end card rises and holds.
  var e = P(lt, q.end + 0.4, 0.9);
  s += G(
    rect(0, 0, 320, 172, C.ground, { op: 0.94 }) +
      txt(160, 70, 'Keep your canon straight', { size: 14, weight: 700, serif: true }) +
      wordmark(160, 100, 11) +
      txt(160, 116, 'github.com/openchronology/timeline-app', {
        size: 5.8,
        mono: true,
        fill: C.soft,
        weight: 500,
      }),
    { o: e, ty: (1 - e) * 6 },
  );
  return s;
};
