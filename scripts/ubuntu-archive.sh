#!/bin/sh
# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Points a GitHub-hosted Ubuntu runner's apt at Ubuntu's own archive instead of Azure's mirror,
# which now and then serves packages at tens of kB/s and stalls a job's installs (#351), and
# has apt retry a failed download. Run before the job's first `apt-get update`.
set -eu
for sources in /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list; do
  [ -f "$sources" ] && sudo sed -i 's#http://azure\.archive\.ubuntu\.com/ubuntu#http://archive.ubuntu.com/ubuntu#g' "$sources"
done
printf 'Acquire::Retries "3";\nAcquire::http::Timeout "30";\n' | sudo tee /etc/apt/apt.conf.d/80-ci-retries >/dev/null
grep -rh '^URIs:\|^deb ' /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list 2>/dev/null | sort -u
