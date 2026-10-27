// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 12, Closer to the Moon (publicity/shorts/12-closer-to-the-moon.md): the ancient Egypt
   sample in the real editor on a phone (shots.json). One camera runs through the short: from
   the whole line (2700 BCE to 2010 CE) into Khufu's reign and the Great Pyramid, out and across
   Egypt's history to Cleopatra's death, back out to the whole line, where the infographic layer
   draws the two spans and the 1969 pin (Apollo 11 isn't in the sample), then a slow zoom into
   the New Kingdom before the phone shrinks away for the end card. Scenes are pure functions of
   scene time lt; q("word") is when that word is said. */

/* The phone: only the timeline's canvas, cropped from the captured frame (1080 × 1800 px, a
   360 × 600 window at scale 3) so the app's labels read at a phone's size and the phone ends
   above the caption band. SCR is the screen on the stage; the crop starts at pixel row CROP. */
var SCR = { x: 5, y: 72, w: 150, h: 136 };
var SHOT_W = 1080,
  CROP = 590,
  K = SCR.w / SHOT_W;
function sx(px) {
  return SCR.x + px * K;
}
function sy(py) {
  return SCR.y + (py - CROP) * K;
}
function scene(id) {
  for (var i = 0; i < TL.scenes.length; i++) if (TL.scenes[i].id === id) return TL.scenes[i];
  return TL.scenes[0];
}
/* Where each captured shot starts in the short. shots.json was generated from the same
   narration timings: each shot is the camera's path from that moment, frame for frame. */
var S1 = scene(1);
var SHOT_AT = {
  pyramid: S1.start + S1.voice + S1.speech - 0.1,
  across: scene(3).start + 0.45,
  back: scene(4).start + 0.1,
  one: scene(5).start + 0.1,
};
/** The phone showing shot id at time t of the short, held on its first and last frames; r is
    its screen on the stage (SCR unless it's moving). */
function phone(id, t, r) {
  r = r || SCR;
  var k = r.w / SHOT_W,
    b = r.w * 0.033,
    rad = r.w * 0.06,
    sh = (typeof SHOTS !== 'undefined' && SHOTS[id]) || { width: 360, height: 600 };
  var clip = 'scr-' + id + '-' + Math.round(r.w * 10);
  return (
    rect(r.x - b - 0.8, r.y - b + 1.6, r.w + 2 * b + 1.6, r.h + 2 * b, '#000', {
      rx: rad + b,
      op: 0.22,
    }) +
    rect(r.x - b, r.y - b, r.w + 2 * b, r.h + 2 * b, '#15191c', { rx: rad + b }) +
    '<defs><clipPath id="' +
    clip +
    '">' +
    rect(r.x, r.y, r.w, r.h, '#000', { rx: rad }) +
    '</clipPath></defs><g clip-path="url(#' +
    clip +
    ')"><image href="' +
    shotFrame(id, Math.max(0, t - SHOT_AT[id])) +
    '" x="' +
    r.x.toFixed(2) +
    '" y="' +
    (r.y - CROP * k).toFixed(2) +
    '" width="' +
    r.w.toFixed(2) +
    '" height="' +
    ((r.w * sh.height) / sh.width).toFixed(2) +
    '"/></g>'
  );
}

/* The whole line as Scene 4 holds it: 1 January 2700 BCE to 1 January 2010 CE, drawn across
   the canvas from pixel 60 to 1020; the line itself at pixel row 1083. */
var SPAN_L = -147339388800,
  SPAN_R = 1262304000;
function spanX(sec) {
  return sx(60 + (960 * (sec - SPAN_L)) / (SPAN_R - SPAN_L));
}
var LINE_Y = sy(1083.5);
var X_PYRAMID = spanX(-143110800000), // 1 January 2566 BCE
  X_CLEOPATRA = spanX(-63058003200 - 61 * 86400), // 10 August 30 BCE (Gregorian)
  X_MOON = spanX(-14256000); // 20 July 1969

/* Scene 1: the whole line on the phone, the headline over it, complete at frame 0; the zoom
   begins as the sentence ends. */
SCENES[1] = function (lt) {
  // The headline is too long for the shared two lines in the look's serif: three, a little smaller.
  var head = ['Cleopatra lived closer', 'to the Moon landing than', 'to the Great Pyramid']
    .map(function (l, i) {
      return txt(SAFE.cx, 42 + i * 10.2, l, { size: 9.6, weight: 700, serif: C.serif });
    })
    .join('');
  return {
    keep: phone('pyramid', S1.start + lt),
    keepIn: true,
    keepOut: true,
    svg: head,
    noHeadline: true,
  };
};

/* Scene 2's callout, over the empty canvas above "Great Pyramid of Giza" (its moment at
   pixel 787, its label's top at row 845 in the settled shot): the estimate in the look's serif, a tick down to the app's own label. */
function pyramidCallout(p) {
  var x = sx(787),
    y = 91,
    w = 60,
    x0 = Math.min(x - w / 2, SCR.x + SCR.w - 4 - w);
  var y1 = sy(838);
  return G(
    card(x0, y - 9.5, w, 15, { rx: 3, stroke: C.accent }) +
      txt(x0 + w / 2, y + 0.6, 'about 2566 BCE', {
        size: 7.5,
        serif: true,
        weight: 700,
        fill: C.text,
      }) +
      drawPath(
        'M' + x + ' ' + (y + 5.5) + 'V' + y1,
        y1 - y - 5.5,
        p,
        'stroke="' + C.accent + '" stroke-width="0.7"',
      ),
    { o: p, ty: (1 - p) * 3 },
  );
}
/* Scene 2: the zoom settles on Khufu's reign; the callout draws in on "finished". */
SCENES[2] = function (lt, q) {
  var t = scene(2).start + lt;
  var p = P(lt, q('finished'), 0.6);
  var gone = P(lt, q.dur - 0.35, 0.3);
  return {
    keep: phone('pyramid', t) + G(pyramidCallout(p), { o: 1 - gone }),
    keepIn: true,
    keepOut: true,
  };
};

/* Scene 3's camera, as the generator of shots.json drew it (the "across" shot): a zoom out of
   the 26th century BCE, a pan from about 2250 to 330 BCE at a 1,300-year span, and a zoom in
   to Cleopatra's death, each eased and added together so the move is one. Only the centre is
   needed here, for the readout. */
var YR = 31556952;
var PYRAMID = -143110800000; // 1 January 2566 BCE
function bceSec(y) {
  var a = 1 - Math.ceil(y),
    f = Math.ceil(y) - y,
    d0 = new Date(0),
    d1 = new Date(0);
  d0.setUTCFullYear(a, 0, 1);
  d1.setUTCFullYear(a + 1, 0, 1);
  return d0.getTime() / 1000 + (f * (d1.getTime() - d0.getTime())) / 1000;
}
function camView(l, r) {
  return { c: (l + r) / 2, s: r - l };
}
var KHUFU2 = camView(bceSec(2580.7), bceSec(2561.3)),
  CLEO = camView(-63072950400, -63058003200),
  CAM_A = { c: bceSec(2250), s: 1300 * YR },
  CAM_B = { c: bceSec(330), s: 1300 * YR };
function camZoom(a, b, e) {
  var s = Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * e);
  return { c: b.c + ((a.c - b.c) * (s - b.s)) / (a.s - b.s), s: s };
}
function camWin(t, t0, t1) {
  return smooth((t - t0) / (t1 - t0));
}
/** The centre of the view at time t of the short, during Scene 3. */
function acrossCentre(t, q) {
  var s3 = scene(3).start,
    z1 = camZoom(KHUFU2, CAM_A, camWin(t, SHOT_AT.across, s3 + 2.4)),
    pc = CAM_A.c + (CAM_B.c - CAM_A.c) * camWin(t, s3 + 2.0, s3 + 4.6),
    z2 = camZoom(CAM_B, CLEO, camWin(t, s3 + 4.3, s3 + q('dies') - 0.5));
  return z1.c + (pc - CAM_A.c) + (z2.c - CAM_B.c);
}
/* Scene 3's readout: the years from the pyramid to the middle of the view, counting up as the
   view passes the periods the narration names (500 on "Middle Kingdom", over 1,000 on
   "Ramesses", 2,000 on "the Persians"), and 2,536 as it settles on Cleopatra's death. */
