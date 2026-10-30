// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// What the landing page and the audience pages (#379) show besides their copy: who is
// visiting, whether they may sign up, the page's example timelines and its video.
import 'server-only';
import { currentSession } from './session.js';
import { searchTimelines } from '../../server/collaboration.mjs';
import {
  FEATURED_EXAMPLES,
  exampleAddresses,
  exampleTimelines,
  landingContent,
  landingVideo,
} from '../../server/landing.mjs';
import { sitePageMetadata } from './sharing.js';

/**
 * A landing page's metadata from its copy's front matter: its title, description and
 * canonical address.
 * @param {string} name the copy's name (server/landing.mjs CONTENT_FILES)
 * @param {string} path the page's path
 */
export async function landingMetadata(name, path) {
  const { meta } = await landingContent(name);
  return sitePageMetadata(path, meta.title ?? '', meta.description ?? meta.promise ?? '');
}

/**
 * What a landing page shows around its copy.
 *
 * Its examples are the timelines its setting names (LANDING_EXAMPLES or
 * LANDING_EXAMPLES_<AUDIENCE>) that guests may see; when it names none, the first public
 * timelines the browser lists, featured first, without sensitive-content labels. Without a
 * database, or when reading fails, it has none, and the page still renders.
 *
 * @param {string} page `home` or an audience (server/landing.mjs AUDIENCES)
 * @returns {Promise<{user: object|null, accounts: boolean, registration: boolean,
 *   examples: object[], video: object|null}>}
 */
export async function landingData(page) {
  let current = null,
    examples = [],
    video = null;
  try {
    current = await currentSession();
  } catch (error) {
    console.error(error);
  }
  const services = current?.services,
    userId = current?.user?.id ?? null;
  try {
    const addresses = exampleAddresses(page);
    if (services?.pool)
      examples = addresses.length
        ? await exampleTimelines(services.pool, addresses, services.featured ?? [], userId)
        : (
            await searchTimelines(
              services.pool,
              userId,
              { scope: 'public', sort: 'featured', limit: FEATURED_EXAMPLES },
              services.featured ?? [],
            )
          ).timelines.filter((t) => !t.labels?.length);
  } catch (error) {
    console.error(error);
  }
  try {
    video = landingVideo(page);
  } catch {
    // Refused at startup.
  }
  return {
    user: current?.user ?? null,
    accounts: !!services?.auth,
    registration: !!services?.auth?.security?.available,
    examples,
    video,
  };
}
