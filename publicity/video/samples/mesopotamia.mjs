// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Ancient Mesopotamia, from the first farming villages to Cyrus's conquest of Babylon in 539 BCE,
// with Alexander's death in Babylon (323 BCE) as an epilogue: the ancient-history tour's sample
// (Video 16, Short 13). Well-established dates only, each moment linked to its Wikipedia article
// (and a translated primary source where that is the natural reference).
//
// Chronology: before about 1500 BCE every date depends on which chronology is used; this sample
// uses the conventional MIDDLE CHRONOLOGY (Hammurabi 1792–1750, the Hittite sack of Babylon
// 1595) for the third and second millennia, and gives the prehistoric periods as approximate.
// Years from the first millennium on are secure to the year, and some to the day.
//
// Times: the timeline's Gregorian display is proleptic, with astronomical years (1 BCE is year 0,
// 2 BCE is year −1), so a year N BCE is stored as astronomical year 1 − N. A moment known only to
// the year sits on 1 January of that year (proleptic Gregorian, UTC). Days known from Babylonian
// records are given by historians in the Julian calendar: those are converted to the same day on
// the proleptic Gregorian line (six days earlier in the sixth century BCE) and keep their Julian
// date beside it with the Historical dates plugin.
import { m, d, rel, plugins, theme, wiki } from './lib.mjs';

