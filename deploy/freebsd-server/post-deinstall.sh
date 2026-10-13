# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# Upgrades reinstall the package at once; a removal says what it left behind.
if [ "${PKG_UPGRADE:-}" = true ]; then
  exit 0
fi
cat <<'MSG'

OpenChronology was removed. Its configuration (/usr/local/etc/openchronology, including
AUTH_ENCRYPTION_KEY), the PostgreSQL database and the openchronology system user remain.
To delete them as well:

  sysrc -x openchronology_enable openchronology_mail_enable openchronology_syslog_enable
  rm -rf /usr/local/etc/openchronology /var/db/openchronology
  su -l postgres -c 'dropdb openchronology && dropuser openchronology'
  pw userdel openchronology

MSG
exit 0
