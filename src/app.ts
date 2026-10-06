import './styles.css';
import { renderPluginMarker, renderPluginFields } from './plugin-ui.js';
import {
  Q,
  RationalMap,
  TimelineIndex,
  Viewport,
  parseTime,
  demo,
  validateDocument,
  screenQ,
  wheelZoomFactor,
  createPresenter,
  validateInstalledPlugins,
  validatePluginManifest,
  pluginMarker,
  pluginColor,
  pluginFields,
  stackWindow,
  validateStackMetadata,
  validatePresentation,
  DEFAULT_PRESENTATION,
  UNIT_PRESETS,
  CUSTOM_EXAMPLE,
} from './core.js';
import type {
  Frame,
  FrameGroup,
  PointEvent,
  TimelineDocument,
  TimePresentation,
  PresentationContext,
  RulerPlan,
  InstalledPlugin,
  PluginManifest,
} from './core.js';
import { requestApi, importSqlite, exportSqlite } from './transport.js';
declare const __OFFLINE_HTML__: boolean;
const offlineHtml = typeof __OFFLINE_HTML__ !== 'undefined' && __OFFLINE_HTML__;
declare global {
  interface Window {
    __TAURI__?: {
      core: { invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> };
    };
  }
}
interface RemoteTimeline {
  id: string;
  title: string;
  description: string;
  presentation?: TimePresentation;
  plugins?: InstalledPlugin[];
  revision: string;
  visibility: 'private' | 'public';
  canEdit: boolean;
  canShare: boolean;
  owner: string;
  event_count: string;
  first?: string;
  last?: string;
}
interface Session {
  user: { id: string; username: string } | null;
  csrf: string | null;
  server: boolean;
  providers?: string[];
  fileExchange?: boolean;
}
const el = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const desktop = !offlineHtml && !!window.__TAURI__,
  stage = el('timeline-stage');
let serverOrigin = desktop ? 'https://timescale.info' : location.origin;
let model: TimelineIndex | null = new TimelineIndex(
    offlineHtml
      ? {
          format: 'openchronology',
          version: 1,
          title: 'Untitled timeline',
          description: '',
          events: [],
        }
      : demo(),
  ),
  viewport = Viewport.fit(model.points.minKey(), model.points.maxKey());
let remote: RemoteTimeline | null = null,
  session: Session = { user: null, csrf: null, server: false },
  dirty = false,
  selected: PointEvent | null = null;
let selectedTime: Q | null = null;
let displayedEventTime: { text: string; time: Q } | null = null;
let pendingDelete: { id: string; document: number; remove?: () => void } | null = null;
let eventEditTimer: ReturnType<typeof setTimeout> | undefined;
let pendingEventEdit = false;
let eventEditHistory: { before?: PointEvent; after?: PointEvent } | null = null;
function queueEventEdit() {
  if (!editable() || el('event-form').hidden) return;
  pendingEventEdit = true;
  clearTimeout(eventEditTimer);
  text('event-edit-status', 'Applying edits…');
  eventEditTimer = setTimeout(flushEventEdit, 250);
}
function flushEventEdit() {
  clearTimeout(eventEditTimer);
  if (!pendingEventEdit || !editable() || el('event-form').hidden) return;
  try {
    if (!el<HTMLFormElement>('event-form').checkValidity())
      throw new Error('Complete valid time and plugin fields to apply these edits.');
    const metadata = JSON.parse(el<HTMLTextAreaElement>('event-metadata').value);
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
      throw new Error('Additional metadata must be a JSON object.');
    validateStackMetadata(metadata, installedPlugins());
    const point: PointEvent = {
      id: selected?.id ?? eventId(),
      time: readEventTime().toString(),
      metadata: {
        ...metadata,
        title: input('event-title').value,
        description: el<HTMLTextAreaElement>('event-description').value,
      },
    };
    pendingEventEdit = false;
    if (JSON.stringify(point) !== JSON.stringify(selected)) {
      if (!eventEditHistory) {
        eventEditHistory = { before: selected ?? undefined, after: point };
        history.push(eventEditHistory);
      } else eventEditHistory.after = point;
      model!.put(point);
      selected = point;
      selectedGroup = null;
      selectedTime = Q.parse(point.time);
      el('event-delete').hidden = false;
      changed();
    }
    text('event-error', '');
    text('event-edit-status', 'Applied to timeline. Save or export the timeline to keep it.');
  } catch (error) {
    text('event-error', error instanceof Error ? error.message : String(error));
    text('event-edit-status', 'Incomplete edits — the last valid event is retained.');
  }
}
const markerGroups = new WeakMap<HTMLElement, FrameGroup>();
interface MomentLabel {
  button: HTMLButtonElement;
  stem: HTMLDivElement;
  caption: HTMLDivElement;
  title: HTMLSpanElement;
  coordinate: HTMLElement;
  current: HTMLSpanElement;
  outgoing?: HTMLSpanElement;
}
const momentLabels = new Map<string, MomentLabel>();
const stackLabels = new Map<string, MomentLabel>();
let verticalOffset = 0;
let verticalMinimum = 0,
  verticalMaximum = 0;
function panVertical(value: number) {
  verticalOffset = Math.max(verticalMinimum, Math.min(verticalMaximum, value));
  requestRender(false);
}
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function finishTimeFade(label: MomentLabel) {
  for (const animation of label.coordinate.getAnimations({ subtree: true })) animation.cancel();
  label.outgoing?.remove();
  label.outgoing = undefined;
}
function updateMomentTime(label: MomentLabel, value: string) {
  if (label.current.textContent === value) return;
  if (!label.current.textContent) {
    label.current.textContent = value;
    return;
  }
  const opacity = Number(getComputedStyle(label.current).opacity);
  finishTimeFade(label);
  if (reducedMotion.matches) {
    label.current.textContent = value;
    return;
  }
  const outgoing = label.current;
  outgoing.className = 'event-time-outgoing';
  outgoing.setAttribute('aria-hidden', 'true');
  const current = document.createElement('span');
  current.className = 'event-time-current';
  current.textContent = value;
  label.current = current;
  label.outgoing = outgoing;
  label.coordinate.append(current);
  const fade = outgoing.animate([{ opacity }, { opacity: 0 }], {
    duration: 200,
    easing: 'ease-out',
  });
  fade.onfinish = () => {
    outgoing.remove();
    if (label.outgoing === outgoing) label.outgoing = undefined;
  };
  current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
}
function removeMomentLabel(label: MomentLabel) {
  finishTimeFade(label);
  for (const node of [label.caption, label.stem, label.button]) {
    for (const animation of node.getAnimations({ subtree: true })) animation.cancel();
    node.remove();
  }
}
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches)
    for (const label of [...momentLabels.values(), ...stackLabels.values()]) finishTimeFade(label);
});
let menuGeneration = 0;
let longPressTimer: ReturnType<typeof setTimeout> | undefined;
let longPressed = false;
let frame: Frame = { groups: [], visitedNodes: 0 },
  selectedGroup: FrameGroup | null = null,
  groupCursor: { time: string; id: string } | null = null;
let history: { before?: PointEvent; after?: PointEvent }[] = [],
  frameRequest = 0,
  frameTimer: ReturnType<typeof setTimeout>,
  draftTimer: ReturnType<typeof setTimeout>;
let toastTimer: ReturnType<typeof setTimeout>,
  scheduled = false,
  sqlitePath: string | null = null,
  sqliteSavedVersion: number | null = null,
  documentRequest = 0,
  selectionRequest = 0,
  editVersion = 0,
  saving = false;
const input = (id: string) => el<HTMLInputElement>(id),
  text = (id: string, value: string) => {
    el(id).textContent = value;
  };
let pluginSearchRequest = 0;
let pluginSearchTimer: ReturnType<typeof setTimeout> | undefined;
let pluginPage = 1;
const editable = () => !!model && (!remote || remote.canEdit);
const width = () => Math.max(1, stage.clientWidth - 96),
  pixels = () => Number(input('density').value);
function toast(message: string) {
  text('toast', message);
  el('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el('toast').hidden = true;
  }, 7000);
}
function fail(error: unknown) {
  toast(error instanceof Error ? error.message : String(error));
}
function eventId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  if (offlineHtml) throw new Error('This offline file uses JSON import and export.');
  return requestApi<T>(path, method, data, session.csrf);
}
let pendingFrameRefresh = false;
function requestRender(refreshFrame = true) {
  pendingFrameRefresh ||= refreshFrame;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const refresh = pendingFrameRefresh;
    pendingFrameRefresh = false;
    render(refresh);
  });
}
let presenterSettings: TimePresentation | undefined,
  presenter = createPresenter();
