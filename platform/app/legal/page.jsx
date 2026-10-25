// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// /legal: the service terms, privacy notice, copyright notices and software licenses, read
// from the repository's files.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pageTitle } from '../../lib/sharing.js';
export const dynamic = 'force-dynamic';
export function generateMetadata() {
  return { title: pageTitle('Terms, privacy and licenses') };
}
export default async function LegalPage() {
  const files = [
    ['NOTICE', 'Copyright and software rights'],
    ['legal/TERMS.md', 'Terms of service'],
    ['legal/PRIVACY.md', 'Privacy policy'],
    ['legal/COPYRIGHT.md', 'Copyright, abuse and security reports'],
    ['legal/LAUNCH.md', 'Operator checklist'],
    ['LICENSE', 'GNU General Public License version 3'],
    ['THIRD_PARTY.md', 'Third-party attribution'],
  ];
  const documents = await Promise.all(
    files.map(async ([path, title]) => ({
      title,
      // An anchor for links to one document: #terms, #privacy, #copyright…
      id: path.replace(/^.*\//, '').replace(/\..*$/, '').toLowerCase().replaceAll('_', '-'),
      text: await readFile(resolve(process.env.OCH_APP_ROOT ?? process.cwd(), path), 'utf8'),
    })),
  );
  return (
    <main className="platform">
      <h1>Terms, privacy and software licenses</h1>
      <p>
        The <a href="/terms">terms of service</a> and <a href="/privacy">privacy policy</a> also
        have pages of their own. Software licensing applies independently of them.
      </p>
      {documents.map((d) => (
        <details className="legal-document" key={d.title} id={d.id}>
          <summary>{d.title}</summary>
          <pre>{d.text}</pre>
        </details>
      ))}
    </main>
  );
}
