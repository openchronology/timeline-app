// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import type { FrameGroup, PointEvent } from './core.js';
interface Host {
  scale(): number;
  generation(): string;
  load(group: FrameGroup, signal: AbortSignal): Promise<{ events: PointEvent[]; next: unknown }>;
  decorate(button: HTMLButtonElement, event: PointEvent): void;
  select(event: PointEvent): void;
  hidePreview(): void;
}
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
/** One transient fan, no permanent member cache; requests and DOM die with the viewport. */
export function createSummaryExpansion(stage: HTMLElement, host: Host) {
  const bindings = new WeakMap<
    HTMLButtonElement,
    { group: FrameGroup; key: string; enabled: boolean }
  >();
  const bound = new WeakSet<HTMLButtonElement>();
  let target: HTMLButtonElement | null = null,
    key = '',
    generation = '',
    origin = '';
  let controller: AbortController | undefined, overlay: HTMLDivElement | undefined;
  let openTimer: ReturnType<typeof setTimeout> | undefined,
    closeTimer: ReturnType<typeof setTimeout> | undefined;
  let epoch = 0;
  const position = (button: HTMLButtonElement) => {
    const b = button.getBoundingClientRect(),
      s = stage.getBoundingClientRect();
    return { x: b.left - s.left + b.width / 2, y: b.top - s.top + b.height / 2 };
  };
  const locationKey = (button: HTMLButtonElement) => {
    const p = position(button);
    return `${p.x}:${p.y}:${stage.clientWidth}:${stage.clientHeight}:${host.scale()}`;
  };
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
  const held = () =>
    !!target &&
    (target.matches(':hover') ||
      !!overlay?.matches(':hover') ||
      !!overlay?.querySelector(':focus-visible') ||
      target.matches(':focus-visible') ||
      !!stage.querySelector('.focus-card.open:hover, .focus-card.open:focus-within'));
  function leave() {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (!held()) hide(true);
    }, 220);
  }
  stage.querySelector('.focus-card')?.addEventListener('pointerleave', leave);
  stage.querySelector('.focus-card')?.addEventListener('focusout', leave);
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
        member.setAttribute('aria-label', event.metadata.title?.trim() || 'Unnamed moment');
        member.style.setProperty('--fan-scale', String(positions[i].scale));
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
      // Commit the collapsed geometry before changing to the radial geometry.
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
      for (const node of nodes) node.dispatchEvent(new Event('previewready'));
    } catch {
      if (request === epoch) hide(); // Hover failures leave the summary's ordinary click interaction intact.
    }
  }
  return {
    hide,
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
          if (e.pointerType !== 'touch') openTimer = setTimeout(() => void open(button), 100);
        });
        button.addEventListener('pointerleave', () => {
          clearTimeout(openTimer);
          leave();
        });
        button.addEventListener('focus', () => void open(button));
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
