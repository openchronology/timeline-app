// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 16, Rome fell twice, 977 years apart (publicity/shorts/16-rome-fell-twice.md): a vertical
   short for history feeds. The ancient Rome sample (samples/rome.ochx) in the real editor on a
   phone, captured in shots.json: the Western Empire's stub beside the Eastern Empire's long band;
   a zoom into the division of 395; out and along to the deposition of 476, opened in the reader;
   out, along the purple band and in to the fall of Constantinople in 1453, opened in the reader;
   the whole line from 800 BCE with two brackets drawn to its scale; then the end card. The camera
   stays close on the bands and labels (and on the reader's text), so the app reads on a phone.
   shots.json is generated from shotSpec() below, from the same narration timings (see
   ROME_SHOTS). Scenes are pure functions of scene time lt; q("word") is when that word is said. */

/* ---------- the phone, with a camera on the captured frame ---------- */
/* The captured frame is 1080 × 1920 px (a 360 × 640 window at scale 3). The timeline's canvas runs
   across the view from pixel 60 to 1020; its line is at row 1140. A camera zooms by z about shot
   pixel (fx, fy), which sits at the centre of the screen r, so only the canvas shows (no toolbar,
   bounds or footer); on the reader it shows the reader's text at the screen's width. */
var SCR = { x: 5, y: 74, w: 150, h: 110 };
var SHOT_W = 1080,
  SHOT_H = 1920;
var CAM = { z: 1.35, fx: 540, fy: 1190 };
function scene(id) {
  for (var i = 0; i < TL.scenes.length; i++) if (TL.scenes[i].id === id) return TL.scenes[i];
  return TL.scenes[0];
}
function kOf(cam, r) {
  return (cam.z * r.w) / SHOT_W;
}
function sx(px, cam, r) {
  cam = cam || CAM;
  r = r || SCR;
  return r.x + r.w / 2 + (px - cam.fx) * kOf(cam, r);
}
function sy(py, cam, r) {
  cam = cam || CAM;
  r = r || SCR;
  return r.y + r.h / 2 + (py - cam.fy) * kOf(cam, r);
}
/** The reader's camera, at the screen's width, scrolled so shot row top is at the screen's top. */
function readerCam(top, r) {
  r = r || SCR;
  return { z: 1, fx: SHOT_W / 2, fy: top + (r.h / 2) * (SHOT_W / r.w) };
}
/* Where each captured shot starts in the short. */
function shotAt(id) {
  return {
    split: scene(1).start,
    west: scene(3).start,
    east: scene(4).start,
    line: scene(5).start,
  }[id];
}
/** Frame of shot id at time t of the short, through camera cam on screen r, dy lower. */
function shotImg(id, t, cam, r, dy) {
  r = r || SCR;
  var k = kOf(cam, r);
  return (
    '<image href="' +
    shotFrame(id, Math.max(0, t - shotAt(id))) +
    '" x="' +
    sx(0, cam, r).toFixed(2) +
    '" y="' +
    (sy(0, cam, r) + (dy || 0)).toFixed(2) +
    '" width="' +
    (SHOT_W * k).toFixed(2) +
    '" height="' +
    (SHOT_H * k).toFixed(2) +
    '"/>'
  );
}
/** The phone's bezel and screen r, showing inner (clipped to the screen). */
function phone(inner, r) {
  r = r || SCR;
  var b = r.w * 0.032,
    rad = r.w * 0.055,
    clip = 'scr-' + Math.round(r.w * 10);
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
    ')">' +
    rect(r.x, r.y, r.w, r.h, '#f3ead7') +
    inner +
    '</g>'
  );
}

/* ---------- times and views ---------- */
var YR = 31556952;
/** Seconds of 1 January of historical year y (−753 for 753 BCE; fractions run through the
    year), proleptic Gregorian, as the sample stores it. */
function sec(y) {
  var w = Math.floor(y),
    a = w < 0 ? w + 1 : w;
  var d0 = new Date(0),
    d1 = new Date(0);
  d0.setUTCFullYear(a, 0, 1);
  d1.setUTCFullYear(a + 1, 0, 1);
  return (d0.getTime() + (y - w) * (d1.getTime() - d0.getTime())) / 1000;
}
/* The camera shows shot pixels VIS_L–VIS_R across: a view is given by the years seen there. */
var VIS_L = CAM.fx - SHOT_W / 2 / CAM.z,
  VIS_R = CAM.fx + SHOT_W / 2 / CAM.z;
