# Viewport rasterization

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

OpenChronology's visible window is an exact rational pair `(left, span)` (see [exact rational time](rational-time.md)). Zooming multiplies the span by a rational factor and panning subtracts a rational fraction of it, so repeated gestures would make the numerators and denominators of `left` and `span` grow without bound, and every later computation with them would slow down. After each gesture the editor therefore rounds `left` and `span` to the nearest multiple of a power-of-two grid step, the largest `2^k` no greater than `span / (ceil(W) * 2^20)` for a drawable width of `W` CSS pixels. The rounding is done in `BigInt` arithmetic, works for any absolute coordinate and any span, moves each bound by at most one grid step (at most 2<sup>-20</sup> of a pixel), and makes the size of the retained rationals depend on the absolute coordinate and the zoom level instead of on the number of gestures. Opposite wheel steps use reciprocal rational factors. Event times, explicitly entered bounds and query arithmetic are never rounded. Disclosed at commit [`007091c`](https://github.com/openchronology/timeline-app/tree/007091ce62fdb402346c0712b0c420eac0a29dff); first public disclosure: commit `88aea8c` of 2026-10-05 (see [First public disclosure](#first-public-disclosure)).

## Field and problem

A viewer that keeps its camera in exact rational coordinates can zoom without limit: a span of 10<sup>-1100</sup> at an absolute position of 10<sup>1200</sup> is as representable as a span of one year. But exact arithmetic preserves the whole history of the camera:

