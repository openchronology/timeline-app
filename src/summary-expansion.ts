// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Expanding a summary on the timeline: hovering or focusing a group of two to five moments fans
// them out around it, loaded on demand and gone when the view changes.
import type { FrameGroup, PointEvent } from './core.js';
/** What the fan needs from the editor. */
interface Host {
  /** The chart's UI scale, which sizes the fan. */
  scale(): number;
  /** Changes whenever the drawn data changes (a new frame, document or revision). */
  generation(): string;
  /** One page of the group's moments (a bounded events query); rejects when aborted. */
  load(group: FrameGroup, signal: AbortSignal): Promise<{ events: PointEvent[]; next: unknown }>;
  /** Styles a member like an ordinary marker (plugins, hover preview). */
  decorate(button: HTMLButtonElement, event: PointEvent): void;
  /** Opens a member's moment, as clicking its marker would. */
  select(event: PointEvent): void;
  /** Closes the hover card, which may belong to a member being removed. */
  hidePreview(): void;
}
/**
 * Where to put a fan of `count` (two to five) members around the point (x, y) in a stage
 * of `width` × `height` pixels: evenly around a circle starting straight up, with radius
 * and margin shrinking with `scale` (and with small stages, down to 5%), and the centre
 * moved inward so no member leaves the stage. Throws for other counts.
 */
export function radialPositions(
  count: number,
  width: number,
  height: number,
  x: number,
  y: number,
  scale: number,
) {
  if (!Number.isInteger(count) || count < 2 || count > 5)
    throw new Error('Fan size must be two to five.');
  const s = Math.max(0.05, Math.min(scale, width / 240, height / 240));
  const radius = 62 * s,
    margin = 50 * s;
  const cx = Math.max(radius + margin, Math.min(width - radius - margin, x));
  const cy = Math.max(radius + margin, Math.min(height - radius - margin, y));
  return Array.from({ length: count }, (_, i) => ({
    x: cx + Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / count) * radius,
    y: cy + Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / count) * radius,
    scale: s,
  }));
}
/**
 * One transient fan, no permanent member cache; requests and DOM die with the viewport.
 *
 * Summary markers registered with `update` fan out their two to five moments when hovered
 * for 100 ms or given keyboard focus: the moments are loaded, laid out with
 * radialPositions and animated out from the summary; Arrow Down moves focus into the fan,
 * Escape closes it. The fan closes 400 ms after the pointer and focus have left the
 * summary, the fan and the hover card, and at once when the view or data changes
 * (`refresh`). Must be created after the hover preview, whose card it listens to.
 */
