// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { resolve } from 'node:path';
export default {
  output: 'standalone',
  outputFileTracingRoot: resolve(import.meta.dirname, '..'),
  serverExternalPackages: ['pg'],
  poweredByHeader: false,
  outputFileTracingIncludes: {
    '/*': ['../dist/**/*', '../legal/**/*', '../LICENSE', '../NOTICE', '../THIRD_PARTY.md'],
  },
  experimental: { proxyClientMaxBodySize: '40mb' },
};
