// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 10: "Why did it happen?". An events and causal factors chart assembling on the made-up
   case (samples/investigation.mjs): the collision on an axis, the events dropping onto it, the
   conditions sliding in beneath, links that light up the causal factors and the root cause,
   then the real app on a phone after Separate all connected, and the end card. Frames are pure
   functions of the scene's time. */

/* ---------- the chart, shared by Scenes 1–4 ---------- */
var AY = 142, // the axis
  DX = 140; // the collision
var EVENTS = [
  [32, '02:31:48', 'enters aisle', 38],
  [72, '02:33:20', 'picker crosses', 26],
  [112, '02:33:58', 'FL-3 reverses', 38],
];
var BANDS = [
  ['10-hour night shift', C.amber, false],
  ['light out since Tuesday', C.red, true],
  ['no spotter on shift', C.red, true],
];
function bandY(i) {
  return AY + 14 + i * 13;
}
function diamondAt(x, y, r, fill) {
  return (
    '<path d="M' +
    x +
    ' ' +
    (y - r) +
    'L' +
    (x + r) +
    ' ' +
    y +
    'L' +
    x +
    ' ' +
    (y + r) +
    'L' +
    (x - r) +
    ' ' +
    y +
    'Z" fill="' +
    fill +
    '" stroke="' +
    C.ground +
    '" stroke-width="0.9"/>'
  );
}
/** The chart: o.events (0–1 for each), o.bands (0–1 each), o.links (0–1), o.light (0–1),
    o.root (0–1), o.cursor (0–1), o.pulse (0–1). */
function chart(o) {
  var s = '';
  var light = o.light || 0;
  // Links first, under everything: arcs from the events, curves up from the bands.
  if (o.links > 0) {
    EVENTS.forEach(function (e, i) {
      var red = i === 2 ? light : 0;
      s += G(
        arc(e[0] + 5, DX - 5, AY - 3, o.links, {
          h: 6 + (DX - e[0]) * 0.12,
          color: mix(C.arc, C.red, red),
          w: 0.9 + 0.6 * red,
        }),
        { o: lerp(1, i === 2 ? 1 : 0.35, light) },
      );
    });
    BANDS.forEach(function (b, i) {
      var y = bandY(i) + 4.5,
        red = b[2] ? light : 0;
      var d =
        'M' + (DX - 30 - i * 14) + ' ' + y + 'Q' + (DX - 2) + ' ' + y + ' ' + DX + ' ' + (AY + 7);
      s += G(
        drawPath(
          d,
          50,
          o.links,
          'stroke="' + mix(C.arc, C.red, red) + '" stroke-width="' + (0.9 + 0.6 * red) + '"',
        ),
        { o: lerp(1, b[2] ? 1 : 0.35, light) },
      );
    });
  }
  // The axis.
  s += '<path d="M8 ' + AY + 'H172" stroke="' + C.arc + '" stroke-width="1"/>';
  // The conditions beneath it.
  BANDS.forEach(function (b, i) {
    var p = (o.bands && o.bands[i]) || 0;
    if (p <= 0) return;
    var x1 = lerp(-150, 172, smooth(p));
    var dim = b[2] ? 1 : lerp(1, 0.45, light);
    s += G(
      rect(Math.max(8, x1 - 164), bandY(i), Math.min(164, x1 - 8), 9, b[1], { rx: 2, op: 0.9 }) +
        txt(Math.max(8, x1 - 164) + 4, bandY(i) + 6.6, b[0], {
          size: 6.2,
          anchor: 'start',
          weight: 700,
          fill: C.ground,
        }),
      { o: dim },
    );
  });
  // The events, as the app's process rectangles, with stems up to their labels.
  EVENTS.forEach(function (e, i) {
    var p = (o.events && o.events[i]) || 0;
    if (p <= 0) return;
    var drop = 1 - ease(p),
      bounce = p > 0.7 && p < 1 ? Math.sin(((p - 0.7) / 0.3) * Math.PI) * 1.2 : 0;
    var y = AY - drop * 40 - bounce;
    var dim = i === 2 ? 1 : lerp(1, 0.45, light);
    var col = i === 2 ? mix(C.moment, C.red, light) : C.moment;
    s += G(
      '<path d="M' +
        e[0] +
        ' ' +
        (y - 4) +
        'V' +
        (y - e[3]) +
        '" stroke="' +
        C.line +
        '" stroke-width="0.6"/>' +
        txt(e[0], y - e[3] - 8.5, e[1], { size: 5.6, mono: true, fill: C.soft, weight: 500 }) +
        txt(e[0], y - e[3] - 1.5, e[2], { size: 6.8, weight: 700 }) +
        rect(e[0] - 5, y - 3.5, 10, 7, col, { rx: 0.6 }),
      { o: Math.min(1, p * 3) * dim },
    );
  });
  // The collision.
  var pu = o.pulse || 0;
  if (pu > 0 && pu < 1)
    s +=
      '<circle cx="' +
      DX +
      '" cy="' +
      AY +
      '" r="' +
      (7 + 10 * pu) +
      '" fill="none" stroke="' +
      C.red +
      '" stroke-width="1.2" opacity="' +
      (1 - pu).toFixed(2) +
      '"/>';
  s += diamondAt(DX, AY, 7, C.red);
  s += rect(DX - 18, AY - 19.5, 36, 10, C.ground, { rx: 2 });
  s += txt(DX, AY - 12, '02:34:09', { size: 7, mono: true, fill: C.red, weight: 600 });
  if (!o.bands || !o.bands[0])
    s += txt(DX, AY + 17, 'collision · aisle 14', { size: 6.8, weight: 700 });
  // The cursor through every condition at the collision.
  if (o.cursor > 0) s += G(cursorLine(DX, AY + 7, bandY(2) + 12), { o: o.cursor * (1 - light) });
  // The root cause, days before, at the left.
  if (o.root > 0) {
    var r = o.root;
    s += rise(
      rect(10, 72, 56, 12, C.card, { rx: 6, stroke: C.red, sw: 1 }) +
        txt(38, 80.2, 'no risk review', { size: 6.2, weight: 700 }) +
        chip(70, 80, 'root cause', C.red, { size: 6, solid: true }) +
        drawPath(
          'M12 80Q6 ' + (bandY(0) + 4) + ' 12 ' + (bandY(0) + 4),
          110,
          r,
          'stroke="' + C.red + '" stroke-width="1.2"',
        ),
      r,
      4,
    );
  }
  return s;
}
function causalChips(p) {
  var w = chipWidth('causal factor', { size: 6 });
  return pop(
    chip(170 - w - 2, bandY(2) + 22, 'causal factor', C.red, { size: 6 }) +
      chip(10, bandY(2) + 22, 'causal factor', C.red, { size: 6 }),
    p,
    90,
    bandY(2) + 20,
  );
}