/** The stored view [left, right] that shows years a to b across the phone's screen. */
function seen(a, b) {
  var s = ((sec(b) - sec(a)) * 960) / (VIS_R - VIS_L);
  var l = sec(a) - ((VIS_L - 60) * s) / 960;
  return [Math.round(l), Math.round(l + s)];
}
function cs(v) {
  return { c: (v[0] + v[1]) / 2, s: v[1] - v[0] };
}
/** Stage x of time tm (seconds) in view v. */
function xAt(v, tm, r) {
  return sx(60 + (960 * (tm - v[0])) / (v[1] - v[0]), CAM, r);
}
/* The views. */
var V_SPLIT = seen(300, 1690), // the West's stub beside the East's long band
  V_395 = seen(394 + 10 / 12, 395 + 2.5 / 12), // November 394 – mid-March 395
  V_WEST = seen(392, 492),
  V_476 = seen(470, 480),
  V_OUT1 = seen(330, 1030),
  V_OUT2 = seen(820, 1520),
  V_1453 = seen(1440, 1460),
  V_LINE = seen(-800, 1560);
var T_DEPOSED = sec(476 + 247 / 366), // 4 September 476 (Julian), 5 September on the line
  T_DIVISION = sec(395 + 17 / 365);

/** A zoom between views a and b ({c, s}) at eased progress e: the span moves geometrically and
    the point that stays put is the one both views share, as capture.mjs moves between keys. */
function camZoom(a, b, e) {
  var s = Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * e);
  return { c: b.c + ((a.c - b.c) * (s - b.s)) / (a.s - b.s), s: s };
}
function win(t, t0, t1) {
  return smooth((t - t0) / (t1 - t0));
}

/* ---------- the shots, as shots.json has them ---------- */
var DENSITY = {
  do: 'eval',
  js: "(() => { const d = document.getElementById('density'); d.value = '12'; d.dispatchEvent(new Event('input', { bubbles: true })); d.dispatchEvent(new Event('change', { bubbles: true })); })()",
};
var NO_HOVER = {
  do: 'eval',
  js: "document.head.insertAdjacentHTML('beforeend', '<style>.edge-arc, .event-marker, .duration-band { pointer-events: none !important; }</style>')",
};
/* Scene-relative timings each shot's keys use (from the narration). */
function cues() {
  var s1 = scene(1),
    s2 = scene(2),
    s3 = scene(3),
    s4 = scene(4),
    s5 = scene(5);
  var q2 = function (w) {
    return qOf(s2, w);
  };
  var q3 = function (w) {
    return qOf(s3, w);
  };
  var q4 = function (w) {
    return qOf(s4, w);
  };
  return {
    // Scene 1 holds; the zoom into 395 begins as the sentence ends and stops before "split".
    zoom0: s1.voice + s1.speech - 0.15,
    zoom1: s1.dur + q2('split') - 0.35,
    split: s1.dur + s2.dur,
    // Scene 3: out and along to the 470s, in to 476; the reader opens on "Odoacer".
    w1: 2.0,
    w2: Math.max(3.4, q3('476') - 0.1),
    open476: q3('odo') - 0.25,
    west: s3.dur + 0.5,
    // Scene 4: out (by "fall"), along (to "years"), in (by "Constantinople"); the reader on "29th".
    e1: 0.3,
    e2: q4('fall') + 0.4,
    e3: q4('calling') - 0.2,
    e4: q4('thousand') + 0.5,
    e5: q4('until') - 0.6,
    e6: q4(['constantinople']) + 0.1,
    open1453: q4('29') - 0.3,
    east: s4.dur + 0.5,
    // Scene 5: the slow zoom out to the whole line.
    l1: 2.6,
    line: s5.dur + scene(6).dur,
  };
}
/** Word w's time in scene sc (as q() gives it), without the page's q. */
function qOf(sc, w) {
  var ws = typeof w === 'string' ? [w] : w;
  for (var i = 0; i < sc.words.length; i++)
    for (var j = 0; j < ws.length; j++)
      if (sc.words[i][0].indexOf(ws[j].toLowerCase()) === 0) return sc.voice + sc.words[i][1];
  return sc.voice;
}
/** The view of the "east" shot at shot time t: out, along the purple band and in, each eased
    and added together so the move is one. */
