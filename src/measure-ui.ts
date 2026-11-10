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
import { createMeasurePresenter, validateMeasurePresentation } from './measure-presentation.js';
import type { MeasureMode, MeasurePresentation } from './measure-presentation.js';

const MODES: [MeasureMode, string][] = [
  ['exact', 'Exact (fractions as they are)'],
  ['fixed', 'Fixed decimal places, such as money'],
  ['decimal', 'Significant digits'],
  ['scientific', 'Scientific notation'],
  ['si', 'SI prefixes (k, M, G…)'],
];
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
 * Adds a row for measure `name` (as `measures` declares it), or a new one, to the dialog's
 * `list`. A row remembers the name it started with, so a changed name is a rename.
 */
export function addMeasureRow(
  list: HTMLElement,
  measures: Measures | undefined,
  name: string | null,
  onChange: () => void,
): HTMLFieldSetElement {
  const d = name && measures ? measures[name] : undefined;
  const p: MeasurePresentation = d?.presentation ?? { mode: 'exact' };
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
  const mode = select('measure-mode', MODES, p.mode);
  const scale = textInput('measure-scale', p.scale ?? '1', 200, '1');
  const decimals = numberInput('measure-decimals', p.decimals ?? 2, 0, 30);
  const digits = numberInput('measure-digits', p.significantDigits ?? 6, 1, 30);
  const prefix = textInput('measure-prefix', p.prefix ?? '', 16, '$');
  const unit = textInput('measure-unit', p.unit ?? '', 40, 'h, kWh…');
  const grouping = document.createElement('input');
  grouping.type = 'checkbox';
  grouping.className = 'measure-grouping';
  grouping.checked = p.grouping !== false;
  const example = document.createElement('p');
  example.className = 'field-hint measure-example';
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
    digitsField.hidden = !['decimal', 'scientific', 'si'].includes(mode.value);
    groupingField.hidden = !['fixed', 'decimal'].includes(mode.value);
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
  for (const control of [label, type, mode, scale, decimals, digits, prefix, unit, grouping])
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
  if (['decimal', 'scientific', 'si'].includes(mode))
    raw.significantDigits = Number(value('measure-digits'));
  const prefix = value('measure-prefix').trim(),
    unit = value('measure-unit').trim();
  if (prefix) raw.prefix = prefix;
  if (unit) raw.unit = unit;
  if (!row.querySelector<HTMLInputElement>('.measure-grouping')!.checked) raw.grouping = false;
  const presentation = validateMeasurePresentation(raw);
  return Object.keys(presentation).length === 1 && presentation.mode === 'exact'
    ? undefined
    : presentation;
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
    raw[name] = {
      type: value('measure-type'),
      ...(label ? { label } : {}),
      ...(presentation ? { presentation } : {}),
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
  return list.childElementCount ? list : null;
}