function timelinePresenter() {
  const settings = model ? model.presentation : remote?.presentation;
  if (settings !== presenterSettings) {
    presenter = createPresenter(settings);
    presenterSettings = settings;
  }
  return presenter;
}
function viewContext(
  purpose: PresentationContext['purpose'],
  spacingPixels?: number,
): PresentationContext {
  return {
    left: viewport.left,
    span: viewport.span,
    widthPixels: width(),
    purpose,
    ...(spacingPixels === undefined ? {} : { spacingPixels }),
  };
}
function presented(
  q: Q,
  purpose: PresentationContext['purpose'] = 'tooltip',
  spacingPixels?: number,
): string {
  try {
    return timelinePresenter().print(q, viewContext(purpose, spacingPixels));
  } catch (error) {
    // A failed custom label cannot prevent timeline access or mutate an event.
    return (
      q.toString() +
      ' [display error: ' +
      (error instanceof Error ? error.message : String(error)) +
      ']'
    );
  }
}
function axisLabel(
  q: Q,
  purpose: PresentationContext['purpose'] = 'axis',
  spacingPixels?: number,
): string {
  const context = viewContext(purpose, spacingPixels);
  const full = presented(q, purpose, spacingPixels);
  return full.length <= 27 ? full : full.slice(0, 24) + '…';
}
const displayedBounds = new Map<string, { text: string; time: Q }>();
function renderAxis() {
  const axis = el('axis');
  axis.replaceChildren();
  const baseline = document.createElement('div');
  baseline.className = 'axis-baseline';
  axis.append(baseline);
  const rulerPresenter = timelinePresenter();
  let rules: RulerPlan;
  try {
    rules = rulerPresenter.rules(viewContext('axis'));
  } catch {
    // An invalid display configuration cannot prevent navigation of the exact timeline.
    rules = createPresenter().rules(viewContext('axis'));
  }
  axis.dataset.graduation = rules.graduation;
  const description = rulerPresenter.describe?.(viewContext('axis')) ?? '';
  el('time-context').hidden = !description;
  text('time-context', description.length > 100 ? description.slice(0, 97) + '…' : description);
  el('time-context').title = description;
  for (const rule of rules.ticks) {
    const time = rule.time,
      tick = document.createElement('div');
    tick.className = 'axis-tick ' + rule.level;
    tick.dataset.time = time.toString();
    tick.dataset.opacity = rule.opacity.toString();
    tick.style.left = `${48 + viewport.x(time, width())}px`;
    const guide = document.createElement('span');
    guide.className = 'tick-guide';
    guide.style.opacity = rule.majorOpacity.toString();
    tick.append(guide);
    const notch = document.createElement('span');
    notch.className = 'tick-notch';
    const height = 7 + 2 * rule.majorOpacity + 12 * rule.boundaryOpacity;
    notch.style.top = `${156 - height / 2}px`;
    notch.style.height = `${height}px`;
    notch.style.opacity = rule.opacity.toString();
    notch.style.borderLeftWidth = `${1 + rule.boundaryOpacity}px`;
    const strength = Math.max(rule.opacity, Number.EPSILON);
    const color = [203, 213, 197].map((minor, channel) =>
      Math.round(
        minor +
          (([181, 194, 173][channel] - minor) * rule.majorOpacity) / strength +
          (([113, 136, 107][channel] - [181, 194, 173][channel]) * rule.boundaryOpacity) / strength,
      ),
    );
    notch.style.borderColor = `rgb(${color.join(',')})`;
    tick.append(notch);
    const labels = new Map<string, { opacity: number; interval: Q }>();
    for (const label of rule.labels) {
      const spacing = Math.max(
        1,
        Math.min(1000000, viewport.x(viewport.left.add(label.interval), width())),
      );
      const printed = axisLabel(time, 'axis', spacing);
      const existing = labels.get(printed);
      labels.set(printed, {
        opacity: label.opacity + (existing?.opacity ?? 0),
        interval: label.interval,
      });
    }
    for (const [printed, label] of labels) {
      const value = document.createElement('span');
      value.className = 'tick-label';
      value.style.opacity = label.opacity.toString();
      value.textContent = printed;
      value.title = presented(time) + '\nExact: ' + time.toString();
      tick.append(value);
    }
    axis.append(tick);
  }
  for (const [id, value] of [
    ['exact-left', viewport.left.toString()],
    ['exact-right', viewport.right.toString()],
  ])
    if (document.activeElement !== el(id)) input(id).value = value;
  for (const [id, time] of [
    ['left-bound', viewport.left],
    ['right-bound', viewport.right],
  ] as const)
    if (document.activeElement !== el(id)) {
      const value = presented(time, 'input');
      input(id).value = value;
      displayedBounds.set(id, { text: value, time });
    }
}
function drawFrame() {
  const cursor = el('time-cursor');
  const cursorX = selectedTime ? viewport.x(selectedTime, width()) : -1;
  cursor.hidden = !selectedTime || cursorX < 0 || cursorX > width();
  el('clear-selection').hidden = !selectedTime;
  cursor.style.left = `${48 + cursorX}px`;
  if (selectedTime) {
    cursor.dataset.time = selectedTime.toString();
    cursor.setAttribute('aria-label', `Selected time: ${presented(selectedTime, 'input')}`);
  }
  const container = el('markers');
  const branches = el('stack-markers');
  const stackRetained = new Set<string>();
  let topExtent = 0,
    bottomExtent = stage.clientHeight;
  const retained = new Set<string>();
  const ordered: HTMLElement[] = [];
  let visible = 0n;
  // Remote summary metadata is itself ordered in a RationalMap. It is never mistaken for a complete event cache.
  const groups = new RationalMap<FrameGroup>((g) => BigInt(g.count));
  for (const group of frame.groups) groups.set(Q.parse(group.first), group);
  let lane = 0;
  for (const [, group] of groups) {
    const first = Q.parse(group.first),
      last = Q.parse(group.last),
      mid = first.add(last).div(Q.from(2n)),
      x = viewport.x(mid, width());
    if (x < 0 || x > width()) continue;
    visible += BigInt(group.count);
    const key = group.id ? `event:${group.id}` : `group:${group.first}:${group.last}`;
    retained.add(key);
    let label = momentLabels.get(key);
    if (!label) {
      const button = document.createElement('button');
      const caption = document.createElement('div');
      caption.className = 'event-label';
      caption.dataset.key = key;
      const title = document.createElement('span');
      title.className = 'event-caption-title';
      const coordinate = document.createElement('small');
      const current = document.createElement('span');
      current.className = 'event-time-current';
      coordinate.append(current);
      caption.append(title, coordinate);
      const stem = document.createElement('div');
      stem.className = 'event-stem';
      label = { button, stem, caption, title, coordinate, current };
      momentLabels.set(key, label);
      button.addEventListener('click', () => {
        const currentGroup = markerGroups.get(button);
        if (currentGroup) void selectGroup(currentGroup).catch(fail);
      });
      button.addEventListener('dblclick', () => {
        const currentGroup = markerGroups.get(button);
        if (currentGroup) zoomGroup(currentGroup);
      });
      container.append(stem, caption, button);
    }
    const { button, caption, stem, coordinate } = label;
    const count = BigInt(group.count);
    button.className =
      'event-marker' +
      (count > 1n ? ' group' : '') +
      (count > 999n ? ' large' : '') +
      (selectedGroup?.first === group.first ? ' selected' : '');
    button.style.left = `${48 + x}px`;
    markerGroups.set(button, group);
    button.dataset.first = group.first;
    button.dataset.count = group.count;
    const metadata = group.id ? (model?.byId.get(group.id)?.metadata ?? group.metadata ?? {}) : {};
    renderPluginMarker(button, pluginMarker(activePlugins(), metadata), count);
    const color = count === 1n ? pluginColor(activePlugins(), metadata) : null;
    button.style.backgroundColor = color ?? '';
    button.style.borderColor = color ?? '';
    button.setAttribute(
      'aria-label',
      count > 1n
        ? `${count} events near ${presented(first)}`
        : group.title?.trim() || 'Unnamed moment',
    );
    button.title =
      count > 1n ? `${count} events; select to explore` : group.title?.trim() || 'Unnamed moment';
    const top = lane++ % 4,
      labelTop = top < 2 ? 128 - top * 43 : 234 + (top - 2) * 43;
    stem.style.left = `${48 + x}px`;
    stem.style.top = `${top < 2 ? labelTop + 32 : 201}px`;
    stem.style.height = `${top < 2 ? 181 - labelTop - 32 : labelTop - 201}px`;
    caption.style.left = `${48 + x}px`;
    caption.style.top = `${labelTop}px`;
    label.title.textContent =
      count > 1n ? `${count.toLocaleString()} moments` : (group.title ?? '');
    caption.hidden = count === 1n && !group.title?.trim();
    stem.hidden = caption.hidden;
    updateMomentTime(label, axisLabel(mid, 'event'));
    coordinate.title = presented(mid) + '\nExact: ' + mid.toString();
    ordered.push(stem, caption, button);
    if (count === 1n && group.id) {
      let branchDepth = 0;
      for (const field of pluginFields(activePlugins())) {
        if (field.kind !== 'stack') continue;
        const entries = metadata[field.metadataKey];
        if (!Array.isArray(entries) || !entries.length) continue;
        const base = branchDepth;
        branchDepth += entries.length;
        const direction = top < 2 ? -1 : 1;
        const window = stackWindow(
          labelTop,
          direction,
          verticalOffset,
          stage.clientHeight,
          branchDepth,
        );
        const far = window.start + window.step * (branchDepth - 1);
        topExtent = Math.min(topExtent, far - 50);
        bottomExtent = Math.max(bottomExtent, far + 50);
        for (let index = Math.max(base, window.first); index <= window.last; index++) {
          const entry = entries[index - base];
          if (
            !entry ||
            typeof entry.id !== 'string' ||
            !entry.metadata ||
            typeof entry.metadata !== 'object'
          )
            continue;
          const childKey = `${group.id}:${field.metadataKey}:${entry.id}`;
          stackRetained.add(childKey);
          let child = stackLabels.get(childKey);
          if (!child) {
            const button = document.createElement('button');
            button.className = 'event-marker stack-marker';
            const caption = document.createElement('div');
            caption.className = 'event-label stack-label';
            const title = document.createElement('span');
            title.className = 'event-caption-title';
            const coordinate = document.createElement('small');
            const current = document.createElement('span');
            coordinate.append(current);
            caption.append(title);
            const stem = document.createElement('div');
            stem.className = 'event-stem stack-stem';
            child = { button, caption, title, coordinate, current, stem };
            stackLabels.set(childKey, child);
            branches.append(stem, caption, button);
          }
          const y = window.start + window.step * index;
          const previous = index === 0 ? 192 : y - window.step;
          const title = typeof entry.metadata.title === 'string' ? entry.metadata.title : '';
          child.button.style.left = `${48 + x}px`;
          child.button.style.top = `${y - 11}px`;
          child.button.dataset.stackEntry = entry.id;
          child.button.dataset.parentEvent = group.id;
          child.button.dataset.time = first.toString();
          child.button.setAttribute(
            'aria-label',
            `${title.trim() || 'Unnamed stack entry'} — stack entry of ${group.title?.trim() || 'Unnamed moment'}`,
          );
          child.button.title = `${title.trim() || 'Unnamed stack entry'} (inherits ${presented(mid, 'input')})`;
          renderPluginMarker(child.button, pluginMarker(activePlugins(), entry.metadata), 1n);
          const color = pluginColor(activePlugins(), entry.metadata);
          child.button.style.backgroundColor = color ?? '';
          child.button.style.borderColor = color ?? '';
          child.caption.style.left = `${48 + x}px`;
          child.caption.style.top = `${direction < 0 ? y - 45 : y + 16}px`;
          child.title.textContent = title;
          child.caption.hidden = !title.trim();
          child.stem.style.left = `${48 + x}px`;
          child.stem.style.top = `${Math.min(y, previous)}px`;
          child.stem.style.height = `${Math.abs(y - previous)}px`;
          child.button.onclick = () => {
            const doc = documentRequest;
            void selectGroup(group)
              .then(() => {
                if (doc !== documentRequest) return;
                const card = el('plugin-event-fields').querySelector<HTMLElement>(
                  `[data-metadata-key="${field.metadataKey}"] [data-stack-id="${entry.id}"]`,
                );
                card?.scrollIntoView({
                  behavior: reducedMotion.matches ? 'instant' : 'smooth',
                  block: 'nearest',
                });
                card?.querySelector('input')?.focus({ preventScroll: true });
              })
              .catch(fail);
          };
        }
      }
    }
  }
  for (const [key, label] of stackLabels)
    if (!stackRetained.has(key)) {
      removeMomentLabel(label);
      stackLabels.delete(key);
    }
  verticalMinimum = Math.min(0, stage.clientHeight - bottomExtent - 24);
  verticalMaximum = Math.max(0, -topExtent + 24);
  const clamped = Math.max(verticalMinimum, Math.min(verticalMaximum, verticalOffset));
  if (clamped !== verticalOffset) {
    verticalOffset = clamped;
    requestRender(false);
  }
  for (const layer of [el('axis'), container, branches])
    layer.style.transform = `translateY(${verticalOffset}px)`;
  for (const [key, label] of momentLabels)
    if (!retained.has(key)) {
      removeMomentLabel(label);
      momentLabels.delete(key);
    }
  // Preserve nodes and focus on ordinary renders; reorder only when chronology changes.
  ordered.forEach((node, index) => {
    if (container.children[index] !== node)
      container.insertBefore(node, container.children[index] ?? null);
  });
  text('visible-count', `${visible.toLocaleString()} visible · ${frame.groups.length} points`);
  el('empty-window').hidden = frame.groups.length > 0;
}
function render(refreshFrame = true) {
  if (refreshFrame) renderAxis();
  if (model) {
    if (refreshFrame) frame = model.frame(viewport, width(), pixels());
    el('loading-window').hidden = true;
    drawFrame();
  } else if (remote) {
    drawFrame();
    if (!refreshFrame) return;
    clearTimeout(frameTimer);
    const request = ++frameRequest,
      bounds = viewport.clone(),
      id = remote.id;
    el('loading-window').hidden = false;
    frameTimer = setTimeout(() => {
      void api<Frame>(`timelines/${id}/query`, 'POST', {
        kind: 'overview',
        lower: bounds.left.toString(),
        upper: bounds.right.toString(),
        threshold: bounds.threshold(width(), pixels()).toString(),
      })
        .then((result) => {
          if (request !== frameRequest || remote?.id !== id) return;
          frame = result;
          drawFrame();
          el('loading-window').hidden = true;
        })
        .catch((error) => {
          if (request === frameRequest) {
            el('loading-window').hidden = true;
            fail(error);
          }
        });
    }, 70);
  } else {
    frame = { groups: [], visitedNodes: 0 };
    drawFrame();
  }
}
function heading() {
  input('timeline-title').value = model?.title ?? remote?.title ?? 'Loading timeline…';
  el<HTMLTextAreaElement>('timeline-description').value =
    model?.description ?? remote?.description ?? '';
  input('timeline-title').disabled = !editable();
  el<HTMLTextAreaElement>('timeline-description').disabled = !editable();
  const count = model?.points.entryCount ?? BigInt(remote?.event_count ?? 0);
  text('event-count', `${count.toLocaleString()} events`);
  text('owner-label', remote ? remote.owner : desktop ? 'Offline workspace' : 'Local workspace');
  text(
    'storage-badge',
    remote
      ? remote.visibility === 'public'
        ? 'Public timeline'
        : 'Private timeline'
      : desktop && sqlitePath
        ? 'SQLite file'
        : offlineHtml
          ? 'Offline HTML'
          : 'Browser draft',
  );
  text('publish-button', remote ? 'Save changes' : 'Save to server');
  el<HTMLButtonElement>('publish-button').disabled = saving || (!!remote && !editable());
  el('publish-button').hidden = offlineHtml || !session.server || (!!remote && !remote.canEdit);
  el('och-import').hidden = offlineHtml || desktop || !session.fileExchange;
  el('och-export').hidden = offlineHtml || desktop || !session.fileExchange;
  el('share-button').hidden = !remote?.canShare;
  el('add-button').hidden = !editable();
  el<HTMLButtonElement>('undo-button').disabled = !history.length;
  text(
    'save-status',
    dirty
      ? remote
        ? 'Unsaved server changes'
        : 'Unsaved changes'
      : desktop && sqlitePath && sqliteSavedVersion !== editVersion
        ? 'Local file has unsaved changes'
        : remote
          ? 'Saved on the server'
          : desktop && sqlitePath
            ? 'Saved in a SQLite timeline'
            : offlineHtml
              ? 'Export JSON to save your work'
              : 'A local draft, ready to explore',
  );
  text(
    'workspace-status',
    remote ? 'Server timeline' : desktop ? 'Offline workspace' : 'Stored in this browser',
  );
}
async function draftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('openchronology', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function loadDraft(): Promise<TimelineDocument | null> {
  const db = await draftDb();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction('drafts').objectStore('drafts').get('current');
      r.onsuccess = () => resolve(r.result ?? null);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
async function retainForSignIn() {
  flushEventEdit();
  if (!model) return;
  const db = await draftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(
        {
          document: model!.document(),
          remote: remote ? { id: remote.id, revision: remote.revision } : null,
          dirty,
        },
        'auth-resume',
      );
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(
          new Error('Export your timeline before signing in: browser storage is unavailable.'),
        );
    });
  } finally {
    db.close();
  }
}
async function restoreAfterSignIn() {
  const db = await draftDb();
  try {
    const saved = await new Promise<
      | {
          document: TimelineDocument;
          remote: { id: string; revision: string } | null;
          dirty: boolean;
        }
      | undefined
    >((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite'),
        store = tx.objectStore('drafts'),
        read = store.get('auth-resume');
      store.delete('auth-resume');
      tx.oncomplete = () => resolve(read.result);
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
    if (!saved) return;
    loadDocument(validateDocument(saved.document));
    clearTimeout(draftTimer);
    dirty = !!saved.dirty;
    if (
      saved.remote &&
      /^[a-f0-9-]{36}$/i.test(saved.remote.id) &&
      /^\d+$/.test(saved.remote.revision)
    ) {
      try {
        const metadata = await api<RemoteTimeline>(`timelines/${saved.remote.id}`);
        if (!metadata.canEdit) throw new Error('Editing access changed.');
        remote = { ...metadata, revision: saved.remote.revision };
        if (!location.hash) window.history.replaceState(null, '', `#timeline/${remote.id}`);
      } catch {
        dirty = true;
        toast('Your work was recovered as a local timeline.');
      }
    }
    heading();
    if (!remote) persistDraft();
  } finally {
    db.close();
  }
}
function persistDraft() {
  if (offlineHtml || remote || desktop || !model) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    if (remote || !model) return;
    const doc = model.document();
    void draftDb()
      .then(
        (db) =>
          new Promise<void>((resolve, reject) => {
            const tx = db.transaction('drafts', 'readwrite');
            tx.objectStore('drafts').put(doc, 'current');
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => {
              db.close();
              reject(tx.error);
            };
          }),
      )
      .then(() => {
        if (!remote) text('save-status', 'Saved in this browser');
      })
      .catch(() => {
        text('save-status', 'Browser storage unavailable — export to keep your work');
      });
  }, 700);
}
function changed() {
  editVersion++;
  dirty = true;
  heading();
  requestRender();
  persistDraft();
}
function loadDocument(doc: TimelineDocument) {
  documentRequest++;
  resetTimeSelection();
  selectionRequest++;
  editVersion++;
  remote = null;
  sqlitePath = null;
  sqliteSavedVersion = null;
  model = new TimelineIndex(doc);
  viewport = Viewport.fit(model.points.minKey(), model.points.maxKey());
  dirty = false;
  history = [];
  selected = null;
  selectedGroup = null;
  frameRequest++;
  el('group-details').hidden = true;
  el('event-form').hidden = true;
  el('inspector-intro').hidden = false;
  heading();
  requestRender();
  persistDraft();
}
async function directory() {
  const list = el('timeline-list');
  if (!session.user) return;
  const result = await api<{
    timelines: { id: string; title: string; visibility: string; role: string }[];
  }>('timelines');
  list.replaceChildren();
  for (const t of result.timelines) {
    const button = document.createElement('button');
    button.textContent = t.title;
    const small = document.createElement('small');
    small.textContent = `${t.visibility} · ${t.role}`;
    button.append(small);
    button.addEventListener('click', () => {
      location.hash = `timeline/${t.id}`;
    });
    list.append(button);
  }
  if (!result.timelines.length) {
    const p = document.createElement('p');
    p.className = 'workspace-note';
    p.textContent = 'Your server timelines will appear here.';
    list.append(p);
  }
}
async function openRemote(id: string) {
  const request = ++documentRequest;
  resetTimeSelection();
  selectionRequest++;
  model = null;
  remote = null;
  sqlitePath = null;
  sqliteSavedVersion = null;
  frame = { groups: [], visitedNodes: 0 };
  selected = null;
  selectedGroup = null;
  history = [];
  frameRequest++;
  heading();
  requestRender();
  el('event-form').hidden = true;
  el('group-details').hidden = true;
  el('inspector-intro').hidden = false;
  const info = await api<RemoteTimeline>(`timelines/${id}`);
  if (request !== documentRequest) return;
  remote = info;
  if (info.presentation) info.presentation = validatePresentation(info.presentation);
  if (info.plugins) info.plugins = validateInstalledPlugins(info.plugins);
  if (info.canEdit) {
    const snapshot = await api<{ timeline: RemoteTimeline; document: TimelineDocument }>(
      `timelines/${id}/document`,
    );
    if (request !== documentRequest) return;
    remote = snapshot.timeline;
    model = new TimelineIndex(validateDocument(snapshot.document));
  }
  viewport = Viewport.fit(
    model?.points.minKey() ?? (info.first ? Q.parse(info.first) : undefined),
    model?.points.maxKey() ?? (info.last ? Q.parse(info.last) : undefined),
  );
  dirty = false;
  heading();
  requestRender();
}
async function route(force = false) {
  if (offlineHtml) return;
  const desktopRequest = /^#desktop\/([A-Z2-9]{10})$/.exec(location.hash);
  if (desktopRequest) {
    if (!session.user) {
      el('account-button').click();
      return;
    }
    text('desktop-approval-code', desktopRequest[1]);
    if (!el<HTMLDialogElement>('desktop-approval-dialog').open)
      el<HTMLDialogElement>('desktop-approval-dialog').showModal();
    return;
  }
  const match = /^#timeline\/([a-f0-9-]+)$/i.exec(location.hash);
  if (match) {
    if (remote?.id === match[1] && !force) return;
    if (!mayReplace()) {
      window.history.replaceState(null, '', remote ? `#timeline/${remote.id}` : location.pathname);
      return;
    }
    await openRemote(match[1]);
  }
}
function installedPlugins(): InstalledPlugin[] {
  return model ? (model.plugins ?? []) : (remote?.plugins ?? []);
}
function activePlugins(): InstalledPlugin[] {
  return offlineHtml ? [] : installedPlugins();
}
function refreshPluginFields() {
  try {
    const metadata = JSON.parse(el<HTMLTextAreaElement>('event-metadata').value);
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return;
    renderPluginFields(
      el('plugin-event-fields'),
      activePlugins(),
      metadata,
      editable(),
      (key, value) => {
        try {
          const current = JSON.parse(el<HTMLTextAreaElement>('event-metadata').value);
          if (!current || typeof current !== 'object' || Array.isArray(current))
            throw new Error('Additional metadata must be a JSON object.');
          if (value) current[key] = value;
          else delete current[key];
          el<HTMLTextAreaElement>('event-metadata').value = JSON.stringify(current, null, 2);
          queueEventEdit();
          text('event-error', '');
        } catch (error) {
          text('event-error', error instanceof Error ? error.message : String(error));
        }
      },
      (event, url) => {
        if (desktop) {
          event.preventDefault();
          void window.__TAURI__!.core.invoke('desktop_open_image', { url }).catch(fail);
        }
      },
      (title, remove) => {
        pendingDelete = { id: '', document: documentRequest, remove };
        text('delete-description', `Delete “${title}” from this stack?`);
        el<HTMLDialogElement>('delete-dialog').showModal();
        el('delete-cancel').focus();
      },
      () => input('event-time').value,
    );
  } catch {
    /* Preserve incomplete raw JSON while editing. */
  }
}
function changePlugins(plugins: InstalledPlugin[]) {
  if (!editable() || offlineHtml) return;
  const validated = validateInstalledPlugins(plugins);
  model!.plugins = validated.length ? validated : undefined;
  changed();
  showInstalledPlugins();
  if (!el('event-form').hidden) refreshPluginFields();
}
function showInstalledPlugins() {
  const list = el('installed-plugins');
  list.replaceChildren();
  const installed = installedPlugins();
  text(
    'plugins-note',
    offlineHtml
      ? 'Plugin settings are preserved in this file, but plugins are inactive in the standalone HTML. Use the web or desktop app to install and run them.'
      : 'Applied from top to bottom. Later plugins override matching fields and marker effects. Removing a plugin keeps all moment metadata.',
  );
  el('plugins-add').hidden = offlineHtml || !editable();
  if (!installed.length) {
    const note = document.createElement('p');
    note.textContent = 'No plugins installed on this timeline.';
    list.append(note);
  }
  installed.forEach((entry, index) => {
    const item = document.createElement('section');
    item.className = 'installed-plugin';
    const name = document.createElement('strong');
    name.textContent = `${index + 1}. ${entry.manifest.name} · v${entry.manifest.version}`;
    const description = document.createElement('p');
    description.textContent = entry.manifest.description;
    const toggle = document.createElement('label');
    toggle.className = 'plugin-enable';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = entry.enabled;
    checkbox.disabled = !editable() || offlineHtml;
    checkbox.setAttribute('aria-label', `Enable ${entry.manifest.name}`);
    checkbox.onchange = () =>
      changePlugins(
        installedPlugins().map((p) =>
          p.manifest.id === entry.manifest.id ? { ...p, enabled: checkbox.checked } : p,
        ),
      );
    toggle.append(
      checkbox,
      document.createTextNode(offlineHtml ? 'Inactive in offline HTML' : 'Enabled'),
    );
    const actions = document.createElement('div');
    actions.className = 'plugin-actions';
    const action = (label: string, disabled: boolean, run: () => void) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.disabled = disabled || !editable() || offlineHtml;
      button.onclick = run;
      actions.append(button);
    };
    const move = (direction: number) => {
      const next = [...installedPlugins()];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      changePlugins(next);
    };
    action('Move up', index === 0, () => move(-1));
    action('Move down', index === installed.length - 1, () => move(1));
    action('Remove', false, () =>
      changePlugins(installedPlugins().filter((p) => p.manifest.id !== entry.manifest.id)),
    );
    item.append(name, description, toggle, actions);
    list.append(item);
  });
}
async function searchPlugins() {
  if (offlineHtml) return;
  const request = ++pluginSearchRequest,
    doc = documentRequest;
  text('plugin-library-error', '');
  text('plugin-library-status', 'Loading plugin library…');
  el('plugin-library-results').replaceChildren();
  el<HTMLButtonElement>('plugin-previous').disabled = true;
  el<HTMLButtonElement>('plugin-next').disabled = true;
  try {
    const result = await api<{
      plugins: PluginManifest[];
      total: number;
      pages: number;
      page: number;
    }>('plugins/search', 'POST', {
      search: input('plugin-search').value,
      page: pluginPage,
      limit: 12,
    });
    if (request !== pluginSearchRequest || doc !== documentRequest) return;
    if (
      !Array.isArray(result.plugins) ||
      result.plugins.length > 12 ||
      !Number.isSafeInteger(result.total) ||
      result.total < 0 ||
      !Number.isSafeInteger(result.pages) ||
      result.pages < 0
    )
      throw new Error('Invalid plugin library response.');
    const plugins = result.plugins.map(validatePluginManifest);
    text(
      'plugin-library-status',
      `${result.total} available · Page ${pluginPage} of ${Math.max(1, result.pages)}`,
    );
    el<HTMLButtonElement>('plugin-previous').disabled = pluginPage <= 1;
    el<HTMLButtonElement>('plugin-next').disabled = pluginPage >= result.pages;
    for (const manifest of plugins) {
      const item = document.createElement('section');
      item.className = 'library-plugin';
      const name = document.createElement('strong');
      name.textContent = `${manifest.name} · v${manifest.version}`;
      const description = document.createElement('p');
      description.textContent = manifest.description;
      const capability = document.createElement('p');
      capability.className = 'field-hint';
      capability.textContent =
        `Metadata fields: ${manifest.fields.map((f) => f.metadataKey).join(', ') || 'none'}.` +
        (manifest.marker || manifest.fields.some((f) => f.kind === 'image-url')
          ? ' Can load public HTTPS images without referrers or cross-origin credentials.'
          : '');
      const button = document.createElement('button');
      button.type = 'button';
      const present = installedPlugins().some((p) => p.manifest.id === manifest.id);
      button.textContent = present ? 'Installed' : 'Add to timeline';
      button.disabled = present || !editable();
      button.onclick = () => {
        if (doc !== documentRequest) return;
        try {
          changePlugins([...installedPlugins(), { manifest, enabled: true }]);
          el<HTMLDialogElement>('plugin-library-dialog').close();
          toast(`${manifest.name} is now active on this timeline.`);
        } catch (error) {
          text('plugin-library-error', error instanceof Error ? error.message : String(error));
        }
      };
      item.append(name, description, capability, button);
      el('plugin-library-results').append(item);
    }
  } catch (error) {
    if (request !== pluginSearchRequest || doc !== documentRequest) return;
    text('plugin-library-status', 'Plugin library unavailable.');
    text('plugin-library-error', error instanceof Error ? error.message : String(error));
  }
}
el('plugins-button').onclick = () => {
  showInstalledPlugins();
  el<HTMLDialogElement>('plugins-dialog').showModal();
};
el('plugins-add').onclick = () => {
  if (!editable() || offlineHtml) return;
  pluginPage = 1;
  input('plugin-search').value = '';
  el<HTMLDialogElement>('plugin-library-dialog').showModal();
  void searchPlugins();
};
input('plugin-search').oninput = () => {
  pluginSearchRequest++;
  el('plugin-library-results').replaceChildren();
  text('plugin-library-status', 'Searching…');
  el<HTMLButtonElement>('plugin-previous').disabled = true;
  el<HTMLButtonElement>('plugin-next').disabled = true;
  clearTimeout(pluginSearchTimer);
  pluginPage = 1;
  pluginSearchTimer = setTimeout(() => {
    void searchPlugins();
  }, 250);
};
el('plugin-previous').onclick = () => {
  clearTimeout(pluginSearchTimer);
  pluginPage = Math.max(1, pluginPage - 1);
  void searchPlugins();
};
el('plugin-next').onclick = () => {
  clearTimeout(pluginSearchTimer);
  pluginPage++;
  void searchPlugins();
};
el<HTMLDialogElement>('plugin-library-dialog').addEventListener('close', () => {
  pluginSearchRequest++;
  clearTimeout(pluginSearchTimer);
});
el<HTMLTextAreaElement>('event-metadata').addEventListener('input', refreshPluginFields);

