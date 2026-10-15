// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * What content can be reported as (#115), shared by the server (server/moderation.mjs) and the
 * platform's report dialog. The review queue lists the first two before the rest.
 */
export const REPORT_CATEGORIES = [
  ['child_abuse', 'Child sexual abuse or exploitation'],
  ['illegal', 'Other illegal content'],
  ['sexual', 'Sexually explicit content'],
  ['violence', 'Graphic violence or gore'],
  ['self_harm', 'Promotes suicide or self-harm'],
  ['harassment', 'Harassment, threats or private information'],
  ['spam', 'Spam or misleading'],
  ['copyright', 'Copyright infringement'],
  ['other', 'Something else'],
];
/** What can be reported: a timeline, something in one, a comment, a library entry or an account. */
export const REPORT_TARGETS = [
  'timeline',
  'moment',
  'duration',
  'comment',
  'plugin',
  'suite',
  'user',
];
/** The longest explanation a report or a moderation decision may give. */
export const REPORT_TEXT = 2000;
