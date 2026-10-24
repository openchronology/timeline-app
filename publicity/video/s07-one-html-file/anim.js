// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/* Short 7, A whole app in one HTML file (publicity/shorts/7-one-html-file.md): the how-to,
   drawn as Video 3 draws its editions. The offline file, whole at frame 0; it drops onto a USB
   stick and into a laptop whose Wi-Fi is crossed out, the real editor (a still of the US
   sample) opens on its screen, and "network", "account" and "install" strike through; then
   Export presses, an .ochx file flies out, and arrows carry it to the desktop app and the
   website; the end card. Scenes are pure functions of scene time lt; q("word") is when that
   word is said. The laptop is kept across the cut from Scene 2 to Scene 3. */

/* ---------- drawing ---------- */
/* A tiny timeline (an axis and three moments), drawn to p. */
function tinyTL(cx, cy, w, p, r) {
  if (p <= 0) return '';
  r = r || 1.1;
  var s =
    '<path d="M' +
    (cx - w / 2) +
    ' ' +
    cy +
    'h' +
    w * p +
    '" stroke="' +
    C.arc +
    '" stroke-width="' +
    r * 0.55 +
    '"/>';
  [-0.3, 0.05, 0.32].forEach(function (f, i) {
    var a = clamp01(p * 3 - i);
    s += G(
      '<circle cx="' + (cx + f * w) + '" cy="' + cy + '" r="' + r + '" fill="' + C.moment + '"/>',
      { o: a },
    );
  });
  return s;
}
/* A document icon k times its size, centred at (x, y), with a tiny timeline on its page. */
function bigFile(x, y, k, col) {
  return G(ICON.file(x, y, '', { color: col }) + tinyTL(x - 0.5, y + 3, 9, 1, 0.65), {
    s: k,
    cx: x,
    cy: y,
  });
}
/* An .ochx file: a document icon with its name beneath. */
function ochx(x, y, k) {
  return (
    G(ICON.file(x, y, '', { color: C.accent }), { s: k, cx: x, cy: y }) +
    txt(x, y + 13 * k + 8, '.ochx', { size: 7, mono: true, fill: C.accent, weight: 700 })
  );
}
/* A USB stick centred on its body at (x, y), its plug pointing right, k times its size. */
function stick(x, y, k) {
  return G(
    rect(x - 22, y - 10, 40, 20, C.soft, { rx: 3 }) +
      rect(x + 18, y - 6, 10, 12, C.line, { rx: 0.8, stroke: C.soft, sw: 0.6 }) +
      rect(x + 21, y - 3.2, 2.2, 2.2, C.soft) +
      rect(x + 21, y + 1, 2.2, 2.2, C.soft) +
      rect(x - 16, y - 4, 26, 8, mix(C.soft, C.ground, 0.25), { rx: 1 }),
    { s: k, cx: x, cy: y },
  );
}
/* The laptop: screen (sx, sy, sw wide, 16:9) and its base. scr (0–1) shows the real editor. */
function laptop(sx, sy, sw, scr, o) {
  o = o || {};
  var sh = (sw * 9) / 16,
    b = 3;
  var s =
    rect(sx - b - 0.6, sy - b + 1.4, sw + 2 * b + 1.2, sh + 2 * b, '#000', { rx: 3, op: 0.12 }) +
    rect(sx - b, sy - b, sw + 2 * b, sh + 2 * b, '#2a3430', { rx: 3 }) +
    rect(sx, sy, sw, sh, C.card) +
    '<path d="M' +
    (sx - b - 9) +
    ' ' +
    (sy + sh + b) +
    'h' +
    (sw + 2 * b + 18) +
    'l-4 5h' +
    -(sw + 2 * b + 10) +
    'z" fill="' +
    C.soft +
    '"/>' +
    rect(sx + sw / 2 - 9, sy + sh + b, 18, 1.6, mix(C.soft, C.ground, 0.35), { rx: 0.8 });
  if (scr > 0)
    s += G(
      '<image href="' +
        shotFrame('editor', 1) +
        '" x="' +
        sx +
        '" y="' +
        sy +
        '" width="' +
        sw +
        '" height="' +
        sh +
        '" preserveAspectRatio="xMidYMid slice"/>',
      { o: scr * (o.dim === undefined ? 1 : o.dim) },
    );
  return s;
}
/* A chip that strikes through as p goes 0 → 1. */
function struckChip(x, y, s, p) {
  var w = chipWidth(s, { size: 8.5 });
  var col = mix(C.soft, C.red, p);
  var out =
    rect(x, y - 9.5, w, 14, C.card, { rx: 7, stroke: col, sw: 0.8 }) +
    txt(x + w / 2, y + 0.8, s, { size: 8.5, fill: mix(C.text, C.soft, p), weight: 700 });
  if (p > 0)
    out +=
      '<path d="M' +
      (x + 3) +
      ' ' +
      (y - 1.6) +
      'h' +
      (w - 6) * p +
      '" stroke="' +
      C.red +
      '" stroke-width="1.4" stroke-linecap="round"/>';
  return out;
}
/* An arrow from (x0, y0) to (x1, y1), drawn to p. */
function arrow(x0, y0, x1, y1, p, col) {
  if (p <= 0) return '';
  col = col || C.accent;
  var s = drawPath(
    'M' + x0 + ' ' + y0 + 'L' + x1 + ' ' + y1,
    Math.hypot(x1 - x0, y1 - y0),
    p,
    'stroke="' + col + '" stroke-width="1.2" stroke-linecap="round"',
  );
  if (p > 0.95) {
    var a = Math.atan2(y1 - y0, x1 - x0);
    var h = function (da) {
      return (
        (x1 - 4.2 * Math.cos(a + da)).toFixed(2) + ' ' + (y1 - 4.2 * Math.sin(a + da)).toFixed(2)
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
      '" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  return s;
}
/* A small timeline inside a window. */
function windowTL(cx, y, w) {
  var s =
    '<path d="M' +
    (cx - w / 2) +
    ' ' +
    y +
    'h' +
    w +
    '" stroke="' +
    C.arc +
    '" stroke-width="0.7"/>' +
    rect(cx - w * 0.3, y + 3, w * 0.32, 3, C.duration, { rx: 0.8 });
  [0.12, 0.4, 0.68, 0.9].forEach(function (f, i) {
    s += moment(cx - w / 2 + f * w, y, { r: 1.8, color: i === 2 ? C.strong : C.moment });
  });
  return s;
}
/* The desktop app's window and the website's browser window, w wide, at top-left (x, y). */
function desktopWin(x, y, w, h) {
  return (
    ICON.terminal(x, y, w, h) +
    windowTL(x + w / 2, y + h * 0.58, w * 0.76) +
    txt(x + w / 2, y + h + 10, 'Desktop app', { size: 8, weight: 700 })
  );
}
function browserWin(x, y, w, h) {
  return (
    ICON.browser(x, y, w, h) +
    rect(x + 13, y + 1.2, w - 16, 3.6, C.card, { rx: 1.8 }) +
    windowTL(x + w / 2, y + h * 0.58, w * 0.76) +
    txt(x + w / 2, y + h + 10, 'Website', { size: 8, weight: 700 })
  );
}

/* ---------- where things sit ---------- */
var FILE1 = { x: 80, y: 118, k: 4.9 }; // Scene 1's file
var LAP2 = { x: 16, y: 100, w: 128 }; // Scene 2's laptop screen
var LAP3 = { x: 24, y: 80, w: 112 }; // Scene 3's, a little smaller and higher
var STICK_K = 0.6; // the stick, plugged in
var CHIPS = ['network', 'account', 'install'];
/* Where the plugged-in stick sits beside a laptop screen at (x, y), w wide. */
function plugged(x, y, w) {
  var k = STICK_K * (w / LAP2.w);
  return { x: x - 3 - 28 * k, y: y + ((w * 9) / 16) * 0.7, k: k };
}

/* ---------- scene 1: one file ---------- */
SCENES[1] = function (lt, q) {
  // One slow breath: 1 → 1.05 → 1, over the scene.
  var b = Math.sin(Math.PI * clamp01(lt / Math.max(1, q.dur - 0.4)));
  var k = FILE1.k * (1 + 0.05 * b);
  return (
    rect(FILE1.x - 44, FILE1.y + 66, 88, 2.4, mix(C.ground, C.soft, 0.18), {
      rx: 1.2,
      op: 0.8 - 0.3 * b,
    }) +
    bigFile(FILE1.x, FILE1.y, k) +
    txt(SAFE.cx, 196, 'openchronology-offline.html', {
      size: 7.6,
      mono: true,
      fill: C.accent,
      weight: 700,
    }) +
    txt(SAFE.cx, 208, 'the whole editor', { size: 9.5, weight: 700, fill: C.soft })
  );
};

/* ---------- scene 2: never online ---------- */
/* Scene 2's laptop at time lt: its screen, the stick in its side, the struck-out Wi-Fi. */
function scene2Laptop(lt, q) {
  var plug = smooth((lt - q('machine')) / 0.9);
  var scr = P(lt, q('machine') + 0.7, 0.6);
  var s = laptop(LAP2.x, LAP2.y, LAP2.w, scr);
  var pk = plugged(LAP2.x, LAP2.y, LAP2.w);
  if (plug >= 1) s += stick(pk.x, pk.y, pk.k);
  // The Wi-Fi above the screen, crossed out.
  var wx = LAP2.x + LAP2.w / 2,
    wy = LAP2.y - 14;
  var wa = P(lt, q('online') - 0.2, 0.4),
    ws = P(lt, q('online') + 0.1, 0.4);
  s += G(ICON.network(wx, wy, ws), { o: wa, s: 1.9, cx: wx, cy: wy });
  return s;
}
SCENES[2] = function (lt, q) {
  var s = '';
  // The file, already in view, and the stick beside it, across the top.
  var fx = 46,
    fy = 82,
    ux = 112,
    uy = 82;
  var into = smooth((lt - q('stick') + 0.15) / 0.8);
  // The file arcs into the stick and shrinks away.
  if (into < 1) {
    var x = lerp(fx, ux - 6, into),
      y = lerp(fy, uy, into) - Math.sin(into * Math.PI) * 8;
    s += G(bigFile(x, y, lerp(2.1, 0.6, into)), { o: 1 - clamp01((into - 0.8) / 0.2) });
  }
  // The laptop arrives; the stick travels to its side on "machine".
  var la = P(lt, q('open') - 0.2, 0.5);
  var plug = smooth((lt - q('machine')) / 0.9);
  var pk = plugged(LAP2.x, LAP2.y, LAP2.w);
  if (plug < 1) s += stick(lerp(ux, pk.x, plug), lerp(uy, pk.y, plug), lerp(1.3, pk.k, plug));
  var lap = scene2Laptop(lt, q);
  // The three chips under it, struck one by one.
  var widths = CHIPS.map(function (c) {
    return chipWidth(c, { size: 8.5 });
  });
  var cx = SAFE.cx - (widths[0] + widths[1] + widths[2] + 10) / 2;
  var chips = '';
  CHIPS.forEach(function (c, i) {
    var a = P(lt, q('never') - 0.3 + i * 0.12, 0.4);
    chips += rise(struckChip(cx, 200, c, P(lt, q(c) - 0.05, 0.35)), a);
    cx += widths[i] + 5;
  });
  return { svg: s + chips, keep: pop(lap, la, SAFE.cx, LAP2.y + 36), keepOut: true };
};

/* ---------- scene 3: export it ---------- */
var OCHX = { x: 80, y: 162, k: 1.3 }; // where the exported file lands
var WIN = { w: 52, h: 30, y: 162, xl: 8, xr: 100 }; // the two destinations
function destinations(da, wa, pa, pb) {
  return (
    arrow(OCHX.x - 11, OCHX.y + 4, WIN.xl + WIN.w + 2, WIN.y + 9, da) +
    arrow(OCHX.x + 11, OCHX.y + 4, WIN.xr - 2, WIN.y + 9, wa) +
    pop(desktopWin(WIN.xl, WIN.y, WIN.w, WIN.h), pa, WIN.xl + WIN.w / 2, WIN.y + 14) +
    pop(browserWin(WIN.xr, WIN.y, WIN.w, WIN.h), pb, WIN.xr + WIN.w / 2, WIN.y + 14)
  );
}
/* The Import / Export bar over the screen's top edge, k times its size; lit lights Export. */
var BAR_K = 1.7;
function exportBar(lit, press) {
  var bx = SAFE.cx - (buttonWidth('Import') + 3 + buttonWidth('Export')) / 2;
  var by = LAP3.y + 3;
  var bar =
    rect(bx - 3, by - 9, buttonWidth('Import') + buttonWidth('Export') + 9, 13.5, C.card, {
      rx: 3,
      stroke: C.line,
    }) +
    button(bx, by, 'Import', 0) +
    button(bx + buttonWidth('Import') + 3, by, 'Export', lit);
  var ebx = bx + buttonWidth('Import') + 3 + buttonWidth('Export') / 2;
  return {
    svg: G(bar, { s: BAR_K * (1 - 0.05 * press), cx: SAFE.cx, cy: by }),
    x: SAFE.cx + (ebx - SAFE.cx) * BAR_K,
    y: by,
  };
}
SCENES[3] = function (lt, q) {
  var s = '';
  // The laptop shrinks and rises to make room.
  var m = smooth(lt / 0.8);
  var x = lerp(LAP2.x, LAP3.x, m),
    y = lerp(LAP2.y, LAP3.y, m),
    w = lerp(LAP2.w, LAP3.w, m);
  // The screen flickers on "close": nothing is kept.
  var cl = q('close');
  var fl = lt > cl && lt < cl + 0.6 ? 0.6 + 0.4 * Math.cos(((lt - cl) / 0.6) * 4 * Math.PI) : 1;
  var pk = plugged(x, y, w);
  var lap = laptop(x, y, w, 1, { dim: fl }) + stick(pk.x, pk.y, pk.k);
  // The Wi-Fi leaves with the move.
  var wx = x + w / 2,
    wy = y - 14;
  lap += G(ICON.network(wx, wy, 1), { o: 1 - P(lt, 0, 0.3), s: 1.9, cx: wx, cy: wy });
  // Export, lit and pressed on "export".
  var ex = q('export');
  var press = lt > ex ? Math.sin(clamp01((lt - ex) / 0.3) * Math.PI) : 0;
  var bar = exportBar(P(lt, ex - 0.05, 0.25), press);
  var ba = P(lt, ex - 0.6, 0.4);
  s += pop(bar.svg, ba, SAFE.cx, bar.y);
  s += G(finger(bar.x + 1, bar.y + 4, clamp01((lt - ex) / 0.5)), {
    o: P(lt, ex - 0.4, 0.3) * (1 - P(lt, ex + 0.6, 0.3)),
  });
  // The .ochx file flies out of the laptop and lands below it.
  var fly = smooth((lt - ex - 0.3) / 0.8);
  if (lt > ex + 0.3)
    s += G(
      ochx(
        lerp(bar.x, OCHX.x, fly),
        lerp(bar.y + 6, OCHX.y, fly) - Math.sin(fly * Math.PI) * 10,
        lerp(0.6, OCHX.k, fly),
      ),
      { o: clamp01(fly * 4) },
    );
  // Arrows to the desktop app and the website.
  s += destinations(
    P(lt, q('desktop') - 0.1, 0.5),
    P(lt, q('website') - 0.1, 0.5),
    P(lt, q('desktop') + 0.2, 0.45),
    P(lt, q('website') + 0.2, 0.45),
  );
  // The laptop is kept from Scene 2 (no fade in); what's drawn on it goes over it.
  return { svg: '', keep: lap + s, keepIn: true };
};

/* ---------- scene 4: yours ---------- */
SCENES[4] = function (lt, q) {
  // Scene 3's last frame eases away, then the end card rises.
  var away = P(lt, 0, 0.6);
  var pk = plugged(LAP3.x, LAP3.y, LAP3.w);
  var last =
    laptop(LAP3.x, LAP3.y, LAP3.w, 1) +
    stick(pk.x, pk.y, pk.k) +
    exportBar(1, 0).svg +
    ochx(OCHX.x, OCHX.y, OCHX.k) +
    destinations(1, 1, 1, 1);
  var s = G(last, { o: 1 - away, ty: away * 24, s: lerp(1, 0.94, away), cx: 80, cy: 140 });
  s += shortEnd(P(lt, 0.35, 0.7), 'Keep it yours');
  return s;
};
