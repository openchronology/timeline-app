// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 8, Working together (publicity/8-working-together.md): one timeline card, "Our town's
   history", followed through a class project. Faceless figures wear role badges (Owner, Writer,
   Contributor, Viewer, Reader); arrows are proposals and a branch line is a fork. Scenes are
   pure functions of scene time lt; q("word") is when that word is said. */

var TITLE = "Our town's history";
var ROLE = {
  OWNER: C.accent,
  WRITER: C.blue,
  CONTRIBUTOR: C.amber,
  VIEWER: C.moment,
  READER: C.soft,
};

/** A faceless figure standing at (x, y) (its body's centre), with a role badge beneath. */
function figure(x, y, role, o) {
  o = o || {};
  var col = ROLE[role] || C.soft;
  var sc = o.s || 1;
  var s = G(ICON.person(x, y, mix(col, C.ground, 0.25)), { s: sc, cx: x, cy: y });
  if (role) {
    var size = o.badgeSize || 4.4,
      w = textWidth(role, size) + 7,
      by = y + 6 * sc + 3.2;
    s +=
      rect(x - w / 2, by, w, 6.6, col, { rx: 3.3 }) +
      txt(x, by + 4.9, role, { size: size, fill: C.card, weight: 700, ls: 0.25 });
    if (o.note)
      s += txt(x, by + 13, o.note, { size: 4.6, fill: C.soft, weight: 500, italic: true });
  }
  return s;
}

/** The timeline card: its title, a small axis and its moments. o.moments is [[fx, h, col]],
    o.extra adds svg drawn in card space through fn(axisY, xAt). */
var TOWN = [0.12, 0.3, 0.52, 0.7, 0.88];
function tlCard(x, y, w, h, o) {
  o = o || {};
  var s = card(x, y, w, h, {
    stroke: o.stroke,
    fill: o.fill,
    title: o.title === undefined ? TITLE : o.title,
    titleSize: o.titleSize || 5.6,
  });
  if (o.dash) s = s.replace('stroke-width="0.6"', 'stroke-width="0.8" stroke-dasharray="2 1.4"');
  var ay = y + h - 9,
    x0 = x + 6,
    x1 = x + w - 6;
  var xAt = function (f) {
    return lerp(x0, x1, f);
  };
  s += '<path d="M' + x0 + ' ' + ay + 'H' + x1 + '" stroke="' + C.arc + '" stroke-width="0.7"/>';
  (o.moments || TOWN).forEach(function (f, i) {
    s += moment(xAt(f), ay, { r: o.r || 1.9, color: o.color });
  });
  if (o.extra) s += o.extra(ay, xAt);
  return s;
}

/** A straight arrow from (x0, y0) to (x1, y1), drawn to p. */
function arrow(x0, y0, x1, y1, p, col, o) {
  o = o || {};
  if (p <= 0) return '';
  col = col || C.accent;
  var len = Math.hypot(x1 - x0, y1 - y0);
  var s = drawPath(
    'M' + x0 + ' ' + y0 + 'L' + x1 + ' ' + y1,
    len,
    p,
    'stroke="' +
      col +
      '" stroke-width="' +
      (o.w || 0.9) +
      '"' +
      (o.dash ? ' stroke-dasharray="' + o.dash + '"' : ''),
  );
  if (o.dash)
    s =
      '<path d="M' +
      x0 +
      ' ' +
      y0 +
      'L' +
      lerp(x0, x1, p) +
      ' ' +
      lerp(y0, y1, p) +
      '" fill="none" stroke="' +
      col +
      '" stroke-width="' +
      (o.w || 0.9) +
      '" stroke-dasharray="' +
      o.dash +
      '"/>';
  if (p > 0.85) {
    var a = Math.atan2(y1 - y0, x1 - x0),
      k = 3;
    var hx = x1,
      hy = y1;
    s +=
      '<path d="M' +
      (hx - k * Math.cos(a - 0.5)) +
      ' ' +
      (hy - k * Math.sin(a - 0.5)) +
      'L' +
      hx +
      ' ' +
      hy +
      'L' +
      (hx - k * Math.cos(a + 0.5)) +
      ' ' +
      (hy - k * Math.sin(a + 0.5)) +
      '" fill="none" stroke="' +
      col +
      '" stroke-width="' +
      (o.w || 0.9) +
      '" stroke-linecap="round" stroke-linejoin="round" opacity="' +
      clamp01((p - 0.85) / 0.15) +
      '"/>';
  }
  return s;
}

