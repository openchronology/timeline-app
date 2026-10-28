// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 22, Handed Down (publicity/shorts/22-handed-down.md): a vertical short for the Marine
   Corps birthday. The Marine Corps timeline (samples/usmc.ochx, an export of /athan/usmc) in the
   real editor on a phone, captured narrow in shots.json: the whole line on the cover; a zoom into
   November 1775, where the founding opens in the reader; one long run along the line through
   seven battles, with a readout of the years since 1775; back to 1921, where Lejeune's birthday
   order opens in the reader under the quotation; 1945 to today, the cake ceremony and the 250th
   lit in turn under the lesson; and the end card. Overlays sit over the empty top of the
   timeline or above the phone, never over the app's own text. Scenes are pure functions of
   scene time lt; q("word") is when that word is said. */

/* ---------- the phone, with a camera on the captured frame ---------- */
/* The phone's screen on the stage, and a camera on the shot (1080 × 1920 px, a 360 × 640
   window at scale 3): zoom z about the shot pixel (fx, fy), which sits at the screen's centre. */
var SCR = { x: 19, y: 72, w: 122, h: 136 };
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
/** One shot layer's image through camera c, shifted down by ty. */
function shotImage(id, st, c, ty, op) {
  var sh = (typeof SHOTS !== 'undefined' && SHOTS[id]) || { width: 360, height: 640 };
  var hpx = (SHOT_W * sh.height) / sh.width;
  return (
    '<image href="' +
    shotFrame(id, st) +
    '" x="' +
    c.x(0).toFixed(2) +
    '" y="' +
    (c.y(0) + (ty || 0)).toFixed(2) +
    '" width="' +
    (SHOT_W * c.k).toFixed(2) +
    '" height="' +
    (hpx * c.k).toFixed(2) +
    '" opacity="' +
    op.toFixed(3) +
    '"/>'
  );
}
/** The phone showing shot layers [{id, st, op, ty, c}] through camera c (or the layer's own). */
function phone(c, layers, bg) {
  var b = 4.6,
    r = 8;
  var s =
    rect(SCR.x - b - 0.8, SCR.y - b + 1.6, SCR.w + 2 * b + 1.6, SCR.h + 2 * b, '#000', {
      rx: r + b,
      op: 0.22,
    }) +
    rect(SCR.x - b, SCR.y - b, SCR.w + 2 * b, SCR.h + 2 * b, '#15191c', {
      rx: r + b,
      stroke: C.line,
      sw: 0.6,
    }) +
    '<defs><clipPath id="scr-clip">' +
    rect(SCR.x, SCR.y, SCR.w, SCR.h, '#000', { rx: r }) +
    '</clipPath></defs>' +
    '<g clip-path="url(#scr-clip)">' +
    rect(SCR.x, SCR.y, SCR.w, SCR.h, bg || '#f9f9f6');
  layers.forEach(function (l) {
    var op = l.op === undefined ? 1 : l.op;
    if (op <= 0.001) return;
    s += shotImage(l.id, l.st, l.c || c, l.ty, op);
  });
  return s + '</g>';
}
/** Clips marks to the phone's screen. */
function clipScr(inner) {
  return inner ? '<g clip-path="url(#scr-clip)">' + inner + '</g>' : '';
}

/* ---------- where things are in the shots ---------- */
/* The canvas runs from shot x 58 to 1019 across the view, its line at y 1143; the moments'
   labels sit in two rows above it (y 895–1050) and two below (1315–1490), the war bands
   between (1220–1370). Above y 880 there's only the chapter's picture: the overlays go there.
   In the reader, the title is at y 190–350, the picture at 410–1100, the date at 1190–1230. */
function day(s) {
  return Date.parse(s + 'T00:00:00Z') / 86400000;
}
function pxAt(view, s) {
  var l = day(view[0]),
    r = day(view[1]);
  return 58 + (961 * (day(s) - l)) / (r - l);
}
var Y_LINE = 1143;
// The views the shots end on (the last captured frame, a frame short of the last key).
var V_NOV = ['1775-09-01', '1775-12-31'],
  V_1921 = ['1918-12-29', '1924-01-26'],
  V_MOD = ['1944-12-08', '2029-09-27'];

