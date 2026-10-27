// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 23, Nobody Left Behind (publicity/shorts/23-nobody-left-behind.md): the second Marine
   Corps lesson, bring your people home. The Marine Corps timeline (samples/usmc.ochx) in the
   real editor on a phone, captured narrow in shots.json: the Chosin Reservoir campaign, 20
   November – 31 December 1950, with the Army's Task Force Faith marked; a zoom into Fox
   Company's five nights at Toktong Pass, then its reader; Ray Davis's night march, opened from
   its group; the Hagaru-ri airstrip and a counter of the wounded flown out; Koto-ri and the
   seventy-eight miles to the sea; the lesson over the campaign; and the end card. Overlays sit
   over the empty top of the timeline or above the phone, never over the app's own text. Scenes
   are pure functions of scene time lt; q("word") is when that word is said. */

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
   labels sit in two rows above it (y 895–1050) and two below (1380–1490), the bands between
   (Korean War 1231, Chosin 1263, Task Force Faith 1293, Fox Company 1323). Above y 880 there's
   only the chapter's picture: the overlays go there. In the reader, the title is at y 190–350;
   a band's dates at 440 and its notes from 650; a moment's picture at 380–1300. */
function day(s) {
  return Date.parse(s + 'T00:00:00Z') / 86400000;
}
function pxAt(view, s) {
  var l = day(view[0]),
    r = day(view[1]);
  return 58 + (961 * (day(s) - l)) / (r - l);
}
var Y_LINE = 1143;
var V_COVER = ['1950-11-20', '1950-12-31'],
  V_FOX = ['1950-11-26', '1950-12-04'],
  V_AIR = ['1950-11-29', '1950-12-08'],
  V_ROAD = ['1950-11-25', '1950-12-28'];

/* The cameras: the timeline (the line a little below the middle, the empty picture above it),
   drifting in a little; the reader's top and its notes. */
var CAM_LINE = pcam(1.1, 540, 1120);
var CAM_DRIFT = pcam(1.15, 540, 1125);
var CAM_READ = pcam(1.1, 540, 650);
var CAM_NOTES = pcam(1.1, 540, 900);
var CAM_READ_M = pcam(1.0, 540, 760);

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

/** A chip at (x, y) (its text's baseline), anchored 'start', 'middle' or 'end', popping in
    with p. */
function chip2(x, y, s, p, o) {
  if (p <= 0.001) return '';
  o = o || {};
  var size = o.size || 6.2,
    w = textWidth(s, size) + 9;
  var x0 = o.anchor === 'start' ? x : o.anchor === 'end' ? x - w : x - w / 2;
  return rise(
    rect(x0, y - size - 1, w, size + 5, C.card, {
      rx: 2.5,
      stroke: o.stroke || C.accent,
      sw: 0.7,
    }) + txt(x0 + w / 2, y + 0.4, s, { size: size, weight: 700, fill: o.fill || C.text }),
    p,
    2.5,
  );
}
/** A bracket over the empty picture from xa to xb, its feet at y, drawn by p, its label
    above. */
function bracketUp(xa, xb, y, label, p, size) {
  if (p <= 0.001) return '';
  var d = 'M' + xa + ' ' + (y + 3.5) + 'V' + y + 'H' + xb + 'V' + (y + 3.5);
  var s = drawPath(d, xb - xa + 7, smooth(p * 1.4), 'stroke="' + C.select + '" stroke-width="1"');
  var lp = clamp01((p - 0.3) / 0.3);
  var cx = clamp(xa / 2 + xb / 2, STRIPES.x0 + 30, 150 - 30);
  return s + chip2(cx, y - 4.5, label, lp, { size: size || 6.4, fill: C.strong });
}
function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}
/** The phone, scaled s about the middle of its foot (for a card above it). */
function shrunk(ph, s) {
  return G(ph, { s: s, cx: SAFE.cx, cy: SCR.y + SCR.h });
}

/* ---------- Scene 1: the cover (the campaign, already whole at frame 0) ---------- */
/** The cover's marks; tp is how far the temperature chip is in. */
function cover(c, tp) {
  // The Army's Task Force Faith marked on its band: the campaign wasn't the Marines' alone.
  var xa = c.x(pxAt(V_COVER, '1950-11-27')),
    xb = c.x(pxAt(V_COVER, '1950-12-01'));
  var y = c.y(815);
  var tff =
    drawPath(
      'M' + xa + ' ' + (y + 3) + 'V' + y + 'H' + xb + 'V' + (y + 3),
      xb - xa + 7,
      1,
      'stroke="' + C.select + '" stroke-width="0.8"',
    ) +
    chip2(STRIPES.x0 + 5, y - 4, 'Task Force Faith (Army) · 11-27 → 12-01', 1, {
      anchor: 'start',
      size: 5.2,
    });
  var temp = chip2(150 - 6, c.y(700), '−36 °F', tp, {
    anchor: 'end',
    size: 9,
    fill: C.strong,
  });
  return tff + temp;
}
SCENES[1] = function (lt, q) {
  var d = smooth((lt - (q('below') + 0.3)) / 2) * 0.3;
  var c = camMix(CAM_LINE, CAM_DRIFT, d);
  var ph = phone(c, [{ id: 'cover', st: 0 }]);
  var sub = txt(SAFE.cx, 61.5, 'Chosin Reservoir · 1950', {
    size: 6.6,
    serif: true,
    weight: 600,
    fill: C.soft,
  });
  return {
    svg: sub,
    keep: ph + clipScr(cover(c, P(lt, q('below') - 0.25, 0.35))),
    keepIn: true,
    keepOut: true,
  };
};

