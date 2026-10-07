// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { Rational as Q } from 'rational-ordered-map';

/** Ephemeral display information, in the timeline's stored coordinate units. */
export interface PresentationContext {
  readonly left: Q;
  readonly span: Q;
  readonly widthPixels: number;
  readonly purpose: 'axis' | 'event' | 'input' | 'tooltip';
  readonly spacingPixels?: number;
}
export function validateContext(context?: PresentationContext): PresentationContext | undefined {
  if (context === undefined) return undefined;
  if (
    !(context.left instanceof Q) ||
    !(context.span instanceof Q) ||
    context.span.compare(Q.zero) <= 0
  )
    throw new Error('Presentation context needs exact bounds and a positive span.');
  if (
    !Number.isFinite(context.widthPixels) ||
    context.widthPixels <= 0 ||
    context.widthPixels > 1000000
  )
    throw new Error('Presentation width must be between zero and one million pixels.');
  if (!['axis', 'event', 'input', 'tooltip'].includes(context.purpose))
    throw new Error('Invalid presentation purpose.');
  if (
    context.spacingPixels !== undefined &&
    (!Number.isFinite(context.spacingPixels) ||
      context.spacingPixels <= 0 ||
      context.spacingPixels > 1000000)
  )
    throw new Error('Invalid presentation label spacing.');
  return context;
}
export function unitsPerPixel(context: PresentationContext): Q {
  return context.span.div(Q.parseDecimal(context.widthPixels.toString()));
}
