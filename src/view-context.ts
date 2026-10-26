// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// What a time presentation knows of the view it writes for: the visible window, its width in
// pixels and what the text is for, validated, and the time one pixel covers.
import { Rational as Q } from 'rational-ordered-map';

/** Ephemeral display information, in the timeline's stored coordinate units. */
export interface PresentationContext {
  readonly left: Q;
  readonly span: Q;
  readonly widthPixels: number;
  readonly purpose: 'axis' | 'event' | 'input' | 'tooltip';
  readonly spacingPixels?: number;
  /**
   * The exact time between the labels this text is drawn for, in stored units: a ruler
   * tick's interval. When given, it is the label resolution itself, rather than the
   * floating-point pixel spacing times the time per pixel, which can land a hair either side of
   * a calendar threshold and flip a label between "1997" and "1997-01" as the view moves.
   */
  readonly labelInterval?: Q;
  /**
   * How large the timeline's text appears on screen relative to its normal size (1). Ruler
   * labels need room for their apparent size, not a fixed number of pixels.
   */
  readonly textScale?: number;
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
  if (
    context.labelInterval !== undefined &&
    (!(context.labelInterval instanceof Q) || context.labelInterval.compare(Q.zero) <= 0)
  )
    throw new Error('Invalid presentation label interval.');
  if (
    context.textScale !== undefined &&
    (!Number.isFinite(context.textScale) || context.textScale < 0.1 || context.textScale > 10)
  )
    throw new Error('Invalid presentation text scale.');
  return context;
}
export function unitsPerPixel(context: PresentationContext): Q {
  return context.span.div(Q.parseDecimal(context.widthPixels.toString()));
}
/**
 * The time between labels, which decides how much detail a label shows: the context's exact
 * label interval, else the time per pixel times the label spacing (115 pixels on the ruler, 6
 * for moments, unless the context says otherwise).
 */
export function labelResolution(context: PresentationContext): Q {
  return (
    context.labelInterval ??
    unitsPerPixel(context).mul(
      Q.parseDecimal((context.spacingPixels ?? (context.purpose === 'axis' ? 115 : 6)).toString()),
    )
  );
}
