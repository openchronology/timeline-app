// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The reader (#233): a moment or duration as someone reading the timeline sees it, in place of
// the editor's form. A full-size hover card: its images, time, tags, notes, the plugins' fields
// with their values, and its stack's entries. Built from text nodes, links and images only.
import { imageSource } from './image-assets.js';
import { imageURL, pluginBackground, pluginMarker, stackEntries, toggleValue } from './plugins.js';
import { renderMarkdown } from './rich-text.js';
import { entityTags } from './tags.js';
import type { InstalledPlugin } from './plugins.js';

export interface ReaderEntity {
  kind: 'moment' | 'duration';
  metadata: Record<string, unknown>;
  /** The plugins that apply to its kind (momentPlugins or durationPlugins). */
  plugins: readonly InstalledPlugin[];
  /** When it is, as presented: a time, or a span. */
  when: string;
  /** Notes are Markdown: the timeline has the rich-text plugin on, for moments or durations. */
  markdown: boolean;
}

/** The host an image URL names, credited under its image. */
function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
const textOf = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** An image fetched without credentials or a referrer, shown once it loads. */
function picture(url: string, source: string, className: string) {
  const figure = document.createElement('figure');
  figure.className = className;
  const img = document.createElement('img');
  img.alt = '';
  img.crossOrigin = 'anonymous';
  img.referrerPolicy = 'no-referrer';
  img.decoding = 'async';
  img.hidden = true;
  img.onload = () => (img.hidden = false);
  img.onerror = () => figure.remove();
  img.src = source;
  const credit = document.createElement('figcaption');
  credit.textContent = `Image: ${hostOf(url)}`;
  figure.append(img, credit);
  return figure;
}

/** Notes as Markdown when the rich-text plugin is on, otherwise as plain paragraphs. */
function notes(text: string, markdown: boolean) {
  const box = document.createElement('div');
  box.className = 'reader-notes';
  if (markdown) renderMarkdown(box, text);
  else
    for (const paragraph of text.split(/\n{2,}/)) {
      const p = document.createElement('p');
      p.textContent = paragraph;
      box.append(p);
    }
  return box;
}

/** Only safe https URLs become links (imageURL applies the same rule as for images). */
function links(values: unknown) {
  const list = document.createElement('ul');
  list.className = 'reader-links';
  for (const url of Array.isArray(values) ? values.slice(0, 100) : []) {
    if (typeof url !== 'string' || !imageURL(url)) continue;
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
  return list.children.length ? list : null;
}

/**
 * The labels of the toggle fields that are on (#325), such as "Presumptive (unconfirmed)", as
 * a list of flags; null when none is.
 */
function flags(plugins: readonly InstalledPlugin[], metadata: Record<string, unknown>) {
  const list = document.createElement('ul');
  list.className = 'reader-flags';
  const seen = new Set<string>();
  for (const plugin of plugins)
    if (plugin.enabled)
      for (const field of plugin.manifest.fields)
        if (field.kind === 'toggle' && !seen.has(field.metadataKey)) {
          seen.add(field.metadataKey);
          if (!toggleValue(metadata[field.metadataKey])) continue;
          const li = document.createElement('li');
          li.textContent = field.label;
          list.append(li);
        }
  return list.children.length ? list : null;
}

function section(heading: string, ...content: Node[]) {
  const box = document.createElement('section');
  box.className = 'reader-section';
  const title = document.createElement('h3');
  title.textContent = heading;
  box.append(title, ...content);
  return box;
}

/** Fills `host` with the entity as read. Fields its plugins only use for drawing are left out. */
export function renderReader(host: HTMLElement, entity: ReaderEntity) {
  const { metadata, plugins } = entity;
  const enabled = plugins.filter((p) => p.enabled);
  host.replaceChildren();

  // Its images: its marker's or background's first, then any others its plugins hold.
  const urls = [
    entity.kind === 'moment'
      ? pluginMarker(plugins, metadata)
      : pluginBackground(plugins, metadata),
    ...enabled.flatMap((p) =>
      p.manifest.fields
        .filter((f) => f.kind === 'image-url')
        .map((f) => imageURL(metadata[f.metadataKey])),
    ),
  ].filter((url, i, all): url is string => !!url && all.indexOf(url) === i);
  const shown = urls
    .map((url) => ({ url, source: imageSource(url) }))
    .filter((image): image is { url: string; source: string } => !!image.source);
  if (shown.length) host.append(picture(shown[0].url, shown[0].source, 'reader-image'));

  const when = document.createElement('p');
  when.className = 'reader-when';
  when.textContent = entity.when;
  host.append(when);

  const tags = entityTags(metadata);
  if (tags.length) {
    const list = document.createElement('ul');
    list.className = 'reader-tags';
    list.setAttribute('aria-label', 'Tags');
    for (const tag of tags) {
      const li = document.createElement('li');
      li.textContent = tag;
      list.append(li);
    }
    host.append(list);
  }
  const flagged = flags(plugins, metadata);
  if (flagged) host.append(flagged);

  const description = textOf(metadata.description);
  if (description) host.append(notes(description, entity.markdown));

  // Plugins' fields that say something: text, notes, links and stacks (toggles are flags).
  const seen = new Set<string>();
  const details = document.createElement('dl');
  details.className = 'reader-details';
  const sections: HTMLElement[] = [];
  for (const plugin of enabled)
    for (const field of plugin.manifest.fields) {
      if (seen.has(field.metadataKey)) continue;
      seen.add(field.metadataKey);
      const value = metadata[field.metadataKey];
      if (field.kind === 'text' || field.kind === 'multiline') {
        const text = textOf(value);
        if (!text) continue;
        const term = document.createElement('dt'),
          definition = document.createElement('dd');
        term.textContent = field.label;
        definition.textContent = text;
        details.append(term, definition);
      } else if (field.kind === 'links') {
        const list = links(value);
        if (list) sections.push(section(field.label, list));
      } else if (field.kind === 'stack') {
        const entries = stackEntries(value);
        if (!entries.length) continue;
        const list = document.createElement('div');
        list.className = 'reader-stack';
        for (const entry of entries) {
          const card = document.createElement('article');
          const image = pluginMarker(plugins, entry.metadata),
            source = image && imageSource(image);
          if (image && source) card.append(picture(image, source, 'reader-stack-image'));
          const title = document.createElement('h4');
          title.textContent = textOf(entry.metadata.title) || 'Untitled entry';
          card.append(title);
          const entryFlags = flags(plugins, entry.metadata);
          if (entryFlags) card.append(entryFlags);
          const text = textOf(entry.metadata.description) || textOf(entry.metadata.notes);
          if (text) card.append(notes(text, entity.markdown));
          list.append(card);
        }
        sections.push(section(field.label, list));
      }
    }
  if (details.children.length) host.append(details);
  host.append(...sections);

  // The rest of its images, after what it says.
  if (shown.length > 1) {
    const gallery = document.createElement('div');
    gallery.className = 'reader-gallery';
    for (const image of shown.slice(1))
      gallery.append(picture(image.url, image.source, 'reader-gallery-image'));
    host.append(section('Images', gallery));
  }
}
