// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 6, A class timeline nobody can wreck (publicity/shorts/6-a-class-timeline.md): the
   how-to for teachers' feeds, drawn as interface cards after Video 9 (working together).
   Thirty students aim at one timeline; a contributor's save becomes a pull request; the
   teacher talks it through and merges it, and every save is kept in History; then the public
   timeline goes out by one link to phones and a laptop. The timeline under the cards is the US
   sample's shape, not a capture. Scenes are pure functions of scene time lt; q("word") is when
   that word is said. */

var TITLE = 'The United States, 1775–2008';
var STUDENT = '@maya';
var TEACHER = '@ms.rivera';
// The US sample's shape over 1775–2008: moments, and its wars as durations.
var US0 = 1775,
  US1 = 2008;
var US_MOMENTS = [1776, 1787, 1791, 1848, 1863, 1869, 1903, 1920, 1929, 1954, 1964, 1969, 2001];
var US_BANDS = [
  [1861, 1865],
  [1917, 1918],
  [1941, 1945],
];
var LOUISIANA = 1803;
function usF(y) {
  return (y - US0) / (US1 - US0);
}

/** The class timeline as a small card: its title, an axis, its moments and durations.
    o.add (0–1) drops in the Louisiana Purchase; o.label shows its title. */
function usCard(x, y, w, h, o) {
  o = o || {};
  var s = card(x, y, w, h, {
    title: o.title === undefined ? TITLE : o.title,
    titleSize: o.ts || 6.5,
  });
  var ay = y + h - (o.pad || 8),
    x0 = x + 6,
    x1 = x + w - 6;
  var xAt = function (yr) {
    return lerp(x0, x1, usF(yr));
  };
  s += '<path d="M' + x0 + ' ' + ay + 'H' + x1 + '" stroke="' + C.arc + '" stroke-width="0.8"/>';
  US_BANDS.forEach(function (b) {
    s += rect(xAt(b[0]), ay + 2, Math.max(1.6, xAt(b[1]) - xAt(b[0])), 3, C.duration, {
      rx: 1,
      op: 0.9,
    });
  });
  US_MOMENTS.forEach(function (yr) {
    s += moment(xAt(yr), ay, { r: o.r || 1.9 });
  });
  if (o.add) {
    var a = o.add,
      lx = xAt(LOUISIANA);
    s += G(
      (o.label
        ? G(
            '<path d="M' +
              lx +
              ' ' +
              ay +
              'V' +
              (ay - 8) +
              'H' +
              (lx + 4) +
              '" fill="none" stroke="' +
              C.amber +
              '" stroke-width="0.7"/>' +
              txt(lx + 6, ay - 6, 'Louisiana Purchase', {
                size: 7,
                anchor: 'start',
                weight: 700,
                fill: C.text,
              }),
            {
              o: clamp01((a - 0.7) / 0.3),
            },
          ) + moment(lx, ay, { r: 2.6, color: C.amber })
        : moment(lx, ay, { r: 2.6, color: C.amber })) +
        (a >= 1 && o.ring
          ? '<circle cx="' +
            lx +
            '" cy="' +
            ay +
            '" r="' +
            (2.6 + 3 * o.ring) +
            '" fill="none" stroke="' +
            C.amber +
            '" stroke-width="0.7" opacity="' +
            (1 - o.ring).toFixed(3) +
            '"/>'
          : ''),
      { o: clamp01(a * 2), ty: (1 - a) * -26 },
    );
  }
  return s;
}

/** A straight arrow from (x0, y0) to (x1, y1), with its head. */
function arrow(x0, y0, x1, y1, col, w) {
  var a = Math.atan2(y1 - y0, x1 - x0),
    k = 2.6;
  return (
    '<path d="M' +
    x0 +
    ' ' +
    y0 +
    'L' +
    x1 +
    ' ' +
    y1 +
    'M' +
    (x1 - k * Math.cos(a - 0.55)) +
    ' ' +
    (y1 - k * Math.sin(a - 0.55)) +
    'L' +
    x1 +
    ' ' +
    y1 +
    'L' +
    (x1 - k * Math.cos(a + 0.55)) +
    ' ' +
    (y1 - k * Math.sin(a + 0.55)) +
    '" fill="none" stroke="' +
    col +
    '" stroke-width="' +
    (w || 0.9) +
    '" stroke-linecap="round" stroke-linejoin="round"/>'
  );
}