- **Zooming** about a pointer multiplies `span` by a factor and recomputes `left` from an anchor time and the pointer's fraction of the width. A wheel factor such as `1271249/1000000` multiplies the denominator by up to 10<sup>6</sup> on every step; the pointer fraction (a pixel position quantized to 1/1024 px, divided by the width) multiplies it again.
- **Panning** subtracts `span * dx / W`; with `dx` quantized to 1/1024 px and `W` an arbitrary width, each drag adds the factors of `1024 * W` to the denominator.
- Factors from different gestures rarely cancel, so after `g` gestures the components have Θ(g) times as many digits. Every later step (the next gesture, the grouping threshold, each marker's position) costs arithmetic on numbers that keep getting longer. Measured with the code at this commit: after 1,000 mixed wheel zooms and drags at an 800 px width, the exact components reach 6,063 bits; with rasterization they stay at 68 bits or below (see [Worked example](#worked-example)).

The usual remedies each lose something:

- **Floating-point camera coordinates** lose absolute position at extreme zoom: a 53-bit significand cannot hold a nanosecond span at 10<sup>16</sup> seconds, and the view jitters or snaps.
- **Rounding to a fixed resolution** (for example, to integer nanoseconds or to a fixed number of decimal places) sets a minimum span and stops zooming there.
- **Limiting the denominator** (continued-fraction approximation to the best rational with denominator below a bound) is relative to the value, not to the visible scale: at a large absolute coordinate it either moves the view by more than a pixel or keeps too many digits, and it costs a continued-fraction expansion per gesture.
- **Recomputing the view from the gesture's start** bounds the error within one drag, but successive gestures still accumulate.

## Summary of the mechanism

1. Screen measurements enter rational arithmetic only through `screenQ(x) = round(x * 1024) / 1024`.
2. Gestures (`pan`, `zoom`, `pinch`) are exact rational operations on `(left, span)`.
3. After a gesture, `rasterize(W)`:
   1. computes `precision = span / (max(1, ceil(W)) * 2^20)` exactly;
   2. finds `k = floor(log2(precision))` exactly from bit lengths plus one shift-and-compare;
   3. rounds `left` and `span` independently to the nearest multiple of `2^k` (ties away from zero), using only `BigInt` shifts, an addition and one integer division.
4. Every retained value is then `integer * 2^k`, so its denominator is a power of two no larger than `2^-k`, and `k` is determined by the current span and width.
5. Wheel zoom factors for opposite deltas are exact reciprocals (`s/10^6` and `10^6/s`), so a step in and the same step out compose to exactly 1 before rounding.
6. Explicitly entered bounds and the `Viewport` arithmetic itself stay exact; rounding happens only in the editor's navigation path.

## Detailed description

### Data structure

`Viewport` ([`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L658-L732)) holds two rationals:

| Field  | Type | Invariant                                |
| ------ | ---- | ---------------------------------------- |
| `left` | `Q`  | any rational                             |
| `span` | `Q`  | `> 0` (the constructor throws otherwise) |

`right` is derived as `left + span`. A viewport is immutable in use: every operation returns a new one.

### Exact gesture arithmetic

All pixel inputs go through `screenQ` ([`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L628-L631)), which rejects non-finite numbers and returns `round(x * 1024) / 1024` as a rational. Then:

```
at(px, W)            = left + span * screenQ(px) / screenQ(W)          # time under a pixel
pan(dx, W)           = (left - span * screenQ(dx) / screenQ(W), span)
zoom(px, W, f)       : anchor = at(px, W); span' = span * f             # f > 0
                       left'  = anchor - span' * screenQ(px) / screenQ(W)
pinch(p0, p1, W, f)  : span' = span * f; anchor = at(p0, W)             # p0: start midpoint
                       left'  = anchor - span' * screenQ(p1) / screenQ(W)  # p1: current midpoint
```

`zoom` keeps the time under the pointer fixed; `pinch` keeps the time that was under the fingers' starting midpoint under their current midpoint, so it pans and zooms at once. The pinch factor is `screenQ(startSeparation) / screenQ(max(4, currentSeparation))`, the ratio of the fingers' horizontal separations; the floor of 4 px keeps a sliver of time between fingers pinched together.

Drags and pinches are computed from the viewport at the start of the gesture (`gesture.view`) on every pointer move, not from the previous move's result, so within one gesture there is one exact transform from the starting view and one rounding.

### Reciprocal wheel factors

[`wheelZoomFactor(delta)`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L633-L638):

```
amount = clamp(delta * 0.002, -0.7, 0.7)
s      = round(exp(|amount|) * 10^6)          # integer, computed once in floating point
factor = 10^6 / s   if amount < 0             # zoom in
         s / 10^6   otherwise                 # zoom out (or 1 for delta 0)
```

The floating-point `exp` only chooses the integer `s`; the factor itself is an exact rational, and `wheelZoomFactor(d) * wheelZoomFactor(-d) = 1` exactly for every `d`. A wheel step in followed by the same step out at the same pointer returns exactly to the starting span, so there is no systematic drift from rounding the factor. Mouse-wheel deltas in lines or pages are converted to pixels (×16 and ×stage height) before the call. Buttons and the `+`/`-` keys use the exact factors `4/5` and `5/4`, which are also reciprocal.

### The rasterize rule

[`Viewport.rasterize(width)`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L671-L685), with its two helpers [`floorBinaryExponent`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L640-L646) and [`roundToBinaryGrid`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L648-L656):

```
rasterize(view, W):
  if W is not finite: error "Invalid screen width."
  samples   = max(1, ceil(W)) << 20                 # BigInt: ceil(W) * 2^20
  precision = view.span / samples                   # exact rational, > 0
  k         = floorBinaryExponent(precision)        # largest k with 2^k <= precision
  return Viewport(roundToBinaryGrid(view.left, k),
                  roundToBinaryGrid(view.span, k))

floorBinaryExponent(n/d):                           # n, d > 0, reduced
  k = bitlen(n) - bitlen(d)                         # n/d lies in (2^(k-1), 2^(k+1))
  if k >= 0 and n < (d << k):  k = k - 1
  if k <  0 and (n << -k) < d: k = k - 1
  return k                                          # 2^k <= n/d < 2^(k+1)

roundToBinaryGrid(n/d, k):                          # nearest multiple of 2^k
  # scale so that n'/d' = (n/d) / 2^k
  n' = n << -k  if k < 0  else n
  d' = d << k   if k > 0  else d
  r  = (|n'| + floor(d'/2)) div d'                  # round half away from zero on |value|
  r  = -r if n' < 0
  return r << k            if k >= 0                # integer result
         r / 2^-k          otherwise                # denominator a power of two (reduced by Q)
```

Exact properties, verified against the code:

- **Grid step.** `2^k <= span / (ceil(W) * 2^20) < 2^(k+1)`. The step is the largest power of two not exceeding the span divided by `ceil(W) * 2^20`. The width is rounded _up_ to an integer, and at least 1, so the step is at most 2<sup>-20</sup> of a CSS pixel even for fractional widths.
- **Rounding direction.** Both `left` and `span` round to the _nearest_ multiple of the step; an exact half rounds away from zero. Negative coordinates are handled by rounding the magnitude and restoring the sign, so the grid is symmetric about zero (`-1/3` and `1/3` round to `-349525/2^20` and `349525/2^20` at step 2<sup>-20</sup>; `±2^-21` rounds to `±2^-20`). For an odd scaled denominator there is no exact half, and `floor(d'/2)` gives plain round-to-nearest.
- **Error bounds.** `|left' - left| <= step/2`, `|span' - span| <= step/2`, so `|right' - right| <= step`. Each bound moves by at most one grid step, at most 2<sup>-20</sup> px (under 10<sup>-6</sup> px), at any absolute coordinate.
- **Positive span.** `span / step >= ceil(W) * 2^20 >= 2^20`, so the rounded span is at least `2^20` steps and never zero.
- **Bounded components.** After rasterization `left = a * 2^k` and `span = b * 2^k` with integers `a`, `b`. `b` is between `2^20 * ceil(W)` and about `2^21 * ceil(W)`, so the span's numerator has about `21 + log2(W)` bits. `left`'s numerator has about `log2(|left| / step)` bits: it depends on how far from zero the view is and how far it is zoomed in, not on how it got there. The denominators are powers of two, at most `2^-k`.
- **Pure `BigInt`.** No step converts a time to a JavaScript number. The only floating-point inputs are the width (to an integer via `ceil`) and, earlier, the pixel measurements (to 1/1024 px).
- **Near-idempotence.** Applying `rasterize` to an already rasterized view returns it unchanged unless rounding the span carried it across a power of two, which raises the step for the next application. Example at `W = 1`: `left = 1/2`, `span = 2^20 - 1/10` rounds to `(1/2, 2^20)` with step 1/2; rasterizing again uses step 1 and moves `left` to 1. Each application still obeys its own error bound.

### Why the grid makes growth stop

Without rasterization, the denominator of `left` after a zoom is roughly `den(left) * den(f) * 1024 * W`-sized (the pointer fraction and the factor), and after a pan `den(span) * 1024 * W`-sized; these multiply over the gesture history. With rasterization, every gesture starts from values on a `2^k` grid, and its exact result, whatever its denominator, is rounded back to a `2^k'` grid where `k'` depends only on the new span. The information retained between gestures is therefore the position to `log2(|left| / step)` bits plus the span to about `21 + log2(W)` bits. Zooming in by a factor of 2 lowers `k` by one and adds one bit to `left`, which is the information that zooming in reveals; panning or zooming back out removes it again.

Precision is not capped. There is no minimum span: zooming by 2<sup>-300</sup> from a unit span gives a span of exactly 2<sup>-300</sup> with a 301-bit denominator ([`test/core.test.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/test/core.test.mjs#L172-L175)).

### Where the editor applies it

The editor calls `rasterize(width())` in its navigation path:

- `navigate(view)` ([`src/app.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L4641-L4647)) rasterizes every view it is given. Its callers are mouse-wheel zoom and shift-wheel pan, touch and mouse drag and two-finger pinch (`pointermove`), arrow-key pan (10% of the width), the end of a zoom animation, fitting a duration, jumping to a search result and following a shared view link.
- `zoom(factor)` for the zoom buttons and `+`/`-` keys rasterizes its destination, and the zoom animation rasterizes every intermediate frame (the frame interpolates `left` and `span` with an exact easing fraction of denominator 10<sup>6</sup>).
- Following the latest moments (`follow latest`) rasterizes the fitted view it animates to.

It does not round:

- bounds typed into the left/right bound fields or applied with **Apply** ([`src/app.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L5366-L5381), [`src/app.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L5494-L5501));
- **Fit all**, the opening view of a timeline, a view restored from storage, and the view moved by a time mapping;
- event times, stored documents, and the bounds and thresholds sent to the database (the queries use the view as it is, and their comparisons are exact).

Rasterization changes only the camera. A view rounded by a gesture is still an exact rational; the next explicit entry replaces it exactly.

### Complexity

Per call: two `BigInt` bit-length computations, at most two shifts and two comparisons for the exponent, and for each of `left` and `span` one shift, one addition and one integer division. Cost is linear-to-quasi-linear in the bit length of the operands (`BigInt` division), which rasterization itself keeps bounded. Space is two rationals.

### Variations

- The grid base may be any integer `b >= 2`, with step `b^k`, the largest power of `b` not exceeding the precision target; base 2 makes scaling a shift and the result's denominator a power of two. Base 10 would give decimal-friendly bounds at the cost of multiplications.
- The resolution constant `2^20` may be any `2^m` (or `b^m`): it trades the retained bits (about `m + log2(W)` for the span) against the largest movement (`2^-m` px).
- The width may be any measure of the output's resolution: device pixels instead of CSS pixels, or the number of samples in a plot, audio waveform or map tile row.
- The two coordinates may be rounded on one grid as `(left, right)` instead of `(left, span)`; rounding `span` keeps its relative error at most `2^-21 / ceil(W)`.
- The tie rule may be any deterministic rule (half to even, half up); the code rounds half away from zero.
- The same rule applies to any exact-arithmetic camera in more dimensions (a 2-D map or canvas with rational `x`, `y`, `scale`), with one grid per axis or one from the smaller span.
- Rounding may be applied at gesture end only instead of on every gesture event; the editor applies it on every navigation step.

## Worked example

All numbers below were produced by running the code at this commit. `src/core.ts` was bundled with the repository's own esbuild (`node_modules/.bin/esbuild src/core.ts --bundle --format=esm --platform=node --outfile=<scratch>/core-388.mjs`) and the scripts imported `Q`, `Viewport` and `wheelZoomFactor` from the bundle, under Node v26.11.1.

Start from the default view `left = -2`, `span = 28` at `W = 800` px, and turn the wheel one notch toward the screen (`deltaY = -120`) with the pointer at `x = 273.125` px.

1. **Factor.** `amount = -0.24`, `s = round(e^0.24 * 10^6) = 1271249`, so `f = 1000000/1271249`. Its reciprocal for `deltaY = +120` is `1271249/1000000`; their product is `1/1`.
2. **Anchor.** `at(273.125, 800) = -2 + 28 * (279680/1024) / (819200/1024) = 2419/320` (7.559375).
3. **Exact zoom.** `span' = 28 * f = 4000000/181607` (≈ 22.0255827143227). `left' = 2419/320 - span' * 273.125/800 = 2307333/58114240` (≈ 0.0397034014382706).
4. **Grid step.** `samples = 800 << 20 = 838860800`. `precision = span' / samples = 625/23803592704` ≈ 2.6256541·10<sup>-8</sup>. Since 2<sup>-26</sup> ≈ 1.4901161·10<sup>-8</sup> ≤ precision < 2<sup>-25</sup> ≈ 2.9802322·10<sup>-8</sup>, `k = -26`. One step is about 5.41·10<sup>-7</sup> px at this zoom.
5. **Rounding.** `left' / 2^-26 ≈ 2664450.16746` → 2664450, so `left'' = 2664450/2^26 = 1332225/33554432`. `span' / 2^-26 ≈ 1478111834.9` → 1478111835, so `span'' = 1478111835/67108864`. Errors: left −2.50·10<sup>-9</sup>, span +1.55·10<sup>-9</sup>, right −9.49·10<sup>-10</sup>, all below one step (1.49·10<sup>-8</sup>).
6. **Next gesture.** Panning the rounded view by 37.5 px gives the exact `left = -4263810705/4294967296` (denominator 2<sup>32</sup>), which rasterizes back to `-33311021/33554432` on the same 2<sup>-26</sup> grid (a negative value, rounded to nearest on its magnitude).

Growth without and with rasterization, from the same start, over a deterministic sequence that alternates a wheel zoom (delta uniformly in ±200, pointer at a multiple of 1/8 px) with a drag (a fractional pixel distance), at `W = 800`. The table shows the larger of `bits(numerator) + bits(denominator)` for `left` and `span`:

| Gestures | Exact (bits) | Rasterized after each gesture (bits) | Span (both) |
| -------: | -----------: | -----------------------------------: | ----------: |
|       10 |          136 |                                   57 |  3.517·10^1 |
|       50 |          524 |                                   53 |  5.215·10^1 |
|      100 |          955 |                                   55 |  5.257·10^1 |
|      200 |        1,765 |                                   57 |  9.149·10^1 |
|      500 |        3,689 |                                   64 |  1.978·10^0 |
|    1,000 |        6,063 |                                   68 | 7.091·10^-1 |

The exact size grows linearly with the number of gestures. The rasterized size follows the zoom level (it rises as the span shrinks below 1 and the grid step with it) and does not grow with the count. The two spans agree to the printed digits.

Other checks run the same way: a view at `10^40 + 1/3` with span `10^-6` and `W = 1000` rasterizes to step 2<sup>-50</sup>, giving `left = 11258999068426240000000000000000000000000375299968947541/2^50` and `span = 1125899907/2^50`.

## Implementation references

- [`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L628-L631) — `screenQ`: pixel measurements to multiples of 1/1024.
- [`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L633-L638) — `wheelZoomFactor`: reciprocal rational wheel factors.
- [`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L640-L646) — `floorBinaryExponent`: exact `floor(log2(n/d))`.
- [`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L648-L656) — `roundToBinaryGrid`: nearest multiple of `2^k`, ties away from zero, sign-symmetric.
- [`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L671-L685) — `Viewport.rasterize`: grid step from `span / (ceil(W) * 2^20)`.
- [`src/core.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/core.ts#L686-L732) — `Viewport.at`, `x`, `threshold`, `pan`, `zoom`, `pinch`, `fit`: the exact gesture arithmetic.
- [`src/app.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L4574-L4647) — `zoom`, `animateView` (each frame rasterized), `fitDuration`, `navigate` (rasterizes every view it applies).
- [`src/app.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L5122-L5145) — drag and pinch from the gesture's starting view.
- [`src/app.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L5181-L5241) — wheel zoom, shift-wheel pan, arrow-key pan, `+`/`-` zoom.
- [`src/app.ts`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/src/app.ts#L5366-L5381) — **Apply** for typed bounds: an exact `Viewport`, not rasterized.
- [`test/core.test.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/test/core.test.mjs#L88-L176) — error below one step at huge and tiny scales, power-of-two denominators, bounded size after 5,000 wheel round trips and 1,000 mixed gesture rounds, unlimited zoom depth.
- [`docs/architecture.md`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/docs/architecture.md#L36-L38) — the documented contract.

## Benchmarks

No benchmarks measure this mechanism directly. The closest measurements are the tests in [`test/core.test.mjs`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/test/core.test.mjs#L116-L144), which assert that after 5,000 pairs of opposite wheel zooms (deltas 0.125, 120 and 500, each rasterized) the decimal text of `left`, `right` and `span` stays under 64 characters and the view drifts by less than 0.01 px in total, and that the same bound holds over 1,000 rounds of button zoom, pan and pinch; and the interaction timings for wheel zoom, drag and pinch in [`docs/benchmarks.md`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/docs/benchmarks.md#L236-L249), which measure whole redraws rather than the camera arithmetic. The bit-size table in the [worked example](#worked-example) is a measurement of operand size, not of time.

## First public disclosure

The repository has been public on GitHub since its creation on 2026-10-05.

| Component                                                        | First commit           | First release tag |
| ---------------------------------------------------------------- | ---------------------- | ----------------- |
| `Viewport.rasterize`, `floorBinaryExponent`, `roundToBinaryGrid` | `88aea8c` (2026-10-05) | `v0.1.0`          |
| `screenQ` (1/1024 px), `wheelZoomFactor` (reciprocal factors)    | `88aea8c` (2026-10-05) | `v0.1.0`          |
| Rasterize rule in `docs/architecture.md`                         | `88aea8c` (2026-10-05) | `v0.1.0`          |

`rasterize`, `roundToBinaryGrid` and `screenQ` are unchanged since that commit (`git log -L` on each function lists only `88aea8c`).

## Figures

The grid at one zoom level. Both `left` and `span` snap to the nearest multiple of the step `2^k`, so `right` moves by at most one step:

```
step = 2^k  (2^k <= span / (ceil(W) * 2^20) < 2^(k+1))

 grid:   |      |      |      |  ...  |      |      |
 exact:      L                              R
 rounded:  L'                                 R'
          |<- <= step/2 ->|            |<- <= step ->|
```

Zooming in lowers `k`; each halving of the span adds one binary digit to `left`'s numerator, and zooming back out removes it:

```
span      k (W = 800)    left kept as
28        -25            a / 2^25
28/2^10   -35            a / 2^35
28/2^100  -125           a / 2^125
```

Note on the documentation: [`docs/architecture.md`](https://github.com/openchronology/timeline-app/blob/007091ce62fdb402346c0712b0c420eac0a29dff/docs/architecture.md#L38) says the UI applies `rasterize` "only after gestures, including touch pinch, mouse/keyboard pan, and button/wheel zoom". In the code, `navigate()` rasterizes every view it applies, which also includes fitting a duration, jumping to a search result, following a shared view link and every zoom-animation frame; the follow-latest view is rasterized too. Typed bounds, **Fit all**, the opening view and restored views are not rounded, as documented.
