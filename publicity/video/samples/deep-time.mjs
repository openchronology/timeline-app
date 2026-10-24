// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Deep time: Earth's 4.5 billion years down to the Apollo 11 landing, for the deep-time tour
// (Video 7). Eon and era boundaries are from the International Chronostratigraphic Chart
// (ICS, v2023/09), in its colours; other ages are rounded figures from standard references,
// each moment noting its approximate age with the Geological ages plugin. Times are exact
// offsets from 2000 CE, so 66 million years ago is exactly 66,000,000 Julian years before it.
import { at, yearsBefore2000, m, d, rel, plugins, theme, wiki } from './lib.mjs';

const MA = (ma) => yearsBefore2000(String(Math.round(ma * 1e6)));
const ago = (ma, o) => ({
  approximateAgeYears: `${Math.round(ma * 1e6).toLocaleString('en-US')}`,
  ...o,
});

export function deepTime(core) {
  const events = [
    m(
      'earth',
      MA(4540),
      'Earth forms',
      ago(4540, {
        tags: ['earth'],
        color: '#f2b84c',
        notes: 'From the solar nebula, about 4.54 billion years ago.',
        sources: [wiki('Age_of_Earth')],
      }),
    ),
    m(
      'zircon',
      MA(4404),
      'Oldest known minerals',
      ago(4404, {
        tags: ['earth'],
        notes: 'Zircon crystals from the Jack Hills of Western Australia.',
        sources: [wiki('Jack_Hills')],
      }),
    ),
    m(
      'stromatolites',
      MA(3480),
      'Early life: stromatolites',
      ago(3480, {
        tags: ['life'],
        color: '#8fd18a',
        notes:
          'Microbial mats in the Dresser Formation, Western Australia: some of the oldest widely accepted evidence of life.',
        sources: [wiki('Stromatolite')],
      }),
    ),
    m(
      'oxygen',
      MA(2400),
      'The Great Oxidation',
      ago(2400, {
        tags: ['earth', 'life'],
        color: '#7cc4e8',
        notes: 'Oxygen made by cyanobacteria begins to build up in the atmosphere.',
        sources: [wiki('Great_Oxidation_Event')],
      }),
    ),
    m(
      'snowball',
      MA(720),
      'Snowball Earth',
      ago(720, {
        tags: ['earth'],
        color: '#e8ecf5',
        notes: 'The Sturtian glaciation begins; ice may have reached the equator.',
        sources: [wiki('Snowball_Earth')],
      }),
    ),
    m(
      'cambrian',
      MA(538.8),
      'The Cambrian explosion',
      ago(538.8, {
        tags: ['life'],
        color: '#8fd18a',
        notes:
          'Most major animal groups appear in the fossil record within a few tens of millions of years.',
        sources: [wiki('Cambrian_explosion')],
      }),
    ),
    m(
      'plants',
      MA(470),
      'Plants reach land',
      ago(470, {
        tags: ['life'],
        color: '#8fd18a',
        sources: [wiki('Evolutionary_history_of_plants')],
      }),
    ),
    m(
      'tetrapods',
      MA(375),
      'Fish walk: Tiktaalik',
      ago(375, {
        tags: ['life'],
        color: '#8fd18a',
        notes: 'A fish with limb-like fins, between fish and the first four-legged animals.',
        sources: [wiki('Tiktaalik')],
      }),
    ),
    m(
      'great-dying',
      MA(251.902),
      'The Great Dying',
      ago(251.902, {
        tags: ['extinction'],
        color: '#e8645a',
        notes: 'The end-Permian extinction, the largest known: most marine species disappear.',
        sources: [wiki('Permian–Triassic_extinction_event')],
      }),
    ),
    m(
      'dinosaurs',
      MA(233),
      'First dinosaurs',
      ago(233, { tags: ['life'], color: '#8fd18a', sources: [wiki('Dinosaur')] }),
    ),
    m(
      'k-pg',
      MA(66),
      'The asteroid',
      ago(66, {
        tags: ['extinction'],
        color: '#e8645a',
        notes: 'The Chicxulub impact ends the age of the non-avian dinosaurs.',
        sources: [wiki('Cretaceous–Paleogene_extinction_event')],
      }),
    ),
    m(
      'hominins',
      MA(7),
      'Earliest hominins',
      ago(7, {
        tags: ['humans'],
        color: '#f2d45c',
        notes: 'Sahelanthropus, among the earliest known members of the human lineage.',
        sources: [wiki('Sahelanthropus')],
      }),
    ),
    m(
      'sapiens',
      MA(0.3),
      'Homo sapiens',
      ago(0.3, {
        tags: ['humans'],
        color: '#f2d45c',
        notes: 'Fossils from Jebel Irhoud, Morocco, about 300,000 years old.',
        sources: [wiki('Jebel_Irhoud')],
      }),
    ),
    m(
      'farming',
      MA(0.012),
      'Farming begins',
      ago(0.012, {
        tags: ['humans'],
        color: '#f2d45c',
        notes: 'In the Fertile Crescent, about 12,000 years ago.',
        sources: [wiki('Neolithic_Revolution')],
      }),
    ),
    m(
      'writing',
      MA(0.0052),
      'Writing',
      ago(0.0052, {
        tags: ['humans'],
        color: '#f2d45c',
        notes: 'Cuneiform in Mesopotamia, about 3200 BCE.',
        sources: [wiki('Cuneiform')],
      }),
    ),
    m(
      'pyramid',
      MA(0.00456),
      'The Great Pyramid',
      ago(0.00456, {
        tags: ['humans'],
        color: '#f2d45c',
        notes: 'Built for Khufu, about 2560 BCE.',
        sources: [wiki('Great_Pyramid_of_Giza')],
      }),
    ),
    m('apollo', at('1969-07-20T20:17:40Z'), 'Apollo 11 lands on the Moon', {
      tags: ['humans'],
      color: '#f2d45c',
      notes:
        "20:17:40 UTC, July 20, 1969: on the same line as the Earth's formation, to the second.",
      sources: [wiki('Apollo_11')],
    }),
  ];
  const eon = (id, a, b, title, color) => d(id, MA(a), MA(b), title, { tags: ['eon'], color });
  const era = (id, a, b, title, color) => d(id, MA(a), MA(b), title, { tags: ['era'], color });
  const durations = [
    eon('hadean', 4567, 4031, 'Hadean', '#ae027e'),
    eon('archean', 4031, 2500, 'Archean', '#f0047f'),
    eon('proterozoic', 2500, 538.8, 'Proterozoic', '#f73563'),
    eon('phanerozoic', 538.8, 0, 'Phanerozoic', '#9ad9dd'),
    era('paleozoic', 538.8, 251.902, 'Paleozoic', '#99c08d'),
    era('mesozoic', 251.902, 66, 'Mesozoic', '#67c5ca'),
    era('cenozoic', 66, 0, 'Cenozoic', '#f2f91d'),
  ];
  const relationships = [
    rel('oxygen', 'stromatolites'),
    rel('k-pg', 'dinosaurs'),
    rel('great-dying', 'd:mesozoic'),
  ];
  return {
    format: 'openchronology',
    version: 1,
    title: 'Deep time: 4.5 billion years of Earth',
    description:
      "Earth's history on one line, from its formation to a single second in 1969. Eons and eras are durations in the colours of the International Chronostratigraphic Chart; times are exact offsets from 2000 CE, shown in millions of years.",
    presentation: {
      mode: 'float',
      unit: 'million years',
      scale: '31557600000000/1',
      origin: '946684800/1',
      version: 1,
      offsetMinutes: 0,
      significantDigits: 5,
    },
    tags: ['geology', 'deep time', 'science', 'education'],
    plugins: [
      ...plugins(
        core.RICH_TEXT_NOTES,
        core.MOMENT_COLORS,
        core.MOMENT_SOURCES,
        core.GEOLOGICAL_AGES,
        core.EXPAND_ON_HOVER,
      ),
      theme(core, {
        textColor: '#e8ecf5',
        measureColor: '#7cc4e8',
        haloColor: '#0d1020',
        markerColor: '#e8ecf5',
        durationColor: '#3a4a7a',
        backgroundColor: '#0d1020',
      }),
    ],
    events,
    durations,
    relationships,
  };
}
