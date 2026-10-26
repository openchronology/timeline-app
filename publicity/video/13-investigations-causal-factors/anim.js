// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Video 13, Investigations: from timeline to causal factors
   (publicity/13-investigations-causal-factors.md): an events and causal factors chart drawn as
   the method draws it, then built in the real editor on a made-up case
   (samples/investigation.mjs): the sequence at exact times, conditions as durations, the
   collision's moment stack, relationships and Separate all connected, the causal factors, where
   the app approximates the chart, Compare with the written procedure
   (samples/investigation-procedure.mjs), and review and privacy. Scenes are pure functions of
   scene time lt; q("word") is when that word is said. */

/* ---------- helpers ---------- */
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
/** A labelled callout chip with a leader line to (tx, ty), after Video 10's. */
function callout(x, y, s, color, tx, ty, p, o) {
  o = o || {};
  var size = o.size || 5,
    w = textWidth(s, size, o.mono) * (o.mono ? 1.04 : 1) + 12;
  var x0 = o.anchor === 'end' ? x - w : o.anchor === 'middle' ? x - w / 2 : x;
  var ly = ty > y ? y + 3.5 : y - 7.5;
  var lead =
    tx === undefined
      ? ''
      : '<path d="M' +
        Math.min(Math.max(tx, x0 + 6), x0 + w - 6) +
        ' ' +
        ly +
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
    txt(x0 + w / 2, y + 0.5, s, { size: size, mono: o.mono });
  return rise(lead + pill, p, 3);
}
/** An outline ring around a box of the captured frame (frame pixels), drawn to p. */
function ring(x, y, w, h, color, p) {
  return G(rect(fx(x), fy(y), w * K, h * K, 'none', { rx: 1.5, stroke: color, sw: 0.9 }), { o: p });
}
/** ECF's symbols, as the method draws them. */
function eventBox(cx, cy, w, h, label, o) {
  o = o || {};
  return (
    rect(cx - w / 2, cy - h / 2, w, h, o.fill || C.card, {
      rx: 0.8,
      stroke: o.stroke || C.moment,
      sw: o.sw || 0.8,
      dash: o.dash,
    }) +
    (label
      ? txt(cx, cy + 1.8, label, { size: o.size || 5, weight: 600, fill: o.textFill || C.text })
      : '')
  );
}
function oval(cx, cy, rx, ry, label, o) {
  o = o || {};
  return (
    '<ellipse cx="' +
    cx +
    '" cy="' +
    cy +
    '" rx="' +
    rx +
    '" ry="' +
    ry +
    '" fill="' +
    (o.fill || C.card) +
    '" stroke="' +
    (o.stroke || C.amber) +
    '" stroke-width="' +
    (o.sw || 0.8) +
    '"' +
    (o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') +
    '/>' +
    (label ? txt(cx, cy + 1.7, label, { size: o.size || 4.8, weight: 600 }) : '')
  );
}
function diamond(cx, cy, r, fill, o) {
  o = o || {};
  return (
    '<path d="M' +
    cx +
    ' ' +
    (cy - r) +
    'L' +
    (cx + r) +
    ' ' +
    cy +
    'L' +
    cx +
    ' ' +
    (cy + r) +
    'L' +
    (cx - r) +
    ' ' +
    cy +
    'Z" fill="' +
    fill +
    '" stroke="' +
    (o.stroke || C.ground) +
    '" stroke-width="' +
    (o.sw || 0.8) +
    '"/>'
  );
}
/** An arrow from (x0, y0) to (x1, y1), drawn to p, with its head once drawn. */
function arrow(x0, y0, x1, y1, color, p, o) {
  o = o || {};
  var len = Math.hypot(x1 - x0, y1 - y0),
    ux = (x1 - x0) / len,
    uy = (y1 - y0) / len;
  var s = drawPath(
    'M' + x0 + ' ' + y0 + 'L' + x1 + ' ' + y1,
    len,
    p,
    'stroke="' +
      color +
      '" stroke-width="' +
      (o.w || 0.8) +
      '"' +
      (o.dash ? ' stroke-dasharray="' + o.dash + '"' : ''),
  );
  if (p > 0.95)
    s +=
      '<path d="M' +
      (x1 - ux * 3 - uy * 1.8) +
      ' ' +
      (y1 - uy * 3 + ux * 1.8) +
      'L' +
      x1 +
      ' ' +
      y1 +
      'L' +
      (x1 - ux * 3 + uy * 1.8) +
      ' ' +
      (y1 - uy * 3 - ux * 1.8) +
      '" fill="none" stroke="' +
      color +
      '" stroke-width="' +
      (o.w || 0.8) +
      '" stroke-linejoin="round"/>';
  return s;
}

/* ---------- the captured app (Scenes 2–5 and 7) ---------- */
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
/** The app's window, optionally magnified about frame point (cx, cy) by z (a camera move over
    the captured frame, clipped to the window). */
function appZoom(id, st, z, cx, cy) {
  if (!z || z <= 1.001) return appWindow(WX, WY, WW, id, st);
  var h = (WW * 9) / 16;
  var px = fx(cx),
    py = fy(cy);
  return (
    rect(WX - 0.6, WY - 6.6, WW + 1.2, h + 7.2, '#000', { rx: 2.4, op: 0.18 }) +
    ICON.browser(WX, WY - 6, WW, h + 6, { url: 'openchronology' }) +
    '<clipPath id="az"><rect x="' +
    WX +
    '" y="' +
    WY +
    '" width="' +
    WW +
    '" height="' +
    h +
    '"/></clipPath><g clip-path="url(#az)"><g transform="translate(' +
    px +
    ' ' +
    py +
    ') scale(' +
    z +
    ') translate(' +
    -px +
    ' ' +
    -py +
    ')"><image href="' +
    shotFrame(id, st) +
    '" x="' +
    WX +
    '" y="' +
    WY +
    '" width="' +
    WW +
    '" height="' +
    h +
    '" preserveAspectRatio="xMidYMid slice"/></g></g>'
  );
}
/** A frame point seen through appZoom's magnification. */
function zx(px, z, cx) {
  return fx(cx) + (fx(px) - fx(cx)) * z;
}
function zy(py, z, cy) {
  return fy(cy) + (fy(py) - fy(cy)) * z;
}
/** The note that the case is invented, in the app's empty footer beside Help. */
var MADE_UP = function (o) {
  return G(chip(fx(130), fy(1046), 'A made-up case', C.soft, { size: 4.6 }), { o: o });
};

/* ---------- Scene 1: what happened, and why? ---------- */
SCENES[1] = function (lt, q) {
  var s = '';
  var EY = 58,
    CY = 118;
  var seq = q('sequence') - 0.3,
    cond = q('conditions') - 0.2,
    cause = q('causal', 2) - 0.1,
    exact = seq + 1.8;
  // Row labels.
  s += G(
    txt(14, EY - 18, 'EVENTS', { size: 4.6, anchor: 'start', fill: C.soft, ls: 0.6 }) +
      txt(14, CY - 18, 'CONDITIONS', { size: 4.6, anchor: 'start', fill: C.soft, ls: 0.6 }),
    { o: P(lt, seq, 0.5) },
  );
  // The events, left to right, then the incident.
  var ev = [
    [52, 'Enters aisle 14'],
    [118, 'Picker crosses'],
    [184, 'FL-3 reverses'],
  ];
  ev.forEach(function (e, i) {
    var p = P(lt, seq + i * 0.45, 0.5);
    s += G(eventBox(e[0], EY, 52, 16, e[1]), { o: p, tx: (1 - p) * -6 });
    var nx = i < 2 ? ev[i + 1][0] - 26 : 256 - 11;
    s += arrow(e[0] + 26, EY, nx - 1, EY, C.arc, P(lt, seq + i * 0.45 + 0.35, 0.4));
  });
  // The incident is there from the start, set apart as a diamond.
  var hurt = clamp01((lt - q('hurt')) / 0.8);
  var pulse = hurt > 0 && hurt < 1 ? Math.sin(hurt * Math.PI) : 0;
  var ip = P(lt, 0.2, 0.6);
  s += G(
    (pulse
      ? '<circle cx="256" cy="' +
        EY +
        '" r="' +
        (11 + 8 * hurt) +
        '" fill="none" stroke="' +
        C.red +
        '" stroke-width="0.9" opacity="' +
        (1 - hurt).toFixed(2) +
        '"/>'
      : '') +
      diamond(256, EY, 11, C.red) +
      txt(270, EY + 2, 'Collision', { size: 5.6, weight: 700, anchor: 'start' }),
    { o: ip, s: lerp(0.8, 1, ip), cx: 256, cy: EY },
  );
  // Conditions beneath, each linked up to what it affected.
  var cs = [
    [100, '10-hour shifts', 184, false],
    [160, 'Fatigue?', 184, false, true],
    [224, 'Light out', 256, true],
    [284, 'No spotter', 256, true],
  ];
  cs.forEach(function (c, i) {
    var p = P(lt, cond + i * 0.35, 0.5);
    var red = c[3] ? P(lt, cause + (i - 2) * 0.3, 0.5) : 0;
    var col = mix(c[4] ? C.soft : C.amber, C.red, red);
    s += G(
      '<path d="M' +
        c[0] +
        ' ' +
        (CY - 9) +
        'L' +
        c[2] +
        ' ' +
        (EY + (c[2] === 256 ? 11 : 8)) +
        '" stroke="' +
        mix(C.line, C.red, red) +
        '" stroke-width="' +
        (0.6 + 0.4 * red) +
        '" stroke-dasharray="1.6 1.2"/>' +
        oval(c[0], CY, 25, 9, c[1], {
          stroke: col,
          sw: 0.8 + 0.5 * red,
          dash: c[4] ? '2 1.4' : '',
        }),
      { o: p, ty: (1 - p) * 6 },
    );
    if (c[3])
      s += pop(
        chip(
          c[0] - chipWidth('causal factor', { size: 4.6 }) / 2,
          CY + 18,
          'causal factor',
          C.red,
          {
            size: 4.6,
          },
        ),
        red,
        c[0],
        CY + 16,
      );
  });
  // On "exact": the chart's events take their times on an axis.
  var ap = P(lt, exact, 0.7);
  var AY = 160;
  s += G(drawPath('M30 ' + AY + 'H290', 260, ap, 'stroke="' + C.arc + '" stroke-width="0.9"'), {});
  var times = [
    [52, '02:31:48'],
    [118, '02:33:20'],
    [184, '02:33:58'],
    [256, '02:34:09.36'],
  ];
  times.forEach(function (t, i) {
    var p = P(lt, exact + 0.3 + i * 0.2, 0.4);
    s += G(
      '<path d="M' +
        t[0] +
        ' ' +
        (AY - 2) +
        'v4" stroke="' +
        C.arc +
        '" stroke-width="0.7"/>' +
        txt(t[0], AY + 8, t[1], {
          size: 4.6,
          mono: true,
          fill: i === 3 ? C.red : C.soft,
          weight: 500,
        }),
      { o: p },
    );
  });
  return s;
};

/* ---------- Scene 6: drawn as the method draws it ---------- */
/** An arc above the axis from x0 to x1 (core's arc), with an arrowhead at x1 once drawn. */
function arcTo(x0, x1, y, h, color, p, w) {
  var s = arc(x0, x1, y, p, { h: h, color: color, w: w || 0.9 });
  if (p > 0.95) {
    var dx = (x1 - x0) / 2,
      dy = 2 * h,
      l = Math.hypot(dx, dy),
      ux = dx / l,
      uy = dy / l,
      k = 3;
    s +=
      '<path d="M' +
      (x1 - ux * k - uy * k * 0.6) +
      ' ' +
      (y - uy * k + ux * k * 0.6) +
      'L' +
      x1 +
      ' ' +
      y +
      'L' +
      (x1 - ux * k + uy * k * 0.6) +
      ' ' +
      (y - uy * k - ux * k * 0.6) +
      '" fill="none" stroke="' +
      color +
      '" stroke-width="' +
      (w || 0.9) +
      '" stroke-linejoin="round" stroke-linecap="round"/>';
  }
  return s;
}
SCENES[6] = function (lt, q) {
  var s = '';
  var L = 14,
    M = 156,
    Y0 = 16,
    RH = 30;
  s += G(
    txt(L, Y0, 'ECF CONVENTION', { size: 4.6, anchor: 'start', fill: C.soft, ls: 0.6 }) +
      txt(M, Y0, 'IN OPENCHRONOLOGY', { size: 4.6, anchor: 'start', fill: C.soft, ls: 0.6 }) +
      '<path d="M' +
      L +
      ' ' +
      (Y0 + 4) +
      'H306" stroke="' +
      C.line +
      '" stroke-width="0.6"/>',
    { o: P(lt, 0.2, 0.5) },
  );
  var rows = [
    {
      t: q(['ellipses', 'conditions']),
      ecf: function (y) {
        return (
          oval(L + 20, y, 16, 7, '', {}) +
          txt(L + 44, y + 1.8, 'Condition: an oval', { size: 6, anchor: 'start' })
        );
      },
      app: function (y) {
        return (
          '<ellipse cx="' +
          (M + 18) +
          '" cy="' +
          y +
          '" rx="16" ry="7" fill="' +
          C.amber +
          '" stroke="' +
          C.text +
          '" stroke-width="0.8"/>' +
          txt(M + 42, y - 0.6, 'An ellipse · Moment shapes', { size: 5.6, anchor: 'start' }) +
          txt(M + 42, y + 6.4, 'shape: ellipse', {
            size: 4.6,
            anchor: 'start',
            mono: true,
            fill: C.soft,
            weight: 500,
          })
        );
      },
    },
    {
      t: q('presumptive'),
      ecf: function (y) {
        return (
          eventBox(L + 20, y, 32, 12, '', { stroke: C.soft, dash: '2 1.4' }) +
          txt(L + 44, y + 1.8, 'Presumptive: dashed', { size: 6, anchor: 'start' })
        );
      },
      app: function (y) {
        return (
          rect(M + 2, y - 4, 32, 8, mix(C.amber, C.ground, 0.35), {
            rx: 1.4,
            stroke: C.text,
            sw: 0.8,
            dash: '2 1.4',
          }) +
          txt(M + 42, y - 0.6, 'A dashed outline · Presumptive outline', {
            size: 5.6,
            anchor: 'start',
          }) +
          txt(M + 42, y + 6.4, 'presumptive: true', {
            size: 4.6,
            anchor: 'start',
            mono: true,
            fill: C.soft,
            weight: 500,
          })
        );
      },
    },
    {
      t: q('arrows'),
      ecf: function (y) {
        return (
          '<circle cx="' +
          (L + 4) +
          '" cy="' +
          (y + 3) +
          '" r="2" fill="' +
          C.amber +
          '"/>' +
          arrow(L + 7, y + 3, L + 33, y + 3, C.text, 1) +
          '<circle cx="' +
          (L + 36) +
          '" cy="' +
          (y + 3) +
          '" r="2" fill="' +
          C.red +
          '"/>' +
          txt(L + 44, y + 1.8, 'Cause → effect arrows', { size: 6, anchor: 'start' })
        );
      },
      app: function (y) {
        return (
          '<circle cx="' +
          (M + 3) +
          '" cy="' +
          (y + 4) +
          '" r="2" fill="' +
          C.amber +
          '"/>' +
          arcTo(M + 3, M + 31, y + 4, 5, C.arc, 1, 0.9) +
          '<circle cx="' +
          (M + 33) +
          '" cy="' +
          (y + 4) +
          '" r="2" fill="' +
          C.red +
          '"/>' +
          txt(M + 42, y - 0.6, 'Arrowheads · Relationship arrows', { size: 5.6, anchor: 'start' }) +
          txt(M + 42, y + 6.4, 'arrows: "to" (cause → effect)', {
            size: 4.6,
            anchor: 'start',
            mono: true,
            fill: C.soft,
            weight: 500,
          })
        );
      },
    },
  ];
  rows.forEach(function (r, i) {
    var y = Y0 + 18 + i * RH;
    var p = P(lt, r.t - 0.2, 0.6),
      pa = P(lt, r.t + 0.3, 0.6);
    s += G(r.ecf(y) + arrow(M - 16, y, M - 6, y, C.line, 1), { o: p, tx: (1 - p) * -6 });
    s += G(r.app(y) + check(310, y, C.green), { o: pa, tx: (1 - pa) * 6 });
    if (i < 2)
      s += G(
        '<path d="M' + L + ' ' + (y + 15) + 'H306" stroke="' + C.faint + '" stroke-width="0.6"/>',
        { o: p },
      );
  });
  // What stays true: the arrows are drawn, not meant.
  var NY = Y0 + 18 + 3 * RH - 4,
    np = P(lt, q('convention') - 0.3, 0.6);
  var notes = [
    ['Arrows are a drawing convention kept on the events.', q('convention')],
    ['A link has no label, such as “caused” or “contributed to”.', q('label')],
    ['Separate all connected doesn’t follow the arrows.', q('separate')],
  ];
  var nb = card(L, NY, 292, 46, { stroke: C.amber });
  notes.forEach(function (n, k) {
    nb += G(
      '<circle cx="' +
        (L + 9) +
        '" cy="' +
        (NY + 11.6 + k * 12) +
        '" r="1.2" fill="' +
        C.amber +
        '"/>' +
        txt(L + 14, NY + 13.4 + k * 12, n[0], { size: 5.6, anchor: 'start', weight: 600 }),
      { o: P(lt, n[1] - 0.1, 0.45) },
    );
  });
  s += rise(nb, np, 6);
  return s;
};

/* ---------- Scene 8: reviewed, and kept private ---------- */
SCENES[8] = function (lt, q) {
  var s = '';
  var W = 98,
    Y = 22,
    H = 136,
    xs = [8, 111, 214];
  var a1 = P(lt, q('review') - 0.3, 0.6),
    a2 = P(lt, q('export') - 0.2, 0.6),
    a3 = P(lt, q('private') - 0.3, 0.6);
  // (1) A pull request, merged into saved history.
  var x1 = xs[0];
  var merge = P(lt, q('merges'), 0.4);
  var p1 =
    card(x1, Y, W, H, {}) +
    txt(x1 + 6, Y + 10, 'REVIEW', { size: 4.6, anchor: 'start', fill: C.soft, ls: 0.5 }) +
    card(x1 + 5, Y + 16, W - 10, 40, { stroke: mix(C.line, C.green, merge) }) +
    txt(x1 + 9, Y + 25, 'Pull request', { size: 4.6, anchor: 'start', fill: C.soft, weight: 500 }) +
    txt(x1 + 9, Y + 33, 'Add the maintenance log', { size: 5.4, anchor: 'start', weight: 700 }) +
    txt(x1 + 9, Y + 40, 'to the light fault', { size: 5.4, anchor: 'start', weight: 700 }) +
    txt(x1 + 9, Y + 49, '1 moment changed', {
      size: 4.6,
      anchor: 'start',
      fill: C.soft,
      weight: 500,
      mono: true,
    }) +
    button(x1 + W - 30, Y + 49, 'Merge', merge);
  // History: a new checkpoint drops onto the top once merged.
  var hp = P(lt, q('history') - 0.2, 0.5);
  p1 += G(txt(x1 + 6, Y + 68, 'HISTORY', { size: 4.6, anchor: 'start', fill: C.soft, ls: 0.5 }), {
    o: hp,
  });
  var drop = P(lt, q('merges') + 0.4, 0.6);
  var revs = ['Revision 3 · merged', 'Revision 2', 'Revision 1'];
  revs.forEach(function (r, i) {
    var ry = Y + 76 + i * 13 + (i === 0 ? 0 : 0);
    var o = i === 0 ? drop : hp;
    var shift = i === 0 ? (1 - drop) * -8 : 0;
    p1 += G(
      rect(x1 + 6, ry + shift, W - 12, 10, C.ground, {
        rx: 1.6,
        stroke: i === 0 ? C.green : C.line,
        sw: 0.6,
      }) +
        '<circle cx="' +
        (x1 + 11) +
        '" cy="' +
        (ry + 5 + shift) +
        '" r="1.5" fill="' +
        (i === 0 ? C.green : C.soft) +
        '"/>' +
        txt(x1 + 16, ry + 6.8 + shift, r, { size: 4.6, anchor: 'start', mono: true, weight: 500 }),
      { o: o },
    );
  });
  p1 += G(
    txt(x1 + W / 2, Y + H - 6, 'every saved revision kept', {
      size: 4.6,
      fill: C.soft,
      weight: 500,
    }),
    { o: hp },
  );
  s += G(p1, { o: a1, ty: (1 - a1) * 6 });
  // (2) The files.
  var x2 = xs[1],
    c2 = x2 + W / 2;
  var f1 = P(lt, q('export') + 0.2, 0.5),
    f2 = P(lt, q('desktop') - 0.1, 0.5);
  var p2 =
    card(x2, Y, W, H, {}) +
    txt(x2 + 6, Y + 10, 'EXPORT', { size: 4.6, anchor: 'start', fill: C.soft, ls: 0.5 }) +
    G(
      '<g transform="translate(' +
        c2 +
        ' ' +
        (Y + 38) +
        ') scale(2) translate(' +
        -c2 +
        ' ' +
        -(Y + 38) +
        ')">' +
        ICON.file(c2, Y + 38, '', { color: C.accent }) +
        '</g>' +
        txt(c2, Y + 72, '.ochx', { size: 8, mono: true, fill: C.accent, weight: 600 }) +
        txt(c2, Y + 80, 'for the report', { size: 4.8, fill: C.soft, weight: 500 }),
      { o: f1 },
    ) +
    G(
      txt(c2, Y + 100, '.och', { size: 8, mono: true, fill: C.amber, weight: 600 }) +
        txt(c2, Y + 108, 'a desktop file', { size: 4.8, fill: C.soft, weight: 500 }),
      { o: f2 },
    );
  s += G(p2, { o: a2, ty: (1 - a2) * 6 });
  // (3) Private, shared person by person, or on your own server.
  var x3 = xs[2],
    c3 = x3 + W / 2;
  var lock = P(lt, q('private') + 0.2, 0.5),
    pp = P(lt, q('person') - 0.2, 0.5),
    sp = P(lt, q('self') - 0.1, 0.5);
  var p3 =
    card(x3, Y, W, H, {}) +
    txt(x3 + 6, Y + 10, 'PRIVACY', { size: 4.6, anchor: 'start', fill: C.soft, ls: 0.5 }) +
    '<g transform="translate(' +
    c3 +
    ' ' +
    (Y + 28) +
    ') scale(2) translate(' +
    -c3 +
    ' ' +
    -(Y + 28) +
    ')">' +
    ICON.padlock(c3, Y + 28, lock) +
    '</g>' +
    txt(c3, Y + 48, 'Starts private', { size: 6, weight: 700 });
  var roles = ['private viewer', 'contributor', 'writer'];
  var py = Y + 60;
  roles.forEach(function (r, i) {
    var o = P(lt, q('person') - 0.2 + i * 0.2, 0.45);
    var cw = chipWidth(r, { size: 4.6 });
    p3 += G(chip(c3 - cw / 2, py + i * 12, r, C.accent, { size: 4.6 }), { o: o });
  });
  p3 += G(
    ICON.server(x3 + 14, Y + 110) +
      txt(x3 + 26, Y + 104, 'Self-hosted:', { size: 5, anchor: 'start', weight: 700 }) +
      txt(x3 + 26, Y + 110.5, 'data stays in-house', {
        size: 4.8,
        anchor: 'start',
        fill: C.soft,
        weight: 500,
      }),
    { o: sp },
  );
  p3 += G(
    txt(c3, Y + H - 6, 'not encrypted from server admins', {
      size: 4.4,
      fill: C.soft,
      weight: 500,
      italic: true,
    }),
    { o: pp },
  );
  s += G(p3, { o: a3, ty: (1 - a3) * 6 });
  return s;
};

/* ---------- Scene 9: build it once ---------- */
SCENES[9] = function (lt, q) {
  var e = P(lt, 0.3, 0.9);
  return G(
    txt(160, 58, 'Every investigation is a timeline.', { size: 13, weight: 700 }) +
      wordmark(160, 96, 16) +
      txt(160, 118, 'docs: plugins · relationships · comparison', {
        size: 6.5,
        mono: true,
        fill: C.accent,
        weight: 500,
      }) +
      addresses(160, 132, 6),
    { o: e, ty: (1 - e) * 6 },
  );
};

/* ---------- captured scenes: shared bits ---------- */
/** remap with its scene times forced to rise, so cues that come close together can't fold it. */
function camera(lt, pts) {
  var out = [],
    last = -1e9;
  pts.forEach(function (p) {
    var t = Math.max(p[0], last + 0.05);
    out.push([t, p[1]]);
    last = t;
  });
  return remap(lt, out);
}
/** A leader-less label chip at frame point (px, py), centred, after a pop. */
function tag(px, py, s, color, p, o) {
  o = o || {};
  var w = chipWidth(s, { size: o.size || 5 });
  return pop(
    chip(fx(px) - w / 2, fy(py), s, color, { size: o.size || 5, solid: o.solid }),
    p,
    fx(px),
    fy(py),
  );
}
/** A ring around a frame-space box, popping in. */
function box(x, y, w, h, color, p) {
  return pop(
    rect(fx(x) - 1, fy(y) - 1, w * K + 2, h * K + 2, 'none', { rx: 1.6, stroke: color, sw: 1 }),
    p,
    fx(x + w / 2),
    fy(y + h / 2),
  );
}

/* ---------- Scene 2: each event at its exact time ---------- */
/* The sequence shot: the night (02:05–02:45) to 3 s, a zoom to the last eighty seconds by 7,
   the collision's details at 7.6, the rational coordinate opened at 9.4, closed at 12.3, and a
   view of both crossings (02:29–02:35:30) by 14.5. In that view the picker's statement is at
   x 335 px and camera 7's crossing at x 1261 px, on the axis at y 559 px. */
SCENES[2] = function (lt, q) {
  var cams = q('cameras'),
    col = q('collision'),
    tw = q(['twenty', '925']),
    dis = q('disagree');
  var st = camera(lt, [
    [0, 0],
    [cams + 0.4, 3],
    [col - 0.2, 7],
    [col + 0.4, 7.6],
    [tw - 0.2, 9.4],
    [dis - 0.9, 12],
    [dis - 0.6, 12.3],
    [dis + 1.4, 14.5],
  ]);
  var s = appWindow(WX, WY, WW, 'sequence', st);
  // The sources, while the whole night is in view.
  var gone = 1 - P(lt, cams + 0.4, 0.4);
  var src = [
    ['statements', q('statements'), 360],
    ['badge records', q('badge'), 760],
    ['telematics', q('telematics'), 1160],
    ['cameras', cams, 1540],
  ];
  src.forEach(function (c) {
    s += G(tag(c[2], 870, c[0], C.amber, P(lt, c[1] - 0.1, 0.4), { size: 5.4 }), { o: gone });
  });
  s += G(txt(fx(960), fy(830), 'SOURCES', { size: 4.6, fill: C.soft, ls: 0.6 }), {
    o: P(lt, q('statements') - 0.3, 0.4) * gone,
  });
  // The collision's exact time, then its rational coordinate.
  var open = st >= 7.6 && st < 12.3 ? 1 : 0;
  s += G(box(587, 327, 746, 42, C.amber, P(lt, col + 0.9, 0.4)), { o: open });
  var rp = P(lt, tw + 0.1, 0.4);
  s += G(
    box(587, 480, 746, 42, C.amber, rp) +
      callout(fx(1380), fy(512), 'frame 9 of 25: + 9/25 s', C.amber, fx(1336), fy(501), rp, {
        size: 5,
      }),
    { o: open },
  );
  s += G(
    callout(
      fx(1380),
      fy(358),
      'never rounded',
      C.amber,
      fx(1336),
      fy(348),
      P(lt, q('stored') - 0.1, 0.4),
      { size: 5 },
    ),
    { o: open },
  );
  // Two accounts of one crossing.
  var dp = P(lt, dis + 0.9, 0.5);
  s += callout(fx(335), fy(330), 'statement · about 02:30', C.soft, fx(335), fy(550), dp, {
    anchor: 'middle',
    size: 5.2,
  });
  s += callout(
    fx(1180),
    fy(330),
    'camera 7 · 02:33:20',
    C.amber,
    fx(1261),
    fy(550),
    P(lt, dis + 1.2, 0.5),
    {
      anchor: 'middle',
      size: 5.2,
    },
  );
  var bp = P(lt, q('notes') - 0.1, 0.5);
  s += G(
    '<path d="M' +
      fx(460) +
      ' ' +
      fy(290) +
      'H' +
      fx(1060) +
      '" stroke="' +
      C.soft +
      '" stroke-width="0.7" stroke-dasharray="1.6 1.2"/>' +
      txt(fx(760), fy(270), 'both kept, with notes', { size: 5, fill: C.soft, weight: 500 }),
    { o: bp },
  );
  s += MADE_UP(P(lt, 0.4, 0.5));
  return s;
};

/* ---------- Scene 3: conditions held over time ---------- */
/* The conditions shot: the night to 3 s, out to 12–16 October by 6.5 (band starts: the longer
   shifts x 393, y 612; the light x 856, y 624; no spotter x 1581, y 639), held to 8.5, then in
   on the collision's stack by 11.5, at presentation size 0.72 (the collision x 1248 px, axis
   y 433 px; its stack below, conditions first, then evidence). */
SCENES[3] = function (lt, q) {
  var mon = q('monday'),
    each = q('each'),
    all = q('all'),
    stack = q('stack');
  var st = camera(lt, [
    [0, 0],
    [q('ten') - 0.3, 3],
    [mon + 0.5, 6.5],
    [each, 8.5],
    [all - 0.3, 11.5],
  ]);
  var s = appWindow(WX, WY, WW, 'conditions', st);
  var wk = st > 6.3 && st < 8.7 ? 1 : 0;
  var since = [
    ['since Monday 20:00', 393, 612, Math.max(mon, 0) + 0.5, 760],
    ['since Tuesday 23:40', 856, 624, q('tuesday') + 0.1, 820],
    ['no spotter from 19:10', 1581, 639, q('spotter') - 0.1, 760],
  ];
  since.forEach(function (c) {
    s += G(
      callout(fx(c[1]), fy(c[4]), c[0], C.amber, fx(c[1]), fy(c[2] + 6), P(lt, c[3], 0.4), {
        anchor: c[1] > 1400 ? 'middle' : 'start',
        size: 5.2,
      }),
      { o: wk },
    );
  });
  // At the collision, every condition is still there.
  if (st >= 11.4) {
    var cp = P(lt, all, 0.5);
    s += G(
      '<path d="M' +
        fx(1248) +
        ' ' +
        fy(420) +
        'V' +
        fy(520) +
        '" stroke="' +
        C.select +
        '" stroke-width="1.1"/>',
      { o: cp },
    );
    s += callout(fx(1330), fy(400), 'all still there at 02:34:09', C.amber, fx(1252), fy(470), cp, {
      size: 5,
    });
    // The stack: conditions, then evidence.
    var kp = P(lt, stack - 0.1, 0.5),
      ep = P(lt, q('evidence') - 0.1, 0.5);
    var bx = fx(1335);
    s += G(
      '<path d="M' +
        bx +
        ' ' +
        fy(585) +
        'h2V' +
        fy(745) +
        'h-2" fill="none" stroke="' +
        C.red +
        '" stroke-width="0.8"/>' +
        txt(bx + 4, fy(670), 'conditions', { size: 5.4, anchor: 'start', fill: C.red }),
      { o: kp },
    );
    s += G(
      '<path d="M' +
        bx +
        ' ' +
        fy(770) +
        'h2V' +
        fy(930) +
        'h-2" fill="none" stroke="' +
        C.amber +
        '" stroke-width="0.8"/>' +
        txt(bx + 4, fy(855), 'evidence', { size: 5.4, anchor: 'start', fill: C.amber }),
      { o: ep },
    );
    s += callout(fx(960), fy(860), 'moment stack', C.amber, fx(1240), fy(760), kp, {
      anchor: 'middle',
      size: 5.2,
    });
  }
  return s;
};

/* ---------- Scene 4: link them, and pull out the chain ---------- */
/* The link shot (View mode): the night with its arcs to 4 s; the collision in the reader at 4,
   scrolled to its foot by 7.4 (Separate all connected at x 609, y 989, 190 × 38 px); separated
   at 9; out to the week by 11.5 (the chain's track label at y 241 px, Everything else at
   y 597 px); in to the last minutes from 13 to 15.5. */
SCENES[4] = function (lt, q) {
  var open = q('open'),
    sep = q('separate'),
    lifts = q('lifts'),
    rout = q('routine');
  var st = camera(lt, [
    [0, 0],
    [open, 4],
    [sep - 1.6, 6.6],
    [sep - 0.6, 7.5],
    [sep + 0.4, 9],
    [lifts + 0.6, 11.5],
    [rout + 0.2, 13],
    [rout + 2.6, 15.5],
  ]);
  var s = appWindow(WX, WY, WW, 'link', st);
  if (st < 4) {
    var ap = P(lt, q('arcs') - 0.1, 0.5);
    s += callout(
      fx(835),
      fy(300),
      'a relationship, drawn as an arc',
      C.amber,
      fx(835),
      fy(380),
      ap,
      {
        anchor: 'middle',
        size: 5.2,
      },
    );
    s += callout(
      fx(1500),
      fy(300),
      'condition → collision',
      C.amber,
      fx(1365),
      fy(520),
      P(lt, q('led') - 0.1, 0.5),
      {
        anchor: 'middle',
        size: 5.2,
      },
    );
  }
  if (st >= 7.3 && st < 9) s += box(609, 989, 190, 38, C.amber, P(lt, sep - 0.3, 0.3));
  if (st >= 9.6 && st < 13) {
    s += callout(
      fx(330),
      fy(300),
      'the chain, on its own track',
      C.amber,
      fx(140),
      fy(250),
      P(lt, lifts - 0.1, 0.5),
      { size: 5.2 },
    );
    s += callout(
      fx(330),
      fy(650),
      'routine records stay below',
      C.soft,
      fx(100),
      fy(605),
      P(lt, rout - 0.1, 0.5),
      { size: 5.2 },
    );
  }
  return s;
};

/* ---------- Scene 5: the analysis is yours ---------- */
/* The factors shot (View mode): 12–16 October to 3 s (the root cause x 208, y 559; the light
   x 856–1818, y 624; no spotter x 1581–1762, y 639); the root cause in the reader at 3 (its
   tags x 455–747, y 397–421; its Evidence line y 561), closed at 9.2, then the last eighty
   seconds by 12 (the horn x 1208, y 559; Driver fatigue y 670, to x 1508). */
SCENES[5] = function (lt, q) {
  var root = q('root'),
    conf = q('confirmed');
  var st = camera(lt, [
    [0, 0],
    [root, 3],
    [conf - 0.8, 9.2],
    [q('fatigue') + 0.4, 12],
  ]);
  var s = appWindow(WX, WY, WW, 'factors', st);
  if (st < 3) {
    var bp = P(lt, q('bad') - 0.1, 0.5);
    s += box(840, 616, 980, 16, C.red, bp) + box(1572, 632, 196, 14, C.red, bp);
    s += pop(
      '<circle cx="' +
        fx(208) +
        '" cy="' +
        fy(559) +
        '" r="3.2" fill="none" stroke="' +
        C.red +
        '" stroke-width="1"/>',
      P(lt, root - 0.6, 0.4),
      fx(208),
      fy(559),
    );
    s += callout(fx(1000), fy(780), 'causal factor: the Bad color', C.red, fx(1200), fy(640), bp, {
      anchor: 'middle',
      size: 5.2,
    });
  }
  if (st >= 3.2 && st < 9.2) {
    s += box(544, 397, 204, 25, C.red, P(lt, root + 0.4, 0.4));
    var ep = P(lt, q('evidence') - 0.1, 0.5);
    s += G(
      drawPath(
        'M' + fx(455) + ' ' + fy(576) + 'H' + fx(1253),
        130,
        ep,
        'stroke="' + C.amber + '" stroke-width="0.9"',
      ),
      {},
    );
    s += callout(
      fx(1290),
      fy(530),
      'the investigator’s reasoning',
      C.amber,
      fx(1220),
      fy(500),
      P(lt, q('reasoning') - 0.1, 0.5),
      { size: 5 },
    );
  }
  if (st >= 11.5) {
    var pp = P(lt, q('presumptive') - 0.1, 0.5);
    s += callout(fx(1208), fy(320), 'presumptive · the horn', C.soft, fx(1208), fy(548), pp, {
      anchor: 'middle',
      size: 5.2,
    });
    s += callout(
      fx(560),
      fy(780),
      'presumptive · fatigue',
      C.soft,
      fx(560),
      fy(676),
      P(lt, q('presumptive') + 0.3, 0.5),
      {
        anchor: 'middle',
        size: 5.2,
      },
    );
    s += callout(
      fx(900),
      fy(870),
      'a dashed outline',
      C.soft,
      undefined,
      undefined,
      P(lt, q('dashed') - 0.1, 0.5),
      { anchor: 'middle', size: 5.2 },
    );
  }
  return s;
};

/* ---------- Scene 7: as planned, as happened ---------- */
/* The compare shot over 19:30–03:30: the procedure added at 0.1 s and the comparison at 0.5.
   The case's track: its axis at y 629 px, the night shift (blue) from x 171, y 684; no spotter
   y 675; Driver fatigue y 692 to x 1652. The procedure's: its axis y 863, the lighting walk
   x 546; its shift and spotter (merged label) from x 622, y 891; the rest break x 1524–1637,
   y 900. A veil over the alignment panel (y 140–440 px) gives the callouts a clear field. */
SCENES[7] = function (lt, q) {
  var c0 = q('compare');
  var st = camera(lt, [
    [0.2, 0],
    [c0 + 0.2, 0.6],
    [c0 + 9, 9.4],
  ]);
  var s = appWindow(WX, WY, WW, 'compare', st);
  var vp = P(lt, q('procedure'), 0.6);
  s += G(rect(fx(0), fy(140), WW, 300 * K, '#f7f7f2', {}), { o: vp * 0.92 });
  s += G(
    txt(fx(40), fy(250), 'AS IT HAPPENED (above)', {
      size: 4.6,
      anchor: 'start',
      fill: C.red,
      ls: 0.4,
    }) +
      txt(fx(40), fy(285), 'AS PLANNED (below)', {
        size: 4.6,
        anchor: 'start',
        fill: C.green,
        ls: 0.4,
      }),
    { o: vp },
  );
  var GREEN = '#3f7d52';
  var pairs = [
    // [planned label, px, py, chip x, chip y, cue] then [happened label, px, py, chip x, chip y, cue]
    [
      ['shift 22:00–06:00', 622, 891, 700, 975, q(['eight', 'tower'])],
      ['started 20:00', 171, 684, 240, 400, q('longer')],
    ],
    [
      ['lighting walk 21:40', 546, 863, 380, 1030, q('lighting')],
      ['no lighting walk', 546, 629, 560, 350, q('walk', 2)],
    ],
    [
      ['spotter on duty', 1100, 891, 1100, 975, q('spotter')],
      ['no spotter', 1100, 675, 1100, 400, q('spotter', 2)],
    ],
    [
      ['rest break 02:00', 1580, 900, 1600, 1030, q(['break', 'brake'])],
      ['kept working', 1600, 692, 1640, 350, q(['break', 'brake'], 2)],
    ],
  ];
  pairs.forEach(function (pr) {
    var a = pr[0],
      b = pr[1];
    s += callout(fx(a[3]), fy(a[4]), a[0], GREEN, fx(a[1]), fy(a[2]), P(lt, a[5] - 0.1, 0.4), {
      anchor: 'middle',
      size: 5,
    });
    s += callout(fx(b[3]), fy(b[4]), b[0], C.red, fx(b[1]), fy(b[2]), P(lt, b[5] - 0.1, 0.4), {
      anchor: 'middle',
      size: 5,
    });
  });
  return s;
};
