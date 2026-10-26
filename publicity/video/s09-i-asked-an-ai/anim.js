// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 9: "I asked an AI to build a timeline". The one prompt, the API key (och_key_…) and the
   two requests (GET …/document?download=1, POST /api/timelines), then the real Star Wars
   timeline (samples/star-wars.ochx, the live one at timescale.info/athan/star-wars) on a phone:
   98 moments, and one zoom from 36,453 BBY to the films. It ends on how the app itself is
   built, the API docs and the end card. Frames are pure functions of the scene's time. */

/* ---------- helpers ---------- */
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
function mono(x, y, s, o) {
  o = o || {};
  return txt(x, y, s, {
    size: o.size || 5.6,
    mono: true,
    anchor: o.anchor || 'start',
    fill: o.fill || C.text,
    weight: o.weight || 600,
    op: o.op,
  });
}
/** A key: a ring, a shaft and two teeth, its ring centred on (x, y). */
function keyIcon(x, y, s, col) {
  return (
    '<circle cx="' +
    x +
    '" cy="' +
    y +
    '" r="' +
    3.2 * s +
    '" fill="none" stroke="' +
    col +
    '" stroke-width="' +
    1.2 * s +
    '"/><path d="M' +
    (x + 3.2 * s) +
    ' ' +
    y +
    'h' +
    9 * s +
    'm-2.2 0v' +
    2.6 * s +
    'm-2.6 -2.6v' +
    2 * s +
    '" fill="none" stroke="' +
    col +
    '" stroke-width="' +
    1.2 * s +
    '" stroke-linecap="round"/>'
  );
}

/* The phone, where Scenes 3 and 4 put it: 150 wide, its toolbars running up under the headline
   and its footer fading out above the caption. Frames are 1080 × 1800 px (360 × 600 at 3×);
   the timeline's axis is at y 1029 px. */
var PX = 5,
  PY = -20,
  PW = 150;
function fades() {
  return (
    '<defs><linearGradient id="s9top" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0.82" stop-color="' +
    C.ground +
    '" stop-opacity="1"/><stop offset="1" stop-color="' +
    C.ground +
    '" stop-opacity="0"/></linearGradient>' +
    '<linearGradient id="s9foot" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="' +
    C.ground +
    '" stop-opacity="0"/><stop offset="0.16" stop-color="' +
    C.ground +
    '" stop-opacity="1"/></linearGradient></defs>' +
    '<rect x="0" y="0" width="180" height="70" fill="url(#s9top)"/>' +
    '<rect x="0" y="186" width="180" height="60" fill="url(#s9foot)"/>'
  );
}
function appPhone(st, o) {
  o = o || {};
  return G(phoneShot(PX, PY + (o.dy || 0), PW, 'zoom', st), { o: o.o === undefined ? 1 : o.o });
}

/* ---------- Scene 1: one prompt ---------- */
var ASK = [
  'Create a timeline for the',
  'Star Wars extended history,',
  'with comics, Legends,',
  'games, TV and books.',
];
SCENES[1] = function (lt, q) {
  var s = '';
  var x0 = 10,
    w = 140,
    top = 78;
  s += rect(x0, top, w, 112, C.card, { rx: 6, stroke: C.line, sw: 0.8 });
  s += rect(x0, top, w, 9, C.faint, { rx: 6 });
  s += txt(80, top + 6.4, 'assistant', { size: 5, mono: true, fill: C.soft, weight: 500 });
  s += txt(x0 + 8, top + 22, 'YOU', { size: 5.5, anchor: 'start', fill: C.soft, ls: 0.6 });
  ASK.forEach(function (l, i) {
    s += txt(x0 + 8, top + 36 + i * 12, l, { size: 9.5, anchor: 'start', weight: 700 });
  });
  // The cursor after the last word, and the send button pulsing once on "asked".
  if (Math.floor(lt * 2.5) % 2 === 0)
    s += rect(x0 + 8 + textWidth(ASK[3], 9.5) + 2, top + 64.6, 1.2, 9, C.accent);
  var b = clamp01((lt - q('asked')) / 0.6);
  var pulse = b > 0 && b < 1 ? Math.sin(b * Math.PI) : 0;
  var bx = x0 + w - 18,
    by = top + 96;
  s +=
    '<circle cx="' +
    bx +
    '" cy="' +
    by +
    '" r="' +
    (7 + 2 * pulse) +
    '" fill="' +
    C.accent +
    '"/>' +
    '<path d="M' +
    (bx - 3) +
    ' ' +
    (by + 0.5) +
    'L' +
    bx +
    ' ' +
    (by - 3) +
    'L' +
    (bx + 3) +
    ' ' +
    (by + 0.5) +
    'M' +
    bx +
    ' ' +
    (by - 3) +
    'V' +
    (by + 3.5) +
    '" stroke="' +
    C.ground +
    '" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  return s;
};