/* ---------- Scene 2: the pass (the zoom into Fox Company's five nights, then its reader) ---------- */
SCENES[2] = function (lt, q) {
  var back = smooth(lt / 0.5);
  var c = camMix(camMix(CAM_LINE, CAM_DRIFT, 0.3), CAM_LINE, back);
  var tZ = Math.min(2.8, q('fox') - 0.2);
  var zp = clamp01((lt - 0.05) / (tZ - 0.05));
  var tUp = Math.max(q('nights') + 0.6, q('of') - 0.35);
  var up = smooth((lt - tUp) / 0.55);
  var rc = camMix(CAM_READ, CAM_NOTES, smooth((lt - q('220') + 0.3) / 0.8));
  var dy = (1 - up) * (SCR.h + 6);
  var ph = phone(c, [
    { id: 'zoomfox', st: 3 * zp },
    { id: 'rfox', st: 1.1, c: rc, ty: dy, op: up > 0 ? 1 : 0 },
  ]);
  var over = G(cover(c, 1), { o: 1 - P(lt, 0.1, 0.4) });
  if (zp >= 1 && up < 1) {
    var xa = c.x(pxAt(V_FOX, '1950-11-28')),
      xb = c.x(pxAt(V_FOX, '1950-12-02'));
    over += G(bracketUp(xa, xb, c.y(840), '5 nights', clamp01((lt - q('five') + 0.1) / 0.8), 7.5), {
      o: 1 - P(lt, tUp, 0.2),
    });
  }
  return overPhone(ph, clipScr(over), lt, q, '');
};

/* ---------- Scene 3: the night march (to 1 December, then Davis in the reader) ---------- */
SCENES[3] = function (lt, q) {
  var down = smooth(lt / 0.4);
  var pp = clamp01((lt - 0.3) / 1.2);
  var tUp = Math.max(1.6, q('davis') + 0.1);
  var up = smooth((lt - tUp) / 0.55);
  var tS = Math.max(tUp + 0.5, q(['eight', '8']) - 0.45);
  var sh = smooth((lt - tS) / 0.5);
  var ph = phone(CAM_LINE, [
    { id: 'davis', st: 1.5 * smoothstep(pp) },
    { id: 'rfox', st: 1.1, c: CAM_NOTES, ty: down * (SCR.h + 6), op: down < 1 ? 1 : 0 },
    { id: 'rdavis', st: 1.45, c: CAM_READ_M, ty: (1 - up) * (SCR.h + 6), op: up > 0 ? 1 : 0 },
  ]);
  var keep = shrunk(ph, lerp(1, 0.72, sh));
  // The march's three facts above the phone, as each is said.
  var y = 90,
    chips = '';
  if (sh > 0.001) {
    var parts = [
        ['8 miles', q(['eight', '8']), C.strong],
        ['night', q('night'), C.text],
        ['snowstorm', q('snow'), C.text],
      ],
      size = 7.4,
      gap = 3,
      ws = parts.map(function (m) {
        return textWidth(m[0], size) + 9;
      }),
      x = SAFE.cx - (ws[0] + ws[1] + ws[2] + 2 * gap) / 2;
    parts.forEach(function (m, i) {
      chips += chip2(x, y, m[0], P(lt, m[1] - 0.1, 0.3), {
        size: size,
        fill: m[2],
        anchor: 'start',
      });
      x += ws[i] + gap;
    });
  }
  return { svg: chips, keep: keep, keepIn: true, keepOut: true };
};

