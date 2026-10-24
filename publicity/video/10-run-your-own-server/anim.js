// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 10, Run your own server (publicity/10-run-your-own-server.md): the hosting stack
   (CLIENTS → REVERSE PROXY → OPENCHRONOLOGY → POSTGRESQL) stays in place on the left through
   every scene and lights the layer each scene is about, while the right shows the packages,
   the documented commands in terminals, the configuration file, the administration pages and
   the upgrade. Scenes are pure functions of scene time lt; q("word") is when that word is
   said. */

/* ---------- the stack ---------- */
var STACK = { x: 6, w: 82, y: 10, bh: 30, gap: 10 };
var LAYERS = ['CLIENTS', 'REVERSE PROXY', 'OPENCHRONOLOGY', 'POSTGRESQL'];
var DIM = 0.12;
function layerY(i) {
  return STACK.y + i * (STACK.bh + STACK.gap) + STACK.bh / 2;
}
/** The stack with band i lit by lit[i] (0–1); slide[i] (0–1) brings band i in from above. */
function stack(lit, slide) {
  var s = '';
  LAYERS.forEach(function (l, i) {
    var a = lit[i],
      sl = slide ? slide[i] : 1;
    var by = STACK.y + i * (STACK.bh + STACK.gap);
    var band =
      rect(STACK.x, by, STACK.w, STACK.bh, mix(C.faint, mix(C.card, C.accent, 0.24), a), {
        rx: 2.4,
        stroke: mix(C.line, C.accent, a),
        sw: 0.6 + 0.5 * a,
      }) +
      rect(STACK.x, by + 4, 1.6, STACK.bh - 8, C.accent, { rx: 0.8, op: a.toFixed(3) }) +
      txt(STACK.x + STACK.w / 2, by + STACK.bh / 2 + 2.3, l, {
        size: 6.2,
        weight: 700,
        ls: 0.4,
        fill: mix(C.soft, C.text, 0.35 + 0.65 * a),
      });
    // The connector down to the next layer.
    if (i < LAYERS.length - 1) {
      var cx = STACK.x + STACK.w / 2,
        y0 = by + STACK.bh + 1.5,
        y1 = by + STACK.bh + STACK.gap - 1.5;
      var ca = Math.max(a, lit[i + 1]);
      band +=
        '<path d="M' +
        cx +
        ' ' +
        y0 +
        'V' +
        y1 +
        'M' +
        (cx - 2) +
        ' ' +
        (y1 - 2.4) +
        'L' +
        cx +
        ' ' +
        y1 +
        'L' +
        (cx + 2) +
        ' ' +
        (y1 - 2.4) +
        '" fill="none" stroke="' +
        mix(C.line, C.accent, ca) +
        '" stroke-width="0.8" stroke-linecap="round"/>';
    }
    s += G(band, { o: sl, ty: (1 - sl) * -16 });
  });
  return s;
}
/** Lighting that moves through states: steps is [[t, [l0, l1, l2, l3]], ...] from `from`. */
function litSeq(lt, from, steps) {
  var cur = from.slice();
  steps.forEach(function (st) {
    var p = P(lt, st[0], 0.7);
    cur = cur.map(function (v, i) {
      return lerp(v, st[1][i], p);
    });
  });
  return cur;
}
var D = DIM;
// Each scene's lighting at its end, so the next scene starts where it left off.
var LIT_END = {
  1: [1, 1, 1, 1],
  2: [D, D, 1, D],
  3: [D, D, 1, 1],
  4: [1, D, 1, D],
  5: [1, D, 1, D],
  6: [D, D, 1, 1],
};

