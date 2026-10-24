// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 10, Timelines from logs (publicity/10-timelines-from-logs.md): log lines becoming moments,
   the importer's and the live streams' commands as they'd be typed, the real editor on the
   sample incident (samples/incident.mjs) for the investigation, and the guarantees: exact
   times, retention and scale. Scenes are pure functions of scene time lt; q("word") is when
   that word is said. */

/* ---------- helpers ---------- */
var LH = 7.4; // terminal line height
/** A terminal window with a title in its bar. */
function term(x, y, w, h, title) {
  return (
    ICON.terminal(x, y, w, h) +
    (title
      ? txt(x + w / 2, y + 4.3, title, { size: 4.4, mono: true, fill: C.soft, weight: 500 })
      : '')
  );
}
/** Mono text, left-aligned. */
function mono(x, y, s, o) {
  o = o || {};
  // SVG collapses spaces; keep leading ones as no-break spaces.
  s = String(s).replace(/^ +/, function (m) {
    return m.replace(/ /g, '\u00a0');
  });
  return txt(x, y, s, {
    size: o.size || 4.6,
    mono: true,
    anchor: o.anchor || 'start',
    fill: o.fill || C.text,
    weight: o.weight || 500,
    op: o.op,
  });
}
/** A command typed from t0 at `rate` characters a second, with the prompt and a cursor. */
function command(x, y, s, lt, t0, o) {
  o = o || {};
  if (lt < t0) return '';
  var rate = o.rate || 42;
  var n = Math.min(s.length, Math.floor((lt - t0) * rate));
  var size = o.size || 4.6;
  var out =
    (o.cont ? '' : mono(x, y, '$', { fill: C.accent, size: size, weight: 600 })) +
    mono(x + (o.cont ? 0 : size * 0.6 * 2), y, s.slice(0, n), { size: size });
  var typing = n < s.length || o.cursor;
  if (typing && Math.floor(lt * 2.5) % 2 === 0)
    out += rect(
      x + (o.cont ? 0 : size * 1.2) + n * size * 0.6 + 0.4,
      y - size * 0.8,
      size * 0.55,
      size,
      C.accent,
      { op: 0.8 },
    );
  return out;
}
/** When a command typed from t0 finishes. */
function typedBy(s, t0, rate) {
  return t0 + s.length / (rate || 42);
}
/** Linear remapping of scene time through [lt, st] points (clamped at both ends). */
function remap(lt, pts) {
  if (lt <= pts[0][0]) return pts[0][1];
  for (var i = 1; i < pts.length; i++)
    if (lt <= pts[i][0]) {
      var a = pts[i - 1],
        b = pts[i];
      return b[0] === a[0] ? b[1] : lerp(a[1], b[1], (lt - a[0]) / (b[0] - a[0]));
    }
  return pts[pts.length - 1][1];
}
function seeded(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    var x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
var SEV = {
  info: function () {
    return C.soft;
  },
  warning: function () {
    return C.amber;
  },
  err: function () {
    return C.red;
  },
  crit: function () {
    return C.red;
  },
};
function hhmmss(s) {
  // s: seconds after 01:30 UTC.
  var t = 5400 + Math.round(s);
  var pad = function (x) {
    return String(x).padStart(2, '0');
  };
  return pad(Math.floor(t / 3600)) + ':' + pad(Math.floor(t / 60) % 60) + ':' + pad(t % 60);
}
/** A labelled callout chip with a leader line to (tx, ty). */
function callout(x, y, s, color, tx, ty, p, o) {
  o = o || {};
  var size = o.size || 5,
    w = textWidth(s, size, true) * 1.04 + 12;
  var x0 = o.anchor === 'end' ? x - w : o.anchor === 'middle' ? x - w / 2 : x;
  var lead =
    tx === undefined
      ? ''
      : '<path d="M' +
        Math.min(Math.max(tx, x0 + 6), x0 + w - 6) +
        ' ' +
        (y - 7.5) +
        'L' +
        tx +
        ' ' +
        ty +
        '" stroke="' +
        color +
        '" stroke-width="0.7"/>' +
        '<circle cx="' +
        tx +
        '" cy="' +
        ty +
        '" r="1.1" fill="' +
        color +
        '"/>';
  var pill =
    rect(x0, y - 7.5, w, 11, C.card, { rx: 5.5, stroke: color, sw: 0.7 }) +
    txt(x0 + w / 2, y + 0.5, s, { size: size, mono: true });
  return rise(lead + pill, p, 3);
}

/* ---------- Scene 1: every log line is a moment ---------- */
/* Lines in time order across the night (01:30–04:30), shaped like the sample's: steady access
   lines, the disk warnings from 02:10, the database's errors and the 502s of the outage. */
var NIGHT = (function () {
  var rnd = seeded(914),
    n = 120,
    out = [];
  var specials = {};
  for (var k = 0; k < 8; k++) specials[Math.round(((2400 + k * 300) / 10800) * n)] = 85 + 2 * k;
  for (var i = 0; i < n; i++) {
    var s = (i / n) * 10800 + rnd() * 40;
    var host = rnd() < 0.5 ? 'web-1' : 'web-2';
    var line;
    if (i === Math.round((2100 / 10800) * n))
      line = [
        'info',
        'backup-1',
        'cron',
        '(root) CMD (/usr/local/bin/nightly-dump --target db-1:/var/lib/backup)',
      ];
    else if (specials[i] !== undefined)
      line = [
        specials[i] >= 95 ? 'crit' : 'warning',
        'db-1',
        'diskmon',
        '/var/lib disk usage at ' + specials[i] + '%',
      ];
    else if (i === Math.round((4930 / 10800) * n))
      line = [
        'crit',
        'db-1',
        'postgres',
        'could not write to file "pg_wal/xlogtemp": No space left on device',
      ];
    else if (s >= 4930 && s < 6700 && rnd() < 0.85)
      line = [
        'err',
        host,
        'nginx',
        'upstream prematurely closed connection while reading response header (502)',
      ];
    else if (rnd() < 0.08) line = ['info', 'db-1', 'postgres', 'checkpoint complete'];
    else
      line = ['info', host, 'nginx', 'GET /api/orders 200 ' + Math.round(20 + rnd() * 80) + 'ms'];
    out.push({
      s: s,
      sev: line[0],
      text: 'Mar 14 ' + hhmmss(s) + ' ' + line[1] + ' ' + line[2] + ': ' + line[3],
    });
  }
  return out;
})();
SCENES[1] = function (lt, q) {
  var s = '';
  var TX = 14,
    TY = 2,
    TW = 292,
    TH = 84;
  var a0 = P(lt, 0.1, 0.5);
  s += G(term(TX, TY, TW, TH, 'syslog · web-1 web-2 db-1 backup-1'), { o: a0 });
  // When each line arrives: slowly, then faster and faster once the logs are mentioned.
  var fast = q('logs'),
    times = [],
    t = 0.5,
    i;
  for (i = 0; i < NIGHT.length && t < fast; i++) {
    times.push(t);
    t += 0.85;
  }
  // The rest arrive faster and faster (gaps shrinking geometrically), the last just before "moment".
  var rest = NIGHT.length - i,
    span = Math.max(2, q('moment') - 0.6 - t),
    r = 0.975,
    total = (1 - Math.pow(r, rest)) / (1 - r),
    g0 = span / total;
  for (var k2 = 0; i < NIGHT.length; i++, k2++) {
    times.push(t);
    t += g0 * Math.pow(r, k2);
  }
  var newest = -1;
  for (i = 0; i < NIGHT.length; i++) if (times[i] <= lt) newest = i;
  // The terminal's rows, newest at the bottom, scrolling up.
  var rows = 9,
    bottom = TY + 13 + (rows - 1) * LH;
  var slide = newest >= 0 ? 1 - P(lt, times[newest], 0.12) : 0;
  for (var k = 0; k <= rows; k++) {
    var j = newest - k;
    if (j < 0) break;
    var y = bottom - k * LH + slide * LH;
    if (y < TY + 11) continue;
    var ln = NIGHT[j];
    var col = ln.sev === 'info' ? C.text : SEV[ln.sev]();
    var op = k === rows ? 1 - slide : 1;
    var text = ln.text.length > 106 ? ln.text.slice(0, 105) + '…' : ln.text;
    s += mono(TX + 5, y, text, {
      size: 4.4,
      fill: col,
      op: (op * (ln.sev === 'info' ? 0.8 : 1)).toFixed(2),
    });
  }
  // The axis below, three hours wide.
  var AY = 128,
    v = view(24, 296, 0, 10800);
  var ap = P(lt, 0.6, 0.8);
  s += G(
    axis(
      v,
      AY,
      ticksEvery(0, 10800, 1800, function (x) {
        return hhmmss(x).slice(0, 5);
      }),
      { mono: true, tickSize: 4.6 },
    ),
    { o: ap },
  );
  // Dots peel off each line and drop onto the axis; then they pile into summaries.
  var sum = P(lt, q('moment'), 0.9);
  var bins = 12,
    counts = [];
  for (var b = 0; b < bins; b++) counts.push(0);
  var dots = '';
  for (i = 0; i <= newest; i++) {
    var d = NIGHT[i];
    var f = P(lt, times[i] + 0.15, 0.7);
    if (f <= 0) continue;
    var x1 = vx(v, d.s),
      bin = Math.min(bins - 1, Math.floor((d.s / 10800) * bins));
    var bx = vx(v, ((bin + 0.5) / bins) * 10800);
    if (f >= 1) counts[bin]++;
    var x = lerp(TX + 20, x1, f),
      yy = lerp(bottom - 1.6, AY, f * f);
    if (f >= 1) x = lerp(x1, bx, sum);
    var c = SEV[d.sev]();
    var o = f >= 1 ? 1 - sum : 1;
    if (o > 0.01)
      dots +=
        '<circle cx="' +
        x.toFixed(2) +
        '" cy="' +
        yy.toFixed(2) +
        '" r="2" fill="' +
        c +
        '" stroke="' +
        C.ground +
        '" stroke-width="0.5" opacity="' +
        o.toFixed(2) +
        '"/>';
  }
  s += dots;
  if (sum > 0)
    for (b = 0; b < bins; b++)
      if (counts[b])
        s += pop(
          summary(vx(v, ((b + 0.5) / bins) * 10800), AY, counts[b], { r: 4.6 }),
          sum,
          vx(v, ((b + 0.5) / bins) * 10800),
          AY,
        );
  // A legend for the colours.
  var lg = P(lt, 1.2, 0.6),
    items = [
      ['info', C.soft],
      ['warning', C.amber],
      ['error', C.red],
    ],
    lx = 112;
  items.forEach(function (it) {
    s += G(
      '<circle cx="' +
        lx +
        '" cy="' +
        152 +
        '" r="2" fill="' +
        it[1] +
        '"/>' +
        txt(lx + 4, 153.6, it[0], {
          size: 4.8,
          anchor: 'start',
          fill: C.soft,
          weight: 500,
          mono: true,
        }),
      { o: lg },
    );
    lx += 34;
  });
  return s;
};

/* ---------- Scene 2: import what you have ---------- */
var CMD1 = 'export OCH_API_URL=https://timescale.info OCH_API_KEY=och_key_...',
  CMD2 = 'och-import-logs --format syslog --dry-run /var/log/syslog.2.gz',
  CMD3 = 'och-import-logs --format nginx-combined --timeline 6f1c… \\',
  CMD3B = '    /var/log/nginx/access.log*';
SCENES[2] = function (lt, q) {
  var s = '';
  var TX = 8,
    TY = 4,
    TW = 214,
    TH = 56,
    x = TX + 5,
    y0 = TY + 13;
  s += G(term(TX, TY, TW, TH, 'bash'), { o: P(lt, 0, 0.4) });
  var t1 = 0.5,
    t2 = Math.max(typedBy(CMD1, t1) + 0.4, q('point') - 0.2),
    tOut = Math.max(typedBy(CMD2, t2) + 0.3, q('dry') + 0.4),
    t3 = tOut + 1.2;
  var sz = 4.4;
  s += command(x, y0, CMD1, lt, t1, { size: sz, cursor: lt < t2 });
  s += command(x, y0 + LH, CMD2, lt, t2, { size: sz, cursor: lt < tOut });
  var op = P(lt, tOut, 0.4);
  s += G(
    mono(x, y0 + 2 * LH, '{ "entries": 12408, "skipped": 0, … }', { size: sz, fill: C.green }),
    { o: op },
  );
  s += command(x, y0 + 3 * LH, CMD3, lt, t3, { size: sz });
  s += command(x + sz * 1.2, y0 + 4 * LH, CMD3B, lt, typedBy(CMD3, t3), {
    size: sz,
    cont: true,
    cursor: true,
  });
  // The formats, ticking in as they're named.
  var chips = [
    ['syslog', q('sys')],
    ['rfc5424', q('sys') + 0.3],
    ['nginx-combined', q('nginx')],
    ['apache-error', q('apache')],
    ['jsonl', q('json')],
    ['journald', q('journal')],
    ['your own', q('gzipped')],
  ];
  s += G(txt(234, 9, 'FORMATS', { size: 4.6, anchor: 'start', fill: C.soft, ls: 0.5 }), {
    o: P(lt, chips[0][1] - 0.3, 0.4),
  });
  chips.forEach(function (c, i) {
    var p = P(lt, c[1], 0.45),
      cy = 21 + i * 12.6;
    s += G(
      chip(234, cy, c[0], i === 6 ? C.amber : C.accent, { size: 5, mono: i !== 6 }) +
        check(234 + chipWidth(c[0], { size: 5, mono: i !== 6 }) + 6, cy - 1.4, C.green),
      { o: p, tx: (1 - p) * 6 },
    );
  });
  // One entry: its fields become tags and metadata, and it keeps its severity.
  var ep = P(lt, q('each'), 0.6);
  var EY = 70;
  s += G(
    card(TX, EY, TW, 94, {}) +
      txt(TX + 6, EY + 9, 'ONE ACCESS-LOG ENTRY', {
        size: 4.6,
        anchor: 'start',
        fill: C.soft,
        ls: 0.5,
      }) +
      mono(TX + 6, EY + 18, '10.0.4.7 - - [14/Mar/2026:02:53:01 +0000]', {
        size: 4.4,
        fill: C.text,
      }) +
      mono(TX + 6, EY + 24.5, '"GET /api/orders HTTP/1.1" 502 157 "-" "-"', {
        size: 4.4,
        fill: C.text,
      }),
    { o: ep, ty: (1 - ep) * 5 },
  );
  var mp = P(lt, q('each') + 0.9, 0.6);
  var MY = EY + 44,
    MX = TX + 14;
  s += G(
    drawPath(
      'M' + (TX + 20) + ' ' + (EY + 28) + 'V' + (MY - 6),
      12,
      mp,
      'stroke="' + C.arc + '" stroke-width="0.7"',
    ) +
      moment(MX, MY, { color: C.red, r: 3 }) +
      txt(MX + 7, MY + 1.8, 'GET /api/orders → 502', { size: 6, anchor: 'start', weight: 600 }),
    { o: mp },
  );
  var tp = P(lt, q('tags'), 0.5);
  var tx = TX + 6;
  ['http', 'status:5xx', 'method:GET'].forEach(function (tg) {
    s += G(chip(tx, MY + 15, tg, C.accent, { size: 4.6, mono: true }), { o: tp });
    tx += chipWidth(tg, { size: 4.6, mono: true }) + 3;
  });
  var mdp = P(lt, q('metadata'), 0.5);
  s += G(
    mono(TX + 6, MY + 27, 'metadata: client, method, path, status, bytes, …', {
      size: 4.4,
      fill: C.soft,
    }),
    { o: mdp },
  );
  var sp = P(lt, q('severity'), 0.5);
  s += pop(
    chip(tx + 4, MY + 15, 'severity: err', C.red, { size: 4.6, mono: true, solid: true }),
    sp,
    tx + 20,
    MY + 12,
  );
  return s;
};

/* ---------- Scene 3: or stream them live ---------- */
var S3 = {
  hosts: [
    ['web-1', 30],
    ['web-2', 54],
    ['db-1', 78],
  ],
  rx: [86, 38, 72, 32], // receiver box x, y, w, h
  jf: [86, 112, 72, 30], // journald follower box
  rules: [176, 54, 78, 50],
  db: [266, 38, 48, 40],
  web: [266, 96, 48, 40],
};
function box(b, title, sub, p, o) {
  o = o || {};
  return G(
    card(b[0], b[1], b[2], b[3], { stroke: o.stroke || C.accent }) +
      txt(b[0] + b[2] / 2, b[1] + b[3] / 2 - 1, title, { size: 6, weight: 700 }) +
      (sub
        ? txt(b[0] + b[2] / 2, b[1] + b[3] / 2 + 7, sub, {
            size: o.subSize || 4.6,
            fill: C.soft,
            weight: 500,
            mono: o.mono,
          })
        : ''),
    { o: p, s: lerp(0.9, 1, p), cx: b[0] + b[2] / 2, cy: b[1] + b[3] / 2 },
  );
}
/** A point along a polyline at fraction f. */
function along(pts, f) {
  var len = 0,
    seg = [];
  for (var i = 1; i < pts.length; i++) {
    var l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    seg.push(l);
    len += l;
  }
  var d = clamp01(f) * len;
  for (i = 0; i < seg.length; i++) {
    if (d <= seg[i]) {
      var u = seg[i] ? d / seg[i] : 0;
      return [lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u)];
    }
    d -= seg[i];
  }
  return pts[pts.length - 1];
}
function inside(pt, b) {
  return pt[0] > b[0] - 1 && pt[0] < b[0] + b[2] + 1 && pt[1] > b[1] - 1 && pt[1] < b[1] + b[3] + 1;
}
SCENES[3] = function (lt, q) {
  var s = '';
  var rx = S3.rx,
    jf = S3.jf,
    ru = S3.rules,
    db = S3.db,
    web = S3.web;
  var hp = P(lt, 0.2, 0.6),
    rp = P(lt, q('receiver'), 0.6),
    jp = P(lt, q('journal'), 0.6),
    sshp = P(lt, q('ssh'), 0.8),
    rup = P(lt, q('routing'), 0.6),
    tp = P(lt, q('timeline'), 0.6),
    vp = P(lt, q('anyone'), 0.6);
  // Hosts running rsyslog, wired to the receiver.
  S3.hosts.forEach(function (h) {
    s += G(
      ICON.server(22, h[1] + 3) +
        txt(34, h[1] + 1, h[0], { size: 5, anchor: 'start', mono: true }) +
        txt(34, h[1] + 7, 'rsyslog', { size: 4.4, anchor: 'start', fill: C.soft, weight: 500 }),
      { o: hp },
    );
    s += G(
      '<path d="M58 ' +
        h[1] +
        'L' +
        rx[0] +
        ' ' +
        (rx[1] + rx[3] / 2) +
        '" stroke="' +
        C.line +
        '" stroke-width="0.8"/>',
      { o: rp },
    );
  });
  s += box(rx, 'syslog receiver', 'UDP and TCP', rp);
  // The journald follower, here or over SSH.
  s += G(
    ICON.server(22, 131) +
      txt(34, 129, 'server', { size: 5, anchor: 'start', mono: true }) +
      txt(34, 135, 'journald', { size: 4.4, anchor: 'start', fill: C.soft, weight: 500 }),
    { o: jp },
  );
  s += box(jf, 'journald follower', 'journalctl --follow', jp, { mono: true, subSize: 4.4 });
  s += G(
    '<path d="M58 128H' +
      jf[0] +
      '" stroke="' +
      C.amber +
      '" stroke-width="0.8" stroke-dasharray="1.6 1.4"/>' +
      txt(72, 125, 'SSH', { size: 4.6, fill: C.amber, mono: true }),
    { o: sshp },
  );
  // Routing rules.
  var rcx = ru[0] + 5;
  s += G(
    '<path d="M' +
      (rx[0] + rx[2]) +
      ' ' +
      (rx[1] + rx[3] / 2) +
      'L' +
      ru[0] +
      ' ' +
      (ru[1] + 20) +
      'M' +
      (jf[0] + jf[2]) +
      ' ' +
      (jf[1] + jf[3] / 2) +
      'L' +
      ru[0] +
      ' ' +
      (ru[1] + 40) +
      '" stroke="' +
      C.line +
      '" stroke-width="0.8"/>' +
      card(ru[0], ru[1], ru[2], ru[3], { title: 'routing rules', titleSize: 5.6 }) +
      mono(rcx, ru[1] + 20, '"routes": [', { size: 4.4, fill: C.soft }) +
      mono(rcx, ru[1] + 28, ' { "host": "db-*", … },', { size: 4.4, fill: C.blue }) +
      mono(rcx, ru[1] + 36, ' { "host": "web-*", … }', { size: 4.4, fill: C.green }) +
      mono(rcx, ru[1] + 44, ']', { size: 4.4, fill: C.soft }),
    { o: rup },
  );
  // The two timelines, as a viewer's screens: new entries arrive at the right.
  function screen(b, title, col, arrivals) {
    var inner =
      ICON.browser(b[0], b[1], b[2], b[3]) +
      txt(b[0] + 3, b[1] + 12, title, { size: 5.2, anchor: 'start', weight: 700 }) +
      '<path d="M' +
      (b[0] + 3) +
      ' ' +
      (b[1] + 28) +
      'H' +
      (b[0] + b[2] - 3) +
      '" stroke="' +
      C.arc +
      '" stroke-width="0.6"/>';
    arrivals.forEach(function (ta) {
      var age = lt - ta;
      if (age < 0) return;
      var x = b[0] + b[2] - 5 - age * 4.5;
      if (x < b[0] + 4) return;
      var pa = P(lt, ta, 0.3);
      inner +=
        '<circle cx="' +
        x.toFixed(2) +
        '" cy="' +
        (b[1] + 28) +
        '" r="' +
        (1.8 * lerp(1.8, 1, pa)).toFixed(2) +
        '" fill="' +
        col +
        '" opacity="' +
        pa.toFixed(2) +
        '"/>';
    });
    return inner;
  }
  // Packets: from each host to the receiver, then through the rules to their timeline.
  var packets = '',
    dbArr = [],
    webArr = [];
  var srcs = [
    [58, 30, 'web', q('receiver') + 0.3],
    [58, 54, 'web', q('receiver') + 0.7],
    [58, 78, 'db', q('receiver') + 0.5],
    [58, 128, 'db', q('journal') + 0.6],
  ];
  var travel = 2.2,
    rulesOn = q('routing') + 0.4;
  srcs.forEach(function (sr, si) {
    var box1 = si === 3 ? jf : rx;
    var dest = sr[2] === 'db' ? db : web;
    var col = sr[2] === 'db' ? C.blue : C.green;
    var path = [
      [sr[0], sr[1]],
      [box1[0], box1[1] + box1[3] / 2],
      [box1[0] + box1[2], box1[1] + box1[3] / 2],
      [ru[0], ru[1] + (si === 3 ? 40 : 20)],
      [ru[0] + ru[2], ru[1] + ru[3] / 2],
      [dest[0], dest[1] + 28],
    ];
    for (var k = 0; k < 60; k++) {
      var t0 = sr[3] + k * (1.1 + si * 0.17);
      if (t0 > lt) break;
      var f = (lt - t0) / travel;
      // Before the rules exist, packets stop at the receiver (40% of the way).
      var through = t0 + travel * 0.4 >= rulesOn;
      if (!through && f > 0.4) continue;
      if (f >= 1) {
        (sr[2] === 'db' ? dbArr : webArr).push(t0 + travel);
        continue;
      }
      var pt = along(path, f);
      if (inside(pt, box1) || inside(pt, ru)) continue;
      packets +=
        '<circle cx="' +
        pt[0].toFixed(2) +
        '" cy="' +
        pt[1].toFixed(2) +
        '" r="1.3" fill="' +
        (f < 0.55 ? C.amber : col) +
        '"/>';
    }
  });
  s += G(
    '<path d="M' +
      (ru[0] + ru[2]) +
      ' ' +
      (ru[1] + ru[3] / 2) +
      'L' +
      db[0] +
      ' ' +
      (db[1] + 28) +
      'M' +
      (ru[0] + ru[2]) +
      ' ' +
      (ru[1] + ru[3] / 2) +
      'L' +
      web[0] +
      ' ' +
      (web[1] + 28) +
      '" stroke="' +
      C.line +
      '" stroke-width="0.8"/>' +
      screen(db, 'Database', C.blue, dbArr) +
      screen(web, 'Web', C.green, webArr),
    { o: tp },
  );
  s += packets;
  // Someone watching, live.
  s += G(
    ICON.person(290, 156, C.soft) +
      txt(282, 160, 'watching live', { size: 4.6, anchor: 'end', fill: C.soft, weight: 500 }),
    { o: vp },
  );
  return s;
};

