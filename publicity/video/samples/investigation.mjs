// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A made-up investigation for the investigations video (Video 13) and Short 10: a forklift
// reversing out of a narrow aisle on a warehouse's night shift strikes a stock picker crossing
// the aisle end. Laid out as an Events and Causal Factors chart with the Causal factor analysis
// plugins: primary events as `process` shapes, the incident a red `diamond`, lasting conditions
// as durations and point-in-time ones as `ellipse`, the evidence and conditions on the
// collision in a moment stack, causal factors in the Bad color with a `causal factor` tag, and
// unconfirmed items tagged `presumptive` and drawn with Presumptive outline's dashed outline.
// Relationships link each condition and
// event to what it led to. The warehouse, its people and every record are invented; a seeded
// generator makes the same routine records every time.
import { m, d, rel, plugins } from './lib.mjs';

/** The time at h:mi:s (seconds may be a fraction "9 9/25") on a day of October 2026, UTC. */
const at = (day, h, mi, s = 0, frac = null) => {
  const whole = BigInt(Date.UTC(2026, 9, day, h, mi, s) / 1000);
  if (!frac) return `${whole}/1`;
  const [n, dn] = frac;
  return `${whole * BigInt(dn) + BigInt(n)}/${dn}`;
};
/** A small seeded generator (mulberry32), so the sample is the same on every build. */
function random(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
// Moment colors' swatches.
const BAD = '#bc6663',
  WARNING = '#d6ad4c',
  INFORMATION = '#7aadc4';

export function investigation(core) {
  const primary = (id, time, title, notes, o = {}) =>
    m(id, time, title, {
      tags: ['primary event', ...(o.tags ?? [])],
      shape: 'process',
      shapeSize: 'large',
      notes,
      ...o.extra,
    });
  const secondary = (id, time, title, notes) =>
    m(id, time, title, {
      tags: ['secondary event'],
      shape: 'process',
      shapeSize: 'small',
      color: INFORMATION,
      notes,
    });
  const condition = (id, time, title, notes, o = {}) =>
    m(id, time, title, {
      tags: ['condition', ...(o.tags ?? [])],
      shape: 'ellipse',
      color: o.color ?? WARNING,
      notes,
    });
  const events = [
    // Days before: the decisions and conditions the night inherited.
    condition(
      'risk-review',
      at(12, 9, 0),
      'No risk review of longer shifts',
      '**Root cause.** Peak-season night shifts were extended from 8 to 10 hours from 12 October. ' +
        'The change was approved without the risk review the site procedure requires, so nobody ' +
        'checked that safety roles, rest breaks and lighting checks still fitted the longer shift.\n\n' +
        'Evidence: the change request (no risk assessment attached); interview with the shift manager.',
      { tags: ['causal factor', 'root cause'], color: BAD },
    ),
    condition(
      'fault-report',
      at(14, 2, 15),
      'Light fault: no work order',
      'A picker reported the light at the end of aisle 14 on the fault sheet. No work order was raised, ' +
        'so it was not repaired before the collision.\n\nEvidence: fault sheet, 14 October; the maintenance log.',
      { tags: ['barrier'] },
    ),
    condition(
      'sick-call',
      at(15, 19, 10),
      'Spotter sick, not replaced',
      'The assigned spotter called in sick. The shift started without a replacement.\n\nEvidence: the attendance record; interview with the shift supervisor.',
    ),
    m('briefing', at(15, 19, 55), 'Pre-shift briefing', {
      tags: ['secondary event'],
      shape: 'process',
      shapeSize: 'small',
      color: INFORMATION,
      notes:
        'Held as usual, but without the lighting walk the procedure lists (the written procedure assumes a 22:00 start).',
    }),
    // The sequence.
    primary(
      'run-start',
      at(16, 2, 12, 30),
      'FL-3 starts a run',
      'The driver of forklift FL-3 starts moving pallets into aisle 14, in the seventh hour of a 10-hour shift.\n\nEvidence: FL-3 telematics; the task log.',
    ),
    primary(
      'enters',
      at(16, 2, 31, 48),
      'FL-3 enters aisle 14',
      'Forward, to set a pallet down at the far end.\n\nEvidence: FL-3 telematics.',
    ),
    m('picker-statement', at(16, 2, 30), 'Picker crosses (statement)', {
      tags: ['primary event', 'presumptive'],
      shape: 'process',
      presumptive: true,
      datePrecision: 'About 02:30, from memory',
      notes:
        "**Unconfirmed.** The picker's statement puts this at about 02:30. Camera 7 shows 02:33:20; the camera's clock was checked against the network time afterwards, so the camera's time is used.",
    }),
    primary(
      'crosses',
      at(16, 2, 33, 20),
      'Picker crosses (camera 7)',
      'The picker walks along the cross-aisle towards zone C, past the end of aisle 14, which is dark.\n\nEvidence: camera 7.',
    ),
    m('horn', at(16, 2, 33, 56), 'Horn sounded? (driver)', {
      tags: ['primary event', 'presumptive'],
      shape: 'process',
      presumptive: true,
      notes:
        "**Unconfirmed.** The driver says he sounded the horn before reversing. The picker heard no horn, and camera 7 has no sound. Kept as presumptive until it's confirmed or ruled out.",
    }),
    primary(
      'reverses',
      at(16, 2, 33, 58),
      'FL-3 reverses out',
      'Reversing at about 7 km/h, with no spotter at the aisle end.\n\nEvidence: FL-3 telematics; camera 7.',
    ),
    m('collision', at(16, 2, 34, 9, [9, 25]), 'Collision at aisle 14', {
      tags: ['primary event', 'incident'],
      shape: 'diamond',
      shapeSize: 'large',
      color: BAD,
      notes:
        "The reversing forklift strikes the picker at the end of aisle 14. The picker's leg is injured.\n\n" +
        'The time is camera 7’s frame: 02:34:09 and 9/25 of a second (frame 9 of 25 in that second).',
      stack: [
        {
          id: 'c-dark',
          metadata: {
            title: 'Condition: aisle end dark',
            description: 'The light at the end of aisle 14 had been out since Tuesday.',
            shape: 'ellipse',
            color: BAD,
          },
        },
        {
          id: 'c-spotter',
          metadata: {
            title: 'Condition: no spotter',
            description: 'The procedure requires one for reversing out of narrow aisles.',
            shape: 'ellipse',
            color: BAD,
          },
        },
        {
          id: 'c-fatigue',
          metadata: {
            title: 'Presumptive: fatigue',
            description:
              'The seventh hour of a 10-hour shift, with no break after 01:00. Fatigue not confirmed.',
            shape: 'ellipse',
            color: WARNING,
            presumptive: true,
          },
        },
        {
          id: 'ev-camera',
          metadata: {
            title: 'Evidence: camera 7 frame',
            description:
              'Contact at 02:34:09.36, frame 9 of 25 in that second; the clock checked against network time.',
            shape: 'document',
          },
        },
        {
          id: 'ev-telematics',
          metadata: {
            title: 'Evidence: FL-3 telematics',
            description: 'Reversing at about 7 km/h; speed and direction logged once a second.',
            shape: 'document',
          },
        },
        {
          id: 'ev-statements',
          metadata: {
            title: 'Evidence: statements',
            description:
              'Driver, picker and supervisor, taken on 16 October; the horn is disputed.',
            shape: 'document',
          },
        },
      ],
    }),
    // What happened after.
    secondary('supervisor', at(16, 2, 34, 50), 'Supervisor alerted', 'Radio log.'),
    secondary('ambulance-call', at(16, 2, 36, 15), 'Ambulance called', 'Phone log.'),
    secondary(
      'first-aid',
      at(16, 2, 38),
      'First aid given',
      'By the trained first aider on shift.',
    ),
    secondary(
      'cordon',
      at(16, 2, 46),
      'Aisle 14 cordoned',
      'The scene is kept as it was for the investigation.',
    ),
    secondary(
      'ambulance',
      at(16, 2, 55),
      'Ambulance arrives',
      'The picker is taken to hospital for a leg injury.',
    ),
  ];
  // Routine records through the night: badge readers and the other forklifts' telematics.
  const rnd = random(20261016);
  const start = Date.UTC(2026, 9, 15, 20, 0) / 1000,
    end = Date.UTC(2026, 9, 16, 4, 0) / 1000;
  let n = 0;
  for (let s = start + 90; s < end; s += 600 + rnd() * 900) {
    const kind = rnd();
    // Leave the minutes around the collision to the chart.
    if (s > start + 6 * 3600 + 15 * 60 && s < start + 6 * 3600 + 50 * 60) continue;
    const title =
      kind < 0.45
        ? `Badge: door ${1 + Math.floor(rnd() * 8)}`
        : kind < 0.8
          ? `FL-${rnd() < 0.5 ? 1 : 2} telematics: task ${4100 + Math.floor(rnd() * 800)}`
          : `Scanner: pick list ${720 + Math.floor(rnd() * 200)}`;
    events.push(
      m(`rec-${++n}`, `${Math.round(s)}/1`, title, { tags: ['record'], shapeSize: 'small' }),
    );
  }
  const durations = [
    d('shift', at(15, 20, 0), at(16, 6, 0), 'Night shift, 20:00–06:00', {
      tags: ['shift'],
      color: INFORMATION,
      notes: 'The tenth night of the longer shifts.',
    }),
    d('long-shifts', at(12, 20, 0), at(16, 6, 0), '10-hour night shifts', {
      tags: ['condition'],
      color: WARNING,
      notes:
        'Night shifts 20:00–06:00 instead of 22:00–06:00, from 12 October; suspended after the collision.',
    }),
    d('light-out', at(13, 23, 40), at(16, 9, 30), 'Aisle 14 end light out', {
      tags: ['condition', 'causal factor', 'barrier'],
      color: BAD,
      notes:
        '**Causal factor.** The aisle end was dark: the picker could not be seen from the forklift, and the forklift’s rear could not be seen from the cross-aisle.\n\nEvidence: the fault sheet; camera 7; repaired 16 October at 09:30.',
    }),
    d('no-spotter', at(15, 19, 10), at(16, 6, 0), 'No spotter on shift', {
      tags: ['condition', 'causal factor', 'barrier'],
      color: BAD,
      notes:
        '**Causal factor.** The procedure requires a spotter to guide forklifts reversing out of narrow aisles. None was on shift.\n\nEvidence: the rota; the attendance record.',
    }),
    d('fatigue', at(16, 1, 0), at(16, 2, 34, 9, [9, 25]), 'Driver fatigue (unconfirmed)', {
      tags: ['condition', 'presumptive'],
      color: WARNING,
      presumptive: true,
      notes:
        '**Presumptive.** The driver was in the sixth and seventh hours of a 10-hour shift, with no rest break taken after 01:00. Fatigue is possible but not confirmed.',
    }),
  ];
  // Each link, cause first. Relationships are undirected; the arrow from cause to effect is
  // Relationship arrows' drawing convention, kept on the cause's own metadata.
  const links = [
    ['risk-review', 'd:long-shifts'],
    ['d:long-shifts', 'd:fatigue'],
    ['risk-review', 'sick-call'],
    ['sick-call', 'd:no-spotter'],
    ['fault-report', 'd:light-out'],
    ['d:fatigue', 'reverses'],
    ['run-start', 'enters'],
    ['enters', 'reverses'],
    ['reverses', 'collision'],
    ['crosses', 'collision'],
    ['d:light-out', 'collision'],
    ['d:no-spotter', 'collision'],
  ];
  const ref = (id) => (id.startsWith('d:') ? { duration: id.slice(2) } : { moment: id });
  const entity = (id) =>
    id.startsWith('d:')
      ? durations.find((x) => x.id === id.slice(2))
      : events.find((x) => x.id === id);
  for (const [cause, effect] of links) {
    const { metadata } = entity(cause);
    (metadata.arrows ??= []).push({ target: ref(effect), arrow: 'to' });
  }
  const relationships = links.map(([a, b]) => rel(a, b));
  return {
    format: 'openchronology',
    version: 1,
    title: 'Investigation: forklift collision, aisle 14',
    description:
      'A made-up investigation laid out as an Events and Causal Factors chart: a forklift reversing out of aisle 14 on the night shift of 15–16 October strikes a picker crossing the aisle end. Primary events, conditions, evidence, causal factors and the root cause. The warehouse, its people and its records are invented.',
    presentation: {
      mode: 'gregorian',
      unit: '',
      scale: '1/1',
      origin: '0/1',
      version: 1,
      offsetMinutes: 0,
      significantDigits: 6,
    },
    tags: ['investigation', 'causal factor analysis', 'made up'],
    plugins: plugins(
      core.MOMENT_STACKS,
      core.MOMENT_SHAPES,
      core.MOMENT_COLORS,
      core.PRESUMPTIVE_OUTLINE,
      core.RELATIONSHIP_ARROWS,
      core.RICH_TEXT_NOTES,
      core.DATING_CONTEXT,
    ),
    events,
    durations,
    relationships,
  };
}
