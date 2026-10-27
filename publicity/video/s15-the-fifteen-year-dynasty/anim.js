// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 15, The dynasty that unified China lasted 15 years
   (publicity/shorts/15-the-fifteen-year-dynasty.md): a vertical short for history feeds. The
   China sample (samples/china.ochx) in the real editor on a phone, captured in shots.json: the
   Qin's fifteen years between the Warring States and the Han, with callouts on the moments of
   its rise and fall; a zoom out until the Qin is a sliver beside the Han, with two bars to one
   scale; a pan to the Sui and the Tang, the same shape again; then the end card. The camera
   stays close on the bands and labels, so the app's own labels read on a phone. Scenes are pure
   functions of scene time lt; q("word") is when that word is said. */

/* ---------- the phone, with a camera on the captured frame ---------- */
/* The captured frame is 1080 × 1440 px (a 360 × 480 window at scale 3); the timeline's canvas
   runs from row 545 to 1265, and across the view from pixel 60 to 1020. The camera zooms by z
   about shot pixel (fx, fy), which sits at the centre of the screen r; the screen shows only the
   canvas (no toolbar, bounds or footer). */
var SCR = { x: 8, y: 75, w: 144, h: 98 };
var SHOT_W = 1080;
var CAM = { z: 1.3, fx: 555, fy: 985 };
function scene(id) {
  for (var i = 0; i < TL.scenes.length; i++) if (TL.scenes[i].id === id) return TL.scenes[i];
  return TL.scenes[0];
}
/* Each shot starts at its scene's start (shots.json is generated from these timings). */
var SHOT_AT = { qin: scene(1).start, out: scene(3).start, pan: scene(4).start };
/** Stage x and y of shot pixel (px, py) on screen r. */
function kOf(r) {
  return (CAM.z * r.w) / SHOT_W;
}
function sx(px, r) {
  r = r || SCR;
  return r.x + r.w / 2 + (px - CAM.fx) * kOf(r);
}
function sy(py, r) {
  r = r || SCR;
  return r.y + r.h / 2 + (py - CAM.fy) * kOf(r);
}
/** The phone showing shot id at time t of the short, its screen r (SCR unless it's moving). */
function phone(id, t, r) {
  r = r || SCR;
  var k = kOf(r),
    b = r.w * 0.032,
    rad = r.w * 0.055,
    sh = (typeof SHOTS !== 'undefined' && SHOTS[id]) || { width: 360, height: 480 };
  return (
    rect(r.x - b - 0.8, r.y - b + 1.6, r.w + 2 * b + 1.6, r.h + 2 * b, '#000', {
      rx: rad + b,
      op: 0.22,
    }) +
    rect(r.x - b, r.y - b, r.w + 2 * b, r.h + 2 * b, '#15191c', { rx: rad + b }) +
    '<defs><clipPath id="scr-clip">' +
    rect(r.x, r.y, r.w, r.h, '#000', { rx: rad }) +
    '</clipPath></defs><g clip-path="url(#scr-clip)">' +
    rect(r.x, r.y, r.w, r.h, '#f3ead7') +
    '<image href="' +
    shotFrame(id, Math.max(0, t - SHOT_AT[id])) +
    '" x="' +
    sx(0, r).toFixed(2) +
    '" y="' +
    sy(0, r).toFixed(2) +
    '" width="' +
    (SHOT_W * k).toFixed(2) +
    '" height="' +
    ((SHOT_W * k * sh.height) / sh.width).toFixed(2) +
    '"/></g>'
  );
}
function clipScr(inner) {
  return inner ? '<g clip-path="url(#scr-clip)">' + inner + '</g>' : '';
}

/* ---------- where things are in the shots ---------- */
/** 1 January of historical year y (−221 for 221 BCE), proleptic Gregorian, in seconds. */
function sec(y) {
  var d = new Date(0);
  d.setUTCFullYear(y < 0 ? y + 1 : y, 0, 1);
  return d.getTime() / 1000;
}
function V(a, b) {
  return [sec(a), sec(b)];
}
/* The views, as shots.json has them. */
var QIN0 = V(-280, -150),
  QIN1 = V(-268, -138);
/** The view of the "qin" shot at time t of the short: held through Scene 1, then a linear
    drift right across Scene 2. */
function qinView(t) {
  var s2 = scene(2),
    a = scene(1).dur + 0.2,
    b = s2.start + s2.dur - 0.2;
  var p = clamp01((t - a) / (b - a));
  return [lerp(QIN0[0], QIN1[0], p), lerp(QIN0[1], QIN1[1], p)];
}
/** Shot pixel x of historical year y in view v. */
function pxAt(v, y) {
  return 60 + (960 * (sec(y) - v[0])) / (v[1] - v[0]);
}
/* Rows in the shot: the first band row (Qin, Han), the label row above the line ("Qin unifies
   China") and the two below ("3 moments", "Battle of Gaixia"); each label's title, with its
   date under it. */
