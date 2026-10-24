// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// An unofficial chronology of Tolkien's legendarium, from the Years of the Trees to the Fourth
// Age, for the canon tour (Video 7): how a canon that spans several books and thousands of
// years is kept. Years are the published chronologies' (The Lord of the Rings, Appendix B, for
// the Second and Third Ages; for the First Age, the later annals, as The Silmarillion's text
// gives few years); notes are short summaries in our own words, with no quotations or
// pictures. Not affiliated with or endorsed by the Tolkien Estate or its licensees.
// Times count years from the first sunrise (F.A. 1 begins at 1), each Age following the last;
// a custom time display prints them in each Age's own reckoning.
import { YEAR, m, d, rel, plugins, theme } from './lib.mjs';

/** Where each Age's year 0 falls on the line: F.A. 1 begins at 1, S.A. 1 at 591, and so on. */
const AGE = { fa: 0, sa: 590, ta: 4031, fo: 7052 };
/** Shire months (the Shire Reckoning's names), for Third Age dates given by month and day. */
const SHIRE = [
  'Afteryule',
  'Solmath',
  'Rethe',
  'Astron',
  'Thrimidge',
  'Forelithe',
  'Afterlithe',
  'Wedmath',
  'Halimath',
  'Winterfilth',
  'Blotmath',
  'Foreyule',
];
/** A time: year `y` of an Age, `month`/`day` placing it within the year (by thirtieths). */
function at(age, y, month = 1, day = 1) {
  const tenThousandths = BigInt(Math.round((((month - 1) * 30 + day - 0.5) / 365) * 10000));
  const t = (BigInt(AGE[age] + y) * 10000n + tenThousandths) * YEAR;
  const g = gcd(t < 0n ? -t : t, 10000n);
  return `${t / g}/${10000n / g}`;
}
function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}
const ELVES = '#6fa3d8',
  MEN = '#d97a5a',
  HOBBITS = '#8fc46a',
  DWARVES = '#c9a54a',
  SAURON = '#b84a4a',
  WORLD = '#e8dcb5';
/** The First Age's years come from the later annals: say so on each (Dating context). */
const annals = {
  datePrecision: 'Year from the later annals; The Silmarillion itself gives few years.',
};
/** A Third Age date that the Shire also recorded (Historical dates), S.R. = T.A. − 1600. */
const shire = (y, month, day) => ({
  historicalDate: `S.R. ${y - 1600}, ${day} ${SHIRE[month - 1]}`,
  calendar: 'Shire Reckoning',
});

// Prints each Age's own reckoning: whole years at a distance, hundredths of a year up close.
const SOURCE = `function print(time: Rational, api: TimeAPI): string {
  const x = api.div(time, api.rational("31557600"));
  const fine = api.hasView() ? api.compare(api.labelResolution(), api.rational("31557600")) < 0 : true;
  const age = api.compare(x, api.rational("591")) < 0 ? "F.A. " : api.compare(x, api.rational("4032")) < 0 ? "S.A. " : api.compare(x, api.rational("7053")) < 0 ? "T.A. " : "Fo.A. ";
  const base = api.compare(x, api.rational("591")) < 0 ? api.rational("0") : api.compare(x, api.rational("4032")) < 0 ? api.rational("590") : api.compare(x, api.rational("7053")) < 0 ? api.rational("4031") : api.rational("7052");
  const y = api.sub(x, base);
  return api.compare(x, api.rational("1")) < 0 ? "Years of the Trees" : age + (fine ? api.decimal(y, 2) : api.decimal(api.sub(y, api.rational("1/2")), 0));
}
function parse(text: string, api: TimeAPI): Rational {
  const t = api.trim(text);
  const years = api.startsWith(t, "Fo.A. ") ? api.add(api.rational("7052"), api.parseNumber(api.slice(t, 6))) : api.startsWith(t, "T.A. ") ? api.add(api.rational("4031"), api.parseNumber(api.slice(t, 5))) : api.startsWith(t, "S.A. ") ? api.add(api.rational("590"), api.parseNumber(api.slice(t, 5))) : api.startsWith(t, "F.A. ") ? api.parseNumber(api.slice(t, 5)) : api.rational("0");
  return api.mul(years, api.rational("31557600"));
}`;

