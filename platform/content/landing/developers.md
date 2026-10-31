---
label: Developers
heading: Timelines you can script, extend and host
title: Open-source timeline API, plugins and self-hosted server
promise: An HTTP API described in OpenAPI, scoped API keys, sandboxed plugins, and a server you can run yourself, all under the GPL.
description: OpenChronology for developers: an HTTP API described in OpenAPI 3.1, scoped API keys, sandboxed plugins, log receivers and self-hosted server packages.
card: The HTTP API, keys, plugins and self-hosting.
---

## What you can do

- **Call the API.** Every operation is described in OpenAPI 3.1 at `/api/openapi.json`, with a reference and **Try it** at [/docs/api](/docs/api). Generate a client from it, or use curl.
- **Automate with keys.** API keys reach the timeline endpoints only, read or read/write, with an expiry of 1 to 365 days and a rate limit per key.
- **Write plugins.** Plugins add fields, icons, colors, shapes and stacks, in a small sandboxed language with no network or page access. Package them as suites, and publish both to the plugin library.
- **Feed it data.** Point the syslog receiver, the journald follower or `och-import-logs` at your systems, or write timelines from your own code.
- **Embed timelines.** A public timeline embeds in any page as a read-only frame, and answers oEmbed.

## What you can count on

- **Free software.** The source is under the GNU GPL version 3, and every server links to its own source.
- **Self-hosting.** Server packages for Windows, macOS (Homebrew), Debian, Ubuntu, Rocky Linux and RHEL, Fedora and FreeBSD, and Docker Compose for any system.
- **Exact data.** Times are exact fractions in the API and in files, never floating point.
- **Keys that do no more than they should.** A key acts with its account's permissions, can't manage accounts or make other keys, and stops working when revoked or expired.
