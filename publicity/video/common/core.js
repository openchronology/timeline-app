// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* The drawing and timing core every video shares (after CMR Scanner's leadership-brief video):
   the looks, text and chips, eased transforms, word cues, the timeline motif (axis, moments,
   durations, summaries, relationships), icons, and renderAt(t), which draws the header,
   progress bar and the scene at time t. Each video's anim.js fills SCENES; build.py puts
   LOOK, this file, TL (timeline.js) and anim.js into page.html. Frames are pure functions of
   time, so any one can be rendered on its own. The stage is 320 × 180 units (1920 × 1080), or
   180 × 320 (1080 × 1920) for a short, whose frame is drawn by renderShort. */

/* ---------- looks ---------- */
var LOOKS = {
  // The app's own paper and green.
  paper: {
    ground: '#f5f6f1',
    card: '#ffffff',
    text: '#20372c',
    soft: '#6f7c71',
    line: '#cdd6c8',
    faint: '#e3e8de',
    accent: '#285742',
    moment: '#547d5b',
    strong: '#214f38',
    duration: '#73958b',
    durationText: '#213d33',
    arc: '#8aa79b',
    select: '#c59b22',
    amber: '#c98a12',
    red: '#c4463b',
    blue: '#3c6e9e',
    green: '#2f8a57',
    acts: ['#c59b22', '#547d5b', '#3c6e9e', '#285742', '#8a5aa8'],
    serif: false,
  },
  // Engineers' and administrators' tools: dark ink, mono highlights.
  terminal: {
    ground: '#0f1a16',
    card: '#16241e',
    text: '#e3ece6',
    soft: '#8ea597',
    line: '#2c3d35',
    faint: '#1d2d26',
    accent: '#5fcf8a',
    moment: '#7fbf95',
    strong: '#a8e6bf',
    duration: '#3f6b5a',
    durationText: '#e3ece6',
    arc: '#5f8f7b',
    select: '#e0a12a',
    amber: '#e0a12a',
    red: '#e0544a',
    blue: '#6aa8e0',
    green: '#5fcf8a',
    acts: ['#e0a12a', '#5fcf8a', '#6aa8e0', '#c08ae0', '#e0544a'],
    serif: false,
  },
  // History class: cream paper, navy ink, brick accents, a serif for dates.
  archive: {
    ground: '#f3ead7',
    card: '#fbf6ea',
    text: '#1f2a44',
    soft: '#6b6150',
    line: '#cbbd9e',
    faint: '#e6dbc2',
    accent: '#9c3b2a',
    moment: '#1f3a5f',
    strong: '#14263f',
    duration: '#b59a6b',
    durationText: '#1f2a44',
    arc: '#9c3b2a',
    select: '#c59b22',
    amber: '#b8860b',
    red: '#9c3b2a',
    blue: '#1f3a5f',
    green: '#4f6b3a',
    acts: ['#9c3b2a', '#1f3a5f', '#b8860b', '#4f6b3a', '#6b4f8a'],
    serif: true,
  },
  // A storyteller's tone: deep ink-blue, gold and ember.
  parchment: {
    ground: '#141b2e',
    card: '#1d2640',
    text: '#efe6cf',
    soft: '#a89f8a',
    line: '#3a4566',
    faint: '#222c4a',
    accent: '#d9a441',
    moment: '#d9a441',
    strong: '#f0c96a',
    duration: '#4a5a8a',
    durationText: '#efe6cf',
    arc: '#e0603a',
    select: '#f0c96a',
    amber: '#d9a441',
    red: '#e0603a',
    blue: '#7f9bd6',
    green: '#7fb88a',
    acts: ['#d9a441', '#e0603a', '#7f9bd6', '#7fb88a', '#c08ae0'],
    serif: true,
  },
  // A canon's keeper: deep forest green and gold.
  lore: {
    ground: '#10201a',
    card: '#17291f',
    text: '#ece4c8',
    soft: '#a7a58c',
    line: '#2f4a3a',
    faint: '#1a2f24',
    accent: '#c9a54a',
    moment: '#c9a54a',
    strong: '#e6c66a',
    duration: '#3d5a48',
    durationText: '#ece4c8',
    arc: '#c9a54a',
    select: '#e6c66a',
    amber: '#c9a54a',
    red: '#c96a4a',
    blue: '#6fa3d8',
    green: '#8fc46a',
    acts: ['#c9a54a', '#8fc46a', '#6fa3d8', '#c96a4a', '#a7a58c'],
    serif: true,
  },
  // Deep time: a night sky over the geological column.
  strata: {
    ground: '#0d1020',
    card: '#161a30',
    text: '#e8ecf5',
    soft: '#98a2b8',
    line: '#2e3552',
    faint: '#1a1f38',
    accent: '#7cc4e8',
    moment: '#e8ecf5',
    strong: '#ffffff',
    duration: '#3a4a7a',
    durationText: '#0d1020',
    arc: '#7cc4e8',
    select: '#f2d45c',
    amber: '#f2b84c',
    red: '#e8645a',
    blue: '#7cc4e8',
    green: '#8fd18a',
    acts: ['#ae027e', '#f73563', '#9ad9dd', '#67c5ca', '#f2f91d'],
    serif: false,
  },
};
var C = LOOKS[typeof LOOK === 'string' ? LOOK : 'paper'];
var FONT = "'Saira Condensed','Arial Narrow',sans-serif";
var MONO = "'IBM Plex Mono',ui-monospace,monospace";
var SERIF = "'EB Garamond',Georgia,serif";

