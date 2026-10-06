import { imageURL, pluginFields, stackEntries, COLOR_SWATCHES, colorValue } from './plugins.js';
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
        link.href = url;
        if (img.getAttribute('src') !== url) {
          img.hidden = true;
          const load = () => {
            if (!immediate && (!section.isConnected || !section.getClientRects().length)) return;
            img.hidden = false;
            img.src = url;
          };
          if (immediate) load();
          else previewTimer = setTimeout(load, 300);
        }
      };
      img.onerror = () => {
        if (img.getAttribute('src') !== imageURL(input.value)) return;
        img.hidden = true;
        note.textContent =
          'Image could not load. Check the URL and the host’s cross-origin access settings.';
      };
      img.onload = () => {
        if (img.getAttribute('src') !== imageURL(input.value)) return;
        img.hidden = false;
        note.textContent = 'Click the image to open its original source.';
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
