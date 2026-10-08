import { calendarPicker } from './calendar-picker.js';
// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import { followLatest } from './follow-latest.js';
import { createSummaryExpansion } from './summary-expansion.js';
import { pluginExpand } from './plugins.js';
import { browserEntryCount, BROWSER_COPY_MAX_EVENTS } from './browser-copy.js';
import { liveUpdates } from './live-updates.js';
import { ComparisonView } from './comparison.js';
import type { ComparisonSource, ComparisonGroup, EventPage } from './comparison.js';
import { comparisonUI } from './comparison-ui.js';
import { createCommunityUI } from './community-ui.js';
import type { Proposal } from './community-ui.js';
import { configureImages, imageSource, embedImages } from './image-assets.js';
import './styles.css';
import { renderPluginMarker, renderPluginFields, renderPluginShape } from './plugin-ui.js';
import { attachRichText } from './rich-text.js';
import { pluginRichText } from './plugins.js';
import { dismissOnBackdrop } from './dialogs.js';
import { createHoverPreview } from './hover-preview.js';
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
  pluginShape,
  pluginSize,
  PLUGIN_EXAMPLE,
  validateTags,
  validateAssets,
  isOfficialPlugin,
  pluginFields,
  stackWindow,
  scaleTimeline,
  validateStackMetadata,
  validatePresentation,
  DEFAULT_PRESENTATION,
  UNIT_PRESETS,
  CUSTOM_EXAMPLE,
  anchorOf,
  resolveDuration,
  validateDuration,
  durationPlugins,
  momentPlugins,
} from './core.js';
import type {
  Duration,
  DurationEndpoint,
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
import { ViewportCache, RemoteWorkspace, regroup, applyChanges } from './remote-cache.js';
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
  comparison?: { sources: string[]; combined: boolean };
  id: string;
  title: string;
  description: string;
  presentation?: TimePresentation;
  plugins?: InstalledPlugin[];
  revision: string;
  event_generation?: string;
  head_revision_id?: string;
  visibility: 'private' | 'public';
  canEdit: boolean;
  canShare: boolean;
  canWrite?: boolean;
  canPropose?: boolean;
  tags?: string[];
  assets?: Record<string, string>;
  owner: string;
  event_count: string;
  star_count?: string;
  starred?: boolean;
  first?: string;
  last?: string;
}
interface NativeOpened {
  document: TimelineDocument;
  path: string;
  generation: number;
  event_count: string;
  first?: string;
  last?: string;
}
interface LocalTimeline extends NativeOpened {
  id: string;
  revision: string;
}
let local: LocalTimeline | null = null;
interface Session {
  user: { id: string; username: string } | null;
  csrf: string | null;
  server: boolean;
  dashboard?: boolean;
  providers?: string[];
  fileExchange?: boolean;
}
const el = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const desktop = !offlineHtml && !!window.__TAURI__,
  stage = el('timeline-stage');
const platformEditor = !offlineHtml && !desktop && location.pathname === '/editor/frame';
const sampleTimeline =
  platformEditor && new URLSearchParams(location.search).get('demo') === 'dense';
const freshTimeline = platformEditor && new URLSearchParams(location.search).get('new') === '1';
if (platformEditor) document.body.dataset.platformEditor = 'true';
if (desktop) {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('.download-menu a'))
    link.onclick = (event) => {
      event.preventDefault();
      void window.__TAURI__!.core.invoke('desktop_open_image', { url: link.href }).catch(fail);
    };
}
let serverOrigin = desktop ? 'https://timescale.info' : location.origin;
let model: TimelineIndex | null = new TimelineIndex(
    offlineHtml || freshTimeline
      ? {
          format: 'openchronology',
          version: 1,
          title: 'Untitled timeline',
          description: 'A short description for your timeline',
          events: [],
        }
      : demo(sampleTimeline),
  ),
  viewport = Viewport.fit(model.points.minKey(), model.points.maxKey());
let remote: RemoteTimeline | null = null,
  session: Session = { user: null, csrf: null, server: false },
  dirty = false,
  selected: PointEvent | null = null;
let live: ReturnType<typeof liveUpdates> | undefined;
let liveTransitionPending = false,
  animateLiveFrame = false;
const retiringNodes = new Set<HTMLElement>();
let comparison: ComparisonView | null = null;
let comparisonBefore: { viewport: Viewport; verticalOffset: number; uiScale: number } | null = null;
let comparisonController: AbortController | undefined;
let comparisonInFlight = false;
let workingProposal: Proposal | null = null;
let proposalSubmissionVersion = 0,
  proposalSubmissionDocument = 0;
function setDashboard(show: boolean) {
  el('dashboard').hidden = !show;
  document.body.dataset.dashboard = String(show);
  el('memory-notice').hidden = show || !memoryOnly() || !!remote || !!comparison || !model;
  if (!show) requestRender();
}
function hasDashboard() {
  return session.dashboard ?? session.server;
}
let starring = false;
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
        record(eventEditHistory);
      } else eventEditHistory.after = point;
      model!.put(point);
      const wasNew = !selected;
      selected = point;
      if (wasNew) refreshDurations();
      text('moment-heading', 'Moment details');
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
let uiScale = 1;
let renderedUiScale = 1;
const hoverPreview = createHoverPreview(
  stage,
  () => uiScale,
  (button) => button.click(),
);
const summaryExpansion = createSummaryExpansion(stage, {
  scale: () => uiScale,
  generation: () =>
    `${documentRequest}:${editVersion}:${remote?.revision ?? local?.revision ?? ''}:${comparison?.tracks.map((t) => t.source.revision).join(',') ?? ''}`,
  load: (group, signal) => groupPage(group, null, 5, signal),
  decorate(button, event) {
    renderPluginMarker(button, imageSource(pluginMarker(activePlugins(), event.metadata)), 1n);
    button.style.backgroundColor = pluginColor(activePlugins(), event.metadata) ?? '';
    button.dataset.size = pluginSize(activePlugins(), event.metadata);
    renderPluginShape(button, pluginShape(activePlugins(), event.metadata));
    button.title = `${event.metadata.title || 'Unnamed moment'} · ${presented(Q.parse(event.time))}`;
    hoverPreview.update(button, activePlugins(), event.metadata);
    markerGroups.set(button, {
      first: event.time,
      last: event.time,
      count: '1',
      distinct: 1,
      id: event.id,
      metadata: event.metadata,
      title: event.metadata.title,
      ...(comparison
        ? {
            sourceKey: comparison.tracks.find((track) =>
              event.id.startsWith(track.source.key + ':'),
            )?.source.key,
          }
        : {}),
    });
  },
  select(event) {
    selectedGroup = null;
    eventForm(event);
  },
  hidePreview: () => hoverPreview.hide(),
});
function scaleContents(requested: number, anchor: number) {
  hoverPreview.hide();
  summaryExpansion.hide();
  const next = scaleTimeline(uiScale, verticalOffset, requested, anchor);
  uiScale = next.scale;
  verticalOffset = next.offset;
  requestRender(false);
}
let verticalMinimum = 0,
  verticalMaximum = 0;
function panVertical(value: number) {
  follow.navigation();
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
function removeMomentLabel(label: MomentLabel, fade = false) {
  finishTimeFade(label);
  for (const node of [label.caption, label.stem, label.button]) {
    for (const animation of node.getAnimations({ subtree: true })) animation.cancel();
    if (!fade || reducedMotion.matches) {
      node.remove();
      continue;
    }
    node.style.pointerEvents = 'none';
    retiringNodes.add(node);
    while (retiringNodes.size > 256) {
      const old = retiringNodes.values().next().value!;
      old.remove();
      retiringNodes.delete(old);
    }
    const animation = node.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 220,
      easing: 'ease-out',
      fill: 'forwards',
    });
    void animation.finished
      .catch(() => {})
      .finally(() => {
        node.remove();
        retiringNodes.delete(node);
      });
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
const GROUP_PAGE_SIZE = 25;
type GroupCursor = { time: string; id: string } | null;
let groupStarts: GroupCursor[] = [null],
  groupPageIndex = 0,
  groupPageRequest = 0;
function clearGroupPage() {
  groupPageRequest++;
  groupCursor = null;
  groupStarts = [null];
  groupPageIndex = 0;
  el('group-events').replaceChildren();
  el('group-more').hidden = true;
  el('group-previous').hidden = true;
  text('group-page-status', '');
}
type EventEdit = { before?: PointEvent; after?: PointEvent };
type HistoryEntry = EventEdit | DurationEdit;
let history: HistoryEntry[] = [],
  future: HistoryEntry[] = [],
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
const memoryOnly = () => !desktop && (offlineHtml || !session.user);
const editable = () => !comparison && !!model && (!remote || remote.canEdit);
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
async function api<T>(
  path: string,
  method = 'GET',
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (offlineHtml) throw new Error('This offline file uses JSON import and export.');
  return requestApi<T>(path, method, data, session.csrf, signal);
}
const remoteCache = new ViewportCache();
let remoteCacheKey = '',
  windowController: AbortController | undefined;
let windowInFlight = false;
function sparseWorkspace(): RemoteWorkspace | null {
  return model instanceof RemoteWorkspace ? model : null;
}
async function timelineQuery<T>(query: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  if (local) {
    const plugins = activePlugins();
    const metadata_keys = [
      ...new Set([
        ...pluginFields(plugins).map((field) => field.metadataKey),
        ...plugins
          .filter((p) => p.enabled)
          .flatMap((p) => [
            ...(p.manifest.marker ? [p.manifest.marker.metadataKey] : []),
            ...(p.manifest.hover || p.manifest.source ? ['title', 'description'] : []),
            ...(p.manifest.hover ? ['sources'] : []),
          ]),
      ]),
    ];
    return window.__TAURI__!.core.invoke<T>('desktop_query', {
      generation: local.generation,
      query: { ...query, metadata_keys },
    });
  }
  if (!remote) throw new Error('No indexed timeline is open.');
  return api<T>(`timelines/${remote.id}/query`, 'POST', query, signal);
}
async function completeDocument(): Promise<TimelineDocument> {
  if (comparison) throw new Error('Exit comparison to save or export a source timeline.');
  if (!sparseWorkspace() && model) return model.document();
  if (!remote && !local) throw new Error('No timeline is open.');
  const workspace = documentRequest,
    index = sparseWorkspace();
  const changes = index ? new Map(index.changes) : undefined;
  const durationChanges = index ? new Map(index.durationChanges) : undefined;
  const settings = index?.document();
  const savedId = remote?.head_revision_id;
  const snapshot = local
    ? {
        document: await window.__TAURI__!.core.invoke<TimelineDocument>('desktop_document', {
          generation: local.generation,
        }),
      }
    : index && savedId
      ? await api<{ document: TimelineDocument }>(`timelines/${remote!.id}/history/${savedId}`)
      : await api<{ document: TimelineDocument }>(`timelines/${remote!.id}/document`);
  if (workspace !== documentRequest) throw new Error('The open timeline changed.');
  // Saved snapshots may predate standalone durations; validation converts legacy links.
  if (!changes || !settings) return validateDocument(snapshot.document);
  return applyChanges(validateDocument(snapshot.document), settings, changes, durationChanges!);
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
    // Hidden dashboards and documents have no usable geometry. Draw after they become visible.
    if (stage.clientWidth <= 96 || stage.clientHeight === 0) return;
    render(refresh);
  });
}
let presenterSettings: TimePresentation | undefined,
  presenter = createPresenter();
