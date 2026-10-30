// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The platform's Next.js configuration: a standalone server build, with the files it reads as
// it runs (dist/, docs/, the legal texts, the landing pages' copy) traced into it.
import { resolve } from 'node:path';
export default {
  output: 'standalone',
  outputFileTracingRoot: resolve(import.meta.dirname, '..'),
  serverExternalPackages: ['pg', 'ldapts'],
  poweredByHeader: false,
  outputFileTracingIncludes: {
    // The help area (#172) reads docs/ and the README as it runs, and the landing pages
    // (#379) their copy.
    '/*': [
      './content/**/*',
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
