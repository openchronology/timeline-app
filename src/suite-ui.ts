// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Plugin suites in the editor (#78): browse and add suites (the official ones included in
 * every build, and those a server's accounts publish), import suite files, and create suites
 * from a timeline's plugins to export or publish.
 */
import {
  OFFICIAL_SUITES,
  addSuite,
  isOfficialSuite,
  searchSuiteLibrary,
  suiteFromPlugins,
  validatePluginSuite,
} from './suites.js';
import type { PluginSuite, SuiteLibraryPage } from './suites.js';
import type { InstalledPlugin } from './plugins.js';

interface Host {
  /** Whether the open timeline's plugins can change. */
  editable(): boolean;
  installed(): InstalledPlugin[];
  change(plugins: InstalledPlugin[]): void;
  /** A server's suite library, or null to search the suites included with the app. */
  library(): ((path: string, method: string, body?: unknown) => Promise<unknown>) | null;
  /** Publishes to the server in use; null when signed out or without a server. */
  publish(): ((suite: PluginSuite) => Promise<unknown>) | null;
  /** A chip naming where library results come from, when that needs saying. */
  chip(): HTMLElement | null;
  download(blob: Blob, title: string, extension: string): void;
  toast(message: string): void;
}
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const text = (id: string, value: string) => {
  el(id).textContent = value;
};
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createSuiteUI(host: Host) {
  let page = 1,
    request = 0,
    timer: ReturnType<typeof setTimeout> | undefined;

  /** Adds a suite's plugins the timeline lacks, and says what it did. */
  function add(suite: PluginSuite) {
    const { plugins, added, kept } = addSuite(host.installed(), suite);
    if (added.length) host.change(plugins);
    host.toast(
      (added.length
        ? `${suite.name}: added ${added.map((p) => p.name).join(', ')}.`
        : `${suite.name}: this timeline already has all its plugins.`) +
        (kept.length && added.length
          ? ` Kept ${kept.map((p) => p.name).join(', ')} as installed.`
          : ''),
    );
  }
  function render(result: SuiteLibraryPage, bundled: boolean) {
    const list = el('suite-library-results');
    list.replaceChildren();
    const present = new Set(host.installed().map((p) => p.manifest.id));
    for (const suite of result.suites) {
      const item = document.createElement('section');
      item.className = 'library-plugin library-suite';
      item.dataset.suiteId = suite.id;
      const chip = bundled ? null : host.chip();
      if (chip) item.append(chip);
      const name = document.createElement('strong');
      name.textContent = `${suite.name} · v${suite.version} · ${isOfficialSuite(suite) ? 'Official' : 'Community'}`;
      const description = document.createElement('p');
      description.textContent = suite.description;
      const plugins = document.createElement('p');
      plugins.className = 'field-hint';
      plugins.textContent =
        'Plugins: ' +
        suite.plugins.map((p) => p.name + (present.has(p.id) ? ' (installed)' : '')).join(', ');
      const button = document.createElement('button');
      button.type = 'button';
      const missing = suite.plugins.some((p) => !present.has(p.id));
      button.textContent = missing ? 'Add suite to timeline' : 'Installed';
      button.disabled = !missing || !host.editable();
      button.onclick = () => {
        try {
          add(suite);
          el<HTMLDialogElement>('suite-library-dialog').close();
        } catch (error) {
          text('suite-library-error', message(error));
        }
      };
      const actions = document.createElement('div');
      actions.className = 'plugin-actions';
      actions.append(button);
      item.append(name, description, plugins, actions);
      list.append(item);
    }
    text(
      'suite-library-status',
      (bundled
        ? `${result.total} official suites included with this app`
        : `${result.total} suites`) + ` · Page ${page} of ${Math.max(1, result.pages)}`,
    );
    el<HTMLButtonElement>('suite-previous').disabled = page <= 1;
    el<HTMLButtonElement>('suite-next').disabled = page >= result.pages;
  }
  async function search() {
    const current = ++request;
    text('suite-library-error', '');
    text('suite-library-status', 'Loading suites…');
    const query = { search: el<HTMLInputElement>('suite-search').value, page, limit: 12 };
    const library = host.library();
    let result: SuiteLibraryPage,
      bundled = !library;
    try {
      if (library) {
        try {
          const raw = (await library('plugins/suites/search', 'POST', query)) as SuiteLibraryPage;
          if (!Array.isArray(raw?.suites) || raw.suites.length > 12)
            throw new Error('Invalid suite library response.');
          result = { ...raw, suites: raw.suites.map(validatePluginSuite) };
        } catch (error) {
          // A refused search is reported; a server that cannot be reached is skipped.
          const status = (error as { status?: number }).status;
          if (status && status < 500) throw error;
          result = searchSuiteLibrary(OFFICIAL_SUITES, query);
          bundled = true;
        }
      } else result = searchSuiteLibrary(OFFICIAL_SUITES, query);
      if (current === request) render(result, bundled);
    } catch (error) {
      if (current !== request) return;
      text('suite-library-status', 'Suite library unavailable.');
      text('suite-library-error', message(error));
    }
  }
  el('suites-add').onclick = () => {
    if (!host.editable()) return;
    page = 1;
    el<HTMLInputElement>('suite-search').value = '';
    el('suite-library-results').replaceChildren();
    el<HTMLDialogElement>('suite-library-dialog').showModal();
    void search();
  };
  el('suite-search').oninput = () => {
    clearTimeout(timer);
    page = 1;
    timer = setTimeout(() => void search(), 250);
  };
  el('suite-previous').onclick = () => {
    page = Math.max(1, page - 1);
    void search();
  };
  el('suite-next').onclick = () => {
    page++;
    void search();
  };
  el('suite-import').onclick = () => el('suite-file').click();
  el<HTMLInputElement>('suite-file').onchange = async () => {
    const input = el<HTMLInputElement>('suite-file');
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      if (file.size > 256 * 1024) throw new Error('Suite files are limited to 256 KiB.');
      add(validatePluginSuite(JSON.parse(await file.text())));
      el<HTMLDialogElement>('suite-library-dialog').close();
    } catch (error) {
      text('suite-library-error', message(error));
    }
  };

  /** The suite being created, from the form. */
  function authored(): PluginSuite {
    const chosen = new Set(
      [...document.querySelectorAll<HTMLInputElement>('#suite-plugins input:checked')].map(
        (box) => box.value,
      ),
    );
    const plugins = host
      .installed()
      .filter((p) => chosen.has(p.manifest.id))
      .map((p) => p.manifest);
    if (!plugins.length) throw new Error('Choose at least one plugin.');
    return suiteFromPlugins(
      {
        name: el<HTMLInputElement>('suite-name').value,
        description: el<HTMLTextAreaElement>('suite-description').value,
        version: Number(el<HTMLInputElement>('suite-version').value) || 1,
        id: published?.id,
      },
      plugins,
    );
  }
  /** Once published, later versions keep the published (namespaced) ID. */
  let published: PluginSuite | null = null;
  el('suites-create').onclick = () => {
    const installed = host.installed();
    published = null;
    const list = el('suite-plugins');
    list.replaceChildren();
    for (const { manifest } of installed) {
      const label = document.createElement('label');
      label.className = 'checkbox-row';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = manifest.id;
      box.checked = true;
      label.append(box, document.createTextNode(`${manifest.name} · v${manifest.version}`));
      list.append(label);
    }
    if (!installed.length) list.textContent = 'This timeline has no plugins yet. Add some first.';
    text('suite-author-status', '');
    text('suite-author-error', '');
    el<HTMLButtonElement>('suite-publish').disabled = !host.publish();
    el<HTMLButtonElement>('suite-export').disabled = !installed.length;
    el<HTMLDialogElement>('suite-author-dialog').showModal();
  };
  el('suite-export').onclick = () => {
    try {
      const suite = authored();
      host.download(
        new Blob([JSON.stringify(suite, null, 2)], { type: 'application/json' }),
        suite.id,
        '.suite.json',
      );
      text('suite-author-error', '');
      text('suite-author-status', 'Exported. Import it from Add suite on any timeline.');
    } catch (error) {
      text('suite-author-error', message(error));
    }
  };
  el('suite-publish').onclick = () => {
    const publish = host.publish();
    if (!publish) return;
    const button = el<HTMLButtonElement>('suite-publish');
    button.disabled = true;
    void (async () => {
      const suite = validatePluginSuite(await publish(authored()));
      published = suite;
      text('suite-author-error', '');
      text(
        'suite-author-status',
        `Published publicly as ${suite.id} v${suite.version}. Increment the version to publish an update.`,
      );
    })()
      .catch((error) => text('suite-author-error', message(error)))
      .finally(() => {
        button.disabled = !host.publish();
      });
  };
  el<HTMLFormElement>('suite-author-form').onsubmit = (event) => event.preventDefault();
}
