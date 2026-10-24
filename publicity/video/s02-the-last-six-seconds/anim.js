// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 2, You're the last six seconds (publicity/shorts/2-the-last-six-seconds.md): Earth's
   4.54 billion years squeezed into one day on a drawn 24-hour dial, its hand sweeping past
   life (5:36), oxygen (11:19), animals (21:09) and the asteroid (23:39); the last minute
   magnified into a seconds track, where our species is the last 5.7 s and writing the last
   0.1 s; then the real app on a phone, the deep-time sample zooming from Fit all to the last
   300,000 years. Scenes are pure functions of scene time lt; q("word") is when it's said.
   The clock times are the script's Appendix B, to the minute. */

/* ---------- the day ---------- */
var DIAL = { cx: 80, cy: 136, R: 48 };
/** The day's events: hours after midnight (Appendix B) and where each label sits. */
var EVENTS = [
  { name: 'Life', time: '5:36', h: 5 + 36 / 60, lx: 109, ly: 133 },
  { name: 'Oxygen', time: '11:19', h: 11 + 19 / 60, lx: 88, ly: 166 },
  { name: 'Animals', time: '21:09', h: 21 + 9 / 60, lx: 58, ly: 115 },
  { name: 'Asteroid', time: '23:39', h: 23 + 39 / 60, lx: 99, ly: 104 },
];
function onDial(r, h) {
  var a = (h / 24) * 2 * Math.PI;
  return [DIAL.cx + r * Math.sin(a), DIAL.cy - r * Math.cos(a)];
}
function f2(n) {
  return n.toFixed(2);
}
function pad(n) {
  return (n < 10 ? '0' : '') + n;
}
/** The clock reading for h hours, as HH:MM. */
function hhmm(h) {
  var m = Math.min(24 * 60 - 1, Math.floor(h * 60 + 1e-6));
  return pad(Math.floor(m / 60)) + ':' + pad(m % 60);
}
/** A filled wedge of the dial from midnight to h hours. */
function wedge(r, h, fill, op) {
  if (h <= 0.001) return '';
  var p = onDial(r, Math.min(h, 23.999));
  return (
    '<path d="M' +
    DIAL.cx +
    ' ' +
    DIAL.cy +
    'L' +
    DIAL.cx +
    ' ' +
    (DIAL.cy - r) +
    'A' +
    r +
    ' ' +
    r +
    ' 0 ' +
    (h > 12 ? 1 : 0) +
    ' 1 ' +
    f2(p[0]) +
    ' ' +
    f2(p[1]) +
    'Z" fill="' +
    fill +
    '" opacity="' +
    op +
    '"/>'
  );
}
/** The 24-hour dial with its hand at h hours; lit[i] (0–1) pops event i in; o.labels fades the
    words (the hours, the event labels) as the dial shrinks away in Scene 3. */
