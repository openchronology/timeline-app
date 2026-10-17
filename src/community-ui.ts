// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The dashboard and pull requests in the editor: lists of timelines (yours, starred and public),
// stars, forks and comparisons, and reviewing, discussing and merging pull requests.
import { validateDocument } from './core.js';
import { describeLabels } from './content-labels.js';
import type { TimelineDocument, PointEvent } from './core.js';
/** A moment a pull request adds, removes or changes, with its versions. */
interface MomentChange {
  change: 'added' | 'removed' | 'changed';
  before: PointEvent | null;
  after: PointEvent | null;
}
/** What a pull request changes from its base (computed by the server). */
interface ProposalChanges {
  settings: string[];
  moments: { added: number; removed: number; changed: number };
  durations: { added: number; removed: number; changed: number };
  relationships: { added: number; removed: number };
  /** The first changed moments of each kind. */
  examples: MomentChange[];
  /** Why nothing could be counted: a revision it compares is no longer kept. */
  unavailable?: string;
}
/**
 * A pull request as the server returns it. `revision` is the pull request's own revision
 * (sent back with updates and resolutions to detect concurrent changes); `base_revision`
 * the timeline revision it was made against, and `upstreamRevision` the timeline's current
 * one, which differ when it needs a rebase. The `can*` flags are the server's decision for
 * this account.
 */
interface Proposal {
  id: string;
  title: string;
  body: string;
  status: string;
  base_revision: string;
  revision: string;
  changes?: ProposalChanges;
  /** Servers before pull requests kept no documents sent both with every pull request. */
  document?: TimelineDocument;
  base_document?: TimelineDocument;
  author: string;
  canMerge: boolean;
  canUpdate: boolean;
  from_fork?: boolean;
  canClose: boolean;
  upstreamRevision: string;
}
/** A server whose timelines the dashboard lists; null is the only one (in a browser). */
interface Source {
  origin: string | null;
  signedIn: boolean;
  reachable: boolean;
  /** The server in use, whose timelines can be compared and whose account is shown. */
  inUse: boolean;
}
/** What the dashboard and pull requests need from the editor (app.ts supplies it). */
interface Host {
  /** A request to the server in use, or to another connected server. */
  api<T>(path: string, method?: string, body?: unknown, origin?: string | null): Promise<T>;
  /** The servers listed: a desktop's connected servers, or this one. */
  sources?(): Source[] | undefined;
  /** What marks a timeline's server, when several are listed. */
  chip?(origin: string | null): HTMLElement | null;
  /** The editor's address of a timeline on a server. */
  link?(id: string, origin: string | null): string;
  /** The signed-in account on the server in use, or null for a guest. */
  user(): { id: string; username: string } | null;
  /** Whether the server in use is reachable. */
  server(): boolean;
  /** How many timelines this account may compare at once (default 8). */
  compareLimit?(): number;
  /** Whether guests may fork public timelines into the browser (default true). */
  guestCopies?(): boolean;
  /** The server timeline open in the editor, with this account's permissions on it. */
  timeline(): { id: string; revision: string; canWrite?: boolean; canPropose?: boolean } | null;
  /** The editor's current document, unsaved edits included, to propose. */
  document(): Promise<TimelineDocument>;
  /** The pull request being edited in the editor (its working copy), if any. */
  working(): Proposal | null;
  /** Opens a pull request's proposed document in the editor (read-only unless canUpdate). */
  edit(proposal: Proposal, document: TimelineDocument): void;
  /** Reloads the open timeline (after a merge changed it). */
  reload(): Promise<void>;
  /** Starts comparing the given timelines of the server in use. */
  compare?(ids: string[]): void;
  /** A pull request was opened or updated from the editor. */
  published(proposal: Proposal): void;
}
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
/** Sets an element's text; server-supplied strings are only ever shown as text, never HTML. */
const text = (id: string, value: string) => {
  el(id).textContent = value;
};
/** A plain (non-submitting) button. */
function button(label: string, run: () => void) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.onclick = run;
  return b;
}
function paragraph(text: string) {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}
/**
 * What `after` changes from `base`, as the server summarizes it (for older servers).
 * Compares moments by ID and JSON, and a fixed list of settings; durations and
 * relationships are not compared and count as unchanged.
 */
