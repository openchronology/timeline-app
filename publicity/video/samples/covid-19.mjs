// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The COVID-19 pandemic worldwide, from the first reported cluster in Wuhan (December 2019) to
// the end of WHO's public health emergency of international concern and of the US public
// health emergency (May 2023): the public-health tour's sample (Video 22, Short 19). Dates are
// UTC days unless a time is given, from WHO statements, regulators' announcements and
// peer-reviewed papers, with Wikipedia as the general reference. Global counts are the Johns
// Hopkins CSSE tallies as reported on the day they passed each mark; the excess-mortality figure
// is WHO's estimate, labelled as one. Waves are approximate, dated from Our World in Data's
// global curves. The virus's origin is not settled, and the sample says only that.
import { at, m, d, rel, plugins, theme, wiki } from './lib.mjs';

// Colours by kind, in the archive palette.
const NAVY = '#1f3a5f', // measures (lockdowns)
  BRICK = '#9c3b2a', // waves and variants
  GREEN = '#4f6f45', // science and vaccines
  OCHRE = '#b07a2a', // emergencies declared and ended
  GREY = '#6b7f99'; // counts and events

const WHO_TIMELINE = 'https://www.who.int/news/item/27-04-2020-who-timeline---covid-19';
const WHO_VARIANTS = 'https://www.who.int/activities/tracking-SARS-CoV-2-variants';
const WHO_LABELS =
  'https://www.who.int/news/item/31-05-2021-who-announces-simple-easy-to-say-labels-for-sars-cov-2-variants-of-interest-and-concern';
const WHO_EPI_42 =
  'https://www.who.int/docs/default-source/coronaviruse/situation-reports/20210601_weekly_epi_update_42.pdf';
const WHO_PHEIC =
  'https://www.who.int/news/item/30-01-2020-statement-on-the-second-meeting-of-the-international-health-regulations-(2005)-emergency-committee-regarding-the-outbreak-of-novel-coronavirus-(2019-ncov)';
const WHO_PANDEMIC =
  'https://www.who.int/news-room/speeches/item/who-director-general-s-opening-remarks-at-the-media-briefing-on-covid-19---11-march-2020';
const WHO_END =
  'https://www.who.int/news/item/05-05-2023-statement-on-the-fifteenth-meeting-of-the-international-health-regulations-(2005)-emergency-committee-regarding-the-coronavirus-disease-(covid-19)-pandemic';
const WHO_EXCESS =
  'https://www.who.int/news/item/05-05-2022-14.9-million-excess-deaths-were-associated-with-the-covid-19-pandemic-in-2020-and-2021';
const WHO_NAMING =
  'https://www.who.int/emergencies/diseases/novel-coronavirus-2019/technical-guidance/naming-the-coronavirus-disease-(covid-2019)-and-the-virus-that-causes-it';
const WHO_ORIGINS_2021 =
  'https://www.who.int/publications/i/item/who-convened-global-study-of-origins-of-sars-cov-2-china-part';
const WHO_SAGO_2025 =
  'https://www.who.int/publications/m/item/independent-assessment-of-the-origins-of-sars-cov-2-from-the-scientific-advisory-group-for-the-origins-of-novel-pathogens';
const WHO_OMICRON =
  'https://www.who.int/news/item/26-11-2021-classification-of-omicron-(b.1.1.529)-sars-cov-2-variant-of-concern';
const ECDC_VARIANTS = 'https://www.ecdc.europa.eu/en/covid-19/variants-concern';
const OWID_CASES = 'https://ourworldindata.org/covid-cases';
const OWID_DEATHS = 'https://ourworldindata.org/covid-deaths';
const JHU = 'https://coronavirus.jhu.edu/';
const JHU_PAPER = 'https://doi.org/10.1016/S1473-3099(20)30120-1';
const LOCKDOWNS = wiki('COVID-19_lockdowns');

/** Dating context for a count passing a mark. */
const tally = {
  datePrecision:
    'The day the Johns Hopkins CSSE count passed the mark, as reported then; reported counts are lower than the true numbers, and WHO’s count crossed within days.',
};
/** Dating context for a wave. */
const waveNote =
  'Approximate: dated here from the rise and fall of Our World in Data’s global (or national) daily cases; waves have no agreed start or end.';