function timelinePresenter() {
  const settings = comparison?.presentation ?? (model ? model.presentation : remote?.presentation);
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
function comparisonRows() {
  const rows = new Map<string, { offset: number; title: number }>();
  let total = 0;
  if (!comparison || comparison.combined) return { rows, total };
  const fields = pluginFields(comparison.plugins).filter((field) => field.kind === 'stack');
  const ordered = [...frame.groups].sort((a, b) => Q.parse(a.first).compare(Q.parse(b.first)));
  for (const track of comparison.tracks) {
    let up = 0,
      down = 0,
      lane = 0;
    for (const group of ordered)
      if ((group as ComparisonGroup).sourceKey === track.source.key) {
        const depth = fields.reduce(
          (sum, field) =>
            sum +
            (Array.isArray(group.metadata?.[field.metadataKey])
              ? (group.metadata![field.metadataKey] as unknown[]).length
              : 0),
          0,
        );
        const extent = Math.max(0, depth * 72 - 40);
        if (lane++ % 4 < 2) up = Math.max(up, extent);
        else down = Math.max(down, extent);
      }
    rows.set(track.source.key, { offset: total + up, title: total + 22 });
    total += up + 340 + down;
  }
  return { rows, total };
}
function renderAxis() {
  const axis = el('axis');
  const rowPlan = comparisonRows();
  axis.replaceChildren();
  const baseline = document.createElement('div');
  baseline.className = 'axis-baseline';
  baseline.style.left = `${48 / uiScale}px`;
  baseline.style.right = `${48 / uiScale}px`;
  baseline.style.top = `${192 + (comparison && !comparison.combined ? (rowPlan.rows.get(comparison.tracks[0].source.key)?.offset ?? 0) : 0)}px`;
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
    tick.style.left = `${(48 + viewport.x(time, width())) / uiScale}px`;
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
    tick.style.transform = `translateY(${comparison && !comparison.combined ? (rowPlan.rows.get(comparison.tracks[0].source.key)?.offset ?? 0) : 0}px)`;
    axis.append(tick);
  }
  if (comparison && !comparison.combined) {
    const originalTicks = [...axis.querySelectorAll<HTMLElement>('.axis-tick')];
    for (const [index, track] of comparison.tracks.entries()) {
      const title = document.createElement('div');
      title.className = 'comparison-axis-title';
      title.textContent = track.source.title;
      title.style.top = `${rowPlan.rows.get(track.source.key)?.title ?? 22}px`;
      axis.append(title);
      if (!index) continue;
      const line = baseline.cloneNode(true) as HTMLElement;
      line.style.top = `${192 + (rowPlan.rows.get(track.source.key)?.offset ?? 0)}px`;
      axis.append(line);
      for (const tick of originalTicks) {
        const clone = tick.cloneNode(true) as HTMLElement;
        clone.style.transform = `translateY(${rowPlan.rows.get(track.source.key)?.offset ?? 0}px)`;
        clone.querySelector('.tick-guide')?.remove();
        axis.append(clone);
      }
    }
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
  renderDurationBands();
  const cursor = el('time-cursor');
  stage.style.setProperty('--timeline-scale', String(uiScale));
  stage.dataset.uiScale = String(uiScale);
  const cursorX = selectedTime ? viewport.x(selectedTime, width()) : -1;
  cursor.hidden = !selectedTime || cursorX < 0 || cursorX > width();
  el('clear-selection').hidden = !selectedTime;
  cursor.style.left = `${48 + cursorX}px`;
  if (selectedTime) {
    cursor.dataset.time = selectedTime.toString();
    cursor.setAttribute('aria-label', `Selected time: ${presented(selectedTime, 'input')}`);
  }
  const expandSummaries = pluginExpand(activePlugins());
  const container = el('markers');
  const branches = el('stack-markers');
  const stackRetained = new Set<string>();
  let topExtent = 0,
    bottomExtent = stage.clientHeight / uiScale;
  const retained = new Set<string>();
  const ordered: HTMLElement[] = [];
  let visible = 0n;
  // Remote summary metadata is itself ordered in a RationalMap. It is never mistaken for a complete event cache.
  const groups = new RationalMap<FrameGroup>((g) => BigInt(g.count));
  for (const group of frame.groups) groups.set(Q.parse(group.first), group);
  let lane = 0;
  const orderedGroups = comparison
    ? [...frame.groups].sort((a, b) => Q.parse(a.first).compare(Q.parse(b.first)))
    : [...groups].map(([, group]) => group);
  const trackLanes = new Map<string, number>();
  const rowPlan = comparisonRows();
  if (comparison && !comparison.combined) bottomExtent = Math.max(bottomExtent, rowPlan.total);
  for (const group of orderedGroups) {
    const sourceKey = (group as ComparisonGroup).sourceKey;
    const rowOffset = sourceKey ? (rowPlan.rows.get(sourceKey)?.offset ?? 0) : 0;

    const first = Q.parse(group.first),
      last = Q.parse(group.last),
      mid = first.add(last).div(Q.from(2n)),
      x = viewport.x(mid, width());
    if (x < 0 || x > width()) continue;
    visible += BigInt(group.count);
    const key = group.id
      ? `event:${group.id}`
      : `group:${sourceKey ?? ''}:${group.first}:${group.last}`;
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
      if (animateLiveFrame && !reducedMotion.matches)
        for (const node of [stem, caption, button])
          node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    }
    const { button, caption, stem, coordinate } = label;
    const count = BigInt(group.count);
    button.className =
      'event-marker' +
      (count > 1n ? ' group' : '') +
      (count > 999n ? ' large' : '') +
      (selectedGroup?.first === group.first &&
      (!comparison || (selectedGroup as ComparisonGroup)?.sourceKey === sourceKey)
        ? ' selected'
        : '');
    button.style.left = `${(48 + x) / uiScale}px`;
    markerGroups.set(button, group);
    summaryExpansion.update(button, group, expandSummaries);
    button.dataset.first = group.first;
    button.dataset.count = group.count;
    const metadata = group.id
      ? ((!comparison ? model?.byId.get(group.id)?.metadata : undefined) ?? group.metadata ?? {})
      : {};
    renderPluginMarker(button, imageSource(pluginMarker(activePlugins(), metadata)), count);
    const color = count === 1n ? pluginColor(activePlugins(), metadata) : null;
    button.style.backgroundColor = color ?? '';
    button.style.borderColor = '';
    button.dataset.size = count === 1n ? pluginSize(activePlugins(), metadata) : 'medium';
    renderPluginShape(button, count === 1n ? pluginShape(activePlugins(), metadata) : 'circle');
    button.setAttribute(
      'aria-label',
      count > 1n
        ? `${count} events near ${presented(first)}`
        : group.title?.trim() || 'Unnamed moment',
    );
    button.title =
      count > 1n ? `${count} events; select to explore` : group.title?.trim() || 'Unnamed moment';
    const sourceLane = trackLanes.get(sourceKey ?? '') ?? 0;
    trackLanes.set(sourceKey ?? '', sourceLane + 1);
    const top = (comparison ? sourceLane : lane++) % 4,
      labelTop = rowOffset + (top < 2 ? 128 - top * 43 : 234 + (top - 2) * 43);
    button.style.top = '';
    button.style.translate = `0 ${rowOffset}px`;
    stem.style.left = `${(48 + x) / uiScale}px`;
    stem.style.top = `${top < 2 ? labelTop + 32 : rowOffset + 201}px`;
    stem.style.height = `${top < 2 ? rowOffset + 181 - labelTop - 32 : labelTop - rowOffset - 201}px`;
    caption.style.left = `${(48 + x) / uiScale}px`;
    caption.style.top = `${labelTop}px`;
    label.title.textContent =
      count > 1n ? `${count.toLocaleString()} moments` : (group.title ?? '');
    caption.hidden = count === 1n && !group.title?.trim();
    stem.hidden = caption.hidden;
    updateMomentTime(label, axisLabel(mid, 'event'));
    coordinate.title = presented(mid) + '\nExact: ' + mid.toString();
    ordered.push(stem, caption, button);
    hoverPreview.update(
      button,
      activePlugins(),
      { ...metadata, title: group.title ?? metadata.title },
      count,
    );
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
          verticalOffset / uiScale,
          stage.clientHeight / uiScale,
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
            if (animateLiveFrame && !reducedMotion.matches)
              for (const node of [stem, caption, button])
                node.animate([{ opacity: 0 }, { opacity: 1 }], {
                  duration: 220,
                  easing: 'ease-out',
                });
          }
          const y = window.start + window.step * index;
          const previous = index === 0 ? rowOffset + 192 : y - window.step;
          const title = typeof entry.metadata.title === 'string' ? entry.metadata.title : '';
          child.button.style.left = `${(48 + x) / uiScale}px`;
          const size = pluginSize(activePlugins(), entry.metadata);
          child.button.dataset.size = size;
          child.button.style.top = `${y - { small: 16, medium: 22, large: 32 }[size] / 2}px`;
          child.button.dataset.stackEntry = entry.id;
          child.button.dataset.parentEvent = group.id;
          child.button.dataset.time = first.toString();
          child.button.setAttribute(
            'aria-label',
            `${title.trim() || 'Unnamed stack entry'} — stack entry of ${group.title?.trim() || 'Unnamed moment'}`,
          );
          child.button.title = `${title.trim() || 'Unnamed stack entry'} (inherits ${presented(mid, 'input')})`;
          renderPluginMarker(
            child.button,
            imageSource(pluginMarker(activePlugins(), entry.metadata)),
            1n,
          );
          const color = pluginColor(activePlugins(), entry.metadata);
          child.button.style.backgroundColor = color ?? '';
          child.button.style.borderColor = '';
          renderPluginShape(child.button, pluginShape(activePlugins(), entry.metadata));
          child.caption.style.left = `${(48 + x) / uiScale}px`;
          child.caption.style.top = `${direction < 0 ? y - 45 : y + 16}px`;
          child.title.textContent = title;
          child.caption.hidden = !title.trim();
          child.stem.style.left = `${(48 + x) / uiScale}px`;
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
          hoverPreview.update(child.button, activePlugins(), entry.metadata);
        }
      }
    }
  }
  for (const [key, label] of stackLabels)
    if (!stackRetained.has(key)) {
      removeMomentLabel(label, animateLiveFrame);
      stackLabels.delete(key);
    }
  const centeredOffset = 192 * (1 - uiScale);
  verticalMinimum = Math.min(centeredOffset, stage.clientHeight - bottomExtent * uiScale - 24);
  verticalMaximum = Math.max(centeredOffset, -topExtent * uiScale + 24);
  const clamped = Math.max(verticalMinimum, Math.min(verticalMaximum, verticalOffset));
  if (clamped !== verticalOffset) {
    verticalOffset = clamped;
    requestRender(false);
  }
  for (const layer of [el('axis'), el('duration-bands'), container, branches]) {
    layer.style.width = `${stage.clientWidth / uiScale}px`;
    layer.style.height = `${stage.clientHeight / uiScale}px`;
    layer.style.transformOrigin = '0 0';
    layer.style.transform = `translateY(${verticalOffset}px) scale(${uiScale})`;
  }
  for (const [key, label] of momentLabels)
    if (!retained.has(key)) {
      removeMomentLabel(label, animateLiveFrame);
      momentLabels.delete(key);
    }
  // Preserve nodes and focus on ordinary renders; reorder only when chronology changes.
  ordered.forEach((node, index) => {
    if (container.children[index] !== node)
      container.insertBefore(node, container.children[index] ?? null);
  });
  text('visible-count', `${visible.toLocaleString()} visible · ${frame.groups.length} points`);
  el('empty-window').hidden = frame.groups.length > 0 || !!frame.durations?.length;
  summaryExpansion.refresh();
  hoverPreview.refresh();
  animateLiveFrame = false;
}
function render(refreshFrame = true) {
  if (comparison) {
    renderComparison(refreshFrame);
    return;
  }
  if (refreshFrame || renderedUiScale !== uiScale) {
    renderAxis();
    renderedUiScale = uiScale;
  }
  if (model && !sparseWorkspace()) {
    if (refreshFrame) frame = model.frame(viewport, width(), pixels());
    el('loading-window').hidden = true;
    drawFrame();
  } else if (remote || local) {
    const source = local ?? remote!;
    const key = source.id + ':' + source.revision + ':' + JSON.stringify(activePlugins());
    if (remoteCacheKey !== key) {
      remoteCache.clear();
      remoteCacheKey = key;
    }
    const query = remoteCache.plan(viewport, width(), pixels());
    const cached = remoteCache.get(viewport, query);
    const base = cached ?? (liveTransitionPending ? frame : remoteCache.visible(viewport));
    const threshold = viewport.threshold(width(), pixels());
    // Pending requests keep the last confirmed grouping until the server supplies
    // its replacement; otherwise zooming would hide singleton markers prematurely.
    const displayThreshold = cached ? threshold : Q.zero;
    frame =
      sparseWorkspace()?.overlay(base, viewport, displayThreshold) ??
      regroup(base, displayThreshold);
    sparseWorkspace()?.evict(selected?.id, openDuration?.duration.id);
    drawFrame();
    if (!refreshFrame || cached) {
      if (cached) {
        clearTimeout(frameTimer);
        ++frameRequest;
        windowController?.abort();
      }
      el('loading-window').hidden = !!cached;
      return;
    }
    clearTimeout(frameTimer);
    const request = ++frameRequest,
      id = source.id,
      revision = source.revision;
    windowController?.abort();
    el('loading-window').hidden = false;
    frameTimer = setTimeout(() => {
      // Native HTTP requests cannot be interrupted by AbortController: keep one active request.
      if (windowInFlight || comparisonInFlight) return;
      windowInFlight = true;
      const controller = (windowController = new AbortController());
      void timelineQuery<Frame>(
        {
          kind: 'overview',
          ...query,
          revision,
          plugins: activePlugins(),
        },
        controller.signal,
      )
        .then((result) => {
          if (
            controller.signal.aborted ||
            request !== frameRequest ||
            (local ?? remote)?.id !== id ||
            (local ?? remote)?.revision !== revision
          )
            return;
          remoteCache.store(query, result);
          animateLiveFrame = liveTransitionPending;
          liveTransitionPending = false;
          requestRender(false);
          el('loading-window').hidden = true;
        })
        .catch((error) => {
          if (request === frameRequest && !controller.signal.aborted) {
            if (local && saving) return;
            el('loading-window').hidden = true;
            if (error?.status === 409 && !dirty && remote) {
              const view = viewport.clone();
              void openRemote(id)
                .then(() => {
                  if (remote?.id === id) {
                    viewport = view;
                    requestRender();
                  }
                })
                .catch(fail);
            } else fail(error);
          }
        })
        .finally(() => {
          windowInFlight = false;
          if (request !== frameRequest && (remote || local)) requestRender();
        });
    }, 70);
  } else {
    frame = { groups: [], visitedNodes: 0 };
    drawFrame();
  }
}
function currentComparisonSource(): ComparisonSource | null {
  if (comparison) return null;
  flushEventEdit();
  const source = local ?? remote;
  const index = model;
  const settings = index
    ? {
        title: index.title,
        presentation: index.presentation,
        plugins: index.plugins,
        assets: index.assets,
      }
    : undefined;
  if (!source && index)
    return {
      key: 'local',
      title: index.title,
      presentation: index.presentation,
      plugins: index.plugins,
      assets: index.assets,
      index,
      first: index.points.minKey()?.toString(),
      last: index.points.maxKey()?.toString(),
    };
  if (!source) return null;
  const workspace = sparseWorkspace();
  const native = local;
  const remoteId = remote?.id;
  const query = async (
    value: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Frame | EventPage> => {
    const plugins = comparison?.plugins ?? settings?.plugins ?? remote?.plugins ?? [];
    const result = native
      ? await window.__TAURI__!.core.invoke<Frame | EventPage>('desktop_query', {
          generation: native.generation,
          query: {
            ...value,
            metadata_keys: [...new Set(pluginFields(plugins).map((f) => f.metadataKey))],
          },
        })
      : await api<Frame | EventPage>(
          `timelines/${remoteId}/query`,
          'POST',
          { ...value, revision: source.revision, plugins },
          signal,
        );
    if (!workspace || !workspace.changes.size) return result;
    if (value.kind === 'overview') {
      const view = new Viewport(
        Q.parse(String(value.lower)),
        Q.parse(String(value.upper)).sub(Q.parse(String(value.lower))),
      );
      return workspace.overlay(result as Frame, view, Q.parse(String(value.threshold)));
    }
    const page = result as EventPage,
      after = value.after as { time: string; id: string } | null;
    const events = page.events.filter((event) => !workspace.changes.has(event.id));
    for (const { after: event } of workspace.changes.values())
      if (
        event &&
        Q.parse(event.time).compare(Q.parse(String(value.lower))) >= 0 &&
        Q.parse(event.time).compare(Q.parse(String(value.upper))) <= 0 &&
        (!after ||
          Q.parse(event.time).compare(Q.parse(after.time)) > 0 ||
          (event.time === after.time && event.id > after.id)) &&
        (!page.next ||
          Q.parse(event.time).compare(Q.parse(page.next.time)) < 0 ||
          (event.time === page.next.time && event.id <= page.next.id))
      )
        events.push(event);
    events.sort(
      (a, b) =>
        Q.parse(a.time).compare(Q.parse(b.time)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const limit = Number(value.limit),
      last = events[Math.min(limit, events.length) - 1];
    return {
      events: events.slice(0, limit),
      next: events.length > limit ? { time: last.time, id: last.id } : page.next,
    };
  };
  const bounds = [
    source.first,
    source.last,
    index?.points.minKey()?.toString(),
    index?.points.maxKey()?.toString(),
  ]
    .filter(Boolean)
    .map((q) => Q.parse(q!))
    .sort((a, b) => a.compare(b));
  return {
    key: remoteId ?? 'local-sqlite',
    revision: remoteId ? source.revision : undefined,
    event_generation: remote?.event_generation,
    working: !!workspace?.dirtyCount || dirty,
    title: settings?.title ?? remote?.title ?? 'Local timeline',
    presentation: settings?.presentation ?? remote?.presentation,
    plugins: settings?.plugins ?? remote?.plugins,
    assets: settings?.assets ?? remote?.assets,
    first: bounds[0]?.toString(),
    last: bounds.at(-1)?.toString(),
    query,
  };
}
async function comparisonSources(ids: string[]): Promise<ComparisonSource[]> {
  if (ids.length > 8) throw new Error('At most eight timelines can be compared.');
  const sources: ComparisonSource[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const info = await api<RemoteTimeline>(`timelines/${id}`);
    if (info.comparison) {
      for (const source of await comparisonSources(info.comparison.sources)) {
        if (!seen.has(source.key)) {
          seen.add(source.key);
          sources.push(source);
        }
      }
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    sources.push({
      key: id,
      revision: info.revision,
      event_generation: info.event_generation,
      title: info.title,
      first: info.first,
      last: info.last,
      presentation: info.presentation ? validatePresentation(info.presentation) : undefined,
      plugins: info.plugins ? validateInstalledPlugins(info.plugins) : [],
      assets: info.assets ? validateAssets(info.assets) : {},
      query: (query, signal) =>
        api<Frame | EventPage>(
          `timelines/${id}/query`,
          'POST',
          { ...query, revision: info.revision, plugins: comparison?.plugins ?? info.plugins },
          signal,
        ),
    });
  }
  if (sources.length > 8) throw new Error('Choose at most eight distinct source timelines.');
  return sources;
}
function startComparison(sources: ComparisonSource[], presentation: TimePresentation) {
  cancelZoomAnimation();
  flushEventEdit();
  const view = new ComparisonView(sources, presentation);
  if (!comparisonBefore) comparisonBefore = { viewport: viewport.clone(), verticalOffset, uiScale };
  comparison?.dispose();
  comparisonController?.abort();
  windowController?.abort();
  clearTimeout(frameTimer);
  comparison = view;
  remoteCache.clear();
  sparseWorkspace()?.evict();
  liveTransitionPending = false;
  frameRequest++;
  selectionRequest++;
  clearGroupPage();
  selected = null;
  selectedGroup = null;
  selectedTime = null;
  el('event-form').hidden = true;
  el('group-details').hidden = true;
  el<HTMLDialogElement>('inspector').close();
  el<HTMLInputElement>('compare-combined').checked = false;
  el('comparison-tracks').replaceChildren();
  for (const track of view.tracks) {
    const row = document.createElement('form');
    row.className = 'comparison-track';
    const title = document.createElement('strong');
    title.textContent = track.source.title;
    const fields: HTMLInputElement[] = [];
    for (const name of ['Scale', 'Offset']) {
      const label = document.createElement('label');
      label.textContent = name + (name === 'Offset' ? ' (shared coordinates)' : '');
      const field = document.createElement('input');
      field.value = name === 'Scale' ? '1' : '0';
      field.setAttribute('aria-label', `${name} for ${track.source.title}`);
      fields.push(field);
      label.append(field);
      row.append(label);
    }
    const button = document.createElement('button');
    button.textContent = 'Apply alignment';
    button.type = 'submit';
    const error = document.createElement('span');
    error.setAttribute('role', 'status');
    row.prepend(title);
    row.append(button, error);
    row.onsubmit = (event) => {
      event.preventDefault();
      try {
        const scale = Q.parse(fields[0].value),
          offset = Q.parse(fields[1].value);
        comparisonController?.abort();
        clearTimeout(frameTimer);
        frameRequest++;
        view.transform(track.source.key, scale, offset);
        selectionRequest++;
        clearGroupPage();
        selected = null;
        selectedGroup = null;
        selectedTime = null;
        el('event-form').hidden = true;
        el('group-details').hidden = true;
        el<HTMLDialogElement>('inspector').close();
        error.textContent = '';
        frame = { groups: [], visitedNodes: 0 };
        requestRender();
      } catch (e) {
        error.textContent = e instanceof Error ? e.message : String(e);
      }
    };
    el('comparison-tracks').append(row);
  }
  text(
    'comparison-conflicts',
    view.conflicts.length
      ? `Different definitions share a plugin ID: ${view.conflicts.join(', ')}. The first selected timeline’s definition is used once; plugins enabled in any source are enabled in the view.`
      : 'Source plugins are combined once per plugin ID.',
  );
  setDashboard(false);
  heading();
  fit();
}
function stopComparison(restore = true) {
  if (!comparison) return;
  comparisonController?.abort();
  comparison.dispose();
  comparison = null;
  liveTransitionPending = false;
  frameRequest++;
  selectionRequest++;
  clearTimeout(frameTimer);
  clearGroupPage();
  selected = null;
  selectedGroup = null;
  selectedTime = null;
  el('comparison-tracks').replaceChildren();
  el('comparison-settings').hidden = true;
  el('event-form').hidden = true;
  el('group-details').hidden = true;
  el<HTMLDialogElement>('inspector').close();
  if (restore && comparisonBefore) {
    viewport = comparisonBefore.viewport;
    verticalOffset = comparisonBefore.verticalOffset;
    uiScale = comparisonBefore.uiScale;
  }
  comparisonBefore = null;
  if (restore) {
    heading();
    requestRender();
  }
}
function renderComparison(refresh: boolean) {
  const view = comparison!;
  const cached = view.cached(viewport, width(), pixels());
  frame = cached ?? (liveTransitionPending ? frame : view.visible(viewport, width(), pixels()));
  renderAxis();
  drawFrame();
  if (cached) {
    clearTimeout(frameTimer);
    ++frameRequest;
    comparisonController?.abort();
    el('loading-window').hidden = true;
    return;
  }
  if (!refresh) return;
  clearTimeout(frameTimer);
  comparisonController?.abort();
  const request = ++frameRequest;
  const snapshot = viewport.clone(),
    viewportWidth = width(),
    thresholdPixels = pixels();
  el('loading-window').hidden = false;
  frameTimer = setTimeout(() => {
    if (comparisonInFlight || windowInFlight) return;
    comparisonInFlight = true;
    const controller = (comparisonController = new AbortController());
    void view
      .frame(snapshot, viewportWidth, thresholdPixels, controller.signal)
      .then((result) => {
        if (comparison !== view || request !== frameRequest || controller.signal.aborted) return;
        animateLiveFrame = liveTransitionPending;
        liveTransitionPending = false;
        frame = result;
        renderAxis();
        drawFrame();
        el('loading-window').hidden = true;
      })
      .catch((error) => {
        if (comparison === view && request === frameRequest && !controller.signal.aborted) {
          el('loading-window').hidden = true;
          fail(error);
        }
      })
      .finally(() => {
        comparisonInFlight = false;
        if (request !== frameRequest && (comparison || remote || local)) requestRender();
      });
  }, 70);
}
function heading() {
  updateFollowControl();
  el('memory-notice').hidden =
    !memoryOnly() ||
    !!remote ||
    !!comparison ||
    !model ||
    document.body.dataset.dashboard === 'true';
  el('guest-fork-button').hidden =
    offlineHtml ||
    desktop ||
    !!session.user ||
    !remote ||
    remote.visibility !== 'public' ||
    !!comparison;
  void live?.update();
  el('comparison-settings').hidden = !comparison;
  for (const id of [
    'publish-button',
    'och-export',
    'export-button',
    'sqlite-save',
    'sqlite-save-as',
    'undo-button',
    'redo-button',
    'propose-button',
    'share-button',
  ])
    el(id).toggleAttribute('data-comparison-disabled', !!comparison);
  configureImages(
    comparison
      ? Object.assign({}, ...comparison.tracks.map((t) => t.source.assets ?? {}))
      : (model?.assets ?? remote?.assets),
    offlineHtml,
  );
  input('timeline-title').value = comparison
    ? remote?.comparison
      ? remote.title
      : 'Timeline comparison'
    : (model?.title ?? remote?.title ?? 'Loading timeline…');
  el<HTMLTextAreaElement>('timeline-description').value =
    model?.description ?? remote?.description ?? '';
  input('timeline-title').disabled = !editable();
  el<HTMLTextAreaElement>('timeline-description').disabled = !editable();
  const sparse = sparseWorkspace();
  const delta = sparse
    ? [...sparse.changes.values()].reduce(
        (n, c) => n + (c.after ? 1n : 0n) - (c.before ? 1n : 0n),
        0n,
      )
    : 0n;
  const count = sparse
    ? BigInt((local ?? remote)?.event_count ?? 0) + delta
    : (model?.points.entryCount ?? BigInt(remote?.event_count ?? 0));
  text(
    'event-count',
    comparison
      ? `${comparison.tracks.length} timelines · Read-only comparison`
      : `${count.toLocaleString()} events`,
  );
  text('owner-label', remote ? remote.owner : desktop ? 'Offline workspace' : 'Local workspace');
  const ownerLink = el<HTMLAnchorElement>('owner-label');
  if (remote) {
    ownerLink.href = (desktop ? serverOrigin : '') + '/users/' + encodeURIComponent(remote.owner);
    ownerLink.target = '_top';
  } else ownerLink.removeAttribute('href');
  text(
    'storage-badge',
    remote
      ? remote.visibility === 'public'
        ? 'Public timeline'
        : 'Private timeline'
      : desktop && sqlitePath
        ? 'Local file'
        : offlineHtml
          ? 'Offline HTML'
          : 'Browser draft',
  );
  text(
    'publish-button',
    workingProposal
      ? 'Update pull request'
      : remote
        ? (remote.canWrite ?? remote.canEdit)
          ? 'Save upstream'
          : 'Submit pull request'
        : 'Save to server',
  );
  el('pull-button').hidden = offlineHtml || !remote || !session.server || !!remote.comparison;
  el('propose-button').hidden =
    offlineHtml || !remote?.canPropose || !editable() || !!workingProposal;
  if (document.activeElement !== input('timeline-tags'))
    input('timeline-tags').value = (model?.tags ?? remote?.tags ?? []).join(', ');
  input('timeline-tags').disabled = !editable();
  el<HTMLButtonElement>('publish-button').disabled = saving || (!!remote && !editable());
  el('publish-button').hidden =
    offlineHtml || !session.server || !session.user || (!!remote && !remote.canEdit);
  el('och-import').hidden = offlineHtml || desktop || !session.fileExchange || !session.user;
  el('och-export').hidden = offlineHtml || desktop || !session.fileExchange || !session.user;
  el('share-button').hidden = !remote?.canShare;
  const star = el<HTMLButtonElement>('timeline-star-button');
  star.hidden = offlineHtml || platformEditor || !remote;
  star.disabled = !session.user || starring;
  star.title = session.user ? 'Toggle favorite' : 'Sign in to star timelines';
  star.setAttribute('aria-pressed', String(!!remote?.starred));
  star.textContent = `${remote?.starred ? '★ Starred' : '☆ Star'} · ${remote?.star_count ?? '0'}`;

  el('add-button').hidden = !editable();
  el('add-duration-button').hidden = !editable();
  el<HTMLButtonElement>('undo-button').disabled = !history.length;
  el<HTMLButtonElement>('redo-button').disabled = !future.length;
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
            ? 'Saved to file'
            : offlineHtml
              ? 'Export .ochx to save your work'
              : memoryOnly()
                ? 'Export .ochx to save your work'
                : 'A local draft, ready to explore',
  );
  text(
    'workspace-status',
    remote
      ? 'Server timeline'
      : desktop
        ? 'Offline workspace'
        : memoryOnly()
          ? 'In memory only'
          : 'Stored in this browser',
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
  if (!model || memoryOnly()) return;
  const db = await draftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(
        {
          document: model!.document(),
          sparse: sparseWorkspace() ? [...sparseWorkspace()!.changes.values()] : undefined,
          sparseDurations: sparseWorkspace()
            ? [...sparseWorkspace()!.durationChanges.values()]
            : undefined,
          remote: remote
            ? {
                id: remote.id,
                revision: remote.revision,
                head_revision_id: remote.head_revision_id,
              }
            : null,
          proposal: workingProposal
            ? { id: workingProposal.id, revision: workingProposal.revision }
            : null,
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
          remote: { id: string; revision: string; head_revision_id?: string } | null;
          sparse?: { before?: PointEvent; after?: PointEvent }[];
          sparseDurations?: { before?: Duration; after?: Duration }[];
          proposal?: { id: string; revision: string } | null;
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
        if (saved.sparse) {
          const index = new RemoteWorkspace(validateDocument(saved.document));
          for (const change of saved.sparse) {
            if (change.before) index.load(change.before);
            if (change.after) index.put(change.after);
            else if (change.before) index.delete(change.before.id);
          }
          for (const change of saved.sparseDurations ?? []) {
            if (change.before) index.loadDuration(change.before);
            if (change.after) index.putDuration(change.after);
            else if (change.before) index.deleteDuration(change.before.id);
          }
          model = index;
        }
        if (saved.proposal) {
          if (!/^[a-f0-9-]{36}$/i.test(saved.proposal.id))
            throw new Error('Invalid saved proposal.');
          const proposal = await api<Proposal>(
            `timelines/${saved.remote.id}/proposals/${saved.proposal.id}`,
          );
          if (!proposal.canUpdate || proposal.revision !== saved.proposal.revision)
            throw new Error('Proposal access or revision changed.');
          workingProposal = proposal;
          remote = {
            ...metadata,
            revision: proposal.base_revision,
            canWrite: false,
            canEdit: true,
            canPropose: true,
          };
        } else
          remote = {
            ...metadata,
            revision: saved.remote.revision,
            head_revision_id: saved.remote.head_revision_id ?? metadata.head_revision_id,
          };
        if (!location.hash) window.history.replaceState(null, '', `#timeline/${remote.id}`);
      } catch {
        remote = null;
        workingProposal = null;
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
  if (memoryOnly() || remote || desktop || !model) return;
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    if (memoryOnly() || remote || !model) return;
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
  cancelZoomAnimation();
  if (doc.comparison)
    throw new Error(
      'Saved comparisons need their server sources. Open the comparison on the server, or import an individual source timeline.',
    );
  stopComparison(false);
  setDashboard(false);
  workingProposal = null;
  documentRequest++;
  resetTimeSelection();
  el('guest-fork-status').hidden = true;
  el('guest-fork-original').hidden = true;
  selectionRequest++;
  editVersion++;
  remote = null;
  sqlitePath = null;
  sqliteSavedVersion = null;
  local = null;
  model = new TimelineIndex(doc);
  viewport = Viewport.fit(model.points.minKey(), model.points.maxKey());
  dirty = false;
  history = [];
  future = [];
  selected = null;
  selectedGroup = null;
  frameRequest++;
  el('group-details').hidden = true;
  el('event-form').hidden = true;
  el<HTMLDialogElement>('inspector').close();
  heading();
  requestRender();
  persistDraft();
  if (desktop && doc.events.length > 2048) {
    const workspace = documentRequest,
      version = editVersion;
    void window
      .__TAURI__!.core.invoke<NativeOpened>('desktop_stage', { document: doc })
      .then(async (result) => {
        if (workspace !== documentRequest || version !== editVersion) return;
        const header = validateDocument(result.document);
        await window.__TAURI__!.core.invoke('desktop_accept_open', { path: result.path });
        if (workspace !== documentRequest || version !== editVersion) return;
        model = new RemoteWorkspace(header);
        if (selected) sparseWorkspace()!.load(selected);
        local = { ...result, id: 'local-sqlite', revision: String(result.generation) };
        frameRequest++;
        remoteCache.clear();
        heading();
        requestRender();
      })
      .catch(fail);
  }
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
      if (platformEditor) {
        if (mayReplace()) window.parent.location.href = `/timelines/${t.id}`;
        return;
      }
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
  stopComparison(false);
  setDashboard(false);
  workingProposal = null;
  const request = ++documentRequest;
  resetTimeSelection();
  selectionRequest++;
  model = null;
  remote = null;
  sqlitePath = null;
  sqliteSavedVersion = null;
  local = null;
  frame = { groups: [], visitedNodes: 0 };
  selected = null;
  selectedGroup = null;
  history = [];
  future = [];
  frameRequest++;
  heading();
  requestRender();
  el('event-form').hidden = true;
  el('group-details').hidden = true;
  el<HTMLDialogElement>('inspector').close();
  const info = await api<RemoteTimeline>(`timelines/${id}`);
  if (request !== documentRequest) return;
  remote = info;
  if (info.presentation) info.presentation = validatePresentation(info.presentation);
  if (info.plugins) info.plugins = validateInstalledPlugins(info.plugins);
  if (info.assets) info.assets = validateAssets(info.assets);
  if (info.tags) info.tags = validateTags(info.tags);
  if (info.comparison) {
    const sources = await comparisonSources(info.comparison.sources);
    if (request !== documentRequest) return;
    startComparison(sources, info.presentation ?? sources[0].presentation ?? DEFAULT_PRESENTATION);
    comparison!.combined = info.comparison.combined;
    el<HTMLInputElement>('compare-combined').checked = info.comparison.combined;
    dirty = false;
    heading();
    requestRender();
    return;
  }
  if (info.canEdit) {
    model = new RemoteWorkspace({
      format: 'openchronology',
      version: 1,
      title: info.title,
      description: info.description,
      presentation: info.presentation,
      plugins: info.plugins,
      tags: info.tags,
      assets: info.assets,
      events: [],
    });
  }
  viewport = Viewport.fit(
    (sparseWorkspace() ? undefined : model?.points.minKey()) ??
      (info.first ? Q.parse(info.first) : undefined),
    (sparseWorkspace() ? undefined : model?.points.maxKey()) ??
      (info.last ? Q.parse(info.last) : undefined),
  );
  dirty = false;
  heading();
  requestRender();
}
let browserForkBusy = false;
async function forkInBrowser(id: string) {
  if (browserForkBusy || offlineHtml || desktop || !mayReplace()) return;
  browserForkBusy = true;
  const request = documentRequest;
  text('guest-fork-status', 'Copying this public timeline into memory…');
  el('guest-fork-status').hidden = false;
  const original = el<HTMLAnchorElement>('guest-fork-original');
  original.hidden = true;
  original.href = platformEditor ? `/timelines/${id}` : `#timeline/${id}`;
  original.target = platformEditor ? '_top' : '_self';
  el<HTMLButtonElement>('guest-fork-button').disabled = true;
  try {
    const result = await api<{ document: TimelineDocument }>(
      `timelines/${id}/browser-fork`,
      'POST',
      {},
    );
    if (documentRequest !== request) return;
    if (
      !Array.isArray(result.document?.events) ||
      result.document.events.length > 5000 ||
      new TextEncoder().encode(JSON.stringify(result)).length > 4 * 1024 * 1024
    )
      throw new Error('This copy exceeds the browser limits. No timeline was loaded.');
    const document = validateDocument(result.document);
    if (browserEntryCount(document) > BROWSER_COPY_MAX_EVENTS)
      throw new Error(
        'This timeline exceeds the 5,000-entry browser limit, including stack entries. No copy was loaded.',
      );
    historyReplace();
    loadDocument(document);
    dirty = true;
    heading();
    text(
      'guest-fork-status',
      'Browser fork ready. Edits affect only this in-memory copy. Export .ochx to keep it.',
    );
    el('guest-fork-status').hidden = false;
  } catch (error) {
    if (documentRequest === request) {
      text('guest-fork-status', (error as Error).message);
      el('guest-fork-status').hidden = false;
      original.hidden = false;
    }
  } finally {
    browserForkBusy = false;
    el<HTMLButtonElement>('guest-fork-button').disabled = false;
  }
}
el('guest-fork-button').onclick = () => {
  if (remote) void forkInBrowser(remote.id);
};
window.addEventListener('beforeunload', (event) => {
  if (memoryOnly() && !remote && !comparison && (dirty || pendingEventEdit)) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('message', (event) => {
  if (
    platformEditor &&
    event.origin === location.origin &&
    event.source === window.parent &&
    event.data?.type === 'openchronology:guest-fork' &&
    typeof event.data.id === 'string' &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(event.data.id)
  )
    void forkInBrowser(event.data.id);
});
async function route(force = false) {
  if (offlineHtml) return;
  const guestCopy = /^#guest-fork\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.exec(
    location.hash,
  );
  if (guestCopy) {
    await forkInBrowser(guestCopy[1]);
    return;
  }
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
  const compared = /^#compare\/([a-f0-9,-]+)$/i.exec(location.hash);
  if (compared) {
    if (comparison) return;
    const ids = [...new Set(compared[1].split(','))];
    if (
      ids.length < 2 ||
      ids.length > 8 ||
      ids.some((id) => !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))
    )
      throw new Error('Select two to eight valid timelines.');
    setDashboard(false);
    const request = documentRequest;
    const sources = await comparisonSources(ids);
    if (request === documentRequest) await comparisons.start(sources);
    return;
  }
  const match = /^#timeline\/([a-f0-9-]+)$/i.exec(location.hash);
  if (match) {
    if (remote?.id === match[1] && !force) {
      setDashboard(false);
      requestRender();
      return;
    }
    if (!mayReplace()) {
      window.history.replaceState(null, '', remote ? `#timeline/${remote.id}` : location.pathname);
      return;
    }
    await openRemote(match[1]);
  } else if (hasDashboard() && !desktop && !platformEditor) {
    if (dirty && model) {
      setDashboard(false);
      return;
    }
    setDashboard(true);
    await community.dashboard();
  }
}
function installedPlugins(): InstalledPlugin[] {
  if (comparison) return comparison.plugins;
  return model ? (model.plugins ?? []) : (remote?.plugins ?? []);
}
/** Plugins that render moments; duration-only plugins apply through durationPlugins. */
function activePlugins(): InstalledPlugin[] {
  return momentPlugins(installedPlugins());
}
let detachRichNotes: (() => void) | undefined;
function refreshPluginFields() {
  detachRichNotes?.();
  detachRichNotes = undefined;
  if (pluginRichText(activePlugins()))
    detachRichNotes = attachRichText(el<HTMLTextAreaElement>('event-description'), editable());
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
        if (offlineHtml) {
          event.preventDefault();
          toast(
            'The offline view makes no network requests. The original URL remains in the image field.',
          );
          return;
        }
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
  if (!editable()) return;
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
      ? 'Saved official and custom plugins run locally. You can create or import definitions here; the online library is unavailable. External icons need embedded copies.'
      : 'Applied from top to bottom. Later plugins override matching fields and marker effects. Removing a plugin keeps all moment metadata.',
  );
  el('plugins-add').hidden = !editable();
  el('plugins-create').hidden = !editable();
  if (!installed.length) {
    const note = document.createElement('p');
    note.textContent = 'No plugins installed on this timeline.';
    list.append(note);
  }
  installed.forEach((entry, index) => {
    const item = document.createElement('section');
    item.className = 'installed-plugin';
    const name = document.createElement('strong');
    const official = isOfficialPlugin(entry.manifest);
    name.textContent = `${index + 1}. ${entry.manifest.name} · v${entry.manifest.version} · ${official ? 'Official' : 'Custom'}`;
    const description = document.createElement('p');
    description.textContent = entry.manifest.description;
    const toggle = document.createElement('label');
    toggle.className = 'plugin-enable';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = entry.enabled;
    checkbox.disabled = !editable();
    checkbox.setAttribute('aria-label', `Enable ${entry.manifest.name}`);
    checkbox.onchange = () =>
      changePlugins(
        installedPlugins().map((p) =>
          p.manifest.id === entry.manifest.id ? { ...p, enabled: checkbox.checked } : p,
        ),
      );
    toggle.append(checkbox, document.createTextNode('Enabled'));
    const actions = document.createElement('div');
    actions.className = 'plugin-actions';
    const action = (label: string, disabled: boolean, run: () => void) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.disabled = disabled || !editable();
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
    action('Edit / export definition', false, () => openPluginAuthor(entry.manifest));
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
      sort: input('plugin-sort').value,
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
      name.textContent = `${manifest.name} · v${manifest.version} · ${isOfficialPlugin(manifest) ? 'Official' : 'Custom'}`;
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
      const review = document.createElement('button');
      review.type = 'button';
      review.textContent = 'Review definition';
      review.disabled = !editable();
      review.onclick = () => {
        if (doc === documentRequest) openPluginAuthor(manifest);
      };
      const actions = document.createElement('div');
      actions.className = 'plugin-actions';
      actions.append(review, button);
      item.append(name, description, capability, actions);
      el('plugin-library-results').append(item);
    }
  } catch (error) {
    if (request !== pluginSearchRequest || doc !== documentRequest) return;
    text('plugin-library-status', 'Plugin library unavailable.');
    text('plugin-library-error', error instanceof Error ? error.message : String(error));
  }
}
let pluginAuthorDocument = documentRequest;
let pluginAuthorRequest = 0;
function setAuthorDefinition(manifest: PluginManifest) {
  const { source, ...definition } = manifest;
  el<HTMLTextAreaElement>('plugin-definition').value = JSON.stringify(definition, null, 2);
  el<HTMLTextAreaElement>('plugin-source').value = source ?? '';
}
function openPluginAuthor(manifest: PluginManifest = validatePluginManifest(PLUGIN_EXAMPLE)) {
  if (!editable()) return;
  pluginAuthorDocument = documentRequest;
  pluginAuthorRequest++;
  setAuthorDefinition(manifest);
  text('plugin-author-status', '');
  text('plugin-author-error', '');
  el<HTMLButtonElement>('plugin-author-publish').disabled =
    !session.user || !session.server || offlineHtml;
  el<HTMLDialogElement>('plugin-author-dialog').showModal();
}
function authoredPlugin() {
  if (!editable() || pluginAuthorDocument !== documentRequest)
    throw new Error('Reopen the plugin editor for the current timeline.');
  const definition = JSON.parse(el<HTMLTextAreaElement>('plugin-definition').value);
  const source = el<HTMLTextAreaElement>('plugin-source').value;
  return validatePluginManifest({ ...definition, ...(source.trim() ? { source } : {}) });
}
function installAuthoredPlugin(manifest: PluginManifest, replaceId = manifest.id) {
  const plugins = installedPlugins().filter(
    (p) => p.manifest.id !== replaceId && p.manifest.id !== manifest.id,
  );
  // Preserve order when editing an installed definition.
  const index = installedPlugins().findIndex((p) => p.manifest.id === replaceId);
  plugins.splice(index < 0 ? plugins.length : index, 0, { manifest, enabled: true });
  changePlugins(plugins);
}
function authorError(error: unknown) {
  text('plugin-author-error', error instanceof Error ? error.message : String(error));
}
el('plugins-create').onclick = () => openPluginAuthor();
el('plugin-author-install').onclick = () => {
  try {
    const manifest = authoredPlugin();
    installAuthoredPlugin(manifest);
    text('plugin-author-error', '');
    text(
      'plugin-author-status',
      manifest.name + ' is active. Save the timeline to retain the definition.',
    );
  } catch (error) {
    authorError(error);
  }
};
el('plugin-author-export').onclick = () => {
  try {
    const manifest = authoredPlugin();
    download(
      new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }),
      manifest.id,
      '.plugin.json',
    );
    text('plugin-author-error', '');
  } catch (error) {
    authorError(error);
  }
};
el('plugin-author-import').onclick = () => input('plugin-definition-file').click();
input('plugin-definition-file').onchange = async () => {
  const file = input('plugin-definition-file').files?.[0];
  input('plugin-definition-file').value = '';
  if (!file) return;
  const request = pluginAuthorRequest,
    doc = pluginAuthorDocument;
  try {
    if (file.size > 65536) throw new Error('Plugin file exceeds 64 KiB.');
    const source = await file.text();
    if (doc !== documentRequest || request !== pluginAuthorRequest) return;
    const manifest = validatePluginManifest(JSON.parse(source));
    setAuthorDefinition(manifest);
    text('plugin-author-error', '');
    text('plugin-author-status', 'Definition imported. Review it, then install or publish.');
  } catch (error) {
    authorError(error);
  }
};
el('plugin-author-publish').onclick = () => {
  const button = el<HTMLButtonElement>('plugin-author-publish');
  button.disabled = true;
  const request = pluginAuthorRequest,
    doc = pluginAuthorDocument;
  void (async () => {
    const before = authoredPlugin();
    const manifest = validatePluginManifest(await api('plugins/publish', 'POST', before));
    if (doc !== documentRequest || request !== pluginAuthorRequest) return;
    installAuthoredPlugin(manifest, before.id);
    setAuthorDefinition(manifest);
    text('plugin-author-error', '');
    text(
      'plugin-author-status',
      'Published publicly as ' +
        manifest.id +
        ' v' +
        manifest.version +
        '. Increment version for future releases.',
    );
  })()
    .catch((error) => {
      if (request === pluginAuthorRequest) authorError(error);
    })
    .finally(() => {
      if (request === pluginAuthorRequest)
        button.disabled = !session.user || !session.server || offlineHtml;
    });
};
el('plugins-button').onclick = () => {
  showInstalledPlugins();
  el<HTMLDialogElement>('plugins-dialog').showModal();
};
el('plugin-library-custom').onclick = () => openPluginAuthor();
input('plugin-sort').onchange = () => {
  clearTimeout(pluginSearchTimer);
  pluginPage = 1;
  void searchPlugins();
};
el('plugins-add').onclick = () => {
  if (!editable()) return;
  pluginPage = 1;
  input('plugin-search').value = '';
  input('plugin-search').closest('label')!.hidden = offlineHtml;
  input('plugin-sort').closest('label')!.hidden = offlineHtml;
  el('plugin-previous').hidden = offlineHtml;
  el('plugin-next').hidden = offlineHtml;
  if (offlineHtml)
    text('plugin-library-status', 'Offline: choose Custom to create or import a definition.');
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

function showMomentDetails(title: string) {
  hoverPreview.hide();
  summaryExpansion.hide();
  text('moment-heading', title);
  el<HTMLDialogElement>('inspector').showModal();
}
function eventForm(event?: PointEvent, time?: Q) {
  if (comparison && !event) return;
  flushEventEdit();
  if (event && !comparison) {
    sparseWorkspace()?.load(event);
    event = model?.byId.get(event.id) ?? event;
  }
  pendingEventEdit = false;
  eventEditHistory = null;
  selectionRequest++;
  clearGroupPage();
  selected = event ?? null;
  if (!event) selectedGroup = null;
  el('event-form').hidden = false;
  el('group-details').hidden = true;
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
  refreshDurations();
  for (const id of ['event-title', 'event-time', 'event-description', 'event-metadata'])
    (el(id) as HTMLInputElement).disabled = !editable();
  text(
    'event-edit-status',
    comparison
      ? `Read-only comparison · ${event?.metadata.comparisonSource ?? ''} · original coordinate ${event?.metadata.originalTime ?? ''}`
      : editable()
        ? 'Edits apply to the timeline automatically.'
        : 'Read-only moment.',
  );
  el('event-delete').hidden = !event || !editable();
  text('event-error', '');
  showMomentDetails(event ? 'Moment details' : 'New moment');
}
async function groupPage(
  group: FrameGroup,
  after: { time: string; id: string } | null = null,
  limit = GROUP_PAGE_SIZE,
  signal?: AbortSignal,
) {
  if (comparison) {
    const page = await comparison.events(group, after, limit, signal);
    return group.id && BigInt(group.count) === 1n && !after
      ? { events: page.events.filter((event) => event.id === group.id), next: null }
      : page;
  }
  const workspace = sparseWorkspace();
  if (!workspace && model && group.id && BigInt(group.count) === 1n && !after) {
    const point = model.byId.get(group.id);
    return { events: point ? [point] : [], next: null };
  }
  const edited = group.id ? workspace?.changes.get(group.id)?.after : undefined;
  if (edited && !after) return { events: [edited], next: null };
  let events: PointEvent[],
    next: { time: string; id: string } | null = null;
  if (model && !workspace) {
    events = [];
    scan: for (const [, bucket] of model.points.range(
      Q.parse(after?.time ?? group.first),
      Q.parse(group.last),
      { includeUpper: true },
    )) {
      let start = 0;
      // Coincident buckets are sorted by ID. Seek rather than walking earlier pages.
      if (after && bucket[0]?.time === after.time) {
        let end = bucket.length;
        while (start < end) {
          const middle = Math.floor((start + end) / 2);
          if (bucket[middle].id <= after.id) start = middle + 1;
          else end = middle;
        }
      }
      for (let i = start; i < bucket.length; i++) {
        events.push(bucket[i]);
        if (events.length > limit) break scan;
      }
    }
    if (events.length > limit) {
      events = events.slice(0, limit);
      const last = events.at(-1)!;
      next = { time: last.time, id: last.id };
    }
  } else {
    const result = await timelineQuery<{
      events: PointEvent[];
      next: { time: string; id: string } | null;
    }>(
      {
        kind: 'events',
        ...(group.id && BigInt(group.count) === 1n && !after ? { id: group.id } : {}),
        lower: group.first,
        upper: group.last,
        limit: limit,
        after,
        revision: (local ?? remote)!.revision,
      },
      signal,
    );
    events = result.events.filter((e) => !workspace?.changes.has(e.id));
    next = result.next;
    for (const { after: edited } of workspace?.changes.values() ?? []) {
      if (
        edited &&
        Q.parse(edited.time).compare(Q.parse(group.first)) >= 0 &&
        Q.parse(edited.time).compare(Q.parse(group.last)) <= 0 &&
        (!after ||
          Q.parse(edited.time).compare(Q.parse(after.time)) > 0 ||
          (edited.time === after.time && edited.id > after.id)) &&
        (!result.next ||
          Q.parse(edited.time).compare(Q.parse(result.next.time)) < 0 ||
          (edited.time === result.next.time && edited.id <= result.next.id))
      )
        events.push(edited);
    }
    events.sort(
      (a, b) =>
        Q.parse(a.time).compare(Q.parse(b.time)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    if (events.length > limit) {
      events = events.slice(0, limit);
      const last = events.at(-1)!;
      next = { time: last.time, id: last.id };
    }
  }
  if (group.id && BigInt(group.count) === 1n && !after)
    return { events: events.filter((event) => event.id === group.id), next: null };
  return { events, next };
}
async function selectGroup(group: FrameGroup) {
  hoverPreview.hide();
  summaryExpansion.hide();
  flushEventEdit();
  clearTimeout(eventEditTimer);
  pendingEventEdit = false;
  el('event-form').hidden = true;
  clearGroupPage();
  el('group-details').hidden = true;
  const request = ++selectionRequest;
  selectedGroup = group;
  selected = null;
  selectedTime = Q.parse(group.first).add(Q.parse(group.last)).div(Q.from(2n));
  requestRender();
  let page: Awaited<ReturnType<typeof groupPage>>;
  try {
    page = await groupPage(group);
  } catch (error) {
    if (request === selectionRequest) throw error;
    return;
  }
  if (request !== selectionRequest) return;
  if (BigInt(group.count) === 1n && page.events[0]) {
    eventForm(page.events[0]);
    return;
  }
  el('event-form').hidden = true;
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
  showMomentDetails('Group details');
}
function showGroupPage(events: PointEvent[], next: { time: string; id: string } | null) {
  groupCursor = next;
  el('group-more').hidden = !next;
  el<HTMLButtonElement>('group-more').disabled = false;
  el('group-previous').hidden = groupPageIndex === 0;
  el<HTMLButtonElement>('group-previous').disabled = false;
  text('group-page-status', `Page ${groupPageIndex + 1} · ${events.length} moments`);
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
  follow.navigation();
  cancelZoomAnimation();
  if (group.distinct === 1) return;
  viewport = Viewport.fit(Q.parse(group.first), Q.parse(group.last));
  requestRender();
}
let followScope = '';
function currentFollowScope() {
  if (!platformEditor || desktop || offlineHtml || !session.server) return '';
  if (comparison)
    return comparison.tracks.every(
      (t) => !t.source.working && /^[a-f0-9-]{36}$/i.test(t.source.key),
    )
      ? 'compare:' +
          comparison.tracks
            .map((t) => t.source.key)
            .sort()
            .join(',')
      : '';
  return remote ? remote.id : '';
}
const follow = followLatest<Viewport>({
  blocked: () =>
    !currentFollowScope() ||
    document.hidden ||
    dirty ||
    saving ||
    pendingEventEdit ||
    pointers.size > 0 ||
    !!document.querySelector('dialog[open]'),
  cancel: () => {
    if (followingAnimation) cancelZoomAnimation();
  },
  error: fail,
  async load(signal) {
    const tracks = comparison?.tracks;
    const times = tracks
      ? (
          await Promise.all(
            tracks.map(async (track) => {
              const result = await api<{ times: string[] }>(
                `timelines/${track.source.key}/recent?direction=${track.scale.compare(Q.zero) < 0 ? 'first' : 'last'}`,
                'GET',
                undefined,
                signal,
              );
              return result.times.map((time) => Q.parse(time).mul(track.scale).add(track.offset));
            }),
          )
        ).flat()
      : remote
        ? (
            await api<{ times: string[] }>(
              `timelines/${remote.id}/recent`,
              'GET',
              undefined,
              signal,
            )
          ).times.map((time) => Q.parse(time))
        : [];
    const recent = times
      .sort((a, b) => b.compare(a))
      .filter((time, index, ordered) => !index || !time.equals(ordered[index - 1]))
      .slice(0, 8);
    return recent.length ? Viewport.fit(recent.at(-1)!, recent[0]) : null;
  },
  apply: (view) => animateView(view.rasterize(width()), true),
});
function updateFollowControl() {
  const scope = currentFollowScope();
  el('follow-latest-control').hidden = !scope;
  if (scope !== followScope) {
    follow.reset();
    followScope = scope;
    input('follow-latest').checked = false;
    if (scope) {
      try {
        input('follow-latest').checked = sessionStorage.getItem('och:follow:' + scope) === 'true';
      } catch {}
      follow.setEnabled(input('follow-latest').checked);
    }
  }
}
stage.addEventListener('wheel', () => follow.navigation(), { capture: true, passive: true });
stage.addEventListener('pointerup', () => follow.navigation());
document.addEventListener('visibilitychange', () => follow.wake());
document.addEventListener('pointerdown', (event) => {
  if (
    (event.target as HTMLElement).closest(
      '.view-controls, .window-bounds, #comparison-settings, .timeline-footer, #timeline-actions, dialog',
    )
  )
    follow.navigation();
});
el('comparison-settings').addEventListener('input', () => follow.navigation());
window.addEventListener('resize', () => follow.navigation());
input('follow-latest').onchange = () => {
  if (!followScope) return;
  follow.setEnabled(input('follow-latest').checked);
  try {
    sessionStorage.setItem('och:follow:' + followScope, String(input('follow-latest').checked));
  } catch {}
};
let zoomAnimation: number | undefined, zoomTarget: Viewport | undefined;
function cancelZoomAnimation() {
  if (zoomAnimation !== undefined) cancelAnimationFrame(zoomAnimation);
  zoomAnimation = undefined;
  zoomTarget = undefined;
  followingAnimation = false;
  delete stage.dataset.zooming;
}
function zoom(factor: Q) {
  follow.navigation();
  const destination = (zoomTarget ?? viewport)
    .zoom(width() / 2, width(), factor)
    .rasterize(width());
  animateView(destination);
}
let followingAnimation = false;
function animateView(destination: Viewport, automatic = false) {
  cancelZoomAnimation();
  followingAnimation = automatic;
  if (reducedMotion.matches) {
    navigate(destination, false);
    return;
  }
  hoverPreview.hide();
  summaryExpansion.hide();
  closeTimelineMenu();
  const from = viewport.clone(),
    started = performance.now(),
    doc = documentRequest;
  zoomTarget = destination;
  stage.dataset.zooming = 'true';
  const tick = (now: number) => {
    if (doc !== documentRequest) {
      cancelZoomAnimation();
      return;
    }
    const progress = Math.min(1, Math.max(0, (now - started) / 220));
    if (progress === 1) {
      cancelZoomAnimation();
      navigate(destination, false);
      return;
    }
    const amount = Q.from(BigInt(Math.round((1 - (1 - progress) ** 3) * 1_000_000)), 1_000_000n);
    viewport = new Viewport(
      from.left.add(destination.left.sub(from.left).mul(amount)),
      from.span.add(destination.span.sub(from.span).mul(amount)),
    ).rasterize(width());
    renderAxis();
    if (model && !sparseWorkspace()) frame = model.frame(viewport, width(), pixels());
    requestRender(false); // Reuse confirmed server data; fetch the final window once.
    zoomAnimation = requestAnimationFrame(tick);
  };
  zoomAnimation = requestAnimationFrame(tick);
}
function navigate(view: Viewport, manual = true) {
  if (manual) follow.navigation();
  cancelZoomAnimation();
  closeTimelineMenu();
  viewport = view.rasterize(width());
  requestRender();
}
function fit() {
  follow.navigation();
  cancelZoomAnimation();
  if (comparison) {
    viewport = comparison.fit();
    uiScale = comparison.combined
      ? 1
      : Math.min(1, Math.max(0.25, (stage.clientHeight - 48) / (comparison.tracks.length * 340)));
    verticalOffset = 0;
    requestRender();
    return;
  }
  uiScale = 1;
  verticalOffset = 0;
  const source = local ?? remote;
  let first = source?.first ? Q.parse(source.first) : undefined,
    last = source?.last ? Q.parse(source.last) : undefined;
  const localFirst = model?.points.minKey(),
    localLast = model?.points.maxKey();
  if (localFirst && (!first || localFirst.compare(first) < 0)) first = localFirst;
  if (localLast && (!last || localLast.compare(last) > 0)) last = localLast;
  viewport = Viewport.fit(first, last);
  requestRender();
}

function closeTimelineMenu() {
  menuGeneration++;
  const menu = el('timeline-menu');
  if (menu.contains(document.activeElement)) stage.focus({ preventScroll: true });
  if (menu.matches(':popover-open')) menu.hidePopover();
  menu.hidden = true;
}
function resetTimeSelection() {
  liveTransitionPending = false;
  animateLiveFrame = false;
  for (const node of retiringNodes) node.remove();
  retiringNodes.clear();
  el('live-notice').hidden = true;
  hoverPreview.hide();
  summaryExpansion.hide();
  remoteCache.clear();
  windowController?.abort();
  clearTimeout(frameTimer);
  uiScale = 1;
  clearTimeout(eventEditTimer);
  pendingEventEdit = false;
  eventEditHistory = null;
  verticalOffset = 0;
  pluginSearchRequest++;
  clearTimeout(pluginSearchTimer);
  el<HTMLDialogElement>('plugins-dialog').close();
  el<HTMLDialogElement>('plugin-library-dialog').close();
  el('plugin-event-fields').replaceChildren();
  clearGroupPage();
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
  hoverPreview.hide();
  summaryExpansion.hide();
  closeTimelineMenu();
  const menu = el('timeline-menu');
  const details = el<HTMLDialogElement>('inspector');
  (details.open ? details : document.body).append(menu);
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
  add('Fit all', () => {
    fit();
    details.close();
  });
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
  menu.popover = 'manual';
  menu.showPopover();
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - bounds.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - bounds.height - 4))}px`;
  menu.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
}
function openStageMenu(target: HTMLElement, x: number, y: number) {
  const branch = target.closest<HTMLElement>('.stack-marker');
  if (branch?.dataset.parentEvent) {
    const point = model?.byId.get(branch.dataset.parentEvent);
    if (point)
      showTimelineMenu(x, y, Q.parse(point.time), point, undefined, branch.dataset.stackEntry);
    else {
      showTimelineMenu(x, y, Q.parse(branch.dataset.time ?? '0/1'));
      const group = frame.groups.find((g) => g.id === branch.dataset.parentEvent);
      const generation = menuGeneration,
        doc = documentRequest;
      if (group && editable())
        void groupPage(group)
          .then((page) => {
            if (generation === menuGeneration && doc === documentRequest && page.events[0])
              showTimelineMenu(
                x,
                y,
                Q.parse(page.events[0].time),
                page.events[0],
                undefined,
                branch.dataset.stackEntry,
              );
          })
          .catch(fail);
    }
    return;
  }
  const group = markerGroups.get(target.closest<HTMLElement>('.event-marker')!);
  const time = viewport.at(Math.max(0, Math.min(width(), localX(x))), width());
  if (!group) {
    selectedTime = time;
    requestRender();
  }
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
/**
 * A two-finger gesture does one thing, chosen when the second finger lands: fingers side by side
 * (up to 60° from horizontal) zoom time; fingers stacked vertically resize the contents.
 * Coordinates are CSS pixels of the current layout, so the choice follows the screen orientation.
 */
const RESIZE_PINCH_SLOPE = Math.tan((60 * Math.PI) / 180);
let gesture: {
    view: Viewport;
    mid: number;
    midY: number;
    vertical: number;
    distance: number;
    scale: number;
    mode: 'pan' | 'zoom' | 'resize';
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
    // Euclidean separation: drifting between axes during a pinch does not change its factor.
    distance: p.length < 2 ? 1 : Math.max(1, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)),
    dx: p.length < 2 ? 0 : Math.abs(p[0].x - p[1].x),
    dy: p.length < 2 ? 0 : Math.abs(p[0].y - p[1].y),
  };
}
function resetGesture() {
  if (!pointers.size) {
    gesture = null;
    return;
  }
  const { dx, dy, ...start } = metrics();
  gesture = {
    view: viewport.clone(),
    vertical: verticalOffset,
    scale: uiScale,
    ...start,
    mode: pointers.size < 2 ? 'pan' : dy > dx * RESIZE_PINCH_SLOPE ? 'resize' : 'zoom',
  };
}
stage.addEventListener(
  'pointerdown',
  (event) => {
    // Interactive overlays stop propagation; a fresh mouse press still ends suppression
    // left by a previous drag or touch gesture before their click reaches capture handlers.
    if (event.pointerType === 'mouse' && event.button === 0) {
      moved = false;
      suppressClickUntil = 0;
    }
  },
  true,
);
stage.addEventListener('pointerdown', (event) => {
  follow.navigation();
  cancelZoomAnimation();
  hoverPreview.hide();
  summaryExpansion.hide();
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
  follow.navigation();
  stage.classList.add('dragging');
  if (gesture.mode === 'resize' && gesture.distance >= 20)
    uiScale = Math.max(0.2, Math.min(3, (gesture.scale * now.distance) / gesture.distance));
  const anchor = gesture.midY - stage.getBoundingClientRect().top;
  verticalOffset =
    anchor - ((anchor - gesture.vertical) * uiScale) / gesture.scale + now.midY - gesture.midY;
  const next =
    gesture.mode === 'pan'
      ? gesture.view.pan(now.mid - gesture.mid, width())
      : gesture.view.pinch(
          gesture.mid,
          now.mid,
          width(),
          gesture.mode === 'zoom' && gesture.distance >= 20
            ? screenQ(gesture.distance).div(screenQ(now.distance))
            : Q.from(1n),
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
    hoverPreview.hide();
    summaryExpansion.hide();
    clearTimeout(longPressTimer);
    closeTimelineMenu();
    if (event.ctrlKey) {
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1);
      scaleContents(
        uiScale * Math.exp(-Math.max(-1000, Math.min(1000, delta)) * 0.002),
        Math.max(
          0,
          Math.min(stage.clientHeight, event.clientY - stage.getBoundingClientRect().top),
        ),
      );
    } else if (event.altKey) {
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

el('timeline-help-button').onclick = () =>
  el<HTMLDialogElement>('timeline-help-dialog').showModal();
el('zoom-in').onclick = () => zoom(Q.from(4n, 5n));
el('zoom-out').onclick = () => zoom(Q.from(5n, 4n));
el('fit-button').onclick = fit;
el('center-vertical').onclick = () => {
  follow.navigation();
  verticalOffset = 192 * (1 - uiScale);
  requestRender(false);
};
el('empty-fit').onclick = fit;
el('add-button').onclick = () => eventForm(undefined, selectedTime ?? undefined);
el('clear-selection').onclick = () => {
  flushEventEdit();
  pendingEventEdit = false;
  selectedTime = null;
  selected = null;
  selectedGroup = null;
  selectionRequest++;
  clearGroupPage();
  el<HTMLDialogElement>('inspector').close();
  requestRender();
};
el('close-inspector').onclick = () => {
  flushEventEdit();
  el<HTMLDialogElement>('inspector').close();
};
el<HTMLDialogElement>('inspector').addEventListener('close', () => {
  if (el<HTMLDialogElement>('inspector').open) return;
  closeTimelineMenu();
  flushEventEdit();
  pendingEventEdit = false;
  selected = null;
  selectedGroup = null;
  selectionRequest++;
  clearGroupPage();
  el('event-form').hidden = true;
  el('group-details').hidden = true;
  requestRender();
});
input('density').oninput = () => {
  text('density-value', `${pixels()} px`);
  requestRender();
};
el('apply-bounds').onclick = () => {
  follow.navigation();
  cancelZoomAnimation();
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

/** Gregorian time fields open a calendar dialog; its text field keeps typed entry available. */
interface TimeFieldSpec {
  heading: string;
  /** False leaves the field as plain text, e.g. for read-only timelines. */
  editable: () => boolean;
  read: () => Q;
  /** Starting point when the field's text does not parse. */
  fallback: () => Q;
  /** Throws to keep the dialog open with an explanation. */
  apply: (time: Q) => void;
  /** Bounds are rewritten by rendering only when unfocused. */
  blurAfter?: boolean;
}
let timeDraft: { field: HTMLInputElement; spec: TimeFieldSpec; time: Q; text: string } | null =
  null;
function calendarPresentation() {
  const presentation = model?.presentation ?? remote?.presentation;
  return presentation?.mode === 'gregorian' && !comparison ? presentation : undefined;
}
function parseInputTime(value: string) {
  return timelinePresenter().parse(value, viewContext('input'));
}
function boundTime(id: 'left-bound' | 'right-bound') {
  const value = input(id).value,
    displayed = displayedBounds.get(id);
  return displayed?.text === value ? displayed.time : parseInputTime(value);
}
function showTimeDraft(time: Q, refreshPicker: boolean) {
  const presentation = calendarPresentation();
  if (!timeDraft || !presentation) return;
  timeDraft.time = time;
  if (refreshPicker)
    calendarPicker(el('datetime-picker'), presentation, time, viewContext('input'), false, (next) =>
      showTimeDraft(next, false),
    );
  if (!refreshPicker || document.activeElement !== input('datetime-text')) {
    timeDraft.text = presented(time, 'input');
    input('datetime-text').value = timeDraft.text;
  }
  text('datetime-error', '');
}
function openTimeDialog(field: HTMLInputElement, spec: TimeFieldSpec) {
  if (!calendarPresentation() || field.disabled || field.readOnly || !spec.editable()) return false;
  let time: Q;
  try {
    time = spec.read();
  } catch {
    // Unparseable text starts from the nearest meaningful time instead of blocking the picker.
    time = spec.fallback();
  }
  timeDraft = { field, spec, time, text: '' };
  text('datetime-heading', spec.heading);
  showTimeDraft(time, true);
  el<HTMLDialogElement>('datetime-dialog').showModal();
  return true;
}
function attachTimeDialog(field: HTMLInputElement, spec: TimeFieldSpec) {
  field.setAttribute('aria-haspopup', 'dialog');
  field.addEventListener('click', () => {
    if (openTimeDialog(field, spec)) field.blur();
  });
  field.addEventListener('keydown', (event) => {
    // Alt+Down is the conventional key for opening a field's picker; plain typing still edits.
    if (event.altKey && event.key === 'ArrowDown' && openTimeDialog(field, spec))
      event.preventDefault();
  });
}
const viewMiddle = () => viewport.left.add(viewport.span.div(Q.from(2n)));
attachTimeDialog(input('event-time'), {
  heading: 'Moment date and time',
  editable: () => editable(),
  read: readEventTime,
  fallback: () => selectedTime ?? viewMiddle(),
  apply: (time) => {
    setEventTime(time);
    selectedTime = time;
    text('event-error', '');
    queueEventEdit();
  },
});
for (const id of ['left-bound', 'right-bound'] as const)
  attachTimeDialog(input(id), {
    heading: id === 'left-bound' ? 'Left bound date and time' : 'Right bound date and time',
    editable: () => true,
    read: () => boundTime(id),
    fallback: () => (id === 'left-bound' ? viewport.left : viewport.right),
    blurAfter: true,
    apply: (time) => {
      const left = id === 'left-bound' ? time : viewport.left,
        right = id === 'right-bound' ? time : viewport.right;
      if (right.compare(left) <= 0)
        throw new Error('The left bound must be earlier than the right bound.');
      follow.navigation();
      cancelZoomAnimation();
      viewport = new Viewport(left, right.sub(left));
    },
  });
input('datetime-text').oninput = () => {
  if (!timeDraft) return;
  try {
    const value = input('datetime-text').value;
    if (value === timeDraft.text) return;
    const time = parseInputTime(value);
    timeDraft.text = value;
    showTimeDraft(time, true);
  } catch {
    // Incomplete text stays editable; applying reports the parser error.
  }
};
el<HTMLFormElement>('datetime-form').onsubmit = (event) => {
  event.preventDefault();
  const draft = timeDraft;
  if (!draft) return;
  try {
    const value = input('datetime-text').value;
    draft.spec.apply(value === draft.text ? draft.time : parseInputTime(value));
    el<HTMLDialogElement>('datetime-dialog').close();
    requestRender();
  } catch (error) {
    text('datetime-error', error instanceof Error ? error.message : String(error));
  }
};
el<HTMLDialogElement>('datetime-dialog').addEventListener('close', () => {
  // The close event is queued; a dialog reopened for another field keeps its new draft.
  if (el<HTMLDialogElement>('datetime-dialog').open) return;
  const draft = timeDraft;
  timeDraft = null;
  // Focus returns to the field, and focused bounds are not rewritten; show the applied bound.
  if (draft?.spec.blurAfter) {
    draft.field.blur();
    requestRender();
  }
});
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
  const settings =
    comparison?.presentation ??
    (model ? model.presentation : remote?.presentation) ??
    DEFAULT_PRESENTATION;
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
  el<HTMLButtonElement>('presentation-save').disabled = !comparison && !editable();
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
  if (!comparison && !editable()) return;
  try {
    if (comparison) {
      comparison.presentation = displaySettings();
      el<HTMLDialogElement>('presentation-dialog').close();
      requestRender();
      return;
    }
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
  follow.navigation();
  cancelZoomAnimation();
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
  if (selectedGroup) {
    zoomGroup(selectedGroup);
    el<HTMLDialogElement>('inspector').close();
  }
};
async function turnGroupPage(direction: -1 | 1) {
  const group = selectedGroup;
  const cursor = direction === 1 ? groupCursor : groupStarts[groupPageIndex - 1];
  if (!group || (direction === 1 ? !cursor : groupPageIndex === 0)) return;
  if (el<HTMLButtonElement>('group-more').disabled) return;
  const selection = selectionRequest,
    request = ++groupPageRequest;
  el<HTMLButtonElement>('group-more').disabled = true;
  el<HTMLButtonElement>('group-previous').disabled = true;
  el('group-events').replaceChildren();
  text('group-page-status', 'Loading page…');
  try {
    const page = await groupPage(group, cursor);
    if (selection !== selectionRequest || request !== groupPageRequest) return;
    groupPageIndex += direction;
    groupStarts[groupPageIndex] = cursor;
    showGroupPage(page.events, page.next);
  } catch (error) {
    if (selection !== selectionRequest || request !== groupPageRequest) return;
    text('group-page-status', 'Could not load this page. Try again.');
    el<HTMLButtonElement>('group-more').disabled = false;
    el<HTMLButtonElement>('group-previous').disabled = false;
    fail(error);
  }
}
el('group-more').onclick = () => {
  void turnGroupPage(1);
};
el('group-previous').onclick = () => {
  void turnGroupPage(-1);
};
el<HTMLFormElement>('event-form').onsubmit = (event) => {
  event.preventDefault();
  flushEventEdit();
};
el('event-form').addEventListener('input', () => {
  queueEventEdit();
});
el('event-form').addEventListener('change', () => {
  queueEventEdit();
});
el('event-form').addEventListener('focusout', () => {
  flushEventEdit();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushEventEdit();
});
function requestDelete(point: PointEvent) {
  flushEventEdit();
  point = model?.byId.get(point.id) ?? point;
  if (!editable()) return;
  sparseWorkspace()?.load(point);
  if (!model!.byId.has(point.id)) return;
  closeTimelineMenu();
  pendingDelete = { id: point.id, document: documentRequest };
  text('delete-heading', 'Delete event?');
  text('delete-confirm', 'Delete event');
  text(
    'delete-description',
    `Delete “${point.metadata.title || 'Untitled event'}” at ${presented(Q.parse(point.time), 'input')}? Durations that follow it keep its current time as a fixed endpoint. You can undo this deletion.`,
  );
  el<HTMLDialogElement>('delete-dialog').showModal();
  el('delete-cancel').focus();
}
el('event-delete').onclick = () => {
  if (selected) requestDelete(selected);
};
el<HTMLDialogElement>('delete-dialog').addEventListener('close', () => {
  // The close event is queued; a delete requested after it was scheduled must survive it.
  if (!el<HTMLDialogElement>('delete-dialog').open) pendingDelete = null;
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
  record({ before: point });
  model!.delete(point.id);
  if (selected?.id === point.id) {
    selected = null;
    el('event-form').hidden = true;
  }
  selectedGroup = null;
  el('group-details').hidden = true;
  el<HTMLDialogElement>('delete-dialog').close();
  el<HTMLDialogElement>('inspector').close();
  changed();
};
/** Records a new edit; any redoable edits branch away and are discarded. */
function record(edit: HistoryEntry) {
  history.push(edit);
  future = [];
}
function clearHistory() {
  history = [];
  future = [];
  eventEditHistory = null;
}
function applyEdit(redo: boolean) {
  flushEventEdit();
  clearTimeout(eventEditTimer);
  pendingEventEdit = false;
  eventEditHistory = null;
  flushDurationEdit();
  if (openDuration) openDuration.edit = null;
  const edit = (redo ? future : history).pop();
  if (!edit || !model) return;
  if ('duration' in edit) {
    const [from, to] = redo ? [edit.before, edit.after] : [edit.after, edit.before];
    if (to) model.putDuration(to);
    else if (from) model.deleteDuration(from.id);
    el<HTMLDialogElement>('duration-dialog').close();
  } else {
    const [from, to] = redo ? [edit.before, edit.after] : [edit.after, edit.before];
    if (from) model.delete(from.id);
    if (to) model.put(to);
  }
  (redo ? history : future).push(edit);
  selected = null;
  selectedGroup = null;
  el('event-form').hidden = true;
  el<HTMLDialogElement>('inspector').close();
  changed();
}
el('undo-button').onclick = () => applyEdit(false);
el('redo-button').onclick = () => applyEdit(true);
document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const key = event.key.toLowerCase(),
    redo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey);
  if (key !== 'z' && !redo) return;
  // Text fields keep their native undo; open modal dialogs other than the inspector own the keyboard.
  const target = event.target as HTMLElement;
  if (target.closest('input, textarea, select, [contenteditable]')) return;
  if (document.querySelector('dialog[open]:not(#inspector)')) return;
  const button = el<HTMLButtonElement>(redo ? 'redo-button' : 'undo-button');
  if (button.disabled || button.hidden || button.hasAttribute('data-comparison-disabled')) return;
  event.preventDefault();
  button.click();
});
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
el('timeline-star-button').onclick = async () => {
  if (!remote || !session.user || starring) return;
  const id = remote.id;
  starring = true;
  heading();
  try {
    const result = await api<{ starred: boolean; star_count: string }>(
      `timelines/${id}/star`,
      'POST',
      { starred: !remote.starred },
    );
    if (remote?.id === id) Object.assign(remote, result);
  } catch (error) {
    fail(error);
  } finally {
    starring = false;
    heading();
  }
};
el('new-button').onclick = () => {
  if (!mayReplace()) return;
  historyReplace();
  sqlitePath = null;
  loadDocument({
    format: 'openchronology',
    version: 1,
    title: 'Untitled timeline',
    description: 'A short description for your timeline',
    events: [],
  });
};
function historyReplace() {
  follow.reset();
  followScope = '';
  documentRequest++;
  if (!offlineHtml) window.history.replaceState(null, '', location.pathname);
  if (platformEditor) window.parent.postMessage({ type: 'openchronology:local' }, location.origin);
}
el('dashboard-demo').onclick = () => {
  if (!mayReplace()) return;
  historyReplace();
  sqlitePath = null;
  setDashboard(false);
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
  const exportingDocument = documentRequest,
    exportingVersion = editVersion;
  void (async () => {
    let doc = await completeDocument();
    doc = await embedImages(doc, offlineHtml);
    download(
      new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' }),
      doc.title,
      '.ochx',
    );
    if (
      memoryOnly() &&
      !remote &&
      documentRequest === exportingDocument &&
      editVersion === exportingVersion
    ) {
      dirty = false;
      heading();
      text('save-status', 'Exported as .ochx — new edits remain in memory');
    }
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
      await exportSqlite(
        'files/export',
        await embedImages(await completeDocument(), offlineHtml),
        session.csrf,
      ),
      model.title,
      '.och',
    );
  })().catch(fail);
};
el('account-button').onclick = () => {
  if (platformEditor) {
    if (
      memoryOnly() &&
      !remote &&
      (dirty || pendingEventEdit) &&
      !confirm(
        'Export your in-memory timeline as .ochx before signing in. Continuing will leave this draft. Continue?',
      )
    )
      return;
    void retainForSignIn()
      .then(() => {
        const returnTo = remote ? `/timelines/${remote.id}` : '/editor';
        window.parent.location.href = session.user
          ? '/account'
          : `/login?returnTo=${encodeURIComponent(returnTo)}`;
      })
      .catch(fail);
    return;
  }
  void (async () => {
    if (!offlineHtml) await refreshSession();
    if (!session.server) {
      toast('Server sharing is unavailable. Local timelines remain available.');
      return;
    }
    el('password-fields').hidden = desktop || !!session.user;
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
  if (document.body.dataset.dashboard === 'true') void community.dashboard().catch(fail);
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
for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog'))
  dismissOnBackdrop(dialog);
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-close]'))
  button.onclick = () => el<HTMLDialogElement>(button.dataset.close!).close();
el('account-register').onclick = () => {
  void retainForSignIn()
    .then(() => location.assign('/login?mode=register'))
    .catch(fail);
};
el<HTMLFormElement>('account-form').onsubmit = (event) => {
  event.preventDefault();
  const action = (event.submitter as HTMLButtonElement)?.value ?? 'login';
  text('account-error', '');
  void api<{ user: Session['user']; csrf: string; challenge?: string }>(`auth/${action}`, 'POST', {
    username: input('account-name').value,
    password: input('account-password').value,
  })
    .then(async (result) => {
      if (result.challenge) {
        await retainForSignIn();
        location.assign('/login');
        return;
      }
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
  // The desktop can only sign in through a reachable server connection.
  const disconnected = desktop && !session.server;
  el<HTMLButtonElement>('account-button').disabled = disconnected;
  el('account-button').title = disconnected ? 'Connect to a server to sign in' : '';
  el('server-button').hidden = !desktop;
}
el('logout-button').onclick = () => {
  if (comparison) stopComparison();
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
      void refreshSession()
        .then(() => {
          if (session.server) {
            setDashboard(true);
            return community.dashboard();
          }
        })
        .catch(fail);
    })
    .catch(fail);
};
const community = createCommunityUI({
  api,
  user: () => session.user,
  server: () => session.server,
  guestCopies: () => !desktop && !offlineHtml,
  timeline: () => remote,
  document: async () => {
    flushEventEdit();
    if (!model) throw new Error('Load an editable timeline first.');
    proposalSubmissionVersion = editVersion;
    proposalSubmissionDocument = documentRequest;
    return embedImages(await completeDocument(), offlineHtml);
  },
  compare: (ids) => {
    const request = documentRequest;
    void comparisonSources(ids)
      .then((sources) => {
        if (request === documentRequest) return comparisons.start(sources);
      })
      .catch(fail);
  },
  working: () => workingProposal,
  edit: (proposal) => {
    if (!mayReplace()) return;
    const upstream = remote!;
    loadDocument(validateDocument(proposal.document));
    remote = {
      ...upstream,
      revision: proposal.base_revision,
      canEdit: proposal.canUpdate,
      canPropose: proposal.canUpdate,
      canWrite: false,
    };
    workingProposal = proposal;
    heading();
    requestRender();
  },
  published: (proposal) => {
    if (proposalSubmissionDocument !== documentRequest) return;
    workingProposal = proposal;
    dirty = proposalSubmissionVersion !== editVersion;
    heading();
    toast('Pull request saved. Upstream is unchanged.');
  },
  reload: async () => {
    if (remote && mayReplace()) await openRemote(remote.id);
  },
});
if (platformEditor)
  el('pull-button').onclick = () => {
    if (remote && mayReplace()) window.parent.location.href = `/timelines/${remote.id}/pulls`;
  };
el('dashboard-home').onclick = (event) => {
  if (offlineHtml) {
    event.preventDefault();
    return;
  }
  if (!mayReplace()) {
    event.preventDefault();
    return;
  }
  if (platformEditor) {
    event.preventDefault();
    window.parent.location.href = '/';
    return;
  }
  if (hasDashboard()) {
    event.preventDefault();
    historyReplace();
    setDashboard(true);
    void community.dashboard().catch(fail);
  }
};
el('dashboard-new').onclick = () => el('new-button').click();
input('timeline-tags').onchange = () => {
  if (!editable()) return;
  try {
    model!.tags = validateTags(
      input('timeline-tags')
        .value.split(',')
        .filter((t) => t.trim()),
    );
    text('timeline-tags-error', '');
    changed();
  } catch (error) {
    text('timeline-tags-error', error instanceof Error ? error.message : String(error));
  }
};
el('delete-timeline').onclick = () => {
  if (!remote?.canShare) return;
  const id = remote.id,
    workspace = documentRequest;
  pendingDelete = {
    id: '',
    document: documentRequest,
    remove: () => {
      void api('timelines/' + id, 'DELETE')
        .then(() => {
          if (workspace !== documentRequest) {
            void directory().catch(fail);
            toast('Timeline deleted.');
            return;
          }
          el<HTMLDialogElement>('sharing-dialog').close();
          dirty = false;
          historyReplace();
          loadDocument({
            format: 'openchronology',
            version: 1,
            title: 'Untitled timeline',
            description: 'A short description for your timeline',
            events: [],
          });
          setDashboard(true);
          void directory().catch(fail);
          void community.dashboard().catch(fail);
        })
        .catch((error) => text('sharing-error', error.message));
    },
  };
  text(
    'delete-description',
    'Permanently delete this timeline, all proposed branches and comments? Export a copy first if you want to retain the data.',
  );
  el<HTMLDialogElement>('delete-dialog').showModal();
};
el('publish-button').onclick = () => {
  flushEventEdit();
  if (remote && (workingProposal || !(remote.canWrite ?? remote.canEdit))) {
    community.propose();
    return;
  }
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
      const index = sparseWorkspace();
      const sent = index?.beginSave();
      const patch = remote ? index?.patch() : undefined;
      const materialized = remote ? undefined : completeDocument();
      const sparseDocument =
        index && remote ? await embedImages(index.document(), false) : undefined;
      if (patch && sparseDocument)
        patch.settings.assets = { ...index!.assets, ...sparseDocument.assets };
      const document =
        index && remote
          ? undefined
          : await embedImages(await (materialized ?? completeDocument()), false);
      const result =
        index && remote
          ? await api<RemoteTimeline>(`timelines/${remote.id}/changes`, 'PUT', {
              revision: remote.revision,
              ...patch,
            })
          : remote
            ? await api<RemoteTimeline>(`timelines/${remote.id}`, 'PUT', {
                revision: remote.revision,
                document,
              })
            : await api<RemoteTimeline>('timelines', 'POST', document);
      if (workspace !== documentRequest) return;
      remote = result;
      local = null;
      if (document) model!.assets = document.assets;
      if (index && sent) {
        index.accepted(sent, selected?.id);
        if (patch) index.assets = patch.settings.assets;
        if (version === editVersion) {
          clearHistory();
        }
      }
      remoteCache.clear();
      requestRender();
      dirty = version !== editVersion;
      if (!index && !dirty && !workingProposal) {
        const local = model!.document();
        model = new RemoteWorkspace(local);
        if (selected) sparseWorkspace()!.load(selected);
        clearHistory();
      }
      window.history.replaceState(null, '', `#timeline/${result.id}`);
      heading();
      await directory();
      toast('Timeline saved. It is ' + result.visibility + '.');
      if (platformEditor && !dirty)
        window.parent.postMessage(
          { type: 'openchronology:published', id: result.id },
          location.origin,
        );
    } finally {
      sparseWorkspace()?.endSave(selected?.id);
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
  if (platformEditor) {
    if (mayReplace()) window.parent.location.href = `/timelines/${remote.id}/settings`;
    return;
  }
  el<HTMLSelectElement>('visibility').value = remote.visibility;
  text('sharing-link', `${serverOrigin}/timelines/${remote.id}`);
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
    if (remote && (!model || sparseWorkspace())) {
      try {
        const snapshot = await api<{ document: TimelineDocument }>(
          `timelines/${remote.id}/document`,
        );
        model = new TimelineIndex(
          validateDocument(sparseWorkspace()?.apply(snapshot.document) ?? snapshot.document),
        );
      } catch {
        model = new TimelineIndex({
          format: 'openchronology',
          version: 1,
          title: 'Untitled timeline',
          description: 'A short description for your timeline',
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
  const adoptNative = async (
    result: NativeOpened | null,
    workspace: number,
    savedFile: boolean,
  ) => {
    if (!result || workspace !== documentRequest) return;
    const document = validateDocument(result.document);
    await window.__TAURI__!.core.invoke<void>('desktop_accept_open', { path: result.path });
    if (workspace !== documentRequest) return;
    historyReplace();
    loadDocument(document);
    model = new RemoteWorkspace(document);
    local = { ...result, id: 'local-sqlite', revision: String(result.generation) };
    viewport = Viewport.fit(
      result.first ? Q.parse(result.first) : undefined,
      result.last ? Q.parse(result.last) : undefined,
    );
    sqlitePath = savedFile ? result.path : null;
    sqliteSavedVersion = savedFile ? editVersion : null;
    heading();
    requestRender();
  };
  el('sqlite-open').onclick = () => {
    if (!mayReplace()) return;
    const workspace = documentRequest;
    void window
      .__TAURI__!.core.invoke<NativeOpened | null>('desktop_open')
      .then((result) => adoptNative(result, workspace, true))
      .catch(fail);
  };
  el('import-button').onclick = () => {
    if (!mayReplace()) return;
    const workspace = documentRequest;
    void window
      .__TAURI__!.core.invoke<NativeOpened | null>('desktop_import')
      .then((result) => adoptNative(result, workspace, false))
      .catch(fail);
  };
  for (const [id, saveAs] of [
    ['sqlite-save', false],
    ['sqlite-save-as', true],
  ] as const)
    el(id).onclick = () => {
      flushEventEdit();
      if (saving) return;
      const version = editVersion,
        workspace = documentRequest,
        index = local ? sparseWorkspace() : null;
      const sent = index?.beginSave();
      saving = true;
      heading();
      void (async () => {
        const patch = index?.patch();
        const document = patch ? undefined : await completeDocument();
        if (workspace !== documentRequest) return null;
        const nativePatch = patch
          ? { ...patch, settings: { ...patch.settings, events: [] as PointEvent[] } }
          : undefined;
        if (nativePatch)
          nativePatch.settings.assets = {
            ...index!.assets,
            ...(await embedImages(index!.document(), false)).assets,
          };
        return window.__TAURI__!.core.invoke<NativeOpened | null>('desktop_save', {
          document: document ? await embedImages(document, false) : null,
          patch: nativePatch ?? null,
          generation: local?.generation ?? null,
          saveAs: saveAs || !sqlitePath,
          expectedPath: sqlitePath,
        });
      })()
        .then((result) => {
          if (!result || workspace !== documentRequest) return;
          sqlitePath = result.path;
          sqliteSavedVersion = version;
          if (model) model.assets = { ...result.document.assets, ...model.assets };
          if (!remote) {
            local = { ...result, id: 'local-sqlite', revision: String(result.generation) };
            if (index && sent) index.accepted(sent, selected?.id);
            else if (version === editVersion) {
              model = new RemoteWorkspace(validateDocument(result.document));
              if (selected) sparseWorkspace()!.load(selected);
            }
            // A full-model save with concurrent edits remains fully loaded until its next save.
            if (!index && version !== editVersion) local = null;
            dirty = version !== editVersion;
            if (!dirty) {
              clearHistory();
            }
          }
          remoteCache.clear();
          frameRequest++;
          requestRender();
          heading();
          toast('Timeline saved.');
        })
        .catch(fail)
        .finally(() => {
          if (workspace === documentRequest) index?.endSave(selected?.id);
          saving = false;
          heading();
          requestRender();
        });
    };
}
const timelineResizeObserver = new ResizeObserver(() => requestRender());
timelineResizeObserver.observe(stage);
// Also refresh when the viewport changes or the browser restores a page from its cache.
// A rotation or resize mid-gesture changes the layout under the fingers; restart from here.
window.addEventListener('resize', () => {
  if (pointers.size) resetGesture();
  requestRender();
});
window.addEventListener('pageshow', () => requestRender());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) requestRender();
});
if (!offlineHtml)
  window.addEventListener('hashchange', () => {
    void route().catch(fail);
  });
if (offlineHtml) {
  document.body.dataset.offline = 'true';
  el('new-button').classList.remove('workspace-new');
  document.querySelector('.file-actions')!.prepend(el('new-button'));
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
    'pull-button',
    'propose-button',
  ])
    el(id).hidden = true;
  document.querySelector('#empty-window')!.firstChild!.textContent =
    'Import a timeline or add your first event.';
}
if (!offlineHtml)
  live = liveUpdates({
    sources: () =>
      comparison
        ? comparison.tracks
            .filter((t) => t.source.revision && /^[a-f0-9-]{36}$/i.test(t.source.key))
            .map((t) => ({ id: t.source.key, revision: t.source.revision! }))
        : remote
          ? [{ id: remote.id, revision: remote.revision }]
          : [],
    available: () => !offlineHtml && !!session.server,
    native: () => desktop || !platformEditor,
    check: (id) => api<{ id: string; revision: string }>(`timelines/${id}/revision`),
    async refresh(id, revision) {
      const request = documentRequest,
        view = comparison;
      if (view) {
        const sources = await comparisonSources([id]);
        if (view !== comparison || request !== documentRequest) return;
        comparisonController?.abort();
        frameRequest++;
        selectionRequest++;
        clearGroupPage();
        selected = null;
        selectedGroup = null;
        el('event-form').hidden = true;
        el('group-details').hidden = true;
        el<HTMLDialogElement>('inspector').close();
        const added =
          sources[0].event_generation !== undefined &&
          BigInt(sources[0].event_generation) >
            BigInt(view.tracks.find((t) => t.source.key === id)?.source.event_generation ?? '0');
        view.replaceSource(sources[0]);
        if (added) follow.addition();
        configureImages(
          Object.assign({}, ...view.tracks.map((t) => t.source.assets ?? {})),
          offlineHtml,
        );
        liveTransitionPending = true;
        requestRender();
        return;
      }
      if (!remote || remote.id !== id || remote.revision === revision) return;
      if (dirty || saving) {
        el('live-notice').hidden = false;
        return;
      }
      const info = await api<RemoteTimeline>(`timelines/${id}`);
      if (request !== documentRequest || comparison || remote?.id !== id || dirty || saving) return;
      if (info.presentation) info.presentation = validatePresentation(info.presentation);
      if (info.plugins) info.plugins = validateInstalledPlugins(info.plugins);
      if (info.assets) info.assets = validateAssets(info.assets);
      const added =
        info.event_generation !== undefined &&
        BigInt(info.event_generation) > BigInt(remote.event_generation ?? '0');
      remote = info;
      if (added) follow.addition();
      model = info.canEdit
        ? new RemoteWorkspace({
            format: 'openchronology',
            version: 1,
            title: info.title,
            description: info.description,
            presentation: info.presentation,
            plugins: info.plugins,
            tags: info.tags,
            assets: info.assets,
            events: [],
          })
        : null;
      history = [];
      future = [];
      windowController?.abort();
      remoteCache.clear();
      frameRequest++;
      selectionRequest++;
      clearGroupPage();
      selected = null;
      selectedGroup = null;
      el('event-form').hidden = true;
      el('group-details').hidden = true;
      el<HTMLDialogElement>('inspector').close();
      el('live-notice').hidden = true;
      liveTransitionPending = true;
      heading();
      requestRender();
    },
    denied(id) {
      const affected = comparison
        ? comparison.tracks.some((t) => !id || t.source.key === id)
        : remote && (!id || remote.id === id);
      if (!affected) return;
      if (comparison) stopComparison(false);
      if (remote && (!id || remote.id === id)) {
        remote = null;
        if (!dirty) model = null;
        remoteCache.clear();
      }
      liveTransitionPending = false;
      resetTimeSelection();
      frame = { groups: [], visitedNodes: 0 };
      heading();
      requestRender();
      toast('Timeline access changed. Sign in again or choose another timeline.');
    },
  });
el('live-reload').onclick = () => {
  if (remote && mayReplace()) void openRemote(remote.id).catch(fail);
};
window.addEventListener('pagehide', (event) => (event.persisted ? live?.pause() : live?.close()));
window.addEventListener('pageshow', () => {
  void live?.update();
});
const comparisons = comparisonUI({
  available: () => !offlineHtml && !!session.server,
  current: currentComparisonSource,
  sources: comparisonSources,
  search: (search, page) =>
    api('timelines/search', 'POST', { search, page, limit: 12, scope: 'visible' }),
  start: startComparison,
  generation: () => documentRequest,
  fail,
});
el('compare-exit').onclick = () => {
  if (remote?.comparison) {
    if (platformEditor) window.parent.location.href = '/';
    else {
      remote = null;
      stopComparison(false);
      setDashboard(true);
      heading();
    }
    return;
  }
  stopComparison();
  if (location.hash.startsWith('#compare/') && platformEditor) {
    window.parent.location.href = '/';
    return;
  }
  if (location.hash.startsWith('#compare/'))
    window.history.replaceState(null, '', location.pathname + location.search);
};
el<HTMLInputElement>('compare-combined').onchange = () => {
  if (!comparison) return;
  comparisonController?.abort();
  frameRequest++;
  selectionRequest++;
  clearGroupPage();
  selected = null;
  selectedGroup = null;
  selectedTime = null;
  el('event-form').hidden = true;
  el('group-details').hidden = true;
  el<HTMLDialogElement>('inspector').close();
  comparison.combined = input('compare-combined').checked;
  uiScale = comparison.combined
    ? 1
    : Math.min(1, Math.max(0.25, (stage.clientHeight - 48) / (comparison.tracks.length * 340)));
  verticalOffset = 0;
  requestRender();
};
input('compare-file').onchange = async () => {
  const file = input('compare-file').files?.[0];
  const request = documentRequest;
  if (!file) return;
  try {
    if (file.size > 32 * 1024 * 1024) throw new Error('Timeline files must be at most 32 MiB.');
    const raw = await file.text();
    if (request !== documentRequest || !el<HTMLDialogElement>('compare-dialog').open) return;
    const doc = validateDocument(JSON.parse(raw)),
      index = new TimelineIndex(doc);
    comparisons.addFile({
      key: 'file-' + eventId(),
      title: doc.title,
      index,
      plugins: doc.plugins,
      presentation: doc.presentation,
      assets: doc.assets,
      first: index.points.minKey()?.toString(),
      last: index.points.maxKey()?.toString(),
    });
  } catch (error) {
    fail(error);
  } finally {
    input('compare-file').value = '';
  }
};
if (!desktop && !offlineHtml && !platformEditor) setDashboard(true);
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
      await refreshSession();
      if (session.user) {
        try {
          const draft = await loadDraft();
          if (draft && !location.hash && !freshTimeline && !sampleTimeline) {
            loadDocument(validateDocument(draft));
            setDashboard(!platformEditor);
          }
          await restoreAfterSignIn();
        } catch {
          /* Authenticated browser storage can be unavailable. */
        }
        await directory();
      }
      if (!hasDashboard()) setDashboard(false);
    } catch {
      setDashboard(false);
    }
  }
  await route();
})().catch(fail);