function readout(lt, q, show) {
  var t = scene(3).start + lt;
  var settled = lt >= q('dies') - 0.5;
  var years = settled
    ? 2536
    : Math.max(0, Math.round((acrossCentre(t, q) - PYRAMID) / YR / 10) * 10);
  var label = String(years).replace(/\B(?=(\d{3})+$)/, ',') + ' years';
  var tick = settled ? P(lt, q('dies') - 0.5, 0.3) : 1;
  var w = 70,
    x = SCR.x + SCR.w / 2 - w / 2,
    y = 77;
  return G(
    card(x, y, w, 22, { rx: 4, stroke: C.accent }) +
      pop(
        txt(SAFE.cx, y + 11, label, { size: 10, serif: true, weight: 700, fill: C.text }),
        lerp(0.6, 1, tick),
        SAFE.cx,
        y + 8,
      ) +
      txt(SAFE.cx, y + 18, 'after the Great Pyramid', { size: 5, fill: C.soft }),
    { o: show, ty: (1 - show) * 3 },
  );
}
/* Scene 3: out, across and in to Cleopatra's death, the readout ticking as it goes. */
SCENES[3] = function (lt, q) {
  var t = scene(3).start + lt;
  var show = P(lt, q('forward') + 0.2, 0.35) * (1 - P(lt, q.dur - 0.4, 0.3));
  return { keep: phone('across', t) + readout(lt, q, show), keepIn: true, keepOut: true };
};