/** A pulse: a ring that grows and fades over 0.8 s from t0. */
function pulse(lt, t0, x, y, w, h, col) {
  var p = clamp01((lt - t0) / 0.8);
  if (p <= 0 || p >= 1) return '';
  var g = 3 * p;
  return rect(x - g, y - g, w + 2 * g, h + 2 * g, 'none', {
    rx: 3 + g,
    stroke: col || C.select,
    sw: 0.9,
    op: (1 - p).toFixed(3),
  });
}

/** A select box showing its value. */
function selectBox(x, y, w, value, o) {
  o = o || {};
  return (
    rect(x, y, w, 9, C.card, { rx: 1.6, stroke: o.stroke || C.line, sw: 0.7 }) +
    txt(x + 3, y + 6.3, value, { size: 4.8, anchor: 'start', weight: 500, fill: o.fill }) +
    '<path d="M' +
    (x + w - 6) +
    ' ' +
    (y + 3.6) +
    'l2 2 2-2" fill="none" stroke="' +
    C.soft +
    '" stroke-width="0.7"/>'
  );
}

/** A small flag icon (Report). */
function flag(x, y, col) {
  col = col || C.red;
  return (
    '<path d="M' +
    x +
    ' ' +
    (y + 6) +
    'V' +
    (y - 6) +
    '" stroke="' +
    C.soft +
    '" stroke-width="0.9"/>' +
    '<path d="M' +
    x +
    ' ' +
    (y - 6) +
    'h7l-1.8 2.6 1.8 2.6h-7z" fill="' +
    col +
    '"/>'
  );
}

/* ---------- Scene 1: private until you share ---------- */
SCENES[1] = function (lt, q) {
  var s = '';
  var tPub = q('public');
  var open = P(lt, tPub, 0.6);
  // The owner and the card.
  s += rise(figure(36, 64, 'OWNER', { s: 1.25 }), P(lt, 0.1, 0.6));
  var cx = 70,
    cy = 36,
    cw = 120,
    ch = 56;
  var glow = P(lt, tPub + 0.3, 0.8);
  if (glow > 0)
    s += rect(cx - 3, cy - 3, cw + 6, ch + 6, C.select, { rx: 5, op: (0.18 * glow).toFixed(3) });
  s += rise(tlCard(cx, cy, cw, ch, { titleSize: 6.4 }), P(lt, 0.2, 0.6));
  // The padlock on the card: closed until the toggle switches.
  s += G(ICON.padlock(cx + cw - 10, cy + 9, 1 - open), {
    o: P(lt, 0.4, 0.5),
    s: 1.2,
    cx: cx + cw - 10,
    cy: cy + 9,
  });
  s += G(
    txt(cx + 6, cy + 20, 'only you can open it', {
      size: 4.8,
      anchor: 'start',
      fill: C.soft,
      weight: 500,
    }),
    {
      o: P(lt, q('only'), 0.5) * (1 - open),
    },
  );
  // Sharing & settings slides out.
  var sp = P(lt, q('ready'), 0.7);
  var px = lerp(330, 204, sp);
  var panel =
    card(px, 30, 108, 64, { title: 'Sharing & settings', titleSize: 6.4 }) +
    txt(px + 6, 26 + 25, 'Visibility', { size: 5.4, anchor: 'start', weight: 700 }) +
    txt(px + 6, 26 + 33, 'Who can view this timeline?', {
      size: 4.6,
      anchor: 'start',
      weight: 500,
      fill: C.soft,
    }) +
    selectBox(px + 6, 26 + 37, 96, open > 0.5 ? 'Public' : 'Private', {
      stroke: open > 0 ? mix(C.line, C.accent, open) : C.line,
      fill: open > 0.5 ? C.accent : C.text,
    }) +
    txt(px + 6, 26 + 56, open > 0.5 ? 'anyone can view it' : 'you and the collaborators you add', {
      size: 4.6,
      anchor: 'start',
      weight: 500,
      fill: C.soft,
    });
  s += G(panel, { o: sp });
  s += pulse(lt, tPub, px + 6, 63, 96, 9, C.select);
  // Light reaches a row of readers.
  var readers = [72, 106, 140, 174, 208, 242];
  var rays = P(lt, q('anyone'), 0.8);
  readers.forEach(function (rx, i) {
    var a = P(lt, q('anyone') + 0.12 * i, 0.6);
    if (rays > 0)
      s += G(
        '<path d="M' +
          (cx + cw / 2) +
          ' ' +
          (cy + ch + 2) +
          'L' +
          rx +
          ' ' +
          122 +
          '" stroke="' +
          C.select +
          '" stroke-width="1.6" stroke-linecap="round"/>',
        { o: 0.28 * a },
      );
    s += rise(figure(rx, 132, 'READER', { s: 0.85 }), a);
  });
  // What a public timeline gives: read it, find it, follow its history.
  var outs = [
    ['read', q('read', 2)],
    ['find it in search', q('search')],
    ['follow its history', q('history')],
  ];
  var ox = 92;
  outs.forEach(function (o) {
    var w = chipWidth(o[0], { size: 5.2 });
    s += rise(chip(ox, 162, o[0], C.accent, { size: 5.2 }), P(lt, o[1], 0.5));
    ox += w + 6;
  });
  return s;
};