/* ---------- the captured app (Scenes 4 and 5) ---------- */
var WX = 12,
  WY = 7,
  WW = 296,
  K = WW / 1920; // frame pixels to stage units
function fx(px) {
  return WX + px * K;
}
function fy(py) {
  return WY + py * K;
}

/* ---------- Scene 4: the night of the outage ---------- */
SCENES[4] = function (lt, q) {
  var s = '';
  var z = q('zoom'),
    story = q('story'),
    both = q('both');
  // Shot time: Fit all held, a zoom to 02:45–03:25, then on into the first seconds of the outage.
  var st = remap(lt, [
    [z - 0.3, 2],
    [story, 8],
    [story + 0.4, 8.5],
    [Math.max(both, story + 3.5), 13.5],
  ]);
  s += appWindow(WX, WY, WW, 'zoom', st);
  // The count in the app's own header.
  var cp = P(lt, q('about'), 0.4) * (1 - P(lt, z - 0.6, 0.4));
  s += G(rect(fx(92), fy(16), 150 * K, 30 * K, 'none', { rx: 1.5, stroke: C.amber, sw: 0.9 }), {
    o: cp,
  });
  s += callout(fx(96), fy(130), '2,297 moments', C.amber, fx(170), fy(46), cp);
  // At the end of the zoom: the 502s and, just before them, the database's errors.
  var rp = P(lt, Math.max(both, story + 3.5) - 0.3, 0.5),
    dp = P(lt, q('critical'), 0.5);
  s += G(
    '<path d="M' +
      fx(830) +
      ' ' +
      fy(570) +
      'H' +
      fx(1860) +
      'M' +
      fx(830) +
      ' ' +
      fy(555) +
      'V' +
      fy(570) +
      'M' +
      fx(1860) +
      ' ' +
      fy(555) +
      'V' +
      fy(570) +
      '" stroke="' +
      C.red +
      '" stroke-width="0.8" fill="none"/>',
    { o: rp },
  );
  s += callout(fx(1345), fy(650), '502 · web-1 and web-2', C.red, fx(1345), fy(570), rp, {
    anchor: 'middle',
    size: 5.4,
  });
  s += callout(fx(690), fy(720), 'crit · db-1', C.red, fx(795), fy(452), dp, {
    anchor: 'middle',
    size: 5.4,
  });
  return s;
};

