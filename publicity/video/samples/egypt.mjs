// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Ancient Egypt, from the Predynastic cultures and Narmer's unification to Cleopatra VII and
// the Roman annexation in 30 BCE: the ancient-history tour's sample (Video 15, Short 12).
// Periods, dynasties and reigns follow one standard chronology, Ian Shaw (ed.), The Oxford
// History of Ancient Egypt (2000); dates before 664 BCE are approximate, and other
// chronologies differ by years to decades (more in the third millennium). Each moment links to
// its Wikipedia article. A date known only to the year sits on 1 January of that year BCE in the
// proleptic Gregorian calendar the editor displays; the few known days are Julian (Roman)
// dates, converted to the same line and kept as given with the Historical dates plugin.
import { m, d, rel, plugins, theme, wiki } from './lib.mjs';

/** Seconds from 1970 to midnight UTC of a Julian Day Number's civil day. */
const fromJdn = (jdn) => `${(BigInt(jdn) - 2440588n) * 86400n}/1`;
/** The astronomical year of a year BCE: 1 BCE is year 0, 30 BCE is −29. */
const astro = (bce) => 1 - bce;
/** 1 January of a year BCE, proleptic Gregorian. */
function bce(year) {
  const y = astro(year) + 4799; // a March-based year: January counts with the year before (month 10)
  const jdn =
    1 +
    Math.floor((153 * 10 + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;
  return fromJdn(jdn);
}
const MONTHS =
  'January February March April May June July August September October November December'.split(
    ' ',
  );
/** A Julian-calendar day of a year BCE, on the line, and its Historical dates annotation. */
function julian(year, month, day) {
  const a = Math.floor((14 - month) / 12);
  const y = astro(year) + 4800 - a;
  const mm = month + 12 * a - 3;
  const jdn = day + Math.floor((153 * mm + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  return {
    time: fromJdn(jdn),
    historicalDate: `${day} ${MONTHS[month - 1]} ${year} BCE`,
    calendar: 'Julian (Roman)',
  };
}
const SHAW = 'https://academic.oup.com/book/47196';
/** Dating context for a year in Shaw's chronology. */
const shaw = (year, more = '') => ({
  datePrecision:
    `About ${year} BCE, in Shaw's chronology (Oxford History of Ancient Egypt, 2000); ` +
    `other chronologies differ.${more ? ' ' + more : ''}`,
});
/** Dating context for a year that is not in doubt. */
const exactYear = (year) => ({ datePrecision: `${year} BCE; the day is not known.` });

const PERIOD = '#1f3a5f',
  DYNASTY = '#6b7f99',
  REIGN = '#b07a2a',
  CLEOPATRA = '#9c3b2a',
  WORKS = '#5f7a52';

/** Cleopatra's death, which ends the Ptolemaic period, and Alexander's. */
const END = julian(30, 8, 12).time,
  ALEXANDER_DIES = julian(323, 6, 11).time;

export function egypt(core) {
  const h = (id, year, title) =>
    m(id, bce(year), title, { headingLevel: 'h2', tags: ['chapter'], ...shaw(year) });
  /** A moment in a year BCE. */
  const y = (id, year, title, o) => m(id, bce(year), title, o);
  /** A moment on a Julian day BCE. */
  const day = (id, [year, month, dd], title, o) => {
    const { time, ...dated } = julian(year, month, dd);
    return m(id, time, title, { ...dated, ...o });
  };
  const events = [
    h('h-predynastic', 4400, 'Predynastic Egypt'),
    y('hierakonpolis', 3500, 'Painted tomb at Hierakonpolis', {
      tags: ['monument'],
      notes:
        '**Tomb 100** at **Hierakonpolis**, the oldest known painted tomb in Egypt, shows boats, hunters and a figure subduing captives: themes of kingship long before there were kings of all Egypt.',
      ...shaw(3500, 'Naqada II.'),
      sources: [wiki('Hierakonpolis')],
    }),
    y('u-j', 3250, 'Tomb U-j: the earliest writing', {
      tags: ['writing'],
      notes:
        'Small bone and ivory labels from **tomb U-j** at **Abydos** carry some of the oldest known signs of Egyptian writing, recording places and goods.',
      datePrecision: 'About 3250 BCE (Naqada IIIA), from radiocarbon dates; c. 3320–3150 BCE.',
      sources: [wiki('Umm_El_Qa%27ab'), wiki('Egyptian_hieroglyphs')],
    }),
    h('h-early', 3000, 'Early Dynastic Period'),
    y('unification', 3000, 'Unification under Narmer', {
      tags: ['ruler', 'war'],
      notes:
        '**Narmer** is the first king known to have ruled both Upper and Lower Egypt, and is usually counted the founder of the **1st Dynasty**. Later tradition credits a king **Menes** with the union.',
      ...shaw(3000, 'Many works put Narmer nearer 3100 BCE.'),
      sources: [wiki('Narmer'), SHAW],
    }),
    y('narmer-palette', 3000, 'Narmer Palette', {
      tags: ['writing', 'monument'],
      notes:
        'A carved siltstone palette from **Hierakonpolis** showing **Narmer** wearing the crown of Upper Egypt on one side and of Lower Egypt on the other, his name written in early hieroglyphs. Now in the **Egyptian Museum, Cairo**.',
      ...shaw(3000),
      sources: [wiki('Narmer_Palette')],
    }),
    y('memphis', 2990, 'Memphis founded', {
      tags: ['monument'],
      notes:
        '**Memphis**, at the meeting of the Nile valley and the Delta, became the capital of the united kingdom. Herodotus credits its founding to **Menes**.',
      ...shaw(3000, 'Early in the 1st Dynasty; placed just after the unification.'),
      sources: [wiki('Memphis,_Egypt')],
    }),
    h('h-old', 2686, 'Old Kingdom'),
    y('step-pyramid', 2667, 'Step Pyramid of Djoser', {
      tags: ['monument'],
      notes:
        "At **Saqqara**, **Djoser**'s official **Imhotep** is credited with the first monumental building in stone: six stacked mastabas, the earliest Egyptian pyramid.",
      ...shaw(2667, "Built during Djoser's reign (2667–2648 BCE); placed at its start."),
      sources: [wiki('Pyramid_of_Djoser'), wiki('Imhotep')],
    }),
    y('dahshur', 2600, "Sneferu's pyramids at Dahshur", {
      tags: ['monument'],
      notes:
        '**Sneferu** builds the **Bent Pyramid**, whose slope changes halfway up, and then the **Red Pyramid**, the first successful smooth-sided pyramid.',
      ...shaw(2600, "During Sneferu's reign (2613–2589 BCE)."),
      sources: [wiki('Bent_Pyramid'), wiki('Red_Pyramid')],
    }),
    y('merer', 2567, 'Diary of Merer', {
      tags: ['writing', 'monument'],
      notes:
        'Papyri found at **Wadi al-Jarf** on the Red Sea, the oldest inscribed papyri known, include the logbook of an official named **Merer** whose crew shipped limestone from Tura to **Giza** for the Great Pyramid.',
      datePrecision:
        "Dated to about Khufu's 27th year: later than his reign ends in Shaw's chronology (2589–2566 BCE), a sign of how uncertain reign lengths are. Placed near the end of the reign.",
      sources: [wiki('Diary_of_Merer')],
    }),
    y('great-pyramid', 2566, 'Great Pyramid of Giza', {
      tags: ['monument'],
      notes:
        "**Khufu**'s pyramid at **Giza**, about 146 m high when finished, the largest of the pyramids and the oldest of the Seven Wonders of the Ancient World.",
      ...shaw(2566, "Finished by the end of Khufu's reign; often given as c. 2560 BCE."),
      sources: [wiki('Great_Pyramid_of_Giza')],
    }),
    y('sphinx', 2550, 'Great Sphinx of Giza', {
      tags: ['monument'],
      notes:
        "A lion with a king's head carved from the bedrock beside the causeway of **Khafra**'s pyramid, and usually attributed to him.",
      ...shaw(2550, "During Khafra's reign (2558–2532 BCE), on the usual attribution."),
      sources: [wiki('Great_Sphinx_of_Giza')],
    }),
    y('palermo-stone', 2450, 'Palermo Stone', {
      tags: ['writing'],
      notes:
        'Fragments of a royal annal carved in the **5th Dynasty**, listing kings from before the 1st Dynasty to **Neferirkara**, with events and the Nile flood year by year: one of the oldest sources for the order of the kings.',
      ...shaw(2450, 'Carved in the 5th Dynasty (2494–2345 BCE).'),
      sources: [wiki('Palermo_Stone')],
    }),
    y('pyramid-texts', 2350, 'Pyramid Texts', {
      tags: ['writing', 'monument'],
      notes:
        "Spells to help the king join the gods, carved on the walls of **Unas**'s pyramid at **Saqqara**: the oldest religious texts known from Egypt.",
      ...shaw(2350, "During Unas's reign (2375–2345 BCE)."),
      sources: [wiki('Pyramid_Texts')],
    }),
    y('harkhuf', 2277, "Harkhuf's letter from the boy king", {
      tags: ['writing', 'diplomacy'],
      notes:
        'The expedition leader **Harkhuf** had carved in his tomb at **Aswan** a letter from the young **Pepi II**, eager to see a dancer Harkhuf was bringing back from the land of **Yam**.',
      ...shaw(2277, "In Pepi II's second year."),
      sources: [wiki('Harkhuf')],
    }),
    y('drought', 2200, 'The 4.2-kiloyear drought', {
      tags: ['science'],
      notes:
        'A severe, centuries-long drying across North Africa and western Asia, with low Nile floods, often linked to the end of central rule at the close of the **Old Kingdom**.',
      datePrecision:
        'About 2200 BCE (4,200 years before 2000 CE); a climatic event dated by geology.',
      sources: [wiki('4.2-kiloyear_event')],
    }),
    h('h-first-intermediate', 2160, 'First Intermediate Period'),
    y('coffin-texts', 2100, 'Coffin Texts', {
      tags: ['writing'],
      notes:
        'Spells descended from the **Pyramid Texts**, now painted inside the coffins of officials and their families, not only kings.',
      ...shaw(2100, 'In use from the First Intermediate Period into the Middle Kingdom.'),
      sources: [wiki('Coffin_Texts')],
    }),
    y('reunification', 2025, 'Thebes reunites Egypt', {
      tags: ['war', 'ruler'],
      notes:
        '**Mentuhotep II** of **Thebes** defeats the rival kings of **Herakleopolis** and rules the whole country again.',
      ...shaw(
        2025,
        "The end of the Herakleopolitan dynasties in Shaw's dates; Mentuhotep II reigned 2055–2004 BCE.",
      ),
      sources: [wiki('Mentuhotep_II')],
    }),
    h('h-middle', 2055, 'Middle Kingdom'),
    y('itjtawy', 1985, 'Itjtawy, the new capital', {
      tags: ['monument', 'ruler'],
      notes:
        '**Amenemhat I**, founder of the **12th Dynasty**, moves the royal residence north to **Itjtawy**, near the Faiyum.',
      ...shaw(1985, 'Early in his reign (1985–1956 BCE).'),
      sources: [wiki('Itjtawy')],
    }),
    y('sinuhe', 1950, 'The Story of Sinuhe', {
      tags: ['writing'],
      notes:
        'A courtier flees Egypt when **Amenemhat I** dies, makes a life in Syria-Palestine, and is welcomed home in old age by **Senusret I**: the most admired work of Middle Egyptian literature.',
      ...shaw(
        1950,
        'Written in the 12th Dynasty, probably early in Senusret I’s reign (1956–1911 BCE).',
      ),
      sources: [wiki('Story_of_Sinuhe')],
    }),
    y('karnak', 1945, 'Karnak: the temple of Amun', {
      tags: ['monument'],
      notes:
        '**Senusret I** builds at **Karnak**, in Thebes; later kings, above all in the New Kingdom, enlarge it into the largest temple complex of ancient Egypt.',
      ...shaw(1945, "Senusret I's buildings are the oldest standing there."),
      sources: [wiki('Karnak')],
    }),
    y('semna', 1855, 'Semna boundary stela', {
      tags: ['war', 'writing'],
      notes:
        '**Senusret III**, after his campaigns in Nubia, sets a stela at the fortress of **Semna** marking the southern frontier and urging his successors to hold it.',
      ...shaw(1855, "In Senusret III's 16th year."),
      sources: [wiki('Senusret_III')],
    }),
    h('h-second-intermediate', 1650, 'Second Intermediate Period'),
    y('hyksos', 1650, 'The Hyksos rule from Avaris', {
      tags: ['ruler', 'war'],
      notes:
        'Kings of western Asian origin, the **Hyksos** ("rulers of foreign lands"), govern the north from **Avaris** in the eastern Delta as the **15th Dynasty**, while Theban kings hold the south.',
      ...shaw(1650),
      sources: [wiki('Hyksos')],
    }),
    y('edwin-smith', 1600, 'Edwin Smith Papyrus', {
      tags: ['writing', 'science'],
      notes:
        'A surgical treatise: 48 cases of wounds and fractures, each examined, diagnosed and treated in order. A copy of an older text.',
      datePrecision: 'About 1600 BCE, from its script; a copy of a text perhaps centuries older.',
      sources: [wiki('Edwin_Smith_Papyrus')],
    }),
    y('seqenenre', 1560, 'Seqenenra Taa killed', {
      tags: ['war', 'ruler'],
      notes:
        "The Theban king **Seqenenra Taa**'s mummy shows the axe and dagger wounds that killed him, probably in battle against the **Hyksos**.",
      ...shaw(1560),
      sources: [wiki('Seqenenre_Tao')],
    }),
    y('kamose', 1555, 'Kamose attacks the Hyksos', {
      tags: ['war', 'writing'],
      notes:
        '**Kamose**, last king of the **17th Dynasty**, sails north against **Apepi** and records the campaign on two stelae at **Karnak**.',
      ...shaw(1555, 'Kamose reigned 1555–1550 BCE.'),
      sources: [wiki('Kamose')],
    }),
    y('rhind', 1550, 'Rhind Mathematical Papyrus', {
      tags: ['writing', 'science'],
      notes:
        "Copied by the scribe **Ahmose** in the 33rd year of the Hyksos king **Apepi** from a text of **Amenemhat III**'s time: fractions, areas, volumes and the slopes of pyramids, in worked problems.",
      ...shaw(1550, 'Apepi reigned about 1555 BCE in Shaw; his 33rd year is uncertain.'),
      sources: [wiki('Rhind_Mathematical_Papyrus')],
    }),
    h('h-new', 1550, 'New Kingdom'),
    y('avaris', 1530, 'Ahmose takes Avaris', {
      tags: ['war', 'ruler'],
      notes:
        '**Ahmose I** captures the Hyksos capital, drives the Hyksos out of Egypt and founds the **18th Dynasty**, which goes on to build an empire in Nubia and the Levant.',
      ...shaw(1530, 'By his 18th or 19th year; Ahmose I reigned 1550–1525 BCE.'),
      sources: [wiki('Ahmose_I'), wiki('Avaris')],
    }),
    y('ebers', 1517, 'Ebers Papyrus', {
      tags: ['writing', 'science'],
      notes:
        'About 700 remedies and spells for illnesses of the body and the heart, one of the oldest and longest medical texts known.',
      ...shaw(1517, 'A note on it names year 9 of Amenhotep I; often given as c. 1550 BCE.'),
      sources: [wiki('Ebers_Papyrus')],
    }),
    y('valley-of-kings', 1500, 'The Valley of the Kings', {
      tags: ['monument'],
      notes:
        "Kings are now buried in rock-cut tombs in a valley on the west bank at **Thebes**, from **Thutmose I** on; the workmen's village at **Deir el-Medina** is founded for those who cut them.",
      ...shaw(1500, 'Thutmose I reigned 1504–1492 BCE.'),
      sources: [wiki('Valley_of_the_Kings')],
    }),
    y('punt', 1471, 'Expedition to Punt', {
      tags: ['diplomacy', 'monument'],
      notes:
        "**Hatshepsut**'s ships sail down the Red Sea to the land of **Punt** and return with incense trees, ebony and gold; the voyage is carved on her temple at **Deir el-Bahari**.",
      ...shaw(1471, 'In her 9th year, counted from the accession of Thutmose III.'),
      sources: [wiki('Land_of_Punt'), wiki('Mortuary_Temple_of_Hatshepsut')],
    }),
    y('megiddo', 1457, 'Battle of Megiddo', {
      tags: ['war'],
      notes:
        '**Thutmose III** defeats a coalition of Canaanite rulers led by the king of **Kadesh** and takes **Megiddo** after a seven-month siege; his annals at Karnak record the campaign in detail.',
      ...shaw(1457, "In Thutmose III's 23rd year."),
      sources: [wiki('Battle_of_Megiddo_(15th_century_BC)')],
    }),
    y('hatshepsut-erased', 1435, "Hatshepsut's images erased", {
      tags: ['monument', 'ruler'],
      notes:
        "Late in **Thutmose III**'s reign, **Hatshepsut**'s images and names are cut from her monuments and she is left out of later king lists.",
      ...shaw(1435, 'About twenty years after her death; the date is approximate.'),
      sources: [wiki('Hatshepsut')],
    }),
    y('luxor', 1380, 'Luxor Temple', {
      tags: ['monument'],
      notes:
        '**Amenhotep III** builds most of the temple at **Luxor**, linked to Karnak by an avenue of sphinxes; Ramesses II later adds its pylon and obelisks.',
      ...shaw(1380, "During Amenhotep III's reign (1390–1352 BCE)."),
      sources: [wiki('Luxor_Temple')],
    }),
    y('colossi', 1360, 'Colossi of Memnon', {
      tags: ['monument'],
      notes:
        'Two seated statues of **Amenhotep III**, about 18 m high, that stood before his vast mortuary temple on the west bank at **Thebes**.',
      ...shaw(1360, "During Amenhotep III's reign (1390–1352 BCE)."),
      sources: [wiki('Colossi_of_Memnon')],
    }),
    y('amarna', 1348, 'Akhetaten (Amarna) founded', {
      tags: ['monument', 'ruler'],
      notes:
        '**Akhenaten** founds a new capital, **Akhetaten**, on an empty site in Middle Egypt, devoted to the sun disc, the **Aten**; it is abandoned soon after his death.',
      ...shaw(1348, 'Its boundary stelae date to his 5th year.'),
      sources: [wiki('Amarna')],
    }),
    y('nefertiti', 1345, 'Bust of Nefertiti', {
      tags: ['monument'],
      notes:
        "A painted limestone bust of **Nefertiti**, Akhenaten's queen, found in 1912 in the workshop of the sculptor **Thutmose** at Amarna. Now in the **Neues Museum, Berlin**.",
      ...shaw(1345),
      sources: [wiki('Nefertiti_Bust')],
    }),
    y('kv62', 1327, 'Tutankhamun buried', {
      tags: ['monument', 'ruler'],
      notes:
        '**Tutankhamun** dies at about nineteen and is buried in a small tomb in the Valley of the Kings, **KV62**, which robbers barely touched; **Howard Carter** found it nearly intact in 1922.',
      ...shaw(1327),
      sources: [wiki('KV62'), wiki('Tutankhamun')],
    }),
    y('abydos-list', 1290, 'Abydos King List', {
      tags: ['writing', 'monument'],
      notes:
        "In his temple at **Abydos**, **Seti I** and the young **Ramesses** honour 76 kings by name, from **Narmer**'s successor **Menes** to Seti, leaving out Hatshepsut, the Amarna kings and the Hyksos.",
      ...shaw(1290, "During Seti I's reign (1294–1279 BCE)."),
      sources: [wiki('Abydos_King_List')],
    }),
    y('kadesh', 1274, 'Battle of Kadesh', {
      tags: ['war'],
      notes:
        '**Ramesses II** fights the Hittite king **Muwatalli II** at **Kadesh** on the Orontes, perhaps the largest chariot battle ever fought. Neither side wins outright, though Ramesses has it carved on his temples as a triumph.',
      ...shaw(1274, "In Ramesses II's 5th year; 1274 BCE is the usual date."),
      sources: [wiki('Battle_of_Kadesh')],
    }),
    y('treaty', 1259, 'Egyptian–Hittite peace treaty', {
      tags: ['diplomacy', 'writing'],
      notes:
        '**Ramesses II** and **Hattusili III** agree to peace and mutual defence. Both versions survive: in hieroglyphs at **Karnak** and on clay tablets in Akkadian from the Hittite capital **Hattusa**, the oldest known peace treaty whose text both sides kept.',
      ...shaw(1259, "In Ramesses II's 21st year."),
      sources: [wiki('Egyptian–Hittite_peace_treaty')],
    }),
    y('merneptah-stele', 1208, 'Merneptah Stele', {
      tags: ['writing', 'war'],
      notes:
        "**Merenptah**'s victory hymn over the Libyans and in Canaan includes the oldest known mention of **Israel**, as a people.",
      ...shaw(1208, "In Merenptah's 5th year."),
      sources: [wiki('Merneptah_Stele')],
    }),
    y('sea-peoples', 1177, 'The Sea Peoples defeated', {
      tags: ['war'],
      notes:
        '**Ramesses III** defeats a confederation of seaborne invaders, the **Sea Peoples**, in the Nile Delta; reliefs at **Medinet Habu** show the battle, as the Bronze Age world collapses around Egypt.',
      ...shaw(1177, "In Ramesses III's 8th year; often given as c. 1175 BCE."),
      sources: [wiki('Battle_of_the_Delta'), wiki('Sea_Peoples')],
    }),
    y('strike', 1156, 'The first recorded strike', {
      tags: ['writing'],
      notes:
        'The tomb builders of **Deir el-Medina** stop work and sit in protest outside the temples because their grain rations are late, recorded in the **Turin Strike Papyrus**.',
      ...shaw(1156, "In Ramesses III's 29th year; c. 1158 BCE in some works."),
      sources: [wiki('Deir_el-Medina_strikes')],
    }),
    y('harem', 1153, 'The harem conspiracy', {
      tags: ['ruler', 'writing'],
      notes:
        'A plot within the royal household against **Ramesses III**, whose trial records survive; CT scans of his mummy show his throat was cut.',
      ...shaw(1153),
      sources: [wiki('Harem_conspiracy')],
    }),
    y('tomb-robbery', 1111, 'Tomb robbery trials', {
      tags: ['writing'],
      notes:
        'Papyri record investigations and trials of thieves who robbed royal and private tombs at Thebes under **Ramesses IX**.',
      ...shaw(1111, "In Ramesses IX's 16th year."),
      sources: [wiki('Abbott_Papyrus')],
    }),
    y('wenamun', 1075, 'The Story of Wenamun', {
      tags: ['writing', 'diplomacy'],
      notes:
        "A tale of a Theban priest sent to **Byblos** to buy cedar, who is robbed, refused and mocked on the way, showing how little Egypt's name now counted abroad.",
      ...shaw(1075, 'Set in year 5 of the "Renaissance" under Ramesses XI; written soon after.'),
      sources: [wiki('Story_of_Wenamun')],
    }),
    h('h-third-intermediate', 1069, 'Third Intermediate Period'),
    y('sheshonq-campaign', 925, "Sheshonq I's campaign", {
      tags: ['war', 'writing'],
      notes:
        'The Libyan king **Sheshonq I** campaigns in Judah and Israel and lists the towns he took on the **Bubastite Portal** at Karnak; he is usually identified with the biblical **Shishak**.',
      ...shaw(925),
      sources: [wiki('Shoshenq_I')],
    }),
    y('piye-conquest', 728, 'Piye conquers Egypt', {
      tags: ['war', 'ruler', 'writing'],
      notes:
        "The Kushite king **Piye** sails north from Nubia, takes **Memphis**, receives the submission of the Delta's rulers, and records it all on his **Victory Stela** at Gebel Barkal.",
      ...shaw(728, "In Piye's 20th year."),
      sources: [wiki('Piye')],
    }),
    y('shabaka-stone', 710, 'Shabaka Stone', {
      tags: ['writing'],
      notes:
        '**Shabaqo** has a worm-eaten old text copied onto stone at Memphis: the **Memphite Theology**, in which the god **Ptah** creates the world by thought and speech.',
      ...shaw(710, "During Shabaqo's reign (716–702 BCE)."),
      sources: [wiki('Shabaka_Stone')],
    }),
    y('memphis-assyria', 671, 'Assyria takes Memphis', {
      tags: ['war'],
      notes:
        'The Assyrian king **Esarhaddon** invades Egypt, drives out **Taharqo** and takes **Memphis**.',
      ...exactYear(671),
      sources: [wiki('Assyrian_conquest_of_Egypt')],
    }),
    h('h-late', 664, 'Late Period'),
    y('thebes-sacked', 663, 'Assyria sacks Thebes', {
      tags: ['war'],
      notes:
        "**Ashurbanipal**'s army sacks **Thebes** after Taharqo's successor **Tantamani** tries to win Egypt back, ending Kushite rule in Egypt.",
      datePrecision: '663 BCE; some put it in 664.',
      sources: [wiki('Assyrian_conquest_of_Egypt'), wiki('Tantamani')],
    }),
    y('psamtek-reunites', 656, 'Psamtek I reunites Egypt', {
      tags: ['ruler', 'diplomacy'],
      notes:
        "**Psamtek I** of **Sais**, once an Assyrian vassal, brings Thebes under his rule by having his daughter **Nitocris** adopted as God's Wife of Amun.",
      ...exactYear(656),
      sources: [wiki('Psamtik_I'), wiki('Nitocris_I')],
    }),
    y('carchemish', 605, 'Battle of Carchemish', {
      tags: ['war'],
      notes:
        "**Nebuchadnezzar II** of Babylon defeats **Necho II** and his Assyrian allies at **Carchemish**, ending Egypt's hold on Syria.",
      ...exactYear(605),
      sources: [wiki('Battle_of_Carchemish')],
    }),
    y('pelusium', 525, 'Battle of Pelusium', {
      tags: ['war'],
      notes:
        'The Persian king **Cambyses II** defeats **Psamtek III** at **Pelusium** and makes Egypt a province of the **Achaemenid Empire**.',
      ...exactYear(525),
      sources: [wiki('Battle_of_Pelusium_(525_BC)')],
    }),
    y('herodotus', 450, 'Herodotus visits Egypt', {
      tags: ['writing'],
      notes:
        'The Greek historian **Herodotus** travels in Egypt and gives it the second book of his **Histories**: its people, customs, pyramids and kings, as priests and guides told him.',
      datePrecision: 'About 450 BCE; the year of his visit is not known.',
      sources: [wiki('Herodotus'), 'https://www.perseus.tufts.edu/hopper/text?doc=Hdt.+2'],
    }),
    y('independence', 404, 'Egypt independent again', {
      tags: ['war', 'ruler'],
      notes:
        '**Amyrtaeus** of Sais leads a revolt that frees Egypt from Persian rule for some sixty years.',
      ...exactYear(404),
      sources: [wiki('Amyrtaeus')],
    }),
    y('second-persian', 343, 'Persia reconquers Egypt', {
      tags: ['war'],
      notes:
        '**Artaxerxes III** defeats **Nectanebo II**, the last native Egyptian to rule as pharaoh for more than two thousand years.',
      ...exactYear(343),
      sources: [wiki('Nectanebo_II'), wiki('Thirty-first_Dynasty_of_Egypt')],
    }),
    h('h-ptolemaic', 332, 'Ptolemaic Egypt'),
    y('alexander-arrives', 332, 'Alexander takes Egypt', {
      tags: ['war', 'ruler'],
      notes:
        '**Alexander the Great** enters Egypt late in 332 BCE; the Persian satrap surrenders it without a fight.',
      ...exactYear(332),
      sources: [wiki('Alexander_the_Great')],
    }),
    y('alexandria', 331, 'Alexandria founded', {
      tags: ['monument', 'ruler'],
      notes:
        'Alexander founds **Alexandria** on the coast west of the Canopic branch of the Nile; it becomes the capital of the Ptolemies and the largest city of the Greek world.',
      ...exactYear(331),
      sources: [wiki('Alexandria')],
    }),
    y('siwa', 331, 'The oracle at Siwa', {
      tags: ['ruler'],
      notes:
        "Alexander crosses the desert to the oracle of **Amun** at the **Siwa** oasis, where he is said to have been greeted as the god's son.",
      ...exactYear(331),
      sources: [wiki('Siwa_Oasis')],
    }),
    day('alexander-dies', [323, 6, 11], 'Alexander dies in Babylon', {
      tags: ['ruler'],
      notes:
        'Alexander dies in **Babylon** at 32. His general **Ptolemy**, son of Lagos, takes Egypt as its satrap.',
      datePrecision: '10 or 11 June 323 BCE (Julian), from a Babylonian astronomical diary.',
      sources: [wiki('Death_of_Alexander_the_Great')],
    }),
    y('alexander-body', 321, "Alexander's body taken to Egypt", {
      tags: ['ruler', 'monument'],
      notes:
        "**Ptolemy** seizes Alexander's funeral procession on its way to Macedon and brings the body to Egypt; it is later entombed in **Alexandria**.",
      ...exactYear(321),
      sources: [wiki('Tomb_of_Alexander_the_Great')],
    }),
    y('ptolemy-king', 305, 'Ptolemy I takes the title of king', {
      tags: ['ruler'],
      notes:
        '**Ptolemy I Soter** declares himself king, founding the dynasty that rules Egypt until **Cleopatra VII**.',
      datePrecision: '305 BCE, or early 304.',
      sources: [wiki('Ptolemy_I_Soter')],
    }),
    y('library', 285, 'The Library of Alexandria', {
      tags: ['science', 'monument'],
      notes:
        'The **Mouseion** and its great **Library**, founded under **Ptolemy I** or **Ptolemy II**, gather books and scholars from across the Greek world.',
      datePrecision: 'Early 3rd century BCE; the founding year is not known.',
      sources: [wiki('Library_of_Alexandria')],
    }),
    y('manetho', 280, "Manetho's history of Egypt", {
      tags: ['writing'],
      notes:
        'The Egyptian priest **Manetho** writes the **Aegyptiaca**, a history of Egypt in Greek. It is lost, but excerpts survive, and his division of the kings into thirty dynasties is the one Egyptologists still use.',
      datePrecision: 'About 280 BCE, under Ptolemy II (285–246 BCE); the year is not known.',
      sources: [wiki('Manetho'), wiki('Aegyptiaca')],
    }),
    y('pharos', 280, 'Lighthouse of Alexandria', {
      tags: ['monument', 'science'],
      notes:
        'The **Pharos**, a lighthouse perhaps over 100 m high on an island at the harbour mouth of Alexandria, one of the Seven Wonders of the Ancient World.',
      datePrecision: 'Completed about 280 BCE, under Ptolemy II; the year is not certain.',
      sources: [wiki('Lighthouse_of_Alexandria')],
    }),
    y('eratosthenes', 240, 'Eratosthenes measures the Earth', {
      tags: ['science'],
      notes:
        "**Eratosthenes**, head of the Library, estimates the Earth's circumference from the angle of the noon sun at Alexandria and at **Syene** (Aswan).",
      datePrecision: 'About 240 BCE; the year is not known.',
      sources: [wiki('Eratosthenes')],
    }),
    y('canopus', 238, 'Canopus Decree', {
      tags: ['writing'],
      notes:
        'A council of priests honours **Ptolemy III** in a decree carved in hieroglyphs, demotic and Greek. It also proposes adding a leap day every four years to the Egyptian calendar.',
      ...exactYear(238),
      sources: [wiki('Canopus_Decree')],
    }),
    y('edfu', 237, 'Temple of Edfu begun', {
      tags: ['monument'],
      notes:
        'Work begins under **Ptolemy III** on the temple of **Horus** at **Edfu**, finished in 57 BCE: the best preserved temple in Egypt.',
      ...exactYear(237),
      sources: [wiki('Temple_of_Edfu')],
    }),
    y('raphia', 217, 'Battle of Raphia', {
      tags: ['war'],
      notes:
        '**Ptolemy IV** defeats the Seleucid king **Antiochus III** at **Raphia**, near Gaza, with Egyptian troops trained as a phalanx for the first time.',
      datePrecision: '217 BCE; a day in June is often given.',
      sources: [wiki('Battle_of_Raphia')],
    }),
    day('rosetta', [196, 3, 27], 'The Rosetta Stone', {
      tags: ['writing'],
      notes:
        'A council of priests at **Memphis** issues a decree honouring the young **Ptolemy V**, carved in hieroglyphs, demotic and Greek. A copy found at **Rosetta** in 1799 let **Champollion** decipher hieroglyphs in 1822.',
      datePrecision: 'The decree is dated to a day: 27 March 196 BCE (Julian).',
      sources: [wiki('Rosetta_Stone')],
    }),
    y('eleusis', 168, 'The Day of Eleusis', {
      tags: ['diplomacy', 'war'],
      notes:
        'Near Alexandria, the Roman envoy **Popillius Laenas** draws a circle in the sand around **Antiochus IV** and orders him to answer before stepping out of it. He withdraws from Egypt.',
      ...exactYear(168),
      sources: [wiki('Sixth_Syrian_War')],
    }),
    y('cleopatra-born', 69, 'Cleopatra VII born', {
      tags: ['ruler'],
      notes:
        '**Cleopatra VII**, daughter of **Ptolemy XII**, is born in Alexandria. She is said to be the first of her dynasty to speak Egyptian.',
      datePrecision: 'Early 69 BCE.',
      sources: [wiki('Cleopatra')],
    }),
    y('cleopatra-queen', 51, 'Cleopatra becomes queen', {
      tags: ['ruler'],
      notes:
        "On **Ptolemy XII**'s death, **Cleopatra VII**, 18, comes to the throne with her brother **Ptolemy XIII**, about ten.",
      ...exactYear(51),
      sources: [wiki('Cleopatra')],
    }),
    y('pompey', 48, 'Pompey killed in Egypt', {
      tags: ['war', 'diplomacy'],
      notes:
        'Beaten by **Julius Caesar** at Pharsalus, **Pompey** flees to Egypt and is murdered on landing by the courtiers of **Ptolemy XIII**. Caesar arrives in Alexandria days later.',
      datePrecision:
        "48 BCE. The day (28 September) is in the Roman calendar before Caesar's reform, which had drifted far from the seasons.",
      sources: [wiki('Pompey')],
    }),
    y('caesarion', 47, 'Caesarion born', {
      tags: ['ruler'],
      notes:
        "**Ptolemy XV Caesarion**, Cleopatra's son, whom she says is **Julius Caesar**'s, is born.",
      ...exactYear(47),
      sources: [wiki('Caesarion')],
    }),
    day('caesar-dies', [44, 3, 15], 'Caesar assassinated', {
      tags: ['ruler', 'war'],
      notes:
        '**Julius Caesar** is killed in Rome on the Ides of March. Cleopatra, then in Rome, returns to Egypt.',
      datePrecision: 'The Ides of March, 44 BCE.',
      sources: [wiki('Assassination_of_Julius_Caesar')],
    }),
    y('tarsus', 41, 'Cleopatra meets Antony at Tarsus', {
      tags: ['diplomacy'],
      notes:
        'Summoned by **Mark Antony**, Cleopatra sails to **Tarsus** in a gilded barge, and their alliance begins.',
      ...exactYear(41),
      sources: [wiki('Mark_Antony')],
    }),
    y('donations', 34, 'Donations of Alexandria', {
      tags: ['diplomacy', 'ruler'],
      notes:
        'At a ceremony in Alexandria, **Antony** gives eastern lands to Cleopatra and her children, a step that turns Rome against him.',
      ...exactYear(34),
      sources: [wiki('Donations_of_Alexandria')],
    }),
    day('actium', [31, 9, 2], 'Battle of Actium', {
      tags: ['war'],
      notes:
        "**Octavian**'s fleet under **Agrippa** defeats Antony and Cleopatra off **Actium** in western Greece; they flee to Egypt.",
      datePrecision: '2 September 31 BCE, as the Roman calendar gave it.',
      sources: [wiki('Battle_of_Actium')],
    }),
    day('alexandria-falls', [30, 8, 1], 'Octavian takes Alexandria', {
      tags: ['war'],
      notes:
        "Antony's fleet and cavalry desert to **Octavian**, who enters **Alexandria**; **Antony** takes his own life.",
      datePrecision: 'Rome marked 1 August as the day Alexandria was taken.',
      sources: [wiki('Final_war_of_the_Roman_Republic'), wiki('Mark_Antony')],
    }),
    day('cleopatra-dies', [30, 8, 12], 'Death of Cleopatra', {
      tags: ['ruler'],
      notes:
        "**Cleopatra VII**, 39, the last ruler of the Ptolemaic dynasty, takes her own life rather than be paraded in Octavian's triumph, by tradition by the bite of an asp.",
      datePrecision:
        '10 or 12 August 30 BCE: scholars disagree, and no record gives the day. 12 August is used here.',
      sources: [wiki('Death_of_Cleopatra')],
    }),
    day('province', [30, 8, 31], 'Egypt a Roman province', {
      tags: ['ruler', 'war'],
      notes:
        '**Octavian**, the future **Augustus**, annexes Egypt as the province of **Aegyptus**, governed by a prefect answerable to him alone; **Cornelius Gallus** is the first.',
      datePrecision: '30 BCE; placed at the end of August, after Cleopatra’s death.',
      sources: [wiki('Egypt_(Roman_province)')],
    }),
  ];

  /** A duration in Shaw's years BCE (or ending at a given time), with his book among its sources. */
  const span = (id, from, to, title, color, o = {}) =>
    d(id, bce(from), typeof to === 'string' ? to : bce(to), title, {
      color,
      ...o,
      sources: [...(o.sources ?? []), SHAW],
    });
  const period = (id, from, to, title, notes, article) =>
    span(id, from, to, title, PERIOD, { tags: ['period'], notes, sources: [wiki(article)] });
  const ORD = [
    '',
    'First',
    'Second',
    'Third',
    'Fourth',
    'Fifth',
    'Sixth',
    'Seventh',
    'Eighth',
    'Ninth',
    'Tenth',
    'Eleventh',
    'Twelfth',
    'Thirteenth',
    'Fourteenth',
    'Fifteenth',
    'Sixteenth',
    'Seventeenth',
    'Eighteenth',
    'Nineteenth',
    'Twentieth',
    'Twenty-first',
    'Twenty-second',
    'Twenty-third',
    'Twenty-fourth',
    'Twenty-fifth',
    'Twenty-sixth',
    'Twenty-seventh',
    'Twenty-eighth',
    'Twenty-ninth',
    'Thirtieth',
    'Thirty-first',
  ];
  const nth = (n) =>
    `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
  const dynasty = (
    n,
    from,
    to,
    notes,
    title = `${nth(n)} Dynasty`,
    articles = [`${ORD[n]}_Dynasty_of_Egypt`],
  ) =>
    span(`dyn-${n}`, from, to, title, DYNASTY, {
      tags: ['dynasty'],
      notes,
      sources: articles.map(wiki),
    });
  const reign = (id, from, to, title, notes, article, color = REIGN) =>
    span(id, from, to, title, color, { tags: ['ruler'], notes, sources: [wiki(article)] });

  const durations = [
    period(
      'predynastic',
      4400,
      3000,
      'Predynastic Period',
      'Farming cultures along the Nile, from the **Badarian** to the **Naqada** cultures, grow into rival kingdoms and the first kings.',
      'Prehistoric_Egypt',
    ),
    period(
      'early-dynastic',
      3000,
      2686,
      'Early Dynastic Period',
      'The 1st and 2nd Dynasties: the united kingdom, its capital at **Memphis**, writing and the royal tombs at **Abydos**.',
      'Early_Dynastic_Period_(Egypt)',
    ),
    period(
      'old-kingdom',
      2686,
      2160,
      'Old Kingdom',
      'The 3rd to 8th Dynasties, the age of the pyramids, ruled from **Memphis**.',
      'Old_Kingdom_of_Egypt',
    ),
    period(
      'first-intermediate',
      2160,
      2055,
      'First Intermediate Period',
      'Central rule breaks down; rival kings rule from **Herakleopolis** and **Thebes**.',
      'First_Intermediate_Period',
    ),
    period(
      'middle-kingdom',
      2055,
      1650,
      'Middle Kingdom',
      'Egypt reunited under the 11th and 12th Dynasties: the classic age of its literature, and forts in Nubia.',
      'Middle_Kingdom_of_Egypt',
    ),
    period(
      'second-intermediate',
      1650,
      1550,
      'Second Intermediate Period',
      'The **Hyksos** rule the north from Avaris while Theban kings hold the south.',
      'Second_Intermediate_Period_of_Egypt',
    ),
    period(
      'new-kingdom',
      1550,
      1069,
      'New Kingdom',
      'The 18th to 20th Dynasties: an empire from Nubia to Syria, temples at **Karnak** and **Luxor**, tombs in the **Valley of the Kings**.',
      'New_Kingdom_of_Egypt',
    ),
    period(
      'third-intermediate',
      1069,
      664,
      'Third Intermediate Period',
      'Egypt divided between the high priests at Thebes and kings in the Delta, many of Libyan descent, until the Kushites unite it.',
      'Third_Intermediate_Period_of_Egypt',
    ),
    period(
      'late',
      664,
      332,
      'Late Period',
      'Saite kings restore Egypt; then two spells of Persian rule around a last native dynasty.',
      'Late_Period_of_ancient_Egypt',
    ),
    period(
      'ptolemaic',
      332,
      END,
      'Ptolemaic Period',
      'Alexander and then the Macedonian **Ptolemies** rule from **Alexandria**, as pharaohs to Egyptians and as Greek kings to Greeks.',
      'Ptolemaic_Kingdom',
    ),

    span('badarian', 4400, 4000, 'Badarian culture', DYNASTY, {
      tags: ['period'],
      notes:
        'The earliest farming culture of Upper Egypt, known from its cemeteries and fine pottery.',
      sources: [wiki('Badarian_culture')],
    }),
    span('naqada-i', 4000, 3500, 'Naqada I', DYNASTY, {
      tags: ['period'],
      notes:
        'Also called the **Amratian** culture: villages along Upper Egypt, painted pottery and stone palettes.',
      sources: [wiki('Naqada_culture')],
    }),
    span('naqada-ii', 3500, 3200, 'Naqada II', DYNASTY, {
      tags: ['period'],
      notes:
        'Also called the **Gerzean** culture: towns, trade with the Near East, and growing differences between rich and poor graves.',
      sources: [wiki('Naqada_culture')],
    }),
    span('naqada-iii', 3200, 3000, 'Naqada III ("Dynasty 0")', DYNASTY, {
      tags: ['period'],
      notes: 'The first kings, buried at **Abydos**, and the first writing.',
      sources: [wiki('Naqada_III')],
    }),

    dynasty(1, 3000, 2890, 'From **Narmer** and **Aha**; kings buried at **Abydos**.'),
    dynasty(
      2,
      2890,
      2686,
      'Ends with **Khasekhemwy**, after a time of rivalry between Horus and Seth kings.',
    ),
    dynasty(3, 2686, 2613, "**Djoser**'s dynasty, and the first pyramids."),
    dynasty(
      4,
      2613,
      2494,
      '**Sneferu**, **Khufu**, **Khafra** and **Menkaura**: the pyramids of Dahshur and Giza.',
    ),
    dynasty(
      5,
      2494,
      2345,
      'Sun temples at Abusir, and the **Pyramid Texts** under its last king, **Unas**.',
    ),
    dynasty(
      6,
      2345,
      2181,
      "**Teti**, **Pepi I** and **Pepi II**, whose long reign ends the Old Kingdom's strength.",
    ),
    dynasty(7, 2181, 2160, 'Short-lived kings at Memphis, little known.', '7th–8th Dynasties', [
      'Seventh_Dynasty_of_Egypt',
      'Eighth_Dynasty_of_Egypt',
    ]),
    dynasty(
      9,
      2160,
      2025,
      'Kings ruling from **Herakleopolis** in the north.',
      '9th–10th Dynasties',
      ['Ninth_Dynasty_of_Egypt', 'Tenth_Dynasty_of_Egypt'],
    ),
    dynasty(
      11,
      2125,
      1985,
      'Theban kings, first in the south only, then from **Mentuhotep II** of all Egypt.',
    ),
    dynasty(
      12,
      1985,
      1773,
      'From **Amenemhat I** to **Sobekneferu**: the height of the Middle Kingdom.',
    ),
    dynasty(
      13,
      1773,
      1650,
      'Many short reigns from Itjtawy and later Thebes; Shaw ends it "after 1650".',
    ),
    dynasty(14, 1773, 1650, 'Rulers in the eastern Delta, of Canaanite descent.'),
    dynasty(15, 1650, 1550, 'The **Hyksos** kings at Avaris, among them **Khyan** and **Apepi**.'),
    dynasty(16, 1650, 1580, 'Theban kings, as Shaw counts them.'),
    dynasty(17, 1580, 1550, 'Theban kings who fight the Hyksos: **Seqenenra Taa** and **Kamose**.'),
    dynasty(
      18,
      1550,
      1295,
      'From **Ahmose I** to **Horemheb**: Hatshepsut, Thutmose III, Akhenaten and Tutankhamun.',
    ),
    dynasty(
      19,
      1295,
      1186,
      'The first Ramesside dynasty: **Seti I**, **Ramesses II** and **Merenptah**.',
    ),
    dynasty(20, 1186, 1069, '**Ramesses III** to **Ramesses XI**, as the New Kingdom declines.'),
    dynasty(
      21,
      1069,
      945,
      'Kings at **Tanis** in the Delta, while high priests of Amun rule the south from Thebes.',
    ),
    dynasty(22, 945, 715, 'Libyan kings from **Bubastis**, beginning with **Sheshonq I**.'),
    dynasty(23, 818, 715, 'Rival Libyan kings, ruling at the same time as the 22nd.'),
    dynasty(24, 727, 715, '**Tefnakht** and **Bakenranef** of **Sais**.'),
    dynasty(25, 747, 656, 'The kings of **Kush**, from Nubia, who rule Egypt from about 728 BCE.'),
    dynasty(26, 664, 525, 'The **Saite** kings: Psamtek I, Necho II, Apries, Amasis.'),
    dynasty(27, 525, 404, 'The first Persian period: Achaemenid kings rule Egypt as a province.'),
    dynasty(28, 404, 399, '**Amyrtaeus**, its only king.'),
    dynasty(29, 399, 380, 'Kings from **Mendes**.'),
    dynasty(30, 380, 343, 'The last native dynasty: **Nectanebo I** and **Nectanebo II**.'),
    dynasty(31, 343, 332, 'The second Persian period, until Alexander.', '2nd Persian Period'),
    span('macedonian', 332, 305, 'Macedonian Dynasty', DYNASTY, {
      tags: ['dynasty'],
      notes:
        '**Alexander the Great**, then his half-brother **Philip III** and son **Alexander IV**.',
      sources: [wiki('Argead_dynasty')],
    }),
    span('ptolemaic-dynasty', 305, END, 'Ptolemaic Dynasty', DYNASTY, {
      tags: ['dynasty'],
      notes: 'From **Ptolemy I Soter** to **Cleopatra VII**.',
      sources: [wiki('Ptolemaic_dynasty')],
    }),

    reign('djoser', 2667, 2648, 'Djoser', 'Builder of the Step Pyramid at Saqqara.', 'Djoser'),
    reign(
      'sneferu',
      2613,
      2589,
      'Sneferu',
      'Builder of three pyramids at Meidum and Dahshur, more stone than any other king.',
      'Sneferu',
    ),
    reign(
      'khufu',
      2589,
      2566,
      'Khufu',
      'Builder of the Great Pyramid; Greek writers call him **Cheops**.',
      'Khufu',
    ),
    reign(
      'khafra',
      2558,
      2532,
      'Khafra',
      'Builder of the second pyramid at Giza, and usually credited with the Sphinx.',
      'Khafra',
    ),
    reign(
      'menkaura',
      2532,
      2503,
      'Menkaura',
      'Builder of the third, smallest of the three Giza pyramids.',
      'Menkaure',
    ),
    reign(
      'unas',
      2375,
      2345,
      'Unas',
      'Last king of the 5th Dynasty, the first to have the Pyramid Texts carved in his tomb.',
      'Unas',
    ),
    reign(
      'pepi-ii',
      2278,
      2184,
      'Pepi II',
      'Came to the throne as a child; tradition gives him one of the longest reigns in history, though scholars doubt its length.',
      'Pepi_II_Neferkare',
    ),
    reign(
      'mentuhotep-ii',
      2055,
      2004,
      'Mentuhotep II',
      'The Theban king who reunited Egypt and began the Middle Kingdom.',
      'Mentuhotep_II',
    ),
    reign(
      'amenemhat-i',
      1985,
      1956,
      'Amenemhat I',
      'Founder of the 12th Dynasty, perhaps murdered in a palace plot.',
      'Amenemhat_I',
    ),
    reign(
      'senusret-i',
      1956,
      1911,
      'Senusret I',
      'Builder at Karnak and Heliopolis, and the king of the Story of Sinuhe.',
      'Senusret_I',
    ),
    reign(
      'senusret-iii',
      1870,
      1831,
      'Senusret III',
      'Conqueror in Nubia, remembered for his careworn portraits.',
      'Senusret_III',
    ),
    reign(
      'amenemhat-iii',
      1831,
      1786,
      'Amenemhat III',
      'Developed the Faiyum; his pyramid temple at Hawara was the "Labyrinth" Greek visitors admired.',
      'Amenemhat_III',
    ),
    reign(
      'sobekneferu',
      1777,
      1773,
      'Sobekneferu',
      'The first woman known for certain to have ruled Egypt as king.',
      'Sobekneferu',
    ),
    reign(
      'ahmose-i',
      1550,
      1525,
      'Ahmose I',
      'Expelled the Hyksos and founded the 18th Dynasty.',
      'Ahmose_I',
    ),
    reign(
      'thutmose-iii',
      1479,
      1425,
      'Thutmose III',
      'Came to the throne as a child; after Hatshepsut, led some seventeen campaigns and made Egypt an empire.',
      'Thutmose_III',
    ),
    reign(
      'hatshepsut',
      1473,
      1458,
      'Hatshepsut',
      'Regent for her stepson Thutmose III, then king herself; builder of the temple at Deir el-Bahari.',
      'Hatshepsut',
    ),
    reign(
      'amenhotep-iii',
      1390,
      1352,
      'Amenhotep III',
      'A long, rich and peaceful reign; builder at Luxor and of the Colossi of Memnon.',
      'Amenhotep_III',
    ),
    reign(
      'akhenaten',
      1352,
      1336,
      'Akhenaten',
      'Crowned as Amenhotep IV; made the Aten the centre of worship and moved the court to Amarna.',
      'Akhenaten',
    ),
    reign(
      'tutankhamun',
      1336,
      1327,
      'Tutankhamun',
      'A boy king who restored the old gods and left Amarna; famous for his tomb.',
      'Tutankhamun',
    ),
    reign(
      'seti-i',
      1294,
      1279,
      'Seti I',
      'Campaigned in the Levant; his temple at Abydos holds the King List.',
      'Seti_I',
    ),
    reign(
      'ramesses-ii',
      1279,
      1213,
      'Ramesses II',
      'Reigned 66 years: Kadesh, the Hittite treaty, Abu Simbel and the Ramesseum.',
      'Ramesses_II',
    ),
    reign(
      'merenptah',
      1213,
      1203,
      'Merenptah',
      "Ramesses II's thirteenth son and successor; fought off Libyans and the Sea Peoples.",
      'Merneptah',
    ),
    reign(
      'ramesses-iii',
      1184,
      1153,
      'Ramesses III',
      'The last great king of the New Kingdom; defeated the Sea Peoples.',
      'Ramesses_III',
    ),
    reign(
      'sheshonq-i',
      945,
      924,
      'Sheshonq I',
      'Founder of the 22nd Dynasty, of Libyan descent.',
      'Shoshenq_I',
    ),
    reign('piye', 747, 716, 'Piye', 'Kushite king who conquered Egypt.', 'Piye'),
    reign(
      'taharqo',
      690,
      664,
      'Taharqo',
      'Kushite king of Egypt and Nubia, driven out of Egypt by the Assyrians.',
      'Taharqa',
    ),
    reign(
      'psamtek-i',
      664,
      610,
      'Psamtek I',
      'Founder of the 26th Dynasty; reunited Egypt and ended Assyrian overlordship.',
      'Psamtik_I',
    ),
    reign(
      'nectanebo-ii',
      360,
      343,
      'Nectanebo II',
      'The last native king of ancient Egypt.',
      'Nectanebo_II',
    ),
    reign(
      'alexander',
      332,
      ALEXANDER_DIES,
      'Alexander the Great',
      'King of Macedon and conqueror of the Persian Empire, ruling Egypt from 332 BCE to his death.',
      'Alexander_the_Great',
    ),
    reign(
      'ptolemy-i',
      305,
      285,
      'Ptolemy I Soter',
      "Alexander's general, satrap from 323 and king from 305 BCE.",
      'Ptolemy_I_Soter',
    ),
    reign(
      'ptolemy-ii',
      285,
      246,
      'Ptolemy II Philadelphus',
      'Patron of the Library and the Pharos; under him Manetho writes.',
      'Ptolemy_II_Philadelphus',
    ),
    reign(
      'ptolemy-v',
      205,
      180,
      'Ptolemy V Epiphanes',
      'King as a child; the Rosetta Stone decree honours him.',
      'Ptolemy_V_Epiphanes',
    ),
    reign(
      'cleopatra-vii',
      51,
      END,
      'Cleopatra VII',
      'The last active ruler of Ptolemaic Egypt, allied in turn with **Julius Caesar** and **Mark Antony**.',
      'Cleopatra',
      CLEOPATRA,
    ),

    d('amarna-letters', bce(1360), bce(1332), 'Amarna letters', {
      color: WORKS,
      tags: ['diplomacy', 'writing'],
      notes:
        'About 350 clay tablets, mostly in Akkadian, from the royal archive at Amarna: letters between the pharaohs and the kings of Babylon, Assyria, Mitanni and the Hittites, and their vassals in Canaan.',
      sources: [wiki('Amarna_letters')],
    }),
    d('abu-simbel', bce(1264), bce(1244), 'Abu Simbel built', {
      color: WORKS,
      tags: ['monument'],
      notes:
        "**Ramesses II**'s two temples cut into the cliffs in Nubia, with four colossal seated statues of him; moved uphill in the 1960s ahead of the Aswan High Dam's lake.",
      sources: [wiki('Abu_Simbel')],
    }),
  ];
  // The Alexandrian war, from Caesar's arrival in 48 to the Battle of the Nile early in 47 BCE:
  // its days are Roman pre-reform dates, so it is drawn over the two whole years.
  durations.push(
    d('alexandrian-war', bce(48), bce(46), 'Alexandrian war', {
      color: CLEOPATRA,
      tags: ['war'],
      notes:
        "**Julius Caesar**, besieged in Alexandria, takes Cleopatra's side against **Ptolemy XIII**, who drowns after the Battle of the Nile; part of the city, and some of its books, burn. Shown as the years 48–47 BCE.",
      sources: [wiki('Siege_of_Alexandria_(47_BC)')],
    }),
  );

  const relationships = [
    rel('u-j', 'narmer-palette'),
    rel('unification', 'narmer-palette'),
    rel('unification', 'memphis'),
    rel('d:djoser', 'step-pyramid'),
    rel('step-pyramid', 'dahshur'),
    rel('dahshur', 'great-pyramid'),
    rel('d:sneferu', 'dahshur'),
    rel('d:khufu', 'great-pyramid'),
    rel('great-pyramid', 'merer'),
    rel('d:khafra', 'sphinx'),
    rel('d:unas', 'pyramid-texts'),
    rel('pyramid-texts', 'coffin-texts'),
    rel('d:pepi-ii', 'harkhuf'),
    rel('drought', 'd:first-intermediate'),
    rel('d:mentuhotep-ii', 'reunification'),
    rel('d:amenemhat-i', 'itjtawy'),
    rel('d:senusret-i', 'sinuhe'),
    rel('d:senusret-i', 'karnak'),
    rel('d:senusret-iii', 'semna'),
    rel('d:amenemhat-iii', 'rhind'),
    rel('hyksos', 'seqenenre'),
    rel('seqenenre', 'kamose'),
    rel('kamose', 'avaris'),
    rel('d:ahmose-i', 'avaris'),
    rel('d:hatshepsut', 'punt'),
    rel('d:hatshepsut', 'hatshepsut-erased'),
    rel('d:thutmose-iii', 'megiddo'),
    rel('d:amenhotep-iii', 'colossi'),
    rel('d:amenhotep-iii', 'luxor'),
    rel('d:akhenaten', 'amarna'),
    rel('amarna', 'nefertiti'),
    rel('amarna', 'd:amarna-letters'),
    rel('d:tutankhamun', 'kv62'),
    rel('d:seti-i', 'abydos-list'),
    rel('d:ramesses-ii', 'kadesh'),
    rel('kadesh', 'treaty'),
    rel('d:ramesses-ii', 'd:abu-simbel'),
    rel('d:merenptah', 'merneptah-stele'),
    rel('d:ramesses-iii', 'sea-peoples'),
    rel('d:ramesses-iii', 'strike'),
    rel('d:ramesses-iii', 'harem'),
    rel('d:sheshonq-i', 'sheshonq-campaign'),
    rel('d:piye', 'piye-conquest'),
    rel('memphis-assyria', 'thebes-sacked'),
    rel('thebes-sacked', 'psamtek-reunites'),
    rel('alexander-arrives', 'alexandria'),
    rel('alexander-arrives', 'siwa'),
    rel('alexander-dies', 'alexander-body'),
    rel('canopus', 'rosetta'),
    rel('d:ptolemy-v', 'rosetta'),
    rel('pompey', 'd:alexandrian-war'),
    rel('d:alexandrian-war', 'caesarion'),
    rel('tarsus', 'donations'),
    rel('donations', 'actium'),
    rel('actium', 'alexandria-falls'),
    rel('alexandria-falls', 'cleopatra-dies'),
    rel('cleopatra-dies', 'province'),
  ];
  return {
    format: 'openchronology',
    version: 1,
    title: 'Ancient Egypt: from Narmer to Cleopatra',
    description:
      "Ancient Egypt from its Predynastic cultures and its unification under Narmer to the death of Cleopatra VII and the Roman annexation in 30 BCE: its periods, dynasties and major reigns, its monuments, battles and treaties, and the writings we know it from. A sample timeline built from the sources cited on each moment.\n\n**How to read it.** Chapter headings mark the periods. Periods, dynasties and reigns are bands (navy, grey and ochre); everything else is a moment, linked to the Wikipedia article it draws on. Related things (a king and his monument, a battle and the treaty after it) are linked.\n\n**Dates.** Periods, dynasties and reigns follow one standard chronology, Ian Shaw (ed.), *The Oxford History of Ancient Egypt* (2000). Before 664 BCE every date is approximate, and other chronologies differ by years to decades; each moment's **Date precision** says how it is dated. A date known only to its year is placed on 1 January of that year. The few dates known to the day are Roman (Julian) dates, kept as given under **Historical dates**; the timeline's Gregorian display shows the same days a few dates earlier, as the two calendars differ by that much in antiquity.",
    presentation: {
      mode: 'gregorian',
      unit: '',
      scale: '1/1',
      origin: '0/1',
      version: 1,
      offsetMinutes: 0,
      significantDigits: 6,
    },
    tags: ['history', 'ancient egypt', 'antiquity', 'education'],
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