/* ---------- Scene 2: links and embeds ---------- */
SCENES[2] = function (lt, q) {
  var s = '';
  var dx = 10,
    dy = 28,
    dw = 150;
  // The share dialog.
  var d = card(dx, dy, dw, 138, { title: 'Share', titleSize: 7 });
  d += txt(dx + 6, dy + 19, TITLE, { size: 5.2, anchor: 'start', weight: 500, fill: C.soft });
  d += txt(dx + 6, dy + 29, 'Link', { size: 5, anchor: 'start', weight: 700 });
  d += rect(dx + 6, dy + 32, 96, 9, C.faint, { rx: 1.6, stroke: C.line });
  d += txt(dx + 9, dy + 38.3, 'timescale.info/rivera/our-town', {
    size: 4.4,
    mono: true,
    anchor: 'start',
    fill: C.soft,
    weight: 500,
  });
  var copied = P(lt, q('link'), 0.4);
  d += button(dx + 106, dy + 38.5, 'Copy link', copied);
  if (copied > 0) d += G(check(dx + 146, dy + 37.4), { o: copied });
  // Three things a link can point to.
  var kinds = [
    ['the whole timeline', q('whole')],
    ['one moment', q('moment')],
    ['this view', q('exactly')],
  ];
  var kx = dx + 6;
  kinds.forEach(function (k) {
    d += rise(chip(kx, dy + 52, k[0], C.select, { size: 4.6 }), P(lt, k[1], 0.45), 4);
    kx += chipWidth(k[0], { size: 4.6 }) + 3;
  });
  // Social buttons.
  var sx = dx + 6;
  ['Facebook', 'X', 'LinkedIn', 'Reddit', 'Bluesky', 'Email'].forEach(function (n) {
    var w = textWidth(n, 4.6) + 6;
    d +=
      rect(sx, dy + 60, w, 8, C.card, { rx: 1.5, stroke: C.line }) +
      txt(sx + w / 2, dy + 65.6, n, { size: 4.6, weight: 500, fill: C.blue });
    sx += w + 2.5;
  });
  // Embed on a website.
  var ep = P(lt, q('embed'), 0.5);
  var e =
    '<path d="M' +
    (dx + 7) +
    ' ' +
    (dy + 77) +
    'l2 2 2-2" fill="none" stroke="' +
    C.text +
    '" stroke-width="0.7" transform="rotate(0)"/>' +
    txt(dx + 14, dy + 80, 'Embed on a website', { size: 5.4, anchor: 'start', weight: 700 }) +
    txt(dx + 6, dy + 91, 'Size', { size: 4.8, anchor: 'start', weight: 500, fill: C.soft }) +
    selectBox(dx + 22, dy + 85, 60, 'Page width × 480') +
    rect(dx + 6, dy + 98, dw - 12, 22, C.faint, { rx: 1.6, stroke: C.line }) +
    txt(dx + 9, dy + 105, '<iframe src="https://timescale.info/', {
      size: 4.4,
      mono: true,
      anchor: 'start',
      weight: 500,
      fill: C.text,
    }) +
    txt(dx + 9, dy + 111, '  embed/8f2c41" width="100%"', {
      size: 4.4,
      mono: true,
      anchor: 'start',
      weight: 500,
      fill: C.text,
    }) +
    txt(dx + 9, dy + 117, '  height="480"></iframe>', {
      size: 4.4,
      mono: true,
      anchor: 'start',
      weight: 500,
      fill: C.text,
    });
  d += G(e, { o: ep });
  s += rise(d, P(lt, 0.1, 0.6));
  // The class page.
  var bx = 178,
    by = 34,
    bw = 134,
    bh = 126;
  var cp = P(lt, q('class'), 0.6);
  var page =
    ICON.browser(bx, by, bw, bh, { url: 'our-school.example/class' }) +
    txt(bx + 8, by + 17, 'Our class page', { size: 7, anchor: 'start', weight: 700 }) +
    rect(bx + 8, by + 22, 90, 2.4, C.faint, { rx: 1.2 }) +
    rect(bx + 8, by + 27, 70, 2.4, C.faint, { rx: 1.2 }) +
    rect(bx + 8, by + 106, 110, 2.4, C.faint, { rx: 1.2 }) +
    rect(bx + 8, by + 111, 80, 2.4, C.faint, { rx: 1.2 });
  // The embed's slot, then the timeline in it.
  var fly = P(lt, q('class') + 0.4, 0.9);
  var landed = P(lt, q('class') + 1.2, 0.6);
  page += rect(bx + 8, by + 34, bw - 16, 66, 'none', {
    rx: 2,
    stroke: C.line,
    dash: '2 1.5',
    op: (1 - landed).toFixed(3),
  });
  // Readers explore it: the view pans under a pointer.
  var ex = P(lt, q('explore'), 2.2);
  var pan = Math.sin(ex * Math.PI) * 10;
  page += G(
    tlCard(bx + 8, by + 34, bw - 16, 66, {
      titleSize: 6,
      moments: TOWN.map(function (f) {
        return clamp01(f + pan / 100);
      }),
      extra: function (ay, xAt) {
        var t = band(xAt(clamp01(0.22 + pan / 100)), xAt(clamp01(0.62 + pan / 100)), ay + 3, '', {
          h: 4,
        });
        t += arc(xAt(clamp01(0.3 + pan / 100)), xAt(clamp01(0.52 + pan / 100)), ay, 1, { h: 7 });
        return t;
      },
    }),
    { o: landed },
  );
  if (ex > 0 && ex < 1)
    page += pointer(bx + 70 + pan * 2, by + 70, { o: Math.min(1, ex * 6, (1 - ex) * 6) });
  s += G(page, { o: cp, tx: (1 - cp) * 10 });
  // The embed code flies across.
  if (fly > 0 && fly < 1) {
    var fx = lerp(dx + 80, bx + 60, fly),
      fy = lerp(dy + 108, by + 66, fly) - Math.sin(fly * Math.PI) * 18;
    s += G(
      rect(fx - 18, fy - 5, 36, 10, C.card, { rx: 2, stroke: C.accent, sw: 0.8 }) +
        txt(fx, fy + 1.7, '<iframe>', { size: 4.8, mono: true, fill: C.accent }),
      {
        o: Math.min(1, fly * 5, (1 - fly) * 5),
      },
    );
  }
  return s;
};