/* ---------- Scene 5: follow the cause ---------- */
SCENES[5] = function (lt, q) {
  var s = '';
  var sep = q('separate'),
    track = q('track'),
    climb = q('climbing'),
    add = q('add'),
    link = q('link'),
    zEnd = Math.max(climb + 1.2, track + 3.5);
  // The separate shot: the dialog opens (0.5), host:db-1 is ticked (1.5), Separate (3), and the
  // view narrows onto the climb (4 → 10).
  var st = remap(lt, [
    [sep - 0.2, 0.4],
    [sep + 0.6, 1.2],
    [q('database') + 0.2, 1.6],
    [track - 0.4, 2.9],
    [track, 3.3],
    [track + 0.3, 4],
    [zEnd, 10],
  ]);
  // Then the reader: the whole night with the investigator's links, and the root cause open.
  var rd = P(lt, add - 0.2, 0.6);
  var open = P(lt, link - 0.3, 0.5);
  if (rd < 1) s += appWindow(WX, WY, WW, 'separate', st);
  if (rd > 0) {
    s += G(appWindow(WX, WY, WW, 'reader', 0.3), { o: rd * (1 - open) });
    if (open > 0) s += G(appWindow(WX, WY, WW, 'reader', 1.6 + (lt - link)), { o: open });
  }
  // Callouts on the separated track (positions are pixels of the captured frame at 02:03–02:56).
  var before = 1 - rd;
  if (before > 0) {
    var cp = P(lt, Math.max(climb, zEnd - 0.2), 0.5) * before,
      np = P(lt, q('space'), 0.5) * before,
      bp = P(lt, q('backup'), 0.5) * before;
    s += G(
      '<path d="M' +
        fx(296) +
        ' ' +
        fy(620) +
        'H' +
        fx(1487) +
        'M' +
        fx(296) +
        ' ' +
        fy(606) +
        'V' +
        fy(620) +
        'M' +
        fx(1487) +
        ' ' +
        fy(606) +
        'V' +
        fy(620) +
        '" stroke="' +
        C.amber +
        '" stroke-width="0.8" fill="none"/>',
      { o: cp },
    );
    s += callout(fx(890), fy(668), 'disk usage 85% → 99%', C.amber, fx(890), fy(620), cp, {
      anchor: 'middle',
      size: 5.4,
    });
    s += callout(fx(1890), fy(668), 'No space left · PANIC', C.red, fx(1732), fy(470), np, {
      anchor: 'end',
      size: 5.4,
    });
    s += callout(
      fx(60),
      fy(990),
      'backup-1 cron 02:05 · nightly-dump --target db-1:/var/lib/backup',
      C.amber,
      fx(125),
      fy(820),
      bp,
      { size: 4.8 },
    );
  }
  return s;
};

