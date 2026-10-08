# Timeline time presentation

Use **Time display** above the chart to configure a timeline. Settings are included in JSON exports, browser drafts, PostgreSQL snapshots, and desktop SQLite files. Shared readers use the saved settings; contributors propose changes and writers update upstream.

Stored events always retain their exact reduced rationals. The **Exact time** event field uses the timeline’s printer/parser. Unchanged text retains its original exact coordinate: renaming an event never parses its rounded label. Editing the time text explicitly chooses the parsed coordinate. Expand **Exact rational coordinate** to inspect the stored value. Custom printer/parser source and ruler settings are stored in both `.ochx` JSON and `.och` SQLite files, including server-mediated conversion. The main **Left bound** and **Right bound** fields print and parse using the timeline's presentation, including its units, epoch and custom code. **Go** preserves the exact coordinate of any unchanged field, even when its displayed text is rounded. Expand **Exact rational bounds** to inspect or edit the underlying coordinates directly.

## Built-in formats and units

The raw exact fields retain the original Unix-seconds ISO input adapter. Use the displayed-value fields when entering timestamps under another epoch, such as MJD, or when using unit/custom parsers.

| Format                   | Example                      | Parsing                                                                |
| ------------------------ | ---------------------------- | ---------------------------------------------------------------------- |
| Exact rational           | `1/3`                        | Exact fraction, integer, decimal, or scientific number                 |
| Floating point / decimal | `0.333333`                   | The exact decimal entered, which may differ from the original rational |
| Scientific               | `3.33333e-1`                 | Exact decimal times a power of ten                                     |
| SI prefixes              | `1.5 ks`, `1 µs`             | Exact quantity times the prefix and unit scales                        |
| Gregorian                | `1970-01-01T00:00:00{+1/3}Z` | Exact timestamp including its explicit offset                          |

Numeric displays allow 1–30 significant digits, defaulting to six, and round half away from zero. Extremely large or small values automatically use scientific notation. Absolute times never pass through binary floating point conversion. Numeric labels are approximate; parsing a rounded label chooses the decimal shown, not the original repeating fraction. Scientific input exponents are limited to ±10,000 to bound expansion; rational event storage has no precision cap.