/* ---------- terminals and files ---------- */
var RX = 98; // left edge of the content beside the stack
var LINE = 9.6;
/** A terminal window: x, y, w, h, an optional title. */
function term(x, y, w, h, title) {
  var s = ICON.terminal(x, y, w, h);
  if (title)
    s += txt(x + w / 2, y + 4.2, title, { size: 4.4, mono: true, fill: C.soft, weight: 500 });
  return s;
}
/** A command typed on from t0 (characters per second cps), with a prompt and a cursor. */
function typed(x, y, cmd, lt, t0, o) {
  o = o || {};
  if (lt < t0 - 0.25) return '';
  var cps = o.cps || 40;
  var n = Math.max(0, Math.min(cmd.length, Math.floor((lt - t0) * cps)));
  var s =
    txt(x, y, '$', { size: 4.8, mono: true, anchor: 'start', fill: C.accent, weight: 600 }) +
    txt(x + 5.8, y, cmd.slice(0, n), {
      size: 4.8,
      mono: true,
      anchor: 'start',
      fill: C.text,
      weight: 500,
    });
  var done = n >= cmd.length;
  var blink = Math.floor(lt * 2.5) % 2 === 0;
  if ((!done || o.cursor) && (blink || !done))
    s += rect(x + 5.8 + n * 2.88 + 0.4, y - 4, 2.4, 5, C.text, { op: 0.8 });
  return s;
}
/** An output line, faded in at t. */
function out(x, y, s, lt, t, col, o) {
  o = o || {};
  return G(
    txt(x, y, s, {
      size: o.size || 4.8,
      mono: true,
      anchor: 'start',
      fill: col || C.soft,
      weight: o.weight || 500,
    }),
    { o: P(lt, t, 0.3) },
  );
}
/** When a command typed from t0 finishes. */
function typedEnd(cmd, t0, cps) {
  return t0 + cmd.length / (cps || 40);
}
function cylinder(x, y, w, h, col) {
  var rx = w / 2,
    ry = w / 6;
  return (
    '<path d="M' +
    (x - rx) +
    ' ' +
    (y - h / 2 + ry) +
    'V' +
    (y + h / 2 - ry) +
    'A' +
    rx +
    ' ' +
    ry +
    ' 0 0 0 ' +
    (x + rx) +
    ' ' +
    (y + h / 2 - ry) +
    'V' +
    (y - h / 2 + ry) +
    '" fill="' +
    C.card +
    '" stroke="' +
    col +
    '" stroke-width="0.8"/>' +
    '<ellipse cx="' +
    x +
    '" cy="' +
    (y - h / 2 + ry) +
    '" rx="' +
    rx +
    '" ry="' +
    ry +
    '" fill="' +
    C.card +
    '" stroke="' +
    col +
    '" stroke-width="0.8"/>'
  );
}
/** A short connector from the stack's edge to a detail beside it. */
function tie(i, p, x1) {
  var y = layerY(i);
  return drawPath(
    'M' + (STACK.x + STACK.w + 2) + ' ' + y + 'H' + (x1 || RX + 4),
    14,
    p,
    'stroke="' + C.accent + '" stroke-width="0.7" stroke-dasharray="1.6 1.2"',
  );
}

/* ---------- Act 1 · The footprint ---------- */

SCENES[1] = function (lt, q) {
  var slide = [0, 1, 2, 3].map(function (i) {
    return P(lt, 0.3 + i * 0.35, 0.6);
  });
  var tApp = q('application'),
    tDb = q(['postgres', 'database']),
    tExt = q('extension'),
    tProxy = q(['https', 'proxy']),
    tCl = q('browsers');
  var lit = litSeq(
    lt,
    [0.25, 0.25, 0.25, 0.25],
    [
      [tApp, [0.25, 0.25, 1, 0.25]],
      [tDb, [0.25, 0.25, 1, 1]],
      [tProxy, [0.25, 1, 1, 1]],
      [tCl, [1, 1, 1, 1]],
    ],
  );
  var keep = stack(lit, slide);
  var s = '',
    x = 116;
  // CLIENTS: browser, desktop app, phone, each on its word.
  var y0 = layerY(0);
  s += tie(0, P(lt, tCl - 0.2, 0.4));
  s += pop(
    ICON.browser(x - 2, y0 - 10, 30, 18) +
      txt(x + 13, y0 + 15, 'browser', { size: 4.8, fill: C.soft, weight: 500 }),
    P(lt, tCl, 0.45),
    x + 13,
    y0,
  );
  s += pop(
    ICON.laptop(x + 56, y0 + 1, 0.95) +
      txt(x + 56, y0 + 15, 'desktop app', { size: 4.8, fill: C.soft, weight: 500 }),
    P(lt, q('desktop'), 0.45),
    x + 56,
    y0,
  );
  s += pop(
    ICON.phone(x + 92, y0 - 1, 19) +
      txt(x + 92, y0 + 15, 'phone', { size: 4.8, fill: C.soft, weight: 500 }),
    P(lt, q('phones'), 0.45),
    x + 92,
    y0,
  );
  // REVERSE PROXY: HTTPS.
  var y1 = layerY(1),
    pp = P(lt, tProxy, 0.45);
  s += tie(1, P(lt, tProxy - 0.2, 0.4));
  s += rise(
    ICON.padlock(x + 4, y1 - 1, 1) +
      txt(x + 14, y1 + 2.4, 'HTTPS', { size: 7, mono: true, anchor: 'start', fill: C.text }),
    pp,
  );
  // OPENCHRONOLOGY: one application.
  var y2 = layerY(2);
  s += tie(2, P(lt, tApp - 0.2, 0.4));
  s += rise(
    ICON.server(x + 4, y2 + 2, { stroke: C.accent }) +
      txt(x + 18, y2 + 2.4, 'Next.js platform · Node.js', { size: 6.6, anchor: 'start' }),
    P(lt, tApp, 0.45),
  );
  // POSTGRESQL: one database, with pgmp.
  var y3 = layerY(3);
  s += tie(3, P(lt, tDb - 0.2, 0.4));
  s += rise(cylinder(x + 4, y3, 12, 15, C.accent), P(lt, tDb, 0.45));
  s += rise(
    txt(x + 18, y3 + 2.4, '+ pgmp: exact rationals', {
      size: 6.6,
      anchor: 'start',
      fill: C.text,
    }),
    P(lt, tExt, 0.45),
  );
  // The licence, last.
  var lic = 'Free software · GPL v3',
    lw = chipWidth(lic, { size: 6 });
  s += pop(
    chip(312 - lw, 87, lic, C.amber, { size: 6 }),
    P(lt, q('connect') + 0.5, 0.45),
    312 - lw / 2,
    85,
  );
  return { svg: s, keep: keep, keepOut: true };
};