/* ---------- Scene 6: exact times, bounded growth ---------- */
SCENES[6] = function (lt, q) {
  var s = '';
  var W = 98,
    Y = 26,
    H = 118,
    xs = [8, 111, 214];
  var a1 = P(lt, 0.2, 0.6),
    a2 = P(lt, q('growing'), 0.6),
    a3 = P(lt, q(['holds', 'one'], 1, q('growing') + 1), 0.6);
  // (1) The timestamp, converted exactly.
  var x1 = xs[0],
    cx = x1 + W / 2;
  var conv = P(lt, q('exact') + 0.3, 0.8);
  var p1 =
    card(x1, Y, W, H, {}) +
    txt(x1 + 6, Y + 10, 'RSYSLOG TIMESTAMP', {
      size: 4.6,
      anchor: 'start',
      fill: C.soft,
      ls: 0.5,
    }) +
    mono(cx, Y + 30, '2026-10-09T08:15:01', { size: 4.6, anchor: 'middle' }) +
    mono(cx, Y + 37, '.123456+02:00', {
      size: 4.6,
      anchor: 'middle',
      fill: mix(C.text, C.amber, conv),
    }) +
    G(
      drawPath(
        'M' + cx + ' ' + (Y + 44) + 'V' + (Y + 60),
        16,
        conv,
        'stroke="' + C.arc + '" stroke-width="0.8"',
      ) +
        '<path d="M' +
        (cx - 2) +
        ' ' +
        (Y + 58) +
        'l2 2.6 2-2.6" stroke="' +
        C.arc +
        '" stroke-width="0.8" fill="none"/>',
      { o: conv },
    ) +
    G(
      mono(cx, Y + 74, '1791526501', { size: 6.4, anchor: 'middle', fill: C.green, weight: 600 }) +
        mono(cx, Y + 84, '+ 1929/15625', {
          size: 6.4,
          anchor: 'middle',
          fill: C.green,
          weight: 600,
        }) +
        txt(cx, Y + 100, 'microseconds, exactly', { size: 5.2, fill: C.soft, weight: 500 }),
      { o: P(lt, q('exact') + 0.9, 0.6) },
    );
  s += G(p1, { o: a1, ty: (1 - a1) * 6 });
  // (2) Keep only the last 90 days: old moments fall off the left.
  var x2 = xs[1];
  var drop = q('90');
  var p2 =
    card(x2, Y, W, H, {}) +
    txt(x2 + 6, Y + 10, 'RETENTION', { size: 4.6, anchor: 'start', fill: C.soft, ls: 0.5 }) +
    txt(x2 + 6, Y + 26, 'Keep only the last', { size: 5.6, anchor: 'start', weight: 600 }) +
    rect(x2 + 6, Y + 31, 40, 10, C.ground, { rx: 1.6, stroke: C.accent, sw: 0.8 }) +
    mono(x2 + 9, Y + 38, '90 days'.slice(0, Math.max(0, Math.floor((lt - (drop - 0.8)) * 14))), {
      size: 5,
      fill: C.text,
    });
  var ay = Y + 72,
    cut = x2 + 40;
  p2 +=
    '<path d="M' +
    (x2 + 6) +
    ' ' +
    ay +
    'H' +
    (x2 + W - 6) +
    '" stroke="' +
    C.arc +
    '" stroke-width="0.8"/>';
  var cutp = P(lt, drop, 0.5);
  p2 += G(
    '<path d="M' +
      cut +
      ' ' +
      (ay - 12) +
      'V' +
      (ay + 8) +
      '" stroke="' +
      C.amber +
      '" stroke-width="0.8" stroke-dasharray="1.4 1.2"/>',
    { o: cutp },
  );
  for (var i = 0; i < 14; i++) {
    var dx = x2 + 10 + i * 6.2;
    var old = dx < cut;
    var f = old ? P(lt, drop + 0.4 + (cut - dx) * 0.03, 0.9) : 0;
    p2 += G(
      '<circle cx="' + dx + '" cy="' + (ay + f * 26) + '" r="1.8" fill="' + C.moment + '"/>',
      { o: 1 - f },
    );
  }
  p2 += G(
    txt(x2 + W / 2, Y + 100, 'applied about once an hour', {
      size: 4.8,
      fill: C.soft,
      weight: 500,
    }),
    { o: cutp },
  );
  s += G(p2, { o: a2, ty: (1 - a2) * 6 });
  // (3) The limit.
  var x3 = xs[2],
    c3 = x3 + W / 2;
  var p3 =
    card(x3, Y, W, H, {}) +
    txt(x3 + 6, Y + 10, 'SCALE', { size: 4.6, anchor: 'start', fill: C.soft, ls: 0.5 }) +
    txt(c3, Y + 50, '200,000', { size: 17, weight: 700, fill: C.accent, mono: true }) +
    txt(c3, Y + 63, 'moments a timeline', { size: 6, weight: 600 }) +
    txt(c3, Y + 46 - 22, 'UP TO', { size: 4.8, fill: C.soft, ls: 0.5 });
  var lp = P(lt, q('entries'), 0.5);
  p3 += pop(
    chip(
      c3 - chipWidth('operators can change it', { size: 5 }) / 2,
      Y + 88,
      'operators can change it',
      C.amber,
      { size: 5 },
    ),
    lp,
    c3,
    Y + 85,
  );
  s += G(p3, { o: a3, ty: (1 - a3) * 6 });
  return s;
};

/* ---------- Scene 7: point your syslog at it ---------- */
SCENES[7] = function (lt, q) {
  var s = '';
  var line = '*.* @@timeline.example:5514';
  var e = P(lt, Math.max(q('next') - 0.2, typedBy(line, 0.4, 16) + 0.6), 0.9);
  var TX = 70,
    TW = 180,
    TH = 30,
    TY = lerp(58, 26, e);
  s += term(TX, TY, TW, TH, 'rsyslog.conf');
  s += command(TX + 7, TY + 19, line, lt, 0.4, { size: 6, rate: 16, cursor: true, cont: true });
  // The end card, under the line.
  s += G(
    wordmark(160, 100, 16) +
      txt(160, 122, 'docs: log import · syslog · journald', {
        size: 6.5,
        mono: true,
        fill: C.accent,
        weight: 500,
      }) +
      txt(160, 134, 'github.com/openchronology/timeline-app', {
        size: 6,
        mono: true,
        fill: C.soft,
        weight: 500,
      }),
    { o: e, ty: (1 - e) * 6 },
  );
  return s;
};
