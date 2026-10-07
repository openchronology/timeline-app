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
- Establish identity verification, export, account deletion, correction, complaint,
  appeal, breach-response, and legal-hold procedures. Timeline deletion is implemented;
  account deletion and removal of library definitions/discussion require operator
  work. Do not promise self-service functions that do not exist.
- Decide whether to use a US DMCA designated agent. If so, register and publish
  matching required contact details, track renewal deadlines, and establish the
  notice/counter-notice and repeat-infringer process before relying on safe harbor.
  Registration alone does not satisfy every condition.
- Confirm the adult-only service policy, handling of suspected child accounts, and
  regional age requirements. No age-verification or parental-consent flow is
  implemented; eligibility language alone is not a compliance mechanism.
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
