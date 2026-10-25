// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Serves /manifest.webmanifest: the site's name, colors and icons for installing it as an app
// or adding it to a phone's home screen (scripts/icons.mjs draws the icons).
import { siteName } from '../../server/site.mjs';
export const dynamic = 'force-dynamic';
export default function manifest() {
  return {
    name: siteName(),
    short_name: siteName(),
    description: 'Exact timelines, shared on your terms.',
    start_url: '/',
    display: 'standalone',
    background_color: '#192d25',
    theme_color: '#192d25',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