SCENES[2] = function (lt, q) {
  var lit = litSeq(lt, LIT_END[1], [[0.2, LIT_END[2]]]);
  var keep = stack(lit);
  var s = '';
  s += tie(2, P(lt, 0.3, 0.5));
  // The platform badges, lit one after another as they're named.
  var badges = [
    ['Debian', q('debian')],
    ['Ubuntu', q('ubuntu')],
    ['Rocky · RHEL', q('rocky')],
    ['Fedora', q('fedora')],
    ['FreeBSD', q('freebsd')],
    ['macOS · Homebrew', q(['homebrew', 'macos'])],
    ['Windows', q('windows')],
  ];
  var bw = 66,
    bh = 15,
    gx = 5,
    gy = 6,
    by0 = 18;
  var appear = P(lt, 0.3, 0.6);
  badges.forEach(function (b, k) {
    var bx = RX + 4 + (k % 3) * (bw + gx),
      by = by0 + Math.floor(k / 3) * (bh + gy);
    var a = P(lt, b[1], 0.4);
    var badge =
      rect(bx, by, bw, bh, mix(C.faint, mix(C.card, C.accent, 0.2), a), {
        rx: 2.2,
        stroke: mix(C.line, C.accent, a),
        sw: 0.6 + 0.4 * a,
      }) +
      '<circle cx="' +
      (bx + 6) +
      '" cy="' +
      (by + bh / 2) +
      '" r="1.4" fill="' +
      mix(C.line, C.accent, a) +
      '"/>' +
      txt(bx + bw / 2 + 2.5, by + bh / 2 + 2.1, b[0], {
        size: 5.8,
        fill: mix(C.soft, C.text, a),
      });
    s += G(badge, {
      o: appear,
      s: lerp(1, 1.05, a * (1 - P(lt, b[1] + 0.4, 0.4))),
      cx: bx + bw / 2,
      cy: by + bh / 2,
    });
  });
  // Docker Compose, set apart for any other system.
  var dx = RX + 4 + bw + gx,
    dy = by0 + 2 * (bh + gy),
    dw = 2 * bw + gx,
    da = P(lt, q('docker'), 0.4);
  s += G(
    rect(dx, dy, dw, bh, mix(C.ground, mix(C.card, C.amber, 0.2), da), {
      rx: 2.2,
      stroke: mix(C.line, C.amber, da),
      sw: 0.7,
      dash: '2 1.4',
    }) +
      txt(dx + 8, dy + bh / 2 + 2.1, 'Docker Compose', {
        size: 5.8,
        anchor: 'start',
        fill: mix(C.soft, C.text, da),
      }) +
      txt(dx + dw - 6, dy + bh / 2 + 2, 'anything else', {
        size: 4.8,
        anchor: 'end',
        fill: C.soft,
        weight: 500,
      }),
    { o: appear },
  );
  // A release's files.
  var fy = 92,
    fp = P(lt, q('release') + 0.2, 0.6);
  var files =
    card(RX + 4, fy, 208, 58, { title: 'Release files', titleSize: 5.6, titleFill: C.soft }) +
    ICON.file(RX + 16, fy + 26, '', { color: C.accent }) +
    txt(RX + 28, fy + 26, 'openchronology-server-ubuntu24.04-amd64.deb', {
      size: 5.2,
      mono: true,
      anchor: 'start',
      weight: 500,
    }) +
    ICON.file(RX + 16, fy + 46, '', { color: C.amber }) +
    txt(RX + 28, fy + 46, 'SHA256SUMS.txt', {
      size: 5.2,
      mono: true,
      anchor: 'start',
      weight: 500,
    });
  s += rise(files, fp);
  var ck = P(lt, q('checksums'), 0.4);
  s += pop(
    '<circle cx="' +
      (RX + 94) +
      '" cy="' +
      (fy + 44.4) +
      '" r="4.2" fill="' +
      mix(C.card, C.green, 0.25) +
      '" stroke="' +
      C.green +
      '" stroke-width="0.7"/>' +
      check(RX + 94, fy + 44.6, C.green) +
      txt(RX + 102, fy + 46, 'verify', { size: 5, anchor: 'start', fill: C.green }),
    ck,
    RX + 94,
    fy + 44,
  );
  return { svg: s, keep: keep, keepIn: true, keepOut: true };
};

