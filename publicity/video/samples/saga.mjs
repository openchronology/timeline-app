// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// "The Ember Crown": an original fantasy world for the story tour (Video 6). Nothing here is
// anyone else's: the world, its people and its calendar (years After the Reckoning, AR) were
// made up for this sample. Times are seconds from the Reckoning, shown in AR years.
import { YEAR, m, d, rel, plugins, theme } from './lib.mjs';

/** Year `y` AR (fractions allowed, to place events within a year), as an exact time. */
const ar = (y) => {
  const tenths = BigInt(Math.round(y * 10));
  const t = tenths * YEAR;
  return t % 10n === 0n ? `${t / 10n}/1` : `${t}/10`;
};
const GOLD = '#d9a441',
  EMBER = '#e0603a',
  TIDE = '#6fa3d8',
  SHADOW = '#9a7fd1';

export function saga(core) {
  const h = (id, y, title) => m(id, ar(y), title, { headingLevel: 'h2', tags: ['age'] });
  const ash = { tags: ['ash'], color: EMBER, shape: 'diamond' };
  const mirelle = { tags: ['mirelle'], color: TIDE, shape: 'circle' };
  const king = { tags: ['hollow king'], color: SHADOW, shape: 'square' };
  const world = { tags: ['world'], color: GOLD };
  const events = [
    h('h-first', 0, 'The First Age'),
    m('reckoning', ar(0), 'The Reckoning', {
      ...world,
      notes:
        'Fire falls from the sky and the old crown shatters into seven shards. Years are counted from this night.',
    }),
    m('emberhold', ar(212), 'Emberhold founded', {
      ...world,
      notes: 'The smiths of the north raise a city around the largest shard, which never cools.',
    }),
    h('h-salt', 380, 'The Salt Years'),
    m('salt-treaty', ar(391.4), 'The Salt Treaty', {
      ...world,
      notes: 'The coast cities and Emberhold make peace; the Drowned Coast is left to no one.',
    }),
    m('king-rises', ar(398.2), 'The Hollow King wakes', {
      ...king,
      notes:
        'Beneath the Drowned Coast, something wearing a crown of salt begins to gather the shards.',
    }),
    m('ash-born', ar(401.6), 'Ash is born', {
      ...ash,
      notes: "Born in the smiths' quarter of Emberhold, the night the great forge went dark.",
    }),
    m('mirelle-born', ar(404.1), 'Mirelle is born', {
      ...mirelle,
      notes: "Born aboard a mapmaker's ship off the Drowned Coast.",
    }),
    h('h-saga', 418, 'The Ember Crown'),
    m('prophecy', ar(419.2), 'The prophecy at Greyfen', {
      ...world,
      tags: ['world', 'prophecy'],
      notes:
        '*"When the cold shard burns, a smith\'s hand and a sailor\'s map will meet, and the crown will be whole or the world will not."*\n\nFulfilled in 423 AR.',
    }),
    m('shard', ar(420.3), 'Ash finds the cold shard', {
      ...ash,
      tags: ['ash', 'prophecy'],
      notes: 'In the ashes of the old forge, a shard that burns without heat.',
    }),
    m('map', ar(420.9), 'Mirelle maps the Drowned Coast', {
      ...mirelle,
      notes: 'The only chart of the coast that shows the sunken road.',
    }),
    m('meeting', ar(421.2), 'Ash and Mirelle meet', {
      ...ash,
      tags: ['ash', 'mirelle', 'prophecy'],
      color: GOLD,
      notes: 'At the harbour of Saltmere. Neither knows the prophecy yet.',
    }),
    m('betrayal', ar(422.1), 'The betrayal at Saltmere', {
      ...king,
      tags: ['hollow king', 'mirelle'],
      notes: "The harbour master sells Mirelle's chart to the Hollow King.",
    }),
    m('ash-wounded', ar(422.5), 'Ash is wounded', {
      ...ash,
      notes: 'The shard burns him for the first time.',
    }),
    m('mirelle-escapes', ar(422.6), 'Mirelle escapes the deep', {
      ...mirelle,
      notes: 'She swims the sunken road alone, and remembers every turn.',
    }),
    m('siege', ar(423.3), 'The siege of Emberhold', {
      ...king,
      tags: ['hollow king', 'world'],
      notes: 'The Hollow King comes north with six shards.',
    }),
    m('reforged', ar(423.4), 'The crown reforged', {
      ...ash,
      tags: ['ash', 'mirelle', 'prophecy'],
      color: GOLD,
      notes: "Ash's hand and Mirelle's map: the prophecy at Greyfen is fulfilled.",
    }),
    m('epilogue', ar(430), 'The new forge is lit', {
      ...world,
      notes: "Seven years later, Emberhold's forge burns again.",
    }),
  ];
  const durations = [
    d('salt-war', ar(388), ar(391.4), 'The Salt War', { tags: ['world', 'war'], color: GOLD }),
    d('ash-apprentice', ar(414), ar(420.3), "Ash's apprenticeship", {
      tags: ['ash'],
      color: EMBER,
    }),
    d('voyage', ar(419.5), ar(421.2), "Mirelle's voyage", { tags: ['mirelle'], color: TIDE }),
    d('long-road', ar(421.2), ar(423.3), 'The long road north', {
      tags: ['ash', 'mirelle'],
      color: GOLD,
    }),
    d('kings-war', ar(422.1), ar(423.4), "The Hollow King's war", {
      tags: ['hollow king', 'war'],
      color: SHADOW,
    }),
  ];
  const relationships = [
    rel('prophecy', 'reforged'),
    rel('prophecy', 'shard'),
    rel('shard', 'reforged'),
    rel('map', 'mirelle-escapes'),
    rel('betrayal', 'map'),
    rel('king-rises', 'siege'),
    rel('meeting', 'd:long-road'),
    rel('reckoning', 'reforged'),
  ];
  return {
    format: 'openchronology',
    version: 1,
    title: 'The Ember Crown',
    description:
      "A story's timeline: the world's history and the saga of Ash and Mirelle, in years After the Reckoning (AR).\n\nAsh's thread is ember diamonds, Mirelle's is blue circles, the Hollow King's is violet squares; the world's events are gold. Links join a prophecy to what fulfils it.",
    presentation: {
      mode: 'float',
      unit: 'AR',
      scale: `${YEAR}/1`,
      origin: '0/1',
      version: 1,
      offsetMinutes: 0,
      significantDigits: 6,
    },
    tags: ['fiction', 'worldbuilding', 'fantasy'],
    plugins: [
      ...plugins(
        core.RICH_TEXT_NOTES,
        core.MOMENT_HEADINGS,
        core.MOMENT_COLORS,
        core.MOMENT_SHAPES,
        core.EXPAND_ON_HOVER,
      ),
      theme(core, {
        textColor: '#efe6cf',
        textFont: 'Georgia, serif',
        measureColor: '#d9a441',
        haloColor: '#141b2e',
        markerColor: '#d9a441',
        durationColor: '#4a5a8a',
        backgroundColor: '#141b2e',
      }),
    ],
    events,
    durations,
    relationships,
  };
}