var Y_BAND = 995,
  ROW_UP = 770,
  ROW_DN1 = 1095,
  ROW_DN2 = 1192;

/** A rounded outline about shot rect (cx ± w/2, y0..y1), lit by p. */
function hilite(cx, w, y0, y1, p) {
  if (p <= 0.001) return '';
  var x0 = sx(cx - w / 2),
    x1 = sx(cx + w / 2),
    a = sy(y0),
    b = sy(y1),
    g = lerp(2.5, 0, p);
  return rect(x0 - g, a - g, x1 - x0 + 2 * g, b - a + 2 * g, 'none', {
    rx: 2,
    stroke: C.select,
    sw: 1,
    op: p,
  });
}

/* ---------- Scene 1: fifteen years ---------- */
/** The Qin band in view v, glowing by g. */
function qinGlow(v, g, a, b, row) {
  if (g <= 0.001) return '';
  var x0 = sx(pxAt(v, a === undefined ? -221 : a)),
    x1 = sx(pxAt(v, b === undefined ? -206 : b)),
    y = sy(row || Y_BAND);
  return G(
    rect(x0 - 1.2, y - 2.8, x1 - x0 + 2.4, 5.6, 'none', { rx: 1.6, stroke: C.select, sw: 1 }),
    { o: g },
  );
}
function counter(o) {
  return G(txt(SAFE.cx, 203, '15 years', { size: 20, weight: 700, serif: C.serif, fill: C.text }), {
    o: o,
  });
}
SCENES[1] = function (lt, q) {
  var t = scene(1).start + lt;
  // One pulse as the sentence ends.
  var tp = q.end - 0.35;
  var g = P(lt, tp, 0.35) * (1 - P(lt, tp + 0.7, 0.5));
  return {
    keep: phone('qin', t) + clipScr(qinGlow(qinView(t), g)) + counter(1),
    keepIn: true,
    keepOut: true,
  };
};

/* ---------- Scene 2: the First Emperor ---------- */
/* The callouts, one at a time in a card under the phone, each drawn to its moment's label:
   [cue, date line, the line under it (with its own cue), the label's year, its row, its width
   in shot pixels]. */
var CARD_Y = 182,
  CARD_H = 26;
function callouts(q) {
  return [
    {
      t: q(['221', 'two']),
      head: '221 BCE · one empire',
      sub: 'one script, one coinage, one measure',
      subT: q('script'),
      year: -221,
      row: ROW_UP,
      w: 190,
    },
    { t: q('dies'), head: '210 BCE · he dies', year: -210, row: ROW_DN1, w: 140, lx: -64 },
    {
      t: q('revolts'),
      head: '209 BCE · the first revolt',
      year: -210,
      row: ROW_DN1,
      w: 140,
      lx: -64,
    },
    { t: q('gone'), head: '202 BCE · Han', year: -202, row: ROW_DN2, w: 170 },
  ];
}
function calloutCard(c, lt, inP, outP, v) {
  var o = inP * (1 - outP);
  if (o <= 0.001) return { card: '', mark: '' };
  var cx = pxAt(v, c.year);
  var x = sx(cx + (c.lx || 0));
  var sp = c.sub ? P(lt, c.subT, 0.35) : 0;
  var cardS =
    card(14, CARD_Y, 132, CARD_H, { rx: 4, stroke: C.accent }) +
    txt(SAFE.cx, CARD_Y + (c.sub ? 10.5 : 16.2), c.head, {
      size: 9,
      weight: 700,
      serif: C.serif,
      fill: C.text,
    }) +
    (c.sub
      ? G(txt(SAFE.cx, CARD_Y + 20.5, c.sub, { size: 6.4, weight: 600, fill: C.soft }), {
          o: sp,
          ty: (1 - sp) * 2,
        })
      : '');
  // The leader: from the card's top up to the label's box (above it for a label above the line).
  var yTop = c.row - 26,
    yBot = c.row + 50;
  var y1 = sy(yBot);
  var lead = drawPath(
    'M' + x.toFixed(2) + ' ' + CARD_Y + 'V' + y1.toFixed(2),
    CARD_Y - y1,
    clamp01(inP * 1.2),
    'stroke="' + C.select + '" stroke-width="0.6"',
  );
  return {
    card: G(cardS, { o: o, ty: (1 - inP) * 3 }),
    mark: G(lead + hilite(cx, c.w, yTop, yBot, clamp01((inP - 0.3) / 0.7)), { o: o }),
  };
}
SCENES[2] = function (lt, q) {
  var t = scene(2).start + lt;
  var v = qinView(t);
  var cs = callouts(q);
  var cards = '',
    marks = '';
  cs.forEach(function (c, i) {
    var next = cs[i + 1];
    var inP = P(lt, c.t - 0.1, 0.35),
      outP = next ? P(lt, next.t - 0.15, 0.2) : P(lt, q.dur - 0.3, 0.25);
    var r = calloutCard(c, lt, inP, outP, v);
    cards += r.card;
    marks += r.mark;
  });
  // The counter from Scene 1 gives way to the first callout.
  var cOut = 1 - P(lt, cs[0].t - 0.4, 0.3);
  return {
    keep: phone('qin', t) + counter(cOut) + clipScr(marks) + cards,
    keepIn: true,
    keepOut: true,
  };
};