/* Scene 4's brackets, drawn to the line's scale over the empty canvas above it, and the pin
   on the ruler at 1969. */
function bracket(x0, x1, name, years, p, p2) {
  var y = 98;
  var d = 'M' + x0 + ' ' + (y + 4) + 'V' + y + 'H' + x1 + 'V' + (y + 4);
  var cx = (x0 + x1) / 2;
  return (
    drawPath(d, x1 - x0 + 8, p, 'stroke="' + C.accent + '" stroke-width="0.9"') +
    G(
      txt(cx, y - 13.5, name, { size: 5.2, fill: C.soft, weight: 600 }) +
        txt(cx, y - 3.5, years, { size: 8.5, serif: true, weight: 700, fill: C.text }),
      { o: p2, ty: (1 - p2) * 2 },
    )
  );
}
function pin(p, label) {
  if (p <= 0.001) return '';
  var y = lerp(102, LINE_Y, p);
  return (
    '<line x1="' +
    X_MOON +
    '" y1="102" x2="' +
    X_MOON +
    '" y2="' +
    y.toFixed(2) +
    '" stroke="' +
    C.select +
    '" stroke-width="0.8" stroke-dasharray="1.4 1"/>' +
    '<circle cx="' +
    X_MOON +
    '" cy="' +
    y.toFixed(2) +
    '" r="2.2" fill="' +
    C.select +
    '" stroke="' +
    C.ground +
    '" stroke-width="0.6"/>' +
    G(
      txt(X_MOON - 3, 133, 'Apollo 11, 1969', {
        size: 5.4,
        anchor: 'end',
        weight: 700,
        fill: C.text,
      }),
      { o: label },
    )
  );
}
function spans(a, a2, b, b2, m, m2) {
  return (
    bracket(X_PYRAMID, X_CLEOPATRA - 0.8, 'Pyramid → Cleopatra', '~2,540 years', a, a2) +
    bracket(X_CLEOPATRA + 0.8, X_MOON, 'Cleopatra → Moon', '1,998 years', b, b2) +
    pin(m, m2)
  );
}
/* Scene 4: the zoom eases back out to the whole line and holds; the first bracket draws, the
   pin drops on "1969", the second, shorter bracket draws on "Cleopatra to the Moon". */
SCENES[4] = function (lt, q) {
  var t = scene(4).start + lt;
  var y69 = q('1969');
  var a = P(lt, y69 - 0.05, 0.6),
    a2 = P(lt, y69 + 0.25, 0.4),
    m = smooth((lt - y69 - 0.45) / 0.45),
    m2 = P(lt, y69 + 0.8, 0.3),
    b = P(lt, q('cleopatra'), 0.6),
    b2 = P(lt, q('under'), 0.4);
  var gone = P(lt, q.dur - 0.3, 0.3);
  return {
    keep: phone('back', t) + G(spans(a, a2, b, b2, m, m2), { o: 1 - gone }),
    keepIn: true,
    keepOut: true,
  };
};

/* Scene 5: the slow zoom back into Egypt's three thousand years. */
SCENES[5] = function (lt) {
  return { keep: phone('one', scene(5).start + lt), keepIn: true, keepOut: true };
};

/* Scene 6: the phone shrinks and lifts; the end card rises and holds. */
SCENES[6] = function (lt, q) {
  var t = scene(6).start + lt;
  var go = P(lt, q('that') - 0.5, 0.9);
  var w = lerp(SCR.w, 50, go),
    r = { x: lerp(SCR.x, SAFE.cx - 25, go), y: lerp(SCR.y, 58, go), w: w, h: (w * SCR.h) / SCR.w };
  return {
    keep: phone('one', t, r),
    keepIn: true,
    svg:
      shortEnd(P(lt, q('that') - 0.1, 0.7), 'Any span of time, one line') +
      rise(
        txt(SAFE.cx, 202, 'This timeline', { size: 5, fill: C.soft, weight: 600 }) +
          txt(SAFE.cx, 209.5, 'timescale.info/athan/ancient-egypt', {
            size: 5.6,
            mono: true,
            weight: 600,
            fill: C.accent,
          }),
        P(lt, q('that') + 0.2, 0.7),
        8,
      ),
    noHeadline: true,
  };
};
