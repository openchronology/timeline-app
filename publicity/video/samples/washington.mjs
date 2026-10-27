// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// George Washington (1732–1799), a biography: the sample for Video 17 and Short 14.
// Well-established dates only, each with its source (usually its Wikipedia article; Founders
// Online, the National Archives' edition of Washington's papers, and Mount Vernon's own
// research where they are the natural reference).
//
// Dates are days in Virginia time, approximated as a fixed UTC−5 (Mount Vernon's local mean
// time is about UTC−5:08; there were no time zones yet): each day is placed at local midnight,
// and the one clock time given (his death) is local.
//
// Old Style and New Style: Britain and its colonies kept the Julian calendar, with the year
// beginning on 25 March, until September 1752, when 2 September was followed by 14 September.
// Every date on the line is Gregorian (New Style). Dates before the switch are converted (11
// days added, and the year counted from 1 January), and the date as written at the time is
// kept with the Historical dates plugin.
import { at, m, d, rel, plugins, theme, wiki } from './lib.mjs';

/** A day (or a local time) in Virginia, at a fixed UTC−5. */
const va = (iso) => at(iso.length === 10 ? `${iso}T00:00:00-05:00` : `${iso}-05:00`);
/** The date as written at the time, before Britain's 1752 switch (Historical dates). */
const os = (text) => ({ historicalDate: text, calendar: 'Julian (Old Style)' });
/** A Founders Online document (the Papers of George Washington). */
const founders = (id) => `https://founders.archives.gov/documents/Washington/${id}`;
/** A page of Mount Vernon's research library. */
const mv = (path) => `https://www.mountvernon.org/${path}`;

const LIFE = '#6b5a43',
  HOME = '#4f6b3a',
  OFFICE = '#1f3a5f',
  WAR = '#9c3b2a',
  FAMILY = '#a8742a',
  SLAVERY = '#5b3f6b';
/** Each tag's colour, for moments; a moment takes its first tag's. */
const COLOR = {
  family: FAMILY,
  land: HOME,
  slavery: SLAVERY,
  war: WAR,
  politics: OFFICE,
  presidency: OFFICE,
  writing: '#3d6f73',
  world: LIFE,
};