/* ---------- Scene 3: collaborators and roles ---------- */
SCENES[3] = function (lt, q) {
  var s = '';
  // The card at the top, the owner on the left.
  s += rise(tlCard(115, 26, 90, 34, { titleSize: 5.4 }), P(lt, 0, 0.5));
  var tOnly = q('only');
  var own = P(lt, tOnly, 0.5);
  s += figure(36, 50, 'OWNER', { s: 1.2 });
  s += pulse(lt, tOnly, 22, 34, 28, 34, C.accent);
  var team = [
    [
      128,
      'WRITER',
      'saves and reviews',
      q('writer'),
      '@ben',
      'Writer',
      'save changes and merge pull requests',
    ],
    [
      200,
      'CONTRIBUTOR',
      'proposes changes',
      q('contributor'),
      '@ana',
      'Contributor',
      'propose changes',
    ],
    [272, 'VIEWER', 'reads', q('viewer'), '@sam', 'Viewer', 'read'],
  ];
  team.forEach(function (m) {
    var a = P(lt, m[3], 0.9);
    // Walks in from the right.
    s += G(figure(m[0], 80, m[1], { note: m[2] }), { o: clamp01(a * 2), tx: (1 - a) * 40 });
  });
  // The Collaborators list.
  var tp = P(lt, q('username'), 0.6);
  var tx = 100,
    ty = 110,
    tw = 212;
  var t =
    card(tx, ty, tw, 60, { title: 'Collaborators', titleSize: 6 }) +
    txt(tx + tw - 6, ty + 10, 'Username · Access', {
      size: 4.6,
      anchor: 'end',
      weight: 500,
      fill: C.soft,
    });
  // Rows in the order the roles are named.
  [team[2], team[1], team[0]].forEach(function (m, i) {
    var a = P(lt, m[3] + 0.4, 0.5);
    var ry = ty + 22 + i * 13;
    t += G(
      check(tx + 9, ry - 1.6) +
        txt(tx + 16, ry, m[4], { size: 5, anchor: 'start', mono: true, weight: 500 }) +
        txt(tx + 44, ry, m[5], { size: 5.4, anchor: 'start', weight: 700, fill: ROLE[m[1]] }) +
        txt(tx + 82, ry, '— ' + m[6], { size: 5, anchor: 'start', weight: 500, fill: C.soft }),
      { o: a, tx: (1 - a) * 6 },
    );
  });
  s += G(t, { o: tp, ty: (1 - tp) * 6 });
  // Only the owner: who's in, who can see it, whether it's deleted.
  var dec = [
    ['Collaborators', q('whos')],
    ['Visibility', q('see')],
    ['Delete timeline', q('deleted')],
  ];
  dec.forEach(function (d, i) {
    var a = P(lt, d[1], 0.45);
    s += rise(chip(12, 108 + i * 14, d[0], C.accent, { size: 5.2 }), a * own, 4);
  });
  return s;
};

