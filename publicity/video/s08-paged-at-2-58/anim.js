// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 8: "2:58 a.m., everything's down". A page on a phone's lock screen at 02:58, then the
   made-up incident (samples/incident.ochx) in the real app on a phone: the whole night, a zoom
   into the outage, Separate by tags on host:db-1 (its disk filling, then the PANIC), back to
   the backup job at 02:05, and the end card. Frames are pure functions of the scene's time. */

/* ---------- helpers ---------- */
/** Piecewise-linear map of scene time to shot time. */
function remap(lt, pts) {
  if (lt <= pts[0][0]) return pts[0][1];
  for (var i = 1; i < pts.length; i++)
    if (lt <= pts[i][0]) {
      var a = pts[i - 1],
        b = pts[i];
      return b[0] === a[0] ? b[1] : lerp(a[1], b[1], (lt - a[0]) / (b[0] - a[0]));
    }
  return pts[pts.length - 1][1];
}
/** A pill with a leader to (tx, ty), after Video 10's callouts; o.mono for log text. */
function callout(x, y, s, color, tx, ty, p, o) {
  o = o || {};
  var size = o.size || 6.5,
    w = textWidth(s, size, o.mono) * (o.mono ? 1.04 : 1) + 12;
  var x0 = o.anchor === 'end' ? x - w : o.anchor === 'middle' ? x - w / 2 : x;
  var ly = ty > y ? y + 3.5 : y - 7.5;
  var lead =
    tx === undefined
      ? ''
      : '<path d="M' +
        Math.min(Math.max(tx, x0 + 6), x0 + w - 6) +
        ' ' +
        ly +
        'L' +
        tx +
        ' ' +
        ty +
        '" stroke="' +
        color +
        '" stroke-width="0.9"/>' +
        '<circle cx="' +
        tx +
        '" cy="' +
        ty +
        '" r="1.5" fill="' +
        color +
        '" stroke="' +
        C.ground +
        '" stroke-width="0.5"/>';
  var pill =
    rect(x0, y - 7.5, w, 11, C.card, { rx: 5.5, stroke: color, sw: 0.9 }) +
    txt(x0 + w / 2, y + 0.8, s, { size: size, mono: o.mono, weight: 700 });
  return rise(lead + pill, p, 3);
}

/* The app's phone, where Scenes 2–4 put it: 150 wide, its toolbars running up under the
   headline and its footer fading out above the caption, so the timeline fills the middle of
   the frame. Shot frames are 1080 × 1800 px (360 × 600 CSS px at scale 3). */
var PX = 5,
  PY = -42,
  PW = 150,
  K = PW / 1080;
function fx(px) {
  return PX + px * K;
}
function fy(py) {
  return PY + py * K;
}
/** The ground fading over the top and the foot of the phone: the headline above and the
    chips and caption below read on a clear field. */
function fades() {
  return (
    '<defs><linearGradient id="s8top" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0.8" stop-color="' +
    C.ground +
    '" stop-opacity="1"/><stop offset="1" stop-color="' +
    C.ground +
    '" stop-opacity="0"/></linearGradient>' +
    '<linearGradient id="s8foot" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="' +
    C.ground +
    '" stop-opacity="0"/><stop offset="0.14" stop-color="' +
    C.ground +
    '" stop-opacity="1"/></linearGradient></defs>' +
    '<rect x="0" y="0" width="180" height="76" fill="url(#s8top)"/>' +
    '<rect x="0" y="178" width="180" height="62" fill="url(#s8foot)"/>'
  );
}
function appPhone(id, st, o) {
  o = o || {};
  return G(phoneShot(PX, PY + (o.dy || 0), PW, id, st), {
    o: o.o === undefined ? 1 : o.o,
  });
}