function dial(h, lit, o) {
  o = o || {};
  var lo = o.labels === undefined ? 1 : o.labels;
  var cx = DIAL.cx,
    cy = DIAL.cy,
    R = DIAL.R;
  var s =
    '<circle cx="' +
    cx +
    '" cy="' +
    cy +
    '" r="' +
    (R + 2.5) +
    '" fill="' +
    C.faint +
    '"/>' +
    '<circle cx="' +
    cx +
    '" cy="' +
    cy +
    '" r="' +
    R +
    '" fill="' +
    C.card +
    '" stroke="' +
    C.line +
    '" stroke-width="0.8"/>';
  s += wedge(R, h, C.accent, 0.13);
  // The hours: a tick each, a numeral every three (midnight is the label "Earth forms").
  for (var i = 0; i < 24; i++) {
    var major = i % 3 === 0;
    var a = onDial(R - (major ? 4.5 : 2.6), i),
      b = onDial(R - 0.6, i);
    s +=
      '<line x1="' +
      f2(a[0]) +
      '" y1="' +
      f2(a[1]) +
      '" x2="' +
      f2(b[0]) +
      '" y2="' +
      f2(b[1]) +
      '" stroke="' +
      (major ? C.soft : C.line) +
      '" stroke-width="' +
      (major ? 0.9 : 0.6) +
      '"/>';
    if (major && i > 0) {
      var n = onDial(R + 6.2, i);
      s += txt(f2(n[0]), f2(n[1] + 2), String(i), {
        size: 5.5,
        fill: C.soft,
        weight: 600,
        op: lo,
      });
    }
  }
  // Midnight: where Earth forms.
  s += rect(cx - 0.7, cy - R - 3, 1.4, 6, C.text, { rx: 0.7 });
  s += G(txt(cx, cy - R - 6, 'Earth forms', { size: 7.5, weight: 700 }), { o: lo });
  // The events: a bright tick on the rim and, inside, the name and its clock time (drawn over
  // the hand, outlined in the face's colour).
  var ticks = '',
    labels = '';
  EVENTS.forEach(function (e, k) {
    var p = lit[k] || 0;
    if (p <= 0) return;
    var t0 = onDial(R - 7, e.h),
      t1 = onDial(R + 2.2, e.h);
    var tick =
      '<line x1="' +
      f2(t0[0]) +
      '" y1="' +
      f2(t0[1]) +
      '" x2="' +
      f2(t1[0]) +
      '" y2="' +
      f2(t1[1]) +
      '" stroke="' +
      C.select +
      '" stroke-width="1.6" stroke-linecap="round"/>' +
      '<circle cx="' +
      f2(t1[0]) +
      '" cy="' +
      f2(t1[1]) +
      '" r="1.6" fill="' +
      C.select +
      '"/>';
    var lx = e.lx,
      ly = e.ly;
    var label = halo(
      txt(lx, ly, e.name, { size: 8, weight: 700 }) +
        txt(lx, ly + 8, e.time, { size: 7, mono: true, fill: C.select, weight: 600 }),
    );
    ticks += pop(tick, p, t1[0], t1[1]);
    labels += G(pop(label, p, lx, ly), { o: lo });
  });
  // The hand, and its hub.
  var tip = onDial(R - 3, h),
    tail = onDial(-6, h);
  s +=
    '<line x1="' +
    f2(tail[0]) +
    '" y1="' +
    f2(tail[1]) +
    '" x2="' +
    f2(tip[0]) +
    '" y2="' +
    f2(tip[1]) +
    '" stroke="' +
    C.ground +
    '" stroke-width="3.2" stroke-linecap="round" opacity="0.6"/>' +
    '<line x1="' +
    f2(tail[0]) +
    '" y1="' +
    f2(tail[1]) +
    '" x2="' +
    f2(tip[0]) +
    '" y2="' +
    f2(tip[1]) +
    '" stroke="' +
    C.strong +
    '" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="' +
    cx +
    '" cy="' +
    cy +
    '" r="2.6" fill="' +
    C.strong +
    '"/><circle cx="' +
    cx +
    '" cy="' +
    cy +
    '" r="1.1" fill="' +
    C.ground +
    '"/>';
  return s + ticks + labels;
}
/** Outlines text in the dial face's colour, so it reads where the hand crosses it. */
function halo(svg) {
  return svg.replace(
    /<text /g,
    '<text stroke="' +
      C.card +
      '" stroke-width="2.2" stroke-linejoin="round" paint-order="stroke" ',
  );
}
/** The digital clock under the dial. */
function readout(h) {
  return (
    rect(DIAL.cx - 24, DIAL.cy + DIAL.R + 10, 48, 15, C.card, { rx: 3, stroke: C.line }) +
    txt(DIAL.cx, DIAL.cy + DIAL.R + 21.6, hhmm(h), { size: 12, mono: true, weight: 700 })
  );
}

/* The hand: one sweep across Scenes 1 and 2, through each event's time as it's said ("half past
   five", "noon", "nine", "the asteroid"), slowing a little at each (half eased, half steady, so it never quite stops). */
