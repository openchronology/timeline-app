// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A "?" beside a setting (#172): its tip on hover or focus, and the help about it on click.
// Tips are checked against the help's pages and headings (test/help.test.mjs), so `topic`
// is a literal page#heading.
export default function HelpTip({ topic, about, children }) {
  const id = 'tip-' + topic.replace(/[^a-z0-9]+/g, '-');
  return (
    <span className="help-tip">
      <a
        href={'/help/' + topic}
        target="_blank"
        rel="noopener"
        aria-label={'Help on ' + about}
        aria-describedby={id}
      >
        ?
      </a>
      <span role="tooltip" id={id}>
        {children}
      </span>
    </span>
  );
}