/* ---------- Scene 1: paged ---------- */
SCENES[1] = function (lt, q) {
  // The buzz: one shake of the notification on "paged".
  var b = clamp01((lt - q('paged')) / 0.5);
  var shake = b > 0 && b < 1 ? 2.4 * Math.sin(b * Math.PI * 8) * (1 - b) : 0;
  var x0 = 20,
    w = 140,
    top = 76;
  var s = '';
  // The phone, running off the bottom of the frame.
  s += rect(x0 - 5, top - 5, w + 10, 270, '#000', { rx: 16, op: 0.25 });
  s += rect(x0 - 4, top - 4, w + 8, 268, '#15191c', { rx: 15 });
  s += rect(x0, top, w, 260, '#0b1411', { rx: 12 });
  s += rect(80 - 12, top + 4, 24, 4, '#000', { rx: 2 });
  // The lock screen: the time, the date.
  s += txt(80, top + 44, '02:58', { size: 36, weight: 600, fill: C.text });
  s += txt(80, top + 56, 'Saturday, 14 March', { size: 7, weight: 500, fill: C.soft });
  // The alert, shaking once.
  var card =
    rect(x0 + 6, top + 66, w - 12, 34, mix(C.card, '#ffffff', 0.07), {
      rx: 6,
      stroke: mix(C.line, C.red, 0.35 + 0.65 * (b > 0 && b < 1 ? 1 - b : 0)),
      sw: 0.8,
    }) +
    '<circle cx="' +
    (x0 + 15) +
    '" cy="' +
    (top + 75.5) +
    '" r="3" fill="' +
    C.red +
    '"/>' +
    txt(x0 + 15, top + 77.4, '!', { size: 5.5, weight: 700, fill: C.ground }) +
    txt(x0 + 22, top + 77.6, 'ALERT', {
      size: 6,
      weight: 700,
      anchor: 'start',
      fill: C.red,
      ls: 0.4,
    }) +
    txt(x0 + w - 12, top + 77.6, 'now', { size: 6, weight: 500, anchor: 'end', fill: C.soft }) +
    txt(x0 + 12, top + 91, 'web: 502 rate above threshold', {
      size: 7,
      weight: 700,
      anchor: 'start',
      fill: C.text,
    });
  s += G(card, { tx: shake });
  // Buzz marks beside it while it shakes.
  if (b > 0 && b < 1) {
    var bo = Math.sin(b * Math.PI);
    s += G(
      '<path d="M' +
        (x0 + 1) +
        ' ' +
        (top + 74) +
        'l-3 3 3 3 -3 3M' +
        (x0 + w - 1) +
        ' ' +
        (top + 74) +
        'l3 3 -3 3 3 3" fill="none" stroke="' +
        C.red +
        '" stroke-width="0.9" stroke-linejoin="round"/>',
      { o: bo },
    );
  }
  return s;
};

/* ---------- Scene 2: every host, one timeline ---------- */
SCENES[2] = function (lt, q) {
  var z = q('zoom'),
    five = q('502s');
  // Fit all held, then a zoom into the outage (02:45–03:25).
  var st = remap(lt, [
    [z - 0.2, 2.5],
    [five + 0.5, 7],
  ]);
  var up = smooth(P(lt, 0, 0.55));
  var s = appPhone('whole', st, { dy: (1 - up) * 40 });
  s += fades();
  // The count, ticking in on "four", until the zoom.
  var cp = P(lt, q('four') - 0.1, 0.35) * (1 - P(lt, z, 0.3)),
    n = Math.round(2297 * smooth(P(lt, q('four') - 0.1, 0.7)));
  var label = n.toLocaleString('en-US') + ' log entries · 4 hosts';
  var cw = chipWidth('2,297 log entries · 4 hosts', { size: 7.5 });
  s += pop(chip(80 - cw / 2, 192, label, C.accent, { size: 7.5 }), cp, 80, 190);
  // The 502s from both web servers, and right before them the database's disk.
  var rp = P(lt, five + 0.3, 0.45),
    dp = P(lt, q('before') - 0.1, 0.45);
  s += callout(10, 192, 'db-1 · disk', C.amber, fx(215), fy(1253), dp);
  s += callout(146, 192, '502s · web-1 and web-2', C.red, fx(585), fy(1293), rp, {
    anchor: 'end',
  });
  s += G(
    txt(80, 206, 'A made-up incident', { size: 6.5, weight: 500, fill: C.soft, italic: true }),
    {
      o: up,
    },
  );
  return s;
};

/* ---------- Scene 3: pull out the database ---------- */
/* At the end of the separate shot (02:08–02:58, contents pinched to 0.8): 85 % at x 99 px,
   the PANIC x 915 px, db-1's axis y 1366 px. */
SCENES[3] = function (lt, q) {
  var pull = q('pull'),
    forty = q('40'),
    space = q('space');
  // The Separate by tags dialog with host:db-1 ticked, Separate, the contents pinched larger,
  // then a zoom onto the climb.
  var st = remap(lt, [
    [0, 1.2],
    [pull + 0.25, 1.75],
    [pull + 0.4, 1.95],
    [pull + 0.9, 2.4],
    [forty + 0.3, 6.5],
  ]);
  var s = appPhone('separate', st);
  s += fades();
  // The database's own track, lifted out.
  var lp = P(lt, pull + 0.45, 0.35) * (1 - P(lt, pull + 1.8, 0.5));
  s += pop(
    rect(fx(14), fy(925), fx(1066) - fx(14), fy(1612) - fy(925), 'none', {
      rx: 3,
      stroke: C.amber,
      sw: 1.2,
    }),
    lp,
    80,
    fy(1260),
  );
  // The bar: forty minutes of filling, 85 % to 99 %.
  var bp = P(lt, q('disk') - 0.1, 0.5);
  var fp = smooth(P(lt, forty - 0.15, 1.1));
  s += G(
    txt(80, 194, 'disk filling · ~40 min', { size: 8, weight: 700 }) +
      rect(32, 199, 96, 7, C.card, { rx: 3.5, stroke: C.line }) +
      (fp > 0
        ? rect(32, 199, 96 * fp, 7, mix(C.amber, C.red, smooth(P(lt, forty + 0.5, 0.6))), {
            rx: 3.5,
          })
        : '') +
      txt(12, 205.2, '85%', {
        size: 6.5,
        anchor: 'start',
        mono: true,
        fill: C.amber,
        weight: 700,
      }) +
      txt(148, 205.2, '99%', {
        size: 6.5,
        anchor: 'end',
        mono: true,
        fill: C.red,
        weight: 700,
        op: fp > 0.95 ? 1 : 0.35,
      }),
    { o: bp },
  );
  // No space left: the PANIC flashes red.
  var np = P(lt, space - 0.1, 0.35);
  if (np > 0) {
    var fl = clamp01((lt - space) / 0.9),
      px = fx(915),
      py = fy(1366);
    s +=
      '<circle cx="' +
      px +
      '" cy="' +
      py +
      '" r="' +
      (3 + 7 * fl) +
      '" fill="none" stroke="' +
      C.red +
      '" stroke-width="1.4" opacity="' +
      (1 - fl).toFixed(3) +
      '"/>' +
      '<circle cx="' +
      px +
      '" cy="' +
      py +
      '" r="3.6" fill="none" stroke="' +
      C.red +
      '" stroke-width="1.4" opacity="' +
      np.toFixed(3) +
      '"/>';
    s += callout(150, 92, 'No space left · PANIC', C.red, px, py - 3.6, np, {
      anchor: 'end',
    });
  }
  return s;
};

