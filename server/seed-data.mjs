// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import {
  DEFAULT_PRESENTATION,
  MOMENT_SOURCES,
  MOMENT_ICONS,
  EXPAND_ON_HOVER,
  Q,
  printTimestamp,
  MOMENT_COLORS,
  MOMENT_SHAPES,
  FOCUS_ON_HOVER,
  DATING_CONTEXT,
  HISTORICAL_DATES,
  GEOLOGICAL_AGES,
  parseTimestamp,
  validateDocument,
} from '../dist/core.mjs';

import { SEED_IMAGES } from './seed-images.mjs';
import {
  EXTRA_DINOSAURS,
  EXTRA_SIEGE,
  EXTRA_WAR,
  EXTRA_ICE,
  ICON_ASSIGNMENTS,
  LEGACY_SEED_IDS,
} from './seed-expansion.mjs';
export const SEED_USER_ID = '28d4e634-1f20-488c-bd62-043c6d5cb000';
const nhm = 'https://www.nhm.ac.uk/discover/when-did-dinosaurs-live.html';
const siege = 'https://www.worldhistory.org/article/1180/1453-the-fall-of-constantinople/';
const nps = 'https://www.nps.gov/articles/000/quaternary-period.htm';
const ww = 'https://encyclopedia.ushmm.org/content/en/article/world-war-ii-key-dates';
const calendar = { ...DEFAULT_PRESENTATION, mode: 'gregorian', adaptiveLabels: true };
const geological = (scale, unit) => ({ ...DEFAULT_PRESENTATION, mode: 'float', scale, unit });
const event = (id, time, title, description, source, precision, extra = {}) => ({
  id,
  time,
  metadata: { title, description, sources: [source], datePrecision: precision, ...extra },
});
const date = (id, day, title, description, source = ww) =>
  event(
    id,
    parseTimestamp(`${day}T00:00:00Z`).toString(),
    title,
    `${description} This point represents a calendar day, not a known UTC instant.`,
    source,
    'day',
    {
      historicalDate: day,
      calendar: 'Gregorian',
      coordinateConvention: 'UTC midnight date marker',
    },
  );
// For these 1453 dates the Julian calendar is nine days behind proleptic Gregorian.
const julian = (id, original, gregorian, title, description, source = siege) => {
  const point = date(
    id,
    gregorian,
    title,
    `${description} Historical date: ${original} (Julian); axis: ${gregorian} (proleptic Gregorian).`,
    source,
  );
  point.metadata.historicalDate = original;
  point.metadata.calendar = 'Julian';
  return point;
};
const age = (id, years, title, description, source) =>
  event(
    id,
    `-${years}/1`,
    title,
    `${description} Approximate age; the exact rational is a representative coordinate, not a claim of scientific precision.`,
    source,
    'approximate',
    {
      approximateAgeYears: String(years),
      coordinateConvention:
        'negative years relative to reference year 2000; rounded educational ages',
    },
  );
const style = (event) => {
  const boundaries = [
    'triassic',
    'jurassic',
    'cretaceous',
    'pleistocene',
    'holocene',
    'calabrian',
    'chibanian',
  ];
  const disruptions = [
    'k-pg',
    'siege-begins',
    'city-falls',
    'china',
    'poland',
    'barbarossa',
    'pearl-harbor',
  ];
  const conclusions = ['ve-day', 'japan-surrender'];
  const boundary = boundaries.includes(event.id),
    disruption = disruptions.includes(event.id);
  return {
    ...event,
    metadata: {
      ...event.metadata,
      shape: boundary ? 'diamond' : conclusions.includes(event.id) ? 'terminator' : 'circle',
      shapeSize: 'medium',
      color: disruption ? '#c89360' : boundary ? '#9a82b3' : '#7aadc4',
    },
  };
};
const doc = (title, description, tags, presentation, events) =>
  validateDocument({
    format: 'openchronology',
    version: 1,
    title,
    description,
    tags,
    presentation,
    plugins: [
      MOMENT_SOURCES,
      DATING_CONTEXT,
      presentation.mode === 'gregorian' ? HISTORICAL_DATES : GEOLOGICAL_AGES,
      MOMENT_COLORS,
      MOMENT_SHAPES,
      FOCUS_ON_HOVER,
    ].map((manifest) => ({ manifest, enabled: true })),
    events: events.map(style),
  });