export function covid19(core) {
  const h = (id, iso, title) => m(id, at(iso), title, { headingLevel: 'h2', tags: ['chapter'] });
  /** A moment on a UTC day (or at a UTC time). */
  const on = (id, iso, title, o) => m(id, at(iso), title, o);
  const events = [
    h('h-emergence', '2019-12-01', 'Emergence'),
    on('onsets', '2019-12-08', 'Earliest known cases fall ill', {
      tags: ['spread'],
      notes:
        'The earliest symptom onsets later identified in **Wuhan**, Hubei province. The first patients had pneumonia of unknown cause; many, not all, were linked to the **Huanan Seafood Wholesale Market**.',
      datePrecision:
        'Early December 2019; reports differ. The WHO–China joint study (2021) gives 8 December as the earliest confirmed onset; Huang et al. (Lancet, 2020) reported one patient falling ill on 1 December.',
      sources: [
        wiki('COVID-19_pandemic_in_mainland_China'),
        'https://doi.org/10.1016/S0140-6736(20)30183-5',
        WHO_ORIGINS_2021,
      ],
    }),
    on('li-warns', '2019-12-30', 'Doctors warn colleagues', {
      tags: ['spread'],
      notes:
        'Wuhan’s health commission sends hospitals an urgent internal notice about pneumonia of unknown cause. The ophthalmologist **Li Wenliang** warns colleagues in a chat group, and is later reprimanded by police.',
      sources: [wiki('Li_Wenliang')],
    }),
    on('wuhan-cluster', '2019-12-31', 'A cluster of pneumonia reported in Wuhan', {
      tags: ['who', 'spread'],
      color: OCHRE,
      notes:
        'The **Wuhan Municipal Health Commission** publicly reports a cluster of pneumonia cases of unknown cause, 27 of them. **WHO’s China country office** picks up its statement the same day.',
      sources: [WHO_TIMELINE, wiki('COVID-19_pandemic')],
    }),
    on('market-closed', '2020-01-01', 'Huanan market closed', {
      tags: ['measures'],
      notes: 'Wuhan closes the **Huanan Seafood Wholesale Market** for cleaning and disinfection.',
      sources: [wiki('Huanan_Seafood_Wholesale_Market')],
    }),
    on('who-imst', '2020-01-01T12:00:00Z', 'WHO sets up an incident team', {
      tags: ['who'],
      notes:
        'WHO sets up an **Incident Management Support Team** across its headquarters, regional and country levels.',
      datePrecision:
        '1 January 2020; drawn at noon so it stands apart from the market’s closure the same day.',
      sources: [WHO_TIMELINE],
    }),
    on('who-don', '2020-01-05', 'WHO’s first outbreak news', {
      tags: ['who'],
      notes:
        'WHO publishes its first **Disease Outbreak News** on the pneumonia of unknown cause in Wuhan, with a risk assessment and advice.',
      sources: [WHO_TIMELINE],
    }),
    on('novel-cov', '2020-01-09', 'A new coronavirus identified', {
      tags: ['science', 'who'],
      color: GREEN,
      notes:
        'Chinese authorities report that the cause is a **novel coronavirus**; WHO says so in a statement the same day.',
      sources: [wiki('SARS-CoV-2')],
    }),
    on('genome', '2020-01-11T01:05:00Z', 'The genome is published', {
      tags: ['science'],
      color: GREEN,
      notes:
        'The virus’s genome sequence, from **Zhang Yongzhen**’s team at Fudan University, is posted on **Virological.org** by **Edward Holmes**, for anyone to use. Vaccine and test developers start work from it.',
      datePrecision:
        'Posted at 01:05 UTC on 11 January 2020 (10 January in the Americas). WHO’s timeline dates China’s public sharing of the sequence to 12 January.',
      sources: [
        'https://virological.org/t/novel-2019-coronavirus-genome/319',
        'https://doi.org/10.1038/s41586-020-2008-3',
        WHO_TIMELINE,
      ],
    }),
    on('first-death', '2020-01-11T12:00:00Z', 'First reported death', {
      tags: ['spread'],
      notes: 'Chinese authorities report the first death: a 61-year-old man in Wuhan.',
      datePrecision:
        'Reported 11 January 2020 (he died on 9 January); drawn at noon, apart from the genome’s publication.',
      sources: [wiki('COVID-19_pandemic_in_mainland_China')],
    }),
    on('thailand', '2020-01-13', 'First case outside China', {
      tags: ['spread'],
      notes:
        '**Thailand** confirms a case in a traveller from Wuhan: the first recorded outside China.',
      sources: [WHO_TIMELINE],
    }),
    on('h2h', '2020-01-20', 'Human-to-human spread confirmed', {
      tags: ['science'],
      notes:
        'The epidemiologist **Zhong Nanshan**, for China’s National Health Commission, says on state television that the virus spreads between people.',
      sources: [wiki('Zhong_Nanshan')],
    }),
    on('us-first', '2020-01-21', 'First US case', {
      tags: ['spread'],
      notes: 'The **CDC** confirms the first case in the United States, in Washington State.',
      sources: [
        'https://www.cdc.gov/media/releases/2020/p0121-novel-coronavirus-travel-case.html',
        wiki('COVID-19_pandemic_in_the_United_States'),
      ],
    }),
    on('ec-first', '2020-01-22', 'Emergency Committee first meets', {
      tags: ['who'],
      notes:
        'WHO’s **Emergency Committee** under the International Health Regulations meets on 22–23 January and cannot reach consensus on declaring an emergency.',
      sources: [WHO_TIMELINE],
    }),
    on('wuhan-lockdown', '2020-01-23T02:00:00Z', 'Wuhan locked down', {
      tags: ['measures'],
      color: NAVY,
      notes:
        'At 10 a.m. local time, Wuhan suspends public transport and closes outbound routes; other cities in Hubei follow within days.',
      sources: [wiki('COVID-19_lockdown_in_China')],
    }),
    on('europe-first', '2020-01-24', 'First cases in Europe', {
      tags: ['spread'],
      notes: '**France** confirms three cases: the first in Europe.',
      sources: [wiki('COVID-19_pandemic_in_France')],
    }),
    on('huang', '2020-01-24T12:00:00Z', 'First clinical report', {
      tags: ['science'],
      color: GREEN,
      notes:
        '**Huang et al.** describe the first 41 hospitalised patients in Wuhan in *The Lancet*: their symptoms, scans and outcomes.',
      datePrecision: 'Published online 24 January 2020; drawn at noon, apart from France’s cases.',
      sources: ['https://doi.org/10.1016/S0140-6736(20)30183-5'],
    }),
    on('pheic', '2020-01-30', 'A public health emergency of international concern', {
      tags: ['who'],
      color: OCHRE,
      notes:
        'After its Emergency Committee reaches consensus, WHO’s Director-General **Tedros Adhanom Ghebreyesus** declares the outbreak a **public health emergency of international concern** (PHEIC), WHO’s highest level of alarm under the International Health Regulations.',
      sources: [WHO_PHEIC, wiki('Public_health_emergency_of_international_concern')],
    }),
    on('first-death-outside', '2020-02-02', 'First death outside China', {
      tags: ['spread'],
      notes: 'The **Philippines** reports the first death outside mainland China.',
      sources: [wiki('COVID-19_pandemic_in_the_Philippines')],
    }),
    on('bat-relative', '2020-02-03', 'A close relative in bats', {
      tags: ['science'],
      color: GREEN,
      notes:
        '*Nature* publishes two papers describing the new virus. **Zhou et al.** report a bat coronavirus whose genome is 96% identical to it; **Wu et al.** describe its genome.',
      sources: [
        'https://doi.org/10.1038/s41586-020-2012-7',
        'https://doi.org/10.1038/s41586-020-2008-3',
      ],
    }),
    on('li-dies', '2020-02-07', 'Li Wenliang dies', {
      tags: ['spread'],
      notes:
        'The doctor **Li Wenliang**, who had warned colleagues in December, dies of COVID-19 in Wuhan.',
      sources: [wiki('Li_Wenliang')],
    }),
    on('name', '2020-02-11', 'The disease is named COVID-19', {
      tags: ['who'],
      notes:
        'WHO names the disease **COVID-19**: **co**rona**vi**rus **d**isease, 20**19**, a name chosen not to refer to a place, an animal or a group of people.',
      sources: [WHO_NAMING, wiki('COVID-19')],
    }),
    on('ictv', '2020-02-11T12:00:00Z', 'The virus is named SARS-CoV-2', {
      tags: ['science'],
      color: GREEN,
      notes:
        'The **International Committee on Taxonomy of Viruses** names the virus **SARS-CoV-2**, a sister of the 2003 SARS coronavirus.',
      datePrecision: '11 February 2020, the same day as WHO’s name for the disease; drawn at noon.',
      sources: ['https://doi.org/10.1038/s41564-020-0695-z', WHO_NAMING],
    }),
    on('africa-first', '2020-02-14', 'First case in Africa', {
      tags: ['spread'],
      notes: '**Egypt** confirms the first case on the African continent.',
      sources: [wiki('COVID-19_pandemic_in_Africa')],
    }),
    on('codogno', '2020-02-21', 'A cluster in Lombardy', {
      tags: ['spread'],
      notes:
        'A case confirmed in **Codogno**, Lombardy, reveals local spread in northern Italy; eleven towns in Lombardy and Veneto are quarantined two days later.',
      sources: [wiki('COVID-19_pandemic_in_Italy')],
    }),
    on('brazil-first', '2020-02-26', 'First case in Latin America', {
      tags: ['spread'],
      notes: '**Brazil** confirms a case in São Paulo, the first in Latin America.',
      sources: [wiki('COVID-19_pandemic_in_Brazil')],
    }),
    on('mission-report', '2020-02-28', 'WHO–China joint mission reports', {
      tags: ['who'],
      notes:
        'The **WHO–China Joint Mission** publishes its report on the outbreak in China, its spread and the measures taken.',
      sources: [
        'https://www.who.int/publications/i/item/report-of-the-who-china-joint-mission-on-coronavirus-disease-2019-(covid-19)',
      ],
    }),

    h('h-pandemic', '2020-03-01', 'A pandemic'),
    on('pandemic', '2020-03-11', 'WHO: a pandemic', {
      tags: ['who'],
      color: OCHRE,
      notes:
        'WHO assesses that COVID-19 **can be characterized as a pandemic**. The Director-General cites more than 118,000 cases in 114 countries and 4,291 deaths.',
      sources: [WHO_PANDEMIC, wiki('COVID-19_pandemic')],
    }),
    on('us-emergency', '2020-03-13', 'US national emergency', {
      tags: ['measures'],
      notes:
        'President **Donald Trump** declares a national emergency under the National Emergencies Act.',
      sources: [wiki('COVID-19_pandemic_in_the_United_States')],
    }),
    on('europe-epicentre', '2020-03-13T12:00:00Z', 'WHO: Europe the epicentre', {
      tags: ['who', 'spread'],
      notes: 'WHO says Europe has become the epicentre of the pandemic.',
      datePrecision: '13 March 2020; drawn at noon, apart from the US declaration.',
      sources: [wiki('COVID-19_pandemic_in_Europe')],
    }),
    on('first-vaccine-trial', '2020-03-16', 'First vaccine trial dose', {
      tags: ['science', 'vaccine'],
      color: GREEN,
      notes:
        'At **Kaiser Permanente Washington** in Seattle, the first volunteer receives **mRNA-1273**, the Moderna and NIH vaccine, in a phase 1 trial: the first COVID-19 vaccine trial to dose a person.',
      sources: [
        'https://www.nih.gov/news-events/news-releases/nih-clinical-trial-investigational-vaccine-covid-19-begins',
        wiki('Moderna_COVID-19_vaccine'),
      ],
    }),
    on('eu-borders', '2020-03-17', 'EU closes its external borders', {
      tags: ['measures'],
      notes:
        'EU leaders agree to restrict non-essential travel into the EU for 30 days; it is extended several times.',
      sources: [wiki('COVID-19_pandemic_in_Europe')],
    }),
    on('solidarity', '2020-03-18', 'Solidarity trial launched', {
      tags: ['who', 'science'],
      color: GREEN,
      notes:
        'WHO and partners launch the **Solidarity** trial, an international trial of treatments for COVID-19.',
      sources: [WHO_TIMELINE, wiki('Solidarity_trial')],
    }),
    on('olympics-postponed', '2020-03-24', 'Tokyo Olympics postponed', {
      tags: ['measures'],
      notes:
        'The **IOC** and Japan agree to postpone the Tokyo 2020 Olympic and Paralympic Games to 2021, keeping the name Tokyo 2020.',
      sources: [wiki('2020_Summer_Olympics')],
    }),
    on('cases-1m', '2020-04-02', '1 million confirmed cases', {
      tags: ['milestone'],
      color: GREY,
      notes: 'Confirmed cases worldwide pass **one million**.',
      ...tally,
      sources: [JHU, OWID_CASES],
    }),
    on('deaths-100k', '2020-04-10', '100,000 confirmed deaths', {
      tags: ['milestone'],
      color: GREY,
      notes: 'Confirmed deaths worldwide pass **100,000**.',
      ...tally,
      sources: [JHU, OWID_DEATHS],
    }),
    on('oxford-trial', '2020-04-23', 'Oxford vaccine trial begins', {
      tags: ['science', 'vaccine'],
      color: GREEN,
      notes:
        'The first volunteers receive the **University of Oxford** vaccine, ChAdOx1 nCoV-19 (later Oxford–AstraZeneca), in a trial in England.',
      sources: [wiki('Oxford–AstraZeneca_COVID-19_vaccine')],
    }),
    on('act-a', '2020-04-24', 'ACT Accelerator launched', {
      tags: ['who', 'vaccine'],
      notes:
        'WHO and partners launch the **Access to COVID-19 Tools Accelerator**, whose vaccine pillar is **COVAX**, for shared access to tests, treatments and vaccines.',
      sources: [wiki('COVAX')],
    }),
    on('remdesivir', '2020-05-01', 'Remdesivir authorised in the US', {
      tags: ['science'],
      color: GREEN,
      notes:
        'The **FDA** issues an emergency use authorization for the antiviral **remdesivir** in hospitalised patients.',
      sources: [wiki('Remdesivir')],
    }),

    h('h-waves', '2020-06-01', 'Waves and trials'),
    on('masks', '2020-06-05', 'WHO advice on masks', {
      tags: ['who', 'measures'],
      notes:
        'WHO updates its guidance to advise fabric masks for the general public where there is community spread and distancing is hard.',
      sources: [wiki('Face_masks_during_the_COVID-19_pandemic')],
    }),
    on('dexamethasone', '2020-06-16', 'Dexamethasone reduces deaths', {
      tags: ['science'],
      color: GREEN,
      notes:
        'The UK **RECOVERY** trial reports that the cheap steroid **dexamethasone** reduces deaths among hospitalised patients needing oxygen or ventilation.',
      sources: ['https://doi.org/10.1056/NEJMoa2021436', wiki('RECOVERY_Trial')],
    }),
    on('cases-10m', '2020-06-28', '10 million confirmed cases', {
      tags: ['milestone'],
      color: GREY,
      notes: 'Confirmed cases worldwide pass **ten million**.',
      ...tally,
      sources: [JHU, OWID_CASES],
    }),
    on('deaths-500k', '2020-06-28T12:00:00Z', '500,000 confirmed deaths', {
      tags: ['milestone'],
      color: GREY,
      notes:
        'Confirmed deaths worldwide pass **half a million**, the same day as ten million cases.',
      datePrecision:
        'The day the Johns Hopkins CSSE count passed the mark, as reported then; drawn at noon, apart from the ten million cases the same day.',
      sources: [JHU, OWID_DEATHS],
    }),
    on('airborne', '2020-07-09', 'WHO brief on transmission', {
      tags: ['who', 'science'],
      notes:
        'A WHO scientific brief on how the virus spreads acknowledges reports of airborne transmission in some indoor settings, alongside droplets and contact.',
      sources: [wiki('Transmission_of_COVID-19')],
    }),
    on('phase3', '2020-07-27', 'Phase 3 vaccine trials begin', {
      tags: ['science', 'vaccine'],
      color: GREEN,
      notes:
        '**Moderna** and **Pfizer–BioNTech** begin large phase 3 trials of their mRNA vaccines on the same day, each with about 30,000 or more volunteers.',
      sources: [wiki('Moderna_COVID-19_vaccine'), wiki('Pfizer–BioNTech_COVID-19_vaccine')],
    }),
    on('sputnik', '2020-08-11', 'Russia registers Sputnik V', {
      tags: ['vaccine'],
      color: GREEN,
      notes:
        'Russia registers the **Gam-COVID-Vac** (Sputnik V) vaccine for use, before its phase 3 trial.',
      sources: [wiki('Sputnik_V_COVID-19_vaccine')],
    }),
    on('deaths-1m', '2020-09-28', '1 million confirmed deaths', {
      tags: ['milestone'],
      color: GREY,
      notes:
        'Confirmed deaths worldwide pass **one million**, about nine months after the first reported cluster.',
      ...tally,
      sources: [JHU, OWID_DEATHS, wiki('COVID-19_pandemic_deaths')],
    }),

    h('h-vaccines', '2020-11-01', 'The first vaccines'),
    on('pfizer-interim', '2020-11-09', 'Pfizer–BioNTech: over 90% efficacy', {
      tags: ['science', 'vaccine'],
      color: GREEN,
      notes:
        '**Pfizer** and **BioNTech** announce that their vaccine, BNT162b2, was more than 90% effective at preventing symptomatic COVID-19 in an interim analysis of its phase 3 trial.',
      sources: ['https://doi.org/10.1056/NEJMoa2034577', wiki('Pfizer–BioNTech_COVID-19_vaccine')],
    }),
    on('moderna-interim', '2020-11-16', 'Moderna: 94.5% efficacy', {
      tags: ['science', 'vaccine'],
      color: GREEN,
      notes:
        '**Moderna** announces an efficacy of 94.5% in an interim analysis of its phase 3 trial.',
      sources: [wiki('Moderna_COVID-19_vaccine')],
    }),
    on('az-interim', '2020-11-23', 'Oxford–AstraZeneca interim results', {
      tags: ['science', 'vaccine'],
      color: GREEN,
      notes:
        '**Oxford** and **AstraZeneca** announce interim efficacy results from trials in the UK and Brazil.',
      sources: [wiki('Oxford–AstraZeneca_COVID-19_vaccine')],
    }),
    on('mhra', '2020-12-02', 'First vaccine authorised: UK', {
      tags: ['vaccine'],
      color: GREEN,
      notes:
        'The UK’s **Medicines and Healthcare products Regulatory Agency** (MHRA) gives the Pfizer–BioNTech vaccine a temporary authorisation: the first anywhere for a COVID-19 vaccine after a full phase 3 trial.',
      sources: [
        'https://www.gov.uk/government/news/uk-medicines-regulator-gives-approval-for-first-uk-covid-19-vaccine',
        wiki('Pfizer–BioNTech_COVID-19_vaccine'),
      ],
    }),
    on('keenan', '2020-12-08T06:31:00Z', 'First authorised dose: Margaret Keenan', {
      tags: ['vaccine'],
      color: GREEN,
      notes:
        '**Margaret Keenan**, 90, receives the Pfizer–BioNTech vaccine at University Hospital, **Coventry**, at 6:31 a.m.: the first dose given after an authorisation, outside a trial.',
      datePrecision: '8 December 2020, 06:31 GMT (UTC), as the NHS reported it.',
      sources: [wiki('COVID-19_vaccination_in_the_United_Kingdom')],
    }),
    on('fda-eua', '2020-12-11', 'US emergency use authorization', {
      tags: ['vaccine'],
      color: GREEN,
      notes:
        'The US **FDA** issues an emergency use authorization for the Pfizer–BioNTech vaccine for people 16 and older.',
      datePrecision: 'Issued late on 11 December 2020, US Eastern time.',
      sources: [
        'https://www.fda.gov/media/144412/download',
        wiki('Pfizer–BioNTech_COVID-19_vaccine'),
      ],
    }),
    on('lindsay', '2020-12-14', 'First US vaccination', {
      tags: ['vaccine'],
      color: GREEN,
      notes:
        'The critical-care nurse **Sandra Lindsay** receives the first authorised dose in the United States, in New York.',
      sources: [wiki('COVID-19_vaccination_in_the_United_States')],
    }),
    on('uk-variant', '2020-12-14T12:00:00Z', 'UK reports a new variant', {
      tags: ['variant'],
      color: BRICK,
      notes:
        'The UK government tells Parliament that a new variant, later lineage **B.1.1.7**, is spreading in the south-east of England.',
      datePrecision: '14 December 2020; drawn at noon, apart from the first US vaccination.',
      sources: [wiki('SARS-CoV-2_Alpha_variant')],
    }),
    on('alpha', '2020-12-18', 'B.1.1.7 a variant of concern (Alpha)', {
      tags: ['variant', 'who'],
      color: BRICK,
      notes:
        'WHO designates **B.1.1.7**, first documented in the United Kingdom in September 2020, a **variant of concern**; it is labelled **Alpha** in May 2021.',
      datePrecision:
        'WHO’s designation date, 18 December 2020. Alpha and Beta share it; they are drawn six hours apart so that both can be read.',
      sources: [WHO_VARIANTS, wiki('SARS-CoV-2_Alpha_variant')],
    }),
    on('beta', '2020-12-18T06:00:00Z', 'B.1.351 a variant of concern (Beta)', {
      tags: ['variant', 'who'],
      color: BRICK,
      notes:
        'WHO designates **B.1.351**, first documented in South Africa in May 2020, a **variant of concern**; it is labelled **Beta** in May 2021.',
      datePrecision:
        'WHO’s designation date, 18 December 2020, shared with Alpha; drawn six hours later so that both can be read.',
      sources: [WHO_VARIANTS, wiki('SARS-CoV-2_Beta_variant')],
    }),
    on('moderna-eua', '2020-12-18T18:00:00Z', 'Moderna vaccine authorised in the US', {
      tags: ['vaccine'],
      color: GREEN,
      notes: 'The **FDA** issues an emergency use authorization for the Moderna vaccine.',
      datePrecision:
        '18 December 2020, US Eastern time; drawn in the evening, apart from the two variants designated the same day.',
      sources: [wiki('Moderna_COVID-19_vaccine')],
    }),
    on('eu-comirnaty', '2020-12-21', 'EU authorises its first vaccine', {
      tags: ['vaccine'],
      color: GREEN,
      notes:
        'After the **European Medicines Agency**’s recommendation, the European Commission grants the Pfizer–BioNTech vaccine (**Comirnaty**) a conditional marketing authorisation.',
      sources: [wiki('Pfizer–BioNTech_COVID-19_vaccine')],
    }),
    on('mhra-az', '2020-12-30', 'Oxford–AstraZeneca authorised in the UK', {
      tags: ['vaccine'],
      color: GREEN,
      notes: 'The **MHRA** authorises the Oxford–AstraZeneca vaccine.',
      sources: [wiki('Oxford–AstraZeneca_COVID-19_vaccine')],
    }),
    on('who-eul', '2020-12-31', 'WHO’s first emergency use listing', {
      tags: ['who', 'vaccine'],
      color: GREEN,
      notes:
        'WHO lists the Pfizer–BioNTech vaccine for emergency use, its first COVID-19 vaccine listing, which lets countries and UNICEF procure it more quickly.',
      sources: [wiki('Pfizer–BioNTech_COVID-19_vaccine')],
    }),
    on('gamma', '2021-01-11', 'P.1 a variant of concern (Gamma)', {
      tags: ['variant', 'who'],
      color: BRICK,
      notes:
        'WHO designates **P.1**, first documented in Brazil in November 2020 and found in travellers arriving in Japan, a **variant of concern**; it is labelled **Gamma** in May 2021.',
      sources: [WHO_VARIANTS, wiki('SARS-CoV-2_Gamma_variant')],
    }),
    on('deaths-2m', '2021-01-15', '2 million confirmed deaths', {
      tags: ['milestone'],
      color: GREY,
      notes: 'Confirmed deaths worldwide pass **two million**.',
      ...tally,
      sources: [JHU, OWID_DEATHS, wiki('COVID-19_pandemic_deaths')],
    }),
    on('cases-100m', '2021-01-26', '100 million confirmed cases', {
      tags: ['milestone'],
      color: GREY,
      notes: 'Confirmed cases worldwide pass **one hundred million**.',
      ...tally,
      sources: [JHU, OWID_CASES],
    }),
    on('covax-ghana', '2021-02-24', 'COVAX’s first delivery', {
      tags: ['vaccine', 'who'],
      color: GREEN,
      notes:
        '**Ghana** receives 600,000 doses of the Oxford–AstraZeneca vaccine, the first delivery by **COVAX**.',
      sources: [wiki('COVAX')],
    }),
    on('janssen', '2021-02-27', 'A one-dose vaccine authorised', {
      tags: ['vaccine'],
      color: GREEN,
      notes:
        'The **FDA** authorises the single-dose **Janssen** (Johnson & Johnson) vaccine for emergency use.',
      sources: [wiki('Janssen_COVID-19_vaccine')],
    }),
    on('origins-report', '2021-03-30', 'WHO–China origins study published', {
      tags: ['who', 'science'],
      notes:
        'WHO publishes the report of the **WHO-convened global study of origins**, China part. The virus’s origin has not been established; it remains under investigation and is debated.',
      sources: [WHO_ORIGINS_2021, wiki('Origin_of_SARS-CoV-2')],
    }),

    h('h-delta', '2021-04-01', 'Delta'),
    on('delta-voi', '2021-04-04', 'B.1.617.2 a variant of interest (Delta)', {
      tags: ['variant', 'who'],
      color: BRICK,
      notes:
        'WHO designates **B.1.617.2**, first documented in India in October 2020, a **variant of interest**.',
      sources: [WHO_VARIANTS, wiki('SARS-CoV-2_Delta_variant')],
    }),
    on('ema-clots', '2021-04-07', 'EMA: a possible link to rare clots', {
      tags: ['vaccine', 'science'],
      color: GREEN,
      notes:
        'The **European Medicines Agency** finds a possible link between the Oxford–AstraZeneca vaccine and very rare blood clots with low platelets, to be listed as a very rare side effect.',
      sources: [wiki('Oxford–AstraZeneca_COVID-19_vaccine')],
    }),
    on('deaths-3m', '2021-04-17', '3 million confirmed deaths', {
      tags: ['milestone'],
      color: GREY,
      notes: 'Confirmed deaths worldwide pass **three million**.',
      ...tally,
      sources: [JHU, OWID_DEATHS, wiki('COVID-19_pandemic_deaths')],
    }),
    on('delta-voc', '2021-05-11', 'Delta a variant of concern', {
      tags: ['variant', 'who'],
      color: BRICK,
      notes:
        'WHO designates the **B.1.617** lineage a **variant of concern**; B.1.617.2 (**Delta**) remains one, and becomes dominant worldwide in 2021.',
      sources: [WHO_EPI_42, WHO_VARIANTS, wiki('SARS-CoV-2_Delta_variant')],
    }),
    on('greek', '2021-05-31', 'Greek letters for variants', {
      tags: ['variant', 'who'],
      color: BRICK,
      notes:
        'WHO announces simple labels for variants of interest and concern, letters of the **Greek alphabet**, so that they need not be named after the places they were first found.',
      sources: [WHO_LABELS, wiki('Variants_of_SARS-CoV-2')],
    }),
    on('deaths-4m', '2021-07-07', '4 million confirmed deaths', {
      tags: ['milestone'],
      color: GREY,
      notes: 'Confirmed deaths worldwide pass **four million**.',
      ...tally,
      sources: [JHU, OWID_DEATHS, wiki('COVID-19_pandemic_deaths')],
    }),
    on('olympics-open', '2021-07-23', 'Tokyo Olympics open', {
      tags: ['measures'],
      notes:
        'The postponed **Tokyo 2020** Games open a year late, with spectators barred from almost all venues.',
      sources: [wiki('2020_Summer_Olympics')],
    }),
    on('comirnaty-approved', '2021-08-23', 'First full US approval', {
      tags: ['vaccine'],
      color: GREEN,
      notes:
        'The **FDA** fully approves the Pfizer–BioNTech vaccine, as **Comirnaty**, for people 16 and older: the first COVID-19 vaccine approved in the US.',
      sources: [wiki('Pfizer–BioNTech_COVID-19_vaccine')],
    }),
    on('deaths-5m', '2021-11-01', '5 million confirmed deaths', {
      tags: ['milestone'],
      color: GREY,
      notes: 'Confirmed deaths worldwide pass **five million**.',
      ...tally,
      sources: [JHU, OWID_DEATHS, wiki('COVID-19_pandemic_deaths')],
    }),
    on('molnupiravir', '2021-11-04', 'First oral antiviral authorised', {
      tags: ['science'],
      color: GREEN,
      notes:
        'The UK **MHRA** authorises **molnupiravir**, the first oral antiviral for COVID-19 to be authorised.',
      sources: [wiki('Molnupiravir')],
    }),

    h('h-omicron', '2021-11-20', 'Omicron'),
    on('sa-report', '2021-11-24', 'South Africa reports B.1.1.529', {
      tags: ['variant'],
      color: BRICK,
      notes:
        'South Africa reports a new, heavily mutated variant, **B.1.1.529**, to WHO, found by genomic surveillance in South Africa and Botswana.',
      sources: [WHO_OMICRON, wiki('SARS-CoV-2_Omicron_variant')],
    }),
    on('omicron', '2021-11-26', 'Omicron a variant of concern', {
      tags: ['variant', 'who'],
      color: BRICK,
      notes:
        'On the advice of its Technical Advisory Group on Virus Evolution, WHO designates B.1.1.529 a **variant of concern** and names it **Omicron**.',
      sources: [WHO_OMICRON, WHO_VARIANTS, ECDC_VARIANTS],
    }),
    on('paxlovid', '2021-12-22', 'Paxlovid authorised in the US', {
      tags: ['science'],
      color: GREEN,
      notes:
        'The **FDA** authorises **Paxlovid** (nirmatrelvir with ritonavir), an oral antiviral, for emergency use.',
      sources: [wiki('Nirmatrelvir/ritonavir')],
    }),
    on('record-week', '2022-01-17', 'The most cases reported in a week', {
      tags: ['milestone', 'spread'],
      color: GREY,
      notes:
        'In the week from 17 January 2022, more than 21 million new cases are reported to WHO, the most in any week of the pandemic, as Omicron spreads.',
      datePrecision:
        'The week of 17–23 January 2022, as WHO’s weekly epidemiological updates reported it; testing varied widely, so reported cases understate infections.',
      sources: [
        'https://www.who.int/publications/m/item/weekly-epidemiological-update-on-covid-19---25-january-2022',
        OWID_CASES,
      ],
    }),
    on('deaths-6m', '2022-03-07', '6 million confirmed deaths', {
      tags: ['milestone'],
      color: GREY,
      notes: 'Confirmed deaths worldwide pass **six million**.',
      ...tally,
      sources: [JHU, OWID_DEATHS, wiki('COVID-19_pandemic_deaths')],
    }),
    on('excess', '2022-05-05', 'WHO estimates 14.9 million excess deaths', {
      tags: ['who', 'milestone'],
      color: GREY,
      notes:
        'WHO **estimates** that about **14.9 million** excess deaths (range 13.3 to 16.6 million) were associated with the pandemic in 2020 and 2021, nearly three times the 5.4 million COVID-19 deaths reported for those years. It is an estimate, not a count.',
      sources: [WHO_EXCESS, 'https://doi.org/10.1038/s41586-022-05522-2'],
    }),
    on('sago', '2022-06-09', 'SAGO’s preliminary report on origins', {
      tags: ['who', 'science'],
      notes:
        'WHO’s **Scientific Advisory Group for the Origins of Novel Pathogens** (SAGO) publishes a preliminary report and recommends further studies. Its 2025 assessment also found the origin not established; it remains under investigation and is debated.',
      sources: [
        wiki('Scientific_Advisory_Group_for_the_Origins_of_Novel_Pathogens'),
        WHO_SAGO_2025,
      ],
    }),
    on('bivalent-uk', '2022-08-15', 'First bivalent booster authorised', {
      tags: ['vaccine'],
      color: GREEN,
      notes:
        'The UK **MHRA** authorises a **bivalent** Moderna booster, targeting both the original virus and Omicron BA.1: the first such vaccine authorised.',
      sources: [wiki('Moderna_COVID-19_vaccine')],
    }),
    on('bivalent-us', '2022-08-31', 'US authorises bivalent boosters', {
      tags: ['vaccine'],
      color: GREEN,
      notes:
        'The **FDA** authorises bivalent Moderna and Pfizer–BioNTech boosters that target the original virus and Omicron BA.4 and BA.5.',
      sources: [wiki('COVID-19_vaccination_in_the_United_States')],
    }),
    on('china-eases', '2022-12-07', 'China eases its measures', {
      tags: ['measures'],
      notes:
        'China’s National Health Commission announces ten measures that end most mass testing, centralised quarantine and travel limits under its **dynamic zero-COVID** policy.',
      sources: [wiki('Zero-COVID')],
    }),

    h('h-end', '2023-01-01', 'The end of the emergency'),
    on('china-reopens', '2023-01-08', 'China reopens its borders', {
      tags: ['measures'],
      notes:
        'China ends quarantine for arrivals and reclassifies COVID-19 as a less serious, Class B infectious disease.',
      sources: [wiki('Zero-COVID')],
    }),
    on('ec-jan-2023', '2023-01-30', 'WHO: still an emergency', {
      tags: ['who'],
      notes:
        'After its fourteenth meeting, the Emergency Committee advises that the pandemic is still a PHEIC, and WHO’s Director-General agrees, while noting it was probably approaching an inflection point.',
      sources: [wiki('Public_health_emergency_of_international_concern')],
    }),
    on('us-plan', '2023-01-30T12:00:00Z', 'US sets an end date', {
      tags: ['measures'],
      notes:
        'The US administration announces that it plans to end the public health emergency on **11 May 2023**.',
      datePrecision: '30 January 2023; drawn at noon, apart from WHO’s statement the same day.',
      sources: [wiki('COVID-19_pandemic_in_the_United_States')],
    }),
    on('jhu-ends', '2023-03-10', 'Johns Hopkins stops counting', {
      tags: ['milestone'],
      color: GREY,
      notes:
        'The **Johns Hopkins CSSE** dashboard, a reference count since January 2020, stops collecting data, at about 676 million cases and 6.88 million deaths reported worldwide.',
      sources: [JHU, JHU_PAPER],
    }),
    on('no-voc', '2023-03-15', 'No variant of concern circulating', {
      tags: ['variant', 'who'],
      color: BRICK,
      notes:
        'WHO updates its variant tracking: Alpha to Delta and the original Omicron lineage are now **previously circulating** variants of concern, and Omicron’s sublineages are tracked on their own.',
      sources: [WHO_VARIANTS],
    }),
    on('pheic-end', '2023-05-05', 'WHO: no longer a global emergency', {
      tags: ['who'],
      color: OCHRE,
      notes:
        'Tedros, on the Emergency Committee’s advice, declares that COVID-19 is **no longer a PHEIC**, after three years and three months. Nearly **7 million** deaths had been reported to WHO; WHO said the true toll was several times higher, and that the disease remained a global health threat.',
      sources: [WHO_END, wiki('COVID-19_pandemic')],
    }),
    on('us-phe-end', '2023-05-11', 'US public health emergency ends', {
      tags: ['measures'],
      color: OCHRE,
      notes:
        'The US federal **public health emergency** for COVID-19, in place since January 2020, expires.',
      sources: [
        'https://www.hhs.gov/about/news/2023/05/09/fact-sheet-end-of-the-covid-19-public-health-emergency.html',
        'https://www.cdc.gov/coronavirus/2019-ncov/your-health/end-of-phe.html',
      ],
    }),
  ];

  const lockdown = (id, start, end, title, notes, sources = [LOCKDOWNS]) =>
    d(id, at(start), at(end), title, { tags: ['measures'], color: NAVY, notes, sources });
  const wave = (id, start, end, title, notes) =>
    d(id, at(start), at(end), title, {
      tags: ['spread'],
      color: BRICK,
      notes: `${notes} ${waveNote}`,
      sources: [OWID_CASES, OWID_DEATHS],
    });
  const durations = [
    d(
      'pheic',
      at('2020-01-30'),
      at('2023-05-05'),
      'A public health emergency of international concern',
      {
        tags: ['who'],
        color: OCHRE,
        notes: 'From WHO’s declaration on 30 January 2020 to its end on 5 May 2023: 1,191 days.',
        sources: [WHO_PHEIC, WHO_END],
      },
    ),
    d('us-phe', at('2020-01-31'), at('2023-05-11'), 'US public health emergency', {
      tags: ['measures'],
      color: OCHRE,
      notes:
        'Declared by the Secretary of Health and Human Services on 31 January 2020 (effective from 27 January) and renewed every 90 days until it expired on 11 May 2023.',
      sources: [wiki('COVID-19_pandemic_in_the_United_States')],
    }),
    d(
      'genome-dose',
      at('2020-01-11T01:05:00Z'),
      at('2020-12-08T06:31:00Z'),
      'From genome to first authorised dose',
      {
        tags: ['science', 'vaccine'],
        color: GREEN,
        notes:
          'From the genome’s publication on 11 January 2020 to Margaret Keenan’s dose on 8 December: 332 days. By the calendar, the first trial dose came 65 days after the genome, and the first authorisation 326 days after it.',
        sources: [
          'https://virological.org/t/novel-2019-coronavirus-genome/319',
          wiki('COVID-19_vaccine'),
        ],
      },
    ),
    d('joint-mission', at('2020-02-16'), at('2020-02-24'), 'WHO–China Joint Mission', {
      tags: ['who'],
      color: GREY,
      notes: 'International and Chinese experts visit Beijing, Wuhan and two other cities.',
      sources: [WHO_TIMELINE],
    }),
    d('diamond-princess', at('2020-02-05'), at('2020-03-01'), 'Diamond Princess quarantine', {
      tags: ['measures', 'spread'],
      color: NAVY,
      notes:
        'The cruise ship is quarantined at **Yokohama**; more than 700 of the 3,700 people on board are infected. The last passengers and crew leave on 1 March.',
      sources: [wiki('COVID-19_pandemic_on_Diamond_Princess')],
    }),
    d('joint-study', at('2021-01-14'), at('2021-02-10'), 'WHO-convened origins study in Wuhan', {
      tags: ['who', 'science'],
      color: GREY,
      notes:
        'The international team’s visit to Wuhan, including two weeks of quarantine, for the joint study on origins.',
      sources: [WHO_ORIGINS_2021, wiki('Origin_of_SARS-CoV-2')],
    }),
    d('olympics', at('2021-07-23'), at('2021-08-08'), 'Tokyo 2020 Olympics', {
      tags: ['measures'],
      color: GREY,
      notes: 'Held a year late, from 23 July to 8 August 2021, almost entirely without spectators.',
      sources: [wiki('2020_Summer_Olympics')],
    }),
    d('paralympics', at('2021-08-24'), at('2021-09-05'), 'Tokyo 2020 Paralympics', {
      tags: ['measures'],
      color: GREY,
      notes: 'Held from 24 August to 5 September 2021.',
      sources: [wiki('2020_Summer_Paralympics')],
    }),
    lockdown(
      'wuhan',
      '2020-01-23T02:00:00Z',
      '2020-04-08',
      'Wuhan lockdown',
      'From 10 a.m. on 23 January to the lifting of the outbound travel ban on 8 April 2020: 76 days.',
      [wiki('COVID-19_lockdown_in_China')],
    ),
    lockdown(
      'italy',
      '2020-03-09',
      '2020-05-18',
      'Italy’s national lockdown',
      'Announced on 9 March 2020, the first national lockdown in Europe; eased from 4 May, with most limits on movement lifted on 18 May.',
      [wiki('COVID-19_lockdowns_in_Italy'), LOCKDOWNS],
    ),
    lockdown(
      'spain',
      '2020-03-14',
      '2020-05-09',
      'Spain’s lockdown',
      'Under a **state of alarm** declared on 14 March 2020; the strictest limits were eased in phases from May.',
    ),
    lockdown(
      'peru',
      '2020-03-16',
      '2020-06-30',
      'Peru’s lockdown',
      'A national lockdown from 16 March to 30 June 2020.',
    ),
    lockdown(
      'france',
      '2020-03-17',
      '2020-05-11',
      'France’s first confinement',
      'A national stay-at-home order from 17 March to 11 May 2020; France had two more, in autumn 2020 and spring 2021.',
    ),
    lockdown(
      'england',
      '2020-03-23',
      '2020-07-04',
      'England’s first lockdown',
      'Announced on 23 March 2020 and eased in steps from May; pubs and restaurants reopened on 4 July.',
    ),
    lockdown(
      'new-zealand',
      '2020-03-23',
      '2020-05-13',
      'New Zealand’s lockdown',
      'Alert levels 4 and 3, from the announcement on 23 March to the move to level 2 on 13 May 2020.',
    ),
    lockdown(
      'india',
      '2020-03-25',
      '2020-05-31',
      'India’s nationwide lockdown',
      'Announced for 21 days for 1.3 billion people, then extended in four phases to 31 May 2020; reopening began on 1 June.',
      [wiki('COVID-19_lockdown_in_India')],
    ),
    lockdown(
      'south-africa',
      '2020-03-26',
      '2020-04-30',
      'South Africa’s national lockdown',
      'The strictest level, from 26 March to 30 April 2020, then eased by alert levels.',
    ),
    lockdown(
      'melbourne',
      '2020-07-09',
      '2020-10-27',
      'Melbourne’s second lockdown',
      'From 9 July to 27 October 2020, with a night curfew from August. Across six lockdowns, Melbourne spent about 262 days in all under stay-at-home orders.',
    ),
    lockdown(
      'england-2',
      '2020-11-05',
      '2020-12-02',
      'England’s second lockdown',
      'Four weeks, from 5 November to 2 December 2020; a third followed from 6 January 2021.',
    ),
    lockdown(
      'shanghai',
      '2022-03-28',
      '2022-06-01',
      'Shanghai lockdown',
      'A citywide lockdown of about 25 million people, begun in two halves of the city, under China’s zero-COVID policy, until 1 June 2022.',
      [wiki('2022_Shanghai_COVID-19_outbreak'), wiki('Zero-COVID')],
    ),
    wave(
      'wave-1',
      '2020-03-01',
      '2020-05-31',
      'First global wave',
      'Cases rise across Europe, Iran and the Americas after spreading from China; reported deaths peak in mid-April 2020.',
    ),
    wave(
      'wave-winter',
      '2020-10-01',
      '2021-02-28',
      'Northern winter wave',
      'The largest wave until then, across Europe and the Americas; reported deaths peak in late January 2021.',
    ),
    wave(
      'wave-india',
      '2021-03-15',
      '2021-06-15',
      'India’s second wave',
      'Driven by Delta; India reports more than 400,000 cases a day at its peak in early May 2021, with shortages of oxygen and hospital beds.',
    ),
    wave(
      'wave-delta',
      '2021-06-15',
      '2021-10-15',
      'Delta wave',
      'Delta spreads worldwide and becomes the dominant variant.',
    ),
    wave(
      'wave-omicron',
      '2021-12-01',
      '2022-02-28',
      'Omicron wave',
      'Omicron BA.1 brings the most reported cases of the pandemic, peaking in late January 2022.',
    ),
    wave(
      'wave-ba5',
      '2022-06-01',
      '2022-08-31',
      'BA.5 wave',
      'Omicron’s BA.4 and BA.5 sublineages bring another rise in cases in many countries.',
    ),
    wave(
      'wave-china',
      '2022-12-01',
      '2023-01-31',
      'China’s winter wave',
      'A large wave in China after the easing of its zero-COVID measures in December 2022.',
    ),
  ];
  const relationships = [
    rel('onsets', 'wuhan-cluster'),
    rel('li-warns', 'li-dies'),
    rel('wuhan-cluster', 'who-don'),
    rel('novel-cov', 'genome'),
    rel('genome', 'first-vaccine-trial'),
    rel('genome', 'd:genome-dose'),
    rel('keenan', 'd:genome-dose'),
    rel('first-vaccine-trial', 'phase3'),
    rel('phase3', 'pfizer-interim'),
    rel('pfizer-interim', 'mhra'),
    rel('mhra', 'keenan'),
    rel('pfizer-interim', 'fda-eua'),
    rel('fda-eua', 'lindsay'),
    rel('name', 'ictv'),
    rel('ec-first', 'pheic'),
    rel('pheic', 'd:pheic'),
    rel('pheic', 'pandemic'),
    rel('ec-jan-2023', 'pheic-end'),
    rel('pheic-end', 'd:pheic'),
    rel('us-plan', 'us-phe-end'),
    rel('us-phe-end', 'd:us-phe'),
    rel('wuhan-lockdown', 'd:wuhan'),
    rel('d:joint-mission', 'mission-report'),
    rel('d:joint-study', 'origins-report'),
    rel('origins-report', 'sago'),
    rel('olympics-postponed', 'olympics-open'),
    rel('olympics-open', 'd:olympics'),
    rel('uk-variant', 'alpha'),
    rel('alpha', 'greek'),
    rel('beta', 'greek'),
    rel('gamma', 'greek'),
    rel('delta-voi', 'delta-voc'),
    rel('delta-voc', 'greek'),
    rel('delta-voc', 'd:wave-delta'),
    rel('sa-report', 'omicron'),
    rel('omicron', 'd:wave-omicron'),
    rel('act-a', 'covax-ghana'),
    rel('who-eul', 'covax-ghana'),
    rel('china-eases', 'china-reopens'),
    rel('china-eases', 'd:wave-china'),
    rel('deaths-5m', 'excess'),
  ];
  return {
    format: 'openchronology',
    version: 1,
    title: 'The COVID-19 pandemic, 2019–2023',
    description:
      'The COVID-19 pandemic worldwide, from the first reported cluster of pneumonia in Wuhan in December 2019 to the end of WHO’s public health emergency of international concern and of the US public health emergency in May 2023: WHO’s declarations, the spread, measures such as lockdowns, the science and the vaccines, the variants of concern and the waves they drove, and the counts. A sample timeline built from the sources cited on each moment: WHO statements and reports, regulators and public-health agencies, peer-reviewed papers, the Johns Hopkins CSSE and Our World in Data counts, and Wikipedia as the general reference.\n\n**How to read it.** Chapter headings mark the phases. Emergencies, lockdowns, waves and events are bands (ochre, navy, brick and grey); everything else is a moment. Green marks science and vaccines, brick the variants, grey the counts. Related things (a variant reported and its designation, an emergency declared and ended) are linked.\n\n**Dates and numbers.** Dates are UTC days unless a time is given. Counts are confirmed cases and deaths as reported, which understate the true numbers; WHO’s excess-mortality figure is an estimate and labelled so. Waves are approximate. The origin of the virus has not been established: it remains under investigation and is debated (see WHO’s SAGO reports). Measures are described with their dates, not judged.',
    presentation: {
      mode: 'gregorian',
      unit: '',
      scale: '1/1',
      origin: '0/1',
      version: 1,
      offsetMinutes: 0,
      significantDigits: 6,
    },
    tags: ['history', 'public health', 'covid-19', 'education'],
    plugins: [
      ...plugins(
        core.RICH_TEXT_NOTES,
        core.MOMENT_HEADINGS,
        core.MOMENT_COLORS,
        core.MOMENT_SOURCES,
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
