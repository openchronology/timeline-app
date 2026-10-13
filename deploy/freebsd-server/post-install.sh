# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# pkg ends whatever a package's scripts leave running, so the package starts nothing: a first
# installation is finished by openchronology-setup, run by the administrator. An upgrade (its
# configuration exists) is advised on, as the other packages do.
if [ -e /usr/local/etc/openchronology/openchronology.env ]; then
  /usr/local/sbin/openchronology-setup upgrade || true
else
  cat <<'MSG'

OpenChronology is installed. To finish, as root:

  openchronology-setup

It initializes and enables PostgreSQL if needed, creates the openchronology database, and
enables and starts the openchronology service on 127.0.0.1:5173.
See /usr/local/share/doc/openchronology-server/README.FreeBSD.

MSG
fi
exit 0