/* The cameras: the timeline (the line a little below the middle, the empty picture above it);
   the reader's top (title, picture) and its middle (date, tags, notes); the reader small, under
   the quotation, from its title to its date. */
var CAM_LINE = pcam(1.1, 540, 1120);
var CAM_DRIFT = pcam(1.16, 540, 1130);
var CAM_HIGH = pcam(1.1, 540, 1075);
var CAM_READ = pcam(1.1, 540, 650);
var CAM_READ_MID = pcam(1.1, 540, 1400);
var CAM_READ_ALL = pcam(1.0, 540, 700);

/** A ring that draws attention to (x, y), growing in with p. */
function ring(x, y, p, r) {
  if (p <= 0.001) return '';
  r = r || 3.6;
  return (
    '<circle cx="' +
    x.toFixed(2) +
    '" cy="' +
    y.toFixed(2) +
    '" r="' +
    (r * lerp(1.7, 1, p)).toFixed(2) +
    '" fill="none" stroke="' +
    C.select +
    '" stroke-width="1.1" opacity="' +
    p.toFixed(3) +
    '"/>'
  );
}
/** A soft glow behind a marker at (x, y): the moment brightening. */
function glow(x, y, p) {
  if (p <= 0.001) return '';
  return (
    '<circle cx="' +
    x.toFixed(2) +
    '" cy="' +
    y.toFixed(2) +
    '" r="6.5" fill="' +
    C.select +
    '" opacity="' +
    (0.35 * p).toFixed(3) +
    '"/>' +
    ring(x, y, p, 3.8)
  );
}
/** A card on the stage, (x, y) its top left. */
function panel(x, y, w, h, op) {
  return rect(x, y, w, h, C.card, {
    rx: 4,
    stroke: C.accent,
    sw: 0.6,
    op: op === undefined ? 0.94 : op,
  });
}
/** A scene whose phone holds across the cuts: the overlays fade with the scene, the phone
    doesn't. */
function overPhone(ph, over, lt, q, svg) {
  var f = Math.min(P(lt, 0, 0.2), 1 - clamp01((lt - (q.dur - 0.15)) / 0.15));
  return { svg: svg || '', keep: ph + G(over, { o: f }), keepIn: true, keepOut: true };
}
function smoothstep(x) {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
}
/** When a word is said, or null if the narration doesn't have it (not reported as missing). */
function maybe(q, w) {
  var n = q.missing.length,
    t = q(w);
  if (q.missing.length > n) {
    q.missing.length = n;
    return null;
  }
  return t;
}

/* ---------- Scene 1: the cover (the whole line, already whole at frame 0) ---------- */
SCENES[1] = function (lt, q) {
  var d = smooth((lt - (q('youngest') - 0.2)) / 2.5) * 0.4;
  var ph = phone(camMix(CAM_LINE, CAM_DRIFT, d), [{ id: 'all', st: 0 }]);
  var sub = txt(SAFE.cx, 61.5, '10 November 1775 → 10 November 2026', {
    size: 6.4,
    serif: true,
    weight: 600,
    fill: C.soft,
  });
  return { svg: sub, keep: ph, keepIn: true, keepOut: true };
};

/* ---------- Scene 2: where it starts (the zoom into 1775, then the founding) ---------- */
SCENES[2] = function (lt, q) {
  var back = smooth(lt / 0.5);
  var tZ = 2.7;
  var zp = clamp01((lt - 0.05) / (tZ - 0.05));
  var c = camMix(camMix(CAM_LINE, CAM_DRIFT, 0.4), CAM_LINE, back);
  var tUp = Math.max(tZ + 0.1, q('two') - 0.45);
  var up = smooth((lt - tUp) / 0.55);
  var mid = smooth((lt - (q('battalions') + 0.6)) / 0.9);
  var rc = camMix(CAM_READ, CAM_READ_MID, mid);
  var dy = (1 - up) * (SCR.h + 6);
  var ph = phone(c, [
    { id: 'zoom75', st: 3 * zp },
    { id: 'reader75', st: 1.1, c: rc, ty: dy, op: up > 0 ? 1 : 0 },
  ]);
  // The founding lit as the zoom comes to rest on it.
  var marks = '';
  if (zp >= 1 && up < 1)
    marks += G(ring(c.x(pxAt(V_NOV, '1775-11-10')), c.y(Y_LINE), P(lt, tZ, 0.35)), {
      o: 1 - P(lt, tUp, 0.15),
    });
  return overPhone(ph, clipScr(marks), lt, q, '');
};