function sweep(keys, lt) {
  if (lt <= keys[0][0]) return keys[0][1];
  for (var i = 1; i < keys.length; i++)
    if (lt <= keys[i][0]) {
      var a = keys[i - 1],
        b = keys[i];
      var p = (lt - a[0]) / (b[0] - a[0]);
      return lerp(a[1], b[1], lerp(p, smooth(p), b[2] === undefined ? 0.6 : b[2]));
    }
  return keys[keys.length - 1][1];
}
/** Where the hand is at the end of Scene 1 (Scene 2 starts from it). */
var H1 = 2.2;
function hand2(q) {
  return [
    [0, H1, 0],
    [q('half'), EVENTS[0].h],
    [q('noon'), EVENTS[1].h],
    [q('nine'), EVENTS[2].h],
    [q('asteroid'), EVENTS[3].h],
    [q.dur - 0.1, 23 + 59 / 60, 1],
  ];
}

SCENES[1] = function (lt, q) {
  // Whole at frame 0: the dial at midnight. The hand starts on "single day".
  var t0 = q('single'),
    d = q.dur;
  var p = clamp01((lt - t0) / (d - t0));
  var h = H1 * p * p;
  return { svg: '', keep: dial(h, []) + readout(h), keepOut: true };
};

SCENES[2] = function (lt, q) {
  var keys = hand2(q);
  var h = sweep(keys, lt);
  var lit = EVENTS.map(function (e, k) {
    return P(lt, keys[k + 1][0] - 0.12, 0.35);
  });
  return { svg: '', keep: dial(h, lit) + readout(h), keepIn: true, keepOut: true };
};

/* ---------- the last minute ---------- */
var TRACK = { x0: 14, x1: 146, y: 99, h: 18 };
function secX(s) {
  // s: seconds before midnight
  return TRACK.x1 - (s / 60) * (TRACK.x1 - TRACK.x0);
}