/* ---------- Scene 4: pull requests ---------- */
SCENES[4] = function (lt, q) {
  var s = '';
  var tMerge = q('merges');
  var merged = P(lt, tMerge + 0.9, 0.7);
  // The student and their copy.
  s += figure(22, 44, 'CONTRIBUTOR', { s: 1.05 });
  var ep = P(lt, q('contributors'), 0.6);
  var add1 = P(lt, q('contributors') + 0.5, 0.4),
    add2 = P(lt, q('contributors') + 0.9, 0.4),
    link = P(lt, q('contributors') + 1.3, 0.6);
  var newOnes = function (ay, xAt, a1, a2, lk) {
    var t = '';
    t += arc(xAt(0.41), xAt(0.61), ay, lk, { h: 6, color: C.amber, w: 0.8 });
    t += G(moment(xAt(0.41), ay, { r: 2.1, color: C.amber }), { o: a1, ty: (1 - a1) * -6 });
    t += G(moment(xAt(0.61), ay, { r: 2.1, color: C.amber }), { o: a2, ty: (1 - a2) * -6 });
    return t;
  };
  s += G(
    tlCard(10, 66, 92, 40, {
      title: TITLE + ' · copy',
      titleSize: 5,
      dash: true,
      extra: function (ay, xAt) {
        return newOnes(ay, xAt, add1, add2, link);
      },
    }),
    { o: ep },
  );
  var tPull = q('pull');
  var press = P(lt, tPull - 0.4, 0.4);
  s += G(button(14, 116, 'Submit pull request', press), { o: ep });
  // The Pull requests list.
  var lx = 114,
    ly = 28,
    lw = 106;
  var lp = P(lt, tPull, 0.5);
  var slide = P(lt, tPull + 0.3, 0.8);
  var L = card(lx, ly, lw, 128, { title: 'Pull requests', titleSize: 6.4 });
  // The proposal card, slid from the student.
  var pc =
    rect(0, 0, lw - 12, 24, C.card, { rx: 2, stroke: C.amber, sw: 0.8 }) +
    txt(4, 8, 'Two moments and a link', { size: 5.2, anchor: 'start', weight: 700 }) +
    txt(4, 14.5, '@ana · open', {
      size: 4.6,
      anchor: 'start',
      weight: 500,
      fill: C.soft,
      mono: true,
    }) +
    txt(4, 21, '+2 moments, 1 relationship', {
      size: 4.8,
      anchor: 'start',
      weight: 600,
      fill: C.green,
    });
  var pcx = lerp(14, lx + 6, slide),
    pcy = lerp(100, ly + 16, slide);
  // Discussion with one comment.
  var dp = P(lt, q('discussion'), 0.5);
  L += G(txt(lx + 6, ly + 52, 'Discussion', { size: 5.4, anchor: 'start', weight: 700 }), {
    o: dp,
  });
  var bub =
    rect(lx + 6, ly + 56, lw - 12, 17, mix(C.card, C.blue, 0.08), {
      rx: 3,
      stroke: mix(C.line, C.blue, 0.5),
    }) +
    '<path d="M' +
    (lx + 14) +
    ' ' +
    (ly + 73) +
    'l2 3.5 3-3.5" fill="' +
    mix(C.card, C.blue, 0.08) +
    '" stroke="' +
    mix(C.line, C.blue, 0.5) +
    '" stroke-width="0.6"/>' +
    txt(lx + 10, ly + 63, '@ben', {
      size: 4.6,
      anchor: 'start',
      mono: true,
      weight: 500,
      fill: C.blue,
    }) +
    txt(lx + 10, ly + 69.5, 'Good find. Which year did the mill open?', {
      size: 4.6,
      anchor: 'start',
      weight: 500,
    });
  L += pop(bub, P(lt, q('talks'), 0.5), lx + 20, ly + 70);
  // Merge and Reject.
  var bp = P(lt, q('writer'), 0.5);
  var mp = clamp01((lt - tMerge) / 0.9);
  var mlit = mp > 0 && mp < 1 ? 0.5 + 0.5 * Math.sin(mp * Math.PI * 3) : merged;
  var rlit = P(lt, q('rejects'), 0.3) * (1 - P(lt, q('rejects') + 0.7, 0.3));
  L += G(
    button(lx + 6, ly + 90, 'Merge', mlit) +
      button(lx + 6 + buttonWidth('Merge') + 4, ly + 90, 'Reject', rlit, { fill: C.red }),
    { o: bp },
  );
  L += G(
    txt(lx + 6, ly + 104, 'Merged', { size: 5, anchor: 'start', weight: 700, fill: C.green }) +
      check(lx + 30, ly + 102.4),
    { o: merged },
  );
  s += G(L, { o: lp });
  if (slide > 0)
    s += G(pc, {
      tx: pcx,
      ty: pcy,
      o: Math.min(1, slide * 4) * (1 - P(lt, tMerge + 0.6, 0.5) * 0.5),
    });
  // The writer and the real timeline.
  s += G(figure(300, 44, 'WRITER', { s: 1.05 }), { o: P(lt, q('writer'), 0.6) });
  var rp = P(lt, 0.3, 0.6);
  s += G(
    tlCard(236, 66, 78, 40, {
      titleSize: 5,
      extra: function (ay, xAt) {
        var fall = P(lt, tMerge + 0.9, 0.6);
        var t = '';
        if (fall > 0) {
          t += G(
            arc(xAt(0.41), xAt(0.61), ay, P(lt, tMerge + 1.3, 0.6), {
              h: 6,
              color: C.amber,
              w: 0.8,
            }),
            {},
          );
          t += G(moment(xAt(0.41), ay, { r: 2.1, color: C.amber }), {
            o: fall,
            ty: (1 - fall) * -22,
          });
          var f2 = P(lt, tMerge + 1.1, 0.6);
          t += G(moment(xAt(0.61), ay, { r: 2.1, color: C.amber }), { o: f2, ty: (1 - f2) * -22 });
        }
        return t;
      },
    }),
    { o: rp },
  );
  s += arrow(lx + lw + 2, 86, 233, 86, P(lt, tMerge + 0.3, 0.6), C.green, { w: 1.1 });
  // On a public timeline, anyone signed in can propose.
  var pp = P(lt, q('public'), 0.6);
  var pub = chip(118, 168, 'Public timeline: anyone signed in can propose', C.accent, { size: 5 });
  s += rise(pub, pp, 4);
  [250, 268, 286, 304].forEach(function (fx, i) {
    var a = P(lt, q('signed') + i * 0.12, 0.5);
    s += rise(figure(fx, 138, '', {}), a);
  });
  s += arrow(242, 138, 223, 138, P(lt, q('propose'), 0.5), C.amber, { w: 1.1 });
  return s;
};

