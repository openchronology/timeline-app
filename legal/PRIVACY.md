# timescale.info — privacy notice

Draft version: 2026-10-06. Not yet effective. Responsible operator: Athan Clark,
an individual. Public privacy contact, hosting providers, hosting region, and
backup/log retention schedules are pending confirmation; see LAUNCH.md.

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

Resend processes recipient addresses and account verification, recovery, and security
notification email content for delivery. The server checks new passwords against
Have I Been Pwned using only a five-character hash prefix and padded responses;
it never sends a plaintext password or complete password hash to that service.
These services can observe the sending server's network address. Confirmation
proofs expire in 24 hours, reset proofs in 30 minutes, and pending MFA challenges
in five minutes. Temporary records are cleaned by the delivery worker. Authenticator
secrets and recovery-code hashes remain until replaced, disabled, or account removal.

The database stores the timelines you explicitly save: exact rational times,
titles, notes, tags, metadata, formatting scripts, plugin definitions, and embedded
images. It also stores visibility, collaborator permissions, saved revision documents,
fork relationships and ancestry, proposed
and base snapshots, and discussion comments with account attribution. These support
editing, search, sharing, collaboration, and export. Private timelines are excluded
from the public browser and public full-text search.

IP addresses are processed for connection handling and abuse prevention; temporary
authentication rate-limit keys are hashed. Hosting providers and reverse proxies
may generate request and security logs. The deployment must document their actual
fields, recipients, and retention before this notice becomes effective. Support,
privacy, and abuse reports may contain the information you provide and are used
to respond and investigate. The application includes no advertising or analytics
integration; a deployment adding either must update this notice and meet applicable
consent requirements before doing so.

## Local storage, cookies, and offline editions

Browser session cookies authenticate requests; anti-forgery and short-lived
authorization-flow values secure login. Server sessions have a 14-day absolute
expiry and become invalid after one day of inactivity. Users can revoke sessions.
The browser keeps editing drafts and authentication-return state in local storage
facilities. Clearing site storage removes local drafts and can sign you out.
The application does not include advertising cookies or cross-site tracking code.

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
image source visits that site under its own policies. Export or server-save actions
may embed a browser-created image copy if the host allows it. Plugin scripts run
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
copies already made. Account deletion is not currently self-service;
request it using the privacy contact when published. Requests concerning comments
on other owners' timelines require operator review, balancing applicable rights
and discussion integrity. Do not assume closing a recommendation deletes its
snapshots or comments. Expired login flows and sessions are cleaned by authentication
operations, rather than guaranteed immediate physical erasure at expiry.

Backup deletion and log retention depend on the deployment and must be specified
before public launch. Necessary legal holds may delay deletion with limited access.
Recipient copies, search engines, and files you export are outside the operator's
control. Export your timelines before deletion; keep local backups if needed.

Depending on applicable law, you may request access, correction, deletion,
restriction, portability, or object to processing and complain to a competent
privacy regulator. The operator will verify requests without requiring unnecessary
information and respond within applicable deadlines. Service delivery, security,
and legal obligations are the purposes; where GDPR applies, the intended bases are
contract necessity, legitimate interests in secure operation subject to balancing,
and legal obligations, with consent for optional processing where required. Hosting
locations, international-transfer mechanisms, and any required representatives must
be confirmed before offering the service in jurisdictions requiring them.

The hosted service is intended for adults aged 18 or older and does not knowingly
offer accounts to children. Report suspected collection from children to the
operator so it can be investigated and addressed under applicable law. This is
not a claim that an age restriction alone satisfies children's privacy laws.

Material privacy changes must describe the new practices before they take effect;
existing data must not be repurposed incompatibly without the necessary legal basis.
