// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESKTOP,
  SERVERS,
  OFFLINE,
  assetLink,
  assetSize,
  detectDistribution,
  detectPlatform,
  installCommand,
  releaseFrom,
} from '../platform/lib/releases.js';
import { targets } from '../scripts/desktop/packages.mjs';
import { serverPackage, serverTargets } from '../scripts/server-targets.mjs';

test('the download page offers every file the release workflow attaches', () => {
  assert.deepEqual(
    DESKTOP.map((d) => d.asset).sort(),
    Object.values(targets)
      .map((t) => t.asset)
      .sort(),
  );
  assert.deepEqual(SERVERS.map((s) => s.key).sort(), Object.keys(serverTargets).sort());
  for (const server of SERVERS) assert.equal(server.asset, serverPackage(server.key));
});

test('the visitor’s system comes from their browser', () => {
  const agents = {
    windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0',
    macos: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    linux: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
    android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Mobile Safari/537.36',
    ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15',
    chromeos: 'Mozilla/5.0 (X11; CrOS x86_64 16181.61.0) AppleWebKit/537.36 Chrome/141.0',
  };
  for (const [platform, agent] of Object.entries(agents))
    assert.equal(detectPlatform(agent), platform, platform);
  assert.equal(detectPlatform('', '"macOS"'), 'macos');
  assert.equal(
    detectPlatform('Mozilla/5.0 (X11; FreeBSD amd64; rv:143.0) Firefox/143.0'),
    'freebsd',
  );
  assert.equal(detectPlatform('curl/8.5'), null);
  assert.equal(detectDistribution(agents.linux), 'ubuntu24.04');
  assert.equal(detectDistribution('Mozilla/5.0 (X11; Debian; Linux x86_64)'), 'debian13');
  assert.equal(detectDistribution('Mozilla/5.0 (X11; Linux x86_64)'), null);
  assert.equal(detectDistribution('Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:143.0)'), 'fedora44');
});

test('links come from the latest release, or by name before there is one', () => {
  const server = SERVERS.find((s) => s.key === 'debian13');
  assert.equal(
    assetLink(null, OFFLINE.asset),
    'https://github.com/openchronology/timeline-app/releases/latest/download/openchronology-offline.html',
  );
  assert.equal(assetSize(null, OFFLINE.asset), null);
  assert.equal(
    installCommand(null, server),
    'curl -fLO https://github.com/openchronology/timeline-app/releases/latest/download/openchronology-server-debian13-amd64.deb && sudo apt install ./openchronology-server-debian13-amd64.deb',
  );
  const url = 'https://github.com/openchronology/timeline-app/releases/download/v1.2.0/';
  const release = releaseFrom({
    tag_name: 'v1.2.0',
    name: '',
    published_at: '2026-10-01T12:00:00Z',
    html_url: 'https://github.com/openchronology/timeline-app/releases/tag/v1.2.0',
    assets: [
      { name: server.asset, browser_download_url: url + server.asset, size: 48 * 1048576 },
      { name: OFFLINE.asset, browser_download_url: url + OFFLINE.asset, size: 900 * 1024 },
      // Only HTTPS addresses are linked.
      { name: 'evil.exe', browser_download_url: 'javascript:alert(1)', size: 1 },
    ],
  });
  assert.equal(release.name, 'v1.2.0');
  assert.equal(assetLink(release, server.asset), url + server.asset);
  assert.equal(assetSize(release, server.asset), '48.0 MB');
  assert.equal(assetSize(release, OFFLINE.asset), '900 KB');
  assert.equal(release.assets['evil.exe'], undefined);
  assert.match(
    installCommand(release, server),
    /releases\/download\/v1\.2\.0\/openchronology-server/,
  );
  assert.equal(releaseFrom({ message: 'Not Found' }), null);
  // macOS installs with Homebrew, from the tap.
  assert.equal(
    installCommand(
      null,
      SERVERS.find((s) => s.key === 'macos'),
    ),
    'brew install openchronology/tap/openchronology-server && openchronology-setup',
  );
  // FreeBSD installs with its own fetch and pkg, as root.
  assert.equal(
    installCommand(
      null,
      SERVERS.find((s) => s.key === 'freebsd15'),
    ),
    'fetch https://github.com/openchronology/timeline-app/releases/latest/download/openchronology-server-freebsd15-amd64.pkg && pkg install -y ./openchronology-server-freebsd15-amd64.pkg && openchronology-setup',
  );
  // RPM distributions install with dnf.
  assert.equal(
    installCommand(
      null,
      SERVERS.find((s) => s.key === 'fedora44'),
    ),
    'curl -fLO https://github.com/openchronology/timeline-app/releases/latest/download/openchronology-server-fedora44-amd64.rpm && sudo dnf install ./openchronology-server-fedora44-amd64.rpm',
  );
});
