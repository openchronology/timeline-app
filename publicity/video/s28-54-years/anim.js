// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 28, Neural Networks Waited 54 Years (publicity/shorts/28-54-years.md): the history of
   AI timeline (samples/ai.ochx) on a phone, captured narrow in shots.json, in the Neural look:
   the cover, the neural-network thread separated from the rest (1958 → 1969, then quiet), the
   revival and the long wait counted in years, AlexNet's 2012 win with its error rates against
   the runner-up's, and the ten years on to ChatGPT, then the end card. The phone and its camera
   follow Short 23's; overlays sit above and below the phone, never over the app's own text.
   Scenes are pure functions of scene time lt; q("word") is when that word is said. */

/* ---------- the phone, with a camera on the captured frame ---------- */
/* The phone's screen on the stage, and a camera on the shot (1080 × 1920 px, a 360 × 640
   window at scale 3): zoom z about the shot pixel (fx, fy), which sits at the screen's centre. */
var SCR = { x: 12, y: 76, w: 156, h: 106 };
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
/* The whole timeline (its line at shot y 1140), and the two separated tracks (y 1030–1730). */
var CAM_U = pcam(1.0, 540, 1150);
var CAM_S = pcam(1.12, 540, 1378);
/** One shot layer's image through camera c. */
function shotImage(id, st, c, op) {
  var sh = (typeof SHOTS !== 'undefined' && SHOTS[id]) || { width: 360, height: 640 };
  var hpx = (SHOT_W * sh.height) / sh.width;
  return (
    '<image href="' +
    shotFrame(id, st) +
    '" x="' +
    c.x(0).toFixed(2) +
    '" y="' +
    c.y(0).toFixed(2) +
    '" width="' +
    (SHOT_W * c.k).toFixed(2) +
    '" height="' +
    (hpx * c.k).toFixed(2) +
    '" opacity="' +
    op.toFixed(3) +
    '"/>'
  );
}
/** The phone showing shot id at shot time st through camera c. */
function phone(c, id, st) {
  var b = 4.6,
    r = 8;
  return (
    rect(SCR.x - b - 0.8, SCR.y - b + 1.6, SCR.w + 2 * b + 1.6, SCR.h + 2 * b, '#000', {
      rx: r + b,
      op: 0.3,
    }) +
    rect(SCR.x - b, SCR.y - b, SCR.w + 2 * b, SCR.h + 2 * b, '#15191c', {
      rx: r + b,
      stroke: C.line,
      sw: 0.6,
    }) +
    '<defs><clipPath id="scr-clip">' +
    rect(SCR.x, SCR.y, SCR.w, SCR.h, '#000', { rx: r }) +
    '</clipPath></defs><g clip-path="url(#scr-clip)">' +
    rect(SCR.x, SCR.y, SCR.w, SCR.h, C.ground) +
    shotImage(id, st, c, 1) +
    '</g>'
  );
}
/** A chip at (x, y) (its text's baseline), anchored 'start', 'middle' or 'end', rising in with p. */
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
/** The phone holds across cuts; the overlays fade with their scene. */
function held(ph, over, lt, q, first) {
  var f = Math.min(first ? 1 : P(lt, 0, 0.2), 1 - clamp01((lt - (q.dur - 0.15)) / 0.15));
  return { svg: '', keep: ph + G(over, { o: f }), keepIn: true, keepOut: true };
}
/* The row under the phone, above the captions. */
var ROW = 199;
/** The years counter under the headline. */
function counter(n, p) {
  return chip2(SAFE.cx, 64, n + ' years since 1958', p, { size: 6.4, fill: C.strong });
}

/* ---------- Scene 1: the cover ---------- */
SCENES[1] = function (lt, q) {
  var ph = phone(CAM_U, 'cover', 0);
  var sub = txt(SAFE.cx, ROW + 1, '1958 → 2012', { size: 8, weight: 700, fill: C.accent });
  return held(ph, sub, lt, q, true);
};

/* ---------- Scene 2: the thread separated (the shot zooms to 1940–1992, then separates) ---------- */
SCENES[2] = function (lt, q) {
  var st = Math.min(4, lt * 1.1);
  var c = camMix(CAM_U, CAM_S, smooth((st - 1.6) / 0.6));
  var ph = phone(c, 'sep', st);
  var over =
    chip2(SCR.x + 2, ROW + 1, '1958 · perceptron', P(lt, q('perceptron'), 0.4), {
      anchor: 'start',
      size: 5.6,
    }) +
    chip2(SCR.x + SCR.w - 2, ROW + 1, '1969 → 1980 · 11 quiet years', P(lt, q('moved'), 0.4), {
      anchor: 'end',
      size: 5.6,
      stroke: C.arc,
    });
  return held(ph, over, lt, q);
};

