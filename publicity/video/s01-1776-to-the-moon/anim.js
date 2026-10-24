// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 1, 1776 to one second on the Moon (publicity/shorts/1-1776-to-the-moon.md): the
   United States sample in the real editor on a phone (shots.json), and one continuous zoom
   across Scenes 1–3 from the whole of it (1762–2016 on screen) to the night of 20–21 July
   1969, with a span readout counting down and the two Apollo 11 times called out; then the
   phone shrinks away for the end card. Scenes are pure functions of scene time lt;
   q("word") is when that word is said. */

/* The phone: its place on the stage, and a captured pixel (1080 × 1440) in stage units. */
var PX = 15,
  PY = 74,
  PW = 130,
  PK = PW / 1080;
function sx(x) {
  return PX + x * PK;
}
function sy(y) {
  return PY + y * PK;
}

/* The camera. capture.mjs records two joined zooms into one fixed point, each steady in log
   span: "zoom" (14 s, 1762–2016 down to three days) and "settle" (5.9 s, three days down to
   the night of the landing). Since the view depends only on its span, the scenes play them
   back along their own curve of log span over the short's time, so the zoom runs on the
   narration's words: the decades, one summer, one week, one night. */
var LN_ALL = Math.log(8020000000), // the whole sample, as Scene 1 shows it
  LN_MID = Math.log(259200), // where "zoom" hands over to "settle": three days
  LN_END = Math.log(39858); // the night: 20:17:40 and 02:56:15 a fifth in from each side
var ZOOM_DUR = 14,
  SETTLE_DUR = 5.9;
/* [time in the short (s), log span]: still to the end of the first sentence, fastest through
   the summer and the week, easing to a stop as the first time is said. */
var CAM = [
  [3.9, LN_ALL],
  [7.3, Math.log(10 * 31557600) + 0.05],
  [8.6, Math.log(31557600) - 0.3],
  [9.6, Math.log(604800) + 0.2],
  [10.35, Math.log(86400) - 0.02],
  [11.75, LN_END],
];
/* Monotone cubic (Fritsch–Carlson) slopes for CAM, flat at both ends. */
var CAM_M = (function () {
  var n = CAM.length,
    d = [],
    m = [];
  for (var i = 0; i < n - 1; i++) d.push((CAM[i + 1][1] - CAM[i][1]) / (CAM[i + 1][0] - CAM[i][0]));
  m[0] = 0;
  m[n - 1] = 0;
  for (var j = 1; j < n - 1; j++)
    m[j] = d[j - 1] * d[j] <= 0 ? 0 : (2 * d[j - 1] * d[j]) / (d[j - 1] + d[j]);
  return m;
})();
/** Log span on screen at time t of the short. */
function camLn(t) {
  if (t <= CAM[0][0]) return CAM[0][1];
  var n = CAM.length;
  if (t >= CAM[n - 1][0]) return CAM[n - 1][1];
  for (var i = 0; i < n - 1; i++)
    if (t <= CAM[i + 1][0]) {
      var h = CAM[i + 1][0] - CAM[i][0],
        u = (t - CAM[i][0]) / h,
        u2 = u * u,
        u3 = u2 * u;
      return (
        (2 * u3 - 3 * u2 + 1) * CAM[i][1] +
        (u3 - 2 * u2 + u) * h * CAM_M[i] +
        (-2 * u3 + 3 * u2) * CAM[i + 1][1] +
        (u3 - u2) * h * CAM_M[i + 1]
      );
    }
  return CAM[n - 1][1];
}
/** The captured frame for log span ln: [shot, shot time]. */
function camShot(ln) {
  if (ln >= LN_MID) return ['zoom', ((LN_ALL - ln) / (LN_ALL - LN_MID)) * ZOOM_DUR];
  return ['settle', Math.min(SETTLE_DUR, ((LN_MID - ln) / (LN_MID - LN_END)) * SETTLE_DUR)];
}
/** The phone at time t of the short, where the camera is then. */
function zoomPhone(t) {
  var s = camShot(camLn(t));
  return phoneShot(PX, PY, PW, s[0], s[1]);
}
function sceneStart(id) {
  for (var i = 0; i < TL.scenes.length; i++) if (TL.scenes[i].id === id) return TL.scenes[i].start;
  return 0;
}

/* The span readout: the sample's years until "Watch" (show 0), then the step the view has
   narrowed to (show 1), popping as it gets there. */
var STEPS = [
  ['230 years', Infinity],
  ['10 years', Math.log(10 * 31557600)],
  ['1 year', Math.log(31557600)],
  ['1 week', Math.log(604800)],
  ['1 night', Math.log(86400)],
];
var STEP_AT = STEPS.map(function (s) {
  if (s[1] === Infinity) return -1;
  for (var t = CAM[0][0]; t < CAM[CAM.length - 1][0]; t += 0.01) if (camLn(t) <= s[1]) return t;
  return Infinity;
});
function readout(t, show) {
  var k = 0;
  for (var i = 0; i < STEPS.length; i++) if (t >= STEP_AT[i]) k = i;
  var tick = STEP_AT[k] < 0 ? 1 : ease((t - STEP_AT[k]) / 0.25);
  var w = 86,
    x = SAFE.cx - w / 2,
    y = 115;
  var arrows =
    '<path d="M' +
    (x + 6) +
    ' ' +
    (y + 10) +
    'l3.4 -2.6v5.2z M' +
    (x + w - 6) +
    ' ' +
    (y + 10) +
    'l-3.4 -2.6v5.2z" fill="' +
    C.accent +
    '"/>';
  return G(
    card(x, y, w, 20, { rx: 10, stroke: C.accent }) +
      arrows +
      G(
        pop(
          txt(SAFE.cx, y + 14, STEPS[k][0], { size: 11, serif: true, weight: 700, fill: C.text }),
          tick,
          SAFE.cx,
          y + 10,
        ),
        { o: show },
      ) +
      G(
        txt(SAFE.cx, y + 14, '1775 – 2008', { size: 11, serif: true, weight: 700, fill: C.accent }),
        {
          o: 1 - show,
        },
      ),
    {},
  );
}