/* ---------- Act 2 · Install and configure ---------- */

var DEB = './openchronology-server-ubuntu24.04-amd64.deb';
SCENES[3] = function (lt, q) {
  var tDb = q('database');
  var lit = litSeq(lt, LIT_END[2], [[tDb, LIT_END[3]]]);
  var keep = stack(lit);
  var s = '';
  s += tie(2, P(lt, 0.2, 0.5), RX);
  // The package's terminal.
  var tx = RX,
    ty = 6,
    tw = 216,
    th = 98,
    lx = tx + 5,
    ly = ty + 16;
  s += rise(term(tx, ty, tw, th, 'admin@server: ~'), P(lt, 0, 0.5));
  var c1 = 'sha256sum -c --ignore-missing SHA256SUMS.txt',
    t1 = q('check');
  s += typed(lx, ly, c1, lt, t1);
  s += out(
    lx,
    ly + LINE,
    'openchronology-server-ubuntu24.04-amd64.deb:',
    lt,
    typedEnd(c1, t1) + 0.3,
  );
  s += out(lx + 45 * 2.88 + 2.9, ly + LINE, 'OK', lt, typedEnd(c1, t1) + 0.3, C.green, {
    weight: 700,
  });
  var c2 = 'sudo apt-get install ' + DEB,
    t2 = q('install');
  s += typed(lx, ly + 2 * LINE, c2, lt, t2, { cps: 55 });
  // The first install's steps, as the narration names them.
  var steps = [
    ['service user', q('user')],
    ['configuration', q('configuration')],
    ['database + pgmp', tDb],
  ];
  steps.forEach(function (st, k) {
    var sx = lx + 4 + k * 66,
      a = P(lt, st[1], 0.4);
    s += G(
      check(sx + 2.4, ly + 3 * LINE - 1.6, C.green) +
        txt(sx + 7, ly + 3 * LINE, st[0], {
          size: 4.8,
          mono: true,
          anchor: 'start',
          fill: C.soft,
          weight: 500,
        }),
      { o: a },
    );
  });
  var tRun = q('starts');
  s += out(lx, ly + 4 * LINE, 'OpenChronology is installed and running at', lt, tRun, C.green, {
    weight: 600,
  });
  s += out(lx, ly + 5 * LINE, 'http://localhost:5173.', lt, tRun + 0.1, C.green, { weight: 600 });
  var c3 = 'systemctl is-active openchronology',
    t3 = tRun + 0.8;
  s += typed(lx, ly + 6 * LINE, c3, lt, t3, { cursor: lt < q('docker') - 0.3 });
  s += out(lx, ly + 7 * LINE, 'active', lt, typedEnd(c3, t3) + 0.25, C.green, { weight: 700 });
  // Docker: one command, the database in its own container.
  var dx = RX,
    dy = 114,
    tD = q('docker');
  s += rise(term(dx, dy, 122, 30, 'any system'), P(lt, tD - 0.3, 0.5));
  var cd = 'docker compose up --build --wait';
  s += typed(dx + 6, dy + 19, cd, lt, tD + 0.2, { cps: 30 });
  var tC = q('container'),
    cx = dx + 132;
  [
    ['app', 0],
    ['database', 1],
  ].forEach(function (c) {
    var bx = cx + c[1] * 40,
      a = P(lt, tC - 0.6 + c[1] * 0.5, 0.45);
    var box =
      rect(bx, dy + 4, 34, 26, C.card, {
        rx: 2,
        stroke: c[1] ? C.accent : C.soft,
        sw: 0.8,
        dash: '2 1.2',
      }) +
      (c[1]
        ? cylinder(bx + 17, dy + 14, 9, 10, C.accent)
        : G(ICON.server(bx + 17, dy + 15, { stroke: C.soft }), {
            s: 0.8,
            cx: bx + 17,
            cy: dy + 14,
          })) +
      txt(bx + 17, dy + 27.5, c[0], { size: 4.6, mono: true, fill: C.soft, weight: 500 });
    s += pop(box, a, bx + 17, dy + 17);
  });
  return { svg: s, keep: keep, keepIn: true, keepOut: true };
};

