# Copyright, GPLv3, and distributions

OpenChronology first-party software and documentation are copyright (c) 2026
Athan Clark, an individual, and licensed **GPL-3.0-only**. See [LICENSE](../LICENSE)
for the unmodified GPLv3 text and [NOTICE](../NOTICE) for scope and attribution.
The FSF copyright on the license text is not ownership of OpenChronology.
The official first-party plugins are included under this same software license.

The application deployed at timescale.info uses this license. Domain registration,
names, and endorsement are distinct from licensing the code. Users retain their
content copyright; a public timeline is not automatically GPL-licensed. Hosted
policies are separate [terms](../legal/TERMS.md), [privacy](../legal/PRIVACY.md), and
[reporting](../legal/COPYRIGHT.md) drafts. Finish [operator details](../legal/LAUNCH.md)
before adopting them. No nonprofit or automatic future assignment is assumed.

Third-party licenses remain in effect. Do not replace vendor license files or
upstream authors' attribution with Athan's name. The independently published
rational-map, sqlite-rational, and rational-conformance projects retain their own
licenses; historical projects in the enclosing workspace are not relicensed by
this application's notice. Compatible permissively licensed components may be
included in the GPL application without changing the licenses on those components.

## Source and releases

Serving downloaded browser JavaScript or an offline HTML editor distributes
object code. Ship the full license, notices, and matching Corresponding Source;
minified JavaScript alone is not preferred source. Likewise distribute matching
source with desktop binaries and container images. GPLv3 does not impose AGPL's
network-only source requirement on server code that is merely run privately, but
distributed server/container software has its own distribution obligations.

The normal web build creates and serves `/openchronology-web-source.tar.gz` and
links it from the notices. The container build adds its native converter dependency
sources to that same archive. Standalone HTML embeds notices without source/network
links; publish its matching archive beside the download.

Build the web/standalone source snapshot from the same checkout as the binary:

```
npm ci
npm run build
npm run build:source
```

This produces `dist/openchronology-web-source.tar.gz`, including the first-party
sources, pinned dependency archives, SQLite extension sources, lockfiles, legal
notices, and preferred sources for the JavaScript bundled into the browser.
pnpm and Yarn can run the same scripts. The allowlist excludes `.env`, credentials,
databases, local exports, git metadata, and compiler outputs. Source-map recovery
of the pinned map library preserves its original TypeScript and MIT attribution.

For desktop or native converter distributions, also run:

```
npm run build:source:desktop
```

This additionally vendors the locked Rust dependencies from both Cargo manifests
and writes an archive-local Cargo configuration. Cargo may need network access
to download source packages. Source is packaged from the current checkout; create
it for each release rather than reusing an archive from another version. CI attaches
web source alongside HTML and native source alongside the Linux package. Publish
these source archives alongside the matching release downloads with equivalent
access and retain them for the release's availability. Do not publish secrets
through ad hoc whole-directory archives.

The PostgreSQL Dockerfile already includes its precise `pgmp.tar.gz` source and
LGPL/GPL notices under `/usr/share/doc/pgmp`. Preserve those when distributing the
image and supply any other non-system component
sources required by their licenses. The OpenChronology archive alone is not a
complete source distribution for the separate PostgreSQL image. System-library
exceptions and each dependency's own requirements must be checked for the actual
artifact. A public repository URL alone must not substitute for missing preferred
dependency source in a compiled distribution. Document the release commit, dependency
versions, build commands, and source download location in release notes.

## Contributions and license changes

Contributions to the first-party application should be submitted under GPL-3.0-only
with the contributor's own attribution. Do not claim Athan owns third-party
contributions merely because he maintains the project. No copyright assignment or
CLA is required by this repository. Original user scripts and timeline data are
separate from contributions to application source. Previously granted MIT rights
on earlier published versions cannot be revoked by this license change; new
first-party releases use GPLv3.

References: [GNU license application guidance](https://www.gnu.org/licenses/gpl-howto.html),
[GPLv3 text](https://www.gnu.org/licenses/gpl-3.0.html), and
[GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.html).