/* ---------- timing ---------- */
function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function ease(x) {
  x = clamp01(x);
  return 1 - Math.pow(1 - x, 3);
}
/** Eased in and out, for camera moves. */
function smooth(x) {
  x = clamp01(x);
  return x * x * (3 - 2 * x);
}
/** Eased progress of an animation that starts at t0 and lasts d seconds. */
function P(lt, t0, d) {
  return ease((lt - t0) / (d || 0.5));
}
function lerp(a, b, p) {
  return a + (b - a) * p;
}
/** Interpolates a span geometrically, so a zoom feels steady across orders of magnitude. */
function lerpLog(a, b, p) {
  return Math.exp(lerp(Math.log(a), Math.log(b), p));
}
function norm(w) {
  return String(w)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Builds the cue lookup for one scene: q("word", n, after) is when the nth word starting with
    `word` (or one of several) is said, counting only words at or after scene time `after`. */
function cuesFor(sc) {
  var missing = [];
  function q(words, n, after) {
    var alts = Array.isArray(words) ? words : [words];
    n = n || 1;
    for (var a = 0; a < alts.length; a++) {
      var target = norm(alts[a]),
        seen = 0;
      for (var i = 0; i < sc.words.length; i++) {
        if (after !== undefined && sc.voice + sc.words[i][1] < after) continue;
        if (sc.words[i][0].indexOf(target) === 0 && ++seen === n) return sc.voice + sc.words[i][1];
      }
    }
    missing.push(sc.id + ':' + alts.join('|') + '#' + n);
    return sc.voice;
  }
  q.missing = missing;
  q.end = sc.voice + sc.speech;
  q.dur = sc.dur;
  return q;
}

/* ---------- groups and transforms ---------- */
function G(inner, o) {
  o = o || {};
  var op = o.o === undefined ? 1 : o.o;
  if (op <= 0.001 || !inner) return '';
  var tf = '';
  if (o.tx || o.ty) tf += 'translate(' + (o.tx || 0) + ' ' + (o.ty || 0) + ')';
  if (o.s !== undefined && o.s !== 1) {
    var cx = o.cx || 0,
      cy = o.cy || 0;
    tf += ' translate(' + cx + ' ' + cy + ') scale(' + o.s + ') translate(' + -cx + ' ' + -cy + ')';
  }
  return (
    '<g opacity="' +
    op.toFixed(3) +
    '"' +
    (tf ? ' transform="' + tf + '"' : '') +
    '>' +
    inner +
    '</g>'
  );
}
/** Fade and rise into place. */
function rise(inner, p, dy) {
  return G(inner, { o: p, ty: (1 - p) * (dy === undefined ? 6 : dy) });
}
/** Fade and grow from a point. */
function pop(inner, p, cx, cy) {
  return G(inner, { o: p, s: lerp(0.85, 1, p), cx: cx, cy: cy });
}
/** A path that draws itself; needs its length (an overestimate is fine). */
function drawPath(d, len, p, attrs) {
  len *= 1.3;
  return (
    '<path d="' +
    d +
    '" fill="none" stroke-dasharray="' +
    len +
    '" stroke-dashoffset="' +
    (len * (1 - p)).toFixed(2) +
    '" ' +
    attrs +
    '/>'
  );
}
function mix(c1, c2, p) {
  var a = parseInt(c1.slice(1), 16),
    b = parseInt(c2.slice(1), 16);
  var r = Math.round(lerp(a >> 16, b >> 16, p)),
    g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, p)),
    bl = Math.round(lerp(a & 255, b & 255, p));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}

