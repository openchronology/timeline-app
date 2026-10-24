// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 3, Website, desktop or offline? (publicity/3-website-desktop-or-offline.md): one
   comparison table that stays on screen and fills in column by column (the website, the
   browser without an account, the desktop app, the offline file), then a "your server" column
   and an .ochx file moving through them all. Scenes are pure functions of scene time lt;
   q("word") is when that word is said. The table is returned as the kept layer, so it holds
   still across the cuts while each scene's own drawing fades. */

/* ---------- the table ---------- */
var COL_W = 52, // each edition's column
  LABEL_W = 46, // the row labels
  HEAD_Y = 3, // icons and names
  BODY_Y = 41, // the first row's top
  ROW_H = 20,
  ICON_Y = 19; // centre of the head icons
var TABLE_X4 = (320 - LABEL_W - 4 * COL_W) / 2, // four columns, centred
  TABLE_X5 = (320 - LABEL_W - 5 * COL_W) / 2; // with "your server"
var ROWS = [["Where it's kept"], ['Needs a network'], ['Share and', 'collaborate']];
var COLS = [
  {
    name: 'Website',
    cells: [
      ['the server,', 'private until', 'you share it'],
      ['yes'],
      ['links, embeds,', 'collaborators,', 'forks, history'],
    ],
  },
  {
    name: 'Browser, no account',
    cells: [['only in the', 'open tab'], ['to open the page'], ['export a file']],
  },
  {
    name: 'Desktop app',
    cells: [
      ['.och files on', 'your computer'],
      ['no, only to', 'reach a server'],
      ['connect to up to', 'eight servers'],
    ],
  },
  {
    name: 'Offline file',
    cells: [['only while', "it's open"], ['never'], ['export a file']],
  },
  { name: 'Your server', cells: [] },
];

function colX(x0, i) {
  return x0 + LABEL_W + i * COL_W;
}
function colCx(x0, i) {
  return colX(x0, i) + COL_W / 2;
}
function rowY(r) {
  return BODY_Y + r * ROW_H;
}

/* A tiny timeline (an axis and three moments) inside an icon, drawn to p. */
function tinyTL(cx, cy, w, p) {
  if (p <= 0) return '';
  var s =
    '<path d="M' +
    (cx - w / 2) +
    ' ' +
    cy +
    'h' +
    w * p +
    '" stroke="' +
    C.arc +
    '" stroke-width="0.6"/>';
  [-0.3, 0.05, 0.32].forEach(function (f, i) {
    var a = clamp01(p * 3 - i);
    s += G('<circle cx="' + (cx + f * w) + '" cy="' + cy + '" r="1.1" fill="' + C.moment + '"/>', {
      o: a,
    });
  });
  return s;
}

/* The column heads' icons, centred at (cx, cy); tl is the tiny timeline's progress. */
function headIcon(i, cx, cy, tl) {
  tl = tl || 0;
  if (i === 0)
    return (
      ICON.browser(cx - 14, cy - 9, 28, 18) +
      tinyTL(cx, cy + 4, 18, tl) +
      ICON.cloud(cx + 13, cy - 4, 0.5, { stroke: C.accent })
    );
  if (i === 1) return ICON.browser(cx - 14, cy - 9, 28, 18) + tinyTL(cx, cy + 4, 18, tl);
  if (i === 2) return ICON.laptop(cx, cy + 1, 0.95) + tinyTL(cx, cy, 14, tl);
  if (i === 3)
    return G(ICON.file(cx, cy + 2) + tinyTL(cx - 0.5, cy + 4, 9, tl), { s: 1.05, cx: cx, cy: cy });
  return ICON.server(cx, cy + 2) + tinyTL(cx - 2.5, cy + 1.5, 9, tl);
}

/* Lines of text revealed character by character as p goes 0 → 1. */
function typed(x, y, lines, p, o) {
  var total = 0;
  lines.forEach(function (l) {
    total += l.length;
  });
  var n = Math.round(total * clamp01(p)),
    s = '';
  lines.forEach(function (l, i) {
    var k = Math.min(l.length, n);
    n -= k;
    if (k > 0) s += txt(x, y + i * 5.8, l.slice(0, k), o);
  });
  return s;
}

