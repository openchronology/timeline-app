// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The United States, 1775 to 2008: the modern-history tour's sample (Video 5). Well-established
// dates only, each moment linked to its Wikipedia article; dates are UTC days unless a time is
// given (Apollo 11's are NASA's mission times in UTC).
import { at, m, d, rel, plugins, theme, wiki } from './lib.mjs';

export function usa(core) {
  const h = (id, iso, title) => m(id, at(iso), title, { headingLevel: 'h2', tags: ['chapter'] });
  const events = [
    h('h-founding', '1775-01-01', 'Founding'),
    m('lexington', at('1775-04-19'), 'Lexington and Concord', {
      tags: ['war', 'founding'],
      notes: 'The first battles of the **American Revolutionary War**, in Massachusetts.',
      sources: [wiki('Battles_of_Lexington_and_Concord')],
    }),
    m('declaration', at('1776-07-04'), 'Declaration of Independence', {
      tags: ['founding', 'rights'],
      notes:
        'The Second Continental Congress adopts the Declaration, written chiefly by **Thomas Jefferson**: "all men are created equal", with unalienable rights to "Life, Liberty and the pursuit of Happiness".',
      sources: [wiki('United_States_Declaration_of_Independence')],
    }),
    m('yorktown', at('1781-10-19'), 'Surrender at Yorktown', {
      tags: ['war', 'founding'],
      notes: 'British forces under Cornwallis surrender to American and French forces.',
      sources: [wiki('Siege_of_Yorktown')],
    }),
    m('paris', at('1783-09-03'), 'Treaty of Paris', {
      tags: ['founding'],
      notes: 'Britain recognizes the independence of the United States.',
      sources: [wiki('Treaty_of_Paris_(1783)')],
    }),
    m('constitution', at('1787-09-17'), 'Constitution signed', {
      tags: ['founding', 'government'],
      notes: 'Delegates to the Constitutional Convention in Philadelphia sign the Constitution.',
      sources: [wiki('Constitution_of_the_United_States')],
    }),
    m('washington', at('1789-04-30'), 'Washington inaugurated', {
      tags: ['government'],
      notes: 'George Washington takes office as the first president, in New York City.',
      sources: [wiki('First_inauguration_of_George_Washington')],
    }),
    m('bill-of-rights', at('1791-12-15'), 'Bill of Rights ratified', {
      tags: ['rights', 'government'],
      notes: 'The first ten amendments to the Constitution take effect.',
      sources: [wiki('United_States_Bill_of_Rights')],
    }),
    h('h-growing', '1803-01-01', 'A growing nation'),
    m('louisiana', at('1803-04-30'), 'Louisiana Purchase', {
      tags: ['expansion'],
      notes:
        'The United States agrees to buy the Louisiana territory from France, roughly doubling its size.',
      sources: [wiki('Louisiana_Purchase')],
    }),
    m('removal-act', at('1830-05-28'), 'Indian Removal Act', {
      tags: ['expansion', 'rights'],
      notes:
        'The law that led to the forced removal of Native nations from the Southeast, including the Trail of Tears.',
      sources: [wiki('Indian_Removal_Act')],
    }),
    m('seneca-falls', at('1848-07-19'), 'Seneca Falls Convention', {
      tags: ['rights'],
      notes: "The first women's rights convention opens in Seneca Falls, New York.",
      sources: [wiki('Seneca_Falls_Convention')],
    }),
    m('gold', at('1848-01-24'), "Gold at Sutter's Mill", {
      tags: ['expansion', 'economy'],
      notes: 'The discovery that set off the California Gold Rush.',
      sources: [wiki('California_Gold_Rush')],
    }),
    h('h-union', '1861-01-01', 'Union and emancipation'),
    m('sumter', at('1861-04-12'), 'Fort Sumter', {
      tags: ['war'],
      notes: 'Confederate forces fire on Fort Sumter, South Carolina: the Civil War begins.',
      sources: [wiki('Battle_of_Fort_Sumter')],
    }),
    m('emancipation', at('1863-01-01'), 'Emancipation Proclamation', {
      tags: ['rights', 'war'],
      notes: 'Lincoln declares enslaved people in the Confederate states free.',
      sources: [wiki('Emancipation_Proclamation')],
    }),
    m('gettysburg-address', at('1863-11-19'), 'Gettysburg Address', {
      tags: ['war'],
      notes: "Lincoln's speech at the dedication of the Soldiers' National Cemetery.",
      sources: [wiki('Gettysburg_Address')],
    }),
    m('appomattox', at('1865-04-09'), 'Surrender at Appomattox', {
      tags: ['war'],
      notes: 'Robert E. Lee surrenders the Army of Northern Virginia to Ulysses S. Grant.',
      sources: [wiki('Battle_of_Appomattox_Court_House')],
    }),
    m('lincoln', at('1865-04-14'), 'Lincoln assassinated', {
      tags: ['war', 'government'],
      notes: "Shot at Ford's Theatre on April 14; he died the next morning.",
      sources: [wiki('Assassination_of_Abraham_Lincoln')],
    }),
    m('13th', at('1865-12-06'), 'Thirteenth Amendment', {
      tags: ['rights'],
      notes: 'Abolishes slavery, except as punishment for a crime.',
      sources: [wiki('Thirteenth_Amendment_to_the_United_States_Constitution')],
    }),
    m('14th', at('1868-07-09'), 'Fourteenth Amendment', {
      tags: ['rights'],
      notes: 'Citizenship and equal protection of the laws.',
      sources: [wiki('Fourteenth_Amendment_to_the_United_States_Constitution')],
    }),
    m('15th', at('1870-02-03'), 'Fifteenth Amendment', {
      tags: ['rights'],
      notes: 'The right to vote may not be denied on account of race.',
      sources: [wiki('Fifteenth_Amendment_to_the_United_States_Constitution')],
    }),
    h('h-industry', '1869-01-01', 'An industrial power'),
    m('railroad', at('1869-05-10'), 'Transcontinental railroad', {
      tags: ['expansion', 'economy', 'science'],
      notes:
        'The golden spike joins the Union Pacific and Central Pacific at Promontory Summit, Utah.',
      sources: [wiki('First_transcontinental_railroad')],
    }),
    m('telephone', at('1876-03-10'), 'First telephone call', {
      tags: ['science'],
      notes: 'Alexander Graham Bell: "Mr. Watson, come here."',
      sources: [wiki('Invention_of_the_telephone')],
    }),
    m('wright', at('1903-12-17'), 'First powered flight', {
      tags: ['science'],
      notes: 'The Wright brothers fly at Kitty Hawk, North Carolina.',
      sources: [wiki('Wright_Flyer')],
    }),
    h('h-wars', '1917-01-01', 'World wars and depression'),
    m('19th', at('1920-08-18'), 'Nineteenth Amendment', {
      tags: ['rights'],
      notes: "Women's right to vote is ratified.",
      sources: [wiki('Nineteenth_Amendment_to_the_United_States_Constitution')],
    }),
    m('crash', at('1929-10-29'), 'Stock market crash', {
      tags: ['economy'],
      notes: 'Black Tuesday, the worst day of the Wall Street Crash of 1929.',
      sources: [wiki('Wall_Street_crash_of_1929')],
    }),
    m('pearl-harbor', at('1941-12-07'), 'Pearl Harbor', {
      tags: ['war'],
      notes:
        'Japan attacks the US Pacific Fleet in Hawaii; the United States enters the Second World War.',
      sources: [wiki('Attack_on_Pearl_Harbor')],
    }),
    m('d-day', at('1944-06-06'), 'D-Day', {
      tags: ['war'],
      notes: 'Allied landings in Normandy.',
      sources: [wiki('Normandy_landings')],
    }),
    m('v-j', at('1945-09-02'), 'Japan surrenders', {
      tags: ['war'],
      notes: 'The formal surrender aboard USS Missouri ends the Second World War.',
      sources: [wiki('Surrender_of_Japan')],
    }),
    h('h-rights', '1954-01-01', 'Rights and the space age'),
    m('brown', at('1954-05-17'), 'Brown v. Board of Education', {
      tags: ['rights'],
      notes:
        'The Supreme Court rules unanimously that racial segregation in public schools is unconstitutional, overturning "separate but equal" in education.',
      sources: [wiki('Brown_v._Board_of_Education')],
    }),
    m('parks', at('1955-12-01'), 'Rosa Parks arrested', {
      tags: ['rights'],
      notes: 'Her arrest in Montgomery, Alabama, sets off the Montgomery bus boycott.',
      sources: [wiki('Rosa_Parks')],
    }),
    m('sputnik', at('1957-10-04'), 'Sputnik', {
      tags: ['science'],
      notes: 'The Soviet Union launches the first artificial satellite, starting the space race.',
      sources: [wiki('Sputnik_1')],
    }),
    m('march', at('1963-08-28'), 'March on Washington', {
      tags: ['rights'],
      notes: 'Martin Luther King Jr. gives his "I Have a Dream" speech.',
      sources: [wiki('March_on_Washington_for_Jobs_and_Freedom')],
    }),
    m('cra', at('1964-07-02'), 'Civil Rights Act', {
      tags: ['rights'],
      notes: 'Outlaws discrimination based on race, color, religion, sex or national origin.',
      sources: [wiki('Civil_Rights_Act_of_1964')],
    }),
    m('vra', at('1965-08-06'), 'Voting Rights Act', {
      tags: ['rights'],
      notes: 'Prohibits racial discrimination in voting.',
      sources: [wiki('Voting_Rights_Act_of_1965')],
    }),
    m('mlk', at('1968-04-04'), 'Martin Luther King Jr. assassinated', {
      tags: ['rights'],
      notes: 'Killed in Memphis, Tennessee.',
      sources: [wiki('Assassination_of_Martin_Luther_King_Jr.')],
    }),
    m('apollo-launch', at('1969-07-16T13:32:00Z'), 'Apollo 11 launches', {
      tags: ['science'],
      notes: 'Saturn V lifts off from Kennedy Space Center at 13:32 UTC.',
      sources: [wiki('Apollo_11')],
    }),
    m('apollo-landing', at('1969-07-20T20:17:40Z'), 'The Eagle has landed', {
      tags: ['science'],
      notes: 'The lunar module **Eagle** lands in the Sea of Tranquility at 20:17:40 UTC.',
      sources: [wiki('Apollo_11')],
    }),
    m('apollo-step', at('1969-07-21T02:56:15Z'), 'First step on the Moon', {
      tags: ['science'],
      notes:
        'Neil Armstrong steps onto the surface at 02:56:15 UTC: "one small step for [a] man, one giant leap for mankind."',
      sources: [wiki('Apollo_11')],
    }),
    m('apollo-splashdown', at('1969-07-24T16:50:35Z'), 'Splashdown', {
      tags: ['science'],
      notes: 'Columbia splashes down in the Pacific at 16:50:35 UTC.',
      sources: [wiki('Apollo_11')],
    }),
    h('h-century', '2001-01-01', 'A new century'),
    m('cold-war-end', at('1991-12-26'), 'Soviet Union dissolved', {
      tags: ['government'],
      notes: 'The end of the Cold War.',
      sources: [wiki('Dissolution_of_the_Soviet_Union')],
    }),
    m('nine-eleven', at('2001-09-11'), 'September 11 attacks', {
      tags: ['war'],
      notes:
        'Nearly 3,000 people are killed in attacks in New York, at the Pentagon and in Pennsylvania.',
      sources: [wiki('September_11_attacks')],
    }),
    m('obama', at('2008-11-04'), 'Obama elected', {
      tags: ['government', 'rights'],
      notes: 'Barack Obama is elected the first African American president.',
      sources: [wiki('2008_United_States_presidential_election')],
    }),
  ];
  const durations = [
    d('revolution', at('1775-04-19'), at('1783-09-03'), 'Revolutionary War', {
      tags: ['war', 'founding'],
      sources: [wiki('American_Revolutionary_War')],
    }),
    d('lewis-clark', at('1804-05-14'), at('1806-09-23'), 'Lewis and Clark', {
      tags: ['expansion'],
      notes: 'The Corps of Discovery crosses the continent to the Pacific and back.',
      sources: [wiki('Lewis_and_Clark_Expedition')],
    }),
    d('war-1812', at('1812-06-18'), at('1815-02-17'), 'War of 1812', {
      tags: ['war'],
      sources: [wiki('War_of_1812')],
    }),
    d('civil-war', at('1861-04-12'), at('1865-04-09'), 'Civil War', {
      tags: ['war'],
      notes: "From Fort Sumter to Lee's surrender at Appomattox.",
      sources: [wiki('American_Civil_War')],
    }),
    d('gettysburg', at('1863-07-01'), at('1863-07-04'), 'Gettysburg', {
      tags: ['war'],
      notes: 'The battle of July 1–3, 1863, a turning point of the war.',
      sources: [wiki('Battle_of_Gettysburg')],
    }),
    d('ww1', at('1917-04-06'), at('1918-11-11'), 'World War I', {
      tags: ['war'],
      notes: 'From the US declaration of war to the Armistice.',
      sources: [wiki('American_entry_into_World_War_I')],
    }),
    d('depression', at('1929-10-29'), at('1939-09-01'), 'Great Depression', {
      tags: ['economy'],
      notes: 'Commonly dated from the 1929 crash to the end of the 1930s.',
      sources: [wiki('Great_Depression_in_the_United_States')],
    }),
    d('ww2', at('1941-12-07'), at('1945-09-02'), 'World War II', {
      tags: ['war'],
      notes: "From Pearl Harbor to Japan's surrender.",
      sources: [wiki('Military_history_of_the_United_States_during_World_War_II')],
    }),
    d('cold-war', at('1947-03-12'), at('1991-12-26'), 'Cold War', {
      tags: ['war', 'government'],
      notes: 'Dated here from the Truman Doctrine to the dissolution of the Soviet Union.',
      sources: [wiki('Cold_War')],
    }),
    d('civil-rights', at('1954-05-17'), at('1968-04-11'), 'Civil rights movement', {
      tags: ['rights'],
      notes: 'Dated here from Brown v. Board to the Fair Housing Act.',
      sources: [wiki('Civil_rights_movement')],
    }),
    d('apollo-11', at('1969-07-16T13:32:00Z'), at('1969-07-24T16:50:35Z'), 'Apollo 11', {
      tags: ['science'],
      sources: [wiki('Apollo_11')],
    }),
  ];
  const relationships = [
    rel('declaration', 'constitution'),
    rel('constitution', 'bill-of-rights'),
    rel('d:revolution', 'lexington'),
    rel('d:revolution', 'yorktown'),
    rel('d:revolution', 'paris'),
    rel('emancipation', '13th'),
    rel('13th', '14th'),
    rel('14th', '15th'),
    rel('seneca-falls', '19th'),
    rel('brown', 'cra'),
    rel('cra', 'vra'),
    rel('parks', 'brown'),
    rel('march', 'cra'),
    rel('pearl-harbor', 'd:ww2'),
    rel('sputnik', 'apollo-landing'),
    rel('d:civil-war', 'gettysburg-address'),
  ];
  return {
    format: 'openchronology',
    version: 1,
    title: 'The United States, 1775–2008',
    description:
      'From the first shots of the Revolution to the twenty-first century: wars, amendments, discoveries and the movements that changed who the rights in the founding documents applied to.\n\n**How to read it.** Chapter headings mark the eras. Wars and movements are durations; everything else is a moment, linked to the Wikipedia article it draws on. Related events (an amendment and the one it led to) are linked. Dates are in UTC.',
    presentation: {
      mode: 'gregorian',
      unit: '',
      scale: '1/1',
      origin: '0/1',
      version: 1,
      offsetMinutes: 0,
      significantDigits: 6,
    },
    tags: ['history', 'united states', 'education'],
    plugins: [
      ...plugins(
        core.RICH_TEXT_NOTES,
        core.MOMENT_HEADINGS,
        core.MOMENT_SOURCES,
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
