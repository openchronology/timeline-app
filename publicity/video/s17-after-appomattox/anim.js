// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 17, The Civil War didn't end at Appomattox (publicity/shorts/17-after-appomattox.md): a
   vertical short for history feeds. The Civil War sample (samples/civil-war.ochx) in the real
   editor on a phone, captured in shots.json: April 1865 around Lee's surrender; a widening view
   with Separate by tags on surrender, where the later surrenders keep coming; a zoom into
   Juneteenth and Stand Watie; a long pan across an empty summer and autumn to the CSS
   Shenandoah at Liverpool, which opens in the reader; the band After Appomattox across 211
   days; and the end card. The phone's camera stays close on the track that matters, so the
   app's own labels read. Scenes are pure functions of scene time lt; q("word") is when that
   word is said. */

/* ---------- the phone, with a camera on the captured frame ---------- */
/* The phone's screen on the stage, and a camera on the shot (1080 × 4500 px: a tall window, so
   the separated tracks keep the editor's full label size): zoom z about the shot pixel (fx, fy),
   which sits at the screen's centre. */
var SCR = { x: 8, y: 80, w: 144, h: 98 };
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
  var sh = (typeof SHOTS !== 'undefined' && SHOTS[id]) || { width: 360, height: 1500 };
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
    rect(SCR.x - b, SCR.y - b, SCR.w + 2 * b, SCR.h + 2 * b, '#15191c', { rx: r + b }) +
    '<defs><clipPath id="scr-clip">' +
    rect(SCR.x, SCR.y, SCR.w, SCR.h, '#000', { rx: r }) +
    '</clipPath></defs>' +
    '<g clip-path="url(#scr-clip)">' +
    rect(SCR.x, SCR.y, SCR.w, SCR.h, bg || '#f3ead7');
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
/* The canvas runs from shot x 58 to 1019 across the view. Separated on surrender, the tagged
   track's line is at y 2287 and its band After Appomattox at 2378; the heading "Separated by
   tags · surrender" is at y 515 of the separated shots. Unseparated, April's line is at 2430.
   In the reader, its title is at 190–350, the notes at 640–1100, Sources and Related to below.
   Times are the sample's, at UTC−5. */
function day(s) {
  return Date.parse(s + 'T00:00:00-05:00') / 86400000;
}
function pxAt(view, s) {
  var l = day(view[0]),
    r = day(view[1]);
  return 58 + (961 * (day(s) - l)) / (r - l);
}
var V_MID = ['1865-03-25', '1865-07-01'],
  V_JUNE = ['1865-05-25', '1865-07-05'],
  V_WIDE = ['1865-03-15', '1865-12-20'];
var Y_LINE = 2287,
  Y_BAND = 2378,
  Y_BAR = 515;

/* The cameras: April unseparated; the surrender track; the reader's top (title, date, tags and
   notes) and its foot (Sources and Related to). */
var CAM_APR = pcam(1.05, 540, 2480);
var CAM_SEP = pcam(1.05, 540, 2310);
var CAM_READ = pcam(0.95, 540, 540);
var CAM_READ_FOOT = pcam(0.95, 540, 1300);