/* ---------- Scene 4: found it ---------- */
/* At the end of the cause shot (01:59–02:58, pinched to 0.42 so both tracks show): 02:05 is
   x 158 px on the axis of everything else (y 1516 px), where Disk filling starts; the PANIC
   x 933 px on db-1's axis (y 1087 px). */
var CAUSE = { x: 158, y: 1516 },
  PANIC = { x: 933, y: 1087 };
function causeArc(p) {
  var x0 = fx(CAUSE.x),
    y0 = fy(CAUSE.y) - 2,
    x1 = fx(PANIC.x),
    y1 = fy(PANIC.y) - 4;
  var d =
    'M' +
    x0 +
    ' ' +
    y0 +
    'C' +
    (x0 + 8) +
    ' ' +
    (y0 - 55) +
    ' ' +
    (x1 - 30) +
    ' ' +
    (y1 - 34) +
    ' ' +
    x1 +
    ' ' +
    y1;
  var s = drawPath(d, 200, p, 'stroke="' + C.amber + '" stroke-width="1.6" stroke-linecap="round"');
  if (p > 0.97)
    s +=
      '<path d="M' +
      (x1 - 3) +
      ' ' +
      (y1 - 3.8) +
      'L' +
      x1 +
      ' ' +
      y1 +
      'L' +
      (x1 + 3.2) +
      ' ' +
      (y1 - 3.2) +
      '" fill="none" stroke="' +
      C.amber +
      '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
  return s;
}
SCENES[4] = function (lt, q) {
  // The view eases left from the climb to 02:05.
  var st = remap(lt, [
    [0.2, 0.8],
    [q('climb') + 0.5, 3.5],
  ]);
  var s = appPhone('cause', st);
  s += fades();
  // The backup job's cron entry at 02:05.
  var bp = P(lt, q('backup') - 0.1, 0.45);
  var cx = fx(CAUSE.x),
    cy = fy(CAUSE.y);
  var card =
    '<path d="M' +
    cx +
    ' 181V' +
    cy +
    '" stroke="' +
    C.amber +
    '" stroke-width="0.9"/>' +
    '<circle cx="' +
    cx +
    '" cy="' +
    cy +
    '" r="1.8" fill="' +
    C.amber +
    '" stroke="' +
    C.ground +
    '" stroke-width="0.5"/>' +
    rect(10, 181, 140, 27, C.card, { rx: 4, stroke: C.amber, sw: 0.9 }) +
    txt(16, 191, '02:05 · backup-1 · cron', {
      size: 6.5,
      anchor: 'start',
      mono: true,
      fill: C.amber,
      weight: 700,
    }) +
    txt(16, 202, 'nightly-dump --target db-1', {
      size: 6.5,
      anchor: 'start',
      mono: true,
      weight: 700,
    });
  s += rise(card, bp, 4);
  // From cause to effect, on "own disk"; then the chip.
  s += causeArc(smooth(P(lt, q('own') - 0.25, 0.7)));
  var cp = P(lt, q('disk') + 0.15, 0.35);
  var rw = chipWidth('root cause', { size: 6.5 });
  s += pop(
    chip(146 - rw, 190, 'root cause', C.amber, { size: 6.5, solid: true }),
    cp,
    146 - rw / 2,
    189,
  );
  return s;
};

/* ---------- Scene 5: already there ---------- */
SCENES[5] = function (lt, q) {
  var away = smooth(P(lt, 0, 0.55));
  var s = '';
  if (away < 1)
    s += G(appPhone('cause', 7) + fades() + causeArc(1), {
      o: 1 - away,
      s: lerp(1, 0.8, away),
      cx: 80,
      cy: 130,
      ty: away * 20,
    });
  s += shortEnd(smooth(P(lt, 0.45, 0.6)), 'Point your syslog at it');
  return s;
};