/** A pulse: a ring that grows and fades over 0.8 s from t0. */
function pulse(lt, t0, x, y, w, h, col) {
  var p = clamp01((lt - t0) / 0.8);
  if (p <= 0 || p >= 1) return '';
  var g = 4 * p;
  return rect(x - g, y - g, w + 2 * g, h + 2 * g, 'none', {
    rx: 4 + g,
    stroke: col || C.select,
    sw: 1,
    op: (1 - p).toFixed(3),
  });
}

/** A large button for a phone frame, lit by p. */
function bigButton(cx, y, s, p, o) {
  o = o || {};
  var size = o.size || 7.5,
    w = textWidth(s, size) + 14,
    h = 15,
    col = o.color || C.accent;
  var fill = o.solid ? mix(col, '#000000', 0.25 * p) : p > 0 ? mix(C.card, col, 0.18 * p) : C.card;
  return (
    rect(cx - w / 2, y - h / 2, w, h, fill, {
      rx: 3,
      stroke: o.solid ? col : p > 0 ? mix(C.line, col, p) : C.line,
      sw: 0.8 + 0.6 * p,
    }) +
    txt(cx, y + size * 0.36, s, {
      size: size,
      weight: 700,
      fill: o.solid ? C.card : o.fill || C.text,
    })
  );
}
function bigButtonWidth(s, size) {
  return textWidth(s, size || 7.5) + 14;
}

/** A role chip as the app's collaborators list names it. */
function roleChip(x, y, s, col, size) {
  size = size || 7;
  var w = textWidth(s, size) + 10;
  return (
    rect(x, y - 6.5, w, 11, col, { rx: 5.5 }) +
    txt(x + w / 2, y + size * 0.36 - 0.5, s, { size: size, fill: C.card, weight: 700 })
  );
}

/** A small avatar: a head and shoulders in col, scale k, centred at (x, y). */
function avatar(x, y, col, k) {
  return G(ICON.person(x, y, col), { s: k || 0.7, cx: x, cy: y });
}

/** A speech-bubble glyph, for Discussion. */
function bubbleIcon(x, y, col) {
  return (
    '<path d="M' +
    (x - 3.6) +
    ' ' +
    (y - 3) +
    'h7.2a1.2 1.2 0 0 1 1.2 1.2v3.6a1.2 1.2 0 0 1-1.2 1.2h-4.4l-2.4 2v-2h-0.4a1.2 1.2 0 0 1-1.2-1.2v-3.6a1.2 1.2 0 0 1 1.2-1.2z" fill="none" stroke="' +
    (col || C.soft) +
    '" stroke-width="0.8" stroke-linejoin="round"/>'
  );
}

/** The pull request card at (x, y), w wide and h tall: its label, author, title, what it adds
    and the Discussion heading. o.adds fades "+1 moment" in; o.body adds svg below. */
function prCard(x, y, w, h, o) {
  o = o || {};
  var s = rect(x, y, w, h, C.card, { rx: 3.5, stroke: C.amber, sw: 1.1 });
  s += txt(x + 7, y + 10, 'Pull request', {
    size: 6.5,
    anchor: 'start',
    weight: 700,
    fill: C.amber,
    ls: 0.3,
  });
  s += txt(x + w - 7, y + 10, STUDENT + ' · open', {
    size: 6,
    anchor: 'end',
    weight: 500,
    fill: C.soft,
    mono: true,
  });
  s += txt(x + 7, y + 22.5, 'Add: The Louisiana Purchase', {
    size: 9.2,
    anchor: 'start',
    weight: 700,
  });
  var ad = o.adds === undefined ? 1 : o.adds;
  s += G(
    rect(x + 7, y + 27, 50, 12.5, mix(C.card, C.green, 0.14), { rx: 2.4 }) +
      txt(x + 32, y + 36, '+1 moment', { size: 8.2, weight: 700, fill: C.green }),
    { o: ad },
  );
  s +=
    '<path d="M' +
    (x + 7) +
    ' ' +
    (y + 45) +
    'H' +
    (x + w - 7) +
    '" stroke="' +
    C.faint +
    '" stroke-width="0.9"/>';
  s +=
    G(bubbleIcon(x + 12, y + 53.5, C.soft), { s: 1.2, cx: x + 12, cy: y + 53.5 }) +
    txt(x + 20, y + 56.5, 'Discussion', { size: 8, anchor: 'start', weight: 700 });
  if (o.body) s += o.body;
  return s;
}

