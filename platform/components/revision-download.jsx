// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Downloads a saved checkpoint as .ochx straight from the server, which streams it (#135):
 * the page never holds the whole document.
 */
export default function RevisionDownload({ timelineId, savedId }) {
  return (
    <a
      className="button"
      href={`/api/timelines/${timelineId}/history/${savedId}?download=1`}
      download={'timeline-' + savedId + '.ochx'}
    >
      Export this checkpoint (.ochx)
    </a>
  );
}
