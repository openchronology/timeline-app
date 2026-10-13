# Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
for service in openchronology openchronology_mail openchronology_syslog; do
  service "$service" onestop >/dev/null 2>&1 || true
done
exit 0