/* ---------- Scene 1: thirty students, one timeline ---------- */
var FOCUS = { x: 80, y: 190 };
var CLASS = (function () {
  var rows = [
    [7, 34, 50],
    [10, 54, 76],
    [13, 74, 102],
  ];
  var out = [],
    k = 0;
  rows.forEach(function (r) {
    for (var i = 0; i < r[0]; i++) {
      var a = lerp(-150, -30, r[0] === 1 ? 0.5 : i / (r[0] - 1)) * (Math.PI / 180);
      out.push({ x: FOCUS.x + r[1] * Math.cos(a), y: FOCUS.y + r[2] * Math.sin(a), k: k++ });
    }
  });
  return out;
})();

function classroom(lt, o) {
  o = o || {};
  var s = '';
  var cols = [C.acts[0], C.acts[1], C.acts[2], C.acts[3], C.acts[4]];
  CLASS.forEach(function (c) {
    var dx = FOCUS.x - c.x,
      dy = FOCUS.y - c.y,
      d = Math.hypot(dx, dy),
      ux = dx / d,
      uy = dy / d;
    var j = 0.9 * Math.sin(lt * 7.3 + c.k * 1.7) + 0.5 * Math.sin(lt * 11.1 + c.k * 0.9);
    var a0 = 6.5 + j,
      a1 = 13 + j;
    var col = cols[c.k % cols.length];
    s += avatar(c.x, c.y, col, 0.62);
    s += arrow(
      c.x + ux * a0,
      c.y + uy * a0,
      c.x + ux * a1,
      c.y + uy * a1,
      mix(col, C.text, 0.2),
      0.9,
    );
  });
  return s;
}

SCENES[1] = function (lt, q) {
  var s = '';
  // The timeline every arrow is aimed at: whole at frame 0.
  s += rect(10, 177, 140, 34, C.select, { rx: 4, op: 0.12 + 0.06 * Math.sin(lt * 5) });
  s += usCard(12, 179, 136, 30, { ts: 7 });
  s += classroom(lt);
  return s;
};

/* ---------- Scene 2: they propose ---------- */
SCENES[2] = function (lt, q) {
  var s = '';
  var tC = q('contributors'),
    tStraight = q('straight'),
    tProp = q('proposal'),
    tAdds = q('adds');
  // The collaborators card.
  var cx = 10,
    cy = 72,
    cw = 140;
  var cp = P(lt, 0, 0.4);
  var cc = card(cx, cy, cw, 42, { title: 'Collaborators', titleSize: 8.5 });
  cc = cc.replace('y="' + (cy + 10) + '"', 'y="' + (cy + 12) + '"');
  cc += txt(cx + cw - 7, cy + 12, 'Username · Access', {
    size: 6,
    anchor: 'end',
    weight: 500,
    fill: C.soft,
  });
  var row = P(lt, tC - 0.2, 0.5);
  cc += G(
    avatar(cx + 13, cy + 30, C.amber, 0.7) +
      txt(cx + 23, cy + 32, STUDENT, { size: 8.2, anchor: 'start', mono: true, weight: 600 }),
    { o: row, tx: (1 - row) * 6 },
  );
  var chipP = P(lt, tC, 0.45);
  var chipW = textWidth('Contributor', 8) + 12;
  var chipX = cx + cw - 7 - chipW;
  cc += pop(
    rect(chipX, cy + 23.5, chipW, 13, C.amber, { rx: 6.5 }) +
      txt(chipX + chipW / 2, cy + 32.8, 'Contributor', { size: 8, fill: C.card, weight: 700 }),
    chipP,
    chipX + chipW / 2,
    cy + 30,
  );
  if (chipP > 0)
    cc += G(check(chipX - 7, cy + 29.6, C.green), {
      o: chipP,
      s: 1.3,
      cx: chipX - 7,
      cy: cy + 29.6,
    });
  s += rise(cc, cp, 6);
  s += pulse(lt, tC, chipX, cy + 23.5, chipW, 13, C.amber);

  // The student's save button: it reads Submit pull request.
  var bp = P(lt, tStraight - 0.9, 0.5);
  var tPress = tStraight + 0.2;
  var press = P(lt, tPress, 0.2) * (1 - P(lt, tPress + 0.45, 0.3));
  var by = 132;
  var bw = bigButtonWidth('Submit pull request', 9);
  s += G(bigButton(80, by, 'Submit pull request', press, { color: C.accent, size: 9 }), {
    o: bp,
    s: 1 - 0.04 * press,
    cx: 80,
    cy: by,
  });
  var fp = clamp01((lt - (tPress - 0.6)) / 0.6) * (1 - P(lt, tPress + 0.8, 0.4));
  if (fp > 0) s += G(finger(80 + bw / 2 - 3, by + 5, P(lt, tPress, 0.4)), { o: fp });
  s += pulse(lt, tPress, 80 - bw / 2, by - 7.5, bw, 15, C.accent);

  // The pull request slides up from the button.
  var sl = P(lt, tProp - 0.1, 0.7);
  if (sl > 0) {
    var adds = 0.4 + 0.6 * P(lt, tAdds, 0.4);
    s += G(prCard(10, 147, 140, 62, { adds: adds }), { o: clamp01(sl * 2), ty: (1 - sl) * 30 });
    s += pulse(lt, tAdds, 17, 174, 50, 12.5, C.green);
  }
  return s;
};