const ORIGINAL_SEED_TIMELINES = [
  {
    id: '28d4e634-1f20-488c-bd62-043c6d5cb001',
    document: doc(
      'Era of Dinosaurs',
      'A starting tour of the Mesozoic. Rounded geological ages are approximate. Coordinates are negative years relative to a fixed reference year 2000; Ma means millions of years. These are point markers, not durations.',
      ['dinosaurs', 'paleontology', 'mesozoic', 'geology'],
      geological('1000000/1', 'Ma'),
      [
        age('triassic', 252000000, 'Triassic begins', 'The Mesozoic opens with the Triassic.', nhm),
        age(
          'early-dinosaurs',
          245000000,
          'Early dinosaurs',
          'Dinosaurs appear during the Triassic in the museum’s rounded chronology.',
          nhm,
        ),
        age(
          'jurassic',
          201000000,
          'Jurassic begins',
          'Dinosaurs diversify following the end-Triassic extinction.',
          nhm,
        ),
        age(
          'cretaceous',
          145000000,
          'Cretaceous begins',
          'Continental separation accompanies increasingly diverse dinosaur faunas.',
          nhm,
        ),
        age(
          'k-pg',
          66000000,
          'Non-avian dinosaur extinction',
          'The end-Cretaceous extinction eliminates non-avian dinosaurs; birds survive.',
          nhm,
        ),
      ],
    ),
  },
  {
    id: '28d4e634-1f20-488c-bd62-043c6d5cb002',
    document: doc(
      'Fall of Constantinople',
      'Three milestones in the Ottoman siege of 1453. Historical Julian dates are retained in each moment; the Gregorian display shows the equivalent dates nine days later. Midnight is only a date marker.',
      ['history', 'constantinople', 'byzantine', 'ottoman', '1453'],
      calendar,
      [
        julian(
          'siege-begins',
          '1453-04-06',
          '1453-04-15',
          'Siege begins',
          'Mehmed II’s forces begin their assault on Constantinople.',
        ),
        julian(
          'golden-horn',
          '1453-04-22',
          '1453-05-01',
          'Ships enter the Golden Horn',
          'Ottoman ships are transported overland around the defensive chain.',
          'https://www.worldhistory.org/Mehmed_II/',
        ),
        julian(
          'city-falls',
          '1453-05-29',
          '1453-06-07',
          'Constantinople falls',
          'Ottoman forces capture the city, ending the Byzantine Empire.',
        ),
      ],
    ),
  },
  {
    id: '28d4e634-1f20-488c-bd62-043c6d5cb003',
    document: doc(
      'World War II',
      'Selected milestones of a global war, including the war in Asia before 1939. This introductory timeline is not an exhaustive account. Dates use Gregorian day markers, not precise event times.',
      ['history', 'world-war-ii', 'wwii', '20th-century'],
      calendar,
      [
        date(
          'china',
          '1937-07-07',
          'War in China expands',
          'Japan and China enter full-scale war.',
        ),
        date(
          'poland',
          '1939-09-01',
          'Germany invades Poland',
          'The invasion begins World War II in Europe.',
        ),
        date(
          'britain-france',
          '1939-09-03',
          'Britain and France declare war',
          'Britain and France declare war on Germany.',
        ),
        date(
          'barbarossa',
          '1941-06-22',
          'Invasion of the Soviet Union',
          'Germany and its European Axis partners invade the Soviet Union.',
        ),
        date(
          'pearl-harbor',
          '1941-12-07',
          'Attack on Pearl Harbor',
          'Japan attacks the US Pacific Fleet in Hawaii.',
        ),
        date('d-day', '1944-06-06', 'Normandy landings', 'Western Allied forces land in Normandy.'),
        date(
          've-day',
          '1945-05-08',
          'Victory in Europe',
          'Germany’s surrender ends the war in Europe; Soviet Victory Day is observed on May 9.',
        ),
        date(
          'japan-surrender',
          '1945-09-02',
          'Japan signs surrender',
          'Japan formally signs the surrender aboard USS Missouri.',
        ),
      ],
    ),
  },
  {
    id: '28d4e634-1f20-488c-bd62-043c6d5cb004',
    document: doc(
      'Ice Age — Pleistocene',
      'The Pleistocene and selected glacial milestones. Ages are approximate, expressed as negative thousands of years (ka) relative to reference year 2000. Regional glacier maxima differ; the Holocene is an interglacial, not the disappearance of all ice.',
      ['ice-age', 'pleistocene', 'geology', 'climate', 'glaciers'],
      geological('1000/1', 'ka'),
      [
        age(
          'pleistocene',
          2580000,
          'Pleistocene begins',
          'Repeated glacial and interglacial cycles characterize this epoch.',
          nps,
        ),
        age(
          'yellowstone-deposit',
          1300000,
          'Early Yellowstone glacial evidence',
          'A glacial deposit near Tower Fall records an early Yellowstone glaciation.',
          'https://www.nps.gov/yell/learn/nature/glaciers.htm',
        ),
        age(
          'last-maximum',
          20000,
          'Last Glacial Maximum',
          'A rounded marker for extensive ice sheets; their maxima occurred at different times in different regions.',
          'https://www.nps.gov/seki/glaciers.htm',
        ),
        age(
          'holocene',
          11700,
          'Holocene begins',
          'The Pleistocene gives way to the current interglacial epoch.',
          'https://irmadev.nps.gov/DataStore/Reference/Profile/2266921',
        ),
      ],
    ),
  },
];

