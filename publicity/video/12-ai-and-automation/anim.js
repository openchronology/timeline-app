// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 12, Timelines from AI and automation (publicity/12-ai-and-automation.md): one request
   to an assistant, the API key it was given (Account → API keys), the requests it sent
   (GET …/document?download=1, POST /api/timelines, PUT against the current revision, PATCH
   …/settings) as terminal panels, the result in the real editor (samples/star-wars.ochx, the
   live timeline at timescale.info/athan/star-wars) zooming from 36,453 BBY to the films, a
   moment's Date precision in the reader, History and pull requests, every other kind of
   automation on the same key, and how the app itself is built (#303, #304 and its CI checks).
   Scenes are pure functions of scene time lt; q("word") is when that word is said. */

/* ---------- helpers (after Video 10's) ---------- */
var LH = 7.4; // terminal line height
/** A terminal window with a title in its bar. */
function term(x, y, w, h, title) {
  return (
    ICON.terminal(x, y, w, h) +
    (title
      ? txt(x + w / 2, y + 4.3, title, { size: 4.4, mono: true, fill: C.soft, weight: 500 })
      : '')
  );
}
/** Mono text, left-aligned; leading spaces kept. */
function mono(x, y, s, o) {
  o = o || {};
  s = String(s).replace(/^ +/, function (m) {
    return m.replace(/ /g, ' ');
  });
  return txt(x, y, s, {
    size: o.size || 4.6,
    mono: true,
    anchor: o.anchor || 'start',
    fill: o.fill || C.text,
    weight: o.weight || 500,
    op: o.op,
  });
}
/** A line typed from t0 at `rate` characters a second, with a cursor while typing. o.prompt
    draws a prompt glyph before it. */
function typed(x, y, s, lt, t0, o) {
  o = o || {};
  if (lt < t0) return '';
  var rate = o.rate || 42,
    size = o.size || 4.6;
  var n = Math.min(s.length, Math.floor((lt - t0) * rate));
  var px = o.prompt ? size * 0.6 * 2 : 0;
  var out =
    (o.prompt ? mono(x, y, o.prompt, { fill: C.accent, size: size, weight: 600 }) : '') +
    mono(x + px, y, s.slice(0, n), { size: size, fill: o.fill, weight: o.weight });
  if ((n < s.length || o.cursor) && Math.floor(lt * 2.5) % 2 === 0)
    out += rect(x + px + n * size * 0.6 + 0.4, y - size * 0.8, size * 0.55, size, C.accent, {
      op: 0.8,
    });
  return out;
}
function typedBy(s, t0, rate) {
  return t0 + s.length / (rate || 42);
}
/** Piecewise-linear map of scene time through [lt, value] points, clamped at both ends. */
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
/** A labelled pill with a leader line to (tx, ty). */
function callout(x, y, s, color, tx, ty, p, o) {
  o = o || {};
  var size = o.size || 5,
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
        '" stroke-width="0.7"/>' +
        '<circle cx="' +
        tx +
        '" cy="' +
        ty +
        '" r="1.1" fill="' +
        color +
        '"/>';
  var pill =
    rect(x0, y - 7.5, w, 11, C.card, { rx: 5.5, stroke: color, sw: 0.7 }) +
    txt(x0 + w / 2, y + 0.5, s, { size: size, mono: o.mono, weight: 600 });
  return rise(lead + pill, p, 3);
}
/** A key: a ring, a shaft and two teeth, its ring centred on (x, y). */
function keyIcon(x, y, s, col) {
  s = s || 1;
  col = col || C.amber;
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
/** A key's secret, never shown: its prefix and blurred blocks. */
function redacted(x, y, size, n) {
  var s = mono(x, y, 'och_key_', { size: size, fill: C.amber, weight: 600 });
  var cx = x + 8 * size * 0.6 + 1;
  for (var i = 0; i < (n || 6); i++) {
    s += rect(cx, y - size * 0.72, size * 2.2, size * 0.8, C.soft, { rx: size * 0.4, op: 0.35 });
    cx += size * 2.6;
  }
  return s;
}
/** A form field: a label above an input box with its text. */
function field(x, y, w, label, value, o) {
  o = o || {};
  return (
    txt(x, y, label, { size: 4.8, anchor: 'start', fill: C.soft, weight: 600 }) +
    rect(x, y + 2.5, w, 9, C.ground, { rx: 1.6, stroke: o.lit ? C.accent : C.line, sw: 0.7 }) +
    txt(x + 3, y + 8.6, value, { size: 5.2, anchor: 'start', weight: 500 })
  );
}
/** A check box, ticked by p. */
function checkbox(x, y, p) {
  return (
    rect(x, y - 4, 5, 5, p > 0.5 ? C.accent : C.ground, {
      rx: 1,
      stroke: p > 0.5 ? C.accent : C.soft,
      sw: 0.7,
    }) + (p > 0.5 ? G(check(x + 2.5, y - 1.2, C.ground), { o: p }) : '')
  );
}
/** An HTTP status, coloured by class. */
function status(x, y, s, p) {
  var col = /^2/.test(s) ? C.green : C.red;
  return pop(
    mono(x, y, '← ' + s, { fill: col, weight: 600, size: 4.8 }),
    p,
    x + textWidth(s, 4.8, true) / 2,
    y - 2,
  );
}

/* ---------- the films' neighbourhood, for the drawn axis of Scenes 3 and 4 ---------- */
/* The sample's moments from 40 BBY to 45 ABY: [years, colour (its medium), id]. ADDED are the
   ones the later PUT brought: the Thrawn books, the Tales series and Visions. */
var NEAR = [
  [-36, '#6fb0e0', 'tales-jedi-ahsoka'],
  [-32, '#6fd08c', 'bounty-hunter-game'],
  [-32, '#e8c547', 'naboo'],
  [-32, '#c58be0', 'plagueis'],
  [-32, '#6fb0e0', 'tales-jedi-dooku'],
  [-27, '#c58be0', 'outbound-flight'],
  [-22, '#e8c547', 'geonosis'],
  [-22, '#6fd08c', 'republic-commando'],
  [-22, '#6fb0e0', 'tcw'],
  [-21, '#6fb0e0', 'clone-wars-2003'],
  [-20, '#c58be0', 'dark-disciple'],
  [-19, '#c58be0', 'ascendancy'],
  [-19, '#6fb0e0', 'bad-batch'],
  [-19, '#6fb0e0', 'mandalore-siege'],
  [-19, '#e8c547', 'order-66'],
  [-19, '#6fb0e0', 'tales-empire'],
  [-19, '#6fb0e0', 'tales-underworld'],
  [-19, '#e8835f', 'vader-kyber'],
  [-18, '#c58be0', 'ahsoka-novel'],
  [-14, '#6fd08c', 'fallen-order'],
  [-14, '#c58be0', 'lords-of-sith'],
  [-11, '#c58be0', 'a-new-dawn'],
  [-10, '#e8c547', 'solo'],
  [-9, '#6fb0e0', 'kenobi'],
  [-9, '#6fd08c', 'survivor'],
  [-9, '#c58be0', 'thrawn-novel'],
  [-5, '#6fb0e0', 'andor'],
  [-5, '#6fb0e0', 'rebels'],
  [-2, '#6fb0e0', 'alliance-canon'],
  [-2, '#c58be0', 'alliances'],
  [-2, '#6fd08c', 'force-unleashed'],
  [-1, '#6fb0e0', 'lothal'],
  [-1, '#c58be0', 'treason'],
  [-0.03, '#6fd08c', 'dark-forces'],
  [-0.02, '#e8c547', 'rogue-one'],
  [0, '#6fb0e0', 'visions'],
  [0, '#e8c547', 'yavin'],
  [0.5, '#e8835f', 'vader-learns'],
  [0.67, '#c58be0', 'choices-of-one'],
  [1, '#e8835f', 'aphra'],
  [1, '#6fb0e0', 'holiday'],
  [2, '#c58be0', 'splinter'],
  [3, '#e8c547', 'hoth'],
  [3.5, '#e8835f', 'bounty-hunters'],
  [3.5, '#6fd08c', 'outlaws'],
  [3.5, '#c58be0', 'shadows'],
  [4, '#c58be0', 'bakura'],
  [4, '#6fd08c', 'battlefront'],
  [4, '#e8c547', 'endor'],
  [4.5, '#6fd08c', 'squadrons'],
  [5, '#6fd08c', 'dark-forces-2'],
  [5, '#c58be0', 'jakku'],
  [7, '#c58be0', 'coruscant-taken'],
  [8, '#c58be0', 'courtship'],
  [9, '#6fb0e0', 'boba-fett'],
  [9, '#6fb0e0', 'mandalorian'],
  [9, '#6fb0e0', 'skeleton-crew'],
  [9, '#c58be0', 'thrawn'],
  [10, '#e8835f', 'dark-empire'],
  [11, '#6fb0e0', 'ahsoka'],
  [11, '#e8835f', 'crimson-empire'],
  [11, '#c58be0', 'praxeum'],
  [12, '#6fd08c', 'jedi-outcast'],
  [14, '#6fd08c', 'jedi-academy-game'],
  [19, '#c58be0', 'bastion'],
  [20, '#e8835f', 'union'],
  [25, '#c58be0', 'vector-prime'],
  [27, '#c58be0', 'star-by-star'],
  [28, '#c58be0', 'bloodline'],
  [28, '#e8835f', 'kylo-ren'],
  [29, '#c58be0', 'unifying-force'],
  [34, '#e8c547', 'crait'],
  [34, '#6fb0e0', 'resistance'],
  [34, '#e8c547', 'starkiller'],
  [35, '#e8c547', 'exegol'],
  [40, '#c58be0', 'caedus'],
  [41, '#c58be0', 'invincible'],
  [43, '#c58be0', 'fate'],
];
/* Which addition each is, for Scene 4's cues: 0 Thrawn books, 1 Tales series, 2 Visions. */
var ADDED = {
  ascendancy: 0,
  'thrawn-novel': 0,
  alliances: 0,
  treason: 0,
  'tales-jedi-ahsoka': 1,
  'tales-jedi-dooku': 1,
  'tales-empire': 1,
  'tales-underworld': 1,
  visions: 2,
};
/* The eras in that range: [start, end, title, canon (else Legends)]. */
var ERAS = [
  [-22, -19, 'The Clone Wars', true],
  [-19, 4, 'The Galactic Empire', true],
  [-2, 5, 'The Galactic Civil War', true],
  [5, 34, 'The New Republic', true],
  [34, 35, '', true],
  [25, 29, 'Yuuzhan Vong War', false],
  [40, 41, '', false],
];
var MEDIA = [
  ['film', '#e8c547'],
  ['tv', '#6fb0e0'],
  ['novel', '#c58be0'],
  ['comic', '#e8835f'],
  ['video game', '#6fd08c'],
];
var AV = view(20, 300, -40, 45),
  AY = 143;
function yearLabel(y) {
  return y === 0 ? '0 BBY' : y < 0 ? -y + ' BBY' : y + ' ABY';
}
/** The axis with era bands (shown by pe), moments (pm(i) each, or 0 to hide), and ticks (pt). */
function miniAxis(pt, pe, pm) {
  var s = G(
    axis(
      AV,
      AY,
      ticksEvery(-40, 45, 10, function (y) {
        return yearLabel(y);
      }),
      { mono: true, tickSize: 4.4 },
    ),
    { o: pt },
  );
  // Era bands, below the axis: canon on the first row, Legends on the second.
  if (pe > 0)
    ERAS.forEach(function (e, i) {
      var row = e[3] ? (e[0] === -2 ? 1 : 0) : 2;
      var col = e[3] ? '#4a5d86' : '#7a5252';
      var x0 = vx(AV, e[0]),
        x1 = lerp(x0, vx(AV, e[1]), P(pe, i * 0.08, 0.5));
      s += band(x0, x1, AY + 11 + row * 6.4, e[2], {
        color: col,
        h: 5.6,
        textFill: '#eef2f8',
      });
    });
  // Moments: same-year ones stack upwards.
  var seen = {};
  NEAR.forEach(function (m, i) {
    var p = pm(i, m);
    var k = String(m[0]);
    var stack = seen[k] || 0;
    if (p <= 0) return;
    seen[k] = stack + 1;
    var x = vx(AV, m[0]),
      y = AY - stack * 3.8;
    s += pop(
      '<circle cx="' +
        x.toFixed(2) +
        '" cy="' +
        y.toFixed(2) +
        '" r="1.9" fill="' +
        m[1] +
        '" stroke="' +
        C.ground +
        '" stroke-width="0.5"/>',
      p,
      x,
      y,
    );
  });
  return s;
}

/* ---------- Scene 1: one request ---------- */
var ASK1 = 'Create a timeline for the Star Wars extended history,',
  ASK2 = 'with comics, Legends, games, TV and books.';
SCENES[1] = function (lt, q) {
  var s = '';
  var TX = 20,
    TY = 6,
    TW = 280,
    TH = 92;
  s += G(term(TX, TY, TW, TH, 'assistant'), { o: P(lt, 0, 0.5) });
  // The person's request, typed as it's read.
  var t0 = q('create') - 0.2,
    rate = (ASK1.length + ASK2.length) / Math.max(2, q('books') + 0.4 - t0);
  s += G(txt(TX + 8, TY + 16, 'YOU', { size: 4.6, anchor: 'start', fill: C.soft, ls: 0.5 }), {
    o: P(lt, 0.2, 0.4),
  });
  s += typed(TX + 8, TY + 28, ASK1, lt, t0, { size: 6.4, rate: rate, prompt: '›', weight: 600 });
  s += typed(TX + 8 + 6.4 * 1.2, TY + 38, ASK2, lt, typedBy(ASK1, t0, rate), {
    size: 6.4,
    rate: rate,
    weight: 600,
  });
  // The assistant's plan: what it will do, in three steps.
  var steps = [
    ['read the format', q('works')],
    ['write a document', q('http')],
    ['send it to the API', q('api')],
  ];
  s += G(txt(TX + 8, TY + 58, 'ASSISTANT', { size: 4.6, anchor: 'start', fill: C.soft, ls: 0.5 }), {
    o: P(lt, steps[0][1] - 0.3, 0.4),
  });
  var cx = TX + 8;
  steps.forEach(function (st, i) {
    var p = P(lt, st[1], 0.45),
      label = i + 1 + '  ' + st[0];
    s += G(chip(cx, TY + 74, label, C.accent, { size: 5.6, mono: true }), {
      o: p,
      tx: (1 - p) * 5,
    });
    cx += chipWidth(label, { size: 5.6, mono: true }) + 6;
    if (i < 2)
      s += G(txt(cx - 3.4, TY + 76, '→', { size: 6, fill: C.soft, weight: 500 }), {
        o: P(lt, steps[i + 1][1] - 0.2, 0.3),
      });
  });
  // The slot for what it needs: a key, empty until it's named.
  var kp = P(lt, q('key') - 0.3, 0.5);
  var glow = 0.5 + 0.5 * Math.sin((lt - q('key')) * 5);
  var KX = 160,
    KY = 130;
  s += G(
    rect(KX - 42, KY - 16, 84, 30, C.card, {
      rx: 4,
      stroke: mix(C.line, C.amber, kp * glow),
      sw: 0.9,
      dash: '2 1.6',
    }) +
      keyIcon(KX - 22, KY - 1, 1.3, mix(C.soft, C.amber, kp)) +
      txt(KX + 6, KY + 1, 'API key', { size: 6.4, anchor: 'start', weight: 700 }) +
      txt(KX + 6, KY + 8.4, 'needed', { size: 4.6, anchor: 'start', fill: C.soft, weight: 500 }),
    { o: kp, ty: (1 - kp) * 6 },
  );
  // A wire from the last step down to the slot.
  s += G(
    drawPath(
      'M' + (cx - 30) + ' ' + (TY + 80) + 'V' + (KY - 22) + 'H' + KX + 'V' + (KY - 16),
      60,
      kp,
      'stroke="' + C.amber + '" stroke-width="0.7" stroke-dasharray="1.4 1.2"',
    ),
    { o: kp },
  );
  return s;
};

/* ---------- Scene 2: a key that reaches only timelines ---------- */
SCENES[2] = function (lt, q) {
  var s = '';
  var CX = 8,
    CY = 2,
    CW = 166,
    CH = 166;
  var make = q('make'),
    write = q('write'),
    give = q('give'),
    reach = q('reaches');
  // The API keys card, from Account.
  s += G(
    card(CX, CY, CW, CH, {}) +
      txt(CX + 6, CY + 8, 'ACCOUNT', { size: 4.4, anchor: 'start', fill: C.soft, ls: 0.5 }) +
      txt(CX + 6, CY + 17, 'API keys', { size: 8, anchor: 'start', weight: 700 }) +
      txt(
        CX + 6,
        CY + 25,
        'For programs that read or change your timelines through the HTTP API.',
        {
          size: 4.4,
          anchor: 'start',
          fill: C.soft,
          weight: 500,
        },
      ),
    { o: P(lt, 0, 0.5) },
  );
  // New API key, filled in and created.
  var fx0 = CX + 8,
    fw = CW - 16;
  var nameT = 'Star Wars assistant',
    nN = Math.max(0, Math.min(nameT.length, Math.floor((lt - make) * 26)));
  var created = give - 0.5;
  var fp = P(lt, make - 0.4, 0.4) * (1 - P(lt, created + 0.2, 0.35));
  var form =
    txt(fx0, CY + 36, '▾ New API key', { size: 5.4, anchor: 'start', weight: 700 }) +
    field(fx0, CY + 46, fw, 'Key name', nameT.slice(0, nN), { lit: nN > 0 && nN < nameT.length }) +
    field(fx0, CY + 66, 40, 'Expires after (days)', lt > make + 1 ? '30' : '') +
    checkbox(fx0, CY + 88, P(lt, write, 0.2)) +
    txt(fx0 + 8, CY + 88, 'Allow timeline writes (reads are always included)', {
      size: 4.8,
      anchor: 'start',
      weight: 500,
    });
  var press = P(lt, created - 0.5, 0.25);
  form +=
    rect(fx0, CY + 96, 52, 10, mix(C.accent, C.strong, press), { rx: 2 }) +
    txt(fx0 + 26, CY + 102.8, 'Create API key', { size: 5.2, fill: C.ground, weight: 700 });
  s += G(form, { o: fp });
  // Shown once: copy it now.
  var np = P(lt, created, 0.4) * (1 - P(lt, reach - 0.6, 0.4));
  s += G(
    rect(fx0, CY + 34, fw, 44, mix(C.card, C.amber, 0.08), { rx: 2.5, stroke: C.amber, sw: 0.7 }) +
      txt(fx0 + 5, CY + 44, 'Copy this key now', { size: 6, anchor: 'start', weight: 700 }) +
      txt(fx0 + 5, CY + 52, 'It will not be shown again.', {
        size: 4.8,
        anchor: 'start',
        fill: C.soft,
        weight: 500,
      }) +
      rect(fx0 + 5, CY + 57, fw - 10, 10, C.ground, { rx: 1.5, stroke: C.line, sw: 0.5 }) +
      redacted(fx0 + 8, CY + 63.6, 4.8, 8) +
      txt(fx0 + 5, CY + 74, '→ given to the assistant', {
        size: 4.6,
        anchor: 'start',
        fill: C.amber,
        weight: 600,
        op: P(lt, q('assistant'), 0.3).toFixed(2),
      }),
    { o: np, ty: (1 - P(lt, created, 0.4)) * 4 },
  );
  // Its row in the list.
  var rp = P(lt, reach - 0.6, 0.5);
  var revoke = P(lt, q('revoke'), 0.3);
  s += G(
    rect(fx0, CY + 34, fw, 40, C.ground, { rx: 2.5, stroke: C.line, sw: 0.6 }) +
      txt(fx0 + 5, CY + 44, 'Star Wars assistant', { size: 6, anchor: 'start', weight: 700 }) +
      mono(fx0 + 5, CY + 52.5, 'och_key_… · timelines:read,', { size: 4.4, fill: C.soft }) +
      mono(fx0 + 5, CY + 59, 'timelines:write · Expires …', { size: 4.4, fill: C.soft }) +
      chip(fx0 + 5, CY + 68.5, 'Active', C.green, { size: 4.6 }) +
      button(fx0 + fw - 30, CY + 68, 'Revoke', revoke) +
      button(fx0 + fw - 30 - buttonWidth('Remove') - 3, CY + 68, 'Remove', 0),
    { o: rp, ty: (1 - rp) * 4 },
  );
  // What else the card says: only the timelines, and nothing about accounts or the site.
  s += G(
    txt(fx0, CY + 88, 'Keys act with your timeline permissions and', {
      size: 4.6,
      anchor: 'start',
      fill: C.soft,
      weight: 500,
    }) +
      txt(fx0, CY + 95, 'storage limit, and cannot manage accounts or the site.', {
        size: 4.6,
        anchor: 'start',
        fill: C.soft,
        weight: 500,
      }),
    { o: P(lt, q('nothing'), 0.5) },
  );
  s += G(
    mono(fx0, CY + 112, 'Authorization: Bearer och_key_…', { size: 4.6, fill: C.amber }) +
      txt(fx0, CY + 120, 'over HTTPS, in the header, never in a URL', {
        size: 4.6,
        anchor: 'start',
        fill: C.soft,
        weight: 500,
      }),
    { o: P(lt, reach - 0.3, 0.5) },
  );
  // The reach: the timeline endpoints, and nothing else.
  var RX = 186,
    KY = 40;
  var kp = P(lt, reach - 0.4, 0.5);
  s += G(
    keyIcon(RX + 4, KY, 1.4, C.amber) +
      txt(RX - 2, KY + 13, 'the key', { size: 4.8, anchor: 'start', fill: C.soft, weight: 600 }),
    { o: kp },
  );
  var targets = [
    ['/api/timelines…', true, reach, 20],
    ['your account', false, q('nothing'), 40],
    ["the site's administration", false, q('nothing') + 0.35, 60],
  ];
  targets.forEach(function (tg) {
    var p = P(lt, tg[2], 0.5),
      ty = tg[3];
    var col = tg[1] ? C.green : C.red;
    var x0 = RX + 20,
      x1 = 232;
    s += G(
      drawPath(
        'M' +
          x0 +
          ' ' +
          KY +
          'C' +
          (x0 + 10) +
          ' ' +
          KY +
          ' ' +
          (x1 - 12) +
          ' ' +
          ty +
          ' ' +
          x1 +
          ' ' +
          ty,
        40,
        p,
        'stroke="' +
          (tg[1] ? C.green : C.line) +
          '" stroke-width="0.8"' +
          (tg[1] ? '' : ' stroke-dasharray="1.6 1.4"'),
      ) +
        (tg[1] ? check(x1 + 5, ty, C.green) : cross(x1 + 4.5, ty, C.red, 2)) +
        txt(x1 + 11, ty + 1.8, tg[0], {
          size: tg[1] ? 5.4 : 5,
          anchor: 'start',
          mono: tg[1],
          fill: tg[1] ? C.text : C.soft,
          weight: tg[1] ? 600 : 500,
        }),
      { o: p },
    );
    void col;
  });
  // Its limits, chip by chip.
  var limits = [
    ['120 requests a minute (default)', q('hundred'), C.accent],
    ['expires', q('expires'), C.accent],
    ['Revoke at any time', q('revoke'), C.amber],
  ];
  limits.forEach(function (l, i) {
    var p = P(lt, l[1], 0.45);
    s += pop(chip(RX, 86 + i * 14, l[0], l[2], { size: 5.2 }), p, RX + 20, 84 + i * 14);
  });
  // A key is a password.
  var pw = P(lt, q('password') - 0.2, 0.5);
  s += G(
    rect(RX - 4, 128, 132, 38, C.card, { rx: 3, stroke: C.amber, sw: 0.8 }) +
      txt(RX + 2, 140, 'A key is a password.', { size: 7.6, anchor: 'start', weight: 700 }),
    { o: pw, ty: (1 - pw) * 4 },
  );
  var rules = [
    ['only tools you trust', q('trust')],
    ['only the scopes the job needs', q('allow')],
    ['revoke it when done', q('revoke', 1, q('allow'))],
  ];
  rules.forEach(function (r, i) {
    var p = P(lt, r[1] - 0.1, 0.35);
    s += G(
      check(RX + 4, 147.2 + i * 6.6, C.amber) +
        txt(RX + 9, 148.6 + i * 6.6, r[0], {
          size: 4.8,
          anchor: 'start',
          weight: 500,
        }),
      { o: p },
    );
  });
  return s;
};

/* ---------- Scene 3: read the format, write the document ---------- */
var GET1 = 'GET /api/timelines/{id}/document?download=1',
  POST1 = 'POST /api/timelines';
SCENES[3] = function (lt, q) {
  var s = '';
  var TX = 8,
    TY = 2,
    TW = 170,
    TH = 112,
    x = TX + 5,
    y0 = TY + 14,
    sz = 4.6;
  s += G(term(TX, TY, TW, TH, 'requests'), { o: P(lt, 0, 0.4) });
  // Read an existing timeline's document, to learn the format.
  var g0 = 0.4,
    g1 = typedBy(GET1, g0, 30),
    gr = Math.max(g1 + 0.3, q('learn'));
  s += typed(x, y0, GET1, lt, g0, { size: sz, rate: 30, weight: 600 });
  s += G(mono(x, y0 + LH, 'Authorization: Bearer och_key_…', { size: sz, fill: C.soft }), {
    o: P(lt, g1, 0.3),
  });
  s += status(x, y0 + 2 * LH, '200', P(lt, gr, 0.4));
  var doc = [
    '{ "format": "openchronology", "version": 1,',
    '  "presentation": { … },',
    '  "durations": [ … ], "events": [ … ], … }',
  ];
  doc.forEach(function (l, i) {
    s += G(mono(x, y0 + (3 + i) * LH, l, { size: sz, fill: C.green }), {
      o: P(lt, gr + 0.25 + i * 0.25, 0.3),
    });
  });
  // Create it: one POST, answered 201, private.
  var p0 = q('post') - 0.5,
    p1 = typedBy(POST1, p0, 30);
  var py = y0 + 7.4 * LH;
  s += G(
    '<path d="M' +
      (TX + 4) +
      ' ' +
      (py - 6) +
      'H' +
      (TX + TW - 4) +
      '" stroke="' +
      C.line +
      '" stroke-width="0.5"/>',
    { o: P(lt, p0, 0.3) },
  );
  s += typed(x, py + 2, POST1, lt, p0, { size: sz, rate: 30, weight: 600 });
  s += G(
    mono(x, py + 2 + LH, 'Authorization: Bearer och_key_…', { size: sz, fill: C.soft }) +
      mono(x, py + 2 + 2 * LH, '{ the document }', { size: sz, fill: C.soft }),
    { o: P(lt, p1, 0.3) },
  );
  var cr = P(lt, Math.max(p1 + 0.4, q('created')), 0.4);
  s += status(x, py + 2 + 3 * LH, '201 Created', cr);
  var pv = P(lt, q('private'), 0.4);
  s += pop(
    chip(x + 62, py + 1.6 + 3 * LH, 'private', C.amber, { size: 5, solid: true }),
    pv,
    x + 78,
    py + 3 * LH,
  );
  // The document it wrote: its time display, its eras, its tags.
  var DX = 184,
    DW = 130,
    dx = DX + 5;
  var dp = P(lt, q('wrote') - 0.2, 0.5);
  s += G(
    card(DX, TY, DW, TH, {}) +
      txt(dx, TY + 9, 'THE DOCUMENT IT WROTE', {
        size: 4.4,
        anchor: 'start',
        fill: C.soft,
        ls: 0.5,
      }),
    { o: dp },
  );
  var parts = [
    [
      q('years'),
      [
        ['"presentation": {', C.text],
        ['  "mode": "custom",', C.text],
        ['  "source": "function print…', C.text],
        ['    … " BBY" : " ABY""', C.amber],
      ],
    ],
    [
      q('eras'),
      [
        ['"durations": [', C.text],
        ['  { "title": "The Clone Wars",', C.text],
        ['    "tags": ["era", …] }, …', C.blue],
      ],
    ],
    [
      q('tagged'),
      [
        ['"events": [', C.text],
        ['  { "title": "The Battle of Yavin",', C.text],
        ['    "tags": ["canon", "legends",', C.green],
        ['             "film"] }, …', C.green],
      ],
    ],
  ];
  var ly = TY + 19;
  parts.forEach(function (pt) {
    var p = P(lt, pt[0] - 0.2, 0.45);
    pt[1].forEach(function (l, i) {
      s += G(mono(dx, ly + i * 7, l[0], { size: 4.5, fill: l[1] }), {
        o: p,
        tx: (1 - p) * 4,
      });
    });
    ly += pt[1].length * 7 + 4;
  });
  // The line it makes: years before and after Yavin, the eras, the moments by medium.
  var ap = P(lt, q('years'), 0.6);
  var ep = P(lt, q('eras'), 0.8);
  var mt = q('tagged');
  s += miniAxis(ap, ep, function (i, m) {
    if (ADDED[m[2]] !== undefined) return 0;
    return P(lt, mt - 0.3 + i * 0.02, 0.35);
  });
  // The medium legend, under the bands.
  var lg = P(lt, q('medium'), 0.5),
    lx = 62;
  MEDIA.forEach(function (md) {
    s += G(
      '<circle cx="' +
        lx +
        '" cy="' +
        171 +
        '" r="1.9" fill="' +
        md[1] +
        '"/>' +
        txt(lx + 4, 172.6, md[0], {
          size: 4.6,
          anchor: 'start',
          fill: C.soft,
          weight: 500,
          mono: true,
        }),
      { o: lg },
    );
    lx += textWidth(md[0], 4.6, true) + 16;
  });
  return s;
};

/* ---------- Scene 4: add to it, make it public ---------- */
var PUT1 = 'PUT /api/timelines/{id}',
  PATCH1 = 'PATCH /api/timelines/{id}/settings';
SCENES[4] = function (lt, q) {
  var s = '';
  var TX = 8,
    TY = 2,
    TW = 170,
    TH = 112,
    x = TX + 5,
    y0 = TY + 14,
    sz = 4.6;
  s += term(TX, TY, TW, TH, 'requests');
  var u0 = Math.min(0.4, q('put') - 2),
    u1 = typedBy(PUT1, u0, 30);
  s += typed(x, y0, PUT1, lt, u0, { size: sz, rate: 30, weight: 600 });
  s += G(
    mono(x, y0 + LH, 'Authorization: Bearer och_key_…', { size: sz, fill: C.soft }) +
      mono(x, y0 + 2 * LH, '{ "revision": "…",', { size: sz }) +
      mono(x, y0 + 3 * LH, '  "document": { … } }', { size: sz }),
    { o: P(lt, u1, 0.3) },
  );
  var rv = P(lt, q('revision'), 0.4);
  s += G(
    rect(x + 2 * 2.76 + 12 * 2.76 - 0.6, y0 + 2 * LH - 4.4, 3 * 2.76 + 1.2, 5.6, 'none', {
      rx: 1,
      stroke: C.amber,
      sw: 0.7,
    }) +
      txt(x + 70, y0 + 2 * LH, 'the current revision', {
        size: 4.6,
        anchor: 'start',
        fill: C.amber,
        weight: 600,
      }),
    { o: rv },
  );
  s += status(x, y0 + 4 * LH, '200', P(lt, q('current'), 0.4));
  s += G(
    mono(x, y0 + 5 * LH, '# from an older revision: ← 409 Conflict', { size: 4.4, fill: C.soft }),
    { o: P(lt, q('overwrite'), 0.4) },
  );
  // Make it public, at a short address.
  var c0 = q('patch') - 0.6,
    c1 = typedBy(PATCH1, c0, 34);
  var py = y0 + 6.6 * LH;
  s += G(
    '<path d="M' +
      (TX + 4) +
      ' ' +
      (py - 6) +
      'H' +
      (TX + TW - 4) +
      '" stroke="' +
      C.line +
      '" stroke-width="0.5"/>',
    { o: P(lt, c0, 0.3) },
  );
  s += typed(x, py + 1, PATCH1, lt, c0, { size: sz, rate: 34, weight: 600 });
  s += G(
    mono(x, py + 1 + LH, '{ "visibility": "public",', { size: sz }) +
      mono(x, py + 1 + 2 * LH, '  "slug": "star-wars" }', { size: sz }),
    { o: P(lt, c1, 0.3) },
  );
  s += status(x, py + 1 + 3 * LH, '200', P(lt, q('public'), 0.4));
  var ad = P(lt, q('address'), 0.5);
  var adr = 'timescale.info/athan/star-wars';
  s += G(
    chip(TX + TW / 2 - chipWidth(adr, { size: 5.6, mono: true }) / 2, TY + TH + 11, adr, C.accent, {
      size: 5.6,
      mono: true,
      solid: true,
    }),
    { o: ad, ty: (1 - ad) * -5 },
  );
  // The additions, by name, with their sources.
  var DX = 184,
    DW = 130,
    dx = DX + 6;
  s += card(DX, TY, DW, TH, {});
  s += txt(dx, TY + 9, 'ADDED LATER', { size: 4.4, anchor: 'start', fill: C.soft, ls: 0.5 });
  var groups = [
    [
      'The Thrawn books',
      q('thrawn'),
      ['Thrawn (2017)', 'Thrawn: Alliances', 'Thrawn: Treason', 'Thrawn Ascendancy'],
      '#c58be0',
    ],
    [
      'The Tales series',
      q('tales'),
      ['Tales of the Jedi', 'Tales of the Empire', 'Tales of the Underworld'],
      '#6fb0e0',
    ],
    ['Star Wars: Visions', q('visions'), ['non-canon · placed at 0 BBY'], '#6fb0e0'],
  ];
  var gy = TY + 19;
  groups.forEach(function (g) {
    var p = P(lt, g[1] - 0.1, 0.4);
    s += G(txt(dx, gy, g[0], { size: 5.6, anchor: 'start', weight: 700 }), {
      o: p,
      tx: (1 - p) * 4,
    });
    g[2].forEach(function (n, i) {
      var pi = P(lt, g[1] + 0.1 + i * 0.12, 0.35);
      s += G(
        '<circle cx="' +
          (dx + 2) +
          '" cy="' +
          (gy + 6.6 + i * 6.4) +
          '" r="1.5" fill="' +
          g[3] +
          '"/>' +
          txt(dx + 6, gy + 8.2 + i * 6.4, n, {
            size: 4.8,
            anchor: 'start',
            weight: 500,
            italic: g[0] !== 'Star Wars: Visions',
            fill: g[0] === 'Star Wars: Visions' ? C.soft : C.text,
          }),
        { o: pi },
      );
    });
    gy += 9 + g[2].length * 6.4 + 4;
  });
  // The line: everything from before, and the additions popping in where they belong.
  s += miniAxis(1, 1, function (i, m) {
    var a = ADDED[m[2]];
    if (a === undefined) return 1;
    return P(lt, groups[a][1] + 0.2 + (i % 5) * 0.08, 0.4);
  });
  // The additions ringed, as they arrive.
  NEAR.forEach(function (m) {
    var a = ADDED[m[2]];
    if (a === undefined) return;
    var p = P(lt, groups[a][1] + 0.2, 0.4) * (1 - P(lt, groups[a][1] + 2.2, 0.6));
    if (p <= 0) return;
    s += G(
      '<circle cx="' +
        vx(AV, m[0]).toFixed(2) +
        '" cy="' +
        AY +
        '" r="5" fill="none" stroke="' +
        C.amber +
        '" stroke-width="0.7"/>',
      { o: p },
    );
  });
  return s;
};

/* ---------- the captured app (Scenes 5 and 6): 1920 × 1080 frames ---------- */
var URL_SW = 'timescale.info/athan/star-wars';
/** A captured pixel in stage units for a window at (wx, wy), ww wide. */
function at(win, px, py) {
  var k = win.w / 1920;
  return [win.x + px * k, win.y + py * k];
}

/* ---------- Scene 5: the result ---------- */
SCENES[5] = function (lt, q) {
  var s = '';
  var win = { x: 12, y: 7, w: 296 };
  var rp = P(lt, 0, 0.7);
  // Shot time: the whole chronology held (to 2.5), then the zoom to the films (to 10.5).
  var z0 = q('tython') + 0.9,
    z1 = Math.max(z0 + 3.2, q('films') + 0.5);
  var st = remap(lt, [
    [0, 0.6],
    [z0, 2.5],
    [z1, 10.5],
  ]);
  s += G(appWindow(win.x, win.y, win.w, 'whole', st, { url: URL_SW }), {
    o: rp,
    ty: (1 - rp) * 8,
  });
  // The counts, ticking up as they're said.
  var cp = P(lt, q('98') - 0.2, 0.4) * (1 - P(lt, z0 + 0.4, 0.4));
  var n1 = Math.round(98 * smooth(P(lt, q('98') - 0.2, 0.7))),
    n2 = Math.round(13 * smooth(P(lt, q('13') - 0.2, 0.5))),
    n3 = Math.round(20 * smooth(P(lt, q('20') - 0.2, 0.5)));
  var label = n1 + ' moments · ' + n2 + ' eras · ' + n3 + ' relationships';
  var cw = chipWidth('98 moments · 13 eras · 20 relationships', { size: 6.4 });
  s += pop(chip(160 - cw / 2, 30, label, C.amber, { size: 6.4 }), cp, 160, 28);
  // The far past: the earliest moment, at 36,453 BBY.
  var j = at(win, 120, 538);
  var tp = P(lt, q('tython') - 0.2, 0.4) * (1 - P(lt, z0, 0.3));
  s += callout(
    j[0] + 4,
    j[1] + 26,
    "36,453 BBY · The Je'daii gather on Tython",
    C.amber,
    j[0],
    j[1] + 3,
    tp,
    {
      size: 5.2,
    },
  );
  // The films, at the end of the zoom: 0 BBY is the Battle of Yavin.
  var y0 = at(win, 910, 540);
  var fp = P(lt, z1 - 0.2, 0.5);
  s += callout(y0[0], y0[1] + 40, '0 BBY · the Battle of Yavin', C.amber, y0[0], y0[1] + 4, fp, {
    anchor: 'middle',
    size: 5.4,
  });
  // What it is, over the app's footer.
  var up = P(lt, q('unofficial') - 0.2, 0.5);
  var note =
    'An unofficial fan chronology · not affiliated with Lucasfilm · many dates approximate';
  var nw = textWidth(note, 4.8) + 12;
  var f = at(win, 960, 1036);
  s += G(
    rect(f[0] - nw / 2, f[1] - 6.2, nw, 9.6, C.ground, { rx: 4.8, stroke: C.line, sw: 0.6 }) +
      txt(f[0], f[1] + 0.8, note, { size: 4.8, fill: C.text, weight: 600 }),
    { o: up },
  );
  return s;
};

/* ---------- Scene 6: review it like any contribution ---------- */
SCENES[6] = function (lt, q) {
  var s = '';
  // The reader: from the films down to 14–4 BBY, the 9 BBY group, then Thrawn joins the Empire.
  var st = remap(lt, [
    [0, 0.2],
    [Math.max(3.4, q('approximate') + 0.2), 3.6],
    [q('every') - 0.2, 5.9],
  ]);
  var mv = smooth(P(lt, q('every') - 0.3, 0.9));
  var win = { x: lerp(12, 8, mv), y: lerp(7, 9, mv), w: lerp(296, 184, mv) };
  s += appWindow(win.x, win.y, win.w, 'reader', st, { url: URL_SW });
  // Its Date precision, outlined.
  var op = P(lt, q('approximate') - 0.1, 0.4);
  var a = at(win, 318, 578),
    b = at(win, 992, 624);
  s += G(
    rect(a[0], a[1], b[0] - a[0], b[1] - a[1], 'none', { rx: 1.2, stroke: C.amber, sw: 0.9 }),
    { o: op },
  );
  var cp = P(lt, q('why') - 0.1, 0.4) * (1 - P(lt, q('every') - 0.4, 0.3));
  s += callout(a[0] + 4, b[1] + 22, 'Date precision: and why', C.amber, a[0] + 40, b[1], cp, {
    size: 5.4,
  });
  // History: every save kept, a bad one put right.
  var HX = 200,
    HW = 114;
  var hp = P(lt, q('history') - 0.2, 0.5);
  var hist =
    card(HX, 6, HW, 74, {}) +
    txt(HX + 6, 15, 'History', { size: 6.4, anchor: 'start', weight: 700 });
  var rows = [
    ['save', 'a bad edit', C.red],
    ['save', '', C.soft],
    ['save', '', C.soft],
    ['baseline', '', C.soft],
  ];
  rows.forEach(function (r, i) {
    var p = P(lt, q('history') + i * 0.15, 0.35),
      ry = 22 + i * 13;
    hist += G(
      rect(HX + 5, ry, HW - 10, 10, C.ground, {
        rx: 1.5,
        stroke: i === 0 ? mix(C.line, C.red, P(lt, q('bad'), 0.3)) : C.line,
        sw: 0.6,
      }) +
        txt(HX + 9, ry + 6.6, 'saved revision · ' + r[0], {
          size: 4.6,
          anchor: 'start',
          weight: 500,
        }) +
        (r[1]
          ? txt(HX + HW - 8, ry + 6.6, r[1], {
              size: 4.6,
              anchor: 'end',
              fill: C.red,
              weight: 600,
              op: P(lt, q('bad'), 0.3).toFixed(2),
            })
          : ''),
      { o: p },
    );
  });
  var fix = P(lt, q('put') - 0.1, 0.6);
  hist += G(
    drawPath(
      'M' + (HX + 3) + ' 27C' + (HX - 6) + ' 30 ' + (HX - 6) + ' 37 ' + (HX + 3) + ' 40',
      18,
      fix,
      'stroke="' + C.green + '" stroke-width="0.9"',
    ) +
      txt(HX + HW - 8, 45.8, 'put right', { size: 4.6, anchor: 'end', fill: C.green, weight: 700 }),
    { o: fix },
  );
  s += G(hist, { o: hp, tx: (1 - hp) * 6 });
  // A pull request: anyone signed in can propose a fix.
  var pp = P(lt, q('propose') - 0.2, 0.5);
  var pr =
    card(HX, 86, HW, 46, {}) +
    txt(HX + 6, 95, 'Pull requests', { size: 6.4, anchor: 'start', weight: 700 }) +
    button(HX + 6, 107, 'Propose changes', P(lt, q('propose'), 0.3)) +
    rect(HX + 5, 113, HW - 10, 14, C.ground, { rx: 1.5, stroke: C.line, sw: 0.6 }) +
    txt(HX + 9, 121.6, 'Fix a date · open', { size: 4.8, anchor: 'start', weight: 600 }) +
    button(HX + HW - 8 - buttonWidth('Review'), 121, 'Review', P(lt, q('review'), 0.3));
  s += G(pr, { o: pp, tx: (1 - pp) * 6 });
  // A person asked, gave the key, checked the result.
  var steps = [
    ['asked', q('asked')],
    ['gave the key', q('gave')],
    ['checked the result', q('checked')],
  ];
  var sy = 150,
    sx = 30;
  s += G(ICON.person(16, sy + 2, C.text), { o: P(lt, q('person') - 0.2, 0.4) });
  steps.forEach(function (st2, i) {
    var p = P(lt, st2[1] - 0.1, 0.35);
    var lit = p > 0.5 ? C.accent : C.soft;
    s += G(
      chip(sx, sy, st2[0], lit, { size: 5.6 }) +
        (i < 2
          ? txt(sx + chipWidth(st2[0], { size: 5.6 }) + 5, sy + 1.6, '→', {
              size: 6,
              fill: C.soft,
            })
          : ''),
      { o: lerp(0.25, 1, p) * P(lt, q('person') - 0.2, 0.4) },
    );
    sx += chipWidth(st2[0], { size: 5.6 }) + 12;
  });
  var rv = P(lt, q('review') - 0.1, 0.5);
  s += G(chip(sx + 4, sy, 'review it', C.amber, { size: 5.6, solid: true }), {
    o: rv,
    tx: (1 - rv) * 4,
  });
  return s;
};

/* ---------- Scene 7: any script, the same key ---------- */
SCENES[7] = function (lt, q) {
  var s = '';
  var KX = 116,
    KY = 88;
  var nodes = [
    ['AI assistant', 0.3, false, false],
    ['och-import-logs', q('importer'), true, true],
    ['syslog receiver', q('syslog'), false, true],
    ['journald follower', q('journal'), false, true],
    ['curl', q('curl'), true, false],
    ['Python', q('python'), false, false],
    ['cron job', q('cron'), false, false],
    ['CI pipeline', q('pipeline'), false, false],
    ['notebook', q('notebook'), false, false],
  ];
  // The key and its endpoints at the centre.
  var kp = P(lt, 0, 0.5);
  var cw = chipWidth('och_key_…', { size: 6, mono: true }) + 14;
  s += G(
    rect(KX - cw / 2, KY - 9, cw, 13, C.card, { rx: 6.5, stroke: C.amber, sw: 0.9 }) +
      keyIcon(KX - cw / 2 + 7, KY - 2.5, 0.8, C.amber) +
      mono(KX - cw / 2 + 17, KY - 0.2, 'och_key_…', { size: 6, fill: C.amber, weight: 600 }) +
      mono(KX, KY + 12, '→ /api/timelines…', { size: 4.8, anchor: 'middle', fill: C.green }),
    { o: kp },
  );
  // The things that use one, around it.
  nodes.forEach(function (n, i) {
    var ang = -Math.PI / 2 + (i / nodes.length) * Math.PI * 2;
    var nx = KX + Math.cos(ang) * 92,
      ny = KY + Math.sin(ang) * 64;
    var p = P(lt, n[1] - 0.15, 0.5);
    if (p <= 0) return;
    var w = chipWidth(n[0], { size: 5.4, mono: n[2] });
    var ex = KX + Math.cos(ang) * 24,
      ey = KY + Math.sin(ang) * 13;
    s += drawPath(
      'M' + nx.toFixed(2) + ' ' + ny.toFixed(2) + 'L' + ex.toFixed(2) + ' ' + ey.toFixed(2),
      100,
      p,
      'stroke="' + C.line + '" stroke-width="0.8"',
    );
    // Packets running in to the key.
    for (var k = 0; k < 3; k++) {
      var f = (lt - n[1] - 0.5 - k * 0.55) / 1.6;
      f = f - Math.floor(f);
      if (lt < n[1] + 0.5) break;
      var pxp = lerp(nx, ex, f),
        pyp = lerp(ny, ey, f);
      s +=
        '<circle cx="' +
        pxp.toFixed(2) +
        '" cy="' +
        pyp.toFixed(2) +
        '" r="1.1" fill="' +
        C.amber +
        '" opacity="' +
        (1 - Math.abs(f - 0.5) * 1.4).toFixed(2) +
        '"/>';
    }
    s += pop(
      rect(nx - w / 2, ny - 7.5, w, 11, C.card, { rx: 5.5, stroke: C.accent, sw: 0.7 }) +
        txt(nx, ny + 0.5, n[0], { size: 5.4, mono: n[2], weight: 600 }) +
        (n[3]
          ? txt(nx, ny + 10, 'Video 10', { size: 4.4, fill: C.soft, weight: 500, mono: true })
          : ''),
      p,
      nx,
      ny,
    );
  });
  // The reference and the description, for code generators and agents.
  var RX = 230,
    RW = 84;
  var c1 = P(lt, q('reference') - 0.2, 0.5),
    c2 = P(lt, q('open') - 0.2, 0.5);
  s += G(
    ICON.browser(RX, 26, RW, 50, { url: '/docs/api' }) +
      mono(RX + 6, 42, '/docs/api', { size: 6, fill: C.accent, weight: 600 }) +
      txt(RX + 6, 52, 'every operation', { size: 5, anchor: 'start', weight: 500 }) +
      txt(RX + 6, 59, 'its parameters and body', { size: 5, anchor: 'start', weight: 500 }) +
      button(RX + 6, 70, 'Try it', 0),
    { o: c1, ty: (1 - c1) * 6 },
  );
  s += G(
    ICON.browser(RX, 90, RW, 50, { url: '/api/openapi.json' }) +
      mono(RX + 6, 106, '/api/openapi.json', { size: 5.4, fill: C.accent, weight: 600 }) +
      txt(RX + 6, 116, 'OpenAPI 3.1', { size: 5, anchor: 'start', weight: 500 }) +
      txt(RX + 6, 123, 'for code generators', { size: 5, anchor: 'start', weight: 500 }) +
      txt(RX + 6, 130, 'and agents', {
        size: 5,
        anchor: 'start',
        weight: 500,
        op: P(lt, q('agents'), 0.3).toFixed(2),
      }),
    { o: c2, ty: (1 - c2) * 6 },
  );
  return s;
};

/* ---------- Scene 8: how the app is built ---------- */
var CHECKS = [
  'Core / npm / Node 22',
  'Browser / chromium',
  'Browser / firefox',
  'Browser / webkit',
  'PostgreSQL 16 / native pgmp / …',
  'Server packages / debian13',
];
/** Lines of code filling a lane, as bars, up to fraction p. */
function codeLines(x, y, w, n, p, seed, col) {
  var s = '';
  for (var i = 0; i < n; i++) {
    var f = clamp01(p * n - i);
    if (f <= 0) break;
    var ind = (i * 7 + seed) % 3,
      len = 0.35 + (((i * 13 + seed * 5) % 7) / 7) * 0.55;
    s += rect(x + ind * 4, y + i * 4.2, (w - ind * 4) * len * f, 2, col, { rx: 1, op: 0.55 });
  }
  return s;
}
SCENES[8] = function (lt, q) {
  var s = '';
  var most = q('most'),
    anth = q('anthropic'),
    oai = q('openai'),
    one = q('one'),
    tests = q('tests'),
    agree = q('agree'),
    broke = q('broke'),
    fix = q('fix'),
    browser = q('browser');
  // Top: agents write, the maintainer directs and merges, CI checks every pull request.
  s += G(
    txt(8, 7, 'MOST OF THE CODE: AI CODING AGENTS', {
      size: 4.4,
      anchor: 'start',
      fill: C.soft,
      ls: 0.5,
    }),
    { o: P(lt, most - 0.2, 0.4) },
  );
  var lanes = [
    ['Claude · Claude Code', 'Anthropic', anth, '#d98a5f'],
    ["OpenAI's models", 'OpenAI', oai, '#7fc4b0'],
  ];
  lanes.forEach(function (ln, i) {
    var p = P(lt, ln[2] - 0.3, 0.5),
      ly = 12 + i * 38;
    var fill = clamp01((lt - ln[2]) / 6);
    s += G(
      card(8, ly, 100, 34, {}) +
        txt(14, ly + 9, ln[0], { size: 5.6, anchor: 'start', weight: 700 }) +
        txt(102, ly + 9, ln[1], { size: 4.4, anchor: 'end', fill: C.soft, weight: 500 }) +
        codeLines(14, ly + 14, 60, 4, fill, i * 3 + 1, ln[3]) +
        txt(78, ly + 29, 'code + tests', {
          size: 4.4,
          anchor: 'start',
          fill: C.soft,
          weight: 500,
          mono: true,
        }),
      { o: p, tx: (1 - p) * -5 },
    );
  });
  // The maintainer.
  var mp = P(lt, one - 0.3, 0.5);
  s += G(
    drawPath('M110 48H124', 14, mp, 'stroke="' + C.arc + '" stroke-width="0.8"') +
      card(126, 12, 90, 72, { stroke: C.accent }) +
      ICON.person(140, 32, C.accent) +
      txt(150, 27, 'one maintainer', { size: 5.8, anchor: 'start', weight: 700 }) +
      txt(150, 34, 'a person', { size: 4.6, anchor: 'start', fill: C.soft, weight: 500 }),
    { o: mp, tx: (1 - mp) * 5 },
  );
  var duties = [
    ['decides what gets built', q('decides')],
    ['reviews and merges every PR', q('reviews')],
    ['runs the servers', q('runs')],
  ];
  duties.forEach(function (d, i) {
    var p = P(lt, d[1] - 0.1, 0.35);
    s += G(
      check(134, 47 + i * 10, C.green) +
        txt(139, 48.6 + i * 10, d[0], { size: 4.8, anchor: 'start', weight: 500 }),
      { o: p },
    );
  });
  // CI: every pull request runs the tests.
  var cp = P(lt, q('mistakes') - 0.2, 0.5);
  s += G(
    drawPath('M218 48H226', 8, cp, 'stroke="' + C.arc + '" stroke-width="0.8"') +
      card(228, 12, 86, 72, {}) +
      txt(234, 21, 'CI · every pull request', { size: 5.2, anchor: 'start', weight: 700 }),
    { o: cp, tx: (1 - cp) * 5 },
  );
  CHECKS.forEach(function (c, i) {
    var p = P(lt, tests - 0.5 + i * 0.16, 0.3);
    s += G(
      check(236, 28.6 + i * 7.6, C.green) +
        txt(240, 30 + i * 7.6, c, { size: 4.4, anchor: 'start', weight: 500 }),
      { o: lerp(0.3, 1, p) * cp },
    );
  });
  s += G(
    txt(234, 80, '… 30 checks a run', { size: 4.6, anchor: 'start', fill: C.soft, weight: 600 }),
    { o: P(lt, tests + 0.6, 0.4) },
  );
  // Bottom: a real miss and its fix.
  s += G(
    txt(8, 100, 'A MISS, AND ITS FIX', { size: 4.4, anchor: 'start', fill: C.soft, ls: 0.5 }),
    { o: P(lt, agree - 0.4, 0.4) },
  );
  var ip = P(lt, agree - 0.3, 0.5),
    flash = P(lt, broke - 0.1, 0.3) * (1 - P(lt, broke + 1.2, 0.6));
  s += G(
    card(8, 105, 122, 60, { stroke: mix(C.line, C.red, 0.4 + 0.6 * flash) }) +
      cross(17, 115, C.red, 2.2) +
      txt(23, 117, 'Issue #303', { size: 5.4, anchor: 'start', weight: 700 }) +
      txt(124, 117, 'Closed', { size: 4.6, anchor: 'end', fill: C.soft, weight: 600 }) +
      txt(14, 127, 'Agreeing to the terms fails:', { size: 5.2, anchor: 'start', weight: 600 }) +
      txt(14, 134, "Failed to construct 'FormData'", { size: 5.2, anchor: 'start', weight: 600 }) +
      txt(14, 145, 'Pressing Agree recorded nothing.', {
        size: 4.6,
        anchor: 'start',
        fill: C.soft,
        weight: 500,
      }) +
      txt(14, 152, 'No test clicked the button in a browser.', {
        size: 4.6,
        anchor: 'start',
        fill: C.red,
        weight: 600,
      }),
    { o: ip, ty: (1 - ip) * 5 },
  );
  var fp = P(lt, fix - 0.2, 0.5),
    tl = P(lt, browser - 0.2, 0.4);
  s += G(
    drawPath('M132 135H140', 8, fp, 'stroke="' + C.arc + '" stroke-width="0.8"') +
      card(142, 105, 118, 60, { stroke: C.green }) +
      check(151, 115, C.green) +
      txt(157, 117, 'Pull request #304', { size: 5.4, anchor: 'start', weight: 700 }) +
      txt(148, 127, 'Agreeing to the terms works again', {
        size: 5.2,
        anchor: 'start',
        weight: 600,
      }) +
      rect(147, 134, 108, 10, mix(C.ground, C.green, 0.15 * tl), {
        rx: 1.5,
        stroke: mix(C.line, C.green, tl),
        sw: 0.6,
      }) +
      mono(150, 140.6, '+ test/terms-live-postgres.mjs', {
        size: 4.6,
        fill: mix(C.soft, C.green, tl),
        weight: 600,
      }) +
      txt(148, 154, 'a real browser presses Agree', {
        size: 4.6,
        anchor: 'start',
        fill: C.soft,
        weight: 500,
        op: (0.4 + 0.6 * tl).toFixed(2),
      }),
    { o: fp, ty: (1 - fp) * 5 },
  );
  var gp = P(lt, browser + 0.5, 0.5);
  s += pop(
    rect(266, 122, 48, 26, C.card, { rx: 3, stroke: C.accent, sw: 0.8 }) +
      txt(290, 133, 'Merged', { size: 6, weight: 700, fill: C.accent }) +
      txt(290, 141, 'after review', { size: 4.6, fill: C.soft, weight: 500 }),
    gp,
    290,
    135,
  );
  return s;
};

/* ---------- Scene 9: built by you, your scripts, or your assistant ---------- */
SCENES[9] = function (lt, q) {
  var s = '';
  var who = [
    ['you', q('by')],
    ['your scripts', q('scripts')],
    ['your assistant', q('assistant')],
  ];
  var total = 0;
  who.forEach(function (w) {
    total += chipWidth(w[0], { size: 6.4 }) + 8;
  });
  var x = 160 - (total - 8) / 2;
  who.forEach(function (w) {
    var p = P(lt, w[1] - 0.2, 0.4);
    s += pop(chip(x, 24, w[0], C.accent, { size: 6.4 }), p, x + 10, 22);
    x += chipWidth(w[0], { size: 6.4 }) + 8;
  });
  var sp = P(lt, q('server') - 0.2, 0.5);
  s += G(
    ICON.server(160, 50) +
      txt(160, 65, 'on a server you can run yourself', { size: 5.4, fill: C.soft, weight: 600 }),
    { o: sp },
  );
  var e = P(lt, 0.3, 0.8);
  s += G(
    wordmark(160, 92, 15) +
      txt(160, 110, 'docs: /docs/api · /api/openapi.json', {
        size: 6.2,
        mono: true,
        fill: C.accent,
        weight: 500,
      }) +
      addresses(160, 124, 6) +
      txt(
        160,
        156,
        'Star Wars: an unofficial fan chronology, not affiliated with or endorsed by Lucasfilm.',
        {
          size: 4.6,
          fill: C.soft,
          weight: 500,
        },
      ),
    { o: e, ty: (1 - e) * 6 },
  );
  return s;
};