/** A ring that draws attention to (x, y), growing in with p. */
function ring(x, y, p, r) {
  if (p <= 0.001) return '';
  r = r || 4.4;
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
/** A callout under the phone, centred at x, popping in with p. */
var CO_Y = 196;
function callout(x, s, p, size) {
  if (p <= 0.001) return '';
  size = size || 10;
  var w = textWidth(s, size) + 16;
  return pop(
    rect(x - w / 2, CO_Y - size - 1.5, w, size + 7, C.card, { rx: 4, stroke: C.line, sw: 0.7 }) +
      txt(x, CO_Y + 0.6, s, { size: size, weight: 700, serif: true }),
    p,
    x,
    CO_Y - 2,
  );
}
/** A bracket under the phone from xa to xb, drawn by p, with its label popping in. */
var BR_Y = 190;
function bracket(xa, xb, label, p) {
  if (p <= 0.001) return '';
  var y = BR_Y;
  var d = 'M' + xa + ' ' + (y - 3.5) + 'V' + y + 'H' + xb + 'V' + (y - 3.5);
  var s = drawPath(d, xb - xa + 7, smooth(p * 1.4), 'stroke="' + C.text + '" stroke-width="1"');
  var lp = clamp01((p - 0.3) / 0.3);
  s += pop(
    txt((xa + xb) / 2, y + 13, label, { size: 11, weight: 700, serif: true }),
    lp,
    (xa + xb) / 2,
    y + 9,
  );
  return s;
}
/** A band outlined from left to right, the outline growing with p. */
function outline(x0, x1, y, p, h) {
  if (p <= 0.001) return '';
  h = h || 5.4;
  var w = (x1 - x0 + 2) * smooth(p);
  return (
    rect(x0 - 1, y - h / 2, w, h, C.select, { rx: 1.6, op: 0.18 }) +
    rect(x0 - 1, y - h / 2, w, h, 'none', { rx: 1.6, stroke: C.select, sw: 1 })
  );
}
/** A scene whose phone holds across the cuts: the overlays fade with the scene, the phone
    doesn't. */
function overPhone(ph, over, lt, q, svg) {
  var f = Math.min(P(lt, 0, 0.2), 1 - clamp01((lt - (q.dur - 0.15)) / 0.15));
  return { svg: svg || '', keep: ph + G(over, { o: f }), keepIn: true, keepOut: true };
}

/* ---------- Scene 1: the date you know (already whole at frame 0) ---------- */
SCENES[1] = function (lt, q) {
  var ph = phone(CAM_APR, [{ id: 'april', st: 0 }]);
  // The callout is there from the first frame, and pulses once as "Appomattox" is said.
  var t = q('appomattox');
  var pulse = lt > t ? Math.sin(Math.PI * clamp01((lt - t) / 0.5)) : 0;
  var co = G(callout(80, 'April 9, 1865', 1), { s: 1 + 0.12 * pulse, cx: 80, cy: CO_Y - 2 });
  return { svg: co, keep: ph, keepIn: true, keepOut: true };
};

/* ---------- Scene 2: they keep coming (wider, and separated on surrender) ---------- */
SCENES[2] = function (lt, q) {
  var tW = 1.3;
  var wp = clamp01((lt - 0.05) / (tW - 0.05));
  var tSep = Math.max(tW, q('separate') + 0.2);
  var x = P(lt, tSep, 0.5);
  var c = camMix(CAM_APR, CAM_SEP, smooth((lt - tSep) / 0.7));
  var ph = phone(c, [
    { id: 'widen', st: 2.5 * smooth(wp) },
    { id: 'sep', st: 0, op: x, ty: (1 - x) * 8 },
  ]);
  // The app's own "Separated by tags · surrender" bar, above the crop for the first second.
  var ba = P(lt, tSep, 0.3) * (1 - P(lt, tSep + 1.2, 0.4));
  var bar = '';
  if (ba > 0.001) {
    var bh = 15;
    var bc = pcam(1.05, 540, Y_BAR - (bh / 2 - SCR.h / 2) / ((1.05 * SCR.w) / SHOT_W));
    bar =
      '<defs><clipPath id="bar-clip">' +
      rect(SCR.x, SCR.y, SCR.w, bh, '#000') +
      '</clipPath></defs>' +
      G(
        '<g clip-path="url(#bar-clip)">' +
          shotImage('sep', 0, bc, 0, 1) +
          '</g>' +
          rect(SCR.x, SCR.y + bh - 0.4, SCR.w, 0.5, C.line),
        { o: ba },
      );
  }
  // Each surrender lights as it's named: Lee's as they lift, then Johnston, Taylor, Kirby Smith.
  var marks = '';
  if (lt >= tSep + 0.7) {
    [
      ['1865-04-09', tSep + 0.7],
      ['1865-04-26', q('johnston')],
      ['1865-05-04', q('taylor')],
      ['1865-06-02', q('kirby')],
    ].forEach(function (m) {
      marks += ring(c.x(pxAt(V_MID, m[0])), c.y(Y_LINE), P(lt, Math.max(m[1], tSep + 0.7), 0.35));
    });
  }
  return overPhone(ph, clipScr(bar + marks), lt, q, '');
};

/* ---------- Scene 3: Juneteenth (the zoom into late May – early July) ---------- */
SCENES[3] = function (lt, q) {
  var tZ = 1.8;
  var zp = clamp01((lt - 0.05) / (tZ - 0.05));
  var c = CAM_SEP;
  var ph = phone(c, [{ id: 'june', st: 3 * smooth(zp) }]);
  var t19 = q('19'),
    t23 = q('four');
  var marks = '';
  if (zp >= 1) {
    marks +=
      ring(c.x(pxAt(V_JUNE, '1865-06-19')), c.y(Y_LINE), P(lt, Math.max(t19, tZ), 0.35)) +
      ring(c.x(pxAt(V_JUNE, '1865-06-23')), c.y(Y_LINE), P(lt, Math.max(t23, tZ), 0.35));
  }
  var co = callout(52, 'June 19', P(lt, t19, 0.35)) + callout(108, 'June 23', P(lt, t23, 0.35));
  return overPhone(ph, clipScr(marks), lt, q, co);
};

/* ---------- Scene 4: a ship in Liverpool (the pan, then the reader) ---------- */
SCENES[4] = function (lt, q) {
  var tN = Math.max(2, q('november'));
  var pp = clamp01((lt - 0.05) / (tN - 0.05));
  var tUp = Math.max(tN + 1.2, q('raider') - 0.3);
  var up = smooth((lt - tUp) / 0.6);
  var foot = smooth((lt - (q('august') + 1)) / 0.8);
  var rc = camMix(CAM_READ, CAM_READ_FOOT, foot);
  var dy = (1 - up) * (SCR.h + 6);
  var ph = phone(CAM_SEP, [
    { id: 'pan', st: 4 * smoothstep(pp) },
    { id: 'reader', st: 1.1, c: rc, ty: dy, op: up > 0 ? 1 : 0 },
  ]);
  // The Shenandoah lit as it arrives, alone.
  var marks = '';
  if (pp >= 1 && up < 1)
    marks += G(
      ring(
        CAM_SEP.x(pxAt(['1865-10-17', '1865-11-27'], '1865-11-06')),
        CAM_SEP.y(Y_LINE),
        P(lt, tN, 0.35),
      ),
      { o: 1 - P(lt, tUp, 0.15) },
    );
  // "learned of the war's end only in August" underlined as "August" is said.
  var u = smooth(clamp01((lt - q('august')) / 0.7));
  if (u > 0 && up > 0)
    marks += rect(rc.x(52), rc.y(866) + dy, (rc.x(880) - rc.x(52)) * u, 0.9, C.select);
  var co = callout(80, 'Nov 6, 1865', P(lt, tN, 0.35) * (1 - P(lt, tUp, 0.3)));
  return overPhone(ph, clipScr(marks), lt, q, co);
};
function smoothstep(x) {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
}

/* ---------- Scene 5: 211 days (back to March – December, separated) ---------- */
SCENES[5] = function (lt, q) {
  var back = smooth((lt - 0.05) / 0.5);
  var c = CAM_SEP;
  var ph = phone(c, [
    { id: 'wide', st: 0, op: back },
    { id: 'reader', st: 1.1, c: CAM_READ_FOOT, op: 1 - back },
  ]);
  var xa = c.x(pxAt(V_WIDE, '1865-04-09')),
    xb = c.x(pxAt(V_WIDE, '1865-11-06'));
  var p = clamp01((lt - q('211')) / 1.6);
  var marks = lt > 0.5 ? outline(xa, xb, c.y(Y_BAND), p) : '';
  var n = Math.round(211 * ease(clamp01((p - 0.3) / 0.7)));
  var br = lt > 0.5 ? bracket(xa, xb, n + ' days', p) : '';
  return overPhone(ph, clipScr(marks), lt, q, br);
};

/* ---------- Scene 6: the end card ---------- */
SCENES[6] = function (lt, q) {
  var away = smooth((lt - 0.05) / 0.5);
  var ph = G(phone(CAM_SEP, [{ id: 'wide', st: 0 }]), {
    o: 1 - away,
    s: lerp(1, 0.6, away),
    cx: 80,
    cy: 129,
    ty: -away * 26,
  });
  var e = P(lt, 0.5, 0.7);
  return {
    svg: shortEnd(e, 'timescale.info/athan/us-civil-war'),
    keep: ph,
    keepIn: true,
    noHeadline: true,
  };
};
