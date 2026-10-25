# timescale.info — privacy policy

Effective 25 October 2026. This policy describes how the hosted service at
https://timescale.info, and the desktop app when connected to it, collects, uses,
shares and keeps information. The service is operated by Athan Clark, an individual
(the "operator"). For any privacy question or request, write to
**privacy@timescale.info**.

The service runs on a server rented from DigitalOcean in the United States, which
holds its database, files and logs; information you give it is stored and processed
there.

When you create an account, or are asked to on a later visit, the service records which
version of the terms of service and this policy you agreed to (their effective date) and
when, as a record of that agreement, kept with the account.

## Information and purposes

The hosted service stores account usernames and identifiers, salted password
hashes when password login is used, verified email addresses, encrypted authenticator
secrets, hashed single-use recovery codes, confirmation/reset proofs, encrypted
transactional email jobs, linked identity-provider names and subject
identifiers, session records, and authorization-flow records. Password hashes are
not plaintext passwords. Google, GitHub, or Facebook sign-in contacts the provider
you choose; the provider can observe that authentication. The application uses
provider credentials server-side and does not give provider tokens to timeline
plugins. Provider privacy notices also apply to their own services.

## Google user data

If you choose **Sign in with Google** (or link Google to your account), the service
asks Google only for the `openid` and `profile` scopes. From Google's answer it keeps
just one thing: your Google account's stable identifier (the ID token's subject), linked
to your timescale.info account so that you can sign in with Google again. It does not
keep your name, email address, profile picture or any other Google profile data; it
does not request access to Gmail, Drive, contacts, calendars or any other Google service;
and it discards Google's access and ID tokens as soon as your identity is verified. Your
account gets a generated username, which you can change.

The service uses Google user data only to sign you in. It does not sell it, use it for
advertising, share it with anyone, or use it to train artificial intelligence or machine
learning models. Its use of information received from Google APIs adheres to the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including the Limited Use requirements. To remove it, unlink Google from Account →
Sign-in methods, or delete your account; you can also revoke the service's access at
https://myaccount.google.com/permissions. The same applies to GitHub and Facebook
sign-in, which keep only that provider's account identifier.

Resend processes recipient addresses and account verification, recovery, and security
notification email content for delivery. The server checks new passwords against
Have I Been Pwned using only a five-character hash prefix and padded responses;
it never sends a plaintext password or complete password hash to that service.
These services can observe the sending server's network address. Confirmation
proofs expire in 24 hours, reset proofs in 30 minutes, and pending MFA challenges
in five minutes. Temporary records are cleaned by the delivery worker. Authenticator
secrets and recovery-code hashes remain until replaced, disabled, or account removal.

The database stores the timelines you explicitly save: exact rational times,
titles, notes, tags, metadata, formatting scripts, plugin definitions, and links
to images (not copies of them). It also stores visibility, collaborator permissions, saved revision documents,
fork relationships and ancestry, proposed
and base snapshots, and discussion comments with account attribution. These support
editing, search, sharing, collaboration, and export. Private timelines are excluded
from the public browser and public full-text search. Site administrators can
access and manage private timelines; they are not encrypted from the operator.
Account profiles may contain an avatar image or HTTPS image URL. Remote avatar
hosts receive browser requests. Scoped API credentials are stored as hashes with
names, prefixes, permissions, expiry, revocation, and last-used timestamps. The
service also records per-user logical storage usage, quota exemptions, suspension
status, administrator privileges, and an audit trail of administration actions.
Secrets, passwords, and MFA codes are excluded from that audit trail.

Sign-up asks for your year of birth, to confirm you are old enough for an account and to
keep warnings before sensitive content on for accounts of people who may be under 18;
only the year is stored, with your choice of whether to see sensitive content without
warnings. A sign-up refused for its age is answered neutrally, and a hash of that
browser's sign-in token is kept for one day so that another answer from it is refused
too; nothing else about the refused sign-up is kept. The service computes an account standing (from account age, confirmation,
two-factor authentication, stars and forks received, and moderation decisions) to rank
public timelines; only administrators see it. Reports record what was reported, the
category and any details you give, and your account if you were signed in; the owner of
what you report is not told who reported it. Moderation decisions keep their reason,
who decided, any review request and its outcome, as a record. Reports and decisions are
kept while needed to moderate and as required by law.

IP addresses are processed for connection handling and abuse prevention; temporary
authentication rate-limit keys are hashed. The web server (nginx) logs each request's
IP address, time, address requested, response status and size, referring page and
browser identification; these logs are rotated daily and deleted after 14 days. The
application's own service log records errors and operational events and is limited
in size, so its oldest entries are removed as it fills. Support,
privacy, and abuse reports may contain the information you provide and are used
to respond and investigate. If the operator turns on Cloudflare Turnstile for
human-verification challenges (instead of the built-in proof of work), your browser
loads Cloudflare's challenge when one is asked for, and Cloudflare receives network
and device information to tell people from automated traffic, under its own privacy
policy. The service includes no advertising, and analytics only as described below.

## Local storage, cookies, and offline editions

