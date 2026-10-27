// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The U.S. Civil War, 1861–1865, with its causes and aftermath: the Civil War tour's sample
// (Video 20, Short 17). Well-established dates only, each moment linked to its Wikipedia article
// and, where it's the natural reference, to the National Archives, the Library of Congress, the
// National Park Service, the Avalon Project's texts of the secession declarations, or J. David
// Hacker's 2011 census-based count of the dead.
// Dates are local days. Standard time zones came only in 1883, so the display uses a fixed
// UTC−5 (eastern clocks to within a few minutes); a day given here is midnight of that day at
// UTC−5, and the few times of day (Fort Sumter, Ford's Theatre) are local.
import { at as utc, m, d, rel, plugins, theme, wiki } from './lib.mjs';

/** A local date or date-time (YYYY-MM-DD or YYYY-MM-DDTHH:MM) at UTC−5. */
const at = (local) => utc(`${local.length === 10 ? local + 'T00:00' : local}:00-05:00`);

const NARA = 'https://www.archives.gov/milestone-documents/';
const NARA_EP = 'https://www.archives.gov/exhibits/featured-documents/emancipation-proclamation';
const NARA_USCT = 'https://www.archives.gov/education/lessons/blacks-civil-war';
const NARA_JUNETEENTH = 'https://www.archives.gov/news/articles/juneteenth-original-document';
const LOC_GA = 'https://www.loc.gov/exhibits/gettysburg-address/';
const AVALON = (page) => `https://avalon.law.yale.edu/19th_century/${page}.asp`;
const NPS = (park) => `https://www.nps.gov/${park}/index.htm`;
const HACKER = 'https://muse.jhu.edu/article/465917';

// One colour per thread, in the archive palette.
const COLOR = {
  slavery: '#b0782a',
  'black soldiers': '#5b4a8a',
  politics: '#1f3a5f',
  east: '#9c3b2a',
  west: '#4f7a4a',
  navy: '#2f6f7a',
  command: '#7a5c2e',
  surrender: '#6b5a4a',
  reconstruction: '#3f6e8c',
};
/** Options with the colour of the first tag. */
const c = (o) => ({ ...o, color: o.color ?? COLOR[o.tags?.[0]] });

