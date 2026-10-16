# Reports and moderation

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

Anyone who can see something on the platform can report it to the site's administrators. They review reports in **Site administration → Reports** and decide what happens. The design and the law behind it are in [#115](https://github.com/openchronology/timeline-app/issues/115).

## Reporting

**Report** appears on:

| What                        | Where                                                                  |
| --------------------------- | ---------------------------------------------------------------------- |
| A timeline                  | Its page, beside **Share** (not for its owner)                         |
| A moment or duration        | Its details in the editor, beside **Share**                            |
| A comment on a pull request | Under the comment                                                      |
| A plugin or suite           | Its card in the plugin library (published ones; not the official ones) |
| An account                  | Its profile page                                                       |

A report says what is wrong, from a fixed list:

- child sexual abuse or exploitation;
- other illegal content;
- sexually explicit content;
- graphic violence or gore;
- promotes suicide or self-harm;
- harassment, threats or private information;
- spam or misleading;
- copyright infringement;
- something else.

It can also add up to 2,000 characters of details.

- **Who can report:** signed-out readers can report. They answer the site's human-verification challenge first, if one is configured (`docs/administration.md`).
- **Rate limits:** reporting is limited to ten reports a minute per account, or per address when signed out.
- **Reporting again:** a signed-in reader who reports the same thing again replaces their earlier report.
- **What can't be reported:** your own things (change or delete them instead), and things you can't see.
- **Anonymity:** the owner is never told who reported.

## Reviewing

Reports of the same thing gather in one **case**. A moment's or duration's report belongs to its timeline's case and says which moment or duration it names.

The queue has three views:

| View                    | Shows                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Awaiting a decision** | Open cases, and restrictions whose owner asked for a review. Cases reporting child abuse or other illegal content come first, then the oldest. |
| **Restricted**          | Restrictions in force.                                                                                                                         |
| **Closed**              | Dismissed cases, and restrictions that were lifted.                                                                                            |

Each case shows:

- what was reported, with a link (a comment's text is quoted);
- its owner;
- the latest twenty reports: their categories, details, who reported them (or "signed out"), and the moment or duration named.

Decisions use the same confirmation as other administration changes: a sign-in within the last five minutes, the current password, and a fresh authenticator or recovery code when two-factor authentication is on. Each decision is recorded in `oc_admin_audit` (action `reports`).

### Dismiss

No rule was broken; the case closes. The reason is kept as a note on the record and isn't sent to anyone. Reporters are told nothing was changed. The owner isn't told.

### Restrict

Requires a reason, which is sent to the owner as the statement of reasons. What it does depends on the kind of thing:

| Kind            | Effect                                                                                                                                                                                                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Timeline        | Becomes private. Only its owner and administrators can open it; members, readers, search, embeds and the sitemap no longer see it. Neither the owner nor an administrator can make it public while restricted. The owner can still edit it (to remove what was reported) and sees a notice on its page. |
| Comment         | Keeps its place in the discussion, shown as "Removed by moderators".                                                                                                                                                                                                                                    |
| Plugin or suite | Leaves the library (search and install), and new versions are refused. Copies already installed in timelines stay.                                                                                                                                                                                      |
| Account         | Suspended, as in the Users view: its sessions, API keys and pending desktop sign-ins end. The last active administrator can't be suspended.                                                                                                                                                             |

New reports about a restricted thing join its case rather than opening another. While a restriction is in force, its owner is not [established](browsing.md): browsing leaves out their public timelines, and their stars count for nothing.

### Label

For a timeline only: when what was reported is allowed but should carry a warning (educational nudity, a war's photographs), label it instead of restricting it. Choose what it contains (nudity, graphic violence, disturbing content) and give a reason, which is sent to the owner. Its owner cannot remove these labels; they show under **Sharing & settings** as added by moderators. What labels do is described under [sensitive-content labels](#sensitive-content-labels).

### Reviews and lifting

The owner can ask once for a review: from **Account → Moderation decisions**, or the link in the timeline's notice. A suspended account can't sign in, so its email asks it to contact the operator instead. The request appears under **Awaiting a decision**, where the administrator either:

- **keeps the restriction** (or the labels), or
- **lifts the restriction** (or **removes the labels**).

A restriction or labels can also be lifted at any time from **Restricted**. Lifting restores what the decision changed: a timeline's earlier visibility, a suspended account, or the labels moderators added (its owner's own labels stay).

## Sensitive-content labels

Educational, historical, medical, artistic and news depictions of nudity, violence and disturbing events are allowed when labelled; pornography and gore for its own sake are not ([#115](https://github.com/openchronology/timeline-app/issues/115)). Labels are **nudity**, **graphic violence** and **disturbing content**:

- **A timeline:** its owner sets them under **Sharing & settings → Sensitive content**; moderators add them from a report ([Label](#label)).
- **A moment or duration:** whoever can edit it sets them in its details, under **Sensitive content**. They are kept in its metadata (`content_labels`), so they travel with `.ochx` and `.och` files.

For readers who are not its owner or writers (adults can turn the warnings off under **Account → Sensitive content**; accounts that may be under 18 cannot, see [ages](#ages)):

| Labelled             | What readers get                                                                                                                                                                                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A timeline           | A warning before it opens (**Show timeline** or **Browse other timelines**). Its images stay blurred until **Show images** next to its save status. Both choices last until the browser tab closes. Embeds open behind the same warning. A comparison with a labelled source is labelled too. |
| A moment or duration | Its images (marker, hover card, details, duration background) stay blurred until **Show images**, and its details say what it contains.                                                                                                                                                       |

A labelled timeline is also:

- never **featured**, and left out of browsing by readers who aren't signed in or may be under 18 (search, links and profiles still find it, behind its warning);
- shown in timeline lists with a **Sensitive** badge;
- previewed in links as its title and labels alone, with no moment strip or excerpt, and no oEmbed thumbnail ([sharing](sharing.md#link-previews)).

## Who is told what

Emails go only to confirmed addresses, and only when email is configured (`RESEND_API_KEY`, `AUTH_EMAIL_FROM`):

| Event          | Owner                                                    | Signed-in reporters              |
| -------------- | -------------------------------------------------------- | -------------------------------- |
| Restricted     | What, the reason, what it means, how to ask for a review | That it was restricted           |
| Dismissed      | —                                                        | That it does not break the rules |
| Review decided | Whether it was kept or lifted                            | —                                |
| Lifted         | That it is as it was                                     | —                                |

Signed-out reporters aren't told anything.

## Ages

Accounts are for people 13 and older (#115). Sign-up asks for a year of birth: with a password, when registering; with Google, GitHub or Facebook, when confirming an email address, before the new account can sign in. The age is counted from the end of the year of birth, so someone turning 13 this year is refused until next year.

| Year of birth | Result                                                                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Under 13      | Refused, neutrally ("Sorry, we can't create an account for you."). A just-created social sign-in account is deleted; one that already holds timelines is suspended for the operator to review. The browser is refused again for a day, whatever year it gives next. |
| Under 18      | The account always sees sensitive-content warnings, and doesn't browse labelled timelines. Its **Account** page explains why there's no choice. Its profile doesn't show its public favorites.                                                                      |
| 18 or older   | **Account → Sensitive content** can turn the warnings off.                                                                                                                                                                                                          |
| None recorded | Accounts made before this was asked, under terms requiring 18: treated as adults.                                                                                                                                                                                   |

Only the year is stored (`oc_users.birth_year`). It is self-declared: not age verification, which the content policy is designed not to need. The sign-up form doesn't say what age is required, and the refusal doesn't either, as the FTC's COPPA guidance asks of a neutral age screen; a refused browser is remembered by a hash of its sign-in token in `oc_age_refusals` for a day (#166).

## Child sexual abuse material

The operator's procedure (see also `legal/LAUNCH.md` and `legal/RISK-ASSESSMENT.md`):

1. **Restrict it at once.** Restricting keeps the data while nobody else can see it. Suspend the account too: report the account and restrict it, or use the Users view.
2. **Report it.** In the United States, a provider who learns of apparent child sexual abuse material must report it to NCMEC's CyberTipline (18 U.S.C. 2258A). Register with the CyberTipline before launch. Elsewhere, report to the national hotline or police as local law requires.
3. **Preserve it** for one year (the REPORT Act), or as law enforcement directs. Leave the restricted timeline and its history in place: don't export, copy, download or forward the material, even internally or to "check" it. The database, its backups and the moderation records (`oc_moderation_cases`, `oc_reports`, `oc_admin_audit`) are the preserved copy; keep backups for at least the preservation period.
4. **Delete the timeline** only after the preservation period, or as law enforcement directs (**Site administration → Timelines → Delete**).

Other illegal content follows the same steps, with whatever reporting and preservation its law requires; a legal hold works the same way.

## Data

| Table                 | Holds                                                                                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `oc_moderation_cases` | One row per case: what it names (`target_kind`, `target_id`), the owner, `status` (`open`, `dismissed`, `restricted`, `lifted`), the reason, who decided and when, a restricted timeline's earlier visibility, and the review request and its outcome. At most one case per thing is open or in force. |
| `oc_reports`          | The reports: category, details, the moment or duration named, and the reporter (null when signed out).                                                                                                                                                                                                 |

Cases name their targets as text, so a case outlives a deleted timeline as a record of what was decided.