/** Durations anchored to the open moment, with a shortcut to start a new one there. */
function refreshDurations() {
  const host = el('event-durations');
  host.replaceChildren();
  const heading = document.createElement('h3');
  heading.textContent = 'Durations';
  host.append(heading);
  const moment = selected;
  if (moment) {
    const anchored = new Map<string, Duration>();
    for (const band of frame.durations ?? [])
      if (!band.sourceKey && [anchorOf(band.start), anchorOf(band.end)].includes(moment.id))
        anchored.set(band.id, band);
    for (const duration of model?.anchoredTo(moment.id) ?? []) anchored.set(duration.id, duration);
    for (const duration of anchored.values()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'duration-link';
      button.textContent = durationLabel(duration);
      button.onclick = () => void openDurationById(duration.id).catch(fail);
      host.append(button);
    }
    if (!anchored.size) {
      const none = document.createElement('p');
      none.className = 'field-hint';
      none.textContent = 'No visible durations start or end at this moment.';
      host.append(none);
    }
  }
  if (!editable() || !moment) return;
  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = 'New duration starting here';
  add.onclick = () => {
    flushEventEdit();
    const start = Q.parse(moment.time);
    createDuration({ moment: moment.id }, start.add(viewport.span.div(Q.from(8n))).toString());
  };
  host.append(add);
}
function durationLabel(duration: Duration) {
  const band =
    frame.durations?.find((b) => b.id === duration.id) ??
    (model ? resolveDuration(duration, (id) => model!.momentTime(id)) : null);
  return (
    (duration.metadata.title || 'Unnamed duration') +
    (band ? ` · ${presented(Q.parse(band.first))} → ${presented(Q.parse(band.last))}` : '')
  );
}