export function middleEarth(core) {
  const h = (id, time, title) => m(id, time, title, { headingLevel: 'h2', tags: ['age'] });
  const silm = (o) => ({ ...annals, ...o, tags: ['the silmarillion', ...(o.tags ?? [])] });
  const appB = (o) => ({ ...o, tags: ['the lord of the rings', ...(o.tags ?? [])] });
  const events = [
    h('h-first', at('fa', 1, 1, 1), 'The First Age'),
    m(
      'sunrise',
      at('fa', 1, 1, 1),
      'The first sunrise',
      silm({
        tags: ['men'],
        color: WORLD,
        notes:
          'The Sun and Moon first rise, and Men awake in the east. Years of the Sun are counted from here.',
      }),
    ),
    m(
      'aglareb',
      at('fa', 60),
      'The Glorious Battle',
      silm({
        tags: ['elves'],
        color: ELVES,
        notes:
          "Dagor Aglareb: the Noldor drive back Morgoth's forces and begin the Siege of Angband, some sixty years after their return.",
      }),
    ),
    m(
      'bragollach',
      at('fa', 455, 12, 20),
      'The Battle of Sudden Flame',
      silm({
        tags: ['elves', 'men'],
        color: SAURON,
        notes: 'Dagor Bragollach: Morgoth breaks the Siege of Angband in a winter of fire.',
      }),
    ),
    m(
      'silmaril',
      at('fa', 466),
      'Beren and Lúthien win a Silmaril',
      silm({
        tags: ['elves', 'men', 'silmarils'],
        color: ELVES,
        notes: "A Silmaril is cut from Morgoth's crown.",
      }),
    ),
    m(
      'nirnaeth',
      at('fa', 472, 6, 21),
      'The Battle of Unnumbered Tears',
      silm({
        tags: ['elves', 'men'],
        color: SAURON,
        notes: 'Nirnaeth Arnoediad: the Union of Maedhros is broken, and Morgoth holds the north.',
      }),
    ),
    m(
      'nargothrond',
      at('fa', 495),
      'The fall of Nargothrond',
      silm({ tags: ['elves'], color: SAURON }),
    ),
    m(
      'gondolin',
      at('fa', 510),
      'The fall of Gondolin',
      silm({ tags: ['elves'], color: SAURON, notes: 'The hidden city is betrayed and destroyed.' }),
    ),
    m(
      'sirion',
      at('fa', 538),
      'The Havens of Sirion attacked',
      silm({ tags: ['elves', 'silmarils'], color: ELVES }),
    ),
    m(
      'earendil',
      at('fa', 542),
      'Eärendil reaches Valinor',
      silm({
        tags: ['elves', 'men', 'silmarils'],
        color: ELVES,
        notes: 'He sails west with a Silmaril to plead for both Elves and Men.',
      }),
    ),
    h('h-second', at('sa', 1, 1, 1), 'The Second Age'),
    m('havens', at('sa', 1), 'The Grey Havens founded', appB({ tags: ['elves'], color: ELVES })),
    m('numenor', at('sa', 32), 'The Edain reach Númenor', appB({ tags: ['men'], color: MEN })),
    m(
      'barad-dur',
      at('sa', 1000),
      'Sauron begins Barad-dûr',
      appB({
        tags: ['sauron'],
        color: SAURON,
        datePrecision: 'About this year (Appendix B: "c. 1000").',
      }),
    ),
    m(
      'smiths',
      at('sa', 1500),
      'The Elven-smiths learn from Sauron',
      appB({
        tags: ['elves', 'sauron', 'rings of power'],
        color: SAURON,
        datePrecision: 'About this year ("c. 1500").',
      }),
    ),
    m(
      'three',
      at('sa', 1590),
      'The Three Rings completed',
      appB({
        tags: ['elves', 'rings of power'],
        color: ELVES,
        datePrecision: 'About this year ("c. 1590").',
      }),
    ),
    m(
      'forged',
      at('sa', 1600),
      'The One Ring forged',
      appB({
        tags: ['sauron', 'the one ring', 'rings of power'],
        color: SAURON,
        datePrecision: 'About this year ("c. 1600").',
        notes: 'Sauron forges the Ruling Ring in Orodruin, and the Elves become aware of him.',
      }),
    ),
    m(
      'eregion',
      at('sa', 1697),
      'Eregion laid waste; Imladris founded',
      appB({ tags: ['elves', 'sauron'], color: ELVES }),
    ),
    m(
      'captive',
      at('sa', 3262),
      'Sauron taken to Númenor',
      appB({ tags: ['men', 'sauron'], color: MEN }),
    ),
    m('downfall', at('sa', 3319), 'The Downfall of Númenor', appB({ tags: ['men'], color: MEN })),
    m('realms', at('sa', 3320), 'Arnor and Gondor founded', appB({ tags: ['men'], color: MEN })),
    m(
      'overthrown',
      at('sa', 3441),
      'Sauron overthrown; Isildur takes the Ring',
      appB({
        tags: ['men', 'sauron', 'the one ring'],
        color: MEN,
        notes: "Elendil and Gil-galad fall; Isildur cuts the Ring from Sauron's hand and keeps it.",
      }),
    ),
    h('h-third', at('ta', 1, 1, 1), 'The Third Age'),
    m(
      'gladden',
      at('ta', 2),
      'Isildur slain; the Ring lost',
      appB({
        tags: ['men', 'the one ring'],
        color: MEN,
        notes: 'At the Gladden Fields; the Ring slips from his finger into the Anduin.',
      }),
    ),
    m(
      'deagol',
      at('ta', 2463),
      'Déagol finds the Ring',
      appB({
        tags: ['the one ring'],
        color: HOBBITS,
        datePrecision: 'About this year ("c. 2463").',
        notes: 'Sméagol murders him for it.',
      }),
    ),
    m('bilbo', at('ta', 2941, 7), 'Bilbo finds the Ring', {
      tags: ['the hobbit', 'the lord of the rings', 'hobbits', 'the one ring'],
      color: HOBBITS,
      datePrecision: 'Year from Appendix B; the month is approximate.',
      notes: 'Under the Misty Mountains, on the journey to the Lonely Mountain.',
    }),
    m('five-armies', at('ta', 2941, 11), 'The Battle of Five Armies', {
      tags: ['the hobbit', 'dwarves', 'elves', 'men'],
      color: DWARVES,
      datePrecision: 'Year from Appendix B; the month is approximate.',
      notes: 'Smaug is dead; Thorin falls.',
    }),
    m(
      'party',
      at('ta', 3001, 9, 22),
      "Bilbo's farewell party",
      appB({
        tags: ['hobbits', 'the one ring'],
        color: HOBBITS,
        ...shire(3001, 9, 22),
        notes: 'He leaves the Shire and, after a struggle, the Ring.',
      }),
    ),
    m(
      'bag-end',
      at('ta', 3018, 9, 23),
      'Frodo leaves Bag End',
      appB({ tags: ['hobbits', 'the one ring'], color: HOBBITS, ...shire(3018, 9, 23) }),
    ),
    m(
      'council',
      at('ta', 3018, 10, 25),
      'The Council of Elrond',
      appB({
        tags: ['elves', 'men', 'dwarves', 'hobbits', 'the one ring'],
        color: ELVES,
        ...shire(3018, 10, 25),
      }),
    ),
    m(
      'fellowship',
      at('ta', 3018, 12, 25),
      'The Fellowship sets out',
      appB({ tags: ['hobbits', 'the one ring'], color: HOBBITS, ...shire(3018, 12, 25) }),
    ),
    m(
      'moria',
      at('ta', 3019, 1, 15),
      'Gandalf falls in Moria',
      appB({ tags: ['dwarves'], color: DWARVES, ...shire(3019, 1, 15) }),
    ),
    m(
      'breaking',
      at('ta', 3019, 2, 26),
      'The Fellowship is broken',
      appB({
        tags: ['men', 'hobbits'],
        color: MEN,
        ...shire(3019, 2, 26),
        notes: 'Boromir falls; Frodo and Sam go east alone.',
      }),
    ),
    m(
      'pelennor',
      at('ta', 3019, 3, 15),
      'The Battle of the Pelennor Fields',
      appB({ tags: ['men'], color: MEN, ...shire(3019, 3, 15) }),
    ),
    m(
      'destroyed',
      at('ta', 3019, 3, 25),
      'The Ring is destroyed',
      appB({
        tags: ['hobbits', 'the one ring'],
        color: HOBBITS,
        ...shire(3019, 3, 25),
        notes: 'Barad-dûr falls, and Sauron passes.',
      }),
    ),
    m(
      'crowned',
      at('ta', 3019, 5, 1),
      'Aragorn crowned',
      appB({ tags: ['men'], color: MEN, ...shire(3019, 5, 1) }),
    ),
    m(
      'sailing',
      at('ta', 3021, 9, 29),
      'The Ring-bearers sail west',
      appB({
        tags: ['hobbits', 'elves'],
        color: ELVES,
        ...shire(3021, 9, 29),
        notes: 'From the Grey Havens. The Third Age ends.',
      }),
    ),
    h('h-fourth', at('fo', 1, 1, 1), 'The Fourth Age'),
    m(
      'elessar',
      at('fo', 120),
      'Aragorn dies; Legolas sails',
      appB({ tags: ['men', 'elves'], color: MEN }),
    ),
  ];
  const age = (id, a, b, title, o = {}) =>
    d(id, a, b, title, { tags: ['age'], color: WORLD, ...o });
  const durations = [
    age('trees', at('fa', -400), at('fa', 1, 1, 1), 'The Years of the Trees', {
      notes:
        'Before the Sun. Tolkien reckoned these Valian Years differently in different drafts, so this span is a placeholder, not a length.',
    }),
    age('first-age', at('fa', 1, 1, 1), at('sa', 1, 1, 1), 'The First Age', {
      notes: 'Taken here as 590 years of the Sun; its end is not fixed in the published texts.',
    }),
    age('second-age', at('sa', 1, 1, 1), at('ta', 1, 1, 1), 'The Second Age'),
    age('third-age', at('ta', 1, 1, 1), at('fo', 1, 1, 1), 'The Third Age'),
    age('fourth-age', at('fo', 1, 1, 1), at('fo', 121), 'The Fourth Age'),
    d('wrath', at('fa', 545), at('fa', 587), 'The War of Wrath', {
      tags: ['the silmarillion', 'elves', 'men'],
      color: ELVES,
      notes:
        'The Host of the Valar overthrows Morgoth. Years from the later annals, which differ on its end.',
    }),
    d('alliance', at('sa', 3430), at('sa', 3441), 'The Last Alliance', {
      tags: ['the lord of the rings', 'elves', 'men'],
      color: MEN,
    }),
    d('erebor', at('ta', 2941, 4), at('ta', 2941, 11), 'The Quest of Erebor', {
      tags: ['the hobbit', 'hobbits', 'dwarves'],
      color: DWARVES,
      notes: 'Spring to winter of 2941; the months are approximate.',
    }),
    d('quest', at('ta', 3018, 9, 23), at('ta', 3019, 3, 25), 'The Quest of the Ring', {
      tags: ['the lord of the rings', 'hobbits', 'the one ring'],
      color: HOBBITS,
    }),
  ];
  const relationships = [
    rel('forged', 'overthrown'),
    rel('overthrown', 'gladden'),
    rel('gladden', 'deagol'),
    rel('deagol', 'bilbo'),
    rel('bilbo', 'party'),
    rel('party', 'bag-end'),
    rel('bag-end', 'destroyed'),
    rel('smiths', 'three'),
    rel('downfall', 'realms'),
    rel('earendil', 'd:wrath'),
    rel('silmaril', 'earendil'),
  ];
  return {
    format: 'openchronology',
    version: 1,
    title: 'Middle-earth: an unofficial chronology',
    description:
      "The legendarium from the Years of the Trees to the Fourth Age, in each Age's own reckoning (F.A., S.A., T.A., Fo.A.). Each event is tagged by the book that tells it; First Age years come from Tolkien's later annals, and the War of the Ring keeps its Shire Reckoning dates.\n\nAn unofficial fan chronology for a video about keeping a canon. Not affiliated with or endorsed by the Tolkien Estate or its licensees; summaries are our own.",
    // Ruler steps in months, years, decades, centuries and millennia (stored seconds), so the
    // ticks fall on whole years in every Age.
    presentation: {
      ruler: {
        kind: 'steps',
        steps: [
          '2629800',
          '31557600',
          '157788000',
          '315576000',
          '1577880000',
          '3155760000',
          '15778800000',
          '31557600000',
        ],
      },
      mode: 'custom',
      unit: '',
      scale: '1/1',
      origin: '0/1',
      version: 1,
      offsetMinutes: 0,
      significantDigits: 6,
      source: SOURCE,
    },
    tags: ['fiction', 'canon', 'tolkien', 'chronology'],
    plugins: [
      ...plugins(
        core.RICH_TEXT_NOTES,
        core.MOMENT_HEADINGS,
        core.MOMENT_COLORS,
        core.DATING_CONTEXT,
        core.HISTORICAL_DATES,
        core.EXPAND_ON_HOVER,
      ),
      theme(core, {
        textColor: '#ece4c8',
        textFont: 'Georgia, serif',
        measureColor: '#c9a54a',
        haloColor: '#10201a',
        markerColor: '#c9a54a',
        durationColor: '#3d5a48',
        backgroundColor: '#10201a',
      }),
    ],
    events,
    durations,
    relationships,
  };
}
