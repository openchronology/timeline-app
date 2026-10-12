// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { headers } from 'next/headers';
import CopyCommand from '../../components/copy-command.jsx';
import {
  DESKTOP,
  OFFLINE,
  SERVERS,
  OTHER_ASSETS,
  RELEASES,
  REPOSITORY,
  assetLink,
  assetSize,
  detectDistribution,
  detectPlatform,
  installCommand,
} from '../../lib/releases.js';
import { latestRelease } from '../../lib/latest-release.js';
import { siteName } from '../../lib/sharing.js';
export const dynamic = 'force-dynamic';
export function generateMetadata() {
  return {
    title: `Download · ${siteName()}`,
    description: 'The OpenChronology desktop app for Windows, macOS and Linux, and the server.',
  };
}
const NAMES = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };
const DOCS = `https://github.com/${REPOSITORY}/blob/main`;

function Size({ release, asset }) {
  const size = assetSize(release, asset);
  return size ? <span className="download-size">{size}</span> : null;
}
/** One file to download: its link, what it is, and its size once a release says. */
function File({ release, file, primary = false }) {
  return (
    <a
      className={primary ? 'button primary download-primary' : 'download-file'}
      href={assetLink(release, file.asset)}
      data-asset={file.asset}
    >
      <span>
        {primary ? `Download for ${file.name}` : file.detail}
        {primary ? <small>{file.detail}</small> : null}
      </span>
      <Size release={release} asset={file.asset} />
    </a>
  );
}

export default async function Download() {
  const request = await headers();
  const userAgent = request.get('user-agent') ?? '';
  const platform = detectPlatform(userAgent, request.get('sec-ch-ua-platform') ?? '');
  const distribution = platform === 'linux' ? detectDistribution(userAgent) : null;
  const release = await latestRelease();
  const desktop = Object.keys(NAMES).includes(platform) ? platform : null;
  const yours = DESKTOP.filter((file) => file.os === desktop);
  // Each operating system's files, the visitor's first.
  const systems = Object.keys(NAMES).sort((a, b) => (b === desktop) - (a === desktop));
  const servers = [...SERVERS].sort((a, b) => (b.key === distribution) - (a.key === distribution));
  const published = release?.published
    ? new Date(release.published).toLocaleDateString('en', { dateStyle: 'long' })
    : null;
  return (
    <main className="platform download-page">
      <h1>Download OpenChronology</h1>
      <p className="muted download-release">
        {release ? (
          <>
            Version <strong>{release.tag}</strong>
            {published ? ` · released ${published}` : ''} ·{' '}
            <a href={release.notes}>Release notes</a>
          </>
        ) : (
          <>
            The latest release · <a href={RELEASES}>Release notes</a>
          </>
        )}
      </p>

      <section className="download-recommended" aria-labelledby="recommended-heading">
        {yours.length ? (
          <>
            <h2 id="recommended-heading">{`Desktop app for ${NAMES[desktop]}`}</h2>
            <p>
              Work with local timeline files, offline, and connect to OpenChronology servers when
              you want to share.
            </p>
            <div className="download-actions">
              <File release={release} file={yours[0]} primary />
              {yours.slice(1).map((file) => (
                <File key={file.key} release={release} file={file} />
              ))}
            </div>
            {desktop === 'macos' ? (
              <p className="muted">
                Most Macs since 2020 have Apple silicon; choose Intel for older ones (Apple menu →
                About This Mac).
              </p>
            ) : null}
          </>
        ) : (
          <>
            <h2 id="recommended-heading">Use OpenChronology in your browser</h2>
            <p>
              The desktop app runs on Windows, macOS and Linux. On this device, open the website, or
              download the offline file to use without a network.
            </p>
            <div className="download-actions">
              <a className="button primary download-primary" href="/">
                Open OpenChronology
              </a>
              <a className="download-file" href={assetLink(release, OFFLINE.asset)}>
                Offline browser file (.html)
              </a>
            </div>
          </>
        )}
      </section>

      <section id="desktop" aria-labelledby="desktop-heading">
        <h2 id="desktop-heading">Desktop</h2>
        <div className="download-grid">
          {systems.map((os) => (
            <article
              key={os}
              className={'download-card' + (os === desktop ? ' current' : '')}
              data-os={os}
            >
              <h3>
                {NAMES[os]}
                {os === desktop ? <span className="download-badge">Your system</span> : null}
              </h3>
              {DESKTOP.filter((file) => file.os === os).map((file) => (
                <File key={file.key} release={release} file={file} />
              ))}
            </article>
          ))}
          <article className="download-card" data-os="offline">
            <h3>Any browser</h3>
            <p className="muted">
              The whole editor in one HTML file. It never uses the network; timelines stay on your
              device.
            </p>
            <File release={release} file={{ ...OFFLINE, detail: 'Offline browser file (.html)' }} />
          </article>
        </div>
      </section>

      <section id="server" aria-labelledby="server-heading">
        <h2 id="server-heading">Server</h2>
        <p>
          Run your own OpenChronology server for your organization or community. The package
          installs PostgreSQL, sets up the database and starts the service on port 5173; put an
          HTTPS proxy in front of it and set your address in{' '}
          <code>/etc/openchronology/openchronology.env</code>.
        </p>
        <div className="download-grid">
          {servers.map((server) => (
            <article
              key={server.key}
              className={'download-card' + (server.key === distribution ? ' current' : '')}
              data-server={server.key}
            >
              <h3>
                {server.name}
                {server.key === distribution ? (
                  <span className="download-badge">Your system</span>
                ) : null}
              </h3>
              <p className="muted">Download and install in one line:</p>
              <CopyCommand
                command={installCommand(release, server)}
                label={`Install on ${server.name}`}
              />
              <File
                release={release}
                file={{
                  ...server,
                  detail: `Server package (.${server.asset.split('.').pop()}), amd64`,
                }}
              />
              <a className="download-file" href={`${DOCS}/${server.guide}`}>
                Setup guide
              </a>
            </article>
          ))}
          <article className="download-card" data-server="docker">
            <h3>Docker</h3>
            <p className="muted">
              On any system with Docker Engine and Compose: build and run the server and its
              database from the source.
            </p>
            <CopyCommand
              command={`git clone https://github.com/${REPOSITORY}.git && cd timeline-app && cp .env.example .env && docker compose up --build --wait`}
              label="Run with Docker Compose"
            />
            <a className="download-file" href={`${DOCS}/docs/docker.md`}>
              Docker deployment guide
            </a>
          </article>
        </div>
        <p className="muted">More server platforms will be added here as they are supported.</p>
      </section>

      <section aria-labelledby="more-heading">
        <h2 id="more-heading">Verify and build</h2>
        <ul className="download-more">
          <li>
            <a href={assetLink(release, OTHER_ASSETS.checksums)}>SHA-256 checksums</a> of every file
            in the release.
          </li>
          <li>
            Source code: <a href={assetLink(release, OTHER_ASSETS.source)}>web and server</a>,{' '}
            <a href={assetLink(release, OTHER_ASSETS.desktopSource)}>desktop</a>, and the{' '}
            <a href={`https://github.com/${REPOSITORY}`}>repository</a>. OpenChronology is free
            software under the GNU GPL version 3.
          </li>
          <li>
            <a href={RELEASES}>All releases</a>
          </li>
        </ul>
      </section>
    </main>
  );
}
