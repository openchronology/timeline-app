# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
# The openchronology system user, the log receivers' own (openchronology-logs, #501), and an
# upgrade stops the services: the server starts again once openchronology-migrate has run.
if ! pw groupshow openchronology >/dev/null 2>&1; then
  pw groupadd openchronology
fi
if ! pw usershow openchronology >/dev/null 2>&1; then
  pw useradd openchronology -g openchronology -d /var/db/openchronology -s /usr/sbin/nologin \
    -c "OpenChronology server"
fi
if ! pw groupshow openchronology-logs >/dev/null 2>&1; then
  pw groupadd openchronology-logs
fi
if ! pw usershow openchronology-logs >/dev/null 2>&1; then
  pw useradd openchronology-logs -g openchronology-logs -d /nonexistent -s /usr/sbin/nologin \
    -c "OpenChronology log receivers"
fi
for service in openchronology openchronology_mail openchronology_syslog openchronology_github; do
  if [ -x "/usr/local/etc/rc.d/$service" ]; then
    service "$service" onestop >/dev/null 2>&1 || true
  fi
done
exit 0
