# Measures

<!-- description: Exact quantities that moments and durations carry, such as a cost or hours worked: declared per timeline, given per event, and added up exactly. -->

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

A **measure** is a named quantity that a timeline's events (moments and durations) carry, such as an invoice's cost or the hours a task took ([#570](https://github.com/openchronology/timeline-app/issues/570)). A timeline declares its measures, and each event gives its own values. Values are exact, never rounded, so totals always add up to the cent.

This page covers declaring measures and giving values ([#572](https://github.com/openchronology/timeline-app/issues/572)). Showing values and typing them in the editor, and totals in summaries, come next ([#573](https://github.com/openchronology/timeline-app/issues/573), [#574](https://github.com/openchronology/timeline-app/issues/574)).

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

## Where measures go

The declarations are a timeline setting, like its title and time display. They're kept by:

- saves, forks, copies, merges, pull requests and saved history;
- exports (`.ochx`) and imports;
- desktop `.och` files, `och-convert`, the offline file and browser drafts.

The [API](api.md) returns them in a timeline's metadata and document.