/* ---------- Scene 5: forks ---------- */
SCENES[5] = function (lt, q) {
  var s = '';
  var ox = 12,
    oy = 30,
    w = 104,
    h = 46;
  var fx = 206;
  s += figure(30, 96, 'OWNER', { s: 0.9 });
  s += tlCard(ox, oy, w, h, {});
  // The branch line: under and across to the fork.
  var tFork = q('fork', 1);
  var bp = P(lt, tFork, 1.1);
  var d =
    'M' +
    (ox + 70) +
    ' ' +
    (oy + h) +
    'C' +
    (ox + 70) +
    ' ' +
    (oy + h + 30) +
    ' ' +
    (fx + 30) +
    ' ' +
    (oy + h + 30) +
    ' ' +
    (fx + 30) +
    ' ' +
    (oy + h);
  s += drawPath(d, 190, bp, 'stroke="' + C.accent + '" stroke-width="1.3" stroke-linecap="round"');
  s += G(chip(138, oy + h + 26, 'Fork on server', C.accent, { size: 5.2 }), {
    o: P(lt, tFork + 0.5, 0.5),
  });
  var fp = P(lt, tFork + 0.8, 0.6);
  s += pop(
    tlCard(fx, oy, w, h, {
      title: TITLE + " (Ana's fork)",
      titleSize: 5,
      extra: function (ay, xAt) {
        return moment(xAt(0.41), ay, { r: 2.1, color: C.amber });
      },
    }),
    fp,
    fx + w / 2,
    oy + h / 2,
  );
  s += rise(figure(fx + 84, 94, 'OWNER', { s: 0.9, note: 'Ana' }), fp);
  // Sync upstream (original to fork) and Propose saved changes (fork to original).
  var ay1 = oy + 15,
    ay2 = oy + 33;
  var tSync = q('bring');
  var tProp = q('offer');
  var sy = P(lt, tSync, 0.7),
    pr = P(lt, tProp, 0.7);
  s += arrow(ox + w + 3, ay1, fx - 3, ay1, sy, C.blue, { w: 1 });
  s += G(txt((ox + w + fx) / 2, ay1 - 3, 'Sync upstream', { size: 5, weight: 700, fill: C.blue }), {
    o: sy,
  });
  s += arrow(fx - 3, ay2, ox + w + 3, ay2, pr, C.amber, { w: 1 });
  s += G(
    txt((ox + w + fx) / 2, ay2 + 7, 'Propose saved changes', {
      size: 5,
      weight: 700,
      fill: C.amber,
    }),
    { o: pr },
  );
  // Each arrow pulses as it's named.
  var pulseDot = function (t0, xa, xb, y, col) {
    var p = clamp01((lt - t0 - 0.7) / 1.0);
    if (p <= 0 || p >= 1) return '';
    return (
      '<circle cx="' + lerp(xa, xb, smooth(p)) + '" cy="' + y + '" r="1.8" fill="' + col + '"/>'
    );
  };
  s += pulseDot(tSync, ox + w + 3, fx - 3, ay1, C.blue);
  s += pulseDot(tProp, fx - 3, ox + w + 3, ay2, C.amber);
  // A duplicate, by contrast, has no link back.
  var dp = P(lt, q('remembers'), 0.6);
  s += rise(
    G(
      tlCard(236, 124, 72, 30, {
        title: 'Duplicate',
        titleSize: 5,
        color: C.soft,
        stroke: C.line,
        fill: C.faint,
      }) + txt(272, 162, 'no link back', { size: 4.8, fill: C.soft, weight: 500, italic: true }),
      { o: 0.85 },
    ),
    dp,
  );
  // Without an account: Fork in browser, then export.
  var np = P(lt, q('without'), 0.6);
  var bx = 70,
    by = 122;
  var nb =
    figure(bx, by + 14, 'READER', { s: 0.9, note: 'no account' }) +
    ICON.browser(bx + 16, by, 64, 36, { url: 'in this browser' }) +
    tlCard(bx + 20, by + 9, 56, 24, { title: '', moments: [0.2, 0.5, 0.8] }) +
    txt(bx + 48, by + 46, 'Fork in browser', { size: 5.2, weight: 700, fill: C.accent });
  s += rise(nb, np);
  var xp = P(lt, q('export'), 0.6);
  s += arrow(bx + 84, by + 18, bx + 104, by + 18, xp, C.accent);
  s += pop(
    G(ICON.file(bx + 116, by + 18, '.ochx'), { s: 1.2, cx: bx + 116, cy: by + 18 }),
    xp,
    bx + 116,
    by + 18,
  );
  return s;
};

