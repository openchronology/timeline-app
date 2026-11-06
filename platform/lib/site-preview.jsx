// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The link-preview card of the site's own pages: its name, the one-sentence definition and the
 * server's address over a strip of a timeline (the Rome timeline cut from the site's
 * screenshot, /social-preview.jpg); for an audience's page, that page's own heading and
 * promise. Drawn per server, so each previews with its own name and address, at the size link
 * previews use, with the font next/og bundles. The repository's GitHub card is the same design
 * (scripts/github-preview.mjs).
 */
import 'server-only';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ImageResponse } from 'next/og';
import { AUDIENCES, landingContent } from '../../server/landing.mjs';
import { siteName, siteOrigin } from './sharing.js';

export const size = { width: 1200, height: 630 };
// The site's colours (lib/preview-image.jsx).
const INK = '#192d25',
  PAPER = '#f6f3ea',
  ACCENT = '#c8643b',
  MUTED = '#5d6b63';
/** The software's name, which the card always shows. */
const SOFTWARE = 'OpenChronology';
/** What the software is, as the home page and FAQ open with (#481). */
export const DEFINITION =
  'A free, open-source timeline editor for exact dates at any scale, from deep time to fractions of a second, with sources on every event.';
/** The strip of the screenshot: its rows from the labels above the moments to the first below. */
const STRIP = { top: 232, height: 234 };

/** The previews there are: the site's, and each audience page's. */
export const PREVIEWS = ['site', ...AUDIENCES];

/** The screenshot the strip is cut from, as a data address; null if it can't be read. */
async function screenshot() {
  try {
    const root = process.env.OCH_APP_ROOT ?? process.cwd();
    const data = await readFile(resolve(root, 'platform/public/social-preview.jpg')).catch(() =>
      readFile(resolve(root, 'public/social-preview.jpg')),
    );
    return 'data:image/jpeg;base64,' + data.toString('base64');
  } catch {
    return null;
  }
}
/** The logo mark, as a data address; null if it can't be read. */
async function mark() {
  try {
    const root = process.env.OCH_APP_ROOT ?? process.cwd();
    const data = await readFile(resolve(root, 'platform/public/logo-mark.svg')).catch(() =>
      readFile(resolve(root, 'public/logo-mark.svg')),
    );
    return 'data:image/svg+xml;base64,' + data.toString('base64');
  } catch {
    return null;
  }
}
/** The server's address as people type it: its host. */
function address() {
  try {
    return new URL(siteOrigin()).host;
  } catch {
    return '';
  }
}

/**
 * What a preview says: for the site, its name large and the definition; for an audience's page,
 * the name small, then the page's heading and its promise.
 * @param {string} name `site` or an audience
 * @returns {Promise<{eyebrow: string|null, heading: string, text: string, alt: string}|null>}
 */
export async function previewText(name) {
  if (name === 'site')
    return {
      eyebrow: null,
      heading: SOFTWARE,
      text: DEFINITION,
      alt: `${SOFTWARE}: ${DEFINITION.charAt(0).toLowerCase()}${DEFINITION.slice(1, -1)}. Below, a timeline of ancient Rome.`,
    };
  if (!AUDIENCES.includes(name)) return null;
  const { meta } = await landingContent(name);
  const heading = meta.heading ?? meta.title ?? SOFTWARE;
  const text = meta.promise ?? meta.description ?? DEFINITION;
  return {
    eyebrow: `${SOFTWARE} · for ${(meta.label ?? name).toLowerCase()}`,
    heading,
    text,
    alt: `${heading}. ${text} Below, a timeline of ancient Rome in ${SOFTWARE}.`,
  };
}

/**
 * The card for `name` (`site` or an audience), or null for any other name.
 * @returns {Promise<ImageResponse|null>}
 */
export async function sitePreviewImage(name) {
  const text = await previewText(name);
  if (!text) return null;
  const [strip, logo] = await Promise.all([screenshot(), mark()]);
  const host = address(),
    // The site's name when it has one of its own, otherwise its address.
    site = siteName() !== SOFTWARE ? siteName() : host;
  const big = text.eyebrow === null;
  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'column',
        background: PAPER,
        color: INK,
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{ display: 'flex', flexDirection: 'column', padding: '48px 64px 0', flexGrow: 1 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {logo && <img src={logo} width={big ? 84 : 52} height={big ? 84 : 52} />}
            <div
              style={{
                fontSize: big ? 80 : 30,
                marginLeft: big ? 26 : 16,
                letterSpacing: big ? -1 : 0,
                color: big ? INK : MUTED,
              }}
            >
              {big ? SOFTWARE : text.eyebrow}
            </div>
          </div>
          {site && <div style={{ fontSize: 28, color: ACCENT }}>{site}</div>}
        </div>
        {!big && (
          <div
            style={{
              fontSize: text.heading.length > 40 ? 52 : 60,
              lineHeight: 1.1,
              marginTop: 22,
              letterSpacing: -0.5,
            }}
          >
            {text.heading}
          </div>
        )}
        <div
          style={{
            fontSize: big ? 32 : 28,
            lineHeight: 1.35,
            color: MUTED,
            marginTop: big ? 22 : 14,
            maxWidth: 1060,
          }}
        >
          {text.text}
        </div>
      </div>
      <div style={{ display: 'flex', height: 3, background: ACCENT, opacity: 0.6 }} />
      {strip && (
        <div
          style={{
            display: 'flex',
            position: 'relative',
            width: 1200,
            height: STRIP.height,
            overflow: 'hidden',
          }}
        >
          <img
            src={strip}
            width={1200}
            height={630}
            style={{ position: 'absolute', left: 0, top: -STRIP.top }}
          />
        </div>
      )}
    </div>,
    { ...size, headers: { 'cache-control': 'public, max-age=86400' } },
  );
}
