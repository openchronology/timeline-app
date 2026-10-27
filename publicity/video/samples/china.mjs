// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// China, from the Neolithic to the founding of the People's Republic in 1949, with two later
// milestones: the history tour's sample (Video 18, Short 15). Well-established dates only, each
// with its Wikipedia article (and a primary text or a UNESCO listing where that is the natural
// reference).
//
// Chronology: before 841 BCE, dates are the conventional figures of the Xia–Shang–Zhou
// Chronology Project (2000): Xia c. 2070–1600, Shang c. 1600–1046, Western Zhou 1046–771 BCE.
// The Xia is the traditional first dynasty; no writing of its own has been found and its
// historicity is debated, which its band (dashed, as presumptive) and note say. 841 BCE, the
// Gonghe Regency, is the first year Chinese history can date year by year (Sima Qian's tables).
// Neolithic cultures carry rounded archaeological ranges.
//
// The line is the proleptic Gregorian calendar with BCE years (1 BCE is astronomical year 0).
// A year known only as a year sits on 1 January of that year. Dates known to the day before
// 1582 are Julian in the sources (converted there from the Chinese calendar): they are converted
// to proleptic Gregorian for the line, and the Julian date is kept with the Historical dates
// plugin. Days are UTC midnight markers, not claims about the hour.
import { at, m, d, rel, plugins, theme, wiki } from './lib.mjs';

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
const pad = (n, w = 2) => String(n).padStart(w, '0');
/** Historical year (−221 for 221 BCE) to astronomical year (−220). */
const astro = (year) => (year < 0 ? year + 1 : year);
const label = (year) => (year < 0 ? `${-year} BCE` : `${year}`);
/** A proleptic Gregorian date: year (negative for BCE), month, day. */
function y(year, month = 1, day = 1) {
  const a = astro(year);
  return at(`${a < 0 ? '-' : '+'}${pad(Math.abs(a), 6)}-${pad(month)}-${pad(day)}T00:00:00Z`);
}
/** A Julian date as the line's time, with the Julian date kept (Historical dates) and the
    conversion stated in the note. */
function julian(year, month, day) {
  const a = astro(year);
  const k = Math.floor((14 - month) / 12);
  const yy = a + 4800 - k;
  const mm = month + 12 * k - 3;
  const jdn = day + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - 32083;
  const seconds = BigInt(jdn - 2440588) * 86400n;
  const g = new Date(Number(seconds) * 1000);
  const gy = g.getUTCFullYear();
  const greg = `${g.getUTCDate()} ${MONTHS[g.getUTCMonth()]} ${label(gy <= 0 ? gy - 1 : gy)}`;
  const original = `${day} ${MONTHS[month - 1]} ${label(year)}`;
  return {
    time: `${seconds}/1`,
    historicalDate: original,
    calendar: 'Julian',
    datePrecision: 'Day, as the sources give it in the Julian calendar',
    line: `Sources give ${original} (Julian); on this line, ${greg} (proleptic Gregorian).`,
  };
}
const P = {
  year: 'Year',
  about: 'Approximate: about this year',
  xszcp: "Approximate: the Xia–Shang–Zhou Chronology Project's conventional date",
  trad: 'Traditional date; the earliest sources disagree',
  arch: 'Approximate: a rounded archaeological date',
  day: 'Day',
  month: 'Month; the day is not certain',
};

const WAR = '#9c3b2a',
  RULER = '#b0862f',
  DYNASTY = '#1f3a5f',
  CULTURE = '#6f7d4a',
  INVENTION = '#2f6b4f',
  THOUGHT = '#6b4a7a',
  REVOLT = '#c46a2c';