/** Credits travel in ordinary Notes/Sources, alongside the image URL. */
function addSeedIcon(point, key) {
  const image = SEED_IMAGES[key];
  const context =
    key === 'glacier'
      ? 'Modern Alaska glacier, illustrating glaciation; not a photograph of prehistoric Yellowstone.'
      : key === 'mehmed'
        ? 'Portrait painted in 1480, after the siege.'
        : key === 'walls'
          ? 'Modern photograph of the surviving walls.'
          : ['archaeopteryx', 'stegosaurus', 'tyrannosaurus', 'mammoth'].includes(key)
            ? 'Museum fossil/skeleton photograph.'
            : key === 'siege'
              ? 'Historical manuscript illustration of the siege, not an eyewitness photograph.'
              : 'Historical photograph.';
  return {
    ...point,
    metadata: {
      ...point.metadata,
      iconUrl: image.url,
      description: `${point.metadata.description ?? ''}\n\nImage: ${image.credit}. ${context} Source and licence are linked below.`,
      sources: [
        ...new Set([
          ...(point.metadata.sources ?? []),
          image.page,
          ...(image.license ? [image.license] : []),
        ]),
      ],
    },
  };
}
export const LEGACY_SEED_TIMELINES = ORIGINAL_SEED_TIMELINES.map((entry, index) => {
  const additional =
    index === 0
      ? EXTRA_DINOSAURS.map((args) => age(...args))
      : index === 1
        ? EXTRA_SIEGE.map(([id, original, title, description, source]) => {
            const gregorian = printTimestamp(
              parseTimestamp(`${original}T00:00:00Z`).add(Q.from(777600n)),
            ).slice(0, 10);
            return julian(id, original, gregorian, title, description, source);
          })
        : index === 2
          ? EXTRA_WAR.map((args) => date(...args))
          : EXTRA_ICE.map((args) => age(...args));
  const events = [...entry.document.events, ...additional.map(style)]
    .map((point) =>
      ICON_ASSIGNMENTS[index][point.id]
        ? addSeedIcon(point, ICON_ASSIGNMENTS[index][point.id])
        : point,
    )
    .sort((a, b) => Q.parse(a.time).compare(Q.parse(b.time)) || a.id.localeCompare(b.id));
  return {
    ...entry,
    document: validateDocument({
      ...entry.document,
      description:
        index === 1
          ? 'A detailed sequence of the Ottoman siege of 1453. Historical Julian dates are retained; Gregorian coordinates are nine days later. Day markers do not imply exact event times.'
          : entry.document.description,
      plugins: [
        ...entry.document.plugins,
        { manifest: MOMENT_ICONS, enabled: true },
        { manifest: EXPAND_ON_HOVER, enabled: true },
      ],
      events,
    }),
  };
});
/** One-time catalogue expansion: only genuinely new IDs are added, never deleted legacy IDs. */
export function expandSeedDocument(current, template, index) {
  const known = new Set(current.events.map((e) => e.id)),
    legacy = new Set(LEGACY_SEED_IDS[index]);
  const defaults = new Map(template.events.map((e) => [e.id, e]));
  const events = current.events.map((point) => {
    const key = ICON_ASSIGNMENTS[index][point.id];
    return key && !Object.hasOwn(point.metadata, 'iconUrl') ? addSeedIcon(point, key) : point;
  });
  for (const point of defaults.values())
    if (!known.has(point.id) && !legacy.has(point.id)) events.push(point);
  events.sort((a, b) => Q.parse(a.time).compare(Q.parse(b.time)) || a.id.localeCompare(b.id));
  const plugins = [...(current.plugins ?? [])];
  if (!plugins.some((p) => p.manifest.id === MOMENT_ICONS.id))
    plugins.push({ manifest: MOMENT_ICONS, enabled: true });
  return validateDocument({
    ...current,
    plugins,
    events,
    description: current.description.startsWith('Three milestones in the Ottoman siege of 1453.')
      ? template.description
      : current.description,
  });
}