/* ---------- Scene 6: saves that merge, and history ---------- */
SCENES[6] = function (lt, q) {
  var s = '';
  var tSave = q('save');
  // Two writers, two streams of edits.
  s += figure(18, 42, 'WRITER', { s: 0.9 });
  s += figure(18, 112, 'WRITER', { s: 0.9 });
  var mx = 150,
    my = 77;
  var sp = P(lt, tSave, 1.0);
  var top = 'M32 42C90 42 110 ' + my + ' ' + mx + ' ' + my,
    bot = 'M32 112C90 112 110 ' + my + ' ' + mx + ' ' + my;
  s += drawPath(top, 130, sp, 'stroke="' + C.blue + '" stroke-width="1.3"');
  s += drawPath(bot, 130, sp, 'stroke="' + C.blue + '" stroke-width="1.3"');
  var edits = [
    [46, 34, '+ The first school'],
    [46, 104, '~ Railway station: photo'],
  ];
  edits.forEach(function (e, i) {
    s += rise(chip(e[0], e[1], e[2], C.blue, { size: 4.8 }), P(lt, tSave + 0.3 + i * 0.2, 0.5), 3);
  });
  // Their edits merge into one save.
  var mp = P(lt, q('merge'), 0.6);
  s += pop(
    '<circle cx="' +
      mx +
      '" cy="' +
      my +
      '" r="4" fill="' +
      C.green +
      '"/>' +
      check(mx + 0.4, my + 0.6, C.card) +
      drawPath(
        'M' + (mx + 4) + ' ' + my + 'H198',
        50,
        mp,
        'stroke="' + C.green + '" stroke-width="1.3"',
      ),
    mp,
    mx,
    my,
  );
  s += G(txt(mx + 24, my - 4, 'one save', { size: 5, weight: 600, fill: C.green }), { o: mp });
  // The one conflict: the same moment edited two ways.
  var tStop = q('stop');
  var cp = P(lt, q('same'), 0.5);
  s += G(
    chip(56, 60, 'Town hall · 1902', C.red, { size: 4.8 }) +
      chip(56, 88, 'Town hall · 1904', C.red, { size: 4.8 }),
    { o: cp },
  );
  var dpop = P(lt, tStop, 0.5);
  var dx = 36,
    dy = 126,
    dw = 166;
  var dlg =
    card(dx, dy, dw, 40, { title: 'Someone saved this moment first', titleSize: 5.4 }) +
    txt(dx + 6, dy + 18, 'Town hall: yours 1904, saved 1902', {
      size: 4.8,
      anchor: 'start',
      weight: 500,
      fill: C.soft,
    }) +
    button(dx + 6, dy + 31, 'Keep my versions', P(lt, q('keep'), 0.4)) +
    button(dx + 12 + buttonWidth('Keep my versions'), dy + 31, 'Use the saved versions', 0);
  s += pop(dlg, dpop, dx + dw / 2, dy + 20);
  if (dpop > 0)
    s += G(
      drawPath(
        'M' + mx + ' ' + (my + 5) + 'V' + (dy - 2),
        50,
        dpop,
        'stroke="' + C.red + '" stroke-width="0.8" stroke-dasharray="1.5 1.2"',
      ),
      { o: 0.8 },
    );
  // History: every save a revision, newest first.
  var hx = 206,
    hy = 28,
    hw = 106;
  var hp = P(lt, q('revision'), 0.5);
  var H = card(hx, hy, hw, 140, { title: 'History', titleSize: 6.4 });
  var revs = [
    ['Revision 7', 'merged save · now'],
    ['Revision 6', '@ben · today'],
    ['Revision 5', '@ana · pull request merged'],
    ['Revision 4', '@rivera · yesterday'],
    ['Revision 3', '@rivera · last week'],
  ];
  var back = P(lt, q('back'), 0.6);
  revs.forEach(function (r, i) {
    // Stacks up from the bottom, oldest first, so the newest lands on top.
    var k = revs.length - 1 - i;
    var a = P(lt, q('revision') + 0.25 * k, 0.4);
    var ry = hy + 16 + i * 24;
    var sel = i === 3 ? back : 0;
    H += G(
      rect(hx + 5, ry, hw - 10, 20, sel > 0 ? mix(C.card, C.select, 0.2 * sel) : C.card, {
        rx: 2,
        stroke: sel > 0 ? mix(C.line, C.select, sel) : C.line,
      }) +
        txt(hx + 9, ry + 8, r[0], { size: 5.2, anchor: 'start', weight: 700 }) +
        txt(hx + 9, ry + 15.5, r[1], { size: 4.6, anchor: 'start', weight: 500, fill: C.soft }),
      { o: a, ty: (1 - a) * -6 },
    );
  });
  s += G(H, { o: hp });
  s += G(
    txt(hx + hw - 6, hy + 10, 'newest first', {
      size: 4.6,
      anchor: 'end',
      weight: 500,
      fill: C.soft,
    }),
    { o: hp },
  );
  return s;
};

