// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Forgejo (and Gitea) as a source of timeline events (#538): their issues, pull requests,
 * releases and milestones are GitHub's in all but a few names, so this translates their
 * timelines and webhook deliveries into GitHub's shapes, and github-source.mjs and
 * github-events.mjs do the rest. Repositories are `forgejo:<host>/<owner>/<name>`.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { repositoryReference } from './github-source.mjs';

/** A delivery's or an item's repository as a reference: its host comes from its address. */
export function forgejoRepository(repository) {
  const host = repository?.html_url ? new URL(repository.html_url).host : null;
  return host && repository.full_name
    ? repositoryReference('forgejo', host, repository.full_name)
    : null;
}

/**
 * Checks a delivery's `X-Forgejo-Signature` (or `X-Gitea-Signature`): the hex HMAC-SHA256 of
 * its body with the webhook's secret, in constant time.
 */
export function validForgejoSignature(secret, body, header) {
  if (typeof header !== 'string' || !/^[0-9a-f]{64}$/i.test(header)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(header, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * One entry of an item's timeline (GET /repos/{o}/{r}/issues/{n}/timeline) as the GitHub
 * timeline event github-events.mjs reads, or null for those it does not record (comments,
 * pushes, branch changes …). A mention's repository becomes a reference on `host`.
 */
export function forgejoTimelineEvent(entry, host) {
  const base = { created_at: entry.created_at, actor: entry.user };
  switch (entry.type) {
    case 'label':
      return {
        ...base,
        event: entry.body === '1' ? 'labeled' : 'unlabeled',
        label: entry.label,
      };
    case 'assignees':
      return {
        ...base,
        event: entry.removed_assignee ? 'unassigned' : 'assigned',
        assignee: entry.assignee,
      };
    case 'review_request':
      return {
        ...base,
        event: entry.removed_assignee ? 'review_request_removed' : 'review_requested',
        requested_reviewer: entry.assignee,
        requested_team: entry.assignee_team,
      };
    case 'milestone':
      return entry.milestone
        ? { ...base, event: 'milestoned', milestone: entry.milestone }
        : { ...base, event: 'demilestoned', milestone: entry.old_milestone };
    case 'close':
      return { ...base, event: 'closed' };
    case 'reopen':
      return { ...base, event: 'reopened' };
    case 'merge_pull':
      return { ...base, event: 'merged' };
    case 'change_title':
      return { ...base, event: 'renamed', rename: { from: entry.old_title, to: entry.new_title } };
    case 'lock':
      return { ...base, event: 'locked' };
    case 'unlock':
      return { ...base, event: 'unlocked' };
    case 'pin':
      return { ...base, event: 'pinned' };
    case 'issue_ref':
    case 'pull_ref':
    case 'comment_ref': {
      // Mentioned by another item, which the entry names whole.
      const other = entry.ref_issue;
      const repository = other?.repository?.full_name
        ? repositoryReference('forgejo', host, other.repository.full_name)
        : null;
      return other?.number && repository
        ? {
            ...base,
            event: 'cross-referenced',
            source: {
              issue: {
                number: other.number,
                title: other.title,
                repository: { full_name: repository },
              },
            },
          }
        : null;
    }
    default:
      return null;
  }
}

/**
 * A webhook delivery as the GitHub delivery deliveryChanges reads: `{event, payload}`, or
 * null for those it does not record. `event` is the `X-Forgejo-Event` (or `X-Gitea-Event`)
 * header and `type` the `X-Forgejo-Event-Type` one, which tells review verdicts apart.
 */
export function forgejoDelivery(event, type, payload) {
  const repository = forgejoRepository(payload?.repository);
  if (!repository) return null;
  const item = payload.issue ?? payload.pull_request;
  const withRepository = {
    ...payload,
    repository: { ...payload.repository, full_name: repository },
    // An assignment names its person on the item.
    ...(payload.assignee || !['assigned', 'unassigned'].includes(payload.action)
      ? {}
      : { assignee: item?.assignee ?? item?.assignees?.at(-1) }),
  };
  const action = payload.action;
  // Labels: Forgejo says the set changed, not which label, so the item's duration (and its
  // `label:` tags) follow, without a moment.
  const relabelled = action === 'label_updated' || action === 'label_cleared';
  if (event === 'issues' && payload.issue)
    return {
      event: 'issues',
      payload: { ...withRepository, ...(relabelled ? { action: 'relabelled' } : {}) },
    };
  if (event === 'issue_comment' && payload.issue)
    return { event: 'issue_comment', payload: withRepository };
  if (event === 'release' && payload.release)
    return {
      event: 'release',
      payload: { ...withRepository, action: action === 'updated' ? 'edited' : action },
    };
  if (
    payload.pull_request &&
    (event === 'pull_request' || String(event).startsWith('pull_request'))
  ) {
    const pull = { ...payload.pull_request, merged_at: payload.pull_request.merged_at ?? null };
    // A review: its verdict is in the event's type.
    if (action === 'reviewed' || /review_(approved|rejected|comment)/.test(type ?? '')) {
      const state = /approved/.test(type ?? '')
        ? 'approved'
        : /rejected/.test(type ?? '')
          ? 'changes_requested'
          : 'commented';
      return {
        event: 'pull_request_review',
        payload: {
          ...withRepository,
          action: 'submitted',
          pull_request: pull,
          review: {
            state,
            user: payload.sender,
            submitted_at: payload.pull_request.updated_at,
          },
        },
      };
    }
    return {
      event: 'pull_request',
      payload: {
        ...withRepository,
        pull_request: pull,
        ...(relabelled ? { action: 'relabelled' } : {}),
      },
    };
  }
  return null;
}
