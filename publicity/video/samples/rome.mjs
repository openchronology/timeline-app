// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Ancient Rome, from the legendary founding in 753 BCE through the kings, the Republic and the
// Empire to the deposition of Romulus Augustulus in 476 CE, with the Eastern Empire to the fall of
// Constantinople in 1453 as an epilogue: the Roman tour's sample (Video 19, Short 16).
// The line is the proleptic Gregorian calendar the editor displays. Years before about 300 BCE
// are the traditional Varronian ones, and the kings' dates are legend. Days before 45 BCE are
// dates in the pre-Julian Roman calendar, which had drifted from the seasons; their Julian
// equivalent is mostly unknown, so they are placed as if they were Julian dates. Days from 45 BCE
// on are Julian, converted to the line. Either way the source's own date is kept with the
// Historical dates plugin. A date known only to its year sits at mid-year (1 July).
import { m, d, rel, plugins, theme, wiki } from './lib.mjs';

/** Seconds from 1970 to midnight UTC of a Julian Day Number's civil day. */
const fromJdn = (jdn) => `${(BigInt(jdn) - 2440588n) * 86400n}/1`;
/** The astronomical year of a year given as negative for BCE: 1 BCE (−1) is year 0. */
const astro = (y) => (y < 0 ? y + 1 : y);
/** "44 BCE" or "79 CE". */
const label = (y) => (y < 0 ? `${-y} BCE` : `${y} CE`);
/** The Julian Day Number of a Julian-calendar date. */
function julianJdn(y, month, day) {
  const a = Math.floor((14 - month) / 12);
  const yy = astro(y) + 4800 - a;
  const mm = month + 12 * a - 3;
  return day + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - 32083;
}
/** The Julian Day Number of a proleptic Gregorian date. */
function gregorianJdn(y, month, day) {
  const a = Math.floor((14 - month) / 12);
  const yy = astro(y) + 4800 - a;
  const mm = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045
  );
}
const MONTHS =
  'January February March April May June July August September October November December'.split(
    ' ',
  );
/** 1 January of a year (proleptic Gregorian), for chapter headings and year-long bands. */
const jan = (y) => fromJdn(gregorianJdn(y, 1, 1));
/** Mid-year (1 July, proleptic Gregorian) of a year, plus `shift` days. */
const mid = (y, shift = 0) => fromJdn(gregorianJdn(y, 7, 1) + shift);
/** A Julian-calendar day on the line. */
const jt = (y, month, day) => fromJdn(julianJdn(y, month, day));

const ERA = '#1f3a5f',
  KING = '#8a96a8',
  DYNASTY = '#6b7f99',
  REIGN = '#b07a2a',
  WAR = '#9c3b2a',
  POLITICS = '#5f7a52',
  EAST = '#5b4a7a';

const LIVY = 'https://www.gutenberg.org/ebooks/19725';
const VARRO =
  'Traditional (Varronian) date; the early chronology was reconstructed by Roman antiquarians centuries later and may be off by years.';

