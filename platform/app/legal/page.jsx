// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export const dynamic = 'force-dynamic';
export default async function LegalPage() {
  const files = [
    ['NOTICE', 'Copyright and software rights'],
    ['legal/TERMS.md', 'Service terms (draft)'],
    ['legal/PRIVACY.md', 'Privacy notice (draft)'],
    ['legal/COPYRIGHT.md', 'Copyright, abuse and security reports'],
    ['legal/LAUNCH.md', 'Operator details pending'],
    ['LICENSE', 'GNU General Public License version 3'],
    ['THIRD_PARTY.md', 'Third-party attribution'],
  ];
  const documents = await Promise.all(
    files.map(async ([path, title]) => ({
      title,
      text: await readFile(resolve(process.env.OCH_APP_ROOT ?? process.cwd(), path), 'utf8'),
    })),
  );
  return (
    <main className="platform">
      <h1>Terms, privacy and software licenses</h1>
      <p>
        Hosted-service policies are drafts pending operator details. Software licensing is effective
        independently.
      </p>
      {documents.map((d) => (
        <details className="legal-document" key={d.title}>
          <summary>{d.title}</summary>
          <pre>{d.text}</pre>
        </details>
      ))}
    </main>
  );
}