/* ---------- text and chips ---------- */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
/** Text: o.size, o.weight, o.fill, o.anchor ('middle'), o.mono, o.serif, o.ls, o.italic. */
function txt(x, y, s, o) {
  o = o || {};
  var family = o.mono ? MONO : o.serif ? SERIF : FONT;
  return (
    '<text x="' +
    x +
    '" y="' +
    y +
    '" font-family="' +
    family +
    '" font-size="' +
    (o.size || 7) +
    '" font-weight="' +
    (o.weight || 600) +
    '" fill="' +
    (o.fill || C.text) +
    '" text-anchor="' +
    (o.anchor || 'middle') +
    '"' +
    (o.ls ? ' letter-spacing="' + o.ls + '"' : '') +
    (o.italic ? ' font-style="italic"' : '') +
    (o.op !== undefined ? ' opacity="' + o.op + '"' : '') +
    '>' +
    esc(s) +
    '</text>'
  );
}
/** Approximate width of text in Saira Condensed (mono is wider). */
function textWidth(s, size, mono) {
  return String(s).length * size * (mono ? 0.6 : 0.47);
}
function rect(x, y, w, h, fill, o) {
  o = o || {};
  return (
    '<rect x="' +
    x +
    '" y="' +
    y +
    '" width="' +
    w +
    '" height="' +
    h +
    '" rx="' +
    (o.rx || 0) +
    '" fill="' +
    fill +
    '"' +
    (o.stroke ? ' stroke="' + o.stroke + '" stroke-width="' + (o.sw || 0.6) + '"' : '') +
    (o.op !== undefined ? ' opacity="' + o.op + '"' : '') +
    (o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') +
    '/>'
  );
}
function chip(x, y, s, color, o) {
  o = o || {};
  var size = o.size || 6;
  var w = textWidth(s, size, o.mono) + 10;
  var fill = o.solid ? color : C.card;
  return (
    '<g>' +
    rect(x, y - 7.5, w, 11, fill, { rx: 5.5, stroke: color, sw: 0.7 }) +
    txt(x + w / 2, y + 0.5, s, { size: size, fill: o.solid ? C.ground : C.text, mono: o.mono }) +
    '</g>'
  );
}
function chipWidth(s, o) {
  o = o || {};
  return textWidth(s, o.size || 6, o.mono) + 10;
}
/** A card: a rounded panel with an optional title. */
function card(x, y, w, h, o) {
  o = o || {};
  var s = rect(x, y, w, h, o.fill || C.card, {
    rx: o.rx === undefined ? 3 : o.rx,
    stroke: o.stroke || C.line,
    sw: 0.6,
  });
  if (o.title)
    s += txt(x + 6, y + 10, o.title, {
      size: o.titleSize || 6.5,
      anchor: 'start',
      weight: 700,
      fill: o.titleFill,
    });
  return s;
}
/** A key cap such as "/" or "F". */
function keycap(x, y, s) {
  var w = Math.max(9, textWidth(s, 6, true) + 6);
  return (
    rect(x, y - 7, w, 10, C.card, { rx: 1.6, stroke: C.soft, sw: 0.7 }) +
    txt(x + w / 2, y + 0.6, s, { size: 6, mono: true })
  );
}
/** A toolbar button; lit by p (0–1). */
function button(x, y, s, p, o) {
  o = o || {};
  var w = textWidth(s, 5.6) + 8;
  var lit = p || 0;
  return (
    rect(x, y - 6.5, w, 9.5, lit > 0 ? mix(C.card, C.accent, 0.18 * lit) : C.card, {
      rx: 2,
      stroke: lit > 0 ? mix(C.line, C.accent, lit) : C.line,
      sw: 0.6 + 0.5 * lit,
    }) + txt(x + w / 2, y + 0.6, s, { size: 5.6, fill: o.fill })
  );
}
function buttonWidth(s) {
  return textWidth(s, 5.6) + 8;
}
/** A row of buttons from x; lit(i) gives each one's highlight. Returns svg. */
function toolbar(x, y, labels, lit) {
  var s = '',
    cx = x;
  labels.forEach(function (l, i) {
    s += button(cx, y, l, lit ? lit(i) : 0);
    cx += buttonWidth(l) + 3;
  });
  return s;
}
function check(x, y, color) {
  return (
    '<path d="M' +
    (x - 2.4) +
    ' ' +
    y +
    'l1.8 1.9 3.4-3.8" stroke="' +
    (color || C.green) +
    '" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
  );
}
function cross(x, y, color, r) {
  r = r || 2.4;
  return (
    '<path d="M' +
    (x - r) +
    ' ' +
    (y - r) +
    'l' +
    2 * r +
    ' ' +
    2 * r +
    'm0 ' +
    -2 * r +
    'l' +
    -2 * r +
    ' ' +
    2 * r +
    '" stroke="' +
    (color || C.red) +
    '" stroke-width="1.3" stroke-linecap="round"/>'
  );
}

/* ---------- the timeline motif ---------- */
/* A view maps time to x: { x0, x1, t0, t1 } (t in any unit). Everything below draws in the
   scene's own space and takes such a view. */
function view(x0, x1, t0, t1) {
  return { x0: x0, x1: x1, t0: t0, t1: t1 };
}
function vx(v, t) {
  return v.x0 + ((t - v.t0) / (v.t1 - v.t0)) * (v.x1 - v.x0);
}
/** The axis at y, with ticks: ticks is [[t, label], ...]. o.op fades the ticks. */
function axis(v, y, ticks, o) {
  o = o || {};
  var s =
    '<path d="M' +
    v.x0 +
    ' ' +
    y +
    'H' +
    v.x1 +
    '" stroke="' +
    (o.color || C.arc) +
    '" stroke-width="' +
    (o.w || 0.9) +
    '"/>';
  (ticks || []).forEach(function (tk) {
    var x = vx(v, tk[0]);
    if (x < v.x0 - 0.5 || x > v.x1 + 0.5) return;
    var op = tk[2] === undefined ? 1 : tk[2];
    s += G(
      '<path d="M' +
        x +
        ' ' +
        (y - 1.8) +
        'v3.6" stroke="' +
        (o.color || C.arc) +
        '" stroke-width="0.7"/>' +
        (tk[1]
          ? txt(x, y + 9, tk[1], {
              size: o.tickSize || 5,
              fill: C.soft,
              weight: 500,
              mono: o.mono,
              serif: o.serif,
            })
          : ''),
      { o: op },
    );
  });
  return s;
}
/** Evenly spaced ticks between t0 and t1, every `step`, labelled by fmt(t). */
function ticksEvery(t0, t1, step, fmt) {
  var out = [];
  for (var t = Math.ceil(t0 / step) * step; t <= t1 + 1e-9; t += step) out.push([t, fmt(t)]);
  return out;
}
/** Calendar ticks for a view over seconds since 1970 UTC: picks the step (centuries down to
    seconds) that gives at most `max` ticks, and labels each in the unit it steps by. */
var CAL_STEPS = [
  [3155760000, 'y', 100],
  [1577880000, 'y', 50],
  [315576000, 'y', 10],
  [157788000, 'y', 5],
  [31557600, 'y', 1],
  [2629800, 'mo', 1],
  [604800, 'd', 7],
  [86400, 'd', 1],
  [21600, 'h', 6],
  [3600, 'h', 1],
  [600, 'mi', 10],
  [60, 'mi', 1],
  [10, 's', 10],
  [1, 's', 1],
];
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function calendarTicks(t0, t1, max) {
  max = max || 7;
  var span = t1 - t0,
    step = CAL_STEPS[CAL_STEPS.length - 1];
  for (var i = 0; i < CAL_STEPS.length; i++) if (span / CAL_STEPS[i][0] <= max) step = CAL_STEPS[i];
  var out = [],
    kind = step[1],
    n = step[2],
    d = new Date(t0 * 1000);
  var pad = function (x) {
    return String(x).padStart(2, '0');
  };
  if (kind === 'y' || kind === 'mo') {
    var y = d.getUTCFullYear(),
      mo = kind === 'mo' ? d.getUTCMonth() : 0;
    if (kind === 'y') y = Math.ceil(y / n) * n;
    for (var k = 0; k < 60; k++) {
      var t = Date.UTC(y, mo, 1) / 1000;
      if (t > t1) break;
      if (t >= t0) out.push([t, kind === 'y' ? String(y) : MONTHS[mo] + ' ' + y]);
      if (kind === 'y') y += n;
      else if (++mo > 11) {
        mo = 0;
        y++;
      }
    }
    return out;
  }
  var unit = kind === 'd' ? 86400 : kind === 'h' ? 3600 : kind === 'mi' ? 60 : 1;
  var stepS = unit * n;
  for (var s = Math.ceil(t0 / stepS) * stepS; s <= t1 && out.length < 60; s += stepS) {
    var e = new Date(s * 1000);
    var label =
      kind === 'd'
        ? MONTHS[e.getUTCMonth()] + ' ' + e.getUTCDate()
        : kind === 's'
          ? pad(e.getUTCHours()) + ':' + pad(e.getUTCMinutes()) + ':' + pad(e.getUTCSeconds())
          : pad(e.getUTCHours()) + ':' + pad(e.getUTCMinutes());
    out.push([s, label]);
  }
  return out;
}
/** A moment: a dot on the axis with a stem up to its title. o.h stem height (negative is below),
    o.label, o.sub (time text), o.color, o.r, o.ring (selected), o.labelSize. */
function moment(x, y, o) {
  o = o || {};
  var h = o.h === undefined ? 14 : o.h;
  var col = o.color || C.moment;
  var s = '';
  if (o.label) {
    s +=
      '<path d="M' +
      x +
      ' ' +
      y +
      'V' +
      (y - h) +
      '" stroke="' +
      mix(col, C.ground, 0.35) +
      '" stroke-width="0.6"/>';
    var ly = h >= 0 ? y - h - 2 : y - h + 6;
    s += txt(x, ly, o.label, {
      size: o.labelSize || 5.6,
      fill: C.text,
      weight: 600,
      serif: o.serif,
    });
    if (o.sub)
      s += txt(x, ly + (h >= 0 ? -6.5 : 6.5), o.sub, {
        size: 4.4,
        fill: C.soft,
        weight: 500,
        mono: o.mono,
      });
  }
  if (o.ring)
    s +=
      '<circle cx="' +
      x +
      '" cy="' +
      y +
      '" r="' +
      ((o.r || 2.6) + 1.6) +
      '" fill="none" stroke="' +
      C.select +
      '" stroke-width="0.8"/>';
  s +=
    '<circle cx="' +
    x +
    '" cy="' +
    y +
    '" r="' +
    (o.r || 2.6) +
    '" fill="' +
    col +
    '" stroke="' +
    C.ground +
    '" stroke-width="0.7"/>';
  return s;
}
/** A summary: a larger dot holding a count. */
function summary(x, y, n, o) {
  o = o || {};
  var r = o.r || 4.4;
  return (
    '<circle cx="' +
    x +
    '" cy="' +
    y +
    '" r="' +
    r +
    '" fill="' +
    (o.color || C.strong) +
    '" stroke="' +
    C.ground +
    '" stroke-width="0.7"/>' +
    txt(x, y + 1.9, String(n), { size: 5.2, fill: C.ground, weight: 700 })
  );
}
/** A duration: a band from x0 to x1 at y (its top), with its title inside. */
function band(x0, x1, y, label, o) {
  o = o || {};
  var h = o.h || 7;
  var col = o.color || C.duration;
  var w = Math.max(1, x1 - x0);
  var s = rect(x0, y, w, h, col, { rx: 1.4, op: o.op === undefined ? 0.92 : o.op });
  if (label && w > textWidth(label, 4.8) + 4)
    s += txt(x0 + 3, y + h - 2, label, {
      size: 4.8,
      fill: o.textFill || C.durationText,
      anchor: 'start',
      weight: 600,
      serif: o.serif,
    });
  return s;
}
/** A relationship: an arc above the axis from x0 to x1, drawn to p. */
function arc(x0, x1, y, p, o) {
  o = o || {};
  var hgt = o.h || Math.min(30, Math.abs(x1 - x0) * 0.35);
  var d = 'M' + x0 + ' ' + y + 'Q' + (x0 + x1) / 2 + ' ' + (y - 2 * hgt) + ' ' + x1 + ' ' + y;
  return drawPath(
    d,
    Math.abs(x1 - x0) * 1.4 + 2 * hgt,
    p === undefined ? 1 : p,
    'stroke="' + (o.color || C.arc) + '" stroke-width="' + (o.w || 0.9) + '"',
  );
}
/** The selected-time line. */
function cursorLine(x, y0, y1) {
  return (
    '<path d="M' + x + ' ' + y0 + 'V' + y1 + '" stroke="' + C.select + '" stroke-width="0.9"/>'
  );
}

/* ---------- pointers and gestures ---------- */
function pointer(x, y, o) {
  o = o || {};
  return G(
    '<path d="M' +
      x +
      ' ' +
      y +
      'l0 9 2.4-2.2 1.8 3.8 1.5-0.7-1.8-3.7 3.3-0.2z" fill="' +
      (o.fill || '#ffffff') +
      '" stroke="' +
      (o.stroke || '#1b1b1b') +
      '" stroke-width="0.6" stroke-linejoin="round"/>',
    { o: o.o === undefined ? 1 : o.o },
  );
}
/** A fingertip touching at (x, y); pressed (0–1) shows a ripple. */
function finger(x, y, pressed, o) {
  o = o || {};
  var s =
    '<circle cx="' +
    x +
    '" cy="' +
    y +
    '" r="3.2" fill="' +
    (o.fill || '#f1c9a5') +
    '" stroke="#8a6a50" stroke-width="0.5" opacity="0.95"/>';
  if (pressed)
    s +=
      '<circle cx="' +
      x +
      '" cy="' +
      y +
      '" r="' +
      (3.2 + 4 * pressed) +
      '" fill="none" stroke="' +
      C.select +
      '" stroke-width="0.6" opacity="' +
      (1 - pressed) +
      '"/>';
  return s;
}

/* ---------- icons ---------- */
var ICON = {
  browser: function (x, y, w, h, o) {
    o = o || {};
    return (
      rect(x, y, w, h, C.card, { rx: 2, stroke: o.stroke || C.soft, sw: 0.8 }) +
      rect(x, y, w, 6, mix(C.card, C.soft, 0.25), { rx: 2 }) +
      '<circle cx="' +
      (x + 3.5) +
      '" cy="' +
      (y + 3) +
      '" r="0.9" fill="' +
      C.red +
      '"/>' +
      '<circle cx="' +
      (x + 6.5) +
      '" cy="' +
      (y + 3) +
      '" r="0.9" fill="' +
      C.amber +
      '"/>' +
      '<circle cx="' +
      (x + 9.5) +
      '" cy="' +
      (y + 3) +
      '" r="0.9" fill="' +
      C.green +
      '"/>' +
      (o.url
        ? rect(x + 14, y + 1.3, w - 18, 3.4, C.card, { rx: 1.7 }) +
          txt(x + 16, y + 4, o.url, { size: 2.8, anchor: 'start', fill: C.soft, mono: true })
        : '')
    );
  },
  laptop: function (x, y, s) {
    s = s || 1;
    return (
      rect(x - 11 * s, y - 8 * s, 22 * s, 14 * s, C.card, { rx: 1.2, stroke: C.soft, sw: 0.8 }) +
      '<path d="M' +
      (x - 14 * s) +
      ' ' +
      (y + 7 * s) +
      'h' +
      28 * s +
      'l-2 2h' +
      -24 * s +
      'z" fill="' +
      C.soft +
      '"/>'
    );
  },
  file: function (x, y, label, o) {
    o = o || {};
    var col = o.color || C.accent;
    return (
      '<path d="M' +
      (x - 7) +
      ' ' +
      (y - 9) +
      'h9l5 5v13h-14z" fill="' +
      C.card +
      '" stroke="' +
      col +
      '" stroke-width="0.8"/>' +
      '<path d="M' +
      (x + 2) +
      ' ' +
      (y - 9) +
      'v5h5" fill="none" stroke="' +
      col +
      '" stroke-width="0.8"/>' +
      (label ? txt(x, y + 5.5, label, { size: 4.4, mono: true, fill: col, weight: 600 }) : '')
    );
  },
  server: function (x, y, o) {
    o = o || {};
    var s = '';
    for (var i = 0; i < 3; i++)
      s +=
        rect(x - 8, y - 9 + i * 6, 16, 5, C.card, {
          rx: 0.8,
          stroke: o.stroke || C.soft,
          sw: 0.7,
        }) +
        '<circle cx="' +
        (x + 5) +
        '" cy="' +
        (y - 6.5 + i * 6) +
        '" r="0.9" fill="' +
        (o.light || C.green) +
        '"/>';
    return s;
  },
  cloud: function (x, y, s, o) {
    s = s || 1;
    o = o || {};
    return (
      '<path d="M' +
      (x - 9 * s) +
      ' ' +
      (y + 4 * s) +
      'a4.5 4.5 0 0 1 1-8.8a6 6 0 0 1 11.2-1.5a4.6 4.6 0 0 1 5.8 4.4a4 4 0 0 1-1 5.9z" fill="' +
      (o.fill || C.card) +
      '" stroke="' +
      (o.stroke || C.soft) +
      '" stroke-width="0.8"/>'
    );
  },
  padlock: function (x, y, closed) {
    var shackle = closed === undefined ? 1 : closed;
    return (
      '<path d="M' +
      (x - 2.6) +
      ' ' +
      (y - 1) +
      'v-2.2a2.6 2.6 0 0 1 5.2 0v' +
      (2.2 - 2 * (1 - shackle)) +
      '" fill="none" stroke="' +
      C.accent +
      '" stroke-width="1"/>' +
      rect(x - 4, y - 1, 8, 6, C.accent, { rx: 1 })
    );
  },
  phone: function (x, y, h) {
    h = h || 30;
    var w = h * 0.5;
    return (
      rect(x - w / 2, y - h / 2, w, h, C.card, { rx: 2.4, stroke: C.soft, sw: 0.9 }) +
      rect(x - 2.5, y - h / 2 + 1.4, 5, 0.9, C.soft, { rx: 0.45 })
    );
  },
  usb: function (x, y) {
    return (
      rect(x - 9, y - 4, 14, 8, C.soft, { rx: 1.4 }) +
      rect(x + 5, y - 2.6, 5, 5.2, C.line, { rx: 0.4 })
    );
  },
  network: function (x, y, struck) {
    var s =
      '<path d="M' +
      (x - 6) +
      ' ' +
      (y - 1) +
      'a8.5 8.5 0 0 1 12 0M' +
      (x - 4) +
      ' ' +
      (y + 1.5) +
      'a5.5 5.5 0 0 1 8 0" fill="none" stroke="' +
      C.soft +
      '" stroke-width="1"/>' +
      '<circle cx="' +
      x +
      '" cy="' +
      (y + 4) +
      '" r="1" fill="' +
      C.soft +
      '"/>';
    if (struck)
      s += G(
        '<path d="M' +
          (x - 7) +
          ' ' +
          (y + 6) +
          'L' +
          (x + 7) +
          ' ' +
          (y - 6) +
          '" stroke="' +
          C.red +
          '" stroke-width="1.3"/>',
        { o: struck },
      );
    return s;
  },
  terminal: function (x, y, w, h) {
    return (
      rect(x, y, w, h, C.card, { rx: 2, stroke: C.line, sw: 0.7 }) +
      rect(x, y, w, 5.5, C.faint, { rx: 2 }) +
      '<circle cx="' +
      (x + 3.5) +
      '" cy="' +
      (y + 2.75) +
      '" r="0.9" fill="' +
      C.red +
      '"/><circle cx="' +
      (x + 6.5) +
      '" cy="' +
      (y + 2.75) +
      '" r="0.9" fill="' +
      C.amber +
      '"/><circle cx="' +
      (x + 9.5) +
      '" cy="' +
      (y + 2.75) +
      '" r="0.9" fill="' +
      C.green +
      '"/>'
    );
  },
  person: function (x, y, col) {
    col = col || C.soft;
    return (
      '<circle cx="' +
      x +
      '" cy="' +
      (y - 6) +
      '" r="3.4" fill="' +
      col +
      '"/><path d="M' +
      (x - 6) +
      ' ' +
      (y + 6) +
      'q0-9 6-9q6 0 6 9z" fill="' +
      col +
      '"/>'
    );
  },
  magnifier: function (x, y, r) {
    r = r || 6;
    return (
      '<circle cx="' +
      x +
      '" cy="' +
      y +
      '" r="' +
      r +
      '" fill="none" stroke="' +
      C.text +
      '" stroke-width="1"/><path d="M' +
      (x + r * 0.7) +
      ' ' +
      (y + r * 0.7) +
      'l' +
      r * 0.7 +
      ' ' +
      r * 0.7 +
      '" stroke="' +
      C.text +
      '" stroke-width="1.6" stroke-linecap="round"/>'
    );
  },
};

/** The OpenChronology wordmark: the ◷ mark and the name. */
/** The logo (logo/logo.svg): its mark on the dark green tile, `w` wide, centred on (cx, cy).
    The tile keeps it legible on every look's ground, light or dark. */
function logo(cx, cy, w) {
  var k = w / 256;
  return (
    '<g transform="translate(' +
    (cx - w / 2) +
    ' ' +
    (cy - w / 2) +
    ') scale(' +
    k +
    ')">' +
    '<defs><radialGradient id="lg-tile" gradientUnits="userSpaceOnUse" cx="102" cy="90" r="205">' +
    '<stop offset="0" stop-color="#21392f"/><stop offset="1" stop-color="#142520"/></radialGradient>' +
    '<radialGradient id="lg-ring" gradientUnits="userSpaceOnUse" cx="84" cy="74" r="200">' +
    '<stop offset="0" stop-color="#d8e9b3"/><stop offset="1" stop-color="#a3c175"/></radialGradient>' +
    '<radialGradient id="lg-gold" gradientUnits="userSpaceOnUse" cx="128" cy="84" r="150">' +
    '<stop offset="0" stop-color="#f8dc9c"/><stop offset="1" stop-color="#dea24a"/></radialGradient>' +
    '<mask id="lg-cuts"><rect width="256" height="256" fill="#fff"/>' +
    '<path d="M128 128 228 28M128 128 228 228" stroke="#000" stroke-width="11"/></mask></defs>' +
    '<rect width="256" height="256" rx="56" fill="url(#lg-tile)"/>' +
    '<g fill="none" stroke-width="26" mask="url(#lg-cuts)">' +
    '<path d="M186 70A82 82 0 1 0 186 186" stroke="url(#lg-ring)"/>' +
    '<path d="M186 70A82 82 0 0 1 186 186" stroke="url(#lg-gold)"/></g>' +
    '<path d="M128 82V128H170" fill="none" stroke="url(#lg-gold)" stroke-width="16" ' +
    'stroke-linecap="round" stroke-linejoin="round"/></g>'
  );
}
/** The logo and the name beside it, the pair centred on x, the name's baseline at y. */
function wordmark(x, y, size) {
  size = size || 12;
  return (
    logo(x - size * 3.55, y - size * 0.36, size * 1.45) +
    txt(x + size * 0.45, y, 'openchronology', { size: size, weight: 700, fill: C.text })
  );
}

/** Where to find it, for every end card: the website, then the source, centred on x. */
function addresses(x, y, size, o) {
  o = o || {};
  return (
    txt(x, y, 'https://timescale.info', {
      size: size * 1.15,
      mono: true,
      fill: C.accent,
      weight: 600,
    }) +
    txt(x, y + size * 1.9, 'github.com/openchronology/timeline-app', {
      size: size,
      mono: true,
      fill: o.fill || C.soft,
      weight: 500,
    })
  );
}

/* ---------- a captured shot of the real app (tours) ---------- */
/* SHOTS (from shots.js, written by capture.mjs) gives each shot's frame count and size. The
   frame at shot time st is shots/<id>/NNNN.jpg, held on its last frame afterwards. */
function shotFrame(id, st) {
  var sh = (typeof SHOTS !== 'undefined' && SHOTS[id]) || { frames: 1, fps: 30 };
  var f = Math.max(0, Math.min(sh.frames - 1, Math.floor(st * sh.fps)));
  return 'shots/' + id + '/' + String(f).padStart(4, '0') + '.jpg';
}
/** The real app in a browser window at (x, y), w wide (16:9 inside the chrome). */
function appWindow(x, y, w, id, st, o) {
  o = o || {};
  var h = (w * 9) / 16;
  return (
    '<g>' +
    rect(x - 0.6, y - 6.6, w + 1.2, h + 7.2, '#000', { rx: 2.4, op: 0.18 }) +
    ICON.browser(x, y - 6, w, h + 6, { url: o.url || 'openchronology' }) +
    '<image href="' +
    shotFrame(id, st) +
    '" x="' +
    x +
    '" y="' +
    y +
    '" width="' +
    w +
    '" height="' +
    h +
    '" preserveAspectRatio="xMidYMid slice"/></g>'
  );
}

/* ---------- a short's frame (FORMAT 'vertical', 180 × 320) ---------- */
var VERTICAL = typeof FORMAT !== 'undefined' && FORMAT === 'vertical';
/* What TikTok's, YouTube Shorts' and Reels' own overlays leave clear (1080 × 1920: x 60–900,
   y 216–1440): the feed's tabs above, the caption and music below, the buttons at the right.
   Keep every word inside it; pictures may run past it. */
var SAFE = { x0: 10, x1: 150, y0: 36, y1: 240, cx: 80 };
/** The real app as it looks on a phone, at (x, y), w wide: a captured shot (its height from
    the shot's size) in a phone's rounded screen and bezel. */
function phoneShot(x, y, w, id, st, o) {
  o = o || {};
  var sh = (typeof SHOTS !== 'undefined' && SHOTS[id]) || { width: 9, height: 16 };
  var h = (w * sh.height) / sh.width,
    r = w * 0.07,
    b = w * 0.035;
  var clip = 'ph-' + String(id).replace(/[^a-z0-9]/gi, '') + '-' + Math.round(x * 10);
  return (
    '<g>' +
    rect(x - b - 0.8, y - b + 1.6, w + 2 * b + 1.6, h + 2 * b, '#000', { rx: r + b, op: 0.22 }) +
    rect(x - b, y - b, w + 2 * b, h + 2 * b, o.bezel || '#15191c', { rx: r + b }) +
    '<clipPath id="' +
    clip +
    '"><rect x="' +
    x +
    '" y="' +
    y +
    '" width="' +
    w +
    '" height="' +
    h +
    '" rx="' +
    r +
    '"/></clipPath><image href="' +
    shotFrame(id, st) +
    '" x="' +
    x +
    '" y="' +
    y +
    '" width="' +
    w +
    '" height="' +
    h +
    '" clip-path="url(#' +
    clip +
    ')" preserveAspectRatio="xMidYMid slice"/></g>'
  );
}
/** The end every short shares, p from 0 to 1: the wordmark, a line of its own, and where the
    source is. */
function shortEnd(p, line) {
  return rise(
    wordmark(SAFE.cx, 128, 13) +
      (line ? txt(SAFE.cx, 150, line, { size: 9, weight: 700, serif: C.serif }) : '') +
      txt(SAFE.cx, 164, 'Free and open source', { size: 6, fill: C.soft, weight: 600 }) +
      rect(SAFE.cx - 66, 170, 132, 24, C.card, { rx: 5, stroke: C.line }) +
      addresses(SAFE.cx, 180, 5),
    p,
    8,
  );
}
/** The burned-in caption at t: a few words at a time (CAPS, from captions.py), the word being
    said lit, outlined so it reads over anything. */
function shortCaption(t) {
  if (typeof CAPS === 'undefined') return '';
  var cue = null;
  for (var i = 0; i < CAPS.length; i++) if (t >= CAPS[i][0] && t < CAPS[i][1]) cue = CAPS[i];
  if (!cue) return '';
  var spans = cue[2]
    .map(function (w, k) {
      var lit = t >= w[1] && (k === cue[2].length - 1 || t < cue[2][k + 1][1]);
      return '<tspan fill="' + (lit ? C.select : C.text) + '">' + esc(w[0]) + ' </tspan>';
    })
    .join('');
  var p = ease(clamp01((t - cue[0]) / 0.12));
  return (
    '<g transform="translate(' +
    SAFE.cx +
    ' 226) scale(' +
    (0.9 + 0.1 * p).toFixed(3) +
    ')"><text x="0" y="0" font-family="' +
    FONT +
    '" font-size="14" font-weight="700" text-anchor="middle" stroke="' +
    C.ground +
    '" stroke-width="2.6" stroke-linejoin="round" paint-order="stroke">' +
    spans +
    '</text></g>'
  );
}
/** A short's headline (the scene's on-screen text): one line if it fits, else two of about
    equal width. */
function shortHeadline(s) {
  if (!s) return '';
  var room = SAFE.x1 - SAFE.x0,
    words = s.split(' '),
    lines = [s];
  if (textWidth(s, 11.5) > room) {
    var best = 1;
    for (var k = 1; k < words.length; k++) {
      var d = Math.abs(
        textWidth(words.slice(0, k).join(' '), 11.5) - textWidth(words.slice(k).join(' '), 11.5),
      );
      var bd = Math.abs(
        textWidth(words.slice(0, best).join(' '), 11.5) -
          textWidth(words.slice(best).join(' '), 11.5),
      );
      if (d < bd) best = k;
    }
    lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }
  return lines
    .map(function (l, i) {
      return txt(SAFE.cx, 50 + i * 13, l, { size: 11.5, weight: 700, serif: C.serif });
    })
    .join('');
}
/** Draws a short's frame at t: the headline, the scene and the caption. The first frame is
    already whole (it's the one the feed shows before playing), scenes cut quickly, and a
    headline the next scene repeats stays put across the cut. */
function renderShort(sc, lt, t, body) {
  var k = TL.scenes.indexOf(sc),
    prev = TL.scenes[k - 1],
    next = TL.scenes[k + 1];
  var fadeIn = k === 0 ? 1 : P(lt, 0, 0.2),
    fadeOut = sc.last ? 1 : 1 - clamp01((lt - (sc.dur - 0.15)) / 0.15),
    fade = Math.min(fadeIn, fadeOut);
  var head = Math.min(
    prev && prev.ost === sc.ost ? 1 : fadeIn,
    next && next.ost === sc.ost ? 1 : fadeOut,
  );
  var out = '<rect width="180" height="320" fill="' + C.ground + '"/>';
  if (body && typeof body === 'object') {
    var kIn = body.keepIn ? 1 : fadeIn,
      kOut = body.keepOut ? 1 : fadeOut;
    out += G(body.svg, { o: fade }) + G(body.keep, { o: Math.min(kIn, kOut) });
    if (!body.noHeadline) out += G(shortHeadline(sc.ost), { o: head });
  } else out += G(body, { o: fade }) + G(shortHeadline(sc.ost), { o: head });
  return out + shortCaption(t);
}

/* ---------- the frame ---------- */
var SCENES = {};
function sceneAt(t) {
  var s = TL.scenes;
  for (var i = s.length - 1; i >= 0; i--) if (t >= s[i].start) return s[i];
  return s[0];
}
/** Draws the frame at t: header (act and on-screen text), act-coloured progress bar, and the
    scene. A scene returns svg, or { svg, keep, keepIn, keepOut } to hold a layer across a cut.
    Returns the cue words the scene asked for but the narration doesn't have. */
function renderAt(t) {
  var sc = sceneAt(t),
    lt = t - sc.start;
  var q = cuesFor(sc);
  var body = SCENES[sc.id](lt, q);
  if (VERTICAL) {
    document.getElementById('stage').innerHTML = renderShort(sc, lt, t, body);
    return q.missing;
  }
  var fade = Math.min(P(lt, 0, 0.4), sc.last ? 1 : 1 - clamp01((lt - (sc.dur - 0.3)) / 0.3));
  var out = '<rect width="320" height="180" fill="' + C.ground + '"/>';
  if (!sc.bare)
    out += G(
      txt(12, 8.2, sc.act.toUpperCase(), {
        size: 4.6,
        fill: C.soft,
        anchor: 'start',
        ls: 0.6,
        weight: 600,
      }) + txt(12, 16.4, sc.ost, { size: 8, anchor: 'start', weight: 700, serif: C.serif }),
      { o: fade },
    );
  TL.acts.forEach(function (a, i) {
    var col = a.color || C.acts[i % C.acts.length];
    var x0 = (320 * a.start) / TL.total,
      x1 = (320 * a.end) / TL.total;
    out += rect(x0.toFixed(2), 19.4, (x1 - x0 - 0.6).toFixed(2), 0.9, col, { op: 0.25 });
    var f = Math.min(Math.max(t, a.start), a.end);
    if (f > a.start)
      out += rect(x0.toFixed(2), 19.4, ((320 * (f - a.start)) / TL.total).toFixed(2), 0.9, col);
  });
  var content;
  if (body && typeof body === 'object') {
    var kIn = body.keepIn ? 1 : P(lt, 0, 0.4),
      kOut = body.keepOut ? 1 : 1 - clamp01((lt - (sc.dur - 0.3)) / 0.3);
    content = G(body.svg, { o: fade }) + G(body.keep, { o: Math.min(kIn, kOut) });
  } else content = G(body, { o: fade });
  out += '<g transform="translate(17.6 21.2) scale(0.89)">' + content + '</g>';
  document.getElementById('stage').innerHTML = out;
  return q.missing;
}