/* The night's two moments, where the settled shot shows them (the canvas is inset a little
   from the screen's edges). */
var EAGLE = [sx(242), sy(758)],
  STEP = [sx(837), sy(758)];
/** A ring around a moment on the phone, pulsing once as p rises. */
function ring(at, p) {
  if (p <= 0.001) return '';
  var pulse = clamp01((p - 0) * 1.6);
  return (
    '<circle cx="' +
    at[0] +
    '" cy="' +
    at[1] +
    '" r="3.6" fill="none" stroke="' +
    C.select +
    '" stroke-width="1.1" opacity="' +
    p.toFixed(3) +
    '"/>' +
    (pulse < 1
      ? '<circle cx="' +
        at[0] +
        '" cy="' +
        at[1] +
        '" r="' +
        (3.6 + 6 * pulse).toFixed(2) +
        '" fill="none" stroke="' +
        C.select +
        '" stroke-width="0.8" opacity="' +
        (1 - pulse).toFixed(3) +
        '"/>'
      : '')
  );
}
/** A callout under a moment: a tick down from the bands and the time in the look's serif. */
function callout(at, time, p) {
  var y0 = sy(880);
  return G(
    drawPath(
      'M' + at[0] + ' ' + y0 + 'V' + (y0 + 5),
      5,
      p,
      'stroke="' + C.accent + '" stroke-width="0.8"',
    ) + txt(at[0], y0 + 14, time, { size: 8, serif: true, weight: 700, fill: C.accent }),
    { o: p, ty: (1 - p) * 3 },
  );
}
/** The two callouts, the gap between them, and the rings: d is how far each has drawn. */
function nightMarks(l, f, gap) {
  var y = sy(880) + 22;
  var g0 = EAGLE[0] + 6,
    g1 = STEP[0] - 6;
  return (
    ring(EAGLE, l) +
    ring(STEP, f) +
    callout(EAGLE, '20:17:40 UTC', l) +
    callout(STEP, '02:56:15 UTC', f) +
    G(
      drawPath(
        'M' + g0 + ' ' + (y - 2.4) + 'H' + g1,
        g1 - g0,
        gap,
        'stroke="' + C.soft + '" stroke-width="0.6" stroke-dasharray="1.6 1.4"',
      ) +
        rect(SAFE.cx - 19, y - 6.6, 38, 8.4, C.ground, { rx: 2 }) +
        txt(SAFE.cx, y, '+6 h 38 min', { size: 6.5, serif: true, weight: 700, fill: C.text }),
      { o: gap },
    )
  );
}

/* Scene 1: the whole sample on the phone, its years over it, complete at frame 0; the line
   lit on "one line";
   the zoom begins as the sentence ends. */
SCENES[1] = function (lt, q) {
  var t = sceneStart(1) + lt;
  var sweep = P(lt, q('one'), 0.6) * (1 - P(lt, CAM[0][0] - sceneStart(1), 0.3));
  var x0 = sx(45),
    x1 = sx(1035),
    y = sy(758);
  var lit =
    sweep > 0.001
      ? drawPath(
          'M' + x0 + ' ' + y + 'H' + x1,
          x1 - x0,
          P(lt, q('one'), 0.6),
          'stroke="' +
            C.select +
            '" stroke-width="2.2" stroke-linecap="round" opacity="' +
            (0.6 * sweep).toFixed(3) +
            '"',
        )
      : '';
  return { keep: zoomPhone(t) + lit + readout(t, 0), keepIn: true, keepOut: true };
};

/* Scene 2: the zoom runs toward 1969; the readout counts the span down. */
SCENES[2] = function (lt, q) {
  var t = sceneStart(2) + lt;
  var show = P(lt, q('watch') - 0.1, 0.4);
  // The readout gives way to the night as the last step is reached.
  var gone = P(lt, q.dur - 0.5, 0.4);
  return {
    keep: zoomPhone(t) + G(readout(t, show), { o: 1 - gone, ty: -4 * gone }),
    keepIn: true,
    keepOut: true,
  };
};

/* Scene 3: the zoom eases to a stop on the night; each time is called out as it's said. */
SCENES[3] = function (lt, q) {
  var t = sceneStart(3) + lt;
  var l = P(lt, q('2017'), 0.6),
    f = P(lt, q('first'), 0.6),
    gap = P(lt, q('six'), 0.9);
  return { keep: zoomPhone(t) + nightMarks(l, f, gap), keepIn: true, keepOut: true };
};

/* Scene 4: the phone shrinks and lifts; the end card rises and holds. */
SCENES[4] = function (lt, q) {
  var go = P(lt, q('that') - 0.5, 0.9);
  var w = lerp(PW, 44, go),
    x = lerp(PX, SAFE.cx - 22, go),
    y = lerp(PY, 48, go);
  var marks = G(nightMarks(1, 1, 1), { o: 1 - clamp01(go * 3) });
  var phone = phoneShot(x, y, w, 'settle', SETTLE_DUR);
  return {
    keep: phone + marks,
    keepIn: true,
    svg: shortEnd(P(lt, q('that') - 0.1, 0.7), 'Any span of time, one line'),
    noHeadline: true,
  };
};