export function createSummaryExpansion(stage: HTMLElement, host: Host) {
  // Per-summary state: its group, an identity key for that group, and whether it may fan.
  const bindings = new WeakMap<
    HTMLButtonElement,
    { group: FrameGroup; key: string; enabled: boolean }
  >();
  const bound = new WeakSet<HTMLButtonElement>();
  // The summary that is open (or loading), with the key, data generation and on-screen
  // location it was opened under; a change in any of them makes the fan stale.
  let target: HTMLButtonElement | null = null,
    key = '',
    generation = '',
    origin = '';
  let controller: AbortController | undefined, overlay: HTMLDivElement | undefined;
  let openTimer: ReturnType<typeof setTimeout> | undefined,
    closeTimer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped by every hide, so an open still awaiting its load or animation can tell it lost. */
  let epoch = 0;
  /** A marker's centre in stage coordinates. */
  const position = (button: HTMLButtonElement) => {
    const b = button.getBoundingClientRect(),
      s = stage.getBoundingClientRect();
    return { x: b.left - s.left + b.width / 2, y: b.top - s.top + b.height / 2 };
  };
  /** Where the summary sits and how the stage is sized: any change means the view moved. */
  const locationKey = (button: HTMLButtonElement) => {
    const p = position(button);
    return `${p.x}:${p.y}:${stage.clientWidth}:${stage.clientHeight}:${host.scale()}`;
  };
  /**
   * Closes the fan and cancels its load. With `animate` (and unless reduced motion is
   * preferred) the members slide back into the summary and fade over 160 ms, inert and
   * click-through meanwhile, then are removed; otherwise they are removed at once.
   */
  function hide(animate = false) {
    epoch++;
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    controller?.abort();
    controller = undefined;
    target?.removeAttribute('aria-expanded');
    target = null;
    const old = overlay;
    overlay = undefined;
    if (old) {
      // Marks the fan as moving, so the hover card won't open on a member passing by.
      old.dataset.expanding = 'true';
      host.hidePreview();
      if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        old.inert = true;
        old.style.pointerEvents = 'none';
        old.querySelectorAll<HTMLElement>('.summary-member').forEach((node) => {
          node.style.left = old.dataset.originX + 'px';
          node.style.top = old.dataset.originY + 'px';
          node.style.opacity = '0';
        });
        old
          .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 })
          .finished.then(() => old.remove())
          .catch(() => old.remove());
      } else old.remove();
    }
  }
  /** Whether the person is still using the fan: hovering or focusing it, its summary or the card. */
  const held = () =>
    !!target &&
    (target.matches(':hover') ||
      !!overlay?.matches(':hover') ||
      !!overlay?.contains(document.activeElement) ||
      target.matches(':focus-visible') ||
      !!stage.querySelector('.focus-card.open:hover, .focus-card.open:focus-within'));
  function leave() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (!held()) hide(true);
    }, 400);
  }
  // Leaving the hover card counts as leaving the fan: the card may be shown for a member.
  stage.querySelector('.focus-card')?.addEventListener('pointerleave', leave);
  stage.querySelector('.focus-card')?.addEventListener('focusout', leave);
  /**
   * Loads a summary's moments and fans them out. Abandons the attempt (closing quietly) if
   * a newer open or hide happened, the summary was removed or moved, the data changed, or
   * the moments don't match the summary's count while loading. Errors leave the summary's
   * own click behaviour as it was.
   */
  async function open(button: HTMLButtonElement) {
    const binding = bindings.get(button);
    if (!binding?.enabled || !button.isConnected || target === button) return;
    hide();
    target = button;
    key = binding.key;
    generation = host.generation();
    origin = locationKey(button);
    const request = epoch,
      abort = new AbortController();
    controller = abort;
    try {
      const page = await host.load(binding.group, abort.signal);
      if (
        request !== epoch ||
        !button.isConnected ||
        generation !== host.generation() ||
        origin !== locationKey(button) ||
        bindings.get(button)?.key !== key
      ) {
        if (request === epoch) hide();
        return;
      }
      // Stale/approximate counts never cause a partial or oversized fan.
      if (
        page.next ||
        page.events.length !== Number(binding.group.count) ||
        page.events.length < 2 ||
        page.events.length > 5 ||
        new Set(page.events.map((e) => e.id)).size !== page.events.length
      ) {
        hide();
        return;
      }
      const p = position(button),
        positions = radialPositions(
          page.events.length,
          stage.clientWidth,
          stage.clientHeight,
          p.x,
          p.y,
          host.scale(),
        );
      overlay = document.createElement('div');
      overlay.className = 'summary-fan';
      overlay.dataset.expanding = 'true';
      overlay.setAttribute('role', 'group');
      overlay.setAttribute('aria-label', 'Expanded summary moments');
      overlay.dataset.originX = String(p.x);
      overlay.dataset.originY = String(p.y);
      // A transparent area spanning the summary and every member (plus 24 pixels), so the
      // pointer can cross the gaps without leaving the fan; a click on it acts as a click
      // on the summary.
      const hit = document.createElement('div');
      hit.className = 'summary-fan-hit';
      hit.addEventListener('click', () => button.click());
      const xs = [p.x, ...positions.map((p) => p.x)],
        ys = [p.y, ...positions.map((p) => p.y)];
      hit.style.left = `${Math.min(...xs) - 24}px`;
      hit.style.top = `${Math.min(...ys) - 24}px`;
      hit.style.width = `${Math.max(...xs) - Math.min(...xs) + 48}px`;
      hit.style.height = `${Math.max(...ys) - Math.min(...ys) + 48}px`;
      overlay.append(hit);
      // Spokes from the summary to each member.
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('summary-fan-lines');
      for (const end of positions) {
        const line = document.createElementNS(svg.namespaceURI, 'line');
        for (const [name, value] of Object.entries({ x1: p.x, y1: p.y, x2: end.x, y2: end.y }))
          line.setAttribute(name, String(value));
        svg.append(line);
      }
      overlay.append(svg);
      const nodes: HTMLButtonElement[] = [];
      page.events.forEach((event, i) => {
        const member = document.createElement('button');
        member.type = 'button';
        member.className = 'event-marker summary-member';
        member.dataset.eventId = event.id;
        member.setAttribute('aria-label', event.metadata.title?.trim() || 'Untitled moment');
        member.style.setProperty('--fan-scale', String(positions[i].scale));
        // Members start hidden on the summary and move out once inserted.
        member.style.left = p.x + 'px';
        member.style.top = p.y + 'px';
        member.style.opacity = '0';
        host.decorate(member, event);
        member.addEventListener('click', (e) => {
          e.stopPropagation();
          host.select(event);
        });
        overlay!.append(member);
        nodes.push(member);
      });
      overlay.addEventListener('pointerenter', () => clearTimeout(closeTimer));
      overlay.addEventListener('pointerleave', leave);
      overlay.addEventListener('focusout', leave);
      // Keep the chart underneath from starting a pan or clearing the selection.
      overlay.addEventListener('pointerdown', (e) => e.stopPropagation());
      overlay.addEventListener('click', (e) => e.stopPropagation());
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          hide(true);
        }
      });
      stage.append(overlay);
      button.setAttribute('aria-expanded', 'true');
      // Commit the collapsed geometry before changing to the radial geometry (reading
      // layout forces a style flush, so the change below runs as a CSS transition).
      overlay.getBoundingClientRect();
      nodes.forEach((node, i) => {
        node.style.left = positions[i].x + 'px';
        node.style.top = positions[i].y + 'px';
        node.style.opacity = '1';
      });
      const fan = overlay;
      // Wait for the actual movement transitions, including reduced-motion's zero transitions.
      // Hover/focus may arrive while a member is still passing under the pointer.
      await Promise.allSettled(
        nodes.flatMap((node) => node.getAnimations().map((animation) => animation.finished)),
      );
      if (request !== epoch || overlay !== fan || !fan.isConnected) return;
      delete fan.dataset.expanding;
      // Let the hover preview show for a member that is already under the pointer.
      for (const node of nodes) node.dispatchEvent(new Event('previewready'));
    } catch {
      if (request === epoch) hide(); // Hover failures leave the summary's ordinary click interaction intact.
    }
  }
  return {
    hide,
    /** Closes the fan if anything it depended on changed; called after each redraw. */
    refresh() {
      if (
        target &&
        (!target.isConnected ||
          !bindings.get(target)?.enabled ||
          bindings.get(target)?.key !== key ||
          generation !== host.generation() ||
          origin !== locationKey(target))
      )
        hide();
    },
    /**
     * Registers or refreshes a summary marker. It may fan only when `enabled` and it holds
     * two to five moments. The key identifies the group by span, count and comparison
     * source, so a marker reused for a different group is recognised. Listeners are
     * added once per marker.
     */
    update(button: HTMLButtonElement, group: FrameGroup, enabled: boolean) {
      const count = BigInt(group.count);
      bindings.set(button, {
        group,
        key: JSON.stringify([
          group.first,
          group.last,
          group.count,
          (group as FrameGroup & { sourceKey?: string }).sourceKey,
        ]),
        enabled: enabled && count >= 2n && count <= 5n,
      });
      if (!bound.has(button)) {
        bound.add(button);
        button.addEventListener('pointerenter', (e) => {
          clearTimeout(closeTimer);
          // Not for touch (a tap selects) nor while a button is held (a drag or pan).
          if (e.pointerType !== 'touch' && e.buttons === 0)
            openTimer = setTimeout(() => void open(button), 100);
        });
        button.addEventListener('pointerleave', () => {
          clearTimeout(openTimer);
          leave();
        });
        button.addEventListener('focus', () => {
          // Mouse focus arrives between down and up: inserting moving members there
          // changes the click target. Keyboard focus may expand immediately.
          if (button.matches(':focus-visible')) void open(button);
        });
        button.addEventListener('blur', leave);
        button.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') hide(true);
          if (e.key === 'ArrowDown' && target === button && overlay) {
            e.preventDefault();
            overlay.querySelector<HTMLButtonElement>('.summary-member')?.focus();
          }
        });
      }
    },
  };
}
