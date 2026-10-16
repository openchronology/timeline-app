// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { resolve } from 'node:path';
export default {
  output: 'standalone',
  outputFileTracingRoot: resolve(import.meta.dirname, '..'),
  serverExternalPackages: ['pg'],
  poweredByHeader: false,
  outputFileTracingIncludes: {
    // The help area (#172) reads docs/ and the README as it runs.
    '/*': [
      '../dist/**/*',
      '../legal/**/*',
      '../docs/**/*',
      '../README.md',
      '../LICENSE',
      '../NOTICE',
      '../THIRD_PARTY.md',
    ],
  },
  experimental: { proxyClientMaxBodySize: '40mb' },
};
