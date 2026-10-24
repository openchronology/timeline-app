// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 5, Tour: the United States, 1775–2008 (publicity/5-tour-the-united-states.md): the
   sample timeline in the real editor, captured (shots.json), in a browser window, with the
   Archive look's callouts around the window, never over the app's own text: the whole sweep,
   the Civil War up close, the rights thread separated, a moment read with its sources and
   links, and one zoom from the whole sweep to the night of the Apollo 11 landing. Scenes are
   pure functions of scene time lt; q("word") is when that word is said. */

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
/** A short arrow from (x0, y) to (x1, y), drawn to p, with its head at x1. */
function arrowTo(x0, x1, y, p, col) {
  col = col || C.accent;
  var x = lerp(x0, x1, p);
  if (p <= 0.01) return '';
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
/** A row of the left strip: a serif date over a name. */
function stripRow(y, date, name, p) {
  return rise(
    txt(10, y, date, { size: 5, serif: true, fill: C.accent, anchor: 'start', weight: 600 }) +
      txt(10, y + 6.6, name, { size: 5.4, anchor: 'start', weight: 600 }),
    p,
    4,
  );
}

/* Scene 1: the whole sweep, with what the sample holds. */
SCENES[1] = function (lt, q) {
  var s = tourWindow(lt, 'sweep', lt, true);
  var stats = [
    ['11', 'durations', q('bands')],
    ['48', 'moments', q('moment')],
    ['16', 'links', q('links')],
  ];
  stats.forEach(function (st, i) {
    var y = 36 + i * 24,
      a = P(lt, st[2], 0.5);
    s += pop(
      txt(10, y, st[0], { size: 13, serif: true, fill: C.accent, anchor: 'start', weight: 600 }) +
        txt(10, y + 7.5, st[1], { size: 5.6, fill: C.soft, anchor: 'start', weight: 600 }),
      a,
      18,
      y - 4,
    );
  });
  // A chapter heading, as the app draws it once you zoom in (from the war shot's last frame).
  var c = P(lt, q('chapter'), 0.6);
  var inset =
    card(8, 112, 62, 30, { fill: '#f3ead7' }) +
    '<svg x="10" y="118" width="58" height="11" viewBox="200 380 425 85" preserveAspectRatio="xMidYMid meet"><image href="' +
    shotFrame('war', 99) +
    '" width="1920" height="1080"/></svg>' +
    txt(39, 137, 'a chapter heading', { size: 4.6, fill: C.soft, weight: 500 });
  s += rise(inset, c, 5);
  return s;
};

/* Scene 2: the zoom into the 1860s, then into April 1865. */
SCENES[2] = function (lt, q) {
  var tZ = q('zoom') - 0.1,
    tA = q('surrender') + 0.2;
  var s = lt < tA ? tourWindow(lt, 'war', lt - tZ, false) : tourWindow(lt, 'april', lt - tA, false);
  var rows = [
    ['12 Apr 1861', 'Fort Sumter', q('fort')],
    ['1 Jan 1863', 'Emancipation', q('emancipation')],
    ['1–3 Jul 1863', 'Gettysburg', q('three')],
    ['19 Nov 1863', 'The Address', q('address')],
    ['9 Apr 1865', 'Appomattox', q('surrender')],
    ['14 Apr 1865', 'Assassination', q('assassination')],
  ];
  rows.forEach(function (r, i) {
    s += stripRow(24 + i * 21, r[0], r[1], P(lt, r[2], 0.5));
  });
  // Under the window: summaries open into moments as you zoom.
  var o = P(lt, q('opens'), 0.6);
  var split = P(lt, q('opens') + 0.4, 0.8);
  var cx = 128;
  var dots =
    G(summary(cx, 163, 3, { r: 3.4 }), { o: 1 - split }) +
    G(
      moment(cx - 5 * split, 163, { r: 1.8 }) +
        moment(cx, 163, { r: 1.8 }) +
        moment(cx + 5 * split, 163, { r: 1.8 }),
      { o: split },
    );
  s += rise(
    dots +
      txt(cx + 12, 165, 'Summaries open as you zoom', {
        size: 5.6,
        anchor: 'start',
        fill: C.text,
        serif: true,
      }),
    o,
    4,
  );
  return s;
};

/* Scene 3: Separate by tags, rights. */
SCENES[3] = function (lt, q) {
  var tS = q('separate');
  var s = tourWindow(lt, 'rights', lt - tS + 0.4, false);
  // The pointer goes to Separate by tags in the app's toolbar and chooses it.
  var bx = px(739),
    by = py(41);
  var m = smooth((lt - (tS - 1.4)) / 1.1);
  var ptr = pointer(lerp(200, bx, m), lerp(110, by, m), {
    o: Math.min(P(lt, tS - 1.6, 0.3), 1 - P(lt, tS + 1.2, 0.4)),
  });
  var press = clamp01((lt - (tS - 0.3)) / 0.5);
  if (press > 0 && press < 1)
    ptr +=
      '<circle cx="' +
      bx +
      '" cy="' +
      by +
      '" r="' +
      (1 + 5 * press) +
      '" fill="none" stroke="' +
      C.select +
      '" stroke-width="0.6" opacity="' +
      (1 - press) +
      '"/>';
  // The control and the tag, then the thread it pulls out.
  s += rise(chip(8, 30, 'Separate by tags', C.accent, { size: 5.2 }), P(lt, tS - 0.2, 0.5), 4);
  s += rise(
    chip(8, 44, 'rights', C.accent, { size: 5.2, solid: true }),
    P(lt, q('rights'), 0.5),
    4,
  );
  var thread = [
    ['1776', 'Declaration', q('declaration')],
    ['1865–70', 'Amendments', q('amendments')],
    ['1954', 'Brown v. Board', q('brown')],
    ['1964', 'Civil Rights Act', q('rights', 2)],
  ];
  var y0 = 66,
    pitch = 22;
  thread.forEach(function (r, i) {
    var a = P(lt, r[2], 0.5);
    s += stripRow(y0 + i * pitch, r[0], r[1], a);
    if (i)
      s += drawPath(
        'M7 ' + (y0 + (i - 1) * pitch + 9) + 'V' + (y0 + i * pitch - 5),
        pitch - 14,
        a,
        'stroke="' + C.arc + '" stroke-width="0.7"',
      );
  });
  return s + ptr;
};

/* Scene 4: View mode, Brown v. Board in the reader, then the Civil Rights Act. */
SCENES[4] = function (lt, q) {
  var tO = q('open'),
    tF = q('follow'),
    tClick = tF + 0.9;
  // Shot time: Brown opens at 0.5 s and the related entry is chosen at 4 s; the shot waits
  // between them until the narration follows the link.
  var st0 = Math.min(3.8, 0.5 + Math.max(-0.5, lt - tO));
  var s = tourWindow(lt, 'reader', st0, false);
  var x = P(lt, tClick, 0.45);
  if (x > 0) s += G(appWindow(WX, WY, WW, 'reader', 4.1 + Math.max(0, lt - tClick)), { o: x });
  // View mode is on.
  var vm = P(lt, 0.3, 0.5);
  s += rise(
    rect(8, 28, 12, 6.4, C.accent, { rx: 3.2 }) +
      '<circle cx="16.8" cy="31.2" r="2.4" fill="' +
      C.card +
      '"/>' +
      txt(24, 33.2, 'View mode', { size: 5.6, anchor: 'start', weight: 600 }),
    vm,
    4,
  );
  // What the reader holds: callouts to the reader's left edge, at its sections.
  var edge = px(285) - 1;
  var parts = [
    ['what was decided', py(506), q('decided')],
    ['where it comes from', py(568), q('comes')],
    ["what it's linked to", py(692), q('link')],
  ];
  var gone = 1 - P(lt, tClick, 0.4);
  parts.forEach(function (pt) {
    var a = P(lt, pt[2], 0.6);
    s += G(
      txt(10, pt[1] + 1.8, pt[0], { size: 5, anchor: 'start', weight: 600, serif: true }) +
        arrowTo(56, edge, pt[1], a),
      { o: a * gone },
    );
  });
  // The pointer chooses the Civil Rights Act under "Related to".
  var rx = px(500),
    ry = py(680);
  var m = smooth((lt - (tF - 0.2)) / 1.0);
  var ptr = pointer(lerp(px(1300), rx, m), lerp(py(950), ry, m), {
    o: Math.min(P(lt, tF - 0.3, 0.3), 1 - P(lt, tClick + 0.8, 0.4)),
  });
  var press = clamp01((lt - tClick) / 0.5);
  if (press > 0 && press < 1)
    ptr +=
      '<circle cx="' +
      rx +
      '" cy="' +
      ry +
      '" r="' +
      (1 + 5 * press) +
      '" fill="none" stroke="' +
      C.select +
      '" stroke-width="0.6" opacity="' +
      (1 - press) +
      '"/>';
  // Ten years later.
  var ten = P(lt, q('10'), 0.6);
  s += rise(
    txt(10, 120, '1954', { size: 9, serif: true, fill: C.soft, anchor: 'start', weight: 600 }) +
      arrowTo(32, 40, 117, ten, C.soft) +
      txt(42, 120, '1964', { size: 9, serif: true, fill: C.accent, anchor: 'start', weight: 600 }) +
      txt(10, 128, 'ten years later', { size: 4.8, fill: C.soft, anchor: 'start', weight: 500 }),
    ten,
    4,
  );
  return s + ptr;
};

/* Scene 5: one zoom from the whole sweep to the night of July 20–21, 1969. */
var MOON_S0 = 1300000000 + 6250000000,
  MOON_S1 = 30600,
  MOON_ZOOM = 9.5;
/** The span on screen at the moon shot's time st, as capture.mjs moves it. */
function moonSpan(st) {
  var p = smooth(st / MOON_ZOOM);
  return lerpLog(MOON_S0, MOON_S1, p);
}
SCENES[5] = function (lt, q) {
  // The capture's 9.5 s zoom, played in 8 s from "same line", so it arrives as the landing is named.
  var tZ = q('same') - 0.1,
    rate = MOON_ZOOM / 8;
  var st = (lt - tZ) * rate;
  var s = tourWindow(lt, 'moon', st, false);
  // The ruler's unit, from centuries down to hours, lit as the zoom passes through it.
  var span = moonSpan(Math.max(0, st));
  var years = span / 31557600,
    unit = years >= 60 ? 0 : years >= 1.5 ? 1 : span >= 2 * 86400 ? 2 : 3;
  var units = ['centuries', 'years', 'days', 'hours'];
  var show = P(lt, tZ, 0.5);
  var lad = txt(10, 32, 'the ruler', { size: 4.6, fill: C.soft, anchor: 'start', weight: 500 });
  units.forEach(function (u, i) {
    var on = i === unit && st > -0.2;
    var y = 44 + i * 12;
    lad +=
      '<circle cx="12" cy="' +
      (y - 1.8) +
      '" r="' +
      (on ? 2 : 1.3) +
      '" fill="' +
      (on ? C.accent : C.line) +
      '"/>' +
      txt(17, y, u, {
        size: on ? 6.4 : 5.4,
        serif: true,
        anchor: 'start',
        fill: on ? C.text : C.soft,
        weight: on ? 700 : 500,
      });
    if (i)
      lad +=
        '<path d="M12 ' +
        (y - 12 + 1) +
        'V' +
        (y - 4) +
        '" stroke="' +
        C.line +
        '" stroke-width="0.6"/>';
  });
  s += G(lad, { o: show });
  // The depth of the zoom, once it arrives.
  var d = P(lt, tZ + 8 - 0.6, 0.7);
  s += rise(
    card(8, 98, 62, 30, {}) +
      txt(39, 109, '233 years', { size: 6.6, serif: true, fill: C.soft, weight: 600 }) +
      txt(39, 115.5, '↓', { size: 5, fill: C.soft }) +
      txt(39, 123.5, '8½ hours', { size: 7.4, serif: true, fill: C.accent, weight: 700 }),
    d,
    4,
  );
  // The two times, under the window, at the moments' own places.
  var lx = px(264),
    sx = px(1652),
    by = WY + WH;
  var l = P(lt, q('17'), 0.6),
    f = P(lt, q('step'), 0.6),
    gap = P(lt, q('six'), 0.8);
  s += G(
    '<path d="M' +
      lx +
      ' ' +
      (by + 1) +
      'V' +
      (by + 4) +
      '" stroke="' +
      C.accent +
      '" stroke-width="0.7"/>' +
      txt(lx, by + 10.5, '20:17:40 UTC', { size: 5.4, mono: true, fill: C.accent, weight: 600 }),
    { o: l, ty: (1 - l) * 3 },
  );
  s += G(
    '<path d="M' +
      sx +
      ' ' +
      (by + 1) +
      'V' +
      (by + 4) +
      '" stroke="' +
      C.accent +
      '" stroke-width="0.7"/>' +
      txt(sx, by + 10.5, '02:56:15 UTC', { size: 5.4, mono: true, fill: C.accent, weight: 600 }),
    { o: f, ty: (1 - f) * 3 },
  );
  var g0 = lx + 22,
    g1 = sx - 22;
  s += G(
    drawPath(
      'M' + g0 + ' ' + (by + 8.6) + 'H' + g1,
      g1 - g0,
      gap,
      'stroke="' + C.soft + '" stroke-width="0.6" stroke-dasharray="1.6 1.4"',
    ) +
      rect((g0 + g1) / 2 - 17, by + 4.6, 34, 8, C.ground) +
      txt((g0 + g1) / 2, by + 10.5, '6 h 38 min later', { size: 5, fill: C.text, serif: true }),
    { o: gap },
  );
  return s;
};

/* Scene 6: the window steps aside for what a class can do; the end card. */
function linkIcon(x, y) {
  var st = 'fill="none" stroke="' + C.accent + '" stroke-width="1.1"';
  return (
    '<rect x="' +
    (x - 6) +
    '" y="' +
    (y - 2.4) +
    '" width="7" height="4.8" rx="2.4" ' +
    st +
    '/>' +
    '<rect x="' +
    (x - 1) +
    '" y="' +
    (y - 2.4) +
    '" width="7" height="4.8" rx="2.4" ' +
    st +
    '/>'
  );
}
SCENES[6] = function (lt, q) {
  var k = smooth((lt - 0.2) / 1.1);
  var w = lerp(WW, 150, k),
    x = lerp(WX, 8, k),
    y = lerp(WY, 46, k);
  var s = appWindow(x, y, w, 'sweep', 0);
  var lines = [
    [
      'Read it',
      'no account needed',
      q('read'),
      function (cx, cy) {
        return ICON.browser(cx - 7, cy - 5, 14, 10);
      },
    ],
    [
      'Build one',
      'as a class, or one each',
      q('build'),
      function (cx, cy) {
        return G(ICON.person(cx - 4, cy + 1, C.soft) + ICON.person(cx + 4, cy + 1, C.accent), {
          s: 0.55,
          cx: cx,
          cy: cy,
        });
      },
    ],
    [
      'Share it',
      'a link, or embedded in your class page',
      q('share'),
      function (cx, cy) {
        return linkIcon(cx, cy);
      },
    ],
  ];
  lines.forEach(function (l, i) {
    var a = P(lt, l[2], 0.5),
      ly = 62 + i * 28;
    s += rise(
      l[3](180, ly - 2) +
        txt(192, ly, l[0], { size: 8, serif: true, anchor: 'start', weight: 700 }) +
        txt(192, ly + 8, l[1], { size: 5.6, anchor: 'start', fill: C.soft, weight: 500 }),
      a,
      5,
    );
  });
  // The end card.
  var e = P(lt, q.end + 0.6, 0.8);
  s += G(
    rect(-20, -24, 360, 210, C.ground) +
      wordmark(160, 72, 16) +
      txt(160, 98, 'Next: Working together', { size: 8, serif: true }),
    { o: e, ty: (1 - e) * 6 },
  );
  return s;
};