SCENES[4] = function (lt, q) {
  var tReg = q('register');
  var lit = litSeq(lt, LIT_END[3], [
    [0.2, [D, D, 1, D]],
    [tReg, LIT_END[4]],
  ]);
  var keep = stack(lit);
  var s = '';
  s += tie(2, P(lt, 0.2, 0.5));
  // The configuration file, its lines lit in turn.
  var fx = RX + 4,
    fy = 8,
    fw = 122,
    fh = 104;
  s += rise(
    card(fx, fy, fw, fh, { rx: 2 }) +
      rect(fx, fy, fw, 10, C.faint, { rx: 2 }) +
      txt(fx + fw / 2, fy + 6.9, '/etc/openchronology/openchronology.env', {
        size: 4.4,
        mono: true,
        fill: C.soft,
        weight: 500,
      }),
    P(lt, 0, 0.5),
  );
  var tAddr = q('address'),
    tName = q('name'),
    tAdm = q('administrator'),
    tMail = q('email');
  var lines = [
    ['APP_ORIGIN', 'https://timelines.example.org', tAddr],
    ['PLATFORM_NAME', 'Our timelines', tName],
    ['ADMIN_USERNAME', '…', tAdm],
    ['OAUTH_GITHUB_CLIENT_ID', '…', tReg],
    ['RESEND_API_KEY', '…', tMail],
  ];
  var cur = -1;
  lines.forEach(function (l, k) {
    if (lt >= l[2] - 0.1) cur = k;
  });
  lines.forEach(function (l, k) {
    var ly = fy + 26 + k * 17,
      on = P(lt, l[2] - 0.1, 0.35),
      hot = k === cur ? 1 : 0.35;
    var hl = rect(fx + 2, ly - 9, fw - 4, 14, mix(C.card, C.amber, 0.16), {
      rx: 1.4,
      stroke: C.amber,
      sw: 0.5,
      op: (on * hot).toFixed(3),
    });
    s +=
      hl +
      txt(fx + 6, ly - 1.6, l[0] + '=', {
        size: 4.6,
        mono: true,
        anchor: 'start',
        fill: mix(C.soft, C.accent, on),
        weight: 600,
      }) +
      txt(fx + 6, ly + 4.2, l[1], {
        size: 4.6,
        mono: true,
        anchor: 'start',
        fill: mix(C.soft, C.text, on),
        weight: 500,
      });
  });
  // The site, built up by each line.
  var sx = 230,
    sy = 8,
    sw = 84,
    sh = 150;
  s += rise(
    rect(sx, sy, sw, sh, C.card, { rx: 2.4, stroke: C.soft, sw: 0.8 }) +
      rect(sx, sy, sw, 10, mix(C.card, C.soft, 0.25), { rx: 2.4 }),
    P(lt, 0, 0.5),
  );
  var aA = P(lt, tAddr + 0.2, 0.4);
  s += G(
    rect(sx + 4, sy + 2.2, sw - 8, 5.8, C.ground, { rx: 2.9 }) +
      txt(sx + sw / 2, sy + 6.6, 'timelines.example.org', {
        size: 4.4,
        mono: true,
        fill: C.soft,
        weight: 500,
      }),
    { o: aA },
  );
  var aN = P(lt, tName + 0.2, 0.4);
  s += G(
    txt(sx + 6, sy + 22, 'Our timelines', { size: 7.4, anchor: 'start', weight: 700 }) +
      '<path d="M' +
      sx +
      ' ' +
      (sy + 28) +
      'H' +
      (sx + sw) +
      '" stroke="' +
      C.line +
      '" stroke-width="0.6"/>' +
      '<path d="M' +
      sx +
      ' ' +
      (sy + sh - 12) +
      'H' +
      (sx + sw) +
      '" stroke="' +
      C.line +
      '" stroke-width="0.6"/>' +
      txt(sx + sw / 2, sy + sh - 4, 'Powered by OpenChronology', {
        size: 4.6,
        fill: C.soft,
        weight: 500,
      }),
    { o: aN },
  );
  var aD = P(lt, tAdm + 0.2, 0.4);
  s += pop(
    rect(sx + sw - 26, sy + 15, 21, 9, mix(C.card, C.accent, 0.2), {
      rx: 4.5,
      stroke: C.accent,
      sw: 0.6,
    }) +
      txt(sx + sw - 15.5, sy + 21.4, 'admin', { size: 4.6, mono: true, fill: C.text, weight: 600 }),
    aD,
    sx + sw - 15,
    sy + 19,
  );
  // Sign-in: username and password, then the providers, then email recovery.
  var iy = sy + 38;
  s += G(
    txt(sx + 6, iy, 'Sign in', { size: 5.6, anchor: 'start', weight: 700 }) +
      rect(sx + 6, iy + 4, sw - 12, 9, C.ground, { rx: 1.4, stroke: C.line, sw: 0.5 }) +
      txt(sx + 9, iy + 10.4, 'username', {
        size: 4.6,
        anchor: 'start',
        fill: C.soft,
        weight: 500,
      }) +
      rect(sx + 6, iy + 16, sw - 12, 9, C.ground, { rx: 1.4, stroke: C.line, sw: 0.5 }) +
      txt(sx + 9, iy + 22.4, 'password', { size: 4.6, anchor: 'start', fill: C.soft, weight: 500 }),
    { o: P(lt, 0.4, 0.5) },
  );
  var prov = [
    ['Continue with Google', q('google')],
    ['Continue with GitHub', q('github')],
    ['Continue with Facebook', q('facebook')],
  ];
  prov.forEach(function (pv, k) {
    var by = iy + 31 + k * 12,
      a = P(lt, pv[1], 0.4);
    s += rise(
      rect(sx + 6, by, sw - 12, 10, mix(C.card, C.accent, 0.12), {
        rx: 2,
        stroke: C.accent,
        sw: 0.6,
      }) + txt(sx + sw / 2, by + 7, pv[0], { size: 4.8, fill: C.text }),
      a,
      4,
    );
  });
  var aM = P(lt, q('recovery'), 0.4),
    aF = P(lt, q('two'), 0.4);
  s += rise(
    txt(sx + 6, iy + 74, 'Forgot password?', { size: 4.8, anchor: 'start', fill: C.accent }),
    aM,
    4,
  );
  s += rise(
    ICON.padlock(sx + 10, iy + 84, 1) +
      txt(sx + 17, iy + 87, 'Two-factor authentication', {
        size: 4.6,
        anchor: 'start',
        fill: C.soft,
        weight: 500,
      }),
    aF,
    4,
  );
  // Each lit line points at what it changes.
  var targets = [
    [sy + 5, aA],
    [sy + 20, aN],
    [sy + 19, aD],
    [iy + 36, P(lt, tReg, 0.4)],
    [iy + 72, aM],
  ];
  if (cur >= 0) {
    var ly = fy + 26 + cur * 17,
      ty = targets[cur][0];
    var hp =
      P(lt, lines[cur][2], 0.5) *
      (cur === lines.length - 1 ? 1 : 1 - P(lt, lines[cur + 1][2] - 0.2, 0.2));
    s += drawPath(
      'M' +
        (fx + fw + 1) +
        ' ' +
        ly +
        'C' +
        (fx + fw + 6) +
        ' ' +
        ly +
        ' ' +
        (sx - 5) +
        ' ' +
        ty +
        ' ' +
        (sx - 1) +
        ' ' +
        ty,
      14,
      hp,
      'stroke="' + C.amber + '" stroke-width="0.8"',
    );
  }
  return { svg: s, keep: keep, keepIn: true, keepOut: true };
};

