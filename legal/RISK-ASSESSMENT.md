# Online safety risk assessment (template)

A working template for the operator of a hosted installation, such as timescale.info. Use it for the UK Online Safety Act's illegal-content risk assessment and its children's access and risk assessments, and as a record for other regimes. It is not legal advice. Ofcom's current guidance and risk profiles are the reference; review this against them, and again whenever the service changes in a way that affects risk. Record the date and who reviewed it each time.

Assessment date: \_\_\_\_ · Reviewed by: \_\_\_\_ · Next review: \_\_\_\_

## 1. The service

- **What it is:** a user-to-user service. Accounts create timelines (moments and durations with text, tags, metadata and image links), make them public or share them, fork them, propose changes and comment on pull requests, and publish plugins and plugin suites. Anyone can read public timelines without an account.
- **Users:** accounts 13 and older (year of birth asked at sign-up). Readers of any age.
- **Size:** UK users (monthly), total accounts, public timelines: \_\_\_\_
- **Features that change risk:**
  - public timelines;
  - comments;
  - embeds on other sites;
  - search;
  - forks;
  - images linked from other hosts;
  - published plugins (restricted scripts, no network access).

  It has no private messaging, live streaming or contact between strangers outside public comments.

## 2. Illegal content

For each kind of priority illegal content in Ofcom's risk profiles, record how likely it is to appear here, how severe it would be, and what reduces it.

| Kind (examples)                               | Likelihood here | Impact | Measures                                                                                                                                                              | Residual risk |
| --------------------------------------------- | --------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Child sexual abuse material and exploitation  |                 |        | Content policy (TERMS.md); Report with a child-abuse category, listed first; restriction at once; NCMEC reporting and preservation (docs/moderation.md); accounts 13+ |               |
| Terrorism content                             |                 |        | Report (illegal content); restriction; account suspension                                                                                                             |               |
| Hate, harassment, threats                     |                 |        | Report; comment removal; suspension; account standing (new accounts not in browsing)                                                                                  |               |
| Fraud, spam, malware links                    |                 |        | Report (spam); standing; human-verification challenges; rate limits; plugins run without network access                                                               |               |
| Intimate image abuse                          |                 |        | Content policy; Report; restriction                                                                                                                                   |               |
| Encouraging or assisting suicide or self-harm |                 |        | Report (self-harm category); restriction                                                                                                                              |               |
| Other: \_\_\_\_                               |                 |        |                                                                                                                                                                       |               |

## 3. Children

- **Children's access assessment:**
  - Can children access the service? Reading needs no account; accounts are 13+.
  - Is the child user condition met? Record the reasoning and the evidence (Ofcom expects most services without highly effective age assurance to meet it).
- **Content harmful to children** (pornography, suicide, self-harm, eating disorders, violence, and the rest of Ofcom's list), with measures:
  - **Prohibited:** pornography and gore for its own sake (TERMS.md).
  - **Allowed but labelled:** educational depictions of nudity, violence and disturbing events. Readers get a warning before a labelled timeline opens, its images stay blurred until shown, and it is left out of featured timelines and of browsing by signed-out readers and accounts under 18.
  - **Minors' accounts:** accounts of people who may be under 18 always see these warnings.
  - **Moderators** can add labels the owner cannot remove.
- **Residual risk and further measures:** \_\_\_\_

## 4. Reporting, complaints and moderation

| Item                                                        | Where it stands                                                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Reporting                                                   | Report on timelines, moments, durations, comments, plugins, suites and accounts, open to anyone (docs/moderation.md) |
| Decisions                                                   | Dismiss, label, restrict, suspend; reasons to the owner; one review request                                          |
| Who reviews the queue                                       | \_\_\_\_                                                                                                             |
| How often it is reviewed                                    | \_\_\_\_                                                                                                             |
| Target response time (urgent: child abuse, illegal content) | \_\_\_\_                                                                                                             |
| Target response time (other)                                | \_\_\_\_                                                                                                             |
| Records kept                                                | `oc_moderation_cases`, `oc_reports`, `oc_admin_audit`                                                                |
| Retention of records                                        | \_\_\_\_                                                                                                             |

## 5. Actions and review

| Action | Owner | Due |
| ------ | ----- | --- |
|        |       |     |
