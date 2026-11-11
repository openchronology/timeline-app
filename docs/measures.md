# Measures

<!-- description: Exact quantities that moments and durations carry, such as a cost or hours worked: declared per timeline, given per event, and added up exactly. -->

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

A **measure** is a named quantity that a timeline's events (moments and durations) carry, such as an invoice's cost or the hours a task took ([#570](https://github.com/openchronology/timeline-app/issues/570)). A timeline declares its measures, and each event gives its own values. Values are exact, never rounded, so totals always add up to the cent.

This page covers declaring measures, giving values and how they're shown ([#572](https://github.com/openchronology/timeline-app/issues/572), [#573](https://github.com/openchronology/timeline-app/issues/573)). Totals in summaries come next ([#574](https://github.com/openchronology/timeline-app/issues/574)).

## In the editor

**Measures** in the timeline's toolbar (under Tools on a phone) lists the timeline's measures. If you can edit the timeline, you can add, change and remove them there. For each measure you choose:

- **Label:** what the editor calls it, such as Cost.
- **Name in the data:** the key its values are stored under, filled in from the label.
- **Holds:** whole numbers or fractions.
- **Shown as:** see [How values are shown](#how-values-are-shown).

The dialog shows an example as you go. When saving would change values, it says how first: a renamed measure's values move, a removed measure's values are deleted.

Once a timeline has measures, a moment's or duration's details have a field for each one. You type a value as the measure shows it, such as `$1,234.56`, and it's stored exactly. Text that would have to be rounded is refused, with the reason, instead of being stored rounded. The reader lists an event's values the same way.

Changes in the dialog are undone like other edits. Renaming, removing or narrowing a measure on a server timeline is saved at once, as one version, so save your other changes first.

## Declaring measures

A timeline's `measures` setting names each measure, with its type and an optional label:

```json
"measures": {
  "cost": { "type": "mpz", "label": "Cost (cents)" },
  "hours": { "type": "mpq", "label": "Hours" }
}
```

| Type  | Holds                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------ |
| `mpz` | Whole numbers of any size, such as an amount in cents.                                                             |
| `mpq` | Exact fractions of any size, such as `3/2` hours. Use it when a value may not be whole; decimals become fractions. |

Only these two types exist. Both add up exactly, in any order, which every summary needs. Floating-point and fixed-size numbers don't: their totals would depend on how they were grouped.

- **Names:** lowercase letters, digits and underscores, starting with a letter, at most 40 characters.
- **Count:** at most 32 measures per timeline.
- **Labels:** what the editor calls a measure, up to 80 characters. Its name is used when it has no label.

## Giving values

An event gives its values under `measures` in its metadata, as text:

```json
{
  "id": "invoice-7",
  "time": "1704067200/1",
  "metadata": { "title": "Invoice 7", "measures": { "cost": "123456", "hours": "3/2" } }
}
```

- **Text only:** a value is an integer (`1250`), a fraction (`3/2`) or a decimal (`12.5`), always as text. JSON numbers aren't exact, so they're refused.
- **Canonical form:** values are stored as whole numbers or fractions in lowest terms: `6/4` becomes `3/2`, and `12.50` becomes `25/2`.
- **Zero:** an event without a value has zero. Zeros aren't stored.
- **Declared names only:** a value for a measure the timeline doesn't declare is refused. So is a fraction for an `mpz` measure.
- **Size:** values are bounded like times: at most 2,200 characters, and on a server the same digit limit as times (`TIME_DIGIT_LIMIT`).

A value is exact, so `0.1` is exactly one tenth, not the closest binary fraction.

## How values are shown

Measures are written and read by an official library of formats, the counterpart of the [time displays](time-presentation.md) such as Gregorian dates ([#585](https://github.com/openchronology/timeline-app/issues/585)). Each format serves one type, and sets how values and totals are written and how what you type is read. All are exact: nothing passes through floating-point arithmetic. Plugins don't provide formats.

```json
"cost": { "type": "mpz", "label": "Cost", "presentation": { "mode": "fixed", "scale": "1/100", "decimals": 2, "prefix": "$" } }
```

| Type  | Format (`mode`) | Shows                                                                                    | Example (stored → shown)                         |
| ----- | --------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `mpq` | `fraction`      | An improper fraction, or a whole number alone. The default for `mpq`.                    | `7/2` → `7/2`                                    |
| `mpq` | `decimal`       | Floating point: `significantDigits` significant digits (6 by default)                    | `1/3` → `0.333333`                               |
| `mpq` | `scientific`    | Scientific notation                                                                      | `123456` → `1.23456e+5`                          |
| `mpq` | `engineering`   | Engineering notation: exponents in multiples of three                                    | `123456` → `123.456e3`                           |
| `mpz` | `fixed`         | Fixed decimal places (`decimals`, 0 by default), as money is. The only format for `mpz`. | `123456` → `$1,234.56` (scale `1/100`, 2 places) |

A format that doesn't serve the measure's type is refused. Widening a measure from `mpz` to `mpq` chooses one of the `mpq` formats with it.

- **`scale`:** the shown value is the stored value × scale, an exact number such as `1/100` (cents shown as dollars) or `1/3600` (seconds shown as hours). It is 1 by default.
- **`prefix`:** written before the number, such as `$`.
- **`unit`:** written after it, such as `h`.
- **`grouping`:** separates thousands with commas in the `fixed` and `decimal` formats. Set it to `false` to turn that off.

Typed values can be written with or without the prefix, unit and commas. With fixed decimals, a value with more decimal places than the measure shows (`$12.345`) is refused rather than rounded. So is a value of a whole-number measure that isn't a whole number of its steps, such as half a cent. Where a label rounds a value, its tooltip gives the exact value, and editing a field you haven't changed keeps the exact value.

## Changing declarations

A save may add measures, change their labels, or widen a measure from `mpz` to `mpq`. Other changes would leave values that the new declarations don't allow, so they rewrite those values in one save:

| Change              | What happens to values                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Renaming a measure  | They move to the new name.                                                                                |
| Removing a measure  | They're dropped.                                                                                          |
| `mpq` back to `mpz` | Allowed only when every value is whole. Otherwise the change is refused, naming an event with a fraction. |

On a server, make these changes with `POST /api/timelines/{id}/measures`, giving the new declarations and any `renames` (old name to new). It is one save, so one version the timeline's history can go back to. A plain save that renames, removes or narrows a measure is refused with 409.

```json
{ "revision": "12", "measures": { "price": { "type": "mpz" } }, "renames": { "cost": "price" } }
```

## Totals

Every summary of a timeline keeps the total of each measure over what it summarizes ([#574](https://github.com/openchronology/timeline-app/issues/574)), beside the count it keeps. The total is exact, and computed the same way wherever the timeline is kept: in the browser, on a server and in a desktop file.

- **How:** the trees that index a timeline's moments keep, at every node, the totals of the moments beneath it. A summary of any stretch of time reads a few nodes rather than every moment. A change to an event's values updates the nodes on one path.
- **Where:** the browser's index, the server's PostgreSQL trees and a desktop file's SQLite index all keep them. A desktop file saved before this is re-indexed when it is opened.
- **In overviews:** each group in an overview (`/api/timelines/{id}/query` with `kind: "overview"`) has `totals`, the exact totals of its moments by measure name, with zeros left out.

## Durations

A duration's values count entirely **where it starts**, as if it were a moment at its start ([#576](https://github.com/openchronology/timeline-app/issues/576)). Its whole value goes to the summary or window holding its start, never split between windows or counted twice.

- **Collapsed durations:** durations too short to draw at the view's scale join summaries, and their values join the summary's totals.
- **Bands:** a duration long enough to draw as a band keeps its own values. Its reader and hover card show them, and a [measure chart](plugins.md#charting-a-measure) counts them at its start.
- **Ongoing durations:** each counts where it starts, like the rest.
- **Trees:** the duration trees keep subtree totals by start in every edition, so a summary of many durations reads cached totals, as one of many moments does.

## Showing totals

- **Summaries:** a summary's label says what it holds, then up to two of its totals, each labelled and shown as its measure shows totals: `3 moments · Cost $21.50`. Its tooltip and the name screen readers hear list them all.
- **Single events:** an event's values are listed in the reader and in its hover card.
- **Separated tracks:** each track's summaries show their own totals. A track too narrow to draw collapses into another with its totals, as one timeline's.
- **Comparisons:** a comparison never adds totals across its timelines ([#586](https://github.com/openchronology/timeline-app/issues/586)). Each timeline's measures are its own: two timelines' `cost` aren't the same quantity. Side by side, each track's summaries keep their own timeline's totals. Combined, a summary keeps its totals by timeline (`sourceTotals`), and plugins that use totals choose how to show each one. Labels show no totals in a comparison.

Plugins can use measures too ([plugins](plugins.md)):

- **Scripts:** `api.measure("cost")` reads a moment's value exactly, to compare with `api.compare`.
- **Sizes:** `sizeBy` sizes markers and summaries by a measure's total.
- **Charts:** the background chart can draw a measure's totals across the view.

## Where measures go

The declarations are a timeline setting, like its title and time display. They're kept by:

- saves, forks, copies, merges, pull requests and saved history;
- exports (`.ochx`) and imports;
- desktop `.och` files, `och-convert`, the offline file and browser drafts.

The [API](api.md) returns them in a timeline's metadata and document.