/** Enrich existing seed content without resetting coordinates, text or custom settings. */
export function enrichSeedDocument(current, template) {
  const plugins = [...(current.plugins ?? [])];
  const ids = new Set(plugins.map((p) => p.manifest.id));
  for (const plugin of template.plugins) if (!ids.has(plugin.manifest.id)) plugins.push(plugin);
  const defaults = new Map(template.events.map((event) => [event.id, event.metadata]));
  const events = current.events.map((event) => {
    const visual = defaults.get(event.id);
    if (!visual) return event;
    const metadata = { ...event.metadata };
    for (const key of ['shape', 'shapeSize', 'color'])
      if (!Object.hasOwn(metadata, key)) metadata[key] = visual[key];
    return { ...event, metadata };
  });
  return validateDocument({ ...current, plugins, events });
}

export const WORLD_WAR_II_ID = '28d4e634-1f20-488c-bd62-043c6d5cb003';
export const EUROPEAN_CAMPAIGN_ID = '28d4e634-1f20-488c-bd62-043c6d5cb005';
export const PACIFIC_CAMPAIGN_ID = '28d4e634-1f20-488c-bd62-043c6d5cb006';
const pacificEvents = new Set([
  'china',
  'tripartite-pact',
  'pearl-harbor',
  'us-war',
  'forced-removal',
  'guadalcanal',
  'trinity',
  'hiroshima',
  'nagasaki',
  'surrender-announcement',
  'japan-surrender',
]);
/** Unknown curator-added events stay in Europe unless metadata.campaign explicitly says pacific. */
function retainWarNotes(document, description) {
  return document.description &&
    document.description !== LEGACY_SEED_TIMELINES[2].document.description
    ? `${document.description}\n\n${description}`
    : description;
}
export function splitWorldWarDocument(document) {
  return [false, true].map((pacific) =>
    validateDocument({
      ...document,
      title: `World War II — ${pacific ? 'Pacific' : 'European'} Campaign`,
      description: retainWarNotes(
        document,
        pacific
          ? 'World War II in Asia and the Pacific, with diplomatic and American home-front context. Exact Gregorian day markers retain original sources and image credits.'
          : 'World War II in Europe, the Mediterranean and North Africa, with diplomatic and civilian context. Exact Gregorian day markers retain original sources and image credits.',
      ),
      tags: [...new Set([...(document.tags ?? []), pacific ? 'pacific' : 'european-campaign'])],
      events: document.events.filter(
        (event) =>
          (event.metadata.campaign === 'pacific' || pacificEvents.has(event.id)) === pacific,
      ),
    }),
  );
}
export function worldWarComparison(document = LEGACY_SEED_TIMELINES[2].document) {
  return validateDocument({
    ...document,
    description: retainWarNotes(
      document,
      'A live, read-only comparison of the European and Pacific campaigns of World War II. Browse either campaign independently, or align and combine their views here.',
    ),
    comparison: { sources: [EUROPEAN_CAMPAIGN_ID, PACIFIC_CAMPAIGN_ID], combined: false },
    events: [],
  });
}
const campaignDocuments = splitWorldWarDocument(LEGACY_SEED_TIMELINES[2].document);
export const SEED_TIMELINES = [
  ...LEGACY_SEED_TIMELINES.map((entry) =>
    entry.id === WORLD_WAR_II_ID
      ? { ...entry, document: worldWarComparison(entry.document) }
      : entry,
  ),
  { id: EUROPEAN_CAMPAIGN_ID, document: campaignDocuments[0] },
  { id: PACIFIC_CAMPAIGN_ID, document: campaignDocuments[1] },
];
