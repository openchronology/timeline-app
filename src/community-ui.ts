// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { validateDocument } from './core.js';
import type { TimelineDocument } from './core.js';
interface Proposal {
  id: string;
  title: string;
  body: string;
  status: string;
  base_revision: string;
  revision: string;
  document: TimelineDocument;
  base_document: TimelineDocument;
  author: string;
  canMerge: boolean;
  canUpdate: boolean;
  from_fork?: boolean;
  canClose: boolean;
  upstreamRevision: string;
}
interface Host {
  api<T>(path: string, method?: string, body?: unknown): Promise<T>;
  user(): { id: string; username: string } | null;
  server(): boolean;
  guestCopies?(): boolean;
  timeline(): { id: string; revision: string; canWrite?: boolean; canPropose?: boolean } | null;
  document(): Promise<TimelineDocument>;
  working(): Proposal | null;
  edit(proposal: Proposal): void;
  reload(): Promise<void>;
  compare?(ids: string[]): void;
  published(proposal: Proposal): void;
}
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const text = (id: string, value: string) => {
  el(id).textContent = value;
};
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
export function createCommunityUI(host: Host) {
  let browserPage = 1,
    minePage = 1,
    favoritePage = 1,
    pullPage = 1,
    selected: Proposal | null = null,
    request = 0,
    pullRequest = 0,
    commentCursor: string | null = '0',
    commentRequest = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  const compared = new Set<string>();
  const compareSelection = () => {
    text('dashboard-compare-count', `${compared.size} selected for comparison`);
    el<HTMLButtonElement>('dashboard-compare').disabled = compared.size < 2;
    for (const box of document.querySelectorAll<HTMLInputElement>('[data-compare-id]')) {
      box.checked = compared.has(box.dataset.compareId!);
      box.disabled = compared.size >= 8 && !box.checked;
    }
  };
  el('dashboard-compare').onclick = () => host.compare?.([...compared]);
  el('dashboard-compare-clear').onclick = () => {
    compared.clear();
    compareSelection();
  };
  const error = (id: string, e: unknown) => text(id, e instanceof Error ? e.message : String(e));
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
    const response = await host.api<{
      timelines: {
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
      }[];
      pages: number;
      total: number;
    }>('timelines/search', 'POST', {
      scope,
      page,
      limit: 12,
      sort: scope === 'public' ? el<HTMLSelectElement>('dashboard-sort').value : 'age',
      search: scope !== 'public' ? '' : el<HTMLInputElement>('dashboard-search').value,
      tag: scope !== 'public' ? '' : el<HTMLInputElement>('dashboard-tag').value,
    });
    if (epoch !== request) return;
    for (const t of response.timelines) {
      const card = document.createElement('article');
      card.className = 'dashboard-timeline';
      const label = document.createElement('label'),
        checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.compareId = t.id;
      checkbox.checked = compared.has(t.id);
      checkbox.disabled = compared.size >= 8 && !checkbox.checked;
      checkbox.onchange = () => {
        if (checkbox.checked && compared.size < 8) compared.add(t.id);
        else compared.delete(t.id);
        compareSelection();
      };
      label.append(checkbox, document.createTextNode('Compare'));
      card.append(label);
      const link = document.createElement('a');
      link.href = '#timeline/' + t.id;
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
      card.append(link, details, paragraph(t.description.slice(0, 220)));
      const star = button(`${t.starred ? '★ Starred' : '☆ Star'} · ${t.star_count ?? '0'}`, () => {
        star.disabled = true;
        void host
          .api<{ starred: boolean; star_count: string }>(`timelines/${t.id}/star`, 'POST', {
            starred: !t.starred,
          })
          .then(() => dashboard())
          .catch((e) => {
            error('dashboard-error', e);
            star.disabled = false;
          });
      });
      star.disabled = !host.user();
      star.title = host.user() ? 'Toggle favorite' : 'Sign in to star timelines';
      star.setAttribute('aria-pressed', String(!!t.starred));
      card.append(star);
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
  async function refreshBrowser() {
    request++;
    try {
      await search('public');
    } catch (e) {
      error('dashboard-error', e);
    }
  }
  async function dashboard() {
    request++;
    el('dashboard-mine').hidden = !host.user();
    el('dashboard-favorites').hidden = !host.user();
    el('dashboard-signin').hidden = !!host.user();
    text('dashboard-error', '');
    if (!host.server()) {
      text(
        'dashboard-browser-status',
        'The server is unavailable. You can create, import and edit a local timeline.',
      );
      return;
    }
    const results = await Promise.allSettled([
      search('public'),
      ...(host.user() ? [search('mine'), search('starred')] : []),
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
  for (const id of ['dashboard-search', 'dashboard-tag'])
    el(id).oninput = () => {
      clearTimeout(timer);
      request++;
      browserPage = 1;
      timer = setTimeout(() => void refreshBrowser(), 250);
    };
  el('dashboard-signin').onclick = () => el('account-button').click();
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
    const base = new Map(p.base_document.events.map((e) => [e.id, e])),
      proposed = new Map(p.document.events.map((e) => [e.id, e]));
    const added = p.document.events.filter((e) => !base.has(e.id));
    const removed = p.base_document.events.filter((e) => !proposed.has(e.id));
    const changed = p.document.events.filter(
      (e) => base.has(e.id) && JSON.stringify(base.get(e.id)) !== JSON.stringify(e),
    );
    el('pull-diff').replaceChildren(
      paragraph(
        `${added.length} added, ${removed.length} removed, ${changed.length} changed moments.`,
      ),
    );
    for (const key of [
      'title',
      'description',
      'tags',
      'presentation',
      'plugins',
      'assets',
    ] as const)
      if (JSON.stringify(p.base_document[key]) !== JSON.stringify(p.document[key]))
        el('pull-diff').append(paragraph('Changed timeline ' + key + '.'));
    for (const [label, events] of [
      ['Added', added],
      ['Removed', removed],
      ['Changed', changed],
    ] as const)
      for (const e of events.slice(0, 30)) {
        el('pull-diff').append(
          paragraph(
            label + ': ' + (e.metadata.title || 'Unnamed moment') + ' (' + e.id + ') at ' + e.time,
          ),
        );
        if (label === 'Changed') {
          const before = base.get(e.id);
          el('pull-diff').append(
            paragraph('Before: ' + JSON.stringify(before).slice(0, 1800)),
            paragraph('After: ' + JSON.stringify(e).slice(0, 1800)),
          );
        }
      }
    el('pull-edit').hidden = !p.canUpdate || !!p.from_fork;
    el('pull-merge').hidden = !p.canMerge;
    el('pull-reject').hidden = !p.canMerge;
    el('pull-close').hidden = !p.canClose;
    el('pull-rebase').hidden = !p.canUpdate || p.base_revision === p.upstreamRevision;
    el('pull-comment-form').hidden = !host.user();
    if (!el<HTMLDialogElement>('pull-detail-dialog').open)
      el<HTMLDialogElement>('pull-detail-dialog').showModal();
    await comments(true);
  }
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
  el('pull-view').onclick = () => {
    if (selected) {
      host.edit({ ...selected, canUpdate: false });
      el<HTMLDialogElement>('pull-detail-dialog').close();
      el<HTMLDialogElement>('pull-dialog').close();
    }
  };
  el('pull-edit').onclick = () => {
    if (selected) {
      host.edit(selected);
      el<HTMLDialogElement>('pull-detail-dialog').close();
      el<HTMLDialogElement>('pull-dialog').close();
    }
  };
  el('pull-export').onclick = () => {
    if (!selected) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(selected.document, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'proposal.ochx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
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
  el<HTMLDialogElement>('pull-dialog').addEventListener('close', () => pullRequest++);
  return { dashboard, propose };
}
export type { Proposal };