/* ---------- the bars, to one scale (Scenes 3 and 4) ---------- */
/* 421 years (the Han) across BAR_X0–BAR_X1. */
var BAR_X0 = 14,
  BAR_X1 = 146,
  BAR_H = 9;
function barW(years) {
  return ((BAR_X1 - BAR_X0) * years) / 421;
}
/** A bar of `years` at row y, grown by p, labelled inside when it's long, else after it. */
function bar(y, years, label, col, p) {
  if (p <= 0.001) return '';
  var w = Math.max(0.6, barW(years) * ease(p));
  var inside = barW(years) > 60;
  var lab = inside
    ? txt(BAR_X0 + 4, y + 6.6, label, { size: 6.8, weight: 700, anchor: 'start', fill: C.card })
    : txt(BAR_X0 + w + 3, y + 6.6, label, {
        size: 6.8,
        weight: 700,
        anchor: 'start',
        fill: C.text,
      });
  return rect(BAR_X0, y, w, BAR_H, col, { rx: 1.6 }) + G(lab, { o: clamp01((p - 0.3) * 2.5) });
}
var DYNASTY = '#1f3a5f';
var BAR_Y1 = 184,
  BAR_Y2 = 197;

/* ---------- Scene 3: then four hundred ---------- */
SCENES[3] = function (lt, q) {
  var t = scene(3).start + lt;
  var qp = P(lt, 0.25, 0.5);
  var hp = clamp01((lt - q('about') + 0.1) / 1.1);
  var bars =
    bar(BAR_Y1, 15, 'Qin · 15 years', DYNASTY, qp) +
    bar(BAR_Y2, 421, 'Han · ~400 years', DYNASTY, hp);
  var gone = P(lt, q.dur - 0.3, 0.25);
  return {
    keep:
      phone('out', t) +
      clipScr(qinGlow(V(-290, 70), P(lt, 2.7, 0.4) * (1 - gone))) +
      G(bars, { o: 1 - gone }),
    keepIn: true,
    keepOut: true,
  };
};

/* ---------- Scene 4: and again ---------- */
SCENES[4] = function (lt, q) {
  var t = scene(4).start + lt;
  var sp = clamp01((lt - q(['thirty', '37']) + 0.1) / 0.6);
  var tp = clamp01((lt - q('tang') + 0.05) / 1.1);
  var bars =
    bar(BAR_Y1, 37, 'Sui · 37 years', DYNASTY, sp) +
    bar(BAR_Y2, 289, 'Tang · ~290 years', DYNASTY, tp);
  var gone = P(lt, q.dur - 0.3, 0.25);
  return {
    keep:
      phone('pan', t) +
      clipScr(qinGlow(V(540, 940), P(lt, q('sui'), 0.4) * (1 - gone), 581.17, 618, 1024)) +
      G(bars, { o: 1 - gone }),
    keepIn: true,
    keepOut: true,
  };
};

/* ---------- Scene 5: the line, and the end card ---------- */
SCENES[5] = function (lt, q) {
  var t = scene(5).start + lt;
  var go = P(lt, 0.15, 0.9);
  var w = lerp(SCR.w, 56, go),
    r = { x: lerp(SCR.x, SAFE.cx - 28, go), y: lerp(SCR.y, 64, go), w: w, h: (w * SCR.h) / SCR.w };
  var e = P(lt, 0.45, 0.7);
  return {
    keep: phone('pan', t, r),
    keepIn: true,
    svg:
      shortEnd(e, '') +
      rise(
        txt(SAFE.cx, 150, 'Seven thousand years of China, one line', {
          size: 8,
          weight: 700,
          serif: C.serif,
        }),
        e,
        8,
      ) +
      rise(
        txt(SAFE.cx, 202, 'This timeline', { size: 5, fill: C.soft, weight: 600 }) +
          txt(SAFE.cx, 209.5, 'timescale.info/athan/china', {
            size: 5.6,
            mono: true,
            weight: 600,
            fill: C.accent,
          }),
        P(lt, 0.75, 0.7),
        8,
      ),
    noHeadline: true,
  };
};
