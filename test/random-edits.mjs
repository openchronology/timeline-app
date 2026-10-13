// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Repeatable random edits for the PostgreSQL oracles: a document with moments, durations and
// relationships, and sparse saves over it whose references stay valid.
import { Q, validateDocument } from '../dist/core.mjs';

/** Edits drawn from a seeded generator, so a failing run repeats. */
export function randomEdits(seed) {
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const time = () =>
    Q.from(BigInt(Math.floor(random() * 600)), BigInt(1 + Math.floor(random() * 3))).toString();
  /** 300 moments, 40 durations (some anchored to moments) and 50 relationships. */
  function randomDocument(title) {
    const events = Array.from({ length: 300 }, (_, i) => ({
      id: 'm' + i,
      time: time(),
      metadata: {
        title: 'Moment ' + i,
        description: 'A note',
        ...(i % 5 ? {} : { tags: ['five'] }),
      },
    }));
    return validateDocument({
      format: 'openchronology',
      version: 1,
      title,
      description: '',
      events,
      durations: Array.from({ length: 40 }, (_, i) => {
        const start = time();
        return {
          id: 'd' + i,
          start: i % 4 ? start : { moment: 'm' + i },
          end:
            i % 6
              ? Q.parse(start)
                  .add(Q.from(BigInt(i * 3)))
                  .toString()
              : { moment: 'm' + (i + 50) },
          metadata: { title: 'Duration ' + i, tags: i % 3 ? [] : ['three'] },
        };
      }),
      relationships: Array.from({ length: 50 }, (_, i) => ({
        a: { moment: 'm' + i },
        b: i % 3 ? { moment: 'm' + (i + 100) } : { duration: 'd' + (i % 40) },
      })),
    });
  }
  /** A random patch over the current document; references stay valid. */
  function randomPatch(document, step) {
    const changes = new Map(),
      durationChanges = new Map(),
      relationshipChanges = [];
    const moments = document.events.map((e) => e.id);
    const live = () => moments.filter((m) => changes.get(m) !== null);
    for (let i = 0, n = 1 + Math.floor(random() * 6); i < n; i++) {
      const roll = random();
      const existing = document.events.find((e) => e.id === pick(moments));
      if (roll < 0.25 && existing)
        changes.set(existing.id, {
          ...existing,
          metadata: { ...existing.metadata, title: `Renamed ${step}.${i}` },
        });
      else if (roll < 0.45 && existing)
        // Moves to a new time or onto an existing one (sharing its node).
        changes.set(existing.id, {
          ...existing,
          time: random() < 0.4 ? pick(document.events).time : time(),
        });
      else if (roll < 0.55 && existing && moments.length > 5) changes.set(existing.id, null);
      else if (roll < 0.7) {
        const id = `n${step}x${i}`;
        changes.set(id, { id, time: time(), metadata: { title: `New ${id}`, tags: ['new'] } });
        moments.push(id);
      } else if (roll < 0.85) {
        const id =
          random() < 0.5 && document.durations?.length
            ? pick(document.durations).id
            : `d${step}x${i}`;
        const start = time();
        const anchors = live();
        durationChanges.set(id, {
          id,
          start: random() < 0.4 ? { moment: pick(anchors) } : start,
          end:
            random() < 0.3
              ? { moment: pick(anchors) }
              : Q.parse(start)
                  .add(Q.from(BigInt(Math.floor(random() * 90))))
                  .toString(),
          metadata: { title: `Span ${id} note` },
        });
      } else if (roll < 0.9 && document.durations?.length)
        durationChanges.set(pick(document.durations).id, null);
      else if (roll < 0.97) {
        const entities = [
          ...live().map((m) => ({ moment: m })),
          ...(document.durations ?? [])
            .filter((d) => !durationChanges.has(d.id) || durationChanges.get(d.id))
            .map((d) => ({ duration: d.id })),
        ];
        const key = (ref) => ('moment' in ref ? 'm:' : 'd:') + (ref.moment ?? ref.duration);
        const a = pick(entities),
          b = pick(entities);
        if (key(a) !== key(b))
          relationshipChanges.push(
            key(a) < key(b) ? { a, b, related: true } : { a: b, b: a, related: true },
          );
      } else if (document.relationships?.length) {
        const r = pick(document.relationships);
        relationshipChanges.push({ ...r, related: false });
      }
    }
    return {
      settings: {
        ...document,
        events: [],
        durations: undefined,
        relationships: undefined,
        ...(step % 7 === 3 ? { title: `Incremental ${step}` } : {}),
      },
      changes: [...changes].map(([id, event]) => ({ id, event })),
      durationChanges: [...durationChanges].map(([id, duration]) => ({ id, duration })),
      relationshipChanges,
    };
  }
  return { random, pick, time, randomDocument, randomPatch };
}