/* ---------- Scene 4: the airstrip (Hagaru-ri, and the wounded flown out) ---------- */
SCENES[4] = function (lt, q) {
  var sh = 1 - smooth(lt / 0.5);
  var pp = clamp01((lt - 0.3) / 1.4);
  var ph = phone(CAM_LINE, [
    { id: 'air', st: 1.5 * smoothstep(pp) },
    { id: 'rdavis', st: 1.45, c: CAM_READ_M, ty: (1 - sh) * (SCR.h + 6), op: sh > 0 ? 1 : 0 },
  ]);
  ph = shrunk(ph, lerp(1, 0.72, sh));
  var marks = '';
  var t1 = Math.max(1.8, q('hag') + 0.2);
  if (pp >= 1)
    marks += ring(CAM_LINE.x(pxAt(V_AIR, '1950-12-01')), CAM_LINE.y(Y_LINE), P(lt, t1, 0.35), 4);
  // The counter climbs over about three seconds to "4,000+" as the number is said.
  var tEnd = Math.max(t1 + 1, q('wounded')),
    tC = tEnd - 3;
  var cp = clamp01((lt - tC) / (tEnd - tC));
  var n = Math.round((4000 * ease(cp)) / 50) * 50;
  var y = 75.5,
    ro = '';
  var op = P(lt, Math.max(t1 - 0.2, tC - 0.3), 0.3);
  if (op > 0.001)
    ro = G(
      panel(SAFE.cx - 32, y, 64, 28) +
        txt(SAFE.cx, y + 7.5, 'Hagaru-ri airstrip · 12-01', {
          size: 5.4,
          serif: true,
          weight: 600,
          fill: C.soft,
        }) +
        txt(SAFE.cx, y + 19.5, n.toLocaleString('en-US') + (cp >= 1 ? '+' : ''), {
          size: 13,
          serif: true,
          weight: 700,
          fill: C.accent,
        }) +
        txt(SAFE.cx, y + 25.4, 'wounded flown out', { size: 4.8, weight: 600, fill: C.soft }),
      { o: op },
    );
  return overPhone(ph, clipScr(marks + ro), lt, q, '');
};

/* ---------- Scene 5: down the road (Koto-ri, and seventy-eight miles to the sea) ---------- */
SCENES[5] = function (lt, q) {
  var pp = clamp01((lt - 0.05) / 2);
  var c = CAM_LINE;
  var ph = phone(c, [{ id: 'road', st: 2 * smoothstep(pp) }]);
  var marks = '';
  if (pp >= 1) {
    marks += glow(c.x(pxAt(V_ROAD, '1950-12-08')), c.y(Y_LINE), P(lt, q('bury') - 0.1, 0.4));
    var xa = c.x(pxAt(V_ROAD, '1950-12-01')),
      xb = c.x(pxAt(V_ROAD, '1950-12-13'));
    marks += bracketUp(
      xa,
      xb,
      c.y(850),
      '78 miles to the sea',
      clamp01((lt - q('78') + 0.1) / 0.9),
      6.4,
    );
  }
  // The Koto-ri moment named over the picture as it brightens.
  marks += chip2(
    STRIPES.x0 + 5,
    c.y(690),
    '12-08 · 117 dead buried at Koto-ri',
    P(lt, q('bury'), 0.35) * (1 - P(lt, q('78') - 0.5, 0.3)),
    {
      anchor: 'start',
      size: 5.6,
    },
  );
  return overPhone(ph, clipScr(marks), lt, q, '');
};

/* ---------- Scene 6: bring them home (the campaign again, under the lesson) ---------- */
SCENES[6] = function (lt, q) {
  var pp = clamp01((lt - 0.05) / 1.4);
  var c = camMix(CAM_LINE, CAM_DRIFT, smooth((lt - 1.2) / 4));
  var sh = smooth((lt - 0.6) / 0.6);
  var ph = shrunk(phone(c, [{ id: 'cover6', st: 1.5 * smoothstep(pp) }]), lerp(1, 0.72, sh));
  var card = '';
  if (sh > 0.001) {
    var y0 = 66;
    card += G(panel(20, y0, 120, 31), { o: sh });
    [
      ['Bring your people home.', Math.max(0.7, q('bring') - 0.1), C.text],
      ['Nobody gets left behind.', q('nobody') - 0.1, C.accent],
    ].forEach(function (l, i) {
      card += rise(
        txt(SAFE.cx, y0 + 12 + i * 11, l[0], { size: 8.4, serif: true, weight: 700, fill: l[2] }),
        P(lt, l[1], 0.4),
        2,
      );
    });
  }
  return { svg: card, keep: ph, keepIn: true, keepOut: true };
};

/* ---------- Scene 7: the end (the whole line, then the end card) ---------- */
function endCard(p) {
  var y = 112;
  return rise(
    wordmark(SAFE.cx, y, 13) +
      txt(SAFE.cx, y + 22, 'Every Marine moment, one line', {
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
SCENES[7] = function (lt, q) {
  var back = 1 - smooth(lt / 0.5);
  var hp = clamp01((lt - 0.05) / 1.4);
  var c = camMix(CAM_DRIFT, CAM_LINE, smooth(hp));
  var away = smooth((lt - 1.5) / 0.5);
  var ph = G(shrunk(phone(c, [{ id: 'home', st: 1.5 * smoothstep(hp) }]), lerp(1, 0.72, back)), {
    o: 1 - away,
    s: lerp(1, 0.6, away),
    cx: SAFE.cx,
    cy: SCR.y + SCR.h / 2,
    ty: -away * 26,
  });
  var e = P(lt, 1.9, 0.7);
  return { svg: endCard(e), keep: ph, keepIn: true, noHeadline: true };
};
