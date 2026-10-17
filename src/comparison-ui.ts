// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The comparison dialog: search for and choose two or more timelines (from servers or files)
// and start comparing them (comparison.ts).
import { DEFAULT_PRESENTATION } from './core.js';
import type { TimePresentation } from './core.js';
import { samePresentation } from './comparison.js';
import type { ComparisonSource } from './comparison.js';
/** What the dialog needs from the editor (app.ts supplies it). */
interface Host {
  /** Whether server browsing is possible (false offline and in the standalone HTML build). */
  available(): boolean;
  /** The open timeline as a source, preselected when the dialog opens, or null. */
  current(): ComparisonSource | null;
  /** Loads server timelines by ID as comparison sources (rejects if any cannot be read). */
  sources(ids: string[]): Promise<ComparisonSource[]>;
  /** One page of the timelines visible to this account that match `search`. */
  search(
    search: string,
    page: number,
  ): Promise<{
    timelines: { id: string; title: string; owner: string }[];
    page: number;
    pages: number;
  }>;
  /** Opens the comparison with the chosen common presentation. */
  start(sources: ComparisonSource[], presentation: TimePresentation): void;
  /** Reports an error to the person (status line or dialog). */
  fail(error: unknown): void;
  /**
   * A counter that changes whenever the editor loads another document; a comparison chosen
   * under an older generation is dropped rather than replacing what is now open.
   */
  generation(): number;
  /** How many timelines this account may compare at once (2 to 8; the server decides). */
  limit(): number;
}
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
/**
 * Wires the comparison dialogs in index.html (`compare-dialog`, `compare-format-dialog`) to
 * the editor. The selection is a map from source key to title; server timelines are fetched
 * only when the comparison starts, while the open timeline and added JSON files are held
 * whole in `files`. The selection is capped at `host.limit()`: unchecked boxes are disabled
 * once it is reached rather than refusing a click after the fact.
 *
 * Returns `start` (also used to open saved and linked comparisons) and `addFile`, which adds
 * an imported JSON timeline to the selection and throws when the selection is full.
 */
export function comparisonUI(host: Host) {
  // `epoch` counts search requests: each refresh, keystroke and close bumps it, so a result
  // that arrives after a newer request (or after the dialog closed) is ignored.
  let epoch = 0,
    page = 1,
    timer: ReturnType<typeof setTimeout>;
  const selected = new Map<string, string>();
  const input = el<HTMLInputElement>('compare-search');
  /**
   * Redraws everything that depends on the selection: the count, whether Start is enabled
   * (two or more), a removable chip per chosen timeline, and the checked and disabled state
   * of the result checkboxes on the current page.
   */
  function selection() {
    el('compare-selected').textContent =
      `${selected.size} selected (two to ${host.limit()} timelines)`;
    el<HTMLButtonElement>('compare-start').disabled = selected.size < 2;
    el('compare-chosen').replaceChildren();
    for (const [key, title] of selected) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `${title || 'Untitled timeline'} ×`;
      // Screen readers announce the action instead of the title followed by "times".
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
      checkbox.disabled = selected.size >= host.limit() && !checkbox.checked;
    }
  }
  /**
   * Loads and shows the current search page. The paging buttons stay disabled until the page
   * arrives; a stale or post-close answer is discarded, and an error is reported only if
   * it belongs to the latest request.
   */
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
        checkbox.disabled = selected.size >= host.limit() && !checkbox.checked;
        checkbox.onchange = () => {
          // The limit is checked again in case the box was checked while still enabled.
          if (checkbox.checked && selected.size < host.limit())
            selected.set(timeline.id, timeline.title);
          else selected.delete(timeline.id);
          selection();
          for (const box of el('compare-results').querySelectorAll<HTMLInputElement>('input'))
            box.disabled = selected.size >= host.limit() && !box.checked;
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
  /** Sources already in hand (the open timeline, added JSON files), by key. */
  const files = new Map<string, ComparisonSource>();
  /** Counts calls to `start`, so only the latest format choice opens a comparison. */
  let formatRequest = 0;
  /**
   * The common presentation for the sources. When they already agree it is used at once;
   * otherwise the format dialog offers each source's own display and the standard modes,
   * and resolves with the choice on Apply or null when the dialog is cancelled or closed
   * (including by Escape). The listener is removed on close so repeated runs don't stack.
   */
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
    // The dialog's form buttons set returnValue; clearing it makes Escape count as cancel.
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
  /**
   * Asks for a common presentation if needed, then hands the sources to the editor. Starting
   * again while the format dialog is open cancels the earlier choice. Nothing starts if
   * another start began meanwhile or the editor loaded another document while the person
   * was choosing.
   */
  async function start(sources: ComparisonSource[]) {
    const request = ++formatRequest;
    const dialog = el<HTMLDialogElement>('compare-format-dialog');
    if (dialog.open) dialog.close('cancel');
    const generation = host.generation();
    const presentation = await choose(sources);
    if (presentation && request === formatRequest && generation === host.generation())
      host.start(sources, presentation);
  }
  // Opening the dialog starts a fresh selection holding only the open timeline.
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
  // Closing cancels pending searches and drops held sources; the selection's titles stay
  // until the dialog is opened again.
  el('compare-dialog').addEventListener('close', () => {
    epoch++;
    clearTimeout(timer);
    el('compare-results').replaceChildren();
    files.clear();
  });
  // Search is debounced by 250 ms; bumping `epoch` at once also discards an answer to the
  // previous text that arrives during the wait.
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
  // Fetches the selected server timelines (those not already in `files`), then puts the
  // sources in selection order and starts. Start is disabled during the fetch against double
  // clicks; on failure the error is reported and `selection` re-enables it.
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
      if (selected.size >= host.limit())
        throw new Error(`At most ${host.limit()} timelines can be compared.`);
      files.set(source.key, source);
      selected.set(source.key, source.title);
      selection();
    },
  };
}