/* ---------- Scene 3: every generation (one long run along the line) ---------- */
/* The pan shot: hop i runs from shot time 1.2 i to 1.2 i + 1.0 and holds 0.2 s on stop i; the
   scene runs each hop in the time between the names. */
var STOPS = [
  { place: 'Derna', year: 1805, n: 30, w: 'tripoli' },
  { place: 'Chapultepec', year: 1847, n: 72 },
  { place: 'Belleau Wood', year: 1918, n: 143, w: ['belleau', 'bella', 'bello'] },
  { place: 'Iwo Jima', year: 1945, n: 170, w: 'iwo' },
  { place: 'Chosin Reservoir', year: 1950, n: 175, w: ['chosin', 'chosen'] },
  { place: 'Huế City', year: 1968, n: 193, w: ['hu', 'hw', 'way'] },
  { place: 'Fallujah', year: 2004, n: 229, w: ['fallujah', 'fall'] },
];
/** When the run arrives at each stop and leaves it, in scene time: at each name as it's said,
    Derna already in place as the name comes, and Chapultepec (not named) passed between Derna
    and Belleau Wood. Names the narration doesn't have are spread between their neighbours. */
function schedule(q) {
  var t = STOPS.map(function (s) {
    return s.w ? maybe(q, s.w) : null;
  });
  if (t[0] === null) t[0] = 2.8;
  for (var i = 1; i < t.length; i++) {
    if (t[i] !== null && t[i] > t[i - 1] + 0.3) continue;
    var j = i + 1;
    while (j < t.length && (t[j] === null || t[j] <= t[i - 1] + 0.3)) j++;
    var tj = j < t.length ? t[j] : Math.max(q.end, t[i - 1] + 0.6 * (j - i + 1));
    t[i] = lerp(t[i - 1], tj, 1 / (j - i + 1));
  }
  var out = t.map(function (x) {
    return { a: x - 0.05, d: x + 0.5 };
  });
  out[0].a = t[0] - 0.5;
  for (var k = 0; k + 1 < out.length; k++)
    out[k].d = Math.max(
      out[k].a,
      Math.min(Math.max(out[k].d, out[k + 1].a - 0.35), out[k + 1].a - 0.2),
    );
  out[1].a = lerp(out[0].d, out[2].a, 0.55);
  out[1].d = out[1].a + 0.02;
  out[out.length - 1].d = 1e9;
  return out;
}
/** The pan shot's time at scene time lt. */
function panAt(lt, sch) {
  for (var i = 0; i < sch.length; i++) {
    var h0 = i === 0 ? 0.45 : Math.max(sch[i - 1].d, sch[i].a - 0.8),
      h1 = sch[i].a;
    if (lt < h0) return { st: 1.2 * i };
    if (lt < h1) return { st: 1.2 * i + (lt - h0) / (h1 - h0) };
  }
  return { st: 1.2 * sch.length };
}
/** The readout over the empty top of the timeline: the last stop reached and the years since
    1775, ticking over as the run arrives at each stop. */
function readout(lt, sch) {
  var i = -1;
  while (i + 1 < sch.length && lt >= sch[i + 1].a) i++;
  if (i < 0) return '';
  var s = STOPS[i],
    k = smooth((lt - sch[i].a) / 0.15);
  var y = 75.5;
  var face = G(
    txt(SAFE.cx, y + 7.5, s.place + ' \u00b7 ' + s.year, {
      size: 5.6,
      serif: true,
      weight: 600,
      fill: C.soft,
    }) +
      txt(SAFE.cx, y + 19.5, String(s.n), { size: 13, serif: true, weight: 700, fill: C.accent }),
    { o: i === 0 ? 1 : k, ty: (1 - k) * 2.5 },
  );
  return G(
    panel(SAFE.cx - 36, y, 72, 28) +
      face +
      txt(SAFE.cx, y + 25.4, 'years since 1775', { size: 4.6, weight: 600, fill: C.soft }),
    { o: P(lt, sch[0].a, 0.25) },
  );
}
SCENES[3] = function (lt, q) {
  var down = smooth(lt / 0.4);
  var sch = schedule(q),
    pa = panAt(lt, sch);
  var ph = phone(CAM_LINE, [
    { id: 'pan', st: pa.st },
    { id: 'reader75', st: 1.1, c: CAM_READ_MID, ty: down * (SCR.h + 6), op: down < 1 ? 1 : 0 },
  ]);
  var ro = readout(lt, sch);
  return overPhone(ph, ro, lt, q, '');
};

