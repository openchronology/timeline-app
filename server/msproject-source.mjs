// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Microsoft Project's XML (MSPDI) as a source (#538): the plan files Microsoft Project,
 * ProjectLibre and GanttProject save or export, as board-source.mjs cards. Each task's start and
 * finish are its plan, its actual start and finish what happened, its predecessors and summary
 * task links, and its resources the people assigned (docs/boards.md). Times in these files have
 * no zone: they are read in the zone given (UTC by default).
 */
import { createHash } from 'node:crypto';
import { isoTime, parseZone } from './log-time.mjs';

/** Characters XML escapes, and CDATA sections, as text. */
export function xmlText(text) {
  return String(text ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, inner) => inner.replace(/&/g, '&amp;'))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
/** The contents of each `<tag>…</tag>` in `xml` (not nested in themselves, as MSPDI's are not). */
export const blocks = (xml, tag) =>
  [...String(xml).matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map(
    (m) => m[1],
  );
/** A child element's text, or null: read with the nested records that repeat field names removed. */
function field(xml, tag) {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? xmlText(m[1]).trim() : null;
}
/** A task's own fields: without its links, baselines and extended attributes. */
const own = (xml) =>
  xml.replace(
    /<(PredecessorLink|Baseline|ExtendedAttribute|TimephasedData)(?:\s[^>]*)?>[\s\S]*?<\/\1>/g,
    '',
  );

/**
 * A plan file's tasks as board-source.mjs cards, and its `{id, name}`: its GUID (or a hash of its
 * name), and its title or name. `zone` is a time zone name or offset for the file's times.
 */
export function readMsProject(xml, { zone = 'UTC' } = {}) {
  const tz = parseZone(zone);
  const at = (text) => (text ? new Date(isoTime(text, tz).ms).toISOString() : null);
  const head = String(xml).split(/<Tasks>/)[0];
  const name = field(head, 'Title') || field(head, 'Name') || 'Project';
  const guid = field(head, 'GUID');
  const id = guid
    ? guid.replace(/[^A-Za-z0-9_.~-]/g, '')
    : createHash('sha256').update(name).digest('hex').slice(0, 16);
  const people = new Map(
    blocks(xml, 'Resource')
      .map((r) => [field(r, 'UID'), field(r, 'Name')])
      .filter(([uid, n]) => uid && n),
  );
  const assigned = new Map();
  for (const a of blocks(xml, 'Assignment')) {
    const task = field(a, 'TaskUID'),
      person = people.get(field(a, 'ResourceUID'));
    if (!task || !person) continue;
    if (!assigned.has(task)) assigned.set(task, []);
    assigned.get(task).push(person);
  }
  const cards = [];
  // Summary tasks above each task, by outline level: its phases.
  const outline = [];
  for (const block of blocks(xml, 'Task')) {
    const t = own(block);
    const uid = field(t, 'UID');
    if (!uid || uid === '0' || field(t, 'IsNull') === '1') continue;
    const level = Number(field(t, 'OutlineLevel') ?? 1);
    outline.length = Math.max(0, level - 1);
    const parents = outline.filter(Boolean);
    const summary = field(t, 'Summary') === '1';
    const milestone = field(t, 'Milestone') === '1';
    const progress = Number(field(t, 'PercentComplete') ?? 0);
    const started = at(field(t, 'ActualStart'));
    const finished = at(field(t, 'ActualFinish'));
    const done = finished && progress >= 100 ? finished : null;
    const title = field(t, 'Name') ?? '';
    cards.push({
      key: uid,
      reference: field(t, 'WBS') ?? field(t, 'ID') ?? uid,
      number: null,
      title,
      description: field(t, 'Notes') ?? '',
      url: null,
      kind: summary ? 'summary task' : milestone ? 'milestone' : 'task',
      // What happened: from its actual start, so a task not begun has none.
      created: started,
      done,
      column: null,
      firstColumn: null,
      assignees: assigned.get(uid) ?? [],
      labels: parents.map((p) => p.name),
      start: at(field(t, 'Start')),
      due: at(field(t, 'Finish')),
      progress,
      milestone,
      links: [
        ...blocks(block, 'PredecessorLink').map((l) => field(l, 'PredecessorUID')),
        ...(parents.length ? [parents.at(-1).uid] : []),
      ]
        .filter((key) => key && key !== '0')
        .map((key) => ({ key })),
      events: done ? [{ verb: 'completed', time: done, person: null }] : [],
    });
    outline[level - 1] = summary ? { uid, name: title } : null;
  }
  return { board: { id, name, url: null }, cards };
}