export function washington(core) {
  const h = (id, iso, title) => m(id, va(iso), title, { headingLevel: 'h2', tags: ['chapter'] });
  const e = (id, iso, title, o) => m(id, va(iso), title, { color: COLOR[o.tags[0]], ...o });
  const span = (id, a, b, title, o) => d(id, va(a), va(b), title, o);
  const events = [
    // ── Youth ───────────────────────────────────────────────────────────────────────────
    h('h-youth', '1732-01-01', 'Youth in Virginia'),
    e('birth', '1732-02-22', 'Born at Popes Creek', {
      tags: ['family'],
      notes:
        '**George Washington** is born at Popes Creek, Westmoreland County, Virginia, the first child of **Augustine Washington** and his second wife, **Mary Ball Washington**. The date was written at the time as 11 February 1731/32, in the Old Style; on the Gregorian calendar it is 22 February 1732, the birthday he kept after 1752.',
      sources: [wiki('George_Washington'), wiki('George_Washington_Birthplace_National_Monument')],
      ...os('11 February 1731/32'),
      datePrecision: 'Gregorian date; Old Style 11 February 1731/32 (the year began on 25 March)',
    }),
    e('hunting-creek', '1735-01-01', 'Move to Little Hunting Creek', {
      tags: ['family', 'land'],
      notes:
        'The family moves up the Potomac to Augustine’s plantation on **Little Hunting Creek**, the land that later became Mount Vernon.',
      sources: [wiki('Mount_Vernon')],
      datePrecision: 'Year only',
      ...os('1735'),
    }),
    e('ferry-farm', '1738-12-01', 'Move to Ferry Farm', {
      tags: ['family', 'land'],
      notes:
        'The family moves to **Ferry Farm**, on the Rappahannock across from Fredericksburg, where George spends most of his boyhood.',
      sources: [wiki('Ferry_Farm')],
      datePrecision: 'Late 1738; the day is not known',
      ...os('1738'),
    }),
    e('father-dies', '1743-04-23', 'His father dies', {
      tags: ['family', 'slavery'],
      notes:
        '**Augustine Washington** dies at Ferry Farm when George is eleven. George inherits Ferry Farm and ten enslaved people; his elder half-brother **Lawrence** inherits Little Hunting Creek.',
      sources: [wiki('Augustine_Washington')],
      ...os('12 April 1743'),
    }),
    e('mount-vernon-named', '1743-07-01', 'Lawrence names Mount Vernon', {
      tags: ['family', 'land'],
      notes:
        '**Lawrence Washington** marries **Anne Fairfax** and names the Little Hunting Creek estate **Mount Vernon**, after Admiral Edward Vernon, under whom he had served. The Fairfax connection opens doors for George.',
      sources: [wiki('Lawrence_Washington_(1718–1752)'), wiki('Mount_Vernon')],
      datePrecision: 'Year only (1743)',
      ...os('1743'),
    }),
    e('culpeper', '1749-07-31', 'Surveyor of Culpeper County', {
      tags: ['land'],
      notes:
        'Licensed by the College of William & Mary, Washington takes the oath as surveyor of the new **Culpeper County**, at seventeen. He gave up the post in 1750 but went on surveying, and buying land, in the Shenandoah Valley.',
      sources: [wiki('George_Washington')],
      ...os('20 July 1749'),
    }),
    e('barbados-sail', '1751-10-09', 'Sails for Barbados', {
      tags: ['family'],
      notes:
        'Washington sails with **Lawrence**, who is ill with tuberculosis, hoping the climate will help him. It is the only time George ever leaves mainland North America.',
      sources: [founders('01-01-02-0002-0002'), wiki('George_Washington_House_(Barbados)')],
      ...os('28 September 1751'),
    }),
    e('smallpox', '1751-11-28', 'Smallpox in Barbados', {
      tags: ['family'],
      notes:
        'Two weeks after landing at Bridgetown, George falls ill with **smallpox**. He recovers, lightly scarred, and immune: a protection that mattered when the disease swept the Continental Army.',
      sources: [wiki('George_Washington_House_(Barbados)'), wiki('George_Washington')],
      ...os('17 November 1751'),
    }),
    e('lawrence-dies', '1752-08-06', 'Lawrence dies', {
      tags: ['family', 'land'],
      notes:
        '**Lawrence Washington** dies of tuberculosis at Mount Vernon. The estate passes to his widow **Anne** and their daughter, with George to inherit if the daughter died without heirs.',
      sources: [wiki('Lawrence_Washington_(1718–1752)')],
      ...os('26 July 1752'),
    }),
    e('new-style', '1752-09-14', 'Britain switches calendars', {
      tags: ['world'],
      notes:
        'Under the **Calendar Act** of 1750, Britain and its colonies adopt the Gregorian calendar: Wednesday 2 September 1752 is followed by Thursday 14 September. The year had already been made to begin on 1 January. Washington’s birthday moves from 11 to 22 February.',
      sources: [wiki('Calendar_(New_Style)_Act_1750'), wiki('Old_Style_and_New_Style_dates')],
    }),
    e('freemason', '1752-11-04', 'Becomes a Freemason', {
      tags: ['family'],
      notes: 'Washington is initiated into the **Masonic lodge** at Fredericksburg, at twenty.',
      sources: [wiki('George_Washington')],
    }),
    e('adjutant', '1752-12-13', 'Adjutant, with the rank of major', {
      tags: ['war'],
      notes:
        'Governor **Robert Dinwiddie** commissions him adjutant of Virginia’s southern militia district, with the rank of major: the post Lawrence had held for the whole colony.',
      sources: [founders('02-01-02-0024')],
    }),
    // ── The Virginia Regiment ──────────────────────────────────────────────────────────────
    h('h-regiment', '1753-07-01', 'The Virginia Regiment'),
    e('le-boeuf-set-out', '1753-10-31', 'Sent to warn the French', {
      tags: ['war'],
      notes:
        'Dinwiddie sends him from Williamsburg to the French commander in the Ohio Country, with a letter demanding that France withdraw from land Virginia claimed.',
      sources: [wiki('Fort_Le_Boeuf'), wiki('George_Washington')],
    }),
    e('le-boeuf', '1753-12-11', 'At Fort Le Boeuf', {
      tags: ['war'],
      notes:
        'Washington reaches **Fort Le Boeuf**, near Lake Erie, and delivers the letter. The French commander, **Jacques Legardeur de Saint-Pierre**, politely refuses to leave.',
      sources: [wiki('Fort_Le_Boeuf')],
    }),
    e('journal', '1754-01-16', 'Back in Williamsburg: his journal', {
      tags: ['writing', 'war'],
      notes:
        'After a winter journey (he nearly drowned crossing the Allegheny), he reports to Dinwiddie, who has his account printed as **The Journal of Major George Washington**; it is reprinted in London and makes his name.',
      sources: [wiki('George_Washington'), founders('01-01-02-0003-0002')],
    }),
    e('lt-colonel', '1754-03-15', 'Lieutenant colonel', {
      tags: ['war'],
      notes:
        'Commissioned lieutenant colonel and second in command of the new **Virginia Regiment**, he leads its advance party toward the Forks of the Ohio.',
      sources: [wiki('Virginia_Regiment'), wiki('Battle_of_Fort_Necessity')],
      datePrecision: 'March 1754; the day is approximate',
    }),
    e('jumonville', '1754-05-28', 'Jumonville Glen', {
      tags: ['war'],
      notes:
        'Washington’s men and **Tanacharison**’s Mingo warriors surprise a French party in a glen; its commander, **Joseph Coulon de Jumonville**, is among the dead. The skirmish helps set off the **French and Indian War**.',
      sources: [wiki('Battle_of_Jumonville_Glen')],
    }),
    e('fort-necessity', '1754-07-03', 'Surrender at Fort Necessity', {
      tags: ['war'],
      notes:
        'Colonel since Joshua Fry’s death, Washington is besieged at **Fort Necessity** by a larger French and Indian force and surrenders. The terms he signed, in French, called Jumonville’s death an assassination, a phrase he later said had been mistranslated to him.',
      sources: [wiki('Battle_of_Fort_Necessity')],
    }),
    e('resigns-1754', '1754-11-01', 'Resigns his commission', {
      tags: ['war'],
      notes:
        'When the regiment is broken into independent companies, where he would rank as a captain, he resigns rather than accept the demotion.',
      sources: [wiki('George_Washington')],
      datePrecision: 'Late 1754; the day is approximate',
    }),
    e('lease', '1754-12-17', 'Leases Mount Vernon', {
      tags: ['land', 'slavery'],
      notes:
        'Lawrence’s widow **Anne**, now married to George Lee, leases Mount Vernon to George, with the enslaved people who belonged to it, for a yearly rent of tobacco or cash.',
      sources: [founders('02-01-02-0116'), wiki('Mount_Vernon')],
    }),
    e('braddock-aide', '1755-05-10', 'Aide to General Braddock', {
      tags: ['war'],
      notes:
        'Washington joins Major General **Edward Braddock**’s expedition against Fort Duquesne as a volunteer aide-de-camp, without rank.',
      sources: [wiki('Braddock_Expedition')],
    }),
    e('monongahela', '1755-07-09', 'Braddock’s defeat', {
      tags: ['war'],
      notes:
        'At the **Battle of the Monongahela**, French troops and their Native allies rout Braddock’s army; Braddock is mortally wounded. Washington, with two horses shot under him and bullet holes in his coat, helps organize the retreat.',
      sources: [wiki('Battle_of_the_Monongahela')],
    }),
    e('colonel-1755', '1755-08-14', 'Colonel of the Virginia Regiment', {
      tags: ['war'],
      notes:
        'Dinwiddie appoints him colonel of the re-formed **Virginia Regiment** and commander of all Virginia’s forces, at twenty-three, to defend a long frontier.',
      sources: [founders('02-02-02-0001-0002'), wiki('Virginia_Regiment')],
    }),
    e('elected-burgess', '1758-07-24', 'Elected a burgess', {
      tags: ['politics'],
      notes:
        'While still on campaign, he is elected to the **House of Burgesses** for Frederick County, where he had lost in 1755.',
      sources: [wiki('George_Washington'), wiki('House_of_Burgesses')],
    }),
    e('loyalhanna', '1758-11-12', 'Friendly fire near Loyalhanna', {
      tags: ['war'],
      notes:
        'In the dusk, two parties of Virginians fire on each other near Fort Ligonier; fourteen are killed. Washington rides between the lines to stop it.',
      sources: [wiki('Forbes_Expedition'), wiki('George_Washington')],
    }),
    e('duquesne', '1758-11-25', 'Fort Duquesne taken', {
      tags: ['war'],
      notes:
        'The French blow up and abandon **Fort Duquesne** as General **John Forbes**’s army arrives; the British build Fort Pitt on the site, today’s Pittsburgh.',
      sources: [wiki('Forbes_Expedition'), wiki('Fort_Duquesne')],
    }),
    e('resigns-1758', '1758-12-15', 'Leaves the army', {
      tags: ['war'],
      notes:
        'Denied the regular British commission he had sought, and with the Ohio frontier secured, he resigns his commission at the end of 1758.',
      sources: [wiki('Virginia_Regiment'), wiki('George_Washington')],
      datePrecision: 'December 1758; the day is approximate',
    }),
    // ── Planter and burgess ─────────────────────────────────────────────────────────────
    h('h-planter', '1758-12-31', 'Planter and burgess'),
    e('marriage', '1759-01-06', 'Marries Martha Custis', {
      tags: ['family', 'slavery'],
      notes:
        'He marries **Martha Dandridge Custis**, a wealthy widow, at her home in New Kent County. She brings her two children, **John Parke (Jacky)** and **Martha Parke (Patsy) Custis**, and the use of the Custis estate’s "dower" enslaved people, who could not be freed by either of them.',
      sources: [wiki('Martha_Washington'), wiki('George_Washington')],
    }),
    e('inherits', '1761-03-14', 'Owner of Mount Vernon', {
      tags: ['land'],
      notes:
        'Anne Fairfax Lee dies, and Mount Vernon passes to George outright. Over the next decades he enlarges the house and doubles the estate to about 6,500 acres.',
      sources: [wiki('Mount_Vernon')],
      datePrecision: 'March 1761',
    }),
    e('wheat', '1766-01-01', 'From tobacco to wheat', {
      tags: ['land'],
      notes:
        'Tired of debt to London merchants and of worn-out soil, he stops growing tobacco as Mount Vernon’s cash crop and turns to wheat, a mill and later a fishery.',
      sources: [wiki('Mount_Vernon')],
      datePrecision: 'About 1766',
    }),
    e('william-lee', '1768-01-01', 'Buys William Lee', {
      tags: ['slavery'],
      notes:
        'Washington buys **William Lee**, a young enslaved man, and his brother Frank from the estate of Mary Lee. William became his valet and rode beside him through the whole Revolutionary War.',
      sources: [wiki('William_Lee_(valet)')],
      datePrecision: 'Year only (1768)',
    }),
    e('nonimportation', '1769-05-18', 'The Virginia Association', {
      tags: ['politics'],
      notes:
        'After the governor dissolves the House of Burgesses, its members meet at Raleigh Tavern and adopt a boycott of British goods drafted by **George Mason** and presented by Washington.',
      sources: [wiki('Virginia_Association')],
    }),
    e('patsy-dies', '1773-06-19', 'Patsy Custis dies', {
      tags: ['family'],
      notes:
        'His stepdaughter **Patsy**, who had suffered from epilepsy since childhood, dies at Mount Vernon after a seizure, at seventeen.',
      sources: [wiki('John_Parke_Custis'), wiki('Martha_Washington')],
    }),
    e('jacky-marries', '1774-02-03', 'Jacky Custis marries', {
      tags: ['family'],
      notes: '**John Parke Custis** marries **Eleanor Calvert** of Maryland.',
      sources: [wiki('John_Parke_Custis')],
    }),
    e('fairfax-resolves', '1774-07-18', 'The Fairfax Resolves', {
      tags: ['politics', 'writing'],
      notes:
        'A Fairfax County meeting chaired by Washington adopts resolutions, written chiefly by **George Mason**, against Parliament’s Coercive Acts and calling for a boycott and a congress of the colonies.',
      sources: [wiki('Fairfax_Resolves')],
    }),
    e('delegate', '1774-08-05', 'Chosen for Congress', {
      tags: ['politics'],
      notes:
        'The first **Virginia Convention** chooses him as one of seven delegates to a Continental Congress in Philadelphia.',
      sources: [wiki('First_Continental_Congress')],
    }),
    // ── Revolution ──────────────────────────────────────────────────────────────────────
    h('h-revolution', '1775-01-01', 'Revolution'),
    e('lexington', '1775-04-19', 'Lexington and Concord', {
      tags: ['world', 'war'],
      notes:
        'The first battles of the **American Revolutionary War**, in Massachusetts. Washington is at Mount Vernon.',
      sources: [wiki('Battles_of_Lexington_and_Concord')],
    }),
    e('leaves-home', '1775-05-04', 'Leaves Mount Vernon for Congress', {
      tags: ['politics', 'land'],
      notes:
        'Washington sets out for the Second Continental Congress in Philadelphia. He would not see Mount Vernon again for more than six years.',
      sources: [wiki('George_Washington')],
    }),
    e('second-congress', '1775-05-10', 'The Second Continental Congress', {
      tags: ['politics'],
      notes:
        'The **Second Continental Congress** meets in Philadelphia. Washington, the delegate with the most military experience, attends in his old uniform.',
      sources: [wiki('Second_Continental_Congress')],
    }),
    e('chosen', '1775-06-15', 'Chosen commander-in-chief', {
      tags: ['war', 'politics'],
      notes:
        'Congress votes unanimously for Washington, nominated by **John Adams**, to command the new **Continental Army**. He accepts the next day, refusing a salary and asking only for his expenses.',
      sources: [wiki('George_Washington'), wiki('Continental_Army')],
    }),
    e('cambridge', '1775-07-03', 'Takes command at Cambridge', {
      tags: ['war'],
      notes:
        'Washington takes command of the New England troops besieging Boston, an army short of gunpowder, discipline and enlistments.',
      sources: [wiki('Siege_of_Boston')],
    }),
    e('black-enlistment', '1775-12-30', 'Free Black soldiers may re-enlist', {
      tags: ['war', 'slavery'],
      notes:
        'Reversing his earlier order, Washington allows free Black soldiers already serving to re-enlist; Congress agrees. Later in the war, Black soldiers served in many regiments, among them the **1st Rhode Island**.',
      sources: [wiki('African_Americans_in_the_Revolutionary_War')],
    }),
    e('dorchester', '1776-03-04', 'Guns on Dorchester Heights', {
      tags: ['war'],
      notes:
        'In one night his men fortify **Dorchester Heights** with the cannon **Henry Knox** had hauled from Fort Ticonderoga, putting the British fleet in Boston Harbor in range.',
      sources: [wiki('Fortification_of_Dorchester_Heights')],
    }),
    e('boston-evacuated', '1776-03-17', 'The British leave Boston', {
      tags: ['war'],
      notes: 'General **William Howe** evacuates Boston by sea: the siege ends.',
      sources: [wiki('Siege_of_Boston')],
    }),
    e('declaration-read', '1776-07-09', 'The Declaration read to the army', {
      tags: ['war', 'politics'],
      notes:
        'In New York, Washington has the **Declaration of Independence**, adopted in Philadelphia on July 4, read aloud to his troops.',
      sources: [wiki('United_States_Declaration_of_Independence')],
    }),
    e('long-island', '1776-08-27', 'Battle of Long Island', {
      tags: ['war'],
      notes:
        'Howe outflanks the Americans in Brooklyn. Two nights later Washington ferries the whole army across the East River to Manhattan, unseen.',
      sources: [wiki('Battle_of_Long_Island')],
    }),
    e('harlem-heights', '1776-09-16', 'Harlem Heights', {
      tags: ['war'],
      notes:
        'After the rout at Kip’s Bay the day before, his troops hold their ground on upper Manhattan.',
      sources: [wiki('Battle_of_Harlem_Heights')],
    }),
    e('fort-washington', '1776-11-16', 'Fort Washington falls', {
      tags: ['war'],
      notes:
        'The fort on upper Manhattan surrenders with nearly 3,000 men. The army retreats across New Jersey into Pennsylvania.',
      sources: [wiki('Battle_of_Fort_Washington')],
    }),
    e('crossing', '1776-12-25', 'Crossing the Delaware', {
      tags: ['war'],
      notes:
        'On the night of December 25–26, in sleet and ice, Washington crosses the **Delaware River** at McConkey’s Ferry with about 2,400 men.',
      sources: [wiki("George_Washington's_crossing_of_the_Delaware_River")],
    }),
    e('trenton', '1776-12-26', 'Trenton', {
      tags: ['war'],
      notes:
        'At dawn the army surprises the **Hessian** garrison at Trenton and takes about 900 prisoners: a small victory that revives the cause.',
      sources: [wiki('Battle_of_Trenton')],
    }),
    e('princeton', '1777-01-03', 'Princeton', {
      tags: ['war'],
      notes:
        'Slipping away from Cornwallis at the Assunpink Creek overnight, Washington defeats a British force at **Princeton**, then winters at Morristown.',
      sources: [wiki('Battle_of_Princeton')],
    }),
    e('inoculation', '1777-02-05', 'The army is inoculated', {
      tags: ['war'],
      notes:
        'Washington orders the secret **inoculation** of new recruits against smallpox, one of the first mass inoculations of an army.',
      sources: [wiki('George_Washington'), wiki('Smallpox')],
      datePrecision: 'February 1777',
    }),
    e('brandywine', '1777-09-11', 'Brandywine', {
      tags: ['war'],
      notes:
        'Howe outflanks Washington at **Brandywine Creek**; Philadelphia, the capital, falls two weeks later.',
      sources: [wiki('Battle_of_Brandywine')],
    }),
    e('germantown', '1777-10-04', 'Germantown', {
      tags: ['war'],
      notes:
        'A dawn attack on the British camp at **Germantown** fails in fog and confusion, but impresses European observers.',
      sources: [wiki('Battle_of_Germantown')],
    }),
    e('saratoga', '1777-10-17', 'Burgoyne surrenders at Saratoga', {
      tags: ['world', 'war'],
      notes:
        'General **Horatio Gates**’s Northern Army forces the surrender of **John Burgoyne**’s army in New York: the victory that brought France into the war.',
      sources: [wiki('Battles_of_Saratoga')],
    }),
    e('french-alliance', '1778-02-06', 'Alliance with France', {
      tags: ['world', 'war'],
      notes: 'France and the United States sign the **Treaty of Alliance** in Paris.',
      sources: [wiki('Treaty_of_Alliance_(1778)')],
    }),
    e('steuben', '1778-02-23', 'Steuben arrives at Valley Forge', {
      tags: ['war'],
      notes:
        '**Baron von Steuben**, a former Prussian officer, begins drilling the army; Washington makes him inspector general.',
      sources: [wiki('Friedrich_Wilhelm_von_Steuben')],
    }),
    e('monmouth', '1778-06-28', 'Monmouth', {
      tags: ['war'],
      notes:
        'Catching the British army leaving Philadelphia, Washington rallies the retreating troops of **Charles Lee** in the heat at **Monmouth**: a drawn battle that showed the drilled army could stand.',
      sources: [wiki('Battle_of_Monmouth')],
    }),
    e('arnold', '1780-09-25', 'Arnold’s treason', {
      tags: ['war'],
      notes:
        'Washington discovers that **Benedict Arnold**, commanding West Point, had plotted to surrender it to the British. Arnold escapes to a British ship.',
      sources: [wiki('Benedict_Arnold')],
    }),
    e('savage', '1781-04-14', 'Seventeen leave on HMS Savage', {
      tags: ['slavery', 'war'],
      notes:
        'When the British sloop **HMS Savage** anchors off Mount Vernon, seventeen enslaved people (among them **Deborah Squash** and, by his own account, **Harry Washington**, who had left earlier) are listed as gone to the British. Seven were later returned.',
      sources: [
        mv('library/digitalhistory/digital-encyclopedia/article/h-m-s-savage/'),
        wiki('Deborah_Squash'),
      ],
      datePrecision: 'April 1781; Lund Washington wrote of it on April 18',
    }),
    e('home-1781', '1781-09-09', 'Home for the first time since 1775', {
      tags: ['war', 'land'],
      notes:
        'On the march south to Yorktown, Washington rides ahead and reaches **Mount Vernon**, his first visit home since May 1775. **Rochambeau** joins him the next evening; they leave on September 12.',
      sources: [
        'https://www.nps.gov/waro/learn/historyculture/george-washington-and-the-trail.htm',
        wiki('Siege_of_Yorktown'),
      ],
    }),
    e('cornwallis-surrenders', '1781-10-19', 'Surrender at Yorktown', {
      tags: ['war'],
      notes:
        '**Cornwallis** surrenders his army to the American and French forces of Washington and **Rochambeau**, with a French fleet holding the Chesapeake.',
      sources: [wiki('Siege_of_Yorktown')],
    }),
    e('jacky-dies', '1781-11-05', 'Jacky Custis dies', {
      tags: ['family'],
      notes:
        '**John Parke Custis**, serving as a civilian aide at Yorktown, dies of camp fever. George and Martha take in his two youngest children, **Nelly** and **George Washington Parke Custis**, and raise them at Mount Vernon.',
      sources: [wiki('John_Parke_Custis')],
    }),
    e('nicola', '1782-05-22', 'He rejects a crown', {
      tags: ['politics', 'writing'],
      notes:
        'Colonel **Lewis Nicola** writes suggesting that the army make Washington a king. Washington replies at once that he has read it "with abhorrence".',
      sources: [wiki('Lewis_Nicola')],
    }),
    e('newburgh', '1783-03-15', 'The Newburgh address', {
      tags: ['war', 'writing'],
      notes:
        'Unpaid officers at Newburgh are urged, in anonymous letters, to defy Congress. Washington meets them and, putting on spectacles to read a letter, says he has grown gray and almost blind in their service. The **Newburgh conspiracy** collapses.',
      sources: [wiki('Newburgh_Conspiracy')],
    }),
    e('paris', '1783-09-03', 'Treaty of Paris', {
      tags: ['world'],
      notes: 'Britain recognizes the independence of the United States.',
      sources: [wiki('Treaty_of_Paris_(1783)')],
    }),
    e('evacuation-day', '1783-11-25', 'Into New York', {
      tags: ['war'],
      notes: 'The last British troops leave New York City, and Washington rides in.',
      sources: [wiki('Evacuation_Day_(New_York)')],
    }),
    e('fraunces', '1783-12-04', 'Farewell at Fraunces Tavern', {
      tags: ['war'],
      notes: 'Washington takes leave of his officers at **Fraunces Tavern** in New York.',
      sources: [wiki('Fraunces_Tavern')],
    }),
    e('annapolis', '1783-12-23', 'Resigns his commission', {
      tags: ['war', 'politics'],
      notes:
        'At **Annapolis**, where Congress is sitting, Washington returns his commission and retires to private life, home at Mount Vernon by Christmas Eve. King **George III** is reported to have said that a man who gave up power so would be the greatest in the world.',
      sources: [wiki("George_Washington's_resignation_as_commander-in-chief")],
    }),
    // ── A new constitution ──────────────────────────────────────────────────────────────
    h('h-constitution', '1784-03-01', 'A new constitution'),
    e('mv-conference', '1785-03-28', 'The Mount Vernon Conference', {
      tags: ['politics'],
      notes:
        'Delegates of **Virginia and Maryland**, meeting at Mount Vernon with Washington as host, agree on the use of the Potomac and the Chesapeake. Their success led to the Annapolis Convention.',
      sources: [wiki('Mount_Vernon_Conference')],
    }),
    e('potomac-company', '1785-05-17', 'President of the Potomac Company', {
      tags: ['land'],
      notes:
        'Washington becomes president of the **Potomac Company**, formed to make the river navigable to the West with canals around its falls.',
      sources: [wiki('Potomac_Company')],
    }),
    e('census-1786', '1786-02-18', 'Counting Mount Vernon’s enslaved community', {
      tags: ['slavery'],
      notes:
        'Washington lists the enslaved people at Mount Vernon by name, farm and work: 216 people.',
      sources: [
        mv(
          'library/digitalhistory/digital-encyclopedia/article/census-of-the-enslaved-population-at-mount-vernon-1786-and-1799',
        ),
      ],
      datePrecision: 'February 1786',
    }),
    e('annapolis-convention', '1786-09-14', 'Annapolis Convention', {
      tags: ['politics', 'world'],
      notes:
        'Delegates from five states, meeting on trade, call for a convention in Philadelphia to revise the Articles of Confederation.',
      sources: [wiki('Annapolis_Convention_(1786)')],
    }),
    e('convention-president', '1787-05-25', 'President of the Convention', {
      tags: ['politics'],
      notes:
        'As the **Constitutional Convention** reaches a quorum in Philadelphia, the delegates elect Washington its president, unanimously. He seldom speaks in debate.',
      sources: [wiki('Constitutional_Convention_(United_States)')],
    }),
    e('constitution', '1787-09-17', 'The Constitution signed', {
      tags: ['politics', 'writing'],
      notes:
        'Washington signs first, as president of the Convention, then as a delegate of Virginia.',
      sources: [wiki('Constitution_of_the_United_States')],
    }),
    e('ninth-state', '1788-06-21', 'The Constitution ratified', {
      tags: ['politics', 'world'],
      notes:
        '**New Hampshire** is the ninth state to ratify, enough to put the Constitution in effect.',
      sources: [wiki('History_of_the_United_States_Constitution')],
    }),
    // ── The presidency ───────────────────────────────────────────────────────────────────
    h('h-presidency', '1789-01-01', 'The presidency'),
    e('elected', '1789-04-06', 'Elected president', {
      tags: ['presidency'],
      notes:
        'Congress counts the electoral votes: every elector has voted for Washington; **John Adams** is vice president. Charles Thomson brings him the news at Mount Vernon on April 14.',
      sources: [wiki('1788–89_United_States_presidential_election')],
    }),
    e('inaugurated', '1789-04-30', 'First inauguration', {
      tags: ['presidency', 'writing'],
      notes:
        'On the balcony of **Federal Hall** in New York he takes the oath as the first president, then gives his inaugural address to Congress inside.',
      sources: [wiki('First_inauguration_of_George_Washington')],
    }),
    e('mother-dies', '1789-08-25', 'His mother dies', {
      tags: ['family'],
      notes: '**Mary Ball Washington** dies in Fredericksburg, aged about eighty.',
      sources: [wiki('Mary_Ball_Washington')],
    }),
    e('cabinet', '1789-09-11', 'The first cabinet', {
      tags: ['presidency'],
      notes:
        '**Alexander Hamilton** is confirmed as Secretary of the Treasury, **Henry Knox** (War) the next day and **Edmund Randolph** (Attorney General) later that month. **Thomas Jefferson** takes up the State Department in March 1790. Washington meets them together: the first cabinet.',
      sources: [wiki('Presidency_of_George_Washington')],
    }),
    e('thanksgiving', '1789-10-03', 'Thanksgiving proclamation', {
      tags: ['presidency', 'writing'],
      notes:
        'At Congress’s request he proclaims Thursday, November 26, a national day of thanksgiving.',
      sources: [wiki('Thanksgiving_(United_States)')],
    }),
    e('residence-act', '1790-07-16', 'The Residence Act', {
      tags: ['presidency'],
      notes:
        'Washington signs the law placing a permanent capital on the **Potomac**, its exact site his to choose, with Philadelphia the capital meanwhile.',
      sources: [wiki('Residence_Act')],
    }),
    e('touro', '1790-08-18', 'Letter to the Newport congregation', {
      tags: ['writing', 'presidency'],
      notes:
        'To the Hebrew Congregation of **Newport**, he writes that the government "gives to bigotry no sanction, to persecution no assistance".',
      sources: [wiki('Letter_to_the_Hebrew_Congregation_in_Newport')],
    }),
    e('bank', '1791-02-25', 'The first Bank', {
      tags: ['presidency'],
      notes:
        'After asking his cabinet whether it is constitutional (Hamilton yes, Jefferson and Randolph no), he signs the bill chartering the **First Bank of the United States**.',
      sources: [wiki('First_Bank_of_the_United_States')],
    }),
    e('rotation', '1791-04-12', 'Rotating the enslaved out of Pennsylvania', {
      tags: ['slavery', 'presidency'],
      notes:
        'Pennsylvania’s 1780 gradual abolition law freed enslaved people brought into the state after six months there. Washington’s secretary is told to send the President’s House’s enslaved workers back to Virginia before their time ran out.',
      sources: [wiki("President's_House_(Philadelphia)")],
      datePrecision: 'April 1791 (his letter to Tobias Lear)',
    }),
    e('first-veto', '1792-04-05', 'First veto', {
      tags: ['presidency'],
      notes:
        'Washington vetoes a bill apportioning seats in the House, the first presidential veto, finding it unconstitutional.',
      sources: [wiki('Presidency_of_George_Washington')],
    }),
    e('fugitive-slave-act', '1793-02-12', 'The Fugitive Slave Act', {
      tags: ['slavery', 'presidency'],
      notes:
        'Washington signs the **Fugitive Slave Act**, which let enslavers seize people who had escaped to other states.',
      sources: [wiki('Fugitive_Slave_Act_of_1793')],
    }),
    e('second-inauguration', '1793-03-04', 'Second inauguration', {
      tags: ['presidency', 'writing'],
      notes:
        'Unanimously re-elected, he takes the oath in **Congress Hall**, Philadelphia, and gives the shortest inaugural address, 135 words.',
      sources: [wiki('Second_inauguration_of_George_Washington')],
    }),
    e('neutrality', '1793-04-22', 'Neutrality Proclamation', {
      tags: ['presidency', 'writing'],
      notes:
        'With Britain and revolutionary France at war, he declares the United States "friendly and impartial" toward both.',
      sources: [wiki('Proclamation_of_Neutrality')],
    }),
    e('capitol', '1793-09-18', 'The Capitol’s cornerstone', {
      tags: ['presidency'],
      notes:
        'In a Masonic ceremony, Washington lays the cornerstone of the **Capitol** in the new federal city.',
      sources: [wiki('United_States_Capitol')],
    }),
    e('bower-hill', '1794-07-16', 'Attack on Bower Hill', {
      tags: ['presidency'],
      notes:
        'In western Pennsylvania, armed men opposed to the federal **whiskey tax** attack the home of the tax inspector **John Neville**.',
      sources: [wiki('Whiskey_Rebellion')],
    }),
    e('whiskey-proclamation', '1794-08-07', 'He calls out the militia', {
      tags: ['presidency', 'writing'],
      notes:
        'Washington proclaims the rebels must disperse and calls up nearly 13,000 militia from four states.',
      sources: [wiki('Whiskey_Rebellion')],
    }),
    e('whiskey-carlisle', '1794-10-04', 'In the field again', {
      tags: ['presidency', 'war'],
      notes:
        'Washington joins the militia army at **Carlisle**, Pennsylvania, the only sitting president to lead troops in the field. The rebellion collapses as the army marches west.',
      sources: [wiki('Whiskey_Rebellion')],
      datePrecision: 'Early October 1794',
    }),
    e('jay-treaty', '1794-11-19', 'The Jay Treaty signed', {
      tags: ['presidency'],
      notes:
        '**John Jay** signs a treaty with Britain in London: the British leave their western forts, but much else is left unsettled. Published in 1795, it divides the country.',
      sources: [wiki('Jay_Treaty')],
    }),
    e('jay-ratified', '1795-06-24', 'The Senate approves the Jay Treaty', {
      tags: ['presidency'],
      notes:
        'The Senate consents by 20 to 10, exactly two thirds. Washington signs it that summer despite protests; it takes effect in 1796.',
      sources: [wiki('Jay_Treaty')],
    }),
    e('ona-judge', '1796-05-21', 'Ona Judge escapes', {
      tags: ['slavery'],
      notes:
        '**Ona Judge**, Martha’s enslaved maid, slips out of the President’s House in Philadelphia and reaches Portsmouth, New Hampshire. Washington’s efforts to have her returned fail; she lived free until her death in 1848.',
      sources: [wiki('Ona_Judge')],
    }),
    e('farewell', '1796-09-19', 'The Farewell Address', {
      tags: ['presidency', 'writing'],
      notes:
        'Declining a third term, he publishes his **Farewell Address** in a Philadelphia newspaper, warning against faction and permanent foreign alliances.',
      sources: [wiki("George_Washington's_Farewell_Address")],
    }),
    e('hercules', '1797-02-22', 'Hercules escapes', {
      tags: ['slavery'],
      notes:
        '**Hercules Posey**, the celebrated cook of the President’s House, escapes from Mount Vernon on Washington’s 65th birthday; he was never recaptured.',
      sources: [wiki('Hercules_Posey')],
    }),
    e('adams-inaugurated', '1797-03-04', 'Adams succeeds him', {
      tags: ['presidency'],
      notes:
        '**John Adams** is inaugurated in Congress Hall; Washington attends as a private citizen. The first peaceful handover of the presidency.',
      sources: [wiki('Inauguration_of_John_Adams')],
    }),
    // ── Last years ─────────────────────────────────────────────────────────────────────
    h('h-last', '1797-03-06', 'Last years'),
    e('provisional-army', '1798-07-04', 'Commander once more', {
      tags: ['war'],
      notes:
        'Facing war with France, President Adams commissions Washington lieutenant general and commander of a new **Provisional Army**. He accepts on condition he not take the field unless an invasion comes; **Hamilton** does the work.',
      sources: [wiki('Quasi-War'), wiki('George_Washington')],
    }),
    e('census-1799', '1799-06-01', 'The 1799 list', {
      tags: ['slavery'],
      notes:
        'Washington lists 317 enslaved people at Mount Vernon: 123 his own, 153 "dower" people of the Custis estate, and 40 rented from a neighbour, many of them married across those lines.',
      sources: [
        mv(
          'library/digitalhistory/digital-encyclopedia/article/census-of-the-enslaved-population-at-mount-vernon-1786-and-1799',
        ),
      ],
      datePrecision: 'Summer 1799',
    }),
    e('will', '1799-07-09', 'He signs his will', {
      tags: ['slavery', 'writing', 'family'],
      notes:
        'In his will, written in his own hand, Washington provides that the people he owned are to be freed on **Martha**’s death, with the old and sick supported and the young taught to read and a trade. **William Lee** is freed at once, with an annuity. The dower people were not his to free.',
      sources: [
        mv('george-washington/slavery/washingtons-1799-will/'),
        wiki('George_Washington_and_slavery'),
      ],
    }),
    e('last-ride', '1799-12-12', 'A ride in the snow', {
      tags: ['family'],
      notes:
        'He rides his farms for about five hours in snow, sleet and rain, and sits down to dinner without changing his wet clothes. The next day he has a sore throat.',
      sources: [wiki('George_Washington#Death')],
    }),
    e('death', '1799-12-14T22:30:00', 'Dies at Mount Vernon', {
      tags: ['family'],
      notes:
        'After a day of struggling to breathe, bled heavily by his doctors, Washington dies in his bedroom at Mount Vernon, aged 67, with Martha, **Tobias Lear** and several enslaved household servants present. The illness was most likely acute epiglottitis.',
      sources: [wiki('George_Washington#Death')],
      datePrecision: 'Between 10 and 11 p.m. (Tobias Lear’s account); placed at 10:30',
    }),
    e('funeral', '1799-12-18', 'Funeral and burial', {
      tags: ['family'],
      notes: 'He is buried in the family vault at Mount Vernon.',
      sources: [wiki('George_Washington#Funeral_and_burial')],
    }),
    e('eulogy', '1799-12-26', '"First in war, first in peace"', {
      tags: ['writing'],
      notes:
        'In Congress’s memorial in Philadelphia, **Henry "Light-Horse Harry" Lee** calls him "first in war, first in peace, and first in the hearts of his countrymen".',
      sources: [wiki('Henry_Lee_III')],
    }),
    e('freed', '1801-01-01', 'Martha frees them', {
      tags: ['slavery', 'family'],
      notes:
        'Rather than wait for her own death, **Martha Washington** signs a deed in December 1800 freeing the people her husband had owned, and they become free on New Year’s Day 1801. The dower people stay enslaved and pass to the Custis grandchildren.',
      sources: [mv('george-washington/slavery/washingtons-1799-will/'), wiki('Martha_Washington')],
    }),
    e('martha-dies', '1802-05-22', 'Martha Washington dies', {
      tags: ['family'],
      notes: 'Martha dies at Mount Vernon and is buried beside him.',
      sources: [wiki('Martha_Washington')],
    }),
  ];
  const life = (o) => ({ color: LIFE, ...o, tags: ['family', ...(o.tags ?? [])] });
  const home = (o) => ({ color: HOME, ...o, tags: ['land', ...(o.tags ?? [])] });
  const office = (o) => ({ color: OFFICE, ...o });
  const war = (o) => ({ color: WAR, ...o, tags: ['war', ...(o.tags ?? [])] });
  const family = (o) => ({ color: FAMILY, ...o, tags: ['family', ...(o.tags ?? [])] });
  const durations = [
    // Life and its stages
    span(
      'life',
      '1732-02-22',
      '1799-12-14T22:30:00',
      'George Washington, 1732–1799',
      life({
        notes: 'His life, from his birth at Popes Creek to his death at Mount Vernon, aged 67.',
        sources: [wiki('George_Washington')],
      }),
    ),
    span(
      'boyhood',
      '1732-02-22',
      '1748-03-22',
      'Boyhood',
      life({
        notes:
          'To his first surveying expedition, at sixteen. His schooling was short and practical; he never went to college.',
        sources: [wiki('George_Washington')],
      }),
    ),
    span(
      'surveying',
      '1748-03-22',
      '1752-11-01',
      'Surveying years',
      life({
        tags: ['land'],
        notes:
          'Dated here from the Fairfax survey to his first militia commission; his surveys and land purchases continued through his life.',
        sources: [wiki('George_Washington')],
      }),
    ),
    span(
      'planter',
      '1759-01-06',
      '1775-06-15',
      'Planter and burgess',
      life({
        tags: ['land'],
        notes:
          'From his marriage to his appointment as commander-in-chief: Mount Vernon’s years of growth.',
        sources: [wiki('George_Washington')],
      }),
    ),
    span(
      'private',
      '1783-12-24',
      '1789-04-16',
      'Private citizen at Mount Vernon',
      life({
        notes:
          'From his return home after resigning his commission to his departure for New York to be inaugurated.',
        sources: [wiki('George_Washington')],
      }),
    ),
    span(
      'retirement',
      '1797-03-15',
      '1799-12-14T22:30:00',
      'Retirement',
      life({
        notes: 'From his return to Mount Vernon, about mid-March 1797, to his death.',
        sources: [wiki('George_Washington')],
      }),
    ),
    // Residences
    span(
      'popes-creek',
      '1732-02-22',
      '1735-01-01',
      'Popes Creek',
      home({
        notes: 'His birthplace in Westmoreland County; the house burned in 1779.',
        sources: [wiki('George_Washington_Birthplace_National_Monument')],
      }),
    ),
    span(
      'little-hunting-creek',
      '1735-01-01',
      '1738-12-01',
      'Little Hunting Creek',
      home({
        notes: 'The plantation later named Mount Vernon.',
        sources: [wiki('Mount_Vernon')],
      }),
    ),
    span(
      'ferry-farm-home',
      '1738-12-01',
      '1754-12-17',
      'Ferry Farm',
      home({
        notes:
          'His boyhood home and his mother’s, dated here to his lease of Mount Vernon; from his teens he spent long stretches at Mount Vernon and on surveys. His mother lived there until 1772.',
        sources: [wiki('Ferry_Farm')],
      }),
    ),
    span(
      'mount-vernon',
      '1754-12-17',
      '1799-12-14T22:30:00',
      'Mount Vernon',
      home({
        tags: ['slavery'],
        notes:
          'Leased from 1754 and his own from 1761: his home for the rest of his life, though the war and the presidency kept him away for most of sixteen years. Its fields, mill and house were worked by enslaved people, 317 of them by 1799.',
        sources: [wiki('Mount_Vernon')],
      }),
    ),
    span(
      'newburgh-hq',
      '1782-04-01',
      '1783-08-18',
      'Headquarters at Newburgh',
      home({
        tags: ['war'],
        notes: 'The **Hasbrouck House**, on the Hudson, his longest-held wartime headquarters.',
        sources: [wiki("Washington's_Headquarters_State_Historic_Site")],
      }),
    ),
    span(
      'osgood',
      '1789-04-23',
      '1790-02-23',
      'Samuel Osgood House, New York',
      home({
        tags: ['presidency'],
        notes:
          'The first presidential mansion, rented by Congress, where he lived with his family, household staff and enslaved people.',
        sources: [wiki('Samuel_Osgood_House')],
      }),
    ),
    span(
      'macomb',
      '1790-02-23',
      '1790-08-30',
      'Macomb House, New York',
      home({
        tags: ['presidency'],
        notes: 'The second presidential mansion, on Broadway.',
        sources: [wiki('Alexander_Macomb_House')],
      }),
    ),
    span(
      'presidents-house',
      '1790-11-27',
      '1797-03-10',
      'President’s House, Philadelphia',
      home({
        tags: ['presidency', 'slavery'],
        notes:
          'The presidential mansion while Philadelphia was the capital; nine enslaved people from Mount Vernon worked there, and two of them, **Ona Judge** and **Hercules**, later escaped.',
        sources: [wiki("President's_House_(Philadelphia)")],
      }),
    ),
    // Journeys
    span(
      'fairfax-survey',
      '1748-03-22',
      '1748-04-24',
      'Surveying for Lord Fairfax',
      home({
        notes:
          'His first expedition over the Blue Ridge, surveying Lord Fairfax’s lands in the Shenandoah Valley, kept in his first diary. Old Style 11 March to 13 April 1747/48.',
        sources: [founders('01-01-02-0001-0002')],
      }),
    ),
    span(
      'barbados',
      '1751-11-13',
      '1752-01-02',
      'In Barbados',
      family({
        notes:
          'From landing at Bridgetown to sailing home (Old Style 2 November to 22 December 1751); Lawrence stayed on, then went to Bermuda.',
        sources: [wiki('George_Washington_House_(Barbados)')],
      }),
    ),
    span(
      'le-boeuf-mission',
      '1753-10-31',
      '1754-01-16',
      'Mission to the French',
      war({
        notes:
          'Williamsburg to Fort Le Boeuf and back in winter, with the frontiersman **Christopher Gist**.',
        sources: [wiki('Fort_Le_Boeuf'), founders('01-01-02-0003-0002')],
      }),
    ),
    // Commands and offices
    span(
      'regiment-1754',
      '1754-03-15',
      '1754-11-01',
      'Virginia Regiment, 1754',
      office({
        tags: ['war'],
        notes:
          'Lieutenant colonel, then colonel after Joshua Fry’s death in May, until his resignation.',
        sources: [wiki('Virginia_Regiment')],
      }),
    ),
    span(
      'regiment-command',
      '1755-08-14',
      '1758-12-15',
      'Commanding the Virginia Regiment',
      office({
        tags: ['war'],
        notes:
          'Colonel and commander of Virginia’s forces, defending some 300 miles of frontier with too few men, then in the Forbes campaign.',
        sources: [wiki('Virginia_Regiment')],
      }),
    ),
    span(
      'burgess',
      '1758-07-24',
      '1775-06-15',
      'House of Burgesses',
      office({
        tags: ['politics'],
        notes:
          'For Frederick County from 1758, for Fairfax County from 1765; dated here to his appointment as commander-in-chief.',
        sources: [wiki('House_of_Burgesses'), wiki('George_Washington')],
      }),
    ),
    span(
      'congress',
      '1774-09-05',
      '1775-06-15',
      'Delegate to the Continental Congress',
      office({
        tags: ['politics'],
        notes:
          'At the First Congress (September–October 1774) and the Second, until he became commander-in-chief.',
        sources: [wiki('First_Continental_Congress'), wiki('Second_Continental_Congress')],
      }),
    ),
    span(
      'commander',
      '1775-06-15',
      '1783-12-23',
      'Commander-in-chief of the Continental Army',
      office({
        tags: ['war'],
        notes:
          'Eight and a half years, from his election by Congress to his resignation at Annapolis.',
        sources: [wiki('Continental_Army'), wiki('George_Washington')],
      }),
    ),
    span(
      'convention',
      '1787-05-25',
      '1787-09-17',
      'President of the Constitutional Convention',
      office({
        tags: ['politics'],
        notes: 'From the first day with a quorum to the signing.',
        sources: [wiki('Constitutional_Convention_(United_States)')],
      }),
    ),
    span(
      'first-term',
      '1789-04-30',
      '1793-03-04',
      'First term as president',
      office({
        tags: ['presidency'],
        notes: 'In New York until 1790, then Philadelphia.',
        sources: [wiki('Presidency_of_George_Washington')],
      }),
    ),
    span(
      'second-term',
      '1793-03-04',
      '1797-03-04',
      'Second term as president',
      office({
        tags: ['presidency'],
        notes:
          'The years of the Neutrality Proclamation, the Whiskey Rebellion and the Jay Treaty.',
        sources: [wiki('Presidency_of_George_Washington')],
      }),
    ),
    span(
      'provisional-command',
      '1798-07-04',
      '1799-12-14T22:30:00',
      'Commanding the Provisional Army',
      office({
        tags: ['war'],
        notes: 'A commission he held until his death; the army was disbanded in 1800.',
        sources: [wiki('Quasi-War')],
      }),
    ),
    // Wars and campaigns
    span(
      'french-indian-war',
      '1754-05-28',
      '1763-02-10',
      'French and Indian War',
      war({
        notes:
          'From Jumonville Glen to the Treaty of Paris of 1763; Washington’s part ended in 1758.',
        sources: [wiki('French_and_Indian_War')],
      }),
    ),
    span(
      'revolutionary-war',
      '1775-04-19',
      '1783-09-03',
      'Revolutionary War',
      war({
        notes: 'From Lexington and Concord to the Treaty of Paris.',
        sources: [wiki('American_Revolutionary_War')],
      }),
    ),
    span(
      'away',
      '1775-05-04',
      '1781-09-09',
      'Six years away from Mount Vernon',
      life({
        tags: ['war', 'land'],
        notes:
          'From leaving for Congress in May 1775 to his first visit home, on the way to Yorktown: six years and four months. His cousin **Lund Washington** managed the estate.',
        sources: [
          wiki('George_Washington'),
          'https://www.nps.gov/waro/learn/historyculture/george-washington-and-the-trail.htm',
        ],
      }),
    ),
    span(
      'boston',
      '1775-04-19',
      '1776-03-17',
      'Siege of Boston',
      war({
        notes: 'Washington commanded from July 3, 1775.',
        sources: [wiki('Siege_of_Boston')],
      }),
    ),
    span(
      'new-york',
      '1776-08-22',
      '1776-11-16',
      'Losing New York',
      war({
        notes: 'From Howe’s landing on Long Island to the fall of Fort Washington.',
        sources: [wiki('New_York_and_New_Jersey_campaign')],
      }),
    ),
    span(
      'ten-days',
      '1776-12-25',
      '1777-01-04',
      'The Ten Crucial Days',
      war({
        notes: 'From the crossing of the Delaware to the victory at Princeton.',
        sources: [wiki('New_York_and_New_Jersey_campaign'), wiki('Battle_of_Princeton')],
      }),
    ),
    span(
      'philadelphia-campaign',
      '1777-08-25',
      '1777-12-19',
      'Philadelphia campaign',
      war({
        notes: 'From Howe’s landing at Head of Elk to the march into Valley Forge.',
        sources: [wiki('Philadelphia_campaign')],
      }),
    ),
    span(
      'valley-forge',
      '1777-12-19',
      '1778-06-19',
      'Valley Forge',
      war({
        notes:
          'Six months of winter quarters: about 2,000 soldiers died of disease, and Steuben’s drill remade the army.',
        sources: [wiki('Valley_Forge')],
      }),
    ),
    span(
      'morristown',
      '1779-12-01',
      '1780-06-23',
      'The hard winter at Morristown',
      war({
        notes:
          'December 1779 to June 1780 (the days are approximate): the coldest winter of the war, with the army near starving.',
        sources: [wiki('Morristown_National_Historical_Park')],
      }),
    ),
    span(
      'yorktown',
      '1781-09-28',
      '1781-10-19',
      'Siege of Yorktown',
      war({
        notes: 'American and French armies besiege Cornwallis until he surrenders.',
        sources: [wiki('Siege_of_Yorktown')],
      }),
    ),
    span(
      'quasi-war',
      '1798-07-07',
      '1800-09-30',
      'Quasi-War',
      war({
        notes: 'An undeclared naval war with France, ended by the Convention of 1800.',
        sources: [wiki('Quasi-War')],
      }),
    ),
    // Family
    span(
      'marriage-span',
      '1759-01-06',
      '1799-12-14T22:30:00',
      'Married to Martha',
      family({
        notes: 'Forty years. They had no children together.',
        sources: [wiki('Martha_Washington')],
      }),
    ),
    span(
      'jacky',
      '1754-11-27',
      '1781-11-05',
      'John Parke "Jacky" Custis',
      family({
        notes: 'His stepson, from his birth to his death after Yorktown.',
        sources: [wiki('John_Parke_Custis')],
      }),
    ),
    span(
      'patsy',
      '1756-01-01',
      '1773-06-19',
      'Martha Parke "Patsy" Custis',
      family({
        notes: 'His stepdaughter; she was born in 1756.',
        sources: [wiki('John_Parke_Custis'), wiki('Martha_Washington')],
      }),
    ),
  ];
  const relationships = [
    rel('father-dies', 'ferry-farm'),
    rel('mount-vernon-named', 'lawrence-dies'),
    rel('barbados-sail', 'smallpox'),
    rel('smallpox', 'inoculation'),
    rel('lawrence-dies', 'lease'),
    rel('lease', 'inherits'),
    rel('new-style', 'birth'),
    rel('d:le-boeuf-mission', 'journal'),
    rel('le-boeuf', 'jumonville'),
    rel('jumonville', 'fort-necessity'),
    rel('fort-necessity', 'resigns-1754'),
    rel('monongahela', 'colonel-1755'),
    rel('loyalhanna', 'duquesne'),
    rel('duquesne', 'resigns-1758'),
    rel('marriage', 'd:jacky'),
    rel('marriage', 'd:patsy'),
    rel('fairfax-resolves', 'delegate'),
    rel('second-congress', 'chosen'),
    rel('leaves-home', 'home-1781'),
    rel('dorchester', 'boston-evacuated'),
    rel('crossing', 'trenton'),
    rel('trenton', 'princeton'),
    rel('brandywine', 'germantown'),
    rel('saratoga', 'french-alliance'),
    rel('steuben', 'monmouth'),
    rel('french-alliance', 'cornwallis-surrenders'),
    rel('cornwallis-surrenders', 'jacky-dies'),
    rel('newburgh', 'annapolis'),
    rel('mv-conference', 'annapolis-convention'),
    rel('annapolis-convention', 'convention-president'),
    rel('constitution', 'elected'),
    rel('neutrality', 'jay-treaty'),
    rel('jay-treaty', 'jay-ratified'),
    rel('bower-hill', 'whiskey-proclamation'),
    rel('whiskey-proclamation', 'whiskey-carlisle'),
    rel('william-lee', 'will'),
    rel('rotation', 'ona-judge'),
    rel('will', 'freed'),
    rel('last-ride', 'death'),
    rel('death', 'funeral'),
  ];
  return {
    format: 'openchronology',
    version: 1,
    title: 'George Washington, 1732–1799',
    description:
      'A biography of George Washington on one line: his Virginia boyhood and surveying, the Virginia Regiment and the French and Indian War, Mount Vernon and the people enslaved there, the House of Burgesses, eight and a half years in command of the Continental Army, the Constitutional Convention, two terms as the first president, and his last years and will. A sample built from the cited sources, chiefly Wikipedia, the Papers of George Washington (Founders Online) and Mount Vernon’s research library.\n\n**How to read it.** Chapter headings mark the stages of his life. His life’s stages, homes, commands, offices, campaigns and family are durations; everything else is a moment with its sources. Related events (a battle and the one it led to) are linked. Colours follow the first tag: family, land, slavery, war, politics and the presidency, writing, and the wider world.\n\n**Dates.** Days in Virginia time, approximated as a fixed UTC−5. Britain and its colonies used the Julian calendar (Old Style) until September 1752; dates before then are converted to the Gregorian calendar, and the date as written at the time is kept as each moment’s original historical date. He was born on 11 February 1731/32, Old Style: 22 February 1732.',
    presentation: {
      mode: 'gregorian',
      unit: '',
      scale: '1/1',
      origin: '0/1',
      version: 1,
      offsetMinutes: -300,
      significantDigits: 6,
    },
    tags: ['history', 'biography', 'united states', 'george washington', 'education'],
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
