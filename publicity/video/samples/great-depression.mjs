// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The Great Depression, c. 1929–1941, in the United States and worldwide: the history tour's
// sample (Video 21, Short 18). Well-established dates only, each linked to its Wikipedia article
// and, where it's the natural reference, to the NBER's business-cycle dates, the Bureau of Labor
// Statistics' 1929–39 estimates (the basis of Historical Statistics' unemployment series), the
// Federal Reserve's history essays, the National Archives or the American Presidency Project.
// Dates are local days, shown at a fixed UTC−5 (New York's standard time, which Wall Street
// kept in October 1929), so the Crash's market hours read as New York's; a day given here is
// midnight of that day at UTC−5. Events abroad are on their local day. Annual statistics sit at
// mid-year, and the NBER's months at the first of the month.
import { at as utc, m, d, rel, plugins, theme, wiki } from './lib.mjs';

/** A local date or date-time (YYYY-MM-DD or YYYY-MM-DDTHH:MM) at UTC−5. */
const at = (local) => utc(`${local.length === 10 ? local + 'T00:00' : local}:00-05:00`);

const NBER = 'https://www.nber.org/research/data/us-business-cycle-expansions-and-contractions';
const BLS =
  'https://www.bls.gov/opub/mlr/1948/article/pdf/labor-force-employment-and-unemployment-1929-39-estimating-methods.pdf';
const FRH = (essay) => `https://www.federalreservehistory.org/essays/${essay}`;
const NARA = (doc) => `https://www.archives.gov/milestone-documents/${doc}`;
const FDR_1933 = 'https://www.presidency.ucsb.edu/documents/inaugural-address-8';
const FDIC = 'https://www.fdic.gov/about/history';
const LOC_LANGE = 'https://www.loc.gov/pictures/item/2017762891/';
const HULBERT = 'https://www.historynewsnetwork.org/article/79770';

// One colour per thread, in the archive palette.
const COLOR = {
  market: '#9c3b2a',
  banking: '#1f3a5f',
  policy: '#4f7a4a',
  politics: '#5b4a8a',
  world: '#2f6b73',
  labor: '#7a5c2e',
  farm: '#b0782a',
  culture: '#8a4f6a',
  economy: '#3d3a33',
};
/** Options with the colour of the first tag. */
const c = (o) => ({ ...o, color: o.color ?? COLOR[o.tags?.[0]] });
/** The dating note of an annual statistic placed at mid-year. */
const ANNUAL = 'An annual average for the year, placed at mid-year.';
/** The note shared by the BLS annual unemployment estimates. */
const jobless = (rate, millions, more = '') =>
  `**${rate}** of the civilian labor force out of work, about **${millions} million** people, in the Bureau of Labor Statistics' estimates (Stanley Lebergott's, the basis of Historical Statistics' series). No one measured unemployment directly at the time: these are later estimates, and others who count relief workers as employed put the 1930s lower.${more}`;