function summarize(base: TimelineDocument, after: TimelineDocument): ProposalChanges {
  const before = new Map(base.events.map((e) => [e.id, e])),
    proposed = new Map(after.events.map((e) => [e.id, e]));
  const examples: MomentChange[] = [
    ...after.events
      .filter((e) => !before.has(e.id))
      .map((e) => ({ change: 'added' as const, before: null, after: e })),
    ...base.events
      .filter((e) => !proposed.has(e.id))
      .map((e) => ({ change: 'removed' as const, before: e, after: null })),
    ...after.events
      .filter((e) => before.has(e.id) && JSON.stringify(before.get(e.id)) !== JSON.stringify(e))
      .map((e) => ({ change: 'changed' as const, before: before.get(e.id)!, after: e })),
  ];
  const count = (change: MomentChange['change']) =>
    examples.filter((e) => e.change === change).length;
  const settings = (
    ['title', 'description', 'tags', 'presentation', 'plugins', 'assets'] as const
  ).filter((key) => JSON.stringify(base[key]) !== JSON.stringify(after[key]));
  return {
    settings,
    moments: { added: count('added'), removed: count('removed'), changed: count('changed') },
    durations: { added: 0, removed: 0, changed: 0 },
    relationships: { added: 0, removed: 0 },
    examples,
  };
}
/**
 * Wires the dashboard (timeline lists, stars, comparison selection) and the pull request
 * dialogs in index.html to the editor. Returns `dashboard`, which reloads every list, and
 * `propose`, which opens the dialog to propose the editor's changes.
 *
 * Each kind of request has its own counter (`request` for the lists, `pullRequest` for the
 * pull request list and details, `commentRequest` for comments): a response is dropped if
 * a newer request of its kind started meanwhile, or if the open timeline changed.
 */