/** Days since 1970-01-01 of a proleptic Gregorian date, astronomical year `y`. */
function gregorianDays(y, month, day) {
  const yy = y - (month <= 2 ? 1 : 0);
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
/** Days since 1970-01-01 of a Julian-calendar date, astronomical year `y` (from its Julian Day Number). */
function julianDays(y, month, day) {
  const a = Math.floor((14 - month) / 12);
  const yy = y + 4800 - a,
    mm = month + 12 * a - 3;
  const jdn = day + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - 32083;
  return jdn - 2440588;
}
const seconds = (days) => `${BigInt(days) * 86400n}/1`;
/** The start of a year N BCE (1 January, proleptic Gregorian): astronomical year 1 − N. */
const bce = (n, month = 1, day = 1) => seconds(gregorianDays(1 - n, month, day));
/** A day N BCE as historians give it, in the Julian calendar, placed on the Gregorian line. */
const julian = (n, month, day) => seconds(julianDays(1 - n, month, day));
// Checks of the two conversions: the Gregorian reform (Julian 4 October 1582 was followed by
// Gregorian 15 October) and the Unix epoch.
if (julianDays(1582, 10, 4) + 1 !== gregorianDays(1582, 10, 15) || gregorianDays(1970, 1, 1) !== 0)
  throw new Error('Calendar conversion is wrong.');
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
/** Historical dates for a Julian day: the date as historians give it, and the calendar. */
const jd = (n, month, day) => ({
  historicalDate: `${day} ${MONTHS[month - 1]} ${n} BCE`,
  calendar: 'Julian (proleptic)',
});

/** Dating context for an approximate date. */
const about = (text) => ({ datePrecision: text });
const MIDDLE = 'Middle chronology';
const PREHISTORY = 'Approximate (archaeological dating); placed at the conventional round date.';

// Tag colours on the archive ground.
const WAR = '#9c3b2a',
  LAW = '#2f6b4f',
  WRITING = '#1f3a5f',
  SCIENCE = '#2b7a8c',
  CITY = '#a8742a',
  BUILDING = '#7a5a2a';
const PERIOD = '#c9b48a',
  REIGN = '#5a7397';

const BC = 'https://www.livius.org/sources/content/mesopotamian-chronicles-content/';

export function mesopotamia(core) {
  const h = (id, time, title) => m(id, time, title, { headingLevel: 'h2', tags: ['chapter'] });
  const events = [
    // ---------------------------------------------------------------- Villages
    h('h-villages', bce(7000), 'The first farming villages'),
    m('jarmo', bce(7000), 'Jarmo', {
      tags: ['city'],
      color: CITY,
      ...about(PREHISTORY),
      notes:
        'A farming village in the Zagros foothills of northern Iraq, about 7000 BCE: mud houses, domesticated wheat, barley, goats and sheep. One of the earliest excavated villages near Mesopotamia.',
      sources: [wiki('Jarmo')],
    }),
    m('oueili', bce(6500), "Tell el-'Oueili", {
      tags: ['city'],
      color: CITY,
      ...about(PREHISTORY),
      notes:
        'The oldest known settlement on the southern plain, near Larsa, with the earliest phase of the **Ubaid** culture (Ubaid 0), about 6500 BCE.',
      sources: [wiki("Tell_el-'Oueili"), wiki('Ubaid_period')],
    }),
    m('hassuna', bce(6000), 'Hassuna villages', {
      tags: ['city'],
      color: CITY,
      ...about(PREHISTORY),
      notes:
        'The **Hassuna** culture of the early sixth millennium BCE: farming villages of northern Mesopotamia with painted pottery and storage bins.',
      sources: [wiki('Hassuna_culture')],
    }),
    m('choga-mami', bce(5500), 'Irrigation canals', {
      tags: ['science'],
      color: SCIENCE,
      ...about(PREHISTORY),
      notes:
        'The **Samarra** culture, about 5500 BCE, left some of the earliest evidence of irrigation farming, such as the canals at Choga Mami.',
      sources: [wiki('Samarra_culture'), wiki('Choga_Mami')],
    }),
    m('eridu', bce(5400), 'Eridu founded', {
      tags: ['city'],
      color: CITY,
      ...about(PREHISTORY),
      notes:
        'Settled about 5400 BCE, **Eridu** kept a temple rebuilt on the same spot for thousands of years. Sumerian tradition called it the first city, where kingship first came down from heaven.',
      sources: [wiki('Eridu')],
    }),
    // ---------------------------------------------------------------- Uruk
    h('h-uruk', bce(4000), 'Uruk: the first cities and writing'),
    m('seals', bce(3500), 'Cylinder seals', {
      tags: ['writing'],
      color: WRITING,
      ...about('Uruk period, about 3500 BCE.'),
      notes:
        'Small carved stone cylinders, rolled across wet clay to sign or seal goods and documents. They appear in the Uruk period and were used in Mesopotamia for three thousand years.',
      sources: [wiki('Cylinder_seal')],
    }),
    m('white-temple', bce(3450), 'The White Temple at Uruk', {
      tags: ['building'],
      color: BUILDING,
      ...about('Built about 3500–3000 BCE; placed at 3450.'),
      notes:
        'A whitewashed temple on a high platform, the **Anu Ziggurat**: a forerunner of the ziggurats.',
      sources: [wiki('Anu_ziggurat')],
    }),
    m('wheel', bce(3400), 'Wheeled wagons', {
      tags: ['science'],
      color: SCIENCE,
      ...about('The Uruk pictographs are dated about 3500–3350 BCE; placed at 3400.'),
      notes:
        'Pictographs from the Eanna district of **Uruk** show wagons on wheels. Wheeled vehicles appear at about the same time in the Caucasus and Europe, so where the wheel was first made is unknown.',
      sources: [wiki('Wheel')],
    }),
    m('writing', bce(3300), 'Writing: proto-cuneiform', {
      tags: ['writing'],
      color: WRITING,
      ...about('Uruk IV, about 3300 BCE (the earliest unequivocal written documents).'),
      notes:
        'Clay tablets from **Uruk** record rations, animals and land in signs pressed with a reed. Writing began as bookkeeping; over centuries it became **cuneiform**, used for more than three thousand years.',
      sources: [wiki('Cuneiform'), wiki('Proto-cuneiform')],
    }),
    m('sixty', bce(3200), 'Counting in sixties', {
      tags: ['science'],
      color: SCIENCE,
      ...about('Proto-cuneiform accounts of the late fourth millennium BCE; placed at 3200.'),
      notes:
        'The earliest accounts already count some goods in a **sexagesimal** (base-60) system, which Babylonian mathematics later wrote with place value. Sixty minutes in an hour and 360 degrees in a circle descend from it.',
      sources: [wiki('Sexagesimal'), wiki('Babylonian_cuneiform_numerals')],
    }),
    m('uruk-vase', bce(3100), 'The Warka Vase', {
      tags: ['building'],
      color: BUILDING,
      ...about('About 3200–3000 BCE; placed at 3100.'),
      notes:
        'An alabaster vase from the Eanna temple at **Uruk**, carved in registers: water, crops, animals, and a procession bringing offerings to the goddess **Inanna**.',
      sources: [wiki('Warka_Vase')],
    }),
    m('uruk-city', bce(2900), 'Uruk at its height', {
      tags: ['city'],
      color: CITY,
      ...about('About 2900 BCE; population estimates vary.'),
      notes:
        '**Uruk** covered about 6 square kilometres inside its walls and may have held 50,000 people or more, among the largest cities in the world at the time.',
      sources: [wiki('Uruk')],
    }),
    // ---------------------------------------------------------------- Early Dynastic
    h('h-sumer', bce(2900), 'The Sumerian city-states'),
    m('gilgamesh-king', bce(2700), 'Gilgamesh, king of Uruk', {
      tags: ['writing'],
      color: WRITING,
      ...about(
        'If he was historical, about 2700 BCE (Early Dynastic II); no inscription of his own survives.',
      ),
      notes:
        'The **Sumerian King List** names **Gilgamesh** as a king of Uruk. Kings of his time, such as Enmebaragesi of Kish, are attested, so many scholars think he was a real ruler later made a legend.',
      sources: [wiki('Gilgamesh')],
    }),
    m('enmebaragesi', bce(2600), 'Enmebaragesi of Kish', {
      tags: ['city'],
      color: CITY,
      ...about(`About 2600 BCE (${MIDDLE.toLowerCase()}).`),
      notes:
        'The earliest Sumerian king whose name appears in inscriptions of his own time. **Kish** gave its name to a title, "king of Kish", claimed by later rulers of all Sumer.',
      sources: [wiki('Enmebaragesi')],
    }),
    m('royal-cemetery', bce(2550), 'The Royal Cemetery of Ur', {
      tags: ['city'],
      color: CITY,
      ...about('About 2600–2450 BCE; placed at 2550.'),
      notes:
        'Tombs at **Ur** full of gold, lapis lazuli and the bodies of attendants buried with their rulers, among them Queen **Puabi**. Excavated by Leonard Woolley in the 1920s.',
      sources: [wiki('Royal_Cemetery_at_Ur'), wiki('Puabi')],
    }),
    m('standard-of-ur', bce(2500), 'The Standard of Ur', {
      tags: ['war'],
      color: WAR,
      ...about('About 2500 BCE.'),
      notes:
        'An inlaid box from the Royal Cemetery: one side shows war, with wheeled carts drawn by onagers; the other, a banquet and a procession of tribute.',
      sources: [wiki('Standard_of_Ur')],
    }),
    m('vultures', bce(2450), 'The Stele of the Vultures', {
      tags: ['war'],
      color: WAR,
      ...about('About 2450 BCE.'),
      notes:
        '**Eannatum** of Lagash celebrates his victory over neighbouring **Umma** in a long border war over fields and water: one of the oldest known war monuments.',
      sources: [wiki('Stele_of_the_Vultures')],
    }),
    m('urukagina', bce(2370), "Urukagina's reforms", {
      tags: ['law'],
      color: LAW,
      ...about('Urukagina ruled about 2378–2368 BCE; placed at 2370.'),
      notes:
        '**Urukagina** of Lagash recorded measures against abuses by officials and the temple, such as cutting the fees charged at burials. Often called the first legal reform, though no code survives.',
      sources: [wiki('Urukagina')],
    }),
    m('lugalzagesi', bce(2350), 'Lugalzagesi unites Sumer', {
      tags: ['war'],
      color: WAR,
      ...about(`About 2350 BCE (${MIDDLE.toLowerCase()}).`),
      notes:
        '**Lugalzagesi** of Umma sacks Lagash and rules the Sumerian cities from Uruk, until **Sargon of Akkad** defeats him.',
      sources: [wiki('Lugalzagesi')],
    }),
    // ---------------------------------------------------------------- Akkad
    h('h-akkad', bce(2334), 'The Akkadian Empire'),
    m('akkad', bce(2330), 'Akkad, the lost capital', {
      tags: ['city'],
      color: CITY,
      ...about(`Sargon's reign began about 2334 BCE (${MIDDLE.toLowerCase()}); placed at 2330.`),
      notes:
        "**Sargon**'s capital, **Akkad** (Agade), gave its name to the empire and to the Akkadian language. Its site has never been found.",
      sources: [wiki('Akkad_(city)')],
    }),
    m('enheduanna', bce(2285), 'Enheduanna, high priestess at Ur', {
      tags: ['writing'],
      color: WRITING,
      ...about('Active about 2300 BCE; placed at 2285.'),
      notes:
        "Sargon's daughter **Enheduanna**, high priestess of the moon god Nanna at Ur. Hymns to Inanna are attributed to her, which would make her the earliest author known by name; the attribution is debated.",
      sources: [wiki('Enheduanna')],
    }),
    m('naram-sin-stele', bce(2250), 'The Victory Stele of Naram-Sin', {
      tags: ['war'],
      color: WAR,
      ...about(`About 2250 BCE (${MIDDLE.toLowerCase()}).`),
      notes:
        '**Naram-Sin**, horned like a god, climbs a mountain over the defeated Lullubi. Elamites carried it off to **Susa** a thousand years later, where it was found.',
      sources: [wiki('Victory_Stele_of_Naram-Sin')],
    }),
    m('akkad-falls', bce(2154), 'Akkad falls', {
      tags: ['war'],
      color: WAR,
      ...about(`About 2154 BCE (${MIDDLE.toLowerCase()}).`),
      notes:
        'The empire breaks up amid revolts and the arrival of the **Gutians** from the Zagros; later Mesopotamians told it as a curse on Naram-Sin.',
      sources: [wiki('Akkadian_Empire'), wiki('Gutian_dynasty')],
    }),
    m('gudea', bce(2125), 'The cylinders of Gudea', {
      tags: ['writing', 'building'],
      color: WRITING,
      ...about('Gudea ruled about 2144–2124 BCE; placed at 2125.'),
      notes:
        '**Gudea** of Lagash records, on two great clay cylinders, how he rebuilt the temple of Ningirsu: the longest known text in Sumerian. Many of his diorite statues survive.',
      sources: [wiki('Gudea'), wiki('Gudea_cylinders')],
    }),
    // ---------------------------------------------------------------- Ur III
    h('h-ur', bce(2112), 'The Third Dynasty of Ur'),
    m('ziggurat-ur', bce(2105), 'The Great Ziggurat of Ur', {
      tags: ['building'],
      color: BUILDING,
      ...about('Begun under Ur-Nammu (2112–2095 BCE), finished under Shulgi; placed at 2105.'),
      notes:
        'A stepped temple platform for the moon god **Nanna**, built of mud brick faced with baked brick and bitumen. Its lower stage survives, restored in the 1980s.',
      sources: [wiki('Ziggurat_of_Ur')],
    }),
    m('ur-nammu-code', bce(2100), 'The Code of Ur-Nammu', {
      tags: ['law'],
      color: LAW,
      ...about(`About 2100 BCE (${MIDDLE.toLowerCase()}).`),
      notes:
        'The oldest law code that survives: **Ur-Nammu** (or his son Shulgi) sets fines in silver for injuries, three centuries before Hammurabi.',
      sources: [wiki('Code_of_Ur-Nammu')],
    }),
    m('gilgamesh-sumerian', bce(2080), 'Sumerian poems of Gilgamesh', {
      tags: ['writing'],
      color: WRITING,
      ...about('Probably composed under the Third Dynasty of Ur, about 2100 BCE; placed at 2080.'),
      notes:
        "Separate Sumerian poems about **Gilgamesh**, likely written for the kings of Ur, who claimed him as kin. They are the epic's sources.",
      sources: [wiki('Epic_of_Gilgamesh')],
    }),
    m('fall-of-ur', bce(2004), 'Ur falls to Elam', {
      tags: ['war'],
      color: WAR,
      ...about(`2004 BCE (${MIDDLE.toLowerCase()}).`),
      notes:
        'Elamites sack **Ur** and carry its last king, **Ibbi-Sin**, away. Mourned in the **Lament for Ur**.',
      sources: [wiki('Third_Dynasty_of_Ur'), wiki('Lament_for_Ur')],
    }),
    // ---------------------------------------------------------------- Old Babylonian
    h('h-babylon', bce(2004), 'Amorite kingdoms and Hammurabi'),
    m('assur', bce(1950), 'Assyrian merchants at Kanesh', {
      tags: ['writing', 'city'],
      color: WRITING,
      ...about(`Twentieth to eighteenth centuries BCE (${MIDDLE.toLowerCase()}); placed at 1950.`),
      notes:
        'Merchants from the city-state of **Assur** trade tin and textiles in Anatolia. Their letters and contracts, over 20,000 tablets found at Kültepe, are the archive of the **Old Assyrian** period.',
      sources: [wiki('Kültepe'), wiki('Old_Assyrian_period')],
    }),
    m('lipit-ishtar', bce(1930), 'The Code of Lipit-Ishtar', {
      tags: ['law'],
      color: LAW,
      ...about(`Lipit-Ishtar of Isin ruled about 1934–1924 BCE (${MIDDLE.toLowerCase()}).`),
      notes:
        'Laws of **Lipit-Ishtar**, king of Isin, in Sumerian, with a prologue and epilogue like those of later codes.',
      sources: [wiki('Code_of_Lipit-Ishtar')],
    }),
    m('eshnunna', bce(1920), 'The Laws of Eshnunna', {
      tags: ['law'],
      color: LAW,
      ...about('Dated about 1930 BCE; placed at 1920 to read apart from Lipit-Ishtar.'),
      notes:
        'Laws of the kingdom of **Eshnunna**, in Akkadian: prices, wages, and rules on an ox that gores, which Hammurabi’s code also takes up. Found near Baghdad in 1945 and 1947.',
      sources: [wiki('Laws_of_Eshnunna')],
    }),
    m('babylon-dynasty', bce(1894), 'The First Dynasty of Babylon', {
      tags: ['city'],
      color: CITY,
      ...about(`1894 BCE (${MIDDLE.toLowerCase()}).`),
      notes:
        'The Amorite chief **Sumu-abum** founds a dynasty in **Babylon**, then a small town. Its sixth king will be Hammurabi.',
      sources: [wiki('First_Babylonian_dynasty')],
    }),
    m('gilgamesh-ob', bce(1800), 'The Old Babylonian Gilgamesh', {
      tags: ['writing'],
      color: WRITING,
      ...about('Eighteenth century BCE; the tablets are dated about 1800.'),
      notes:
        'The Sumerian tales are woven into one epic in Akkadian: Gilgamesh, his friend Enkidu, and his search for life without death.',
      sources: [wiki('Epic_of_Gilgamesh')],
    }),
    m('plimpton', bce(1780), 'Plimpton 322', {
      tags: ['science'],
      color: SCIENCE,
      ...about('Probably written about 1800 BCE, at Larsa; placed at 1780.'),
      notes:
        'A clay tablet with a table of numbers in base 60 that form right triangles (Pythagorean triples), more than a thousand years before Pythagoras.',
      sources: [wiki('Plimpton_322')],
    }),
    m('larsa', bce(1763), 'Hammurabi conquers Larsa', {
      tags: ['war'],
      color: WAR,
      ...about(`1763 BCE (${MIDDLE.toLowerCase()}).`),
      notes:
        "**Hammurabi** defeats **Rim-Sin** of Larsa and takes the south. Babylon's rise turns from city to kingdom.",
      sources: [wiki('Hammurabi'), wiki('Rim-Sin_I')],
    }),
    m('mari', bce(1761), 'Hammurabi destroys Mari', {
      tags: ['war', 'city'],
      color: WAR,
      ...about(`1761 BCE (${MIDDLE.toLowerCase()}).`),
      notes:
        'Once his ally, **Zimri-Lim** of Mari loses his city to Hammurabi. Its palace archive, some 25,000 tablets, survived in the ruins.',
      sources: [wiki('Mari,_Syria'), wiki('Zimri-Lim')],
    }),
    m('hammurabi-code', bce(1754), 'The Code of Hammurabi', {
      tags: ['law'],
      color: LAW,
      ...about(`About 1755–1750 BCE (${MIDDLE.toLowerCase()}); placed at 1754.`),
      notes:
        '**Hammurabi** has 282 laws carved on a basalt stele under a relief of the sun god Shamash: punishments scaled to the victim\'s rank, and "an eye for an eye". Now in the Louvre.',
      sources: [wiki('Code_of_Hammurabi')],
    }),
    m('atrahasis', bce(1640), 'The Epic of Atrahasis', {
      tags: ['writing'],
      color: WRITING,
      ...about('The oldest copy is from the reign of Ammi-Saduqa (1646–1626 BCE); placed at 1640.'),
      notes:
        'The gods send a flood to destroy humanity; **Atrahasis** survives in a boat. The same story is told in the later Gilgamesh epic.',
      sources: [wiki('Atra-Hasis')],
    }),
    m('venus-tablet', bce(1630), 'The Venus tablet of Ammi-Saduqa', {
      tags: ['science'],
      color: SCIENCE,
      ...about(
        'Observations of the reign of Ammi-Saduqa (1646–1626 BCE in the middle chronology).',
      ),
      notes:
        "Records of Venus's risings and settings over 21 years. Matching them to the sky gives several possible dates, eight years or more apart: the source of the high, middle and low chronologies.",
      sources: [wiki('Venus_tablet_of_Ammisaduqa'), wiki('Chronology_of_the_ancient_Near_East')],
    }),
    m('hittite-sack', bce(1595), 'The Hittites sack Babylon', {
      tags: ['war'],
      color: WAR,
      ...about(
        '1595 BCE in the middle chronology (1651 high, 1531 low): the date the chronologies are named by.',
      ),
      notes:
        "The Hittite king **Mursili I** raids down the Euphrates and sacks **Babylon**, ending Hammurabi's dynasty; the statue of Marduk is carried off.",
      sources: [wiki('Sack_of_Babylon'), wiki('Mursili_I')],
    }),
    // ---------------------------------------------------------------- Kassites and Assyria
    h('h-kassite', bce(1595), 'Kassite Babylon and Middle Assyria'),
    m('amarna', bce(1350), 'Letters to Egypt', {
      tags: ['writing'],
      color: WRITING,
      ...about('About 1360–1332 BCE; placed at 1350.'),
      notes:
        'Among the **Amarna letters**, the Kassite king **Burna-Buriash II** writes to the pharaoh in Babylonian, the language of diplomacy, about gold, gifts and marriages; so does Ashur-uballit I of Assyria.',
      sources: [wiki('Amarna_letters'), wiki('Burna-Buriash_II')],
    }),
    m('tukulti-ninurta-babylon', bce(1225), 'Tukulti-Ninurta I takes Babylon', {
      tags: ['war'],
      color: WAR,
      ...about('About 1225 BCE.'),
      notes:
        '**Tukulti-Ninurta I** of Assyria defeats the Kassite king Kashtiliash IV and rules Babylon for a time, an event celebrated in the **Tukulti-Ninurta Epic**.',
      sources: [wiki('Tukulti-Ninurta_I')],
    }),
    m('gilgamesh-standard', bce(1200), 'The Standard Babylonian Gilgamesh', {
      tags: ['writing'],
      color: WRITING,
      ...about('Compiled between about 1300 and 1000 BCE; placed at 1200.'),
      notes:
        'The scholar-scribe **Sîn-lēqi-unninni** is credited with the version in twelve tablets, opening "He who saw the deep", with the flood story told to Gilgamesh by Utnapishtim.',
      sources: [wiki('Epic_of_Gilgamesh'), wiki('Sîn-lēqi-unninni')],
    }),
    m('stele-to-susa', bce(1158), "Hammurabi's stele carried to Susa", {
      tags: ['law', 'war'],
      color: LAW,
      ...about('About 1158 BCE.'),
      notes:
        'The Elamite king **Shutruk-Nakhunte** raids Babylonia and takes monuments home to **Susa** as trophies, among them the Code of Hammurabi and the stele of Naram-Sin, where French excavators found them in 1898–1902.',
      sources: [wiki('Shutruk-Nakhunte'), wiki('Code_of_Hammurabi')],
    }),
    m('kassite-end', bce(1155), 'The Kassite dynasty ends', {
      tags: ['war'],
      color: WAR,
      ...about('1155 BCE.'),
      notes:
        'Elam deposes the last Kassite king, **Enlil-nadin-ahi**, after more than four centuries of Kassite rule in Babylon.',
      sources: [wiki('Kassites')],
    }),
    m('nebuchadnezzar-i', bce(1110), 'Marduk comes home', {
      tags: ['war'],
      color: WAR,
      ...about('Nebuchadnezzar I ruled about 1121–1100 BCE; placed at 1110.'),
      notes:
        '**Nebuchadnezzar I** of Babylon defeats Elam and brings the statue of **Marduk** back from Susa. Marduk becomes the head of the Babylonian gods.',
      sources: [wiki('Nebuchadnezzar_I')],
    }),
    m('mal', bce(1076), 'The Middle Assyrian Laws', {
      tags: ['law'],
      color: LAW,
      ...about(
        'The surviving tablets are copies of about the reign of Tiglath-Pileser I (1114–1076 BCE).',
      ),
      notes:
        'Tablets from **Assur** with laws on marriage, property and punishment, harsher than Babylonian law, including rules on the veiling of women.',
      sources: [wiki('Middle_Assyrian_Laws')],
    }),
    // ---------------------------------------------------------------- Neo-Assyria
    h('h-assyria', bce(911), 'The Neo-Assyrian Empire'),
    m('kalhu', bce(879), 'The banquet at Kalhu', {
      tags: ['city', 'building'],
      color: CITY,
      ...about('879 BCE.'),
      notes:
        '**Ashurnasirpal II** moves his capital to **Kalhu** (Nimrud) and opens his new palace with a feast for 69,574 guests, recorded on the Banquet Stele. Its gateways were guarded by winged bulls, the **lamassu**.',
      sources: [wiki('Nimrud'), wiki('Ashurnasirpal_II')],
    }),
    m('qarqar', bce(853), 'The Battle of Qarqar', {
      tags: ['war'],
      color: WAR,
      ...about('853 BCE.'),
      notes:
        '**Shalmaneser III** fights a coalition of twelve kings in Syria, among them **Ahab** of Israel: the first mention of an Israelite king outside the Bible, and of Arabs.',
      sources: [wiki('Battle_of_Qarqar')],
    }),
    m('black-obelisk', bce(825), 'The Black Obelisk', {
      tags: ['writing', 'war'],
      color: WRITING,
      ...about('About 825 BCE.'),
      notes:
        "A stone monument of **Shalmaneser III**'s campaigns, showing kings bringing tribute; one is named as **Jehu** of Israel.",
      sources: [wiki('Black_Obelisk_of_Shalmaneser_III')],
    }),
    m('eclipse', julian(763, 6, 15), 'The eclipse of Bur-Sagale', {
      tags: ['science'],
      color: SCIENCE,
      ...jd(763, 6, 15),
      ...about('15 June 763 BCE (Julian), fixed by astronomy.'),
      notes:
        'The Assyrian list of yearly officials records a solar eclipse in the year of **Bur-Sagale**. Astronomers date it to 15 June 763 BCE, which anchors the list, and with it the dates of the Assyrian kings, to the year.',
      sources: [wiki('Assyrian_eclipse')],
    }),
    m('tp3-babylon', bce(729), 'Tiglath-Pileser III king of Babylon', {
      tags: ['war'],
      color: WAR,
      ...about('729 BCE.'),
      notes:
        '**Tiglath-Pileser III**, who rebuilt the Assyrian army and moved whole populations, takes the throne of Babylon himself.',
      sources: [wiki('Tiglath-Pileser_III')],
    }),
    m('samaria', bce(722), 'Samaria falls', {
      tags: ['war'],
      color: WAR,
      ...about('722 BCE (some date it to 720).'),
      notes:
        'Assyria takes **Samaria** and ends the Kingdom of Israel; Sargon II claims to have deported 27,290 people.',
      sources: [wiki('Sargon_II'), wiki('Shalmaneser_V')],
    }),
    m('dur-sharrukin', bce(717), 'Dur-Sharrukin founded', {
      tags: ['city', 'building'],
      color: CITY,
      ...about('Begun 717 BCE.'),
      notes:
        '**Sargon II** builds a new capital from nothing, **Dur-Sharrukin** (Khorsabad). Abandoned soon after his death in battle in 705.',
      sources: [wiki('Dur-Sharrukin'), wiki('Sargon_II')],
    }),
    m('nineveh-capital', bce(703), 'Nineveh, the Palace Without a Rival', {
      tags: ['city', 'building'],
      color: CITY,
      ...about('Built from about 703 BCE.'),
      notes:
        '**Sennacherib** makes **Nineveh** his capital and builds the Southwest Palace, its walls lined with carved reliefs of his campaigns, and canals and aqueducts to water the city.',
      sources: [wiki('Nineveh'), wiki('Sennacherib')],
    }),
    m('lachish', bce(701), 'The siege of Lachish', {
      tags: ['war'],
      color: WAR,
      ...about('701 BCE.'),
      notes:
        "Sennacherib's army takes the Judahite city of **Lachish** and besieges Jerusalem, which Hezekiah keeps by paying tribute. The siege is carved on the walls of his palace at Nineveh.",
      sources: [wiki('Siege_of_Lachish'), wiki('Lachish_reliefs')],
    }),
    m('babylon-destroyed', bce(689), 'Sennacherib destroys Babylon', {
      tags: ['war'],
      color: WAR,
      ...about('689 BCE.'),
      notes:
        'After years of revolt, and the death of his son held captive by the Elamites, **Sennacherib** sacks Babylon and floods it. His son **Esarhaddon** rebuilds it.',
      sources: [wiki('Sennacherib')],
    }),
    m('sennacherib-murdered', bce(681), 'Sennacherib murdered', {
      tags: ['war'],
      color: WAR,
      ...about('681 BCE.'),
      notes: 'Killed by one or more of his sons; **Esarhaddon** wins the war for the throne.',
      sources: [wiki('Sennacherib')],
    }),
    m('memphis', bce(671), 'Assyria takes Memphis', {
      tags: ['war'],
      color: WAR,
      ...about('671 BCE.'),
      notes:
        '**Esarhaddon** invades Egypt and takes **Memphis**, driving out the Kushite pharaoh Taharqa: Assyria at its greatest extent.',
      sources: [wiki('Esarhaddon'), wiki('Assyrian_conquest_of_Egypt')],
    }),
    m('diaries', bce(652), 'The astronomical diaries begin', {
      tags: ['science', 'writing'],
      color: SCIENCE,
      ...about('The oldest dated diary is from 652 BCE.'),
      notes:
        "Babylon's astronomers begin nightly records of the Moon, planets and weather, with prices and events, kept for six centuries, to 61 BCE. One records Alexander's death.",
      sources: [wiki('Babylonian_astronomical_diaries')],
    }),
    m('library', bce(650), 'The Library of Ashurbanipal', {
      tags: ['writing'],
      color: WRITING,
      ...about('Gathered during his reign, 669–631 BCE; placed at 650.'),
      notes:
        '**Ashurbanipal**, who claimed he could read and write, has scribes collect and copy texts from across Mesopotamia at **Nineveh**: omens, hymns, medicine, dictionaries and the best copies of Gilgamesh. More than 30,000 tablets survive.',
      sources: [wiki('Library_of_Ashurbanipal'), wiki('Ashurbanipal')],
    }),
    m('susa', bce(646), 'Ashurbanipal sacks Susa', {
      tags: ['war'],
      color: WAR,
      ...about('About 646 BCE.'),
      notes:
        'Assyria ends the long wars with **Elam** by plundering its capital, **Susa**, and its royal tombs.',
      sources: [wiki('Ashurbanipal'), wiki('Sack_of_Susa')],
    }),
    m('nabopolassar', bce(626), 'Nabopolassar seizes Babylon', {
      tags: ['war'],
      color: WAR,
      ...about('626 BCE.'),
      notes:
        'In the confusion after Ashurbanipal, **Nabopolassar** makes himself king of Babylon and begins a war against Assyria.',
      sources: [wiki('Nabopolassar')],
    }),
    m('nineveh-falls', bce(612), 'The fall of Nineveh', {
      tags: ['war'],
      color: WAR,
      ...about('612 BCE, after a siege of about three months (in the month Abu, July–August).'),
      notes:
        'Babylonians and **Medes** under Cyaxares take and burn **Nineveh**. The fire that brought down the palaces baked many of the clay tablets of its libraries hard.',
      sources: [wiki('Battle_of_Nineveh_(612_BC)'), `${BC}abc-3-fall-of-nineveh-chronicle/`],
    }),
    m('harran', bce(609), 'The end of Assyria', {
      tags: ['war'],
      color: WAR,
      ...about('Harran fell in 610 BCE; the attempt to retake it failed in 609.'),
      notes:
        'The last Assyrian king, **Ashur-uballit II**, fails to retake **Harran** with Egyptian help, and Assyria disappears from the record.',
      sources: [wiki('Fall_of_Harran'), wiki('Ashur-uballit_II')],
    }),
    // ---------------------------------------------------------------- Neo-Babylonian
    h('h-neo-babylon', bce(605), 'The Neo-Babylonian Empire'),
    m('carchemish', bce(605), 'The Battle of Carchemish', {
      tags: ['war'],
      color: WAR,
      ...about('605 BCE, in the summer.'),
      notes:
        'Crown prince **Nebuchadnezzar** defeats the Egyptian army of **Necho II** in Syria; Babylon inherits the Assyrian empire in the west.',
      sources: [wiki('Battle_of_Carchemish')],
    }),
    m('etemenanki', bce(600), 'Etemenanki, the ziggurat of Babylon', {
      tags: ['building'],
      color: BUILDING,
      ...about('Rebuilt under Nabopolassar and Nebuchadnezzar II; placed at 600.'),
      notes:
        'The ziggurat of **Marduk**\'s temple, "temple of the foundation of heaven and earth", about 90 metres square at its base; often taken as the model for the **Tower of Babel**.',
      sources: [wiki('Etemenanki')],
    }),
    m('jerusalem-597', julian(597, 3, 16), 'Nebuchadnezzar takes Jerusalem', {
      tags: ['war'],
      color: WAR,
      ...jd(597, 3, 16),
      ...about('2 Adar of his seventh year: 16 March 597 BCE (Julian).'),
      notes:
        'A Babylonian chronicle dates it to the day: **Nebuchadnezzar II** takes Jerusalem, deports King **Jehoiachin** to Babylon and sets up Zedekiah.',
      sources: [wiki('Siege_of_Jerusalem_(597_BC)'), `${BC}abc-5-jerusalem-chronicle/`],
    }),
    m('jerusalem-587', bce(587), 'Jerusalem destroyed', {
      tags: ['war'],
      color: WAR,
      ...about('587 BCE (some date it to 586).'),
      notes:
        "After Zedekiah's revolt, the Babylonians destroy **Jerusalem** and Solomon's Temple and deport much of Judah's elite: the **Babylonian exile**.",
      sources: [wiki('Siege_of_Jerusalem_(587_BC)'), wiki('Babylonian_captivity')],
    }),
    m('ishtar-gate', bce(575), 'The Ishtar Gate', {
      tags: ['building'],
      color: BUILDING,
      ...about('About 575 BCE.'),
      notes:
        "The north gate of **Babylon**, faced with blue glazed brick and rows of dragons and bulls, at the head of the Processional Way. Rebuilt from its bricks in Berlin's Pergamon Museum.",
      sources: [wiki('Ishtar_Gate')],
    }),
    m('naram-sin-found', bce(542), "Nabonidus digs up Naram-Sin's foundation", {
      tags: ['writing', 'building'],
      color: WRITING,
      ...about(
        'Written after Nabonidus returned from Tayma (543 BCE) and before the war with Cyrus; placed at 542.',
      ),
      notes:
        'Rebuilding the temple of Shamash at **Sippar**, **Nabonidus** digs down to an inscription of **Naram-Sin**, which, he wrote, no king before him had seen for 3,200 years. The real gap was about 1,700 years; he was out by some 1,500.',
      sources: [
        wiki('Nabonidus'),
        'https://www.livius.org/sources/content/nabonidus-cylinder-from-sippar/',
      ],
    }),
    m('opis', julian(539, 10, 1), 'The Battle of Opis', {
      tags: ['war'],
      color: WAR,
      ...about(
        'In the month Tashritu of 539 BCE, before Sippar fell on 10 October (Julian); the day is not known, placed at 1 October.',
      ),
      notes: '**Cyrus the Great** of Persia defeats the Babylonian army at Opis on the Tigris.',
      sources: [wiki('Battle_of_Opis'), `${BC}abc-7-nabonidus-chronicle/`],
    }),
    m('sippar', julian(539, 10, 10), 'Sippar surrenders', {
      tags: ['war'],
      color: WAR,
      ...jd(539, 10, 10),
      ...about('14 Tashritu: 10 October 539 BCE (Julian).'),
      notes: 'Sippar is taken without a battle; Nabonidus flees.',
      sources: [wiki('Fall_of_Babylon'), `${BC}abc-7-nabonidus-chronicle/`],
    }),
    m('babylon-falls', julian(539, 10, 12), 'Babylon falls to Cyrus', {
      tags: ['war'],
      color: WAR,
      ...jd(539, 10, 12),
      ...about('16 Tashritu: 12 October 539 BCE (Julian), from the Nabonidus Chronicle.'),
      notes:
        "Cyrus's general **Ugbaru** (Gobryas) and the Persian army enter **Babylon** without a battle. The Nabonidus Chronicle gives the day.",
      sources: [wiki('Fall_of_Babylon'), `${BC}abc-7-nabonidus-chronicle/`],
    }),
    m('cyrus-enters', julian(539, 10, 29), 'Cyrus enters Babylon', {
      tags: ['war'],
      color: WAR,
      ...jd(539, 10, 29),
      ...about('3 Arahsamnu: 29 October 539 BCE (Julian).'),
      notes:
        'Cyrus himself arrives; the chronicle says green branches were spread before him and peace was proclaimed to the city.',
      sources: [wiki('Fall_of_Babylon'), `${BC}abc-7-nabonidus-chronicle/`],
    }),
    // ---------------------------------------------------------------- Epilogue
    h('h-persia', bce(538), 'Epilogue: Persian Babylon and Alexander'),
    m('cyrus-cylinder', bce(538), 'The Cyrus Cylinder', {
      tags: ['writing', 'law'],
      color: WRITING,
      ...about('539 or 538 BCE; placed at 538.'),
      notes:
        'A clay cylinder in Babylonian in which **Cyrus** presents himself as chosen by Marduk, condemns Nabonidus, and tells of returning gods and peoples to their homes.',
      sources: [wiki('Cyrus_Cylinder')],
    }),
    m('behistun', bce(520), 'The Behistun Inscription', {
      tags: ['writing'],
      color: WRITING,
      ...about('About 520 BCE.'),
      notes:
        '**Darius I** carves his victories on a cliff in Iran in Old Persian, Elamite and Babylonian. Copied in the 1830s–40s, it became the key to reading cuneiform again.',
      sources: [wiki('Behistun_Inscription')],
    }),
    m('gaugamela', julian(331, 10, 1), 'The Battle of Gaugamela', {
      tags: ['war'],
      color: WAR,
      ...jd(331, 10, 1),
      ...about('1 October 331 BCE (Julian), eleven days after a lunar eclipse.'),
      notes:
        '**Alexander the Great** defeats **Darius III** near Arbela in northern Mesopotamia. A Babylonian astronomical diary records the battle.',
      sources: [wiki('Battle_of_Gaugamela')],
    }),
    m('alexander-babylon', julian(331, 10, 25), 'Alexander enters Babylon', {
      tags: ['war'],
      color: WAR,
      ...about('Late October 331 BCE; the day is not certain, placed at 25 October (Julian).'),
      notes: "Babylon's governor **Mazaeus** surrenders the city to Alexander without a fight.",
      sources: [wiki('Alexander_the_Great'), wiki('Mazaeus')],
    }),
    m('alexander-dies', julian(323, 6, 11), 'Alexander dies in Babylon', {
      tags: ['war'],
      color: WAR,
      ...jd(323, 6, 11),
      ...about(
        "A Babylonian astronomical diary: between the evenings of 10 and 11 June 323 BCE (Julian), as Babylon's days began at sunset.",
      ),
      notes:
        "**Alexander** dies at 32 in **Nebuchadnezzar**'s palace in Babylon, which he meant as his capital. His generals divide the empire.",
      sources: [wiki('Death_of_Alexander_the_Great')],
    }),
  ];

  const period = (id, a, b, title, o) =>
    d(id, bce(a), bce(b), title, { tags: ['period'], color: PERIOD, ...o });
  const reign = (id, a, b, title, o) =>
    d(id, bce(a), bce(b), title, { tags: ['reign'], color: REIGN, ...o });
  const durations = [
    period('halaf', 6100, 5100, 'Halaf culture', {
      notes:
        'About 6100–5100 BCE. Farming villages of northern Mesopotamia and Syria known for fine painted pottery and round houses (tholoi).',
      sources: [wiki('Halaf_culture')],
    }),
    period('ubaid', 6500, 3800, 'Ubaid period', {
      notes:
        'About 6500–3800 BCE. The first settlements of the southern plain, with irrigation, temples and towns such as Eridu; its culture spread north after about 5300.',
      sources: [wiki('Ubaid_period')],
    }),
    period('samarra', 5500, 4800, 'Samarra culture', {
      notes: 'About 5500–4800 BCE. Villages of central Mesopotamia that farmed with irrigation.',
      sources: [wiki('Samarra_culture')],
    }),
    period('uruk', 4000, 3100, 'Uruk period', {
      notes:
        'About 4000–3100 BCE. The first cities, monumental temples, the cylinder seal, and at its end, writing. Named after the city of **Uruk**.',
      sources: [wiki('Uruk_period')],
    }),
    period('jemdet-nasr', 3100, 2900, 'Jemdet Nasr period', {
      notes: 'About 3100–2900 BCE. Proto-cuneiform writing spreads beyond Uruk.',
      sources: [wiki('Jemdet_Nasr_period')],
    }),
    period('early-dynastic', 2900, 2350, 'Early Dynastic period', {
      notes: `About 2900–2350 BCE (${MIDDLE.toLowerCase()}). Rival Sumerian city-states such as Uruk, Ur, Kish, Lagash and Umma, each with its own god and ruler.`,
      sources: [wiki('Early_Dynastic_Period_(Mesopotamia)')],
    }),
    period('akkadian-empire', 2334, 2154, 'Akkadian Empire', {
      notes: `About 2334–2154 BCE (${MIDDLE.toLowerCase()}). The first empire to rule Sumer and the north together, founded by Sargon of Akkad; Akkadian becomes the language of government.`,
      sources: [wiki('Akkadian_Empire')],
    }),
    period('gutian', 2154, 2112, 'Gutian period', {
      notes: `About 2154–2112 BCE (${MIDDLE.toLowerCase()}). After Akkad, Gutian kings hold parts of the south while cities such as Lagash and Uruk rule themselves.`,
      sources: [wiki('Gutian_dynasty')],
    }),
    period('ur-iii', 2112, 2004, 'Third Dynasty of Ur', {
      notes: `2112–2004 BCE (${MIDDLE.toLowerCase()}). A Sumerian state run from Ur with standard weights, a calendar and tens of thousands of administrative tablets.`,
      sources: [wiki('Third_Dynasty_of_Ur')],
    }),
    period('isin-larsa', 2025, 1763, 'Isin-Larsa period', {
      notes: `About 2025–1763 BCE (${MIDDLE.toLowerCase()}). Amorite dynasties at Isin and Larsa compete for the south, until Hammurabi takes Larsa.`,
      sources: [wiki('Isin-Larsa_period')],
    }),
    period('old-babylonian', 1894, 1595, 'First Dynasty of Babylon', {
      notes: `1894–1595 BCE (${MIDDLE.toLowerCase()}). Hammurabi's dynasty, the Old Babylonian period, ended by the Hittite sack.`,
      sources: [wiki('First_Babylonian_dynasty'), wiki('Old_Babylonian_period')],
    }),
    period('kassite', 1595, 1155, 'Kassite Babylonia', {
      notes:
        'About 1595–1155 BCE. Kassite kings rule Babylonia for over four centuries, the longest dynasty in its history; the start is uncertain, the end fixed by the Elamite conquest.',
      sources: [wiki('Kassites')],
    }),
    period('middle-assyrian', 1363, 912, 'Middle Assyrian Empire', {
      notes:
        'About 1363–912 BCE, from the accession of **Ashur-uballit I** to the death of Ashur-dan II: Assyria becomes a kingdom and a power.',
      sources: [wiki('Middle_Assyrian_Empire')],
    }),
    period('neo-assyrian', 911, 609, 'Neo-Assyrian Empire', {
      notes:
        '911–609 BCE. From **Adad-nirari II** to the last stand at Harran: the largest empire the world had yet seen, ruling from Egypt to western Iran.',
      sources: [wiki('Neo-Assyrian_Empire')],
    }),
    period('neo-babylonian', 626, 539, 'Neo-Babylonian Empire', {
      notes:
        "626–539 BCE. Nabopolassar's dynasty (often called Chaldean) takes Assyria's place, until Cyrus.",
      sources: [wiki('Neo-Babylonian_Empire')],
    }),
    period('achaemenid', 539, 331, 'Persian (Achaemenid) Babylon', {
      notes: '539–331 BCE. Babylon is a capital of the Persian Empire, from Cyrus to Gaugamela.',
      sources: [wiki('Achaemenid_Empire'), wiki('Babylon')],
    }),
    reign('sargon', 2334, 2279, 'Sargon of Akkad', {
      notes: `About 2334–2279 BCE (${MIDDLE.toLowerCase()}). Rose, as legend has it, from cupbearer of the king of Kish to conqueror of all Sumer.`,
      sources: [wiki('Sargon_of_Akkad')],
    }),
    reign('naram-sin', 2254, 2218, 'Naram-Sin', {
      notes: `About 2254–2218 BCE (${MIDDLE.toLowerCase()}). Sargon's grandson, the first Mesopotamian king to call himself a god and "king of the four quarters".`,
      sources: [wiki('Naram-Sin_of_Akkad')],
    }),
    reign('ur-nammu', 2112, 2095, 'Ur-Nammu', {
      notes: `2112–2095 BCE (${MIDDLE.toLowerCase()}). Founder of the Third Dynasty of Ur.`,
      sources: [wiki('Ur-Nammu')],
    }),
    reign('shulgi', 2094, 2047, 'Shulgi', {
      notes: `2094–2047 BCE (${MIDDLE.toLowerCase()}). Ur-Nammu's son, who organised the state, its roads and scribal schools, and was praised in hymns as a god.`,
      sources: [wiki('Shulgi')],
    }),
    reign('shamshi-adad', 1808, 1776, 'Shamshi-Adad I', {
      notes: `About 1808–1776 BCE (${MIDDLE.toLowerCase()}). An Amorite who built a kingdom across northern Mesopotamia, including Assur.`,
      sources: [wiki('Shamshi-Adad_I')],
    }),
    reign('hammurabi', 1792, 1750, 'Hammurabi', {
      notes: `1792–1750 BCE (${MIDDLE.toLowerCase()}). Sixth king of Babylon's First Dynasty, who united Mesopotamia under Babylon and issued his code.`,
      sources: [wiki('Hammurabi')],
    }),
    reign('tukulti-ninurta', 1243, 1207, 'Tukulti-Ninurta I', {
      notes:
        'About 1243–1207 BCE. Assyrian king who conquered Babylonia; murdered by his own nobles.',
      sources: [wiki('Tukulti-Ninurta_I')],
    }),
    reign('tiglath-pileser-i', 1114, 1076, 'Tiglath-Pileser I', {
      notes: '1114–1076 BCE. Campaigned to the Mediterranean; the Middle Assyrian high point.',
      sources: [wiki('Tiglath-Pileser_I')],
    }),
    reign('ashurnasirpal', 883, 859, 'Ashurnasirpal II', {
      notes: '883–859 BCE. Campaigned yearly to the west, boasted of his cruelty, and built Kalhu.',
      sources: [wiki('Ashurnasirpal_II')],
    }),
    reign('shalmaneser-iii', 859, 824, 'Shalmaneser III', {
      notes: '859–824 BCE. Thirty-five years of campaigns, from Qarqar to the Black Obelisk.',
      sources: [wiki('Shalmaneser_III')],
    }),
    reign('tiglath-pileser-iii', 745, 727, 'Tiglath-Pileser III', {
      notes:
        '745–727 BCE. Remade Assyria into a centralised empire with provinces, a standing army and mass deportations.',
      sources: [wiki('Tiglath-Pileser_III')],
    }),
    reign('sargon-ii', 722, 705, 'Sargon II', {
      notes: '722–705 BCE. Builder of Dur-Sharrukin; killed in battle in Anatolia.',
      sources: [wiki('Sargon_II')],
    }),
    reign('sennacherib', 705, 681, 'Sennacherib', {
      notes: '705–681 BCE. Moved the capital to Nineveh; destroyed Babylon.',
      sources: [wiki('Sennacherib')],
    }),
    reign('esarhaddon', 681, 669, 'Esarhaddon', {
      notes: '681–669 BCE. Rebuilt Babylon and conquered Egypt.',
      sources: [wiki('Esarhaddon')],
    }),
    reign('ashurbanipal', 669, 631, 'Ashurbanipal', {
      notes:
        '669–631 BCE (his death is usually put in 631; some scholars argue later). The last great king of Assyria, and a scholar king.',
      sources: [wiki('Ashurbanipal')],
    }),
    d('brothers-war', bce(652), bce(648), "Shamash-shum-ukin's revolt", {
      tags: ['war'],
      color: WAR,
      notes:
        "652–648 BCE. Ashurbanipal's brother, king of Babylon, rebels; Babylon falls after a two-year siege and he dies, traditionally in a fire.",
      sources: [wiki('Shamash-shum-ukin')],
    }),
    reign('nabopolassar', 626, 605, 'Nabopolassar', {
      notes:
        '626–605 BCE. Founder of the Neo-Babylonian Empire; with the Medes, destroyed Assyria.',
      sources: [wiki('Nabopolassar')],
    }),
    reign('nebuchadnezzar', 605, 562, 'Nebuchadnezzar II', {
      notes:
        "605–562 BCE. The empire's greatest king: conquered Judah and rebuilt Babylon with its walls, gates and temples.",
      sources: [wiki('Nebuchadnezzar_II')],
    }),
    reign('nabonidus', 556, 539, 'Nabonidus', {
      notes:
        '556–539 BCE. The last king of Babylon, devoted to the moon god Sin and to the past; dug in old temple foundations for the inscriptions of earlier kings.',
      sources: [wiki('Nabonidus')],
    }),
    d('tayma', bce(552), bce(543), 'Nabonidus at Tayma', {
      tags: ['reign'],
      color: REIGN,
      notes:
        '552–543 BCE. Nabonidus lives for about ten years at the oasis of Tayma in Arabia, leaving his son **Belshazzar** in Babylon, and the New Year festival lapses.',
      sources: [wiki('Nabonidus'), wiki('Belshazzar')],
    }),
    reign('cyrus', 539, 530, 'Cyrus king of Babylon', {
      notes:
        '539–530 BCE. Cyrus the Great rules Babylon until his death in battle in Central Asia.',
      sources: [wiki('Cyrus_the_Great')],
    }),
    d('alexander', julian(331, 10, 1), julian(323, 6, 11), 'Alexander in Mesopotamia', {
      tags: ['reign'],
      color: REIGN,
      notes: 'From Gaugamela to his death in Babylon: Alexander rules Mesopotamia as king of Asia.',
      sources: [wiki('Alexander_the_Great')],
    }),
  ];
  const relationships = [
    rel('writing', 'sixty'),
    rel('lugalzagesi', 'd:sargon'),
    rel('d:sargon', 'enheduanna'),
    rel('d:naram-sin', 'naram-sin-stele'),
    rel('d:naram-sin', 'naram-sin-found'),
    rel('naram-sin-stele', 'stele-to-susa'),
    rel('d:ur-nammu', 'ur-nammu-code'),
    rel('d:ur-nammu', 'ziggurat-ur'),
    rel('urukagina', 'ur-nammu-code'),
    rel('ur-nammu-code', 'lipit-ishtar'),
    rel('lipit-ishtar', 'eshnunna'),
    rel('eshnunna', 'hammurabi-code'),
    rel('d:hammurabi', 'hammurabi-code'),
    rel('d:hammurabi', 'mari'),
    rel('hammurabi-code', 'stele-to-susa'),
    rel('gilgamesh-king', 'gilgamesh-sumerian'),
    rel('gilgamesh-sumerian', 'gilgamesh-ob'),
    rel('gilgamesh-ob', 'gilgamesh-standard'),
    rel('atrahasis', 'gilgamesh-standard'),
    rel('gilgamesh-standard', 'library'),
    rel('venus-tablet', 'hittite-sack'),
    rel('hittite-sack', 'd:kassite'),
    rel('d:ashurnasirpal', 'kalhu'),
    rel('d:sennacherib', 'lachish'),
    rel('d:sennacherib', 'babylon-destroyed'),
    rel('d:ashurbanipal', 'library'),
    rel('library', 'nineveh-falls'),
    rel('nineveh-falls', 'harran'),
    rel('carchemish', 'd:nebuchadnezzar'),
    rel('d:nebuchadnezzar', 'jerusalem-597'),
    rel('jerusalem-597', 'jerusalem-587'),
    rel('d:nebuchadnezzar', 'ishtar-gate'),
    rel('d:nabonidus', 'naram-sin-found'),
    rel('opis', 'sippar'),
    rel('sippar', 'babylon-falls'),
    rel('babylon-falls', 'cyrus-enters'),
    rel('cyrus-enters', 'cyrus-cylinder'),
    rel('gaugamela', 'alexander-babylon'),
    rel('alexander-babylon', 'alexander-dies'),
    rel('diaries', 'alexander-dies'),
  ];
  return {
    format: 'openchronology',
    version: 1,
    title: 'Ancient Mesopotamia',
    description:
      "From the first farming villages, about 7000 BCE, through Uruk's first cities and writing, Sumer, Akkad, Ur, Hammurabi's Babylon, the Kassites and the Assyrian empires, to Nebuchadnezzar's Babylon and its fall to Cyrus in 539 BCE, with Alexander's death in Babylon in 323 BCE as an epilogue. A sample timeline built from the sources cited on each moment, mostly their Wikipedia articles; not a definitive history.\n\n**How to read it.** Chapter headings mark the eras. Periods, empires and reigns are durations; inventions, writings, laws, cities, buildings and battles are moments, coloured by tag.\n\n**Dates.** Before about 1500 BCE they depend on the chronology: this timeline uses the conventional **middle chronology** (Hammurabi 1792–1750 BCE, the Hittite sack of Babylon 1595 BCE); the high and low chronologies put the same events decades earlier or later. Prehistoric dates are approximate, and each moment's **Date precision** says how its date is known. A moment known only to the year sits at the start of that year. The display is proleptic Gregorian; days known from Babylonian records keep the Julian date historians give beside them (**Original historical date**), about six days later in the sixth century BCE.",
    presentation: {
      mode: 'gregorian',
      unit: '',
      scale: '1/1',
      origin: '0/1',
      version: 1,
      offsetMinutes: 0,
      significantDigits: 6,
    },
    tags: ['history', 'mesopotamia', 'ancient near east', 'education'],
    plugins: [
      ...plugins(
        core.RICH_TEXT_NOTES,
        core.MOMENT_HEADINGS,
        core.MOMENT_COLORS,
        core.MOMENT_SOURCES,
        core.DATING_CONTEXT,
        core.HISTORICAL_DATES,
        core.EXPAND_ON_HOVER,
      ),
      theme(core, {
        textColor: '#1f2a44',
        textFont: 'Georgia, serif',
        measureColor: '#9c3b2a',
        haloColor: '#f3ead7',
        markerColor: '#1f3a5f',
        durationColor: '#9c3b2a',
        backgroundColor: '#f3ead7',
      }),
    ],
    events,
    durations,
    relationships,
  };
}
