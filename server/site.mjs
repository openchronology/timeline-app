// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * How a platform presents itself: its name (PLATFORM_NAME, such as `timescale.info`) in its
 * header, page titles and link previews, where visitors can support it (SUPPORT_URL), and
 * Google Analytics (GOOGLE_ANALYTICS_ID), which visitors' browsers load only once they accept it.
 */
export class SiteError extends Error {}

/** The platform's own name, if it has one; null shows OpenChronology's. */
export function platformName(env = process.env) {
  const name = (env.PLATFORM_NAME ?? '').trim();
  if (!name) return null;
  if (name.length > 60 || /[\u0000-\u001f\u007f<>]/.test(name))
    throw new SiteError('PLATFORM_NAME must be at most 60 characters, without < or >.');
  return name;
}
/** The name pages, titles and previews use. */
export function siteName(env = process.env) {
  try {
    return platformName(env) ?? 'OpenChronology';
  } catch {
    return 'OpenChronology';
  }
}
/** Where visitors can support the platform, if it says; null shows no Support link. */
export function supportUrl(env = process.env) {
  const value = (env.SUPPORT_URL ?? '').trim();
  if (!value) return null;
  let url = null;
  try {
    url = new URL(value);
  } catch {
    // Refused below.
  }
  if (!url || url.protocol !== 'https:' || url.username || url.password || value.length > 500)
    throw new SiteError(
      'SUPPORT_URL must be an https:// address, such as https://github.com/sponsors/you.',
    );
  return url.href;
}
const MEASUREMENT = /^G-[A-Z0-9]{4,20}$/;
/** The Google Analytics 4 measurement ID, if analytics are enabled. */
export function analyticsId(env = process.env) {
  const id = (env.GOOGLE_ANALYTICS_ID ?? '').trim();
  if (!id) return null;
  if (!MEASUREMENT.test(id))
    throw new SiteError(
      'GOOGLE_ANALYTICS_ID must be a Google Analytics 4 measurement ID, such as G-ABC123DEF4.',
    );
  return id;
}
/** What pages' content security policy adds for analytics: nothing unless enabled. */
export function analyticsPolicy(env = process.env) {
  let enabled = false;
  try {
    enabled = !!analyticsId(env);
  } catch {
    // Refused at startup; a page never loads a measurement ID that is not one.
  }
  return enabled
    ? {
        script: ' https://www.googletagmanager.com',
        connect:
          ' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com',
      }
    : { script: '', connect: '' };
}