function eventForm(event?: PointEvent, time?: Q) {
  flushEventEdit();
  if (event) event = model?.byId.get(event.id) ?? event;
  pendingEventEdit = false;
  eventEditHistory = null;
  selectionRequest++;
  selected = event ?? null;
  if (!event) selectedGroup = null;
  el('event-form').hidden = false;
  el('group-details').hidden = true;
  el('inspector-intro').hidden = true;
  input('event-title').value = event?.metadata.title ?? '';
  selectedTime = event
    ? Q.parse(event.time)
    : (time ?? selectedTime ?? viewport.left.add(viewport.span.div(Q.from(2n))));
  setEventTime(selectedTime);
  requestRender();
  el<HTMLTextAreaElement>('event-description').value = event?.metadata.description ?? '';
  const rest = { ...event?.metadata };
  delete rest.title;
  delete rest.description;
  el<HTMLTextAreaElement>('event-metadata').value = JSON.stringify(rest, null, 2);
  refreshPluginFields();
  for (const id of ['event-title', 'event-time', 'event-description', 'event-metadata'])
    (el(id) as HTMLInputElement).disabled = !editable();
  text(
    'event-edit-status',
    editable() ? 'Edits apply to the timeline automatically.' : 'Read-only moment.',
  );
  el('event-delete').hidden = !event || !editable();
  text('event-error', '');
  if (window.innerWidth < 650)
    el('inspector').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function groupPage(group: FrameGroup, after: { time: string; id: string } | null = null) {
  let events: PointEvent[],
    next: { time: string; id: string } | null = null;
  if (model) {
    events = [];
    scan: for (const [, bucket] of model.points.range(
      Q.parse(after?.time ?? group.first),
      Q.parse(group.last),
      { includeUpper: true },
    ))
      for (const e of bucket) {
        if (after && e.time === after.time && e.id <= after.id) continue;
        events.push(e);
        if (events.length > 100) break scan;
      }
    if (events.length > 100) {
      events = events.slice(0, 100);
      const last = events.at(-1)!;
      next = { time: last.time, id: last.id };
    }
  } else {
    const result = await api<{ events: PointEvent[]; next: { time: string; id: string } | null }>(
      `timelines/${remote!.id}/query`,
      'POST',
      { kind: 'events', lower: group.first, upper: group.last, limit: 100, after },
    );
    events = result.events;
    next = result.next;
  }
  return { events, next };
}
async function selectGroup(group: FrameGroup) {
  flushEventEdit();
  clearTimeout(eventEditTimer);
  pendingEventEdit = false;
  el('event-form').hidden = true;
  const request = ++selectionRequest;
  selectedGroup = group;
  selected = null;
  selectedTime = Q.parse(group.first).add(Q.parse(group.last)).div(Q.from(2n));
  requestRender();
  const page = await groupPage(group);
  if (request !== selectionRequest) return;
  if (BigInt(group.count) === 1n && page.events[0]) {
    eventForm(page.events[0]);
    return;
  }
  el('event-form').hidden = true;
  el('inspector-intro').hidden = true;
  el('group-details').hidden = false;
  text('group-title', `${BigInt(group.count).toLocaleString()} moments`);
  text(
    'group-note',
    group.distinct === 1
      ? 'These events share the same exact coordinate. Zoom cannot separate coincident points.'
      : 'These moments are close at this scale. Zoom in to reveal their separate coordinates.',
  );
  el('group-zoom').hidden = group.distinct === 1;
  showGroupPage(page.events, page.next);
  if (window.innerWidth < 650)
    el('inspector').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function showGroupPage(events: PointEvent[], next: { time: string; id: string } | null) {
  groupCursor = next;
  el('group-more').hidden = !next;
  const list = el('group-events');
  list.replaceChildren();
  for (const e of events) {
    const b = document.createElement('button');
    b.textContent = e.metadata.title ?? 'Untitled event';
    const small = document.createElement('small');
    small.textContent = presented(Q.parse(e.time), 'event');
    small.title = presented(Q.parse(e.time)) + '\nExact: ' + e.time;
    b.append(small);
    b.addEventListener('click', () => eventForm(e));
    bindEventMenu(b, e);
    list.append(b);
  }
}
function zoomGroup(group: FrameGroup) {
  if (group.distinct === 1) return;
  viewport = Viewport.fit(Q.parse(group.first), Q.parse(group.last));
  requestRender();
}
function zoom(factor: Q) {
  navigate(viewport.zoom(width() / 2, width(), factor));
}
function navigate(view: Viewport) {
  closeTimelineMenu();
  viewport = view.rasterize(width());
  requestRender();
}
function fit() {
  verticalOffset = 0;
  viewport = Viewport.fit(
    model?.points.minKey() ?? (remote?.first ? Q.parse(remote.first) : undefined),
    model?.points.maxKey() ?? (remote?.last ? Q.parse(remote.last) : undefined),
  );
  requestRender();
}

function closeTimelineMenu() {
  menuGeneration++;
  const menu = el('timeline-menu');
  if (menu.contains(document.activeElement)) stage.focus({ preventScroll: true });
  menu.hidden = true;
}
function resetTimeSelection() {
  clearTimeout(eventEditTimer);
  pendingEventEdit = false;
  eventEditHistory = null;
  verticalOffset = 0;
  pluginSearchRequest++;
  clearTimeout(pluginSearchTimer);
  el<HTMLDialogElement>('plugins-dialog').close();
  el<HTMLDialogElement>('plugin-library-dialog').close();
  el('plugin-event-fields').replaceChildren();
  for (const label of momentLabels.values()) removeMomentLabel(label);
  momentLabels.clear();
  for (const label of stackLabels.values()) removeMomentLabel(label);
  stackLabels.clear();
  selectedTime = null;
  displayedEventTime = null;
  clearTimeout(longPressTimer);
  if (pointers.size) {
    for (const id of pointers.keys())
      if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
    pointers.clear();
    press = null;
    gesture = null;
    moved = true;
    suppressClickUntil = Date.now() + 500;
    stage.classList.remove('dragging');
  } else {
    moved = false;
    suppressClickUntil = 0;
  }
  longPressed = false;
  closeTimelineMenu();
  pendingDelete = null;
  el<HTMLDialogElement>('delete-dialog').close();
}
function addStackEntry(point: PointEvent) {
  flushEventEdit();
  const field = pluginFields(activePlugins()).find((f) => f.kind === 'stack');
  if (!field || !editable()) return;
  eventForm(model?.byId.get(point.id) ?? point);
  const metadata = JSON.parse(el<HTMLTextAreaElement>('event-metadata').value);
  const entries = Array.isArray(metadata[field.metadataKey]) ? metadata[field.metadataKey] : [];
  const id = eventId();
  metadata[field.metadataKey] = [...entries, { id, metadata: { title: '', description: '' } }];
  el<HTMLTextAreaElement>('event-metadata').value = JSON.stringify(metadata, null, 2);
  refreshPluginFields();
  queueEventEdit();
  flushEventEdit();
  const card = el('plugin-event-fields').querySelector<HTMLElement>(`[data-stack-id="${id}"]`);
  card?.scrollIntoView({ block: 'nearest' });
  card?.querySelector('input')?.focus({ preventScroll: true });
}
function showTimelineMenu(
  x: number,
  y: number,
  time: Q,
  point?: PointEvent,
  group?: FrameGroup,
  childId?: string,
) {
  closeTimelineMenu();
  const menu = el('timeline-menu');
  menu.replaceChildren();
  const add = (label: string, action: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.textContent = label;
    button.onclick = () => {
      closeTimelineMenu();
      action();
    };
    menu.append(button);
  };
  if (editable())
    add('+Event', () => {
      selectedGroup = null;
      eventForm(undefined, time);
    });
  add('Fit all', fit);
  if (point && editable()) {
    if (pluginFields(activePlugins()).some((f) => f.kind === 'stack'))
      add('Add entry to stack', () => addStackEntry(point));
    add('Delete', () => {
      if (!childId) requestDelete(point);
      else {
        eventForm(model?.byId.get(point.id) ?? point);
        const card = el('plugin-event-fields').querySelector<HTMLElement>(
          `[data-stack-id="${childId}"]`,
        );
        [...(card?.querySelectorAll('button') ?? [])]
          .find((b) => b.textContent === 'Delete')
          ?.click();
      }
    });
  }
  if (group && BigInt(group.count) > 1n)
    add('View events', () => {
      void selectGroup(group).catch(fail);
    });
  menu.hidden = false;
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - bounds.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - bounds.height - 4))}px`;
  menu.querySelector<HTMLButtonElement>('button')?.focus();
}
function openStageMenu(target: HTMLElement, x: number, y: number) {
  const branch = target.closest<HTMLElement>('.stack-marker');
  if (branch?.dataset.parentEvent) {
    const point = model?.byId.get(branch.dataset.parentEvent);
    if (point)
      showTimelineMenu(x, y, Q.parse(point.time), point, undefined, branch.dataset.stackEntry);
    else showTimelineMenu(x, y, Q.parse(branch.dataset.time ?? '0/1'));
    return;
  }
  const group = markerGroups.get(target.closest<HTMLElement>('.event-marker')!);
  const time = viewport.at(Math.max(0, Math.min(width(), localX(x))), width());
  showTimelineMenu(x, y, time, undefined, group);
  if (group && BigInt(group.count) === 1n && editable()) {
    const generation = menuGeneration,
      doc = documentRequest;
    void groupPage(group)
      .then((page) => {
        if (generation === menuGeneration && doc === documentRequest && page.events[0])
          showTimelineMenu(x, y, Q.parse(page.events[0].time), page.events[0]);
      })
      .catch(fail);
  }
}
function bindEventMenu(button: HTMLElement, point: PointEvent) {
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    showTimelineMenu(event.clientX, event.clientY, Q.parse(point.time), point);
  });
  let timer: ReturnType<typeof setTimeout> | undefined,
    held = false,
    x = 0,
    y = 0;
  button.addEventListener('pointerdown', (event) => {
    clearTimeout(timer);
    held = false;
    x = event.clientX;
    y = event.clientY;
    const doc = documentRequest;
    if (event.pointerType !== 'mouse')
      timer = setTimeout(() => {
        if (!button.isConnected || doc !== documentRequest) return;
        held = true;
        showTimelineMenu(x, y, Q.parse(point.time), point);
      }, 550);
  });
  button.addEventListener('pointermove', (event) => {
    if (Math.hypot(event.clientX - x, event.clientY - y) > 5) clearTimeout(timer);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave'])
    button.addEventListener(type, () => clearTimeout(timer));
  button.addEventListener(
    'click',
    (event) => {
      if (held) {
        event.preventDefault();
        event.stopImmediatePropagation();
        held = false;
      }
    },
    true,
  );
}
stage.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (!el('timeline-menu').hidden && Date.now() < suppressClickUntil) return;
  openStageMenu(event.target as HTMLElement, event.clientX, event.clientY);
});
el('timeline-menu').addEventListener('keydown', (event) => {
  const buttons = [...el('timeline-menu').querySelectorAll<HTMLButtonElement>('button')];
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (event.key === 'Escape' || event.key === 'Tab') {
    closeTimelineMenu();
    if (event.key === 'Escape') {
      event.preventDefault();
      stage.focus();
    }
  } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }
});
document.addEventListener('pointerdown', (event) => {
  if (!el('timeline-menu').contains(event.target as Node)) closeTimelineMenu();
});
window.addEventListener('resize', closeTimelineMenu);
window.addEventListener('scroll', closeTimelineMenu, true);
window.addEventListener('blur', () => {
  clearTimeout(longPressTimer);
  closeTimelineMenu();
});

// Pointer Events give mouse dragging, single-touch panning and two-touch anchored scaling.
const pointers = new Map<number, { x: number; y: number }>();
let gesture: {
    view: Viewport;
    mid: number;
    midY: number;
    vertical: number;
    distance: number;
  } | null = null,
  press: { id: number; x: number; y: number; time: number; target: EventTarget | null } | null =
    null,
  moved = false,
  suppressClickUntil = 0;
function localX(clientX: number) {
  return clientX - stage.getBoundingClientRect().left - 48;
}
function metrics() {
  const p = [...pointers.values()];
  return {
    mid: p.length === 1 ? localX(p[0].x) : localX((p[0].x + p[1].x) / 2),
    midY: p.length === 1 ? p[0].y : (p[0].y + p[1].y) / 2,
    distance: p.length < 2 ? 1 : Math.max(1, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)),
  };
}
function resetGesture() {
  if (!pointers.size) {
    gesture = null;
    return;
  }
  gesture = { view: viewport.clone(), vertical: verticalOffset, ...metrics() };
}
stage.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (event.pointerType === 'mouse' && (event.target as HTMLElement).closest('button')) {
    moved = false;
    return;
  }
  closeTimelineMenu();
  clearTimeout(longPressTimer);
  longPressed = false;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  stage.setPointerCapture(event.pointerId);
  resetGesture();
  if (pointers.size === 1) {
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: Date.now(),
      target: event.target,
    };
    moved = false;
    if (event.pointerType !== 'mouse') {
      const target = event.target as HTMLElement;
      longPressTimer = setTimeout(() => {
        if (moved || pointers.size !== 1) return;
        longPressed = true;
        suppressClickUntil = Date.now() + 1000;
        openStageMenu(target, event.clientX, event.clientY);
      }, 550);
    }
  } else moved = true;
});
stage.addEventListener('pointermove', (event) => {
  if (!pointers.has(event.pointerId) || !gesture) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const now = metrics();
  if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) moved = true;
  if (moved) clearTimeout(longPressTimer);
  if (!moved || longPressed) return;
  stage.classList.add('dragging');
  verticalOffset = Math.max(
    verticalMinimum,
    Math.min(verticalMaximum, gesture.vertical + now.midY - gesture.midY),
  );
  const next =
    pointers.size === 1
      ? gesture.view.pan(now.mid - gesture.mid, width())
      : gesture.view.pinch(
          gesture.mid,
          now.mid,
          width(),
          screenQ(gesture.distance).div(screenQ(now.distance)),
        );
  if (next.left.compare(viewport.left) === 0 && next.span.compare(viewport.span) === 0)
    requestRender(false);
  else navigate(next);
});
function releasePointer(event: PointerEvent, cancel = false) {
  if (!pointers.has(event.pointerId)) return;
  clearTimeout(longPressTimer);
  const tap = !moved && !longPressed && !cancel && press?.id === event.pointerId;
  pointers.delete(event.pointerId);
  if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
  resetGesture();
  if (!pointers.size) stage.classList.remove('dragging');
  const button = (press?.target as HTMLElement)?.closest('button') as HTMLButtonElement | null;
  if (tap && button) {
    button.click();
    suppressClickUntil = Date.now() + 500;
  } else if (tap) {
    eventForm(
      undefined,
      viewport.at(Math.max(0, Math.min(width(), localX(event.clientX))), width()),
    );
  }
  if (!pointers.size) {
    press = null;
    if (longPressed) suppressClickUntil = Date.now() + 1000;
    longPressed = false;
  }
}
stage.addEventListener('pointerup', (event) => releasePointer(event));
stage.addEventListener('pointercancel', (event) => releasePointer(event, true));
stage.addEventListener(
  'click',
  (event) => {
    if (event.isTrusted && (moved || Date.now() < suppressClickUntil)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);
stage.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    clearTimeout(longPressTimer);
    closeTimelineMenu();
    if (event.altKey) {
      panVertical(
        verticalOffset -
          event.deltaY *
            (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1),
      );
    } else if (event.shiftKey) {
      navigate(viewport.pan(-event.deltaY, width()));
    } else {
      const normalized =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
      navigate(
        viewport.zoom(
          Math.max(0, Math.min(width(), localX(event.clientX))),
          width(),
          wheelZoomFactor(normalized),
        ),
      );
    }
  },
  { passive: false },
);
stage.addEventListener('keydown', (event) => {
  if ((event.target as HTMLElement).closest('button')) return;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    panVertical(verticalOffset + (event.key === 'ArrowUp' ? 72 : -72));
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    navigate(viewport.pan(width() * (event.key === 'ArrowLeft' ? 0.1 : -0.1), width()));
  } else if (event.key === '+' || event.key === '=') {
    event.preventDefault();
    zoom(Q.from(4n, 5n));
  } else if (event.key === '-') {
    event.preventDefault();
    zoom(Q.from(5n, 4n));
  }
});

el('zoom-in').onclick = () => zoom(Q.from(4n, 5n));
el('zoom-out').onclick = () => zoom(Q.from(5n, 4n));
el('fit-button').onclick = fit;
el('center-vertical').onclick = () => {
  verticalOffset = 0;
  requestRender(false);
};
el('empty-fit').onclick = fit;
el('add-button').onclick = () => eventForm(undefined, selectedTime ?? undefined);
el('clear-selection').onclick = () => {
  el('close-inspector').click();
};
el('close-inspector').onclick = () => {
  flushEventEdit();
  pendingEventEdit = false;
  selectedTime = null;
  selectionRequest++;
  selected = null;
  selectedGroup = null;
  el('event-form').hidden = true;
  el('group-details').hidden = true;
  el('inspector-intro').hidden = false;
  requestRender();
};
input('density').oninput = () => {
  text('density-value', `${pixels()} px`);
  requestRender();
};
el('apply-bounds').onclick = () => {
  try {
    const formatter = timelinePresenter(),
      context = viewContext('input');
    const read = (id: string) => {
      const value = input(id).value,
        displayed = displayedBounds.get(id);
      // Reapplying unchanged rounded text must not move an exact viewport.
      return displayed?.text === value ? displayed.time : formatter.parse(value, context);
    };
    const left = read('left-bound'),
      right = read('right-bound');
    viewport = new Viewport(left, right.sub(left));
    requestRender();
  } catch (error) {
    fail(error);
  }
};
function setEventTime(time: Q) {
  const value = presented(time, 'input');
  displayedEventTime = { text: value, time };
  input('event-time').value = value;
  input('event-exact').value = time.toString();
  for (const label of el('plugin-event-fields').querySelectorAll('.stack-time'))
    label.textContent = `Inherited time: ${value}`;
}
function readEventTime() {
  const value = input('event-time').value;
  return displayedEventTime?.text === value
    ? displayedEventTime.time
    : timelinePresenter().parse(value, viewContext('input'));
}
input('event-time').oninput = () => {
  try {
    const time = readEventTime();
    for (const label of el('plugin-event-fields').querySelectorAll('.stack-time'))
      label.textContent = `Inherited time: ${input('event-time').value}`;
    input('event-exact').value = time.toString();
    selectedTime = time;
    text('event-error', '');
    requestRender();
  } catch {
    input('event-exact').value = '';
    // Incomplete text stays editable; submitting reports a parser error.
  }
};
function displaySections() {
  const mode = input('presentation-mode').value;
  el('presentation-custom').hidden = mode !== 'custom';
  el('presentation-calendar').hidden = mode !== 'gregorian';
  el('presentation-numeric').hidden = mode === 'gregorian' || mode === 'custom';
  el('presentation-transform').hidden = mode === 'custom';
  el('presentation-ruler-steps').hidden = input('presentation-ruler').value !== 'steps';
}
function displaySettings(): TimePresentation {
  return validatePresentation({
    version: 1,
    mode: input('presentation-mode').value,
    unit: input('presentation-unit').value,
    significantDigits: Number(input('presentation-digits').value),
    scale: input('presentation-scale').value,
    origin: input('presentation-origin').value,
    offsetMinutes: Number(input('presentation-offset').value),
    adaptiveLabels: input('presentation-adaptive').checked,
    source: el<HTMLTextAreaElement>('presentation-source').value,
    ...(input('presentation-ruler').value
      ? {
          ruler: {
            kind: input('presentation-ruler').value,
            ...(input('presentation-ruler').value === 'steps'
              ? { steps: JSON.parse(el<HTMLTextAreaElement>('presentation-steps').value) }
              : {}),
          },
        }
      : {}),
  });
}
for (const [index, preset] of UNIT_PRESETS.entries()) {
  const option = document.createElement('option');
  option.value = String(index);
  option.textContent = preset.label;
  el('presentation-unit-preset').append(option);
}
input('presentation-unit-preset').onchange = () => {
  if (!input('presentation-unit-preset').value) return;
  const preset = UNIT_PRESETS[Number(input('presentation-unit-preset').value)];
  input('presentation-unit').value = preset.unit;
  input('presentation-scale').value = preset.scale;
};
input('presentation-epoch').onchange = () => {
  const mjd = input('presentation-epoch').value === 'mjd';
  input('presentation-origin').value = mjd ? '40587' : '0';
  input('presentation-scale').value = mjd ? '1/86400' : '1';
};
input('presentation-mode').onchange = displaySections;
input('presentation-ruler').onchange = displaySections;
el('presentation-example').onclick = () => {
  el<HTMLTextAreaElement>('presentation-source').value = CUSTOM_EXAMPLE;
};
el('presentation-button').onclick = () => {
  const settings = (model ? model.presentation : remote?.presentation) ?? DEFAULT_PRESENTATION;
  for (const [field, value] of Object.entries({
    mode: settings.mode,
    digits: settings.significantDigits,
    unit: settings.unit,
    scale: settings.scale,
    origin: settings.origin,
    offset: settings.offsetMinutes,
  }))
    input('presentation-' + field).value = String(value);
  input('presentation-unit-preset').value = '';
  input('presentation-adaptive').checked = settings.adaptiveLabels !== false;
  input('presentation-epoch').value = '';
  input('presentation-ruler').value = settings.ruler?.kind ?? '';
  el<HTMLTextAreaElement>('presentation-steps').value = JSON.stringify(
    settings.ruler?.kind === 'steps' ? settings.ruler.steps : ['1', '60', '3600', '86400'],
  );
  el<HTMLTextAreaElement>('presentation-source').value = settings.source ?? CUSTOM_EXAMPLE;
  text('presentation-error', '');
  text('presentation-preview-result', '');
  el<HTMLButtonElement>('presentation-save').disabled = !editable();
  displaySections();
  el<HTMLDialogElement>('presentation-dialog').showModal();
};
el('presentation-preview').onclick = () => {
  try {
    const formatter = createPresenter(displaySettings()),
      time = parseTime(input('presentation-preview-time').value),
      context = viewContext(
        input('presentation-preview-purpose').value as PresentationContext['purpose'],
      ),
      output = formatter.print(time, context),
      parsed = formatter.parse(output, context),
      rules = formatter.rules(context);
    text(
      'presentation-preview-result',
      `${output}\nParsed: ${parsed.toString()}\n${parsed.equals(time) ? 'Exact round trip' : 'Rounded display; parsing would choose a different coordinate'}\nRuler: ${rules.graduation} · ${rules.ticks.length} visible marks`,
    );
    text('presentation-error', '');
  } catch (error) {
    text('presentation-error', error instanceof Error ? error.message : String(error));
  }
};
el<HTMLFormElement>('presentation-form').onsubmit = (event) => {
  event.preventDefault();
  if (!editable()) return;
  try {
    const editingTime = !el('event-form').hidden ? readEventTime() : null;
    model!.presentation = displaySettings();
    changed();
    if (editingTime) setEventTime(editingTime);
    el<HTMLDialogElement>('presentation-dialog').close();
  } catch (error) {
    text('presentation-error', error instanceof Error ? error.message : String(error));
  }
};
el('apply-exact-bounds').onclick = () => {
  try {
    const left = parseTime(input('exact-left').value),
      right = parseTime(input('exact-right').value);
    viewport = new Viewport(left, right.sub(left));
    requestRender();
  } catch (error) {
    fail(error);
  }
};
el('group-zoom').onclick = () => {
  if (selectedGroup) zoomGroup(selectedGroup);
};
el('group-more').onclick = () => {
  const request = selectionRequest;
  if (selectedGroup && groupCursor)
    void groupPage(selectedGroup, groupCursor)
      .then((p) => {
        if (request === selectionRequest) showGroupPage(p.events, p.next);
      })
      .catch(fail);
};
el<HTMLFormElement>('event-form').onsubmit = (event) => {
  event.preventDefault();
  flushEventEdit();
};
el('event-form').addEventListener('input', queueEventEdit);
el('event-form').addEventListener('change', queueEventEdit);
el('event-form').addEventListener('focusout', () => {
  flushEventEdit();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushEventEdit();
});
function requestDelete(point: PointEvent) {
  flushEventEdit();
  point = model?.byId.get(point.id) ?? point;
  if (!editable() || !model!.byId.has(point.id)) return;
  closeTimelineMenu();
  pendingDelete = { id: point.id, document: documentRequest };
  text(
    'delete-description',
    `Delete “${point.metadata.title || 'Untitled event'}” at ${presented(Q.parse(point.time), 'input')}? You can undo this deletion.`,
  );
  el<HTMLDialogElement>('delete-dialog').showModal();
  el('delete-cancel').focus();
}
el('event-delete').onclick = () => {
  if (selected) requestDelete(selected);
};
el<HTMLDialogElement>('delete-dialog').addEventListener('close', () => {
  pendingDelete = null;
});
el('delete-confirm').onclick = () => {
  flushEventEdit();
  const pending = pendingDelete;
  if (!pending || pending.document !== documentRequest || !editable()) return;
  if (pending.remove) {
    pending.remove();
    el<HTMLDialogElement>('delete-dialog').close();
    return;
  }
  const point = model!.byId.get(pending.id);
  if (!point) {
    el<HTMLDialogElement>('delete-dialog').close();
    return;
  }
  history.push({ before: point });
  model!.delete(point.id);
  if (selected?.id === point.id) {
    selected = null;
    el('event-form').hidden = true;
    el('inspector-intro').hidden = false;
  }
  selectedGroup = null;
  el('group-details').hidden = true;
  if (el('event-form').hidden) el('inspector-intro').hidden = false;
  el<HTMLDialogElement>('delete-dialog').close();
  changed();
};
el('undo-button').onclick = () => {
  flushEventEdit();
  clearTimeout(eventEditTimer);
  pendingEventEdit = false;
  eventEditHistory = null;
  const edit = history.pop();
  if (!edit || !model) return;
  if (edit.after) model.delete(edit.after.id);
  if (edit.before) model.put(edit.before);
  selected = null;
  selectedGroup = null;
  el('event-form').hidden = true;
  el('inspector-intro').hidden = false;
  changed();
};
input('timeline-title').onchange = () => {
  if (!editable()) return;
  model!.title = input('timeline-title').value;
  changed();
};
el<HTMLTextAreaElement>('timeline-description').onchange = () => {
  if (!editable()) return;
  model!.description = el<HTMLTextAreaElement>('timeline-description').value;
  changed();
};
function mayReplace() {
  flushEventEdit();
  return (
    (!dirty && !(desktop && sqlitePath && sqliteSavedVersion !== editVersion)) ||
    confirm('Save or export your changes first if you want to keep them. Replace this timeline?')
  );
}
el('new-button').onclick = () => {
  if (!mayReplace()) return;
  historyReplace();
  sqlitePath = null;
  loadDocument({
    format: 'openchronology',
    version: 1,
    title: 'Untitled timeline',
    description: '',
    events: [],
  });
};
function historyReplace() {
  documentRequest++;
  if (!offlineHtml) window.history.replaceState(null, '', location.pathname);
}
el('dense-demo').onclick = () => {
  if (!mayReplace()) return;
  historyReplace();
  sqlitePath = null;
  loadDocument(demo(true));
};
el('import-button').onclick = () => input('json-file').click();
input('json-file').onchange = () => {
  const file = input('json-file').files?.[0];
  input('json-file').value = '';
  if (!file || !mayReplace()) return;
  const workspace = documentRequest;
  void file
    .text()
    .then((value) => {
      const doc = validateDocument(JSON.parse(value));
      if (workspace !== documentRequest) return;
      historyReplace();
      sqlitePath = null;
      loadDocument(doc);
      toast('JSON timeline imported.');
    })
    .catch(fail);
};
el('export-button').onclick = () => {
  flushEventEdit();
  void (async () => {
    const doc =
      model?.document() ??
      (await api<{ document: TimelineDocument }>(`timelines/${remote!.id}/document`)).document;
    download(
      new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' }),
      doc.title,
      '.ochx',
    );
  })().catch(fail);
};
function download(blob: Blob, title: string, extension: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download =
    (title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 70) || 'timeline') + extension;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
el('och-import').onclick = () => {
  if (!session.user) {
    el('account-button').click();
    return;
  }
  input('och-file').click();
};
input('och-file').onchange = () => {
  const file = input('och-file').files?.[0];
  input('och-file').value = '';
  if (!file || !mayReplace()) return;
  const workspace = documentRequest;
  void importSqlite(file, session.csrf)
    .then((value) => {
      const doc = validateDocument(value);
      if (workspace !== documentRequest) return;
      historyReplace();
      loadDocument(doc);
      toast('.och timeline imported through the server.');
    })
    .catch(fail);
};
el('och-export').onclick = () => {
  flushEventEdit();
  void (async () => {
    if (!model && remote) {
      download(await exportSqlite(`timelines/${remote.id}/file`), remote.title, '.och');
      return;
    }
    if (!session.user) {
      el('account-button').click();
      return;
    }
    if (!model) return;
    download(
      await exportSqlite('files/export', model.document(), session.csrf),
      model.title,
      '.och',
    );
  })().catch(fail);
};
el('account-button').onclick = () => {
  void (async () => {
    if (!offlineHtml) await refreshSession();
    if (!session.server) {
      toast('Server sharing is unavailable. Local timelines remain available.');
      return;
    }
    el('password-fields').hidden = !!session.user;
    el('desktop-login').hidden = !desktop || !!session.user;
    text('account-error', '');
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-provider]')) {
      button.hidden = desktop || !(session.providers ?? []).includes(button.dataset.provider!);
      button.disabled = false;
      button.textContent = `${session.user ? 'Link' : 'Continue with'} ${button.dataset.provider === 'github' ? 'GitHub' : button.dataset.provider === 'facebook' ? 'Facebook' : 'Google'}`;
    }
    el('account-sessions').hidden = !session.user;
    if (session.user) await accountSessions();
    if (!el<HTMLDialogElement>('account-dialog').open)
      el<HTMLDialogElement>('account-dialog').showModal();
  })().catch(fail);
};
async function refreshSession() {
  session = await api<Session>('session');
  accountHeading();
  heading();
}
async function accountSessions() {
  const result = await api<{
    identities: string[];
    sessions: { kind: string; current: boolean; created_at: string }[];
  }>('auth/account');
  el('session-list').replaceChildren();
  for (const entry of result.sessions) {
    const item = document.createElement('p');
    item.textContent = `${entry.kind === 'desktop' ? 'Desktop' : 'Browser'}${entry.current ? ' (this session)' : ''} · ${new Date(entry.created_at).toLocaleString()}`;
    el('session-list').append(item);
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-provider]'))
    button.disabled = result.identities.includes(button.dataset.provider!);
}
el('revoke-sessions').onclick = () => {
  void api('auth/revoke-others', 'POST', {}).then(accountSessions).catch(fail);
};
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-provider]'))
  button.onclick = () => {
    const returnTo = /^#desktop\/[A-Z2-9]{10}$/.test(location.hash) ? '/' + location.hash : '/';
    void api<{ url: string }>(`auth/${button.dataset.provider}/start`, 'POST', {
      returnTo,
      link: !!session.user,
    })
      .then(async (result) => {
        await retainForSignIn();
        location.assign(result.url);
      })
      .catch((error) => text('account-error', error.message));
  };
let desktopLoginAttempt = 0;
el('desktop-login').onclick = () => {
  if (!desktop) return;
  const attempt = ++desktopLoginAttempt;
  void (async () => {
    const result = await window.__TAURI__!.core.invoke<{
      userCode: string;
      verificationUri: string;
    }>('desktop_auth_start');
    text(
      'desktop-login-status',
      `Confirm code ${result.userCode} in your browser. ${result.verificationUri}`,
    );
    const deadline = Date.now() + 600000;
    const poll = async () => {
      if (attempt !== desktopLoginAttempt || Date.now() > deadline) return;
      try {
        const result = await window.__TAURI__!.core.invoke<{ pending?: boolean }>(
          'desktop_auth_poll',
        );
        if (result.pending) {
          setTimeout(() => void poll(), 3500);
          return;
        }
        await refreshSession();
        el<HTMLDialogElement>('account-dialog').close();
        await directory();
        toast('Desktop connected to your account.');
      } catch (error) {
        fail(error);
      }
    };
    setTimeout(() => void poll(), 3500);
  })().catch(fail);
};
el('desktop-approve').onclick = () => {
  void api('auth/device/approve', 'POST', { userCode: el('desktop-approval-code').textContent })
    .then(() => {
      el<HTMLDialogElement>('desktop-approval-dialog').close();
      window.history.replaceState(null, '', '/');
      toast('Desktop session approved. You can return to the application.');
    })
    .catch(fail);
};
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-close]'))
  button.onclick = () => el<HTMLDialogElement>(button.dataset.close!).close();
el<HTMLFormElement>('account-form').onsubmit = (event) => {
  event.preventDefault();
  const action = (event.submitter as HTMLButtonElement)?.value ?? 'login';
  text('account-error', '');
  void api<{ user: Session['user']; csrf: string }>(`auth/${action}`, 'POST', {
    username: input('account-name').value,
    password: input('account-password').value,
  })
    .then(async (result) => {
      session = { ...session, ...result };
      input('account-password').value = '';
      el<HTMLDialogElement>('account-dialog').close();
      accountHeading();
      heading();
      await directory();
      await route(true);
    })
    .catch((error) => text('account-error', error.message));
};
function accountHeading() {
  text('account-button', session.user ? `@${session.user.username}` : 'Sign in');
  el('logout-button').hidden = !session.user;
  el('account-button').hidden = offlineHtml;
  el('server-button').hidden = !desktop;
}
el('logout-button').onclick = () => {
  if (!mayReplace()) return;
  void api('auth/logout', 'POST', {})
    .then(() => {
      session = { ...session, user: null, csrf: null };
      desktopLoginAttempt++;
      accountHeading();
      el('timeline-list').replaceChildren();
      if (remote) {
        historyReplace();
        loadDocument(demo());
      }
      toast('Signed out.');
      void refreshSession().catch(fail);
    })
    .catch(fail);
};
el('publish-button').onclick = () => {
  flushEventEdit();
  void (async () => {
    if (!session.user) {
      el('account-button').click();
      return;
    }
    if (!model) throw new Error('This timeline is read-only.');
    if (saving) return;
    saving = true;
    heading();
    const version = editVersion,
      workspace = documentRequest;
    try {
      const result = remote
        ? await api<RemoteTimeline>(`timelines/${remote.id}`, 'PUT', {
            revision: remote.revision,
            document: model.document(),
          })
        : await api<RemoteTimeline>('timelines', 'POST', model.document());
      if (workspace !== documentRequest) return;
      remote = result;
      dirty = version !== editVersion;
      window.history.replaceState(null, '', `#timeline/${result.id}`);
      heading();
      await directory();
      toast('Timeline saved. It is ' + result.visibility + '.');
    } finally {
      saving = false;
      heading();
    }
  })().catch(fail);
};
async function members() {
  const result = await api<{ members: { username: string; role: string }[] }>(
    `timelines/${remote!.id}/members`,
  );
  el('members-list').replaceChildren();
  for (const member of result.members) {
    const row = document.createElement('div'),
      name = document.createElement('span'),
      button = document.createElement('button');
    name.textContent = `@${member.username} · ${member.role}`;
    button.textContent = 'Remove';
    button.onclick = () => {
      void api(`timelines/${remote!.id}/members`, 'DELETE', { username: member.username })
        .then(members)
        .catch((error) => text('sharing-error', error.message));
    };
    row.append(name, button);
    el('members-list').append(row);
  }
}
el('share-button').onclick = () => {
  if (!remote?.canShare) return;
  el<HTMLSelectElement>('visibility').value = remote.visibility;
  text('sharing-link', `${serverOrigin}/#timeline/${remote.id}`);
  text('sharing-error', '');
  el<HTMLDialogElement>('sharing-dialog').showModal();
  void members().catch(fail);
};
el<HTMLSelectElement>('visibility').onchange = () => {
  void api<RemoteTimeline>(`timelines/${remote!.id}/settings`, 'PATCH', {
    visibility: el<HTMLSelectElement>('visibility').value,
  })
    .then((result) => {
      remote = result;
      heading();
    })
    .catch((error) => text('sharing-error', error.message));
};
el('copy-link').onclick = () => {
  void navigator.clipboard
    .writeText(el('sharing-link').textContent!)
    .then(() => toast('Timeline link copied.'))
    .catch(() => toast('Select and copy the link shown above.'));
};
el<HTMLFormElement>('member-form').onsubmit = (event) => {
  event.preventDefault();
  void api(`timelines/${remote!.id}/members`, 'POST', {
    username: input('member-name').value,
    role: el<HTMLSelectElement>('member-role').value,
  })
    .then(async () => {
      input('member-name').value = '';
      text('sharing-error', '');
      await members();
    })
    .catch((error) => text('sharing-error', error.message));
};
if (desktop) {
  el('server-button').onclick = () => {
    text('connection-error', '');
    el<HTMLDialogElement>('connection-dialog').showModal();
  };
  const connect = async (origin: string | null) => {
    if (remote && !model) {
      try {
        const snapshot = await api<{ document: TimelineDocument }>(
          `timelines/${remote.id}/document`,
        );
        model = new TimelineIndex(validateDocument(snapshot.document));
      } catch {
        model = new TimelineIndex({
          format: 'openchronology',
          version: 1,
          title: 'Untitled timeline',
          description: '',
          events: [],
        });
        toast('The remote snapshot was unavailable. Open a local file or reconnect to view it.');
      }
    }
    if (remote) {
      remote = null;
      dirty = true;
      sqlitePath = null;
      sqliteSavedVersion = null;
      historyReplace();
    }
    documentRequest++;
    desktopLoginAttempt++;
    await window.__TAURI__!.core.invoke('desktop_connect', { origin });
    if (origin) serverOrigin = new URL(origin).origin;
    session = { user: null, csrf: null, server: false };
    el('timeline-list').replaceChildren();
    accountHeading();
    heading();
    if (origin) await refreshSession();
    el<HTMLDialogElement>('connection-dialog').close();
  };
  el<HTMLFormElement>('connection-form').onsubmit = (event) => {
    event.preventDefault();
    void connect(input('server-origin').value).catch((error) =>
      text('connection-error', error.message),
    );
  };
  el('server-disconnect').onclick = () => {
    void connect(null).catch((error) => text('connection-error', error.message));
  };
  for (const id of ['sqlite-open', 'sqlite-save', 'sqlite-save-as']) el(id).hidden = false;
  el('sqlite-open').onclick = () => {
    if (!mayReplace()) return;
    const workspace = documentRequest;
    void window
      .__TAURI__!.core.invoke<{ document: TimelineDocument; path: string } | null>('desktop_open')
      .then(async (result) => {
        if (!result || workspace !== documentRequest) return;
        const document = validateDocument(result.document);
        await window.__TAURI__!.core.invoke<void>('desktop_accept_open', { path: result.path });
        if (workspace !== documentRequest) return;
        historyReplace();
        loadDocument(document);
        sqlitePath = result.path;
        sqliteSavedVersion = editVersion;
        heading();
      })
      .catch(fail);
  };
  for (const [id, saveAs] of [
    ['sqlite-save', false],
    ['sqlite-save-as', true],
  ] as const)
    el(id).onclick = () => {
      flushEventEdit();
      const version = editVersion,
        workspace = documentRequest;
      void (async () => {
        const document =
          model?.document() ??
          (remote
            ? validateDocument(
                (await api<{ document: TimelineDocument }>(`timelines/${remote.id}/document`))
                  .document,
              )
            : null);
        if (!document || workspace !== documentRequest) return null;
        return window.__TAURI__!.core.invoke<string | null>('desktop_save', {
          document,
          saveAs: saveAs || !sqlitePath,
          expectedPath: sqlitePath,
        });
      })()
        .then((path) => {
          if (!path || workspace !== documentRequest) return;
          sqlitePath = path;
          sqliteSavedVersion = version;
          if (!remote) dirty = version !== editVersion;
          heading();
          toast('SQLite timeline saved.');
        })
        .catch(fail);
    };
}
new ResizeObserver(() => requestRender()).observe(stage);
if (!offlineHtml)
  window.addEventListener('hashchange', () => {
    void route().catch(fail);
  });