function eastView(t) {
  var k = cues();
  var a = cs(V_476),
    o1 = cs(V_OUT1),
    o2 = cs(V_OUT2),
    b = cs(V_1453);
  var z1 = camZoom(a, o1, win(t, k.e1, k.e3)),
    pc = o1.c + (o2.c - o1.c) * win(t, k.e2, k.e5 + 0.4),
    z2 = camZoom(o2, b, win(t, k.e5, k.e6));
  var c = z1.c + (pc - o1.c) + (z2.c - o2.c),
    s = (z1.s * z2.s) / o1.s;
  return [c - s / 2, c + s / 2];
}
function shotSpec() {
  var k = cues();
  var setup = [DENSITY, NO_HOVER, { do: 'viewMode', on: true }];
  var eastKeys = [];
  for (var t = 0; t <= k.e6 + 0.05; t += 0.1) {
    var v = eastView(t);
    eastKeys.push({
      t: Math.round(t * 10) / 10,
      view: [Math.round(v[0]), Math.round(v[1])],
      ease: 'linear',
    });
  }
  var r3 = function (x) {
    return Math.round(x * 1000) / 1000;
  };
  return {
    sample: '../samples/rome.ochx',
    size: [360, 640],
    scale: 3,
    shots: [
      {
        id: 'split',
        dur: r3(k.split),
        setup: setup,
        keys: [
          { t: 0, view: V_SPLIT },
          { t: r3(k.zoom0), view: V_SPLIT },
          { t: r3(k.zoom1), view: V_395 },
        ],
      },
      {
        id: 'west',
        dur: r3(k.west),
        setup: setup,
        keys: [
          { t: 0, view: V_395 },
          { t: 0.2, view: V_395 },
          { t: r3(k.w1), view: V_WEST },
          { t: r3(k.w2), view: V_476 },
        ],
        actions: [{ t: r3(k.open476), do: 'open', title: 'Romulus Augustulus deposed' }],
      },
      {
        id: 'east',
        dur: r3(k.east),
        setup: setup,
        keys: eastKeys,
        actions: [{ t: r3(k.open1453), do: 'open', title: 'Fall of Constantinople' }],
      },
      {
        id: 'line',
        dur: r3(k.line),
        setup: setup,
        keys: [
          { t: 0, view: V_1453 },
          { t: 0.3, view: V_1453 },
          { t: r3(k.l1), view: V_LINE },
        ],
      },
    ],
  };
}
if (typeof module !== 'undefined') module.exports = { shotSpec: shotSpec };

/* ---------- the callouts beside the phone ---------- */
var BELOW = SCR.y + SCR.h + 5; // the band between the phone and the captions
/** A card centred under the phone: a big serif line and a small line under it. */
function readoutCard(big, small, o, tick) {
  if (o <= 0.001) return '';
  var w = 92,
    h = small ? 23 : 17,
    x = SAFE.cx - w / 2,
    y = BELOW;
  return G(
    card(x, y, w, h, { rx: 4, stroke: C.accent }) +
      pop(
        txt(SAFE.cx, y + (small ? 10.8 : 11.9), big, {
          size: 10,
          serif: true,
          weight: 700,
          fill: C.text,
        }),
        lerp(0.6, 1, tick === undefined ? 1 : tick),
        SAFE.cx,
        y + 8,
      ) +
      (small ? txt(SAFE.cx, y + 18.6, small, { size: 5.2, fill: C.soft, weight: 600 }) : ''),
    { o: o, ty: (1 - o) * 3 },
  );
}
/** An outline about stage rect (x0..x1, y0..y1), lit by p. */
function hilite(x0, x1, y0, y1, p) {
  if (p <= 0.001) return '';
  var g = lerp(2.5, 0.6, p);
  return rect(x0 - g, y0 - g, x1 - x0 + 2 * g, y1 - y0 + 2 * g, 'none', {
    rx: 1.6,
    stroke: C.select,
    sw: 0.9,
    op: p,
  });
}

/* ---------- Scene 1: the hook ---------- */
SCENES[1] = function (lt) {
  var t = scene(1).start + lt;
  return { keep: phone(shotImg('split', t, CAM)), keepIn: true, keepOut: true };
};

