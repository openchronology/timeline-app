// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function LegacyLinks() {
  const router = useRouter();
  useEffect(() => {
    const timeline = /^#timeline\/([a-f0-9-]{36})$/i.exec(location.hash);
    const desktop = /^#desktop\/([A-Z2-9]{10})$/.exec(location.hash);
    if (timeline) router.replace('/timelines/' + timeline[1]);
    else if (desktop) router.replace('/connect/desktop/' + desktop[1]);
  }, [router]);
  return null;
}
