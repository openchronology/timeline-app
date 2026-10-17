// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The date and time fields beside a time input on Gregorian timelines, with exact arithmetic
// and the timeline's zone offset.
import { Q, parseTimestamp, printTimestamp } from './core.js';
import { dayNumber, dateParts } from './calendar.js';
import { parseNumber } from './numeric.js';
import type { TimePresentation, PresentationContext } from './presentation.js';

/**
 * Calendar controls use exact arithmetic and the timeline's zone, never the host's Date.
 *
 * Fills `host` with year/era, month, day, hour, minute and second fields and a month grid
 * for `time`, a stored coordinate. Shown only for Gregorian presentations; otherwise `host`
 * is emptied and hidden. Fields the current view makes obvious (`context.span`: the year
 * within a year's view, the date within a day's, …) move into a collapsed "Expand calendar
 * context" section but still count. Every committed change rebuilds the time from all
 * fields and calls `change` with the new stored coordinate; invalid input shows a message
 * in an alert region instead. `disabled` makes everything read-only.
 */
export function calendarPicker(
  host: HTMLElement,
  settings: TimePresentation | undefined,
  time: Q,
  context: PresentationContext,
  disabled: boolean,
  change: (time: Q) => void,
) {
  host.replaceChildren();
  host.hidden = settings?.mode !== 'gregorian';
  if (!settings || host.hidden) return;
  // Work in displayed seconds, (stored − origin) / scale, and map back only on commit.
  const scale = Q.parse(settings.scale),
    origin = Q.parse(settings.origin);
  const coordinate = time.sub(origin).div(scale);
  // The local fields of the whole second; group 7 is the zone suffix, reused on commit.
  const stamp = printTimestamp(coordinate.floor(), settings.offsetMinutes);
  const match = /^([+-]?\d+)-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(.*)$/.exec(stamp)!;
  const year = BigInt(match[1]);
  const fields = new Map<string, HTMLInputElement>();

  const calendar = document.createElement('div'),
    clock = document.createElement('div');
  calendar.className = clock.className = 'calendar-picker-fields';
  const contextFields = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Expand calendar context';
  contextFields.append(summary);
  // Thresholds match the adaptive labels: a day, a Julian year, an hour, a minute.
  const span = context.span.div(scale);
  const hideDate = span.compare(Q.from(86400n)) <= 0;
  const hideYear = span.compare(Q.from(31557600n)) < 0;
  const hideHour = span.compare(Q.from(3600n)) <= 0;
  const hideMinute = span.compare(Q.from(60n)) <= 0;
  /**
   * Adds a labelled input to `parent` and commits on `change` (not on every keystroke, so
   * half-typed values aren't rejected). Year and Second are text fields: years may exceed
   * what a number input holds exactly, and seconds may be exact fractions like `1/3`.
   */
  function field(name: string, value: string, parent: HTMLElement, min?: string, max?: string) {
    const label = document.createElement('label');
    label.textContent = name;
    const input = document.createElement('input');
    input.type = name === 'Second' || name === 'Year' ? 'text' : 'number';
    input.setAttribute('aria-label', 'Calendar ' + name.toLowerCase());
    input.value = value;
    input.disabled = disabled;
    if (min) input.min = min;
    if (max) input.max = max;
    fields.set(name, input);
    label.append(input);
    parent.append(label);
    input.addEventListener('change', commit);
  }
  // The year field holds the BCE/CE year (always positive); astronomical 0 is 1 BCE.
  field('Year', String(year > 0n ? year : 1n - year), hideYear ? contextFields : calendar, '1');
  const eraLabel = document.createElement('label');
  eraLabel.textContent = 'Era';
  const era = document.createElement('select');
  era.setAttribute('aria-label', 'Calendar era');
  for (const name of ['CE', 'BCE']) {
    const option = document.createElement('option');
    option.value = option.textContent = name;
    era.append(option);
  }
  era.value = year > 0n ? 'CE' : 'BCE';
  era.disabled = disabled;
  eraLabel.append(era);
  (hideYear ? contextFields : calendar).append(eraLabel);
  era.onchange = commit;
  field('Month', match[2], hideDate ? contextFields : calendar, '1', '12');
  field('Day', match[3], hideDate ? contextFields : calendar, '1', '31');
  field('Hour', match[4], hideHour ? contextFields : clock, '0', '23');
  field('Minute', match[5], hideMinute ? contextFields : clock, '0', '59');
  // A fractional rational survives edits to dates or hours, including nonterminating fractions.
  field(
    'Second',
    Q.from(BigInt(match[6])).add(coordinate.sub(coordinate.floor())).toString(),
    clock,
  );
  const grid = document.createElement('div');
  grid.className = 'calendar-day-picker';
  (hideDate ? contextFields : calendar).append(grid);
  /**
   * Redraws the month grid for the fields' year, era and month: previous/next month
   * buttons, weekday headings (weeks start on Monday) and a button per day, the chosen one
   * marked with aria-pressed. Draws nothing while the year or month is incomplete.
   */
  function refreshGrid() {
    grid.replaceChildren();
    try {
      let y = BigInt(fields.get('Year')!.value);
      if (y <= 0n) return;
      if (era.value === 'BCE') y = 1n - y;
      const m = BigInt(fields.get('Month')!.value);
      if (m < 1n || m > 12n) return;
      // Day numbers count days from 1970-01-01; the next month's first day gives the length.
      const first = dayNumber(y, m, 1n),
        next = dayNumber(m === 12n ? y + 1n : y, m === 12n ? 1n : m + 1n, 1n);
      const bar = document.createElement('div');
      bar.className = 'calendar-month-nav';
      const title = document.createElement('span');
      title.textContent = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ][Number(m) - 1];
      for (const step of [-1n, 1n]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = step < 0n ? '‹' : '›';
        button.disabled = disabled;
        button.setAttribute('aria-label', step < 0n ? 'Previous month' : 'Next month');
        button.onclick = () => {
          // The day before this month's first, or the next month's first, gives the month
          // to move to, crossing years and eras without special cases.
          const [ny, nm] = dateParts(step < 0n ? first - 1n : next);
          fields.get('Year')!.value = String(ny > 0n ? ny : 1n - ny);
          era.value = ny > 0n ? 'CE' : 'BCE';
          fields.get('Month')!.value = String(nm);
          fields.get('Day')!.value = '1';
          commit();
        };
        if (step < 0n) bar.append(button, title);
        else bar.append(button);
      }
      grid.append(bar);
      const cells = document.createElement('div');
      cells.className = 'calendar-days';
      for (const weekday of ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']) {
        const label = document.createElement('span');
        label.textContent = weekday;
        cells.append(label);
      }
      // Day 0 (1970-01-01) was a Thursday, index 3 from Monday; the double modulo keeps
      // the result non-negative for days before 1970.
      const skip = Number((((first + 3n) % 7n) + 7n) % 7n);
      for (let i = 0; i < skip; i++) cells.append(document.createElement('span'));
      for (let d = 1n; d <= next - first; d++) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = String(d);
        button.disabled = disabled;
        button.setAttribute('aria-label', 'Pick day ' + d);
        // Compare numerically as well, so a zero-padded `05` marks day 5.
        button.setAttribute(
          'aria-pressed',
          String(
            fields.get('Day')!.value === String(d) || BigInt(fields.get('Day')!.value || '0') === d,
          ),
        );
        button.onclick = () => {
          fields.get('Day')!.value = String(d);
          commit();
        };
        cells.append(button);
      }
      grid.append(cells);
    } catch {
      /* Incomplete year/month text stays editable. */
    }
  }
  refreshGrid();
  const error = document.createElement('p');
  error.className = 'form-error';
  // Announced as soon as a message appears.
  error.setAttribute('role', 'alert');
  host.append(calendar, clock, contextFields, error);
  contextFields.hidden = !hideYear && !hideDate && !hideHour && !hideMinute;
  if (!contextFields.hidden) {
    // Collapsed fields still contribute their current values to the chosen time.
    const note = document.createElement('p');
    note.className = 'field-hint';
    note.textContent = 'Fields hidden at this zoom level keep their current values.';
    contextFields.append(note);
  }
  /**
   * Rebuilds the stored time from every field (hidden ones included) as an ISO timestamp in
   * the timeline's zone, adds the exact seconds, and maps it back through scale and origin.
   * Reports invalid fields (an impossible date, seconds outside [0, 60)) in the error line.
   */
  function commit() {
    refreshGrid();
    try {
      const get = (name: string) => fields.get(name)!.value;
      let y = BigInt(get('Year'));
      if (y <= 0n) throw new Error('The era year must be positive.');
      if (era.value === 'BCE') y = 1n - y;
      const sec = parseNumber(get('Second'));
      if (sec.compare(Q.zero) < 0 || sec.compare(Q.from(60n)) >= 0)
        throw new Error('Seconds must be from zero to below 60.');
      const pad = (value: string) => String(BigInt(value)).padStart(2, '0');
      const ys = y < 0n ? '-' + String(-y).padStart(4, '0') : String(y).padStart(4, '0');
      const next = parseTimestamp(
        `${ys}-${pad(get('Month'))}-${pad(get('Day'))}T${pad(get('Hour'))}:${pad(get('Minute'))}:00${match[7]}`,
      ).add(sec);
      error.textContent = '';
      change(origin.add(next.mul(scale)));
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e);
    }
  }
}