/* ---------- Scene 2: the split ---------- */
/* The two bands that begin at the division, in the settled view (rows of the captured frame). */
var ROW_EAST = 1231,
  ROW_WEST = 1291;
SCENES[2] = function (lt, q) {
  var t = scene(2).start + lt;
  var p = P(lt, q('split') - 0.1, 0.4);
  var gone = P(lt, q.dur - 0.3, 0.25);
  var x0 = xAt(V_395, T_DIVISION),
    x1 = SCR.x + SCR.w - 1.5;
  var bands =
    hilite(x0, x1, sy(ROW_EAST - 10), sy(ROW_EAST + 10), p * (1 - gone)) +
    hilite(x0, x1, sy(ROW_WEST - 10), sy(ROW_WEST + 10), P(lt, q('western'), 0.4) * (1 - gone));
  return {
    keep:
      phone(shotImg('split', t, CAM) + bands) + readoutCard('395: two halves', '', p * (1 - gone)),
    keepIn: true,
    keepOut: true,
  };
};

/* ---------- the reader, sliding up over the timeline and down again ---------- */
/** Shot id at time t of the short with its reader opened at shot time open: the timeline under
    the camera, then the reader sliding up over it and scrolling down its text by scroll (0–1). */
var READ_TOP = 120,
  READ_END = 1100; // the reader's first and last rows to show at the screen's top
function withReader(id, t, open, scroll, r) {
  r = r || SCR;
  var st = t - shotAt(id);
  var slide = P(st, open, 0.45);
  if (slide <= 0) return shotImg(id, t, CAM, r);
  var cam = readerCam(lerp(READ_TOP, READ_END, smooth(scroll)), r);
  var before = shotImg(id, shotAt(id) + open - 0.04, CAM, r);
  return (
    (slide < 1 ? before : '') +
    sheet(
      shotImg(id, shotAt(id) + Math.max(st, open + 0.07), cam, r, (1 - slide) * r.h * 1.05),
      (1 - slide) * r.h * 1.05,
      r,
    )
  );
}
/** The reader's sheet img, its top dy below the screen's top: clipped there, with a shadow. */
function sheet(img, dy, r) {
  if (dy < 0.01) return img;
  var id = 'sheet-' + Math.round(dy * 100);
  return (
    rect(r.x, r.y + dy - 1.2, r.w, 1.2, '#000', { op: 0.12 }) +
    '<defs><clipPath id="' +
    id +
    '">' +
    rect(r.x, r.y + dy, r.w, r.h, '#000') +
    '</clipPath></defs><g clip-path="url(#' +
    id +
    ')">' +
    img +
    '</g>'
  );
}
/** The last reader frame of shot id sliding down off the screen by p, over inner. */
function readerAway(id, open, scroll, p, inner, r) {
  r = r || SCR;
  var cam = readerCam(lerp(READ_TOP, READ_END, smooth(scroll)), r);
  var sh = (typeof SHOTS !== 'undefined' && SHOTS[id]) || { frames: 1, fps: 30 };
  return (
    inner +
    (p < 1
      ? sheet(
          shotImg(id, shotAt(id) + (sh.frames - 1) / sh.fps, cam, r, smooth(p) * r.h * 1.05),
          smooth(p) * r.h * 1.05,
          r,
        )
      : '')
  );
}

/* ---------- Scene 3: the West ends ---------- */
SCENES[3] = function (lt, q) {
  var t = scene(3).start + lt;
  var k = cues();
  var scroll = clamp01((lt - k.open476 - 1.2) / Math.max(1, q.dur - k.open476 - 1.6));
  var o = P(lt, q('81') - 0.1, 0.35) * (1 - P(lt, q.dur - 0.3, 0.25));
  // The West's band in the 470s view, lit as the readout comes in.
  var lit = P(lt, Math.max(q('81'), k.w2), 0.4) * (1 - P(lt, k.open476 - 0.3, 0.3));
  var wb =
    lt < k.open476 + 0.5
      ? hilite(SCR.x + 1.5, xAt(V_476, T_DEPOSED), sy(ROW_WEST - 10), sy(ROW_WEST + 10), lit)
      : '';
  return {
    keep:
      phone(withReader('west', t, k.open476, scroll) + wb) +
      readoutCard('West: 81 years', '395 → 476', o, P(lt, q('81') - 0.1, 0.35)),
    keepIn: true,
    keepOut: true,
  };
};