/* ---------- Scene 3: the revival, and the years running up ---------- */
SCENES[3] = function (lt, q) {
  var span = Math.max(1, q.dur - 0.6);
  var st = 4 * smooth(lt / span);
  var ph = phone(CAM_S, 'revival', st);
  var t86 = q(['1986', 'nineteen']);
  var n = Math.round(lerp(28, 54, clamp01((lt - t86) / (q.end - t86))));
  var over =
    counter(n, P(lt, t86, 0.4)) +
    chip2(SCR.x + 2, ROW + 1, '1986 · backpropagation', P(lt, t86, 0.4), {
      anchor: 'start',
      size: 5.6,
    }) +
    chip2(SCR.x + SCR.w - 2, ROW + 1, '1990s–2000s · SVMs preferred', P(lt, q('simpler'), 0.4), {
      anchor: 'end',
      size: 5.6,
      stroke: C.arc,
    });
  return held(ph, over, lt, q);
};

/* ---------- Scene 4: 2012 (the zoom to AlexNet; the error rates side by side) ---------- */
/** A bar of the error rate at row y: its label, a bar to scale (26.2% the longest), its value. */
function errBar(y, label, pct, col, p) {
  if (p <= 0.001) return '';
  var x0 = 52,
    full = 82;
  return G(
    txt(x0 - 3, y + 3.2, label, { size: 5.4, anchor: 'end', weight: 700 }) +
      rect(x0, y - 1, ((full * pct) / 26.2) * ease(p), 5, col, { rx: 1.2 }) +
      txt(x0 + ((full * pct) / 26.2) * ease(p) + 2, y + 3.2, pct.toFixed(1) + '%', {
        size: 5.4,
        anchor: 'start',
        weight: 700,
        fill: col,
      }),
    { o: Math.min(1, p * 2) },
  );
}
SCENES[4] = function (lt, q) {
  var tZ = Math.max(1.5, q('imagenet'));
  var st = 3.5 * smooth(lt / tZ);
  var ph = phone(CAM_S, 'alex', st);
  var over =
    counter(54, 1) +
    errBar(ROW - 7, 'AlexNet', 15.3, C.accent, P(lt, q(['fifteen', '15']), 0.6)) +
    errBar(ROW, 'Runner-up', 26.2, C.arc, P(lt, q(['twenty', '26']), 0.6)) +
    G(
      txt(SAFE.cx, ROW + 10.5, 'top-5 error, ImageNet 2012', {
        size: 4.6,
        fill: C.soft,
        weight: 600,
      }),
      { o: P(lt, q(['fifteen', '15']), 0.6) },
    );
  return held(ph, over, lt, q);
};

/* ---------- Scene 5: ten more years, then the end card ---------- */
function endCard(p) {
  var line = 'timescale.info/athan/artificial-intelligence';
  return rise(
    wordmark(SAFE.cx, 128, 13) +
      txt(SAFE.cx, 150, line, { size: 6.6, weight: 700, fill: C.accent }) +
      txt(SAFE.cx, 164, 'Free and open source', { size: 6, fill: C.soft, weight: 600 }) +
      rect(SAFE.cx - 66, 170, 132, 24, C.card, { rx: 5, stroke: C.line }) +
      addresses(SAFE.cx, 180, 5),
    p,
    8,
  );
}
SCENES[5] = function (lt, q) {
  var st = 3 * smooth(lt / 1.8);
  var c = camMix(CAM_S, CAM_U, smooth(lt / 0.4));
  var tAway = q('whole') - 0.2;
  var away = smooth((lt - tAway) / 0.6);
  var ph = G(phone(c, 'chat', st), {
    o: 1 - away,
    s: lerp(1, 0.6, away),
    cx: SAFE.cx,
    cy: SCR.y + SCR.h / 2,
    ty: -away * 26,
  });
  var chipT = chip2(SAFE.cx, 64, '2012 → 2022 · 10 years', P(lt, q(['ten', '10']), 0.4), {
    size: 6.4,
    fill: C.strong,
  });
  return {
    svg: G(chipT, { o: 1 - away }) + endCard(P(lt, tAway + 0.5, 0.7)),
    keep: ph,
    keepIn: true,
    noHeadline: true,
  };
};