/* ---------- Scene 3: you decide ---------- */
SCENES[3] = function (lt, q) {
  var s = '';
  var tTalk = q('talk'),
    tMerge = q('merge'),
    tHist = q('history'),
    tBack = q('back');
  var merged = P(lt, tMerge + 0.35, 0.4);
  // The pull request with the teacher's comment, Merge and Reject.
  var out = P(lt, tHist - 0.5, 0.5);
  var px = 10,
    py = 66,
    pw = 140,
    ph = 102;
  var comment = 'Good! Add a source too?';
  var typed = Math.round(comment.length * clamp01((lt - tTalk) / 0.9));
  var bp = P(lt, tTalk - 0.15, 0.3);
  var bub =
    rect(px + 7, py + 59, pw - 14, 22, mix(C.card, C.blue, 0.08), {
      rx: 3,
      stroke: mix(C.line, C.blue, 0.5),
    }) +
    txt(px + 11, py + 67, TEACHER, {
      size: 6.5,
      anchor: 'start',
      mono: true,
      weight: 600,
      fill: C.blue,
    }) +
    txt(
      px + 11,
      py + 77.5,
      comment.slice(0, typed) + (typed < comment.length && typed > 0 ? '|' : ''),
      {
        size: 8.2,
        anchor: 'start',
        weight: 600,
      },
    );
  var mp = P(lt, tMerge - 0.05, 0.15) * (1 - P(lt, tMerge + 0.35, 0.3));
  var bsz = 8.5,
    mw = bigButtonWidth('Merge', bsz),
    rw = bigButtonWidth('Reject', bsz),
    byy = py + 91;
  var btns =
    bigButton(px + 7 + mw / 2, byy, 'Merge', Math.max(mp, merged), {
      solid: true,
      color: C.green,
      size: bsz,
    }) + bigButton(px + 7 + mw + 5 + rw / 2, byy, 'Reject', 0, { fill: C.red, size: bsz });
  var badge = G(
    G(check(px + pw - 40, byy - 0.6, C.green), { s: 1.3, cx: px + pw - 40, cy: byy - 0.6 }) +
      txt(px + pw - 7, byy + 3, 'Merged', { size: 8.5, anchor: 'end', weight: 700, fill: C.green }),
    { o: merged },
  );
  var pr = prCard(px, py, pw, ph, { body: G(bub, { o: bp, ty: (1 - bp) * 3 }) + btns + badge });
  s += G(pr, { o: 1 - out, ty: -out * 14 });
  s += pulse(lt, tMerge, px + 7, byy - 7.5, mw, 15, C.green);
  var fp = clamp01((lt - (tMerge - 0.5)) / 0.4) * (1 - P(lt, tMerge + 0.5, 0.3));
  if (fp > 0) s += G(finger(px + 7 + mw - 3, byy + 4, P(lt, tMerge, 0.4)), { o: fp });

  // History: every save a revision, newest first.
  var hp = P(lt, tHist - 0.2, 0.5);
  if (hp > 0) {
    var hx = 10,
      hy = 66,
      hw = 140;
    var back = P(lt, tBack, 0.5);
    var H = card(hx, hy, hw, 102, { title: 'History', titleSize: 8.5 }).replace(
      'y="' + (hy + 10) + '"',
      'y="' + (hy + 12) + '"',
    );
    H += txt(hx + hw - 7, hy + 12, 'newest first', {
      size: 6.5,
      anchor: 'end',
      weight: 500,
      fill: C.soft,
    });
    var revs = [
      ['Revision 12', 'pull request merged'],
      ['Revision 11', TEACHER],
      ['Revision 10', TEACHER],
    ];
    revs.forEach(function (r, i) {
      var k = revs.length - 1 - i;
      var a = P(lt, tHist + 0.15 * k, 0.4);
      var ry = hy + 18 + i * 27.5;
      var sel = i === 2 ? back : 0;
      H += G(
        rect(hx + 6, ry, hw - 12, 25, sel > 0 ? mix(C.card, C.select, 0.22 * sel) : C.card, {
          rx: 2.6,
          stroke:
            sel > 0 ? mix(C.line, C.select, sel) : i === 0 ? mix(C.line, C.green, 0.6) : C.line,
          sw: 0.7 + 0.5 * sel,
        }) +
          txt(hx + 11, ry + 16, r[0], { size: 8.5, anchor: 'start', weight: 700 }) +
          txt(hx + hw - 11, ry + 16, r[1], {
            size: 6.8,
            anchor: 'end',
            weight: 600,
            fill: i === 0 ? C.green : C.soft,
            mono: i !== 0,
          }),
        { o: a, ty: (1 - a) * -6 },
      );
    });
    s += G(H, { o: hp, ty: (1 - hp) * 10 });
  }

  // The class timeline under it: the moment lands on the line.
  var fall = P(lt, tMerge + 0.4, 0.6);
  var ring = clamp01((lt - tMerge - 1.0) / 0.8);
  s += usCard(10, 172, 140, 35, { add: fall, label: true, ring: ring, ts: 7, pad: 7, r: 2.1 });
  return s;
};