/* ---------- Scene 4: the order (back to 1921, the reader under the quotation) ---------- */
var QUOTE = [
  '“This high name of distinction and soldierly',
  'repute we who are Marines today have received',
  'from those who preceded us…”',
];
SCENES[4] = function (lt, q) {
  var bp = clamp01((lt - 0.05) / 1.6);
  var tUp = Math.max(1.9, q('message') - 0.2);
  var up = smooth((lt - tUp) / 0.6);
  var tS = Math.max(tUp + 0.8, q('still') - 0.5);
  var sh = smooth((lt - tS) / 0.6);
  var c = CAM_LINE;
  var rc = camMix(CAM_READ_MID, CAM_READ_ALL, smooth((lt - tUp - 0.3) / 0.8));
  var dy = (1 - up) * (SCR.h + 6);
  var ph = phone(c, [
    { id: 'back21', st: 1.6 * smoothstep(bp) },
    { id: 'reader21', st: 1.1, c: rc, ty: dy, op: up > 0 ? 1 : 0 },
  ]);
  // Lejeune lit as he's named, then his order, until the reader covers them.
  var marks = '';
  if (bp >= 1 && up < 1)
    marks += G(
      ring(
        c.x(pxAt(V_1921, '1920-07-01')),
        c.y(Y_LINE),
        P(lt, Math.max(1.7, q('lejeune') - 0.1), 0.35),
      ) +
        ring(
          c.x(pxAt(V_1921, '1921-11-01')),
          c.y(Y_LINE),
          P(lt, Math.max(1.9, q('ordered') - 0.1), 0.35),
        ),
      { o: 1 - P(lt, tUp, 0.15) },
    );
  var s = lerp(1, 0.6, sh);
  var keep = G(ph + clipScr(marks), { s: s, cx: SAFE.cx, cy: SCR.y + SCR.h });
  // The quotation over the space the phone leaves above it, line by line with the narration.
  var cues = [q('this'), q('have'), q('from'), q('us') + 0.35];
  var card = '';
  if (sh > 0.001) {
    var y0 = 69.5;
    card += G(panel(18, y0, 124, 50), { o: sh });
    QUOTE.forEach(function (l, i) {
      card += rise(
        txt(SAFE.cx, y0 + 11 + i * 9.2, l, { size: 5.9, serif: true, weight: 600 }),
        P(lt, cues[i] - 0.15, 0.4),
        2,
      );
    });
    card += rise(
      txt(SAFE.cx, y0 + 43, '— John A. Lejeune, 1921', {
        size: 5.4,
        serif: true,
        weight: 600,
        fill: C.soft,
        italic: true,
      }),
      P(lt, cues[3] - 0.3, 0.4),
      2,
    );
  }
  return { svg: card, keep: keep, keepIn: true, keepOut: true };
};

