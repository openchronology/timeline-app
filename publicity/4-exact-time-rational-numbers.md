# OpenChronology — Exact Time: Rational Numbers. Script and Storyboard

**Runtime:** ~2:52 (the scratch narration's cut) · **Format:** animated infographic, **Terminal** look (dark ink ground, mono type) · **Aspect:** 16:9
**Audience:** technical and mathematical viewers (programmers, data people, scientists) and the curious who heard "every time is exact" and want to know what that means. They will check the arithmetic.
**Purpose:** show, with real numbers, why ordinary floating-point time fails at the ends of a timeline, what a rational number is, and how OpenChronology stores every time as one and only rounds when it _shows_ a time.

**How it differs:** it's the only video that shows arithmetic. Every number on screen is exact and reproducible (Appendix B gives the calculation), and nothing is claimed about speed.

**Production notes:**

- Narration is 377 words, about 140 wpm when read. Precise and calm; let the numbers carry it.
- **Type:** every number appears in IBM Plex Mono. Floating-point results are amber; exact results are green.
- **The motif:** a number line that's also a timeline. Floating-point values appear as a comb of evenly spaced teeth (the representable values); exact values are free points that land anywhere between them.
- **Accuracy guardrails:**
  - Double-precision spacing figures (Scene 3) are `math.ulp` of the time in seconds since 1970: about 2.4 × 10⁻⁷ s today, 0.25 s at 66 million years ago, 16 s at 4.54 billion years ago.
  - Storage: exact reduced rationals of arbitrary-size integers, in every edition: BigInt in the editor, the pgmp extension (GMP rationals) in PostgreSQL, a rational SQLite extension in the desktop app's files. No precision cap.
  - Display: printers and parsers round only what's shown; an unchanged field keeps its exact value. The Gregorian display writes leftover fractions as `{+n/d}`, an OpenChronology extension, not ISO 8601.
  - Don't claim "faster than floats"; don't claim leap seconds or time zones.

---

## ACT 1 · THE PROBLEM WITH FLOATS (0:00 – 1:05)

### Scene 1 · 0:00 – 0:22 · 0.1 + 0.2

**FRAME:** A terminal prompt on the dark ground. It types `0.1 + 0.2` and the answer appears in amber: `0.30000000000000004`. Beneath, `== 0.3` → `false`.

**MOTION:** Characters type on; the trailing `4` flashes amber twice.

**OST:** "Computers round."

**VO:**
"Ask almost any computer to add a tenth and two tenths, and it says 0.30000000000000004. That's not a bug in your language. Most software stores numbers as binary floating point, with a fixed number of digits, and a tenth can't be written exactly in binary. So it rounds."

### Scene 2 · 0:22 – 0:42 · Time is a number

**FRAME:** A timeline axis appears under the terminal. A clock label "1969-07-20 20:17:40 UTC" maps to a number below it: `-14182940` with the caption "seconds since 1970".

**MOTION:** The date label slides down into the number; the axis ticks align beneath.

**OST:** "Time is stored as a number."

**VO:**
"Times are numbers too. A computer usually stores a moment as a count of seconds, or milliseconds, from the start of 1970. And with floating point, the further a time is from 1970, the coarser that count gets."

### Scene 3 · 0:42 – 1:05 · The comb gets coarse

**FRAME:** Three magnified windows on the number line, each showing the comb of representable values: "Today: every 0.00000024 s", "66 million years ago: every 0.25 s", "4.54 billion years ago: every 16 s". In the last, two moments ten seconds apart snap onto the same tooth and collide.

**MOTION:** Each window zooms out of the line in turn; the teeth widen from window to window; the collision lands with a small shake.

**OST:** "Far from 1970, the gaps grow."

**VO:**
"Today, a double-precision time can tell apart moments a quarter of a microsecond apart. At the dinosaurs' extinction, sixty-six million years ago, its steps are a quarter of a second. At Earth's formation, they're sixteen seconds: two events ten seconds apart become the same time. For a timeline that spans billions of years, that's not good enough."

---

## ACT 2 · RATIONAL NUMBERS (1:05 – 2:10)

### Scene 4 · 1:05 – 1:30 · A fraction is exact

**FRAME:** The terminal clears. `1/10 + 2/10` types in, and the answer appears in green: `3/10`. Beside it, `1/3` with the caption "exactly a third, forever". A fraction diagram: numerator and denominator as two whole numbers, "any size".

**MOTION:** The green `3/10` pops; the `1/3` writes itself and stays.

**OST:** "A fraction of two whole numbers."

**VO:**
"A rational number is a fraction: one whole number over another. A tenth is one over ten, exactly. A tenth plus two tenths is three tenths, exactly. A third of a second is one over three, and stays exactly a third. And because the whole numbers can be as large as they need to be, there's no point where precision runs out."

### Scene 5 · 1:30 – 1:50 · Stored exactly, everywhere

**FRAME:** The three storage tiers as stacked bands: "Editor: BigInt fractions", "Server: PostgreSQL + pgmp (GMP rationals)", "Desktop files: SQLite + a rational extension". A single value `-143271504000000000/1` flows through all three unchanged; a small "no rounding" seal on each band.

**MOTION:** The value drops through each band and comes out identical; each seal stamps as it passes.

**OST:** "The same exact value, all the way down."

**VO:**
"OpenChronology stores every time this way. In the editor, in the database on the server, and in the desktop app's files, a time is a reduced fraction of arbitrary-size integers. Saving, exporting and importing never round it."

### Scene 6 · 1:50 – 2:10 · Zoom without limit

**FRAME:** The timeline again. Two moments at `0` and `1/3` sit on the axis; the view zooms in a billionfold around the second, the ruler stepping through ms, µs and ns, and it stays exactly at a third. A depth counter in the corner: "span: 1 s → 10⁻⁹ s".

**MOTION:** Continuous zoom; ruler labels step through SI prefixes, "ms", "µs", "ns"; the moment never drifts.

**OST:** "Zoom as far as you like."

**VO:**
"So you can zoom as far as you like. Put a moment at a third of a second and zoom in a billion times: it's still exactly at a third. The same goes four and a half billion years ago."

---

## ACT 3 · READING EXACT TIME (2:10 – 3:00)

### Scene 7 · 2:10 – 2:38 · Displays are lenses

**FRAME:** One stored value at the centre, `1/3`, with three lenses fanned out from it, each showing a reading: "Exact rational · 1/3", "SI · 333.333 ms", "Gregorian · 1970-01-01T00:00:00{+1/3}Z". A lock icon on the stored value.

**MOTION:** The lenses swing in one by one; the stored value doesn't change until a new time is typed; a typed edit to the SI reading ("333.333 ms") shows a warning chip "you chose a new, rounded time".

**OST:** "Rounded only when it's shown."

**VO:**
"Rounding happens only when a time is shown. A timeline's time display reads the same exact value as a fraction, in SI units, or as a date. A date that isn't a whole second keeps its remainder as a fraction in braces. Leave a field as it is, and the exact value stays; type a new time, and you've chosen a new one."

### Scene 8 · 2:38 – 3:00 · Exact, and open

**FRAME:** The ruler again with three labels: "4.54 billion years ago", "1969-07-20 20:17:40", "+1/3 s". End card: "Every time is a fraction. Nothing rounds." the ◷ wordmark, and "Source: github.com/openchronology/timeline-app · GPL v3".

**MOTION:** The three labels slide together onto one axis; the end card fades in and holds.

**OST:** "Every time is a fraction. Nothing rounds."

**VO:**
"Billions of years, a single second, and a third of one, on the same line, with no rounding anywhere they're kept. It's free software, so you can read exactly how it's done."

**[END · ~2:52]**

---

## Appendix A · Narration only (for the voice session)

> Ask almost any computer to add a tenth and two tenths, and it says 0.30000000000000004. That's not a bug in your language. Most software stores numbers as binary floating point, with a fixed number of digits, and a tenth can't be written exactly in binary. So it rounds.
>
> Times are numbers too. A computer usually stores a moment as a count of seconds, or milliseconds, from the start of 1970. And with floating point, the further a time is from 1970, the coarser that count gets.
>
> Today, a double-precision time can tell apart moments a quarter of a microsecond apart. At the dinosaurs' extinction, sixty-six million years ago, its steps are a quarter of a second. At Earth's formation, they're sixteen seconds: two events ten seconds apart become the same time. For a timeline that spans billions of years, that's not good enough.
>
> A rational number is a fraction: one whole number over another. A tenth is one over ten, exactly. A tenth plus two tenths is three tenths, exactly. A third of a second is one over three, and stays exactly a third. And because the whole numbers can be as large as they need to be, there's no point where precision runs out.
>
> OpenChronology stores every time this way. In the editor, in the database on the server, and in the desktop app's files, a time is a reduced fraction of arbitrary-size integers. Saving, exporting and importing never round it.
>
> So you can zoom as far as you like. Put a moment at a third of a second and zoom in a billion times: it's still exactly at a third. The same goes four and a half billion years ago.
>
> Rounding happens only when a time is shown. A timeline's time display reads the same exact value as a fraction, in SI units, or as a date. A date that isn't a whole second keeps its remainder as a fraction in braces. Leave a field as it is, and the exact value stays; type a new time, and you've chosen a new one.
>
> Billions of years, a single second, and a third of one, on the same line, with no rounding anywhere they're kept. It's free software, so you can read exactly how it's done.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                    | Source                                                                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `0.1 + 0.2` is `0.30000000000000004` in IEEE 754 doubles                 | Python `0.1 + 0.2`; JavaScript the same                                                                                                                                                                                                             |
| 2     | Apollo 11 landing, 1969-07-20 20:17:40 UTC = −14,182,940 s since 1970    | `datetime(1969,7,20,20,17,40,tzinfo=UTC).timestamp()`                                                                                                                                                                                               |
| 3     | Spacing of doubles: 2.4 × 10⁻⁷ s today, 0.25 s at 66 Ma, 16 s at 4.54 Ga | Python `math.ulp(t)` for t = 1.76 × 10⁹ s, 66 × 10⁶ × 31,557,600 s, 4.54 × 10⁹ × 31,557,600 s                                                                                                                                                       |
| 4     | `1/10 + 2/10 = 3/10` exactly                                             | `fractions.Fraction`; the editor's `Q`                                                                                                                                                                                                              |
| 5     | Times are reduced rationals of arbitrary-size integers in every store    | [Guide: exact times](../docs/guide.md#exact-times); [time presentation](../docs/time-presentation.md); [architecture](../docs/architecture.md); `vendor/` (rational map, SQLite rational extension); pgmp in [Docker deployment](../docs/docker.md) |
| 7     | Displays round only what's shown; unchanged text keeps its exact time    | [Time presentation](../docs/time-presentation.md)                                                                                                                                                                                                   |
| 7     | Gregorian `{+n/d}` extension, not ISO 8601                               | [Time presentation: built-in formats](../docs/time-presentation.md#built-in-formats-and-units)                                                                                                                                                      |
| 8     | GPL v3, source on GitHub                                                 | [Licensing](../docs/licensing.md)                                                                                                                                                                                                                   |

## Appendix C · Questions this audience is likely to ask

1. **Isn't this slow?** Rationals cost more than doubles; the index and the stores are built around them, and the benchmarks in `bench/` hold the UI and stores to budgets. Don't claim it's as fast as floats.
2. **What about leap seconds and time zones?** The Gregorian display is proleptic with one fixed UTC offset per timeline; no named zones, daylight saving or leap seconds ([time presentation](../docs/time-presentation.md)).
3. **What does a time mean?** Only what its display says: by default plain numbers; with the Gregorian display, seconds since 1970 UTC. Any unit and origin can be configured.
4. **Can I see the stored value?** Set **Time display** to **Exact rational**, or expand **Exact rational coordinate** in a moment's details.
