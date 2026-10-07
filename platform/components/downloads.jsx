// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
export default function Downloads() {
  const latest = 'https://github.com/openchronology/timeline-app/releases/latest';
  return (
    <details className="download-menu">
      <summary>Download</summary>
      <div>
        <a href={latest + '/download/openchronology-offline.html'}>Offline browser HTML</a>
        <a href={latest + '/download/openchronology-desktop-linux-amd64.deb'}>
          Desktop · Linux (.deb)
        </a>
        <a href={latest}>Release notes &amp; all downloads</a>
      </div>
    </details>
  );
}