if (offlineHtml) {
  document.body.dataset.offline = 'true';
  el('new-button').classList.remove('workspace-new');
  document.querySelector('.file-actions')!.prepend(el('new-button'));
  document.querySelector<HTMLElement>('.workspace')!.hidden = true;
  document.querySelector<HTMLElement>('.breadcrumbs')!.hidden = true;
  for (const id of [
    'account-button',
    'logout-button',
    'publish-button',
    'share-button',
    'sqlite-open',
    'sqlite-save',
    'sqlite-save-as',
    'server-button',
    'och-import',
    'och-export',
  ])
    el(id).hidden = true;
  document.querySelector('#empty-window')!.firstChild!.textContent =
    'Import JSON or add your first event.';
}
heading();
accountHeading();
requestRender();
void (async () => {
  if (desktop) {
    try {
      const origin = await window.__TAURI__!.core.invoke<string | null>('desktop_server');
      if (origin) serverOrigin = origin;
      input('server-origin').value = origin ?? 'https://timescale.info';
      if (origin) {
        await refreshSession();
        if (session.user) await directory();
      }
    } catch {
      /* The desktop keeps working with local files while disconnected. */
    }
  }
  if (!desktop && !offlineHtml) {
    try {
      const draft = await loadDraft();
      if (draft && !location.hash) loadDocument(validateDocument(draft));
    } catch {
      /* Storage can be unavailable in a private browser. */
    }
    try {
      await refreshSession();
      if (session.user) await directory();
      await restoreAfterSignIn();
    } catch {
      /* Local editing also works without a server. */
    }
  }
  await route();
})().catch(fail);