/* ---------- Act 3 · Running it ---------- */

SCENES[5] = function (lt, q) {
  var tTell = q('tell');
  var lit = litSeq(lt, LIT_END[4], [
    [0.2, [D, D, 1, D]],
    [tTell, LIT_END[5]],
  ]);
  var keep = stack(lit);
  var s = '';
  s += tie(2, P(lt, 0.2, 0.5));
  var ax = RX + 4,
    aw = 212;
  // Users, with their storage limits.
  var tAcc = q('accounts'),
    tLim = q('storage'),
    tFeat = q('featured'),
    tRep = q(['queue', 'reported']);
  var uw = 108,
    uy = 6;
  s += rise(
    card(ax, uy, uw, 64, { title: 'Users', titleSize: 5.8 }) +
      txt(ax + 46, uy + 10, 'Storage limit', {
        size: 4.6,
        anchor: 'start',
        fill: C.soft,
        weight: 500,
      }),
    P(lt, tAcc - 0.3, 0.5),
  );
  ['ana', 'ben', 'chen'].forEach(function (u, k) {
    var ry = uy + 24 + k * 14,
      a = P(lt, tAcc + k * 0.25, 0.45);
    var lim = P(lt, tLim + k * 0.15, 0.4);
    s += G(
      rect(ax + 4, ry - 6.5, uw - 8, 11, C.faint, { rx: 1.4 }) +
        txt(ax + 8, ry + 0.8, u, { size: 5, mono: true, anchor: 'start', weight: 500 }) +
        G(
          txt(ax + 46, ry + 0.8, '500 MiB', {
            size: 5,
            mono: true,
            anchor: 'start',
            fill: C.amber,
            weight: 600,
          }),
          { o: lim },
        ) +
        button(ax + uw - 31, ry + 0.4, 'Suspend', 0),
      { o: a, tx: (1 - a) * 8 },
    );
  });
  // Timelines, one featured.
  var tlx = ax + uw + 6,
    tlw = aw - uw - 6;
  s += rise(
    card(tlx, uy, tlw, 64, { title: 'Timelines', titleSize: 5.8 }),
    P(lt, tFeat - 0.6, 0.5),
  );
  ['Class history', 'Club archive', 'Field notes'].forEach(function (n, k) {
    var ry = uy + 24 + k * 14,
      a = P(lt, tFeat - 0.4 + k * 0.2, 0.45);
    var f = k === 0 ? P(lt, tFeat + 0.5, 0.4) : 0;
    s += G(
      rect(tlx + 4, ry - 6.5, tlw - 8, 11, C.faint, { rx: 1.4 }) +
        txt(tlx + 8, ry + 0.8, n, { size: 5, anchor: 'start', weight: 500 }) +
        G(txt(tlx + tlw - 34, ry + 1.2, '★', { size: 5.4, fill: C.amber }), { o: f }) +
        button(tlx + tlw - 29, ry + 0.4, 'Feature', f),
      { o: a, tx: (1 - a) * 8 },
    );
  });
  // Reports: two items; one is dismissed and leaves the queue.
  var ry0 = 78;
  s += rise(card(ax, ry0, aw, 46, { title: 'Reports', titleSize: 5.8 }), P(lt, tRep - 0.5, 0.5));
  var tDone = tRep + 1.4,
    gone = P(lt, tDone + 0.35, 0.5);
  var reps = [
    ['Timeline · reported by a reader', 'Dismiss'],
    ['Comment · reported by a reader', 'Dismiss'],
  ];
  reps.forEach(function (r, k) {
    var a = P(lt, tRep - 0.3 + k * 0.25, 0.45);
    var y = ry0 + 22 + k * 14;
    var o = a,
      dx = (1 - a) * 8;
    if (k === 0) {
      o *= 1 - gone;
      dx += gone * 30;
    } else y -= 14 * P(lt, tDone + 0.7, 0.4);
    var press = k === 0 ? P(lt, tDone, 0.2) : 0;
    s += G(
      rect(ax + 4, y - 6.5, aw - 8, 11, C.faint, { rx: 1.4 }) +
        '<circle cx="' +
        (ax + 9) +
        '" cy="' +
        (y - 1) +
        '" r="1.5" fill="' +
        C.red +
        '"/>' +
        txt(ax + 14, y + 0.8, r[0], { size: 5, anchor: 'start', weight: 500 }) +
        button(ax + aw - 30, y + 0.4, r[1], press),
      { o: o, tx: dx },
    );
  });
  var cnt = lt >= tDone + 0.6 ? '1' : '2';
  s += G(
    rect(ax + 34, ry0 + 4, 9, 8, C.red, { rx: 4 }) +
      txt(ax + 38.5, ry0 + 10, cnt, { size: 4.8, fill: C.ground, weight: 700 }),
    { o: P(lt, tRep, 0.4) },
  );
  // The note, held.
  var np = P(lt, q('private') - 0.2, 0.6);
  s += rise(
    rect(ax, 132, aw, 22, mix(C.ground, C.amber, 0.12), { rx: 2.4, stroke: C.amber, sw: 0.8 }) +
      ICON.padlock(ax + 10, 143, 0.6) +
      txt(ax + 19, 145.2, 'Administrators can open private timelines: tell your users.', {
        size: 5.6,
        anchor: 'start',
        fill: C.text,
      }),
    np,
  );
  return { svg: s, keep: keep, keepIn: true, keepOut: true };
};

