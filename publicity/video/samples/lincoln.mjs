// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Abraham Lincoln, 1809–1865: the biography tour's sample (Video 14, Short 11). Well-established
// dates only, each moment linked to its Wikipedia article and, where it's the natural reference,
// to The Lincoln Log (the Papers of Abraham Lincoln's day-by-day chronology), his Collected Works,
// the National Archives, the Library of Congress or the National Park Service.
// Dates are local days. Standard time zones came only in 1883, so the display uses a fixed
// UTC−5 (Washington's clock to within a few minutes); a day given here is midnight of that day
// at UTC−5, and the few times of day (Ford's Theatre, the Petersen House) are Washington's.
import { at as utc, m, d, rel, plugins, theme, wiki } from './lib.mjs';

/** A local date or date-time (YYYY-MM-DD or YYYY-MM-DDTHH:MM) at UTC−5. */
const at = (local) => utc(`${local.length === 10 ? local + 'T00:00' : local}:00-05:00`);

const LOG = 'https://www.thelincolnlog.org/';
const WORKS = 'https://quod.lib.umich.edu/l/lincoln/';
const NARA_EP = 'https://www.archives.gov/exhibits/featured-documents/emancipation-proclamation';
const NARA_13 = 'https://www.archives.gov/milestone-documents/13th-amendment';
const LOC_GA = 'https://www.loc.gov/exhibits/gettysburg-address/';
const NPS_BIRTH = 'https://www.nps.gov/abli/index.htm';
const NPS_HOME = 'https://www.nps.gov/liho/index.htm';
const NPS_BOYHOOD = 'https://www.nps.gov/libo/index.htm';
const NPS_FORDS = 'https://www.nps.gov/foth/index.htm';

// One colour per thread, in the archive palette.
const COLOR = {
  family: '#4f7a4a',
  home: '#8a7a5c',
  law: '#7a5c2e',
  politics: '#1f3a5f',
  office: '#1f3a5f',
  speech: '#5b4a8a',
  slavery: '#b0782a',
  war: '#9c3b2a',
  writing: '#5b4a8a',
  work: '#7a5c2e',
};
/** Options with the colour of the first tag. */
const c = (o) => ({ ...o, color: o.color ?? COLOR[o.tags?.[0]] });