export function createCommunityUI(host: Host) {
  let browserPage = 1,
    minePage = 1,
    favoritePage = 1,
    pullPage = 1,
    selected: Proposal | null = null,
    request = 0,
    pullRequest = 0,
    // Where the next page of comments starts; '0' is the beginning, null means no more.
    commentCursor: string | null = '0',
    commentRequest = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  /** Timeline IDs chosen for comparison; kept across pages and searches in this tab. */
  const compared = new Set<string>();
  /** How many timelines this account may compare at once: by default four for guests. */
  const compareLimit = () => host.compareLimit?.() ?? 8;
  /**
   * Redraws the comparison count, enables Compare from two timelines, and disables unchecked
   * boxes once the account's limit is chosen.
   */
  const compareSelection = () => {
    text(
      'dashboard-compare-count',
      `${compared.size} selected for comparison (up to ${compareLimit()})`,
    );
    el<HTMLButtonElement>('dashboard-compare').disabled = compared.size < 2;
    for (const box of document.querySelectorAll<HTMLInputElement>('[data-compare-id]')) {
      box.checked = compared.has(box.dataset.compareId!);
      box.disabled = compared.size >= compareLimit() && !box.checked;
    }
  };
  el('dashboard-compare').onclick = () => host.compare?.([...compared]);
  el('dashboard-compare-clear').onclick = () => {
    compared.clear();
    compareSelection();
  };
  const error = (id: string, e: unknown) => text(id, e instanceof Error ? e.message : String(e));
  /** The servers to list: the host's (desktop), or just this server. */
  const sources = (): Source[] =>
    host.sources?.() ?? [
      { origin: null, signedIn: !!host.user(), reachable: host.server(), inUse: true },
    ];
  /**
   * Fills one dashboard list (public search, yours, or starred) with its current page from
   * every listed server: public lists from reachable servers, the others from those signed
   * in. Results are merged; the page count is the largest of the servers'. Rejects only if
   * every server failed; a partial failure is shown and the rest listed. Callers bump
   * `request` first, so the lists loaded together by `dashboard` share one epoch.
   */
  async function search(scope: 'mine' | 'public' | 'starred') {
    const page = scope === 'mine' ? minePage : scope === 'starred' ? favoritePage : browserPage,
      id =
        scope === 'mine'
          ? 'dashboard-mine'
          : scope === 'starred'
            ? 'dashboard-favorites'
            : 'dashboard-browser';
    const epoch = request;
    el(id + '-list').replaceChildren();
    text(id + '-status', 'Loading…');
    text('dashboard-error', '');
    type Listed = {
      id: string;
      title: string;
      description: string;
      owner: string;
      tags?: string[];
      featured: boolean;
      visibility: string;
      event_count: string;
      star_count?: string;
      starred?: boolean;
      labels?: string[];
    };
    // Each server listed is searched; their pages are shown together, a server at a time.
    const listed = sources().filter((s) => (scope === 'public' ? s.reachable : s.signedIn));
    const results = await Promise.allSettled(
      listed.map((source) =>
        host.api<{ timelines: Listed[]; pages: number; total: number }>(
          'timelines/search',
          'POST',
          {
            scope,
            page,
            limit: 12,
            sort: scope === 'public' ? el<HTMLSelectElement>('dashboard-sort').value : 'age',
            search: scope !== 'public' ? '' : el<HTMLInputElement>('dashboard-search').value,
            tag: scope !== 'public' ? '' : el<HTMLInputElement>('dashboard-tag').value,
          },
          source.origin,
        ),
      ),
    );
    if (epoch !== request) return;
    const failed = results.find((r) => r.status === 'rejected');
    if (failed && results.every((r) => r.status === 'rejected')) throw failed.reason;
    if (failed) error('dashboard-error', failed.reason);
    const response = { timelines: [] as (Listed & { source: Source })[], pages: 0, total: 0 };
    results.forEach((result, n) => {
      if (result.status !== 'fulfilled') return;
      response.timelines.push(...result.value.timelines.map((t) => ({ ...t, source: listed[n] })));
      response.pages = Math.max(response.pages, result.value.pages);
      response.total += result.value.total;
    });
    for (const t of response.timelines) {
      const card = document.createElement('article');
      card.className = 'dashboard-timeline';
      const chip = host.chip?.(t.source.origin);
      if (chip) card.append(chip);
      const label = document.createElement('label'),
        checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.compareId = t.id;
      checkbox.checked = compared.has(t.id);
      checkbox.disabled = compared.size >= compareLimit() && !checkbox.checked;
      // Comparisons are of one server's timelines: the server in use's.
      if (!t.source.inUse) {
        checkbox.disabled = true;
        checkbox.removeAttribute('data-compare-id');
        label.title = 'Use this timeline’s server to compare its timelines.';
      }
      checkbox.onchange = () => {
        if (checkbox.checked && compared.size < compareLimit()) compared.add(t.id);
        else compared.delete(t.id);
        compareSelection();
      };
      label.append(checkbox, document.createTextNode('Compare'));
      card.append(label);
      const link = document.createElement('a');
      link.href = host.link?.(t.id, t.source.origin) ?? '#timeline/' + t.id;
      link.textContent = t.title || 'Untitled timeline';
      const details = paragraph(
        '@' +
          t.owner +
          ' · ' +
          t.visibility +
          ' · ' +
          Number(t.event_count).toLocaleString() +
          ' moments' +
          (t.featured ? ' · Featured' : ''),
      );
      details.className = 'field-hint';
      card.append(link, details);
      // A labelled timeline's card says so (#115); it opens behind its warning.
      if (t.labels?.length) {
        const badge = paragraph(`Sensitive: ${describeLabels(t.labels).toLowerCase()}`);
        badge.className = 'sensitive-badge';
        card.append(badge);
      }
      card.append(paragraph(t.description.slice(0, 220)));
      // Starring reloads the dashboard, which brings the new count and the starred list.
      const star = button(`${t.starred ? '★ Starred' : '☆ Star'} · ${t.star_count ?? '0'}`, () => {
        star.disabled = true;
        void host
          .api<{ starred: boolean; star_count: string }>(
            `timelines/${t.id}/star`,
            'POST',
            { starred: !t.starred },
            t.source.origin,
          )
          .then(() => dashboard())
          .catch((e) => {
            error('dashboard-error', e);
            star.disabled = false;
          });
      });
      star.disabled = !t.source.signedIn;
      star.title = t.source.signedIn ? 'Toggle favorite' : 'Sign in to star timelines';
      star.setAttribute('aria-pressed', String(!!t.starred));
      card.append(star);
      // Guests can copy a public timeline into their browser to edit it there.
      if (!host.user() && (host.guestCopies?.() ?? true) && t.visibility === 'public') {
        const fork = document.createElement('a');
        fork.href = '#guest-fork/' + t.id;
        fork.textContent = 'Fork in browser';
        card.append(fork);
      }
      const tags = document.createElement('div');
      tags.className = 'timeline-tags';
      for (const tag of t.tags ?? [])
        tags.append(
          button(tag, () => {
            el<HTMLInputElement>('dashboard-tag').value = tag;
            browserPage = 1;
            void refreshBrowser();
          }),
        );
      card.append(tags);
      el(id + '-list').append(card);
    }
    text(
      id + '-status',
      response.total
        ? `${response.total} timelines · Page ${page} of ${response.pages}`
        : scope === 'mine'
          ? 'You have no server timelines yet. Create one from the workspace.'
          : scope === 'starred'
            ? 'No favorites yet.'
            : 'No public timelines match this search.',
    );
    el<HTMLButtonElement>(id + '-previous').disabled = page <= 1;
    el<HTMLButtonElement>(id + '-next').disabled = page >= response.pages;
  }
  /** Reloads the public list alone (paging, sorting, searching), reporting errors. */
  async function refreshBrowser() {
    request++;
    try {
      await search('public');
    } catch (e) {
      error('dashboard-error', e);
    }
  }
  /**
   * Reloads the whole dashboard: the public list, and yours and starred when signed in to
   * any listed server. With no reachable server, says so and lists nothing.
   */
  async function dashboard() {
    request++;
    const signedIn = sources().some((s) => s.signedIn);
    el('dashboard-mine').hidden = !signedIn;
    el('dashboard-favorites').hidden = !signedIn;
    el('dashboard-signin').hidden = signedIn;
    text('dashboard-error', '');
    if (!sources().some((s) => s.reachable)) {
      text(
        'dashboard-browser-status',
        'The server is unavailable. You can create, import and edit a local timeline.',
      );
      return;
    }
    const results = await Promise.allSettled([
      search('public'),
      ...(signedIn ? [search('mine'), search('starred')] : []),
    ]);
    for (const result of results)
      if (result.status === 'rejected') error('dashboard-error', result.reason);
  }
  el('dashboard-browser-previous').onclick = () => {
    browserPage = Math.max(1, browserPage - 1);
    void refreshBrowser();
  };
  el('dashboard-browser-next').onclick = () => {
    browserPage++;
    void refreshBrowser();
  };
  el('dashboard-mine-previous').onclick = () => {
    minePage = Math.max(1, minePage - 1);
    request++;
    void search('mine').catch((e) => error('dashboard-error', e));
  };
  el('dashboard-mine-next').onclick = () => {
    minePage++;
    request++;
    void search('mine').catch((e) => error('dashboard-error', e));
  };
  for (const direction of [-1, 1])
    el('dashboard-favorites-' + (direction === -1 ? 'previous' : 'next')).onclick = () => {
      favoritePage = Math.max(1, favoritePage + direction);
      request++;
      void search('starred').catch((e) => error('dashboard-error', e));
    };
  el('dashboard-sort').onchange = () => {
    browserPage = 1;
    void refreshBrowser();
  };
  // Search and tag inputs are debounced by 250 ms; bumping `request` at once discards any
  // answer to the previous text.
  for (const id of ['dashboard-search', 'dashboard-tag'])
    el(id).oninput = () => {
      clearTimeout(timer);
      request++;
      browserPage = 1;
      timer = setTimeout(() => void refreshBrowser(), 250);
    };
  el('dashboard-signin').onclick = () => el('account-button').click();
  /** Loads the current page of the open timeline's pull requests into the list dialog. */
  async function pulls() {
    const timeline = host.timeline();
    if (!timeline) return;
    const epoch = ++pullRequest;
    el('pull-list').replaceChildren();
    text('pull-error', '');
    text('pull-status', 'Loading…');
    const result = await host.api<{
      proposals: { id: string; title: string; status: string; author: string }[];
      pages: number;
      total: number;
    }>(`timelines/${timeline.id}/proposals/search`, 'POST', { page: pullPage, limit: 12 });
    if (epoch !== pullRequest || timeline.id !== host.timeline()?.id) return;
    for (const p of result.proposals) {
      const item = document.createElement('article');
      item.className = 'dashboard-timeline';
      item.append(
        button(p.title, () => void detail(p.id).catch((e) => error('pull-error', e))),
        paragraph('@' + p.author + ' · ' + p.status),
      );
      el('pull-list').append(item);
    }
    text(
      'pull-status',
      result.total
        ? `${result.total} pull requests · Page ${pullPage} of ${result.pages}`
        : 'No pull requests yet.',
    );
    el<HTMLButtonElement>('pull-previous').disabled = pullPage <= 1;
    el<HTMLButtonElement>('pull-next').disabled = pullPage >= result.pages;
  }
  /**
   * Appends the next page of the selected pull request's comments, or starts over from the
   * first page with `reset`. Dropped if another comment request, pull request or timeline
   * took its place meanwhile.
   */
  async function comments(reset = false) {
    const timeline = host.timeline(),
      p = selected;
    if (!timeline || !p) return;
    const epoch = ++commentRequest;
    if (reset) {
      commentCursor = '0';
      el('pull-comments').replaceChildren();
    }
    if (commentCursor === null) return;
    const result = await host.api<{
      comments: { id: string; body: string; author: string; created_at: string }[];
      next: string | null;
    }>(`timelines/${timeline.id}/proposals/${p.id}/comments/search`, 'POST', {
      after: commentCursor,
    });
    if (epoch !== commentRequest || selected?.id !== p.id || timeline.id !== host.timeline()?.id)
      return;
    for (const c of result.comments) {
      const article = document.createElement('article');
      article.className = 'pull-comment';
      const name = document.createElement('strong');
      name.textContent = '@' + c.author + ' · ' + new Date(c.created_at).toLocaleString();
      article.append(name, paragraph(c.body));
      el('pull-comments').append(article);
    }
    commentCursor = result.next;
    el('pull-comments-more').hidden = !commentCursor;
  }
  /**
   * Opens (or refreshes) the details dialog for a pull request: its description, status,
   * a summary of its changes with up to 30 examples of each kind (changed moments shown as
   * truncated before/after JSON), the actions this account may take, and its comments.
   */
  async function detail(id: string) {
    const timeline = host.timeline();
    if (!timeline) return;
    const epoch = ++pullRequest;
    const p = await host.api<Proposal>(`timelines/${timeline.id}/proposals/${id}`);
    if (epoch !== pullRequest || timeline.id !== host.timeline()?.id) return;
    selected = p;
    text('pull-detail-title', p.title);
    text('pull-detail-body', p.body);
    text(
      'pull-detail-status',
      '@' +
        p.author +
        ' · ' +
        p.status +
        ' · base revision ' +
        p.base_revision +
        ' · upstream ' +
        p.upstreamRevision,
    );
    text('pull-detail-error', '');
    // Current servers send the summary; older ones sent both documents instead.
    const changes = p.changes ?? summarize(p.base_document!, p.document!);
    const { moments, durations, relationships } = changes;
    el('pull-diff').replaceChildren(
      paragraph(
        `${moments.added} added, ${moments.removed} removed, ${moments.changed} changed moments.`,
      ),
    );
    if (changes.unavailable) el('pull-diff').prepend(paragraph(changes.unavailable));
    if (durations.added + durations.removed + durations.changed)
      el('pull-diff').append(
        paragraph(
          `${durations.added} added, ${durations.removed} removed, ${durations.changed} changed durations.`,
        ),
      );
    if (relationships.added + relationships.removed)
      el('pull-diff').append(
        paragraph(`${relationships.added} added, ${relationships.removed} removed relationships.`),
      );
    for (const key of changes.settings)
      el('pull-diff').append(paragraph('Changed timeline ' + key + '.'));
    for (const [label, change] of [
      ['Added', 'added'],
      ['Removed', 'removed'],
      ['Changed', 'changed'],
    ] as const)
      for (const { before, after } of changes.examples
        .filter((e) => e.change === change)
        .slice(0, 30)) {
        const e = (after ?? before)!;
        el('pull-diff').append(
          paragraph(
            label + ': ' + (e.metadata.title || 'Untitled moment') + ' (' + e.id + ') at ' + e.time,
          ),
        );
        if (label === 'Changed')
          el('pull-diff').append(
            paragraph('Before: ' + JSON.stringify(before).slice(0, 1800)),
            paragraph('After: ' + JSON.stringify(after).slice(0, 1800)),
          );
      }
    // A pull request from a fork is updated in the fork, not here.
    el('pull-edit').hidden = !p.canUpdate || !!p.from_fork;
    el('pull-merge').hidden = !p.canMerge;
    el('pull-reject').hidden = !p.canMerge;
    el('pull-close').hidden = !p.canClose;
    // Rebasing is offered only when the timeline has moved on since the base revision.
    el('pull-rebase').hidden = !p.canUpdate || p.base_revision === p.upstreamRevision;
    el('pull-comment-form').hidden = !host.user();
    if (!el<HTMLDialogElement>('pull-detail-dialog').open)
      el<HTMLDialogElement>('pull-detail-dialog').showModal();
    await comments(true);
  }
  /**
   * Resolves the selected pull request (merge, reject, close or rebase), sending its
   * revision so the server refuses if it changed meanwhile; then refreshes the details and
   * the list, and after a merge reloads the timeline itself.
   */
  async function action(action: string) {
    const t = host.timeline(),
      p = selected;
    if (!t || !p) return;
    const result = await host.api<Proposal>(`timelines/${t.id}/proposals/${p.id}/resolve`, 'POST', {
      action,
      revision: p.revision,
    });
    selected = result;
    await detail(p.id);
    await pulls();
    if (action === 'merge') await host.reload();
  }
  el('pull-button').onclick = () => {
    pullPage = 1;
    el<HTMLDialogElement>('pull-dialog').showModal();
    void pulls().catch((e) => error('pull-error', e));
  };
  el('pull-previous').onclick = () => {
    pullPage = Math.max(1, pullPage - 1);
    void pulls().catch((e) => error('pull-error', e));
  };
  el('pull-next').onclick = () => {
    pullPage++;
    void pulls().catch((e) => error('pull-error', e));
  };
  /** The selected pull request's proposed timeline, read only when it is opened. */
  async function proposed(p: Proposal) {
    const t = host.timeline();
    if (p.document) return p.document;
    if (!t) throw new Error('Open the timeline first.');
    const result = await host.api<{ document: TimelineDocument }>(
      `timelines/${t.id}/proposals/${p.id}/document`,
    );
    return validateDocument(result.document);
  }
  /** Opens a pull request's proposed timeline in the editor and closes the dialogs. */
  function open(p: Proposal) {
    void proposed(p)
      .then((document) => {
        if (selected?.id !== p.id) return;
        host.edit(p, document);
        el<HTMLDialogElement>('pull-detail-dialog').close();
        el<HTMLDialogElement>('pull-dialog').close();
      })
      .catch((e) => error('pull-detail-error', e));
  }
  // Viewing opens the same document with updating turned off.
  el('pull-view').onclick = () => {
    if (selected) open({ ...selected, canUpdate: false });
  };
  el('pull-edit').onclick = () => {
    if (selected) open(selected);
  };
  el('pull-export').onclick = () => {
    if (!selected) return;
    void proposed(selected)
      .then((document) => {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }),
        );
        const a = window.document.createElement('a');
        a.href = url;
        a.download = 'proposal.ochx';
        a.click();
        // Revoked after the download has had time to start.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      })
      .catch((e) => error('pull-detail-error', e));
  };
  // Each action button is disabled while its request runs, against double submission.
  for (const actionName of ['merge', 'reject', 'close', 'rebase'])
    el('pull-' + actionName).onclick = () => {
      el<HTMLButtonElement>('pull-' + actionName).disabled = true;
      void action(actionName)
        .catch((e) => error('pull-detail-error', e))
        .finally(() => {
          el<HTMLButtonElement>('pull-' + actionName).disabled = false;
        });
    };
  el('pull-comments-more').onclick = () =>
    void comments().catch((e) => error('pull-detail-error', e));
  el<HTMLFormElement>('pull-comment-form').onsubmit = (event) => {
    event.preventDefault();
    const t = host.timeline(),
      p = selected;
    if (!t || !p) return;
    const body = el<HTMLTextAreaElement>('pull-comment').value;
    void host
      .api(`timelines/${t.id}/proposals/${p.id}/comments`, 'POST', { body })
      .then(async () => {
        el<HTMLTextAreaElement>('pull-comment').value = '';
        await comments(true);
      })
      .catch((e) => error('pull-detail-error', e));
  };
  /**
   * Opens the proposal dialog, prefilled from the pull request being edited (to update it)
   * or empty (to open a new one). Does nothing without permission to propose.
   */
  function propose() {
    const t = host.timeline();
    if (!t?.canPropose) return;
    const p = host.working();
    el<HTMLInputElement>('proposal-title').value = p?.title ?? '';
    el<HTMLTextAreaElement>('proposal-body').value = p?.body ?? '';
    text('proposal-error', '');
    el<HTMLDialogElement>('proposal-dialog').showModal();
  }
  el('propose-button').onclick = propose;
  // Sends the editor's whole document as the proposal: a PUT updating the working pull
  // request (with its revision, so a concurrent update is refused), or a POST opening a new
  // one against the open revision. Then shows it in the pull request dialogs.
  el<HTMLFormElement>('proposal-form').onsubmit = (event) => {
    event.preventDefault();
    const t = host.timeline();
    if (!t) return;
    const p = host.working();
    const button = el<HTMLButtonElement>('proposal-submit');
    button.disabled = true;
    void (async () => {
      const document = await host.document();
      const result = await host.api<Proposal>(
        `timelines/${t.id}/proposals${p ? '/' + p.id : ''}`,
        p ? 'PUT' : 'POST',
        {
          title: el<HTMLInputElement>('proposal-title').value,
          body: el<HTMLTextAreaElement>('proposal-body').value,
          baseRevision: p?.base_revision ?? t.revision,
          ...(p ? { revision: p.revision } : {}),
          document,
        },
      );
      if (host.timeline()?.id !== t.id) return;
      host.published(result);
      el<HTMLDialogElement>('proposal-dialog').close();
      el<HTMLDialogElement>('pull-dialog').showModal();
      await pulls();
      await detail(result.id);
    })()
      .catch((e) => error('proposal-error', e))
      .finally(() => (button.disabled = false));
  };
  // Closing the list drops any pull request responses still on their way.
  el<HTMLDialogElement>('pull-dialog').addEventListener('close', () => pullRequest++);
  return { dashboard, propose };
}
export type { Proposal };
