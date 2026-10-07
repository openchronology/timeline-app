// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Local-only Tauri development harness; the hosted platform uses Next.js.
import { createApplication } from '../server/http.mjs';
const server = createApplication();
server.listen(5173, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)));