export function civilWar(core) {
  const h = (id, iso, title) => m(id, at(iso), title, { headingLevel: 'h2', tags: ['chapter'] });
  const mo = (id, iso, title, o) => m(id, at(iso), title, c(o));
  const du = (id, a, b, title, o) => d(id, at(a), at(b), title, c(o));
  const events = [
    // ── Roots ──
    h('h-roots', '1820-01-01', 'Roots of the war, 1820–1860'),
    mo('missouri', '1820-03-06', 'Missouri Compromise', {
      tags: ['slavery', 'politics'],
      notes:
        'President **James Monroe** signs the act that admits Missouri as a slave state (with Maine as a free one) and bars slavery from the rest of the Louisiana Purchase north of 36°30′.',
      sources: [wiki('Missouri_Compromise'), NARA + 'missouri-compromise'],
    }),
    mo('liberator', '1831-01-01', 'The Liberator', {
      tags: ['slavery'],
      notes:
        "**William Lloyd Garrison**'s weekly first appears in Boston, demanding the immediate abolition of slavery. It runs until the Thirteenth Amendment is ratified.",
      sources: [wiki('The_Liberator_(newspaper)')],
    }),
    mo('nat-turner', '1831-08-21', "Nat Turner's rebellion", {
      tags: ['slavery'],
      notes:
        'Enslaved preacher **Nat Turner** leads a revolt in Southampton County, Virginia, killing about 55 to 65 white people. Militias and mobs kill many Black people in reprisal; Turner is hanged, and Southern states tighten their slave codes.',
      sources: [wiki("Nat_Turner's_Rebellion")],
    }),
    mo('douglass-narrative', '1845-05-01', 'Narrative of the Life of Frederick Douglass', {
      tags: ['slavery'],
      datePrecision: 'Published in May 1845; placed on May 1.',
      notes:
        '**Frederick Douglass**, who escaped slavery in Maryland in 1838, publishes his autobiography in Boston. It becomes the best-known account of slavery by someone who lived it.',
      sources: [wiki('Narrative_of_the_Life_of_Frederick_Douglass')],
    }),
    mo('tubman-escapes', '1849-10-01', 'Harriet Tubman escapes', {
      tags: ['slavery'],
      datePrecision: 'Autumn 1849; the day is not recorded.',
      notes:
        '**Harriet Tubman** escapes slavery on Maryland’s Eastern Shore to Philadelphia. She returns again and again over the next decade to lead family members and others to freedom.',
      sources: [wiki('Harriet_Tubman')],
    }),
    mo('fugitive-slave-act', '1850-09-18', 'Fugitive Slave Act', {
      tags: ['slavery', 'politics'],
      notes:
        'Part of the **Compromise of 1850**: federal commissioners return people who escaped slavery, without a jury trial, and anyone who helps them faces fines and prison. It turns many Northerners against slavery.',
      sources: [wiki('Fugitive_Slave_Act_of_1850')],
    }),
    mo('uncle-toms-cabin', '1852-03-20', "Uncle Tom's Cabin", {
      tags: ['slavery'],
      notes:
        "**Harriet Beecher Stowe**'s novel, serialized in *The National Era* from June 1851, is published as a book. It sells about 300,000 copies in the United States in its first year.",
      sources: [wiki("Uncle_Tom's_Cabin")],
    }),
    mo('kansas-nebraska', '1854-05-30', 'Kansas–Nebraska Act', {
      tags: ['slavery', 'politics'],
      notes:
        '**Stephen Douglas**\'s act organizes the Kansas and Nebraska territories and lets their settlers decide on slavery ("popular sovereignty"), repealing the Missouri Compromise line. Its opponents soon form the **Republican Party**.',
      sources: [wiki('Kansas–Nebraska_Act'), NARA + 'kansas-nebraska-act'],
    }),
    mo('sack-of-lawrence', '1856-05-21', 'Sack of Lawrence', {
      tags: ['slavery', 'west'],
      notes:
        'A proslavery posse ransacks **Lawrence**, Kansas, the free-state settlers’ town: presses destroyed, the Free State Hotel burned.',
      sources: [wiki('Sacking_of_Lawrence')],
    }),
    mo('sumner-caning', '1856-05-22', 'Sumner caned in the Senate', {
      tags: ['slavery', 'politics'],
      notes:
        'Representative **Preston Brooks** of South Carolina beats Senator **Charles Sumner** unconscious at his desk, two days after Sumner’s "Crime against Kansas" speech.',
      sources: [wiki('Caning_of_Charles_Sumner')],
    }),
    mo('pottawatomie', '1856-05-24', 'Pottawatomie massacre', {
      tags: ['slavery', 'west'],
      datePrecision: 'The night of May 24–25, 1856.',
      notes:
        '**John Brown** and his followers kill five proslavery settlers along Pottawatomie Creek, Kansas, in reply to the sack of Lawrence.',
      sources: [wiki('Pottawatomie_massacre')],
    }),
    mo('dred-scott', '1857-03-06', 'Dred Scott v. Sandford', {
      tags: ['slavery', 'politics'],
      notes:
        'Chief Justice **Roger Taney**’s Supreme Court rules that Black Americans cannot be citizens and that Congress cannot bar slavery from the territories, so the Missouri Compromise was unconstitutional.',
      sources: [wiki('Dred_Scott_v._Sandford'), NARA + 'dred-scott-v-sandford'],
    }),
    mo('brown-hanged', '1859-12-02', 'John Brown hanged', {
      tags: ['slavery'],
      notes:
        'Convicted of treason against Virginia, murder and inciting slave insurrection, **John Brown** is hanged at Charles Town. Many in the North mourn him as a martyr; many in the South see Northern plots behind him.',
      sources: [wiki('John_Brown_(abolitionist)')],
    }),
    // ── Election and secession ──
    h('h-secession', '1860-11-01', 'Election and secession'),
    mo('lincoln-elected', '1860-11-06', 'Lincoln elected president', {
      tags: ['politics'],
      notes:
        '**Abraham Lincoln**, the Republican who would keep slavery out of the territories, wins the presidency with no electoral votes from the South. Secession conventions follow within weeks.',
      sources: [wiki('1860_United_States_presidential_election')],
    }),
    mo('crittenden', '1860-12-18', 'Crittenden Compromise proposed', {
      tags: ['politics', 'slavery'],
      notes:
        'Senator **John J. Crittenden** of Kentucky proposes amendments to protect slavery south of 36°30′ forever. Lincoln and most Republicans refuse to extend slavery, and it fails.',
      sources: [wiki('Crittenden_Compromise')],
    }),
    mo('sc-secedes', '1860-12-20', 'South Carolina secedes', {
      tags: ['politics', 'slavery'],
      notes:
        'A convention in Charleston votes unanimously to leave the Union, the first state to do so.',
      sources: [wiki('South_Carolina_in_the_American_Civil_War')],
    }),
    mo('sc-declaration', '1860-12-24', "South Carolina's Declaration of Causes", {
      tags: ['slavery', 'politics'],
      notes:
        'The convention’s **Declaration of the Immediate Causes** justifies secession by the "increasing hostility on the part of the non-slaveholding States to the institution of slavery", citing the free states’ refusal to return fugitives and Lincoln’s election.',
      sources: [wiki('South_Carolina_Declaration_of_Secession'), AVALON('csa_scarsec')],
    }),
    mo('mississippi-secedes', '1861-01-09', 'Mississippi secedes', {
      tags: ['politics', 'slavery'],
      notes:
        'Its convention’s declaration of causes begins: "Our position is thoroughly identified with the institution of slavery—the greatest material interest of the world."',
      sources: [wiki('Mississippi_in_the_American_Civil_War'), AVALON('csa_missec')],
    }),
    mo('florida-secedes', '1861-01-10', 'Florida secedes', {
      tags: ['politics'],
      notes: 'The third state to leave the Union.',
      sources: [wiki('Florida_in_the_American_Civil_War')],
    }),
    mo('alabama-secedes', '1861-01-11', 'Alabama secedes', {
      tags: ['politics'],
      notes: 'The fourth state to leave the Union.',
      sources: [wiki('Alabama_in_the_American_Civil_War')],
    }),
    mo('georgia-secedes', '1861-01-19', 'Georgia secedes', {
      tags: ['politics', 'slavery'],
      notes:
        'Georgia’s declaration of causes, adopted ten days later, names the North’s hostility to slavery as the reason.',
      sources: [wiki('Georgia_in_the_American_Civil_War'), AVALON('csa_geosec')],
    }),
    mo('louisiana-secedes', '1861-01-26', 'Louisiana secedes', {
      tags: ['politics'],
      notes: 'The sixth state to leave the Union.',
      sources: [wiki('Louisiana_in_the_American_Civil_War')],
    }),
    mo('kansas-admitted', '1861-01-29', 'Kansas admitted as a free state', {
      tags: ['slavery', 'politics'],
      notes:
        'With Southern senators gone, Congress admits Kansas under its antislavery Wyandotte Constitution.',
      sources: [wiki('Kansas'), wiki('Bleeding_Kansas')],
    }),
    mo('texas-secedes', '1861-02-01', 'Texas secedes', {
      tags: ['politics', 'slavery'],
      notes:
        'Its convention votes to leave, over Governor **Sam Houston**’s opposition; voters ratify it on February 23. Its declaration of causes defends slavery as the foundation of the state’s prosperity.',
      sources: [wiki('Texas_in_the_American_Civil_War'), AVALON('csa_texsec')],
    }),
    mo('csa-formed', '1861-02-08', 'The Confederate States formed', {
      tags: ['politics'],
      notes:
        'Delegates of six seceded states, meeting in **Montgomery**, Alabama, since February 4, adopt a provisional constitution; Texas’s delegates join them later. The next day they choose **Jefferson Davis** as provisional president.',
      sources: [
        wiki('Confederate_States_of_America'),
        wiki('Provisional_Congress_of_the_Confederate_States'),
      ],
    }),
    mo('corwin', '1861-03-02', 'Corwin Amendment passes Congress', {
      tags: ['politics', 'slavery'],
      notes:
        'A last attempt at compromise: an amendment forbidding Congress ever to abolish slavery in the states. Lincoln does not oppose it; only a few states ratify it, and the war overtakes it.',
      sources: [wiki('Corwin_Amendment')],
    }),
    mo('csa-constitution', '1861-03-11', 'Confederate Constitution', {
      tags: ['politics', 'slavery'],
      notes:
        'The permanent constitution copies much of the U.S. one, but forbids any law "denying or impairing the right of property in negro slaves" and protects slavery in any new territory.',
      sources: [wiki('Constitution_of_the_Confederate_States'), AVALON('csa_csa')],
    }),
    mo('cornerstone', '1861-03-21', 'Cornerstone Speech', {
      tags: ['slavery', 'politics'],
      notes:
        'Confederate vice president **Alexander Stephens**, at Savannah, says the new government’s "cornerstone rests upon the great truth that the negro is not equal to the white man; that slavery … is his natural and normal condition."',
      sources: [
        wiki('Cornerstone_Speech'),
        'https://www.battlefields.org/learn/primary-sources/cornerstone-speech',
      ],
    }),
    // ── 1861 ──
    h('h-1861', '1861-04-01', '1861: The war begins'),
    mo('sumter', '1861-04-12T04:30', 'Fort Sumter', {
      tags: ['east'],
      notes:
        'Confederate batteries open fire on the federal fort in Charleston Harbor at 4:30 in the morning. Major **Robert Anderson** surrenders it the next day: the war begins.',
      sources: [wiki('Battle_of_Fort_Sumter'), NPS('fosu')],
    }),
    mo('call-75000', '1861-04-15', 'Lincoln calls for 75,000 volunteers', {
      tags: ['politics'],
      notes:
        'Lincoln calls up 75,000 militia for ninety days to put down the rebellion. Four states of the upper South secede rather than send troops.',
      sources: [wiki('Proclamation_80')],
    }),
    mo('virginia-secedes', '1861-04-17', 'Virginia secedes', {
      tags: ['politics'],
      notes:
        'Virginia’s convention votes to secede; voters ratify it in May. Richmond becomes the Confederate capital.',
      sources: [wiki('Virginia_in_the_American_Civil_War')],
    }),
    mo('anaconda', '1861-05-03', 'The Anaconda Plan', {
      tags: ['navy'],
      datePrecision: 'General Scott set out the plan in letters of May 3 and May 21, 1861.',
      notes:
        'General-in-chief **Winfield Scott** proposes to strangle the Confederacy: blockade its coast and take the Mississippi. Mocked at first, its outline is how the war was won.',
      sources: [wiki('Anaconda_Plan')],
    }),
    mo('arkansas-secedes', '1861-05-06', 'Arkansas secedes', {
      tags: ['politics'],
      notes: 'The ninth state to leave the Union.',
      sources: [wiki('Arkansas_in_the_American_Civil_War')],
    }),
    mo('nc-secedes', '1861-05-20', 'North Carolina secedes', {
      tags: ['politics'],
      notes: 'The tenth state to leave the Union.',
      sources: [wiki('North_Carolina_in_the_American_Civil_War')],
    }),
    mo('contraband', '1861-05-24', '"Contraband of war"', {
      tags: ['slavery', 'east'],
      notes:
        '**Shepard Mallory**, **Frank Baker** and **James Townsend**, enslaved men who escaped to Fort Monroe, Virginia, are refused to their owner by General **Benjamin Butler** as "contraband of war". Thousands follow them to Union lines.',
      sources: [wiki('Contraband_(American_Civil_War)')],
    }),
    mo('tennessee-secedes', '1861-06-08', 'Tennessee secedes', {
      tags: ['politics'],
      notes: 'Voters approve secession, the last of the eleven states to leave.',
      sources: [wiki('Tennessee_in_the_American_Civil_War')],
    }),
    mo('first-bull-run', '1861-07-21', 'First Bull Run', {
      tags: ['east'],
      notes:
        'The first major battle, near Manassas, Virginia: a Union army under **Irvin McDowell** is routed back to Washington. **Thomas Jackson** earns the name "Stonewall". Neither side expects a short war after it.',
      sources: [wiki('First_Battle_of_Bull_Run')],
    }),
    mo('confiscation-1861', '1861-08-06', 'First Confiscation Act', {
      tags: ['slavery', 'politics'],
      notes:
        'Congress allows the seizure of property, including enslaved people, used to support the rebellion.',
      sources: [wiki('Confiscation_Act_of_1861')],
    }),
    // ── 1862 ──
    h('h-1862', '1862-01-01', '1862: From Donelson to Antietam'),
    mo('fort-henry', '1862-02-06', 'Fort Henry', {
      tags: ['west'],
      notes:
        'Union gunboats under **Andrew Foote** force the surrender of Fort Henry on the Tennessee River, opening it to Union boats.',
      sources: [wiki('Battle_of_Fort_Henry')],
    }),
    mo('donelson-surrender', '1862-02-16', 'Fort Donelson: "unconditional surrender"', {
      tags: ['west', 'surrender'],
      notes:
        '**Ulysses S. Grant** demands "no terms except an unconditional and immediate surrender", and about 12,000 Confederates give up the fort on the Cumberland River. Kentucky and much of Tennessee fall to the Union.',
      sources: [wiki('Battle_of_Fort_Donelson')],
    }),
    mo('hampton-roads', '1862-03-09', 'Monitor and Virginia', {
      tags: ['navy'],
      notes:
        'The first battle between ironclads, at **Hampton Roads**, Virginia: USS *Monitor* and CSS *Virginia* fight to a draw, a day after *Virginia* sank two wooden warships.',
      sources: [wiki('Battle_of_Hampton_Roads')],
    }),
    mo('dc-emancipation', '1862-04-16', 'Slavery abolished in Washington, D.C.', {
      tags: ['slavery', 'politics'],
      notes:
        'The **District of Columbia Compensated Emancipation Act** frees about 3,100 people, paying their owners. Washington still marks April 16 as Emancipation Day.',
      sources: [wiki('District_of_Columbia_Compensated_Emancipation_Act')],
    }),
    mo('new-orleans', '1862-04-25', 'Farragut takes New Orleans', {
      tags: ['navy', 'west'],
      datePrecision:
        'The fleet passed the forts on April 24 and reached the city on April 25; it formally surrendered on April 29, and troops occupied it on May 1.',
      notes:
        'Flag Officer **David Farragut**’s fleet runs past the forts below the city and takes the Confederacy’s largest city and port.',
      sources: [wiki('Capture_of_New_Orleans')],
    }),
    mo('smalls', '1862-05-13', 'Robert Smalls takes the Planter', {
      tags: ['slavery', 'navy'],
      notes:
        '**Robert Smalls**, an enslaved pilot, steers the Confederate steamer *Planter* out of Charleston Harbor before dawn with his family and crew aboard, and hands it to the Union blockade. He later serves five terms in Congress.',
      sources: [wiki('Robert_Smalls')],
    }),
    mo('militia-act', '1862-07-17', 'Second Confiscation Act and Militia Act', {
      tags: ['slavery', 'black soldiers'],
      notes:
        'Congress declares free the enslaved people of rebel owners who reach Union lines, and lets the president enlist Black men in the service of the army.',
      sources: [wiki('Confiscation_Act_of_1862'), wiki('Militia_Act_of_1862')],
    }),
    mo('cabinet-reading', '1862-07-22', 'Emancipation read to the cabinet', {
      tags: ['slavery', 'politics'],
      notes:
        'Lincoln reads his cabinet a draft proclamation of emancipation. **William Seward** advises waiting for a victory, so it doesn’t look like an act of desperation.',
      sources: [wiki('Emancipation_Proclamation')],
    }),
    mo('antietam', '1862-09-17', 'Antietam', {
      tags: ['east'],
      notes:
        'At Sharpsburg, Maryland, **McClellan** stops **Lee**’s first invasion of the North. About 23,000 men are killed, wounded or missing: the bloodiest single day in American history.',
      sources: [wiki('Battle_of_Antietam'), NPS('anti')],
    }),
    mo('preliminary', '1862-09-22', 'Preliminary Emancipation Proclamation', {
      tags: ['slavery', 'politics'],
      notes:
        'Five days after Antietam, Lincoln announces that on January 1, 1863, enslaved people in any state still in rebellion "shall be then, thenceforward, and forever free."',
      sources: [wiki('Emancipation_Proclamation'), NARA_EP],
    }),
    mo('perryville', '1862-10-08', 'Perryville', {
      tags: ['west'],
      notes:
        'The largest battle in Kentucky ends **Braxton Bragg**’s invasion of the state; he withdraws to Tennessee.',
      sources: [wiki('Battle_of_Perryville')],
    }),
    mo('island-mound', '1862-10-29', 'Island Mound', {
      tags: ['black soldiers', 'west'],
      notes:
        'The **1st Kansas Colored Infantry**, made up largely of men who had escaped slavery in Missouri, fights a Confederate force in Bates County, Missouri: among the first Black soldiers in combat in the war.',
      sources: [wiki('Skirmish_at_Island_Mound')],
    }),
    // ── 1863 ──
    h('h-1863', '1863-01-01', '1863: Emancipation and turning points'),
    mo('emancipation', '1863-01-01T12:00', 'Emancipation Proclamation', {
      tags: ['slavery', 'politics'],
      datePrecision:
        'Signed on the afternoon of January 1, 1863; placed at noon to stand apart from the chapter heading at midnight.',
      notes:
        'Lincoln declares free all enslaved people in the areas still in rebellion, about 3.5 million people, and opens the army and navy to Black men. It frees no one in the loyal border states; its reach grows with the Union armies.',
      sources: [wiki('Emancipation_Proclamation'), NARA_EP],
    }),
    mo('men-of-color', '1863-03-02', '"Men of Color, To Arms!"', {
      tags: ['black soldiers', 'slavery'],
      datePrecision:
        'Dated March 2, 1863 in Douglass’ Monthly; the Rochester broadside is often dated March 21.',
      notes:
        '**Frederick Douglass** calls on Black men to enlist in the new **54th Massachusetts**: "Better even die free, than to live slaves." Two of his sons join it.',
      sources: [wiki('Frederick_Douglass'), wiki('54th_Massachusetts_Infantry_Regiment')],
    }),
    mo('enrollment-act', '1863-03-03', 'Enrollment Act: the draft', {
      tags: ['politics'],
      notes:
        'The Union’s first federal draft. A drafted man can hire a substitute or pay $300 to be excused, which many workers resent as a rich man’s exemption.',
      sources: [wiki('Enrollment_Act')],
    }),
    mo('jackson-wounded', '1863-05-02', 'Stonewall Jackson wounded', {
      tags: ['east'],
      notes:
        'After his flank attack at Chancellorsville, **Thomas "Stonewall" Jackson** is shot by his own men in the dark. He dies of pneumonia on May 10.',
      sources: [wiki('Stonewall_Jackson')],
    }),
    mo('bct', '1863-05-22', 'Bureau of Colored Troops', {
      tags: ['black soldiers'],
      notes:
        'The War Department’s **General Order No. 143** creates a bureau to recruit Black regiments: the **United States Colored Troops**. About 179,000 Black men serve in the army by the war’s end, about a tenth of it, and some 19,000 in the navy.',
      sources: [wiki('United_States_Colored_Troops'), NARA_USCT],
    }),
    mo('port-hudson-assault', '1863-05-27', 'Port Hudson: the Native Guards attack', {
      tags: ['black soldiers', 'west'],
      notes:
        'The **1st and 3rd Louisiana Native Guards** charge the Confederate works at Port Hudson, Louisiana: Black regiments in a major assault, praised in Northern papers.',
      sources: [wiki('Siege_of_Port_Hudson'), wiki('Louisiana_Native_Guard')],
    }),
    mo('combahee', '1863-06-02', 'Combahee River Raid', {
      tags: ['black soldiers', 'slavery'],
      datePrecision: 'The night of June 1–2, 1863.',
      notes:
        '**Harriet Tubman** guides Colonel **James Montgomery**’s **2nd South Carolina Volunteers**, a Black regiment, up the Combahee River in gunboats. They free more than 750 enslaved people.',
      sources: [wiki('Raid_on_Combahee_Ferry'), wiki('Harriet_Tubman')],
    }),
    mo('millikens-bend', '1863-06-07', "Milliken's Bend", {
      tags: ['black soldiers', 'west'],
      notes:
        'Newly raised Black regiments, with white troops and gunboats, hold off a Confederate attack on a Union post on the Mississippi above Vicksburg.',
      sources: [wiki("Battle_of_Milliken's_Bend")],
    }),
    mo('picketts-charge', '1863-07-03', "Pickett's Charge", {
      tags: ['east'],
      notes:
        'On Gettysburg’s third afternoon, about 12,500 Confederates cross open fields against the Union centre on Cemetery Ridge. More than half are killed, wounded or captured.',
      sources: [wiki("Pickett's_Charge")],
    }),
    mo('vicksburg-surrender', '1863-07-04', 'Vicksburg surrenders', {
      tags: ['west', 'surrender'],
      notes:
        'After a 47-day siege, **John Pemberton** surrenders the city and about 29,000 men to **Grant**, the day after Pickett’s Charge.',
      sources: [wiki('Siege_of_Vicksburg'), NPS('vick')],
    }),
    mo('port-hudson-surrender', '1863-07-09', 'Port Hudson surrenders', {
      tags: ['west', 'surrender'],
      notes:
        'The last Confederate stronghold on the Mississippi falls. "The Father of Waters again goes unvexed to the sea," Lincoln writes.',
      sources: [wiki('Siege_of_Port_Hudson')],
    }),
    mo('orphan-asylum', '1863-07-13', 'Colored Orphan Asylum burned', {
      tags: ['politics', 'black soldiers'],
      notes:
        'On the draft riots’ first day a mob burns the **Colored Orphan Asylum** on Fifth Avenue; the more than 200 children escape. Rioters hunt and kill Black New Yorkers over the next days.',
      sources: [wiki('New_York_City_draft_riots')],
    }),
    mo('fort-wagner', '1863-07-18', 'The 54th Massachusetts at Fort Wagner', {
      tags: ['black soldiers', 'east'],
      notes:
        'The **54th Massachusetts** leads the night assault on Fort Wagner, near Charleston. Colonel **Robert Gould Shaw** is killed with many of his men; Sergeant **William Carney**, wounded, saves the flag and later receives the Medal of Honor.',
      sources: [wiki('Second_Battle_of_Fort_Wagner'), wiki('54th_Massachusetts_Infantry_Regiment')],
    }),
    mo('douglass-lincoln', '1863-08-10', 'Douglass meets Lincoln', {
      tags: ['black soldiers', 'politics'],
      notes:
        '**Frederick Douglass** presses Lincoln at the White House for equal pay for Black soldiers, their protection as prisoners, and promotion for merit.',
      sources: [wiki('Frederick_Douglass')],
    }),
    mo('gettysburg-address', '1863-11-19', 'Gettysburg Address', {
      tags: ['politics'],
      notes:
        'At the dedication of the Soldiers’ National Cemetery, Lincoln speaks for about two minutes: "a new birth of freedom" and government "of the people, by the people, for the people".',
      sources: [wiki('Gettysburg_Address'), LOC_GA],
    }),
    mo('ten-percent', '1863-12-08', 'The Ten Percent Plan', {
      tags: ['reconstruction', 'politics'],
      notes:
        'Lincoln offers pardons and readmission to a Confederate state once a tenth of its 1860 voters swear loyalty and accept emancipation: his first plan for reconstruction.',
      sources: [wiki('Ten_percent_plan')],
    }),
    // ── 1864 ──
    h('h-1864', '1864-01-01', '1864: Grant and Sherman'),
    mo('grant-lieutenant-general', '1864-03-09', 'Grant made lieutenant general', {
      tags: ['command'],
      notes:
        'Lincoln hands **Grant** his commission as lieutenant general, a rank Congress had revived for him. Three days later Grant is general-in-chief of all the Union armies.',
      sources: [wiki('Ulysses_S._Grant')],
    }),
    mo('senate-13th', '1864-04-08', 'The Senate passes the Thirteenth Amendment', {
      tags: ['slavery', 'politics'],
      notes:
        'The Senate passes the amendment abolishing slavery, 38 to 6. It falls short of two-thirds in the House that June.',
      sources: [wiki('Thirteenth_Amendment_to_the_United_States_Constitution')],
    }),
    mo('fort-pillow', '1864-04-12', 'Fort Pillow', {
      tags: ['black soldiers', 'west'],
      notes:
        'Confederates under **Nathan Bedford Forrest** take Fort Pillow, Tennessee, and kill many Black soldiers trying to surrender. "Remember Fort Pillow" becomes a rallying cry.',
      sources: [wiki('Battle_of_Fort_Pillow')],
    }),
    mo('equal-pay', '1864-06-15', 'Equal pay for Black soldiers', {
      tags: ['black soldiers', 'politics'],
      notes:
        'After a year of protest, including the 54th Massachusetts refusing any pay at all rather than less, Congress grants Black soldiers the same pay as white ones.',
      sources: [wiki('United_States_Colored_Troops'), NARA_USCT],
    }),
    mo('kearsarge', '1864-06-19', 'Kearsarge sinks the Alabama', {
      tags: ['navy'],
      notes:
        'Off Cherbourg, France, USS *Kearsarge* sinks the raider CSS *Alabama*, which had taken more than sixty Union merchant ships.',
      sources: [wiki('Battle_of_Cherbourg_(1864)')],
    }),
    mo('crater', '1864-07-30', 'The Crater', {
      tags: ['east', 'black soldiers'],
      notes:
        'Union miners blow a gap in the Petersburg lines at 4:44 a.m., but the attack into the crater fails. The USCT division sent in late suffers heavily, and some of its men are killed after surrendering.',
      sources: [wiki('Battle_of_the_Crater')],
    }),
    mo('mobile-bay', '1864-08-05', 'Mobile Bay', {
      tags: ['navy', 'west'],
      notes:
        '**Farragut** takes his fleet through the mines ("torpedoes") into Mobile Bay, closing one of the last Confederate ports on the Gulf.',
      sources: [wiki('Battle_of_Mobile_Bay')],
    }),
    mo('atlanta-falls', '1864-09-02', 'Atlanta falls', {
      tags: ['west'],
      notes:
        'Union troops enter the city. "Atlanta is ours, and fairly won," **Sherman** wires Washington, and Lincoln’s chances of re-election turn.',
      sources: [wiki('Atlanta_campaign'), wiki('Battle_of_Atlanta')],
    }),
    mo('new-market-heights', '1864-09-29', 'New Market Heights', {
      tags: ['black soldiers', 'east'],
      notes:
        'USCT regiments storm the Confederate works below Richmond. Fourteen Black soldiers receive the Medal of Honor for that morning.',
      sources: [wiki('Battle_of_Chaffin%27s_Farm')],
    }),
    mo('maryland-abolishes', '1864-11-01', 'Maryland abolishes slavery', {
      tags: ['slavery'],
      notes:
        'A new state constitution frees the enslaved people of a loyal border state, whom the Emancipation Proclamation had not reached.',
      sources: [wiki('Maryland_in_the_American_Civil_War')],
    }),
    mo('lincoln-reelected', '1864-11-08', 'Lincoln re-elected', {
      tags: ['politics'],
      notes:
        'Lincoln defeats **George McClellan**, winning 212 of 233 electoral votes and most of the soldiers’ vote.',
      sources: [wiki('1864_United_States_presidential_election')],
    }),
    mo('franklin', '1864-11-30', 'Franklin', {
      tags: ['west'],
      notes:
        '**John Bell Hood** throws the Army of Tennessee against Union entrenchments at Franklin, Tennessee: about 6,000 Confederate casualties in five hours, six generals killed.',
      sources: [wiki('Battle_of_Franklin')],
    }),
    mo('savannah', '1864-12-21', 'Sherman takes Savannah', {
      tags: ['west'],
      notes:
        'The March to the Sea ends at the coast. Sherman offers the city to Lincoln "as a Christmas gift".',
      sources: [wiki("Sherman's_March_to_the_Sea")],
    }),
    // ── 1865 ──
    h('h-1865', '1865-01-01', '1865: The end of the Confederacy'),
    mo('fort-fisher', '1865-01-15', 'Fort Fisher', {
      tags: ['navy', 'east'],
      notes:
        'A joint army and navy assault takes the fort guarding **Wilmington**, North Carolina, the Confederacy’s last major open port.',
      sources: [wiki('Second_Battle_of_Fort_Fisher')],
    }),
    mo('field-order-15', '1865-01-16', 'Special Field Order No. 15', {
      tags: ['reconstruction', 'slavery'],
      notes:
        'After meeting Black ministers in Savannah, **Sherman** sets aside the coastal lands of South Carolina, Georgia and Florida for freed families in plots of up to 40 acres. President Johnson reverses it that autumn.',
      sources: [wiki('Forty_acres_and_a_mule')],
    }),
    mo('house-13th', '1865-01-31', 'The House passes the Thirteenth Amendment', {
      tags: ['slavery', 'politics'],
      notes:
        'The House passes the amendment, 119 to 56, just over two-thirds, and it goes to the states. The galleries, where Black spectators were newly admitted, erupt.',
      sources: [
        wiki('Thirteenth_Amendment_to_the_United_States_Constitution'),
        NARA + '13th-amendment',
      ],
    }),
    mo('hampton-roads-conference', '1865-02-03', 'Hampton Roads Conference', {
      tags: ['politics'],
      notes:
        'Lincoln and Seward meet three Confederate commissioners aboard a steamer off Fort Monroe. Lincoln will accept nothing short of reunion and emancipation, and the talks fail.',
      sources: [wiki('Hampton_Roads_Conference')],
    }),
    mo('freedmens-bureau', '1865-03-03', "Freedmen's Bureau", {
      tags: ['reconstruction'],
      notes:
        'Congress creates the Bureau of Refugees, Freedmen, and Abandoned Lands, to give food, schooling, labour contracts and legal help to freed people and refugees.',
      sources: [wiki("Freedmen's_Bureau")],
    }),
    mo('second-inaugural', '1865-03-04', 'Second inaugural address', {
      tags: ['politics', 'slavery'],
      notes:
        'Lincoln says that slavery, "a peculiar and powerful interest", was "somehow the cause of the war", and closes "With malice toward none, with charity for all".',
      sources: [wiki("Abraham_Lincoln's_second_inaugural_address")],
    }),
    mo('csa-black-enlistment', '1865-03-13', 'The Confederacy arms enslaved men', {
      tags: ['slavery', 'politics'],
      notes:
        'Desperate for soldiers, the Confederate Congress authorizes enlisting enslaved men, without promising them freedom. Few are enlisted before the end.',
      sources: [wiki('Military_history_of_African_Americans_in_the_American_Civil_War')],
    }),
    mo('five-forks', '1865-04-01', 'Five Forks', {
      tags: ['east'],
      notes:
        '**Philip Sheridan** breaks Lee’s right flank southwest of Petersburg. Grant attacks along the whole line the next morning.',
      sources: [wiki('Battle_of_Five_Forks')],
    }),
    mo('richmond-falls', '1865-04-03', 'Richmond falls', {
      tags: ['east'],
      notes:
        'The Confederate government flees on the night of April 2. Union troops, Black regiments among the first, enter the burning capital the next morning; Lincoln walks its streets on April 4.',
      sources: [wiki('Richmond,_Virginia,_in_the_American_Civil_War')],
    }),
    mo('appomattox', '1865-04-09', 'Lee surrenders at Appomattox', {
      tags: ['surrender', 'east'],
      notes:
        'At the **McLean House**, Appomattox Court House, **Robert E. Lee** surrenders the Army of Northern Virginia to **Grant**, who lets the men go home on parole with their horses. Other Confederate armies are still in the field.',
      sources: [wiki('Battle_of_Appomattox_Court_House'), NPS('apco')],
    }),
    mo('stacking-arms', '1865-04-12', 'The stacking of arms', {
      tags: ['surrender', 'east'],
      notes:
        'Four years to the day after Fort Sumter, Lee’s infantry marches past Union troops under **Joshua Chamberlain** and lays down its arms and flags.',
      sources: [wiki('Battle_of_Appomattox_Court_House'), NPS('apco')],
    }),
    mo('lincoln-shot', '1865-04-14T22:15', "Lincoln shot at Ford's Theatre", {
      tags: ['politics'],
      notes:
        '**John Wilkes Booth**, a Confederate sympathizer, shoots the president at about 10:15 p.m. during a play in Washington.',
      sources: [wiki('Assassination_of_Abraham_Lincoln')],
    }),
    mo('lincoln-dies', '1865-04-15T07:22', 'Lincoln dies', {
      tags: ['politics'],
      notes:
        'Lincoln dies at 7:22 a.m. in the Petersen House across the street. **Andrew Johnson** is sworn in that morning.',
      sources: [wiki('Assassination_of_Abraham_Lincoln')],
    }),
    mo('bennett-place', '1865-04-26', 'Johnston surrenders at Bennett Place', {
      tags: ['surrender', 'east'],
      notes:
        'At a farmhouse near Durham, North Carolina, **Joseph E. Johnston** surrenders to **Sherman** the armies in the Carolinas, Georgia and Florida, about 90,000 soldiers: the largest surrender of the war. Washington had rejected their broader first terms of April 18.',
      sources: [wiki('Bennett_Place'), wiki('Conclusion_of_the_American_Civil_War')],
    }),
    mo('taylor-surrenders', '1865-05-04', 'Taylor surrenders at Citronelle', {
      tags: ['surrender', 'west'],
      notes:
        '**Richard Taylor** surrenders the Confederate forces in Alabama, Mississippi and eastern Louisiana to **Edward Canby**.',
      sources: [
        wiki('Richard_Taylor_(Confederate_general)'),
        wiki('Conclusion_of_the_American_Civil_War'),
      ],
    }),
    mo('davis-captured', '1865-05-10', 'Jefferson Davis captured', {
      tags: ['politics'],
      notes:
        'Union cavalry capture the Confederate president near Irwinville, Georgia. He is held for two years at Fort Monroe and never tried.',
      sources: [wiki('Jefferson_Davis')],
    }),
    mo('amnesty', '1865-05-29', "Johnson's amnesty proclamation", {
      tags: ['reconstruction', 'politics'],
      notes:
        'President **Johnson** pardons most former Confederates who take an oath of loyalty and begins restoring Southern state governments with no part for Black voters: "Presidential Reconstruction".',
      sources: [wiki('Reconstruction_era'), wiki('Andrew_Johnson')],
    }),
    mo('kirby-smith', '1865-06-02', 'Kirby Smith surrenders at Galveston', {
      tags: ['surrender', 'west'],
      datePrecision:
        'His representatives agreed terms with General Canby on May 26; Smith signed them aboard USS Fort Jackson off Galveston on June 2.',
      notes:
        '**Edmund Kirby Smith** surrenders the Trans-Mississippi Department, the last large Confederate army, about 43,000 men on paper.',
      sources: [wiki('Edmund_Kirby_Smith'), wiki('Conclusion_of_the_American_Civil_War')],
    }),
    mo('juneteenth', '1865-06-19', 'Juneteenth', {
      tags: ['slavery', 'surrender'],
      notes:
        'At Galveston, Major General **Gordon Granger**’s **General Order No. 3** tells the people of Texas that "all slaves are free", two and a half years after the Emancipation Proclamation. The day is celebrated as Juneteenth, a federal holiday since 2021.',
      sources: [wiki('Juneteenth'), NARA_JUNETEENTH],
    }),
    mo('stand-watie', '1865-06-23', 'Stand Watie surrenders', {
      tags: ['surrender', 'west'],
      notes:
        'At Doaksville in the Choctaw Nation, Cherokee brigadier general **Stand Watie** surrenders his First Indian Brigade: the last Confederate general to surrender on land.',
      sources: [wiki('Stand_Watie'), wiki('Conclusion_of_the_American_Civil_War')],
    }),
    mo('black-codes', '1865-11-24', 'Mississippi’s Black Codes', {
      tags: ['reconstruction', 'slavery'],
      datePrecision: 'Mississippi’s legislature passed its first codes in late November 1865.',
      notes:
        'The restored Southern legislatures, starting with Mississippi, pass **Black Codes** that restrict freed people’s right to work, move, own land and testify, and force them into labour contracts.',
      sources: [wiki('Black_Codes_(United_States)')],
    }),
    mo('shenandoah', '1865-11-06', 'CSS Shenandoah surrenders at Liverpool', {
      tags: ['surrender', 'navy'],
      notes:
        'Captain **James Waddell**, who had been raiding Union whalers in the Pacific and learned of the war’s end only in August, sails the raider to Liverpool and surrenders it to the Royal Navy: the last Confederate surrender, seven months after Appomattox.',
      sources: [wiki('CSS_Shenandoah'), wiki('Conclusion_of_the_American_Civil_War')],
    }),
    mo('ratified-13th', '1865-12-06', 'Thirteenth Amendment ratified', {
      tags: ['slavery', 'reconstruction'],
      notes:
        'Georgia’s ratification completes three-quarters of the states: slavery and involuntary servitude are abolished "except as a punishment for crime". Secretary Seward proclaims it on December 18.',
      sources: [
        wiki('Thirteenth_Amendment_to_the_United_States_Constitution'),
        NARA + '13th-amendment',
      ],
    }),
    // ── Aftermath ──
    h('h-reconstruction', '1866-01-01', 'Reconstruction, 1865–1877'),
    mo('civil-rights-1866', '1866-04-09', 'Civil Rights Act of 1866', {
      tags: ['reconstruction'],
      notes:
        'Congress passes, over Johnson’s veto, the first federal law defining citizenship and the equal rights of all born in the United States.',
      sources: [wiki('Civil_Rights_Act_of_1866')],
    }),
    mo('insurrection-over', '1866-08-20', 'The insurrection declared at an end', {
      tags: ['politics', 'surrender'],
      notes:
        'Johnson proclaims the insurrection over in Texas and so in the whole country, after a proclamation of April 2 covering the other states. Courts and Congress took this as the war’s legal end.',
      sources: [wiki('Conclusion_of_the_American_Civil_War')],
    }),
    mo('reconstruction-acts', '1867-03-02', 'Reconstruction Acts', {
      tags: ['reconstruction'],
      notes:
        'Over Johnson’s veto, Congress divides ten Southern states into five military districts and requires new constitutions with Black men’s suffrage before readmission: "Radical Reconstruction".',
      sources: [wiki('Reconstruction_Acts')],
    }),
    mo('ratified-14th', '1868-07-09', 'Fourteenth Amendment ratified', {
      tags: ['reconstruction'],
      notes:
        'Birthright citizenship, due process and the equal protection of the laws, overturning Dred Scott.',
      sources: [
        wiki('Fourteenth_Amendment_to_the_United_States_Constitution'),
        NARA + '14th-amendment',
      ],
    }),
    mo('ratified-15th', '1870-02-03', 'Fifteenth Amendment ratified', {
      tags: ['reconstruction'],
      notes:
        'The right to vote may not be denied "on account of race, color, or previous condition of servitude."',
      sources: [
        wiki('Fifteenth_Amendment_to_the_United_States_Constitution'),
        NARA + '15th-amendment',
      ],
    }),
    mo('revels', '1870-02-25', 'Hiram Revels takes his seat', {
      tags: ['reconstruction', 'politics'],
      notes:
        '**Hiram Revels** of Mississippi becomes the first Black U.S. senator, in the seat Jefferson Davis had left in 1861.',
      sources: [wiki('Hiram_R._Revels')],
    }),
    mo('kkk-act', '1871-04-20', 'Ku Klux Klan Act', {
      tags: ['reconstruction'],
      notes:
        'Congress lets the president use troops and suspend habeas corpus against the Klan’s terror campaign; Grant does so in nine South Carolina counties that October.',
      sources: [wiki('Ku_Klux_Klan_Act')],
    }),
    mo('colfax', '1873-04-13', 'Colfax massacre', {
      tags: ['reconstruction'],
      notes:
        'A white militia kills scores of Black men, many after they surrendered, at the courthouse in Colfax, Louisiana. The Supreme Court’s 1876 ruling in the resulting case weakens federal protection.',
      sources: [wiki('Colfax_massacre')],
    }),
    mo('electoral-commission', '1877-01-29', 'Electoral Commission created', {
      tags: ['politics', 'reconstruction'],
      notes:
        'With the 1876 election’s returns from Florida, Louisiana and South Carolina disputed, Congress creates a fifteen-member commission to decide them.',
      sources: [
        wiki('Electoral_Commission_(United_States)'),
        wiki('1876_United_States_presidential_election'),
      ],
    }),
    mo('hayes-declared', '1877-03-02', 'Hayes declared the winner', {
      tags: ['politics', 'reconstruction'],
      notes:
        'Congress declares **Rutherford B. Hayes** elected, by one electoral vote, after an informal bargain with Southern Democrats: the **Compromise of 1877**.',
      sources: [wiki('Compromise_of_1877')],
    }),
    mo('troops-withdrawn', '1877-04-24', 'Troops leave the Louisiana statehouse', {
      tags: ['reconstruction', 'politics'],
      notes:
        'Federal troops withdraw from the statehouses of South Carolina (April 10) and Louisiana (April 24), and the last Republican state governments in the South fall: the conventional end of Reconstruction.',
      sources: [wiki('Compromise_of_1877'), wiki('Reconstruction_era')],
    }),
  ];
  const durations = [
    du('compromise-1850', '1850-09-09', '1850-09-21', 'Compromise of 1850', {
      tags: ['slavery', 'politics'],
      notes:
        'Five laws signed September 9–20, 1850: California admitted free, New Mexico and Utah organized without a ban on slavery, the slave trade ended in Washington, D.C., and a new Fugitive Slave Act.',
      sources: [wiki('Compromise_of_1850'), NARA + 'compromise-of-1850'],
    }),
    du('bleeding-kansas', '1854-05-30', '1861-01-29', 'Bleeding Kansas', {
      tags: ['slavery', 'west'],
      notes:
        'Proslavery and free-state settlers fight over the territory’s future, with rival governments, fraudulent elections and raids; dated here from the Kansas–Nebraska Act to statehood.',
      sources: [wiki('Bleeding_Kansas')],
    }),
    du('lincoln-douglas', '1858-08-21', '1858-10-16', 'Lincoln–Douglas debates', {
      tags: ['politics', 'slavery'],
      notes:
        'Seven debates across Illinois, Ottawa to Alton, on slavery in the territories. Douglas keeps his Senate seat; Lincoln becomes known nationally.',
      sources: [wiki('Lincoln–Douglas_debates')],
    }),
    du('harpers-ferry', '1859-10-16', '1859-10-19', "John Brown's raid on Harpers Ferry", {
      tags: ['slavery'],
      notes:
        '**John Brown** and 21 men, five of them Black, seize the federal armory at Harpers Ferry, Virginia, hoping to arm an uprising of the enslaved. Marines under **Robert E. Lee** retake it on October 18.',
      sources: [wiki("John_Brown's_raid_on_Harpers_Ferry"), NPS('hafe')],
    }),
    du('deep-south-secession', '1860-12-20', '1861-02-01', 'The Deep South secedes', {
      tags: ['politics', 'slavery'],
      notes:
        'Seven states, from South Carolina to Texas, the states with the highest share of enslaved people, leave the Union before Lincoln takes office.',
      sources: [wiki('Secession_in_the_United_States'), wiki('Origins_of_the_American_Civil_War')],
    }),
    du('davis', '1861-02-18', '1865-05-10', 'Jefferson Davis, Confederate president', {
      tags: ['politics', 'command'],
      notes:
        'Inaugurated provisional president at Montgomery; elected to a six-year term and inaugurated again at Richmond on February 22, 1862. Dated here to his capture.',
      sources: [wiki('Jefferson_Davis')],
    }),
    du('lincoln-presidency', '1861-03-04', '1865-04-15T07:22', 'Lincoln’s presidency', {
      tags: ['politics'],
      notes: 'From his first inauguration to his death, the morning after he was shot.',
      sources: [wiki('Presidency_of_Abraham_Lincoln')],
    }),
    du('civil-war', '1861-04-12T04:30', '1865-04-09', 'The Civil War', {
      tags: ['east', 'west'],
      notes:
        'Dated, as usual, from Fort Sumter to Lee’s surrender at Appomattox; the last forces surrendered months later, and the war’s legal end came on August 20, 1866. **The cost:** the traditional count is about 620,000 soldiers dead, two-thirds of them from disease; J. David Hacker’s census-based estimate (*Civil War History*, 2011) is about 750,000, within a range of about 650,000 to 850,000. Both are estimates.',
      sources: [wiki('American_Civil_War'), HACKER],
    }),
    du('upper-south-secession', '1861-04-17', '1861-06-08', 'The upper South secedes', {
      tags: ['politics'],
      notes:
        'After Lincoln’s call for troops, Virginia, Arkansas, North Carolina and Tennessee leave the Union. The border slave states of Delaware, Maryland, Kentucky and Missouri stay.',
      sources: [wiki('Secession_in_the_United_States')],
    }),
    du('blockade', '1861-04-19', '1865-06-23', 'The Union blockade', {
      tags: ['navy'],
      notes:
        'Proclaimed by Lincoln on April 19 and 27, 1861, along 3,500 miles of coast; rescinded by Johnson on June 23, 1865. Blockade runners got through, but the South’s cotton exports collapsed.',
      sources: [wiki('Union_blockade')],
    }),
    du('mcclellan', '1861-07-26', '1862-11-07', 'McClellan commands in the East', {
      tags: ['command', 'east'],
      notes:
        '**George B. McClellan** takes over the troops around Washington after Bull Run and builds the **Army of the Potomac**; general-in-chief from November 1861 to March 1862. Lincoln removes him after he fails to pursue Lee from Antietam.',
      sources: [wiki('George_B._McClellan')],
    }),
    du('donelson', '1862-02-11', '1862-02-17', 'Battle of Fort Donelson', {
      tags: ['west'],
      notes: 'Grant’s siege and capture of the fort on the Cumberland River, February 11–16.',
      sources: [wiki('Battle_of_Fort_Donelson')],
    }),
    du('peninsula', '1862-03-17', '1862-07-02', 'Peninsula campaign', {
      tags: ['east'],
      notes:
        'McClellan ships his army to the peninsula southeast of Richmond and comes within sight of the city, until Lee drives him back in the Seven Days.',
      sources: [wiki('Peninsula_campaign')],
    }),
    du('shiloh', '1862-04-06', '1862-04-08', 'Shiloh', {
      tags: ['west'],
      notes:
        'Surprised in Tennessee by **Albert Sidney Johnston**, who is killed, Grant’s army holds and drives the Confederates off on the second day. About 23,700 casualties: a shock to both sides.',
      sources: [wiki('Battle_of_Shiloh')],
    }),
    du('lee', '1862-06-01', '1865-04-09', 'Lee commands the Army of Northern Virginia', {
      tags: ['command', 'east'],
      notes:
        '**Robert E. Lee** takes command after **Joseph E. Johnston** is wounded at Seven Pines, and keeps it to Appomattox; he is also general-in-chief of the Confederate armies from February 1865.',
      sources: [wiki('Robert_E._Lee'), wiki('Army_of_Northern_Virginia')],
    }),
    du('seven-days', '1862-06-25', '1862-07-02', 'Seven Days Battles', {
      tags: ['east'],
      notes: 'Lee’s attacks, June 25 – July 1, drive McClellan from the gates of Richmond.',
      sources: [wiki('Seven_Days_Battles')],
    }),
    du('second-bull-run', '1862-08-28', '1862-08-31', 'Second Bull Run', {
      tags: ['east'],
      notes:
        'Lee, Jackson and **Longstreet** defeat **John Pope** on the old battlefield near Manassas, August 28–30, and Lee turns north into Maryland.',
      sources: [wiki('Second_Battle_of_Bull_Run')],
    }),
    du('fredericksburg', '1862-12-11', '1862-12-16', 'Fredericksburg', {
      tags: ['east'],
      notes:
        '**Ambrose Burnside**’s army crosses the Rappahannock and attacks Lee’s men on Marye’s Heights again and again on December 13; it withdraws two nights later.',
      sources: [wiki('Battle_of_Fredericksburg')],
    }),
    du('stones-river', '1862-12-31', '1863-01-03', 'Stones River', {
      tags: ['west'],
      notes:
        '**William Rosecrans** holds against Bragg at Murfreesboro, Tennessee, December 31 – January 2, and Bragg retreats.',
      sources: [wiki('Battle_of_Stones_River')],
    }),
    du('chancellorsville', '1863-04-30', '1863-05-07', 'Chancellorsville', {
      tags: ['east'],
      notes:
        'Outnumbered more than two to one, Lee divides his army and routs **Joseph Hooker**’s, April 30 – May 6, at the cost of Jackson.',
      sources: [wiki('Battle_of_Chancellorsville')],
    }),
    du('vicksburg', '1863-05-18', '1863-07-04', 'Siege of Vicksburg', {
      tags: ['west'],
      notes:
        'After a campaign of marches and five battles in Mississippi, Grant besieges the river fortress; its soldiers and townspeople are starving by the end.',
      sources: [wiki('Siege_of_Vicksburg'), NPS('vick')],
    }),
    du('gettysburg', '1863-07-01', '1863-07-04', 'Gettysburg', {
      tags: ['east'],
      notes:
        '**George Meade**’s Army of the Potomac, three days in command, defeats Lee’s second invasion of the North in Pennsylvania, July 1–3: the war’s largest battle, with more than 50,000 casualties.',
      sources: [wiki('Battle_of_Gettysburg'), NPS('gett')],
    }),
    du('draft-riots', '1863-07-13', '1863-07-17', 'New York City draft riots', {
      tags: ['politics', 'black soldiers'],
      notes:
        'Four days of rioting against the draft, July 13–16, turn into attacks on Black New Yorkers. At least 119 people are killed before troops from Gettysburg restore order.',
      sources: [wiki('New_York_City_draft_riots')],
    }),
    du('chickamauga', '1863-09-18', '1863-09-21', 'Chickamauga', {
      tags: ['west'],
      notes:
        'Bragg, reinforced by Longstreet, routs Rosecrans in northern Georgia, September 18–20; **George Thomas** holds long enough to save the army, which falls back to Chattanooga.',
      sources: [wiki('Battle_of_Chickamauga')],
    }),
    du('chattanooga', '1863-11-23', '1863-11-26', 'Chattanooga', {
      tags: ['west'],
      notes:
        'Grant breaks the siege of the city: Lookout Mountain on November 24 and Missionary Ridge on the 25th. The way into Georgia is open.',
      sources: [wiki('Chattanooga_campaign')],
    }),
    du('grant', '1864-03-12', '1869-03-04', 'Grant, general-in-chief', {
      tags: ['command'],
      notes:
        '**Ulysses S. Grant** directs all the Union armies, travelling with Meade’s Army of the Potomac, until he becomes president in 1869.',
      sources: [wiki('Ulysses_S._Grant')],
    }),
    du('overland', '1864-05-04', '1864-06-25', 'Overland Campaign', {
      tags: ['east'],
      notes:
        'Grant crosses the Rapidan and keeps moving south around Lee’s right, through the Wilderness, Spotsylvania and Cold Harbor to the James: about 55,000 Union casualties in seven weeks.',
      sources: [wiki('Overland_Campaign')],
    }),
    du('wilderness', '1864-05-05', '1864-05-08', 'The Wilderness', {
      tags: ['east'],
      notes:
        'Two days of fighting in dense woods, May 5–7; afterwards Grant turns south, not back.',
      sources: [wiki('Battle_of_the_Wilderness')],
    }),
    du('atlanta-campaign', '1864-05-07', '1864-09-02', 'Atlanta campaign', {
      tags: ['west'],
      notes:
        '**William T. Sherman** advances a hundred miles from Chattanooga against **Joseph E. Johnston** and then Hood, to the fall of Atlanta.',
      sources: [wiki('Atlanta_campaign')],
    }),
    du('spotsylvania', '1864-05-08', '1864-05-22', 'Spotsylvania Court House', {
      tags: ['east'],
      notes: 'Two weeks of fighting, May 8–21, including the twenty hours at the "Bloody Angle".',
      sources: [wiki('Battle_of_Spotsylvania_Court_House')],
    }),
    du('cold-harbor', '1864-05-31', '1864-06-13', 'Cold Harbor', {
      tags: ['east'],
      notes:
        'The failed frontal assault of June 3 costs thousands of Union casualties in under an hour. Grant later regretted ordering it.',
      sources: [wiki('Battle_of_Cold_Harbor')],
    }),
    du('petersburg', '1864-06-09', '1865-03-25', 'Siege of Petersburg', {
      tags: ['east'],
      notes:
        'Nine and a half months of trenches and battles for the railroads into Richmond, dated as Wikipedia does from June 9, 1864 to Lee’s last attack on March 25, 1865. The final assault broke the lines on April 2.',
      sources: [wiki('Siege_of_Petersburg'), NPS('pete')],
    }),
    du('march-to-the-sea', '1864-11-15', '1864-12-21', "Sherman's March to the Sea", {
      tags: ['west'],
      notes:
        'Sherman’s 62,000 men cut loose from their supply lines and march 285 miles from Atlanta to Savannah, destroying railroads, farms and stores. Thousands of enslaved people follow the army to freedom.',
      sources: [wiki("Sherman's_March_to_the_Sea")],
    }),
    du('nashville', '1864-12-15', '1864-12-17', 'Nashville', {
      tags: ['west', 'black soldiers'],
      notes:
        'George Thomas’s army, including USCT regiments, destroys Hood’s Army of Tennessee as a fighting force, December 15–16.',
      sources: [wiki('Battle_of_Nashville')],
    }),
    du('carolinas', '1865-02-01', '1865-04-26', 'Carolinas campaign', {
      tags: ['east'],
      notes: 'Sherman marches north from Savannah through the Carolinas, to Johnston’s surrender.',
      sources: [wiki('Carolinas_campaign')],
    }),
    du('appomattox-campaign', '1865-03-29', '1865-04-09', 'Appomattox campaign', {
      tags: ['east'],
      notes:
        'From Five Forks and the fall of Petersburg to Lee’s surrender: Lee’s army flees west and is cut off at Appomattox Court House.',
      sources: [wiki('Appomattox_campaign')],
    }),
    du('last-surrenders', '1865-04-09', '1865-11-06', 'After Appomattox: the last surrenders', {
      tags: ['surrender'],
      notes:
        'Lee’s surrender was not the end: Johnston, Taylor, Kirby Smith and Stand Watie surrendered over the next eleven weeks, and the CSS Shenandoah only on November 6, 1865, 211 days after Appomattox.',
      sources: [wiki('Conclusion_of_the_American_Civil_War')],
    }),
    du('johnson', '1865-04-15T07:22', '1869-03-04', 'Andrew Johnson’s presidency', {
      tags: ['politics', 'reconstruction'],
      notes:
        'Lincoln’s vice president, a Tennessee Unionist, who fights Congress over Reconstruction and is impeached in 1868, surviving conviction by one vote.',
      sources: [wiki('Presidency_of_Andrew_Johnson')],
    }),
    du('palmito-ranch', '1865-05-12', '1865-05-14', 'Palmito Ranch', {
      tags: ['west'],
      notes:
        'The last battle of the war, May 12–13, near Brownsville, Texas: a Confederate victory, a month after Appomattox.',
      sources: [wiki('Battle_of_Palmito_Ranch')],
    }),
    du('reconstruction', '1865-05-29', '1877-04-24', 'Reconstruction', {
      tags: ['reconstruction'],
      notes:
        'Conventionally 1865–1877; dated here from Johnson’s amnesty proclamation to the withdrawal of federal troops from the Louisiana statehouse.',
      sources: [wiki('Reconstruction_era')],
    }),
  ];
  const relationships = [
    rel('missouri', 'kansas-nebraska'),
    rel('missouri', 'dred-scott'),
    rel('d:compromise-1850', 'fugitive-slave-act'),
    rel('kansas-nebraska', 'd:bleeding-kansas'),
    rel('d:harpers-ferry', 'brown-hanged'),
    rel('lincoln-elected', 'sc-secedes'),
    rel('sc-secedes', 'sc-declaration'),
    rel('csa-formed', 'csa-constitution'),
    rel('csa-constitution', 'cornerstone'),
    rel('sumter', 'd:civil-war'),
    rel('d:civil-war', 'appomattox'),
    rel('sumter', 'call-75000'),
    rel('call-75000', 'd:upper-south-secession'),
    rel('anaconda', 'd:blockade'),
    rel('contraband', 'confiscation-1861'),
    rel('d:mcclellan', 'd:peninsula'),
    rel('antietam', 'preliminary'),
    rel('preliminary', 'emancipation'),
    rel('emancipation', 'bct'),
    rel('men-of-color', 'fort-wagner'),
    rel('tubman-escapes', 'combahee'),
    rel('d:gettysburg', 'gettysburg-address'),
    rel('d:vicksburg', 'vicksburg-surrender'),
    rel('vicksburg-surrender', 'port-hudson-surrender'),
    rel('enrollment-act', 'd:draft-riots'),
    rel('douglass-lincoln', 'equal-pay'),
    rel('grant-lieutenant-general', 'd:overland'),
    rel('d:overland', 'd:petersburg'),
    rel('atlanta-falls', 'lincoln-reelected'),
    rel('d:march-to-the-sea', 'field-order-15'),
    rel('senate-13th', 'house-13th'),
    rel('house-13th', 'ratified-13th'),
    rel('emancipation', 'juneteenth'),
    rel('richmond-falls', 'appomattox'),
    rel('appomattox', 'bennett-place'),
    rel('appomattox', 'shenandoah'),
    rel('ratified-13th', 'ratified-14th'),
    rel('ratified-14th', 'ratified-15th'),
    rel('dred-scott', 'ratified-14th'),
    rel('hayes-declared', 'troops-withdrawn'),
  ];
  return {
    format: 'openchronology',
    version: 1,
    title: 'The U.S. Civil War, 1861–1865',
    description:
      'The American Civil War with its causes and aftermath: the forty years of compromises and crises over slavery, secession and the founding of the Confederacy, the war in the East, the West and at sea, emancipation and the Black soldiers who fought for it, the surrenders that followed Appomattox, and Reconstruction to 1877.\n\n**How to read it.** Chapter headings mark the eras and the war’s years. Campaigns, sieges, commands, presidencies and the war itself are durations; everything else is a moment, tagged by thread (slavery, politics, east, west, navy, black soldiers, command, surrender, reconstruction). Related moments are linked: a cause and what it led to.\n\n**Slavery** was the central cause of the war, as the seceding states’ own declarations say and as historians agree. **The cost:** about 620,000 soldiers dead by the traditional count, about 750,000 by J. David Hacker’s 2011 census-based estimate; both are estimates.\n\n**Dates.** Local days, shown at a fixed UTC−5 (standard time zones came only in 1883). Where a date is approximate, its dating note says so.\n\nA sample timeline built from the cited sources (Wikipedia, the National Archives, the Library of Congress, the National Park Service, the Avalon Project and Hacker’s article); not a definitive history.',
    presentation: {
      mode: 'gregorian',
      unit: '',
      scale: '1/1',
      origin: '0/1',
      version: 1,
      offsetMinutes: -300,
      significantDigits: 6,
    },
    tags: ['history', 'civil war', 'united states', 'slavery', 'reconstruction', 'education'],
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
