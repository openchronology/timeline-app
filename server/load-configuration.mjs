// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Loads the configuration OCH_CONFIG names before a script runs, read as systemd reads it
// (#118): node --import=<app>/server/load-configuration.mjs <script>. FreeBSD's rc.d services
// start the mail and syslog workers this way; systemd passes their configuration itself.
import { loadConfiguration } from './env-file.mjs';
loadConfiguration();