export function greatDepression(core) {
  const h = (id, iso, title) => m(id, at(iso), title, { headingLevel: 'h2', tags: ['chapter'] });
  const mo = (id, iso, title, o) => m(id, at(iso), title, c(o));
  const du = (id, a, b, title, o) => d(id, at(a), at(b), title, c(o));
  const events = [
    // ── The boom and its cracks ──
    h('h-twenties', '1920-01-01', 'The boom and its cracks'),
    mo('prohibition-begins', '1920-01-17', 'Prohibition begins', {
      tags: ['politics'],
      notes:
        'The **Eighteenth Amendment** takes effect: the manufacture, sale and transport of alcoholic drinks are banned nationwide.',
      sources: [wiki('Prohibition_in_the_United_States')],
    }),
    mo('farm-prices', '1920-07-01', 'Farm prices collapse', {
      tags: ['farm'],
      datePrecision: 'Prices fell through the second half of 1920; placed at mid-year.',
      notes:
        'Crop prices, high during the war, fall sharply in the **depression of 1920–21**. Farmers who had borrowed to buy land stay in trouble for the rest of the decade, years before the Crash.',
      sources: [wiki('Depression_of_1920–1921'), wiki('Agriculture_in_the_United_States')],
    }),
    mo('bull-begins', '1921-08-24', 'The bull market begins', {
      tags: ['market'],
      notes:
        'The Dow Jones Industrial Average closes at **63.90**, its low after the 1920–21 slump. From here it rises six-fold in eight years.',
      sources: [wiki('Dow_Jones_Industrial_Average'), wiki('Roaring_Twenties')],
    }),
    mo('coolidge', '1923-08-02', 'Coolidge becomes president', {
      tags: ['politics'],
      notes:
        '**Warren G. Harding** dies in office and **Calvin Coolidge** succeeds him: the years of "Coolidge prosperity", low taxes and light regulation.',
      sources: [wiki('Calvin_Coolidge')],
    }),
    mo('miami-hurricane', '1926-09-18', 'The Miami hurricane', {
      tags: ['market'],
      notes:
        'A major hurricane strikes **Miami**, finishing off the Florida land boom, which had already begun to falter as buyers ran short.',
      sources: [wiki('1926_Miami_hurricane'), wiki('Florida_land_boom_of_the_1920s')],
    }),
    mo('mcnary-haugen', '1927-02-25', 'Coolidge vetoes farm relief', {
      tags: ['farm'],
      notes:
        'Coolidge vetoes the **McNary–Haugen** bill, which would have had the government buy farm surpluses to raise prices; he vetoes it again in 1928.',
      sources: [wiki('McNary–Haugen_Farm_Relief_Bill')],
    }),
    mo('hoover-inaugurated', '1929-03-04', 'Hoover inaugurated', {
      tags: ['politics'],
      notes:
        '**Herbert Hoover**, an engineer and Commerce Secretary under Coolidge, becomes president, promising that the end of poverty is in sight.',
      sources: [wiki('Herbert_Hoover'), wiki('Presidency_of_Herbert_Hoover')],
    }),
    mo('mini-crash', '1929-03-26', 'A warning break', {
      tags: ['market'],
      notes:
        'Prices break on fears that the **Federal Reserve** will tighten credit for speculation; **Charles E. Mitchell** of National City Bank offers loans to calm the market, and it recovers.',
      sources: [wiki('Wall_Street_crash_of_1929'), wiki('Charles_E._Mitchell')],
    }),
    mo('farm-board', '1929-06-15', 'Agricultural Marketing Act', {
      tags: ['farm', 'policy'],
      notes:
        "Hoover's answer to the farm problem: a **Federal Farm Board** to lend to cooperatives and hold surpluses off the market.",
      sources: [wiki('Agricultural_Marketing_Act_of_1929')],
    }),
    mo('unemployment-1929', '1929-07-01', 'Unemployment: 3.2%', {
      tags: ['economy'],
      datePrecision: ANNUAL,
      notes: jobless('3.2%', '1.6'),
      sources: [BLS, wiki('Great_Depression_in_the_United_States')],
    }),
    mo('nber-peak', '1929-08-01', 'The business cycle peaks', {
      tags: ['economy'],
      datePrecision:
        'The NBER dates peaks and troughs to the month (August 1929); placed at its first day.',
      notes:
        'The **National Bureau of Economic Research** dates the peak of the expansion to August 1929: the economy was already turning down two months before the Crash.',
      sources: [NBER, FRH('great-depression')],
    }),
    // ── The Crash ──
    h('h-crash', '1929-09-02', 'The Crash'),
    mo('dow-peak', '1929-09-03', 'The Dow peaks at 381.17', {
      tags: ['market'],
      notes:
        'The Dow Jones Industrial Average closes at **381.17**, its high. Much of the buying is **on margin**: stock bought with money borrowed from brokers, against the stock itself.',
      sources: [wiki('Wall_Street_crash_of_1929'), FRH('stock-market-crash-of-1929')],
    }),
    mo('babson', '1929-09-05', 'The Babson break', {
      tags: ['market'],
      notes:
        'The investment adviser **Roger Babson** tells a business conference that "a crash is coming"; prices fall sharply that afternoon.',
      sources: [wiki('Roger_Babson'), wiki('Wall_Street_crash_of_1929')],
    }),
    mo('hatry', '1929-09-20', 'The Hatry crash in London', {
      tags: ['world', 'market'],
      notes:
        "The London Stock Exchange suspends trading in the companies of **Clarence Hatry**, whose empire is found to rest on fraud; British investors' losses unsettle markets in New York.",
      sources: [wiki('Clarence_Hatry'), wiki('Wall_Street_crash_of_1929')],
    }),
    mo('fisher', '1929-10-15', '"A permanently high plateau"', {
      tags: ['market'],
      datePrecision: 'Said at a dinner in mid-October 1929 and reported the next day.',
      notes:
        'The Yale economist **Irving Fisher** says that stock prices have reached "what looks like a permanently high plateau". Nine days later the panic begins.',
      sources: [wiki('Irving_Fisher')],
    }),
    mo('black-thursday', '1929-10-24T10:00', 'Black Thursday', {
      tags: ['market'],
      datePrecision: "The day is exact; placed at the 10 a.m. opening bell, New York's time.",
      notes:
        'Selling floods the New York Stock Exchange from the opening: a record **12.9 million shares** change hands, and the ticker runs hours behind the trading.',
      sources: [wiki('Wall_Street_crash_of_1929'), FRH('stock-market-crash-of-1929')],
    }),
    mo('bankers', '1929-10-24T12:00', "The bankers' meeting", {
      tags: ['market', 'banking'],
      datePrecision: 'Around midday, as contemporary accounts give it.',
      notes:
        "Leaders of New York's biggest banks (**Thomas Lamont** of J.P. Morgan, **Albert Wiggin** of Chase, **Charles Mitchell** of National City) meet at the House of Morgan and agree to buy stocks to steady the market.",
      sources: [wiki('Wall_Street_crash_of_1929')],
    }),
    mo('whitney', '1929-10-24T13:30', 'Whitney bids 205 for Steel', {
      tags: ['market'],
      datePrecision: 'About 1:30 p.m., as most accounts give it.',
      notes:
        "**Richard Whitney**, the Exchange's vice president, walks onto the floor and bids well above the market for **U.S. Steel**, then for other leading stocks. Prices rally, and the Dow closes the day down only about 2%.",
      sources: [wiki('Richard_Whitney_(financier)'), wiki('Wall_Street_crash_of_1929')],
    }),
    mo('black-monday', '1929-10-28', 'Black Monday', {
      tags: ['market'],
      notes:
        'No rescue comes this time: the Dow falls **38.33 points, 12.8%**, to 260.64, its worst day of the Crash in percentage terms.',
      sources: [wiki('Wall_Street_crash_of_1929')],
    }),
    mo('black-tuesday', '1929-10-29', 'Black Tuesday', {
      tags: ['market'],
      notes:
        'About **16.4 million shares** trade and the Dow falls another **11.7%**, to 230.07: down 23% in two days.',
      sources: [wiki('Wall_Street_crash_of_1929'), FRH('stock-market-crash-of-1929')],
    }),
    mo('nov-low', '1929-11-13', 'The Crash bottoms at 198.60', {
      tags: ['market'],
      notes:
        'The Dow closes at **198.60**, nearly half its September peak. It then recovers through the winter, and many expect the worst is over.',
      sources: [wiki('Wall_Street_crash_of_1929')],
    }),
    // ── The slide ──
    h('h-slide', '1930-01-01', 'The slide, 1930–1932'),
    mo('spring-rally', '1930-04-17', 'The Dow recovers to 294', {
      tags: ['market'],
      notes:
        'The rally after the Crash peaks at **294.07**. From here the market falls, with pauses, for more than two years.',
      sources: [wiki('Wall_Street_crash_of_1929'), wiki('Timeline_of_the_Great_Depression')],
    }),
    mo('bruning-chancellor', '1930-03-30', 'Brüning becomes chancellor', {
      tags: ['world'],
      notes:
        "**Heinrich Brüning** becomes Germany's chancellor and governs by presidential emergency decree, cutting spending and wages to keep the budget balanced and reparations paid.",
      sources: [wiki('Heinrich_Brüning'), wiki('Great_Depression_in_Germany')],
    }),
    mo('smoot-hawley', '1930-06-17', 'Smoot–Hawley tariff', {
      tags: ['policy', 'world'],
      notes:
        'Hoover signs the **Smoot–Hawley Tariff Act**, raising duties on thousands of imports, despite a petition from more than a thousand economists. Other countries retaliate and world trade shrinks.',
      sources: [wiki('Smoot–Hawley_Tariff_Act'), FRH('smoot-hawley-tariff')],
    }),
    mo('reichstag-1930', '1930-09-14', 'Nazis gain in Germany', {
      tags: ['world', 'politics'],
      notes:
        "In the Reichstag election the **Nazi party** grows from 12 seats to 107, the second-largest party, on the back of the slump's discontent.",
      sources: [wiki('1930_German_federal_election')],
    }),
    mo('caldwell', '1930-11-07', 'Caldwell and Company fails', {
      tags: ['banking'],
      notes:
        'The **Bank of Tennessee**, part of the Nashville financial empire of Caldwell and Company, closes; its affiliates follow, and runs spread through the South: the first banking panic.',
      sources: [wiki('Rogers_Caldwell'), FRH('banking-panics-1930-31')],
    }),
    mo('bank-of-us', '1930-12-11', 'The Bank of United States closes', {
      tags: ['banking'],
      notes:
        'The **Bank of United States**, a New York commercial bank with some 400,000 depositors, many of them immigrants, closes after a run: the largest US bank failure to that time.',
      sources: [wiki('Bank_of_United_States'), FRH('banking-panics-1930-31')],
    }),
    mo('creditanstalt', '1931-05-11', 'Creditanstalt fails', {
      tags: ['world', 'banking'],
      notes:
        "Vienna's **Creditanstalt**, Austria's largest bank, announces it has lost most of its capital. The crisis spreads to Hungary and Germany and becomes a European financial panic.",
      sources: [wiki('Creditanstalt'), FRH('creditanstalt-failure')],
    }),
    mo('moratorium-announced', '1931-06-20', 'The Hoover Moratorium', {
      tags: ['world', 'policy'],
      notes:
        'Hoover proposes a one-year halt to payments of **war debts and German reparations**. France delays agreeing for weeks, and the panic continues.',
      sources: [wiki('Hoover_Moratorium')],
    }),
    mo('danat', '1931-07-13', 'Danatbank fails', {
      tags: ['world', 'banking'],
      notes:
        "Germany's **Darmstädter und Nationalbank** closes its doors, and the government closes the country's banks for days.",
      sources: [wiki('Danat-Bank'), wiki('European_banking_crisis_of_1931')],
    }),
    mo('britain-gold', '1931-09-21', 'Britain leaves gold', {
      tags: ['world', 'banking'],
      notes:
        'After weeks of gold losses, Britain suspends the **gold standard** and the pound falls. Within weeks Scandinavia and much of the Commonwealth follow; those who left early recover sooner.',
      sources: [wiki('Gold_standard'), wiki('Great_Depression_in_the_United_Kingdom')],
    }),
    mo('fed-raises', '1931-10-09', 'The Fed raises its rate', {
      tags: ['banking', 'policy'],
      notes:
        'To defend the dollar against gold outflows, the **Federal Reserve Bank of New York** raises its discount rate to 2½%, and to 3½% a week later, in the middle of a banking panic: a step **Milton Friedman** and **Anna Schwartz** later blamed for deepening the depression.',
      sources: [wiki('Great_Depression_in_the_United_States'), FRH('great-depression')],
    }),
    mo('japan-gold', '1931-12-13', 'Japan leaves gold', {
      tags: ['world'],
      notes:
        'On the day **Takahashi Korekiyo** becomes finance minister again, Japan reimposes its gold embargo; the yen falls and exports recover.',
      sources: [wiki('Takahashi_Korekiyo'), wiki('Economic_history_of_Japan')],
    }),
    mo('germany-six-million', '1932-01-15', 'Six million out of work in Germany', {
      tags: ['world', 'economy'],
      datePrecision:
        'A monthly registered figure: about 6 million in early 1932, and again in early 1933.',
      notes:
        'Registered unemployment in Germany passes **six million**, roughly a third of the workforce by some estimates; many more had stopped registering.',
      sources: [wiki('Great_Depression_in_Germany'), wiki('Weimar_Republic')],
    }),
    mo('rfc', '1932-01-22', 'The RFC', {
      tags: ['policy', 'banking'],
      notes:
        'Hoover signs the act creating the **Reconstruction Finance Corporation**, to lend to banks, railroads and other businesses. The New Deal keeps it and widens it.',
      sources: [
        wiki('Reconstruction_Finance_Corporation'),
        FRH('reconstruction-finance-corporation'),
      ],
    }),
    mo('revenue-1932', '1932-06-06', 'Revenue Act of 1932', {
      tags: ['policy'],
      notes:
        'To balance the budget, Congress passes one of the largest peacetime **tax increases** in American history, in the depths of the slump.',
      sources: [wiki('Revenue_Act_of_1932')],
    }),
    mo('bonus-vote', '1932-06-17', 'Senate rejects the bonus', {
      tags: ['politics', 'labor'],
      notes:
        'The Senate defeats the **Patman bill**, 62 to 18, which would have paid veterans their First World War bonus early, while thousands of them wait outside the Capitol.',
      sources: [wiki('Bonus_Army')],
    }),
    mo('new-deal-speech', '1932-07-02', '"A new deal for the American people"', {
      tags: ['politics'],
      notes:
        'Accepting the Democratic nomination in Chicago, **Franklin D. Roosevelt**, governor of New York, pledges "a new deal for the American people", the phrase that names his programs.',
      sources: [wiki('1932_Democratic_National_Convention'), wiki('New_Deal')],
    }),
    mo('dow-bottom', '1932-07-08', 'The Dow hits bottom: 41.22', {
      tags: ['market'],
      notes:
        'The Dow closes at **41.22**, down **89%** from its 1929 peak and lower than at any time since 1896: its low of the twentieth century.',
      sources: [wiki('Wall_Street_crash_of_1929'), wiki('Dow_Jones_Industrial_Average')],
    }),
    mo('unemployment-1932', '1932-07-01', 'Unemployment: 23.6%', {
      tags: ['economy'],
      datePrecision: ANNUAL,
      notes: jobless('23.6%', '12.1'),
      sources: [BLS],
    }),
    mo('erca', '1932-07-21', 'Emergency Relief and Construction Act', {
      tags: ['policy'],
      notes:
        "The first federal relief law: the RFC may lend up to **$300 million** to the states for relief and more for public works, a break with Hoover's long refusal of federal relief.",
      sources: [wiki('Emergency_Relief_and_Construction_Act')],
    }),
    mo('bonus-eviction', '1932-07-28', 'The Bonus Army driven out', {
      tags: ['politics', 'labor'],
      notes:
        'After police shoot two veterans, Hoover orders the Army in: troops under **Douglas MacArthur**, with cavalry, tanks and tear gas, clear the marchers and burn their camp at Anacostia Flats.',
      sources: [wiki('Bonus_Army')],
    }),
    mo('reichstag-1932', '1932-07-31', 'The Nazis become the largest party', {
      tags: ['world', 'politics'],
      notes:
        'With about **37%** of the vote, the Nazis win 230 seats and become the largest party in the Reichstag, though short of a majority.',
      sources: [wiki('July_1932_German_federal_election')],
    }),
    mo('brother-dime', '1932-10-05', '"Brother, Can You Spare a Dime?"', {
      tags: ['culture'],
      datePrecision: 'The revue Americana opened on Broadway in early October 1932.',
      notes:
        "**Yip Harburg** and **Jay Gorney**'s song, from the revue Americana, of a man who built the railroads and fought the war and now stands in a breadline: the Depression's anthem.",
      sources: [wiki('Brother,_Can_You_Spare_a_Dime%3F')],
    }),
    mo('election-1932', '1932-11-08', 'Roosevelt elected', {
      tags: ['politics'],
      notes:
        'Roosevelt defeats Hoover with **57%** of the popular vote and 472 electoral votes to 59; four months of interregnum follow before he takes office.',
      sources: [wiki('1932_United_States_presidential_election')],
    }),
    mo('hitler', '1933-01-30', 'Hitler becomes chancellor', {
      tags: ['world', 'politics'],
      notes:
        "President **Hindenburg** appoints **Adolf Hitler** chancellor of Germany. Within months the Nazis have made Germany a dictatorship; the slump's six million unemployed had fed their rise.",
      sources: [wiki('Adolf_Hitler%27s_rise_to_power'), wiki('Great_Depression_in_Germany')],
    }),
    mo('michigan-holiday', '1933-02-14', 'Michigan closes its banks', {
      tags: ['banking'],
      notes:
        "To stop runs on Detroit's banks, Michigan's governor declares an eight-day **bank holiday**. Panic spreads, and state after state closes its banks in the weeks that follow.",
      sources: [wiki('Emergency_Banking_Act'), FRH('bank-holiday-of-1933')],
    }),
    // ── The New Deal ──
    h('h-new-deal', '1933-02-25', 'The New Deal'),
    mo('fdr-inaugurated', '1933-03-04', '"The only thing we have to fear…"', {
      tags: ['politics'],
      notes:
        'Roosevelt is inaugurated, with most of the nation\'s banks shut or restricted: "the only thing we have to fear is fear itself". The last inauguration held in March.',
      sources: [wiki('First_inauguration_of_Franklin_D._Roosevelt'), FDR_1933],
    }),
    mo('bank-holiday', '1933-03-06', 'The national bank holiday', {
      tags: ['banking', 'policy'],
      notes:
        "By proclamation, Roosevelt closes every bank in the country and halts gold exports, so that the banks' books can be examined.",
      sources: [wiki('Emergency_Banking_Act'), FRH('bank-holiday-of-1933')],
    }),
    mo('emergency-banking', '1933-03-09', 'Emergency Banking Act', {
      tags: ['banking', 'policy'],
      notes:
        'Congress passes it the day it meets, in a few hours, and Roosevelt signs it that night: sound banks are to reopen under license, with Federal Reserve currency behind them. The **Hundred Days** begin.',
      sources: [wiki('Emergency_Banking_Act'), FRH('bank-holiday-of-1933')],
    }),
    mo('fireside-chat', '1933-03-12', 'The first fireside chat', {
      tags: ['banking', 'politics'],
      notes:
        'On a Sunday evening, Roosevelt explains the banking crisis over the radio in plain words: "it is safer to keep your money in a reopened bank than under the mattress."',
      sources: [wiki('Fireside_chats'), FRH('bank-holiday-of-1933')],
    }),
    mo('banks-reopen', '1933-03-13', 'Banks begin to reopen', {
      tags: ['banking'],
      notes:
        'Banks in the Federal Reserve cities reopen first, others over the following days. Depositors bring their money back; the panic is over.',
      sources: [wiki('Emergency_Banking_Act'), FRH('bank-holiday-of-1933')],
    }),
    mo('dow-record-day', '1933-03-15', 'The Dow gains 15% in a day', {
      tags: ['market'],
      notes:
        'When the Stock Exchange reopens after the holiday, the Dow rises **15.34%**, its largest one-day gain in percentage terms, a record that still stands.',
      sources: [wiki('Dow_Jones_Industrial_Average'), wiki('Emergency_Banking_Act')],
    }),
    mo('beer', '1933-03-22', 'Beer is legal again', {
      tags: ['politics'],
      notes:
        'The **Cullen–Harrison Act** allows beer and light wine of up to 3.2% alcohol from April 7, while repeal of Prohibition goes to the states.',
      sources: [wiki('Cullen–Harrison_Act')],
    }),
    mo('ccc-act', '1933-03-31', 'The Civilian Conservation Corps', {
      tags: ['policy', 'labor'],
      notes:
        'Young unemployed men are put to work planting forests, fighting erosion and building parks, in camps run with the Army; most of their pay is sent home to their families.',
      sources: [wiki('Civilian_Conservation_Corps')],
    }),
    mo('gold-6102', '1933-04-05', 'Gold must be handed in', {
      tags: ['banking', 'policy'],
      notes:
        '**Executive Order 6102** requires Americans to deliver most of their gold coin, bullion and gold certificates to the Federal Reserve, at $20.67 an ounce.',
      sources: [wiki('Executive_Order_6102'), FRH('roosevelts-gold-program')],
    }),
    mo('off-gold', '1933-04-19', 'The United States leaves gold', {
      tags: ['banking', 'policy'],
      datePrecision: 'Announced on April 19, 1933; the executive order followed on the 20th.',
      notes:
        'Roosevelt bans gold exports, taking the dollar off the gold standard; it falls against foreign currencies, and prices begin to rise.',
      sources: [wiki('Gold_standard'), FRH('roosevelts-gold-program')],
    }),
    mo('aaa', '1933-05-12T12:00', 'Agricultural Adjustment Act', {
      tags: ['farm', 'policy'],
      datePrecision:
        'Signed on May 12, 1933, the same day as the act creating FERA; placed at midday, an hour apart, so the two separate.',
      notes:
        "Farmers are paid to plant less, funded by a tax on processors, to raise crop prices. To cut that year's surplus, millions of young pigs are slaughtered and cotton plowed under.",
      sources: [wiki('Agricultural_Adjustment_Act')],
    }),
    mo('fera', '1933-05-12T13:00', 'Federal Emergency Relief Administration', {
      tags: ['policy'],
      datePrecision: 'Signed on May 12, 1933, with the AAA; placed an hour after it.',
      notes:
        "**Harry Hopkins**'s FERA gives the states **$500 million** in grants, not loans, for relief: direct federal money for the jobless.",
      sources: [wiki('Federal_Emergency_Relief_Administration')],
    }),
    mo('tva', '1933-05-18', 'The Tennessee Valley Authority', {
      tags: ['policy'],
      notes:
        'A public corporation to build dams for flood control and cheap electric power across one of the poorest regions in the country.',
      sources: [wiki('Tennessee_Valley_Authority'), NARA('tennessee-valley-authority-act')],
    }),
    mo('securities-act', '1933-05-27', 'Securities Act of 1933', {
      tags: ['market', 'policy'],
      notes:
        'Companies selling stocks and bonds to the public must now register them and tell the truth about them: the first federal law regulating securities.',
      sources: [wiki('Securities_Act_of_1933')],
    }),
    mo('nira', '1933-06-16T12:00', 'National Industrial Recovery Act', {
      tags: ['policy', 'labor'],
      datePrecision:
        'Signed on June 16, 1933, the last day of the Hundred Days, with the Banking Act; placed at midday, an hour apart, so the two separate.',
      notes:
        'Industries write **codes** of fair competition setting prices, wages and hours, under the Blue Eagle of the **National Recovery Administration**; section 7(a) protects the right to organize. It also creates the Public Works Administration.',
      sources: [
        wiki('National_Industrial_Recovery_Act_of_1933'),
        wiki('National_Recovery_Administration'),
      ],
    }),
    mo('glass-steagall', '1933-06-16T13:00', 'Glass–Steagall and the FDIC', {
      tags: ['banking', 'policy'],
      datePrecision: 'Signed on June 16, 1933, with the NIRA; placed an hour after it.',
      notes:
        'The **Banking Act of 1933** separates commercial from investment banking and creates the **Federal Deposit Insurance Corporation** to insure bank deposits.',
      sources: [wiki('1933_Banking_Act'), FRH('glass-steagall-act'), FDIC],
    }),
    mo('bombshell', '1933-07-03', "Roosevelt's bombshell message", {
      tags: ['world', 'policy'],
      notes:
        'Roosevelt tells the **London Economic Conference** that he will not tie the dollar to a currency agreement: recovery at home comes first. The conference breaks up without one.',
      sources: [wiki('London_Economic_Conference')],
    }),
    mo('unemployment-1933', '1933-07-01', 'Unemployment peaks: 24.9%', {
      tags: ['economy'],
      datePrecision: ANNUAL,
      notes: jobless(
        '24.9%',
        '12.8',
        ' The worst year: one worker in four. More than 9,000 banks had closed since 1930.',
      ),
      sources: [BLS, wiki('Great_Depression_in_the_United_States')],
    }),
    mo('nber-trough', '1933-03-01', 'The business cycle bottoms', {
      tags: ['economy'],
      datePrecision: 'The NBER dates the trough to March 1933; placed at its first day.',
      notes:
        'The NBER dates the trough to **March 1933**: 43 months of contraction, the longest since the 1870s. By then the money supply had fallen by nearly 30% since 1930, and prices about as much.',
      sources: [NBER, FRH('great-depression')],
    }),
    mo('repeal', '1933-12-05', 'Prohibition ends', {
      tags: ['politics'],
      notes:
        'Utah becomes the 36th state to ratify the **Twenty-first Amendment**, repealing the Eighteenth: alcohol is legal again, and taxed.',
      sources: [wiki('Twenty-first_Amendment_to_the_United_States_Constitution')],
    }),
    mo('fdic-begins', '1934-01-01', 'Deposit insurance begins', {
      tags: ['banking'],
      notes:
        'The FDIC begins insuring deposits, up to $2,500 per depositor at first. Bank runs, routine for a century, almost disappear.',
      sources: [FDIC, wiki('Federal_Deposit_Insurance_Corporation')],
    }),
    mo('gold-reserve-act', '1934-01-30', 'Gold Reserve Act', {
      tags: ['banking', 'policy'],
      notes:
        "The Treasury takes title to the Federal Reserve's gold, and the next day Roosevelt fixes the price of gold at **$35 an ounce**, up from $20.67: a devaluation of the dollar by about 41%.",
      sources: [wiki('Gold_Reserve_Act'), FRH('gold-reserve-act')],
    }),
    mo('dust-may-1934', '1934-05-11', 'Dust reaches the East Coast', {
      tags: ['farm'],
      datePrecision: 'The storm crossed the country over May 9–11, 1934.',
      notes:
        'A great dust storm from the Plains darkens skies over Chicago, then New York and Washington, and drops dust on ships in the Atlantic.',
      sources: [wiki('Dust_Bowl')],
    }),
    mo('sec', '1934-06-06', 'The SEC', {
      tags: ['market', 'policy'],
      notes:
        'The **Securities Exchange Act** regulates the stock exchanges and margin lending and creates the **Securities and Exchange Commission**; its first chairman is the former speculator **Joseph P. Kennedy**.',
      sources: [
        wiki('Securities_Exchange_Act_of_1934'),
        wiki('U.S._Securities_and_Exchange_Commission'),
      ],
    }),
    mo('rtaa', '1934-06-12', 'Reciprocal Trade Agreements Act', {
      tags: ['policy', 'world'],
      notes:
        'Congress lets the president cut tariffs by up to half in bilateral agreements, beginning to undo **Smoot–Hawley**.',
      sources: [wiki('Reciprocal_Tariff_Act')],
    }),
    // ── The Second New Deal ──
    h('h-second', '1935-01-01', 'The Second New Deal'),
    mo('era-1935', '1935-04-08', 'Emergency Relief Appropriation Act', {
      tags: ['policy', 'labor'],
      notes:
        'Nearly **$5 billion** for work relief, then the largest single appropriation in American history: the money behind the WPA.',
      sources: [wiki('Emergency_Relief_Appropriation_Act_of_1935')],
    }),
    mo('black-sunday', '1935-04-14', 'Black Sunday', {
      tags: ['farm'],
      notes:
        "A wall of dust driven by a cold front sweeps across the southern Plains, turning afternoon to night. A reporter's story about it gives the region its name: the **Dust Bowl**.",
      sources: [wiki('Black_Sunday_(storm)'), wiki('Dust_Bowl')],
    }),
    mo('soil-conservation', '1935-04-27', 'The Soil Conservation Service', {
      tags: ['farm', 'policy'],
      notes:
        'The **Soil Conservation Act** sets up the Soil Conservation Service under **Hugh Hammond Bennett**, who teaches contour plowing, terracing and shelterbelts.',
      sources: [wiki('Natural_Resources_Conservation_Service'), wiki('Dust_Bowl')],
    }),
    mo('wpa', '1935-05-06', 'The WPA', {
      tags: ['policy', 'labor'],
      notes:
        'Executive Order 7034 creates the **Works Progress Administration**. At its height it employs over three million people, building roads, schools, bridges and airports, and paying artists, writers and actors.',
      sources: [wiki('Works_Progress_Administration')],
    }),
    mo('rea', '1935-05-11', 'Rural Electrification Administration', {
      tags: ['farm', 'policy'],
      notes:
        'Nine farms in ten have no electricity. The REA lends to cooperatives to string lines into the countryside.',
      sources: [wiki('Rural_Electrification_Administration')],
    }),
    mo('schechter', '1935-05-27', 'The Schechter decision', {
      tags: ['policy', 'politics'],
      notes:
        "In **Schechter Poultry Corp. v. United States**, a case about a Brooklyn poultry dealer, the Supreme Court unanimously strikes down the NRA's codes: Congress cannot hand its lawmaking to the president, nor regulate purely local business.",
      sources: [wiki('Schechter_Poultry_Corp._v._United_States')],
    }),
    mo('wagner', '1935-07-05', 'The Wagner Act', {
      tags: ['labor', 'policy'],
      notes:
        "The **National Labor Relations Act** guarantees workers the right to organize unions and bargain collectively, and sets up the National Labor Relations Board, replacing the NRA's section 7(a).",
      sources: [wiki('National_Labor_Relations_Act_of_1935'), NARA('national-labor-relations-act')],
    }),
    mo('federal-one', '1935-08-02', "The WPA's arts projects", {
      tags: ['culture', 'policy'],
      datePrecision: 'Set up in the summer of 1935; dated here to August 2.',
      notes:
        "**Federal Project Number One** employs artists, musicians, actors and writers: the Federal Writers' Project's state guides and recorded life stories of formerly enslaved people come from it.",
      sources: [wiki('Federal_Project_Number_One')],
    }),
    mo('social-security', '1935-08-14', 'The Social Security Act', {
      tags: ['policy', 'labor'],
      notes:
        'Old-age insurance paid for by a payroll tax, unemployment insurance run by the states, and aid to dependent children: the foundation of the American welfare state.',
      sources: [wiki('Social_Security_Act'), NARA('social-security-act')],
    }),
    mo('banking-act-1935', '1935-08-23', 'Banking Act of 1935', {
      tags: ['banking', 'policy'],
      notes:
        'It reorganizes the **Federal Reserve**, putting monetary policy in the hands of a Board of Governors in Washington and its Open Market Committee, and makes deposit insurance permanent.',
      sources: [wiki('Banking_Act_of_1935'), FRH('banking-act-of-1935')],
    }),
    mo('cio', '1935-11-09', 'The CIO is formed', {
      tags: ['labor'],
      notes:
        '**John L. Lewis** and other union leaders form the Committee for Industrial Organization to organize whole industries, such as steel and cars, rather than single crafts.',
      sources: [wiki('Congress_of_Industrial_Organizations')],
    }),
    mo('butler', '1936-01-06', 'The Court strikes down the AAA', {
      tags: ['farm', 'politics'],
      notes:
        "In **United States v. Butler**, the Supreme Court holds the AAA's processing tax unconstitutional, ending the first farm program.",
      sources: [wiki('United_States_v._Butler')],
    }),
    mo('keynes', '1936-02-04', "Keynes's General Theory", {
      tags: ['world', 'culture'],
      notes:
        '**John Maynard Keynes** publishes The General Theory of Employment, Interest and Money in London, arguing that an economy can stay stuck with mass unemployment, and that government spending can lift it out.',
      sources: [wiki('The_General_Theory_of_Employment,_Interest_and_Money')],
    }),
    mo('takahashi-killed', '1936-02-26', 'Takahashi assassinated', {
      tags: ['world'],
      notes:
        "Japan's finance minister, aged 81, whose deficit spending and cheap yen had brought Japan out of the slump early, is killed by army officers in the **February 26 incident**, partly for trying to cut military spending.",
      sources: [wiki('Takahashi_Korekiyo'), wiki('February_26_incident')],
    }),
    mo('allotment-act', '1936-02-29', 'Soil Conservation and Domestic Allotment Act', {
      tags: ['farm', 'policy'],
      notes:
        'A replacement for the struck-down AAA: farmers are now paid to plant soil-building crops instead of soil-depleting ones such as wheat and cotton.',
      sources: [wiki('Soil_Conservation_and_Domestic_Allotment_Act')],
    }),
    mo('migrant-mother', '1936-03-15', 'Migrant Mother', {
      tags: ['culture', 'farm'],
      datePrecision: 'March 1936; the day is not certain, so it is placed mid-month.',
      notes:
        "**Dorothea Lange**, photographing for the Resettlement Administration, takes pictures of a mother and her children in a pea pickers' camp at Nipomo, California. The woman, **Florence Owens Thompson**, was identified only in 1978.",
      sources: [wiki('Migrant_Mother'), LOC_LANGE],
    }),
    mo('jarrow-start', '1936-10-05', 'The Jarrow March', {
      tags: ['world', 'labor'],
      notes:
        'Some 200 men from **Jarrow**, a shipbuilding town in northeast England where most were out of work, set out to walk to London to petition Parliament for work.',
      sources: [wiki('Jarrow_March')],
    }),
    mo('election-1936', '1936-11-03', 'Roosevelt re-elected', {
      tags: ['politics'],
      notes:
        "Roosevelt wins **46 of 48 states** and 523 electoral votes to Alf Landon's 8, with a coalition of workers, farmers, Black voters in the North, and the South.",
      sources: [wiki('1936_United_States_presidential_election')],
    }),
    // ── Court fight and recession ──
    h('h-recession', '1937-01-01', 'Court fight and recession'),
    mo('second-inaugural', '1937-01-20', '"One-third of a nation"', {
      tags: ['politics'],
      notes:
        'At the first January inauguration, Roosevelt says he sees "one-third of a nation ill-housed, ill-clad, ill-nourished".',
      sources: [wiki('Second_inauguration_of_Franklin_D._Roosevelt')],
    }),
    mo('court-plan', '1937-02-05', 'The court-packing plan', {
      tags: ['politics'],
      notes:
        'Roosevelt asks Congress for the power to appoint a new justice for every one over seventy, up to six: a way past the Court that had struck down his laws. Even many Democrats oppose it.',
      sources: [wiki('Judicial_Procedures_Reform_Bill_of_1937')],
    }),
    mo('west-coast-hotel', '1937-03-29', 'West Coast Hotel v. Parrish', {
      tags: ['politics', 'labor'],
      notes:
        'The Court upholds Washington State\'s **minimum wage for women**, 5 to 4, as **Justice Owen Roberts** joins the majority: the "switch in time" that took the urgency out of the court plan.',
      sources: [wiki('West_Coast_Hotel_Co._v._Parrish')],
    }),
    mo('jones-laughlin', '1937-04-12', 'The Wagner Act upheld', {
      tags: ['labor', 'politics'],
      notes:
        'In **NLRB v. Jones & Laughlin Steel**, the Court upholds the Wagner Act, and with it federal power over labor relations in industry.',
      sources: [wiki('NLRB_v._Jones_%26_Laughlin_Steel_Corp.')],
    }),
    mo('reserves-doubled', '1937-05-01', 'Reserve requirements doubled', {
      tags: ['banking', 'policy'],
      notes:
        'The last of three increases since August 1936 takes effect: banks must hold **twice** the reserves they did. With the budget tightened too, many economists count it among the causes of the recession that follows.',
      sources: [FRH('recession-of-1937-38'), wiki('Recession_of_1937–1938')],
    }),
    mo('memorial-day', '1937-05-30', 'The Memorial Day massacre', {
      tags: ['labor'],
      notes:
        'Chicago police fire on striking steelworkers and their families marching on **Republic Steel**: ten are killed.',
      sources: [wiki('Memorial_Day_massacre_of_1937')],
    }),
    mo('unemployment-1937', '1937-07-01', 'Unemployment: 14.3%', {
      tags: ['economy'],
      datePrecision: ANNUAL,
      notes: jobless(
        '14.3%',
        '7.7',
        ' The best year of the decade, and still one worker in seven.',
      ),
      sources: [BLS],
    }),
    mo('court-recommitted', '1937-07-22', 'The court plan fails', {
      tags: ['politics'],
      notes:
        'The Senate votes **70 to 20** to send the bill back to committee, ending it. Retirements soon give Roosevelt his majority on the Court anyway.',
      sources: [wiki('Judicial_Procedures_Reform_Bill_of_1937')],
    }),
    mo('second-aaa', '1938-02-16', 'The second AAA', {
      tags: ['farm', 'policy'],
      notes:
        'A new **Agricultural Adjustment Act**, on firmer constitutional ground, with crop quotas, price-support loans and an "ever-normal granary".',
      sources: [wiki('Agricultural_Adjustment_Act')],
    }),
    mo('spending-1938', '1938-04-14', 'Roosevelt turns to spending', {
      tags: ['policy'],
      notes:
        'With the recession deepening, Roosevelt asks Congress for billions in new relief and public works spending, and explains why in a fireside chat that evening.',
      sources: [wiki('Recession_of_1937–1938'), FRH('recession-of-1937-38')],
    }),
    mo('flsa', '1938-06-25', 'The Fair Labor Standards Act', {
      tags: ['labor', 'policy'],
      notes:
        'A national **minimum wage** of 25 cents an hour, a maximum work week of 44 hours falling to 40, with overtime pay, and a ban on most child labor. The last major New Deal law.',
      sources: [wiki('Fair_Labor_Standards_Act_of_1938')],
    }),
    mo('unemployment-1938', '1938-07-01', 'Unemployment: 19.0%', {
      tags: ['economy'],
      datePrecision: ANNUAL,
      notes: jobless('19.0%', '10.4', ' Up from 14.3% the year before, in the recession.'),
      sources: [BLS],
    }),
    // ── Toward war ──
    h('h-war', '1939-01-01', 'Toward war'),
    mo('grapes-book', '1939-04-14', 'The Grapes of Wrath', {
      tags: ['culture', 'farm'],
      notes:
        "**John Steinbeck**'s novel of the **Joads**, tenant farmers driven off their Oklahoma land who go west to California, comes out four years to the day after Black Sunday. It wins the Pulitzer Prize.",
      sources: [wiki('The_Grapes_of_Wrath')],
    }),
    mo('ww2-begins', '1939-09-01', 'War in Europe', {
      tags: ['world'],
      notes:
        'Germany invades **Poland**; Britain and France declare war two days later. Orders for arms from abroad begin to reach American factories.',
      sources: [wiki('Invasion_of_Poland'), wiki('World_War_II')],
    }),
    mo('grapes-film', '1940-01-24', 'The Grapes of Wrath on screen', {
      tags: ['culture'],
      notes:
        "**John Ford**'s film, with **Henry Fonda** as Tom Joad, opens in New York, less than a year after the novel.",
      sources: [wiki('The_Grapes_of_Wrath_(film)')],
    }),
    mo('first-check', '1940-01-31', 'The first monthly Social Security check', {
      tags: ['policy'],
      notes:
        'A retired legal secretary in Vermont, **Ida May Fuller**, receives check number 00-000-001, for **$22.54**.',
      sources: [wiki('Ida_May_Fuller'), wiki('Social_Security_(United_States)')],
    }),
    mo('fifty-thousand-planes', '1940-05-16', '50,000 planes a year', {
      tags: ['policy', 'world'],
      notes:
        'As Germany overruns western Europe, Roosevelt asks Congress for a huge defense build-up and a goal of **50,000 aircraft** a year.',
      sources: [wiki('Arsenal_of_Democracy'), wiki('United_States_home_front_during_World_War_II')],
    }),
    mo('draft', '1940-09-16', 'The first peacetime draft', {
      tags: ['politics'],
      notes:
        'The **Selective Training and Service Act** requires men aged 21 to 35 to register for military service.',
      sources: [wiki('Selective_Training_and_Service_Act_of_1940')],
    }),
    mo('lend-lease', '1941-03-11', 'Lend-Lease', {
      tags: ['world', 'policy'],
      notes:
        'Congress lets the president lend or lease war supplies to countries whose defense is vital to the United States, starting with **Britain**: the "arsenal of democracy" at work.',
      sources: [wiki('Lend-Lease')],
    }),
    mo('unemployment-1941', '1941-07-01', 'Unemployment: 9.9%', {
      tags: ['economy'],
      datePrecision: ANNUAL,
      notes: jobless('9.9%', '5.6', ' Falling fast as defense work grows.'),
      sources: [BLS],
    }),
    mo('pearl-harbor', '1941-12-07', 'Pearl Harbor', {
      tags: ['world', 'politics'],
      notes:
        'Japan attacks the US Pacific Fleet in Hawaii, and the United States enters the Second World War. The war economy, not the New Deal, ends mass unemployment.',
      sources: [wiki('Attack_on_Pearl_Harbor'), wiki('Great_Depression_in_the_United_States')],
    }),
    mo('unemployment-1942', '1942-07-01', 'Unemployment: 4.7%', {
      tags: ['economy'],
      datePrecision: ANNUAL,
      notes: jobless('4.7%', '2.7', ' By 1944 it is under 2%.'),
      sources: [BLS],
    }),
    // ── Afterward ──
    h('h-after', '1954-01-01', 'Afterward'),
    mo('dow-regains', '1954-11-23', 'The Dow regains its 1929 peak', {
      tags: ['market'],
      notes:
        'The Dow closes above **381.17** for the first time, at 382.74, **25 years** after its September 1929 peak. That counts prices alone: with dividends reinvested and the fall in prices allowed for, an investor at the peak had broken even by about 1936.',
      sources: [wiki('Wall_Street_crash_of_1929'), HULBERT],
    }),
  ];
  const durations = [
    du('great-depression', '1929-08-01', '1941-12-07', 'The Great Depression', {
      tags: ['economy'],
      notes:
        'Dated here from the NBER peak of August 1929 to Pearl Harbor. Its start and end are a matter of convention: many date it from the Crash, and to 1939 or 1941.',
      sources: [wiki('Great_Depression'), FRH('great-depression')],
    }),
    // The business cycle
    du('depression-1920', '1920-01-01', '1921-07-01', 'Depression of 1920–21', {
      tags: ['economy'],
      notes: 'Peak January 1920, trough July 1921, as the NBER dates them; short and sharp.',
      sources: [NBER, wiki('Depression_of_1920–1921')],
    }),
    du('contraction', '1929-08-01', '1933-03-01', 'Contraction, Aug 1929 – Mar 1933', {
      tags: ['economy'],
      notes:
        'The NBER business-cycle contraction: 43 months from peak to trough, dated to the month.',
      sources: [NBER],
    }),
    du('expansion', '1933-03-01', '1937-05-01', 'Recovery, Mar 1933 – May 1937', {
      tags: ['economy'],
      notes:
        'The NBER expansion: 50 months of fast growth, from a very low base; unemployment stays above 14%.',
      sources: [NBER, BLS],
    }),
    du('recession-1937', '1937-05-01', '1938-06-01', 'Recession, May 1937 – June 1938', {
      tags: ['economy'],
      notes:
        'The NBER contraction of 1937–38: 13 months, the "depression within the Depression", after tighter money and a tighter budget.',
      sources: [NBER, FRH('recession-of-1937-38')],
    }),
    // The market
    du('bull-market', '1921-08-24', '1929-09-03', 'The bull market', {
      tags: ['market'],
      notes:
        "The Dow rises from 63.90 to 381.17 in eight years, the last two fueled by **brokers' loans** for margin buying.",
      sources: [wiki('Roaring_Twenties'), wiki('Wall_Street_crash_of_1929')],
    }),
    du('florida', '1924-01-01', '1926-09-18', 'The Florida land boom', {
      tags: ['market'],
      notes:
        'Speculation in Florida lots, bought on small deposits and resold before the next payment was due; it peaked in 1925 (the start is approximate) and the 1926 hurricane finished it.',
      sources: [wiki('Florida_land_boom_of_the_1920s')],
    }),
    du('dow-slide', '1929-09-03', '1932-07-08', 'The Dow, peak to bottom', {
      tags: ['market'],
      notes: 'From 381.17 to 41.22: a fall of 89% in two years and ten months.',
      sources: [wiki('Wall_Street_crash_of_1929')],
    }),
    du('dow-below', '1929-09-03', '1954-11-23', 'The Dow below its 1929 peak', {
      tags: ['market'],
      notes:
        'Twenty-five years and two months before the index closes above 381.17 again. In prices alone; dividends and deflation shorten it to about seven years.',
      sources: [wiki('Wall_Street_crash_of_1929'), HULBERT],
    }),
    // Banking
    du('panic-1930', '1930-11-01', '1931-01-31', 'First banking panic', {
      tags: ['banking'],
      notes:
        'From the fall of Caldwell and Company in Nashville to the Bank of United States in New York: hundreds of banks suspend.',
      sources: [FRH('banking-panics-1930-31'), wiki('Great_Depression_in_the_United_States')],
    }),
    du('panic-1931', '1931-04-01', '1931-08-31', 'Second banking panic', {
      tags: ['banking'],
      notes:
        'Runs in the Midwest, centered on Chicago, as the European crisis builds; dates to the month.',
      sources: [FRH('banking-panics-1930-31'), wiki('Great_Depression_in_the_United_States')],
    }),
    du('panic-sterling', '1931-09-21', '1931-10-31', 'Bank runs after sterling', {
      tags: ['banking'],
      notes:
        'After Britain leaves gold, gold flows out of the US and depositors pull cash: by October more than 2,100 banks have suspended since the start of the slump.',
      sources: [wiki('Great_Depression_in_the_United_States')],
    }),
    du('panic-1933', '1933-02-14', '1933-03-06', 'Banking panic of 1933', {
      tags: ['banking'],
      notes:
        "From Michigan's bank holiday to the national one: by inauguration day, most states had closed or restricted their banks.",
      sources: [FRH('bank-holiday-of-1933'), wiki('Emergency_Banking_Act')],
    }),
    du('holiday', '1933-03-06', '1933-03-13', 'The bank holiday', {
      tags: ['banking'],
      notes: 'Every bank in the country closed, until they began to reopen under license.',
      sources: [FRH('bank-holiday-of-1933')],
    }),
    // Politics
    du('coolidge-term', '1923-08-02', '1929-03-04', 'Coolidge presidency', {
      tags: ['politics'],
      sources: [wiki('Presidency_of_Calvin_Coolidge')],
    }),
    du('hoover-term', '1929-03-04', '1933-03-04', 'Hoover presidency', {
      tags: ['politics'],
      notes: 'One term, almost all of it in the slump.',
      sources: [wiki('Presidency_of_Herbert_Hoover')],
    }),
    du('fdr-term', '1933-03-04', '1945-04-12', 'Roosevelt presidency', {
      tags: ['politics'],
      notes: 'Twelve years and five weeks, to his death in April 1945: the longest presidency.',
      sources: [wiki('Presidency_of_Franklin_D._Roosevelt')],
    }),
    du('prohibition', '1920-01-17', '1933-12-05', 'Prohibition', {
      tags: ['politics'],
      notes: 'Almost fourteen years, from the Eighteenth Amendment to the Twenty-first.',
      sources: [wiki('Prohibition_in_the_United_States')],
    }),
    du('bonus-army', '1932-05-25', '1932-07-28', 'The Bonus Army in Washington', {
      tags: ['politics', 'labor'],
      notes:
        'From late May 1932, as the first veterans arrive (the day is approximate), about 17,000 veterans and their families camp in the capital until they are driven out.',
      sources: [wiki('Bonus_Army')],
    }),
    du('court-fight', '1937-02-05', '1937-07-22', 'The court fight', {
      tags: ['politics'],
      notes: 'Five and a half months, from the plan to its recommittal.',
      sources: [wiki('Judicial_Procedures_Reform_Bill_of_1937')],
    }),
    // New Deal programs
    du('hundred-days', '1933-03-09', '1933-06-16', 'The Hundred Days', {
      tags: ['policy'],
      notes:
        'The special session of Congress, from the Emergency Banking Act to the NIRA and Glass–Steagall: fifteen major laws in about a hundred days.',
      sources: [wiki('First_100_days_of_Franklin_D._Roosevelt%27s_presidency'), wiki('New_Deal')],
    }),
    du('ccc', '1933-03-31', '1942-06-30', 'Civilian Conservation Corps', {
      tags: ['policy', 'labor'],
      notes:
        'About three million young men served in it over nine years, until Congress stopped its funding in 1942.',
      sources: [wiki('Civilian_Conservation_Corps')],
    }),
    du('aaa-first', '1933-05-12', '1936-01-06', 'The first AAA', {
      tags: ['farm', 'policy'],
      notes: 'Until the Supreme Court struck it down in United States v. Butler.',
      sources: [wiki('Agricultural_Adjustment_Act')],
    }),
    du('nra', '1933-06-16', '1935-05-27', 'The NRA codes', {
      tags: ['policy', 'labor'],
      notes: 'Until the Schechter decision; the agency itself was wound up by the end of 1935.',
      sources: [wiki('National_Recovery_Administration')],
    }),
    du('cwa', '1933-11-08', '1934-03-31', 'Civil Works Administration', {
      tags: ['policy', 'labor'],
      notes:
        'A winter jobs program that put about four million people to work within weeks, then was shut down for its cost.',
      sources: [wiki('Civil_Works_Administration')],
    }),
    du('wpa-years', '1935-05-06', '1943-06-30', 'Works Progress Administration', {
      tags: ['policy', 'labor'],
      notes:
        'Renamed the Work Projects Administration in 1939; about 8.5 million people worked for it before it closed in 1943.',
      sources: [wiki('Works_Progress_Administration')],
    }),
    du('flint', '1936-12-30', '1937-02-11', 'Flint sit-down strike', {
      tags: ['labor'],
      notes:
        'Autoworkers occupy General Motors plants in Flint, Michigan, for six weeks, until GM recognizes the **United Auto Workers**.',
      sources: [wiki('Flint_sit-down_strike')],
    }),
    // The land
    du('dust-bowl', '1930-07-01', '1939-10-01', 'The Dust Bowl', {
      tags: ['farm'],
      notes:
        'Drought from the summer of 1930 to the rains of the fall of 1939 (the ends are to the season), in waves in 1934, 1936 and 1939–40, on Plains grassland plowed up for wheat. About 3.5 million people left the Plains states in the 1930s.',
      sources: [wiki('Dust_Bowl')],
    }),
    // The world
    du('bruning', '1930-03-30', '1932-05-30', 'Brüning chancellorship', {
      tags: ['world'],
      notes: 'Two years of austerity by emergency decree, as German unemployment tripled.',
      sources: [wiki('Heinrich_Brüning'), wiki('Great_Depression_in_Germany')],
    }),
    du('moratorium', '1931-07-01', '1932-06-30', 'The Hoover Moratorium', {
      tags: ['world', 'policy'],
      notes:
        'A year without war-debt and reparations payments. At Lausanne in 1932 reparations were all but cancelled.',
      sources: [wiki('Hoover_Moratorium')],
    }),
    du('takahashi-1', '1931-12-13', '1934-07-08', 'Takahashi at the Finance Ministry', {
      tags: ['world'],
      notes:
        'Off gold, a cheaper yen, low interest rates and deficits financed by the Bank of Japan: Japan recovers among the first.',
      sources: [wiki('Takahashi_Korekiyo')],
    }),
    du('takahashi-2', '1934-11-27', '1936-02-26', 'Takahashi at the Finance Ministry again', {
      tags: ['world'],
      notes: 'His second term, ended by his assassination.',
      sources: [wiki('Takahashi_Korekiyo')],
    }),
    du('london-conference', '1933-06-12', '1933-07-27', 'London Economic Conference', {
      tags: ['world'],
      notes:
        'Sixty-six nations meet to stabilize currencies and revive trade, and fail, after Roosevelt rejects a currency agreement.',
      sources: [wiki('London_Economic_Conference')],
    }),
    du('jarrow', '1936-10-05', '1936-10-31', 'The Jarrow March', {
      tags: ['world', 'labor'],
      notes: 'Nearly 300 miles to London, in a month.',
      sources: [wiki('Jarrow_March')],
    }),
    du('war-before-us', '1939-09-01', '1941-12-07', 'War in Europe, before the US enters', {
      tags: ['world'],
      notes:
        'Two years and three months in which orders, then Lend-Lease, put American industry back to work.',
      sources: [wiki('World_War_II'), wiki('United_States_home_front_during_World_War_II')],
    }),
  ];
  const relationships = [
    rel('d:florida', 'miami-hurricane'),
    rel('d:bull-market', 'dow-peak'),
    rel('fisher', 'black-thursday'),
    rel('black-thursday', 'bankers'),
    rel('bankers', 'whitney'),
    rel('whitney', 'black-monday'),
    rel('black-monday', 'black-tuesday'),
    rel('d:dow-slide', 'dow-bottom'),
    rel('d:dow-below', 'dow-regains'),
    rel('caldwell', 'bank-of-us'),
    rel('creditanstalt', 'moratorium-announced'),
    rel('moratorium-announced', 'danat'),
    rel('danat', 'britain-gold'),
    rel('britain-gold', 'fed-raises'),
    rel('smoot-hawley', 'rtaa'),
    rel('bonus-vote', 'bonus-eviction'),
    rel('new-deal-speech', 'election-1932'),
    rel('election-1932', 'fdr-inaugurated'),
    rel('reichstag-1932', 'hitler'),
    rel('michigan-holiday', 'bank-holiday'),
    rel('bank-holiday', 'emergency-banking'),
    rel('emergency-banking', 'fireside-chat'),
    rel('fireside-chat', 'banks-reopen'),
    rel('glass-steagall', 'fdic-begins'),
    rel('gold-6102', 'off-gold'),
    rel('off-gold', 'bombshell'),
    rel('securities-act', 'sec'),
    rel('nira', 'schechter'),
    rel('nira', 'wagner'),
    rel('aaa', 'butler'),
    rel('black-sunday', 'soil-conservation'),
    rel('court-plan', 'west-coast-hotel'),
    rel('reserves-doubled', 'd:recession-1937'),
    rel('d:recession-1937', 'spending-1938'),
    rel('social-security', 'first-check'),
    rel('migrant-mother', 'grapes-book'),
    rel('grapes-book', 'grapes-film'),
    rel('japan-gold', 'd:takahashi-1'),
    rel('lend-lease', 'pearl-harbor'),
    rel('beer', 'repeal'),
  ];
  return {
    format: 'openchronology',
    version: 1,
    title: 'The Great Depression, 1929–1941',
    description:
      "The Great Depression in the United States and around the world: the boom of the 1920s and its cracks, the Crash of 1929 and the market's three-year fall, the banking panics, the European crisis and the end of the gold standard, the Hoover years and the Bonus Army, the Dust Bowl, Roosevelt's New Deal, the court fight and the recession of 1937–38, the culture of the decade, and the war economy that ended it.\n\n**How to read it.** Chapter headings mark the stages. Presidencies, programs, panics, droughts, recessions and the market's slide are durations; everything else is a moment, tagged by thread (market, banking, policy, politics, world, labor, farm, culture, economy). Related moments are linked: a cause and what it led to.\n\n**Dates and figures.** Local days, shown at a fixed UTC−5, New York's standard time, so the Crash's market hours read as Wall Street's. The business cycle follows the NBER's dates (to the month); unemployment rates are the Bureau of Labor Statistics' later annual estimates, placed at mid-year. Where a date or a figure is approximate, its dating note or its notes say so.\n\nA sample timeline built from the cited sources (Wikipedia, the NBER, the Bureau of Labor Statistics, the Federal Reserve's history essays, the National Archives and others); not a definitive history.",
    presentation: {
      mode: 'gregorian',
      unit: '',
      scale: '1/1',
      origin: '0/1',
      version: 1,
      offsetMinutes: -300,
      significantDigits: 6,
    },
    tags: ['history', 'great depression', 'economics', 'united states', 'new deal', 'education'],
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