export function china(core) {
  /** A moment: `when` is a time string or a julian(...) result; `p` its precision. */
  const ev = (id, when, title, p, o) => {
    if (typeof when === 'string') return m(id, when, title, { datePrecision: p, ...o });
    const { time, line, ...dating } = when;
    return m(id, time, title, { ...dating, ...o, notes: `${o.notes} ${line}` });
  };
  const h = (id, time, title) => m(id, time, title, { headingLevel: 'h2', tags: ['chapter'] });
  const events = [
    h('h-neolithic', y(-5000), 'Neolithic cultures'),
    ev('hemudu', y(-4800), 'Hemudu: rice on the Yangtze', P.arch, {
      tags: ['archaeology'],
      notes:
        'Villages of wooden houses on stilts near the Yangtze delta, with abundant cultivated **rice**, about 5000–4500 BCE: farming in China began along both the Yellow River and the Yangtze.',
      sources: [wiki('Hemudu_culture')],
    }),
    ev('banpo', y(-4500), 'Banpo village', P.arch, {
      tags: ['archaeology'],
      notes:
        'A **Yangshao** village near Xi’an, about 4800–4300 BCE: round houses, a ditch, kilns and painted pottery, some marked with signs.',
      sources: [wiki('Banpo')],
    }),
    ev('taosi', y(-2300), 'Taosi', P.arch, {
      tags: ['archaeology'],
      notes:
        'A large walled settlement of the late **Longshan** period in southern Shanxi, about 2300–1900 BCE, with elite tombs and a structure often read as an observatory.',
      sources: [wiki('Taosi')],
    }),
    h('h-bronze', y(-2070), 'The first dynasties'),
    ev('erlitou-palaces', y(-1700), 'Palaces and bronze at Erlitou', P.arch, {
      tags: ['archaeology'],
      notes:
        'The city at **Erlitou** in the Yiluo valley has palace foundations and the earliest large-scale bronze casting in China, including the first known ritual vessels. Many Chinese archaeologists identify it with the late Xia; without written records, the link is unproven.',
      sources: [wiki('Erlitou_culture')],
    }),
    ev('zhengzhou', y(-1600), 'The Shang at Zhengzhou', P.xszcp, {
      tags: ['dynasty', 'archaeology'],
      notes:
        'Walled cities of the **Erligang** culture at Zhengzhou and Yanshi mark the early Shang. The Chronology Project ties the dynasty’s start, about 1600 BCE, to the Yanshi city.',
      sources: [wiki('Shang_dynasty'), wiki('Xia–Shang–Zhou_Chronology_Project')],
    }),
    ev('pan-geng', y(-1300), 'Pan Geng moves to Yin', P.xszcp, {
      tags: ['dynasty', 'ruler'],
      notes:
        'King **Pan Geng** moves the Shang capital to Yin, near modern Anyang, where it stays until the dynasty’s fall. The Chronology Project dates the move about 1300 BCE.',
      sources: [wiki('Pan_Geng'), wiki('Yinxu')],
    }),
    ev('oracle-bones', y(-1250), 'Oracle bones', P.xszcp, {
      tags: ['writing', 'archaeology'],
      color: THOUGHT,
      notes:
        'Questions to the ancestors, carved on ox shoulder blades and turtle shells at Yin from the reign of **Wu Ding** (from 1250 BCE in the Chronology Project): the earliest substantial body of Chinese writing. Recognized as writing in 1899, they confirmed the Shang kings of the later histories.',
      sources: [wiki('Oracle_bone'), wiki('Oracle_bone_script')],
    }),
    ev('fu-hao', y(-1200), 'Tomb of Fu Hao', P.about, {
      tags: ['archaeology', 'war'],
      notes:
        '**Fu Hao**, a consort of Wu Ding, led armies according to the oracle bones. Her tomb at Yin, found undisturbed in 1976, held well over a thousand objects of jade, bronze and bone, and thousands of cowry shells. She died about 1200 BCE.',
      sources: [wiki('Fu_Hao'), 'https://whc.unesco.org/en/list/1114/'],
    }),
    ev('sanxingdui', y(-1100), 'Sanxingdui', P.arch, {
      tags: ['archaeology'],
      notes:
        'Pits in Sichuan with bronze masks, standing figures and gold, dated about 1200–1000 BCE (placed here mid-range): a bronze culture contemporary with the late Shang but unlike it, with no writing found.',
      sources: [wiki('Sanxingdui')],
    }),
    ev('muye', y(-1046), 'Battle of Muye', P.xszcp, {
      tags: ['war', 'dynasty'],
      color: WAR,
      notes:
        'King **Wu of Zhou** defeats Di Xin, the last Shang king, and the Zhou claim the **Mandate of Heaven**. The Chronology Project dates it to 1046 BCE (20 January); older chronologies proposed dozens of dates, from 1130 to 1018 BCE, 1122 and 1027 the best known.',
      sources: [wiki('Battle_of_Muye'), wiki('Xia–Shang–Zhou_Chronology_Project')],
    }),
    h('h-zhou', y(-1000), 'Zhou'),
    ev('gonghe', y(-841), '841 BCE: the first dated year', P.year, {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        'After King Li is driven out, the **Gonghe Regency** governs until 828 BCE. Sima Qian’s year-by-year tables begin here: 841 BCE is the earliest year of Chinese history dated year by year. (The Cambridge History of Ancient China starts the regency in 842.)',
      sources: [wiki('Gonghe_Regency'), 'https://ctext.org/shiji'],
    }),
    ev('haojing', y(-771), 'Haojing falls', P.year, {
      tags: ['war', 'dynasty'],
      color: WAR,
      notes:
        'Rebels and the Quanrong sack the western capital and kill **King You**. The court moves east to Luoyang, and the Western Zhou gives way to the Eastern.',
      sources: [wiki('King_You_of_Zhou')],
    }),
    ev('chunqiu', y(-722), 'Spring and Autumn Annals begin', P.year, {
      tags: ['writing'],
      color: THOUGHT,
      notes:
        'The chronicle of the state of **Lu** records its years from 722 to 481 BCE, and gives the period its name. Tradition says Confucius edited it.',
      sources: [wiki('Spring_and_Autumn_Annals')],
    }),
    ev('confucius', y(-551), 'Confucius born', P.trad, {
      tags: ['thought'],
      color: THOUGHT,
      notes:
        '**Kong Qiu**, known as Kongzi or **Confucius**, is born in Lu, in 551 BCE by the usual reckoning. He taught that order begins with personal virtue, ritual and right relationships.',
      sources: [wiki('Confucius')],
    }),
    ev('laozi', y(-571), 'Laozi and the Daodejing', P.trad, {
      tags: ['thought', 'writing'],
      color: THOUGHT,
      notes:
        'Tradition makes **Laozi** an older contemporary of Confucius, born, by one account, in 571 BCE, and the author of the **Daodejing**, the founding text of Daoism. Whether he lived is debated; the oldest manuscript, from Guodian, is from about 300 BCE.',
      sources: [wiki('Laozi'), wiki('Tao_Te_Ching'), 'https://ctext.org/dao-de-jing'],
    }),
    ev('sunzi', y(-500), 'Sunzi, The Art of War', P.trad, {
      tags: ['thought', 'writing', 'war'],
      color: THOUGHT,
      notes:
        'Attributed to **Sun Wu (Sunzi)**, a general of the state of Wu around 500 BCE. Most scholars think the text took its form in the Warring States period.',
      sources: [wiki('The_Art_of_War'), 'https://ctext.org/art-of-war'],
    }),
    ev('confucius-dies', y(-479), 'Confucius dies', P.year, {
      tags: ['thought'],
      color: THOUGHT,
      notes:
        'He dies in Lu in 479 BCE, his teaching known only to his followers; it becomes state orthodoxy under the Han, three centuries later.',
      sources: [wiki('Confucius')],
    }),
    ev('analects', y(-400), 'The Analects', P.about, {
      tags: ['thought', 'writing'],
      color: THOUGHT,
      notes:
        'The **Analects** (Lunyu), sayings of Confucius and his disciples, compiled by his followers over the generations after his death and settled in its present form under the Han.',
      sources: [wiki('Analects'), 'https://ctext.org/analects'],
    }),
    ev('jin-partition', y(-403), 'Partition of Jin', P.year, {
      tags: ['dynasty', 'war'],
      notes:
        'The Zhou king recognizes **Han, Zhao and Wei**, carved out of the state of Jin, as states. Sima Guang begins his history of the Warring States here; Sima Qian uses 475 BCE.',
      sources: [wiki('Partition_of_Jin')],
    }),
    ev('mencius', y(-372), 'Mencius born', P.trad, {
      tags: ['thought'],
      color: THOUGHT,
      notes:
        '**Mengzi (Mencius)**, about 372–289 BCE, the most influential follower of Confucius, argued that human nature is good.',
      sources: [wiki('Mencius'), 'https://ctext.org/mengzi'],
    }),
    ev('shang-yang', y(-356), 'Shang Yang’s reforms in Qin', P.year, {
      tags: ['thought', 'dynasty'],
      notes:
        'Under Duke Xiao, **Shang Yang** remakes Qin: land for farmers, ranks for soldiers, harsh and uniform laws. The **Legalist** state he built went on to conquer the others.',
      sources: [wiki('Shang_Yang')],
    }),
    ev('dujiangyan', y(-256, 7, 1), 'Dujiangyan', P.about, {
      tags: ['invention'],
      color: INVENTION,
      notes:
        'The Qin governor **Li Bing** splits the Min River in Sichuan without a dam, to irrigate the Chengdu plain and tame its floods, about 256 BCE. It still works.',
      sources: [wiki('Dujiangyan')],
    }),
    ev('changping', y(-260), 'Battle of Changping', P.year, {
      tags: ['war'],
      color: WAR,
      notes:
        'Qin destroys the army of **Zhao**, its strongest rival; the histories say the surrendered soldiers were killed.',
      sources: [wiki('Battle_of_Changping')],
    }),
    ev('zhou-ends', y(-256), 'The last Zhou king', P.year, {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        'Qin takes the royal domain and King Nan dies: the Zhou, the longest-lasting dynasty, ends after about 790 years.',
      sources: [wiki('Zhou_dynasty')],
    }),
    ev('ying-zheng', y(-246), 'Ying Zheng becomes king of Qin', P.year, {
      tags: ['ruler'],
      color: RULER,
      notes: 'The future First Emperor comes to the Qin throne as a boy of about thirteen.',
      sources: [wiki('Qin_Shi_Huang')],
    }),
    h('h-empire', y(-230), 'Qin and Han: the empire'),
    ev('unification', y(-221), 'Qin unifies China', P.year, {
      tags: ['dynasty', 'ruler', 'war'],
      color: DYNASTY,
      notes:
        'With Qi, the last of the six states, conquered, Ying Zheng takes a new title: **Qin Shi Huang, the First Emperor**. Qin standardizes the script, weights and measures, coins and axle widths, and governs through commanderies instead of fiefs.',
      sources: [wiki("Qin's_wars_of_unification"), wiki('Qin_Shi_Huang')],
    }),
    ev('wall-qin', y(-214), 'Qin joins the northern walls', P.about, {
      tags: ['war', 'invention'],
      notes:
        'General **Meng Tian** drives back the Xiongnu and links earlier states’ walls into one northern line, of rammed earth; little of it survives.',
      sources: [wiki('Great_Wall_of_China'), 'https://whc.unesco.org/en/list/438/'],
    }),
    ev('book-burning', y(-213), 'Burning of the books', P.year, {
      tags: ['thought', 'writing'],
      color: THOUGHT,
      notes:
        'On the advice of **Li Si**, histories of the other states and private copies of the classics are ordered burned. The story that 460 scholars were buried alive the next year comes from later sources and is questioned.',
      sources: [wiki('Burning_of_books_and_burying_of_scholars')],
    }),
    ev('first-emperor-dies', y(-210), 'The First Emperor dies', P.year, {
      tags: ['ruler'],
      color: RULER,
      notes:
        '**Qin Shi Huang** dies on a tour of the east in 210 BCE. His son’s reign is short and the empire collapses within four years.',
      sources: [wiki('Qin_Shi_Huang')],
    }),
    ev('terracotta', y(-210, 7, 1), 'The Terracotta Army', P.about, {
      tags: ['archaeology', 'ruler'],
      notes:
        'Thousands of life-size clay soldiers, horses and chariots buried in pits east of the **First Emperor’s** tomb near Xi’an. Farmers digging a well found them in 1974.',
      sources: [wiki('Terracotta_Army'), 'https://whc.unesco.org/en/list/441/'],
    }),
    ev('dazexiang', y(-209), 'Chen Sheng and Wu Guang rise', P.year, {
      tags: ['revolution', 'war'],
      color: REVOLT,
      notes:
        'Conscripts led by **Chen Sheng** and **Wu Guang**, late for duty and facing death under Qin law, rebel: the first of the uprisings that bring Qin down.',
      sources: [wiki('Chen_Sheng_and_Wu_Guang_uprising')],
    }),
    ev('gaixia', y(-202), 'Battle of Gaixia', P.year, {
      tags: ['war', 'dynasty'],
      color: WAR,
      notes:
        '**Liu Bang** defeats his rival Xiang Yu and becomes **Emperor Gaozu**, founder of the Han.',
      sources: [wiki('Battle_of_Gaixia'), wiki('Emperor_Gaozu_of_Han')],
    }),
    ev('zhang-qian', y(-138), 'Zhang Qian goes west', P.year, {
      tags: ['contact'],
      notes:
        'Emperor Wu sends **Zhang Qian** to seek allies against the Xiongnu. Captured for ten years, he reaches Central Asia and returns about 126 BCE with reports that open the **Silk Road** to Han trade and armies.',
      sources: [wiki('Zhang_Qian'), wiki('Silk_Road')],
    }),
    ev('taixue', y(-124), 'The Imperial Academy', P.year, {
      tags: ['thought'],
      color: THOUGHT,
      notes:
        'Emperor Wu founds the **Taixue** to train officials in the Confucian classics, which become the state’s learning for the next two thousand years.',
      sources: [wiki('Taixue'), wiki('Emperor_Wu_of_Han')],
    }),
    ev('shiji', y(-91), 'Records of the Grand Historian', P.about, {
      tags: ['writing'],
      color: THOUGHT,
      notes:
        '**Sima Qian** completes the **Shiji**, about 91 BCE: a history of some two thousand years from the Yellow Emperor to his own time, in annals, tables, treatises and biographies, the model for every later dynastic history.',
      sources: [wiki('Shiji'), 'https://ctext.org/shiji'],
    }),
    ev('wang-mang', y(9), 'Wang Mang’s Xin dynasty', P.year, {
      tags: ['dynasty', 'ruler'],
      color: DYNASTY,
      notes:
        'The regent **Wang Mang** takes the throne and proclaims the Xin dynasty, dividing the Han into Western and Eastern. Floods and revolts end it in 23 CE.',
      sources: [wiki('Xin_dynasty'), wiki('Wang_Mang')],
    }),
    ev('eastern-han', y(25), 'The Han restored', P.year, {
      tags: ['dynasty', 'ruler'],
      color: DYNASTY,
      notes: '**Liu Xiu (Emperor Guangwu)** restores the Han, with its capital at Luoyang.',
      sources: [wiki('Emperor_Guangwu_of_Han')],
    }),
    ev('white-horse', y(68), 'White Horse Temple', P.trad, {
      tags: ['thought', 'contact'],
      color: THOUGHT,
      notes:
        'By tradition the first Buddhist temple in China, founded at Luoyang under Emperor Ming. Buddhism had arrived along the trade routes from Central Asia.',
      sources: [wiki('White_Horse_Temple')],
    }),
    ev('paper', y(105), 'Cai Lun’s paper', P.year, {
      tags: ['invention'],
      color: INVENTION,
      notes:
        'The court official **Cai Lun** presents his method of making paper from bark, hemp, rags and fishing nets. Earlier paper has been found; he improved and spread a process already under way.',
      sources: [wiki('Cai_Lun'), wiki('Paper')],
    }),
    ev('seismoscope', y(132), 'Zhang Heng’s seismoscope', P.year, {
      tags: ['invention'],
      color: INVENTION,
      notes:
        'The astronomer **Zhang Heng** presents a bronze vessel that dropped a ball from a dragon’s mouth to show the direction of a distant earthquake.',
      sources: [wiki('Zhang_Heng')],
    }),
    ev('yellow-turbans', y(184), 'Yellow Turban Rebellion', P.year, {
      tags: ['revolution', 'war'],
      color: REVOLT,
      notes:
        'A Daoist movement led by **Zhang Jue** rises across the north. It is put down, but the generals who did it become the warlords who divide the Han.',
      sources: [wiki('Yellow_Turban_Rebellion')],
    }),
    ev('red-cliffs', y(208), 'Battle of Red Cliffs', P.year, {
      tags: ['war'],
      color: WAR,
      notes:
        'In the winter of 208–209, **Sun Quan** and **Liu Bei** defeat **Cao Cao**’s fleet on the Yangtze, ending his hope of uniting China and setting the shape of the Three Kingdoms.',
      sources: [wiki('Battle_of_Red_Cliffs')],
    }),
    h('h-division', y(220), 'Three Kingdoms and division'),
    ev('han-ends', julian(220, 12, 11), 'The Han ends', P.day, {
      tags: ['dynasty', 'ruler'],
      color: DYNASTY,
      notes:
        '**Cao Pi**, Cao Cao’s son, makes the last Han emperor abdicate and founds **Wei**; Shu Han and Wu follow, the Three Kingdoms.',
      sources: [wiki('Cao_Pi'), wiki('End_of_the_Han_dynasty')],
    }),
    ev('jin-unites', y(280), 'Jin reunites China', P.year, {
      tags: ['dynasty', 'war'],
      color: DYNASTY,
      notes: 'The Jin, which had replaced Wei, conquers **Wu**, the last of the three kingdoms.',
      sources: [wiki('Conquest_of_Wu_by_Jin')],
    }),
    ev('yongjia', y(311), 'Luoyang sacked', P.year, {
      tags: ['war'],
      color: WAR,
      notes:
        'Xiongnu forces of the Han-Zhao state take the Jin capital and the emperor (the **Disaster of Yongjia**). The north splits into kingdoms; the Jin court survives in the south, at Jiankang (Nanjing).',
      sources: [wiki('Disaster_of_Yongjia')],
    }),
    ev('lanting', y(353), 'The Orchid Pavilion Preface', P.year, {
      tags: ['writing'],
      color: THOUGHT,
      notes:
        '**Wang Xizhi** writes the preface to poems from a gathering at the Orchid Pavilion: the most celebrated work of Chinese calligraphy, known now from copies.',
      sources: [wiki('Lantingji_Xu')],
    }),
    ev('fei', y(383), 'Battle of the Fei River', P.year, {
      tags: ['war'],
      color: WAR,
      notes:
        'The Eastern Jin defeats the much larger army of the **Former Qin**, which had united the north; the division between north and south holds for two more centuries.',
      sources: [wiki('Battle_of_Fei_River')],
    }),
    ev('faxian', y(399), 'Faxian sets out for India', P.year, {
      tags: ['contact', 'thought'],
      notes:
        'The monk **Faxian** walks to India for Buddhist texts and returns by sea in 412; his account is one of the oldest travel records of South Asia.',
      sources: [wiki('Faxian')],
    }),
    ev('yungang', y(460), 'Yungang grottoes', P.about, {
      tags: ['thought', 'archaeology'],
      notes:
        'The **Northern Wei** begins carving Buddhist cave temples and colossal statues into the cliffs near its capital, Pingcheng (Datong), from about 460.',
      sources: [wiki('Yungang_Grottoes')],
    }),
    ev('xiaowen', y(494), 'Northern Wei moves to Luoyang', P.year, {
      tags: ['ruler', 'dynasty'],
      color: RULER,
      notes:
        '**Emperor Xiaowen** moves the Xianbei court to Luoyang and has it adopt Chinese dress, language and surnames.',
      sources: [wiki('Emperor_Xiaowen_of_Northern_Wei')],
    }),
    h('h-sui-tang', y(581), 'Sui and Tang'),
    ev('sui', julian(581, 3, 4), 'Sui founded', P.day, {
      tags: ['dynasty', 'ruler'],
      color: DYNASTY,
      notes:
        '**Yang Jian (Emperor Wen)** takes the throne of the Northern Zhou as the first Sui emperor.',
      sources: [wiki('Emperor_Wen_of_Sui')],
    }),
    ev('sui-unites', y(589), 'Sui reunites China', P.year, {
      tags: ['dynasty', 'war'],
      color: DYNASTY,
      notes:
        'Sui armies take **Jiankang**, capital of the southern Chen, in the spring of 589: China is one state again after nearly three centuries.',
      sources: [wiki('Sui_dynasty')],
    }),
    ev('grand-canal', y(605), 'The Grand Canal', P.year, {
      tags: ['invention', 'dynasty'],
      color: INVENTION,
      notes:
        '**Emperor Yang** begins joining older canals into a waterway from the Yangtze to the Yellow River and on to the north, finished about 610, so the south’s grain could feed the capital and the armies. Extended and rebuilt, it still runs from Beijing to Hangzhou.',
      sources: [wiki('Grand_Canal_(China)'), 'https://whc.unesco.org/en/list/1443/'],
    }),
    ev('exams', y(605, 7, 1), 'Examinations for office', P.trad, {
      tags: ['thought'],
      color: THOUGHT,
      notes:
        'The Sui recruits officials by written **examination**, the jinshi degree traditionally from 605. Under the Tang and especially the Song the exams become the road to office, until 1905.',
      sources: [wiki('Imperial_examination')],
    }),
    ev('tang', julian(618, 6, 18), 'Tang founded', P.day, {
      tags: ['dynasty', 'ruler'],
      color: DYNASTY,
      notes:
        'After Emperor Yang of Sui is murdered, **Li Yuan (Emperor Gaozu)** declares himself emperor of the Tang at Chang’an.',
      sources: [wiki('Tang_dynasty'), wiki('Emperor_Gaozu_of_Tang')],
    }),
    ev('xuanwu', julian(626, 7, 2), 'Xuanwu Gate incident', P.day, {
      tags: ['ruler'],
      color: RULER,
      notes:
        '**Li Shimin** kills two of his brothers at a palace gate; within weeks his father abdicates and he becomes **Emperor Taizong**.',
      sources: [wiki('Xuanwu_Gate_Incident')],
    }),
    ev('xuanzang', y(645), 'Xuanzang returns from India', P.year, {
      tags: ['contact', 'thought'],
      notes:
        'The monk **Xuanzang** comes back to Chang’an after sixteen years with hundreds of Buddhist texts to translate; his travel record is a major source for seventh-century India.',
      sources: [wiki('Xuanzang')],
    }),
    ev('wu-zetian', y(690), 'Wu Zetian takes the throne', P.year, {
      tags: ['ruler', 'dynasty'],
      color: RULER,
      notes:
        'Already the real power for decades, **Wu Zetian** proclaims her own Zhou dynasty (690–705): the only woman to rule China as emperor in her own name. She is deposed in 705, at about eighty.',
      sources: [wiki('Wu_Zetian')],
    }),
    ev('li-du', y(744), 'Li Bai meets Du Fu', P.year, {
      tags: ['writing'],
      color: THOUGHT,
      notes:
        'The two greatest Tang poets, **Li Bai** and **Du Fu**, meet in 744 and travel together; Du Fu wrote poems to Li Bai for the rest of his life.',
      sources: [wiki('Li_Bai'), wiki('Du_Fu')],
    }),
    ev('talas', y(751), 'Battle of Talas', P.year, {
      tags: ['war', 'contact'],
      color: WAR,
      notes:
        'An Abbasid army defeats a Tang force in Central Asia, near the Talas River; Tang expansion westward stops.',
      sources: [wiki('Battle_of_Talas')],
    }),
    ev('an-lushan', julian(755, 12, 16), 'An Lushan rebels', P.day, {
      tags: ['war', 'revolution'],
      color: REVOLT,
      notes:
        'The frontier general **An Lushan** turns his armies on the court; both capitals fall. The war lasts until 763 and the Tang never recovers its central power.',
      sources: [wiki('An_Lushan_rebellion')],
    }),
    ev('huichang', y(845), 'Huichang persecution', P.year, {
      tags: ['thought'],
      color: THOUGHT,
      notes:
        '**Emperor Wuzong** closes thousands of Buddhist monasteries and returns hundreds of thousands of monks and nuns to lay life.',
      sources: [wiki('Huichang_persecution_of_Buddhism')],
    }),
    ev('diamond-sutra', julian(868, 5, 11), 'The Diamond Sutra printed', P.day, {
      tags: ['invention', 'writing'],
      color: INVENTION,
      notes:
        'A woodblock-printed scroll of the **Diamond Sutra**, found in a sealed cave at **Dunhuang**: the oldest printed book that carries its date, the 15th day of the 4th month of the 9th year of Xiantong. It is now in the British Library.',
      sources: [wiki('Diamond_Sutra')],
    }),
    ev('tang-ends', y(907), 'The Tang ends', P.year, {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        'The warlord **Zhu Wen** deposes the last Tang emperor and founds the Later Liang, the first of the Five Dynasties.',
      sources: [wiki('Tang_dynasty')],
    }),
    h('h-song', y(960), 'Song'),
    ev('song', julian(960, 2, 4), 'Song founded', P.day, {
      tags: ['dynasty', 'ruler'],
      color: DYNASTY,
      notes:
        'The general **Zhao Kuangyin** is acclaimed emperor by his troops at Chenqiao and founds the Song as **Emperor Taizu**.',
      sources: [wiki('Emperor_Taizu_of_Song')],
    }),
    ev('jiaozi', y(1023), 'Paper money', P.year, {
      tags: ['invention'],
      color: INVENTION,
      notes:
        'In Sichuan, after merchant houses issuing **jiaozi** notes fail, the Song state takes over: the first paper money issued by a government.',
      sources: [wiki('Jiaozi_(currency)')],
    }),
    ev('movable-type', y(1040), 'Bi Sheng’s movable type', P.about, {
      tags: ['invention'],
      color: INVENTION,
      notes:
        'The artisan **Bi Sheng** prints with movable type of baked clay, between 1041 and 1048; Shen Kuo’s Dream Pool Essays describe it.',
      sources: [wiki('Bi_Sheng'), wiki('Movable_type')],
    }),
    ev('gunpowder', y(1044), 'Gunpowder formulas written down', P.year, {
      tags: ['invention', 'war'],
      color: INVENTION,
      notes:
        'The military compendium **Wujing Zongyao**, finished in 1044, gives the earliest known written formulas for **gunpowder**, saltpetre, sulphur and charcoal, for bombs and incendiaries.',
      sources: [wiki('Wujing_Zongyao'), wiki('Gunpowder')],
    }),
    ev('wang-anshi', y(1069), 'Wang Anshi’s New Policies', P.year, {
      tags: ['thought', 'dynasty'],
      notes:
        'The chancellor **Wang Anshi** begins reforms of farm loans, taxes, militia and the exams; they divide the court for decades.',
      sources: [wiki('Wang_Anshi')],
    }),
    ev('zizhi', y(1084), 'Comprehensive Mirror', P.year, {
      tags: ['writing'],
      color: THOUGHT,
      notes:
        '**Sima Guang** presents the **Zizhi Tongjian**, a year-by-year history of China from 403 BCE to 959 CE, to the throne.',
      sources: [wiki('Zizhi_Tongjian')],
    }),
    ev('compass', y(1088), 'The magnetic needle', P.year, {
      tags: ['invention', 'writing'],
      color: INVENTION,
      notes:
        "**Shen Kuo**'s **Dream Pool Essays** describe a magnetized needle that points south, and note that it points slightly east of true south: the first record of magnetic declination. By 1117 a source records ships navigating by compass.",
      sources: [wiki('Dream_Pool_Essays'), wiki('Shen_Kuo'), wiki('Compass')],
    }),
    ev('jingkang', y(1127), 'Jingkang incident', P.year, {
      tags: ['war', 'dynasty'],
      color: WAR,
      notes:
        'The **Jurchen Jin** take Kaifeng and carry off two Song emperors. A prince re-founds the court in the south, at Hangzhou: the Southern Song.',
      sources: [wiki('Jingkang_incident')],
    }),
    ev('zhu-xi', y(1190), 'Zhu Xi’s Four Books', P.year, {
      tags: ['thought', 'writing'],
      color: THOUGHT,
      notes:
        '**Zhu Xi** publishes the Analects, Mencius, the Great Learning and the Doctrine of the Mean together with his commentaries: Neo-Confucianism’s canon, set for the exams from 1313.',
      sources: [wiki('Zhu_Xi'), wiki('Four_Books_and_Five_Classics')],
    }),
    h('h-yuan', y(1206), 'The Mongols: Yuan'),
    ev('zhongdu', y(1215), 'Mongols take Zhongdu', P.year, {
      tags: ['war'],
      color: WAR,
      notes: '**Genghis Khan**’s armies capture the Jin capital, Zhongdu, on the site of Beijing.',
      sources: [wiki('Sieges_of_Zhongdu')],
    }),
    ev('yuan', y(1271), 'Kublai proclaims the Yuan', P.year, {
      tags: ['dynasty', 'ruler'],
      color: DYNASTY,
      notes:
        '**Kublai Khan**, grandson of Genghis, gives his realm the Chinese dynastic name **Great Yuan**, ruling from Dadu (Khanbaliq), today’s Beijing.',
      sources: [wiki('Yuan_dynasty'), wiki('Kublai_Khan')],
    }),
    ev('yamen', julian(1279, 3, 19), 'Battle of Yamen', P.day, {
      tags: ['war', 'dynasty'],
      color: WAR,
      notes:
        'The Yuan fleet destroys the last Song forces off Guangdong; the minister **Lu Xiufu** leaps into the sea with the boy emperor. The Song ends and the Mongols rule all of China.',
      sources: [wiki('Battle_of_Yamen')],
    }),
    ev('red-turbans', y(1351), 'Red Turban Rebellion', P.year, {
      tags: ['revolution', 'war'],
      color: REVOLT,
      notes:
        'Rebellions spread after floods and forced labour on the Yellow River; from them rises **Zhu Yuanzhang**, a former monk.',
      sources: [wiki('Red_Turban_Rebellions')],
    }),
    ev('poyang', y(1363), 'Battle of Lake Poyang', P.month, {
      tags: ['war'],
      color: WAR,
      notes:
        'Zhu Yuanzhang’s fleet defeats **Chen Youliang**’s on China’s largest freshwater lake, in late summer 1363, one of the largest naval battles in history.',
      sources: [wiki('Battle_of_Lake_Poyang')],
    }),
    h('h-ming', y(1368), 'Ming'),
    ev('ming', julian(1368, 1, 23), 'Ming founded', P.day, {
      tags: ['dynasty', 'ruler'],
      color: DYNASTY,
      notes:
        '**Zhu Yuanzhang** proclaims the Ming at Nanjing as the **Hongwu Emperor**; that September his armies take Dadu and the Yuan court flees north.',
      sources: [wiki('Hongwu_Emperor')],
    }),
    ev('yongle', julian(1402, 7, 17), 'The Yongle Emperor', P.day, {
      tags: ['ruler', 'war'],
      color: RULER,
      notes:
        '**Zhu Di**, Prince of Yan, takes Nanjing from his nephew after a three-year civil war and becomes the **Yongle Emperor**.',
      sources: [wiki('Yongle_Emperor')],
    }),
    ev('zheng-he-1', julian(1405, 7, 11), 'Zheng He’s first voyage', P.day, {
      tags: ['contact'],
      notes:
        'The eunuch admiral **Zheng He** sails with some 317 ships and nearly 28,000 men, the first of seven voyages that reach Southeast Asia, India, Arabia and the coast of East Africa.',
      sources: [wiki('Zheng_He'), wiki('Ming_treasure_voyages')],
    }),
    ev('encyclopedia', y(1408), 'Yongle Encyclopedia', P.year, {
      tags: ['writing'],
      color: THOUGHT,
      notes:
        'More than two thousand scholars finish the **Yongle Dadian**, 22,937 chapters in 11,095 volumes; only about 3.5 per cent survives.',
      sources: [wiki('Yongle_Encyclopedia')],
    }),
    ev('forbidden-city', julian(1420, 10, 28), 'Beijing and the Forbidden City', P.day, {
      tags: ['ruler', 'archaeology'],
      color: RULER,
      notes:
        'Yongle declares **Beijing** the principal capital; the palace he built there, the **Forbidden City**, houses the emperors until 1912.',
      sources: [wiki('Forbidden_City'), 'https://whc.unesco.org/en/list/439/'],
    }),
    ev('zheng-he-7', y(1431), 'Zheng He’s last voyage', P.year, {
      tags: ['contact'],
      notes:
        'The seventh voyage sails in 1431 and returns in 1433; the court then ends the expeditions, and their records are later lost or destroyed.',
      sources: [wiki('Ming_treasure_voyages')],
    }),
    ev('tumu', julian(1449, 9, 1), 'Tumu crisis', P.day, {
      tags: ['war', 'ruler'],
      color: WAR,
      notes:
        'Oirat Mongols under **Esen** rout a Ming army and capture the **Zhengtong Emperor**. The Ming turns from campaigns on the steppe to building walls.',
      sources: [wiki('Tumu_Crisis')],
    }),
    ev('ricci', y(1601), 'Matteo Ricci at the Ming court', P.year, {
      tags: ['contact', 'thought'],
      notes:
        'The Jesuit **Matteo Ricci** is invited to advise the Wanli court, the first Westerner admitted to the Forbidden City (he never met the emperor). In 1607 he and **Xu Guangqi** publish Euclid in Chinese.',
      sources: [wiki('Matteo_Ricci')],
    }),
    ev('li-zicheng', y(1644, 4, 25), 'Li Zicheng takes Beijing', P.day, {
      tags: ['revolution', 'war', 'dynasty'],
      color: REVOLT,
      notes:
        'The rebel **Li Zicheng** enters Beijing; the last Ming emperor, **Chongzhen**, hangs himself on the hill behind the palace.',
      sources: [wiki('Li_Zicheng'), wiki('Chongzhen_Emperor')],
    }),
    ev('shanhai', y(1644, 5, 27), 'Battle of Shanhai Pass', P.day, {
      tags: ['war'],
      color: WAR,
      notes:
        'The Ming general **Wu Sangui** opens the pass at the eastern end of the Great Wall to the Manchus, and together they defeat Li Zicheng.',
      sources: [wiki('Battle_of_Shanhai_Pass')],
    }),
    h('h-qing', y(1644), 'Qing'),
    ev('qing-beijing', y(1644, 6, 6), 'The Qing enter Beijing', P.day, {
      tags: ['dynasty', 'war'],
      color: DYNASTY,
      notes:
        'Manchu forces under the regent **Dorgon** occupy Beijing and move the Qing court there; the conquest of the south takes decades.',
      sources: [wiki('Transition_from_Ming_to_Qing')],
    }),
    ev('nerchinsk', y(1689, 8, 27), 'Treaty of Nerchinsk', P.day, {
      tags: ['contact'],
      notes:
        'Kangxi’s envoys and Russia’s fix the border along the Amur watershed, with Jesuits interpreting in Latin: China’s first treaty with a European state.',
      sources: [wiki('Treaty_of_Nerchinsk')],
    }),
    ev('kangxi-dictionary', y(1716), 'Kangxi Dictionary', P.year, {
      tags: ['writing'],
      color: THOUGHT,
      notes:
        'Compiled at the emperor’s order, it lists some 47,000 characters by the 214 radicals still used to order Chinese dictionaries.',
      sources: [wiki('Kangxi_Dictionary')],
    }),
    ev('siku', y(1782), 'The Complete Library', P.year, {
      tags: ['writing'],
      color: THOUGHT,
      notes:
        'The first copy of the **Siku Quanshu**, Qianlong’s collection of some 3,500 works in about 36,000 volumes, is finished; the project also banned and destroyed thousands of books.',
      sources: [wiki('Siku_Quanshu')],
    }),
    ev('red-chamber', y(1791), 'Dream of the Red Chamber printed', P.year, {
      tags: ['writing'],
      color: THOUGHT,
      notes:
        '**Cao Xueqin**’s novel of a great family’s decline, circulated in manuscript, is printed in 120 chapters, the last forty completed by others.',
      sources: [wiki('Dream_of_the_Red_Chamber')],
    }),
    ev('macartney', y(1793, 9, 14), 'Macartney meets Qianlong', P.day, {
      tags: ['contact'],
      notes:
        'Britain’s first embassy, under **Lord Macartney**, is received at Chengde; the emperor refuses its requests for trade and a resident ambassador.',
      sources: [wiki('Macartney_Embassy')],
    }),
    ev('humen', y(1839, 6, 3), 'Lin Zexu destroys opium', P.day, {
      tags: ['contact', 'war'],
      notes:
        'The commissioner **Lin Zexu** begins destroying about 1,000 tonnes of opium seized from foreign merchants at **Humen**, Canton; Britain answers with war.',
      sources: [wiki('Destruction_of_opium_at_Humen')],
    }),
    ev('nanking', y(1842, 8, 29), 'Treaty of Nanking', P.day, {
      tags: ['war', 'contact'],
      color: WAR,
      notes:
        'The first of the **unequal treaties**: China cedes **Hong Kong Island** to Britain, opens five ports and pays an indemnity.',
      sources: [wiki('Treaty_of_Nanking')],
    }),
    ev('jintian', y(1851, 1, 11), 'Jintian uprising', P.day, {
      tags: ['revolution', 'war'],
      color: REVOLT,
      notes:
        '**Hong Xiuquan**, who believed himself the younger brother of Jesus, launches the **Taiping Heavenly Kingdom** at Jintian, Guangxi.',
      sources: [wiki('Jintian_Uprising'), wiki('Hong_Xiuquan')],
    }),
    ev('tianjing', y(1853, 3, 19), 'Taipings take Nanjing', P.day, {
      tags: ['revolution', 'war'],
      color: REVOLT,
      notes:
        'The Taipings capture Nanjing and make it their capital, **Tianjing**, for eleven years.',
      sources: [wiki('Taiping_Rebellion')],
    }),
    ev('summer-palace', y(1860, 10, 18), 'Old Summer Palace burned', P.day, {
      tags: ['war'],
      color: WAR,
      notes:
        'British and French troops loot and then burn the **Yuanmingyuan**, the Qing emperors’ garden palace outside Beijing.',
      sources: [wiki('Old_Summer_Palace')],
    }),
    ev('nanjing-retaken', y(1864, 7, 19), 'Nanjing retaken', P.day, {
      tags: ['war', 'revolution'],
      color: WAR,
      notes:
        '**Zeng Guofan**’s Xiang Army takes Tianjing, a few weeks after Hong Xiuquan’s death; the Taiping war had cost some 20–30 million lives.',
      sources: [wiki('Third_Battle_of_Nanjing')],
    }),
    ev('shimonoseki', y(1895, 4, 17), 'Treaty of Shimonoseki', P.day, {
      tags: ['war'],
      color: WAR,
      notes:
        'Defeated in the **First Sino-Japanese War** (1894–95), China gives up Korea as a tributary and cedes Taiwan and the Penghu islands to Japan.',
      sources: [wiki('Treaty_of_Shimonoseki'), wiki('First_Sino-Japanese_War')],
    }),
    ev('hundred-days', y(1898, 6, 11), 'Hundred Days’ Reform', P.day, {
      tags: ['thought', 'ruler'],
      notes:
        'The **Guangxu Emperor**, advised by **Kang Youwei**, decrees reforms of schools, the exams and the army. On 21 September **Cixi** ends them and confines him.',
      sources: [wiki("Hundred_Days'_Reform")],
    }),
    ev('boxer-protocol', y(1901, 9, 7), 'Boxer Protocol', P.day, {
      tags: ['war', 'contact'],
      color: WAR,
      notes:
        'After eight foreign armies relieve the legations in Beijing, China agrees to pay an indemnity of 450 million taels.',
      sources: [wiki('Boxer_Protocol')],
    }),
    ev('exams-end', y(1905, 9, 2), 'Examinations abolished', P.day, {
      tags: ['thought'],
      color: THOUGHT,
      notes:
        'An edict ends the **imperial examinations**, about thirteen centuries after the Sui began them.',
      sources: [wiki('Imperial_examination')],
    }),
    ev('puyi', y(1908, 12, 2), 'Puyi enthroned', P.day, {
      tags: ['ruler'],
      color: RULER,
      notes:
        'Two weeks after Cixi’s death, the two-year-old **Puyi** becomes the Xuantong Emperor, the last emperor of China.',
      sources: [wiki('Puyi')],
    }),
    h('h-republic', y(1911), 'Revolution and Republic'),
    ev('wuchang', y(1911, 10, 10), 'Wuchang uprising', P.day, {
      tags: ['revolution'],
      color: REVOLT,
      notes:
        'Army units in Wuchang mutiny; province after province declares against the Qing: the **1911 (Xinhai) Revolution**.',
      sources: [wiki('Wuchang_Uprising'), wiki('1911_Revolution')],
    }),
    ev('roc', y(1912, 1, 1), 'Republic of China proclaimed', P.day, {
      tags: ['revolution', 'dynasty'],
      color: REVOLT,
      notes:
        '**Sun Yat-sen** takes office in Nanjing as provisional president of the Republic of China.',
      sources: [wiki('Sun_Yat-sen'), wiki('Republic_of_China_(1912–1949)')],
    }),
    ev('abdication', y(1912, 2, 12), 'The last emperor abdicates', P.day, {
      tags: ['ruler', 'dynasty'],
      color: RULER,
      notes:
        'An edict in **Puyi**’s name ends the Qing and more than two thousand years of imperial rule; **Yuan Shikai** becomes president.',
      sources: [wiki('Puyi'), wiki('1911_Revolution')],
    }),
    ev('may-fourth', y(1919, 5, 4), 'May Fourth Movement', P.day, {
      tags: ['revolution', 'thought'],
      color: REVOLT,
      notes:
        'Students in Beijing protest the Versailles decision to hand Germany’s rights in Shandong to Japan; the movement for science, democracy and writing in the vernacular grows from it.',
      sources: [wiki('May_Fourth_Movement')],
    }),
    ev('ccp', y(1921, 7, 23), 'Communist Party founded', P.day, {
      tags: ['revolution'],
      color: REVOLT,
      notes:
        'The first congress of the **Chinese Communist Party** opens in Shanghai, with about a dozen delegates, among them **Mao Zedong**.',
      sources: [wiki('1st_National_Congress_of_the_Chinese_Communist_Party')],
    }),
    ev('northern-expedition', y(1926, 7, 9), 'Northern Expedition', P.day, {
      tags: ['war'],
      color: WAR,
      notes:
        'The Nationalists under **Chiang Kai-shek** march north from Guangzhou against the warlords, uniting the country under the Nanjing government by the end of 1928.',
      sources: [wiki('Northern_Expedition')],
    }),
    ev('shanghai-1927', y(1927, 4, 12), 'Shanghai purge', P.day, {
      tags: ['war', 'revolution'],
      color: WAR,
      notes:
        'Chiang turns on his Communist allies in Shanghai; thousands are killed, and the alliance between the two parties ends.',
      sources: [wiki('Shanghai_massacre')],
    }),
    ev('mukden', y(1931, 9, 18), 'Mukden incident', P.day, {
      tags: ['war'],
      color: WAR,
      notes:
        'Japanese officers blow up a section of railway as a pretext and the Kwantung Army seizes **Manchuria**.',
      sources: [wiki('Mukden_incident')],
    }),
    ev('long-march', y(1934, 10, 16), 'Long March begins', P.day, {
      tags: ['war', 'revolution'],
      color: REVOLT,
      notes:
        'The Red Army breaks out of its base in Jiangxi; a year later, on 22 October 1935, the survivors reach Shaanxi, few of those who set out, with **Mao Zedong** now its leader.',
      sources: [wiki('Long_March')],
    }),
    ev('marco-polo', y(1937, 7, 7), 'Marco Polo Bridge', P.day, {
      tags: ['war'],
      color: WAR,
      notes:
        'A clash between Chinese and Japanese troops near Beijing opens full-scale war; the Nationalists and Communists form a second united front.',
      sources: [wiki('Marco_Polo_Bridge_incident')],
    }),
    ev('nanjing-1937', y(1937, 12, 13), 'Nanjing falls', P.day, {
      tags: ['war'],
      color: WAR,
      notes:
        'Japanese troops take the capital and, over the following six weeks, kill vast numbers of civilians and prisoners: the **Nanjing Massacre**.',
      sources: [wiki('Nanjing_Massacre')],
    }),
    ev('japan-surrenders', y(1945, 9, 2), 'Japan surrenders', P.day, {
      tags: ['war'],
      color: WAR,
      notes:
        'Japan signs the instrument of surrender in Tokyo Bay; its armies in China surrender at Nanjing on 9 September.',
      sources: [wiki('Surrender_of_Japan')],
    }),
    ev('yangtze', y(1949, 4, 23), 'Nanjing taken', P.day, {
      tags: ['war'],
      color: WAR,
      notes:
        'The **People’s Liberation Army** crosses the Yangtze and takes the Nationalist capital.',
      sources: [wiki('Yangtze_River_Crossing_campaign')],
    }),
    ev('prc', y(1949, 10, 1), 'People’s Republic proclaimed', P.day, {
      tags: ['revolution', 'dynasty'],
      color: REVOLT,
      notes:
        '**Mao Zedong** proclaims the **People’s Republic of China** from Tiananmen in Beijing.',
      sources: [wiki("Proclamation_of_the_People's_Republic_of_China")],
    }),
    ev('taipei', y(1949, 12, 7), 'ROC government to Taipei', P.day, {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        'The Nationalist government of the Republic of China moves to **Taipei**; major fighting on the mainland ends.',
      sources: [wiki('Retreat_of_the_government_of_the_Republic_of_China_to_Taiwan')],
    }),
    h('h-since', y(1950), 'Since 1949'),
    ev('reform', y(1978, 12, 18), 'Reform and opening', P.day, {
      tags: ['contact'],
      notes:
        'The Third Plenum of the Communist Party’s 11th Central Committee (18–22 December) begins the economic reforms associated with **Deng Xiaoping**.',
      sources: [wiki('Reform_and_opening_up')],
    }),
    ev('hong-kong', y(1997, 7, 1), 'Hong Kong handover', P.day, {
      tags: ['contact'],
      notes:
        'Britain transfers sovereignty over **Hong Kong** to the People’s Republic of China, 155 years after the Treaty of Nanking.',
      sources: [wiki('Handover_of_Hong_Kong')],
    }),
  ];

  /** A duration; `start`/`end` are time strings. */
  const span = (id, start, end, title, o) => d(id, start, end, title, o);
  const durations = [
    span('yangshao', y(-5000), y(-3000), 'Yangshao culture', {
      tags: ['archaeology'],
      color: CULTURE,
      notes:
        'Farming villages of the middle **Yellow River**, about 5000–3000 BCE, growing millet and making painted pottery.',
      sources: [wiki('Yangshao_culture')],
    }),
    span('liangzhu', y(-3300), y(-2300), 'Liangzhu culture', {
      tags: ['archaeology'],
      color: CULTURE,
      notes:
        'A rice-farming culture of the Yangtze delta, about 3300–2300 BCE, with a walled city, large water works and fine jade.',
      sources: [wiki('Liangzhu_culture')],
    }),
    span('longshan', y(-3000), y(-1900), 'Longshan culture', {
      tags: ['archaeology'],
      color: CULTURE,
      notes:
        'The late Neolithic of the Yellow River, about 3000–1900 BCE: walled towns, thin black pottery and growing differences of rank.',
      sources: [wiki('Longshan_culture')],
    }),
    span('erlitou', y(-1900), y(-1500), 'Erlitou culture', {
      tags: ['archaeology'],
      color: CULTURE,
      notes:
        'Usually dated about 1900–1500 BCE (radiocarbon studies narrow it to about 1750–1500): China’s first city with palaces and bronze casting on a large scale.',
      sources: [wiki('Erlitou_culture')],
    }),
    span('xia', y(-2070), y(-1600), 'Xia (traditional)', {
      tags: ['dynasty'],
      color: DYNASTY,
      presumptive: true,
      notes:
        'The first dynasty of the traditional histories, founded by **Yu the Great**. No writing from it has been found and its historicity is debated; the dates, about 2070–1600 BCE, are the Chronology Project’s. Drawn dashed: unconfirmed.',
      sources: [wiki('Xia_dynasty'), wiki('Xia–Shang–Zhou_Chronology_Project')],
    }),
    span('shang', y(-1600), y(-1046), 'Shang', {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        'About 1600–1046 BCE (Chronology Project): bronze, chariots, royal tombs and the oracle bones, the first Chinese dynasty attested in its own writing.',
      sources: [wiki('Shang_dynasty')],
    }),
    span('western-zhou', y(-1046), y(-771), 'Western Zhou', {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        'From the conquest of the Shang to the fall of Haojing, 1046–771 BCE, ruling through relatives and allies given fiefs.',
      sources: [wiki('Western_Zhou')],
    }),
    span('eastern-zhou', y(-770), y(-256), 'Eastern Zhou', {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        'From Luoyang, 770–256 BCE, the Zhou kings reign while the states rule: the age of Confucius, Laozi and the hundred schools of thought.',
      sources: [wiki('Eastern_Zhou')],
    }),
    span('spring-autumn', y(-770), y(-476), 'Spring and Autumn period', {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        'Named after the chronicle of Lu; conventionally 770–476 BCE, as more than a hundred states shrink to a few great ones.',
      sources: [wiki('Spring_and_Autumn_period')],
    }),
    span('warring-states', y(-475), y(-221), 'Warring States', {
      tags: ['dynasty', 'war'],
      color: DYNASTY,
      notes:
        'Conventionally 475–221 BCE (Sima Qian’s start; others begin in 403): seven states with mass infantry, iron and written law, until Qin conquers the rest.',
      sources: [wiki('Warring_States_period')],
    }),
    span('qin', y(-221), y(-206), 'Qin', {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        'The first empire, 221–206 BCE: fifteen years that set the form of the Chinese state for two thousand. The name “China” probably comes from Qin.',
      sources: [wiki('Qin_dynasty')],
    }),
    span('han', y(-202), julian(220, 12, 11).time, 'Han', {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        '202 BCE–220 CE, Western Han and Eastern Han, divided by Wang Mang’s Xin (9–23). The majority of Chinese still call themselves the **Han** people.',
      sources: [wiki('Han_dynasty')],
    }),
    span('three-kingdoms', julian(220, 12, 11).time, y(280), 'Three Kingdoms', {
      tags: ['dynasty', 'war'],
      color: DYNASTY,
      notes:
        'Wei, Shu Han and Wu, 220–280: the age retold in the Ming novel **Romance of the Three Kingdoms**.',
      sources: [wiki('Three_Kingdoms')],
    }),
    span('jin', y(266), y(420), 'Jin', {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        'Founded by the Sima family in 266, it reunites China in 280, loses the north in 311–316 and rules the south as the Eastern Jin until 420.',
      sources: [wiki('Jin_dynasty_(266–420)')],
    }),
    span('north-south', y(420), y(589), 'Northern and Southern dynasties', {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        'Northern dynasties of Xianbei origin and southern Chinese courts at Jiankang, 420–589, while Buddhism spreads through both.',
      sources: [wiki('Northern_and_Southern_dynasties')],
    }),
    span('sui-d', julian(581, 3, 4).time, y(618), 'Sui', {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        '581–618: reunifies China, builds the Grand Canal and exhausts itself in wars on Goguryeo; thirty-seven years that prepared the Tang.',
      sources: [wiki('Sui_dynasty')],
    }),
    span('tang-d', julian(618, 6, 18).time, y(907), 'Tang', {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        '618–907, with Wu Zetian’s Zhou (690–705) in the middle: Chang’an at the eastern end of the Silk Road, the great age of Chinese poetry.',
      sources: [wiki('Tang_dynasty')],
    }),
    span('five-dynasties', y(907), y(979), 'Five Dynasties and Ten Kingdoms', {
      tags: ['dynasty', 'war'],
      color: DYNASTY,
      notes:
        'Five short-lived dynasties in the north and ten kingdoms mostly in the south, 907–979, until the Song absorb the last of them.',
      sources: [wiki('Five_Dynasties_and_Ten_Kingdoms_period')],
    }),
    span('song-d', julian(960, 2, 4).time, julian(1279, 3, 19).time, 'Song', {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        'The Northern Song at Kaifeng (960–1127) and the Southern Song at Hangzhou (1127–1279): printing, paper money, gunpowder and the compass; an economy of cities and canals.',
      sources: [wiki('Song_dynasty')],
    }),
    span('yuan-d', y(1271), julian(1368, 9, 14).time, 'Yuan', {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        'The Mongol dynasty, from Kublai’s proclamation in 1271 to the fall of Dadu on 14 September 1368 (Julian).',
      sources: [wiki('Yuan_dynasty')],
    }),
    span('ming-d', julian(1368, 1, 23).time, y(1644, 4, 25), 'Ming', {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        '1368–1644: the Forbidden City, the treasure fleets, the Great Wall in brick and stone, and a population that roughly doubled.',
      sources: [wiki('Ming_dynasty')],
    }),
    span('qing-d', y(1644, 6, 6), y(1912, 2, 12), 'Qing', {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        'The Manchu dynasty, ruling from Beijing from 1644 to the abdication of 1912; at its height under Kangxi and Qianlong, the largest Chinese empire.',
      sources: [wiki('Qing_dynasty')],
    }),
    span('roc-d', y(1912, 1, 1), y(1949, 12, 7), 'Republic of China (mainland)', {
      tags: ['dynasty'],
      color: DYNASTY,
      notes:
        'From its proclamation to the government’s move to Taipei, where the Republic of China continues.',
      sources: [wiki('Republic_of_China_(1912–1949)')],
    }),
    // Rulers.
    span('first-emperor-reign', y(-221), y(-210), 'Qin Shi Huang, the First Emperor', {
      tags: ['ruler'],
      color: RULER,
      notes: 'King of Qin from 246 BCE, emperor from 221 until his death in 210.',
      sources: [wiki('Qin_Shi_Huang')],
    }),
    span('wudi', y(-141), y(-87), 'Han Wudi', {
      tags: ['ruler'],
      color: RULER,
      notes:
        '**Emperor Wu of Han**, 141–87 BCE: wars on the Xiongnu, the road west, state monopolies of salt and iron, and Confucian learning for officials.',
      sources: [wiki('Emperor_Wu_of_Han')],
    }),
    span('taizong', y(626), y(649), 'Tang Taizong', {
      tags: ['ruler'],
      color: RULER,
      notes:
        '**Li Shimin**, 626–649: held up by later historians as the model ruler, who took counsel and conquered the Eastern Turks.',
      sources: [wiki('Emperor_Taizong_of_Tang')],
    }),
    span('kublai', julian(1260, 5, 5).time, julian(1294, 2, 18).time, 'Kublai Khan', {
      tags: ['ruler'],
      color: RULER,
      notes:
        'Proclaimed Great Khan on 5 May 1260 and first Yuan emperor, until his death on 18 February 1294 (dates Julian).',
      sources: [wiki('Kublai_Khan')],
    }),
    span('yongle-reign', julian(1402, 7, 17).time, julian(1424, 8, 12).time, 'Yongle Emperor', {
      tags: ['ruler'],
      color: RULER,
      notes:
        '17 July 1402 – 12 August 1424 (Julian): Beijing, the Forbidden City, the Yongle Encyclopedia and Zheng He’s first six voyages.',
      sources: [wiki('Yongle_Emperor')],
    }),
    span('kangxi', y(1661, 2, 5), y(1722, 12, 20), 'Kangxi Emperor', {
      tags: ['ruler'],
      color: RULER,
      notes:
        'Sixty-one years, 1661–1722, the longest reign in Chinese history: he put down the Three Feudatories, took Taiwan and fixed the Russian border.',
      sources: [wiki('Kangxi_Emperor')],
    }),
    span('qianlong', y(1735, 10, 18), y(1796, 2, 9), 'Qianlong Emperor', {
      tags: ['ruler'],
      color: RULER,
      notes:
        '1735–1796, abdicating so as not to reign longer than his grandfather Kangxi, though he held power until his death in 1799. The empire reaches its greatest extent.',
      sources: [wiki('Qianlong_Emperor')],
    }),
    span('cixi', y(1861, 11, 11), y(1908, 11, 15), 'Cixi, regent', {
      tags: ['ruler'],
      color: RULER,
      notes:
        '**Empress Dowager Cixi** rules as regent for her son and then her nephew (1861–73, 1875–89) and holds power again from 1898 until her death in 1908.',
      sources: [wiki('Empress_Dowager_Cixi')],
    }),
    // Wars and great works.
    span('an-lushan-d', julian(755, 12, 16).time, julian(763, 2, 17).time, 'An Lushan rebellion', {
      tags: ['war', 'revolution'],
      color: WAR,
      notes:
        '16 December 755 to 17 February 763 (Julian): one of the deadliest wars of its age; the Tang survives, weakened.',
      sources: [wiki('An_Lushan_rebellion')],
    }),
    span('voyages', julian(1405, 7, 11).time, y(1433), 'Zheng He’s voyages', {
      tags: ['contact'],
      color: '#3d6e8a',
      notes: 'Seven voyages, 1405–1433, across the Indian Ocean as far as East Africa.',
      sources: [wiki('Ming_treasure_voyages')],
    }),
    span('ming-wall', julian(1449, 9, 1).time, y(1644), 'The Great Wall rebuilt', {
      tags: ['war', 'invention'],
      color: '#7a6a55',
      notes:
        'After the Tumu crisis the Ming build walls along the northern frontier, in brick and stone above all in the sixteenth century: most of the Great Wall seen today.',
      sources: [wiki('Great_Wall_of_China'), 'https://whc.unesco.org/en/list/438/'],
    }),
    span('opium-1', y(1839, 9, 4), y(1842, 8, 29), 'First Opium War', {
      tags: ['war', 'contact'],
      color: WAR,
      notes: 'Britain against the Qing, 1839–1842, over the opium trade and access to China.',
      sources: [wiki('First_Opium_War')],
    }),
    span('taiping', y(1850, 12, 1), y(1864, 8, 1), 'Taiping Rebellion', {
      tags: ['war', 'revolution'],
      color: REVOLT,
      notes:
        'December 1850 to August 1864: a civil war between the Qing and the Taiping Heavenly Kingdom, among the deadliest wars in history, with some 20–30 million dead.',
      sources: [wiki('Taiping_Rebellion')],
    }),
    span('opium-2', y(1856, 10, 8), y(1860, 10, 24), 'Second Opium War', {
      tags: ['war', 'contact'],
      color: WAR,
      notes:
        'Britain and France against the Qing, 1856–1860, ending with the Convention of Peking; Russia gains the lands north of the Amur and east of the Ussuri.',
      sources: [wiki('Second_Opium_War')],
    }),
    span('boxers', y(1899, 10, 18), y(1901, 9, 7), 'Boxer Rebellion', {
      tags: ['war', 'revolution'],
      color: REVOLT,
      notes:
        'An anti-foreign, anti-Christian movement in the north, backed by the court in 1900, and the foreign intervention that crushed it.',
      sources: [wiki('Boxer_Rebellion')],
    }),
    span('sino-japanese', y(1937, 7, 7), y(1945, 9, 2), 'War with Japan', {
      tags: ['war'],
      color: WAR,
      notes:
        'The **Second Sino-Japanese War**, from Marco Polo Bridge to Japan’s surrender (fighting had begun in Manchuria in 1931); estimates of Chinese deaths run from 15 to 20 million and more.',
      sources: [wiki('Second_Sino-Japanese_War')],
    }),
    span('civil-war', y(1927, 8, 1), y(1949, 12, 7), 'Civil War', {
      tags: ['war', 'revolution'],
      color: WAR,
      notes:
        'Nationalists against Communists, from the Nanchang uprising of 1927 to the government’s move to Taipei in 1949, paused by the united front against Japan and fought in full from 1946.',
      sources: [wiki('Chinese_Civil_War')],
    }),
  ];

  const relationships = [
    rel('d:erlitou', 'd:xia'),
    rel('erlitou-palaces', 'd:xia'),
    rel('pan-geng', 'oracle-bones'),
    rel('oracle-bones', 'fu-hao'),
    rel('muye', 'd:western-zhou'),
    rel('gonghe', 'shiji'),
    rel('haojing', 'd:eastern-zhou'),
    rel('chunqiu', 'confucius'),
    rel('confucius', 'analects'),
    rel('confucius', 'confucius-dies'),
    rel('analects', 'taixue'),
    rel('mencius', 'zhu-xi'),
    rel('shang-yang', 'unification'),
    rel('changping', 'unification'),
    rel('ying-zheng', 'unification'),
    rel('unification', 'book-burning'),
    rel('first-emperor-dies', 'terracotta'),
    rel('first-emperor-dies', 'dazexiang'),
    rel('dazexiang', 'gaixia'),
    rel('zhang-qian', 'white-horse'),
    rel('d:wudi', 'zhang-qian'),
    rel('d:wudi', 'taixue'),
    rel('yellow-turbans', 'red-cliffs'),
    rel('red-cliffs', 'han-ends'),
    rel('sui-unites', 'grand-canal'),
    rel('xuanwu', 'd:taizong'),
    rel('white-horse', 'diamond-sutra'),
    rel('diamond-sutra', 'movable-type'),
    rel('gunpowder', 'compass'),
    rel('jingkang', 'yamen'),
    rel('red-turbans', 'ming'),
    rel('yongle', 'forbidden-city'),
    rel('yongle', 'zheng-he-1'),
    rel('tumu', 'd:ming-wall'),
    rel('li-zicheng', 'shanhai'),
    rel('shanhai', 'qing-beijing'),
    rel('humen', 'd:opium-1'),
    rel('nanking', 'hong-kong'),
    rel('jintian', 'tianjing'),
    rel('tianjing', 'nanjing-retaken'),
    rel('exams', 'exams-end'),
    rel('wuchang', 'roc'),
    rel('roc', 'abdication'),
    rel('marco-polo', 'nanjing-1937'),
    rel('yangtze', 'prc'),
  ];

  return {
    format: 'openchronology',
    version: 1,
    title: 'China, from the Neolithic to 1949',
    description:
      'Chinese history on one line: the Neolithic cultures, the Xia of tradition, the Shang and Zhou, the empire from Qin to Qing, and the Republic, to the founding of the People’s Republic on 1 October 1949, with two later milestones. Dynasties, reigns and wars are durations; people, works, inventions and battles are moments.\n\n**How it is dated.** Before 841 BCE, the first year Chinese history dates year by year, the dates are the Xia–Shang–Zhou Chronology Project’s conventional figures, and approximate. Years are proleptic Gregorian with BCE (1 BCE is year 0); dates known to the day before 1582 are converted from the Julian dates in the sources, which are kept under Historical dates. Days are UTC date markers.\n\nA sample timeline built from the cited sources, not a definitive history.',
    presentation: {
      mode: 'gregorian',
      unit: '',
      scale: '1/1',
      origin: '0/1',
      version: 1,
      offsetMinutes: 0,
      significantDigits: 6,
    },
    tags: ['history', 'china', 'education'],
    plugins: [
      ...plugins(
        core.RICH_TEXT_NOTES,
        core.MOMENT_HEADINGS,
        core.MOMENT_COLORS,
        core.MOMENT_SOURCES,
        core.DATING_CONTEXT,
        core.HISTORICAL_DATES,
        core.PRESUMPTIVE_OUTLINE,
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