/* ---------- Scene 4: the East goes on ---------- */
/** How far down its text the 1453 reader has scrolled at scene time lt. */
function eastScroll(lt) {
  return clamp01((lt - cues().open1453 - 0.5) / 2.2);
}
/** Scene 4's readout: the years from 476 to the middle of the view, in hundreds as the view
    travels, and 977 as it settles on 1453. */
function eastReadout(lt, q) {
  var k = cues();
  var v = eastView(lt);
  var settled = lt >= k.e6 - 0.3;
  var years = settled ? 977 : Math.max(0, Math.floor((cs(v).c - T_DEPOSED) / YR / 100) * 100);
  var label = (years < 100 ? '0' : String(years)) + ' years';
  var o = P(lt, k.e2, 0.35) * (1 - P(lt, q.dur - 0.3, 0.25));
  return readoutCard(
    label,
    'the East, after 476',
    years < 100 ? 0 : o,
    settled ? P(lt, k.e6 - 0.3, 0.3) : 1,
  );
}
SCENES[4] = function (lt, q) {
  var t = scene(4).start + lt;
  var k = cues();
  var away = P(lt, 0.05, 0.45);
  var scroll = eastScroll(lt);
  var inner = withReader('east', t, k.open1453, scroll);
  return {
    keep: phone(readerAway('west', k.open476, 1, away, inner)) + eastReadout(lt, q),
    keepIn: true,
    keepOut: true,
  };
};

/* ---------- Scene 5: one line ---------- */
/** A bracket from stage x0 to x1 under the phone, drawn by p, its labels in by p2. */
function bracket(x0, x1, range, years, p, p2) {
  var y = BELOW + 3;
  var d = 'M' + x0 + ' ' + (y - 4) + 'V' + y + 'H' + x1 + 'V' + (y - 4);
  var cx = (x0 + x1) / 2;
  return (
    drawPath(d, x1 - x0 + 8, p, 'stroke="' + C.accent + '" stroke-width="0.9"') +
    G(
      txt(cx, y + 7.5, range, { size: 5.2, fill: C.soft, weight: 600 }) +
        txt(cx, y + 16, years, { size: 8, serif: true, weight: 700, fill: C.text }),
      { o: p2, ty: (1 - p2) * 2 },
    )
  );
}
function brackets(lt, q, o) {
  var k = cues();
  var x753 = xAt(V_LINE, sec(-753 + 110 / 365)),
    x476 = xAt(V_LINE, T_DEPOSED),
    x1453 = xAt(V_LINE, sec(1453 + 158 / 365));
  var a = P(lt, k.l1 - 0.6, 0.6),
    b = P(lt, k.l1 + 0.2, 0.6);
  return G(
    // Ticks down from the phone's edge to the line's scale.
    bracket(x753, x476 - 0.8, '753 BCE → 476', '1,228 years', a, P(lt, k.l1 - 0.3, 0.4)) +
      bracket(x476 + 0.8, x1453, '476 → 1453', '977 years', b, P(lt, k.l1 + 0.5, 0.4)),
    { o: o },
  );
}
SCENES[5] = function (lt, q) {
  var t = scene(5).start + lt;
  var k = cues();
  var away = P(lt, 0.05, 0.45);
  return {
    keep:
      phone(
        readerAway('east', k.open1453, eastScroll(scene(4).dur), away, shotImg('line', t, CAM)),
      ) + brackets(lt, q, 1 - P(lt, q.dur - 0.3, 0.25)),
    keepIn: true,
    keepOut: true,
  };
};

/* ---------- Scene 6: the end ---------- */
SCENES[6] = function (lt, q) {
  var t = scene(6).start + lt;
  var go = P(lt, q('that') - 0.5, 0.9);
  var w = lerp(SCR.w, 56, go),
    r = { x: lerp(SCR.x, SAFE.cx - 28, go), y: lerp(SCR.y, 64, go), w: w, h: (w * SCR.h) / SCR.w };
  return {
    keep: phone(shotImg('line', t, CAM, r), r),
    keepIn: true,
    svg:
      shortEnd(P(lt, q('that') - 0.1, 0.7), 'Any span of time, one line') +
      rise(
        txt(SAFE.cx, 202, 'This timeline', { size: 5, fill: C.soft, weight: 600 }) +
          txt(SAFE.cx, 209.5, 'timescale.info/athan/rome', {
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