type DurationEdit = { duration: true; before?: Duration; after?: Duration };
let openDuration: { duration: Duration; readOnly: boolean; edit: DurationEdit | null } | null =
  null;
let durationTimer: ReturnType<typeof setTimeout> | undefined;
const durationEditable = () => editable() && !!openDuration && !openDuration.readOnly;
function createDuration(start: DurationEndpoint, end: DurationEndpoint) {
  if (!editable() || !model) return;
  const duration: Duration = { id: eventId(), start, end, metadata: { title: '' } };
  record({ duration: true, after: duration });
  model.putDuration(duration);
  changed();
  showDuration(duration, false, { duration: true, after: duration });
}
/** Full metadata is local for complete timelines and fetched for indexed ones. */
async function openDurationById(id: string) {
  const band = frame.durations?.find((b) => b.id === id);
  if (band?.sourceKey) return showDuration(band, true);
  let duration = model?.durations.get(id);
  if (!duration && sparseWorkspace()) {
    const result = await timelineQuery<{ duration: Duration | null }>({
      kind: 'duration',
      id,
      revision: (local ?? remote)!.revision,
    });
    if (!result.duration) throw new Error('This duration is no longer available.');
    sparseWorkspace()!.loadDuration(result.duration);
    duration = sparseWorkspace()!.durations.get(id);
  }
  if (!duration) throw new Error('This duration is no longer available.');
  showDuration(duration, !editable());
}
function showDuration(duration: Duration, readOnly: boolean, edit: DurationEdit | null = null) {
  flushDurationEdit();
  openDuration = { duration, readOnly, edit };
  text('duration-heading', edit && !edit.before ? 'New duration' : 'Duration');
  input('duration-title').value = duration.metadata.title ?? '';
  el<HTMLTextAreaElement>('duration-description').value = duration.metadata.description ?? '';
  const rest = { ...duration.metadata };
  delete rest.title;
  delete rest.description;
  el<HTMLTextAreaElement>('duration-metadata').value = JSON.stringify(rest, null, 2);
  for (const id of ['duration-title', 'duration-description', 'duration-metadata'])
    (el(id) as HTMLInputElement).disabled = readOnly;
  el('duration-delete').hidden = readOnly;
  text('duration-error', '');
  renderDurationEndpoints();
  renderDurationPluginFields();
  const dialog = el<HTMLDialogElement>('duration-dialog');
  if (!dialog.open) dialog.showModal();
}
/** Reads the form into a duration; throws with a user-facing message when incomplete. */
function durationFromForm(): Duration {
  const current = openDuration!.duration;
  const metadata = JSON.parse(el<HTMLTextAreaElement>('duration-metadata').value);
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    throw new Error('Additional metadata must be a JSON object.');
  return validateDuration(
    {
      ...current,
      metadata: {
        ...metadata,
        title: input('duration-title').value,
        description: el<HTMLTextAreaElement>('duration-description').value,
      },
    },
    parseTime,
  );
}
function applyDuration(next: Duration) {
  if (!openDuration || !model || !durationEditable()) return;
  if (JSON.stringify(next) === JSON.stringify(openDuration.duration)) return;
  // One dialog session is one undo step.
  if (!openDuration.edit) {
    openDuration.edit = { duration: true, before: openDuration.duration, after: next };
    record(openDuration.edit);
  } else openDuration.edit.after = next;
  model.putDuration(next);
  openDuration.duration = next;
  text('duration-error', '');
  changed();
}
function flushDurationEdit() {
  clearTimeout(durationTimer);
  durationTimer = undefined;
  if (!openDuration || !durationEditable()) return;
  try {
    applyDuration(durationFromForm());
  } catch (error) {
    text('duration-error', error instanceof Error ? error.message : String(error));
  }
}
function queueDurationEdit() {
  clearTimeout(durationTimer);
  durationTimer = setTimeout(flushDurationEdit, 250);
}
el('duration-form').addEventListener('input', (event) => {
  if (!(event.target as HTMLElement).closest('#duration-endpoints')) queueDurationEdit();
});
el('duration-form').addEventListener('submit', (event) => event.preventDefault());
el<HTMLDialogElement>('duration-dialog').addEventListener('close', () => {
  if (el<HTMLDialogElement>('duration-dialog').open) return;
  flushDurationEdit();
  openDuration = null;
  if (selected && !el('event-form').hidden) refreshDurations();
});
el('duration-delete').onclick = () => {
  const current = openDuration;
  if (!current || !durationEditable()) return;
  flushDurationEdit();
  pendingDelete = {
    id: current.duration.id,
    document: documentRequest,
    remove: () => {
      const duration = model?.durations.get(current.duration.id) ?? current.duration;
      record({ duration: true, before: duration });
      model?.deleteDuration(duration.id);
      openDuration = null;
      el<HTMLDialogElement>('delete-dialog').close();
      el<HTMLDialogElement>('duration-dialog').close();
      changed();
    },
  };
  text('delete-heading', 'Delete duration?');
  text('delete-confirm', 'Delete duration');
  text(
    'delete-description',
    `Delete “${current.duration.metadata.title || 'Unnamed duration'}”? Moments it follows are not affected. You can undo this deletion.`,
  );
  el<HTMLDialogElement>('delete-dialog').showModal();
  el('delete-cancel').focus();
};
function renderDurationPluginFields() {
  const current = openDuration;
  if (!current) return;
  renderPluginFields(
    el('plugin-duration-fields'),
    durationPlugins(installedPlugins()),
    current.duration.metadata,
    durationEditable(),
    (key, value) => {
      try {
        const metadata = JSON.parse(el<HTMLTextAreaElement>('duration-metadata').value);
        if (value) metadata[key] = value;
        else delete metadata[key];
        el<HTMLTextAreaElement>('duration-metadata').value = JSON.stringify(metadata, null, 2);
        flushDurationEdit();
      } catch (error) {
        text('duration-error', error instanceof Error ? error.message : String(error));
      }
    },
    (event, url) => {
      event.preventDefault();
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    (title, remove) => remove(),
  );
}
/** Time an endpoint resolves to, from loaded moments or the saved band. */
function endpointTime(duration: Duration, which: 'start' | 'end'): Q | null {
  const endpoint = duration[which];
  if (typeof endpoint === 'string') return Q.parse(endpoint);
  const time = model?.momentTime(endpoint.moment);
  if (time) return Q.parse(time);
  const band = frame.durations?.find((b) => b.id === duration.id);
  return band ? Q.parse(which === 'start' ? band.startTime : band.endTime) : null;
}
function renderDurationEndpoints() {
  const host = el('duration-endpoints');
  host.replaceChildren();
  for (const which of ['start', 'end'] as const) host.append(endpointEditor(which));
}
function endpointEditor(which: 'start' | 'end') {
  const current = openDuration!;
  const endpoint = current.duration[which];
  const box = document.createElement('fieldset');
  box.className = 'duration-endpoint';
  box.dataset.endpoint = which;
  const legend = document.createElement('legend');
  legend.textContent = which === 'start' ? 'Start' : 'End';
  const mode = document.createElement('select');
  mode.setAttribute('aria-label', `${legend.textContent} kind`);
  for (const [value, label] of [
    ['time', 'Fixed time'],
    ['moment', 'Follows a moment'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    mode.append(option);
  }
  mode.value = typeof endpoint === 'string' ? 'time' : 'moment';
  mode.disabled = !durationEditable();
  box.append(legend, mode);
  const setEndpoint = (next: DurationEndpoint) => {
    flushDurationEdit();
    try {
      applyDuration(validateDuration({ ...openDuration!.duration, [which]: next }, parseTime));
      renderDurationEndpoints();
    } catch (error) {
      text('duration-error', error instanceof Error ? error.message : String(error));
    }
  };
  if (typeof endpoint === 'string') {
    const field = document.createElement('input');
    field.className = 'duration-time';
    field.spellcheck = false;
    field.setAttribute('aria-label', `${legend.textContent} time`);
    const shown = presented(Q.parse(endpoint), 'input');
    field.value = shown;
    field.disabled = !durationEditable();
    const read = () => (field.value === shown ? Q.parse(endpoint) : parseInputTime(field.value));
    field.onchange = () => {
      try {
        setEndpoint(read().toString());
      } catch (error) {
        text('duration-error', error instanceof Error ? error.message : String(error));
      }
    };
    attachTimeDialog(field, {
      heading: `Duration ${which} date and time`,
      editable: durationEditable,
      read,
      fallback: () => viewMiddle(),
      apply: (time) => setEndpoint(time.toString()),
    });
    box.append(field);
  } else {
    const anchored = model?.byId.get(endpoint.moment);
    const time = endpointTime(current.duration, which);
    const summary = document.createElement('p');
    summary.className = 'duration-anchor';
    summary.textContent =
      (anchored?.metadata.title || (anchored ? 'Unnamed moment' : 'Moment ' + endpoint.moment)) +
      (time ? ' · ' + presented(time) : '');
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open moment';
    open.disabled = !time;
    open.onclick = () => {
      if (!time) return;
      el<HTMLDialogElement>('duration-dialog').close();
      void selectGroup({
        id: endpoint.moment,
        first: time.toString(),
        last: time.toString(),
        count: '1',
        distinct: 1,
      }).catch(fail);
    };
    box.append(summary, open);
  }
  const chooser = document.createElement('div');
  chooser.className = 'duration-moments';
  if (durationEditable()) {
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.textContent =
      typeof endpoint === 'string' ? 'Follow a moment…' : 'Choose another moment…';
    choose.onclick = () =>
      void listMoments(chooser, (moment) => setEndpoint({ moment: moment.id }));
    box.append(choose, chooser);
  }
  mode.onchange = () => {
    if (mode.value === 'time') {
      const time = endpointTime(openDuration!.duration, which) ?? viewMiddle();
      setEndpoint(time.toString());
    } else void listMoments(chooser, (moment) => setEndpoint({ moment: moment.id }));
  };
  return box;
}
/** Pages through moments 25 at a time so a choice never loads the whole timeline. */
async function listMoments(host: HTMLElement, choose: (moment: PointEvent) => void) {
  let cursor: { time: string; id: string } | null = null;
  const generation = documentRequest;
  const more = document.createElement('button');
  more.type = 'button';
  more.textContent = 'Next 25 moments';
  const load = async () => {
    more.disabled = true;
    try {
      const page: { events: PointEvent[]; next: { time: string; id: string } | null } =
        !sparseWorkspace() && model
          ? model.points.size
            ? await groupPage(
                {
                  first: model.points.minKey()!.toString(),
                  last: model.points.maxKey()!.toString(),
                  count: '0',
                  distinct: 0,
                },
                cursor,
              )
            : { events: [], next: null }
          : await timelineQuery({
              kind: 'events',
              lower: local?.first ?? null,
              upper: local?.last ?? null,
              limit: 25,
              after: cursor,
              revision: (local ?? remote)!.revision,
            });
      if (generation !== documentRequest || !host.isConnected) return;
      host.replaceChildren();
      for (const moment of page.events) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent =
          (moment.metadata.title || 'Unnamed moment') +
          ' · ' +
          presented(Q.parse(moment.time), 'event');
        button.onclick = () => {
          sparseWorkspace()?.load(moment);
          choose(moment);
        };
        host.append(button);
      }
      if (!page.events.length) host.textContent = 'This timeline has no moments yet.';
      cursor = page.next;
      if (cursor) host.append(more);
    } catch (error) {
      fail(error);
    } finally {
      more.disabled = false;
    }
  };
  more.onclick = () => void load();
  await load();
}
el('add-duration-button').onclick = () => {
  const span = viewport.span;
  createDuration(
    viewport.left.add(span.mul(Q.from(3n, 8n))).toString(),
    viewport.left.add(span.mul(Q.from(5n, 8n))).toString(),
  );
};
/** Band elements persist by duration so clicks and hover cards survive re-rendering. */
const durationButtons = new Map<string, HTMLButtonElement>();
function renderDurationBands() {
  const host = el('duration-bands');
  host.querySelector('.duration-limit')?.remove();
  const rows = comparisonRows().rows;
  const plugins = durationPlugins(installedPlugins());
  const shown = new Set<string>();
  (frame.durations ?? []).forEach((band, i) => {
    const left = Math.max(0, viewport.x(Q.parse(band.first), width())),
      right = Math.min(width(), viewport.x(Q.parse(band.last), width()));
    if (right < left) return;
    const key = (band.sourceKey ?? '') + '\u0000' + band.id;
    shown.add(key);
    let button = durationButtons.get(key);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'duration-band';
      button.dataset.durationId = band.id;
      button.onclick = () => void openDurationById(band.id).catch(fail);
      durationButtons.set(key, button);
      host.append(button);
    }
    button.style.left = (48 + left) / uiScale + 'px';
    button.style.width = Math.max(6, (right - left) / uiScale) + 'px';
    button.style.top = 202 + (rows.get(band.sourceKey ?? '')?.offset ?? 0) + (i % 3) * 9 + 'px';
    button.style.backgroundColor = pluginColor(plugins, band.metadata) ?? '';
    button.textContent = band.metadata.title ?? '';
    button.setAttribute('aria-label', 'Duration: ' + (band.metadata.title || 'Unnamed duration'));
    button.title =
      (band.metadata.title || 'Duration') +
      ' · ' +
      presented(Q.parse(band.first)) +
      ' → ' +
      presented(Q.parse(band.last));
    hoverPreview.update(button, plugins, band.metadata);
  });
  for (const [key, button] of durationButtons)
    if (!shown.has(key)) {
      button.remove();
      durationButtons.delete(key);
    }
  if (frame.durationsTruncated) {
    const notice = document.createElement('span');
    notice.className = 'duration-limit';
    notice.textContent =
      'Showing the first 256 durations in this window. Zoom in to narrow the selection.';
    host.append(notice);
  }
}
