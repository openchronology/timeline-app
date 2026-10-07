// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { attachRichText } from './rich-text.js';
import { imageSource, imagesOffline } from './image-assets.js';
import {
  imageURL,
  sourceLinks,
  pluginRichText,
  pluginFields,
  stackEntries,
  COLOR_SWATCHES,
  colorValue,
  MOMENT_SHAPE_NAMES,
  shapeValue,
  MOMENT_SIZES,
  sizeValue,
} from './plugins.js';
import type { InstalledPlugin, StackEntry } from './plugins.js';

function image(alt: string) {
  const img = document.createElement('img');
  img.alt = alt;
  img.crossOrigin = 'anonymous';
  img.referrerPolicy = 'no-referrer';
  img.decoding = 'async';
  img.loading = 'lazy';
  return img;
}
export function renderPluginMarker(
  button: HTMLButtonElement,
  source: string | null,
  count: bigint,
) {
  let img = button.querySelector('img');
  if (count !== 1n || !source) {
    if (img) img.remove();
    button.classList.remove('icon');
    const text =
      count > 1n
        ? count > 999n
          ? `${(Number(count) / 1000).toFixed(count < 10000n ? 1 : 0)}k`
          : count.toString()
        : '';
    if (button.textContent !== text) button.textContent = text;
    return;
  }
  if (!img) {
    img = image('');
    img.loading = 'eager'; // Visible marker images must load even while their pending preview is hidden.
    img.setAttribute('aria-hidden', 'true');
    button.replaceChildren(img);
    img.onload = () => {
      if (img!.parentElement !== button) return;
      button.classList.add('icon');
      img!.hidden = false;
    };
    img.onerror = () => {
      if (img!.parentElement !== button) return;
      button.classList.remove('icon');
      img!.hidden = true;
    };
  }
  button.classList.toggle('icon', img.complete && img.naturalWidth > 0);
  if (img.getAttribute('src') !== source) {
    img.hidden = true;
    img.src = source;
  }
}
export function renderPluginFields(
  container: HTMLElement,
  plugins: readonly InstalledPlugin[],
  metadata: Record<string, unknown>,
  editable: boolean,
  onChange: (key: string, value: unknown) => void,
  openImage: (event: MouseEvent, url: string) => void,
  confirmDelete: (title: string, remove: () => void) => void,
  inheritedTime: () => string = () => '',
  child = false,
) {
  container.replaceChildren();
  for (const field of pluginFields(plugins)) {
    if (field.kind === 'stack' && child) continue;
    const section = document.createElement('section');
    section.className = 'plugin-field';
    section.dataset.metadataKey = field.metadataKey;
    if (field.kind === 'links') {
      const heading = document.createElement('label');
      heading.textContent = field.label;
      const list = document.createElement('ul');
      list.className = 'plugin-source-links';
      const input = document.createElement('textarea');
      input.dataset.pluginKey = field.metadataKey;
      input.rows = 3;
      input.maxLength = 100 * 4097;
      input.spellcheck = false;
      input.disabled = !editable;
      const raw = metadata[field.metadataKey];
      input.value = Array.isArray(raw) ? raw.filter((v) => typeof v === 'string').join('\n') : '';
      const draw = (links: string[]) => {
        list.replaceChildren();
        for (const url of links) {
          const item = document.createElement('li');
          const link = document.createElement('a');
          link.textContent = url;
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.referrerPolicy = 'no-referrer';
          item.append(link);
          list.append(item);
        }
        list.hidden = links.length === 0;
      };
      const update = (commit: boolean) => {
        try {
          const links = sourceLinks(
            input.value
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean),
          );
          input.setCustomValidity('');
          draw(links);
          if (commit) onChange(field.metadataKey, links);
        } catch (error) {
          input.setCustomValidity((error as Error).message);
        }
      };
      input.oninput = () => update(true);
      const hint = document.createElement('p');
      hint.className = 'field-hint';
      hint.textContent = 'One HTTPS source link per line. Links open only when clicked.';
      heading.append(input);
      section.append(list, heading, hint);
      update(false);
      if (!editable) {
        input.hidden = true;
        hint.hidden = true;
      }
      container.append(section);
      continue;
    }
    if (field.kind === 'shape' || field.kind === 'size') {
      const label = document.createElement('label');
      label.textContent = field.label;
      const select = document.createElement('select');
      select.setAttribute('aria-label', field.label);
      select.disabled = !editable;
      select.dataset.pluginKey = field.metadataKey;
      for (const shape of field.kind === 'size' ? MOMENT_SIZES : MOMENT_SHAPE_NAMES) {
        const option = document.createElement('option');
        option.value = shape;
        option.textContent = shape[0].toUpperCase() + shape.slice(1);
        select.append(option);
      }
      select.value =
        field.kind === 'size'
          ? (sizeValue(metadata[field.metadataKey]) ?? 'medium')
          : (shapeValue(metadata[field.metadataKey]) ?? 'circle');
      select.onchange = () => onChange(field.metadataKey, select.value);
      label.append(select);
      section.append(label);
      container.append(section);
      continue;
    }
    if (field.kind === 'color') {
      const label = document.createElement('label');
      label.textContent = field.label;
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = colorValue(metadata[field.metadataKey]) ?? '#547d5b';
      picker.disabled = !editable;
      picker.dataset.pluginKey = field.metadataKey;
      label.append(picker);
      const swatches = document.createElement('div');
      swatches.className = 'color-swatches';
      const buttons: HTMLButtonElement[] = [];
      const select = (value: string) => {
        buttons.forEach((b, i) =>
          b.setAttribute('aria-pressed', String(COLOR_SWATCHES[i].value === value)),
        );
        picker.value = value || '#547d5b';
        onChange(field.metadataKey, value);
      };
      for (const swatch of COLOR_SWATCHES) {
        const button = document.createElement('button');
        button.type = 'button';
        button.disabled = !editable;
        button.textContent = swatch.name;
        button.title = swatch.name;
        button.style.setProperty('--swatch', swatch.value || '#547d5b');
        button.setAttribute(
          'aria-pressed',
          String((colorValue(metadata[field.metadataKey]) ?? '') === swatch.value),
        );
        button.onclick = () => select(swatch.value);
        buttons.push(button);
        swatches.append(button);
      }
      picker.oninput = () => select(picker.value);
      section.append(label, swatches);
      container.append(section);
      continue;
    }
    if (field.kind === 'stack') {
      const stackKeys = plugins.flatMap((p) =>
        p.manifest.fields.filter((f) => f.kind === 'stack').map((f) => f.metadataKey),
      );
      let entries: StackEntry[];
      try {
        entries = stackEntries(metadata[field.metadataKey], stackKeys);
      } catch (error) {
        section.textContent = error instanceof Error ? error.message : String(error);
        container.append(section);
        continue;
      }
      const heading = document.createElement('h3');
      heading.textContent = field.label;
      const list = document.createElement('div');
      list.className = 'stack-list';
      const commit = () => onChange(field.metadataKey, entries);
      let dragged: string | null = null;
      const move = (from: number, to: number) => {
        if (
          !editable ||
          from < 0 ||
          to < 0 ||
          from >= entries.length ||
          to >= entries.length ||
          from === to
        )
          return;
        entries.splice(to, 0, entries.splice(from, 1)[0]);
        commit();
        draw();
      };
      const draw = () => {
        list.replaceChildren();
        entries.forEach((entry, index) => {
          const card = document.createElement('section');
          card.className = 'stack-card';
          card.dataset.stackId = entry.id;
          const actions = document.createElement('div');
          actions.className = 'stack-actions';
          const name = document.createElement('strong');
          name.textContent = `Entry ${index + 1}`;
          actions.append(name);
          const button = (label: string, action: () => void, disabled = !editable) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.disabled = disabled;
            b.onclick = action;
            actions.append(b);
            return b;
          };
          const handle = button('↕ Drag', () => {});
          handle.draggable = editable;
          handle.ondragstart = (event) => {
            dragged = entry.id;
            event.dataTransfer?.setData('text/plain', entry.id);
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
          };
          handle.ondragend = () => {
            dragged = null;
          };
          handle.onpointerdown = (event) => {
            if (!editable || event.pointerType === 'mouse') return;
            event.preventDefault();
            handle.setPointerCapture(event.pointerId);
            dragged = entry.id;
          };
          handle.onpointerup = (event) => {
            if (event.pointerType === 'mouse' || !dragged) return;
            const target = document
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest<HTMLElement>('.stack-card');
            if (target && list.contains(target))
              move(
                entries.findIndex((e) => e.id === dragged),
                entries.findIndex((e) => e.id === target.dataset.stackId),
              );
            dragged = null;
          };
          handle.onpointercancel = () => {
            dragged = null;
          };
          card.ondragover = (event) => {
            if (editable && dragged) event.preventDefault();
          };
          card.ondrop = (event) => {
            if (!dragged || !editable) return;
            event.preventDefault();
            move(
              entries.findIndex((e) => e.id === dragged),
              index,
            );
            dragged = null;
          };
          button('↑', () => move(index, index - 1), !editable || index === 0).ariaLabel =
            'Move stack entry up';
          button(
            '↓',
            () => move(index, index + 1),
            !editable || index === entries.length - 1,
          ).ariaLabel = 'Move stack entry down';
          button('Delete', () =>
            confirmDelete(String(entry.metadata.title || 'Untitled stack entry'), () => {
              if (!section.isConnected || !editable) return;
              entries = entries.filter((e) => e.id !== entry.id);
              commit();
              draw();
            }),
          );
          const time = document.createElement('p');
          time.className = 'field-hint stack-time';
          time.textContent = `Inherited time: ${inheritedTime()}`;
          card.append(actions, time);
          for (const [key, labelText] of [
            ['title', 'Title'],
            ['description', 'Notes'],
          ]) {
            const label = document.createElement('label');
            label.textContent = labelText;
            const input =
              key === 'title'
                ? document.createElement('input')
                : document.createElement('textarea');
            input.value = String(entry.metadata[key] ?? '');
            input.disabled = !editable;
            input.oninput = () => {
              entry.metadata[key] = input.value;
              commit();
            };
            label.append(input);
            card.append(label);
            if (key === 'description' && pluginRichText(plugins))
              attachRichText(input as HTMLTextAreaElement, editable);
          }
          const other = document.createElement('div');
          let syncRaw = () => {};
          renderPluginFields(
            other,
            plugins,
            entry.metadata,
            editable,
            (key, value) => {
              if (value) entry.metadata[key] = value;
              else delete entry.metadata[key];
              syncRaw();
              commit();
            },
            openImage,
            confirmDelete,
            inheritedTime,
            true,
          );
          card.append(other);
          const details = document.createElement('details');
          const summary = document.createElement('summary');
          summary.textContent = 'Additional metadata';
          const raw = document.createElement('textarea');
          raw.disabled = !editable;
          const rest = { ...entry.metadata };
          delete rest.title;
          delete rest.description;
          raw.value = JSON.stringify(rest, null, 2);
          syncRaw = () => {
            const rest = { ...entry.metadata };
            delete rest.title;
            delete rest.description;
            raw.value = JSON.stringify(rest, null, 2);
            raw.setCustomValidity('');
          };
          raw.oninput = () => {
            try {
              const value = JSON.parse(raw.value);
              const checked = stackEntries([{ id: entry.id, metadata: value }], stackKeys)[0];
              entry.metadata = {
                ...checked.metadata,
                title: entry.metadata.title,
                description: entry.metadata.description,
              };
              raw.setCustomValidity('');
              commit();
              renderPluginFields(
                other,
                plugins,
                entry.metadata,
                editable,
                (key, value) => {
                  if (value) entry.metadata[key] = value;
                  else delete entry.metadata[key];
                  syncRaw();
                  commit();
                },
                openImage,
                confirmDelete,
                inheritedTime,
                true,
              );
            } catch {
              raw.setCustomValidity('Use a JSON metadata object without nested stacks.');
            }
          };
          details.append(summary, raw);
          card.append(details);
          list.append(card);
        });
        add.disabled = !editable;
      };
      const add = document.createElement('button');
      add.type = 'button';
      add.textContent = 'Add entry to stack';
      add.onclick = () => {
        if (!editable) return;
        entries.push({ id: crypto.randomUUID(), metadata: { title: '', description: '' } });
        commit();
        draw();
        list.lastElementChild?.querySelector('input')?.focus();
      };
      section.append(heading, list, add);
      draw();
      container.append(section);
      continue;
    }
    const label = document.createElement('label');
    label.append(document.createTextNode(field.label));
    const input =
      field.kind === 'multiline'
        ? document.createElement('textarea')
        : document.createElement('input');
    input.value =
      typeof metadata[field.metadataKey] === 'string'
        ? (metadata[field.metadataKey] as string)
        : '';
    input.disabled = !editable;
    input.maxLength = field.kind === 'image-url' ? 4096 : 10000;
    input.spellcheck = field.kind !== 'image-url';
    input.dataset.pluginKey = field.metadataKey;
    if (input instanceof HTMLInputElement) {
      input.type = field.kind === 'image-url' ? 'url' : 'text';
      input.autocomplete = 'off';
    }
    let preview: ((immediate?: boolean) => void) | undefined;
    if (field.kind === 'image-url') {
      const link = document.createElement('a');
      link.className = 'plugin-image-link';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.referrerPolicy = 'no-referrer';
      link.title = 'Open original image in a new tab';
      const img = image(field.label);
      const sourceLabel = document.createElement('span');
      sourceLabel.className = 'plugin-image-source';
      sourceLabel.textContent = 'Open original image ↗';
      link.append(img, sourceLabel);
      const note = document.createElement('p');
      note.className = 'field-hint';
      let previewTimer: ReturnType<typeof setTimeout> | undefined;
      preview = (immediate = false) => {
        clearTimeout(previewTimer);
        const url = imageURL(input.value);
        input.setCustomValidity(
          input.value && !url ? 'Use a public HTTPS image URL without credentials.' : '',
        );
        link.hidden = !url;
        note.textContent =
          input.value && !url
            ? 'Use a public HTTPS image URL without credentials.'
            : 'Public HTTPS image. The host must allow anonymous cross-origin image access.';
        if (!url) {
          img.removeAttribute('src');
          link.removeAttribute('href');
          return;
        }
        if (imagesOffline()) link.removeAttribute('href');
        else link.href = url;
        const resolved = imageSource(url);
        if (!resolved) {
          img.hidden = true;
          img.removeAttribute('src');
          note.textContent =
            'No embedded image copy. Export this timeline from the online app to include its icon.';
          return;
        }
        if (img.getAttribute('src') !== resolved) {
          img.hidden = true;
          const load = () => {
            if (!immediate && (!section.isConnected || !section.getClientRects().length)) return;
            img.hidden = false;
            img.src = resolved;
          };
          if (immediate) load();
          else previewTimer = setTimeout(load, 300);
        }
      };
      img.onerror = () => {
        if (img.getAttribute('src') !== imageSource(imageURL(input.value))) return;
        img.hidden = true;
        note.textContent =
          'Image could not load. Check the URL and the host’s cross-origin access settings.';
      };
      img.onload = () => {
        if (img.getAttribute('src') !== imageSource(imageURL(input.value))) return;
        img.hidden = false;
        note.textContent = imagesOffline()
          ? 'Embedded offline image. Its original URL is retained below.'
          : 'Click the image to open its original source.';
      };
      link.onclick = (event) => {
        const url = imageURL(input.value);
        if (url) openImage(event, url);
      };
      section.append(link);
      label.append(input);
      section.append(label, note);
      preview(true);
    } else {
      label.append(input);
      section.append(label);
    }
    input.oninput = () => {
      onChange(field.metadataKey, input.value);
      preview?.();
    };
    container.append(section);
  }
}

