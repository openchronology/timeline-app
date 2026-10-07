// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { imageSource } from './image-assets.js';
import { pluginFocus, pluginMarker, pluginColor, pluginRichText, imageURL } from './plugins.js';
import { renderMarkdown } from './rich-text.js';
import type { InstalledPlugin } from './plugins.js';

/** Host-owned preview: manifests never supply HTML or executable handlers. */
export function createHoverPreview(stage: HTMLElement, scale: () => number) {
  const card = document.createElement('div');
  card.className = 'focus-card';
  card.setAttribute('role', 'tooltip');
  card.id = 'moment-hover-preview';
  card.setAttribute('aria-hidden', 'true');
  const img = document.createElement('img');
  img.crossOrigin = 'anonymous';
  img.referrerPolicy = 'no-referrer';
  img.alt = '';
  const title = document.createElement('strong');
  const notes = document.createElement('div');
  notes.className = 'focus-notes';
  const sources = document.createElement('section');
  sources.className = 'focus-sources';
  card.append(img, title, notes, sources);
  stage.append(card);
  const data = new WeakMap<
    HTMLButtonElement,
    { metadata: Record<string, unknown>; plugins: readonly InstalledPlugin[] }
  >();
  const bound = new WeakSet<HTMLButtonElement>();
  let target: HTMLButtonElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const hide = () => {
    clearTimeout(timer);
    target?.removeAttribute('aria-describedby');
    target = null;
    card.classList.remove('open');
    card.setAttribute('aria-hidden', 'true');
  };
  const position = () => {
    if (!target?.isConnected || !data.has(target)) {
      hide();
      return;
    }
    const bounds = stage.getBoundingClientRect(),
      dot = target.getBoundingClientRect();
    if (
      dot.bottom < bounds.top ||
      dot.top > bounds.bottom ||
      dot.right < bounds.left ||
      dot.left > bounds.right
    ) {
      hide();
      return false;
    }
    const s = Math.min(
        scale(),
        (bounds.width * 0.95) / card.offsetWidth,
        (bounds.height * 0.95) / card.offsetHeight,
      ),
      w = card.offsetWidth * s,
      h = card.offsetHeight * s;
    card.style.left = `${Math.max(w / 2, Math.min(bounds.width - w / 2, dot.left - bounds.left + dot.width / 2))}px`;
    let centerY = dot.top - bounds.top + dot.height / 2;
    const fan = target.closest('.summary-fan');
    if (fan) {
      // Keep every expanded member reachable while inspecting one of its neighbors.
      const members = Array.from(fan.querySelectorAll('.summary-member'), (node) =>
        node.getBoundingClientRect(),
      );
      const top = Math.min(...members.map((member) => member.top)) - bounds.top;
      const bottom = Math.max(...members.map((member) => member.bottom)) - bounds.top;
      centerY = top >= h + 12 ? top - h / 2 - 12 : bottom + h / 2 + 12;
    }
    card.style.top = `${Math.max(h / 2, Math.min(bounds.height - h / 2, centerY))}px`;
    card.style.setProperty('--card-scale', String(s));
    return true;
  };
  const show = (button: HTMLButtonElement) => {
    clearTimeout(timer);
    const entry = data.get(button);
    if (!entry || button.closest('.summary-fan[data-expanding]')) return;
    target?.removeAttribute('aria-describedby');
    target = button;
    button.setAttribute('aria-describedby', card.id);
    title.textContent =
      typeof entry.metadata.title === 'string' && entry.metadata.title.trim()
        ? entry.metadata.title
        : 'Unnamed moment';
    const description =
      typeof entry.metadata.description === 'string'
        ? entry.metadata.description.slice(0, 600)
        : '';
    notes.replaceChildren();
    notes.classList.remove('markdown-view');
    if (pluginRichText(entry.plugins)) renderMarkdown(notes, description);
    else {
      const p = document.createElement('p');
      p.textContent = description;
      notes.append(p);
    }
    notes.hidden = !description;
    sources.replaceChildren();
    const urls = Array.isArray(entry.metadata.sources)
      ? entry.metadata.sources
          .filter((v): v is string => typeof v === 'string' && !!imageURL(v))
          .slice(0, 100)
      : [];
    sources.hidden = !urls.length;
    if (urls.length) {
      const heading = document.createElement('h4');
      heading.textContent = 'Sources';
      const list = document.createElement('ul');
      for (const url of urls) {
        const li = document.createElement('li'),
          link = document.createElement('a');
        link.textContent = url;
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.referrerPolicy = 'no-referrer';
        li.append(link);
        list.append(li);
      }
      sources.append(heading, list);
    }
    const url = imageSource(pluginMarker(entry.plugins, entry.metadata));
    img.hidden = !url || !img.complete || !img.naturalWidth;
    if (url && img.getAttribute('src') !== url) {
      img.hidden = true;
      img.src = url;
    }
    if (!url) img.removeAttribute('src');
    card.style.borderColor = pluginColor(entry.plugins, entry.metadata) ?? '';
    card.setAttribute('aria-hidden', 'false');
    if (position()) card.classList.add('open');
  };
  img.onload = () => {
    img.hidden = false;
    position();
  };
  img.onerror = () => {
    img.hidden = true;
    position();
  };
  const leave = () => {
    clearTimeout(timer);
    timer = setTimeout(hide, target?.closest('.summary-fan') ? 350 : 100);
  };
  card.onpointerenter = () => clearTimeout(timer);
  card.onpointerleave = leave;
  card.addEventListener('focusin', () => clearTimeout(timer));
  card.addEventListener('focusout', leave);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hide();
    }
  });
  card.onclick = (event) => {
    if ((event.target as Element).closest('a')) return;
    const button = target;
    hide();
    button?.click();
  };
  card.onpointerdown = (event) => event.stopPropagation();
  card.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true });
  card.oncontextmenu = (event) => {
    event.preventDefault();
    event.stopPropagation();
    target?.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: event.clientX,
        clientY: event.clientY,
      }),
    );
  };
  return {
    hide,
    refresh: () => {
      if (target) show(target);
    },
    update(
      button: HTMLButtonElement,
      plugins: readonly InstalledPlugin[],
      metadata: Record<string, unknown>,
      count = 1n,
    ) {
      const enabled = count === 1n && pluginFocus(plugins, metadata);
      button.classList.toggle('focus-preview', enabled);
      if (enabled) {
        data.set(button, { metadata, plugins });
        button.removeAttribute('title');
      } else {
        data.delete(button);
        if (target === button) hide();
      }
      if (!bound.has(button)) {
        bound.add(button);
        button.addEventListener('pointerenter', (e) => {
          if (e.pointerType !== 'touch') show(button);
        });
        button.addEventListener('pointerleave', leave);
        button.addEventListener('focus', () => show(button));
        button.addEventListener('previewready', () => {
          if (button.matches(':hover') || document.activeElement === button) show(button);
        });
        button.addEventListener('blur', leave);
        button.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            hide();
          }
        });
      }
    },
  };
}