/* ---------- Scene 5: hand it on (1945 to today, the cake ceremony and the 250th) ---------- */
SCENES[5] = function (lt, q) {
  var sh = 1 - smooth(lt / 0.5);
  var mp = clamp01((lt - 0.1) / 2);
  var c = camMix(CAM_LINE, CAM_HIGH, smooth((lt - 0.2) / 1.6));
  var ph = phone(c, [
    { id: 'modern', st: 2 * mp },
    { id: 'reader21', st: 1.1, c: CAM_READ_ALL, ty: (1 - sh) * (SCR.h + 6), op: sh > 0 ? 1 : 0 },
  ]);
  ph = G(ph, { s: lerp(1, 0.6, sh), cx: SAFE.cx, cy: SCR.y + SCR.h });
  var t52 = Math.max(2.2, q('cake') - 0.1),
    t25 = Math.max(t52 + 0.8, q('title') - 0.1),
    tK = Math.max(t25 + 0.6, q('keep') - 0.15);
  var x52 = c.x(pxAt(V_MOD, '1952-01-01')),
    x25 = c.x(pxAt(V_MOD, '2025-11-10')),
    y = c.y(Y_LINE);
  var marks = mp >= 1 ? glow(x52, y, P(lt, t52, 0.4)) + glow(x25, y, P(lt, t25, 0.4)) : '';
  // What each lit moment is, over the empty picture above the line, until the lesson comes.
  var gone = 1 - P(lt, tK - 0.3, 0.3);
  var tags = '';
  [
    [x52, '1952 · the cake ceremony is made standard', t52, 88, 'start'],
    [x25, '2025 · the Corps turns 250', t25, 100, 'end'],
  ].forEach(function (m) {
    var p = P(lt, m[2], 0.35) * gone;
    if (p <= 0.001 || mp < 1) return;
    var w = textWidth(m[1], 5.6) + 8;
    var x0 =
      m[4] === 'start' ? Math.max(STRIPES.x0 + 4, m[0] - 6) : Math.min(SAFE.x1 - 2, m[0] + 6) - w;
    tags += rise(
      rect(x0, m[3] - 6.2, w, 9, C.card, { rx: 2.5, stroke: C.select, sw: 0.8, op: 0.95 }) +
        txt(x0 + w / 2, m[3] + 0.6, m[1], { size: 5.6, weight: 700 }),
      p,
      3,
    );
  });
  // The lesson, rising over the same empty space.
  var lesson = '';
  var lp = P(lt, tK, 0.45);
  if (lp > 0.001) {
    var y0 = 76;
    lesson += G(panel(20, y0, 120, 34), { o: lp });
    [
      ['Keep faith with those', q('keep')],
      ['who came before you.', q('came')],
      ['Then hand it on.', q('hand')],
    ].forEach(function (l, i) {
      lesson += rise(
        txt(SAFE.cx, y0 + 10.5 + i * 9.4, l[0], {
          size: 8,
          serif: true,
          weight: 700,
          fill: i === 2 ? C.accent : C.text,
        }),
        P(lt, Math.max(tK, l[1] - 0.15), 0.4),
        2,
      );
    });
  }
  return overPhone(ph, clipScr(marks + tags) + lesson, lt, q, '');
};

/* ---------- Scene 6: the end (the whole line again, then the end card) ---------- */
function endCard(p) {
  var y = 112;
  return rise(
    wordmark(SAFE.cx, y, 13) +
      txt(SAFE.cx, y + 22, 'Happy 251st birthday, Marines', {
        size: 9.5,
        weight: 700,
        serif: true,
      }) +
      txt(SAFE.cx, y + 36, 'Free and open source', { size: 6, fill: C.soft, weight: 600 }) +
      rect(SAFE.cx - 66, y + 42, 132, 25, C.card, { rx: 5, stroke: C.line }) +
      txt(SAFE.cx, y + 52.5, 'timescale.info/athan/usmc', {
        size: 6.6,
        mono: true,
        fill: C.accent,
        weight: 600,
      }) +
      txt(SAFE.cx, y + 61.5, 'github.com/openchronology/timeline-app', {
        size: 5,
        mono: true,
        fill: C.soft,
        weight: 500,
      }) +
      txt(SAFE.cx, y + 79, 'Not affiliated with or endorsed by the U.S. Marine Corps', {
        size: 4.9,
        fill: C.soft,
        weight: 600,
      }) +
      txt(SAFE.cx, y + 85.5, 'or the Department of Defense', {
        size: 4.9,
        fill: C.soft,
        weight: 600,
      }),
    p,
    8,
  );
}
SCENES[6] = function (lt, q) {
  var hp = clamp01((lt - 0.05) / 1.4);
  var c = camMix(CAM_HIGH, CAM_LINE, smooth(hp));
  var away = smooth((lt - 1.5) / 0.5);
  var ph = G(phone(c, [{ id: 'home', st: 1.5 * smoothstep(hp) }]), {
    o: 1 - away,
    s: lerp(1, 0.6, away),
    cx: SAFE.cx,
    cy: SCR.y + SCR.h / 2,
    ty: -away * 26,
  });
  var e = P(lt, 1.9, 0.7);
  return { svg: endCard(e), keep: ph, keepIn: true, noHeadline: true };
};
