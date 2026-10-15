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

New reports about a restricted thing join its case rather than opening another.

### Reviews and lifting

The owner can ask once for a review: from **Account → Moderation decisions**, or the link in the timeline's notice. A suspended account can't sign in, so its email asks it to contact the operator instead. The request appears under **Awaiting a decision**, where the administrator either:

- **keeps the restriction**, or
- **lifts the restriction**.

A restriction can also be lifted at any time from **Restricted**. Lifting restores what restricting changed: a timeline's earlier visibility, or a suspended account.

## Who is told what

Emails go only to confirmed addresses, and only when email is configured (`RESEND_API_KEY`, `AUTH_EMAIL_FROM`):

| Event          | Owner                                                    | Signed-in reporters              |
| -------------- | -------------------------------------------------------- | -------------------------------- |
| Restricted     | What, the reason, what it means, how to ask for a review | That it was restricted           |
| Dismissed      | —                                                        | That it does not break the rules |
| Review decided | Whether it was kept or lifted                            | —                                |
| Lifted         | That it is as it was                                     | —                                |

Signed-out reporters aren't told anything.

## Child sexual abuse material

Restrict it at once: restricting keeps the data while nobody else can see it. In the United States, a provider who learns of apparent child sexual abuse material must report it to NCMEC's CyberTipline (18 U.S.C. 2258A) and preserve it for one year. Don't copy, download or forward the material, even internally. Suspend the account too, from the Users view. Delete the timeline only after the preservation period, or as law enforcement directs.

## Data

| Table                 | Holds                                                                                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `oc_moderation_cases` | One row per case: what it names (`target_kind`, `target_id`), the owner, `status` (`open`, `dismissed`, `restricted`, `lifted`), the reason, who decided and when, a restricted timeline's earlier visibility, and the review request and its outcome. At most one case per thing is open or in force. |
| `oc_reports`          | The reports: category, details, the moment or duration named, and the reporter (null when signed out).                                                                                                                                                                                                 |

Cases name their targets as text, so a case outlives a deleted timeline as a record of what was decided.
