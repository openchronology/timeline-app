# Operator publication checklist

These policies are reviewable drafts, not assertions that timescale.info is
already operating or that legal registrations have been completed. They intentionally
avoid invented contact addresses, corporate status, hosting vendors, and jurisdiction.
Copyright and GPL software licensing take effect independently of this draft status.

Before making the hosted policies effective:

- Supply Athan Clark's monitored support/privacy/abuse/security contact and required
  operator/business mailing information. A service address can avoid publishing a
  residential address where permitted. Confirm governing jurisdiction and applicable
  consumer/privacy rules; get legal review appropriate to the intended user regions.
- Replace draft labels with an effective date and archive prior policy versions.
  Establish a notice/acceptance process for account creation, including social login;
  the current interface presents policies but does not record contractual acceptance.
- Configure Resend with a verified sending domain, scoped API key, SPF/DKIM and
  appropriate DMARC. Back up the authentication encryption key separately, run
  the delivery worker, and test confirmation, recovery, and MFA end to end.
- Confirm hosting/database/backup/email/log providers, locations, access controls,
  log fields and concrete retention/removal schedules. Document processors,
  international transfers, and representatives where required. Ensure contracts and
  actual configuration match the public privacy notice.
- Establish identity verification, export, correction, complaint, appeal,
  breach-response, and legal-hold procedures. Deleting timelines, one's own comments and
  one's own account is self-service (PRIVACY.md); a copy of all of an account's data at
  once is not (each timeline exports separately), so access and portability requests
  need operator work. Do not promise self-service functions that do not exist.
- Decide whether to use a US DMCA designated agent. If so, register and publish
  matching required contact details, track renewal deadlines, and establish the
  notice/counter-notice and repeat-infringer process before relying on safe harbor.
  Registration alone does not satisfy every condition.
- Confirm the 13+ account policy, handling of suspected accounts of children under 13,
  and regional age requirements. Sign-up asks for a year of birth (self-declared): it
  is not age verification or parental consent, and accounts that may be under 18 always
  see sensitive-content warnings. Review this against the regions served (for example
  higher digital-consent ages under the GDPR in some EU countries).
- US COPPA (the amended rule, in force since 22 April 2026): the service is for a
  general audience and refuses accounts under 13 through a neutral age screen (no hint
  of the age needed; a refused browser is refused again for a day). If the operator
  learns an account belongs to a child under 13, close it and delete its data. Keep a
  written information security program and a data retention policy anyway; the rule
  requires both of services it covers, and they are good practice for any.
- UK Age Appropriate Design Code (Children's Code): write a data protection impact
  assessment covering under-18 users, and keep the high-privacy defaults for accounts
  that may be under 18 (TERMS.md, Young people). Review it with RISK-ASSESSMENT.md.
- US state laws on minors and social media: about twenty states have them, many
  enjoined or in litigation, and their definitions of a social media platform vary.
  Check, for the states served, whether the service meets their definitions (most
  exclude services whose main purpose is not social interaction, or that are
  educational): for example Texas's SCOPE Act (HB 18), New York's SAFE for Kids Act
  (its rules on feeds for minors take effect 25 January 2027), and Utah, Louisiana,
  Texas and Alabama's app store accountability laws if the desktop app is distributed
  through an app store.
- Australia's social media minimum age (under 16, since 10 December 2025): the service
  is likely outside it (its purpose is not social interaction, and educational services
  are excluded), but record the reasoning before offering accounts there.
- Content policy (TERMS.md): no pornography or gratuitous gore; educational depictions
  allowed when labelled. Keep it that way to stay outside age-verification laws for
  pornography (US state laws, the UK Online Safety Act's pornography duties) and
  18 U.S.C. 2257 record-keeping; allowing explicit material would require them.
- Register as an electronic service provider with NCMEC's CyberTipline before launch, so
  apparent child sexual abuse material can be reported as 18 U.S.C. 2258A requires, and
  follow the procedure in docs/moderation.md (restrict, preserve for one year, report;
  never copy or forward the material). Name who reviews the report queue and how often;
  reports of child abuse and other illegal content are listed first.
- UK Online Safety Act: complete and keep current the illegal-content risk assessment and
  the children's access and risk assessments (template: RISK-ASSESSMENT.md), and keep
  reporting and complaints working (Report, the review queue, review requests). The terms
  describe how users and children are protected, how moderation decides, and the
  complaints procedure (TERMS.md: Young people; How content is moderated; Complaints).
- EU Digital Services Act: publish a single point of contact for authorities and users,
  keep notice-and-action (Report) and statements of reasons (the owner's notice and
  email) working, and publish the moderation policy (TERMS.md acceptable use).
- Publish matching Corresponding Source alongside browser/desktop/container releases
  and preserve dependency copyright/license notices. See docs/licensing.md.
- Check domain ownership and name conflicts; no registered trademark is asserted.
  A future nonprofit requires real formation and any intended copyright assignments,
  operator disclosure, and data-transfer review. This repository does not assign
  rights automatically to an entity that does not yet exist.

Primary references used for this draft:

- GNU GPLv3 and application guidance: https://www.gnu.org/licenses/gpl-3.0.html
  and https://www.gnu.org/licenses/gpl-howto.html
- FTC privacy guidance: https://www.ftc.gov/business-guidance/privacy-security/consumer-privacy
- FTC children's privacy guidance (including current COPPA changes):
  https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- US Copyright Office notice-and-takedown resources:
  https://www.copyright.gov/512/index.html and https://copyright.gov/dmca-directory/

These sources explain specific obligations; they do not establish that any one
deployment satisfies every law. Have the finished policies reviewed after the
operator, deployment, and intended markets are confirmed.