export function rome(core) {
  const h = (id, y, title) =>
    m(id, jan(y), title, {
      headingLevel: 'h2',
      tags: ['chapter'],
      datePrecision: `Chapter heading, placed at the start of ${label(y)}.`,
    });
  /** A moment known to its year. `o.shift` moves it a few days from mid-year (said in `o.more`). */
  const yr = (id, y, title, o) => {
    const { shift = 0, more, dp, ...rest } = o;
    return m(id, mid(y, shift), title, {
      datePrecision:
        dp ?? `Known to the year (${label(y)}); placed at mid-year.${more ? ' ' + more : ''}`,
      ...rest,
    });
  };
  /** A moment on a Julian-calendar day (45 BCE on), kept as given with Historical dates. */
  const jd = (id, [y, month, day], title, o) => {
    const { hist, more, dp, lead, ...rest } = o;
    const historicalDate = hist ?? `${day} ${MONTHS[month - 1]} ${label(y)}`;
    const gap = julianJdn(y, month, day) - gregorianJdn(y, month, day);
    const shown =
      gap === 0
        ? 'In this century the Julian and Gregorian calendars agree, so the line shows the same day.'
        : `The timeline's Gregorian line shows it ${Math.abs(gap)} day${Math.abs(gap) === 1 ? '' : 's'} ${gap < 0 ? 'earlier' : 'later'}.`;
    const drift =
      y >= -45 && astro(y) < -7
        ? ' Until 8 BCE the pontiffs misapplied the leap years, so the true day may differ from the proleptic Julian date by up to three days.'
        : '';
    return m(id, jt(y, month, day), title, {
      historicalDate,
      calendar: 'Julian',
      datePrecision:
        dp ??
        `${lead ?? `${historicalDate}, Julian calendar.`} ${shown}${drift}${more ? ' ' + more : ''}`,
      ...rest,
    });
  };
  /** A moment on a day of the pre-Julian Roman calendar, placed as if it were a Julian date. */
  const rd = (id, [y, month, day], title, o) => {
    const { hist, more, dp, ...rest } = o;
    const historicalDate = hist ?? `${day} ${MONTHS[month - 1]} ${label(y)}`;
    return m(id, jt(y, month, day), title, {
      historicalDate,
      calendar: 'Roman (pre-Julian Republican)',
      datePrecision:
        dp ??
        `${historicalDate} in the pre-Julian Roman calendar, which had drifted from the seasons; its Julian equivalent is uncertain, so it is placed as if it were a Julian date.${more ? ' ' + more : ''}`,
      ...rest,
    });
  };

  const events = [
    // ——— The kings ———
    h('h-kings', -753, 'The kings'),
    rd('founding', [-753, 4, 21], 'Founding of Rome', {
      tags: ['legend', 'ruler'],
      hist: '21 April 753 BCE (the Parilia)',
      notes:
        "In legend, **Romulus** founds the city on the **Palatine Hill** after killing his twin **Remus**. The year 753 BCE is the antiquarian **Varro**'s reckoning, and 21 April, the festival of the Parilia, was celebrated as Rome's birthday.",
      dp: 'Legendary. 753 BCE is the Varronian date (other ancient writers gave 748 or 728 BCE); 21 April is the traditional day, placed as if it were a Julian date.',
      sources: [wiki('Founding_of_Rome'), wiki('Romulus_and_Remus')],
    }),
    yr('palatine-huts', -750, 'Iron Age huts on the Palatine', {
      tags: ['building'],
      shift: 30,
      notes:
        "Archaeologists have found postholes of **Iron Age huts** on the Palatine and burials in the valley below, showing villages on Rome's hills by the 8th century BCE, whatever the truth of the legend.",
      dp: 'Archaeological: the 8th century BCE, around the traditional founding; placed at 750 BCE.',
      sources: [wiki('Palatine_Hill'), wiki('Founding_of_Rome')],
    }),
    yr('cloaca', -600, 'Cloaca Maxima', {
      tags: ['building', 'legend'],
      notes:
        'The **Great Drain**, credited by tradition to **Tarquinius Priscus**, drained the valley that became the **Forum**. Rebuilt many times, part of it still carries water to the Tiber.',
      dp: 'About 600 BCE, by tradition; the dating is approximate.',
      sources: [wiki('Cloaca_Maxima')],
    }),
    yr('lapis-niger', -560, 'Lapis Niger inscription', {
      tags: ['writing'],
      notes:
        'A stone post under the black paving of the **Forum** carries one of the oldest known inscriptions in **Latin**, a sacred law that mentions a king (*rex*).',
      dp: 'About 570–550 BCE, from the letter forms; placed at 560 BCE.',
      sources: [wiki('Lapis_Niger')],
    }),
    yr('tarquin-expelled', -509, 'The last king expelled', {
      tags: ['legend', 'politics'],
      notes:
        'After his son **Sextus Tarquinius** rapes **Lucretia**, **Lucius Junius Brutus** leads the Romans to drive out **Tarquinius Superbus**. Rome swears never again to have a king.',
      dp: `${VARRO} Placed at mid-year.`,
      sources: [wiki('Overthrow_of_the_Roman_monarchy'), LIVY],
    }),

    // ——— The early Republic ———
    h('h-republic', -509, 'The early Republic'),
    yr('first-consuls', -509, 'The first consuls', {
      tags: ['politics', 'legend'],
      shift: 5,
      notes:
        "Two magistrates elected for one year, the **consuls**, take the king's power: by tradition **Brutus** and **Collatinus**, Lucretia's husband. The yearly pair of consuls names Roman years for a thousand years.",
      dp: `${VARRO} Placed five days after the expulsion so the two can be told apart.`,
      sources: [wiki('Roman_consul'), wiki('Roman_Republic')],
    }),
    rd('jupiter-temple', [-509, 9, 13], 'Temple of Jupiter on the Capitol', {
      tags: ['building', 'religion'],
      notes:
        "The great temple of **Jupiter Optimus Maximus**, begun under the kings, is dedicated in the Republic's first year, by tradition on the Ides of September.",
      more: VARRO,
      sources: [wiki('Temple_of_Jupiter_Optimus_Maximus')],
    }),
    yr('regillus', -496, 'Battle of Lake Regillus', {
      tags: ['war', 'legend'],
      notes:
        'Rome defeats the **Latin League**, which had backed the exiled Tarquins; legend says **Castor and Pollux** fought for Rome.',
      more: VARRO,
      sources: [wiki('Battle_of_Lake_Regillus')],
    }),
    yr('secession', -494, 'First secession of the plebs', {
      tags: ['politics'],
      notes:
        'The **plebeians** walk out of the city to the Sacred Mount and refuse to fight until they win officers of their own, the **tribunes of the plebs**.',
      more: VARRO,
      sources: [wiki('Secessio_plebis'), wiki('Tribune_of_the_plebs')],
    }),
    yr('twelve-tables', -450, 'The Twelve Tables', {
      tags: ['law'],
      notes:
        "A board of ten, the **decemviri**, writes Rome's laws down for the first time and posts them in the Forum on twelve tablets: the foundation of **Roman law**, learned by heart by schoolboys for centuries.",
      dp: 'Drafted in 451–450 BCE (Varronian dates); placed at 450 BCE. The text survives only in later quotations.',
      sources: [wiki('Twelve_Tables'), 'https://avalon.law.yale.edu/ancient/twelve_tables.asp'],
    }),
    yr('canuleia', -445, 'Lex Canuleia', {
      tags: ['law'],
      notes:
        "A tribune's law lets **patricians and plebeians marry**, which one of the Twelve Tables had forbidden.",
      more: VARRO,
      sources: [wiki('Lex_Canuleia')],
    }),
    yr('veii', -396, 'Veii captured', {
      tags: ['war'],
      notes:
        "**Marcus Furius Camillus** takes the Etruscan city of **Veii**, Rome's neighbour and rival, after a long siege, doubling Rome's territory.",
      more: VARRO,
      sources: [wiki('Battle_of_Veii')],
    }),
    rd('allia', [-390, 7, 18], 'Gauls sack Rome', {
      tags: ['war'],
      notes:
        'Gauls under **Brennus** rout the Romans at the **Allia** and sack the city; only the Capitol holds out. The day of the defeat stayed an unlucky day in the Roman calendar.',
      more: "The year is Varronian; Polybius's reckoning gives 387 or 386 BCE.",
      sources: [wiki('Battle_of_the_Allia'), wiki('Sack_of_Rome_(390_BC)')],
    }),
    yr('servian-wall', -378, 'Servian Wall', {
      tags: ['building'],
      notes:
        'After the Gallic sack Rome rings its hills with a wall of tufa blocks about 11 km long. It is named after the king **Servius Tullius**, but the surviving wall dates from the 4th century BCE.',
      dp: 'Begun about 378 BCE (Livy); placed at mid-year.',
      sources: [wiki('Servian_Wall')],
    }),
    yr('licinian', -367, 'Licinian–Sextian laws', {
      tags: ['law', 'politics'],
      notes:
        'The tribunes **Licinius** and **Sextius** carry laws opening the consulship to plebeians; **Lucius Sextius** becomes the first plebeian consul the next year.',
      more: VARRO,
      sources: [wiki('Licinio-Sextian_rogations')],
    }),
    yr('caudine', -321, 'Caudine Forks', {
      tags: ['war'],
      notes:
        'In the **Second Samnite War** a Roman army is trapped in a mountain pass and made to pass under a yoke of spears, a famous humiliation.',
      more: VARRO,
      sources: [wiki('Battle_of_the_Caudine_Forks')],
    }),
    yr('via-appia', -312, 'Via Appia begun', {
      tags: ['building'],
      notes:
        'The censor **Appius Claudius Caecus** builds the first great Roman road, south to Capua; it was later carried on to **Brundisium**. Long stretches of its paving survive.',
      more: 'The aqueduct of the same year is placed ten days later so the two can be told apart.',
      sources: [wiki('Appian_Way')],
    }),
    yr('aqua-appia', -312, 'Aqua Appia', {
      tags: ['building'],
      shift: 10,
      notes:
        "The same censor builds Rome's **first aqueduct**, about 16 km long and almost all underground.",
      more: 'Placed ten days after the Via Appia.',
      sources: [wiki('Aqua_Appia')],
    }),
    yr('sentinum', -295, 'Battle of Sentinum', {
      tags: ['war'],
      notes:
        'Rome defeats Samnites and Gauls together in the largest battle yet fought in Italy, deciding the **Third Samnite War**.',
      sources: [wiki('Battle_of_Sentinum')],
    }),
    yr('hortensia', -287, 'Lex Hortensia', {
      tags: ['law', 'politics'],
      notes:
        'After a last secession, the dictator **Quintus Hortensius** makes resolutions of the plebeian assembly binding on all Romans: usually taken as the end of the **Conflict of the Orders**.',
      sources: [wiki('Lex_Hortensia')],
    }),
    yr('asculum', -279, 'Battle of Asculum', {
      tags: ['war'],
      notes:
        'King **Pyrrhus** of Epirus beats the Romans a second time, at such a cost that a victory too dear to win is still called a **Pyrrhic victory**.',
      sources: [wiki('Battle_of_Asculum')],
    }),
    yr('beneventum', -275, 'Battle of Beneventum', {
      tags: ['war'],
      notes:
        'Pyrrhus is checked and leaves Italy; within a few years Rome controls the peninsula south of the Po.',
      sources: [wiki('Battle_of_Beneventum_(275_BC)')],
    }),

    // ——— Rome against Carthage ———
    h('h-carthage', -264, 'Rome against Carthage'),
    yr('mylae', -260, 'Battle of Mylae', {
      tags: ['war'],
      notes:
        "Rome's new fleet, using the **corvus**, a boarding bridge, wins its first great sea battle against Carthage under **Gaius Duilius**.",
      sources: [wiki('Battle_of_Mylae')],
    }),
    rd('aegates', [-241, 3, 10], 'Battle of the Aegates', {
      tags: ['war'],
      notes:
        "A Roman fleet destroys Carthage's off western Sicily and ends the **First Punic War**; Sicily becomes Rome's first overseas territory.",
      sources: [wiki('Battle_of_the_Aegates')],
    }),
    yr('andronicus', -240, 'The first Latin play', {
      tags: ['writing'],
      notes:
        '**Livius Andronicus**, a Greek from Tarentum, stages a play translated from Greek at the Roman Games: the traditional beginning of **Latin literature**.',
      sources: [wiki('Livius_Andronicus'), wiki('Latin_literature')],
    }),
    yr('via-flaminia', -220, 'Via Flaminia', {
      tags: ['building'],
      notes:
        '**Gaius Flaminius** builds the great road north across the Apennines to the Adriatic.',
      sources: [wiki('Via_Flaminia')],
    }),
    yr('saguntum', -219, 'Hannibal takes Saguntum', {
      tags: ['war'],
      notes:
        '**Hannibal** besieges and takes **Saguntum** in Spain, a city friendly to Rome: the cause of the **Second Punic War**.',
      sources: [wiki('Siege_of_Saguntum')],
    }),
    yr('alps', -218, 'Hannibal crosses the Alps', {
      tags: ['war'],
      shift: 100,
      notes:
        'Hannibal leads his army, with its **war elephants**, from Spain over the Alps into Italy, losing much of it to cold and the mountain tribes.',
      dp: 'Autumn of 218 BCE; placed in October. The route is still debated.',
      sources: [wiki("Hannibal's_crossing_of_the_Alps")],
    }),
    rd('trasimene', [-217, 6, 21], 'Battle of Lake Trasimene', {
      tags: ['war'],
      notes:
        'Hannibal ambushes a Roman army in the morning mist by the lake and kills the consul **Flaminius**. Rome names **Fabius Maximus** dictator, and he avoids battle: *Cunctator*, the Delayer.',
      more: "The day is Ovid's.",
      sources: [wiki('Battle_of_Lake_Trasimene')],
    }),
    rd('cannae', [-216, 8, 2], 'Battle of Cannae', {
      tags: ['war'],
      notes:
        "Hannibal surrounds and destroys a far larger Roman army in Apulia: one of the worst defeats in Rome's history, with tens of thousands dead. Rome still refuses to make peace.",
      more: 'One review of the evidence (Derow) puts it on 1 July 216 BCE (Julian); others differ.',
      sources: [wiki('Battle_of_Cannae')],
    }),
    yr('syracuse', -212, 'Syracuse falls; Archimedes killed', {
      tags: ['war'],
      notes:
        "Rome takes **Syracuse** after a siege prolonged by **Archimedes**'s war machines; he is killed by a Roman soldier in the sack.",
      sources: [wiki('Siege_of_Syracuse_(213–212_BC)'), wiki('Archimedes')],
    }),
    yr('metaurus', -207, 'Battle of the Metaurus', {
      tags: ['war'],
      notes:
        "Hannibal's brother **Hasdrubal**, bringing a second army over the Alps, is defeated and killed before the brothers can join.",
      sources: [wiki('Battle_of_the_Metaurus')],
    }),
    yr('zama', -202, 'Battle of Zama', {
      tags: ['war'],
      shift: 110,
      notes:
        "**Scipio**, taking the war to Africa, defeats Hannibal near Carthage; he is called **Africanus**, and Carthage accepts Rome's terms the next year.",
      dp: 'Autumn of 202 BCE; often given as 19 October (Roman calendar), but the day is not certain. Placed in October.',
      sources: [wiki('Battle_of_Zama')],
    }),
    yr('cynoscephalae', -197, 'Battle of Cynoscephalae', {
      tags: ['war'],
      notes:
        'The Roman legion beats the **Macedonian phalanx** of Philip V in Thessaly; the next year Rome declares the Greeks free, under its protection.',
      sources: [wiki('Battle_of_Cynoscephalae')],
    }),
    jd('pydna', [-168, 6, 22], 'Battle of Pydna', {
      tags: ['war'],
      hist: '22 June 168 BCE (Julian); the eclipse before it fell on 4 September in the Roman calendar',
      lead: 'Fixed by a lunar eclipse on the night before the battle, astronomically 21 June 168 BCE (Julian). Livy dates the eclipse to the night of 3–4 September in the Roman calendar of the day, which was then about two and a half months ahead of the seasons.',
      notes:
        '**Aemilius Paullus** destroys the army of **Perseus**, the last king of Macedon. The night before, a lunar eclipse unsettled the Macedonians; a Roman officer, **Sulpicius Gallus**, is said to have predicted it.',
      sources: [wiki('Battle_of_Pydna'), wiki('Gaius_Sulpicius_Gallus')],
    }),
    yr('carthage-destroyed', -146, 'Carthage destroyed', {
      tags: ['war'],
      shift: -60,
      notes:
        'After a three-year siege **Scipio Aemilianus** storms Carthage; the city is razed, its people killed or enslaved, and its land becomes the province of **Africa**.',
      dp: 'Spring of 146 BCE; placed at the start of May, before Corinth.',
      sources: [wiki('Siege_of_Carthage_(Third_Punic_War)')],
    }),
    yr('corinth', -146, 'Corinth destroyed', {
      tags: ['war'],
      shift: 60,
      notes:
        'In the same year **Lucius Mummius** sacks **Corinth** after the Achaean War, and its art is shipped to Rome; Greece falls under Roman rule.',
      dp: 'Later in 146 BCE; placed at the end of August, after Carthage.',
      sources: [wiki('Battle_of_Corinth_(146_BC)')],
    }),
    yr('aqua-marcia', -144, 'Aqua Marcia', {
      tags: ['building'],
      notes:
        "The praetor **Quintus Marcius Rex** begins the longest of Rome's aqueducts so far, about 91 km, carrying water on high arches for its last stretch; finished in 140 BCE.",
      dp: 'Built 144–140 BCE; placed at its start.',
      sources: [wiki('Aqua_Marcia')],
    }),

    // ——— The Republic in crisis ———
    h('h-crisis-republic', -133, 'The Republic in crisis'),
    yr('tiberius-gracchus', -133, 'Tiberius Gracchus killed', {
      tags: ['politics'],
      notes:
        'The tribune **Tiberius Gracchus** passes a law sharing out public land to poor citizens and is clubbed to death with hundreds of supporters by senators: the first bloodshed of its kind in Roman politics in centuries.',
      sources: [wiki('Tiberius_Gracchus')],
    }),
    yr('gaius-gracchus', -121, 'Gaius Gracchus killed', {
      tags: ['politics'],
      notes:
        "His brother **Gaius**, tribune twice with a wider programme, dies with thousands of followers after the Senate's first emergency decree, the *senatus consultum ultimum*.",
      sources: [wiki('Gaius_Gracchus')],
    }),
    yr('marius', -107, 'Marius consul', {
      tags: ['politics', 'war'],
      notes:
        '**Gaius Marius**, a "new man", is elected consul and enlists the landless poor; he will hold the consulship seven times, and his soldiers look to their general for their reward.',
      sources: [wiki('Gaius_Marius'), wiki('Marian_reforms')],
    }),
    rd('vercellae', [-101, 7, 30], 'Battle of Vercellae', {
      tags: ['war'],
      notes:
        "Marius and Catulus destroy the **Cimbri**, ending the migrating tribes' threat to Italy.",
      sources: [wiki('Battle_of_Vercellae')],
    }),
    yr('lex-julia', -90, 'Citizenship for the Italians', {
      tags: ['law'],
      notes:
        'In the middle of the **Social War**, the **Lex Julia** offers Roman citizenship to allied Italian communities that have not taken up arms; most of Italy becomes Roman.',
      sources: [wiki('Social_War_(91–87_BC)')],
    }),
    yr('sulla-march', -88, 'Sulla marches on Rome', {
      tags: ['politics', 'war'],
      notes:
        'Stripped of his eastern command, the consul **Sulla** leads his legions against the city itself, the first Roman to do so.',
      sources: [wiki("Sulla's_civil_war")],
    }),
    yr('sulla-dictator', -82, 'Sulla dictator', {
      tags: ['politics'],
      notes:
        'Victorious in civil war, Sulla is made **dictator** to reform the constitution, and posts **proscription** lists: anyone named could be killed for a reward. He resigns and dies in 78 BCE.',
      dp: 'Late 82 BCE; placed at mid-year.',
      sources: [wiki('Sulla'), wiki('Proscription')],
    }),
    yr('spartacus-defeated', -71, 'Spartacus defeated', {
      tags: ['war'],
      notes:
        '**Crassus** defeats the slave army of **Spartacus**, a gladiator; Spartacus dies in battle, and 6,000 captives are crucified along the **Via Appia**.',
      dp: 'Spring of 71 BCE; placed at mid-year.',
      sources: [wiki('Third_Servile_War'), wiki('Spartacus')],
    }),
    yr('pirates', -67, 'Pompey clears the seas of pirates', {
      tags: ['war', 'law'],
      notes:
        'The **Lex Gabinia** gives **Pompey** an unprecedented command over the whole Mediterranean; he clears it of pirates in about three months.',
      sources: [wiki('Lex_Gabinia_de_piratis_persequendis'), wiki('Pompey')],
    }),
    yr('jerusalem-63', -63, 'Pompey takes Jerusalem', {
      tags: ['war'],
      shift: -30,
      notes:
        'Ending his war in the East, having made Syria a province, Pompey takes **Jerusalem**; Judaea becomes a client of Rome.',
      dp: "63 BCE; placed a month before mid-year, apart from Cicero's speeches.",
      sources: [wiki('Siege_of_Jerusalem_(63_BC)')],
    }),
    rd('catiline', [-63, 11, 8], 'Cicero against Catiline', {
      tags: ['writing', 'politics'],
      notes:
        "The consul **Marcus Tullius Cicero** denounces **Catiline**'s conspiracy in the Senate in the first of four speeches, the **Catilinarians**; he later has five conspirators executed without trial.",
      sources: [wiki('Catilinarian_orations'), wiki('Cicero')],
    }),
    yr('triumvirate-1', -60, 'The First Triumvirate', {
      tags: ['politics'],
      notes:
        '**Caesar**, **Pompey** and **Crassus** make a private alliance to get what each wants from the state; Caesar is consul the next year.',
      sources: [wiki('First_Triumvirate')],
    }),
    yr('pompey-theatre', -55, 'Theatre of Pompey', {
      tags: ['building'],
      notes:
        "Rome's first permanent stone theatre, on the Campus Martius. Its portico held the Senate's meeting hall where Caesar was later killed.",
      sources: [wiki('Theatre_of_Pompey')],
    }),
    yr('carrhae', -53, 'Battle of Carrhae', {
      tags: ['war'],
      notes:
        "**Crassus** invades Parthia and is destroyed by its horse archers in the desert near Carrhae; his death ends the triumvirate's balance.",
      sources: [wiki('Battle_of_Carrhae')],
    }),
    yr('alesia', -52, 'Siege of Alesia', {
      tags: ['war'],
      shift: 70,
      notes:
        'Caesar encircles **Vercingetorix** in Alesia and beats off a relief army; Vercingetorix surrenders and Gaul is conquered.',
      dp: 'September 52 BCE in the Roman calendar; placed in September.',
      sources: [wiki('Battle_of_Alesia'), wiki('Vercingetorix')],
    }),
    yr('commentarii', -51, "Caesar's Commentaries on the Gallic War", {
      tags: ['writing'],
      notes:
        "Caesar's own account of his wars in Gaul, in seven books written of himself in the third person, plain and persuasive; an eighth was added by his officer Hirtius.",
      dp: 'Written about 58–49 BCE; placed at 51 BCE.',
      sources: [wiki('Commentarii_de_Bello_Gallico')],
    }),
    rd('rubicon', [-49, 1, 10], 'Caesar crosses the Rubicon', {
      tags: ['war', 'politics'],
      notes:
        'Ordered to give up his army, **Caesar** leads a legion over the **Rubicon**, the border of Italy, saying, Suetonius reports, "the die is cast": civil war.',
      more: 'Usually placed on the night of 10–11 January; the precise day is uncertain.',
      sources: [
        wiki('Crossing_the_Rubicon'),
        'https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Suetonius/12Caesars/Julius*.html',
      ],
    }),
    rd('pharsalus', [-48, 8, 9], 'Battle of Pharsalus', {
      tags: ['war'],
      notes: 'In Thessaly Caesar defeats Pompey, who has the larger army; Pompey flees to Egypt.',
      sources: [wiki('Battle_of_Pharsalus')],
    }),
    rd('pompey-killed', [-48, 9, 28], 'Pompey killed in Egypt', {
      tags: ['politics'],
      notes:
        "Landing in Egypt, Pompey is stabbed on the orders of the boy king **Ptolemy XIII**'s advisers, the day before his birthday.",
      sources: [wiki('Pompey')],
    }),
    jd('julian-calendar', [-45, 1, 1], 'The Julian calendar', {
      tags: ['law'],
      notes:
        "Caesar's new calendar takes effect: a 365-day year with a leap day every fourth year. To bring the old calendar back in line with the seasons, the year before (46 BCE) was stretched to **445 days**.",
      lead: '1 January 45 BCE: the first day of the Julian calendar; days before it are dates in the old Roman calendar.',
      sources: [wiki('Julian_calendar'), wiki('Roman_calendar')],
    }),
    jd('munda', [-45, 3, 17], 'Battle of Munda', {
      tags: ['war'],
      notes: "In Spain Caesar defeats Pompey's sons: the last battle of his civil war.",
      sources: [wiki('Battle_of_Munda')],
    }),
    jd('ides', [-44, 3, 15], 'Caesar assassinated', {
      tags: ['politics'],
      hist: 'Ides of March (15 March) 44 BCE',
      notes:
        "A month after being named **dictator for life**, **Julius Caesar** is stabbed 23 times by senators led by **Brutus** and **Cassius**, at a meeting of the Senate in the hall by Pompey's theatre.",
      sources: [
        wiki('Assassination_of_Julius_Caesar'),
        'https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Suetonius/12Caesars/Julius*.html',
      ],
    }),
    jd('cicero-killed', [-43, 12, 7], 'Cicero killed', {
      tags: ['politics', 'writing'],
      notes:
        'Proscribed by the **Second Triumvirate** for his **Philippics** against Antony, Cicero is killed near his villa at Formiae; his head and hands are nailed up in the Forum.',
      sources: [wiki('Cicero'), wiki('Philippicae')],
    }),
    jd('philippi', [-42, 10, 23], 'Battle of Philippi', {
      tags: ['war'],
      notes:
        "**Antony** and **Octavian** defeat Caesar's assassins in Macedonia; **Cassius** and then **Brutus** take their own lives.",
      more: 'The second of the two battles; the first was on 3 October.',
      sources: [wiki('Battle_of_Philippi')],
    }),
    jd('actium', [-31, 9, 2], 'Battle of Actium', {
      tags: ['war'],
      notes:
        "Off western Greece, **Agrippa**'s fleet, for **Octavian**, defeats **Antony** and **Cleopatra**; they escape to Egypt.",
      sources: [wiki('Battle_of_Actium')],
    }),
    jd('alexandria-30', [-30, 8, 1], 'Egypt taken; Antony and Cleopatra die', {
      tags: ['war', 'ruler'],
      notes:
        "Octavian takes **Alexandria**; Antony and then Cleopatra take their own lives, and Egypt becomes Rome's, governed for the emperor himself.",
      more: 'Alexandria fell on 1 August; Cleopatra died about ten days later.',
      sources: [wiki('War_of_Actium'), wiki('Death_of_Cleopatra')],
    }),

    // ——— The Principate ———
    h('h-principate', -27, 'The Principate'),
    jd('augustus-named', [-27, 1, 16], 'Octavian becomes Augustus', {
      tags: ['ruler', 'politics'],
      notes:
        'Three days after he "restores the Republic" to the Senate, Octavian is given the name **Augustus**. He keeps the armies and the real power as *princeps*, first citizen: the start of the **Principate**.',
      sources: [
        wiki('Augustus'),
        'https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Augustus/Res_Gestae/home.html',
      ],
    }),
    yr('livy', -27, 'Livy begins his history', {
      tags: ['writing'],
      notes:
        '**Livy** begins *Ab Urbe Condita*, the history of Rome "from the founding of the city", in 142 books; 35 survive. Much of what we know of the kings and the early Republic is his telling.',
      dp: 'Begun about 27–25 BCE; placed at mid-27 BCE.',
      sources: [wiki('Livy'), wiki('History_of_Rome_(Livy)'), LIVY],
    }),
    jd('virgil', [-19, 9, 21], 'Virgil dies; the Aeneid', {
      tags: ['writing'],
      notes:
        "**Virgil** dies at Brundisium with the **Aeneid**, his epic of Aeneas's journey from Troy to Italy, unfinished; Augustus has it published against the poet's wishes.",
      sources: [wiki('Virgil'), wiki('Aeneid')],
    }),
    jd('ara-pacis', [-9, 1, 30], 'Ara Pacis consecrated', {
      tags: ['building', 'religion'],
      notes:
        'The **Altar of Augustan Peace**, voted by the Senate in 13 BCE, carved with a procession of the imperial family.',
      sources: [wiki('Ara_Pacis')],
    }),
    yr('ovid-exiled', 8, 'Ovid exiled', {
      tags: ['writing'],
      notes:
        'Augustus banishes **Ovid**, poet of the *Metamorphoses*, to Tomis on the Black Sea, for "a poem and a mistake" that he never explained.',
      sources: [wiki('Ovid')],
    }),
    yr('teutoburg', 9, 'Teutoburg Forest', {
      tags: ['war'],
      shift: 70,
      notes:
        'Germans under **Arminius** destroy three legions under **Varus**; Rome gives up conquering Germany beyond the Rhine.',
      dp: 'September 9 CE; the day is not known. Placed in September.',
      sources: [wiki('Battle_of_the_Teutoburg_Forest')],
    }),
    jd('augustus-dies', [14, 8, 19], 'Augustus dies', {
      tags: ['ruler'],
      notes:
        'Augustus dies at Nola after more than forty years as sole ruler; the Senate makes him a god, and his stepson **Tiberius** succeeds. His own account, the **Res Gestae**, is set up on bronze outside his tomb.',
      sources: [wiki('Augustus'), wiki('Res_Gestae_Divi_Augusti')],
    }),
    yr('crucifixion', 30, 'Jesus crucified', {
      tags: ['religion'],
      notes:
        '**Jesus of Nazareth** is crucified in Jerusalem under the prefect **Pontius Pilate**, a Roman punishment; his followers spread through the empire.',
      dp: 'About 30–33 CE; scholars favour 30 or 33. Placed at mid-30 CE.',
      sources: [wiki('Crucifixion_of_Jesus'), wiki('Pontius_Pilate')],
    }),
    jd('caligula-killed', [41, 1, 24], 'Caligula assassinated', {
      tags: ['ruler'],
      notes:
        'Officers of the **Praetorian Guard** kill the emperor **Gaius (Caligula)**; the Guard proclaims his uncle **Claudius** emperor.',
      sources: [wiki('Caligula')],
    }),
    yr('britain', 43, 'Claudius invades Britain', {
      tags: ['war'],
      notes: 'Four legions under **Aulus Plautius** land in Britain; it becomes a province.',
      sources: [wiki('Roman_conquest_of_Britain')],
    }),
    yr('aqua-claudia', 52, 'Aqua Claudia', {
      tags: ['building'],
      notes:
        'Claudius completes two great aqueducts begun by Caligula, the **Aqua Claudia** and **Anio Novus**, which enter Rome over the **Porta Maggiore**.',
      sources: [wiki('Aqua_Claudia')],
    }),
    jd('fire', [64, 7, 19], 'Great Fire of Rome', {
      tags: ['religion'],
      notes:
        "Fire burns for six days; of Rome's fourteen districts three are destroyed and seven damaged. **Nero** blames the **Christians**, and Tacitus records their execution; tradition puts the deaths of **Peter** and **Paul** in these years.",
      more: 'The fire began on the night of 18–19 July.',
      sources: [wiki('Great_Fire_of_Rome')],
    }),
    jd('nero-dies', [68, 6, 9], 'Nero dies', {
      tags: ['ruler'],
      notes:
        'Declared a public enemy, **Nero** takes his own life outside Rome; the Julio-Claudian line ends, and four emperors follow in a year.',
      sources: [wiki('Nero')],
    }),
    yr('temple', 70, 'Jerusalem and the Temple destroyed', {
      tags: ['war', 'religion'],
      shift: 60,
      notes:
        '**Titus** takes Jerusalem after a long siege and the **Second Temple** is burned. The **Arch of Titus** in Rome shows its treasures carried in triumph.',
      dp: 'August 70 CE; the day is debated. Placed at the end of August.',
      sources: [wiki('Siege_of_Jerusalem_(70_CE)'), wiki('Arch_of_Titus')],
    }),
    jd('vesuvius', [79, 8, 24], 'Vesuvius buries Pompeii', {
      tags: ['writing'],
      notes:
        'The eruption buries **Pompeii** and **Herculaneum**. **Pliny the Elder**, author of the *Natural History*, dies trying to rescue people; his nephew **Pliny the Younger** describes it in two letters to **Tacitus**.',
      lead: "24 August 79 CE (Julian) is the date in the manuscripts of Pliny's letter, as traditionally read; finds at Pompeii suggest an autumn date, perhaps late October, and that is now often preferred.",
      sources: [wiki('Eruption_of_Mount_Vesuvius_in_79_AD'), wiki('Pliny_the_Elder')],
    }),
    yr('colosseum', 80, 'The Colosseum opens', {
      tags: ['building'],
      notes:
        "Begun by **Vespasian** on the site of Nero's palace lake, the **Flavian Amphitheatre** is opened by **Titus** with a hundred days of games. It held about 50,000 people.",
      dp: 'Inaugurated in 80 CE; the day is not known.',
      sources: [wiki('Colosseum')],
    }),
    jd('domitian-killed', [96, 9, 18], 'Domitian assassinated', {
      tags: ['ruler'],
      notes:
        'Court officials kill **Domitian**, last of the Flavians; the Senate names the elderly **Nerva** emperor the same day.',
      sources: [wiki('Domitian'), wiki('Nerva')],
    }),
    yr('trajans-column', 113, "Trajan's Column", {
      tags: ['building'],
      notes:
        "A 30 m marble column in **Trajan's Forum**, its spiral frieze telling the **Dacian Wars** in about 155 scenes. Trajan's ashes were placed in its base.",
      dp: 'Dedicated in May 113 CE; placed at mid-year.',
      sources: [wiki("Trajan's_Column")],
    }),
    yr('tacitus', 116, 'Tacitus writes the Annals', {
      tags: ['writing'],
      shift: -30,
      notes:
        '**Tacitus**, senator and historian, writes the **Annals**, the history of the emperors from Tiberius to Nero, after his **Histories** of the years 69–96.',
      dp: 'About 116 CE or a few years later; placed at 116 CE.',
      sources: [wiki('Tacitus'), wiki('Annals_(Tacitus)')],
    }),
    yr('greatest-extent', 117, "The empire's greatest extent", {
      tags: ['war'],
      shift: -60,
      notes:
        "After Trajan's conquests of **Dacia** and, briefly, **Mesopotamia**, the empire reaches its greatest size, about 5 million km²; Hadrian gives up the new eastern provinces.",
      dp: "At Trajan's death in August 117 CE; placed in early May, before it.",
      sources: [wiki('Roman_Empire'), wiki('Trajan')],
    }),
    yr('suetonius', 121, 'Suetonius: The Twelve Caesars', {
      tags: ['writing'],
      notes:
        "**Suetonius**, Hadrian's secretary, writes lives of Julius Caesar and the eleven emperors after him, full of gossip and detail.",
      dp: 'About 121 CE; placed at mid-year.',
      sources: [wiki('The_Twelve_Caesars')],
    }),
    yr('hadrians-wall', 122, "Hadrian's Wall begun", {
      tags: ['building'],
      notes:
        'After visiting Britain, **Hadrian** orders a wall across the north of the province, 117 km from coast to coast, with forts and milecastles.',
      sources: [wiki("Hadrian's_Wall")],
    }),
    yr('pantheon', 126, 'The Pantheon rebuilt', {
      tags: ['building', 'religion'],
      notes:
        "Rebuilt under Hadrian, still with Agrippa's name on its front: its unreinforced concrete dome, 43 m across, is still the largest of its kind in the world.",
      dp: 'Built about 113–125 CE, dedicated about 126; placed at 126.',
      sources: [wiki('Pantheon,_Rome')],
    }),
    yr('antonine-plague', 165, 'Antonine Plague', {
      notes:
        'Troops returning from war with **Parthia** bring an epidemic, probably **smallpox**, that kills millions across the empire over fifteen years; the doctor **Galen** describes it.',
      dp: '165 CE, when it reached the empire; placed at mid-year.',
      sources: [wiki('Antonine_Plague')],
    }),
    yr('meditations', 175, 'Meditations of Marcus Aurelius', {
      tags: ['writing'],
      notes:
        'On campaign on the Danube, the emperor **Marcus Aurelius** writes notes to himself in Greek on Stoic philosophy, known to us as the **Meditations**.',
      dp: 'Written about 170–180 CE; placed at 175.',
      sources: [wiki('Meditations')],
    }),
    jd('commodus-killed', [192, 12, 31], 'Commodus killed', {
      tags: ['ruler'],
      notes:
        "**Commodus**, Marcus's son, who fought as a gladiator in the arena, is strangled by a wrestler on the last day of the year; the Year of the Five Emperors follows.",
      sources: [wiki('Commodus')],
    }),
    yr('antoniniana', 212, 'Citizenship for all free men', {
      tags: ['law'],
      notes:
        "The emperor **Caracalla**'s edict, the **Constitutio Antoniniana**, makes almost every free man in the empire a Roman citizen.",
      sources: [wiki('Constitutio_Antoniniana')],
    }),
    yr('caracalla-baths', 216, 'Baths of Caracalla', {
      tags: ['building'],
      notes:
        'The vast public baths on the Aventine are opened, with room for well over a thousand bathers.',
      dp: 'Built about 212–216 CE; placed at 216.',
      sources: [wiki('Baths_of_Caracalla')],
    }),

    // ——— Crisis of the Third Century ———
    h('h-crisis', 235, 'Crisis of the Third Century'),
    yr('decius', 250, 'Decius orders sacrifices', {
      tags: ['religion', 'law'],
      notes:
        '**Decius** orders everyone in the empire to sacrifice to the gods and get a certificate saying so; Christians who refuse are killed, the first empire-wide persecution.',
      sources: [wiki('Decian_persecution')],
    }),
    yr('valerian', 260, 'Valerian captured by Persia', {
      tags: ['war', 'ruler'],
      notes:
        'The emperor **Valerian** is taken prisoner by **Shapur I** of Persia near Edessa and dies in captivity; the Gallic Empire breaks away in the west the same year.',
      sources: [wiki('Valerian_(emperor)'), wiki('Battle_of_Edessa')],
    }),
    yr('aurelian-walls', 271, 'Aurelian Walls begun', {
      tags: ['building'],
      notes:
        '**Aurelian** walls the city of Rome itself for the first time in six centuries: 19 km of brick-faced concrete, much of it still standing.',
      sources: [wiki('Aurelian_Walls')],
    }),
    yr('zenobia', 272, 'Zenobia defeated', {
      tags: ['war'],
      notes:
        'Aurelian defeats **Zenobia**, queen of **Palmyra**, who had taken Egypt and much of the East; two years later he ends the Gallic Empire and reunites the empire.',
      sources: [wiki('Zenobia'), wiki('Palmyrene_Empire')],
    }),

    // ——— The late empire ———
    h('h-late', 284, 'The late empire'),
    jd('diocletian', [284, 11, 20], 'Diocletian proclaimed', {
      tags: ['ruler'],
      notes:
        'The army proclaims **Diocletian**, a Dalmatian officer, at Nicomedia. His reforms of the army, the provinces and taxes remake the state: what is often called the **Dominate**.',
      sources: [wiki('Diocletian')],
    }),
    jd('tetrarchy', [293, 3, 1], 'The Tetrarchy', {
      tags: ['politics', 'ruler'],
      notes:
        'Diocletian shares rule among four: two senior emperors (**Augusti**), himself and **Maximian**, and two juniors (**Caesares**), **Galerius** and **Constantius**.',
      sources: [wiki('Tetrarchy')],
    }),
    yr('prices', 301, 'Edict on Maximum Prices', {
      tags: ['law'],
      notes:
        'Diocletian fixes maximum prices for more than a thousand goods and services, against inflation; the edict failed, but its inscriptions are a priceless record.',
      dp: 'Late 301 CE; placed at mid-year.',
      sources: [wiki('Edict_on_Maximum_Prices')],
    }),
    jd('persecution', [303, 2, 23], 'The Great Persecution', {
      tags: ['religion', 'law'],
      notes:
        "Diocletian's first edict against the **Christians** orders churches destroyed and scriptures burned; the last and harshest persecution follows.",
      sources: [wiki('Diocletianic_Persecution')],
    }),
    jd('constantine-york', [306, 7, 25], 'Constantine acclaimed at York', {
      tags: ['ruler'],
      notes:
        'When his father **Constantius** dies at **Eboracum** (York), the army there proclaims **Constantine** emperor.',
      sources: [wiki('Constantine_the_Great')],
    }),
    jd('milvian', [312, 10, 28], 'Battle of the Milvian Bridge', {
      tags: ['war', 'religion'],
      notes:
        "Constantine defeats his rival **Maxentius** at a bridge over the Tiber; his soldiers, by Christian writers' accounts, bore a Christian sign after a vision.",
      sources: [wiki('Battle_of_the_Milvian_Bridge')],
    }),
    jd('milan', [313, 6, 13], 'Edict of Milan', {
      tags: ['law', 'religion'],
      notes:
        'Constantine and **Licinius**, meeting at Milan, agree to grant freedom of worship to Christians and all others and return confiscated church property.',
      more: "Agreed at Milan in February; 13 June is when Licinius's letter announcing it was posted at Nicomedia (Lactantius).",
      sources: [wiki('Edict_of_Milan'), 'https://sourcebooks.fordham.edu/source/edict-milan.asp'],
    }),
    yr('arch-constantine', 315, 'Arch of Constantine', {
      tags: ['building'],
      notes:
        "The Senate dedicates a triumphal arch by the Colosseum for Constantine's victory, reusing sculpture from monuments of Trajan, Hadrian and Marcus Aurelius.",
      sources: [wiki('Arch_of_Constantine')],
    }),
    jd('nicaea', [325, 5, 20], 'Council of Nicaea', {
      tags: ['religion'],
      notes:
        'Constantine calls the bishops of the empire to **Nicaea**; they condemn **Arius** and agree the first form of the **Nicene Creed**.',
      more: 'The council is usually said to have opened on 20 May 325; sources differ.',
      sources: [wiki('First_Council_of_Nicaea')],
    }),
    jd('constantinople-founded', [330, 5, 11], 'Constantinople dedicated', {
      tags: ['building', 'ruler'],
      notes:
        'Constantine refounds the Greek city of **Byzantium** on the Bosporus as his new capital, **Constantinople**: the New Rome.',
      sources: [wiki('Constantinople')],
    }),
    jd('constantine-dies', [337, 5, 22], 'Constantine dies', {
      tags: ['ruler', 'religion'],
      notes:
        'Constantine is baptized on his deathbed near Nicomedia; his three sons divide the empire.',
      sources: [wiki('Constantine_the_Great')],
    }),
    jd('julian-dies', [363, 6, 26], 'Julian dies in Persia', {
      tags: ['ruler', 'religion'],
      notes:
        '**Julian**, the last emperor to worship the old gods, called the Apostate by Christians, is killed on campaign against Persia.',
      sources: [wiki('Julian_(emperor)')],
    }),
    jd('adrianople', [378, 8, 9], 'Battle of Adrianople', {
      tags: ['war'],
      notes:
        '**Goths**, admitted across the Danube two years before and badly treated, destroy an eastern Roman army; the emperor **Valens** is killed.',
      sources: [wiki('Battle_of_Adrianople')],
    }),
    jd('thessalonica', [380, 2, 27], 'Edict of Thessalonica', {
      tags: ['law', 'religion'],
      notes:
        '**Theodosius I** and his co-emperors declare **Nicene Christianity** the faith of all their peoples.',
      sources: [wiki('Edict_of_Thessalonica')],
    }),
    jd('frigidus', [394, 9, 6], 'Battle of the Frigidus', {
      tags: ['war', 'religion'],
      notes:
        'Theodosius defeats the western usurper **Eugenius**, whose regime the last pagan senators had backed; Theodosius is the last emperor to rule both halves of the empire.',
      more: 'The battle lasted two days, 5–6 September.',
      sources: [wiki('Battle_of_the_Frigidus')],
    }),

    // ——— The fall of the West ———
    h('h-fall', 395, 'The fall of the West'),
    jd('division', [395, 1, 17], 'Theodosius dies; the empire divided', {
      tags: ['ruler', 'politics'],
      notes:
        'Theodosius dies at Milan; his sons rule the two halves, **Arcadius** in the East from Constantinople and the boy **Honorius** in the West. The empire is never again ruled by one man.',
      sources: [wiki('Theodosius_I'), wiki('Western_Roman_Empire')],
    }),
    jd('rhine', [406, 12, 31], 'The Rhine crossed', {
      tags: ['war'],
      notes: '**Vandals**, **Alans** and **Suebi** cross the Rhine into Gaul and go on to Spain.',
      more: 'The traditional date, from Prosper of Aquitaine; some argue for 405.',
      sources: [wiki('Crossing_of_the_Rhine')],
    }),
    jd('alaric', [410, 8, 24], 'Visigoths sack Rome', {
      tags: ['war'],
      notes:
        "**Alaric**'s **Visigoths** take and plunder Rome for three days: the first time in 800 years that an enemy has taken the city.",
      sources: [wiki('Sack_of_Rome_(410)')],
    }),
    yr('city-of-god', 413, 'Augustine begins The City of God', {
      tags: ['writing', 'religion'],
      notes:
        '**Augustine**, bishop of Hippo, answers pagans who blamed the sack of Rome on the Christian god; he works on *The City of God* until 426.',
      dp: 'Begun about 413 CE; placed at mid-year.',
      sources: [wiki('The_City_of_God')],
    }),
    jd('vandal-carthage', [439, 10, 19], 'Vandals take Carthage', {
      tags: ['war'],
      notes:
        "**Gaiseric**'s Vandals take **Carthage**, the West's richest province and Rome's grain supply.",
      sources: [wiki('Vandal_Kingdom')],
    }),
    jd('catalaunian', [451, 6, 20], 'Battle of the Catalaunian Plains', {
      tags: ['war'],
      notes: "**Aetius**, with Romans and Visigoths, stops **Attila**'s Huns in Gaul.",
      more: 'The traditional day; sources differ, and some put it in September.',
      sources: [wiki('Battle_of_the_Catalaunian_Plains')],
    }),
    yr('leo-attila', 452, 'Pope Leo meets Attila', {
      tags: ['religion', 'war'],
      notes:
        'Attila invades Italy; **Pope Leo I** is among the envoys who meet him near Mantua, and the Huns withdraw.',
      sources: [wiki('Pope_Leo_I'), wiki('Attila')],
    }),
    jd('vandal-sack', [455, 6, 2], 'Vandals sack Rome', {
      tags: ['war'],
      notes:
        "Gaiseric's Vandals sail from Carthage and plunder Rome for two weeks, carrying off treasures and captives, among them the empress **Eudoxia** and her daughters.",
      more: 'The sack began on 2 June and lasted about two weeks.',
      sources: [wiki('Sack_of_Rome_(455)')],
    }),
    jd('deposed', [476, 9, 4], 'Romulus Augustulus deposed', {
      tags: ['ruler'],
      notes:
        'The Germanic general **Odoacer** deposes the boy emperor **Romulus Augustulus** and sends the imperial regalia to Constantinople. No new emperor is made in the West: the traditional end of the Western Roman Empire.',
      sources: [wiki('Romulus_Augustulus'), wiki('Fall_of_the_Western_Roman_Empire')],
    }),

    // ——— Epilogue ———
    h('h-east', 527, 'Epilogue: Rome in the East'),
    jd('codex', [529, 4, 7], "Justinian's Code", {
      tags: ['law'],
      notes:
        "The first edition of **Justinian**'s code of imperial law, followed by the Digest and Institutes: the **Corpus Juris Civilis**, through which Roman law reached modern Europe.",
      sources: [wiki('Corpus_Juris_Civilis')],
    }),
    jd('hagia-sophia', [537, 12, 27], 'Hagia Sophia dedicated', {
      tags: ['building', 'religion'],
      notes:
        "Justinian's great church in Constantinople, with its 31 m dome, built in under six years after riots burned the old one.",
      sources: [wiki('Hagia_Sophia')],
    }),
    jd('crusade-1204', [1204, 4, 13], 'Crusaders sack Constantinople', {
      tags: ['war'],
      notes:
        'The army of the **Fourth Crusade** storms and plunders the city; the empire is restored only in 1261, smaller and weaker.',
      sources: [wiki('Sack_of_Constantinople')],
    }),
    jd('fall-1453', [1453, 5, 29], 'Fall of Constantinople', {
      tags: ['war', 'ruler'],
      notes:
        'The Ottoman sultan **Mehmed II** takes the city after a 53-day siege; the last emperor, **Constantine XI**, dies in the fighting. The Roman Empire, in the East, ends.',
      sources: [wiki('Fall_of_Constantinople')],
    }),
  ];

  const durations = [
    // Eras
    d('regal', jt(-753, 4, 21), mid(-509), 'Roman Kingdom', {
      color: ERA,
      tags: ['ruler', 'legend'],
      notes:
        'Rome under seven kings, by tradition from Romulus to Tarquin the Proud: 753–509 BCE, dates that are legend rather than record.',
      sources: [wiki('Roman_Kingdom')],
    }),
    d('republic', mid(-509), jt(-27, 1, 16), 'Roman Republic', {
      color: ERA,
      tags: ['politics'],
      notes:
        'Government by yearly magistrates, the Senate and the assemblies, from the expulsion of the kings (509 BCE, traditional) until Octavian becomes Augustus (27 BCE): 482 years.',
      sources: [wiki('Roman_Republic')],
    }),
    d('principate', jt(-27, 1, 16), jt(284, 11, 20), 'The Principate', {
      color: ERA,
      tags: ['ruler'],
      notes:
        "Rule by an emperor who keeps the Republic's forms and calls himself *princeps*, first citizen: from Augustus (27 BCE) to Diocletian (284 CE).",
      sources: [wiki('Principate')],
    }),
    d('dominate', jt(284, 11, 20), jt(476, 9, 4), 'The late empire (Dominate)', {
      color: ERA,
      tags: ['ruler'],
      notes:
        'From Diocletian to the last western emperor: emperors ruling openly as masters (*domini*), often several at once, with a Christian empire from Constantine.',
      sources: [wiki('Dominate')],
    }),
    d('western', jt(395, 1, 17), jt(476, 9, 4), 'Western Roman Empire', {
      color: ERA,
      tags: ['ruler'],
      notes:
        'The western half after the division of 395, ruled from Milan and then Ravenna, until 476: 81 years.',
      sources: [wiki('Western_Roman_Empire')],
    }),
    d('eastern', jt(395, 1, 17), jt(1453, 5, 29), 'Eastern Roman (Byzantine) Empire', {
      color: EAST,
      tags: ['ruler'],
      notes:
        'The eastern half, ruled from Constantinople, which called itself Roman to the end; modern historians call it the **Byzantine Empire**. It outlived the West by almost a thousand years, from 476 to 1453.',
      sources: [wiki('Byzantine_Empire')],
    }),
    // The seven kings: traditional (Varronian) reigns
    ...[
      [
        'romulus',
        -753,
        -716,
        'Romulus',
        'The founder; at his end, legend says, he vanished in a storm and became the god **Quirinus**.',
        'Romulus',
      ],
      [
        'numa',
        -715,
        -673,
        'Numa Pompilius',
        "A Sabine, the peaceful king: legend credits him with Rome's priesthoods and its calendar.",
        'Numa_Pompilius',
      ],
      [
        'tullus',
        -673,
        -642,
        'Tullus Hostilius',
        'A warlike king who destroys **Alba Longa**, after the legendary fight of the Horatii and Curiatii.',
        'Tullus_Hostilius',
      ],
      [
        'ancus',
        -642,
        -617,
        'Ancus Marcius',
        'Credited with the first bridge over the Tiber and the port of **Ostia**.',
        'Ancus_Marcius',
      ],
      [
        'priscus',
        -616,
        -579,
        'Tarquinius Priscus',
        'The first king of Etruscan origin; tradition credits him with draining the Forum and the Circus Maximus.',
        'Lucius_Tarquinius_Priscus',
      ],
      [
        'servius',
        -578,
        -535,
        'Servius Tullius',
        'Credited with the first census and with dividing the people into classes by wealth.',
        'Servius_Tullius',
      ],
      [
        'superbus',
        -535,
        -509,
        'Tarquinius Superbus',
        'Tarquin the Proud, the seventh and last king, a tyrant in the tradition, expelled in 509 BCE.',
        'Lucius_Tarquinius_Superbus',
      ],
    ].map(([id, from, to, title, notes, article], i) =>
      d(id, i === 0 ? jt(-753, 4, 21) : mid(from), to === -509 ? mid(-509) : mid(to), title, {
        color: KING,
        tags: ['ruler', 'legend'],
        notes: `${notes} Traditional reign, ${-from}–${-to} BCE: legend, not record.`,
        sources: [wiki(article)],
      }),
    ),
    // Politics
    d('orders', mid(-494), mid(-287), 'Conflict of the Orders', {
      color: POLITICS,
      tags: ['politics', 'law'],
      notes:
        "The plebeians' two-century struggle with the patricians for political equality, from the first secession (494 BCE) to the Lex Hortensia (287 BCE).",
      sources: [wiki('Conflict_of_the_Orders')],
    }),
    d('triumvirate-2', jt(-43, 11, 27), jt(-33, 12, 31), 'Second Triumvirate', {
      color: POLITICS,
      tags: ['politics'],
      notes:
        '**Octavian**, **Antony** and **Lepidus**, made "three men for restoring the state" by law in November 43 BCE; their powers lapsed at the end of 33 BCE.',
      sources: [wiki('Second_Triumvirate')],
    }),
    d('four-emperors', jt(68, 6, 9), jt(69, 12, 20), 'Year of the Four Emperors', {
      color: DYNASTY,
      tags: ['ruler', 'war'],
      notes:
        "After Nero, **Galba**, **Otho** and **Vitellius** rule in turn and die; **Vespasian**'s troops take Rome in December 69.",
      sources: [wiki('Year_of_the_Four_Emperors')],
    }),
    d('crisis-3', mid(235, -100), jt(284, 11, 20), 'Crisis of the Third Century', {
      color: POLITICS,
      tags: ['politics', 'war'],
      notes:
        'Half a century of civil wars, invasions, plague and debased coinage, from the murder of **Severus Alexander** (235) to Diocletian; some twenty-five emperors, most of them murdered.',
      sources: [wiki('Crisis_of_the_Third_Century')],
    }),
    d('tetrarchy-band', jt(293, 3, 1), mid(313), 'Tetrarchy', {
      color: POLITICS,
      tags: ['politics', 'ruler'],
      notes:
        'Rule by four emperors, from 293 until the system broke down in civil war; shown to 313.',
      sources: [wiki('Tetrarchy')],
    }),
    // Dynasties
    d('julio-claudian', jt(-27, 1, 16), jt(68, 6, 9), 'Julio-Claudian dynasty', {
      color: DYNASTY,
      tags: ['ruler'],
      notes:
        "Augustus, Tiberius, Caligula, Claudius and Nero: from 27 BCE to Nero's death in 68 CE.",
      sources: [wiki('Julio-Claudian_dynasty')],
    }),
    d('flavian', jt(69, 12, 20), jt(96, 9, 18), 'Flavian dynasty', {
      color: DYNASTY,
      tags: ['ruler'],
      notes: '**Vespasian** and his sons **Titus** and **Domitian**, builders of the Colosseum.',
      sources: [wiki('Flavian_dynasty')],
    }),
    d('antonine', jt(96, 9, 18), jt(192, 12, 31), 'Nerva–Antonine dynasty', {
      color: DYNASTY,
      tags: ['ruler'],
      notes:
        'Nerva, Trajan, Hadrian, Antoninus Pius, Marcus Aurelius (with Lucius Verus) and Commodus. Gibbon called the years from Nerva to Marcus the happiest in history.',
      sources: [wiki('Nerva–Antonine_dynasty')],
    }),
    d('severan', jt(193, 4, 9), mid(235, -100), 'Severan dynasty', {
      color: DYNASTY,
      tags: ['ruler'],
      notes:
        '**Septimius Severus**, an African-born general, and his heirs, to the murder of Severus Alexander in 235.',
      sources: [wiki('Severan_dynasty')],
    }),
    // Reigns
    d('r-augustus', jt(-27, 1, 16), jt(14, 8, 19), 'Augustus', {
      color: REIGN,
      tags: ['ruler'],
      notes: 'The first emperor, 27 BCE – 14 CE.',
      sources: [wiki('Augustus')],
    }),
    d('r-tiberius', jt(14, 9, 18), jt(37, 3, 16), 'Tiberius', {
      color: REIGN,
      tags: ['ruler'],
      notes: "Augustus's stepson, 14–37 CE, much of it ruled from Capri.",
      sources: [wiki('Tiberius')],
    }),
    d('r-caligula', jt(37, 3, 18), jt(41, 1, 24), 'Caligula', {
      color: REIGN,
      tags: ['ruler'],
      notes: 'Gaius, called Caligula, 37–41 CE.',
      sources: [wiki('Caligula')],
    }),
    d('r-claudius', jt(41, 1, 24), jt(54, 10, 13), 'Claudius', {
      color: REIGN,
      tags: ['ruler'],
      notes: '41–54 CE: the conquest of Britain, aqueducts and the harbour at Ostia.',
      sources: [wiki('Claudius')],
    }),
    d('r-nero', jt(54, 10, 13), jt(68, 6, 9), 'Nero', {
      color: REIGN,
      tags: ['ruler'],
      notes: '54–68 CE: the Great Fire and the Golden House.',
      sources: [wiki('Nero')],
    }),
    d('r-trajan', jt(98, 1, 28), jt(117, 8, 8), 'Trajan', {
      color: REIGN,
      tags: ['ruler'],
      notes:
        'The first emperor born in a province (Spain), 98–117 CE; under him the empire was at its largest.',
      sources: [wiki('Trajan')],
    }),
    d('r-hadrian', jt(117, 8, 11), jt(138, 7, 10), 'Hadrian', {
      color: REIGN,
      tags: ['ruler'],
      notes: '117–138 CE: he travelled the whole empire and fixed its frontiers.',
      sources: [wiki('Hadrian')],
    }),
    d('r-marcus', jt(161, 3, 7), jt(180, 3, 17), 'Marcus Aurelius', {
      color: REIGN,
      tags: ['ruler'],
      notes: 'The philosopher emperor, 161–180 CE, much of it at war on the Danube.',
      sources: [wiki('Marcus_Aurelius')],
    }),
    d('r-diocletian', jt(284, 11, 20), jt(305, 5, 1), 'Diocletian', {
      color: REIGN,
      tags: ['ruler'],
      notes:
        '284–305 CE; he is the only emperor of the age to abdicate, retiring to his palace at Split.',
      sources: [wiki('Diocletian')],
    }),
    d('r-constantine', jt(306, 7, 25), jt(337, 5, 22), 'Constantine', {
      color: REIGN,
      tags: ['ruler', 'religion'],
      notes: '306–337 CE; sole emperor from 324. The first Christian emperor.',
      sources: [wiki('Constantine_the_Great')],
    }),
    d('r-theodosius', jt(379, 1, 19), jt(395, 1, 17), 'Theodosius I', {
      color: REIGN,
      tags: ['ruler', 'religion'],
      notes: 'Emperor in the East from 379 CE, and of the whole empire in his last months.',
      sources: [wiki('Theodosius_I')],
    }),
    d('r-romulus', jt(475, 10, 31), jt(476, 9, 4), 'Romulus Augustulus', {
      color: REIGN,
      tags: ['ruler'],
      notes:
        'The last emperor in the West, a boy set up by his father Orestes; he reigned less than a year.',
      sources: [wiki('Romulus_Augustulus')],
    }),
    d('r-justinian', jt(527, 8, 1), jt(565, 11, 14), 'Justinian I', {
      color: EAST,
      tags: ['ruler', 'law'],
      notes:
        'Eastern emperor 527–565 CE, who won back Italy and Africa for a time and codified Roman law.',
      sources: [wiki('Justinian_I')],
    }),
    // Wars
    d('samnite', mid(-343), mid(-290), 'Samnite Wars', {
      color: WAR,
      tags: ['war'],
      notes:
        'Three wars with the **Samnites** of the southern Apennines, which made Rome master of central Italy.',
      sources: [wiki('Samnite_Wars')],
    }),
    d('pyrrhic', mid(-280), mid(-275), 'Pyrrhic War', {
      color: WAR,
      tags: ['war'],
      notes: 'King **Pyrrhus** of Epirus fights for the Greek city of Tarentum against Rome.',
      sources: [wiki('Pyrrhic_War')],
    }),
    d('punic-1', mid(-264), jt(-241, 3, 10), 'First Punic War', {
      color: WAR,
      tags: ['war'],
      notes: 'Rome against **Carthage** for Sicily, mostly at sea: 264–241 BCE.',
      sources: [wiki('First_Punic_War')],
    }),
    d('punic-2', mid(-218), mid(-201), 'Second Punic War', {
      color: WAR,
      tags: ['war'],
      notes: "**Hannibal**'s war, 218–201 BCE: Italy invaded, and Carthage defeated in Africa.",
      sources: [wiki('Second_Punic_War')],
    }),
    d('macedonian', mid(-214), mid(-148), 'Macedonian Wars', {
      color: WAR,
      tags: ['war'],
      notes: 'Four wars, 214–148 BCE, that ended with Macedonia a Roman province.',
      sources: [wiki('Macedonian_Wars')],
    }),
    d('punic-3', mid(-149), mid(-146, -60), 'Third Punic War', {
      color: WAR,
      tags: ['war'],
      notes: "Rome's three-year siege of Carthage, ending in its destruction in 146 BCE.",
      sources: [wiki('Third_Punic_War')],
    }),
    d('social', mid(-91), mid(-87), 'Social War', {
      color: WAR,
      tags: ['war'],
      notes:
        "Rome's Italian allies (*socii*) rise for Roman citizenship, 91–87 BCE, and win it in the end.",
      sources: [wiki('Social_War_(91–87_BC)')],
    }),
    d('servile-3', mid(-73), mid(-71), "Spartacus's revolt", {
      color: WAR,
      tags: ['war'],
      notes:
        'The Third Servile War, 73–71 BCE: escaped gladiators and slaves defeat Roman armies across Italy.',
      sources: [wiki('Third_Servile_War')],
    }),
    d('gallic', mid(-58), mid(-50), 'Gallic Wars', {
      color: WAR,
      tags: ['war'],
      notes: "Caesar's conquest of Gaul, 58–50 BCE.",
      sources: [wiki('Gallic_Wars')],
    }),
    d('caesar-civil', jt(-49, 1, 10), jt(-45, 3, 17), "Caesar's civil war", {
      color: WAR,
      tags: ['war'],
      notes: "From the Rubicon to Munda: Caesar against Pompey and the Senate's party, 49–45 BCE.",
      sources: [wiki("Caesar's_civil_war")],
    }),
    d('jewish', mid(66), mid(73), 'First Jewish–Roman War', {
      color: WAR,
      tags: ['war', 'religion'],
      notes: 'The revolt of Judaea, 66–73 CE, ending with the fall of Masada.',
      sources: [wiki('First_Jewish–Roman_War')],
    }),
    d('dacian', mid(101), mid(106), "Trajan's Dacian Wars", {
      color: WAR,
      tags: ['war'],
      notes:
        'Two wars, 101–102 and 105–106 CE, that made **Dacia** (in modern Romania) a province.',
      sources: [wiki("Trajan's_Dacian_Wars")],
    }),
    d('marcomannic', mid(166), jt(180, 3, 17), 'Marcomannic Wars', {
      color: WAR,
      tags: ['war'],
      notes:
        "Marcus Aurelius's wars with Germanic and Sarmatian peoples on the Danube, 166–180 CE.",
      sources: [wiki('Marcomannic_Wars')],
    }),
    d('gothic', mid(376), mid(382), 'Gothic War', {
      color: WAR,
      tags: ['war'],
      notes:
        'Goths admitted into the empire rise, win at Adrianople and settle by treaty in 382 CE.',
      sources: [wiki('Gothic_War_(376–382)')],
    }),
  ];

  const relationships = [
    rel('founding', 'd:romulus'),
    rel('d:priscus', 'cloaca'),
    rel('d:superbus', 'tarquin-expelled'),
    rel('tarquin-expelled', 'first-consuls'),
    rel('first-consuls', 'jupiter-temple'),
    rel('secession', 'd:orders'),
    rel('twelve-tables', 'canuleia'),
    rel('licinian', 'hortensia'),
    rel('d:orders', 'hortensia'),
    rel('allia', 'servian-wall'),
    rel('via-appia', 'aqua-appia'),
    rel('aegates', 'd:punic-1'),
    rel('saguntum', 'alps'),
    rel('alps', 'trasimene'),
    rel('trasimene', 'cannae'),
    rel('cannae', 'zama'),
    rel('d:punic-2', 'zama'),
    rel('d:macedonian', 'pydna'),
    rel('d:punic-3', 'carthage-destroyed'),
    rel('tiberius-gracchus', 'gaius-gracchus'),
    rel('d:social', 'lex-julia'),
    rel('lex-julia', 'antoniniana'),
    rel('sulla-march', 'sulla-dictator'),
    rel('d:servile-3', 'spartacus-defeated'),
    rel('triumvirate-1', 'carrhae'),
    rel('d:gallic', 'alesia'),
    rel('d:gallic', 'commentarii'),
    rel('rubicon', 'pharsalus'),
    rel('pharsalus', 'pompey-killed'),
    rel('pompey-theatre', 'ides'),
    rel('ides', 'cicero-killed'),
    rel('ides', 'philippi'),
    rel('actium', 'alexandria-30'),
    rel('alexandria-30', 'augustus-named'),
    rel('d:r-augustus', 'virgil'),
    rel('d:r-augustus', 'ara-pacis'),
    rel('d:r-nero', 'fire'),
    rel('d:jewish', 'temple'),
    rel('temple', 'colosseum'),
    rel('vesuvius', 'tacitus'),
    rel('d:dacian', 'trajans-column'),
    rel('d:r-trajan', 'greatest-extent'),
    rel('d:r-hadrian', 'hadrians-wall'),
    rel('d:r-hadrian', 'pantheon'),
    rel('d:r-marcus', 'meditations'),
    rel('decius', 'persecution'),
    rel('d:r-diocletian', 'tetrarchy'),
    rel('persecution', 'milan'),
    rel('milvian', 'milan'),
    rel('milvian', 'arch-constantine'),
    rel('nicaea', 'thessalonica'),
    rel('d:r-constantine', 'constantinople-founded'),
    rel('adrianople', 'd:gothic'),
    rel('division', 'd:eastern'),
    rel('alaric', 'city-of-god'),
    rel('vandal-carthage', 'vandal-sack'),
    rel('deposed', 'd:western'),
    rel('twelve-tables', 'codex'),
    rel('d:r-justinian', 'codex'),
    rel('d:r-justinian', 'hagia-sophia'),
    rel('constantinople-founded', 'fall-1453'),
    rel('crusade-1204', 'fall-1453'),
  ];
  return {
    format: 'openchronology',
    version: 1,
    title: 'Ancient Rome: from the founding to the fall',
    description:
      "Ancient Rome from its legendary founding in 753 BCE through the kings, the Republic and the Empire, to the deposition of the last western emperor in 476 CE, with the Eastern Empire to the fall of Constantinople in 1453 as an epilogue: its eras, dynasties and major reigns, its wars and battles, its laws, buildings, roads and aqueducts, and the writers we know it from. A sample timeline built from the sources cited on each moment.\n\n**How to read it.** Chapter headings mark the eras. Eras are navy bands, the legendary kings light grey, dynasties grey, reigns ochre, wars brick, political struggles green and the Eastern Empire purple; everything else is a moment, linked to the article it draws on. Related things (a battle and the war it ended, a law and the law it led to) are linked. The tag `legend` marks what we know only from tradition.\n\n**Dates.** The line is the Gregorian calendar extended back. Years before about 300 BCE are the traditional (Varronian) ones, and the kings' reigns are legend. Before 45 BCE, days are dates in the old Roman calendar, which had drifted from the seasons (by about two and a half months in 168 BCE); their Julian equivalent is mostly unknown, so they are placed as if they were Julian. From 45 BCE days are Julian: the Gregorian line shows them one or two days earlier before 200 CE, on the same day in the 3rd century, and one to nine days later after it (the fall of Constantinople, 29 May 1453, reads 7 June). Either way, the source's date is kept under **Historical dates**, and each moment's **Date precision** says how it is dated. A date known only to its year sits at mid-year (1 July).",
    presentation: {
      mode: 'gregorian',
      unit: '',
      scale: '1/1',
      origin: '0/1',
      version: 1,
      offsetMinutes: 0,
      significantDigits: 6,
    },
    tags: ['history', 'ancient rome', 'antiquity', 'education'],
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
