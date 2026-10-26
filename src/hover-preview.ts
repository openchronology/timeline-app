// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The card shown on hovering a moment: its image, title and text, built by the editor from the
// moment's plugin fields.
import { imageSource } from './image-assets.js';
import {
  pluginFocus,
  pluginMarker,
  pluginColor,
  pluginOutline,
  pluginRichText,
  imageURL,
} from './plugins.js';
import { renderMarkdown } from './rich-text.js';
import type { InstalledPlugin } from './plugins.js';

/** The host an image URL names, or nothing for one that is not a URL. */
function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
/**
 * Host-owned preview: manifests never supply HTML or executable handlers.
 *
 * Creates the single hover card in `stage` and returns its controls. The editor calls
 * `update` for each marker it draws; markers whose plugins enable focus-on-hover (and that
 * stand for one moment) then show the card on pointer hover or keyboard focus, filled
 * from their metadata: title, description (Markdown when the rich-text plugin is on),
 * https source links and the plugin marker image with its host credited. `scale` gives the
 * chart's UI scale for the card; `select` opens the moment's details when the card is
 * clicked. `hide` closes the card, and `refresh` redraws it after its marker's data changed.
 */
export function createHoverPreview(
  stage: HTMLElement,
  scale: () => number,
  select: (button: HTMLButtonElement) => void,
) {
  const card = document.createElement('div');
  card.className = 'focus-card';
  // A tooltip that the shown marker points at with aria-describedby, so screen readers
  // read the card's text as the marker's description; hidden from them while closed.
  card.setAttribute('role', 'tooltip');
  card.id = 'moment-hover-preview';
  card.setAttribute('aria-hidden', 'true');
  const img = document.createElement('img');
  // Fetched without credentials and without telling the image host which page asked.
  img.crossOrigin = 'anonymous';
  img.referrerPolicy = 'no-referrer';
  // Decorative: the title next to it says what the moment is.
  img.alt = '';
  const title = document.createElement('strong');
  const notes = document.createElement('div');
  notes.className = 'focus-notes';
  const sources = document.createElement('section');
  sources.className = 'focus-sources';
  // Where the image is hosted, credited (#109).
  const credit = document.createElement('small');
  credit.className = 'focus-credit';
  card.append(img, credit, title, notes, sources);
  stage.append(card);
  // Per-marker preview data, and the markers already given listeners. Weak, so markers the
  // editor discards are collected without any cleanup here.
  const data = new WeakMap<
    HTMLButtonElement,
    {
      metadata: Record<string, unknown>;
      plugins: readonly InstalledPlugin[];
      /** What an untitled one is called: a moment, a duration or a stack entry. */
      untitled: string;
    }
  >();
  const bound = new WeakSet<HTMLButtonElement>();
  /** The marker the card is shown for, and the pending delayed hide. */
  let target: HTMLButtonElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Closes the card at once and unlinks it from its marker. */
  const hide = () => {
    clearTimeout(timer);
    target?.removeAttribute('aria-describedby');
    target = null;
    card.classList.remove('open');
    card.setAttribute('aria-hidden', 'true');
  };
  /**
   * Places the card centred on its marker, inside the stage, scaled down to fit 95% of
   * the stage if needed. Returns true when placed; hides the card (returning a false value)
   * when the marker is gone, no longer previewable, or scrolled out of the stage.
   */
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
    // Clamp the centre so the scaled card stays fully within the stage horizontally.
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
      // Above the fan when the card fits there with a 12-pixel gap, otherwise below it.
      centerY = top >= h + 12 ? top - h / 2 - 12 : bottom + h / 2 + 12;
    }
    card.style.top = `${Math.max(h / 2, Math.min(bounds.height - h / 2, centerY))}px`;
    card.style.setProperty('--card-scale', String(s));
    return true;
  };
  /**
   * Fills the card from a marker's data and opens it. Builds only text nodes, links and an
   * image, never HTML from metadata. Ignored for markers without preview data and while a
   * summary fan is still animating open (its members would be passing under the pointer;
   * `previewready` retries once it settles).
   */
  const show = (button: HTMLButtonElement) => {
    clearTimeout(timer);
    const entry = data.get(button);
    if (!entry || button.closest('.summary-fan[data-expanding]')) return;
    target?.removeAttribute('aria-describedby');
    target = button;
    button.setAttribute('aria-describedby', card.id);
    // A labelled moment's image is blurred here as on its marker (#115).
    card.toggleAttribute('data-sensitive', button.hasAttribute('data-sensitive'));
    title.textContent =
      typeof entry.metadata.title === 'string' && entry.metadata.title.trim()
        ? entry.metadata.title
        : entry.untitled;
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
    // Only safe https URLs become links (imageURL applies the same rule as for images).
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
    const linked = pluginMarker(entry.plugins, entry.metadata);
    // An embedded copy when there is one; offline, nothing for an image without one.
    const url = imageSource(linked);
    credit.textContent = linked && url ? `Image: ${hostOf(linked)}` : '';
    credit.hidden = !credit.textContent;
    // Keep the image hidden until it has loaded (onload shows it), so the card never shows
    // a broken image or the previous moment's picture.
    img.hidden = !url || !img.complete || !img.naturalWidth;
    if (url && img.getAttribute('src') !== url) {
      img.hidden = true;
      img.src = url;
    }
    if (!url) img.removeAttribute('src');
    // A presumptive moment or duration (#325) has a dashed card, as its marker is dashed,
    // darker than the usual border unless it has a color.
    const dashed = pluginOutline(entry.plugins, entry.metadata) === 'dashed';
    card.style.borderStyle = dashed ? 'dashed' : '';
    card.style.borderColor =
      pluginColor(entry.plugins, entry.metadata) ?? (dashed ? 'var(--muted)' : '');
    card.setAttribute('aria-hidden', 'false');
    if (position()) card.classList.add('open');
  };
  // The card's size changes with the image, so it is placed again either way.
  img.onload = () => {
    img.hidden = false;
    position();
  };
  img.onerror = () => {
    img.hidden = true;
    position();
  };
  /**
   * Hides after a short delay, so the pointer can travel from the marker to the card (or
   * focus move into it) without the card closing; longer inside a summary fan, whose card
   * sits further from the marker.
   */
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
  // Clicking the card (other than a source link) selects its moment, like clicking the
  // marker. Pointer, click and wheel events stop here, so the chart underneath does not
  // pan, zoom or deselect.
  card.onclick = (event) => {
    event.stopPropagation();
    if ((event.target as Element).closest('a')) return;
    const button = target;
    hide();
    if (button) select(button);
  };
  card.onpointerdown = (event) => event.stopPropagation();
  card.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true });
  // The card stands in for its marker: a right-click on it opens the marker's context menu.
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
    /**
     * Registers or refreshes a marker's preview data. Only markers of one moment (`count`
     * 1) with focus-on-hover enabled preview; their native `title` tooltip is removed so
     * two tooltips never show. Listeners are added once per marker. `untitled` names an
     * untitled entry (a moment, a duration or a stack entry).
     */
    update(
      button: HTMLButtonElement,
      plugins: readonly InstalledPlugin[],
      metadata: Record<string, unknown>,
      count = 1n,
      untitled = 'Untitled moment',
    ) {
      const enabled = count === 1n && pluginFocus(plugins, metadata);
      button.classList.toggle('focus-preview', enabled);
      if (enabled) {
        data.set(button, { metadata, plugins, untitled });
        button.removeAttribute('title');
      } else {
        data.delete(button);
        if (target === button) hide();
      }
      if (!bound.has(button)) {
        bound.add(button);
        // Touch has no hover; a tap selects the moment instead.
        button.addEventListener('pointerenter', (e) => {
          if (e.pointerType !== 'touch') show(button);
        });
        button.addEventListener('pointerleave', leave);
        button.addEventListener('focus', () => show(button));
        // Sent by summary-expansion once a fan has settled: show the card if the pointer or
        // focus is already on this member.
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
