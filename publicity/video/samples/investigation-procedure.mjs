// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The as-planned timeline for the made-up investigation (investigation.mjs, Video 13): the
// warehouse's written night-shift procedure laid on the same night, 15–16 October 2026, so
// Compare can put it on one axis with what happened. The procedure and its section numbers
// are invented.
import { m, d, plugins } from './lib.mjs';

/** The time at h:mi:s on a day of October 2026, UTC. */
const at = (day, h, mi, s = 0) => `${Date.UTC(2026, 9, day, h, mi, s) / 1000}/1`;
const GOOD = '#5f8b67';

export function investigationProcedure(core) {
  const step = (id, time, title, notes) =>
    m(id, time, title, { tags: ['as planned'], shape: 'process', color: GOOD, notes });
  const events = [
    step(
      'p-lighting',
      at(15, 21, 40),
      'Lighting walk: aisle ends and crossings',
      'Section 4.2: the supervisor walks every aisle end and pedestrian crossing before the shift and raises a work order for any light out.',
    ),
    step(
      'p-roles',
      at(15, 21, 50),
      'Safety roles confirmed, spotter assigned',
      'Section 4.3: a spotter is assigned for reversing out of narrow aisles; if the spotter is absent, a replacement is named before work starts.',
    ),
    step('p-briefing', at(15, 21, 55), 'Pre-shift briefing', 'Section 4.1.'),
    step(
      'p-reverse',
      at(16, 2, 33, 58),
      'Reverse out of aisle 14 with the spotter',
      'Section 5.4: stop at the aisle end, sound the horn, and reverse only on the spotter’s signal.',
    ),
  ];
  const durations = [
    d('p-shift', at(15, 22, 0), at(16, 6, 0), 'Night shift, 8 hours', {
      tags: ['as planned'],
      color: GOOD,
      notes: 'Section 2.1: 22:00–06:00.',
    }),
    d('p-break', at(16, 2, 0), at(16, 2, 30), 'Rest break', {
      tags: ['as planned'],
      color: GOOD,
      notes: 'Section 6.1: a 30-minute break after four hours.',
    }),
    d('p-spotter', at(15, 22, 0), at(16, 6, 0), 'Spotter on duty', {
      tags: ['as planned'],
      color: GOOD,
      notes: 'Section 4.3.',
    }),
  ];
  return {
    format: 'openchronology',
    version: 1,
    title: 'As planned: night-shift procedure',
    description:
      'The written night-shift procedure for aisle replenishment, laid on the night of 15–16 October 2026 for comparison with the investigation. Made up.',
    presentation: {
      mode: 'gregorian',
      unit: '',
      scale: '1/1',
      origin: '0/1',
      version: 1,
      offsetMinutes: 0,
      significantDigits: 6,
    },
    tags: ['procedure', 'as planned', 'made up'],
    plugins: plugins(core.MOMENT_STACKS, core.MOMENT_SHAPES, core.MOMENT_COLORS),
    events,
    durations,
  };
}