SI printing uses powers of 1,000 from quecto to quetta, with scientific fallback beyond that prefix range. Parsing additionally accepts deci, centi, deca and hecto, and `u` or `μ` for `µ`. Symbols are case-sensitive and follow the [BIPM SI prefix table](https://www.bipm.org/en/measurement-units/si-prefixes). Use a base unit symbol such as `s`: `1 ms` means one millisecond.

Unit labels are arbitrary text. A positive exact scale and an exact origin determine their meaning:

```
displayed quantity = (stored coordinate − origin) / scale
stored coordinate = origin + parsed quantity × scale
```

Presets assume coordinates in seconds: minutes use scale `60`, days `86400`, Julian years `31557600`, and millions of Julian years `31557600000000`. A Julian year is exactly 365.25 days, rather than a variable-length civil calendar year. Any coordinate convention is allowed: if stored coordinates already mean years, displaying “million years” uses scale `1000000`.

Gregorian display treats the transformed quantity as seconds from 1970-01-01T00:00:00Z. The Unix preset has origin `0`, scale `1`. The legacy Modified Julian Date preset has origin `40587`, scale `1/86400`: coordinate zero prints as 1858-11-17T00:00:00Z and coordinate 40587 as the Unix epoch.

The reference is `openchronology-old2/graph/src/Chrono/Time/Class.hs`, which wrapped Haskell's `UniversalTime` as rational MJD days. [Data.Time.Clock](https://hackage-content.haskell.org/package/time-1.9.3/docs/Data-Time-Clock.html) exposes that rational representation, and [Data.Time.Format](https://hackage-content-origin.haskell.org/package/time-1.14/docs/Data-Time-Format.html) provides separate printers and parsers. This implementation follows that separation using local BigInt arithmetic; it does not execute Haskell.

The Gregorian preset uses a proleptic calendar, arbitrary integer years and a configurable fixed UTC offset in minutes. Input requires `Z` or `±HH:MM`; its own offset determines the instant. Finite fractional seconds print as decimals when practical; other fractions use the `{+n/d}` extension to preserve every rational. That extension is OpenChronology-specific, not standard ISO 8601. Named zones, daylight saving, leap seconds, and physical UT1/UTC adjustments are outside this preset.

## Viewport context

All presenter calls accept an optional second argument, `PresentationContext`: exact rational `left` and `span` (`right − left`), numeric `widthPixels` for the drawable timeline, `purpose` (`axis`, `event`, `input`, or `tooltip`), and optional `spacingPixels` for desired label spacing. Context is transient, never saved. Existing formatters can ignore it; calls without context preserve full formatting.

Gregorian chart labels use span and pixel density by default. Ruler labels target actual tick spacing; event labels retain finer detail at about six pixels of temporal resolution. A day-wide view can show `13h` on its ruler and `13:45` on an event, with a shared date/zone caption. Narrower views omit a base hour/minute (`45m`, `30s`, `30.3s`); wider views show days, months or years. The choice of fields applies to the whole window, even across calendar boundaries: a twenty-second view crossing midnight still prints seconds on both sides, while its caption shows both dates and the `23:59 → 00:00` rollover. A hundred-second view prints minutes and seconds on both sides. At submicrosecond resolution, labels use short `Δ …s` offsets from the exact left bound instead of long fractional strings, even at arbitrarily deep zooms.

Editing and tooltips retain full exact Gregorian timestamps. With Gregorian display, clicking or tapping a moment's time or either view bound (or pressing Alt+Down in it) opens a date and time dialog. The calendar and clock fields follow the current zoom: an hour-wide view shows minutes and seconds, and **Expand calendar context** reveals the date and year. Fields hidden at the current zoom keep their values. Underneath, **Or type a time** accepts any text the timeline's parser understands. **Apply** sets the moment, or moves that bound and navigates; **Cancel** changes nothing. Applying an unchanged display keeps the exact rational coordinate, including nonterminating fractions of a second. Other display modes keep plain text fields. **Abbreviate chart labels** can be disabled (`adaptiveLabels: false`). Resizing, panning, zooming and toggling abbreviation never change event coordinates. The settings preview offers ruler, event, editing and tooltip purposes; its printer/parser receive the same current viewport.

With context, Gregorian parsers accept chart abbreviations. Missing date/year/hour/minute fields resolve against the left bound's local calendar fields in the configured offset, never the computer's clock. `13h` means 13:00, `13:45` means 13:45:00 on the base date, `30s` uses the base hour/minute, and a month/year means the start of that period. If a clock abbreviation would land before the left bound and its next occurrence is in the window, the parser chooses that next occurrence: `03s` in a `23:59:59 → 00:00:19` view means three seconds after midnight. Explicit dates never roll automatically. `Δ 1e-100s` is a seconds offset from the exact left bound. Parsing a coarse label deliberately chooses that lower precision; hidden seconds cannot be recovered. Repeated clock labels in a wider window resolve to the first applicable occurrence; use a full timestamp to disambiguate. Full timestamps with explicit offsets remain independent of the view.

## Ruler graduations and breakpoints

Ruler marks are anchored to exact time values rather than evenly spaced screen positions. Panning moves the existing values across the screen. Zooming promotes marks to a larger visible tier and reveals finer subdivisions; scales too fine to discern or too large for the window are omitted. Long labeled marks and shorter subdivision marks have separate roles, so a year's weekly marks can coexist with monthly or quarterly labels.

**Time display → Ruler graduation** configures this independently of label printing. Automatic selects decimal graduations for rational, numeric, SI, scientific and custom printers, and civil calendar graduations for Gregorian printers. Overrides are saved with the timeline and travel through JSON, PostgreSQL, SQLite and offline HTML. They do not change events or the camera.

Decimal graduations use powers of ten, with ten intervals between consecutive labeled marks. Steps are in displayed units: a decimal ruler in minutes with scale `60` uses minute multiples and their decimal subdivisions, anchored to the configured origin. Absolute values and tick steps remain exact rationals at every zoom depth.

Gregorian rulers align seconds, minutes, hours and days in the configured fixed offset. Day views reveal the 24 hours; hour views reveal the 60 minutes when there is enough room. Weeks begin on Monday. Year views can reveal weekly marks, with 52 or 53 Monday boundaries depending on the year; weeks are never stretched into 52 equal pieces of a civil year. Months start on their real first days, quarters on January/April/July/October, and years on January 1. February, leap days and century rules affect actual tick positions. Decimal decades of civil years cover wider views, including negative or arbitrarily large years. Seconds and subsecond scales use decimal subdivisions. Nominal month/year lengths are used only to select a visible level and label detail, never to position a tick.

Custom exact steps provide a declarative graduation ladder without additional script execution. For example:

```json
"ruler": {
  "kind": "steps",
  "steps": ["1", "60", "3600", "86400"]
}
```

The list specifies increasing intervals; adjacent entries define subdivision steps and zoom breakpoints. In seconds this defines seconds, minutes, hours and days. Below the smallest and above the largest interval, decimal powers of that endpoint continue the ladder. Each step is aligned to displayed zero, so lists need not divide evenly (although exact divisors usually make good uniform rulers). For a custom printer, steps use raw stored coordinates, matching the restricted interpreter's time arguments; custom source handles its own units/epoch. Use the Gregorian policy for variable calendar months and years rather than approximating them with fixed steps. Custom lists allow 2–32 positive, strictly increasing exact numbers, with at most 1,024 characters per canonical step.

The presenter interface includes `rules(context): RulerPlan`. Its result contains sorted visible `ticks` with an exact stored `time`, a `level` (`minor`, `major`, `boundary`), a `label` flag, and an exact `interval` used for label detail. `graduation` identifies the active labeled step. `interval` is a nominal display interval for calendar units; neighboring `time` values determine the true separation. The core also exports `planRuler` and `validateRulerPolicy`. Rule planning ignores `spacingPixels`, deriving visibility from the actual span/width, while the UI passes the selected tick interval back to the printer as label spacing. Existing `print`/`parse` functions need no changes.

Planning jumps directly to the first visible boundary using rational floor division or civil month/year arithmetic. It enumerates only visible ticks, deduplicates tier boundaries, and caps the total at 512 marks, including on exceptionally wide viewports. Label targets are about 90 pixels for decimal scales and 70 for calendar scales. Neighboring levels crossfade through the final factor of two before a breakpoint (or the whole interval when custom steps are closer). The alpha is smoothstep of exact normalized zoom depth, not elapsed time: stopping zoom freezes the fade, reversing zoom reverses it, and panning changes only positions. Minor marks fade from zero at nine pixels to full strength at eighteen pixels; larger viewports adjust spacing to preserve the work budget. Calendar parent marks fade in as their nominal span approaches the visible window. Dotted guides, notches, and labels have separate weights, allowing major marks to become minor marks continuously. At common coordinates, coincident labels with the same printed text are merged; differing calendar detail crossfades as two plain-text labels. These visual thresholds affect visibility, never the coordinates at which marks appear. No history of ruler values is retained while navigating.

## Persistence

An optional root-level field extends version-1 documents:

```json
"presentation": {
  "version": 1,
  "mode": "float",
  "significantDigits": 6,
  "unit": "minutes",
  "scale": "60/1",
  "origin": "0/1",
  "offsetMinutes": 0
}
```

Modes are `rational`, `float`, `scientific`, `si`, `gregorian`, and `custom`; custom requires a `source` string. Older files without the field retain the default rational view and export without an added settings field. Scale and origin are canonicalized, with an 8,192-character limit on each canonical configuration value; unit labels allow 80 printable characters. These settings limits do not restrict event precision.

PostgreSQL's idempotent migration adds nullable `oc_timelines.presentation` JSONB. **Run the normal migration when upgrading an existing server.** Settings participate in snapshot transactions, permissions and revision checks, and are included in read-only metadata responses. The server validates syntax but never runs a custom printer or parser.

SQLite saves add `timeline_settings` inside the version-1 file transaction. Old files lacking that table open without writing or migrating them. The next save creates it atomically with event and index updates. The standalone HTML embeds the formatter implementation, needs no extra assets, and retains its offline content policy. No dependencies or package-manager lockfiles change.

## Custom JavaScript and TypeScript subset

Saved custom source is retained when you switch to a built-in mode, so switching back does not discard your printer/parser. Retained source is still syntax-validated; it executes only in custom mode. Desktop file selection becomes the active save target only after the frontend accepts the document and its presentation settings.

Custom code uses a small interpreted language with JavaScript syntax. Optional TypeScript annotations are supported; this is not the full JavaScript runtime or TypeScript compiler. Define exactly two functions with semicolons and a final return:

```typescript
function print(time: Rational, api: TimeAPI): string {
  const minutes = api.div(time, api.rational('60'));
  return api.decimal(minutes, 6) + ' minutes';
}
function parse(text: string, api: TimeAPI): Rational {
  const minutes = api.parseNumber(api.stripSuffix(text, ' minutes'));
  return api.mul(minutes, api.rational('60'));
}
```

This rounds labels to six decimal places. Use `api.exact(minutes)` instead for an exact printer. Preview reports whether parsing the printed text preserves the coordinate. Custom functions receive raw stored time; implement scale/origin yourself. Built-in transform settings do not wrap custom code.

Allowed syntax: local `const`, string/number/boolean literals, parentheses, string concatenation, primitive comparisons, ternary conditionals, comments, and direct `api.method(...)` calls. Optional parameter, return and local annotations use `Rational`, `TimeAPI`, `string`, `number`, and `boolean` as appropriate. Annotations are descriptive; runtime checks enforce argument/result types. Use `api.compare(a,b) < 0` for rational comparisons.

No reassignment, object/array construction, indexing, property access, other function definitions/calls, regex, template literals, loops, recursion, imports, or globals are available.

| API                                                    | Behavior                                                  |
| ------------------------------------------------------ | --------------------------------------------------------- |
| `rational(text)`                                       | Integer/fraction → opaque exact rational                  |
| `parseNumber(text)`                                    | Decimal/scientific/fraction → exact rational              |
| `exact(q)`                                             | Canonical `n/d` string                                    |
| `add/sub/mul/div(q,q)`                                 | Exact arithmetic                                          |
| `neg(q)`, `abs(q)`, `compare(q,q)`                     | Sign operations; comparison returns -1/0/1                |
| `decimal(q,places=6)`                                  | Fixed decimal places, 0–30                                |
| `scientific(q,digits=6)`                               | Scientific display, 1–30 significant digits               |
| `timestamp(q,offsetMinutes=0)`, `parseTimestamp(text)` | Exact Gregorian / rational Unix seconds                   |
| `trim(text)`, `stripSuffix(text,suffix)`               | Trim, or require/remove a literal suffix and trim         |
| `slice(text,start,end?)`                               | String slice; integer indices ±2048                       |
| `replace(text,from,to)`                                | Replace first literal match; no regex or `$` substitution |
| `upper(text)`, `lower(text)`                           | Case conversion                                           |
| `startsWith(text,prefix)`, `endsWith(text,suffix)`     | Boolean literal string checks                             |

For example, `api.replace(api.timestamp(time), "T", " ")` prints a space separator; `api.parseTimestamp(api.replace(text, " ", "T"))` reverses it. Results always become plain text, even when they contain HTML. Parsers must return an opaque rational, not a string, number or object.

### Restricted context helpers

Custom printers **and parsers** receive context through their existing `api` argument, without access to a browser or context object:

| Helper                                    | Result                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `hasView()`                               | Whether context was supplied                                                                |
| `viewLeft()`, `viewRight()`, `viewSpan()` | Exact rationals in stored coordinate units                                                  |
| `viewWidth()`                             | Drawable width in CSS pixels                                                                |
| `unitsPerPixel()`                         | Exact `span / width`                                                                        |
| `labelResolution()`                       | Exact `unitsPerPixel × spacingPixels`; defaults to 115 pixels for a ruler and six otherwise |
| `purpose()`                               | `axis`, `event`, `input`, or `tooltip`; `input` without context                             |

Existing two-argument source functions remain compatible. Bounds helpers fail clearly without context, and returned rationals obey the same arithmetic budgets. For example:

```typescript
function print(time: Rational, api: TimeAPI): string {
  const exact = api.purpose() === 'input' ? true : api.purpose() === 'tooltip';
  return exact ? api.exact(time) : api.scientific(api.sub(time, api.viewLeft()), 4) + ' from left';
}
function parse(text: string, api: TimeAPI): Rational {
  return api.endsWith(text, ' from left')
    ? api.add(api.viewLeft(), api.parseNumber(api.stripSuffix(text, ' from left')))
    : api.rational(text);
}
```

Transform raw coordinate helpers yourself for custom units. Prefer exact/absolute editing output when labels depend on the view: context describes the viewport at each call, so panning before parsing a relative label changes its reference.

## Execution boundary

Source is parsed into the app's own AST and interpreted. It never reaches `eval`, `Function`, script elements, the server runtime or Tauri. Each invocation sees only its time/text argument and fixed helper dispatch. There is no access to event metadata, accounts, cookies, storage, DOM, native file commands, network, timers or modules. Opaque rationals expose no properties to this language. Bindings use Maps and API names are checked against own whitelist entries, preventing prototype/constructor lookup.

Limits bound source and helper work: 16,384 source characters, 4,096 tokens, 1,024 parsed expressions, 32 syntactic nesting levels, 128 locals per function, 4,096 execution steps, 64 evaluation levels, 128 API calls, 2,048 characters per string, 32,768 cumulative string characters, 4,096 bits per rational component, and 65,536 cumulative evaluated rational component bits. Custom scientific exponents allow ±1,000. Numeric option literals have magnitude at most one million; exact numbers use `api.rational`. These are operation budgets, not a wall-clock guarantee. Huge stored times remain supported by built-ins. A failed custom printer displays the exact coordinate with an error; a failed parser leaves the existing exact input untouched.

For automatically loaded, shared settings, retain this restricted interpreter and add capabilities only through audited, bounded helpers and rejection tests. A plain Worker is insufficient isolation: [MDN documents that workers retain fetch, WebSockets and IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers). Keep existing CSP restrictions; dynamic-code permissions are unnecessary.

If full JavaScript becomes necessary, implement it separately through an isolated interpreter runtime inside a terminable worker, no ambient host capabilities/imports, data-only helper bridges, memory limits and an independent hard timeout. Review the runtime and bridge for security. This implementation provides the small language instead of claiming that arbitrary JavaScript is safe when global names are hidden. Rejection, resource-limit and round-trip tests are included; they do not replace a security audit.

At high magnification, numeric presets print offsets from the exact left bound instead of rounding neighboring labels to the same absolute value. The common caption gives that origin; `Δ` labels parse with the same viewport context. Input fields retain the configured full presentation, and reapplying unchanged input preserves the exact coordinate.

Gregorian subsecond windows use relative SI seconds (`ms`, `µs`, `ns`, `ps`, and smaller prefixes through `qs`), with scientific notation beyond the SI range. Parsers also accept `us` for microseconds. Deep past dates continue from `mya` to `bya`, `tya` and larger three-order units, measured from 2000 CE; distant future dates use SI years after 2000 CE. These labels are cosmetic rounded ages, not a change to stored exact time.

The moment editor provides a Gregorian calendar grid and time controls when the timeline uses that preset. A month-sized view exposes month/day selection without requiring the year; an hour-sized view exposes minute/second editing. **Expand calendar context** reveals omitted fields. Hidden fields inherit the selected coordinate rather than today's date. CE/BCE years, arbitrary-size years, exact fractional seconds, the configured fixed timezone offset, origin and scale are preserved. Full manual text input remains available for all presets and custom printers/parsers.