SCENES[3] = function (lt, q) {
  // The dial shrinks down out of the way; its last minute opens into a seconds track above.
  var pd = smooth(clamp01(lt / 0.6));
  var h = lerp(23 + 59 / 60, 24, smooth(clamp01((lt - 0.6) / (q.dur - 0.8))));
  var lit = [1, 1, 1, 1];
  var sDial = lerp(1, 0.6, pd),
    dy = lerp(0, 46, pd);
  var dialSvg = G(dial(h, lit, { labels: 1 - pd }), {
    ty: dy,
    s: sDial,
    cx: DIAL.cx,
    cy: DIAL.cy,
  });
  var read = G(readout(h), { o: 1 - clamp01(lt / 0.35) });
  // Where midnight's rim is once the dial has moved.
  var ax = DIAL.cx,
    ay = DIAL.cy + dy - DIAL.R * sDial;
  var pm = P(lt, 0.45, 0.7);
  var T = TRACK,
    yb = T.y + T.h;
  var mag = '';
  if (pm > 0) {
    var lx = lerp(ax, T.x0, pm),
      rx = lerp(ax, T.x1, pm),
      by = lerp(ay, yb, pm);
    mag +=
      '<path d="M' +
      f2(ax - 0.8) +
      ' ' +
      f2(ay) +
      'L' +
      f2(lx) +
      ' ' +
      f2(by) +
      'L' +
      f2(rx) +
      ' ' +
      f2(by) +
      'L' +
      f2(ax + 0.8) +
      ' ' +
      f2(ay) +
      'Z" fill="' +
      C.accent +
      '" opacity="' +
      (0.12 * pm).toFixed(3) +
      '"/>' +
      '<path d="M' +
      f2(ax) +
      ' ' +
      f2(ay) +
      'L' +
      f2(lx) +
      ' ' +
      f2(by) +
      'M' +
      f2(ax) +
      ' ' +
      f2(ay) +
      'L' +
      f2(rx) +
      ' ' +
      f2(by) +
      '" stroke="' +
      C.accent +
      '" stroke-width="0.6" opacity="' +
      (0.7 * pm).toFixed(3) +
      '" fill="none"/>' +
      '<circle cx="' +
      ax +
      '" cy="' +
      f2(ay) +
      '" r="1.6" fill="' +
      C.accent +
      '" opacity="' +
      pm.toFixed(3) +
      '"/>';
  }
  // The track: 23:59:00 to midnight, a tick every ten seconds.
  var track = rect(T.x0, T.y, T.x1 - T.x0, T.h, C.card, { rx: 2, stroke: C.accent, sw: 0.7 });
  for (var s = 10; s < 60; s += 10) {
    var x = secX(s);
    track += rect(f2(x - 0.3), yb - 4, 0.6, 4, C.soft);
  }
  track += txt(T.x0, T.y - 5, '23:59:00', {
    size: 6.5,
    mono: true,
    fill: C.soft,
    anchor: 'start',
  });
  // Homo sapiens: the last 5.7 s (Appendix B), filling on "six".
  var t6 = q('six');
  var ps = P(lt, t6 - 0.1, 0.6);
  var xs = secX(5.7);
  var sliver = '';
  if (ps > 0) {
    var w = (T.x1 - xs) * ps;
    sliver +=
      rect(f2(xs - 1), T.y - 1, f2(w + 2), T.h + 2, C.select, { rx: 1.5, op: 0.25 * ps }) +
      rect(f2(xs), T.y, f2(w), T.h, C.select, { rx: 1 });
  }
  var pl = P(lt, t6 + 0.15, 0.45);
  var homo = rise(
    txt(xs - 3.5, T.y + 12.4, 'Homo sapiens · last 6 s', {
      size: 8.5,
      weight: 700,
      fill: C.select,
      anchor: 'end',
    }),
    pl,
    3,
  );
  // Writing: the last 0.1 s, a hairline at midnight's edge, drawn on "tenth".
  var tt = q('tenth');
  var ph = P(lt, tt - 0.1, 0.45);
  var xw = secX(0.1);
  var hair = '';
  if (ph > 0)
    hair +=
      drawPath(
        'M' + f2(xw) + ' ' + (T.y - 12) + 'L' + f2(xw) + ' ' + (yb + 2),
        T.h + 14,
        ph,
        'stroke="' + C.strong + '" stroke-width="0.7"',
      ) +
      rise(
        txt(T.x1, T.y - 14.5, 'Writing · last 0.1 s', {
          size: 8,
          weight: 700,
          fill: C.strong,
          anchor: 'end',
        }),
        P(lt, tt + 0.05, 0.45),
        3,
      );
  var big = G(
    mag + G(track + sliver + homo + hair, { o: pm, s: lerp(0.3, 1, pm), cx: ax, cy: yb }),
  );
  return { svg: big, keep: dialSvg + read, keepIn: true };
};

/* ---------- the real thing ---------- */
var PHONE = { x: 10, y: 80, w: 140 };

SCENES[4] = function (lt, q) {
  // The phone slides up; the shot (shots.json: zoom) runs from Fit all to the last 600 million
  // years, then to the last 300,000, toward the right edge.
  var ps = smooth(clamp01(lt / 0.6));
  var y = lerp(330, PHONE.y, ps);
  return { svg: '', keep: phoneShot(PHONE.x, y, PHONE.w, 'zoom', lt), keepIn: true, keepOut: true };
};

SCENES[5] = function (lt, q) {
  // The phone eases away, holding the zoom's last frame, gone before the end card rises.
  var pa = smooth(clamp01(lt / 0.45));
  var phone = G(phoneShot(PHONE.x, lerp(PHONE.y, 300, pa), PHONE.w, 'zoom', 99), {
    o: 1 - pa,
  });
  return { svg: shortEnd(P(lt, 0.5, 0.7), 'From eons to seconds'), keep: phone, keepIn: true };
};