/* ---------- Scene 1: why? ---------- */
SCENES[1] = function (lt, q) {
  return chart({ pulse: clamp01((lt - q('why')) / 0.9) });
};

/* ---------- Scene 2: events ---------- */
SCENES[2] = function (lt, q) {
  var t = [q('aisle'), q('picker'), q('reverse')];
  var s = chart({
    events: t.map(function (x) {
      return clamp01((lt - x + 0.25) / 0.55);
    }),
  });
  s += G(txt(90, 214, 'A made-up case', { size: 6.5, weight: 500, fill: C.soft, italic: true }), {
    o: P(lt, 0.2, 0.5),
  });
  return s;
};

/* ---------- Scene 3: conditions ---------- */
SCENES[3] = function (lt, q) {
  var t = [q('ten'), q('light'), q('spotter')];
  return chart({
    events: [1, 1, 1],
    bands: t.map(function (x) {
      return clamp01((lt - x + 0.3) / 0.8);
    }),
    cursor: P(lt, q('all') - 0.1, 0.4),
  });
};

/* ---------- Scene 4: causes ---------- */
SCENES[4] = function (lt, q) {
  var light = P(lt, q('mark') - 0.1, 0.6);
  var s = chart({
    events: [1, 1, 1],
    bands: [1, 1, 1],
    links: smooth(P(lt, q('link') - 0.1, 1.1)),
    light: light,
    root: P(lt, q('root') - 0.1, 0.6),
  });
  return s + causalChips(P(lt, q('causal') + 0.1, 0.4));
};

/* ---------- Scene 5: on a phone ---------- */
/* Shot frames are 1080 × 1800 px (360 × 600 CSS px at scale 3). */
var PX = 15,
  PY = 8,
  PW = 130,
  K = PW / 1080;
function appPhone(st, o) {
  o = o || {};
  return phoneShot(PX, PY + (o.dy || 0), PW, 'chain', st);
}
function fades() {
  return (
    '<defs><linearGradient id="s10foot" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="' +
    C.ground +
    '" stop-opacity="0"/><stop offset="0.25" stop-color="' +
    C.ground +
    '" stop-opacity="1"/></linearGradient>' +
    '<linearGradient id="s10top" x1="0" y1="0" x2="0" y2="1"><stop offset="0.82" stop-color="' +
    C.ground +
    '" stop-opacity="1"/><stop offset="1" stop-color="' +
    C.ground +
    '" stop-opacity="0"/></linearGradient></defs>' +
    '<rect x="0" y="0" width="180" height="80" fill="url(#s10top)"/>' +
    '<rect x="0" y="196" width="180" height="124" fill="url(#s10foot)"/>'
  );
}
SCENES[5] = function (lt, q) {
  var up = smooth(P(lt, 0, 0.55));
  var s = appPhone(lt + 0.5, { dy: (1 - up) * 40 }) + fades();
  var cw = chipWidth('the real app', { size: 7 });
  s += pop(
    chip(90 - cw / 2, 206, 'the real app', C.accent, { size: 7 }),
    P(lt, q('chain') - 0.1, 0.4),
    90,
    204,
  );
  return s;
};

/* ---------- Scene 6: the method ---------- */
SCENES[6] = function (lt, q) {
  var away = smooth(P(lt, 0, 0.55));
  var s = '';
  if (away < 1)
    s += G(appPhone(8) + fades(), {
      o: 1 - away,
      s: lerp(1, 0.8, away),
      cx: 80,
      cy: 150,
      ty: away * 20,
    });
  s += shortEnd(smooth(P(lt, 0.45, 0.6)), 'Events and causal factors');
  return s;
};
