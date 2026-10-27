// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// A timeline's own image (#339): shown above its title, on its card and as its link preview.
// Like every other image it is a link to where its owner hosts it (docs/images.md), with alt
// text, and its size when the settings measured it (for oEmbed's thumbnail).
import { imageURL } from './plugins.js';

export interface TimelineImage {
  /** An HTTPS address without credentials, as imageURL accepts it. */
  url: string;
  /** What the image shows, for those who cannot see it; empty when it only decorates. */
  alt: string;
  /** Its natural size in pixels, when known. */
  width?: number;
  height?: number;
}
/** The longest alt text kept. */
export const IMAGE_ALT_LENGTH = 1000;
/** Validates a timeline's image, returning it normalized (the address as imageURL gives it). */
export function validateTimelineImage(value: unknown): TimelineImage {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('A timeline image needs a link and alt text.');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some((k) => !['url', 'alt', 'width', 'height'].includes(k)))
    throw new Error('A timeline image has only a link, alt text and its size.');
  const url = imageURL(v.url);
  if (!url) throw new Error('A timeline image must be an HTTPS link without credentials.');
  const alt = v.alt ?? '';
  if (typeof alt !== 'string' || alt.length > IMAGE_ALT_LENGTH)
    throw new Error(`Alt text is at most ${IMAGE_ALT_LENGTH} characters.`);
  const size = (n: unknown) => Number.isInteger(n) && (n as number) > 0 && (n as number) <= 100000;
  if ((v.width !== undefined || v.height !== undefined) && !(size(v.width) && size(v.height)))
    throw new Error('A timeline image’s size is its width and height, in whole pixels.');
  return {
    url,
    alt: alt.trim(),
    ...(v.width === undefined ? {} : { width: v.width as number, height: v.height as number }),
  };
}