Browser session cookies authenticate requests; anti-forgery and short-lived
authorization-flow values secure login. Server sessions have a 14-day absolute
expiry and become invalid after one day of inactivity. Users can revoke sessions.
The browser keeps editing drafts and authentication-return state in local storage
facilities. Clearing site storage removes local drafts and can sign you out.
The application does not include advertising cookies or cross-site tracking code.
The site uses Google Analytics, but first asks whether you allow
analytics cookies. Only if you accept does your browser load Google's script, which
sets Google Analytics cookies and sends Google the pages you visit, with network and
device information. Google signals and ad personalization are turned off, and
timeline content is never sent. Your choice is kept in your browser; "Analytics
settings" in the footer changes it.

The standalone HTML edition processes timelines on your device and blocks network
connections. It includes embedded assets and legal notices. It cannot use the
online catalogue or missing external images. The desktop edition stores local
.och SQLite files and can connect to the server you select; connecting and saving
to a server share data with that operator. A local file is not automatically
uploaded. Exported .och and .ochx files are not encrypted by the application and
include timeline scripts and embedded assets. Access and account credentials are
not exported as timeline settings. Your browser, operating system, backups, and
chosen storage locations have their own data practices.

## Who can receive data

Public timeline content and its discussions are available to anyone and can be
downloaded and indexed outside the service. Private content is available to the
people the owner authorizes. Operators and necessary hosting/database providers
can access stored data for service operation; this is not end-to-end encryption.
The operator does not receive ownership of that content. Provider services process
authentication requests when selected. Information may be disclosed when required
by law or necessary to respond to security abuse or protect legal rights, subject
to applicable law and appropriate limits.

Moment image URLs can request images from third-party HTTPS hosts in connected
editions. Those hosts see network information, including an IP address and requested
URL; image requests omit browser credentials and referrers. Opening an original
image source visits that site under its own policies. The server stores image links,
not copies; exports to your own files may embed a browser-created image copy if the
host allows it. Plugin scripts run
through a restricted interpreter without direct network, DOM, or import access;
host-rendered image fields can still cause these image requests. Published plugin
definitions are public independently of private timelines using them.

## Retention and choices

Saved timelines remain until the owner deletes them or operator-assisted removal
is required. Deleting a timeline removes its live events, recommendations, and
comments through database cascades, together with unreferenced history belonging
to that timeline. Independently owned forks and submitted snapshots on other
timelines remain; ancestry needed by those forks and reviews is retained. A public
review exposes its submitted snapshot, not the source fork's other private history.
Revoking upstream access stops future reads and synchronization but does not erase
copies already made. Do not assume closing a recommendation deletes its snapshots or
comments.

You can delete your own comments at any time, from the pull request they are on. You can
delete your account from Account → Delete your account, confirming with your username,
your password and, if two-factor authentication is on, a code. Deleting it deletes at once
the timelines you own (as deleting each would), the pull requests and comments you wrote
on other timelines, your published plugins and suites, stars, memberships, API keys,
sign-in methods, sessions and security records. Kept: changes already merged into other
people's timelines, which are part of their history (it names an account that no longer
exists), others' forks of your timelines, and moderation records, which no longer name
you. The last administrator of an installation cannot delete their account. Other
requests, such as about content of yours elsewhere, go to privacy@timescale.info. Expired login flows and sessions are cleaned by authentication
operations, rather than guaranteed immediate physical erasure at expiry.

The operator takes copies of the database (backups) before upgrades, kept on the
service's server with restricted access. Data you delete can remain in a backup taken
before the deletion until that backup is deleted; backups are used only to restore the
service. Logs are kept as described above. Necessary legal holds may delay deletion
with limited access.
Recipient copies, search engines, and files you export are outside the operator's
control. Export your timelines before deletion; keep local backups if needed.

Depending on applicable law, you may request access, correction, deletion,
restriction, portability, or object to processing and complain to a competent
privacy regulator. The operator will verify requests without requiring unnecessary
information and respond within applicable deadlines. Service delivery, security,
and legal obligations are the purposes; where GDPR applies, the intended bases are
contract necessity, legitimate interests in secure operation subject to balancing,
and legal obligations, with consent for optional processing where required. Send
requests to privacy@timescale.info. Information is processed in the United States;
using the service from elsewhere transfers your information there.

Accounts are for people aged 13 or older; the service does not knowingly offer
accounts to children under 13. A sign-up giving a year of birth under 13 is refused,
and an account created through a social sign-in that does so is closed before it can be
used. Report suspected accounts of children under 13 to the operator so they can be
investigated and addressed under applicable law.

Accounts of people who may be under 18 get high-privacy settings by default that they
cannot change: warnings before sensitive content always show, the timelines they star
are not shown on their profile, and browsing leaves out labelled timelines. For everyone,
timelines start private, profiles show only a username and an optional avatar, and the
service collects no location, has no private messaging, and does no profiling for
advertising. The year of birth is used only for these settings and the age requirement.
This is not a claim that an age question alone satisfies children's privacy or
online-safety laws.

## Changes and contact

Material changes to this policy are announced on the service before they take effect,
with the new effective date; existing data is not repurposed incompatibly without the
necessary legal basis. Questions, requests and complaints about privacy:
**privacy@timescale.info**. Security reports and copyright or abuse reports: see the
[copyright, abuse and security page](/legal#copyright).