/* The table. st: { x0, heads (0–1 each), labels, cells[col][row] (0–1), tl[col] (0–1),
   lit[col] (0–1, a highlight round the column), extra (0–1, the fifth column's slide) }. */
function table(st) {
  var x0 = st.x0,
    s = '';
  var ncols = st.extra > 0 ? 5 : 4;
  var right = colX(x0, 4) + (st.extra > 0 ? COL_W * st.extra : 0);
  // Rules: under the heads and between rows.
  var lineOp = st.labels;
  if (lineOp > 0) {
    for (var r = 0; r <= 3; r++) {
      var y = rowY(r) - (r === 0 ? 0 : 0);
      s += G(
        '<path d="M' +
          (x0 + 2) +
          ' ' +
          y +
          'H' +
          (right - 2) +
          '" stroke="' +
          (r === 0 ? C.line : C.faint) +
          '" stroke-width="' +
          (r === 0 ? 0.7 : 0.6) +
          '"/>',
        { o: lineOp },
      );
    }
    for (var c = 1; c < ncols; c++) {
      var cxl = colX(x0, c);
      s += G(
        '<path d="M' +
          cxl +
          ' ' +
          (rowY(0) + 3) +
          'V' +
          (rowY(3) - 3) +
          '" stroke="' +
          C.faint +
          '" stroke-width="0.6"/>',
        { o: lineOp * (c === 4 ? st.extra : 1) },
      );
    }
  }
  // Row labels.
  ROWS.forEach(function (lab, r) {
    var y = rowY(r) + ROW_H / 2 + 2 - (lab.length - 1) * 2.9;
    lab.forEach(function (l, k) {
      s += G(
        txt(x0 + 4, y + k * 5.8, l, { size: 5.2, anchor: 'start', weight: 700, fill: C.soft }),
        {
          o: st.labels,
          tx: (1 - st.labels) * -4,
        },
      );
    });
  });
  // Columns.
  for (var i = 0; i < ncols; i++) {
    var cx = colCx(x0, i),
      ho = i === 4 ? st.extra : st.heads[i];
    var lit = (st.lit && st.lit[i]) || 0;
    if (lit > 0)
      s += rect(
        colX(x0, i) + 1.5,
        HEAD_Y + 1,
        COL_W - 3,
        rowY(3) - HEAD_Y + 1,
        mix(C.ground, C.accent, 0.07),
        {
          rx: 3,
          stroke: C.accent,
          sw: 0.8,
          op: lit,
        },
      );
    if (ho > 0) {
      var hs =
        headIcon(i, cx, ICON_Y, (st.tl && st.tl[i]) || 0) +
        txt(cx, 36, COLS[i].name, {
          size: i === 1 ? 5.2 : 5.6,
          weight: 700,
          fill: i === 4 ? C.accent : C.text,
        });
      s += i === 4 ? G(hs, { o: ho, tx: (1 - ho) * 14 }) : G(hs, { o: ho });
    }
    if (i < 4)
      COLS[i].cells.forEach(function (lines, r) {
        var p = st.cells[i][r];
        if (!p) return;
        var y = rowY(r) + ROW_H / 2 + 1.6 - (lines.length - 1) * 2.9;
        s += typed(cx, y, lines, p, {
          size: 4.6,
          weight: 500,
          fill: r === 1 && i > 0 ? C.text : C.text,
        });
      });
  }
  if (st.extra > 0)
    s += G(
      txt(colCx(x0, 4), rowY(1) + ROW_H / 2 - 1, 'the same', {
        size: 4.6,
        weight: 500,
        fill: C.soft,
        italic: true,
      }) +
        txt(colCx(x0, 4), rowY(1) + ROW_H / 2 + 4.8, 'platform', {
          size: 4.6,
          weight: 500,
          fill: C.soft,
          italic: true,
        }),
      { o: st.extraText || 0 },
    );
  return s;
}