SCENES[6] = function (lt, q) {
  var tBack = q('back'),
    tIns = q('install'),
    tMig = q('migration');
  var lit = litSeq(lt, LIT_END[5], [
    [0.2, [D, D, 1, D]],
    [tBack, [D, D, D, 1]],
    [tIns, [D, D, 1, D]],
    [tMig, LIT_END[6]],
  ]);
  var keep = stack(lit);
  var s = '';
  var tx = RX + 4,
    ty = 6,
    tw = 210,
    th = 104,
    lx = tx + 13,
    ly = ty + 18;
  s += rise(term(tx, ty, tw, th, 'admin@server: ~'), P(lt, 0, 0.5));
  var cmds = [
    ['sudo -u postgres pg_dump -Fc openchronology > backup.dump', tBack, 3],
    ['sudo apt-get install ./openchronology-server-…-amd64.deb', tIns, 3],
    ['sudo openchronology-migrate', tMig, 3],
  ];
  cmds.forEach(function (c, k) {
    var y = ly + k * 2 * LINE;
    s += G(
      '<circle cx="' +
        (tx + 6.5) +
        '" cy="' +
        (y - 1.6) +
        '" r="3" fill="' +
        C.faint +
        '" stroke="' +
        C.amber +
        '" stroke-width="0.6"/>' +
        txt(tx + 6.5, y + 0.2, String(k + 1), { size: 4.6, fill: C.amber, weight: 700 }),
      { o: P(lt, c[1] - 0.2, 0.3) },
    );
    s += typed(lx, y, c[0], lt, c[1], { cps: 50, cursor: k === 2 && lt < q('restarts') });
  });
  var tDone = q(['restarts', 'schema']);
  s += out(
    lx,
    ly + 5 * LINE,
    'OpenChronology schema installed.',
    lt,
    Math.max(tDone, typedEnd(cmds[2][0], tMig, 50) + 0.3),
    C.green,
    { weight: 600 },
  );
  s += out(
    lx,
    ly + 6 * LINE,
    'OpenChronology restarted.',
    lt,
    Math.max(q('restarts'), typedEnd(cmds[2][0], tMig, 50) + 0.6) + 0.4,
    C.green,
    { weight: 600 },
  );
  // The site's footer: its build moves from one release to the next.
  var fy = 122,
    fp = P(lt, 0.3, 0.5),
    flip = P(lt, Math.max(q('restarts'), typedEnd(cmds[2][0], tMig, 50) + 0.6) + 0.6, 0.6);
  var vx0 = tx + 23;
  s += rise(
    card(tx, fy, tw, 26, {}) +
      txt(tx + 8, fy + 15.5, 'Build:', { size: 5.8, anchor: 'start', fill: C.soft, weight: 500 }) +
      txt(vx0 + 26, fy + 15.5, '· Powered by OpenChronology', {
        size: 5.8,
        anchor: 'start',
        fill: C.soft,
        weight: 500,
      }),
    fp,
  );
  var clip =
    '<clipPath id="vclip"><rect x="' +
    (vx0 - 1) +
    '" y="' +
    (fy + 6) +
    '" width="30" height="14"/></clipPath>';
  s += G(
    clip +
      '<g clip-path="url(#vclip)">' +
      txt(vx0, fy + 15.8 - flip * 12, 'v0.3.0', {
        size: 5.8,
        mono: true,
        anchor: 'start',
        fill: C.text,
        weight: 500,
      }) +
      txt(vx0, fy + 15.8 + (1 - flip) * 12, 'v0.4.0', {
        size: 5.8,
        mono: true,
        anchor: 'start',
        fill: C.green,
        weight: 700,
      }) +
      '</g>',
    { o: fp },
  );
  return { svg: s, keep: keep, keepIn: true, keepOut: true };
};

SCENES[7] = function (lt, q) {
  var lit = LIT_END[6].map(function (v, i) {
    return lerp(v, 1, P(lt, 0.3 + i * 0.25, 0.6));
  });
  var keep = stack(lit);
  var s = '';
  // The whole stack lit, joined to the end card.
  var e = P(lt, q('packages') + 0.3, 0.9);
  s += G(
    drawPath(
      'M' +
        (STACK.x + STACK.w + 3) +
        ' ' +
        layerY(0) +
        'h5V' +
        layerY(3) +
        'h-5M' +
        (STACK.x + STACK.w + 8) +
        ' ' +
        (layerY(0) + layerY(3)) / 2 +
        'h10',
      150,
      e,
      'stroke="' + C.accent + '" stroke-width="0.8" fill="none"',
    ),
    { o: e },
  );
  var cx = 206;
  s += G(
    txt(cx, 58, 'Install the package', { size: 13, weight: 700 }) +
      wordmark(cx, 90, 13) +
      txt(cx, 116, 'docs: Docker deployment · administration', {
        size: 5.6,
        mono: true,
        fill: C.accent,
        weight: 500,
      }),
    { o: e, ty: (1 - e) * 5 },
  );
  return { svg: s, keep: keep, keepIn: true };
};
