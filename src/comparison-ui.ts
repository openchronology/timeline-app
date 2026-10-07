// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { DEFAULT_PRESENTATION } from './core.js';
import type { TimePresentation } from './core.js';
import { ComparisonView, samePresentation } from './comparison.js';
import type { ComparisonSource } from './comparison.js';
interface Host {
  available(): boolean;
  current(): ComparisonSource | null;
  sources(ids: string[]): Promise<ComparisonSource[]>;
  search(
    search: string,
    page: number,
  ): Promise<{
    timelines: { id: string; title: string; owner: string }[];
    page: number;
    pages: number;
  }>;
  start(sources: ComparisonSource[], presentation: TimePresentation): void;
  fail(error: unknown): void;
  generation(): number;
}
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export function comparisonUI(host: Host) {
  let epoch = 0,
    page = 1,
    timer: ReturnType<typeof setTimeout>;
  const selected = new Map<string, string>();
  const input = el<HTMLInputElement>('compare-search');
  function selection() {
    el('compare-selected').textContent = `${selected.size} selected (two to eight timelines)`;
    el<HTMLButtonElement>('compare-start').disabled = selected.size < 2;
    el('compare-chosen').replaceChildren();
    for (const [key, title] of selected) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${title || 'Untitled timeline'} ×`;
      button.setAttribute('aria-label', `Remove ${title} from comparison`);
      button.onclick = () => {
        selected.delete(key);
        files.delete(key);
        selection();
      };
      el('compare-chosen').append(button);
    }
    for (const checkbox of el('compare-results').querySelectorAll<HTMLInputElement>('input')) {
      checkbox.checked = selected.has(checkbox.dataset.timelineId!);
      checkbox.disabled = selected.size >= 8 && !checkbox.checked;
    }
  }
  async function refresh() {
    const request = ++epoch;
    el('compare-results').replaceChildren();
    el('compare-page').textContent = 'Loading…';
    el<HTMLButtonElement>('compare-next').disabled = true;
    el<HTMLButtonElement>('compare-previous').disabled = true;
    if (!host.available()) {
      el('compare-page').textContent =
        'Server browsing requires a connection. Add a JSON timeline below.';
      return;
    }
    try {
      const result = await host.search(input.value, page);
      if (request !== epoch || !el<HTMLDialogElement>('compare-dialog').open) return;
      for (const timeline of result.timelines) {
        const label = document.createElement('label'),
          checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.timelineId = timeline.id;
        checkbox.checked = selected.has(timeline.id);
        checkbox.disabled = selected.size >= 8 && !checkbox.checked;
        checkbox.onchange = () => {
          if (checkbox.checked && selected.size < 8) selected.set(timeline.id, timeline.title);
          else selected.delete(timeline.id);
          selection();
          for (const box of el('compare-results').querySelectorAll<HTMLInputElement>('input'))
            box.disabled = selected.size >= 8 && !box.checked;
        };
        label.append(
          checkbox,
          document.createTextNode(`${timeline.title || 'Untitled timeline'} · @${timeline.owner}`),
        );
        el('compare-results').append(label);
      }
      el('compare-page').textContent = result.pages
        ? `Page ${result.page} of ${result.pages}`
        : 'No visible timelines match.';
      el<HTMLButtonElement>('compare-previous').disabled = page <= 1;
      el<HTMLButtonElement>('compare-next').disabled = page >= result.pages;
    } catch (error) {
      if (request === epoch) {
        el('compare-page').textContent = 'Could not load timelines.';
        host.fail(error);
      }
    }
  }
  const files = new Map<string, ComparisonSource>();
  let formatRequest = 0;
  async function choose(sources: ComparisonSource[]): Promise<TimePresentation | null> {
    if (samePresentation(sources)) return sources[0].presentation ?? DEFAULT_PRESENTATION;
    const dialog = el<HTMLDialogElement>('compare-format-dialog'),
      select = el<HTMLSelectElement>('compare-format');
    select.replaceChildren();
    const options: { label: string; value: TimePresentation }[] = sources.map((s) => ({
      label: `${s.title} display`,
      value: s.presentation ?? DEFAULT_PRESENTATION,
    }));
    for (const mode of ['rational', 'gregorian', 'float', 'scientific', 'si'] as const)
      options.push({
        label: mode === 'gregorian' ? 'Gregorian BCE/CE' : mode,
        value: { ...DEFAULT_PRESENTATION, mode },
      });
    options.forEach((option, i) => {
      const element = document.createElement('option');
      element.value = String(i);
      element.textContent = option.label;
      select.append(element);
    });
    dialog.returnValue = '';
    dialog.showModal();
    return new Promise((resolve) => {
      const close = () => {
        dialog.removeEventListener('close', close);
        resolve(dialog.returnValue === 'apply' ? options[Number(select.value)].value : null);
      };
      dialog.addEventListener('close', close);
    });
  }
  async function start(sources: ComparisonSource[]) {
    const request = ++formatRequest;
    const dialog = el<HTMLDialogElement>('compare-format-dialog');
    if (dialog.open) dialog.close('cancel');
    const generation = host.generation();
    const presentation = await choose(sources);
    if (presentation && request === formatRequest && generation === host.generation())
      host.start(sources, presentation);
  }
  el('compare-button').onclick = () => {
    selected.clear();
    files.clear();
    const current = host.current();
    if (current) {
      selected.set(current.key, current.title);
      files.set(current.key, current);
    }
    page = 1;
    input.value = '';
    selection();
    el<HTMLDialogElement>('compare-dialog').showModal();
    void refresh();
  };
  el('compare-dialog').addEventListener('close', () => {
    epoch++;
    clearTimeout(timer);
    el('compare-results').replaceChildren();
    files.clear();
  });
  input.oninput = () => {
    epoch++;
    clearTimeout(timer);
    timer = setTimeout(() => {
      page = 1;
      void refresh();
    }, 250);
  };
  el('compare-next').onclick = () => {
    page++;
    void refresh();
  };
  el('compare-previous').onclick = () => {
    page--;
    void refresh();
  };
  el('compare-start').onclick = async () => {
    const request = epoch;
    el<HTMLButtonElement>('compare-start').disabled = true;
    try {
      const sources = await host.sources([...selected.keys()].filter((key) => !files.has(key)));
      if (request !== epoch || !el<HTMLDialogElement>('compare-dialog').open) return;
      const all = [...selected.keys()].map(
        (key) => files.get(key) ?? sources.find((source) => source.key === key)!,
      );
      el<HTMLDialogElement>('compare-dialog').close();
      await start(all);
    } catch (error) {
      host.fail(error);
      selection();
    }
  };
  return {
    start,
    addFile(source: ComparisonSource) {
      if (selected.size >= 8) throw new Error('At most eight timelines can be compared.');
      files.set(source.key, source);
      selected.set(source.key, source.title);
      selection();
    },
  };
}