/* The table's state with the first n columns filled. */
function filled(n) {
  var cells = [];
  for (var i = 0; i < 4; i++) cells.push(i < n ? [1, 1, 1] : [0, 0, 0]);
  return {
    x0: TABLE_X4,
    heads: [1, 1, 1, 1],
    labels: 1,
    cells: cells,
    tl: [0, 0, 0, 0, 0],
    extra: 0,
  };
}

/* A cell that types in from cue t over d seconds (d scales with its length). */
function typeP(lt, t, n) {
  return clamp01((lt - t) / (0.25 + 0.035 * n));
}
function cellLen(i, r) {
  return COLS[i].cells[r].join('').length;
}
/* An arrow from (x0, y) to (x1, y), drawn to p. */
function arrow(x0, y0, x1, y1, p, col) {
  col = col || C.accent;
  var s = drawPath(
    'M' + x0 + ' ' + y0 + 'L' + x1 + ' ' + y1,
    Math.hypot(x1 - x0, y1 - y0),
    p,
    'stroke="' + col + '" stroke-width="0.9"',
  );
  if (p > 0.95) {
    var a = Math.atan2(y1 - y0, x1 - x0);
    var h = function (da) {
      return (
        (x1 - 3.4 * Math.cos(a + da)).toFixed(2) + ' ' + (y1 - 3.4 * Math.sin(a + da)).toFixed(2)
      );
    };
    s +=
      '<path d="M' +
      h(0.5) +
      'L' +
      x1 +
      ' ' +
      y1 +
      'L' +
      h(-0.5) +
      '" fill="none" stroke="' +
      col +
      '" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  return s;
}
/* A document icon at scale k with its label beneath. */
function fileIcon(x, y, label, k, col) {
  k = k || 1;
  return (
    G(ICON.file(x, y, '', { color: col }), { s: k, cx: x, cy: y }) +
    (label
      ? txt(x, y + 9 * k + 6, label, {
          size: 4.6 + (k - 1) * 1.2,
          mono: true,
          fill: col || C.accent,
          weight: 600,
        })
      : '')
  );
}
/* A faint connector from a column down to its illustration. */
function tether(i, y1, p) {
  var cx = colCx(TABLE_X4, i);
  return drawPath(
    'M' + cx + ' ' + (rowY(3) + 2) + 'V' + y1,
    y1 - rowY(3),
    p,
    'stroke="' + C.line + '" stroke-width="0.7" stroke-dasharray="1.5 1.5"',
  );
}

/* ---------- scene 1: one editor, four homes ---------- */
/* The editor: a window with a small timeline in it. */
function editor(cx, cy, w, tlOp) {
  var h = w * 0.62;
  var s = ICON.browser(cx - w / 2, cy - h / 2, w, h);
  if (tlOp > 0) {
    var y = cy + h * 0.12,
      x0 = cx - w * 0.38,
      x1 = cx + w * 0.38;
    var inner =
      '<path d="M' +
      x0 +
      ' ' +
      y +
      'H' +
      x1 +
      '" stroke="' +
      C.arc +
      '" stroke-width="' +
      (w / 90).toFixed(2) +
      '"/>' +
      rect(x0 + w * 0.1, y + h * 0.08, w * 0.3, h * 0.09, C.duration, { rx: 0.8 });
    [0.12, 0.38, 0.6, 0.82].forEach(function (f) {
      var mx = x0 + f * (x1 - x0);
      inner +=
        '<path d="M' +
        mx +
        ' ' +
        y +
        'V' +
        (y - h * 0.18) +
        '" stroke="' +
        C.line +
        '" stroke-width="0.5"/>' +
        '<circle cx="' +
        mx +
        '" cy="' +
        y +
        '" r="' +
        (w / 40).toFixed(2) +
        '" fill="' +
        C.moment +
        '"/>';
    });
    s += G(inner, { o: tlOp });
  }
  return s;
}
SCENES[1] = function (lt, q) {
  var s = '';
  var cues = [q('website'), q('browser'), q('desktop'), q('offline')];
  var split = q('several');
  var e0 = P(lt, 0.2, 0.7);
  // The central editor, until its copies have all left.
  var gone = P(lt, cues[3] + 0.2, 0.5);
  s += G(editor(160, 92, 84, 1), { o: e0 * (1 - gone), s: lerp(0.92, 1, e0), cx: 160, cy: 92 });
  // Four copies peel off and travel to the heads.
  var heads = [0, 0, 0, 0];
  for (var i = 0; i < 4; i++) {
    var t0 = Math.max(split + 0.1 * i, cues[i] - 0.5);
    var m = smooth((lt - t0) / 0.9);
    if (lt < t0) continue;
    var tx = colCx(TABLE_X4, i),
      x = lerp(160, tx, m),
      y = lerp(92, ICON_Y, m),
      w = lerp(84, 28, m);
    heads[i] = clamp01((m - 0.75) / 0.25);
    if (m < 1)
      s += G(ICON.browser(x - w / 2, y - (w * 0.62) / 2, w, w * 0.62, { stroke: C.accent }), {
        o: lerp(0.9, 0, heads[i]),
      });
  }
  var st = filled(0);
  st.heads = heads;
  st.labels = P(lt, q('changes'), 0.7);
  return { svg: s, keep: table(st), keepOut: true };
};

/* ---------- scene 2: the website ---------- */
SCENES[2] = function (lt, q) {
  var s = '';
  var st = filled(0);
  st.cells[0] = [
    typeP(lt, q('save'), cellLen(0, 0)),
    typeP(lt, q('sign'), cellLen(0, 1)),
    typeP(lt, q('share'), cellLen(0, 2)),
  ];
  st.lit = [P(lt, 0.1, 0.5) * (1 - P(lt, q.dur - 0.9, 0.5))];
  // The account card, with its padlock.
  var cy = 118,
    ca = P(lt, q('timescale'), 0.6);
  s += G(tether(0, cy, ca), { o: 1 });
  var lock = P(lt, q('private'), 0.5);
  var acct =
    card(60, cy, 92, 40, {}) +
    ICON.person(74, cy + 20, C.soft) +
    txt(86, cy + 15, 'timescale.info', {
      size: 5.6,
      mono: true,
      anchor: 'start',
      fill: C.accent,
      weight: 500,
    }) +
    txt(86, cy + 24, 'Your account', { size: 5, anchor: 'start', fill: C.soft, weight: 500 }) +
    G(ICON.padlock(140, cy + 21, lock), { o: lerp(0.6, 1, lock) }) +
    G(txt(140, cy + 33, 'private', { size: 4.6, fill: C.accent, weight: 700 }), { o: lock });
  s += rise(acct, ca);
  // History: three saves stack up.
  var hx = 168,
    ha = P(lt, q('history'), 0.5);
  s += G(txt(hx, cy + 1, 'History', { size: 5.6, anchor: 'start', weight: 700 }), { o: ha });
  ['Saved · 3rd', 'Saved · 2nd', 'Saved · 1st'].forEach(function (l, k) {
    // The newest lands on top: 1st, then 2nd, then 3rd.
    var order = 2 - k;
    var a = P(lt, q('history') + 0.15 + order * 0.35, 0.45);
    var y = cy + 5 + k * 11;
    s += G(
      card(hx, y, 62, 9, { rx: 1.6 }) +
        '<circle cx="' +
        (hx + 5) +
        '" cy="' +
        (y + 4.5) +
        '" r="1.4" fill="' +
        C.moment +
        '"/>' +
        txt(hx + 9, y + 6.3, l, { size: 4.6, anchor: 'start', weight: 500 }),
      { o: a, ty: (1 - a) * -8 },
    );
  });
  // The honest note.
  var na = P(lt, q('honest'), 0.6),
    nb = P(lt, q('people'), 0.5);
  var nx = 238;
  s += rise(
    check(nx + 2, cy + 9) +
      txt(nx + 7, cy + 11, 'hidden from', { size: 4.6, anchor: 'start', weight: 500 }) +
      txt(nx + 7, cy + 17, 'other users', { size: 4.6, anchor: 'start', weight: 700 }),
    na,
  );
  s += rise(
    cross(nx + 2, cy + 29, C.red, 1.8) +
      txt(nx + 7, cy + 30, 'not from its', { size: 4.6, anchor: 'start', weight: 500 }) +
      txt(nx + 7, cy + 36, 'administrators', { size: 4.6, anchor: 'start', weight: 700 }),
    nb,
  );
  return { svg: s, keep: table(st), keepIn: true, keepOut: true };
};

/* ---------- scene 3: in the browser, no account ---------- */
SCENES[3] = function (lt, q) {
  var s = '';
  var st = filled(1);
  st.cells[1] = [
    typeP(lt, q('lives'), cellLen(1, 0)),
    typeP(lt, q('browser'), cellLen(1, 1)),
    typeP(lt, q('export'), cellLen(1, 2)),
  ];
  st.lit = [0, P(lt, 0.1, 0.5) * (1 - P(lt, q.dur - 0.9, 0.5))];
  var cy = 112;
  var a = P(lt, q('start'), 0.6);
  s += tether(1, cy + 2, a);
  // The tab, its timeline and the banner.
  var tx = 112,
    tw = 64,
    th = 42;
  var close = q('close');
  // The tab flickers as if closing, and the timeline in it fades.
  var fl = lt > close && lt < close + 0.9 ? 0.55 + 0.45 * Math.cos((lt - close) * 22) : 1;
  var tlFade = 1 - 0.75 * P(lt, close, 0.9);
  var tab =
    G(ICON.browser(tx - tw / 2, cy + 4, tw, th), { o: fl }) +
    G(editorTL(tx, cy + 31, tw * 0.72), { o: tlFade * fl });
  s += rise(tab, a);
  // The banner pulses.
  var ba = P(lt, q('lives'), 0.5);
  var pulse = lt > q('close') ? 0.5 + 0.5 * Math.sin((lt - q('close')) * 5) : 0;
  s += G(
    rect(tx - tw / 2 - 4, cy + 12, tw + 8, 9, mix(C.card, C.amber, 0.2 + 0.25 * pulse), {
      rx: 1.6,
      stroke: C.amber,
      sw: 0.7,
    }) + txt(tx, cy + 18.3, 'In-memory timeline.', { size: 5, weight: 600 }),
    { o: ba },
  );
  // The arrow to an .ochx file.
  var ea = P(lt, q('export'), 0.7);
  s += arrow(tx + tw / 2 + 4, cy + 25, tx + tw / 2 + 30, cy + 25, ea);
  s += pop(
    fileIcon(tx + tw / 2 + 42, cy + 24, '.ochx'),
    P(lt, q('export') + 0.5, 0.5),
    tx + tw / 2 + 42,
    cy + 26,
  );
  // Signed in: drafts in this browser.
  var da = P(lt, q('drafts'), 0.6);
  var dl = 'Signed in: drafts kept in this browser';
  s += rise(chip(196, cy + 26, dl, C.accent, { size: 5 }), da);
  return { svg: s, keep: table(st), keepIn: true, keepOut: true };
};
/* A small timeline inside a window. */
function editorTL(cx, y, w) {
  var s =
    '<path d="M' +
    (cx - w / 2) +
    ' ' +
    y +
    'h' +
    w +
    '" stroke="' +
    C.arc +
    '" stroke-width="0.7"/>';
  [0.15, 0.42, 0.7, 0.88].forEach(function (f, i) {
    s += moment(cx - w / 2 + f * w, y, { r: 1.8, color: i === 2 ? C.strong : C.moment });
  });
  return s;
}

/* ---------- scene 4: the desktop app ---------- */
function folderBack(x, y, w, h) {
  return (
    '<path d="M' +
    x +
    ' ' +
    y +
    'h14l3 4h' +
    (w - 17) +
    'v' +
    (h - 4) +
    'h' +
    -w +
    'z" fill="' +
    mix(C.card, C.amber, 0.3) +
    '" stroke="' +
    C.amber +
    '" stroke-width="0.8"/>'
  );
}
function folderFront(x, y, w, h) {
  return rect(x, y + 12, w, h - 12, mix(C.card, C.amber, 0.18), {
    rx: 0.8,
    stroke: C.amber,
    sw: 0.8,
  });
}
SCENES[4] = function (lt, q) {
  var s = '';
  var st = filled(2);
  st.cells[2] = [
    typeP(lt, q('files'), cellLen(2, 0)),
    typeP(lt, q('network'), cellLen(2, 1)),
    typeP(lt, q('share'), cellLen(2, 2)),
  ];
  st.lit = [0, 0, P(lt, 0.1, 0.5) * (1 - P(lt, q.dur - 0.9, 0.5))];
  var cy = 104;
  s += tether(2, cy, P(lt, q('desktop'), 0.6));
  // Badges: Windows, macOS, Linux.
  var names = ['Windows', 'macOS', 'Linux'],
    bw = names.map(function (n) {
      return chipWidth(n, { size: 5 });
    });
  var bx = 160 - (bw[0] + bw[1] + bw[2] + 8) / 2;
  names.forEach(function (n, k) {
    s += rise(
      chip(bx, cy + 13, n, C.accent, { size: 5 }),
      P(lt, q(n === 'macOS' ? ['macos', 'mac'] : n.toLowerCase()), 0.4),
    );
    bx += bw[k] + 4;
  });
  // The folder and its three .och files.
  var fx = 54,
    fy = 132,
    fa = P(lt, q('files'), 0.5);
  var fold = folderBack(fx, fy, 54, 30);
  for (var k = 0; k < 3; k++) {
    var t0 = q('files') + 0.3 + k * 0.3,
      d = P(lt, t0, 0.5);
    if (d <= 0) continue;
    var x = fx + 13 + k * 14,
      y = lerp(fy - 22, fy + 10, d);
    fold += G(ICON.file(x, y, ''), { o: d, s: 0.85, cx: x, cy: y });
  }
  fold +=
    folderFront(fx, fy, 54, 30) +
    txt(fx + 27, fy + 25, '.och files', { size: 5, mono: true, fill: C.text, weight: 500 });
  s += rise(fold, fa);
  // The app, its cable and its timeline.
  var ax = 160,
    ay = 144,
    aa = P(lt, q('desktop'), 0.6);
  var added = P(lt, q('all') + 0.2, 0.5);
  var tl =
    '<path d="M' + (ax - 15) + ' ' + (ay - 2) + 'h30" stroke="' + C.arc + '" stroke-width="0.6"/>';
  [-10, -3, 5].forEach(function (dx) {
    tl += '<circle cx="' + (ax + dx) + '" cy="' + (ay - 2) + '" r="1.3" fill="' + C.moment + '"/>';
  });
  tl += G(
    '<circle cx="' + (ax + 11) + '" cy="' + (ay - 2) + '" r="1.5" fill="' + C.select + '"/>',
    { o: added, s: lerp(2, 1, added), cx: ax + 11, cy: ay - 2 },
  );
  s += pop(ICON.laptop(ax, ay, 1.45) + tl, aa, ax, ay);
  // The network cable unplugs, and the app keeps working.
  var un = P(lt, q('no') - 0.1, 0.6),
    cabOut = 1 - P(lt, q('share') - 0.4, 0.5);
  var plugX = ax + 22 + 14 * un;
  var cable =
    '<path d="M' +
    (ax + 18) +
    ' ' +
    (ay + 4) +
    'H' +
    (ax + 26) +
    '" stroke="' +
    C.soft +
    '" stroke-width="1"/>' +
    rect(ax + 26, ay + 1.5, 3, 5, C.soft, { rx: 0.5 }) +
    rect(plugX + 8, ay + 1.5, 4, 5, C.soft, { rx: 0.5 }) +
    '<path d="M' +
    (plugX + 12) +
    ' ' +
    (ay + 4) +
    'H' +
    (plugX + 26) +
    '" stroke="' +
    C.soft +
    '" stroke-width="1"/>';
  s += G(cable + G(ICON.network(ax + 46, ay - 10, un), { o: un }), { o: aa * cabOut });
  // Then lines to two servers.
  var servers = [
    [264, 122, 'timescale.info', q('timescale')],
    [264, 156, 'your own server', q('own', 2)],
  ];
  servers.forEach(function (sv) {
    var p = P(lt, sv[3] - 0.3, 0.6);
    s += drawPath(
      'M' + (ax + 22) + ' ' + (ay - 3) + 'L' + (sv[0] - 12) + ' ' + (sv[1] - 3),
      90,
      p,
      'stroke="' + C.accent + '" stroke-width="0.8"',
    );
    s += pop(
      ICON.server(sv[0], sv[1]) +
        txt(sv[0] + 11, sv[1] - 1, sv[2], {
          size: 4.6,
          anchor: 'start',
          mono: sv[2] === 'timescale.info',
          fill: C.text,
          weight: 500,
        }),
      P(lt, sv[3], 0.5),
      sv[0],
      sv[1],
    );
  });
  return { svg: s, keep: table(st), keepIn: true, keepOut: true };
};

/* ---------- scene 5: the offline file ---------- */
SCENES[5] = function (lt, q) {
  var s = '';
  var st = filled(3);
  st.cells[3] = [
    typeP(lt, q('nothing'), cellLen(3, 0)),
    typeP(lt, q('never'), cellLen(3, 1)),
    typeP(lt, q('export'), cellLen(3, 2)),
  ];
  st.lit = [0, 0, 0, P(lt, 0.1, 0.5) * (1 - P(lt, q.dur - 0.9, 0.5))];
  var cy = 140;
  s += tether(3, 108, P(lt, q('html'), 0.6));
  // The HTML file and its struck-out network.
  var fx = 112,
    fa = P(lt, q('html'), 0.6);
  s += pop(fileIcon(fx, cy - 4, '.html', 1.6), fa, fx, cy);
  var ns = P(lt, q('never'), 0.5);
  s += G(ICON.network(fx + 30, cy - 14, ns), { o: fa, s: 1.2, cx: fx + 30, cy: cy - 14 });
  // The USB stick, and the copy sliding onto it.
  var ux = 218,
    uy = cy - 2,
    ua = P(lt, q('carry') - 0.3, 0.5);
  var stick =
    rect(ux - 26, uy - 11, 44, 22, C.soft, { rx: 3 }) +
    rect(ux + 18, uy - 6.5, 10, 13, C.line, { rx: 0.8, stroke: C.soft, sw: 0.6 }) +
    rect(ux + 21, uy - 3.5, 2.2, 2.2, C.soft) +
    rect(ux + 21, uy + 1.3, 2.2, 2.2, C.soft);
  s += pop(stick, ua, ux, uy);
  var cp = smooth((lt - q('stick')) / 1.1);
  if (lt > q('stick')) {
    var x = lerp(fx, ux - 6, cp),
      y = lerp(cy - 4, uy - 1, cp) - Math.sin(cp * Math.PI) * 18;
    s += G(ICON.file(x, y, ''), { s: lerp(1.6, 0.95, cp), cx: x, cy: y });
  }
  return { svg: s, keep: table(st), keepIn: true, keepOut: true };
};

/* ---------- scene 6: one file format ---------- */
SCENES[6] = function (lt, q) {
  var s = '';
  var st = filled(4);
  // The "your server" column slides in; the table shifts to make room.
  var ex = P(lt, q('own') - 0.6, 0.9);
  st.extra = ex;
  st.extraText = P(lt, q('platform') - 0.2, 0.5);
  st.x0 = lerp(TABLE_X4, TABLE_X5, smooth((lt - (q('own') - 0.6)) / 0.9));
  // The file's stops: every column in turn, then offline → website → your server.
  var stops = [
    [0, q('opens')],
    [1, q('opens') + 0.8],
    [2, q('opens') + 1.6],
    [3, q('opens') + 2.4],
    [3, q('start')],
    [0, q('finish')],
    [4, q('own')],
  ];
  var tl = [0, 0, 0, 0, 0],
    lit = [0, 0, 0, 0, 0];
  var fileY = 116;
  var pos = null;
  for (var k = 0; k < stops.length; k++) {
    var c = stops[k][0],
      t = stops[k][1];
    if (lt >= t) tl[c] = Math.max(tl[c], P(lt, t + 0.25, 0.6));
  }
  // Where the file is: hopping between stops along arcs below the table.
  var hop = 0.55;
  for (var j = 0; j < stops.length; j++) {
    var arrive = stops[j][1];
    var next = j + 1 < stops.length ? stops[j + 1][1] : Infinity;
    if (lt < arrive && j === 0) break;
    if (lt >= arrive && lt < next) {
      var xFrom = colCx(st.x0, stops[j][0]);
      var leave = next - hop;
      if (j + 1 < stops.length && lt > leave) {
        var m = smooth((lt - leave) / hop);
        var xTo = colCx(st.x0, stops[j + 1][0]);
        var far = Math.abs(stops[j + 1][0] - stops[j][0]);
        pos = [lerp(xFrom, xTo, m), fileY + Math.sin(m * Math.PI) * (6 + 4 * far)];
      } else {
        pos = [xFrom, fileY];
        lit[stops[j][0]] = 1 - P(lt, Math.min(next - hop, arrive + 1.2), 0.3);
        lit[stops[j][0]] = Math.min(lit[stops[j][0]], P(lt, arrive - 0.15, 0.25));
      }
      break;
    }
  }
  st.tl = tl;
  st.lit = lit;
  // The loop path the file follows, faintly.
  var loopA = P(lt, q('opens') - 0.3, 0.8);
  var y0 = fileY + 2;
  var lp = 'M' + colCx(st.x0, 0) + ' ' + y0;
  for (var c2 = 1; c2 <= (ex > 0 ? 4 : 3); c2++)
    lp +=
      'Q' +
      (colCx(st.x0, c2 - 1) + COL_W / 2) +
      ' ' +
      (y0 + 12) +
      ' ' +
      colCx(st.x0, c2) +
      ' ' +
      y0;
  s += drawPath(
    lp,
    280,
    loopA,
    'stroke="' + C.line + '" stroke-width="0.7" stroke-dasharray="1.6 1.6"',
  );
  if (pos) s += G(fileIcon(pos[0], pos[1] - 2, '.ochx'), { o: P(lt, q('opens') - 0.4, 0.4) });
  // What travels with it.
  var parts = [
    ['display settings', q('display')],
    ['plugins', q('plugins')],
    ['copies of pictures', q('pictures')],
  ];
  var widths = parts.map(function (p) {
    return chipWidth(p[0], { size: 5 });
  });
  var cxp = 160 - (widths[0] + widths[1] + widths[2] + 8) / 2;
  parts.forEach(function (p, k) {
    var a = P(lt, p[1], 0.45) * (1 - P(lt, q('start') - 0.3, 0.5));
    s += rise(chip(cxp, 150, p[0], C.accent, { size: 5 }), a);
    cxp += widths[k] + 4;
  });
  // Free server packages.
  var fa = P(lt, q('free'), 0.5);
  s += rise(
    chip(
      160 - chipWidth('Free server packages', { size: 5 }) / 2,
      150,
      'Free server packages',
      C.accent,
      { size: 5, solid: false },
    ),
    fa,
  );
  return { svg: s, keep: table(st), keepIn: true };
};

/* ---------- scene 7: choose ---------- */
SCENES[7] = function (lt, q) {
  var s = '';
  var lines = [
    ['Share it', 'the website', q('share'), 0],
    ['Keep it on your computer', 'the desktop app', q('keep'), 2],
    ['Never online', 'the offline file', q('offline'), 3],
  ];
  lines.forEach(function (l, k) {
    var y = 36 + k * 28,
      a = P(lt, l[2], 0.5);
    s += G(
      headIcon(l[3], 82, y, 1) +
        txt(112, y + 2.4, l[0], { size: 8, anchor: 'start', weight: 600 }) +
        txt(202, y + 2.4, '→', { size: 8, fill: C.soft, weight: 500 }) +
        txt(212, y + 2.4, l[1], { size: 8, anchor: 'start', fill: C.accent, weight: 700 }) +
        G(check(56, y, C.green), { o: P(lt, l[2] + 0.3, 0.3), s: 1.5, cx: 56, cy: y }),
      { o: a, tx: (1 - a) * -10 },
    );
  });
  var da = P(lt, q('download'), 0.6);
  s += rise(
    '<path d="M100 120H220" stroke="' +
      C.line +
      '" stroke-width="0.6"/>' +
      txt(160, 138, 'Download · timescale.info', { size: 9, weight: 700 }),
    da,
  );
  return s;
};