/* ---------- Scene 7: build it together ---------- */
SCENES[7] = function (lt, q) {
  var s = '';
  var cx = 110,
    cy = 56,
    cw = 100,
    ch = 46;
  var glow = P(lt, 0.4, 1.2);
  s += rect(cx - 4, cy - 4, cw + 8, ch + 8, C.select, { rx: 6, op: (0.16 * glow).toFixed(3) });
  s += tlCard(cx, cy, cw, ch, {
    moments: [0.08, 0.2, 0.3, 0.41, 0.52, 0.61, 0.7, 0.8, 0.88, 0.95],
    extra: function (ay, xAt) {
      return arc(xAt(0.41), xAt(0.61), ay, 1, { h: 6, color: C.amber, w: 0.8 });
    },
  });
  s += chip(cx + cw - 30, cy + 9, 'Public', C.accent, { size: 4.6 });
  var cast = [
    [56, 52, 'OWNER'],
    [264, 52, 'WRITER'],
    [40, 116, 'CONTRIBUTOR'],
    [112, 136, 'VIEWER'],
    [208, 136, 'READER'],
    [280, 116, 'CONTRIBUTOR'],
  ];
  cast.forEach(function (m, i) {
    s += rise(figure(m[0], m[1], m[2], { s: 0.95 }), P(lt, 0.1 + i * 0.08, 0.5));
  });
  // Report, small at the edge.
  var rp = P(lt, q('report'), 0.5);
  s += rise(
    flag(250, 158) +
      txt(260, 160, 'Report', { size: 5.4, anchor: 'start', weight: 700, fill: C.red }) +
      txt(260, 167, "to the site's moderators", {
        size: 4.6,
        anchor: 'start',
        weight: 500,
        fill: C.soft,
      }),
    rp,
    4,
  );
  // The end card.
  var e = P(lt, q('build') - 0.3, 0.8);
  s += G(
    rect(-20, -2, 360, 190, C.ground, { op: 0.97 }) +
      txt(160, 70, 'Build it together', { size: 14, weight: 700 }) +
      wordmark(160, 100, 12),
    { o: e, ty: (1 - e) * 8 },
  );
  return s;
};