/* ---------- Scene 4: one link ---------- */
/** A device showing the class timeline: kind 'phone' or 'laptop', centred at (x, y). */
function device(kind, x, y) {
  var s = '',
    pts = [],
    x0,
    x1,
    ly;
  if (kind === 'phone') {
    var w = 26,
      h = 44;
    s += rect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, '#15191c', { rx: 5 });
    s += rect(x - w / 2, y - h / 2, w, h, C.card, { rx: 3.2 });
    s += rect(x - w / 2 + 3.5, y - h / 2 + 5, w - 11, 2.2, C.text, { rx: 1.1, op: 0.6 });
    x0 = x - w / 2 + 3;
    x1 = x + w / 2 - 3;
    ly = y + 6;
  } else {
    var lw = 56,
      lh = 34;
    s += rect(x - lw / 2, y - lh / 2, lw, lh, '#15191c', { rx: 2.4 });
    s += rect(x - lw / 2 + 2.2, y - lh / 2 + 2.2, lw - 4.4, lh - 4.4, C.card, { rx: 1.2 });
    s +=
      '<path d="M' +
      (x - lw / 2 - 6) +
      ' ' +
      (y + lh / 2) +
      'h' +
      (lw + 12) +
      'l-3 3h' +
      -(lw + 6) +
      'z" fill="' +
      C.soft +
      '"/>';
    s += rect(x - lw / 2 + 6, y - lh / 2 + 6, 26, 2.2, C.text, { rx: 1.1, op: 0.6 });
    x0 = x - lw / 2 + 6;
    x1 = x + lw / 2 - 6;
    ly = y + 5;
  }
  var xf = function (yr) {
    return lerp(x0, x1, usF(yr));
  };
  s += '<path d="M' + x0 + ' ' + ly + 'H' + x1 + '" stroke="' + C.arc + '" stroke-width="0.7"/>';
  US_BANDS.forEach(function (b) {
    s += rect(xf(b[0]), ly + 1.8, Math.max(1.2, xf(b[1]) - xf(b[0])), 2, C.duration, { rx: 0.6 });
  });
  US_MOMENTS.forEach(function (yr) {
    s += '<circle cx="' + xf(yr) + '" cy="' + ly + '" r="1.3" fill="' + C.moment + '"/>';
  });
  s += '<circle cx="' + xf(LOUISIANA) + '" cy="' + ly + '" r="1.7" fill="' + C.amber + '"/>';
  return s;
}
var DEVICES = [
  ['phone', 25, 158],
  ['laptop', 80, 156],
  ['phone', 135, 158],
];

