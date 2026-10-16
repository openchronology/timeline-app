// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Sensitive-content labels (#115): what a timeline, moment or duration may be marked as
 * containing, so readers are warned and its images blurred until they choose to see them.
 * Pornography and gratuitous gore are not allowed at all; these label what is educational,
 * historical, medical, artistic or news content.
 */
export const CONTENT_LABELS = [
  ['nudity', 'Nudity'],
  ['violence', 'Graphic violence'],
  ['disturbing', 'Disturbing content'],
] as const;
export type ContentLabel = (typeof CONTENT_LABELS)[number][0];
/** The metadata key a moment's or duration's labels are kept under. */
export const CONTENT_LABELS_KEY = 'content_labels';
/** The known labels in `value`, in their usual order; anything else is ignored. */
export function contentLabels(value: unknown): ContentLabel[] {
  const given = new Set(Array.isArray(value) ? value : []);
  return CONTENT_LABELS.map(([key]) => key).filter((key) => given.has(key));
}
/** What the labels `labels` say, as one phrase ("Nudity and graphic violence"). */
export function describeLabels(labels: readonly string[]): string {
  const names = CONTENT_LABELS.filter(([key]) => labels.includes(key)).map(([, name], i) =>
    i ? name.toLowerCase() : name,
  );
  return names.length > 1
    ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
    : (names[0] ?? '');
}