export function lincoln(core) {
  const h = (id, iso, title) => m(id, at(iso), title, { headingLevel: 'h2', tags: ['chapter'] });
  const mo = (id, iso, title, o) => m(id, at(iso), title, c(o));
  const du = (id, a, b, title, o) => d(id, at(a), at(b), title, c(o));
  const events = [
    // ── Kentucky and Indiana ──
    h('h-frontier', '1809-01-01', 'Kentucky and Indiana'),
    mo('born', '1809-02-12', 'Born in Kentucky', {
      tags: ['family'],
      notes:
        'Abraham Lincoln is born in a one-room log cabin on **Sinking Spring Farm**, near Hodgenville, Kentucky, to **Thomas Lincoln** and **Nancy Hanks Lincoln**. His sister **Sarah** is two years older.',
      sources: [wiki('Abraham_Lincoln'), NPS_BIRTH],
    }),
    mo('knob-creek', '1811-07-01', 'Move to Knob Creek', {
      tags: ['home'],
      datePrecision: 'Summer 1811; the month and day are not recorded.',
      notes:
        'The family moves about ten miles to a farm on **Knob Creek**, the earliest home Lincoln later remembered.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln'), NPS_BIRTH],
    }),
    mo('tommy', '1812-07-01', 'A brother, Thomas, dies in infancy', {
      tags: ['family'],
      datePrecision: 'Born in 1812 or 1813 and lived only a few days; placed in 1812.',
      notes:
        "Lincoln's younger brother **Thomas** lives only a few days and is buried near Knob Creek.",
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln')],
    }),
    mo('to-indiana', '1816-12-01', 'Move to Indiana', {
      tags: ['home'],
      datePrecision: 'December 1816; the day is not recorded.',
      notes:
        'Partly over land-title disputes and partly, Lincoln later said, because of slavery, Thomas Lincoln moves the family across the Ohio River to **Little Pigeon Creek**, in what became Spencer County, Indiana.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln'), NPS_BOYHOOD],
    }),
    mo('nancy-dies', '1818-10-05', 'His mother dies', {
      tags: ['family'],
      notes:
        '**Nancy Hanks Lincoln** dies of milk sickness, poisoning from the milk of cows that had grazed on white snakeroot. Abraham is nine.',
      sources: [wiki('Nancy_Lincoln')],
    }),
    mo('stepmother', '1819-12-02', 'A stepmother, Sarah Bush Johnston', {
      tags: ['family'],
      notes:
        'Thomas Lincoln marries the widow **Sarah Bush Johnston** in Elizabethtown, Kentucky. She brings her three children to Indiana and encourages Abraham’s reading; he remained devoted to her.',
      sources: [wiki('Sarah_Bush_Lincoln')],
    }),
    mo('sarah-dies', '1828-01-20', 'His sister Sarah dies', {
      tags: ['family'],
      notes:
        '**Sarah Lincoln Grigsby** dies in childbirth, aged twenty, a year and a half after marrying Aaron Grigsby.',
      sources: [wiki('Lincoln_family')],
    }),
    mo('flatboat-1828', '1828-04-01', 'Flatboat to New Orleans', {
      tags: ['work'],
      datePrecision: 'Spring 1828; placed in April.',
      notes:
        'With **Allen Gentry**, Lincoln takes a flatboat of produce down the Ohio and Mississippi to **New Orleans**, his first sight of a great city.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln')],
    }),
    mo('to-illinois', '1830-03-01', 'The family moves to Illinois', {
      tags: ['home'],
      datePrecision: 'They set out in early March 1830.',
      notes:
        'The Lincolns and their relatives leave Indiana for **Macon County, Illinois**, near Decatur. Abraham, just twenty-one, helps clear and fence the new farm.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln'), LOG],
    }),
    mo('flatboat-1831', '1831-05-01', 'Second flatboat trip', {
      tags: ['work'],
      datePrecision: 'Left in late April or early May 1831.',
      notes:
        'Lincoln, his stepbrother **John D. Johnston** and cousin **John Hanks** take a flatboat to New Orleans for the trader **Denton Offutt**, who then hires him to clerk a store in New Salem.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln')],
    }),

    // ── New Salem ──
    h('h-new-salem', '1831-07-01', 'New Salem'),
    mo('new-salem', '1831-07-25', 'Arrives in New Salem', {
      tags: ['home'],
      datePrecision: 'Late July 1831; the day is not recorded.',
      notes:
        'Lincoln settles in **New Salem**, a village on the Sangamon River, on his own for the first time: a clerk, a wrestler, a reader of borrowed books.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln'), LOG],
    }),
    mo('candidacy', '1832-03-09', 'First run for the legislature', {
      tags: ['politics', 'writing'],
      notes:
        'His first public letter, to the people of **Sangamon County** in the Sangamo Journal, announces his candidacy for the Illinois House and argues for river improvements and education.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln'), WORKS],
    }),
    mo('captain', '1832-04-21', 'Elected captain of volunteers', {
      tags: ['war'],
      notes:
        'Volunteering for the **Black Hawk War**, Lincoln is elected captain by his company, an honor he later said gave him more pleasure than any since. He saw no combat.',
      sources: [wiki('Abraham_Lincoln_in_the_Black_Hawk_War'), LOG],
    }),
    mo('loses-1832', '1832-08-06', 'Loses his first election', {
      tags: ['politics'],
      notes:
        'Back from the war with little time to campaign, he finishes eighth of thirteen for four seats, though New Salem gives him 277 of its 300 votes.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln')],
    }),
    mo('store', '1833-01-15', 'A store with William Berry', {
      tags: ['work'],
      datePrecision: 'Bought late in 1832 or early in 1833; placed in January 1833.',
      notes:
        'Lincoln and **William F. Berry** buy a New Salem store on credit. It fails, and after Berry’s death Lincoln spends years repaying what he called "the national debt".',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln')],
    }),
    mo('postmaster', '1833-05-07', 'Appointed postmaster', {
      tags: ['office'],
      notes:
        'He becomes postmaster of **New Salem**, a small federal post that let him read every newspaper that came through.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln'), LOG],
    }),
    mo('surveyor', '1833-12-01', 'Deputy surveyor', {
      tags: ['work'],
      datePrecision: 'Late 1833 or the first days of 1834; placed in December 1833.',
      notes:
        'Taught by borrowed books, he becomes a deputy to **John Calhoun**, the Sangamon County surveyor, laying out roads, farms and town lots until early 1836.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln')],
    }),
    mo('elected-1834', '1834-08-04', 'Elected to the Illinois House', {
      tags: ['politics'],
      notes:
        'At twenty-five, Lincoln wins a seat for **Sangamon County**, the first of four straight terms as a Whig. **John Todd Stuart** urges him to study law.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln')],
    }),
    mo('ann-rutledge', '1835-08-25', 'Ann Rutledge dies', {
      tags: ['family'],
      notes:
        '**Ann Rutledge**, a New Salem friend, dies of what was probably typhoid. Her death grieved him deeply; how close they were is debated by historians.',
      sources: [wiki('Ann_Rutledge')],
    }),
    mo('reelected-1836', '1836-08-01', 'Re-elected with the Long Nine', {
      tags: ['politics'],
      notes:
        'He tops the poll in Sangamon County, one of nine unusually tall Whigs from the county, the **Long Nine**.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln')],
    }),
    mo('license', '1836-09-09', 'Licensed to practice law', {
      tags: ['law'],
      notes:
        'Self-taught from borrowed books, chiefly **Blackstone’s Commentaries**, Lincoln receives his license to practice law in Illinois.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln'), LOG],
    }),
    mo('capital', '1837-02-28', 'The capital moves to Springfield', {
      tags: ['politics'],
      notes:
        'The legislature votes to move the state capital from Vandalia to **Springfield**, a measure Lincoln and the Long Nine worked hard for.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln')],
    }),
    mo('protest', '1837-03-03', 'Lincoln–Stone protest', {
      tags: ['slavery', 'politics'],
      notes:
        'With **Dan Stone**, Lincoln enters a protest in the House journal: slavery is "founded on both injustice and bad policy", though Congress has no power to interfere with it in the states. Only six members had voted against resolutions condemning abolitionists.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln'), WORKS],
    }),

    // ── Springfield ──
    h('h-springfield', '1837-04-01', 'Springfield'),
    mo('to-springfield', '1837-04-15', 'Moves to Springfield', {
      tags: ['home', 'law'],
      notes:
        'Lincoln rides into **Springfield** with everything he owns in two saddlebags, shares a room above **Joshua Speed**’s store, and becomes **John Todd Stuart**’s law partner.',
      sources: [wiki('Joshua_Fry_Speed'), LOG],
    }),
    mo('lyceum', '1838-01-27', 'Lyceum Address', {
      tags: ['speech'],
      notes:
        'To the Young Men’s Lyceum of Springfield, Lincoln warns that the danger to the republic is from within: mob violence and disregard for law.',
      sources: [wiki("Abraham_Lincoln's_Lyceum_address"), WORKS],
    }),
    mo('broken', '1841-01-01', 'Engagement to Mary Todd broken', {
      tags: ['family'],
      datePrecision:
        'The "fatal first of January" 1841; what happened that day is not fully known.',
      notes:
        'Lincoln breaks off his engagement to **Mary Todd** and falls into a deep depression. They reconcile in 1842.',
      sources: [wiki('Mary_Todd_Lincoln'), wiki('Early_life_and_career_of_Abraham_Lincoln')],
    }),
    mo('shields', '1842-09-22', 'A duel called off', {
      tags: ['politics'],
      notes:
        'Satirical letters by Lincoln (and, it seems, Mary Todd) provoke the Democrat **James Shields** to challenge him. On Bloody Island, opposite Alton, friends settle it before a blow is struck.',
      sources: [wiki('James_Shields'), wiki('Mary_Todd_Lincoln')],
    }),
    mo('marriage', '1842-11-04', 'Marries Mary Todd', {
      tags: ['family'],
      notes:
        'Lincoln marries **Mary Ann Todd**, of a prominent Lexington, Kentucky family, at her sister’s home in Springfield. They board at the **Globe Tavern**.',
      sources: [wiki('Mary_Todd_Lincoln'), LOG],
    }),
    mo('robert-born', '1843-08-01', 'Robert is born', {
      tags: ['family'],
      notes:
        '**Robert Todd Lincoln**, their first son and the only one to grow to adulthood. He became Secretary of War and died in 1926.',
      sources: [wiki('Robert_Todd_Lincoln')],
    }),
    mo('house', '1844-05-01', 'The house at Eighth and Jackson', {
      tags: ['home', 'family'],
      datePrecision: 'They moved in during May 1844.',
      notes:
        'The Lincolns buy a one-and-a-half-storey house at **Eighth and Jackson** streets, the only home Lincoln ever owned; it is now the Lincoln Home National Historic Site.',
      sources: [wiki('Lincoln_Home_National_Historic_Site'), NPS_HOME],
    }),
    mo('eddie-born', '1846-03-10', 'Eddie is born', {
      tags: ['family'],
      notes: '**Edward Baker Lincoln**, named for Lincoln’s friend Edward D. Baker.',
      sources: [wiki('Edward_Baker_Lincoln')],
    }),

    // ── Congress and the law ──
    h('h-congress', '1846-07-01', 'Congress and the law'),
    mo('elected-congress', '1846-08-03', 'Elected to Congress', {
      tags: ['politics'],
      notes:
        'Lincoln wins Illinois’s **7th district**, the state’s only Whig seat, defeating the Methodist preacher **Peter Cartwright**.',
      sources: [wiki('Abraham_Lincoln'), LOG],
    }),
    mo('spot', '1847-12-22', 'Spot Resolutions', {
      tags: ['politics', 'war'],
      notes:
        'Weeks into his term, Lincoln demands that President **Polk** name the exact "spot" where American blood was shed to start the **Mexican–American War**. Critics at home call him "Spotty".',
      sources: [wiki('Spot_Resolutions'), WORKS],
    }),
    mo('war-speech', '1848-01-12', 'Speech against the Mexican War', {
      tags: ['speech', 'war'],
      notes:
        'In the House, Lincoln argues that Polk began the war unnecessarily and unconstitutionally. It costs him support in Illinois.',
      sources: [wiki('Spot_Resolutions'), WORKS],
    }),
    mo('dc-bill', '1849-01-10', 'A plan to end slavery in Washington', {
      tags: ['slavery', 'politics'],
      notes:
        'Lincoln announces a bill for gradual, compensated emancipation in the **District of Columbia**, subject to a vote of its residents. Without support, he never formally introduces it.',
      sources: [wiki('Abraham_Lincoln'), WORKS],
    }),
    mo('patent', '1849-05-22', 'Patent No. 6,469', {
      tags: ['work'],
      notes:
        'A device for lifting boats over shoals with inflatable chambers: Lincoln remains the only president to hold a patent. It was never manufactured.',
      sources: [wiki("Abraham_Lincoln's_patent")],
    }),
    mo('eddie-dies', '1850-02-01', 'Eddie dies', {
      tags: ['family'],
      notes:
        '**Eddie** dies at three, after an illness of nearly two months, possibly tuberculosis.',
      sources: [wiki('Edward_Baker_Lincoln')],
    }),
    mo('willie-born', '1850-12-21', 'Willie is born', {
      tags: ['family'],
      notes: '**William Wallace Lincoln**, the son most like his father, by many accounts.',
      sources: [wiki('William_Wallace_Lincoln')],
    }),
    mo('father-dies', '1851-01-17', 'His father dies', {
      tags: ['family'],
      notes:
        '**Thomas Lincoln** dies in Coles County, Illinois. His son, estranged, does not travel to his deathbed or the funeral.',
      sources: [wiki('Thomas_Lincoln')],
    }),
    mo('clay', '1852-07-06', 'Eulogy on Henry Clay', {
      tags: ['speech'],
      notes:
        'In Springfield, Lincoln eulogizes **Henry Clay**, his "beau ideal of a statesman", for a lifetime of compromise to hold the Union together.',
      sources: [wiki('Henry_Clay'), WORKS],
    }),
    mo('tad-born', '1853-04-04', 'Tad is born', {
      tags: ['family'],
      notes:
        '**Thomas "Tad" Lincoln**, the youngest; his father nicknamed him for his large head, "like a tadpole". He died in 1871, aged eighteen.',
      sources: [wiki('Tad_Lincoln')],
    }),

    // ── Back into politics ──
    h('h-return', '1854-05-01', 'Back into politics'),
    mo('kansas-nebraska', '1854-05-30', 'Kansas–Nebraska Act', {
      tags: ['slavery', 'politics'],
      notes:
        '**Stephen A. Douglas**’s act lets settlers of the new territories decide on slavery, repealing the **Missouri Compromise** line. Lincoln later wrote that it roused him back into politics.',
      sources: [wiki('Kansas–Nebraska_Act')],
    }),
    mo('peoria', '1854-10-16', 'Peoria speech', {
      tags: ['speech', 'slavery'],
      notes:
        'Answering Douglas at **Peoria**, Lincoln makes his case against spreading slavery: its "monstrous injustice", and that no man is good enough to govern another without that other’s consent.',
      sources: [wiki("Abraham_Lincoln's_Peoria_speech"), WORKS],
    }),
    mo('senate-1855', '1855-02-08', 'Loses the Senate race', {
      tags: ['politics'],
      notes:
        'Leading on the early ballots in the legislature, Lincoln throws his votes to **Lyman Trumbull** to make sure an anti-Nebraska man wins the seat.',
      sources: [wiki('Abraham_Lincoln'), LOG],
    }),
    mo('lost-speech', '1856-05-29', 'Joins the Republicans', {
      tags: ['speech', 'politics'],
      notes:
        'At the founding convention of the Illinois **Republican Party** in Bloomington he gives the "**Lost Speech**", so gripping, the story goes, that reporters forgot to take notes.',
      sources: [wiki("Lincoln's_Lost_Speech")],
    }),
    mo('vp-votes', '1856-06-19', '110 votes for vice president', {
      tags: ['politics'],
      notes:
        'At the first Republican national convention, in Philadelphia, Lincoln receives 110 votes on an informal ballot for vice president: the first sign of a national name.',
      sources: [wiki('1856_Republican_National_Convention')],
    }),
    mo('dred-scott', '1857-03-06', 'Dred Scott decision', {
      tags: ['slavery'],
      notes:
        'The Supreme Court rules that Black Americans cannot be citizens and that Congress cannot bar slavery from the territories.',
      sources: [wiki('Dred_Scott_v._Sandford')],
    }),
    mo('dred-scott-speech', '1857-06-26', 'Speech on the Dred Scott decision', {
      tags: ['speech', 'slavery'],
      notes:
        'In Springfield, Lincoln answers Douglas: the Declaration’s "all men are created equal" was meant to include Black Americans, as a standard to work toward.',
      sources: [wiki('Dred_Scott_v._Sandford'), WORKS],
    }),
    mo('effie-afton', '1857-09-01', 'The Effie Afton case', {
      tags: ['law'],
      datePrecision: 'The trial ran through September 1857; placed at the month’s start.',
      notes:
        'Lincoln helps defend the **Rock Island Bridge**, the first railroad bridge over the Mississippi, after a steamboat hits it. The jury deadlocks, and the railroads keep their bridge.',
      sources: [wiki('Hurd_v._Rock_Island_Bridge_Co.')],
    }),
    mo('almanac', '1858-05-07', 'The Almanac Trial', {
      tags: ['law'],
      notes:
        'Defending **William "Duff" Armstrong** for murder, Lincoln uses an almanac to show the Moon was too low for the witness to have seen the killing by its light. Armstrong is acquitted.',
      sources: [wiki('Abraham_Lincoln'), LOG],
    }),
    mo('house-divided', '1858-06-16', 'House Divided speech', {
      tags: ['speech', 'slavery'],
      notes:
        'Accepting the Republican nomination for the Senate, Lincoln says the nation cannot "endure, permanently half slave and half free": it will become all one thing or all the other.',
      sources: [wiki("Lincoln's_House_Divided_Speech"), WORKS],
    }),
    mo('ottawa', '1858-08-21', 'Debate at Ottawa', {
      tags: ['speech', 'politics'],
      notes:
        'The first of seven debates with **Stephen A. Douglas**, before a crowd of perhaps ten thousand.',
      sources: [wiki('Lincoln–Douglas_debates')],
    }),
    mo('freeport', '1858-08-27', 'Debate at Freeport', {
      tags: ['speech', 'politics'],
      notes:
        'Lincoln asks whether a territory’s people can exclude slavery; Douglas’s "Freeport Doctrine" answer costs him with Southern Democrats.',
      sources: [wiki('Lincoln–Douglas_debates')],
    }),
    mo('jonesboro', '1858-09-15', 'Debate at Jonesboro', {
      tags: ['speech', 'politics'],
      notes: 'The third debate, in deep southern Illinois, before the smallest crowd.',
      sources: [wiki('Lincoln–Douglas_debates')],
    }),
    mo('charleston', '1858-09-18', 'Debate at Charleston', {
      tags: ['speech', 'politics'],
      notes:
        'Near his father’s last home in Coles County, Lincoln disclaims social and political equality of the races, a passage historians still weigh against his later course.',
      sources: [wiki('Lincoln–Douglas_debates')],
    }),
    mo('galesburg', '1858-10-07', 'Debate at Galesburg', {
      tags: ['speech', 'politics'],
      notes: 'The fifth debate, at Knox College.',
      sources: [wiki('Lincoln–Douglas_debates')],
    }),
    mo('quincy', '1858-10-13', 'Debate at Quincy', {
      tags: ['speech', 'politics'],
      notes: 'The sixth debate, on the Mississippi.',
      sources: [wiki('Lincoln–Douglas_debates')],
    }),
    mo('alton', '1858-10-15', 'Debate at Alton', {
      tags: ['speech', 'politics'],
      notes:
        'The last debate: Lincoln frames the contest as the "eternal struggle" between right and wrong over slavery.',
      sources: [wiki('Lincoln–Douglas_debates')],
    }),
    mo('loses-1858', '1859-01-05', 'Douglas keeps his seat', {
      tags: ['politics'],
      notes:
        'Republican candidates win more votes statewide in November, but the Democrats hold the legislature, which re-elects **Douglas**. The debates, published, make Lincoln known nationally.',
      sources: [wiki('Lincoln–Douglas_debates')],
    }),
    mo('fell', '1859-12-20', 'A short autobiography', {
      tags: ['writing'],
      notes:
        'For **Jesse W. Fell**, Lincoln writes a brief account of his life for campaign use: "There is not much of it, for the reason, I suppose, that there is not much of me."',
      sources: [wiki('Abraham_Lincoln'), WORKS],
    }),
    mo('cooper-union', '1860-02-27', 'Cooper Union address', {
      tags: ['speech', 'slavery'],
      notes:
        'In New York, Lincoln shows that most of the Constitution’s signers held that Congress could regulate slavery in the territories, and ends: "let us have faith that right makes might". **Mathew Brady** photographs him the same day.',
      sources: [wiki('Cooper_Union_speech'), WORKS],
    }),
    mo('nominated', '1860-05-18', 'Nominated for president', {
      tags: ['politics'],
      notes:
        'At the **Republican National Convention** in Chicago’s Wigwam, Lincoln overtakes **William H. Seward** and is nominated on the third ballot.',
      sources: [wiki('1860_Republican_National_Convention')],
    }),
    mo('bedell', '1860-10-19', 'Letter to Grace Bedell', {
      tags: ['writing'],
      notes:
        'Answering eleven-year-old **Grace Bedell**, who suggested he grow whiskers, Lincoln asks whether people would call it "a piece of silly affect[at]ion". He grew a beard soon after.',
      sources: [wiki('Grace_Bedell'), WORKS],
    }),
    mo('elected', '1860-11-06', 'Elected president', {
      tags: ['politics'],
      notes:
        'With four candidates in the field, Lincoln wins with about 40 percent of the popular vote and a majority of the electoral college, without a single Southern electoral vote.',
      sources: [wiki('1860_United_States_presidential_election')],
    }),
    mo('south-carolina', '1860-12-20', 'South Carolina secedes', {
      tags: ['war'],
      notes: 'The first state to declare itself out of the Union, six weeks after the election.',
      sources: [wiki('Ordinance_of_Secession')],
    }),

    // ── The presidency ──
    h('h-presidency', '1861-02-01', 'The presidency'),
    mo('confederacy', '1861-02-08', 'The Confederacy is formed', {
      tags: ['war'],
      notes:
        'Seven seceded states adopt a provisional constitution at Montgomery, Alabama; **Jefferson Davis** is chosen president the next day.',
      sources: [wiki('Confederate_States_of_America')],
    }),
    mo('farewell', '1861-02-11', 'Farewell to Springfield', {
      tags: ['speech', 'home'],
      notes:
        'From the train, Lincoln tells his neighbors he leaves "with a task before me greater than that which rested upon Washington". He never returned alive.',
      sources: [wiki("Abraham_Lincoln's_farewell_address"), WORKS],
    }),
    mo('arrives', '1861-02-23', 'Arrives in Washington secretly', {
      tags: ['politics'],
      notes:
        'Warned of the **Baltimore Plot** against him, Lincoln passes through Baltimore at night on a changed schedule, and is mocked for it.',
      sources: [wiki('Baltimore_Plot')],
    }),
    mo('inaugural-1', '1861-03-04', 'First inaugural address', {
      tags: ['speech', 'office'],
      notes:
        'Sworn in by **Roger Taney**, Lincoln denies any intent to touch slavery in the states, declares the Union perpetual, and appeals to "the better angels of our nature".',
      sources: [wiki("Abraham_Lincoln's_first_inaugural_address"), WORKS],
    }),
    mo('sumter', '1861-04-12', 'Fort Sumter', {
      tags: ['war'],
      notes:
        'Lincoln sends supplies to the fort in Charleston harbor; Confederate batteries open fire before dawn, and the garrison surrenders the next day.',
      sources: [wiki('Battle_of_Fort_Sumter')],
    }),
    mo('volunteers', '1861-04-15', 'A call for 75,000 volunteers', {
      tags: ['war'],
      notes:
        'Lincoln calls out 75,000 militia for ninety days. Virginia, Arkansas, North Carolina and Tennessee secede rather than send troops.',
      sources: [wiki('Proclamation_80')],
    }),
    mo('blockade', '1861-04-19', 'Blockade of Southern ports', {
      tags: ['war'],
      notes: 'Lincoln proclaims a naval blockade of the seceded states’ coast.',
      sources: [wiki('Union_blockade')],
    }),
    mo('habeas', '1861-04-27', 'Habeas corpus suspended', {
      tags: ['war', 'law'],
      notes:
        'Lincoln authorizes **General Scott** to suspend the writ along the line from Philadelphia to Washington. Chief Justice Taney’s ruling against it in **Ex parte Merryman** is ignored.',
      sources: [wiki('Ex_parte_Merryman')],
    }),
    mo('bull-run', '1861-07-21', 'First Bull Run', {
      tags: ['war'],
      notes:
        'The first major battle, in Virginia, ends in a Union rout. Lincoln calls for long-term volunteers.',
      sources: [wiki('First_Battle_of_Bull_Run')],
    }),
    mo('mcclellan-chief', '1861-11-01', 'McClellan made general-in-chief', {
      tags: ['war'],
      notes:
        '**George B. McClellan** succeeds Winfield Scott. He builds a superb army and is slow to use it.',
      sources: [wiki('George_B._McClellan')],
    }),
    mo('trent', '1861-11-08', 'The Trent affair', {
      tags: ['war'],
      notes:
        'A Union captain seizes two Confederate envoys from a British ship. Lincoln releases them to avoid war with Britain: "one war at a time", he reportedly said.',
      sources: [wiki('Trent_Affair')],
    }),
    mo('donelson', '1862-02-16', 'Fort Donelson', {
      tags: ['war'],
      notes:
        '**Ulysses S. Grant** takes the fort in Tennessee and some twelve thousand prisoners: "unconditional surrender".',
      sources: [wiki('Battle_of_Fort_Donelson')],
    }),
    mo('willie-dies', '1862-02-20', 'Willie dies in the White House', {
      tags: ['family'],
      notes:
        '**Willie**, eleven, dies of typhoid fever. Lincoln is shattered, and Mary never fully recovers.',
      sources: [wiki('William_Wallace_Lincoln')],
    }),
    mo('shiloh', '1862-04-06', 'Shiloh', {
      tags: ['war'],
      notes:
        'Two days of fighting in Tennessee cost more than 23,000 casualties. To calls to remove Grant, Lincoln is said to have answered: "I can’t spare this man; he fights."',
      sources: [wiki('Battle_of_Shiloh')],
    }),
    mo('dc-emancipation', '1862-04-16', 'Slavery ends in Washington', {
      tags: ['slavery'],
      notes:
        'Lincoln signs the **District of Columbia Compensated Emancipation Act**, freeing about three thousand people and paying their enslavers.',
      sources: [wiki('District_of_Columbia_Compensated_Emancipation_Act')],
    }),
    mo('homestead', '1862-05-20', 'Homestead Act', {
      tags: ['office'],
      notes:
        'Up to 160 acres of public land for anyone who lives on it and farms it for five years.',
      sources: [wiki('Homestead_Acts')],
    }),
    mo('railway-act', '1862-07-01', 'Pacific Railway Act', {
      tags: ['office'],
      notes: 'Federal bonds and land grants for a railroad to the Pacific.',
      sources: [wiki('Pacific_Railroad_Acts')],
    }),
    mo('morrill', '1862-07-02', 'Morrill Land-Grant Act', {
      tags: ['office'],
      notes: 'Public land for colleges of agriculture and the mechanic arts in every loyal state.',
      sources: [wiki('Morrill_Land-Grant_Acts')],
    }),
    mo('cabinet-draft', '1862-07-22', 'Reads the proclamation to his cabinet', {
      tags: ['slavery', 'war'],
      notes:
        'Lincoln reads a draft emancipation proclamation. **William Seward** advises waiting for a victory, so it will not look like "our last shriek on the retreat".',
      sources: [wiki('Emancipation_Proclamation')],
    }),
    mo('greeley', '1862-08-22', 'Letter to Horace Greeley', {
      tags: ['writing', 'slavery'],
      notes:
        'Answering the New York Tribune’s editor in public, Lincoln says his "paramount object" is to save the Union, whether or not that frees any slave. The proclamation was already in his desk.',
      sources: [wiki('Emancipation_Proclamation'), WORKS],
    }),
    mo('antietam', '1862-09-17', 'Antietam', {
      tags: ['war'],
      notes:
        'The bloodiest single day in American history halts **Lee**’s invasion of Maryland: the victory Lincoln was waiting for.',
      sources: [wiki('Battle_of_Antietam')],
    }),
    mo('preliminary', '1862-09-22', 'Preliminary Emancipation Proclamation', {
      tags: ['slavery', 'war'],
      notes:
        'Lincoln announces that on January 1, enslaved people in any state still in rebellion will be "thenceforward, and forever free".',
      sources: [wiki('Emancipation_Proclamation'), NARA_EP],
    }),
    mo('mcclellan-removed', '1862-11-05', 'McClellan removed', {
      tags: ['war'],
      notes:
        'After McClellan fails to pursue Lee, Lincoln replaces him with **Ambrose Burnside** in command of the Army of the Potomac.',
      sources: [wiki('George_B._McClellan')],
    }),
    mo('annual-1862', '1862-12-01', 'Annual message: "the last best hope"', {
      tags: ['speech', 'slavery'],
      notes:
        'His annual message to Congress proposes compensated, gradual emancipation by amendment: "In giving freedom to the slave, we assure freedom to the free".',
      sources: [wiki('Abraham_Lincoln'), WORKS],
    }),
    mo('fredericksburg', '1862-12-13', 'Fredericksburg', {
      tags: ['war'],
      notes: 'Burnside’s assaults on Marye’s Heights fail with heavy losses.',
      sources: [wiki('Battle_of_Fredericksburg')],
    }),
    mo('emancipation', '1863-01-01', 'Emancipation Proclamation', {
      tags: ['slavery', 'war'],
      notes:
        'Lincoln declares free all enslaved people in the areas in rebellion, as a war measure, and opens the army and navy to Black men; about 180,000 served in the army.',
      sources: [wiki('Emancipation_Proclamation'), NARA_EP],
    }),
    mo('draft', '1863-03-03', 'Enrollment Act', {
      tags: ['war'],
      notes:
        'The first federal conscription law; a drafted man could pay $300 or hire a substitute.',
      sources: [wiki('Enrollment_Act')],
    }),
    mo('vicksburg', '1863-07-04', 'Vicksburg surrenders', {
      tags: ['war'],
      notes:
        'Grant takes the last great Confederate stronghold on the Mississippi, a day after Gettysburg ends. "The Father of Waters again goes unvexed to the sea," Lincoln wrote that summer.',
      sources: [wiki('Siege_of_Vicksburg')],
    }),
    mo('douglass', '1863-08-10', 'Frederick Douglass at the White House', {
      tags: ['slavery'],
      notes:
        '**Frederick Douglass** meets Lincoln to press for equal pay and protection for Black soldiers. They met twice more.',
      sources: [wiki('Frederick_Douglass')],
    }),
    mo('thanksgiving', '1863-10-03', 'Thanksgiving proclaimed', {
      tags: ['office'],
      notes:
        'Lincoln proclaims the last Thursday of November a national day of **Thanksgiving**, a holiday kept every year since.',
      sources: [wiki('Thanksgiving_(United_States)')],
    }),
    mo('gettysburg-address', '1863-11-19', 'Gettysburg Address', {
      tags: ['speech', 'war'],
      notes:
        'At the dedication of the Soldiers’ National Cemetery, after **Edward Everett**’s two-hour oration, Lincoln speaks for about two minutes: "a new birth of freedom".',
      sources: [wiki('Gettysburg_Address'), LOC_GA],
    }),
    mo('amnesty', '1863-12-08', 'Ten percent plan', {
      tags: ['office'],
      notes:
        'The **Proclamation of Amnesty and Reconstruction** offers pardon to most Confederates who swear loyalty, and readmits a state once ten percent of its 1860 voters do.',
      sources: [wiki('Ten_percent_plan')],
    }),
    mo('grant', '1864-03-09', 'Grant made lieutenant general', {
      tags: ['war'],
      notes:
        'Lincoln presents **Grant** his commission at the White House; three days later Grant commands all the Union armies.',
      sources: [wiki('Ulysses_S._Grant')],
    }),
    mo('senate-13th', '1864-04-08', 'Senate passes the Thirteenth Amendment', {
      tags: ['slavery'],
      notes: 'The amendment abolishing slavery passes the Senate; it fails in the House in June.',
      sources: [wiki('Thirteenth_Amendment_to_the_United_States_Constitution')],
    }),
    mo('renominated', '1864-06-08', 'Renominated', {
      tags: ['politics'],
      notes:
        'The **National Union** convention in Baltimore renominates Lincoln, with **Andrew Johnson**, a Tennessee Unionist Democrat, for vice president, and endorses an amendment abolishing slavery.',
      sources: [wiki('1864_National_Union_National_Convention')],
    }),
    mo('wade-davis', '1864-07-04', 'Wade–Davis Bill pocket-vetoed', {
      tags: ['office'],
      notes:
        'Lincoln declines to sign Congress’s harsher plan for Reconstruction, which required a majority, not ten percent, to swear loyalty.',
      sources: [wiki('Wade–Davis_Bill')],
    }),
    mo('fort-stevens', '1864-07-12', 'Under fire at Fort Stevens', {
      tags: ['war'],
      notes:
        'Watching **Jubal Early**’s raid on Washington from the parapet, Lincoln comes under fire; a surgeon standing near him is hit.',
      sources: [wiki('Battle_of_Fort_Stevens')],
    }),
    mo('blind-memo', '1864-08-23', 'The Blind Memorandum', {
      tags: ['politics', 'writing'],
      notes:
        'Expecting to lose, Lincoln writes that it seems "exceedingly probable" he will not be re-elected, has his cabinet sign it unread, and pledges to work with the winner to save the Union.',
      sources: [wiki('1864_United_States_presidential_election'), WORKS],
    }),
    mo('atlanta', '1864-09-02', 'Atlanta falls', {
      tags: ['war'],
      notes: '**William T. Sherman** takes Atlanta, turning the election.',
      sources: [wiki('Atlanta_campaign')],
    }),
    mo('reelected', '1864-11-08', 'Re-elected', {
      tags: ['politics'],
      notes:
        'Lincoln defeats **George McClellan**, carrying 212 of 233 electoral votes and, by most counts, about three-quarters of the soldiers’ votes.',
      sources: [wiki('1864_United_States_presidential_election')],
    }),
    mo('house-13th', '1865-01-31', 'The House passes the Thirteenth Amendment', {
      tags: ['slavery'],
      notes:
        'After weeks of pressure from Lincoln, the House passes the amendment by 119 to 56, two votes more than two-thirds.',
      sources: [wiki('Thirteenth_Amendment_to_the_United_States_Constitution'), NARA_13],
    }),
    mo('signs-13th', '1865-02-01', 'Lincoln signs the amendment', {
      tags: ['slavery'],
      notes:
        'Lincoln signs the joint resolution sending it to the states, though a president’s signature is not required. Illinois ratifies that day, the first state.',
      sources: [wiki('Thirteenth_Amendment_to_the_United_States_Constitution'), NARA_13],
    }),
    mo('hampton-roads', '1865-02-03', 'Hampton Roads Conference', {
      tags: ['war'],
      notes:
        'Lincoln meets Confederate commissioners aboard the **River Queen**; peace fails on his terms of reunion and no retreat on slavery.',
      sources: [wiki('Hampton_Roads_Conference')],
    }),
    mo('inaugural-2', '1865-03-04', 'Second inaugural address', {
      tags: ['speech', 'office'],
      notes:
        'Seven hundred words that call slavery the cause of the war and close: "With malice toward none, with charity for all… to bind up the nation’s wounds".',
      sources: [wiki("Abraham_Lincoln's_second_inaugural_address"), WORKS],
    }),

    // ── The last days ──
    h('h-last', '1865-04-01', 'The last days'),
    mo('richmond', '1865-04-04', 'Walks through Richmond', {
      tags: ['war'],
      notes:
        'The day after the Confederate capital falls, Lincoln walks its streets with **Tad**, greeted by freed people.',
      sources: [wiki('Abraham_Lincoln'), LOG],
    }),
    mo('appomattox', '1865-04-09', 'Surrender at Appomattox', {
      tags: ['war'],
      notes: '**Robert E. Lee** surrenders the Army of Northern Virginia to **Grant**.',
      sources: [wiki('Battle_of_Appomattox_Court_House')],
    }),
    mo('last-speech', '1865-04-11', 'Last public address', {
      tags: ['speech'],
      notes:
        'From a White House window, Lincoln speaks on Reconstruction and, for the first time in public, of the vote for some Black men. **John Wilkes Booth** is in the crowd.',
      sources: [wiki('Assassination_of_Abraham_Lincoln'), WORKS],
    }),
    mo('shot', '1865-04-14T22:15', "Shot at Ford's Theatre", {
      tags: ['war'],
      datePrecision: 'About 10:15 p.m., Washington time.',
      notes:
        'Watching **Our American Cousin** with Mary, Lincoln is shot in the back of the head by **John Wilkes Booth**. He is carried across the street to the **Petersen House**.',
      sources: [wiki('Assassination_of_Abraham_Lincoln'), NPS_FORDS],
    }),
    mo('dies', '1865-04-15T07:22', 'Lincoln dies', {
      tags: ['war'],
      notes:
        'He dies at 7:22 a.m. without regaining consciousness. "Now he belongs to the ages," **Edwin Stanton** is reported to have said.',
      sources: [wiki('Assassination_of_Abraham_Lincoln'), NPS_FORDS],
    }),
    mo('johnson', '1865-04-15T10:00', 'Andrew Johnson sworn in', {
      tags: ['office'],
      datePrecision: 'About 10 a.m.; accounts vary by up to an hour.',
      notes: '**Andrew Johnson** takes the oath at the Kirkwood House hotel.',
      sources: [wiki('Andrew_Johnson')],
    }),
    mo('funeral', '1865-04-19', 'Funeral in the East Room', {
      tags: ['family'],
      notes:
        'A funeral service at the White House; the body then lies in state in the **Capitol** rotunda.',
      sources: [wiki('Assassination_of_Abraham_Lincoln')],
    }),
    mo('booth', '1865-04-26', 'Booth killed', {
      tags: ['war'],
      notes: 'Cornered in a tobacco barn in Virginia, **Booth** is shot and dies.',
      sources: [wiki('John_Wilkes_Booth')],
    }),
    mo('burial', '1865-05-04', 'Buried in Springfield', {
      tags: ['family'],
      notes:
        'Lincoln is laid in the receiving vault at **Oak Ridge Cemetery**, Springfield, with Willie beside him. The Lincoln Tomb was dedicated in 1874.',
      sources: [wiki('Lincoln_Tomb')],
    }),
    mo('ratified-13th', '1865-12-06', 'Thirteenth Amendment ratified', {
      tags: ['slavery'],
      notes:
        'Georgia’s ratification completes three-quarters of the states: slavery is abolished in the United States, except as punishment for a crime.',
      sources: [wiki('Thirteenth_Amendment_to_the_United_States_Constitution'), NARA_13],
    }),
  ];

  const durations = [
    du('life', '1809-02-12', '1865-04-15T07:22', 'Life of Abraham Lincoln', {
      tags: ['family'],
      color: '#3d3a33',
      notes: 'Fifty-six years, from Sinking Spring Farm to the Petersen House.',
      sources: [wiki('Abraham_Lincoln')],
    }),
    // Homes
    du('sinking-spring', '1809-02-12', '1811-07-01', 'Sinking Spring Farm, Kentucky', {
      tags: ['home'],
      notes: 'His birthplace. The family left in the summer of 1811.',
      sources: [NPS_BIRTH],
    }),
    du('knob-creek-home', '1811-07-01', '1816-12-01', 'Knob Creek, Kentucky', {
      tags: ['home'],
      notes: 'From the summer of 1811 to December 1816.',
      sources: [NPS_BIRTH],
    }),
    du('indiana', '1816-12-01', '1830-03-01', 'Little Pigeon Creek, Indiana', {
      tags: ['home'],
      notes: 'From age seven to twenty-one; dates are to the month.',
      sources: [wiki('Lincoln_Boyhood_National_Memorial'), NPS_BOYHOOD],
    }),
    du('macon', '1830-03-01', '1831-07-25', 'Macon County, Illinois', {
      tags: ['home'],
      notes:
        'The family’s first Illinois farm, near Decatur, through the hard "winter of the deep snow"; Abraham leaves for New Salem in 1831.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln')],
    }),
    du('new-salem-home', '1831-07-25', '1837-04-15', 'New Salem, Illinois', {
      tags: ['home'],
      notes: 'Six years in the village; its arrival day is approximate.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln')],
    }),
    du('springfield-rooms', '1837-04-15', '1844-05-01', 'Springfield: rented rooms', {
      tags: ['home'],
      notes:
        'Above Speed’s store, then after marrying at the **Globe Tavern** and a rented cottage.',
      sources: [wiki('Joshua_Fry_Speed'), NPS_HOME],
    }),
    du('home', '1844-05-01', '1861-02-11', 'The Lincoln Home, Springfield', {
      tags: ['home', 'family'],
      notes: 'From May 1844 until he left for Washington.',
      sources: [wiki('Lincoln_Home_National_Historic_Site'), NPS_HOME],
    }),
    // Offices
    du('black-hawk', '1832-04-21', '1832-07-10', 'Black Hawk War service', {
      tags: ['war'],
      notes:
        'Three enlistments, first as captain, then as a private; mustered out July 10. He saw no fighting.',
      sources: [wiki('Abraham_Lincoln_in_the_Black_Hawk_War')],
    }),
    du('postmaster-term', '1833-05-07', '1836-05-30', 'Postmaster of New Salem', {
      tags: ['office'],
      notes: 'Until the office moved to Petersburg.',
      sources: [wiki('Early_life_and_career_of_Abraham_Lincoln'), LOG],
    }),
    du('illinois-house', '1834-12-01', '1842-12-04', 'Illinois House of Representatives', {
      tags: ['office', 'politics'],
      notes: 'Four terms for Sangamon County, as a Whig.',
      sources: [wiki('Abraham_Lincoln')],
    }),
    du('congress', '1847-03-04', '1849-03-03', 'U.S. House of Representatives', {
      tags: ['office', 'politics'],
      notes: 'One term, for Illinois’s 7th district; he took his seat on December 6, 1847.',
      sources: [wiki('Abraham_Lincoln')],
    }),
    du('away', '1849-03-04', '1854-05-30', 'Away from politics', {
      tags: ['law'],
      notes:
        'Back to the law and the circuit after Congress. Lincoln wrote in 1859 that he was "losing interest in politics" until the Kansas–Nebraska Act roused him again.',
      sources: [wiki('Abraham_Lincoln'), WORKS],
    }),
    du('presidency', '1861-03-04T12:00', '1865-04-15T07:22', 'President of the United States', {
      tags: ['office', 'politics', 'home'],
      notes:
        'The 16th president, from noon on March 4, 1861, to his death. The family lived in the **White House**, and from 1862 spent summers at the Soldiers’ Home on the city’s edge.',
      sources: [wiki('Presidency_of_Abraham_Lincoln')],
    }),
    // Law
    du('stuart', '1837-04-15', '1841-04-14', 'Stuart & Lincoln', {
      tags: ['law'],
      notes: 'His first partnership, with **John Todd Stuart**; it ended in April 1841.',
      sources: [wiki('John_T._Stuart')],
    }),
    du('logan', '1841-04-14', '1844-12-01', 'Logan & Lincoln', {
      tags: ['law'],
      notes:
        'With **Stephen T. Logan**, a demanding lawyer who taught him care in preparation. Formed in April 1841, it ended in late 1844.',
      sources: [wiki('Stephen_T._Logan')],
    }),
    du('herndon', '1844-12-01', '1865-04-15T07:22', 'Lincoln & Herndon', {
      tags: ['law'],
      notes:
        'With **William H. Herndon**, from late 1844. Lincoln asked that the shingle stay up while he was president; Herndon later wrote a biography of him.',
      sources: [wiki('William_Herndon_(lawyer)')],
    }),
    // Family
    du('marriage-span', '1842-11-04', '1865-04-15T07:22', 'Married to Mary Todd Lincoln', {
      tags: ['family'],
      notes: 'Twenty-two years; four sons.',
      sources: [wiki('Mary_Todd_Lincoln')],
    }),
    du('eddie-life', '1846-03-10', '1850-02-01', 'Eddie Lincoln', {
      tags: ['family'],
      notes: 'Edward Baker Lincoln, not quite four.',
      sources: [wiki('Edward_Baker_Lincoln')],
    }),
    du('willie-life', '1850-12-21', '1862-02-20', 'Willie Lincoln', {
      tags: ['family'],
      notes: 'William Wallace Lincoln, eleven.',
      sources: [wiki('William_Wallace_Lincoln')],
    }),
    // Politics
    du('debates', '1858-08-21', '1858-10-16', 'Lincoln–Douglas debates', {
      tags: ['speech', 'politics'],
      notes:
        'Seven debates, one in each of seven of Illinois’s nine congressional districts; both men had already spoken in the other two, at Chicago and Springfield.',
      sources: [wiki('Lincoln–Douglas_debates')],
    }),
    du('campaign-1860', '1860-05-18', '1860-11-06', 'The 1860 campaign', {
      tags: ['politics'],
      notes:
        'As was the custom, Lincoln did not campaign himself; he stayed in Springfield while the "Rail Splitter" was sold to voters.',
      sources: [wiki('1860_United_States_presidential_election')],
    }),
    du('secession', '1860-12-20', '1861-06-08', 'Secession', {
      tags: ['war'],
      notes: 'From South Carolina to Tennessee, the eleventh state to secede.',
      sources: [wiki('Secession_in_the_United_States')],
    }),
    du('inaugural-journey', '1861-02-11', '1861-02-23', 'Journey to Washington', {
      tags: ['politics'],
      notes: 'Twelve days by train through the Northern states, with speeches at many stops.',
      sources: [wiki('Baltimore_Plot')],
    }),
    du('campaign-1864', '1864-06-08', '1864-11-08', 'The 1864 campaign', {
      tags: ['politics'],
      notes: 'From renomination to re-election, through the summer when he expected to lose.',
      sources: [wiki('1864_United_States_presidential_election')],
    }),
    // War
    du('civil-war', '1861-04-12', '1865-04-09', 'Civil War', {
      tags: ['war'],
      notes:
        'From Fort Sumter to Lee’s surrender at Appomattox. The last Confederate forces surrendered in the weeks after.',
      sources: [wiki('American_Civil_War')],
    }),
    du('mcclellan', '1861-07-26', '1862-11-07', 'McClellan commands the Army of the Potomac', {
      tags: ['war'],
      notes: 'With a break in the late summer of 1862; relieved in November.',
      sources: [wiki('George_B._McClellan')],
    }),
    du('seven-days', '1862-06-25', '1862-07-02', 'Seven Days Battles', {
      tags: ['war'],
      notes: 'Lee drives McClellan back from Richmond.',
      sources: [wiki('Seven_Days_Battles')],
    }),
    du('second-bull-run', '1862-08-28', '1862-08-31', 'Second Bull Run', {
      tags: ['war'],
      notes: 'Another Union defeat in Virginia, under John Pope.',
      sources: [wiki('Second_Battle_of_Bull_Run')],
    }),
    du('chancellorsville', '1863-04-30', '1863-05-07', 'Chancellorsville', {
      tags: ['war'],
      notes: 'Lee defeats Hooker; on hearing, Lincoln asks "What will the country say?"',
      sources: [wiki('Battle_of_Chancellorsville')],
    }),
    du('vicksburg-siege', '1863-05-18', '1863-07-04', 'Siege of Vicksburg', {
      tags: ['war'],
      notes: 'Grant’s forty-seven-day siege.',
      sources: [wiki('Siege_of_Vicksburg')],
    }),
    du('gettysburg', '1863-07-01', '1863-07-04', 'Gettysburg', {
      tags: ['war'],
      notes: 'July 1–3, 1863: Lee’s second invasion of the North turned back.',
      sources: [wiki('Battle_of_Gettysburg')],
    }),
    du('draft-riots', '1863-07-13', '1863-07-17', 'New York draft riots', {
      tags: ['war'],
      notes: 'Four days of violence against the draft, and against Black New Yorkers.',
      sources: [wiki('New_York_City_draft_riots')],
    }),
    du('overland', '1864-05-04', '1864-06-24', 'Overland Campaign', {
      tags: ['war'],
      notes: 'Grant against Lee from the Wilderness to Petersburg, at terrible cost.',
      sources: [wiki('Overland_Campaign')],
    }),
    du('petersburg', '1864-06-09', '1865-03-25', 'Siege of Petersburg', {
      tags: ['war'],
      notes: 'Nine months of trench warfare before Richmond fell.',
      sources: [wiki('Siege_of_Petersburg')],
    }),
    du('march-to-sea', '1864-11-15', '1864-12-21', 'March to the Sea', {
      tags: ['war'],
      notes: 'Sherman from Atlanta to Savannah, which he offered Lincoln as a Christmas gift.',
      sources: [wiki("Sherman's_March_to_the_Sea")],
    }),
    // The end
    du('night', '1865-04-14T22:15', '1865-04-15T07:22', 'The night at the Petersen House', {
      tags: ['war'],
      notes: 'Nine hours from the shot to his death.',
      sources: [wiki('Petersen_House')],
    }),
    du('funeral-train', '1865-04-21', '1865-05-03', 'The funeral train', {
      tags: ['family'],
      notes:
        'About 1,650 miles from Washington to Springfield, through Baltimore, Philadelphia, New York, Albany, Cleveland, Chicago and more, retracing much of his 1861 journey. Willie’s coffin travelled with his.',
      sources: [wiki('State_funeral_of_Abraham_Lincoln')],
    }),
  ];

  const relationships = [
    rel('nancy-dies', 'stepmother'),
    rel('candidacy', 'loses-1832'),
    rel('loses-1832', 'elected-1834'),
    rel('elected-1834', 'license'),
    rel('license', 'd:stuart'),
    rel('capital', 'to-springfield'),
    rel('shields', 'marriage'),
    rel('marriage', 'robert-born'),
    rel('marriage', 'eddie-born'),
    rel('marriage', 'willie-born'),
    rel('marriage', 'tad-born'),
    rel('eddie-born', 'eddie-dies'),
    rel('willie-born', 'willie-dies'),
    rel('spot', 'war-speech'),
    rel('protest', 'peoria'),
    rel('kansas-nebraska', 'peoria'),
    rel('kansas-nebraska', 'd:away'),
    rel('peoria', 'senate-1855'),
    rel('dred-scott', 'dred-scott-speech'),
    rel('dred-scott-speech', 'house-divided'),
    rel('house-divided', 'd:debates'),
    rel('d:debates', 'loses-1858'),
    rel('cooper-union', 'nominated'),
    rel('elected', 'south-carolina'),
    rel('sumter', 'volunteers'),
    rel('cabinet-draft', 'preliminary'),
    rel('antietam', 'preliminary'),
    rel('preliminary', 'emancipation'),
    rel('dc-emancipation', 'emancipation'),
    rel('emancipation', 'house-13th'),
    rel('house-13th', 'signs-13th'),
    rel('signs-13th', 'ratified-13th'),
    rel('d:gettysburg', 'gettysburg-address'),
    rel('blind-memo', 'reelected'),
    rel('atlanta', 'reelected'),
    rel('last-speech', 'shot'),
    rel('shot', 'dies'),
    rel('dies', 'johnson'),
    rel('willie-dies', 'd:funeral-train'),
    rel('d:funeral-train', 'burial'),
  ];

  return {
    format: 'openchronology',
    version: 1,
    title: 'Abraham Lincoln, 1809–1865',
    description:
      'A biography of Abraham Lincoln, from his birth in a Kentucky cabin to his funeral train: the frontier, New Salem, the law, his family, his return to politics over slavery, the debates with Douglas, the presidency and the Civil War, emancipation, and his death.\n\n**How to read it.** Chapter headings mark the stages of his life. Homes, offices, partnerships, campaigns, battles and the war are durations; everything else is a moment, tagged by thread (family, home, law, politics, office, speech, writing, slavery, war, work). Related moments are linked: a cause and what it led to.\n\n**Dates.** Local days; times of day are Washington’s, shown at a fixed UTC−5 (standard time zones came only in 1883). Where a date is approximate, its dating note says so.\n\nA sample timeline built from the cited sources (Wikipedia, The Lincoln Log, the Collected Works, the National Archives, the Library of Congress and the National Park Service); not a definitive history.',
    presentation: {
      mode: 'gregorian',
      unit: '',
      scale: '1/1',
      origin: '0/1',
      version: 1,
      offsetMinutes: -300,
      significantDigits: 6,
    },
    tags: ['history', 'biography', 'abraham lincoln', 'united states', 'civil war', 'education'],
    plugins: [
      ...plugins(
        core.RICH_TEXT_NOTES,
        core.MOMENT_HEADINGS,
        core.MOMENT_SOURCES,
        core.MOMENT_COLORS,
        core.DATING_CONTEXT,
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
