// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
export default function RevisionDownload({ document, savedId }) {
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }),
    );
    const a = window.document.createElement('a');
    a.href = url;
    a.download = 'timeline-' + savedId + '.ochx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <button onClick={download}>Export this checkpoint (.ochx)</button>;
}
