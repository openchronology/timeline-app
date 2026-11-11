// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Measures in the editor (#573): the Measures dialog's rows, where a timeline declares its
// measures and how each is shown, and the moment and duration forms' fields, one per measure,
// read and written with the measure's own printer and parser.
import { Rational as Q } from 'rational-ordered-map';
import {
  MEASURE_LIMIT,
  MEASURE_NAME,
  MEASURES_KEY,
  measureLabel,
  measurePresenter,
  measureText,
  measureValue,
  validateMeasures,
} from './measures.js';
import type { Measures, MeasureValues } from './measures.js';
import { BALANCES } from './measure-balance.js';
import type { WindowBalance } from './measure-balance.js';
import {
  DEFAULT_MEASURE_MODE,
  MEASURE_FORMATS,
  createMeasurePresenter,
  validateMeasurePresentation,
} from './measure-presentation.js';
import type { MeasureMode, MeasurePresentation } from './measure-presentation.js';
import type { MeasureType } from './measures.js';

/** The official formats a measure of `type` may use (#585), as the dialog offers them. */
const formatsFor = (type: MeasureType): [string, string][] =>
  MEASURE_FORMATS.filter((f) => f.type === type).map((f) => [f.mode, `${f.label} (${f.example})`]);
/** Notations written with significant digits. */
const SIGNIFICANT = ['decimal', 'scientific', 'engineering'];
/** A name for a measure from its label: lowercase, underscores, starting with a letter. */
export function measureNameFor(label: string, taken: ReadonlySet<string>): string {
  let base = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+|_+$/g, '')
    .slice(0, 36);
  if (!base) base = 'measure';
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base}_${i}`;
  return name;
}

function field(labelText: string, control: HTMLElement, hint?: string): HTMLLabelElement {
  const label = document.createElement('label');
  label.append(labelText, control);
  if (hint) label.title = hint;
  return label;
}
function textInput(className: string, value: string, maxLength: number, placeholder = '') {
  const input = document.createElement('input');
  input.className = className;
  input.value = value;
  input.maxLength = maxLength;
  input.placeholder = placeholder;
  input.spellcheck = false;
  return input;
}
function numberInput(className: string, value: number, min: number, max: number) {
  const input = document.createElement('input');
  input.className = className;
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  return input;
}
function select(className: string, options: [string, string][], value: string) {
  const s = document.createElement('select');
  s.className = className;
  for (const [v, text] of options) {
    const option = document.createElement('option');
    option.value = v;
    option.textContent = text;
    s.append(option);
  }
  s.value = value;
  return s;
}

/**
 * How the dialog shows and reads a balance's time (#595): as the timeline shows times, to and
 * from exact canonical text. Without one, times are typed exactly.
 */
export interface MeasureTimes {
  print(time: string): string;
  parse(text: string): string;
}
const EXACT_TIMES: MeasureTimes = { print: (t) => t, parse: (t) => t.trim() };
/** Each row's way of reading its balance's time. */
const rowTimes = new WeakMap<HTMLElement, MeasureTimes>();

/**
 * Adds a row for measure `name` (as `measures` declares it), or a new one, to the dialog's
 * `list`. A row remembers the name it started with, so a changed name is a rename.
 */
export function addMeasureRow(
  list: HTMLElement,
  measures: Measures | undefined,
  name: string | null,
  onChange: () => void,
  times: MeasureTimes = EXACT_TIMES,
): HTMLFieldSetElement {
  const d = name && measures ? measures[name] : undefined;
  const p: MeasurePresentation = d?.presentation ?? {
    mode: DEFAULT_MEASURE_MODE[d?.type ?? 'mpz'],
  };
  const row = document.createElement('fieldset');
  row.className = 'measure-row';
  row.dataset.original = name ?? '';
  const legend = document.createElement('legend');
  legend.textContent = d ? measureLabel(measures, name!) : 'New measure';
  const label = textInput('measure-label', d?.label ?? '', 80, 'Cost, Hours…');
  const id = textInput('measure-name', name ?? '', 40, 'cost');
  id.pattern = MEASURE_NAME.source.slice(1, -1);
  // A new row's name follows its label until it is typed in itself.
  id.dataset.auto = name ? '' : '1';
  const type = select(
    'measure-type',
    [
      ['mpz', 'Whole numbers'],
      ['mpq', 'Fractions'],
    ],
    d?.type ?? 'mpz',
  );
  const mode = select('measure-mode', formatsFor(d?.type ?? 'mpz'), p.mode);
  // Each type has its own formats: changing the type offers its, keeping the format if it fits.
  type.addEventListener('input', () => {
    const kept = mode.value;
    mode.replaceChildren(
      ...formatsFor(type.value as MeasureType).map(([value, text]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        return option;
      }),
    );
    mode.value = [...mode.options].some((o) => o.value === kept)
      ? kept
      : DEFAULT_MEASURE_MODE[type.value as MeasureType];
  });
  const scale = textInput('measure-scale', p.scale ?? '1', 200, '1');
  const decimals = numberInput('measure-decimals', p.decimals ?? 0, 0, 30);
  const digits = numberInput('measure-digits', p.significantDigits ?? 6, 1, 30);
  const prefix = textInput('measure-prefix', p.prefix ?? '', 16, '$');
  const unit = textInput('measure-unit', p.unit ?? '', 40, 'h, kWh…');
  const grouping = document.createElement('input');
  grouping.type = 'checkbox';
  grouping.className = 'measure-grouping';
  grouping.checked = p.grouping !== false;
  const example = document.createElement('p');
  example.className = 'field-hint measure-example';
  // Its values as changes (#595): where a duration's applies, and a balance they lead to.
  const durations = select(
    'measure-durations',
    [
      ['start', 'At their start'],
      ['end', 'At their end'],
    ],
    d?.durations ?? 'start',
  );
  const anchor = d?.balance?.at;
  const balance = select(
    'measure-balance',
    [
      ['', 'No balance'],
      ['start', 'An opening balance, before everything'],
      ['end', 'A closing balance, after everything'],
      ['time', 'A balance at a time'],
    ],
    anchor === undefined ? '' : anchor === 'start' || anchor === 'end' ? anchor : 'time',
  );
  const balanceValue = textInput('measure-balance-value', '', 200, '0');
  if (d?.balance) {
    const presenter = createMeasurePresenter(d.type, d.presentation);
    balanceValue.value = presenter.print(
      Q.parse(d.balance.value.includes('/') ? d.balance.value : d.balance.value + '/1'),
      'input',
    );
    balanceValue.dataset.printed = balanceValue.value;
    balanceValue.dataset.exact = d.balance.value;
  }
  const balanceTime = textInput('measure-balance-time', '', 200);
  if (anchor && anchor !== 'start' && anchor !== 'end') {
    balanceTime.value = times.print(anchor);
    balanceTime.dataset.printed = balanceTime.value;
    balanceTime.dataset.exact = anchor;
  }
  rowTimes.set(row, times);
  const balanceValueField = field(
      'Balance',
      balanceValue,
      'Typed as the measure shows values; the balance just after that time’s changes',
    ),
    balanceTimeField = field('At', balanceTime);
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'button-danger measure-remove';
  remove.textContent = 'Remove';
  const decimalsField = field('Decimal places', decimals),
    digitsField = field('Significant digits', digits),
    groupingField = document.createElement('label');
  groupingField.className = 'calendar-label';
  groupingField.append(grouping, ' Separate thousands with commas');
  const refresh = () => {
    decimalsField.hidden = mode.value !== 'fixed';
    digitsField.hidden = !SIGNIFICANT.includes(mode.value);
    groupingField.hidden = !['fixed', 'decimal'].includes(mode.value);
    balanceValueField.hidden = !balance.value;
    balanceTimeField.hidden = balance.value !== 'time';
    if (id.dataset.auto) {
      const taken = new Set(
        [...list.querySelectorAll<HTMLInputElement>('.measure-name')]
          .filter((other) => other !== id)
          .map((other) => other.value),
      );
      id.value = label.value.trim() ? measureNameFor(label.value, taken) : '';
    }
    legend.textContent = label.value.trim() || id.value || 'New measure';
    try {
      const presentation = rowPresentation(row);
      const presenter = createMeasurePresenter(
        type.value as 'mpz' | 'mpq',
        presentation,
        label.value || id.value,
      );
      const sample = Q.from(
        type.value === 'mpz' ? 123456n : 1234567n,
        type.value === 'mpz' ? 1n : 8n,
      );
      example.textContent = `A stored value of ${measureText(sample)} shows as ${presenter.print(sample)}, and totals as ${presenter.print(sample.mul(Q.from(1000n)), 'total')}.`;
    } catch (error) {
      example.textContent = error instanceof Error ? error.message : String(error);
    }
    onChange();
  };
  id.addEventListener('input', () => {
    id.dataset.auto = '';
    refresh();
  });
  for (const control of [
    label,
    type,
    mode,
    scale,
    decimals,
    digits,
    prefix,
    unit,
    grouping,
    durations,
    balance,
    balanceValue,
    balanceTime,
  ])
    control.addEventListener('input', refresh);
  remove.onclick = () => {
    row.remove();
    onChange();
  };
  row.append(
    legend,
    field('Label', label),
    field('Name in the data', id, 'Lowercase letters, digits and underscores'),
    field('Holds', type),
    field('Shown as', mode),
    field(
      'Shown per stored unit',
      scale,
      'Displayed value = stored value × this, such as 1/100 for cents shown as dollars',
    ),
    decimalsField,
    digitsField,
    field('Before the number', prefix),
    field('Unit after it', unit),
    groupingField,
    example,
    field(
      'Durations’ values apply',
      durations,
      'A duration’s value changes the balance when it starts, or when it ends',
    ),
    field('Balance', balance, 'A known balance the values lead to or from'),
    balanceValueField,
    balanceTimeField,
    remove,
  );
  list.append(row);
  refresh();
  return row;
}

/** A row's presentation, validated; undefined when it is exact with nothing else. */
function rowPresentation(row: HTMLElement): MeasurePresentation | undefined {
  const value = (cls: string) => row.querySelector<HTMLInputElement>('.' + cls)!.value;
  const mode = value('measure-mode') as MeasureMode;
  const raw: Record<string, unknown> = { mode };
  const scale = value('measure-scale').trim();
  if (scale && scale !== '1') raw.scale = scale;
  if (mode === 'fixed') raw.decimals = Number(value('measure-decimals'));
  if (SIGNIFICANT.includes(mode)) raw.significantDigits = Number(value('measure-digits'));
  const prefix = value('measure-prefix').trim(),
    unit = value('measure-unit').trim();
  if (prefix) raw.prefix = prefix;
  if (unit) raw.unit = unit;
  if (!row.querySelector<HTMLInputElement>('.measure-grouping')!.checked) raw.grouping = false;
  return validateMeasurePresentation(raw, value('measure-type') as MeasureType);
}

/**
 * A row's balance (#595): where it is and its value, read as the row shows them (text left as
 * it was printed keeps its exact value); undefined for none.
 */
function rowBalance(
  row: HTMLElement,
  presentation: MeasurePresentation | undefined,
): { at: string; value: string } | undefined {
  const control = (cls: string) => row.querySelector<HTMLInputElement>('.' + cls)!;
  const kind = control('measure-balance').value;
  if (!kind) return undefined;
  const valueInput = control('measure-balance-value');
  const value =
    valueInput.dataset.printed !== undefined && valueInput.value === valueInput.dataset.printed
      ? valueInput.dataset.exact!
      : measureText(
          createMeasurePresenter(control('measure-type').value as MeasureType, presentation).parse(
            valueInput.value,
          ),
        );
  if (kind !== 'time') return { at: kind, value };
  const timeInput = control('measure-balance-time');
  if (!timeInput.value.trim()) throw new Error('give the time of its balance.');
  const at =
    timeInput.dataset.printed !== undefined && timeInput.value === timeInput.dataset.printed
      ? timeInput.dataset.exact!
      : (rowTimes.get(row) ?? EXACT_TIMES).parse(timeInput.value);
  return { at, value };
}

/**
 * The declarations the dialog's rows make, validated, and the renames they imply (a row whose
 * name changed). Throws a readable error naming the row at fault.
 */
export function readMeasureRows(list: HTMLElement): {
  measures: Measures;
  renames: Record<string, string>;
} {
  const raw: Record<string, unknown> = {};
  const renames: Record<string, string> = {};
  const rows = [...list.querySelectorAll<HTMLElement>('.measure-row')];
  if (rows.length > MEASURE_LIMIT)
    throw new Error(`A timeline declares at most ${MEASURE_LIMIT} measures.`);
  for (const row of rows) {
    const value = (cls: string) => row.querySelector<HTMLInputElement>('.' + cls)!.value.trim();
    const name = value('measure-name'),
      label = value('measure-label');
    const which = label || name || 'A new measure';
    if (!MEASURE_NAME.test(name))
      throw new Error(
        `${which}: its name in the data is lowercase letters, digits and underscores, starting with a letter.`,
      );
    if (name in raw) throw new Error(`Two measures are named ${name}.`);
    let presentation: MeasurePresentation | undefined;
    try {
      presentation = rowPresentation(row);
    } catch (error) {
      throw new Error(`${which}: ${(error as Error).message}`);
    }
    let balance: { at: string; value: string } | undefined;
    try {
      balance = rowBalance(row, presentation);
    } catch (error) {
      throw new Error(`${which}: ${(error as Error).message}`);
    }
    raw[name] = {
      type: value('measure-type'),
      ...(label ? { label } : {}),
      ...(presentation ? { presentation } : {}),
      ...(value('measure-durations') === 'end' ? { durations: 'end' } : {}),
      ...(balance ? { balance } : {}),
    };
    const original = row.dataset.original;
    if (original && original !== name) renames[original] = name;
  }
  return { measures: validateMeasures(raw), renames };
}

/**
 * The form's fields for an entity's values, one per declared measure, into `container`
 * (hidden when there are none). Each is typed as the measure shows it and read with its parser;
 * `onChange` gets the entity's new values (undefined for none) or an error to show.
 */
export function renderMeasureFields(
  container: HTMLElement,
  measures: Measures | undefined,
  metadata: Record<string, unknown>,
  editable: boolean,
  onChange: (values: MeasureValues | undefined, error: string | null) => void,
) {
  container.replaceChildren();
  const names = Object.keys(measures ?? {});
  container.hidden = !names.length;
  if (!measures || !names.length) return;
  const heading = document.createElement('h3');
  heading.textContent = 'Measures';
  container.append(heading);
  const inputs = new Map<string, HTMLInputElement>();
  const current = (): Record<string, string> => {
    const values = metadata[MEASURES_KEY];
    return values && typeof values === 'object' && !Array.isArray(values)
      ? { ...(values as Record<string, string>) }
      : {};
  };
  const read = () => {
    const values = current();
    for (const [name, input] of inputs) {
      const presenter = measurePresenter(measures, name);
      // Text as it was printed keeps the stored value exactly.
      if (input.value === input.dataset.printed) continue;
      try {
        const value = presenter.parse(input.value);
        input.setCustomValidity('');
        if (value.numerator === 0n) delete values[name];
        else values[name] = measureText(value);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        input.setCustomValidity(message);
        return onChange(undefined, message);
      }
    }
    onChange(Object.keys(values).length ? values : undefined, null);
  };
  for (const name of names) {
    const d = measures[name];
    const presenter = measurePresenter(measures, name);
    const value = measureValue(metadata, name);
    const input = document.createElement('input');
    input.className = 'measure-value';
    input.dataset.measure = name;
    input.inputMode = d.type === 'mpz' && !d.presentation?.scale ? 'numeric' : 'decimal';
    input.spellcheck = false;
    input.disabled = !editable;
    input.placeholder = '0';
    input.value = value.numerator === 0n ? '' : presenter.print(value, 'input');
    input.dataset.printed = input.value;
    const p = d.presentation;
    const decoration = [p?.prefix, p?.unit].filter(Boolean).join(' … ');
    const label = document.createElement('label');
    label.append(measureLabel(measures, name) + (decoration ? ` (${decoration})` : ''), input);
    if (value.numerator !== 0n) label.title = presenter.print(value, 'tooltip');
    input.addEventListener('change', read);
    inputs.set(name, input);
    container.append(label);
  }
}

/** Rows for a read-only list (the reader, hover cards): label and printed value. */
export function measureRows(
  measures: Measures | undefined,
  metadata: Record<string, unknown>,
): HTMLElement | null {
  if (!measures) return null;
  const list = document.createElement('dl');
  list.className = 'measure-list';
  for (const name of Object.keys(measures)) {
    const value = measureValue(metadata, name);
    if (value.numerator === 0n) continue;
    const presenter = measurePresenter(measures, name);
    const term = document.createElement('dt'),
      detail = document.createElement('dd');
    term.textContent = measureLabel(measures, name);
    detail.textContent = presenter.print(value);
    const exact = presenter.print(value, 'tooltip');
    if (exact !== detail.textContent) detail.title = exact;
    list.append(term, detail);
  }
  // Its balances before and after its changes (#595), where the view gives them.
  const balances = (metadata as Record<PropertyKey, unknown>)[BALANCES] as
    Record<string, WindowBalance> | undefined;
  for (const [name, balance] of Object.entries(balances ?? {})) {
    if (!measures[name]) continue;
    const presenter = measurePresenter(measures, name);
    const q = (text: string) => Q.parse(text.includes('/') ? text : text + '/1');
    const term = document.createElement('dt'),
      detail = document.createElement('dd');
    term.textContent = `${measureLabel(measures, name)} balance`;
    detail.textContent =
      balance.before === balance.after
        ? presenter.print(q(balance.after), 'total')
        : `${presenter.print(q(balance.before), 'total')} → ${presenter.print(q(balance.after), 'total')}`;
    detail.classList.add('measure-balance');
    list.append(term, detail);
  }
  return list.childElementCount ? list : null;
}
