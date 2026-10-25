// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A service policy (/privacy, /terms): one of the repository's legal/*.md files, rendered as
// a page of its own so that it can be linked to directly (for example from an identity
// provider's consent screen).
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderMarkdown } from '../../server/help.mjs';

/** The policy at `path` (relative to the app's directory) as HTML, and its title. */
export async function loadPolicy(path) {
  const source = await readFile(resolve(process.env.OCH_APP_ROOT ?? process.cwd(), path), 'utf8');
  const { html, headings } = renderMarkdown(source);
  return { html, title: headings.find((h) => h.depth === 1)?.text ?? path };
}

export default function PolicyPage({ html, source }) {
  return (
    <main className="platform">
      {/* The repository's own policy, rendered by server/help.mjs, which escapes its text. */}
      <article className="help-article" dangerouslySetInnerHTML={{ __html: html }} />
      <p className="muted">
        See also the <a href="/terms">terms of service</a>, the{' '}
        <a href="/privacy">privacy policy</a> and{' '}
        <a href="/legal">all legal notices and software licenses</a>. This page is{' '}
        <a href={'https://github.com/openchronology/timeline-app/blob/main/' + source}>
          <code>{source}</code>
        </a>{' '}
        in the source code.
      </p>
    </main>
  );
}