// SVG strokes provide a real white outline around polygons, rather than clipping a circular border.
const SHAPE_PATHS: Record<string, string> = {
  diamond: 'M12 1 L23 12 L12 23 L1 12 Z',
  square: 'M3 3 H21 V21 H3 Z',
  triangle: 'M12 2 L23 21 H1 Z',
  pentagon: 'M12 1 L23 9 L19 23 H5 L1 9 Z',
  hexagon: 'M6 2 H18 L23 12 L18 22 H6 L1 12 Z',
  octagon: 'M7 1 H17 L23 7 V17 L17 23 H7 L1 17 V7 Z',
  star: 'M12 1 L15 8 L23 9 L17 14 L19 23 L12 18 L5 23 L7 14 L1 9 L9 8 Z',
  terminator: 'M8 4 H16 A8 8 0 0 1 16 20 H8 A8 8 0 0 1 8 4 Z',
  process: 'M2 5 H22 V19 H2 Z',
  document: 'M2 3 H22 V19 Q17 15 12 19 Q7 23 2 19 Z',
  parallelogram: 'M7 4 H23 L17 20 H1 Z',
};
export function renderPluginShape(button: HTMLButtonElement, shape: string) {
  button.dataset.shape = shape;
  const clips: Record<string, string> = {
    diamond: 'polygon(50% 0,100% 50%,50% 100%,0 50%)',
    square: 'inset(0)',
    triangle: 'polygon(50% 0,100% 100%,0 100%)',
    pentagon: 'polygon(50% 0,100% 35%,82% 100%,18% 100%,0 35%)',
    hexagon: 'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)',
    octagon: 'polygon(27% 0,73% 0,100% 27%,100% 73%,73% 100%,27% 100%,0 73%,0 27%)',
    star: 'polygon(50% 0,63% 32%,100% 36%,73% 59%,82% 100%,50% 77%,18% 100%,27% 59%,0 36%,37% 32%)',
    terminator: 'inset(15% 0 round 50%)',
    process: 'inset(14% 0)',
    document: 'polygon(0 0,100% 0,100% 85%,75% 75%,50% 85%,25% 100%,0 85%)',
    parallelogram: 'polygon(25% 0,100% 0,75% 100%,0 100%)',
  };
  button.style.setProperty('--marker-clip', clips[shape] ?? 'circle(50%)');
  button.querySelectorAll('.marker-shape').forEach((node) => node.remove());
  button.classList.toggle('shaped', shape !== 'circle');
  if (shape === 'circle') return;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('marker-shape');
  svg.setAttribute('viewBox', '-2 -2 28 28');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', SHAPE_PATHS[shape]);
  path.setAttribute('fill', button.style.backgroundColor || '#547d5b');
  path.setAttribute('stroke', 'white');
  path.setAttribute('stroke-width', '3');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-width', '5');
  const border = path.cloneNode(true) as SVGPathElement;
  border.setAttribute('fill', 'none');
  const outline = svg.cloneNode(false) as SVGSVGElement;
  outline.classList.add('marker-outline');
  outline.append(border);
  svg.append(path);
  button.querySelector('.marker-outline')?.remove();
  button.prepend(svg);
  button.append(outline);
}