/* ---------- Scene 2: one key, one request ---------- */
SCENES[2] = function (lt, q) {
  var s = '';
  // The key.
  var kp = P(lt, q('key') - 0.2, 0.45);
  var kw = 118;
  s += G(
    rect(80 - kw / 2, 76, kw, 22, C.card, { rx: 11, stroke: C.amber, sw: 1 }) +
      keyIcon(80 - kw / 2 + 14, 87, 1.2, C.amber) +
      mono(80 - kw / 2 + 32, 90, 'och_key_…', { size: 8, fill: C.amber, weight: 700 }),
    { o: kp, tx: (1 - kp) * -20 },
  );
  var sp = P(lt, q('timelines') - 0.2, 0.4);
  s += G(
    chip(17, 113, 'timelines:read', C.accent, { size: 5.8, mono: true }) +
      chip(
        17 + chipWidth('timelines:read', { size: 5.8, mono: true }) + 4,
        113,
        'timelines:write',
        C.accent,
        {
          size: 5.8,
          mono: true,
        },
      ),
    { o: sp },
  );
  // The two requests.
  var tp = P(lt, q('learned') - 0.5, 0.4);
  var TX = 10,
    TY = 126,
    TW = 140;
  s += G(ICON.terminal(TX, TY, TW, 72), { o: tp });
  var lines = [
    ['GET …/document?download=1', C.text, q('learned') - 0.2],
    ['← 200 · the format', C.green, q('format')],
    ['POST /api/timelines', C.text, q('wrote')],
    ['← 201 Created', C.green, q('posted') - 0.1],
  ];
  lines.forEach(function (l, i) {
    var p = P(lt, l[2], 0.3);
    var n = Math.floor(l[0].length * clamp01((lt - l[2]) / 0.5));
    s += G(mono(TX + 6, TY + 18 + i * 13, l[0].slice(0, n), { size: 6.2, fill: l[1] }), {
      o: Math.min(p * 3, 1),
    });
  });
  return s;
};

/* ---------- Scene 3: 98 moments ---------- */
SCENES[3] = function (lt, q) {
  var up = smooth(P(lt, 0, 0.55));
  var st = remap(lt, [
    [0, 0.5],
    [q.dur, 7.5],
  ]);
  var s = appPhone(st, { dy: (1 - up) * 40 }) + fades();
  var cp = P(lt, q('98') - 0.2, 0.35),
    n = Math.round(98 * smooth(P(lt, q('98') - 0.2, 0.8)));
  var label = n + ' moments · 13 eras';
  var cw = chipWidth('98 moments · 13 eras', { size: 8 });
  s += pop(chip(80 - cw / 2, 196, label, C.amber, { size: 8 }), cp, 80, 194);
  s += G(
    txt(80, 210, 'An unofficial fan chronology · dates approximate', {
      size: 5.6,
      weight: 500,
      fill: C.soft,
      italic: true,
    }),
    { o: up },
  );
  return s;
};

/* ---------- Scene 4: from Tython to the films ---------- */
SCENES[4] = function (lt, q) {
  var films = q('films');
  var st = remap(lt, [
    [0.2, 8],
    [Math.max(films + 0.6, q.dur - 0.6), 18],
  ]);
  var s = appPhone(st) + fades();
  var a = P(lt, 0, 0.3) * (1 - P(lt, q('yavin') - 0.4, 0.4));
  var cw = chipWidth('36,453 BBY', { size: 8, mono: true });
  s += G(chip(80 - cw / 2, 196, '36,453 BBY', C.amber, { size: 8, mono: true }), { o: a });
  var b = P(lt, Math.max(q('yavin'), films - 0.4), 0.45);
  var label = '0 BBY · the Battle of Yavin';
  var bw = chipWidth(label, { size: 7.5 });
  s += G(chip(80 - bw / 2, 196, label, C.amber, { size: 7.5, solid: true }), {
    o: b,
    ty: (1 - b) * 5,
  });
  return s;
};

/* ---------- Scene 5: built the same way ---------- */
SCENES[5] = function (lt, q) {
  var s = '';
  var away = smooth(P(lt, 0, 0.5));
  if (away < 1)
    s += G(appPhone(18) + fades(), { o: 1 - away, s: lerp(1, 0.8, away), cx: 80, cy: 130 });
  var cp = P(lt, 0.35, 0.5);
  s += rise(
    rect(10, 40, 140, 74, C.card, { rx: 6, stroke: C.accent, sw: 0.9 }) +
      txt(80, 56, 'Built mostly by AI agents', { size: 10, weight: 700 }) +
      txt(80, 68, '(Claude and OpenAI),', { size: 10, weight: 700 }) +
      txt(80, 80, 'reviewed by a human.', { size: 10, weight: 700 }) +
      txt(80, 92, 'Open source.', { size: 10, weight: 700, fill: C.accent }) +
      txt(80, 106, 'API docs: timescale.info/docs/api', {
        size: 6,
        mono: true,
        fill: C.amber,
        weight: 600,
      }),
    cp,
    6,
  );
  s += shortEnd(smooth(P(lt, q('free') - 0.4, 0.6)), 'Timelines through the API');
  return s;
};