SCENES[4] = function (lt, q) {
  var s = '';
  var tLink = q('link'),
    tAcct = q('account'),
    tFork = q('fork');
  // The timeline, now public.
  var pub = P(lt, q('public') - 0.1, 0.4);
  s += usCard(10, 74, 140, 32, { add: 1, ts: 7.5, r: 2.1 });
  var pw = textWidth('Public', 7.5) + 12;
  s += G(
    rect(150 - pw - 5, 68, pw, 13, C.accent, { rx: 6.5 }) +
      txt(150 - 5 - pw / 2, 77.2, 'Public', { size: 7.5, fill: C.card, weight: 700 }),
    { o: pub, s: lerp(0.7, 1, pub), cx: 150 - 5 - pw / 2, cy: 74 },
  );
  // The link: copied.
  var url = 'timescale.info/rivera/us-history';
  var lp = P(lt, tLink - 0.6, 0.4);
  var cp = P(lt, tLink, 0.35);
  var done = cp * (1 - P(lt, tLink + 1.3, 0.35));
  var lw = 140,
    lx = 10,
    ly = 112;
  var L =
    rect(lx, ly, lw, 15, cp > 0 ? mix(C.card, C.accent, 0.14 * done) : C.card, {
      rx: 7.5,
      stroke: mix(C.line, C.accent, 0.4 + 0.6 * cp),
      sw: 0.9 + 0.4 * cp,
    }) +
    G(txt(80, ly + 10.2, url, { size: 6.5, mono: true, weight: 600, fill: C.accent }), {
      o: 1 - done,
    }) +
    G(
      G(check(62, ly + 7, C.green), { s: 1.3, cx: 62, cy: ly + 7 }) +
        txt(68, ly + 10.6, 'Link copied', {
          size: 8.5,
          anchor: 'start',
          weight: 700,
          fill: C.green,
        }),
      { o: done },
    );
  s += G(L, {
    o: lp,
    s: 1 + 0.04 * Math.sin(Math.PI * clamp01((lt - tLink) / 0.35)),
    cx: 80,
    cy: ly + 7.5,
  });
  s += pulse(lt, tLink, lx, ly, lw, 15, C.accent);
  // The devices pop in around it, each showing the same timeline.
  DEVICES.forEach(function (d, i) {
    var a = P(lt, tLink + 0.5 + i * 0.18, 0.45);
    if (a <= 0) return;
    s += G(
      '<path d="M80 ' +
        (ly + 15) +
        'L' +
        d[1] +
        ' ' +
        (d[2] - 24) +
        '" stroke="' +
        C.select +
        '" stroke-width="1" stroke-dasharray="1.6 1.4"/>',
      { o: 0.5 * a },
    );
    s += pop(device(d[0], d[1], d[2]), a, d[1], d[2]);
  });
  // No account needed to read; and forks.
  var ap = P(lt, tAcct - 0.1, 0.45);
  var al = 'no account needed to read';
  s += rise(chip(80 - chipWidth(al, { size: 8 }) / 2, 192, al, C.accent, { size: 8 }), ap, 4);
  var fp = P(lt, tFork - 0.1, 0.45);
  var fl = 'Fork on server';
  var fw = chipWidth(fl, { size: 8 });
  s += rise(chip(80 - fw / 2 + 6, 206, fl, C.amber, { size: 8 }), fp, 4);
  if (fp > 0) {
    // A fork glyph beside it: a line that branches.
    var gx = 80 - fw / 2 - 4,
      gy = 202;
    s += G(
      '<path d="M' +
        gx +
        ' ' +
        (gy + 6) +
        'V' +
        (gy - 4) +
        'M' +
        gx +
        ' ' +
        (gy + 2) +
        'q0-4 5-5" fill="none" stroke="' +
        C.amber +
        '" stroke-width="1.1" stroke-linecap="round"/>' +
        '<circle cx="' +
        gx +
        '" cy="' +
        (gy - 4.5) +
        '" r="1.3" fill="' +
        C.amber +
        '"/>' +
        '<circle cx="' +
        (gx + 5.5) +
        '" cy="' +
        (gy - 3.2) +
        '" r="1.3" fill="' +
        C.amber +
        '"/>',
      { o: fp },
    );
  }
  return s;
};

/* ---------- Scene 5: build it together ---------- */
SCENES[5] = function (lt, q) {
  var s = '';
  var away = smooth(clamp01(lt / 0.6));
  if (away < 1)
    DEVICES.forEach(function (d) {
      var dx = (d[1] - 80) * 0.8 * away;
      s += G(G(device(d[0], d[1], d[2]), { s: 1 - 0.35 * away, cx: d[1], cy: d[2] }), {
        o: 1 - away,
        tx: dx,
      });
    });
  s += shortEnd(P(lt, 0.45, 0.7), 'Build it together');
  return { svg: s, noHeadline: true };
};
