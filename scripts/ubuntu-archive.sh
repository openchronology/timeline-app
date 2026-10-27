#!/bin/sh
# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Points a GitHub-hosted Ubuntu runner's apt at Ubuntu's own archive instead of Azure's mirror,
# which now and then serves packages at tens of kB/s and stalls a job's installs (#351), and
# has apt retry a failed download. Run before the job's first `apt-get update`.
set -eu
archive=http://archive.ubuntu.com/ubuntu/
# The runner images list their mirrors in apt-mirrors.txt (`URIs: mirror+file:...`), tried in
# order when one fails: Ubuntu's archive goes first, Azure's last.
mirrors=/etc/apt/apt-mirrors.txt
if [ -f "$mirrors" ]; then
  {
    printf '%s\tpriority:1\n' "$archive"
    grep -v -e 'archive\.ubuntu\.com' "$mirrors" | sed 's/\tpriority:[0-9]*//' | awk '{ printf "%s\tpriority:%d\n", $0, NR + 1 }'
    grep -e 'azure\.archive\.ubuntu\.com' "$mirrors" | sed 's/\tpriority:[0-9]*//' | sed 's/$/\tpriority:9/'
  } > /tmp/apt-mirrors.txt
  sudo cp /tmp/apt-mirrors.txt "$mirrors"
  cat "$mirrors"
fi
# Older images name the mirror in the sources themselves.
for sources in /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list; do
  [ -f "$sources" ] && sudo sed -i "s#http://azure\.archive\.ubuntu\.com/ubuntu/\?#$archive#g" "$sources"
done
printf 'Acquire::Retries "3";\nAcquire::http::Timeout "30";\n' | sudo tee /etc/apt/apt.conf.d/80-ci-retries >/dev/null
