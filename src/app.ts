// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The editor: the page's controls, dialogs and timeline canvas for every edition (the browser
// editor, the offline HTML file, the desktop app through Tauri and the website's editor), and
// opening, drawing, editing, saving and sharing timelines on top of core.ts.
import { calendarPicker } from './calendar-picker.js';
import { aroundToday, blankDocument, editionById } from './editions.js';
import { followLatest } from './follow-latest.js';
import { createSummaryExpansion } from './summary-expansion.js';
import { pluginExpand } from './plugins.js';
import { browserEntryCount, BROWSER_COPY_MAX_EVENTS } from './browser-copy.js';
import { liveUpdates } from './live-updates.js';
import { ComparisonView } from './comparison.js';
import type { ComparisonSource, ComparisonGroup, EventPage } from './comparison.js';
import { collapseTrackSpans, shownTracks } from './track-summaries.js';
import type { TrackSpan } from './track-summaries.js';
import { comparisonUI } from './comparison-ui.js';
import { createCommunityUI } from './community-ui.js';
import { createSuiteUI } from './suite-ui.js';
import type { Proposal } from './community-ui.js';
import {
  configureImages,
  imageSource,
  embedImages,
  useLocalImages,
  holdRemoteImages,
} from './image-assets.js';
import { allowLocalSources } from './local-files.js';
import { stageScheme, themeProperties, themeScales } from './timeline-theme.js';
import { chooseTheme, followChoice, parseChoice, storedChoice } from './theme-choice.js';
import './styles.css';
import {
  renderPluginMarker,
  renderPluginFields,
  renderPluginShape,
  renderPluginOutline,
  renderPluginHeading,
} from './plugin-ui.js';
import type { RelationshipContext } from './plugin-ui.js';
import { attachRichText, renderMarkdown } from './rich-text.js';
import { pluginRichText } from './plugins.js';
import { dismissOnBackdrop } from './dialogs.js';
import { advise, record as recordSample, LIMIT } from './capacity.js';
import {
  DRAFT_STORES,
  draftWrites,
  allDraftWrites,
  draftSettings,
  draftDocument,
} from './drafts.js';
import type { DraftWrite } from './drafts.js';
import type { Advice, Measurements, Platform } from './capacity.js';
import { createHoverPreview } from './hover-preview.js';
import { renderReader } from './event-reader.js';
import {
  Q,
  entryLimit,
  setEntryLimit,
  RationalMap,
  TimelineIndex,
  Viewport,
  parseTime,
  demo,
  validateDocument,
  screenQ,
  wheelZoomFactor,
  createPresenter,
  tickLabel,
  validateInstalledPlugins,
  validatePluginManifest,
  pluginMarker,
  pluginColor,
  pluginShape,
  pluginOutline,
  pluginHeading,
  pluginSize,
  PLUGIN_EXAMPLE,
  validateTags,
  validateEntityTags,
  validateSeparations,
  validateTimelineImage,
  validateTimelineView,
  validateSavedViews,
  validateViewText,
  SAVED_VIEW_LIMIT,
  sameSeparation,
  separationGroups,
  viewSeparations,
  resolveSeparations,
  tagSeparation,
  SEPARATION_LIMIT,
  contentLabels,
  describeLabels,
  CONTENT_LABELS_KEY,
  validateAssets,
  isOfficialPlugin,
  searchPluginLibrary,
  BUILTIN_PLUGINS,
  pluginFields,
  stackWindow,
  scaleTimeline,
  checkPluginScript,
  readStack,
  stackEntries,
  validatePresentation,
  DEFAULT_PRESENTATION,
  MOMENT_SOURCES,
  FILE_THUMBNAILS,
  UNIT_PRESETS,
  CUSTOM_EXAMPLE,
  anchorOf,
  isOngoing,
  nowCoordinate,
  frameWithOngoing,
  resolveDuration,
  validateDuration,
  durationPlugins,
  pluginBackground,
  arcArrowheads,
  arrowsToward,
  pluginDrawsArrows,
  pluginBackdrop,
  pluginChart,
  momentDensity,
  stackedCurves,
  chartPaths,
  pluginTheme,
  settingValue,
  TEXT_SIZE,
  HEADING_FONTS,
  derivationKeys,
  BACKGROUND_URL_LIMIT,
  longBackgrounds,
  longBackgroundsText,
  momentPlugins,
  refKey,
  refFromKey,
  canonicalRelationship,
  entityCount,
  entityTags,
  filterDocument,
  separationArcs,
  tagCounts,
  searchIndex,
  searchTerms,
  searchText,
  matchRanges,
  addressedEntity,
  snippet,
  SEARCH_PAGE_SIZE,
  createDifference,
  timeMapping,
  timeMappingInput,
  mapTime,
  mappedEntities,
  unchangedMapping,
  arrangeDurations,
  compareDurationRank,
  durationCountText,
  collapses,
  DURATION_COUNT_CAP,
  arcPath,
  arrowheadPath,
  crossArcPath,
  crossArrowheadPath,
} from './core.js';
import type {
  EdgeBand,
  EntityRef,
  TimeMapping,
  ViewFilter,
  SeparationTrack,
  Disjoin,
  DisjoinTime,
  Union,
  UnionTime,
  ResolvedSeparation,
  Relationship,
  DurationBand,
  SearchPage,
  SearchResult,
  Duration,
  DurationEndpoint,
  Frame,
  FrameGroup,
  PointEvent,
  TimelineDocument,
  TimelineImage,
  TimelineView,
  SavedViewEntry,
  ViewSeparation,
  TimePresentation,
  PresentationContext,
  RulerPlan,
  InstalledPlugin,
  PluginManifest,
  PluginSetting,
} from './core.js';
import { ViewportCache, RemoteWorkspace, regroup, applyChanges } from './remote-cache.js';
import type { SavingChanges } from './remote-cache.js';
import type { Motion } from './remote-cache.js';
import {
  WindowStore,
  fingerprint,
  storeScope,
  timelinePrefix,
  versionPrefix,
} from './viewport-store.js';
import {
  requestApi,
  importSqlite,
  exportSqlite,
  anonymousRequests,
  useNativeServer,
  requestProgress,
  onLocalFilesWithheld,
} from './transport.js';
import { parseLink, linkFragment, sharePath } from './links.js';
import { profilePath, timelinePath } from './addresses.js';
import { addHelpTips } from './help-tips.js';
import { toolbarMenu } from './toolbar-menus.js';
import { startTour } from './tour.js';
import { momentsText, SAVE_TO_SERVER } from './wording.js';
import {
  MAIN_DRAFT,
  deleteDraft,
  listDrafts,
  newDraftId,
  openDraftDb,
  recordDraft,
} from './draft-store.js';
import type { DraftEntry } from './draft-store.js';
import { readViewState, viewStorageKey, VIEW_PREFIX } from './view-state.js';
import { showRelated } from './related-timelines.js';
import type { RelatedTimeline } from './related-timelines.js';
import type { ViewState } from './view-state.js';
import type { TimelineLink } from './links.js';
declare const __OFFLINE_HTML__: boolean;
const offlineHtml = typeof __OFFLINE_HTML__ !== 'undefined' && __OFFLINE_HTML__;
declare const __EDITION__: string | null;
/** The offline file's edition (#197), such as CFAM's, or null for the general one. */
const offlineEdition =
  offlineHtml && typeof __EDITION__ !== 'undefined' ? editionById(__EDITION__) : null;
/** A new, empty timeline, as the edition starts them. */
const newDocument = () => blankDocument(offlineEdition, -new Date().getTimezoneOffset());
/**
 * Where a timeline opens: around its moments, or around today for an empty Gregorian one in
 * an edition that starts its timelines with Gregorian dates.
 */
function openingView(index: TimelineIndex) {
  const first = index.points.minKey();
  if (!first && offlineEdition?.gregorian && index.presentation?.mode === 'gregorian') {
    const { left, span } = aroundToday(Date.now());
    return new Viewport(left, span);
  }
  return Viewport.fit(first, index.points.maxKey());
}
declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
        /** Messages a command sends back as it works, such as its progress. */
        Channel: new <T>() => { onmessage: (message: T) => void };
      };
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
  /** Its own image (#339), set in its settings (the server sends null for none). */
  image?: TimelineImage;
  /** How it opens (#416): its default separation, if any (the server sends null for none). */
  view?: TimelineView;
  /** A desktop file's own views (#550); a server's are read apart. */
  views?: SavedViewEntry[];
  assets?: Record<string, string>;
  /** Its sensitive-content labels (#115): its owner's and moderators'. */
  labels?: string[];
  owner: string;
  /** Its address's last part (#148), when its owner has chosen one. */
  slug?: string | null;
  event_count: string;
  star_count?: string;
  starred?: boolean;
  first?: string;
  last?: string;
}
/**
 * A server timeline's page (#148): at its owner's name and slug, or its ID until it has one.
 * Servers from before addresses, which send no slug, have it at /timelines/<id>.
 */
function remotePath(timeline: RemoteTimeline): string {
  return 'slug' in timeline ? timelinePath(timeline) : '/timelines/' + timeline.id;
}
interface NativeOpened {
  document: TimelineDocument;
  path: string;
  generation: number;
  event_count: string;
  first?: string;
  last?: string;
}
/**
 * What the reader trusted the timeline on screen with, as the desktop app keeps it
 * (src-tauri/src/access.rs): `trusted`, to picture and open the files it links to anywhere on
 * this computer; `images`, to show its images from other sites.
 */
interface DesktopTrust {
  trusted: boolean;
  images: boolean;
}
/** How a file population went (#433, src-tauri/src/populate.rs): moments made, files left out. */
interface PopulateReport {
  added: number;
  skipped: Record<string, { count: number; examples: string[] }>;
  truncated: boolean;
}
/** A population's report in a sentence or two. */
function populateSummary(report: PopulateReport) {
  const reasons: Record<string, string> = {
    'no recorded date': 'had no recorded date',
    'no file date': 'had no date of that kind',
    unreadable: "couldn't be read",
  };
  const skipped = Object.entries(report.skipped).map(
    ([reason, { count }]) => `${count.toLocaleString()} ${reasons[reason] ?? reason}`,
  );
  return (
    `Made ${report.added.toLocaleString()} moment${report.added === 1 ? '' : 's'} from files.` +
    (skipped.length ? ` Left out: ${skipped.join('; ')}.` : '') +
    (report.truncated ? ' It stopped before the end: at the limit, or when asked to.' : '') +
    ' Save As to keep it.'
  );
}
interface LocalTimeline extends NativeOpened {
  id: string;
  revision: string;
}
let local: LocalTimeline | null = null;
interface Session {
  user: {
    id: string;
    username: string;
    /** May be under 18: always warned of sensitive content (#115). */
    minor?: boolean;
    /** An adult who chose to see sensitive content without warnings. */
    showSensitive?: boolean;
  } | null;
  csrf: string | null;
  server: boolean;
  dashboard?: boolean;
  providers?: string[];
  /** Buttons named otherwise than their provider: Microsoft's OAUTH_MICROSOFT_LABEL. */
  providerLabels?: Record<string, string>;
  fileExchange?: boolean;
  /** The largest .och file the server exchanges, in bytes. */
  fileLimit?: number;
  /** How many timelines this account may compare at once. */
  compareLimit?: number;
  /** How many moments (durations, relationships) a timeline may hold; null for no limit. */
  entryLimit?: number | null;
}
const el = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const desktop = !offlineHtml && !!window.__TAURI__,
  stage = el('timeline-stage');
// Only the desktop app lists and accepts file links as sources (#433): it alone can open them.
if (desktop) allowLocalSources();
const platformEditor = !offlineHtml && !desktop && location.pathname === '/editor/frame';
const sampleTimeline =
  platformEditor && new URLSearchParams(location.search).get('demo') === 'dense';
const freshTimeline = platformEditor && new URLSearchParams(location.search).get('new') === '1';
if (platformEditor) document.body.dataset.platformEditor = 'true';
// A public timeline embedded in another site (/embed/<id>): read-only and anonymous, so a
// visitor's own session never applies there, and without the editor's controls.
const embedded =
  offlineHtml || desktop
    ? null
    : (/^\/embed\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.exec(location.pathname)?.[1] ??
      null);
if (embedded) {
  document.body.dataset.embed = 'true';
  anonymousRequests();
}
// The color scheme chosen (#382), offered in the header where the editor has its own (the offline
// file, the desktop app and the plain editor), and followed as it changes in another tab or on
// the website around the editor's frame. An embed takes only its page's setting.
{
  const select = el<HTMLSelectElement>('theme-choice');
  select.value = embedded ? 'system' : storedChoice();
  select.addEventListener('change', () => chooseTheme(parseChoice(select.value)));
  if (!embedded) followChoice((choice) => (select.value = choice));
}
// Which edition this is, beside the brand: the offline file or the desktop app.
if (offlineHtml || desktop) {
  const edition = el('edition-chip');
  edition.textContent = offlineHtml
    ? 'Offline' + (offlineEdition ? ' · ' + offlineEdition.name : '')
    : 'Desktop';
  edition.title = offlineHtml
    ? 'This file works without a network: timelines stay on this device.' +
      (offlineEdition ? ' ' + offlineEdition.description : '')
    : 'The desktop app: local .och files, and the servers you connect to.';
  edition.hidden = false;
}
// The offline file's timeline is always in memory, as its chip and notice say already.
if (offlineHtml) el('storage-badge').hidden = true;
if (desktop) {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('.download-menu a'))
    link.onclick = (event) => {
      event.preventDefault();
      void window.__TAURI__!.core.invoke('desktop_open_image', { url: link.href }).catch(fail);
    };
}
let serverOrigin = desktop ? '' : location.origin;
/**
 * The desktop's connected servers, the one in use first (#85). Each keeps its own sign-in;
 * the one in use is the open server timeline's, and new timelines are saved there.
 */
let connected: string[] = [];
/** The sessions of connected servers other than the one in use (that one is `session`). */
const sessions = new Map<string, Session>();
const DISCONNECTED: Session = { user: null, csrf: null, server: false };
function sessionOf(origin: string): Session {
  return origin === serverOrigin ? session : (sessions.get(origin) ?? DISCONNECTED);
}
/** How many timelines the server in use lets this account compare at once: 2 to 8. */
function compareLimit() {
  return Math.min(8, Math.max(2, session.compareLimit ?? 8));
}
/** Whether items say which server they come from: on a desktop connected to several. */
function severalServers() {
  return desktop && connected.length > 1;
}
function serverHost(origin: string) {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}
/** A chip naming a server, in a hue of its own. */
function serverChip(origin: string, element: HTMLElement = document.createElement('span')) {
  element.className = 'server-chip';
  element.textContent = serverHost(origin);
  element.title = origin;
  let hue = 0;
  for (const c of origin) hue = (hue * 31 + c.charCodeAt(0)) % 360;
  element.style.setProperty('--server-hue', String(hue));
  return element;
}
/** Uses a connected server (or none): its session applies, and requests go there. */
function useServer(origin: string | null) {
  if (origin === serverOrigin) return;
  if (serverOrigin && connected.includes(serverOrigin)) sessions.set(serverOrigin, session);
  serverOrigin = origin ?? '';
  session = (origin && sessions.get(origin)) || { ...DISCONNECTED };
  setEntryLimit(sessionEntryLimit(session));
  if (origin) sessions.delete(origin);
  useNativeServer(serverOrigin);
}
function safeDecode(text: string) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
/** A server timeline's address in the editor; the desktop's also names its server. */
function timelineHash(id: string, origin = serverOrigin) {
  return desktop ? `#server/${encodeURIComponent(origin)}/timeline/${id}` : `#timeline/${id}`;
}
let model: TimelineIndex | null = new TimelineIndex(
    offlineHtml || freshTimeline ? newDocument() : demo(sampleTimeline),
  ),
  viewport = openingView(model);
/** This device's recent measurements for the open timeline (see capacity.ts). */
let capacity: Measurements = { navigation: [], edits: [], views: [] },
  capacityKey = '',
  openStarted: number | null = null,
  pendingOpenStart: number | null = null;
let remote: RemoteTimeline | null = null,
  session: Session = { user: null, csrf: null, server: false },
  dirty = false,
  selected: PointEvent | null = null;
let live: ReturnType<typeof liveUpdates> | undefined;
let liveTransitionPending = false,
  animateLiveFrame = false;
const retiringNodes = new Set<HTMLElement>();
let comparison: ComparisonView | null = null;
// The view before a comparison: its vertical offset is kept from the centred one, as the stage
// may change size meanwhile.
let comparisonBefore: { viewport: Viewport; verticalShift: number; uiScale: number } | null = null;
let comparisonController: AbortController | undefined;
let comparisonInFlight = false;
let workingProposal: Proposal | null = null;
let proposalSubmissionVersion = 0,
  proposalSubmissionDocument = 0;
function setDashboard(show: boolean) {
  el('dashboard').hidden = !show;
  if (show) void showDrafts().catch(() => (el('dashboard-drafts').hidden = true));
  document.body.dataset.dashboard = String(show);
  el('memory-notice').hidden =
    show || !sessionKnown || !memoryOnly() || !!remote || !!comparison || !model;
  updatePageTitle();
  updateCapacity();
  if (!show) requestRender();
}
/** The dashboard's drafts in this browser (#188), each to open or delete. */
async function showDrafts() {
  const section = el('dashboard-drafts'),
    list = el('dashboard-drafts-list');
  const drafts: DraftEntry[] =
    session.user && !memoryOnly() && !desktop ? await listDrafts(session.user.id) : [];
  section.hidden = !drafts.length;
  list.replaceChildren(
    ...drafts.map((draft) => {
      const card = document.createElement('article');
      card.className = 'dashboard-timeline';
      card.dataset.draft = draft.id;
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'draft-open';
      open.textContent = draft.title || 'Untitled timeline';
      open.onclick = () => void openDraftById(draft.id).catch(fail);
      const details = document.createElement('p');
      details.textContent =
        momentsText(draft.moments) +
        (draft.updated ? ' · edited ' + new Date(draft.updated).toLocaleString() : '');
      details.className = 'field-hint';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete the draft “${open.textContent}”`);
      remove.onclick = () => {
        if (!confirm(`Delete the draft “${open.textContent}” from this browser for good?`)) return;
        if (openDraft() === draft.id) draftOf = null;
        storedDrafts.delete(draft.id);
        void deleteDraft(draft.id).then(showDrafts).catch(fail);
      };
      card.append(open, details, remove);
      return card;
    }),
  );
}
/** Opens draft `id` from the dashboard. */
async function openDraftById(id: string) {
  if (!mayReplace()) return;
  const doc = await loadDraft(id);
  if (!doc) {
    toast('That draft is no longer in this browser.');
    return void showDrafts();
  }
  historyReplace();
  sqlitePath = null;
  const opened = validateDocument(doc);
  loadDocument(opened, id);
  void openDefaultView(opened.view).catch(fail);
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
/**
 * The moment dialog's session. Edits to a moment show on the timeline as they are typed, but
 * only Save keeps them: Cancel, Escape, the close button, clicking outside or opening another
 * entity restores what the dialog opened with. A new moment is added only by Save.
 */
let momentSession: { document: number; isNew: boolean; draft: PointEvent | null } | null = null;
/** While a dialog previews unkept edits, browser drafts are not stored. */
let previewing = false;
/** Ends a preview, storing the result when it belongs to the open timeline. */
function endPreview(current = true) {
  if (!previewing) return;
  previewing = false;
  if (current) persistDraft();
}
/** Restores what the moment dialog opened with (within the same timeline) and ends its session. */
function discardMomentEdits() {
  clearTimeout(eventEditTimer);
  pendingEventEdit = false;
  const session = momentSession,
    edit = eventEditHistory;
  momentSession = null;
  eventEditHistory = null;
  if (edit && model && session?.document === documentRequest) {
    // The moment as it opened replaces the edited one: deleting it first would count as
    // removing a moment durations or relationships follow, and rebuild their indexes (#68).
    if (edit.after && edit.after.id !== edit.before?.id) model.delete(edit.after.id);
    if (edit.before) model.put(edit.before);
    forgetEdit(edit);
    selected = edit.before ?? null;
    changed();
  }
  endPreview(session?.document === documentRequest);
}
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
    const tags = parseTagInput(input('event-tags').value),
      labels = checkedLabels('event-labels');
    delete metadata[CONTENT_LABELS_KEY];
    const point: PointEvent = {
      id: selected?.id ?? momentSession?.draft?.id ?? eventId(),
      time: readEventTime().toString(),
      metadata: {
        ...metadata,
        title: input('event-title').value,
        description: el<HTMLTextAreaElement>('event-description').value,
        ...(tags.length ? { tags } : {}),
        ...(labels.length ? { [CONTENT_LABELS_KEY]: labels } : {}),
      },
    };
    pendingEventEdit = false;
    // A new moment stays in the dialog until Save adds it.
    if (momentSession?.isNew) {
      momentSession.draft = point;
      // The time cursor shows where Save will add it.
      selectedTime = Q.parse(point.time);
      requestRender(false);
      text('event-error', '');
      text('event-edit-status', 'Not on the timeline yet: Save adds it.');
      return;
    }
    if (JSON.stringify(point) !== JSON.stringify(selected)) {
      previewing = true;
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
    text(
      'event-edit-status',
      'Shown on the timeline: Save keeps these edits, Cancel discards them.',
    );
  } catch (error) {
    text('event-error', error instanceof Error ? error.message : String(error));
    text('event-edit-status', 'Incomplete edits — the last valid version is kept.');
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
/** Changes whenever what the timeline shows may have: another document, an edit, a revision. */
const contentGeneration = () =>
  `${documentRequest}:${editVersion}:${remote?.revision ?? local?.revision ?? ''}:${comparison?.tracks.map((t) => t.source.revision).join(',') ?? ''}`;
/**
 * Exact times parsed from the strings frames carry, kept across frames: a view redraws the
 * same groups, bands and links many times while it moves (#68).
 */
const parsedTimes = new Map<string, Q>();
const middles = new Map<string, Q>();
/** The exact middle of two times, kept like parsed times. */
function middleTime(first: string, last: string): Q {
  if (first === last) return parsedTime(first);
  const key = first + '\u0000' + last;
  let middle = middles.get(key);
  if (!middle) {
    if (middles.size >= 50000) middles.clear();
    middle = parsedTime(first).add(parsedTime(last)).div(Q.from(2n));
    middles.set(key, middle);
  }
  return middle;
}
function parsedTime(text: string): Q {
  let time = parsedTimes.get(text);
  if (!time) {
    if (parsedTimes.size >= 50000) parsedTimes.clear();
    time = Q.parse(text);
    parsedTimes.set(text, time);
  }
  return time;
}
const summaryExpansion = createSummaryExpansion(stage, {
  scale: () => uiScale,
  generation: contentGeneration,
  load: (group, signal) => groupPage(group, null, 5, signal),
  decorate(button, event) {
    const heading = pluginHeading(activePlugins(), event.metadata);
    if (heading) {
      renderPluginShape(button, 'circle');
      renderPluginOutline(button, 'solid');
      renderPluginHeading(button, heading, event.metadata.title ?? '');
      button.classList.add('heading-marker');
    } else {
      renderPluginHeading(button, null, '');
      renderPluginMarker(button, imageSource(pluginMarker(activePlugins(), event.metadata)), 1n);
      markSensitive(button, event.metadata);
      button.style.backgroundColor = pluginColor(activePlugins(), event.metadata) ?? '';
      button.dataset.size = pluginSize(activePlugins(), event.metadata);
      renderPluginShape(button, pluginShape(activePlugins(), event.metadata));
      renderPluginOutline(button, pluginOutline(activePlugins(), event.metadata));
    }
    button.title = `${event.metadata.title || 'Untitled moment'} · ${presented(Q.parse(event.time))}`;
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
/**
 * Animations started on label nodes, kept so they can be cancelled without asking the browser:
 * getAnimations() and getComputedStyle() make it recompute every style first, and a frame
 * called them once per label (#68).
 */
const labelAnimations = new WeakMap<Element, Animation[]>();
function animateLabel(
  node: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Animation {
  const animation = node.animate(keyframes, options);
  const running = (labelAnimations.get(node) ?? []).filter((a) => a.playState !== 'finished');
  running.push(animation);
  labelAnimations.set(node, running);
  return animation;
}
function cancelLabelAnimations(node: Element) {
  for (const animation of labelAnimations.get(node) ?? []) animation.cancel();
  labelAnimations.delete(node);
}
function finishTimeFade(label: MomentLabel) {
  cancelLabelAnimations(label.current);
  if (label.outgoing) cancelLabelAnimations(label.outgoing);
  label.outgoing?.remove();
  label.outgoing = undefined;
}
function updateMomentTime(label: MomentLabel, value: string) {
  if (label.current.textContent === value) return;
  if (!label.current.textContent) {
    label.current.textContent = value;
    return;
  }
  // Where the current text's fade-in has got to: its opacity, without asking for its style.
  const fadeIn = labelAnimations.get(label.current)?.find((a) => a.playState === 'running');
  const opacity = fadeIn ? (fadeIn.effect?.getComputedTiming().progress ?? 1) : 1;
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
  const fade = animateLabel(outgoing, [{ opacity }, { opacity: 0 }], {
    duration: 200,
    easing: 'ease-out',
  });
  fade.onfinish = () => {
    outgoing.remove();
    if (label.outgoing === outgoing) label.outgoing = undefined;
  };
  animateLabel(current, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
}
function removeMomentLabel(label: MomentLabel, fade = false) {
  finishTimeFade(label);
  for (const node of [label.caption, label.stem, label.button]) {
    cancelLabelAnimations(node);
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
    const animation = animateLabel(node, [{ opacity: 1 }, { opacity: 0 }], {
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
/** What the open timeline menu was opened on, and where it was then (see closeMenuOnScroll). */
let menuAnchor: { node: Element; left: number; top: number } | null = null;
let longPressTimer: ReturnType<typeof setTimeout> | undefined;
let longPressed = false;
/**
 * A moment a link opened: zoomed into, a step per frame of groups, until it stands alone
 * rather than counted in a group, unless moments share its time. Navigating ends it.
 */
let revealing: { id: string; time: Q; steps: number } | null = null;
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
  el('group-events').hidden = false;
  el('group-page-status').hidden = false;
  el('group-durations').hidden = true;
  el('group-duration-list').replaceChildren();
}
type EventEdit = { before?: PointEvent; after?: PointEvent };
type LinkEdit = { link: Relationship; related: boolean };
/** Several edits undone and redone as one, such as deleting everything in a view. */
type GroupEdit = { group: (EventEdit | DurationEdit)[] };
/**
 * A change made at once to a large desktop file's native baseline (#179): undo and redo take
 * the baseline back and forward, until the file is saved.
 */
type BaselineEdit = { baseline: { before: number; after: number } };
type HistoryEntry = EventEdit | DurationEdit | LinkEdit | GroupEdit | BaselineEdit;
let history: HistoryEntry[] = [],
  future: HistoryEntry[] = [],
  frameRequest = 0,
  frameTimer: ReturnType<typeof setTimeout>,
  draftTimer: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout>,
  scheduled = false,
  sqlitePath: string | null = null,
  sqliteSavedVersion: number | null = null,
  documentRequest = 0,
  // In the desktop app, the document request whose images from other sites wait (a timeline
  // file the reader hasn't shown them for), and the one whose heading says so.
  remoteImagesHeld = -1,
  remoteImagesNoticed = -1,
  // The timeline whose heading the page arrived with (#428, platform/app/editor/frame), and the
  // document request it is held through: from the start until the editor has opened it.
  prefilled: string | null =
    document.querySelector<HTMLElement>('.document-heading')?.dataset.prefill ?? null,
  prefillRequest = 0,
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
/**
 * Whether the website has said who is signed in. Until then everyone looks like a guest, so the
 * in-memory notice waits rather than flashing at someone signed in while their account loads.
 */
let sessionKnown = offlineHtml || desktop;
/** Whether the open timeline can be edited here, view mode and comparisons aside. */
const mayEditTimeline = () => !embedded && !!model && (!remote || remote.canEdit);
/** Whether the open timeline can be edited here, view mode aside. */
const mayEdit = () => !comparison && mayEditTimeline();
/**
 * View mode (#233): someone who can edit reads the timeline as its viewers do, its moments and
 * durations opening in the reader. Remembered in this browser.
 */
let viewMode = (() => {
  try {
    return localStorage.getItem('openchronology:view-mode') === '1';
  } catch {
    return false;
  }
})();
const editable = () => !viewMode && mayEdit();
/**
 * Moments and durations open in the reader for anyone not editing. A comparison opens them in
 * its read-only editor, but a separation is the open timeline itself (#345): there they open in
 * the reader in View mode, and for anyone who could not edit the timeline anyway.
 */
const reading = () =>
  !editable() && (!comparison || (!!separation && (viewMode || !mayEditTimeline())));
/**
 * Room beside the ruler for markers at the bounds. Narrow stages, such as phones held upright,
 * keep less so the timeline itself gets the width.
 */
let currentInset = 48;
// Measured once per frame: reading layout while markers are created would start their
// position transitions from wherever the browser first placed them.
const inset = () => currentInset;
/**
 * The content scale a timeline opens at. Phone screens, in either orientation, are seen up
 * close, so smaller markers and labels stay legible there and fit more of a timeline.
 */
const compactScreen = matchMedia('(max-width: 650px), (max-height: 500px)');
const baseScale = () => (compactScreen.matches ? 0.75 : 1);
/** Opens the contents at the stage's base scale, with the axis where it sits at full size. */
function resetScale() {
  uiScale = scaledFor = baseScale();
  verticalOffset = centeredOffset();
}
/** The base scale last applied; turning a phone moves an unscaled timeline to the new base. */
let scaledFor = 1;
/**
 * The stage's size, kept by a ResizeObserver. Drawing must not read it from the DOM: each
 * read after drawing changed something makes the browser lay out the page again, and a
 * frame read it once per marker (#68). Until first observed, it is read directly.
 */
let stageSize: { width: number; height: number } | null = null;
/** Whether the stage's next resize is fitStageToTracks growing or shrinking it. */
let tracksRefit = false;
new ResizeObserver(() => {
  const next = { width: stage.clientWidth, height: stage.clientHeight };
  if (stageSize && next.width === stageSize.width && next.height === stageSize.height) return;
  // A stage that grows or shrinks (full screen, a resized window) does so about its centre,
  // so the timeline keeps its place from the centre rather than from the top. One grown to
  // fit tracks starts them afresh, centred or from the top.
  const refit = tracksRefit;
  tracksRefit = false;
  if (stageSize && !refit) verticalOffset += (next.height - stageSize.height) / 2;
  stageSize = next;
  if (refit) verticalOffset = centeredOffset();
  requestRender();
}).observe(stage);
const stageWidth = () => stageSize?.width ?? stage.clientWidth,
  stageHeight = () => stageSize?.height ?? stage.clientHeight;
/**
 * The vertical offset that centres the timeline in the stage: its axis, at 192 in the
 * contents' own units, or a comparison's rows (the middle of their axes) while they fit, and
 * else its first row at the top.
 */
function centeredOffset() {
  const plan = comparisonRows();
  const axes = [...plan.rows.values()].map((row) => 192 + row.offset);
  if (!axes.length) return stageHeight() / 2 - 192 * uiScale;
  const height = plan.total * uiScale;
  if (height > stageHeight()) return 0;
  const middle = (Math.min(...axes) + Math.max(...axes)) / 2;
  return Math.max(0, Math.min(stageHeight() - height, stageHeight() / 2 - middle * uiScale));
}
const width = () => Math.max(1, stageWidth() - 2 * inset()),
  // Grouping follows marker size, which is smaller at a compact base scale.
  // Wider labels (the theme's label size, #267) group moments sooner, so labels sharing a row
  // stay apart.
  pixels = () =>
    Math.round(Number(input('density').value) * baseScale() * Math.max(1, textScales().text));
function toast(message: string) {
  text('toast', message);
  el('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el('toast').hidden = true;
  }, 7000);
}
/** An import's message, and a warning of background addresses too long to show (#365). */
function withBackgroundWarning(message: string, doc: TimelineDocument): string {
  const long = longBackgrounds(doc.plugins, doc.durations).length;
  return long ? `${message} ${longBackgroundsText(long, BACKGROUND_URL_LIMIT)}` : message;
}
function fail(error: unknown) {
  toast(error instanceof Error ? error.message : String(error));
}
// Links to files on this computer (#433) stay here: the transport leaves them out of requests.
onLocalFilesWithheld((count) =>
  toast(
    `${count} link${count === 1 ? '' : 's'} to files on this computer stayed here: file paths are never sent to a server.`,
  ),
);
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
// Windows fetched ahead of the reader, one at a time, after the view settles (see predict).
let prefetchTimer: ReturnType<typeof setTimeout> | undefined,
  prefetchController: AbortController | undefined,
  prefetching = false,
  // A view's own request waited for a desktop prefetch, which cannot be interrupted.
  windowWaiting = false,
  lastView: Viewport | undefined,
  motion: Motion = null;
function schedulePrefetch(delay = 400) {
  clearTimeout(prefetchTimer);
  if (comparison || !(remote || local)) return;
  prefetchTimer = setTimeout(prefetchWindow, delay);
}
function prefetchWindow() {
  const source = local ?? remote;
  if (!source || comparison || saving || document.hidden) return;
  if (windowInFlight || comparisonInFlight || prefetching) return;
  // The view's own window goes first: predictions wait until it has arrived (#218).
  if (!remoteCache.get(viewport, remoteCache.plan(viewport, width(), pixels()))) return;
  const [query] = remoteCache.predict(viewport, width(), pixels(), motion);
  if (!query) return;
  const key = remoteCacheKey,
    { id, revision } = source;
  prefetching = true;
  const controller = (prefetchController = new AbortController());
  void timelineQuery<Frame>(
    { kind: 'overview', ...query, revision, plugins: activePlugins(), prefetch: true },
    controller.signal,
  )
    .then((result) => {
      if (
        controller.signal.aborted ||
        remoteCacheKey !== key ||
        (local ?? remote)?.id !== id ||
        (local ?? remote)?.revision !== revision
      )
        return;
      remoteCache.store(query, result);
      persistWindows();
      schedulePrefetch(50);
    })
    // A failed prediction costs nothing; the view's own request reports errors.
    .catch(() => {})
    .finally(() => {
      prefetching = false;
      if (windowWaiting) {
        windowWaiting = false;
        requestRender();
      }
    });
}
/** What the viewport cache holds now: a source, its revision and the plugins applied. */
function cacheKey(source: { id: string; revision: string }) {
  return source.id + ':' + source.revision + ':' + JSON.stringify(activePlugins());
}
// Server timelines' windows also outlive the page (see viewport-store.ts). Desktop files
// have no revision that survives the app, so only the page keeps theirs.
const windowStore = new WindowStore();
let persistTimer: ReturnType<typeof setTimeout> | undefined;
function storedVersion() {
  // Guests' windows stay in the page, like their drafts.
  if (!remote || local || offlineHtml || !session.user || remoteCacheKey !== cacheKey(remote))
    return null;
  const scope = storeScope(serverOrigin, session.user.id);
  return {
    timeline: timelinePrefix(scope, remote.id),
    version: versionPrefix(
      scope,
      remote.id,
      remote.revision,
      fingerprint(JSON.stringify(activePlugins())),
    ),
  };
}
/** Windows being taken back from storage; hiding the page waits for them (see below). */
let restoring: Promise<void> = Promise.resolve();
function restoreWindows(key: string) {
  const stored = storedVersion();
  if (!stored) return;
  restoring = windowStore
    .load(stored.version)
    .then((windows) => {
      if (remoteCacheKey !== key || !windows.length) return;
      remoteCache.restore(windows);
      requestRender();
    })
    // Storage may be unavailable (private windows, quota); the server answers instead.
    .catch(() => {});
}
function persistWindows(delay = 2000) {
  clearTimeout(persistTimer);
  const save = () => {
    // A hidden page has let go of the windows it does not show (below), and storage keeps
    // the page's windows only: saving then would drop them. Hiding saves just before.
    if (delay && document.hidden) return;
    const stored = storedVersion();
    if (stored)
      void windowStore
        .save(stored.timeline, stored.version, remoteCache.snapshot())
        .catch(() => {});
  };
  if (delay) persistTimer = setTimeout(save, delay);
  else save();
}
// A hidden page stores its windows, then keeps only those covering its view; shown again, it
// takes the others back from storage before storing anything more. Hidden again before they
// are back, it waits for them: storing first would delete the windows still on their way.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    if (remoteCacheKey) restoreWindows(remoteCacheKey);
    return;
  }
  clearTimeout(prefetchTimer);
  prefetchController?.abort();
  const view = viewport;
  void restoring.then(() => {
    // Shown again meanwhile: it keeps everything, and takes back what storage has.
    if (!document.hidden) return;
    persistWindows(0);
    remoteCache.release(view);
  });
});
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
            ...(p.manifest.chart?.series?.length ? ['tags'] : []),
            ...derivationKeys(p.manifest),
          ]),
      ]),
    ];
    // The desktop store has no clock of its own: ongoing durations (#537) end at this one.
    const now = nowCoordinate(model?.presentation ?? remote?.presentation, Date.now());
    const result = await window.__TAURI__!.core.invoke<T>('desktop_query', {
      generation: local.generation,
      query: { ...query, metadata_keys, ...(now ? { now: now.toString() } : {}) },
    });
    // A window carries them resolved, apart: their placeholders go, and they join it.
    const { ongoing, ...frame } = result as Frame & { ongoing?: DurationBand[] };
    if (query.kind !== 'overview' || !ongoing) return result;
    return frameWithOngoing(
      frame,
      ongoing,
      Q.parse(String(query.lower)),
      Q.parse(String(query.upper)),
      Q.parse(frame.threshold ?? String(query.threshold)),
    ) as T;
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
      ? // The revision the edits were made against; once a timeline that keeps no saved
        // history has moved on it is not kept (409), and its current state is read instead.
        await api<{ document: TimelineDocument }>(
          `timelines/${remote!.id}/history/${savedId}`,
        ).catch((error: { status?: number }) => {
          if (error.status !== 409) throw error;
          return api<{ document: TimelineDocument }>(`timelines/${remote!.id}/document`);
        })
      : await api<{ document: TimelineDocument }>(`timelines/${remote!.id}/document`);
  if (workspace !== documentRequest) throw new Error('The open timeline changed.');
  // Saved snapshots may predate standalone durations; validation converts legacy links.
  if (!changes || !settings) return validateDocument(snapshot.document);
  return applyChanges(
    validateDocument(snapshot.document),
    settings,
    changes,
    durationChanges!,
    new Map(index!.relationshipChanges),
  );
}
/**
 * Runs once the frame being drawn is painted. Called while drawing (in requestAnimationFrame):
 * a message posted there is handled after the frame renders, as the UI benchmarks' probe
 * times it. Waiting for a later frame would count that frame's drawing too.
 */
const paints = new MessageChannel(),
  painted: (() => void)[] = [];
paints.port1.onmessage = () => painted.shift()?.();
function afterPaint(run: () => void) {
  painted.push(run);
  paints.port2.postMessage(0);
}
/**
 * The latest input that may move the view (wheel, drag, touch, key or click), by its event
 * time, until a view is drawn: the advice measures how long users wait for their views.
 */
let navigationInput: number | null = null,
  drawnView = '';
const viewKey = () =>
  `${viewport.left.toString()}|${viewport.span.toString()}|${uiScale}|${verticalOffset}`;
for (const type of ['wheel', 'pointermove', 'touchmove', 'keydown', 'click'] as const)
  document.addEventListener(
    type,
    (event) => {
      if (!event.isTrusted) return;
      // Pointer moves count while dragging.
      if (type === 'pointermove' && !(event as PointerEvent).buttons) return;
      navigationInput = event.timeStamp;
    },
    { capture: true, passive: true },
  );
// An ongoing duration ends at "now" (#537): a view that shows one is redrawn as time passes,
// every 15 seconds while the page is visible.
setInterval(() => {
  if (!document.hidden && frame.durations?.some((band) => isOngoing(band.end))) requestRender();
}, 15000);
/**
 * A server's window says where its ongoing bands ended when it answered; a cached one is
 * reused for 30 seconds. Drawn, they end at the browser's clock instead, so they keep growing
 * between fetches (#537).
 */
function ongoingToNow(f: Frame, settings: TimePresentation | undefined): Frame {
  const now = nowCoordinate(settings, Date.now());
  if (!now || !f.durations?.some((band) => isOngoing(band.end))) return f;
  return {
    ...f,
    durations: f.durations.map((band) => {
      if (!isOngoing(band.end)) return band;
      const last = now.compare(Q.parse(band.first)) > 0 ? now.toString() : band.first;
      return { ...band, last, endTime: last };
    }),
  };
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
    if (stageWidth() <= 96 || stageHeight() === 0) {
      // An open drawn later than this measures the wait, not the device.
      openStarted = null;
      // The window this render would have fetched is still wanted when it draws (#218).
      pendingFrameRefresh ||= refresh;
      return;
    }
    currentInset = stageWidth() < 600 ? 20 : 48;
    // Turning a phone moves a timeline the reader has not rescaled to the new base scale.
    if (uiScale === scaledFor && baseScale() !== scaledFor && !comparison) {
      resetScale();
      render(true);
      return;
    }
    render(refresh);
    saveView();
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
  labelInterval?: Q,
): PresentationContext {
  return {
    left: viewport.left,
    span: viewport.span,
    widthPixels: width(),
    purpose,
    // Larger tick labels (the theme's measure size, #267) need more room between ticks.
    ...(purpose === 'axis' ? { textScale: uiScale * textScales().measure } : {}),
    ...(spacingPixels === undefined ? {} : { spacingPixels }),
    ...(labelInterval === undefined ? {} : { labelInterval }),
  };
}
function presented(
  q: Q,
  purpose: PresentationContext['purpose'] = 'tooltip',
  spacingPixels?: number,
  labelInterval?: Q,
): string {
  try {
    return timelinePresenter().print(q, viewContext(purpose, spacingPixels, labelInterval));
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
/**
 * A time written on its own, independent of the view (#344): what the reader and its related
 * entries show, read as a page about one entity rather than against the timeline's edge.
 */
function presentedAlone(q: Q): string {
  try {
    return timelinePresenter().alone(q);
  } catch (error) {
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
  labelInterval?: Q,
): string {
  const full = presented(q, purpose, spacingPixels, labelInterval);
  return full.length <= 27 ? full : full.slice(0, 24) + '…';
}
const displayedBounds = new Map<string, { text: string; time: Q }>();
/**
 * How a separation's tracks are drawn in the current view (#560): the spans collapsed into the
 * track they unite into, too narrow to show apart, and the tracks hidden, having nothing in view.
 */
let trackPlan: { collapsed: TrackSpan[]; hidden: Set<string> } = {
  collapsed: [],
  hidden: new Set(),
};
/**
 * A separation's joined frame as it is drawn (#560): each track whose disjoin and union are
 * closer than the grouping distance summarized on the track it unites into, and the tracks
 * with nothing left in view hidden. The rest of the timeline is always drawn. Other frames
 * are drawn as they are.
 */
function separatedFrame(f: Frame): Frame {
  const before = [...trackPlan.hidden].join('\u0000');
  if (!separation || !('tracks' in separation) || !comparison || comparison.combined) {
    trackPlan = { collapsed: [], hidden: new Set() };
    if (before) fitStageToTracks();
    return f;
  }
  const keys = comparison.tracks.map((t) => t.source.key),
    rest = keys[keys.length - 1];
  const spans: TrackSpan[] = [];
  separation.resolved?.forEach((resolved, i) => {
    const begins = earliestJoin(i, 'disjoins'),
      ends = separationEnds(i);
    if (!begins || !ends || !keys[i]) return;
    const union = resolved.unions?.find((u) => u.at && u.at.compare(ends) === 0);
    if (!union) return;
    spans.push({ key: keys[i], into: union.into === null ? rest : keys[union.into], begins, ends });
  });
  const collapsed = collapseTrackSpans(f, spans, viewport.threshold(width(), pixels()));
  const shown = shownTracks(collapsed.frame, keys, viewport.left, viewport.right, rest);
  trackPlan = {
    collapsed: collapsed.collapsed,
    hidden: new Set(keys.filter((k) => !shown.has(k))),
  };
  // Tracks shown or hidden change the room the stage needs.
  if ([...trackPlan.hidden].join('\u0000') !== before) fitStageToTracks();
  return collapsed.frame;
}
/** The track a separation's arc end or curve is drawn on: its own, or where it collapsed. */
function drawnTrack(key: string, at?: Q): string {
  if (at)
    for (const span of trackPlan.collapsed)
      if (span.key === key && at.compare(span.begins) >= 0 && at.compare(span.ends) <= 0)
        return drawnTrack(span.into, at);
  return key;
}
function comparisonRows() {
  const rows = new Map<string, { offset: number; title: number }>();
  let total = 0;
  if (!comparison || comparison.combined) return { rows, total };
  const fields = pluginFields(comparison.plugins).filter((field) => field.kind === 'stack');
  const ordered = [...frame.groups].sort((a, b) => Q.parse(a.first).compare(Q.parse(b.first)));
  for (const track of comparison.tracks) {
    // A separation's track with nothing in view takes no room (#560).
    if (trackPlan.hidden.has(track.source.key)) continue;
    let up = 0,
      down = 0,
      lane = 0;
    for (const group of ordered)
      if ((group as ComparisonGroup).sourceKey === track.source.key) {
        const depth = fields.reduce(
          (sum, field) =>
            sum +
            stackEntries(
              group.metadata?.[field.metadataKey],
              fields.map((f) => f.metadataKey),
            ).length,
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
/**
 * Separated or compared tracks (#556) are drawn at the reader's text size, so the stage grows
 * to show them all, up to the window's height less room for the toolbar; taller ones pan.
 * Phones keep their stage, which already takes most of the screen, and full screen its own.
 */
function fitStageToTracks() {
  const tracks = !!comparison && !comparison.combined && !compactScreen.matches;
  const height = tracks
    ? `${Math.round(
        Math.max(
          STAGE_HEIGHT,
          Math.min(window.innerHeight - 140, comparisonRows().total * uiScale + 48),
        ),
      )}px`
    : '';
  if (
    stage.classList.contains('stage-tracks') === tracks &&
    stage.style.getPropertyValue('--stage-tracks-height') === height
  )
    return;
  tracksRefit = true;
  stage.classList.toggle('stage-tracks', tracks);
  if (height) stage.style.setProperty('--stage-tracks-height', height);
  else stage.style.removeProperty('--stage-tracks-height');
}
/** The stage's height without tracks (styles.css, .timeline-stage). */
const STAGE_HEIGHT = 365;
window.addEventListener('resize', () => fitStageToTracks());
function renderAxis() {
  const axis = el('axis');
  const rowPlan = comparisonRows();
  // The first track drawn (#560: a separation's may be hidden) has the baseline and ticks the
  // others copy.
  const owner =
    comparison?.tracks.find((t) => !trackPlan.hidden.has(t.source.key)) ?? comparison?.tracks[0];
  axis.replaceChildren();
  const baseline = document.createElement('div');
  baseline.className = 'axis-baseline';
  baseline.style.left = `${inset() / uiScale}px`;
  baseline.style.right = `${inset() / uiScale}px`;
  baseline.style.top = `${192 + (comparison && !comparison.combined ? (rowPlan.rows.get(owner!.source.key)?.offset ?? 0) : 0)}px`;
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
    tick.style.left = `${(inset() + viewport.x(time, width())) / uiScale}px`;
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
    // From the minor ticks' color through the major's to the boundaries', by how much of the
    // tick's strength each is: the theme's tick colors (#382), light or dark.
    const strength = Math.max(rule.opacity, Number.EPSILON),
      clamp = (x: number) => Math.min(1, Math.max(0, x));
    const boundary = clamp(rule.boundaryOpacity / strength),
      major = clamp(rule.majorOpacity / strength - boundary) / Math.max(1 - boundary, 1e-9);
    const percent = (x: number) => (100 * clamp(x)).toFixed(1) + '%';
    notch.style.borderColor = `color-mix(in srgb, var(--stage-tick-boundary) ${percent(boundary)}, color-mix(in srgb, var(--stage-tick-major) ${percent(major)}, var(--stage-tick-minor)))`;
    tick.append(notch);
    // One label per tick: crossfading versions that print differently would overlap (#241).
    const label = tickLabel(
      rule.labels.map((version) => ({
        // The interval itself decides the label's detail, exactly: its pixel spacing is a
        // float that lands either side of a calendar threshold as the view moves.
        text: axisLabel(
          time,
          'axis',
          Math.max(1, Math.min(1000000, viewport.x(viewport.left.add(version.interval), width()))),
          version.interval,
        ),
        opacity: version.opacity,
      })),
    );
    if (label) {
      const value = document.createElement('span');
      value.className = 'tick-label';
      value.style.opacity = label.opacity.toString();
      value.textContent = label.text;
      value.title = presented(time) + '\nExact: ' + time.toString();
      tick.append(value);
    }
    tick.style.transform = `translateY(${comparison && !comparison.combined ? (rowPlan.rows.get(owner!.source.key)?.offset ?? 0) : 0}px)`;
    axis.append(tick);
  }
  if (comparison && !comparison.combined) {
    const originalTicks = [...axis.querySelectorAll<HTMLElement>('.axis-tick')];
    for (const [index, track] of comparison.tracks.entries()) {
      if (trackPlan.hidden.has(track.source.key)) continue;
      const owns = track === owner;
      const title = document.createElement('div');
      title.className = 'comparison-axis-title';
      title.textContent = track.source.title;
      title.style.top = `${rowPlan.rows.get(track.source.key)?.title ?? 22}px`;
      axis.append(title);
      // A separation that disjoins (#549) has no axis before its first disjoin: its track
      // begins there (and while none is known yet, nowhere in view). One that unites has none
      // after its first union.
      const begins = separationBegins(index);
      const before = (tick: HTMLElement) =>
        !!begins && Q.parse(tick.dataset.time!).compare(begins) < 0;
      // One that unites ends at its first union.
      const ends = separationEnds(index);
      const after = (tick: HTMLElement) => !!ends && Q.parse(tick.dataset.time!).compare(ends) > 0;
      let line: HTMLElement = baseline;
      const ticks = owns ? originalTicks : [];
      if (!owns) {
        line = baseline.cloneNode(true) as HTMLElement;
        // From the left, whatever the first track's start (it may disjoin).
        line.style.left = line.style.right = `${inset() / uiScale}px`;
        line.hidden = false;
        line.style.top = `${192 + (rowPlan.rows.get(track.source.key)?.offset ?? 0)}px`;
        axis.append(line);
        for (const tick of originalTicks) {
          const clone = tick.cloneNode(true) as HTMLElement;
          clone.style.transform = `translateY(${rowPlan.rows.get(track.source.key)?.offset ?? 0}px)`;
          clone.querySelector('.tick-guide')?.remove();
          // Shown, whatever the first track hides before its disjoin.
          clone.querySelectorAll<HTMLElement>('[hidden]').forEach((part) => (part.hidden = false));
          axis.append(clone);
          ticks.push(clone);
        }
      }
      if (!begins && !ends) continue;
      const left = inset() / uiScale,
        right = (stageWidth() - inset()) / uiScale;
      const start = begins
          ? Math.max(left, (inset() + viewport.x(begins, width())) / uiScale)
          : left,
        end = ends ? Math.min(right, (inset() + viewport.x(ends, width())) / uiScale) : right;
      line.hidden = start >= end;
      line.style.left = `${start}px`;
      line.style.right = `${stageWidth() / uiScale - Math.max(start, end)}px`;
      // The first track's ticks also draw the guides every track shares: those stay.
      for (const tick of ticks)
        if (before(tick) || after(tick))
          for (const part of tick.children)
            if (!part.classList.contains('tick-guide')) (part as HTMLElement).hidden = true;
    }
  }
  // The exact view, for tests and benchmarks: the bounds' text may be rounded.
  stage.dataset.viewLeft = viewport.left.toString();
  stage.dataset.viewRight = viewport.right.toString();
  for (const [id, time] of [
    ['left-bound', viewport.left],
    ['right-bound', viewport.right],
  ] as const)
    if (document.activeElement !== el(id)) {
      const value = presented(time, 'input'),
        shown = displayedBounds.get(id);
      // Only navigation or a display change rewrites a bound; re-rendering keeps unapplied typing,
      // so a left bound typed before moving to the right field survives until Go.
      if (shown?.text === value && shown.time.equals(time)) continue;
      input(id).value = value;
      displayedBounds.set(id, { text: value, time });
    }
}
function drawFrame() {
  // The view these markers show, for the UI benchmarks to time what users wait for.
  el('markers').dataset.view = `${viewport.left.toString()} ${viewport.right.toString()}`;
  renderEdgeArcs();
  renderDurationBands();
  renderDurationBackgrounds();
  const cursor = el('time-cursor');
  stage.style.setProperty('--timeline-scale', String(uiScale));
  stage.dataset.uiScale = String(uiScale);
  const cursorX = selectedTime ? viewport.x(selectedTime, width()) : -1;
  cursor.hidden = !selectedTime || cursorX < 0 || cursorX > width();
  el('clear-selection').hidden = !selectedTime;
  cursor.style.left = `${inset() + cursorX}px`;
  if (selectedTime) {
    cursor.dataset.time = selectedTime.toString();
    cursor.setAttribute('aria-label', `Selected time: ${presented(selectedTime, 'input')}`);
  }
  const expandSummaries = pluginExpand(activePlugins());
  // Label rows and stems make room for the theme's label size (#267): a label block is 32
  // pixels tall at the usual size, with 11 between rows.
  const labelHeight = 32 * textScales().text,
    labelRow = labelHeight + 11;
  const container = el('markers');
  const branches = el('stack-markers');
  const stackRetained = new Set<string>();
  let topExtent = 0,
    bottomExtent = stageHeight() / uiScale;
  const retained = new Set<string>();
  const ordered: HTMLElement[] = [];
  let visible = 0n;
  // Remote summary metadata is itself ordered in a RationalMap. It is never mistaken for a complete event cache.
  const groups = new RationalMap<FrameGroup>((g) => entityCount(g));
  for (const group of frame.groups) groups.set(parsedTime(group.first), group);
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

    const first = parsedTime(group.first),
      last = parsedTime(group.last),
      mid = middleTime(group.first, group.last),
      x = viewport.x(mid, width());
    if (x < 0 || x > width()) continue;
    visible += BigInt(group.count);
    const key = group.id
      ? `event:${group.id}`
      : group.duration && group.count === '0'
        ? `duration:${sourceKey ?? ''}:${group.duration.id}`
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
          animateLabel(node, [{ opacity: 0 }, { opacity: 1 }], {
            duration: 220,
            easing: 'ease-out',
          });
    }
    const { button, caption, stem, coordinate } = label;
    const count = entityCount(group);
    // A lone collapsed duration reads like a moment but keeps its own identity and plugins.
    const span = count === 1n && group.count === '0' ? group.duration : undefined;
    const plugins = span ? durationPlugins(installedPlugins()) : activePlugins();
    button.className =
      'event-marker' +
      (span ? ' duration-point' : '') +
      (count > 1n ? ' group' : '') +
      (count > 999n ? ' large' : '') +
      (selectedGroup?.first === group.first &&
      (!comparison || (selectedGroup as ComparisonGroup)?.sourceKey === sourceKey)
        ? ' selected'
        : '') +
      (searchHighlights(group) ? ' search-hit' : '');
    button.style.left = `${(inset() + x) / uiScale}px`;
    markerGroups.set(button, group);
    summaryExpansion.update(button, group, expandSummaries);
    button.dataset.first = group.first;
    button.dataset.count = group.count;
    const metadata = span
      ? span.metadata
      : group.id
        ? ((!comparison ? model?.byId.get(group.id)?.metadata : undefined) ?? group.metadata ?? {})
        : {};
    const name = span
      ? 'Duration: ' + (span.metadata.title?.trim() || 'Untitled duration')
      : group.title?.trim() || 'Untitled moment';
    // A heading moment (#110) shows only its title, which is what is clicked.
    const heading = count === 1n && !span ? pluginHeading(plugins, metadata) : null;
    if (heading) {
      renderPluginShape(button, 'circle');
      renderPluginOutline(button, 'solid');
      button.style.backgroundColor = '';
      button.dataset.size = 'medium';
      renderPluginHeading(button, heading, group.title ?? '');
      button.classList.add('heading-marker');
    } else {
      renderPluginHeading(button, null, '');
      renderPluginMarker(button, imageSource(pluginMarker(plugins, metadata)), count);
      markSensitive(button, metadata);
      const color = count === 1n ? pluginColor(plugins, metadata) : null;
      button.style.backgroundColor = color ?? '';
      button.dataset.size = count === 1n && !span ? pluginSize(plugins, metadata) : 'medium';
      renderPluginShape(button, count === 1n && !span ? pluginShape(plugins, metadata) : 'circle');
      // Dashed for a presumptive moment or collapsed duration (#325); summaries stay solid.
      renderPluginOutline(button, count === 1n ? pluginOutline(plugins, metadata) : 'solid');
    }
    button.style.borderColor = '';
    button.setAttribute(
      'aria-label',
      count > 1n ? `${summaryName(group)} near ${presented(first)}` : name,
    );
    button.title = count > 1n ? `${summaryName(group)}; select to explore` : name;
    const sourceLane = trackLanes.get(sourceKey ?? '') ?? 0;
    trackLanes.set(sourceKey ?? '', sourceLane + 1);
    // Labels below the axis go beneath the duration bands, whose titles they would cover; a
    // comparison's tracks keep their own heights, so there they stay where they were.
    const below =
        comparison && !comparison.combined
          ? 272
          : Math.max(272, DURATION_TOP + (durationDepth.get('') ?? 0) * DURATION_ROW + 8),
      top = (comparison ? sourceLane : lane++) % 4,
      labelTop =
        rowOffset + (top < 2 ? 160 - labelHeight - top * labelRow : below + (top - 2) * labelRow);
    button.style.top = '';
    button.style.translate = `0 ${rowOffset}px`;
    stem.style.left = `${(inset() + x) / uiScale}px`;
    stem.style.top = `${top < 2 ? labelTop + labelHeight : rowOffset + 201}px`;
    stem.style.height = `${top < 2 ? rowOffset + 181 - labelTop - labelHeight : labelTop - rowOffset - 201}px`;
    caption.style.left = `${(inset() + x) / uiScale}px`;
    caption.style.top = `${labelTop}px`;
    // Rows of larger labels can reach past the stage: they can be panned into view.
    topExtent = Math.min(topExtent, labelTop);
    bottomExtent = Math.max(bottomExtent, labelTop + labelHeight);
    label.title.textContent =
      count > 1n ? summaryName(group) : span ? (span.metadata.title ?? '') : (group.title ?? '');
    caption.hidden =
      !!heading || (count === 1n && !(span ? span.metadata.title : group.title)?.trim());
    stem.hidden = caption.hidden;
    updateMomentTime(label, axisLabel(mid, 'event'));
    coordinate.title = presented(mid) + '\nExact: ' + mid.toString();
    ordered.push(stem, caption, button);
    hoverPreview.update(
      button,
      plugins,
      { ...metadata, title: span ? metadata.title : (group.title ?? metadata.title) },
      count,
      span ? 'Untitled duration' : 'Untitled moment',
    );
    if (count === 1n && group.id) {
      let branchDepth = 0;
      for (const field of pluginFields(activePlugins())) {
        if (field.kind !== 'stack') continue;
        const entries = stackEntries(metadata[field.metadataKey], stackFieldKeys());
        if (!entries.length) continue;
        const base = branchDepth;
        branchDepth += entries.length;
        const direction = top < 2 ? -1 : 1;
        const window = stackWindow(
          labelTop,
          direction,
          verticalOffset / uiScale,
          stageHeight() / uiScale,
          branchDepth,
        );
        const far = window.start + window.step * (branchDepth - 1);
        topExtent = Math.min(topExtent, far - 50);
        bottomExtent = Math.max(bottomExtent, far + 50);
        for (let index = Math.max(base, window.first); index <= window.last; index++) {
          const entry = entries[index - base];
          if (!entry) continue;
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
                animateLabel(node, [{ opacity: 0 }, { opacity: 1 }], {
                  duration: 220,
                  easing: 'ease-out',
                });
          }
          const y = window.start + window.step * index;
          const previous = index === 0 ? rowOffset + 192 : y - window.step;
          const title = typeof entry.metadata.title === 'string' ? entry.metadata.title : '';
          child.button.style.left = `${(inset() + x) / uiScale}px`;
          const size = pluginSize(activePlugins(), entry.metadata);
          child.button.dataset.size = size;
          child.button.style.top = `${y - { small: 16, medium: 22, large: 32 }[size] / 2}px`;
          child.button.dataset.stackEntry = entry.id;
          child.button.dataset.parentEvent = group.id;
          child.button.dataset.time = first.toString();
          child.button.setAttribute(
            'aria-label',
            `${title.trim() || 'Untitled stack entry'} — stack entry of ${group.title?.trim() || 'Untitled moment'}`,
          );
          child.button.title = `${title.trim() || 'Untitled stack entry'} (inherits ${presented(mid, 'input')})`;
          renderPluginMarker(
            child.button,
            imageSource(pluginMarker(activePlugins(), entry.metadata)),
            1n,
          );
          // A stack entry is as sensitive as its moment.
          markSensitive(child.button, metadata);
          const color = pluginColor(activePlugins(), entry.metadata);
          child.button.style.backgroundColor = color ?? '';
          child.button.style.borderColor = '';
          renderPluginShape(child.button, pluginShape(activePlugins(), entry.metadata));
          renderPluginOutline(child.button, pluginOutline(activePlugins(), entry.metadata));
          child.caption.style.left = `${(inset() + x) / uiScale}px`;
          child.caption.style.top = `${direction < 0 ? y - 13 - labelHeight : y + 16}px`;
          child.title.textContent = title;
          child.caption.hidden = !title.trim();
          child.stem.style.left = `${(inset() + x) / uiScale}px`;
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
          hoverPreview.update(
            child.button,
            activePlugins(),
            entry.metadata,
            1n,
            'Untitled stack entry',
          );
        }
      }
    }
  }
  for (const [key, label] of stackLabels)
    if (!stackRetained.has(key)) {
      removeMomentLabel(label, animateLiveFrame);
      stackLabels.delete(key);
    }
  const centered = centeredOffset();
  verticalMinimum = Math.min(centered, stageHeight() - bottomExtent * uiScale - 24);
  verticalMaximum = Math.max(centered, -topExtent * uiScale + 24);
  const clamped = Math.max(verticalMinimum, Math.min(verticalMaximum, verticalOffset));
  if (clamped !== verticalOffset) {
    verticalOffset = clamped;
    requestRender(false);
  }
  for (const layer of [el('axis'), el('edge-arcs'), el('duration-bands'), container, branches]) {
    layer.style.width = `${stageWidth() / uiScale}px`;
    layer.style.height = `${stageHeight() / uiScale}px`;
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
  // Fit has nothing to show on an empty timeline: say so instead of offering it.
  const nothing = !fittable();
  el('fit-button').hidden = nothing;
  el('empty-fit').hidden = nothing;
  text('empty-message', nothing ? emptyTimelineText : 'No moments in this window.');
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
    revealStep();
    // Opening is measured until its first view is painted; then each new view from a
    // navigation input, from that input until the view is painted.
    const view = viewKey();
    if (openStarted !== null) {
      const started = openStarted;
      openStarted = null;
      afterPaint(() => {
        capacity.open = performance.now() - started;
        updateCapacity();
      });
    } else if (navigationInput !== null && view !== drawnView) {
      // An input's view may come frames later (zooming animates): it counts once drawn.
      const input = navigationInput;
      navigationInput = null;
      afterPaint(() => {
        const wait = performance.now() - input;
        // A page hidden meanwhile was not painted, and a view seconds after the last input
        // did not come from it (following the latest moments, say): neither is a wait.
        if (document.hidden || wait > 5000) return;
        recordSample(capacity.navigation, wait);
        updateCapacity();
      });
    }
    drawnView = view;
  } else if (remote || local) {
    const source = local ?? remote!;
    const key = cacheKey(source);
    if (remoteCacheKey !== key) {
      clearTimeout(persistTimer);
      remoteCache.clear();
      remoteCacheKey = key;
      restoreWindows(key);
    }
    if (lastView) {
      const zoom = viewport.span.compare(lastView.span);
      if (zoom || viewport.left.compare(lastView.left))
        motion = zoom < 0 ? 'zoom-in' : zoom > 0 ? 'zoom-out' : 'pan';
    }
    lastView = viewport.clone();
    const query = remoteCache.plan(viewport, width(), pixels());
    const cached = remoteCache.get(viewport, query);
    const base =
      cached ??
      (liveTransitionPending
        ? frame
        : (remoteCache.nearest(viewport, Q.parse(query.threshold))?.frame ??
          remoteCache.visible(viewport)));
    const threshold = viewport.threshold(width(), pixels());
    // Pending requests keep the last confirmed grouping until the server supplies
    // its replacement; otherwise zooming would hide singleton markers prematurely.
    const displayThreshold = cached ? threshold : Q.zero;
    frame = ongoingToNow(
      sparseWorkspace()?.overlay(base, viewport, displayThreshold) ??
        regroup(base, displayThreshold),
      model?.presentation ?? remote?.presentation,
    );
    sparseWorkspace()?.evict(selected?.id, openDuration?.duration.id, historyEntities());
    drawFrame();
    if (!refreshFrame || cached) {
      if (cached) {
        revealStep();
        clearTimeout(frameTimer);
        ++frameRequest;
        windowController?.abort();
        schedulePrefetch();
      }
      el('loading-window').hidden = !!cached;
      return;
    }
    clearTimeout(frameTimer);
    clearTimeout(prefetchTimer);
    const request = ++frameRequest,
      id = source.id,
      revision = source.revision;
    windowController?.abort();
    el('loading-window').hidden = false;
    frameTimer = setTimeout(() => {
      // Native HTTP requests cannot be interrupted by AbortController: keep one active request.
      if (windowInFlight || comparisonInFlight) return;
      // The view's own window goes before predictions: a browser prefetch is cancelled, and
      // a desktop one (not interruptible) is waited for.
      if (prefetching) {
        if (local) {
          windowWaiting = true;
          return;
        }
        prefetchController?.abort();
      }
      windowInFlight = true;
      const controller = (windowController = new AbortController());
      const started = performance.now();
      let answered = false;
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
          answered = true;
          remoteCache.store(query, result);
          persistWindows();
          if (local) {
            recordSample(capacity.views, performance.now() - started);
            updateCapacity();
          }
          animateLiveFrame = liveTransitionPending;
          liveTransitionPending = false;
          requestRender(false);
          el('loading-window').hidden = true;
        })
        .catch((error) => {
          answered = true;
          // Refused access also forgets the windows stored for the timeline.
          if (remote?.id === id && session.user && [401, 403, 404].includes(error?.status))
            void windowStore
              .forget(timelinePrefix(storeScope(serverOrigin, session.user.id), id))
              .catch(() => {});
          if (request === frameRequest && !controller.signal.aborted) {
            if (local && saving) return;
            el('loading-window').hidden = true;
            // Edits stay; the view moves to the latest revision (#165).
            if (error?.status === 409 && dirty && remote && sparseWorkspace() && !workingProposal)
              void moveToLatest(id).catch(fail);
            else if (error?.status === 409 && !dirty && remote) {
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
          // A later view, or a reply for a revision or timeline no longer open, still needs
          // its own window: without one the view would stay loading (#218).
          if ((request !== frameRequest || !answered) && (remote || local)) requestRender();
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
    timeline: remoteId,
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
      timeline: id,
      revision: info.revision,
      event_generation: info.event_generation,
      title: info.title,
      first: info.first,
      last: info.last,
      presentation: info.presentation ? validatePresentation(info.presentation) : undefined,
      plugins: info.plugins ? validateInstalledPlugins(info.plugins) : [],
      assets: info.assets ? validateAssets(info.assets) : {},
      labels: contentLabels(info.labels),
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
/** Tells comparison offsets' units, which the comparison's time display defines. */
/** What offsets (time differences) a time display reads, said for people. */
function offsetUnits(presentation: TimePresentation | undefined): string {
  try {
    const difference = createDifference(presentation),
      names = difference.units.map((u) => u.plural ?? u.name);
    return names.length
      ? `Offsets take ${names.length > 14 ? names.slice(0, 14).join(', ') + ', …' : names.join(', ')}` +
          (difference.plain ? `; a plain number is ${difference.plain}.` : '.')
      : `Offsets are ${difference.plain ?? 'written as this time display reads them'}.`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
function describeOffsetUnits() {
  if (!comparison) return;
  const units = offsetUnits(comparison.presentation);
  text('comparison-offset-units', units);
  for (const field of document.querySelectorAll<HTMLInputElement>('.comparison-offset'))
    field.title = units;
}
function startComparison(sources: ComparisonSource[], presentation: TimePresentation) {
  cancelZoomAnimation();
  flushEventEdit();
  const view = new ComparisonView(sources, presentation);
  // Arcs between entities on different timelines (#422) come from the server.
  if (!offlineHtml)
    view.links = (query, signal) =>
      api<Pick<Frame, 'edges' | 'edgesTruncated'>>('timelines/links/query', 'POST', query, signal);
  if (!comparisonBefore)
    comparisonBefore = {
      viewport: viewport.clone(),
      verticalShift: verticalOffset - centeredOffset(),
      uiScale,
    };
  comparison?.dispose();
  comparisonController?.abort();
  windowController?.abort();
  clearTimeout(frameTimer);
  comparison = view;
  gateSensitive('compare:' + sources.map((source) => source.key).join(','));
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
    // A long title is cut to fit its row; the whole one shows on hover.
    title.title = track.source.title;
    const fields: HTMLInputElement[] = [];
    for (const name of ['Scale', 'Offset']) {
      const label = document.createElement('label');
      label.textContent = name;
      const field = document.createElement('input');
      field.value = name === 'Scale' ? '1' : '0';
      field.setAttribute('aria-label', `${name} for ${track.source.title}`);
      if (name === 'Offset') field.classList.add('comparison-offset');
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
          difference = createDifference(view.presentation),
          offset = difference.parse(fields[1].value);
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
        error.textContent = offset.numerator
          ? `Shifted ${offset.numerator < 0n ? 'earlier' : 'later'} by ${difference.print(offset.abs())}.`
          : '';
        frame = { groups: [], visitedNodes: 0 };
        requestRender();
      } catch (e) {
        error.textContent = e instanceof Error ? e.message : String(e);
      }
    };
    el('comparison-tracks').append(row);
  }
  describeOffsetUnits();
  el<HTMLDetailsElement>('comparison-alignment').open = false;
  text('comparison-alignment-summary', `Align timelines (${view.tracks.length})`);
  // Only a conflict between the sources' plugins is worth the room.
  text(
    'comparison-conflicts',
    view.conflicts.length
      ? `Different definitions share a plugin ID: ${view.conflicts.join(', ')}. The first selected timeline’s definition is used once; plugins enabled in any source are enabled in the view.`
      : '',
  );
  el('comparison-conflicts').hidden = !view.conflicts.length;
  setDashboard(false);
  heading();
  fit();
}
function stopComparison(restore = true) {
  if (!comparison) return;
  separation = null;
  shownView = null;
  el('separation-settings').hidden = true;
  comparisonController?.abort();
  comparison.dispose();
  comparison = null;
  fitStageToTracks();
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
    uiScale = comparisonBefore.uiScale;
    verticalOffset = centeredOffset() + comparisonBefore.verticalShift;
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
  frame = separatedFrame(
    cached ?? (liveTransitionPending ? frame : view.visible(viewport, width(), pixels())),
  );
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
        frame = separatedFrame(result);
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
/** The empty state's text for a timeline with nothing on it yet. */
let emptyTimelineText = 'This timeline has no moments yet.';
/** Whether Fit has anything to show: moments, or durations held in this page. */
function fittable(): boolean {
  if (comparison) return true;
  if (momentCount() > 0n) return true;
  return !!model && model.durations.size > 0;
}
/** Moments in the open timeline, including unsaved additions and deletions. */
function momentCount(): bigint {
  const sparse = sparseWorkspace();
  const delta = sparse
    ? [...sparse.changes.values()].reduce(
        (n, c) => n + (c.after ? 1n : 0n) - (c.before ? 1n : 0n),
        0n,
      )
    : 0n;
  return sparse
    ? BigInt((local ?? remote)?.event_count ?? 0) + delta
    : (model?.points.entryCount ?? BigInt(remote?.event_count ?? 0));
}
const DESKTOP_DOWNLOADS = 'https://github.com/openchronology/timeline-app/releases/latest';
const HOSTED_PLATFORM = 'https://timescale.info';
/** Where the open timeline lives, for capacity advice; null when there is nothing to advise on. */
function capacityPlatform(): Platform | null {
  if (comparison || !model || document.body.dataset.dashboard === 'true') return null;
  if (remote) return 'platform';
  return desktop ? 'desktop' : 'browser';
}
/** Identifies the open timeline, so measurements and dismissals belong to it. */
function capacityTimeline() {
  return remote ? 'remote:' + remote.id : local ? 'local:' + local.path : 'memory:' + model?.title;
}
/**
 * The capacity notices dismissed in this browser, by the hash of their timeline and advice
 * (dismissalHash). Other pages of the same origin (every file:// page, in some browsers) can
 * write this storage, so only a list of strings is trusted; anything else counts as none.
 */
function capacityDismissed(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('och-capacity-dismissed') ?? '[]');
    return Array.isArray(value)
      ? value.filter((v): v is string => typeof v === 'string').slice(-50)
      : [];
  } catch {
    return [];
  }
}
/**
 * A dismissal as it is stored: a short hash of the timeline and its advice, not its title or
 * file path, which other pages sharing the storage could otherwise read (FNV-1a, 32 bits:
 * a rare collision only hides a notice).
 */
function dismissalHash(id: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193);
  return 'h' + (hash >>> 0).toString(16);
}
/** A server's entry limit from its session: Infinity for none, the default if unsaid. */
function sessionEntryLimit(s: Session): number {
  if (s.entryLimit === null) return Infinity;
  return Number.isSafeInteger(s.entryLimit) && s.entryLimit! >= 1 ? s.entryLimit! : LIMIT;
}
/** How many entries of each kind the open timeline may hold: its server's limit, if any. */
function timelineEntryLimit(): number {
  return remote && !local ? sessionEntryLimit(session) : entryLimit();
}
/** Shows or hides the capacity notice for the open timeline. */
function updateCapacity() {
  const notice = el('capacity-notice');
  const platform = capacityPlatform();
  const key = capacityTimeline();
  // Measurements belong to the open document: renaming a timeline kept in the browser
  // changes its key (by title, so dismissals survive reopening it) but not its speed.
  const measuring = remote || local ? key : 'memory:' + documentRequest;
  if (measuring !== capacityKey) {
    capacityKey = measuring;
    capacity = { navigation: [], edits: [], views: [] };
  }
  const advice = platform
    ? advise(platform, capacity, {
        moments: Number(momentCount()),
        limit: timelineEntryLimit(),
        ...(model && !sparseWorkspace()
          ? { durations: model.durations.size, relationships: model.relationships.size }
          : {}),
      })
    : [];
  const id = key + '|' + advice.map((a) => a.kind).join(',');
  const dismissed = capacityDismissed().includes(dismissalHash(id));
  notice.hidden = !advice.length || dismissed;
  if (notice.hidden || notice.dataset.advice === JSON.stringify(advice)) return;
  notice.dataset.advice = JSON.stringify(advice);
  notice.dataset.dismissal = id;
  el('capacity-text').textContent = advice.map(capacityMessage).join(' ');
  const actions = el('capacity-actions');
  actions.replaceChildren();
  const action = (label: string, run: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.onclick = run;
    actions.append(button);
  };
  const link = (label: string, href: string) => {
    const a = document.createElement('a');
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label;
    actions.append(a);
  };
  if (advice.some((a) => a.kind === 'browser')) {
    if (session.user && !el('publish-button').hidden)
      action('Save to server', () => el('publish-button').click());
    else if (session.server && !session.user) action('Sign in', () => el('account-button').click());
    action('Export', () => el('export-button').click());
    link('Get the desktop app', DESKTOP_DOWNLOADS);
    if (offlineHtml) link('Open the platform', HOSTED_PLATFORM);
  }
  if (advice.some((a) => a.kind === 'desktop')) {
    if (!el('publish-button').hidden) action('Save to server', () => el('publish-button').click());
    else action('Server connection', () => el('server-button').click());
  }
}
const seconds = (ms: number) => (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' s';
function capacityMessage(advice: Advice): string {
  if (advice.kind === 'limit')
    return `This timeline has ${advice.count.toLocaleString()} ${advice.entity}; a timeline holds at most ${timelineEntryLimit().toLocaleString()}. Consider splitting it into several timelines.`;
  if (advice.kind === 'desktop')
    return `Views of this timeline take about ${seconds(capacity.views.at(-1) ?? 0)} on this computer. Saved to a server, the server does that work, and others can view and edit it too.`;
  const elsewhere = offlineHtml
    ? 'Large timelines are faster in the desktop app or on the OpenChronology platform.'
    : session.server
      ? 'Large timelines are faster in the desktop app, or saved to your account on this server.'
      : 'Large timelines are faster in the desktop app.';
  // The measurement that found the timeline slow.
  const slowMs = capacity.slow?.ms ?? 0;
  const cause = {
    open: `This timeline took ${seconds(slowMs)} to open in this browser.`,
    navigation: `Zooming and panning this timeline take about ${Math.round(slowMs)} ms to show in this browser.`,
    edit: `Keeping a draft of this timeline in this browser takes about ${Math.round(slowMs)} ms after each change.`,
    size: `This timeline has ${momentCount().toLocaleString()} moments, which is a lot to edit in a browser.`,
  }[advice.reason];
  return `${cause} ${elsewhere}`;
}
el('capacity-dismiss').onclick = () => {
  const id = el('capacity-notice').dataset.dismissal;
  if (!id) return;
  try {
    localStorage.setItem(
      'och-capacity-dismissed',
      JSON.stringify([...capacityDismissed(), dismissalHash(id)].slice(-50)),
    );
  } catch {
    // Without storage the notice stays dismissed until the next change.
  }
  el('capacity-notice').hidden = true;
};
/** The labels in fieldset `id` that are checked (#115). */
function checkedLabels(id: string): string[] {
  return contentLabels(
    [...el(id).querySelectorAll<HTMLInputElement>('input:checked')].map((box) => box.value),
  );
}
/**
 * Shows the labels of an entity's `metadata` in fieldset `field` (read-only when `readOnly`),
 * and, for readers warned of them, notice `note` above its details.
 */
function showLabels(
  field: string,
  note: string,
  metadata: Record<string, unknown> | undefined,
  readOnly: boolean,
) {
  const labels = contentLabels(metadata?.[CONTENT_LABELS_KEY]);
  for (const box of el(field).querySelectorAll<HTMLInputElement>('input')) {
    box.checked = labels.includes(box.value as never);
    box.disabled = readOnly;
  }
  // Readers see the labels as the notice; there is nothing for them to set.
  el(field).hidden = readOnly && !labels.length;
  sensitiveNote(note, labels);
}
/** The dialog's notice of an entity's sensitive-content `labels` (#115), and its images' blur. */
function sensitiveNote(note: string, labels: string[]) {
  const shown = [...new Set([...labels, ...timelineLabels()])];
  el(note).hidden = !warned() || !shown.length;
  el(note).querySelector('span')!.textContent =
    `Sensitive content: ${describeLabels(shown).toLowerCase()}.`;
  el(note)
    .closest('dialog')
    ?.toggleAttribute('data-sensitive', labels.length > 0);
}
/** Marks `element` as showing a labelled moment's or duration's images (#115). */
function markSensitive(element: Element, metadata: Record<string, unknown> | undefined) {
  element.toggleAttribute(
    'data-sensitive',
    contentLabels(metadata?.[CONTENT_LABELS_KEY]).length > 0,
  );
}
/** The open timeline's sensitive-content labels (#115), or its comparison's sources'. */
function timelineLabels(): string[] {
  return comparison
    ? contentLabels(comparison.tracks.flatMap((track) => track.source.labels ?? []))
    : contentLabels(remote?.labels);
}
/**
 * Whether the reader is warned of sensitive content: a server timeline (or comparison) they
 * cannot write. Its owner and writers see it as it is, and so do adults who chose to see
 * sensitive content without warnings (never accounts that may be under 18).
 */
function warned() {
  if (session.user?.showSensitive && !session.user.minor) return false;
  return (!!remote || !!comparison) && !local && !(remote?.canWrite && !comparison);
}
/** Images of labelled content are shown, for the open timeline (until the tab closes). */
let imagesShown = false,
  sensitiveKey = '';
const sessionKey = (kind: string) => `openchronology:${kind}:${sensitiveKey}`;
function remembered(kind: string) {
  try {
    return sessionStorage.getItem(sessionKey(kind)) === '1';
  } catch {
    return false;
  }
}
function remember(kind: string, value: boolean) {
  try {
    if (value) sessionStorage.setItem(sessionKey(kind), '1');
    else sessionStorage.removeItem(sessionKey(kind));
  } catch {
    /* Without storage it lasts until the page closes. */
  }
}
/** Shows what the open timeline is labelled as, and blurs its images until shown. */
function updateSensitive() {
  const labels = warned() ? timelineLabels() : [];
  const body = document.body;
  body.toggleAttribute('data-warnings', warned());
  body.toggleAttribute('data-sensitive', labels.length > 0);
  body.toggleAttribute('data-images-shown', imagesShown);
  el('sensitive-status').hidden = !labels.length;
  text('sensitive-labels', `Sensitive: ${describeLabels(labels).toLowerCase()}`);
  for (const button of document.querySelectorAll('.reveal-images'))
    button.textContent = imagesShown ? 'Blur images' : 'Show images';
  if (!labels.length) el('sensitive-gate').hidden = true;
}
/**
 * On opening timeline (or comparison) `key`: for a labelled one, the warning before it shows,
 * unless the reader chose to see it in this tab already (#115).
 */
function gateSensitive(key: string) {
  sensitiveKey = key;
  imagesShown = remembered('images');
  updateSensitive();
  const labels = warned() ? timelineLabels() : [];
  text(
    'sensitive-gate-description',
    `This timeline is labelled as containing ${describeLabels(labels).toLowerCase()}.`,
  );
  el('sensitive-gate').hidden = !labels.length || remembered('shown');
  if (!el('sensitive-gate').hidden) el('sensitive-gate-show').focus();
}
el('sensitive-gate-show').onclick = () => {
  remember('shown', true);
  el('sensitive-gate').hidden = true;
};
for (const button of document.querySelectorAll<HTMLButtonElement>('.reveal-images'))
  button.onclick = () => {
    imagesShown = !imagesShown;
    remember('images', imagesShown);
    updateSensitive();
  };
let pageTitled: string | null = null;
/**
 * Names the open timeline in the page's title (#210): "Its title · OpenChronology", and on
 * the website, through the page around the editor, with the site's name. The dashboard, or a
 * timeline still loading, leaves the page's own title.
 */
function updatePageTitle() {
  const shown = input('timeline-title').value.trim();
  const name =
    document.body.dataset.dashboard === 'true' || (!model && !remote && !comparison)
      ? ''
      : shown === 'Loading timeline…'
        ? ''
        : shown || 'Untitled timeline';
  if (name === pageTitled) return;
  pageTitled = name;
  document.title = name ? `${name} · OpenChronology` : 'OpenChronology — a place for moments';
  // Also kept here, for a page around the editor that starts listening after this is sent.
  document.documentElement.dataset.timelineTitle = name;
  if (platformEditor)
    window.parent.postMessage({ type: 'openchronology:title', title: name }, location.origin);
}
/**
 * Related timelines (#447), below a server timeline on the website: asked for once per
 * timeline, and hidden for anything else, such as a draft or a comparison. They are extra, so a
 * failure to load them just leaves them out.
 */
let relatedFor: string | null = null;
function updateRelated() {
  const id = platformEditor && remote && !remote.comparison && !comparison ? remote.id : null;
  if (id === relatedFor) return;
  relatedFor = id;
  const section = el('related-timelines');
  section.hidden = true;
  if (id)
    void api<{ timelines: RelatedTimeline[] }>(`timelines/${id}/related`)
      .then(({ timelines }) => relatedFor === id && showRelated(section, timelines))
      .catch(() => {});
}
function heading() {
  updateSensitive();
  updateRelated();
  updateLinkedFrom();
  el('view-mode-control').hidden = !mayEdit();
  input('view-mode').checked = viewMode;
  updateFollowControl();
  // Where the open timeline lives, for tests and benchmarks (bench/ui.mjs).
  document.documentElement.dataset.storage =
    local?.id === 'local-sqlite' ? 'sqlite' : remote ? 'server' : 'memory';
  el('memory-notice').hidden =
    !sessionKnown ||
    !memoryOnly() ||
    !!remote ||
    !!comparison ||
    !model ||
    document.body.dataset.dashboard === 'true';
  // Which server the open timeline is on, when the desktop is connected to several.
  const server = el('timeline-server');
  server.hidden = !remote || !severalServers();
  if (!server.hidden) serverChip(serverOrigin, server);
  el('guest-fork-button').hidden =
    offlineHtml ||
    desktop ||
    !!session.user ||
    !remote ||
    remote.visibility !== 'public' ||
    !!comparison;
  void live?.update();
  el('comparison-settings').hidden = !comparison || !!separation;
  el('separation-settings').hidden = !separation;
  updateDefaultViewControls();
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
  // Says that images from other sites wait only while this timeline's do, once one has.
  el('remote-images-status').hidden =
    remoteImagesHeld !== documentRequest || remoteImagesNoticed !== documentRequest;
  // The heading the page arrived with stands until its timeline has loaded (#428), instead of
  // the sample's or "Loading timeline…"; any other document ends it.
  const holding =
    prefilled !== null && documentRequest === prefillRequest && remote?.id !== prefilled;
  if (prefilled !== null && !holding) {
    prefilled = null;
    delete el('timeline-description-view').closest<HTMLElement>('.document-heading')!.dataset
      .prefill;
  }
  if (!holding) {
    // The timeline's own image (#339) above its title, from its copy when it carries one; a
    // comparison shows its sources and has none.
    const image = comparison ? null : model ? model.image : remote?.image;
    const picture = el<HTMLImageElement>('timeline-image'),
      source = imageSource(image?.url ?? null);
    if (picture.getAttribute('src') !== source) {
      if (source) picture.src = source;
      else picture.removeAttribute('src');
    }
    picture.alt = image?.alt ?? '';
    picture.hidden = !source;
    // A separation is the open timeline itself (#416: often how it opens), so it keeps its title.
    input('timeline-title').value =
      comparison && !separation
        ? remote?.comparison
          ? remote.title
          : 'Timeline comparison'
        : (model?.title ?? remote?.title ?? 'Loading timeline…');
    el<HTMLTextAreaElement>('timeline-description').value =
      model?.description ?? remote?.description ?? '';
  }
  input('timeline-title').disabled = !editable();
  el<HTMLTextAreaElement>('timeline-description').disabled = !editable();
  if (!holding) showDescription();
  updatePageTitle();
  const count = momentCount();
  if (!holding)
    text(
      'event-count',
      comparison && !separation
        ? `${comparison.tracks.length} timelines · Read-only comparison`
        : momentsText(count),
    );
  // Whose timeline: its owner on a server, the workspace for a local one, and nothing while one
  // loads (or the owner the page arrived with, #428), rather than a workspace that isn't it.
  if (!holding)
    text(
      'owner-label',
      remote ? remote.owner : !model ? '' : desktop ? 'Offline workspace' : 'Local workspace',
    );
  const ownerLink = el<HTMLAnchorElement>('owner-label');
  if (holding) {
    /* The link the page arrived with stays. */
  } else if (remote) {
    ownerLink.href =
      (desktop ? serverOrigin : '') +
      ('slug' in remote ? profilePath(remote.owner) : '/users/' + encodeURIComponent(remote.owner));
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
        : 'Browser draft',
  );
  text(
    'publish-button',
    workingProposal
      ? 'Update pull request'
      : remote
        ? (remote.canWrite ?? remote.canEdit)
          ? SAVE_TO_SERVER
          : 'Submit pull request'
        : SAVE_TO_SERVER,
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
  // Shown while separated too (#548), with how many separations are shown; not while
  // comparing other timelines.
  el('separate-button').hidden = (!!comparison && !separation) || (!model && !remote && !local);
  const separations = separation ? separation.tracks.length : 0;
  el('separate-count').hidden = !separations;
  text('separate-count', separations ? String(separations) : '');
  el('separate-count').setAttribute(
    'aria-label',
    separations === 1 ? '1 separation shown' : `${separations} separations shown`,
  );
  el('search-bar').hidden = !!comparison || (!model && !remote && !local);
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
  updateCapacity();
}
/**
 * Version 1 kept one whole document under "drafts/current". Version 2 keeps a draft record
 * by record (see drafts.ts): its settings under "drafts/settings", embedded assets under
 * "drafts/assets", and one store per kind of entity. Each draft has a database of its own,
 * listed with the others (draft-store.ts, #188).
 */
async function loadDraft(id: string): Promise<TimelineDocument | null> {
  const db = await openDraftDb(id);
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(['drafts', ...DRAFT_STORES]);
      const drafts = tx.objectStore('drafts');
      const settings = drafts.get('settings'),
        assets = drafts.get('assets'),
        legacy = drafts.get('current');
      const all = Object.fromEntries(
        DRAFT_STORES.map((name) => {
          const store = tx.objectStore(name);
          return [name, { keys: store.getAllKeys(), values: store.getAll() }];
        }),
      );
      tx.oncomplete = () => {
        if (!settings.result) return resolve(legacy.result ?? null);
        const retired = all['draft-retired'];
        resolve(
          draftDocument({
            settings: settings.result,
            ...(assets.result === undefined ? {} : { assets: assets.result }),
            moments: all['draft-moments'].values.result,
            durations: all['draft-durations'].values.result,
            links: all['draft-links'].values.result,
            retired: (retired.keys.result as string[]).map((id, i) => [
              id,
              retired.values.result[i] as string,
            ]),
          }),
        );
      };
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
/**
 * The draft (#188) a timeline in the browser is, once it is one, and that timeline: opening
 * anything else, however it is opened, leaves the draft.
 */
let draftOf: { id: string; model: TimelineIndex } | null = null;
/** The open timeline's draft, if it is one. */
const openDraft = () => (draftOf && draftOf.model === model ? draftOf.id : null);
/** For each draft, the index whose records it holds, and the assets it last stored. */
const storedDrafts = new Map<string, { index: TimelineIndex; assets: unknown }>();
/**
 * Stores the open timeline's draft in one transaction: every record when a different
 * timeline was stored last, otherwise only the records its journal names. Returns the
 * time spent on this thread (building and cloning records), which pauses the page.
 */
async function storeDraft(index: TimelineIndex, id: string): Promise<number> {
  const db = await openDraftDb(id);
  let busy = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const started = performance.now();
      const tx = db.transaction(['drafts', ...DRAFT_STORES], 'readwrite');
      const drafts = tx.objectStore('drafts');
      const stored = storedDrafts.get(id),
        full = stored?.index !== index;
      let writes: DraftWrite[];
      if (full) {
        index.takeChanges();
        for (const name of DRAFT_STORES) tx.objectStore(name).clear();
        drafts.delete('current');
        writes = allDraftWrites(index);
      } else writes = draftWrites(index, index.takeChanges());
      for (const { store, key, value } of writes)
        if (value === undefined) tx.objectStore(store).delete(key);
        else tx.objectStore(store).put(value, key);
      drafts.put(draftSettings(index), 'settings');
      // Embedded images can be megabytes; store them again only when they change.
      if (full || index.assets !== stored?.assets) {
        if (index.assets === undefined) drafts.delete('assets');
        else drafts.put(index.assets, 'assets');
      }
      // Later saves queue behind this transaction (IndexedDB runs writers in order), so they
      // can write only their changes as soon as this one is queued.
      storedDrafts.set(id, { index, assets: index.assets });
      busy = performance.now() - started;
      // Visible to performance tooling (and the capacity benchmarks).
      if (!full)
        performance.measure('openchronology:draft-changes', { start: started, duration: busy });
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => {
        // The journal was consumed; the next save rewrites the whole draft.
        storedDrafts.delete(id);
        reject(tx.error);
      };
    });
  } finally {
    db.close();
  }
  // The list of drafts says what it holds now.
  if (session.user)
    await recordDraft({
      id,
      owner: session.user.id,
      title: index.title,
      description: index.description,
      tags: index.tags ?? [],
      moments: Number(index.points.entryCount),
      updated: new Date().toISOString(),
    });
  return busy;
}
async function retainForSignIn() {
  flushEventEdit();
  if (!model || memoryOnly()) return;
  const db = await openDraftDb(MAIN_DRAFT);
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
          sparseLinks: sparseWorkspace()
            ? [...sparseWorkspace()!.relationshipChanges.values()]
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
          // The draft it is, so it is that draft again afterwards (#188).
          draft: openDraft(),
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
  const db = await openDraftDb(MAIN_DRAFT);
  try {
    const saved = await new Promise<
      | {
          document: TimelineDocument;
          remote: { id: string; revision: string; head_revision_id?: string } | null;
          sparse?: { before?: PointEvent; after?: PointEvent }[];
          sparseDurations?: { before?: Duration; after?: Duration }[];
          sparseLinks?: { relationship: Relationship; related: boolean }[];
          proposal?: { id: string; revision: string } | null;
          dirty: boolean;
          draft?: string | null;
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
    // Work in the browser comes back as the draft it was; a server timeline's, as its edits.
    loadDocument(
      validateDocument(saved.document),
      saved.remote ? null : typeof saved.draft === 'string' ? saved.draft : newDraftId(),
    );
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
          for (const { relationship, related } of saved.sparseLinks ?? [])
            if (related) index.relate(relationship.a, relationship.b);
            else index.unrelate(relationship.a, relationship.b);
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
        if (!location.hash) window.history.replaceState(null, '', timelineHash(remote.id));
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
  // A dialog's unkept preview is not stored; Save or discarding stores the result.
  if (memoryOnly() || remote || desktop || !model || previewing) return;
  // A timeline becomes a draft of its own when first edited (#188): not the sample, or a new
  // timeline, until then.
  if (!openDraft() && !dirty) return;
  if (!openDraft()) draftOf = { id: newDraftId(), model };
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    draftTimer = undefined;
    const id = openDraft();
    if (memoryOnly() || remote || !model || sparseWorkspace() || previewing || !id) return;
    const full = storedDrafts.get(id)?.index !== model;
    void storeDraft(model, id)
      .then((busy) => {
        // The first save of a timeline writes every record; later saves are what edits cost.
        if (!full) {
          recordSample(capacity.edits, busy);
          updateCapacity();
        }
        if (!remote) text('save-status', 'Saved in this browser');
      })
      .catch(() => {
        text('save-status', 'Browser storage unavailable — export to keep your work');
      });
  }, 700);
}
/** Stores the open draft now, if it was waiting to be, before another timeline replaces it. */
function flushDraft() {
  const id = openDraft();
  if (draftTimer === undefined || !id || !model || remote || memoryOnly()) return;
  clearTimeout(draftTimer);
  draftTimer = undefined;
  void storeDraft(model, id).catch(() => {});
}
function changed() {
  editVersion++;
  dirty = true;
  heading();
  requestRender();
  persistDraft();
}
/**
 * Opens `doc` in the browser. As draft `draft` (#188) it is stored as that draft at once;
 * without one it becomes a new draft when first edited.
 */
function loadDocument(doc: TimelineDocument, draft: string | null = null) {
  // Imports start timing when the file is read; other opens start here, before indexing.
  openStarted = pendingOpenStart ?? performance.now();
  pendingOpenStart = null;
  capacity = { navigation: [], edits: [], views: [] };
  cancelZoomAnimation();
  if (doc.comparison)
    throw new Error(
      'Saved comparisons need their server sources. Open the comparison on the server, or import an individual source timeline.',
    );
  stopComparison(false);
  setDashboard(false);
  // The draft open until now is kept, as it stood (#188).
  flushDraft();
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
  draftOf = draft ? { id: draft, model } : null;
  viewport = openingView(model);
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
        const generation = await window.__TAURI__!.core.invoke<number>('desktop_accept_open', {
          path: result.path,
        });
        if (workspace !== documentRequest || version !== editVersion) return;
        model = new RemoteWorkspace(header);
        if (selected) sparseWorkspace()!.load(selected);
        local = { ...result, generation, id: 'local-sqlite', revision: String(generation) };
        desktopSettings = JSON.stringify(model.document());
        desktopSavedBaseline = null;
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
      location.hash = timelineHash(t.id).slice(1);
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
async function openRemote(id: string, restoreSeparation = true) {
  saveView(0);
  stopComparison(false);
  setDashboard(false);
  workingProposal = null;
  const request = ++documentRequest;
  // Opening the timeline the page arrived with keeps its heading until it has loaded.
  if (id === prefilled && prefillRequest === request - 1) prefillRequest = request;
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
  reportedLink = null;
  gateSensitive(id);
  if (embedded) {
    el<HTMLAnchorElement>('embed-open').href = sharePath(remote, null);
    el('embed-open').hidden = false;
  }
  if (info.presentation) info.presentation = validatePresentation(info.presentation);
  if (info.plugins) info.plugins = validateInstalledPlugins(info.plugins);
  if (info.assets) info.assets = validateAssets(info.assets);
  if (info.tags) info.tags = validateTags(info.tags);
  info.image = info.image ? validateTimelineImage(info.image) : undefined;
  info.view = readTimelineView(info.view);
  info.views = readSavedViews(info.views);
  if (info.comparison) {
    const sources = await comparisonSources(info.comparison.sources);
    if (request !== documentRequest) return;
    startComparison(sources, info.presentation ?? sources[0].presentation ?? DEFAULT_PRESENTATION);
    comparison!.combined = info.comparison.combined;
    el<HTMLInputElement>('compare-combined').checked = info.comparison.combined;
    restoreView();
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
      image: info.image,
      view: info.view,
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
  const stored = restoreView();
  dirty = false;
  heading();
  // A reload in this tab shows it as it was, separated or rejoined (#128); otherwise it opens
  // in its default view (#416). A link to a moment shows the whole timeline.
  if (restoreSeparation) {
    // A link to one of its views (#550) opens in that view.
    const linked = linkedViewId();
    if (linked && (await openLinkedView(linked))) {
      // Opened.
    } else if (stored.separation) startSeparation(stored.separation);
    else if (!stored.left) await openDefaultView(info.view);
  }
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
  // Work kept nowhere else: a timeline only in memory, or edits not yet saved to the server
  // (in a browser; the desktop app's window is not a page left this way).
  const unkept = memoryOnly() ? !remote : !desktop && !!remote && !embedded;
  if (unkept && !comparison && (dirty || pendingEventEdit)) {
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
  // The older desktop sign-in link, /#desktop/CODE: approval happens only on the website's
  // approval page, which shows the request's details and asks for the code to be typed.
  const desktopRequest = /^#desktop\/([A-Z2-9]{10})$/.exec(location.hash);
  if (desktopRequest && !desktop) {
    location.replace('/connect/desktop/' + desktopRequest[1]);
    return;
  }
  const compared = /^#compare\/([a-f0-9,-]+)$/i.exec(location.hash);
  if (compared) {
    if (comparison) return;
    const ids = [...new Set(compared[1].split(','))];
    const limit = compareLimit();
    if (
      ids.length < 2 ||
      ids.length > limit ||
      ids.some((id) => !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))
    )
      throw new Error(
        `Select two to ${limit} valid timelines${!session.user && limit < 8 ? '; signed in, you can compare more' : ''}.`,
      );
    setDashboard(false);
    const request = documentRequest;
    const sources = await comparisonSources(ids);
    if (request === documentRequest) await comparisons.start(sources);
    if (request === documentRequest && comparison) {
      restoreView();
      requestRender();
    }
    return;
  }
  if (embedded) {
    if (remote?.id !== embedded) await openRemote(embedded);
    await followLink(parseLink(location.hash));
    return;
  }
  // The desktop's links also name the timeline's server: #server/<origin>/timeline/<id>.
  const match = /^#(?:server\/([^/]+)\/)?timeline\/([a-f0-9-]+)(?:\/(.+))?$/i.exec(location.hash);
  if (match) {
    const origin = desktop && match[1] ? safeDecode(match[1]) : serverOrigin;
    match.splice(1, 1);
    if (desktop && !connected.includes(origin))
      throw new Error(`Connect to ${serverHost(origin)} to open this timeline.`);
    // What to look at: the frame's own link (followed once), or the platform page's fragment.
    const link = parseLink(match[2] ?? '') ?? parentLink();
    if (match[2]) window.history.replaceState(null, '', timelineHash(match[1], origin));
    if (remote?.id === match[1] && origin === serverOrigin && !force) {
      setDashboard(false);
      requestRender();
      await followLink(link);
      return;
    }
    if (!mayReplace()) {
      window.history.replaceState(null, '', remote ? timelineHash(remote.id) : location.pathname);
      return;
    }
    if (origin !== serverOrigin) {
      useServer(origin);
      accountHeading();
    }
    // A link names what to show, which a stored separation would hide.
    await openRemote(match[1], !link || link.kind === 'view');
    await followLink(link);
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
/** The metadata keys of the active plugins' stack fields. */
function stackFieldKeys() {
  return pluginFields(activePlugins())
    .filter((f) => f.kind === 'stack')
    .map((f) => f.metadataKey);
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
      false,
      selected ? relationshipContext({ moment: selected.id }) : undefined,
    );
  } catch {
    /* Preserve incomplete raw JSON while editing. */
  }
}
function changePlugins(plugins: InstalledPlugin[]) {
  if (!editable()) return;
  const validated = validateInstalledPlugins(plugins);
  for (const { manifest } of validated) checkPluginScript(manifest);
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
      ? 'Plugins run locally. The official plugins are included; choose Custom to create or import others. External icons need embedded copies.'
      : 'Applied from top to bottom. Later plugins override matching fields and marker effects. Removing a plugin keeps all moment metadata.',
  );
  el('plugins-add').hidden = !editable();
  el('plugins-create').hidden = !editable();
  el('suites-add').hidden = !editable();
  el('suites-create').hidden = !editable() || !installed.length;
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
    // Timeline-wide settings (#223), such as the timeline's background image or its theme's
    // colors and fonts (#230): set here, as they belong to no moment or duration. A change is
    // saved like any plugin change; clearing one goes back to the default.
    const settings = (entry.manifest.settings ?? []).map((setting) => {
      const label = document.createElement('label');
      label.className = 'plugin-setting';
      const current = entry.settings?.[setting.key] ?? '';
      const problem = document.createElement('span');
      problem.className = 'form-error';
      problem.setAttribute('role', 'alert');
      const save = (value: string) => {
        if (value && !settingValue(setting, value)) {
          problem.textContent = SETTING_PROBLEMS[setting.kind];
          return;
        }
        problem.textContent = '';
        changePlugins(
          installedPlugins().map((p) =>
            p.manifest.id === entry.manifest.id
              ? { ...p, settings: { ...p.settings, [setting.key]: value } }
              : p,
          ),
        );
      };
      const field = document.createElement('input');
      field.disabled = !editable();
      field.dataset.pluginSetting = setting.key;
      if (setting.kind === 'color') {
        // A color input always holds a color, so "Use default" is how one is cleared.
        field.type = 'color';
        field.value = current || '#000000';
        field.onchange = () => save(field.value);
        const state = document.createElement('span');
        state.className = 'field-hint';
        state.textContent = current ? current : 'Default';
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.textContent = 'Use default';
        reset.disabled = !current || !editable();
        reset.onclick = () => save('');
        const row = document.createElement('span');
        row.className = 'plugin-setting-color';
        row.append(field, state, reset);
        label.append(setting.label, row, problem);
        return label;
      }
      if (setting.kind === 'text-size') {
        // A size is picked from steps of the usual size (#267); "Default" clears it.
        const sizes = document.createElement('select');
        sizes.disabled = !editable();
        sizes.dataset.pluginSetting = setting.key;
        const steps = ['75', '90', '110', '125', '150', '175', '200'];
        if (current && !steps.includes(current)) steps.push(current);
        sizes.append(
          new Option('Default (100%)', ''),
          ...steps
            .sort((a, b) => Number(a) - Number(b))
            .map((step) => new Option(`${step}%`, step)),
        );
        sizes.value = current;
        sizes.onchange = () => save(sizes.value);
        label.append(setting.label, sizes, problem);
        return label;
      }
      if (setting.kind === 'font') {
        field.type = 'text';
        field.maxLength = 200;
        field.spellcheck = false;
        field.placeholder = 'Default font';
        field.setAttribute('list', 'theme-fonts');
      } else {
        field.type = 'url';
        field.placeholder = 'https://…';
      }
      field.value = current;
      field.onchange = () => save(field.value.trim());
      label.append(setting.label, field, problem);
      return label;
    });
    if (installed.some((p) => p.manifest.settings?.some((s) => s.kind === 'font')))
      list.append(themeFontList());
    item.append(name, description, ...settings, toggle, actions);
    list.append(item);
  });
}
/** What to say of a timeline setting that isn't a value of its kind. */
const SETTING_PROBLEMS: Record<PluginSetting['kind'], string> = {
  'image-url': 'Enter an HTTPS image address.',
  color: 'Choose a color.',
  font: 'Use font names separated by commas, such as Georgia, serif.',
  'text-size': `Choose a size from ${TEXT_SIZE.min}% to ${TEXT_SIZE.max}%.`,
};
/** Fonts suggested for a theme's font settings: the heading fonts (any installed one works). */
function themeFontList() {
  const fonts = document.createElement('datalist');
  fonts.id = 'theme-fonts';
  for (const font of HEADING_FONTS) fonts.append(new Option(font.label, font.value));
  return fonts;
}
/**
 * The official plugins ship with every build, so the library works without a server: the
 * offline file and a desktop app with no server search them here, with no request, and a
 * server that cannot be reached (or a static site with none) falls back to them.
 */
async function searchPlugins() {
  const request = ++pluginSearchRequest,
    doc = documentRequest;
  text('plugin-library-error', '');
  text('plugin-library-status', 'Loading plugin library…');
  el('plugin-library-results').replaceChildren();
  el<HTMLButtonElement>('plugin-previous').disabled = true;
  el<HTMLButtonElement>('plugin-next').disabled = true;
  const query = { search: input('plugin-search').value, page: pluginPage, limit: 12 };
  const origin = pluginServer();
  let bundled = offlineHtml || (desktop && !sessionOf(origin).server),
    unreachable = false;
  try {
    let result: { plugins: PluginManifest[]; total: number; pages: number; page: number };
    if (bundled) result = searchPluginLibrary(BUILTIN_PLUGINS, query);
    else
      try {
        result = await requestApi(
          'plugins/search',
          'POST',
          { ...query, sort: input('plugin-sort').value },
          sessionOf(origin).csrf,
          undefined,
          desktop ? origin : undefined,
        );
      } catch (error) {
        if (request !== pluginSearchRequest || doc !== documentRequest) return;
        // A refused search is reported; a server that cannot be reached, or fails, is skipped.
        const status = (error as { status?: number }).status;
        if (status && status < 500) throw error;
        result = searchPluginLibrary(BUILTIN_PLUGINS, query);
        bundled = unreachable = true;
      }
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
      (unreachable ? 'The server’s library is unreachable. ' : '') +
        (bundled
          ? `${result.total} official plugins included with this app`
          : `${result.total} available`) +
        ` · Page ${pluginPage} of ${Math.max(1, result.pages)}`,
    );
    el<HTMLButtonElement>('plugin-previous').disabled = pluginPage <= 1;
    el<HTMLButtonElement>('plugin-next').disabled = pluginPage >= result.pages;
    for (const manifest of plugins) {
      const item = document.createElement('section');
      item.className = 'library-plugin';
      // Where it comes from, when the desktop is connected to several servers.
      if (severalServers() && !bundled) item.append(serverChip(origin));
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
      const present = installedPlugins().find((p) => p.manifest.id === manifest.id);
      // An older version installed can be updated in place, keeping its order, whether it is
      // enabled and the settings the newer one still declares (Timeline theme 2 adds sizes).
      const update = !!present && present.manifest.version < manifest.version;
      button.textContent = update
        ? `Update to v${manifest.version}`
        : present
          ? 'Installed'
          : 'Add to timeline';
      button.disabled = (!!present && !update) || !editable();
      button.onclick = () => {
        if (doc !== documentRequest) return;
        try {
          changePlugins(
            update
              ? installedPlugins().map((p) =>
                  p.manifest.id === manifest.id ? { ...p, manifest } : p,
                )
              : [...installedPlugins(), { manifest, enabled: true }],
          );
          el<HTMLDialogElement>('plugin-library-dialog').close();
          toast(
            update
              ? `${manifest.name} is updated to v${manifest.version} on this timeline.`
              : `${manifest.name} is now active on this timeline.`,
          );
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
  const manifest = validatePluginManifest({ ...definition, ...(source.trim() ? { source } : {}) });
  checkPluginScript(manifest);
  return manifest;
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
// Plugin suites (#78): several plugins added at once, and made from a timeline's plugins.
createSuiteUI({
  editable,
  installed: installedPlugins,
  change: changePlugins,
  library: () =>
    offlineHtml || (desktop && !session.server)
      ? null
      : (path, method, body) => api(path, method, body),
  publish: () =>
    session.user && session.server && !offlineHtml
      ? (suite) => api('plugins/suites/publish', 'POST', suite)
      : null,
  chip: () => (severalServers() ? serverChip(serverOrigin) : null),
  download,
  toast,
});
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
    checkPluginScript(manifest);
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
/** Included plugins list by name; popularity and age come from a server's library. */
function pluginSortShown() {
  input('plugin-sort').closest('label')!.hidden =
    offlineHtml || (desktop && !sessionOf(pluginServer()).server);
}
/** The server whose library is shown: on a desktop, the one chosen there. */
function pluginServer() {
  return (desktop && el<HTMLSelectElement>('plugin-server').value) || serverOrigin;
}
el<HTMLSelectElement>('plugin-server').onchange = () => {
  clearTimeout(pluginSearchTimer);
  pluginPage = 1;
  pluginSortShown();
  void searchPlugins();
};
input('plugin-sort').onchange = () => {
  clearTimeout(pluginSearchTimer);
  pluginPage = 1;
  void searchPlugins();
};
el('plugins-add').onclick = () => {
  if (!editable()) return;
  pluginPage = 1;
  input('plugin-search').value = '';
  // A desktop connected to several servers can browse each one's library.
  const servers = el<HTMLSelectElement>('plugin-server');
  servers.closest('label')!.hidden = !severalServers();
  servers.replaceChildren(
    ...connected.map(
      (origin) => new Option(serverHost(origin), origin, false, origin === serverOrigin),
    ),
  );
  pluginSortShown();
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
  hideReader();
  text('moment-heading', title);
  // A duration showing in the dialog gives way to the moment.
  if (!el('duration-dialog').hidden) durationDialog.close(true);
  showInspector();
}
/**
 * Opens the event dialog, or keeps it open if it is closing: the wrapper (dialogs.ts) then
 * stops the exit animation, and older browsers refuse showModal on a dialog already modal.
 */
function showInspector() {
  const dialog = el<HTMLDialogElement>('inspector');
  if (dialog.open && dialog.dataset.dialogClosing === undefined) return;
  try {
    dialog.showModal();
  } catch {
    // Already modal: the exit animation was stopped, so it stays open.
  }
}
/**
 * The event dialog's duration panel (#215), used as the duration's own dialog was: showing it
 * replaces the moment's panel without changing what is modal, which would restyle the whole
 * page. Closed, it returns to the moment (or group) it was opened over, or closes the dialog.
 */
let durationOverMoment = false;
const durationDialog = {
  get open() {
    return el<HTMLDialogElement>('inspector').open && !el('duration-dialog').hidden;
  },
  showModal() {
    const dialog = el<HTMLDialogElement>('inspector');
    hideReader();
    if (el('duration-dialog').hidden)
      durationOverMoment = dialog.open && dialog.dataset.dialogClosing === undefined;
    el('moment-panel').hidden = true;
    el('duration-dialog').hidden = false;
    dialog.setAttribute('aria-labelledby', 'duration-heading');
    showInspector();
  },
  /** Ends the duration's session; `keepDialog` when the caller shows a moment next. */
  close(keepDialog = false) {
    if (el('duration-dialog').hidden) return;
    if (!keepDialog && !durationOverMoment) return el<HTMLDialogElement>('inspector').close();
    durationClosed();
    showMomentPanel();
  },
};
/** What the reader shows (#233), for sharing and reporting it. */
let reader: { kind: 'moment' | 'duration'; id: string; title: string } | null = null;
/**
 * Opens a moment or duration in the reader, in place of the event dialog's panels: what it
 * says, as a full-size hover card, with its relationships to follow.
 */
function showReader(
  kind: 'moment' | 'duration',
  id: string,
  metadata: Record<string, unknown>,
  when: string,
) {
  hoverPreview.hide();
  summaryExpansion.hide();
  if (!el('duration-dialog').hidden) durationDialog.close(true);
  const untitled = kind === 'moment' ? 'Untitled moment' : 'Untitled duration';
  const title = (typeof metadata.title === 'string' && metadata.title.trim()) || untitled;
  reader = { kind, id, title };
  text('reader-title', title);
  const plugins = installedPlugins();
  renderReader(el('reader-body'), {
    kind,
    metadata,
    plugins: kind === 'moment' ? momentPlugins(plugins) : durationPlugins(plugins),
    when,
    markdown: pluginRichText(plugins),
  });
  sensitiveNote('reader-sensitive', contentLabels(metadata[CONTENT_LABELS_KEY]));
  renderRelated(el('reader-related'), kind === 'moment' ? { moment: id } : { duration: id }, true);
  el('reader-fit').hidden = kind !== 'duration';
  el('reader-share').hidden = !shareable();
  el('reader-report').hidden = el('reader-share').hidden || !!remote?.canShare;
  el('moment-panel').hidden = true;
  el('reader-panel').hidden = false;
  el('inspector').classList.add('reading');
  el('inspector').setAttribute('aria-labelledby', 'reader-title');
  el('reader-body').scrollTop = 0;
  showInspector();
  reportLink({ kind, id });
}
/** The event dialog's own panels again, in place of the reader. */
function hideReader() {
  if (el('reader-panel').hidden) return;
  el('reader-panel').hidden = true;
  el('inspector').classList.remove('reading');
  el('moment-panel').hidden = false;
  el('inspector').setAttribute('aria-labelledby', 'moment-heading');
  reader = null;
}
el('reader-close').onclick = () => el<HTMLDialogElement>('inspector').close();
el('reader-fit').onclick = () => {
  if (reader?.kind === 'duration') fitDuration(reader.id);
};
el('reader-share').onclick = () => {
  if (reader) requestShare({ kind: reader.kind, id: reader.id }, reader.title);
};
el('reader-report').onclick = () => {
  if (reader) requestReport(reader.kind, reader.id, reader.title);
};
el('view-mode').addEventListener('change', () => {
  viewMode = input('view-mode').checked;
  try {
    if (viewMode) localStorage.setItem('openchronology:view-mode', '1');
    else localStorage.removeItem('openchronology:view-mode');
  } catch {
    /* Without storage it lasts until the page closes. */
  }
  // What was open was opened for the other mode.
  el<HTMLDialogElement>('inspector').close();
  heading();
  render();
});
/** The moment's panel again, in place of the duration's. */
function showMomentPanel() {
  el('duration-dialog').hidden = true;
  el('moment-panel').hidden = false;
  el('inspector').setAttribute('aria-labelledby', 'moment-heading');
  durationOverMoment = false;
}
el('duration-close').onclick = () => durationDialog.close();
// Escape on a duration opened over a moment goes back to the moment, as × does.
el('inspector').addEventListener(
  'cancel',
  (event) => {
    if (!durationDialog.open || !durationOverMoment) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    durationDialog.close();
  },
  true,
);
/**
 * A separated track's moment as the open timeline keeps it (#345): its own ID, without the
 * track's key, and without the comparison's notes. Separated tracks keep their times.
 */
function separatedMoment(event: PointEvent): PointEvent {
  const track = comparison?.tracks.find((t) => event.id.startsWith(t.source.key + ':'));
  if (!separation || !track || !('comparisonSource' in event.metadata)) return event;
  const { comparisonSource: _source, originalTime: _time, ...metadata } = event.metadata;
  return { ...event, id: event.id.slice(track.source.key.length + 1), metadata };
}
function eventForm(event?: PointEvent, time?: Q) {
  if (comparison && !event) return;
  // Opening another entity ends the current session without keeping it.
  discardMomentEdits();
  if (event && !comparison) {
    sparseWorkspace()?.load(event);
    event = model?.byId.get(event.id) ?? event;
  }
  if (event && reading()) {
    selected = event;
    requestRender();
    const read = separatedMoment(event);
    return showReader('moment', read.id, read.metadata, presentedAlone(Q.parse(read.time)));
  }
  pendingEventEdit = false;
  eventEditHistory = null;
  selectionRequest++;
  clearGroupPage();
  selected = event ?? null;
  momentSession =
    editable() && !comparison ? { document: documentRequest, isNew: !event, draft: null } : null;
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
  input('event-tags').value = event ? entityTags(event.metadata).join(', ') : '';
  showLabels('event-labels', 'moment-sensitive', event?.metadata, !editable());
  const rest = { ...event?.metadata };
  delete rest.title;
  delete rest.description;
  delete rest[CONTENT_LABELS_KEY];
  if (event && entityTags(event.metadata).length === (event.metadata.tags as unknown[])?.length)
    delete rest.tags;
  el<HTMLTextAreaElement>('event-metadata').value = JSON.stringify(rest, null, 2);
  refreshPluginFields();
  refreshDurations();
  renderRelated(el('event-related'), event ? { moment: event.id } : null);
  for (const id of [
    'event-title',
    'event-time',
    'event-description',
    'event-tags',
    'event-metadata',
  ])
    (el(id) as HTMLInputElement).disabled = !editable();
  text(
    'event-edit-status',
    comparison
      ? `Read-only comparison · ${event?.metadata.comparisonSource ?? ''} · original coordinate ${event?.metadata.originalTime ?? ''}`
      : editable()
        ? event
          ? 'Edits show on the timeline as you type; Save keeps them.'
          : 'Save adds this moment to the timeline.'
        : 'Read-only moment.',
  );
  el('event-delete').hidden = !event || !editable();
  el('event-cancel').parentElement!.hidden = !editable();
  // Only what the server keeps can be shared: not unsaved moments or edits.
  el('moment-share').hidden = !event || !shareable() || !!sparseWorkspace()?.changes.has(event.id);
  el('moment-report').hidden = el('moment-share').hidden || !!remote?.canShare;
  text('event-error', '');
  showEventKind('moment', !!momentSession?.isNew);
  showMomentDetails(event ? 'Moment details' : 'New event');
  if (event && !comparison) reportLink({ kind: 'moment', id: event.id });
}
/**
 * The Moment | Duration tabs atop the event dialogs (#209). A new event can become the other
 * kind; an existing one shows its kind, with the other tab disabled.
 */
function showEventKind(kind: 'moment' | 'duration', switchable: boolean) {
  const bar = el(kind + '-kind');
  bar.hidden = false;
  for (const tab of bar.querySelectorAll<HTMLButtonElement>('button')) {
    const current = tab.dataset.kind === kind;
    tab.setAttribute('aria-selected', String(current));
    tab.disabled = !current && !switchable;
    tab.title = current || switchable ? '' : `An existing ${kind} stays a ${kind}.`;
  }
}
/** What a new event keeps when it changes kind: its title, notes, tags and labels. */
function sharedFields(form: 'event' | 'duration') {
  return {
    title: input(form + '-title').value,
    description: el<HTMLTextAreaElement>(form + '-description').value,
    tags: input(form + '-tags').value,
    labels: checkedLabels(form + '-labels'),
  };
}
function fillSharedFields(form: 'event' | 'duration', fields: ReturnType<typeof sharedFields>) {
  input(form + '-title').value = fields.title;
  el<HTMLTextAreaElement>(form + '-description').value = fields.description;
  input(form + '-tags').value = fields.tags;
  for (const box of el(form + '-labels').querySelectorAll<HTMLInputElement>('input'))
    box.checked = fields.labels.includes(box.value);
}
// A new moment becomes a duration from its time, a quarter of the view long.
el('moment-kind').addEventListener('click', (event) => {
  const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-kind=duration]');
  if (!tab || tab.disabled || !momentSession?.isNew) return;
  const fields = sharedFields('event'),
    start = selectedTime ?? viewport.left.add(viewport.span.div(Q.from(2n)));
  discardMomentEdits();
  createDuration(start.toString(), start.add(viewport.span.div(Q.from(4n))).toString());
  // A new event changing kind is not a duration opened over a moment.
  durationOverMoment = false;
  fillSharedFields('duration', fields);
  flushDurationEdit();
  input('duration-title').focus();
});
// A new duration becomes a moment at its start.
el('duration-kind').addEventListener('click', (event) => {
  const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-kind=moment]');
  if (!tab || tab.disabled || !openDuration?.isNew) return;
  flushDurationEdit();
  const fields = sharedFields('duration'),
    band = resolveDuration(openDuration.duration, (id) => model?.momentTime(id));
  durationDialog.close(true);
  eventForm(undefined, band ? Q.parse(band.startTime) : undefined);
  fillSharedFields('event', fields);
  queueEventEdit();
  input('event-title').focus();
});
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
  if (group.count === '0' && group.duration && entityCount(group) === 1n) {
    // A collapsed duration is still a duration: open it rather than a moment list.
    selectedGroup = null;
    requestRender();
    await openDurationById(group.duration.id, group.duration);
    return;
  }
  selectedGroup = group;
  selected = null;
  selectedTime = Q.parse(group.first).add(Q.parse(group.last)).div(Q.from(2n));
  requestRender();
  let page: Awaited<ReturnType<typeof groupPage>>;
  try {
    page = BigInt(group.count) > 0n ? await groupPage(group) : { events: [], next: null };
  } catch (error) {
    if (request === selectionRequest) throw error;
    return;
  }
  if (request !== selectionRequest) return;
  if (entityCount(group) === 1n && page.events[0]) {
    eventForm(page.events[0]);
    return;
  }
  el('event-form').hidden = true;
  el('group-details').hidden = false;
  el('moment-kind').hidden = true;
  text('group-title', summaryName(group));
  text(
    'group-note',
    group.distinct === 1 && !group.durationCount
      ? 'These moments share the same exact time. Zooming in can’t separate them.'
      : 'These are close at this scale. Zoom in to reveal their separate coordinates and full durations.',
  );
  el('group-zoom').hidden = group.distinct === 1 && !group.durationCount;
  el('group-events').hidden = BigInt(group.count) === 0n;
  el('group-page-status').hidden = BigInt(group.count) === 0n;
  showGroupPage(page.events, page.next);
  void showGroupDurations(group, null, request).catch(fail);
  showMomentDetails('Group details');
}
type DurationCursor = { first: string; id: string } | null;
/** Durations whose whole extent lies inside a summary, 25 at a time. */
async function durationPage(
  group: FrameGroup,
  after: DurationCursor,
): Promise<{ durations: DurationBand[]; next: DurationCursor }> {
  // A tag separation lists durations from the side the group belongs to.
  const source =
    comparison && separation
      ? comparison.tracks.find((t) => t.source.key === (group as ComparisonGroup).sourceKey)?.source
      : undefined;
  if (comparison && !source) return { durations: [], next: null };
  if (source?.query && !source.index)
    return source.query({
      kind: 'durations',
      lower: group.first,
      upper: group.last,
      after,
      limit: 25,
    }) as unknown as Promise<{ durations: DurationBand[]; next: DurationCursor }>;
  const index = source?.index ?? (!sparseWorkspace() ? model : null);
  if (index) {
    const lower = Q.parse(group.first),
      upper = Q.parse(group.last);
    const inside = [...index.durations.values()]
      .map((d) => resolveDuration(d, (id) => index.momentTime(id)))
      .filter(
        (b): b is DurationBand =>
          !!b &&
          Q.parse(b.first).compare(lower) >= 0 &&
          Q.parse(b.last).compare(upper) <= 0 &&
          (!after ||
            Q.parse(b.first).compare(Q.parse(after.first)) > 0 ||
            (b.first === after.first && b.id > after.id)),
      )
      .sort((a, b) => Q.parse(a.first).compare(Q.parse(b.first)) || (a.id < b.id ? -1 : 1));
    const page = inside.slice(0, 25);
    return {
      durations: page,
      next: inside.length > 25 ? { first: page[24].first, id: page[24].id } : null,
    };
  }
  return timelineQuery({
    kind: 'durations',
    lower: group.first,
    upper: group.last,
    after,
    limit: 25,
    revision: (local ?? remote)!.revision,
  });
}
let groupDurationCursor: DurationCursor = null;
async function showGroupDurations(group: FrameGroup, after: DurationCursor, request: number) {
  const section = el('group-durations');
  section.hidden = !group.durationCount;
  el('group-duration-list').replaceChildren();
  el('group-durations-more').hidden = true;
  if (!group.durationCount) return;
  const page = await durationPage(group, after);
  if (request !== selectionRequest) return;
  groupDurationCursor = page.next;
  for (const band of page.durations) {
    const button = document.createElement('button');
    button.textContent = band.metadata.title || 'Untitled duration';
    const small = document.createElement('small');
    small.textContent = `${presented(Q.parse(band.first), 'event')} → ${presented(Q.parse(band.last), 'event')}`;
    button.append(small);
    button.onclick = () => void openDurationById(band.id, band).catch(fail);
    el('group-duration-list').append(button);
  }
  el('group-durations-more').hidden = !page.next;
  el('group-durations-more').onclick = () =>
    void showGroupDurations(group, groupDurationCursor, request).catch(fail);
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
    b.textContent = e.metadata.title || 'Untitled moment';
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
/** A comparison of saved server timelines, by its sources; none for others. */
function comparisonScope() {
  return comparison?.tracks.every((t) => !t.source.working && /^[a-f0-9-]{36}$/i.test(t.source.key))
    ? 'compare:' +
        comparison.tracks
          .map((t) => t.source.key)
          .sort()
          .join(',')
    : '';
}
function currentFollowScope() {
  if (!platformEditor || desktop || offlineHtml || !session.server) return '';
  if (comparison) return comparisonScope();
  return remote ? remote.id : '';
}
/**
 * Whose view a reload restores (#128, view-state.ts): a server timeline, separated or not, or
 * a comparison of server timelines.
 */
function viewScope() {
  if (offlineHtml || local) return '';
  if (separation) return remote?.id ?? '';
  if (comparison) return comparisonScope();
  return remote?.id ?? '';
}
function storedView(scope = viewScope()): ViewState {
  if (!scope) return {};
  try {
    return readViewState(sessionStorage.getItem(viewStorageKey(serverOrigin, scope)));
  } catch {
    return {};
  }
}
function storeView(scope: string, change: ViewState) {
  if (!scope) return;
  try {
    sessionStorage.setItem(
      viewStorageKey(serverOrigin, scope),
      JSON.stringify({ ...storedView(scope), ...change }),
    );
  } catch {
    // Without storage a reload shows the whole timeline.
  }
}
let viewTimer: ReturnType<typeof setTimeout> | undefined;
/** Keeps the view once it settles (or at once, before something else opens). */
function saveView(delay = 300) {
  clearTimeout(viewTimer);
  const save = () =>
    storeView(viewScope(), {
      left: viewport.left.toString(),
      right: viewport.left.add(viewport.span).toString(),
      density: Number(input('density').value),
      separation: separation
        ? { tracks: separation.tracks, ...(separation.titles ? { titles: separation.titles } : {}) }
        : undefined,
    });
  if (delay) viewTimer = setTimeout(save, delay);
  else save();
}
/** Shows what opened as it was last seen in this tab; returns what was stored. */
function restoreView(): ViewState {
  const state = storedView();
  if (state.density) {
    input('density').value = String(state.density);
    text('density-value', `${state.density} px`);
  }
  if (state.left && state.right) {
    const left = Q.parse(state.left);
    viewport = new Viewport(left, Q.parse(state.right).sub(left));
  }
  return state;
}
/** Signing out leaves no views of timelines in this tab. */
function forgetViews() {
  clearTimeout(viewTimer);
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith(VIEW_PREFIX)) sessionStorage.removeItem(key);
  } catch {
    // Nothing was stored.
  }
}
window.addEventListener('pagehide', () => saveView(0));
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
      input('follow-latest').checked = storedView(scope).follow === true;
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
      '.view-controls, .toolbar-menu, .window-bounds, #comparison-settings, .timeline-footer, #timeline-actions, dialog',
    )
  )
    follow.navigation();
});
el('comparison-settings').addEventListener('input', () => follow.navigation());
window.addEventListener('resize', () => follow.navigation());
input('follow-latest').onchange = () => {
  if (!followScope) return;
  follow.setEnabled(input('follow-latest').checked);
  storeView(followScope, { follow: input('follow-latest').checked });
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
    // The first frame advances at least one frame interval. Input arrives at the start of a
    // frame, after that frame's timestamp, so `now - started` is zero or less on the first tick:
    // it would redraw the unchanged view at full cost and the zoom would show a frame late
    // (#319).
    const progress = Math.min(1, Math.max(1000 / 60, now - started) / 220);
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
    // Draw the moments in this frame, with the axis: a frame later they would trail it.
    // Reuse confirmed server data; fetch the final window once.
    if (stageWidth() > 96 && stageHeight() > 0) render(false);
    else requestRender(false);
    zoomAnimation = requestAnimationFrame(tick);
  };
  zoomAnimation = requestAnimationFrame(tick);
}
/**
 * Fits duration `id` in the view, with the same margin as Fit all (#268): from its band in the
 * window (a comparison's included), else from the document. Does nothing for one unknown here.
 */
function fitDuration(id: string, known?: DurationBand) {
  const band =
    known ??
    frame.durations?.find((b) => b.id === id && !b.sourceKey) ??
    frame.durations?.find((b) => b.id === id) ??
    (model?.durations.has(id)
      ? resolveDuration(model.durations.get(id)!, (moment) => model!.momentTime(moment))
      : null);
  if (band) navigate(Viewport.fit(Q.parse(band.first), Q.parse(band.last)));
}
function navigate(view: Viewport, manual = true) {
  if (manual) {
    follow.navigation();
    revealing = null;
  }
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
    // Tracks keep the reader's text size (#556): the stage grows to show them, up to the
    // window, and pans for the rest.
    uiScale = baseScale();
    fitStageToTracks();
    verticalOffset = centeredOffset();
    requestRender();
    return;
  }
  resetScale();
  const source = local ?? remote;
  let first = source?.first ? Q.parse(source.first) : undefined,
    last = source?.last ? Q.parse(source.last) : undefined;
  const localFirst = model?.points.minKey(),
    localLast = model?.points.maxKey();
  if (localFirst && (!first || localFirst.compare(first) < 0)) first = localFirst;
  if (localLast && (!last || localLast.compare(last) > 0)) last = localLast;
  // A timeline of durations alone fits its durations.
  if (!first && model && !sparseWorkspace())
    for (const duration of model.durations.values()) {
      const band = resolveDuration(duration, (id) => model!.momentTime(id));
      if (!band) continue;
      const [start, end] = [Q.parse(band.first), Q.parse(band.last)];
      if (!first || start.compare(first) < 0) first = start;
      if (!last || end.compare(last) > 0) last = end;
    }
  viewport = Viewport.fit(first, last);
  requestRender();
}

function closeTimelineMenu() {
  menuGeneration++;
  menuAnchor = null;
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
  resetScale();
  clearTimeout(eventEditTimer);
  pendingEventEdit = false;
  eventEditHistory = null;
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
/** The open moment's card for a stack entry. */
function stackCard(id: string) {
  return el('plugin-event-fields').querySelector<HTMLElement>(`[data-stack-id="${id}"]`);
}
function addStackEntry(point: PointEvent) {
  flushEventEdit();
  const field = pluginFields(activePlugins()).find((f) => f.kind === 'stack');
  if (!field || !editable()) return;
  eventForm(model?.byId.get(point.id) ?? point);
  const metadata = JSON.parse(el<HTMLTextAreaElement>('event-metadata').value);
  // A stack with entries it cannot read is not edited (see renderPluginFields).
  const read = readStack(metadata[field.metadataKey], stackFieldKeys());
  if (read.unreadable) return;
  const entries = read.entries;
  const id = eventId();
  metadata[field.metadataKey] = [...entries, { id, metadata: { title: '', description: '' } }];
  el<HTMLTextAreaElement>('event-metadata').value = JSON.stringify(metadata, null, 2);
  refreshPluginFields();
  queueEventEdit();
  flushEventEdit();
  const card = stackCard(id);
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
  duration?: string,
) {
  hoverPreview.hide();
  summaryExpansion.hide();
  closeTimelineMenu();
  const menu = el('timeline-menu');
  const details = el<HTMLDialogElement>('inspector');
  // Read before the menu shows, so the menu itself is not what lies under the point.
  const node = document.elementFromPoint(x, y);
  if (node) {
    const rect = node.getBoundingClientRect();
    menuAnchor = { node, left: rect.left, top: rect.top };
  }
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
    add('＋ Event', () => {
      selectedGroup = null;
      eventForm(undefined, time);
    });
  // Nothing to fit on an empty timeline.
  if (fittable())
    add('Fit all', () => {
      fit();
      details.close();
    });
  if (point && editable()) {
    add('Edit', () => {
      flushEventEdit();
      eventForm(model?.byId.get(point.id) ?? point);
      if (childId) stackCard(childId)?.scrollIntoView({ block: 'nearest' });
    });
    if (pluginFields(activePlugins()).some((f) => f.kind === 'stack'))
      add('Add entry to stack', () => addStackEntry(point));
    add('Delete', () => {
      if (!childId) requestDelete(point);
      else {
        eventForm(model?.byId.get(point.id) ?? point);
        const card = stackCard(childId);
        [...(card?.querySelectorAll('button') ?? [])]
          .find((b) => b.textContent === 'Delete')
          ?.click();
      }
    });
  }
  if (duration)
    add('Fit in view', () => {
      fitDuration(duration);
      details.close();
    });
  if (duration && editable()) {
    add('Edit', () => void openDurationById(duration).catch(fail));
    add(
      'Delete',
      () =>
        void openDurationById(duration)
          .then(() => requestDurationDelete())
          .catch(fail),
    );
  }
  // A group's details list its moments, and the durations collapsed into it.
  if (group && entityCount(group) > 1n)
    add(viewGroupLabel(group), () => {
      void selectGroup(group).catch(fail);
    });
  // Only when the view shows something to delete.
  if (rangeDeletable() && (frame.groups.length || frame.durations?.length))
    add('Delete everything in this view…', requestRangeDelete);
  if (!comparison && bulkEditable() && fittable())
    add('Shift or scale times…', () =>
      requestTimeMap(
        time,
        point
          ? { ref: { moment: point.id }, label: point.metadata.title ?? point.id }
          : duration
            ? {
                ref: { duration },
                label: String(model?.durations.get(duration)?.metadata.title ?? duration),
              }
            : null,
      ),
    );
  if (shareable())
    add('Share this view', () =>
      requestShare({ kind: 'view', left: viewport.left, right: viewport.right }, remote!.title),
    );
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
  // Duration bands, and markers standing for one collapsed duration, get duration actions.
  const band = target.closest<HTMLElement>('.duration-band');
  const duration =
    band?.dataset.durationId ??
    (group && group.count === '0' && group.duration && !group.duration.sourceKey
      ? group.duration.id
      : undefined);
  if (duration) {
    showTimelineMenu(x, y, time, undefined, undefined, undefined, duration);
    return;
  }
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
        // The moment's own actions; with durations collapsed in too, opening them all.
        if (generation === menuGeneration && doc === documentRequest && page.events[0])
          showTimelineMenu(
            x,
            y,
            Q.parse(page.events[0].time),
            page.events[0],
            entityCount(group) > 1n ? group : undefined,
          );
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
/**
 * Scrolling closes the menu once what it was opened on has moved, or gone. A scroll event can
 * arrive a frame after the scroll itself, so one for a scroll that ended before the menu opened
 * (a press or right-click straight after scrolling) would otherwise close it at once (#308).
 */
function closeMenuOnScroll() {
  if (el('timeline-menu').hidden) return;
  if (menuAnchor?.node.isConnected) {
    const rect = menuAnchor.node.getBoundingClientRect();
    if (Math.abs(rect.left - menuAnchor.left) < 1 && Math.abs(rect.top - menuAnchor.top) < 1)
      return;
  }
  closeTimelineMenu();
}
window.addEventListener('scroll', closeMenuOnScroll, true);
window.addEventListener('blur', () => {
  clearTimeout(longPressTimer);
  closeTimelineMenu();
});

// Pointer Events give mouse dragging, single-touch panning and two-touch anchored zooming.
const pointers = new Map<number, { x: number; y: number }>();
/**
 * Two fingers hold the timeline: the times under them stay under them horizontally, so their
 * horizontal separation zooms time, and the contents follow their midpoint up and down. They never
 * resize the contents, which only the size buttons (and Ctrl-scroll) do: a vertical pinch was too
 * easy to make by accident. Fingers less than ZOOM_HOLD pixels apart horizontally when the second
 * one lands cannot hold a span of time, so they pan instead. Coordinates are CSS pixels of the
 * current layout, so this follows the screen orientation.
 */
const ZOOM_HOLD = 40;
let gesture: {
    view: Viewport;
    mid: number;
    midY: number;
    vertical: number;
    dx: number;
    mode: 'pan' | 'zoom';
  } | null = null,
  press: { id: number; x: number; y: number; time: number; target: EventTarget | null } | null =
    null,
  moved = false,
  suppressClickUntil = 0;
function localX(clientX: number) {
  return clientX - stage.getBoundingClientRect().left - inset();
}
function metrics() {
  const p = [...pointers.values()];
  return {
    mid: p.length === 1 ? localX(p[0].x) : localX((p[0].x + p[1].x) / 2),
    midY: p.length === 1 ? p[0].y : (p[0].y + p[1].y) / 2,
    // Horizontal separation only: the fingers hold times, and time runs horizontally.
    dx: p.length < 2 ? 0 : Math.abs(p[0].x - p[1].x),
  };
}
function resetGesture() {
  if (!pointers.size) {
    gesture = null;
    return;
  }
  const start = metrics();
  gesture = {
    view: viewport.clone(),
    vertical: verticalOffset,
    ...start,
    mode: pointers.size < 2 || start.dx < ZOOM_HOLD ? 'pan' : 'zoom',
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
  verticalOffset = gesture.vertical + now.midY - gesture.midY;
  // Fingers pinched almost together still hold a sliver of time rather than an instant.
  const next =
    gesture.mode === 'pan'
      ? gesture.view.pan(now.mid - gesture.mid, width())
      : gesture.view.pinch(
          gesture.mid,
          now.mid,
          width(),
          screenQ(gesture.dx).div(screenQ(Math.max(4, now.dx))),
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
    // A click on empty space marks a time (for + Event and the menu); it creates nothing.
    selectedTime = viewport.at(Math.max(0, Math.min(width(), localX(event.clientX))), width());
    requestRender();
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
  } else if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    toggleFullscreen();
  }
});

el('timeline-help-button').onclick = () =>
  el<HTMLDialogElement>('timeline-help-dialog').showModal();
/**
 * A help page's address (#172): the server's own help on the website, the connected server's
 * on the desktop, and timescale.info's in the offline file and the plain browser edition.
 */
function helpAddress(topic: string) {
  const origin = platformEditor
    ? ''
    : desktop && serverOrigin
      ? serverOrigin
      : 'https://timescale.info';
  return `${origin}/help/${topic}`;
}
/** Opens help beside the editor: in a new tab, or the desktop's own browser. */
function openHelp(url: string) {
  if (desktop) void window.__TAURI__!.core.invoke('desktop_open_image', { url }).catch(fail);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
addHelpTips(document, helpAddress, openHelp);
/**
 * On a phone the toolbars keep one row each: the file chores wait in File, beside the
 * main action, and the timeline's tools, settings and Help in Tools, beside zooming, Fit all,
 * Full screen and ＋ Event. The controls themselves move, so they keep their handlers and states.
 */
const phone = matchMedia('(max-width: 650px)');
toolbarMenu({
  button: el<HTMLButtonElement>('file-menu-button'),
  panel: el('file-menu'),
  query: phone,
  items: [
    'import-button',
    'export-button',
    'och-import',
    'och-export',
    'sqlite-open',
    'sqlite-save-as',
    'populate-button',
  ].map((id) => [el(id), el('file-menu')] as const),
});
const viewTools = toolbarMenu({
  button: el<HTMLButtonElement>('view-tools-button'),
  panel: el('view-tools'),
  query: phone,
  items: [
    ...[
      'clear-selection',
      'separate-button',
      'presentation-button',
      'plugins-button',
      'compare-button',
      'center-vertical',
      'timeline-help-button',
    ].map((id) => [el(id), el('view-tools-actions')] as const),
    [el('size-down'), el('view-tools-size')],
    [el('size-up'), el('view-tools-size')],
    [el('follow-latest-control'), el('view-tools-settings')],
    [document.querySelector<HTMLElement>('.density-control')!, el('view-tools-settings')],
  ],
  stay: [el('size-down'), el('size-up')],
});
const tour = () => startTour(document, helpAddress('guide'), openHelp);
el('tour-button').onclick = () => {
  // Once Help has closed, and given the focus back, the tour takes it.
  const help = el<HTMLDialogElement>('timeline-help-dialog');
  help.addEventListener('close', () => tour(), { once: true });
  help.close();
};
el('guide-button').onclick = () => openHelp(helpAddress('guide'));
el('zoom-in').onclick = () => zoom(Q.from(4n, 5n));
el('zoom-out').onclick = () => zoom(Q.from(5n, 4n));
// The contents' size (markers, labels, ruler and stack spacing), around the stage's middle: only
// these buttons and Ctrl-scroll change it, never a touch gesture.
el('size-up').onclick = () => scaleContents(uiScale * 1.25, stage.clientHeight / 2);
el('size-down').onclick = () => scaleContents(uiScale / 1.25, stage.clientHeight / 2);
el('fit-button').onclick = fit;
el('center-vertical').onclick = () => {
  follow.navigation();
  verticalOffset = centeredOffset();
  requestRender(false);
};
/**
 * Full screen (#234) gives the timeline card the whole window. The page's class does the
 * layout, so it works where the browser's own full screen is refused, as in an embed without
 * allow="fullscreen"; where it is allowed, the browser's chrome is hidden too.
 */
// Whether the browser's own full screen is ours to follow: set once it is granted, and
// cleared on leaving, so the browser's late notice of that exit can't undo a quick return.
let browserFullscreen = false;
const fullscreen = () => document.documentElement.classList.contains('timeline-fullscreen');
function setFullscreen(on: boolean) {
  document.documentElement.classList.toggle('timeline-fullscreen', on);
  const button = el('fullscreen-button');
  button.querySelector('.button-label')!.textContent = on ? 'Exit full screen' : 'Full screen';
  viewTools.close();
  button.setAttribute('aria-pressed', String(on));
}
function toggleFullscreen(on = !fullscreen()) {
  setFullscreen(on);
  browserFullscreen = false;
  if (on)
    document.documentElement
      .requestFullscreen?.()
      .then(() => {
        // Granted after the timeline had already left: give the window back, now that the
        // browser has finished entering and can leave.
        if (!fullscreen()) return document.exitFullscreen();
        browserFullscreen = true;
      })
      .catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  stage.focus();
}
el('fullscreen-button').onclick = () => toggleFullscreen();
// Leaving the browser's full screen (Escape, or its own controls) leaves ours as well.
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement || !browserFullscreen) return;
  browserFullscreen = false;
  setFullscreen(false);
});
// Without the browser's full screen, Escape still leaves; open dialogs and menus take it first.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented || !fullscreen()) return;
  if (document.querySelector('dialog[open]') || !el('timeline-menu').hidden) return;
  event.preventDefault();
  toggleFullscreen(false);
});
el('empty-fit').onclick = fit;
el('add-button').onclick = () => eventForm(undefined, selectedTime ?? undefined);
el('clear-selection').onclick = () => {
  discardMomentEdits();
  selectedTime = null;
  selected = null;
  selectedGroup = null;
  selectionRequest++;
  clearGroupPage();
  el<HTMLDialogElement>('inspector').close();
  requestRender();
};
el('close-inspector').onclick = () => el<HTMLDialogElement>('inspector').close();
el<HTMLDialogElement>('inspector').addEventListener('close', () => {
  if (el<HTMLDialogElement>('inspector').open) return;
  if (!el('duration-dialog').hidden) {
    durationClosed();
    showMomentPanel();
    // A duration opened by itself leaves no moment or group to put away, nor anything to
    // redraw (a redraw now could replace a marker someone is about to click).
    if (el('event-form').hidden && el('group-details').hidden) return;
  }
  forgetLink('moment');
  closeTimelineMenu();
  // Closed other than by Save: nothing typed since it opened is kept.
  discardMomentEdits();
  selected = null;
  selectedGroup = null;
  selectionRequest++;
  clearGroupPage();
  el('event-form').hidden = true;
  el('group-details').hidden = true;
  requestRender();
});
input('density').oninput = () => {
  text('density-value', `${input('density').value} px`);
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
for (const id of ['left-bound', 'right-bound'] as const) {
  // Typing answers the view as it is now, even if it changed while the field had focus:
  // renders keep the typed text until the view moves again.
  input(id).addEventListener('input', () => {
    const time = id === 'left-bound' ? viewport.left : viewport.right;
    displayedBounds.set(id, { text: presented(time, 'input'), time });
  });
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
}
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
      describeOffsetUnits();
      el<HTMLDialogElement>('presentation-dialog').close();
      requestRender();
      return;
    }
    const editingTime = !el('event-form').hidden ? readEventTime() : null;
    const presentation = displaySettings();
    const apply = () => {
      model!.presentation = presentation;
      if (editingTime) setEventTime(editingTime);
      el<HTMLDialogElement>('presentation-dialog').close();
    };
    if (!savesDisplayToServer()) {
      apply();
      changed();
      return;
    }
    const save = el<HTMLButtonElement>('presentation-save'),
      workspace = documentRequest;
    save.disabled = true;
    text('presentation-error', '');
    void saveDisplaySettings(presentation)
      .then(() => {
        if (workspace !== documentRequest) return;
        apply();
        heading();
        requestRender();
        toast('Display settings saved.');
      })
      .catch((error) => {
        if (workspace === documentRequest)
          text('presentation-error', error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        save.disabled = false;
      });
  } catch (error) {
    text('presentation-error', error instanceof Error ? error.message : String(error));
  }
};
/**
 * Display settings of a server timeline its editor may save are saved when chosen (#123),
 * unlike other edits, which wait for Save to server: they change how the timeline reads,
 * not what it holds, and a timeline being written to (by a log import or syslog) would
 * otherwise refuse each save of them as someone else having changed it. In a proposal they
 * are part of what is proposed.
 */
function savesDisplayToServer() {
  return !!remote && !local && !workingProposal && !!model && !!(remote.canWrite ?? remote.canEdit);
}
/**
 * Saves `presentation` as the open server timeline's display, on its latest saved settings:
 * a save of nothing else, sent again if another lands first.
 */
async function saveDisplaySettings(presentation: TimePresentation) {
  const id = remote!.id;
  for (let attempt = 0; ; attempt++) {
    const saved = await api<RemoteTimeline>(`timelines/${id}`);
    try {
      const result = await api<RemoteTimeline>(`timelines/${id}/changes`, 'PUT', {
        revision: saved.revision,
        settings: {
          format: 'openchronology',
          version: 1,
          title: saved.title,
          description: saved.description,
          presentation,
          ...(saved.plugins ? { plugins: saved.plugins } : {}),
          ...(saved.tags ? { tags: saved.tags } : {}),
          ...(saved.assets ? { assets: saved.assets } : {}),
        },
        changes: [],
        durationChanges: [],
        relationshipChanges: [],
      });
      // Unsaved edits made on the revision this save follows may now be saved on it; edits on
      // an earlier one still meet the change they missed.
      if (remote?.id === id && remote.revision === saved.revision) remote = result;
      return;
    } catch (error) {
      if ((error as { status?: number }).status !== 409 || attempt >= 4) throw error;
    }
  }
}
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
  text('delete-heading', 'Delete moment?');
  text('delete-confirm', 'Delete moment');
  text(
    'delete-description',
    `Delete “${point.metadata.title || 'Untitled moment'}” at ${presented(Q.parse(point.time), 'input')}? Durations that follow it keep its current time as a fixed endpoint, and its relationships are removed. You can undo this deletion.`,
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
  const pending = pendingDelete;
  if (!pending || pending.document !== documentRequest || !editable()) return;
  if (pending.remove) {
    flushEventEdit();
    pending.remove();
    el<HTMLDialogElement>('delete-dialog').close();
    return;
  }
  // Deleting the open moment drops its unkept edits first, so undo restores it as it was.
  if (selected?.id === pending.id) discardMomentEdits();
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
/** Moments and durations the undo and redo history can still change. */
function historyEntities() {
  const moments = new Set<string>(),
    durations = new Set<string>();
  for (const entry of [...history, ...future].flatMap((e) => ('group' in e ? e.group : [e]))) {
    if ('link' in entry || 'baseline' in entry) continue;
    const id = (entry.before ?? entry.after)?.id;
    if (id) ('duration' in entry ? durations : moments).add(id);
  }
  return { moments, durations };
}
/**
 * Whether many moments and durations can be changed at once, comparison or not: in a timeline
 * in this page (undoable), in a large desktop file (in its native store, undoable until
 * saved), or in a server timeline this account writes (on the server, at once).
 */
function bulkEditable(): boolean {
  if (embedded || !model || (remote && !remote.canEdit)) return false;
  if (!sparseWorkspace()) return true;
  // A large desktop file: in its native store, unsaved (#179).
  if (local) return !remote;
  return !!remote && !!remote.canWrite;
}
/**
 * A large desktop file's settings when it was opened, saved or last changed at once, to tell
 * whether there are edits a change made at once would conflict with (desktopSettled).
 */
let desktopSettings = '',
  // The baseline the file holds since it was opened or saved, once changes made at once
  // begin: undoing back to it leaves nothing unsaved.
  desktopSavedBaseline: number | null = null,
  restoringBaseline = false;
/** Whether a large desktop file is open with no unsaved edits but changes made at once. */
function desktopSettled(): boolean {
  const index = sparseWorkspace();
  return (
    !!local &&
    !!index &&
    index.dirtyCount === 0 &&
    JSON.stringify(index.document()) === desktopSettings
  );
}
interface StagedBaseline extends NativeOpened {
  before: number;
  after: number;
}
/** Adopts the baseline a change made at once, or its undo or redo, left: views read it anew. */
function adoptBaseline(result: StagedBaseline) {
  local = { ...local!, ...result, path: local!.path, revision: String(result.generation) };
  model = new RemoteWorkspace(validateDocument(result.document));
  desktopSettings = JSON.stringify(model.document());
  remoteCache.clear();
  frameRequest++;
  selected = null;
  selectedGroup = null;
  el('event-form').hidden = true;
  el<HTMLDialogElement>('inspector').close();
  editVersion++;
  dirty = result.after !== desktopSavedBaseline;
  heading();
  requestRender();
}
type NativePatch = {
  settings: TimelineDocument;
  changes: { id: string; event: PointEvent | null }[];
  durationChanges: { id: string; duration: Duration | null }[];
  relationshipChanges: never[];
};
/**
 * Applies `changes` and `durationChanges` to the open desktop file's baseline at once (#179),
 * unsaved and undoable, telling `progress` how far it has got.
 */
async function stageOnDesktop(
  changes: NativePatch['changes'],
  durationChanges: NativePatch['durationChanges'],
  progress: (done: number, total: number) => void,
) {
  const channel = new window.__TAURI__!.core.Channel<{ done: number; total: number }>();
  channel.onmessage = ({ done, total }) => progress(done, total);
  const request = documentRequest,
    wasDirty = dirty;
  const patch: NativePatch = {
    settings: { ...sparseWorkspace()!.document(), events: [], durations: [] },
    changes,
    durationChanges,
    relationshipChanges: [],
  };
  const result = await window.__TAURI__!.core.invoke<StagedBaseline>('desktop_stage_patch', {
    generation: local!.generation,
    patch,
    progress: channel,
  });
  if (request !== documentRequest) return false;
  if (!wasDirty) desktopSavedBaseline = result.before;
  adoptBaseline(result);
  record({ baseline: { before: result.before, after: result.after } });
  // Undo becomes available.
  heading();
  return true;
}
/** Undoes or redoes a change made at once to a desktop file, by taking its baseline back. */
async function restoreBaseline(edit: BaselineEdit, redo: boolean) {
  const keep = () => (redo ? future : history).push(edit);
  if (restoringBaseline) return keep();
  if (!desktopSettled()) {
    keep();
    toast('Save or undo your later edits first.');
    return;
  }
  restoringBaseline = true;
  const request = documentRequest;
  try {
    const result = await window.__TAURI__!.core.invoke<StagedBaseline>('desktop_restore_baseline', {
      generation: local!.generation,
      baseline: redo ? edit.baseline.after : edit.baseline.before,
    });
    if (request !== documentRequest) return;
    adoptBaseline(result);
    (redo ? history : future).push(edit);
    heading();
  } catch (error) {
    fail(error);
  } finally {
    restoringBaseline = false;
  }
}
/** Whether everything in the view can be deleted at once (bulkEditable, not comparing). */
function rangeDeletable(): boolean {
  return !comparison && bulkEditable();
}
/** Asks, then deletes every moment in the view and the durations wholly inside it (#91). */
function requestRangeDelete() {
  if (!rangeDeletable() || !model) return;
  closeTimelineMenu();
  const lower = viewport.left,
    upper = viewport.right,
    request = documentRequest;
  const between = `between ${presented(lower, 'input')} and ${presented(upper, 'input')}`;
  const durations = (index: TimelineIndex) =>
    [...index.durations.values()].filter((duration) => {
      const band = resolveDuration(duration, (id) => index.momentTime(id));
      return (
        !!band && Q.parse(band.first).compare(lower) >= 0 && Q.parse(band.last).compare(upper) <= 0
      );
    });
  if (!sparseWorkspace()) {
    const count = model.points.countRange(lower, upper, { includeUpper: true });
    const spans = durations(model);
    text('delete-heading', 'Delete everything in this view?');
    text('delete-confirm', 'Delete them');
    text(
      'delete-description',
      count || spans.length
        ? `Delete ${count.toLocaleString()} ${count === 1n ? 'moment' : 'moments'} and ${spans.length.toLocaleString()} ${spans.length === 1 ? 'duration' : 'durations'} ${between}? Durations that follow a deleted moment keep its time. You can undo this.`
        : `Nothing to delete ${between}.`,
    );
    pendingDelete = {
      id: '',
      document: request,
      remove: () => {
        if (!model || request !== documentRequest) return;
        const group: GroupEdit['group'] = [];
        for (const [, bucket] of [...model.points.range(lower, upper, { includeUpper: true })])
          for (const point of bucket) {
            group.push({ before: point });
            model.delete(point.id);
          }
        for (const duration of spans) {
          group.push({ duration: true, before: duration });
          model.deleteDuration(duration.id);
        }
        if (!group.length) return;
        record({ group });
        selected = null;
        selectedGroup = null;
        el('event-form').hidden = true;
        el<HTMLDialogElement>('inspector').close();
        changed();
        toast(`Deleted ${group.length.toLocaleString()} events. Undo restores them.`);
      },
    };
  } else if (local) {
    // A large desktop file: deleted in its native store at once, unsaved and undoable (#179).
    if (!desktopSettled()) {
      toast('Save your changes first: this changes the whole file at once.');
      return;
    }
    text('delete-heading', 'Delete everything in this view?');
    text('delete-confirm', 'Delete them');
    text(
      'delete-description',
      `Delete every moment ${between}, and the durations wholly inside that range? You can undo this until you save the file.`,
    );
    pendingDelete = {
      id: '',
      document: request,
      remove: () =>
        void (async () => {
          toast('Deleting…');
          const saved = await window.__TAURI__!.core.invoke<TimelineDocument>('desktop_document', {
            generation: local!.generation,
          });
          const times = new Map(saved.events.map((e) => [e.id, e.time]));
          const within = (time: string) =>
            parseTime(time).compare(lower) >= 0 && parseTime(time).compare(upper) <= 0;
          const moments = saved.events.filter((e) => within(e.time));
          const spans = (saved.durations ?? []).filter((duration) => {
            const band = resolveDuration(duration, (id) => times.get(id));
            return !!band && within(band.first) && within(band.last);
          });
          if (!moments.length && !spans.length) return toast(`Nothing to delete ${between}.`);
          if (
            await stageOnDesktop(
              moments.map((e) => ({ id: e.id, event: null })),
              spans.map((d) => ({ id: d.id, duration: null })),
              () => {},
            )
          )
            toast(
              `Deleted ${moments.length.toLocaleString()} ${moments.length === 1 ? 'moment' : 'moments'} and ${spans.length.toLocaleString()} ${spans.length === 1 ? 'duration' : 'durations'}. Undo restores them; saving writes it to the file.`,
            );
        })().catch(fail),
    };
  } else {
    // On the server: the deletion is saved there at once, as a revision of its own.
    if (dirty) {
      toast('Save your changes first: deleting on the server saves at once.');
      return;
    }
    const id = remote!.id,
      revision = remote!.revision;
    text('delete-heading', 'Delete everything in this view?');
    text('delete-confirm', 'Delete on the server');
    text(
      'delete-description',
      `Delete every moment ${between}, and the durations wholly inside that range? This is saved on the server at once and cannot be undone here; the timeline's history keeps the version before it.`,
    );
    pendingDelete = {
      id: '',
      document: request,
      remove: () =>
        void (async () => {
          const result = await api<{ removed: { moments: number; durations: number } }>(
            `timelines/${id}/delete-range`,
            'POST',
            { revision, lower: lower.toString(), upper: upper.toString() },
          );
          if (remote?.id !== id || request !== documentRequest) return;
          const view = viewport.clone();
          await openRemote(id);
          viewport = view;
          requestRender();
          toast(
            `Deleted ${result.removed.moments.toLocaleString()} moments and ${result.removed.durations.toLocaleString()} durations.`,
          );
        })().catch(fail),
    };
  }
  el<HTMLDialogElement>('delete-dialog').showModal();
  el('delete-cancel').focus();
}
/**
 * Shifting or scaling times for good (#96; time-map.ts): everything, or what a tag or
 * relationship filter selects, as comparisons align. In this page it is one undoable edit; on
 * the server, one save made there at once, whose progress the dialog shows.
 */
let mapRelated: { ref: EntityRef; label: string } | null = null,
  mapRunning = false;
function mapPresentation() {
  return model?.presentation ?? remote?.presentation;
}
/** Opens the dialog: scaling around `around`, preferring `filter`'s selection when given. */
function requestTimeMap(
  around: Q,
  related: { ref: EntityRef; label: string } | null = null,
  filter: ViewFilter | null = null,
) {
  if (!bulkEditable() || mapRunning) return;
  closeTimelineMenu();
  mapRelated =
    related ??
    (filter && 'related' in filter
      ? {
          ref: filter.related,
          label: separation?.titles?.[refKey(filter.related)] ?? '',
        }
      : null);
  input('map-scale').value = '1';
  input('map-offset').value = '0';
  input('map-around').value = presented(around, 'input');
  input('map-tags').value = filter && 'tags' in filter ? filter.tags.join(', ') : '';
  const label = mapRelated ? `“${mapRelated.label || 'this'}”` : '';
  el('map-related-direct').hidden = el('map-related-all').hidden = !mapRelated;
  el('map-related-direct').querySelector('span')!.textContent = `Related to ${label}`;
  el('map-related-all').querySelector('span')!.textContent =
    `Connected to ${label} through any chain`;
  const scope =
    filter && 'tags' in filter
      ? filter.mode === 'any'
        ? 'tagged'
        : 'untagged'
      : filter && 'related' in filter
        ? `related-${filter.depth}`
        : 'all';
  for (const radio of el('map-scope').querySelectorAll<HTMLInputElement>('input[type=radio]'))
    radio.checked = radio.value === scope;
  text(
    'map-units',
    offsetUnits(mapPresentation()) + ' Around is a time, written as the timeline shows them.',
  );
  text('map-error', '');
  el('map-working').hidden = true;
  setMapBusy(false);
  describeTimeMap();
  el<HTMLDialogElement>('map-dialog').showModal();
  input('map-offset').focus();
  input('map-offset').select();
}
/** The filter the dialog's scope names, or null for everything. */
function mapFilter(): ViewFilter | null {
  const scope =
    el('map-scope').querySelector<HTMLInputElement>('input[type=radio]:checked')?.value ?? 'all';
  if (scope === 'tagged' || scope === 'untagged') {
    const tags = validateEntityTags(parseTagInput(input('map-tags').value));
    if (!tags.length) throw new Error('Name at least one tag.');
    return { tags, mode: scope === 'tagged' ? 'any' : 'none' };
  }
  if (scope.startsWith('related-') && mapRelated)
    return {
      related: mapRelated.ref,
      depth: scope === 'related-all' ? 'all' : 'direct',
      mode: 'any',
    };
  return null;
}
function readTimeMap(): TimeMapping {
  const difference = createDifference(mapPresentation());
  let offset: Q, around: Q;
  try {
    offset = difference.parse(input('map-offset').value);
  } catch (error) {
    throw new Error(`Offset: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    around = parseInputTime(input('map-around').value);
  } catch (error) {
    throw new Error(`Around: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    ...timeMapping({ scale: input('map-scale').value, offset: '0' }),
    offset,
    around,
  };
}
/** Says ahead what applying will change, and how. */
function describeTimeMap() {
  let summary: string;
  try {
    const mapping = readTimeMap(),
      filter = mapFilter();
    if (unchangedMapping(mapping)) summary = 'With scale 1 and offset 0, nothing moves.';
    else if (!sparseWorkspace() && model) {
      const { events, durations } = mappedEntities(model.document(), mapping, filter, parseTime);
      summary = `This moves ${events.length.toLocaleString()} ${events.length === 1 ? 'moment' : 'moments'} and ${durations.length.toLocaleString()} ${durations.length === 1 ? 'duration' : 'durations'}. You can undo it.`;
    } else {
      const count = BigInt((local ?? remote)?.event_count ?? '0'),
        moments = `${count.toLocaleString()} ${count === 1n ? 'moment' : 'moments'}`;
      summary =
        (filter
          ? `This moves the events selected, of the timeline’s ${moments}.`
          : `This moves all ${moments} and all durations.`) +
        (local
          ? ' It changes the file’s copy at once; you can undo it until you save the file.'
          : ' It is saved on the server at once, as one version; the timeline’s history keeps the one before.' +
            (count >= 100000n
              ? ' On a timeline this large it can take minutes, and others’ saves wait until it finishes.'
              : ''));
    }
  } catch (error) {
    summary = error instanceof Error ? error.message : String(error);
  }
  text('map-summary', summary);
}
function setMapBusy(busy: boolean) {
  mapRunning = busy;
  for (const control of el('map-form').querySelectorAll<HTMLInputElement | HTMLButtonElement>(
    'input, button',
  ))
    control.disabled = busy;
}
function mapStep(done: number | null, total: number | null, status: string) {
  const bar = el<HTMLProgressElement>('map-progress');
  el('map-working').hidden = false;
  if (done === null || !total) bar.removeAttribute('value');
  else {
    bar.max = total;
    bar.value = done;
  }
  text('map-status', status);
}
const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
/** Applies the mapping to the timeline in this page, as one undoable edit. */
async function mapHere(mapping: TimeMapping, filter: ViewFilter | null) {
  const index = model!,
    request = documentRequest;
  const { events, durations } = mappedEntities(index.document(), mapping, filter, parseTime);
  const total = events.length + durations.length,
    group: GroupEdit['group'] = [];
  let done = 0;
  const step = async () => {
    if (++done % 5000 === 0) {
      mapStep(done, total, `${done.toLocaleString()} of ${total.toLocaleString()}`);
      await nextTurn();
    }
  };
  for (const event of events) {
    if (request !== documentRequest) return null;
    group.push({ before: index.byId.get(event.id), after: event });
    index.put(event);
    await step();
  }
  for (const duration of durations) {
    if (request !== documentRequest) return null;
    group.push({ duration: true, before: index.durations.get(duration.id), after: duration });
    index.putDuration(duration);
    await step();
  }
  if (request !== documentRequest || !group.length) return { moments: 0, durations: 0 };
  record({ group });
  selected = null;
  selectedGroup = null;
  el('event-form').hidden = true;
  el<HTMLDialogElement>('inspector').close();
  changed();
  return { moments: events.length, durations: durations.length };
}
/** Applies the mapping to a large desktop file at once, unsaved and undoable (#179). */
async function mapOnDesktop(mapping: TimeMapping, filter: ViewFilter | null) {
  mapStep(null, null, 'Reading the timeline…');
  const saved = await window.__TAURI__!.core.invoke<TimelineDocument>('desktop_document', {
    generation: local!.generation,
  });
  const { events, durations } = mappedEntities(saved, mapping, filter, parseTime);
  if (!events.length && !durations.length) return { moments: 0, durations: 0 };
  const staged = await stageOnDesktop(
    events.map((event) => ({ id: event.id, event })),
    durations.map((duration) => ({ id: duration.id, duration })),
    (done, total) =>
      mapStep(done, total, `Changing ${done.toLocaleString()} of ${total.toLocaleString()}…`),
  );
  return staged ? { moments: events.length, durations: durations.length } : null;
}
/** Applies the mapping on the server, showing its progress. */
async function mapOnServer(mapping: TimeMapping, filter: ViewFilter | null) {
  const id = remote!.id,
    request = documentRequest;
  const result = await requestProgress<
    { moved: { moments: number; durations: number } },
    { reading?: boolean; rebuilding?: string; done?: number; total?: number }
  >(
    `timelines/${id}/map-times`,
    {
      revision: remote!.revision,
      mapping: timeMappingInput(mapping),
      ...(filter ? { filter } : {}),
    },
    session.csrf,
    (step) => {
      if (step.reading) mapStep(null, null, 'Reading the timeline…');
      else if (step.rebuilding)
        mapStep(
          step.done ?? null,
          step.total ?? null,
          `Rebuilding the timeline: ${step.rebuilding}…`,
        );
      else if (step.total !== undefined)
        mapStep(
          step.done ?? 0,
          step.total,
          `Saving ${(step.done ?? 0).toLocaleString()} of ${step.total.toLocaleString()} changes…`,
        );
    },
  );
  if (remote?.id === id && request === documentRequest) {
    const view = viewport.clone();
    await openRemote(id, false);
    viewport = view;
  }
  return result.moved;
}
el<HTMLFormElement>('map-form').onsubmit = (event) => {
  event.preventDefault();
  if (mapRunning) return;
  let mapping: TimeMapping, filter: ViewFilter | null;
  try {
    mapping = readTimeMap();
    filter = mapFilter();
    if (local ? sparseWorkspace() && !desktopSettled() : sparseWorkspace() && dirty)
      throw new Error(
        local
          ? 'Save your changes first: this changes the whole file at once.'
          : 'Save your changes first: this is saved on the server at once.',
      );
  } catch (error) {
    text('map-error', error instanceof Error ? error.message : String(error));
    return;
  }
  text('map-error', '');
  if (unchangedMapping(mapping)) {
    el<HTMLDialogElement>('map-dialog').close();
    return;
  }
  setMapBusy(true);
  mapStep(null, null, 'Working…');
  void (async () => {
    // Separated tracks are read-only: back to the whole timeline, which this changes.
    if (comparison) stopComparison();
    const before = viewport.clone();
    const moved = !sparseWorkspace()
      ? await mapHere(mapping, filter)
      : local
        ? await mapOnDesktop(mapping, filter)
        : await mapOnServer(mapping, filter);
    setMapBusy(false);
    // Another timeline was opened meanwhile.
    if (!moved) return el<HTMLDialogElement>('map-dialog').close();
    // When everything moved, so does the view, to show what it showed.
    if (!filter)
      viewport = new Viewport(mapTime(before.left, mapping), before.span.mul(mapping.scale));
    requestRender();
    el<HTMLDialogElement>('map-dialog').close();
    toast(
      `Moved ${moved.moments.toLocaleString()} ${moved.moments === 1 ? 'moment' : 'moments'} and ${moved.durations.toLocaleString()} ${moved.durations === 1 ? 'duration' : 'durations'}.${sparseWorkspace() && !local ? '' : ' Undo restores them.'}`,
    );
  })().catch((error) => {
    setMapBusy(false);
    el('map-working').hidden = true;
    text('map-error', error instanceof Error ? error.message : String(error));
  });
};
for (const id of ['map-scale', 'map-offset', 'map-around', 'map-tags'])
  input(id).addEventListener('input', describeTimeMap);
el('map-scope').addEventListener('change', describeTimeMap);
input('map-tags').addEventListener('focus', () => {
  const tagged = el('map-scope').querySelector<HTMLInputElement>('input[value=tagged]')!;
  const untagged = el('map-scope').querySelector<HTMLInputElement>('input[value=untagged]')!;
  if (!tagged.checked && !untagged.checked) {
    tagged.checked = true;
    describeTimeMap();
  }
});
// It cannot be closed while it works: not with Escape, nor by a click outside it.
el('map-dialog').addEventListener('cancel', (event) => {
  if (mapRunning) event.preventDefault();
});
el('map-dialog').addEventListener(
  'click',
  (event) => {
    if (mapRunning) event.stopImmediatePropagation();
  },
  true,
);
el('separation-map').onclick = () => {
  if (!separation) return;
  const center = viewport.left.add(viewport.span.div(Q.from(2n)));
  const filter = separatedEvents(separation.tracks);
  if (filter) requestTimeMap(center, null, filter);
};
/**
 * The events separated, as the time mapping selects them: those with any of the tags, or an
 * entity's related or connected set (#552); null for separations by tags and relationships
 * together, or by several entities, which it cannot select at once.
 */
function separatedEvents(tracks: SeparationTrack[]): ViewFilter | null {
  const tags = tracks.flatMap((t) => ('tags' in t ? t.tags : []));
  if (tags.length && tracks.every((t) => 'tags' in t))
    return { tags: [...new Set(tags)], mode: 'any' };
  const only = tracks[0];
  return tracks.length === 1 && 'related' in only
    ? { related: only.related, depth: only.depth, mode: 'any' }
    : null;
}
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
  // An open dialog's preview is one undo step: undo removes it, and the dialog then closes.
  flushEventEdit();
  clearTimeout(eventEditTimer);
  pendingEventEdit = false;
  eventEditHistory = null;
  momentSession = null;
  flushDurationEdit();
  if (openDuration) openDuration.edit = null;
  openDuration = null;
  previewing = false;
  const edit = (redo ? future : history).pop();
  if (!edit || !model) return;
  if ('baseline' in edit) return void restoreBaseline(edit, redo);
  const index = model;
  const apply = (edit: Exclude<HistoryEntry, GroupEdit | BaselineEdit>) => {
    if ('link' in edit) {
      // Undo applies the opposite of the recorded state; redo reapplies it.
      if (edit.related === redo) index.relate(edit.link.a, edit.link.b);
      else index.unrelate(edit.link.a, edit.link.b);
      durationDialog.close();
    } else if ('duration' in edit) {
      const [from, to] = redo ? [edit.before, edit.after] : [edit.after, edit.before];
      if (to) index.putDuration(to);
      else if (from) index.deleteDuration(from.id);
      durationDialog.close();
    } else {
      const [from, to] = redo ? [edit.before, edit.after] : [edit.after, edit.before];
      // Replacing a moment in place keeps duration and relationship indexes (see
      // discardMomentEdits); only a moment going away is deleted.
      if (from && from.id !== to?.id) index.delete(from.id);
      if (to) index.put(to);
    }
  };
  if ('group' in edit) for (const one of redo ? edit.group : [...edit.group].reverse()) apply(one);
  else apply(edit);
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
/**
 * The description shows in full under the title, as tall as its text, rather than scrolling
 * inside one line: its height follows its content as it is filled, typed and rewrapped.
 */
function fitDescription() {
  // The title too: a long one wraps under itself on a narrow screen instead of running off it.
  for (const id of ['timeline-title', 'timeline-description']) {
    const area = el<HTMLTextAreaElement>(id);
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight}px`;
  }
}
el('timeline-description').addEventListener('input', fitDescription);
/**
 * The description under the title as its Markdown renders (#398), with the notes' vocabulary
 * and safety (src/rich-text.ts). Its source, the textarea, shows instead while an editor edits
 * it, and when it is empty so there is somewhere to type one; the view swaps for it on a click
 * or on keyboard focus, and comes back when it loses focus.
 */
function showDescription() {
  const area = el<HTMLTextAreaElement>('timeline-description'),
    view = el('timeline-description-view');
  const empty = !area.value.trim(),
    editing = editable() && (document.activeElement === area || empty);
  renderMarkdown(view, area.value);
  view.hidden = editing || empty;
  area.hidden = !editing;
  if (editable()) {
    view.tabIndex = 0;
    view.title = 'Edit the description';
  } else {
    view.removeAttribute('tabindex');
    view.removeAttribute('title');
  }
  fitDescription();
  capDescription();
}
/** Whether the open timeline's long description is shown whole (#424), and whose it is. */
let descriptionExpanded = false,
  descriptionOwner: unknown = null;
/**
 * A long description shows its first lines under the title, fading out, with Read more to show
 * the rest and Show less to fold it again (#424); a short one shows whole, with neither. Each
 * timeline opens folded.
 */
function capDescription() {
  const view = el('timeline-description-view'),
    more = el<HTMLButtonElement>('timeline-description-more');
  // The open timeline: a server's by its ID, else the comparison or the document itself, which
  // a new import or file replaces.
  const owner = remote?.id ?? comparison ?? model;
  if (owner !== descriptionOwner) {
    descriptionOwner = owner;
    descriptionExpanded = false;
  }
  view.classList.toggle('expanded', descriptionExpanded);
  // Folded, it overflows when its text is taller than the five lines it shows.
  const overflowing = !view.hidden && view.scrollHeight > view.clientHeight + 1;
  view.classList.toggle('overflowing', overflowing);
  more.hidden = view.hidden || (!descriptionExpanded && !overflowing);
  more.textContent = descriptionExpanded ? 'Show less' : 'Read more…';
  more.setAttribute('aria-expanded', String(descriptionExpanded));
}
el('timeline-description-more').addEventListener('click', () => {
  descriptionExpanded = !descriptionExpanded;
  capDescription();
});
// Focus reaches the view itself on a click outside its links, or by Tab, only while editable.
el('timeline-description-view').addEventListener('focus', () => {
  if (!editable()) return;
  const area = el<HTMLTextAreaElement>('timeline-description');
  area.hidden = false;
  el('timeline-description-view').hidden = true;
  area.focus();
  fitDescription();
});
// Links in an editor's view open in a new tab without starting an edit.
el('timeline-description-view').addEventListener('mousedown', (event) => {
  if ((event.target as Element).closest('a')) event.preventDefault();
});
el('timeline-description').addEventListener('blur', () => showDescription());
// The title is one line of text that wraps: Enter commits it, and pasted line breaks become
// spaces.
el<HTMLTextAreaElement>('timeline-title').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.isComposing) return;
  event.preventDefault();
  (event.currentTarget as HTMLTextAreaElement).blur();
});
el<HTMLTextAreaElement>('timeline-title').addEventListener('input', (event) => {
  const title = event.currentTarget as HTMLTextAreaElement;
  if (/[\r\n]/.test(title.value)) title.value = title.value.replace(/\s*[\r\n]+\s*/g, ' ');
  fitDescription();
});
// A new width rewraps it; only the width, so its own height change doesn't call back forever.
// The height changes in the next frame, not during the observer's own delivery, which would
// leave notifications undelivered (WebKit reports a ResizeObserver loop).
let descriptionWidth = 0;
new ResizeObserver(([entry]) => {
  if (entry.contentRect.width === descriptionWidth) return;
  descriptionWidth = entry.contentRect.width;
  requestAnimationFrame(fitDescription);
}).observe(el('timeline-description'));
// Rewrapped at a new width, a description may come to need Read more, or no longer need it.
let descriptionViewWidth = 0;
new ResizeObserver(([entry]) => {
  if (entry.contentRect.width === descriptionViewWidth) return;
  descriptionViewWidth = entry.contentRect.width;
  requestAnimationFrame(capDescription);
}).observe(el('timeline-description-view'));
el<HTMLTextAreaElement>('timeline-description').onchange = () => {
  if (!editable()) return;
  model!.description = el<HTMLTextAreaElement>('timeline-description').value;
  changed();
};
function mayReplace() {
  flushEventEdit();
  flushDraft();
  return (
    (!dirty && !(desktop && sqlitePath && sqliteSavedVersion !== editVersion)) ||
    // A draft in this browser is kept, and listed on the dashboard (#188).
    (!!openDraft() && !remote && !memoryOnly() && !desktop && !previewing) ||
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
  loadDocument(newDocument());
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
  const started = performance.now();
  void file
    .text()
    .then((value) => {
      const doc = validateDocument(JSON.parse(value));
      if (workspace !== documentRequest) return;
      historyReplace();
      sqlitePath = null;
      pendingOpenStart = started;
      // An imported file is a draft of its own at once (#188).
      loadDocument(doc, memoryOnly() || desktop ? null : newDraftId());
      toast(withBackgroundWarning('JSON timeline imported.', doc));
      return openDefaultView(doc.view);
    })
    .catch(fail);
};
/**
 * Above this many moments, a server timeline without unsaved edits is exported by the
 * server, which streams it to a file (#135), instead of being assembled here: a document that
 * size takes more memory than a page should. Images it links to by address are then not
 * embedded (those it stores are).
 */
const SERVER_EXPORT = 100000n;
/**
 * Whether the open timeline is a server timeline with no edits waiting to be saved (one
 * opened read-only has none).
 */
function savedRemote(): boolean {
  const sparse = sparseWorkspace();
  return (
    !!remote &&
    !local &&
    !comparison &&
    !dirty &&
    (sparse
      ? !sparse.changes.size && !sparse.durationChanges.size && !sparse.relationshipChanges.size
      : !model)
  );
}
el('export-button').onclick = () => {
  flushEventEdit();
  if (!window.__TAURI__ && session.user && savedRemote() && momentCount() > SERVER_EXPORT) {
    // Named by the end of the address (and by the server's Content-Disposition), which
    // every browser names it after.
    const a = document.createElement('a');
    a.href = `/api/timelines/${remote!.id}/export/${fileName(remote!.title, '.ochx')}`;
    a.download = '';
    a.click();
    toast('Exporting from the server: the file downloads as it is written.');
    return;
  }
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
/** A file name for a timeline titled `title`. */
const fileName = (title: string, extension: string) =>
  (title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 70) || 'timeline') + extension;
function download(blob: Blob, title: string, extension: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = fileName(title, extension);
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
  void importSqlite(file, session.csrf, session.fileLimit)
    .then((value) => {
      const doc = validateDocument(value);
      if (workspace !== documentRequest) return;
      historyReplace();
      loadDocument(doc);
      toast(withBackgroundWarning('.och timeline imported through the server.', doc));
      return openDefaultView(doc.view);
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
        const returnTo = remote ? remotePath(remote) : '/editor';
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
      const name = button.dataset.provider!;
      button.textContent = `${session.user ? 'Link' : 'Continue with'} ${session.providerLabels?.[name] ?? PROVIDER_NAMES[name] ?? name}`;
    }
    el('account-sessions').hidden = !session.user;
    if (session.user) await accountSessions();
    if (!el<HTMLDialogElement>('account-dialog').open)
      el<HTMLDialogElement>('account-dialog').showModal();
  })().catch(fail);
};
/** The sign-in providers' own names, for their buttons. */
const PROVIDER_NAMES: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  facebook: 'Facebook',
  microsoft: 'Microsoft',
};
/** Lists timelines again, if the dashboard is shown: who is signed in where changed. */
function refreshDashboard() {
  if (document.body.dataset.dashboard === 'true') void community.dashboard().catch(fail);
}
/** Reads a server's session: the one in use's by default, or another connected server's. */
async function refreshSession(origin = serverOrigin) {
  const fresh = await requestApi<Session>(
    'session',
    'GET',
    undefined,
    null,
    undefined,
    desktop ? origin : undefined,
  );
  if (origin !== serverOrigin) {
    if (connected.includes(origin)) sessions.set(origin, fresh);
    renderServers();
    refreshDashboard();
    return;
  }
  session = fresh;
  // Pages follow their server's limit, for its timelines and browser drafts alike.
  setEntryLimit(sessionEntryLimit(fresh));
  renderServers();
  accountHeading();
  heading();
  refreshDashboard();
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
/** Signs the desktop in to a connected server through the system browser. */
function desktopLogin(origin: string, status: string) {
  const attempt = ++desktopLoginAttempt;
  void (async () => {
    const result = await window.__TAURI__!.core.invoke<{
      userCode: string;
      verificationUri: string;
    }>('desktop_auth_start', { server: origin });
    // Grouped to be read and typed easily; the approval page takes it with or without the dash.
    const shown = `${result.userCode.slice(0, 5)}-${result.userCode.slice(5)}`;
    text(
      status,
      `Type the code ${shown} on the page your browser opens, to approve this computer. ${result.verificationUri}`,
    );
    const deadline = Date.now() + 600000;
    const poll = async () => {
      if (attempt !== desktopLoginAttempt || Date.now() > deadline) return;
      try {
        const result = await window.__TAURI__!.core.invoke<{ pending?: boolean }>(
          'desktop_auth_poll',
          { server: origin },
        );
        if (result.pending) {
          setTimeout(() => void poll(), 3500);
          return;
        }
        if (!connected.includes(origin)) return;
        await refreshSession(origin);
        text(status, '');
        if (origin === serverOrigin) el<HTMLDialogElement>('account-dialog').close();
        await directory();
        toast(
          severalServers()
            ? `Desktop connected to your account on ${serverHost(origin)}.`
            : 'Desktop connected to your account.',
        );
      } catch (error) {
        fail(error);
      }
    };
    setTimeout(() => void poll(), 3500);
  })().catch(fail);
}
el('desktop-login').onclick = () => {
  if (desktop) desktopLogin(serverOrigin, 'desktop-login-status');
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
  // On a desktop connected to several servers, the account is the server in use's.
  const where = severalServers() ? ` · ${serverHost(serverOrigin)}` : '';
  text('account-button', (session.user ? `@${session.user.username}` : 'Sign in') + where);
  el('logout-button').hidden = !session.user;
  el('account-button').hidden = offlineHtml;
  // The desktop can only sign in through a reachable server connection.
  const disconnected = desktop && !session.server;
  el<HTMLButtonElement>('account-button').disabled = disconnected;
  el('account-button').title = disconnected ? 'Connect to a server to sign in' : '';
  el('server-button').hidden = !desktop;
  text('server-button', severalServers() ? `Servers (${connected.length})` : 'Server connection');
}
el('logout-button').onclick = () => {
  if (comparison) stopComparison();
  if (!mayReplace()) return;
  void api('auth/logout', 'POST', {})
    .then(() => {
      const user = session.user;
      session = { ...session, user: null, csrf: null };
      // Signing out leaves no timeline windows in this browser (on a desktop, of this server).
      clearTimeout(persistTimer);
      forgetViews();
      if (!desktop) void windowStore.clear().catch(() => {});
      else if (user) void windowStore.forget(storeScope(serverOrigin, user.id)).catch(() => {});
      desktopLoginAttempt++;
      accountHeading();
      renderServers();
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
  api: (path, method, data, origin) =>
    desktop && origin
      ? requestApi(path, method, data, sessionOf(origin).csrf, undefined, origin)
      : api(path, method, data),
  // A desktop lists the timelines of every server it is connected to.
  sources: () =>
    desktop
      ? connected.map((origin) => ({
          origin,
          signedIn: !!sessionOf(origin).user,
          reachable: sessionOf(origin).server,
          inUse: origin === serverOrigin,
        }))
      : undefined,
  chip: (origin) => (origin && severalServers() ? serverChip(origin) : null),
  link: (id, origin) => timelineHash(id, origin ?? serverOrigin),
  user: () => session.user,
  server: () => session.server,
  presenter: () => timelinePresenter(),
  momentTime: (id) => model?.momentTime(id),
  compareLimit: () => compareLimit(),
  guestCopies: () => !desktop && !offlineHtml,
  timeline: () => remote,
  document: async () => {
    flushEventEdit();
    if (!model) throw new Error('Load an editable timeline first.');
    proposalSubmissionVersion = editVersion;
    proposalSubmissionDocument = documentRequest;
    // Proposed on the server: links to images, not copies (#109).
    return withoutImageCopies(await completeDocument());
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
  edit: (proposal, document) => {
    if (!mayReplace()) return;
    const upstream = remote!;
    loadDocument(validateDocument(document));
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
          loadDocument(newDocument());
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
      // The server keeps links to images, not copies of them (#109): copies are for the
      // files you export.
      if (patch) delete patch.settings.assets;
      const document = index && remote ? undefined : withoutImageCopies(await completeDocument());
      let result: RemoteTimeline;
      try {
        result =
          index && remote
            ? await api<RemoteTimeline>(`timelines/${remote.id}/changes`, 'PUT', {
                revision: remote.revision,
                ...patch,
                // What the edits were made on, so they merge onto a newer revision (#165).
                base: saveBase(sent!, remote),
              })
            : remote
              ? await api<RemoteTimeline>(`timelines/${remote.id}`, 'PUT', {
                  revision: remote.revision,
                  document,
                })
              : await api<RemoteTimeline>('timelines', 'POST', document);
      } catch (error) {
        const conflicts = (error as { conflicts?: SaveConflict[] }).conflicts;
        if (!Array.isArray(conflicts) || workspace !== documentRequest) throw error;
        offerConflicts(conflicts, (error as Error).message);
        return;
      }
      if (workspace !== documentRequest) return;
      // Saved: what was kept against conflicts is settled.
      keptVersions = null;
      remote = result;
      local = null;
      // A draft saved to the server is on the server now, not a draft (#188).
      const saved = openDraft();
      if (saved) {
        draftOf = null;
        clearTimeout(draftTimer);
        draftTimer = undefined;
        storedDrafts.delete(saved);
        void deleteDraft(saved).catch(() => {});
      }
      if (document) model!.assets = undefined;
      if (index && sent) {
        index.accepted(sent, selected?.id);
        // Settings others saved meanwhile were merged in: take them where unedited since.
        if (patch) adoptSettings(index, patch.settings, result);
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
      window.history.replaceState(null, '', timelineHash(result.id));
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
/**
 * Moves the open server timeline, with unsaved edits, to its latest revision (#165): its
 * settings take the latest values where not edited here, and the view reads the latest
 * revision under the edits. Each edit keeps the version it was made on, so saving merges.
 */
async function moveToLatest(id: string) {
  const request = documentRequest,
    index = sparseWorkspace(),
    before = remote;
  const info = await api<RemoteTimeline>(`timelines/${id}`);
  if (request !== documentRequest || remote !== before || !index || saving) return;
  if (info.presentation) info.presentation = validatePresentation(info.presentation);
  if (info.plugins) info.plugins = validateInstalledPlugins(info.plugins);
  if (info.assets) info.assets = validateAssets(info.assets);
  if (info.tags) info.tags = validateTags(info.tags);
  info.image = info.image ? validateTimelineImage(info.image) : undefined;
  info.view = readTimelineView(info.view);
  info.views = readSavedViews(info.views);
  // Settings not edited here are as `before` had them: they take the latest.
  adoptSettings(index, before!, info);
  if (
    info.event_generation !== undefined &&
    BigInt(info.event_generation) > BigInt(before?.event_generation ?? '0')
  )
    follow.addition();
  remote = info;
  remoteCache.clear();
  frameRequest++;
  liveTransitionPending = true;
  heading();
  requestRender();
}
/** `document` without copies of its images, as the server keeps it (#109). */
function withoutImageCopies(document: TimelineDocument): TimelineDocument {
  const { assets: _copies, ...rest } = document;
  return rest;
}
/** A save's conflict with what was saved meanwhile (server/save-merge.mjs). */
interface SaveConflict {
  kind: 'moment' | 'duration' | 'setting';
  id: string;
  title: string | null;
}
const SETTING_KEYS = [
  'title',
  'description',
  'tags',
  'image',
  'view',
  'views',
  'presentation',
  'plugins',
  'assets',
] as const;
/**
 * Conflicts the editor chose to keep its own version of: saved without what they were made
 * on, so they replace what was saved. For the open timeline only, until it saves.
 */
let keptVersions: {
  document: number;
  moments: Set<string>;
  durations: Set<string>;
  settings: Set<string>;
} | null = null;
/**
 * What the edits being saved were made on (#165): each changed moment's and duration's
 * version when loaded (null for one added) and the settings as loaded. The server merges the
 * edits onto a newer revision with it, refusing only what conflicts.
 */
function saveBase(sent: SavingChanges, saved: RemoteTimeline) {
  const kept = keptVersions?.document === documentRequest ? keptVersions : null;
  return {
    settings: Object.fromEntries(
      SETTING_KEYS.filter((key) => !kept?.settings.has(key)).map((key) => [
        key,
        saved[key] ?? null,
      ]),
    ),
    moments: [...sent.moments]
      .filter(([id]) => !kept?.moments.has(id))
      .map(([id, change]) => ({ id, event: change.before ?? null })),
    durations: [...sent.durations]
      .filter(([id]) => !kept?.durations.has(id))
      .map(([id, change]) => ({ id, duration: change.before ?? null })),
  };
}
/**
 * After a save: settings as saved (with others' merged in), for each the editor has not
 * changed again since it sent `sent`.
 */
function adoptSettings(
  index: RemoteWorkspace,
  sent: Partial<Pick<TimelineDocument, (typeof SETTING_KEYS)[number]>>,
  saved: RemoteTimeline,
) {
  for (const key of SETTING_KEYS)
    if (JSON.stringify(index[key] ?? null) === JSON.stringify(sent[key] ?? null))
      takeSetting(index, key, saved);
    else if (key === 'assets') index.assets = { ...(saved.assets ?? {}), ...(index.assets ?? {}) };
}
/** Setting `key` of the workspace as `saved` has it. */
function takeSetting(
  index: RemoteWorkspace,
  key: (typeof SETTING_KEYS)[number],
  saved: RemoteTimeline,
) {
  if (key === 'title') index.title = saved.title;
  if (key === 'description') index.description = saved.description;
  if (key === 'tags') index.tags = saved.tags ? validateTags(saved.tags) : undefined;
  if (key === 'image') index.image = saved.image ? validateTimelineImage(saved.image) : undefined;
  if (key === 'view') index.view = readTimelineView(saved.view);
  if (key === 'views') index.views = readSavedViews(saved.views);
  if (key === 'presentation')
    index.presentation = saved.presentation ? validatePresentation(saved.presentation) : undefined;
  if (key === 'plugins')
    index.plugins = saved.plugins ? validateInstalledPlugins(saved.plugins) : undefined;
  if (key === 'assets') index.assets = saved.assets ? validateAssets(saved.assets) : undefined;
}
const SETTING_NAMES: Record<string, string> = {
  title: 'The title',
  description: 'The description',
  tags: 'The tags',
  image: 'The image',
  view: 'The default view',
  presentation: 'The time display',
  plugins: 'The plugins',
  assets: 'The images',
};
let pendingConflicts: SaveConflict[] = [];
/** Shows a save's conflicts, to keep the editor's versions or take the saved ones. */
function offerConflicts(conflicts: SaveConflict[], message: string) {
  pendingConflicts = conflicts;
  text('conflict-description', message);
  el('conflict-list').replaceChildren(
    ...conflicts.map((conflict) => {
      const item = document.createElement('li');
      item.textContent =
        conflict.kind === 'setting'
          ? (SETTING_NAMES[conflict.id] ?? conflict.id)
          : `The ${conflict.kind} “${conflict.title || 'Untitled'}”`;
      return item;
    }),
  );
  el<HTMLDialogElement>('conflict-dialog').showModal();
}
el('conflict-mine').onclick = () => {
  const kept =
    keptVersions?.document === documentRequest
      ? keptVersions
      : {
          document: documentRequest,
          moments: new Set(),
          durations: new Set(),
          settings: new Set(),
        };
  for (const conflict of pendingConflicts)
    (conflict.kind === 'moment'
      ? kept.moments
      : conflict.kind === 'duration'
        ? kept.durations
        : kept.settings
    ).add(conflict.id);
  keptVersions = kept as typeof keptVersions;
  el<HTMLDialogElement>('conflict-dialog').close();
  el('publish-button').click();
};
el('conflict-theirs').onclick = () => {
  const index = sparseWorkspace(),
    conflicts = pendingConflicts,
    workspace = documentRequest;
  el<HTMLDialogElement>('conflict-dialog').close();
  if (!index || !remote) return;
  void (async () => {
    const settings = conflicts.filter((c) => c.kind === 'setting').map((c) => c.id);
    // The settings as saved now, for those taken from it.
    const saved = settings.length ? await api<RemoteTimeline>(`timelines/${remote!.id}`) : null;
    if (workspace !== documentRequest) return;
    for (const conflict of conflicts) {
      if (conflict.kind === 'moment') index.discardMoment(conflict.id);
      if (conflict.kind === 'duration') index.discardDuration(conflict.id);
      if (selected?.id === conflict.id || openDuration?.duration.id === conflict.id) {
        el<HTMLDialogElement>('inspector').close();
        durationDialog.close();
        selected = null;
      }
    }
    for (const key of settings)
      if ((SETTING_KEYS as readonly string[]).includes(key))
        takeSetting(index, key as (typeof SETTING_KEYS)[number], saved!);
    // Undo and redo would bring back what was dropped.
    clearHistory();
    remoteCache.clear();
    frameRequest++;
    requestRender();
    el('publish-button').click();
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
    if (mayReplace()) window.parent.location.href = remotePath(remote) + '/settings';
    return;
  }
  el<HTMLSelectElement>('visibility').value = remote.visibility;
  text('sharing-link', serverOrigin + remotePath(remote));
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
/** Keeps the open server timeline as an unsaved local copy, as its server goes. */
async function keepAsLocal() {
  if (comparison) stopComparison();
  if (remote && (!model || sparseWorkspace())) {
    try {
      const snapshot = await api<{ document: TimelineDocument }>(`timelines/${remote.id}/document`);
      model = new TimelineIndex(
        validateDocument(sparseWorkspace()?.apply(snapshot.document) ?? snapshot.document),
      );
    } catch {
      model = new TimelineIndex(newDocument());
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
}
/** Whether a timeline of the server in use is open, which keeps that server in use. */
function serverTimelineOpen() {
  return !!remote || !!comparison;
}
/** The desktop's connected servers, each with its sign-in and what can be done with it. */
function renderServers() {
  if (!desktop) return;
  const list = el('server-list');
  list.replaceChildren();
  list.hidden = !connected.length;
  const ordered = [serverOrigin, ...connected.filter((o) => o !== serverOrigin)].filter((o) =>
    connected.includes(o),
  );
  for (const origin of ordered) {
    const current = sessionOf(origin);
    const row = document.createElement('div');
    row.className = 'server-row';
    row.dataset.server = origin;
    const status = document.createElement('span');
    status.className = 'server-status';
    status.textContent =
      (origin === serverOrigin ? 'In use · ' : '') +
      (current.user
        ? `@${current.user.username}`
        : current.server
          ? 'Not signed in'
          : 'Not reachable');
    row.append(serverChip(origin), status);
    const action = (label: string, run: () => Promise<void>, disabled = '') => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.dataset.action = label.toLowerCase().replace(/\s+/g, '-');
      button.disabled = !!disabled;
      button.title = disabled;
      button.onclick = () => {
        text('connection-error', '');
        void run().catch((error) => text('connection-error', error.message));
      };
      row.append(button);
    };
    if (origin !== serverOrigin)
      action(
        'Use',
        () => useConnected(origin),
        serverTimelineOpen() ? 'A timeline from the server in use is open.' : '',
      );
    if (current.user) action('Sign out', () => signOutServer(origin));
    else
      action(
        'Sign in',
        async () => desktopLogin(origin, 'connection-status'),
        current.server ? '' : 'This server could not be reached.',
      );
    action('Disconnect', () => disconnectServer(origin));
    list.append(row);
  }
}
async function nativeServers() {
  connected = await window.__TAURI__!.core.invoke<string[]>('desktop_servers');
}
/** Uses another connected server: new timelines are saved there, and the account is its. */
async function useConnected(origin: string) {
  if (serverTimelineOpen()) return;
  // Connecting again puts the server first, so the next start uses it too.
  await window.__TAURI__!.core.invoke('desktop_connect', { origin });
  await nativeServers();
  useServer(origin);
  accountHeading();
  heading();
  renderServers();
  refreshDashboard();
}
/** Connects to one more server, keeping the others; it is used unless a timeline is open. */
async function connectServer(address: string) {
  await window.__TAURI__!.core.invoke('desktop_connect', { origin: address });
  const origin = new URL(address).origin;
  await nativeServers();
  if (!serverTimelineOpen()) useServer(origin);
  accountHeading();
  heading();
  renderServers();
  input('server-origin').value = '';
  try {
    await refreshSession(origin);
  } catch {
    throw new Error(`${serverHost(origin)} could not be reached; it stays in the list.`);
  }
  await directory();
}
/** Disconnects from a server; its open timeline stays as an unsaved local copy. */
async function disconnectServer(origin: string) {
  if (origin === serverOrigin) await keepAsLocal();
  desktopLoginAttempt++;
  await window.__TAURI__!.core.invoke('desktop_disconnect', { origin });
  await nativeServers();
  sessions.delete(origin);
  if (origin === serverOrigin) useServer(connected[0] ?? null);
  accountHeading();
  heading();
  renderServers();
  refreshDashboard();
  await directory();
}
/** Signs out of a connected server; the others stay signed in. */
async function signOutServer(origin: string) {
  if (origin === serverOrigin) {
    el('logout-button').click();
    return;
  }
  const current = sessionOf(origin);
  await requestApi('auth/logout', 'POST', {}, current.csrf, undefined, origin);
  if (current.user) void windowStore.forget(storeScope(origin, current.user.id)).catch(() => {});
  await refreshSession(origin);
  await directory();
}
if (desktop) {
  el('server-button').onclick = () => {
    text('connection-error', '');
    text('connection-status', '');
    renderServers();
    el<HTMLDialogElement>('connection-dialog').showModal();
  };
  el<HTMLFormElement>('connection-form').onsubmit = (event) => {
    event.preventDefault();
    text('connection-error', '');
    void connectServer(input('server-origin').value).catch((error) =>
      text('connection-error', error.message),
    );
  };
  for (const id of ['sqlite-open', 'sqlite-save', 'sqlite-save-as', 'populate-button'])
    el(id).hidden = false;
  const adoptNative = async (
    result: NativeOpened | null,
    workspace: number,
    savedFile: boolean,
  ) => {
    if (!result || workspace !== documentRequest) return;
    const document = validateDocument(result.document);
    // The generation the file has now, not the open reply's guess (#193).
    const generation = await window.__TAURI__!.core.invoke<number>('desktop_accept_open', {
      path: result.path,
    });
    if (workspace !== documentRequest) return;
    // A timeline from a file shows its images from other sites only once the reader has
    // chosen to, for that file (remembered by Rust); a populated one is the reader's own.
    const trust = await window
      .__TAURI__!.core.invoke<DesktopTrust>('desktop_trust', { generation })
      .catch((): DesktopTrust => ({ trusted: false, images: false }));
    if (workspace !== documentRequest) return;
    historyReplace();
    // Set before loadDocument, which starts this next document request and may draw at once.
    remoteImagesHeld = trust.images ? -1 : documentRequest + 1;
    loadDocument(document);
    model = new RemoteWorkspace(document);
    local = { ...result, generation, id: 'local-sqlite', revision: String(generation) };
    desktopSettings = JSON.stringify(model.document());
    desktopSavedBaseline = null;
    viewport = Viewport.fit(
      result.first ? Q.parse(result.first) : undefined,
      result.last ? Q.parse(result.last) : undefined,
    );
    sqlitePath = savedFile ? result.path : null;
    sqliteSavedVersion = savedFile ? editVersion : null;
    heading();
    requestRender();
    await openDefaultView(document.view);
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
  // Images from other sites in a timeline from a file wait until the reader shows them, since
  // fetching one tells its site the reader's address and when they looked; the heading says so
  // once one has been held back. Rust remembers the choice for the file.
  holdRemoteImages(
    () => remoteImagesHeld === documentRequest,
    () => {
      if (remoteImagesNoticed === documentRequest) return;
      remoteImagesNoticed = documentRequest;
      el('remote-images-status').hidden = false;
    },
  );
  /** Shows the open timeline's images from other sites, and its files' thumbnails, as trusted. */
  const applyTrust = (trust: DesktopTrust, request: number) => {
    if (request !== documentRequest) return;
    if (trust.images && remoteImagesHeld === documentRequest) {
      remoteImagesHeld = -1;
      heading();
      requestRender();
    }
    // Trusted now, files outside the chosen folders get thumbnails: asked again.
    if (trust.trusted) forgetMissingThumbnails();
  };
  el('remote-images-show').onclick = () => {
    const request = documentRequest;
    remoteImagesHeld = -1;
    heading();
    requestRender();
    void window
      .__TAURI__!.core.invoke<DesktopTrust>('desktop_show_images', {
        generation: local?.generation,
      })
      .then((trust) => applyTrust(trust, request))
      .catch(fail);
  };
  // Sources open outside the page (#433): HTTPS links in the system browser, and a file on
  // this computer in its own app, or shown in its folder. Rust follows a timeline's file links
  // only in the folders the user chose, or once the user trusts the timeline, which it asks in
  // its own dialog (src-tauri/src/access.rs): the page can't answer for the user.
  document.addEventListener('click', (event) => {
    const target = event.target as Element;
    const request = documentRequest,
      generation = local?.generation;
    const reveal = target.closest<HTMLButtonElement>('.local-file-reveal');
    if (reveal) {
      event.preventDefault();
      void window
        .__TAURI__!.core.invoke<DesktopTrust>('desktop_reveal_file', {
          url: reveal.dataset.localFile,
          generation,
        })
        .then((trust) => applyTrust(trust, request))
        .catch(fail);
      return;
    }
    const link = target.closest<HTMLAnchorElement>('a.local-file-link, .plugin-source-links a');
    if (!link) return;
    event.preventDefault();
    if (!link.classList.contains('local-file-link')) {
      void window.__TAURI__!.core.invoke('desktop_open_image', { url: link.href }).catch(fail);
      return;
    }
    void window
      .__TAURI__!.core.invoke<DesktopTrust>('desktop_open_file', { url: link.href, generation })
      .then((trust) => applyTrust(trust, request))
      .catch(fail);
  });
  // Thumbnails of photos on this computer (#440), as markers show them: asked of Rust in
  // batches of up to 64 as markers need them, kept here (the latest 2,000, and the photos that
  // have none), and drawn when they come. They stay in this page: they are never saved. Rust
  // makes them only of files the timeline on screen may name, so they are kept for that
  // timeline alone, and those it had none of are asked again once it is trusted.
  const thumbnails = new Map<string, string | null>(),
    wantedThumbnails = new Set<string>();
  let thumbnailTimer: ReturnType<typeof setTimeout> | undefined,
    thumbnailsFor = documentRequest;
  const forgetMissingThumbnails = () => {
    for (const [url, found] of thumbnails) if (found === null) thumbnails.delete(url);
    requestRender(false);
  };
  const askThumbnails = async () => {
    const urls = [...wantedThumbnails].slice(0, 64);
    for (const url of urls) wantedThumbnails.delete(url);
    const request = documentRequest;
    const found = await window
      .__TAURI__!.core.invoke<(string | null)[]>('desktop_thumbnails', {
        urls,
        generation: local?.generation,
      })
      .catch(() => [] as (string | null)[]);
    if (request === documentRequest)
      urls.forEach((url, i) => thumbnails.set(url, found[i] ?? null));
    while (thumbnails.size > 2000) thumbnails.delete(thumbnails.keys().next().value!);
    requestRender(false);
    thumbnailTimer = wantedThumbnails.size ? setTimeout(() => void askThumbnails(), 0) : undefined;
  };
  useLocalImages((url) => {
    if (thumbnailsFor !== documentRequest) {
      thumbnailsFor = documentRequest;
      thumbnails.clear();
    }
    if (thumbnails.has(url)) return thumbnails.get(url)!;
    wantedThumbnails.add(url);
    thumbnailTimer ??= setTimeout(() => void askThumbnails(), 30);
    return null;
  });
  // The file populator (#433): a new timeline of the files in folders picked natively, each
  // moment's source the file itself, dated as chosen. The page never names a path: Rust scans
  // only what was picked in its own dialog.
  const invoke = window.__TAURI__!.core.invoke;
  const checked = (name: string) =>
    document.querySelector<HTMLInputElement>(`#populate-dialog input[name="${name}"]:checked`)!
      .value;
  const populateRoots = (roots: string[]) => {
    el('populate-roots').replaceChildren(
      ...roots.map((root) => {
        const item = document.createElement('li');
        item.textContent = root;
        return item;
      }),
    );
    el<HTMLButtonElement>('populate-clear').disabled = !roots.length;
    if (roots.length && !input('populate-title').value.trim())
      input('populate-title').value = roots[0].split(/[\\/]/).filter(Boolean).at(-1) ?? '';
  };
  /** Shows the choices the kind of file allows: only media has metadata, a zone and a place. */
  const populateChoices = () => {
    const media = checked('populate-type') === 'mediaFile';
    for (const node of document.querySelectorAll<HTMLElement>('#populate-dialog [data-media-only]'))
      node.hidden = !media;
    if (!media && checked('populate-date') === 'metadata')
      document.querySelector<HTMLInputElement>(
        '#populate-dialog input[name="populate-date"][value="modified"]',
      )!.checked = true;
    el('populate-zone-row').hidden = !media || checked('populate-date') !== 'metadata';
  };
  for (const radio of document.querySelectorAll<HTMLInputElement>(
    '#populate-dialog input[type="radio"]',
  ))
    radio.onchange = populateChoices;
  const populateFailed = (error: unknown) =>
    text('populate-error', error instanceof Error ? error.message : String(error));
  el('populate-button').onclick = () => {
    if (!mayReplace()) return;
    text('populate-error', '');
    text('populate-status', '');
    populateChoices();
    el<HTMLDialogElement>('populate-dialog').showModal();
  };
  for (const [id, folders] of [
    ['populate-folders', true],
    ['populate-files', false],
  ] as const)
    el(id).onclick = () => {
      text('populate-error', '');
      void invoke<string[]>('desktop_populate_pick', { folders })
        .then(populateRoots)
        .catch(populateFailed);
    };
  el('populate-clear').onclick = () => {
    void invoke('desktop_populate_clear')
      .then(() => populateRoots([]))
      .catch(populateFailed);
  };
  el('populate-stop').onclick = () => void invoke('desktop_populate_cancel').catch(populateFailed);
  el<HTMLFormElement>('populate-form').onsubmit = (event) => {
    event.preventDefault();
    const workspace = documentRequest,
      media = checked('populate-type') === 'mediaFile';
    const settings = {
      fileType: { type: checked('populate-type'), date: checked('populate-date') },
      recursive: input('populate-recursive').checked,
      zone: el<HTMLSelectElement>('populate-zone').value,
      location: media && input('populate-location').checked,
    };
    // Dated in this computer's zone, each moment's file listed by Sources and, when it is a
    // photo, shown as its marker by File thumbnails (#440).
    const template: TimelineDocument = {
      format: 'openchronology',
      version: 1,
      title: input('populate-title').value.trim(),
      description: '',
      presentation: {
        ...DEFAULT_PRESENTATION,
        mode: 'gregorian',
        offsetMinutes: Math.max(-1439, Math.min(1439, -new Date().getTimezoneOffset())),
      },
      plugins: [
        { manifest: MOMENT_SOURCES, enabled: true },
        { manifest: FILE_THUMBNAILS, enabled: true },
      ],
      events: [],
    };
    const progress = new window.__TAURI__!.core.Channel<{ scanned: number; added: number }>();
    progress.onmessage = ({ scanned, added }) =>
      text(
        'populate-status',
        `Looked at ${scanned.toLocaleString()} files and folders; ${added.toLocaleString()} moments so far.`,
      );
    const busy = (on: boolean) => {
      el<HTMLButtonElement>('populate-start').disabled = on;
      el('populate-stop').hidden = !on;
      el('populate-working').hidden = !on;
    };
    text('populate-error', '');
    busy(true);
    void invoke<NativeOpened & { report: PopulateReport }>('desktop_populate', {
      settings,
      template,
      progress,
    })
      .then(async (result) => {
        await adoptNative(result, workspace, false);
        el<HTMLDialogElement>('populate-dialog').close();
        text('populate-status', '');
        toast(populateSummary(result.report));
      })
      .catch(populateFailed)
      .finally(() => busy(false));
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
              // The file holds what is open now (#179).
              if (sparseWorkspace()) desktopSettings = JSON.stringify(model!.document());
              desktopSavedBaseline = null;
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
  emptyTimelineText = 'Import a timeline or add your first moment.';
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
    // Links between a comparison's timelines are read again and redrawn (#422).
    linked(id) {
      if (id === remote?.id) updateLinkedFrom(true);
      if (!comparison) return;
      comparison.clearLinks();
      frameRequest++;
      requestRender();
    },
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
      // Unsaved edits stay; the view follows the latest revision, and saving merges onto it
      // (#165). Not while saving, or in a pull request's working copy.
      if (dirty && !saving && !workingProposal && sparseWorkspace()) {
        await moveToLatest(id);
        return;
      }
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
  // Without a server (offline, desktop on its own) every comparison may hold up to eight.
  limit: () => compareLimit(),
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
  uiScale = baseScale();
  fitStageToTracks();
  verticalOffset = centeredOffset();
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
if (!desktop && !offlineHtml && !platformEditor && !embedded) setDashboard(true);
heading();
accountHeading();
requestRender();
void (async () => {
  if (desktop) {
    try {
      await nativeServers();
      useServer(connected[0] ?? null);
      input('server-origin').value = connected.length ? '' : 'https://timescale.info';
      // Each server's sign-in, at once; one that cannot be reached leaves the others.
      await Promise.all(connected.map((origin) => refreshSession(origin).catch(() => {})));
      accountHeading();
      heading();
      await directory();
    } catch {
      /* The desktop keeps working with local files while disconnected. */
    }
  }
  // An embedded timeline is shown as a guest sees it, whoever is signed in.
  if (embedded) session = { user: null, csrf: null, server: true };
  else if (!desktop && !offlineHtml) {
    try {
      await refreshSession();
      if (session.user) {
        try {
          // The draft asked for (?draft=…, from the dashboard), or the latest edited (#188).
          const drafts = await listDrafts(session.user.id),
            asked = new URLSearchParams(location.search).get('draft');
          const chosen = drafts.find((d) => d.id === asked) ?? (asked ? undefined : drafts[0]);
          const draft = chosen ? await loadDraft(chosen.id) : null;
          if (draft && !location.hash && !freshTimeline && !sampleTimeline) {
            const opened = validateDocument(draft);
            loadDocument(opened, chosen!.id);
            setDashboard(!platformEditor);
            await openDefaultView(opened.view);
          } else if (asked) toast('That draft is no longer in this browser.');
          await restoreAfterSignIn();
        } catch {
          /* Authenticated browser storage can be unavailable. */
        }
        await directory();
      }
      sessionKnown = true;
      if (!hasDashboard()) setDashboard(false);
    } catch {
      sessionKnown = true;
      setDashboard(false);
    }
  }
  await route();
  // Started from the help (/editor?tour=1).
  if (new URLSearchParams(location.search).get('tour') === '1') tour();
})()
  .catch(fail)
  // The file actions show once the opening timeline has set them (styles.css), whether or not
  // it opened.
  .finally(() => (document.documentElement.dataset.settled = ''));

/** What a summary's menu item opening its details says: what the summary holds. */
function viewGroupLabel(group: FrameGroup) {
  const moments = BigInt(group.count) > 0n,
    durations = BigInt(group.durationCount ?? 0) > 0n;
  return moments && durations ? 'View events' : durations ? 'View durations' : 'View moments';
}
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
/** Comma-separated entity tags, normalized like timeline tags. */
function parseTagInput(value: string): string[] {
  return validateTags(
    value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
}
/** "3 moments", "2 durations" or "3 moments · 2 durations". */
function summaryName(group: FrameGroup) {
  const moments = BigInt(group.count),
    spans = BigInt(group.durationCount ?? '0');
  const part = (n: bigint, one: string, many: string) =>
    `${n.toLocaleString()} ${n === 1n ? one : many}`;
  return [
    ...(moments ? [part(moments, 'moment', 'moments')] : []),
    ...(spans ? [part(spans, 'duration', 'durations')] : []),
  ].join(' · ');
}
function durationLabel(duration: Duration) {
  const band =
    frame.durations?.find((b) => b.id === duration.id) ??
    (model ? resolveDuration(duration, (id) => model!.momentTime(id)) : null);
  return (
    (duration.metadata.title || 'Untitled duration') +
    (band ? ` · ${presented(Q.parse(band.first))} → ${presented(Q.parse(band.last))}` : '')
  );
}

type DurationEdit = { duration: true; before?: Duration; after?: Duration };
/**
 * The duration dialog's session, like the moment dialog's: edits preview as they are typed,
 * only Save keeps them, and a new duration (`isNew`) is added only by Save.
 */
let openDuration: {
  duration: Duration;
  readOnly: boolean;
  edit: DurationEdit | null;
  isNew: boolean;
  document: number;
} | null = null;
let durationTimer: ReturnType<typeof setTimeout> | undefined;
const durationEditable = () => editable() && !!openDuration && !openDuration.readOnly;
function createDuration(start: DurationEndpoint, end: DurationEndpoint) {
  if (!editable() || !model) return;
  const duration: Duration = { id: eventId(), start, end, metadata: { title: '' } };
  // Not added until Save.
  showDuration(duration, false, true);
}
/** Full metadata is local for complete timelines and fetched for indexed ones. */
async function openDurationById(id: string, known?: DurationBand) {
  const band = known ?? frame.durations?.find((b) => b.id === id);
  if (band?.sourceKey) {
    // A separated track's duration is the open timeline's own (#345), read as it keeps it.
    if (!separation || !reading()) return showDuration(band, true);
    id = band.id.slice(band.sourceKey.length + 1);
  }
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
  // Guests have no workspace: they read the duration as the server keeps it.
  if (!duration && !model && remote && !local) {
    const result = await timelineQuery<{ duration: Duration | null }>({
      kind: 'duration',
      id,
      revision: remote.revision,
    });
    if (result.duration) return showDuration(result.duration, true);
  }
  if (!duration) throw new Error('This duration is no longer available.');
  showDuration(duration, !editable());
}
function showDuration(duration: Duration, readOnly: boolean, isNew = false) {
  if (!isNew && reading()) {
    // Its band on the timeline: on a separated track, under that track's key.
    const band =
      frame.durations?.find((b) => b.id === (b.sourceKey ? b.sourceKey + ':' : '') + duration.id) ??
      resolveDuration(duration, (id) => model?.momentTime(id));
    const when = band
      ? `${presentedAlone(Q.parse(band.first))} → ${presentedAlone(Q.parse(band.last))}`
      : '';
    return showReader('duration', duration.id, duration.metadata, when);
  }
  // Opening another entity ends the current session without keeping it.
  discardDurationEdits();
  openDuration = { duration, readOnly, edit: null, isNew, document: documentRequest };
  text('duration-heading', isNew ? 'New event' : 'Duration');
  input('duration-title').value = duration.metadata.title ?? '';
  el<HTMLTextAreaElement>('duration-description').value = duration.metadata.description ?? '';
  input('duration-tags').value = entityTags(duration.metadata).join(', ');
  showLabels('duration-labels', 'duration-sensitive', duration.metadata, readOnly);
  const rest = { ...duration.metadata };
  delete rest.title;
  delete rest.description;
  delete rest[CONTENT_LABELS_KEY];
  if (entityTags(duration.metadata).length === (duration.metadata.tags as unknown[])?.length)
    delete rest.tags;
  el<HTMLTextAreaElement>('duration-metadata').value = JSON.stringify(rest, null, 2);
  for (const id of ['duration-title', 'duration-description', 'duration-tags', 'duration-metadata'])
    (el(id) as HTMLInputElement).disabled = readOnly;
  // A new duration is not on the timeline yet: Cancel is how to drop it.
  el('duration-delete').hidden = readOnly || isNew;
  el('duration-cancel').parentElement!.hidden = readOnly;
  text('duration-error', '');
  renderDurationEndpoints();
  renderDurationPluginFields();
  renderRelated(
    el('duration-related'),
    readOnly && comparison && !separation ? null : { duration: duration.id },
    readOnly,
  );
  // A new duration has no place on the timeline yet to fit.
  el('duration-fit').hidden = isNew;
  el('duration-share').hidden =
    isNew || !shareable() || !!sparseWorkspace()?.durationChanges.has(duration.id);
  el('duration-report').hidden = el('duration-share').hidden || !!remote?.canShare;
  showEventKind('duration', isNew && !readOnly);
  durationDialog.showModal();
  if (!isNew && !comparison) reportLink({ kind: 'duration', id: duration.id });
}
/** Reads the form into a duration; throws with a user-facing message when incomplete. */
function durationFromForm(): Duration {
  const current = openDuration!.duration;
  const metadata = JSON.parse(el<HTMLTextAreaElement>('duration-metadata').value);
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    throw new Error('Additional metadata must be a JSON object.');
  const tags = parseTagInput(input('duration-tags').value),
    labels = checkedLabels('duration-labels');
  delete metadata[CONTENT_LABELS_KEY];
  return validateDuration(
    {
      ...current,
      metadata: {
        ...metadata,
        title: input('duration-title').value,
        description: el<HTMLTextAreaElement>('duration-description').value,
        ...(tags.length ? { tags } : {}),
        ...(labels.length ? { [CONTENT_LABELS_KEY]: labels } : {}),
      },
    },
    parseTime,
  );
}
function applyDuration(next: Duration) {
  if (!openDuration || !model || !durationEditable()) return;
  if (JSON.stringify(next) === JSON.stringify(openDuration.duration)) return;
  // A new duration stays in the dialog until Save adds it.
  if (openDuration.isNew) {
    openDuration.duration = next;
    text('duration-error', '');
    return;
  }
  previewing = true;
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
/** Restores what the duration dialog opened with (within the same timeline) and ends its session. */
function discardDurationEdits() {
  clearTimeout(durationTimer);
  durationTimer = undefined;
  const current = openDuration;
  openDuration = null;
  const edit = current?.edit;
  if (edit && model && current?.document === documentRequest) {
    if (edit.before) model.putDuration(edit.before);
    else if (edit.after) model.deleteDuration(edit.after.id);
    forgetEdit(edit);
    changed();
  }
  endPreview(current?.document === documentRequest);
}
/** A duration's panel closing, other than by Save: nothing typed since it opened is kept. */
function durationClosed() {
  forgetLink('duration');
  discardDurationEdits();
  if (selected && !el('event-form').hidden) refreshDurations();
}
/** Removes one dialog session's undo step, whichever stack it is on. */
function forgetEdit(edit: HistoryEntry) {
  history = history.filter((e) => e !== edit);
  future = future.filter((e) => e !== edit);
}
// Save keeps what the dialog shows (edits preview as you type) and closes it; any other way
// of closing restores what the dialog opened with, and a new moment or duration is not added.
el('event-save').onclick = () => {
  // Saving a new moment creates it even if nothing was typed: its time is already set.
  if (momentSession?.isNew) pendingEventEdit = true;
  flushEventEdit();
  if (pendingEventEdit || el('event-error').textContent) return;
  const session = momentSession;
  momentSession = null;
  if (session?.isNew && session.draft && model && session.document === documentRequest) {
    const point = session.draft;
    record({ after: point });
    model.put(point);
    selected = point;
    changed();
  }
  eventEditHistory = null;
  endPreview();
  el<HTMLDialogElement>('inspector').close();
};
el('event-cancel').onclick = () => {
  discardMomentEdits();
  el<HTMLDialogElement>('inspector').close();
};
el('duration-save').onclick = () => {
  flushDurationEdit();
  if (el('duration-error').textContent) return;
  const current = openDuration;
  openDuration = null;
  if (
    current?.isNew &&
    model &&
    current.document === documentRequest &&
    editable() &&
    !current.readOnly
  ) {
    record({ duration: true, after: current.duration });
    model.putDuration(current.duration);
    changed();
  }
  endPreview();
  durationDialog.close();
};
el('duration-cancel').onclick = () => {
  discardDurationEdits();
  durationDialog.close();
};
el('duration-delete').onclick = () => requestDurationDelete();
/** Asks to delete the open duration. */
function requestDurationDelete() {
  const current = openDuration;
  if (!current || !durationEditable()) return;
  flushDurationEdit();
  pendingDelete = {
    id: current.duration.id,
    document: documentRequest,
    remove: () => {
      // Its unkept edits go first, so undo restores the duration as the dialog opened it.
      if (openDuration === current) discardDurationEdits();
      const duration = model?.durations.get(current.duration.id);
      if (duration) {
        record({ duration: true, before: duration });
        model?.deleteDuration(duration.id);
      }
      openDuration = null;
      el<HTMLDialogElement>('delete-dialog').close();
      durationDialog.close();
      changed();
    },
  };
  text('delete-heading', 'Delete duration?');
  text('delete-confirm', 'Delete duration');
  text(
    'delete-description',
    `Delete “${current.duration.metadata.title || 'Untitled duration'}”? Moments it follows are not affected. You can undo this deletion.`,
  );
  el<HTMLDialogElement>('delete-dialog').showModal();
  el('delete-cancel').focus();
}
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
    undefined,
    false,
    current.isNew ? undefined : relationshipContext({ duration: current.duration.id }),
  );
  // Bands carry bounded metadata only: a longer background address would show nothing.
  if (longBackgrounds(installedPlugins(), [current.duration]).length) {
    const note = document.createElement('p');
    note.className = 'form-error';
    note.textContent = `Background image addresses longer than ${BACKGROUND_URL_LIMIT.toLocaleString('en')} characters are not shown. Use a shorter address.`;
    el('plugin-duration-fields').append(note);
  }
}
/** Time an endpoint resolves to, from loaded moments or the saved band. */
function endpointTime(duration: Duration, which: 'start' | 'end'): Q | null {
  const endpoint = duration[which];
  if (typeof endpoint === 'string') return Q.parse(endpoint);
  if (isOngoing(endpoint)) return model?.now() ?? null;
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
  // An end may be ongoing (#537) where the timeline has a "now": the Gregorian display.
  const ongoing = which === 'end' && (isOngoing(endpoint) || !!model?.now());
  for (const [value, label] of [
    ['time', 'Fixed time'],
    ['moment', 'Follows a moment'],
    ...(ongoing ? [['ongoing', 'Ongoing (until now)']] : []),
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    mode.append(option);
  }
  mode.value = typeof endpoint === 'string' ? 'time' : isOngoing(endpoint) ? 'ongoing' : 'moment';
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
  } else if (isOngoing(endpoint)) {
    const now = model?.now();
    const summary = document.createElement('p');
    summary.className = 'duration-anchor';
    summary.textContent = now
      ? 'Ongoing · now ' + presented(now)
      : 'Ongoing · this timeline has no current time';
    box.append(summary);
  } else {
    const anchored = model?.byId.get(endpoint.moment);
    const time = endpointTime(current.duration, which);
    const summary = document.createElement('p');
    summary.className = 'duration-anchor';
    summary.textContent =
      (anchored?.metadata.title || (anchored ? 'Untitled moment' : 'Moment ' + endpoint.moment)) +
      (time ? ' · ' + presented(time) : '');
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Open moment';
    open.disabled = !time;
    open.onclick = () => {
      if (!time) return;
      durationDialog.close(true);
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
  const follow = (cancelled?: () => void) =>
    pickMoment((moment) => setEndpoint({ moment: moment.id }), cancelled);
  if (typeof endpoint === 'object' && 'moment' in endpoint && durationEditable()) {
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.textContent = 'Choose another moment…';
    choose.onclick = () => follow();
    box.append(choose);
  }
  mode.onchange = () => {
    if (mode.value === 'time') {
      const time = endpointTime(openDuration!.duration, which) ?? viewMiddle();
      setEndpoint(time.toString());
    } else if (mode.value === 'ongoing') setEndpoint({ ongoing: true });
    // Following needs a moment: choose one now, or keep the endpoint as it was.
    else follow(() => (mode.value = typeof endpoint === 'string' ? 'time' : 'ongoing'));
  };
  return box;
}
/**
 * The moment selector browses moments in time order, or searches their titles and notes, 25
 * at a time, so choosing one never loads a whole timeline of many thousands.
 */
type PickedMoment = { id: string; time: string; title: string };
let momentPicker: {
  choose: (moment: PointEvent) => void;
  cancelled?: () => void;
  chosen: boolean;
  request: number;
  page: number;
  /** Browsing pages start after these cursors; `cursors[0]` is the first page. */
  cursors: ({ time: string; id: string } | null)[];
} | null = null;
let momentPickerTimer: ReturnType<typeof setTimeout> | undefined;
function pickMoment(choose: (moment: PointEvent) => void, cancelled?: () => void) {
  momentPicker = { choose, cancelled, chosen: false, request: 0, page: 1, cursors: [null] };
  input('moment-picker-text').value = '';
  el('moment-picker-results').replaceChildren();
  text('moment-picker-status', 'Loading moments…');
  el<HTMLDialogElement>('moment-picker').showModal();
  input('moment-picker-text').focus();
  void loadMomentPicker(1);
}
async function loadMomentPicker(page: number) {
  const picker = momentPicker;
  if (!picker) return;
  const request = ++picker.request;
  const generation = documentRequest;
  const words = input('moment-picker-text').value;
  const previous = el<HTMLButtonElement>('moment-picker-previous'),
    next = el<HTMLButtonElement>('moment-picker-next');
  previous.disabled = next.disabled = true;
  try {
    let moments: PickedMoment[], status: string, more: boolean;
    if (searchTerms(words).length) {
      const result = await searchPage(words, page, 'moment');
      moments = result.results.map((r) => ({ id: r.id, time: r.first, title: r.title }));
      const total = BigInt(result.total);
      const pages = (total + BigInt(SEARCH_PAGE_SIZE) - 1n) / BigInt(SEARCH_PAGE_SIZE);
      more = BigInt(page) < pages;
      status =
        total === 0n && !moments.length
          ? 'No moments match.'
          : `${total} ${total === 1n ? 'moment matches' : 'moments match'}` +
            (pages > 1n ? ` · page ${page} of ${pages}` : '');
    } else {
      const result = await browseMoments(picker.cursors[page - 1] ?? null);
      moments = result.events.map((e) => ({
        id: e.id,
        time: e.time,
        title: e.metadata.title ?? '',
      }));
      picker.cursors[page] = result.next;
      more = !!result.next;
      const count = BigInt(momentCount());
      const pages = (count + BigInt(SEARCH_PAGE_SIZE) - 1n) / BigInt(SEARCH_PAGE_SIZE);
      status = !moments.length
        ? 'This timeline has no moments yet.'
        : `${count} ${count === 1n ? 'moment' : 'moments'} in time order` +
          (pages > 1n ? ` · page ${page} of ${pages}` : '');
    }
    if (picker !== momentPicker || request !== picker.request || generation !== documentRequest)
      return;
    picker.page = page;
    renderMomentPicker(moments);
    text('moment-picker-status', status);
    previous.disabled = page <= 1;
    next.disabled = !more;
    previous.parentElement!.hidden = page <= 1 && !more;
  } catch (error) {
    if (picker === momentPicker && request === picker.request)
      text('moment-picker-status', error instanceof Error ? error.message : String(error));
  }
}
/** One page of moments in time order, after a (time, ID) cursor. */
function browseMoments(cursor: { time: string; id: string } | null) {
  if (!sparseWorkspace() && model)
    return model.points.size
      ? groupPage(
          {
            first: model.points.minKey()!.toString(),
            last: model.points.maxKey()!.toString(),
            count: '0',
            distinct: 0,
          },
          cursor,
          SEARCH_PAGE_SIZE,
        )
      : Promise.resolve({ events: [] as PointEvent[], next: null });
  return timelineQuery<{ events: PointEvent[]; next: { time: string; id: string } | null }>({
    kind: 'events',
    lower: local?.first ?? null,
    upper: local?.last ?? null,
    limit: SEARCH_PAGE_SIZE,
    after: cursor,
    revision: (local ?? remote)!.revision,
  });
}
function renderMomentPicker(moments: PickedMoment[]) {
  const list = el('moment-picker-results');
  list.replaceChildren();
  for (const moment of moments) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-result';
    const title = document.createElement('strong');
    title.textContent = moment.title || 'Untitled moment';
    const meta = document.createElement('span');
    meta.className = 'search-meta';
    meta.textContent = presented(Q.parse(moment.time), 'event');
    button.append(title, meta);
    button.onclick = () => void chooseMoment(moment).catch(fail);
    item.append(button);
    list.append(item);
  }
}
async function chooseMoment(moment: PickedMoment) {
  const picker = momentPicker;
  if (!picker) return;
  // Search results carry only a title; load the moment so the duration can resolve it.
  const [point] = (
    await groupPage({
      id: moment.id,
      first: moment.time,
      last: moment.time,
      count: '1',
      distinct: 1,
    })
  ).events;
  if (picker !== momentPicker) return;
  if (!point) throw new Error('That moment no longer exists.');
  sparseWorkspace()?.load(point);
  picker.chosen = true;
  el<HTMLDialogElement>('moment-picker').close();
  picker.choose(point);
}
el<HTMLFormElement>('moment-picker-form').onsubmit = (event) => {
  event.preventDefault();
  clearTimeout(momentPickerTimer);
  if (momentPicker) momentPicker.cursors = [null];
  void loadMomentPicker(1);
};
input('moment-picker-text').oninput = () => {
  clearTimeout(momentPickerTimer);
  momentPickerTimer = setTimeout(
    () => el<HTMLFormElement>('moment-picker-form').requestSubmit(),
    250,
  );
};
el('moment-picker-previous').onclick = () =>
  void loadMomentPicker(Math.max(1, (momentPicker?.page ?? 1) - 1));
el('moment-picker-next').onclick = () => void loadMomentPicker((momentPicker?.page ?? 0) + 1);
el('moment-picker').addEventListener('close', () => {
  clearTimeout(momentPickerTimer);
  const picker = momentPicker;
  momentPicker = null;
  if (picker && !picker.chosen) picker.cancelled?.();
});
/**
 * Tag separation: a read-only, two-track comparison of one timeline with itself. Entities
 * carrying any selected tag move to the upper track; everything else stays below. Indexed
 * timelines query database-built views of the saved state.
 */
let separation: Separation | null = null;
async function loadTagCounts(): Promise<{ tag: string; count: number }[]> {
  if (!sparseWorkspace() && model) return tagCounts(model.byId.values(), model.durations.values());
  const result = await timelineQuery<{ tags: { tag: string; count: number }[] }>({
    kind: 'tags',
    revision: (local ?? remote)!.revision,
  });
  return result.tags;
}
/**
 * What is separated: groups of tags, each its own track above the rest (events with any of a
 * group's tags), or an entity and its related or connected set (#342).
 */
type Separation = {
  /** Its separations: by tags, or by an entity's relationships (#552). */
  tracks: SeparationTrack[];
  /** Each disjoin's and union's time, once read (for drawing and the label). */
  resolved?: ResolvedSeparation[];
  /** The titles of the entities separated by their relationships, by reference key. */
  titles?: Record<string, string>;
};
/**
 * A timeline's default view as a server or file sent it (#416), or nothing when it has none or
 * it isn't one this version reads: the timeline then opens whole.
 */
/** A file's saved views (#550), or none when they are missing or not ones this version reads. */
function readSavedViews(value: unknown): SavedViewEntry[] | undefined {
  try {
    return value == null ? undefined : validateSavedViews(value);
  } catch {
    return undefined;
  }
}
function readTimelineView(value: unknown): TimelineView | undefined {
  try {
    return value == null ? undefined : validateTimelineView(value);
  } catch {
    return undefined;
  }
}
/** The open timeline's default view (#416): as edited here, or as its server has it. */
function timelineView(): TimelineView | undefined {
  return model ? model.view : remote?.view;
}
/** The separation shown, as a default view keeps it (without the entity's title). */
function shownSeparation(): ViewSeparation | null {
  return separation ? tagSeparation(separation.tracks) : null;
}
/**
 * The titles of the entities `tracks` separate by relationships, by reference key; null for
 * one no longer on the timeline (or that cannot be read).
 */
async function relatedTitles(tracks: SeparationTrack[]): Promise<Record<string, string | null>> {
  const titles: Record<string, string | null> = {};
  for (const t of tracks)
    if ('related' in t && !(refKey(t.related) in titles)) {
      const title = await entityTitle(t.related).catch(() => null);
      titles[refKey(t.related)] =
        title === null ? null : title || ('moment' in t.related ? 'this moment' : 'this duration');
    }
  return titles;
}
/**
 * Shows separations, reading the titles of the entities any separate by relationships first:
 * those no longer on the timeline are left out (and with none left, the whole timeline is).
 */
async function separateWithTitles(tracks: SeparationTrack[]): Promise<boolean> {
  const request = documentRequest;
  const found = await relatedTitles(tracks);
  if (request !== documentRequest || comparison) return false;
  const kept = keptTracks(tracks, (t) => !('related' in t) || found[refKey(t.related)] != null);
  if (!kept.length) return false;
  const titles: Record<string, string> = {};
  for (const [key, title] of Object.entries(found)) if (title !== null) titles[key] = title;
  startSeparation({ tracks: kept, titles });
  return true;
}
/**
 * The separations `keep` keeps, their disjoins and unions following them: one naming a
 * separation left out names the main timeline instead.
 */
function keptTracks(
  tracks: SeparationTrack[],
  keep: (t: SeparationTrack) => boolean,
): SeparationTrack[] {
  const position = new Map<number, number>();
  tracks.forEach((t, i) => keep(t) && position.set(i, position.size));
  const moved = (track: number | null) => (track === null ? null : (position.get(track) ?? null));
  return tracks
    .filter(keep)
    .map((t) => ({
      ...t,
      ...(t.disjoins ? { disjoins: t.disjoins.map((d) => ({ ...d, from: moved(d.from) })) } : {}),
      ...(t.unions ? { unions: t.unions.map((u) => ({ ...u, into: moved(u.into) })) } : {}),
    }))
    .map((t) => {
      // A disjoin or union that now names itself, or names a track twice, goes.
      const index = tracks.filter(keep).indexOf(t);
      const once = <T extends { from?: number | null; into?: number | null }>(
        list: T[] | undefined,
        key: 'from' | 'into',
      ) => {
        const seen = new Set<number | null>();
        const kept = (list ?? []).filter((j) => {
          const track = j[key] ?? null;
          if (track === index || seen.has(track)) return false;
          seen.add(track);
          return true;
        });
        return kept.length ? kept : undefined;
      };
      const { disjoins, unions, ...rest } = t;
      const d = once(disjoins, 'from'),
        u = once(unions, 'into');
      return {
        ...rest,
        ...(d ? { disjoins: d } : {}),
        ...(u ? { unions: u } : {}),
      } as SeparationTrack;
    });
}
/**
 * An entity's title, or null when it is not on the timeline (as it was saved, for an indexed
 * one, which is what a separation shows). Reads one moment or duration, never the timeline.
 */
async function entityTitle(ref: EntityRef): Promise<string | null> {
  if (!sparseWorkspace() && model) {
    const found = 'moment' in ref ? model.byId.get(ref.moment) : model.durations.get(ref.duration);
    return found ? (found.metadata.title ?? '') : null;
  }
  const revision = (local ?? remote)?.revision;
  if ('moment' in ref) {
    const { event } = await timelineQuery<{ event: PointEvent | null }>({
      kind: 'moment',
      id: ref.moment,
      ...(revision ? { revision } : {}),
    });
    return event ? (event.metadata.title ?? '') : null;
  }
  const { duration } = await timelineQuery<{ duration: Duration | null }>({
    kind: 'duration',
    id: ref.duration,
    ...(revision ? { revision } : {}),
  });
  return duration ? (duration.metadata.title ?? '') : null;
}
/**
 * Shows a timeline that has just opened in its default view (#416), when it has one: separated
 * by its tags, or by an entity's relationships, named by the entity's title. An entity no longer
 * on the timeline, or one that can't be read, leaves the whole timeline, quietly.
 */
async function openDefaultView(view: TimelineView | undefined) {
  const chosen = view?.separation;
  if (!chosen || comparison) return;
  const tracks = viewSeparations(chosen);
  if (tracks.every((t) => 'tags' in t)) startSeparation(tracks);
  else if (!(await separateWithTitles(tracks))) return;
  nameDefaultView(view);
}
/**
 * A default view that is a saved view (#550) is shown as that view: by its title, from the
 * file's list, or read from the server.
 */
function nameDefaultView(view: TimelineView | undefined) {
  const id = view?.id;
  if (!id || !separation) return;
  const shown = separation;
  const name = (title: string, server: boolean) => {
    if (separation !== shown) return;
    shownView = { id, title, server };
    text('separation-heading', `View: ${title}`);
  };
  if (!serverViews()) {
    const saved = model?.views?.find((v) => v.id === id);
    if (saved) name(saved.title, false);
    return;
  }
  void api<{ title: string }>(`views/${encodeURIComponent(id)}`)
    .then((saved) => name(saved.title, true))
    .catch(() => {});
}
/** The title of an entity a separation follows the relationships of (#552). */
function relatedName(choice: Separation, track: { related: EntityRef }): string {
  return (
    choice.titles?.[refKey(track.related)] ??
    ('moment' in track.related ? 'this moment' : 'this duration')
  );
}
/** A separated track's title: its tags, or the entity whose relationships it follows. */
function trackTitle(choice: Separation, track: SeparationTrack): string {
  if ('tags' in track) return `Tagged ${track.tags.join(', ')}`;
  return `${track.depth === 'direct' ? 'Related to' : 'Connected to'} ${relatedName(choice, track)}`;
}
/**
 * Shows the timeline separated: by groups of tags (each a track of the events with any of its
 * tags, above a last track of everything else, which has none of them), or by an entity's
 * relationships (one track above the rest). Read-only; nothing is saved.
 */
function startSeparation(by: SeparationTrack[] | Separation) {
  const choice: Separation = Array.isArray(by) ? { tracks: by } : by;
  // A separation chosen anew is no saved view's (openView names its own after).
  shownView = null;
  flushEventEdit();
  flushDurationEdit();
  const presentation = model?.presentation ?? remote?.presentation ?? DEFAULT_PRESENTATION;
  const plugins = installedPlugins();
  type Track = { key: string; title: string; filter: ViewFilter; arcs: boolean };
  // Plain filters where they say it all: tags (each a track, the rest none of them), or one
  // entity's relationships. Where a separation disjoins or unites (#549), or separations by
  // tags and relationships mix (#552), each track is the whole plan's, as an event's track
  // depends on its time and on the other separations.
  const only = choice.tracks[0];
  const plain = !choice.tracks.some((t) => t.disjoins?.length || t.unions?.length);
  const tagged = plain && choice.tracks.every((t) => 'tags' in t);
  const related = plain && choice.tracks.length === 1 && 'related' in only ? only : null;
  const filter = (track: number | null): ViewFilter => {
    if (related)
      return {
        related: related.related,
        depth: related.depth,
        mode: track === null ? 'none' : 'any',
      };
    if (tagged)
      return track === null
        ? {
            tags: [...new Set(choice.tracks.flatMap((t) => ('tags' in t ? t.tags : [])))],
            mode: 'none',
          }
        : { tags: (choice.tracks[track] as { tags: string[] }).tags, mode: 'any' };
    return { separations: choice.tracks, track };
  };
  // Each separated track asks for the whole timeline's arcs, each end marked with whether it
  // is on that track (#415); arcAxes places every end on the first track that has it, and
  // ends no separated track has on the last. The last track asks for none.
  const tracks: Track[] = [
    ...choice.tracks.map((t, i) => ({
      key: choice.tracks.length === 1 ? 'tagged' : `tagged-${i + 1}`,
      title: trackTitle(choice, t),
      filter: filter(i),
      arcs: true,
    })),
    { key: 'rest', title: 'Everything else', filter: filter(null), arcs: false },
  ];
  let sources: ComparisonSource[];
  if (!sparseWorkspace() && model) {
    const document = model.document();
    sources = tracks.map(({ key, title, filter, arcs }) => {
      const index = new TimelineIndex(filterDocument(document, filter));
      return {
        key,
        title,
        presentation,
        plugins,
        index,
        arcs: arcs
          ? separationArcs(document, filter)
          : () => ({ edges: [], edgesTruncated: false }),
        first: index.points.minKey()?.toString(),
        last: index.points.maxKey()?.toString(),
      };
    });
  } else {
    const info = (local ?? remote)!;
    if (sparseWorkspace()?.dirtyCount)
      toast('Separation shows the saved version. Your unsaved edits are kept for when you rejoin.');
    sources = tracks.map(({ key, title, filter, arcs }) => ({
      key,
      title,
      presentation,
      plugins,
      revision: info.revision,
      first: info.first,
      last: info.last,
      query: (query, signal) =>
        timelineQuery<Frame | EventPage>(
          {
            ...query,
            filter,
            revision: (local ?? remote)!.revision,
            ...(query.kind === 'overview' && !arcs ? { arcs: false } : {}),
          },
          signal,
        ),
    }));
  }
  const before = viewport.clone();
  separation = choice;
  startComparison(sources, presentation);
  // Disjoins' times, from the moments they follow (#549): drawn once read.
  void resolveDisjoins(choice).catch((error) =>
    toast(
      `Could not read when a separation disjoins or unites: ${error instanceof Error ? error.message : String(error)}`,
    ),
  );
  // Separating keeps the current view rather than fitting the tracks.
  viewport = before;
  // The bar names what was separated: the tags, or the entities whose relationships were
  // followed (#342).
  const count = choice.tracks.length;
  const name = 'related' in only ? relatedName(choice, only) : '';
  text(
    'separation-heading',
    count > 1
      ? `${count} separations`
      : 'tags' in only
        ? 'Separated by tags'
        : only.depth === 'direct'
          ? 'Separated: related to'
          : 'Separated: connected to',
  );
  // With disjoins' times when already read (a timeline held here); else once they are.
  text('separation-tags', separationLabel(choice));
  text(
    'separation-note',
    count > 1
      ? 'Read-only. Each separation’s events (with any of its tags, or related to its event) are shown in its own track; everything else stays below.'
      : 'tags' in only
        ? 'Read-only. Events with any of these tags are shown above; everything else stays below.'
        : only.depth === 'direct'
          ? `Read-only. Shown above: ${name} and the events related to it; everything else stays below.`
          : `Read-only. Shown above: ${name} and everything connected to it through relationships; everything else stays below.`,
  );
  el('separation-map').hidden = !bulkEditable() || !separatedEvents(choice.tracks);
  heading();
  requestRender();
}
/**
 * The Separate dialog (#548): the separations shown, each a list of tags as chips, added from
 * a picker that searches the timeline's tags (or takes a new one); separations can be added,
 * removed, and applied together, or all rejoined. `separateDraft` is the dialog's state until
 * it is applied.
 */
/**
 * A disjoin or a union as the dialog edits it (#549): the track it leaves or joins (`track`
 * null: the main timeline), and its time: as typed in the timeline's display (`at`), a moment
 * it follows, or the separation's first (a disjoin) or last (a union) moment.
 */
type DraftJoin = {
  track: number | null;
  kind: 'at' | 'moment' | 'first' | 'last';
  time: string;
  moment: { id: string; title: string } | null;
};
/**
 * A separation as the dialog edits it: its tags, disjoins and unions; or, for one by an
 * entity's relationships (#552), that entity, which only its details change.
 */
type SeparateDraft = {
  tags: string[];
  related?: { ref: EntityRef; depth: 'direct' | 'all'; title: string };
  disjoins: DraftJoin[];
  unions: DraftJoin[];
};
let separateDraft: SeparateDraft[] = [];
let separateCounts: { tag: string; count: number }[] = [];
let closeTagPicker: (() => void) | null = null;
type Resolvable = { resolved?: ResolvedSeparation[] };
/** A disjoin or union as the dialog edits it, with its time when known. */
function draftJoin(
  track: number | null,
  when: DisjoinTime | UnionTime,
  known: Q | null | undefined,
): DraftJoin {
  return {
    track,
    kind: 'at' in when ? 'at' : 'moment' in when ? 'moment' : 'first' in when ? 'first' : 'last',
    time:
      'at' in when ? presented(Q.parse(when.at), 'input') : known ? presented(known, 'input') : '',
    moment: 'moment' in when ? { id: when.moment, title: `moment ${when.moment}` } : null,
  };
}
function openSeparateDialog() {
  if (comparison && !separation) return;
  closeTagPicker?.();
  text('separate-error', '');
  const shown = separation;
  separateDraft = shown
    ? shown.tracks.map((t, i) => ({
        tags: 'tags' in t ? [...t.tags] : [],
        ...('related' in t
          ? {
              related: {
                ref: t.related,
                depth: t.depth,
                title: relatedName(shown, t),
              },
            }
          : {}),
        disjoins: (t.disjoins ?? []).map((d, k) =>
          draftJoin(d.from, d, (separation as Resolvable).resolved?.[i]?.disjoins?.[k]?.at),
        ),
        unions: (t.unions ?? []).map((u, k) =>
          draftJoin(u.into, u, (separation as Resolvable).resolved?.[i]?.unions?.[k]?.at),
        ),
      }))
    : [{ tags: [], disjoins: [], unions: [] }];
  // A disjoin or union that follows a moment shows its title, once read.
  for (const draft of separateDraft)
    for (const disjoin of [...draft.disjoins, ...draft.unions])
      if (disjoin.moment) {
        const moment = disjoin.moment;
        void entityTitle({ moment: moment.id })
          .then((title) => {
            if (title === null) moment.title = `moment ${moment.id} (deleted)`;
            else moment.title = title || 'Untitled moment';
            if (el<HTMLDialogElement>('separate-dialog').open) renderSeparateDialog();
          })
          .catch(() => {});
      }
  separateCounts = [];
  renderSeparateDialog();
  el<HTMLDialogElement>('separate-dialog').showModal();
  text('separate-error', 'Loading tags…');
  void loadTagCounts()
    .then((counts) => {
      separateCounts = counts;
      text('separate-error', counts.length ? '' : 'No events have tags yet: type one to add it.');
    })
    .catch((error) =>
      text('separate-error', error instanceof Error ? error.message : String(error)),
    );
}
el('separate-button').onclick = openSeparateDialog;
function renderSeparateDialog() {
  el('separate-clear').hidden = !separation;
  el<HTMLButtonElement>('separate-add').disabled = separateDraft.length >= SEPARATION_LIMIT;
  el('separate-add').title =
    separateDraft.length >= SEPARATION_LIMIT
      ? `At most ${SEPARATION_LIMIT} separations are shown at once.`
      : '';
  const list = el('separate-list');
  list.replaceChildren(...separateDraft.map((_, i) => separationItem(i)));
}
/** One separation in the dialog: its heading and Remove, its tags as chips, and the picker. */
function separationItem(index: number): HTMLLIElement {
  const draft = separateDraft[index],
    group = draft.tags;
  const item = document.createElement('li');
  item.className = 'separation-item';
  const heading = document.createElement('div');
  heading.className = 'separation-item-heading';
  const name = document.createElement('span');
  name.id = `separation-name-${index}`;
  name.textContent = `Separation ${index + 1}`;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.setAttribute('aria-label', `Remove separation ${index + 1}`);
  remove.hidden = separateDraft.length === 1 && !group.length;
  remove.onclick = () => {
    separateDraft.splice(index, 1);
    // Disjoins from it and unions into it are dropped; references to later ones move up.
    const follow = (joins: DraftJoin[]) =>
      joins
        .filter((d) => d.track !== index)
        .map((d) => ({ ...d, track: d.track !== null && d.track > index ? d.track - 1 : d.track }));
    for (const other of separateDraft) {
      other.disjoins = follow(other.disjoins);
      other.unions = follow(other.unions);
    }
    if (!separateDraft.length) separateDraft.push({ tags: [], disjoins: [], unions: [] });
    renderSeparateDialog();
  };
  heading.append(name, remove);
  if (draft.related) {
    // By an entity's relationships (#552): named here, chosen in the entity's details.
    const about = document.createElement('p');
    about.className = 'separation-related';
    about.id = `separation-related-${index}`;
    about.textContent = `${draft.related.depth === 'direct' ? 'Related to' : 'Connected to'} “${draft.related.title}”`;
    const hint = document.createElement('p');
    hint.className = 'field-hint';
    hint.textContent =
      draft.related.depth === 'direct'
        ? 'The event and the events related to it. Change it from the event’s details.'
        : 'The event and everything connected to it through relationships. Change it from the event’s details.';
    item.append(heading, about, hint, joinsList(index));
    return item;
  }
  const chips = document.createElement('div');
  chips.className = 'tag-chips';
  chips.setAttribute('aria-labelledby', name.id);
  const renderChips = () =>
    chips.replaceChildren(
      ...group.map((tag) => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        const x = document.createElement('button');
        x.type = 'button';
        x.textContent = '×';
        x.setAttribute('aria-label', `Remove ${tag}`);
        x.onclick = () => {
          group.splice(group.indexOf(tag), 1);
          renderChips();
          remove.hidden = separateDraft.length === 1 && !group.length;
        };
        chip.append(tag, x);
        return chip;
      }),
    );
  renderChips();
  item.append(
    heading,
    chips,
    tagPicker(group, () => {
      renderChips();
      remove.hidden = separateDraft.length === 1 && !group.length;
    }),
    joinsList(index),
  );
  return item;
}
/**
 * A combobox for one separation's tags: a toggle opening a panel with a search box and a
 * list of the timeline's tags (with how many events carry each), several selectable; a tag
 * no event has yet can be added by typing it. Changes `group` in place, then `changed()`.
 */
function tagPicker(group: string[], changed: () => void): HTMLElement {
  const picker = document.createElement('div');
  picker.className = 'tag-picker';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'tag-picker-toggle';
  toggle.textContent = 'Add tags ▾';
  toggle.setAttribute('aria-haspopup', 'listbox');
  toggle.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('div');
  panel.className = 'tag-picker-panel';
  panel.hidden = true;
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'tag-picker-search';
  search.placeholder = 'Search or add a tag';
  search.spellcheck = false;
  search.setAttribute('aria-label', 'Search tags');
  search.setAttribute('autocomplete', 'off');
  const options = document.createElement('ul');
  options.className = 'tag-picker-options';
  options.setAttribute('role', 'listbox');
  options.setAttribute('aria-multiselectable', 'true');
  options.setAttribute('aria-label', 'Tags');
  panel.append(search, options);
  picker.append(toggle, panel);
  let active = 0;
  let shown: { tag: string; count: number | null }[] = [];
  const typed = () => {
    try {
      return validateEntityTags([search.value])[0] ?? null;
    } catch {
      return null;
    }
  };
  const render = () => {
    const query = search.value.trim().toLowerCase();
    // Matching tags, an exact match first, then by how many events carry them.
    shown = separateCounts
      .filter(({ tag }) => !query || tag.includes(query))
      .map(({ tag, count }) => ({ tag, count }))
      .sort((a, b) => Number(b.tag === query) - Number(a.tag === query));
    // A tag no event has yet, offered as typed: after the tags that match, so Enter picks a
    // match, and first only when none does.
    const fresh = typed();
    if (fresh && !separateCounts.some((c) => c.tag === fresh))
      shown.push({ tag: fresh, count: null });
    active = Math.min(active, Math.max(0, shown.length - 1));
    options.replaceChildren(
      ...shown.map(({ tag, count }, i) => {
        const option = document.createElement('li');
        option.setAttribute('role', 'option');
        option.id = `tag-option-${Math.random().toString(36).slice(2)}`;
        option.setAttribute('aria-selected', String(group.includes(tag)));
        option.classList.toggle('active', i === active);
        const name = document.createElement('span');
        name.textContent = count === null ? `Add “${tag}”` : tag;
        option.append(name);
        if (count !== null) {
          const n = document.createElement('span');
          n.className = 'tag-count';
          n.textContent = count.toLocaleString();
          option.append(n);
        }
        option.onmousedown = (event) => event.preventDefault();
        option.onclick = () => {
          active = i;
          choose(tag);
        };
        return option;
      }),
    );
    if (!shown.length) {
      const empty = document.createElement('li');
      empty.className = 'tag-picker-empty';
      empty.textContent = separateCounts.length ? 'No tag matches.' : 'Type a tag to add it.';
      options.append(empty);
    }
    const current = options.children[active] as HTMLElement | undefined;
    if (current?.id) search.setAttribute('aria-activedescendant', current.id);
    else search.removeAttribute('aria-activedescendant');
    current?.scrollIntoView?.({ block: 'nearest' });
  };
  const choose = (tag: string) => {
    if (group.includes(tag)) group.splice(group.indexOf(tag), 1);
    else group.push(tag);
    changed();
    render();
    search.focus();
  };
  const open = () => {
    closeTagPicker?.();
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    search.value = '';
    active = 0;
    render();
    search.focus();
    // A click outside its separation closes it; one on its chips (removing a tag) does not.
    const outside = (event: MouseEvent) => {
      if (!(picker.closest('.separation-item') ?? picker).contains(event.target as Node)) close();
    };
    // On click, not mousedown: closing moves what follows up, which must not move the
    // button being pressed.
    document.addEventListener('click', outside, true);
    closeTagPicker = () => {
      document.removeEventListener('click', outside, true);
      close();
    };
  };
  const close = () => {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (closeTagPicker) {
      const done = closeTagPicker;
      closeTagPicker = null;
      done();
    }
  };
  toggle.onclick = () => (panel.hidden ? open() : close());
  search.oninput = () => {
    active = 0;
    render();
  };
  search.onkeydown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!shown.length) return;
      active = (active + (event.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length;
      render();
    } else if (event.key === 'Enter') {
      // Enter chooses the highlighted tag (a typed new one comes first), not the form.
      event.preventDefault();
      const tag = shown[active]?.tag;
      if (tag) choose(tag);
    } else if (event.key === 'Escape') {
      // Closes the picker, not the dialog.
      event.preventDefault();
      event.stopPropagation();
      close();
      toggle.focus();
    }
  };
  return picker;
}
/**
 * A moment's own ID: while separated, the moment selector names moments as their track does,
 * `<track>:<id>`.
 */
function unqualifiedId(id: string): string {
  for (const track of comparison?.tracks ?? [])
    if (id.startsWith(track.source.key + ':')) return id.slice(track.source.key.length + 1);
  return id;
}
/** Whether separation `from` disjoins, directly or through others, from separation `to`. */
function disjoinsThrough(from: number, to: number, seen = new Set<number>()): boolean {
  if (from === to) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return (separateDraft[from]?.disjoins ?? []).some(
    (d) => d.track !== null && disjoinsThrough(d.track, to, seen),
  );
}
/** The tracks a disjoin or union of separation `index` may name: the main timeline or another
 * separation, not one that disjoins from this one (a circle), nor one another of its kind
 * already names (`except` excepted). */
function joinTracks(
  index: number,
  which: 'disjoins' | 'unions',
  except: DraftJoin | null,
): (number | null)[] {
  const joins = separateDraft[index][which];
  return [null, ...separateDraft.map((_, k) => k)].filter(
    (track) =>
      track !== index &&
      (which === 'unions' || track === null || !disjoinsThrough(track, index)) &&
      !joins.some((d) => d !== except && d.track === track),
  );
}
const trackName = (track: number | null) =>
  track === null ? 'the main timeline' : `Separation ${track + 1}`;
/** A disjoin's or union's card text: the track it leaves or joins, and when. */
function joinText(join: DraftJoin, which: 'disjoins' | 'unions'): string {
  const when =
    join.kind === 'at'
      ? `at ${join.time}`
      : join.kind === 'moment'
        ? `at ${join.moment?.title ?? 'a moment'}`
        : join.kind === 'first'
          ? 'at its earliest moment'
          : 'at its latest moment';
  return `${which === 'disjoins' ? 'From' : 'Into'} ${trackName(join.track)} · ${when}`;
}
/**
 * A separation's disjoins and unions (#549), as one scrolling list of cards, each labelled as
 * a disjoin or a union, with Edit and × to remove; **+ Add a disjoin or union** opens the
 * join dialog, which edits them too.
 */
function joinsList(index: number): HTMLElement {
  const draft = separateDraft[index];
  const section = document.createElement('div');
  section.className = 'separation-joins';
  const cards = (['disjoins', 'unions'] as const).flatMap((which) =>
    draft[which].map((join, k) => {
      const noun = which === 'disjoins' ? 'disjoin' : 'union';
      const card = document.createElement('li');
      card.className = `separation-join separation-join-${noun}`;
      const label = document.createElement('span');
      label.className = 'separation-join-label';
      label.textContent = which === 'disjoins' ? 'Disjoin' : 'Union';
      const body = document.createElement('span');
      body.className = 'separation-join-text';
      body.textContent = joinText(join, which);
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'separation-join-edit';
      edit.textContent = 'Edit';
      edit.setAttribute('aria-label', `Edit ${noun} ${k + 1} of separation ${index + 1}`);
      edit.onclick = () => openJoinDialog(index, { which, join });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'separation-join-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${noun} ${k + 1} of separation ${index + 1}`);
      remove.onclick = () => {
        draft[which].splice(draft[which].indexOf(join), 1);
        renderSeparateDialog();
      };
      card.append(label, body, edit, remove);
      return card;
    }),
  );
  if (cards.length) {
    const list = document.createElement('ul');
    list.className = 'separation-join-list';
    list.setAttribute('aria-label', `Separation ${index + 1}: disjoins and unions`);
    list.append(...cards);
    section.append(list);
  } else {
    const none = document.createElement('p');
    none.className = 'separation-join-none';
    none.textContent = 'Separate throughout: no disjoins or unions.';
    section.append(none);
  }
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'separation-join-add';
  add.textContent = '+ Add a disjoin or union';
  add.disabled =
    !joinTracks(index, 'disjoins', null).length && !joinTracks(index, 'unions', null).length;
  add.onclick = () => openJoinDialog(index, null);
  section.append(add);
  return section;
}
/**
 * The join dialog's state: the separation, the disjoin or union edited (null: a new one), and
 * the choices so far: its kind, and when (`bound`: the earliest moment for a disjoin, the
 * latest for a union), with the moment chosen.
 */
let joinEdit: {
  index: number;
  editing: { which: 'disjoins' | 'unions'; join: DraftJoin } | null;
  which: 'disjoins' | 'unions';
  when: 'at' | 'moment' | 'bound';
  moment: { id: string; title: string } | null;
} | null = null;
/** Opens the join dialog to add a disjoin or union to separation `index`, or edit one. */
function openJoinDialog(
  index: number,
  editing: { which: 'disjoins' | 'unions'; join: DraftJoin } | null,
) {
  const join = editing?.join;
  const which =
    editing?.which ?? (joinTracks(index, 'disjoins', null).length ? 'disjoins' : 'unions');
  joinEdit = {
    index,
    editing,
    which,
    when: !join || join.kind === 'at' ? 'at' : join.kind === 'moment' ? 'moment' : 'bound',
    moment: join?.moment ? { ...join.moment } : null,
  };
  text('join-heading', `${editing ? 'Edit' : 'Add'} a disjoin or union: Separation ${index + 1}`);
  text('join-submit', editing ? 'Save' : 'Add');
  input('join-time').value = join?.kind === 'at' ? join.time : presented(viewMiddle(), 'input');
  text('join-error', '');
  renderJoinDialog(join?.track);
  el<HTMLDialogElement>('join-dialog').showModal();
}
/** Shows the join dialog's choices; `track` is the one to select, when still offered. */
function renderJoinDialog(track?: number | null) {
  if (!joinEdit) return;
  const { index, editing, which, when } = joinEdit;
  const disjoin = which === 'disjoins';
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="join-kind"]')) {
    radio.checked = radio.value === which;
    // A kind with no track left to name cannot be chosen.
    radio.disabled =
      radio.value !== which &&
      !joinTracks(
        index,
        radio.value as 'disjoins' | 'unions',
        editing?.which === radio.value ? editing.join : null,
      ).length;
  }
  text('join-track-label', disjoin ? 'From' : 'Into');
  const select = el<HTMLSelectElement>('join-track');
  const previous = track !== undefined ? track : select.value ? readTrack(select.value) : null;
  const options = joinTracks(index, which, editing?.which === which ? editing.join : null);
  select.replaceChildren(
    ...options.map((option) => {
      const element = document.createElement('option');
      element.value = option === null ? 'main' : String(option);
      element.textContent = trackName(option);
      return element;
    }),
  );
  if (options.includes(previous)) select.value = previous === null ? 'main' : String(previous);
  text('join-bound-tab', disjoin ? 'Earliest moment' : 'Latest moment');
  text(
    'join-bound-text',
    disjoin
      ? 'At the earliest moment with this separation’s tags, followed as moments are added, moved or removed.'
      : 'At the latest moment with this separation’s tags, followed as moments are added, moved or removed.',
  );
  for (const tab of ['at', 'moment', 'bound'] as const) {
    el(`join-${tab}-tab`).setAttribute('aria-selected', String(tab === when));
    el(`join-${tab}`).hidden = tab !== when;
  }
  text('join-moment-choose', joinEdit.moment ? joinEdit.moment.title : 'Choose a moment…');
}
const readTrack = (value: string) => (value === 'main' ? null : Number(value));
for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="join-kind"]'))
  radio.onchange = () => {
    if (!joinEdit || !radio.checked) return;
    joinEdit.which = radio.value as 'disjoins' | 'unions';
    renderJoinDialog();
  };
for (const tab of ['at', 'moment', 'bound'] as const)
  el(`join-${tab}-tab`).onclick = () => {
    if (!joinEdit) return;
    joinEdit.when = tab;
    renderJoinDialog();
    if (tab === 'moment' && !joinEdit.moment) el('join-moment-choose').click();
  };
el('join-moment-choose').onclick = () =>
  pickMoment((moment) => {
    if (!joinEdit) return;
    joinEdit.moment = {
      id: unqualifiedId(moment.id),
      title: moment.metadata.title || 'Untitled moment',
    };
    text('join-error', '');
    renderJoinDialog();
  });
attachTimeDialog(input('join-time'), {
  heading: 'Disjoin or union at',
  editable: () => true,
  read: () => parseInputTime(input('join-time').value),
  fallback: () => viewMiddle(),
  apply: (at) => {
    input('join-time').value = presented(at, 'input');
  },
});
el<HTMLFormElement>('join-form').onsubmit = (event) => {
  event.preventDefault();
  if (!joinEdit) return;
  const { index, editing, which, when, moment } = joinEdit;
  const time = input('join-time').value;
  try {
    if (when === 'at') parseInputTime(time);
  } catch (error) {
    text(
      'join-error',
      `This timeline cannot read that time: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  if (when === 'moment' && !moment) return void text('join-error', 'Choose a moment.');
  const join: DraftJoin = {
    track: readTrack(el<HTMLSelectElement>('join-track').value),
    kind: when === 'bound' ? (which === 'disjoins' ? 'first' : 'last') : when,
    time: when === 'at' ? time : '',
    moment: when === 'moment' ? moment : null,
  };
  const draft = separateDraft[index];
  if (editing && editing.which === which)
    draft[which].splice(draft[which].indexOf(editing.join), 1, join);
  else {
    if (editing) draft[editing.which].splice(draft[editing.which].indexOf(editing.join), 1);
    draft[which].push(join);
  }
  joinEdit = null;
  el<HTMLDialogElement>('join-dialog').close();
  renderSeparateDialog();
};
el('join-dialog').addEventListener('close', () => (joinEdit = null));
el('separate-add').onclick = () => {
  if (separateDraft.length >= SEPARATION_LIMIT) return;
  separateDraft.push({ tags: [], disjoins: [], unions: [] });
  renderSeparateDialog();
  el('separate-list').querySelector<HTMLButtonElement>('li:last-child .tag-picker-toggle')?.click();
};
el('separate-clear').onclick = () => {
  closeTagPicker?.();
  el<HTMLDialogElement>('separate-dialog').close();
  stopComparison();
  heading();
  requestRender();
};
el('separate-dialog').addEventListener('close', () => closeTagPicker?.());
el<HTMLFormElement>('separate-form').onsubmit = (event) => {
  event.preventDefault();
  try {
    // Separations with no tags (and not by an entity's relationships) are dropped, with
    // disjoins from them and unions into them; the others' references follow the ones kept.
    const kept = separateDraft
      .map((draft, i) => ({ draft, i, tags: validateEntityTags(draft.tags) }))
      .filter(({ draft, tags }) => tags.length || draft.related);
    const position = new Map(kept.map(({ i }, k) => [i, k]));
    const when = (d: DraftJoin, k: number, verb: string) => {
      if (d.kind === 'first') return { first: true as const };
      if (d.kind === 'last') return { last: true as const };
      if (d.kind === 'moment') {
        if (!d.moment) throw new Error(`Choose the moment separation ${k + 1} ${verb} at.`);
        return { moment: d.moment.id };
      }
      try {
        return { at: parseInputTime(d.time).toString() };
      } catch (error) {
        throw new Error(
          `Separation ${k + 1} ${verb} at a time this timeline cannot read: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    };
    const tracks: SeparationTrack[] = kept.map(({ draft, tags }, k) => {
      const kept = (d: DraftJoin) => (d.track === null ? null : (position.get(d.track) ?? -1));
      const disjoins = draft.disjoins.flatMap((d): Disjoin[] => {
        const from = kept(d);
        return from === -1 ? [] : [{ from, ...when(d, k, 'disjoins') } as Disjoin];
      });
      const unions = draft.unions.flatMap((u): Union[] => {
        const into = kept(u);
        return into === -1 ? [] : [{ into, ...when(u, k, 'unites') } as Union];
      });
      return {
        ...(draft.related ? { related: draft.related.ref, depth: draft.related.depth } : { tags }),
        ...(disjoins.length ? { disjoins } : {}),
        ...(unions.length ? { unions } : {}),
      };
    });
    if (tracks.length) validateSeparations(tracks);
    else {
      // Nothing chosen: the timeline rejoins.
      if (!separation) throw new Error('Choose at least one tag.');
      el<HTMLDialogElement>('separate-dialog').close();
      stopComparison();
      heading();
      requestRender();
      return;
    }
    el<HTMLDialogElement>('separate-dialog').close();
    // The entities' titles, for those separated by relationships, as they were.
    startSeparation({ tracks, ...(separation?.titles ? { titles: separation.titles } : {}) });
  } catch (error) {
    text('separate-error', error instanceof Error ? error.message : String(error));
  }
};
/**
 * Saved views (#550): named separations of the timeline. A server's are its saved views, read
 * and changed through its API, shared, forked, duplicated and reassigned; a file's (a desktop
 * file, a browser draft) are a list it keeps, changed like its other settings.
 */
type ViewCard = {
  id: string;
  title: string;
  description: string;
  separation: ViewSeparation;
  /** A server's saved view, with what the reader may do; else one the file keeps. */
  server: boolean;
  visibility?: 'private' | 'public';
  owner?: string;
  role?: string;
  canEdit: boolean;
  canShare: boolean;
  canFork: boolean;
  canDuplicate: boolean;
  upstream?: { id: string; title: string } | null;
  timeline?: { id: string; title: string } | null;
};
/** A server's saved view as its API sends it. */
type ServerView = Omit<ViewCard, 'server'>;
/** The view shown, while the separation is the one it was opened with. */
let shownView: { id: string; title: string; server: boolean } | null = null;
let viewCards: ViewCard[] = [];
/** Whether views are a server's saved views (else a file's list). */
const serverViews = () => !!remote && !local && !offlineHtml;
/** Whether this file's views may be changed here (as its default view may). */
const fileViewsEditable = () => !viewMode && mayEditTimeline() && !!model;
const fromServer = (v: ServerView): ViewCard => ({ ...v, server: true });
const fromFile = (v: SavedViewEntry): ViewCard => {
  const editable = fileViewsEditable();
  return {
    id: v.id,
    title: v.title,
    description: v.description ?? '',
    separation: v.separation,
    server: false,
    canEdit: editable,
    canShare: editable,
    canFork: false,
    canDuplicate: editable,
  };
};
/** Shows a view: its separation, named by the view in the bar. */
async function openView(view: {
  id: string;
  title: string;
  separation: ViewSeparation;
  server: boolean;
}) {
  if (comparison && !separation) return void toast('Exit the comparison to open a view.');
  if (separation) stopComparison();
  await openDefaultView({ separation: view.separation });
  if (!separation) return void toast('This view separates by an event this timeline lacks.');
  shownView = { id: view.id, title: view.title, server: view.server };
  text('separation-heading', `View: ${view.title}`);
  heading();
  updateDefaultViewControls();
}
/** Opens the views dialog, listing the timeline's views. */
function openViewsDialog() {
  text('views-error', '');
  renderViewsDialog();
  el<HTMLDialogElement>('views-dialog').showModal();
  void loadViews();
}
el('views-button').onclick = openViewsDialog;
/** Reads the timeline's views: a server's, and the signed-in account's of other timelines. */
async function loadViews() {
  if (!serverViews()) {
    viewCards = (model?.views ?? []).map(fromFile);
    renderViewsDialog();
    return;
  }
  const id = remote!.id;
  text('views-status', 'Loading views…');
  try {
    const { views } = await api<{ views: ServerView[] }>(`timelines/${id}/views`);
    if (remote?.id !== id) return;
    viewCards = views.map(fromServer);
    text('views-status', '');
    renderViewsDialog();
    if (session.user) {
      const mine = await api<{ views: ServerView[] }>('views');
      if (remote?.id !== id) return;
      renderViewTemplates(mine.views.filter((v) => v.timeline?.id !== id).map(fromServer));
    }
  } catch (error) {
    text('views-status', '');
    text('views-error', error instanceof Error ? error.message : String(error));
  }
}
/** Whether views can be saved here, and why not. */
function viewSaving(): string | null {
  if (serverViews()) return session.user ? null : 'Sign in to save views.';
  if (!fileViewsEditable()) return 'This timeline’s views cannot be changed here.';
  if ((model?.views?.length ?? 0) >= SAVED_VIEW_LIMIT)
    return `A file keeps at most ${SAVED_VIEW_LIMIT} views.`;
  return null;
}
function renderViewsDialog() {
  const shown = shownSeparation();
  text(
    'views-showing',
    shownView
      ? `Showing the view “${shownView.title}”.`
      : shown
        ? 'Showing a separation that is not saved as a view.'
        : 'Showing the whole timeline. Separate it to save a view.',
  );
  const refusal = viewSaving();
  const save = el<HTMLButtonElement>('views-save');
  save.disabled = !shown || !!refusal;
  save.title = refusal ?? (shown ? '' : 'Separate the timeline first.');
  // The shown view, changed since it was opened: saved into it.
  const current = shownView && viewCards.find((v) => v.id === shownView!.id);
  const update = el<HTMLButtonElement>('views-update');
  update.hidden = !(current?.canEdit && shown && !sameSeparation(shown, current.separation));
  update.textContent = current ? `Update “${current.title}” with what is shown` : '';
  const list = el('views-list');
  list.replaceChildren(...viewCards.map((card) => viewCardElement(card, false)));
  if (!viewCards.length) {
    const none = document.createElement('li');
    none.className = 'views-none';
    none.textContent = serverViews()
      ? 'No views of this timeline yet.'
      : 'This file keeps no views yet.';
    list.append(none);
  }
  el('views-templates').hidden = !serverViews() || !session.user;
}
function renderViewTemplates(cards: ViewCard[]) {
  el('views-template-list').replaceChildren(
    ...(cards.length
      ? cards.map((card) => viewCardElement(card, true))
      : [
          Object.assign(document.createElement('li'), {
            className: 'views-none',
            textContent: 'You have no views of other timelines.',
          }),
        ]),
  );
}
/** A view's card: its title, badges, description and actions. */
function viewCardElement(card: ViewCard, template: boolean): HTMLElement {
  const item = document.createElement('li');
  item.className = 'view-card';
  item.dataset.view = card.id;
  const head = document.createElement('div');
  head.className = 'view-card-heading';
  const title = document.createElement('strong');
  title.textContent = card.title;
  head.append(title);
  const badge = (label: string, className = '') => {
    const span = document.createElement('span');
    span.className = 'view-badge ' + className;
    span.textContent = label;
    head.append(span);
  };
  const isDefault = !template && timelineView()?.id === card.id;
  if (isDefault) badge('Default', 'view-badge-default');
  if (shownView?.id === card.id) badge('Shown');
  if (card.server) badge(card.visibility === 'public' ? 'Public' : 'Private');
  item.append(head);
  const about: string[] = [];
  if (card.server && card.owner && card.role !== 'owner') about.push(`by ${card.owner}`);
  if (card.role === 'editor' || card.role === 'viewer')
    about.push(`shared with you as ${card.role}`);
  if (card.upstream) about.push(`forked from “${card.upstream.title}”`);
  if (template) about.push(card.timeline ? `of “${card.timeline.title}”` : 'of no timeline');
  if (about.length) {
    const line = document.createElement('p');
    line.className = 'view-card-about';
    line.textContent = about.join(' · ');
    item.append(line);
  }
  if (card.description) {
    const description = document.createElement('p');
    description.className = 'view-card-description';
    description.textContent = card.description;
    item.append(description);
  }
  const actions = document.createElement('div');
  actions.className = 'view-card-actions';
  const button = (label: string, action: () => void | Promise<void>, primary = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-label', `${label}: ${card.title}`);
    if (primary) b.className = 'button-primary';
    b.onclick = () =>
      void Promise.resolve(action()).catch((error) =>
        text('views-error', error instanceof Error ? error.message : String(error)),
      );
    actions.append(b);
  };
  if (template) {
    // A template: copied here, or moved here (reassigned) by those who may change it.
    button(
      'Copy here',
      () => copyView(card, card.canFork ? 'fork' : 'duplicate', remote!.id),
      true,
    );
    if (card.canEdit) button('Move here', () => reassignView(card, remote!.id));
  } else {
    button(
      'Open',
      async () => {
        el<HTMLDialogElement>('views-dialog').close();
        await openView(card);
      },
      true,
    );
    if (!isDefault && !viewMode && mayEditTimeline() && model)
      button('Make default', () => makeViewDefault(card));
    if (card.canEdit) button('Edit…', () => openViewEditor(card));
    if (card.server && card.canShare) button('Share…', () => openViewSharing(card));
    if (card.server && card.canFork) button('Fork', () => copyView(card, 'fork'));
    if (card.canDuplicate) button('Duplicate', () => copyView(card, 'duplicate'));
    if (card.canShare) button('Delete', () => deleteView(card));
  }
  item.append(actions);
  return item;
}
/** The timeline opens in a view (a setting, saved with the timeline). */
function makeViewDefault(card: ViewCard) {
  setTimelineView({ id: card.id, separation: card.separation });
  toast(
    remote || local
      ? `“${card.title}” is now the default view. Save the timeline to keep it.`
      : `“${card.title}” is now the timeline’s default view.`,
  );
  renderViewsDialog();
}
/** Changes a file's views: `change` edits a copy; the default view follows its view. */
function changeFileViews(change: (views: SavedViewEntry[]) => SavedViewEntry[]) {
  if (!model || !fileViewsEditable())
    throw new Error('This timeline’s views cannot be changed here.');
  const views = change([...(model.views ?? [])]);
  model.views = views.length ? validateSavedViews(views) : undefined;
  const named = model.view?.id;
  if (named) {
    const view = model.views?.find((v) => v.id === named);
    // The default follows its view; once the view is gone, it is its own copy.
    model.view = view
      ? { id: view.id, separation: view.separation }
      : { separation: model.view!.separation };
  }
  changed();
  updateDefaultViewControls();
  viewCards = (model.views ?? []).map(fromFile);
  renderViewsDialog();
}
const newViewId = () => 'view-' + crypto.randomUUID().slice(0, 8);
async function copyView(card: ViewCard, kind: 'fork' | 'duplicate', timeline?: string) {
  if (!card.server) {
    changeFileViews((views) => [
      ...views,
      {
        id: newViewId(),
        title: `${card.title} (copy)`.slice(0, 200),
        ...(card.description ? { description: card.description } : {}),
        separation: card.separation,
      },
    ]);
    return;
  }
  const copy = await api<ServerView>(`views/${card.id}/${kind}`, 'POST', {
    ...(timeline ? { timeline } : {}),
  });
  toast(kind === 'fork' ? `Forked as “${copy.title}”.` : `Duplicated as “${copy.title}”.`);
  await loadViews();
}
async function reassignView(card: ViewCard, timeline: string) {
  await api<ServerView>(`views/${card.id}`, 'PUT', { timeline });
  toast(`“${card.title}” is now a view of this timeline.`);
  await loadViews();
}
async function deleteView(card: ViewCard) {
  if (!confirm(`Delete the view “${card.title}”?`)) return;
  if (card.server) await api(`views/${card.id}`, 'DELETE');
  else changeFileViews((views) => views.filter((v) => v.id !== card.id));
  if (shownView?.id === card.id) shownView = null;
  toast(`Deleted “${card.title}”.`);
  if (card.server) await loadViews();
}
el('views-update').onclick = () => {
  const card = shownView && viewCards.find((v) => v.id === shownView!.id);
  const shown = shownSeparation();
  if (!card || !shown) return;
  void saveViewChanges(card, { separation: shown }).catch((error) =>
    text('views-error', error instanceof Error ? error.message : String(error)),
  );
};
/** Saves changes to a view: a server's through its API, a file's in its list. */
async function saveViewChanges(
  card: ViewCard,
  changes: Partial<{
    title: string;
    description: string;
    separation: ViewSeparation;
    visibility: 'private' | 'public';
    timeline: string | null;
  }>,
) {
  if (card.server) {
    await api<ServerView>(`views/${card.id}`, 'PUT', changes);
    await loadViews();
  } else
    changeFileViews((views) =>
      views.map((v) =>
        v.id !== card.id
          ? v
          : {
              id: v.id,
              title: changes.title ?? v.title,
              ...((changes.description ?? v.description)
                ? { description: changes.description ?? v.description }
                : {}),
              separation: changes.separation ?? v.separation,
            },
      ),
    );
  if (shownView?.id === card.id && changes.title) {
    shownView.title = changes.title;
    text('separation-heading', `View: ${changes.title}`);
  }
  toast(`Saved “${changes.title ?? card.title}”.`);
}
/** The view the edit dialog saves: null for a new one, from what is shown. */
let viewEditing: ViewCard | null = null;
el('views-save').onclick = () => openViewEditor(null);
async function openViewEditor(card: ViewCard | null) {
  viewEditing = card;
  text('view-edit-heading', card ? `Edit “${card.title}”` : 'Save a view');
  text('view-edit-submit', card ? 'Save' : 'Save view');
  input('view-title').value = card?.title ?? '';
  el<HTMLTextAreaElement>('view-description').value = card?.description ?? '';
  text('view-edit-error', '');
  const server = serverViews();
  // Visibility: when saving to a server, or by a view's owner.
  el('view-visibility').hidden = !server || (!!card && !card.canShare);
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="view-visibility"]'))
    radio.checked = radio.value === (card?.visibility ?? 'private');
  // Replacing an existing view's separations with the one shown.
  const shown = shownSeparation();
  el('view-replace-label').hidden = !card || !shown || sameSeparation(shown, card.separation);
  input('view-replace').checked = !!card && shownView?.id === card.id;
  // Reassigning a server's view: to a timeline the account can read.
  const select = el<HTMLSelectElement>('view-timeline');
  el('view-timeline-label').hidden = !server || !card;
  select.replaceChildren();
  el<HTMLDialogElement>('view-edit-dialog').showModal();
  input('view-title').focus();
  if (server && card) {
    const current = card.timeline ?? { id: remote!.id, title: remote!.title };
    const option = (id: string, title: string) =>
      Object.assign(document.createElement('option'), { value: id, textContent: title });
    select.append(option(current.id, current.title));
    select.value = current.id;
    try {
      const { timelines } = await api<{ timelines: { id: string; title: string }[] }>('timelines');
      for (const t of timelines) if (t.id !== current.id) select.append(option(t.id, t.title));
    } catch {
      // Signed out: only its own timeline is offered.
    }
  }
}
el<HTMLFormElement>('view-edit-form').onsubmit = (event) => {
  event.preventDefault();
  void (async () => {
    const { title, description } = validateViewText(
      input('view-title').value,
      el<HTMLTextAreaElement>('view-description').value,
    );
    const visibility = (document.querySelector<HTMLInputElement>(
      'input[name="view-visibility"]:checked',
    )?.value ?? 'private') as 'private' | 'public';
    const card = viewEditing;
    const shown = shownSeparation();
    if (card) {
      const timeline = el<HTMLSelectElement>('view-timeline').value;
      await saveViewChanges(card, {
        title,
        description,
        ...(input('view-replace').checked && shown ? { separation: shown } : {}),
        ...(card.server && card.canShare ? { visibility } : {}),
        ...(card.server && timeline && timeline !== (card.timeline?.id ?? remote?.id)
          ? { timeline }
          : {}),
      });
    } else {
      if (!shown) throw new Error('Separate the timeline first.');
      if (serverViews()) {
        const saved = await api<ServerView>('views', 'POST', {
          timeline: remote!.id,
          title,
          description,
          visibility,
          separation: shown,
        });
        shownView = { id: saved.id, title: saved.title, server: true };
        await loadViews();
      } else {
        const id = newViewId();
        changeFileViews((views) => [
          ...views,
          { id, title, ...(description ? { description } : {}), separation: shown },
        ]);
        shownView = { id, title, server: false };
      }
      text('separation-heading', `View: ${title}`);
      toast(`Saved the view “${title}”.`);
    }
    el<HTMLDialogElement>('view-edit-dialog').close();
    renderViewsDialog();
  })().catch((error) =>
    text('view-edit-error', error instanceof Error ? error.message : String(error)),
  );
};
/** The view the share dialog shares. */
let viewSharing: ViewCard | null = null;
async function openViewSharing(card: ViewCard) {
  viewSharing = card;
  text('view-share-heading', `Share “${card.title}”`);
  text('view-share-error', '');
  for (const radio of document.querySelectorAll<HTMLInputElement>(
    'input[name="view-share-visibility"]',
  ))
    radio.checked = radio.value === card.visibility;
  const link = new URL(sharePath(remote!, null), location.origin);
  link.searchParams.set('view', card.id);
  input('view-link').value = link.href;
  input('view-member-name').value = '';
  el('view-members').replaceChildren();
  el<HTMLDialogElement>('view-share-dialog').showModal();
  await loadViewMembers();
}
async function loadViewMembers(members?: { username: string; role: string }[]) {
  const card = viewSharing;
  if (!card) return;
  const list =
    members ??
    (await api<{ members: { username: string; role: string }[] }>(`views/${card.id}/members`))
      .members;
  el('view-members').replaceChildren(
    ...(list.length
      ? list.map((member) => {
          const item = document.createElement('li');
          const name = document.createElement('span');
          name.textContent = member.username;
          const role = document.createElement('select');
          role.setAttribute('aria-label', `${member.username}’s role`);
          for (const value of ['viewer', 'editor'])
            role.append(
              Object.assign(document.createElement('option'), {
                value,
                textContent: value === 'viewer' ? 'Viewer' : 'Editor',
              }),
            );
          role.value = member.role;
          role.onchange = () => void shareView(member.username, role.value);
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.textContent = 'Remove';
          remove.setAttribute('aria-label', `Stop sharing with ${member.username}`);
          remove.onclick = () => void shareView(member.username, null);
          item.append(name, role, remove);
          return item;
        })
      : [
          Object.assign(document.createElement('li'), {
            className: 'views-none',
            textContent: 'No one yet.',
          }),
        ]),
  );
}
/** Shares the view with `username` as `role`, or stops (null). */
async function shareView(username: string, role: string | null) {
  const card = viewSharing;
  if (!card) return;
  try {
    const { members } = await api<{ members: { username: string; role: string }[] }>(
      `views/${card.id}/members`,
      role ? 'POST' : 'DELETE',
      role ? { username, role } : { username },
    );
    text('view-share-error', '');
    await loadViewMembers(members);
  } catch (error) {
    text('view-share-error', error instanceof Error ? error.message : String(error));
  }
}
el<HTMLFormElement>('view-share-form').onsubmit = (event) => {
  event.preventDefault();
  const username = input('view-member-name').value.trim();
  if (!username) return void text('view-share-error', 'Type the username to share it with.');
  void shareView(username, el<HTMLSelectElement>('view-member-role').value).then(() => {
    input('view-member-name').value = '';
  });
};
for (const radio of document.querySelectorAll<HTMLInputElement>(
  'input[name="view-share-visibility"]',
))
  radio.onchange = () => {
    const card = viewSharing;
    if (!card || !radio.checked) return;
    const visibility = radio.value as 'private' | 'public';
    void api<ServerView>(`views/${card.id}`, 'PUT', { visibility })
      .then(() => {
        card.visibility = visibility;
        text('view-share-error', '');
        return loadViews();
      })
      .catch((error) =>
        text('view-share-error', error instanceof Error ? error.message : String(error)),
      );
  };
el('view-link-copy').onclick = () =>
  void navigator.clipboard
    ?.writeText(input('view-link').value)
    .then(() => toast('Link copied.'))
    .catch(() => input('view-link').select());
/** A link's view (`?view=<id>`), for a server timeline. */
const linkedViewId = () => {
  const own = new URLSearchParams(location.search).get('view');
  if (own) return own;
  // The site's timeline page carries the editor in a frame of the same origin: the link is
  // the page's.
  try {
    return window.parent !== window
      ? new URLSearchParams(window.parent.location.search).get('view')
      : null;
  } catch {
    return null;
  }
};
/** Opens the view a link names; false when it cannot be read. */
async function openLinkedView(id: string): Promise<boolean> {
  try {
    const view = await api<ServerView>(`views/${encodeURIComponent(id)}`);
    if (view.timeline && view.timeline.id !== remote?.id) return false;
    await openView({ ...view, server: true });
    return true;
  } catch {
    toast('That view is unavailable. Sign in if it is private.');
    return false;
  }
}
/**
 * The default view's controls (#416): in the separation bar, whether what is shown is the
 * timeline's default view, and for those who can edit it, making it so or clearing it; in the
 * Separate dialog, what the timeline opens separated by, and clearing it.
 */
function updateDefaultViewControls() {
  const saved = timelineView()?.separation ?? null,
    shown = shownSeparation(),
    isDefault = !!shown && sameSeparation(shown, saved),
    settable = !viewMode && mayEditTimeline();
  el('separation-default').hidden = !shown || isDefault || !settable;
  el('separation-default-clear').hidden = !isDefault || !settable;
  el('separation-default-note').hidden = !isDefault;
  text(
    'separation-default-note',
    isDefault
      ? settable && dirty && (remote || local)
        ? 'This is the timeline’s default view once saved: it opens this way for everyone.'
        : 'This is the timeline’s default view: it opens this way for everyone.'
      : '',
  );
  el('separate-default').hidden = !saved;
  el('separate-default-clear').hidden = !saved || !settable;
  text(
    'separate-default-text',
    !saved
      ? ''
      : !('related' in saved)
        ? separationGroups(saved).length > 1
          ? `This timeline opens with ${separationGroups(saved).length} separations: ${separationGroups(
              saved,
            )
              .map((g) => g.join(', '))
              .join(' · ')}.`
          : `This timeline opens separated by tags: ${separationGroups(saved)[0].join(', ')}.`
        : saved.depth === 'direct'
          ? 'This timeline opens with an event and the events related to it separated above.'
          : 'This timeline opens with an event and everything connected to it separated above.',
  );
}
/** Sets or clears the timeline's default view (#416): a setting, saved with the timeline. */
function setTimelineView(view: TimelineView | undefined) {
  if (viewMode || !mayEditTimeline() || !model) return;
  model.view = view;
  changed();
  updateDefaultViewControls();
}
el('separation-default').onclick = () => {
  const shown = shownSeparation();
  if (!shown) return;
  setTimelineView({ separation: shown });
  toast(
    remote || local
      ? 'This is now the default view. Rejoin and save the timeline to keep it.'
      : 'This is now the timeline’s default view.',
  );
};
el('separation-default-clear').onclick = () => {
  setTimelineView(undefined);
  toast(
    remote || local
      ? 'The timeline will open whole once you rejoin and save it.'
      : 'The timeline opens whole again.',
  );
};
el('separate-default-clear').onclick = () => {
  setTimelineView(undefined);
  toast(
    remote || local
      ? 'The timeline will open whole once you save it.'
      : 'The timeline opens whole again.',
  );
};
el('separation-rejoin').onclick = () => {
  stopComparison();
  heading();
  requestRender();
};
/** Text search shows results in a dialog; choosing one moves the view, nothing else. */
let searchHit: { kind: SearchResult['kind']; id: string; time: Q } | null = null;
let searchHitTimer: ReturnType<typeof setTimeout> | undefined;
let searchState = { text: '', page: 1, total: 0n, request: 0 };
function searchHighlights(group: FrameGroup) {
  if (searchHit?.kind !== 'moment' || comparison) return false;
  if (group.id) return group.id === searchHit.id;
  return (
    Q.parse(group.first).compare(searchHit.time) <= 0 &&
    Q.parse(group.last).compare(searchHit.time) >= 0
  );
}
/** Indexed timelines search the saved head; unsaved edits replace their saved matches. */
function unsavedMatches(text: string) {
  const sparse = sparseWorkspace();
  const changed = new Set<string>(),
    hits: SearchResult[] = [];
  if (!sparse) return { changed, hits };
  const terms = searchTerms(text);
  const consider = (
    kind: SearchResult['kind'],
    id: string,
    first: string,
    last: string,
    metadata: Duration['metadata'],
  ) => {
    const { title, body } = searchText(metadata);
    const haystack = (title + ' ' + body).toLowerCase();
    if (terms.length && terms.every((term) => haystack.includes(term)))
      hits.push({ kind, id, first, last, title, snippet: snippet(body) });
  };
  for (const [id, change] of sparse.changes) {
    changed.add('moment:' + id);
    if (change.after)
      consider('moment', id, change.after.time, change.after.time, change.after.metadata);
  }
  const bands = new Map(sparse.overlayDurations(frame.durations ?? []).map((b) => [b.id, b]));
  for (const [id, change] of sparse.durationChanges) {
    changed.add('duration:' + id);
    const band =
      bands.get(id) ??
      (change.after ? resolveDuration(change.after, (m) => sparse.momentTime(m)) : null);
    if (change.after && band)
      consider('duration', id, band.first, band.last, change.after.metadata);
  }
  return { changed, hits };
}
/** One page of matches, with unsaved edits on indexed timelines overlaid on the saved ones. */
async function searchPage(words: string, page: number, only?: 'moment'): Promise<SearchPage> {
  if (!sparseWorkspace() && model) return searchIndex(model, words, page, SEARCH_PAGE_SIZE, only);
  const result = await timelineQuery<SearchPage>({
    kind: 'search',
    text: words,
    page,
    ...(only ? { only } : {}),
    revision: (local ?? remote)!.revision,
  });
  const { changed, hits } = unsavedMatches(words);
  const saved = result.results.filter((r) => !changed.has(r.kind + ':' + r.id));
  const added = page === 1 ? hits.filter((hit) => !only || hit.kind === only) : [];
  // Saved matches hidden by unsaved edits are only known for this page; the total adjusts for them.
  return {
    ...result,
    results: [...added, ...saved],
    total: String(
      BigInt(result.total) - BigInt(result.results.length - saved.length) + BigInt(added.length),
    ),
  };
}
async function runSearch(page: number) {
  const words = input('search-text').value;
  // The bar keeps the words last searched, refined in the dialog or not.
  input('search-bar-text').value = words;
  const request = ++searchState.request;
  searchState = { ...searchState, text: words, page };
  el<HTMLButtonElement>('search-previous').disabled = true;
  el<HTMLButtonElement>('search-next').disabled = true;
  if (!searchTerms(words).length) {
    el('search-results').replaceChildren();
    el('search-previous').parentElement!.hidden = true;
    text('search-status', 'Type a word from a title or notes.');
    return;
  }
  text('search-status', 'Searching…');
  try {
    const result = await searchPage(words, page);
    if (request !== searchState.request) return;
    searchState.total = BigInt(result.total);
    renderSearchResults(result.results);
    el('search-share').hidden = !shareable();
    reportLink({ kind: 'search', text: words });
    const pages = (searchState.total + BigInt(SEARCH_PAGE_SIZE) - 1n) / BigInt(SEARCH_PAGE_SIZE);
    text(
      'search-status',
      searchState.total === 0n && !result.results.length
        ? 'No events match.'
        : `${searchState.total} ${searchState.total === 1n ? 'match' : 'matches'}` +
            (pages > 1n ? ` · page ${page} of ${pages}` : '') +
            (sparseWorkspace()?.dirtyCount ? ' · includes unsaved edits' : ''),
    );
    el<HTMLButtonElement>('search-previous').disabled = page <= 1;
    el<HTMLButtonElement>('search-next').disabled = BigInt(page) >= pages;
    el('search-previous').parentElement!.hidden = pages <= 1n;
  } catch (error) {
    if (request === searchState.request)
      text('search-status', error instanceof Error ? error.message : String(error));
  }
}
function renderSearchResults(results: SearchResult[]) {
  const list = el('search-results');
  list.replaceChildren();
  for (const result of results) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-result';
    const title = document.createElement('strong');
    title.textContent =
      result.title || (result.kind === 'moment' ? 'Untitled moment' : 'Untitled duration');
    const meta = document.createElement('span');
    meta.className = 'search-meta';
    meta.textContent =
      (result.kind === 'moment' ? 'Moment · ' : 'Duration · ') +
      (result.first === result.last
        ? presented(Q.parse(result.first))
        : `${presented(Q.parse(result.first))} → ${presented(Q.parse(result.last))}`);
    button.append(title, meta);
    if (result.snippet) {
      const notes = document.createElement('span');
      notes.className = 'search-snippet';
      notes.textContent = result.snippet;
      button.append(notes);
    }
    button.onclick = () => goToSearchResult(result);
    item.append(button);
    list.append(item);
  }
}
function goToSearchResult(result: SearchResult) {
  el<HTMLDialogElement>('search-dialog').close();
  const first = Q.parse(result.first),
    last = Q.parse(result.last),
    extent = last.sub(first);
  // Moments keep the current zoom; durations fit with a margin on both sides.
  const span = extent.compare(Q.zero) > 0 ? extent.mul(Q.from(7n, 5n)) : viewport.span;
  const middle = first.add(extent.div(Q.from(2n)));
  navigate(new Viewport(middle.sub(span.div(Q.from(2n))), span));
  searchHit = { kind: result.kind, id: result.id, time: first };
  clearTimeout(searchHitTimer);
  searchHitTimer = setTimeout(() => {
    searchHit = null;
    requestRender(false);
  }, 2600);
}
/** Whether links into this timeline can be shared: a server timeline in the platform's page. */
function shareable(): boolean {
  return platformEditor && window.parent !== window && !!remote && !local && !comparison;
}
/** The platform page's link fragment (`/timelines/<id>#moment/…`), if any. */
function parentLink(): TimelineLink | null {
  if (!platformEditor || window.parent === window) return null;
  try {
    return parseLink(window.parent.location.hash);
  } catch {
    return null;
  }
}
let reportedLink: TimelineLink | null = null;
/** Zooms into the moment a link opened (see `revealing`) while it is counted in a group. */
function revealStep() {
  const target = revealing;
  if (!target || comparison) return;
  const group = frame.groups.find(
    (g) => Q.parse(g.first).compare(target.time) <= 0 && Q.parse(g.last).compare(target.time) >= 0,
  );
  const spread = group ? Q.parse(group.last).sub(Q.parse(group.first)) : Q.zero;
  if (
    !group ||
    group.id === target.id ||
    --target.steps < 0 ||
    (spread.compare(Q.zero) <= 0 && !BigInt(group.durationCount ?? '0'))
  ) {
    revealing = null;
    return;
  }
  // At most half the span, or enough that the group's moments are twice the grouping
  // distance apart.
  const half = Q.from(1n, 2n),
    threshold = viewport.threshold(width(), pixels()),
    enough = spread.compare(Q.zero) > 0 ? spread.div(threshold.mul(Q.from(2n))) : half,
    span = viewport.span.mul(enough.compare(half) < 0 ? enough : half);
  navigate(new Viewport(target.time.sub(span.div(Q.from(2n))), span), false);
}
/** Brings the timeline into view on the page, as a link into it was followed. */
function scrollToStage() {
  el('timeline-stage').scrollIntoView({ block: 'center' });
}
/** Tells the page what is open, so its address links to it (see links.ts). */
function reportLink(link: TimelineLink | null) {
  if (!remote || local || comparison) return;
  reportedLink = link;
  const fragment = link ? linkFragment(link) : null;
  if (platformEditor && window.parent !== window)
    window.parent.postMessage(
      { type: 'openchronology:link', timeline: remote.id, fragment },
      location.origin,
    );
  else if (embedded) {
    window.history.replaceState(null, '', fragment ? '#' + fragment : location.pathname);
    el<HTMLAnchorElement>('embed-open').href = sharePath(remote, link);
  }
}
/** Closing what a link names leaves the page's address at the timeline. */
function forgetLink(kind: TimelineLink['kind']) {
  if (reportedLink?.kind === kind) reportLink(null);
}
/** Asks the platform page to offer a link to share (its share dialog). */
function requestShare(link: TimelineLink | null, title: string) {
  if (!shareable()) return;
  window.parent.postMessage(
    {
      type: 'openchronology:share',
      timeline: remote!.id,
      fragment: link ? linkFragment(link) : null,
      title,
    },
    location.origin,
  );
}
/** Opens what a link names, in the open server timeline. */
async function followLink(link: TimelineLink | null) {
  if (!link || !remote || local) return;
  const request = documentRequest,
    revision = remote.revision;
  if (link.kind === 'view') {
    navigate(new Viewport(link.left, link.right.sub(link.left)));
    return;
  }
  if (comparison) return;
  if (link.kind === 'search') {
    input('search-text').value = link.text;
    const dialog = el<HTMLDialogElement>('search-dialog');
    if (!dialog.open) dialog.showModal();
    await runSearch(1);
    return;
  }
  if (link.kind === 'moment') {
    const event =
      model?.byId.get(link.id) ??
      (await timelineQuery<{ event: PointEvent | null }>({ kind: 'moment', id: link.id, revision }))
        .event;
    if (request !== documentRequest) return;
    if (!event) {
      toast('This moment is no longer on the timeline.');
      return;
    }
    goToSearchResult({
      kind: 'moment',
      id: event.id,
      first: event.time,
      last: event.time,
      title: '',
      snippet: '',
    });
    revealing = { id: event.id, time: Q.parse(event.time), steps: 24 };
    scrollToStage();
    selectedGroup = null;
    eventForm(event);
    return;
  }
  const known = model && !sparseWorkspace() ? model.durations.get(link.id) : undefined;
  const band = known
    ? resolveDuration(known, (id) => model!.momentTime(id))
    : (
        await timelineQuery<{ band: DurationBand | null }>({
          kind: 'duration',
          id: link.id,
          revision,
        })
      ).band;
  if (request !== documentRequest) return;
  if (!band) {
    toast('This duration is no longer on the timeline.');
    return;
  }
  goToSearchResult({
    kind: 'duration',
    id: link.id,
    first: band.first,
    last: band.last,
    title: '',
    snippet: '',
  });
  scrollToStage();
  await openDurationById(link.id);
}
if (platformEditor && window.parent !== window)
  try {
    // Following an address with another fragment on the platform page.
    window.parent.addEventListener('hashchange', () => void followLink(parentLink()).catch(fail));
  } catch {
    /* A page of another origin is not the platform. */
  }
el('moment-share').onclick = () => {
  if (selected)
    requestShare({ kind: 'moment', id: selected.id }, selected.metadata.title || 'Moment');
};
el('duration-fit').onclick = () => {
  if (openDuration) fitDuration(openDuration.duration.id);
};
el('duration-share').onclick = () => {
  if (openDuration)
    requestShare(
      { kind: 'duration', id: openDuration.duration.id },
      openDuration.duration.metadata.title || 'Duration',
    );
};
/** Asks the platform page to report a moment or duration of this timeline (#115). */
function requestReport(kind: 'moment' | 'duration', id: string, title: string) {
  if (!shareable()) return;
  window.parent.postMessage(
    { type: 'openchronology:report', timeline: remote!.id, kind, id, title },
    location.origin,
  );
}
el('moment-report').onclick = () => {
  if (selected) requestReport('moment', selected.id, selected.metadata.title || 'Moment');
};
el('duration-report').onclick = () => {
  if (openDuration)
    requestReport(
      'duration',
      openDuration.duration.id,
      openDuration.duration.metadata.title || 'Duration',
    );
};
el('search-share').onclick = () =>
  requestShare(
    { kind: 'search', text: searchState.text },
    `“${searchState.text}” in ${remote?.title ?? 'a timeline'}`,
  );
el('search-dialog').addEventListener('close', () => forgetLink('search'));
// The bar's words, searched with Search or Enter, open their results in the search dialog,
// where they can be refined.
el<HTMLFormElement>('search-bar').onsubmit = (event) => {
  event.preventDefault();
  const words = input('search-bar-text').value;
  if (comparison || !searchTerms(words).length) {
    input('search-bar-text').focus();
    return;
  }
  input('search-text').value = words;
  el<HTMLDialogElement>('search-dialog').showModal();
  void runSearch(1);
};
el<HTMLFormElement>('search-form').onsubmit = (event) => {
  event.preventDefault();
  void runSearch(1);
};
el('search-previous').onclick = () => void runSearch(Math.max(1, searchState.page - 1));
el('search-next').onclick = () => void runSearch(searchState.page + 1);
document.addEventListener('keydown', (event) => {
  // "/" goes to the search bar, as in many web apps; typing in fields is unaffected.
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target as HTMLElement;
  if (target.closest('input, textarea, select, [contenteditable]')) return;
  if (document.querySelector('dialog[open]') || el('search-bar').hidden) return;
  event.preventDefault();
  input('search-bar-text').focus();
  input('search-bar-text').select();
});
// Escape in an empty search field closes its dialog. WebKit (the desktop app) keeps Escape
// in search fields, even empty ones, so search and the moment picker never closed with it.
// With text in the field, Escape still clears the text first.
document.addEventListener(
  'keydown',
  (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || field.type !== 'search' || field.value) return;
    const dialog = field.closest('dialog');
    if (!dialog?.open) return;
    event.preventDefault();
    dialog.close();
  },
  true,
);
/**
 * "Related to" lists an entity's direct relationships (25 at a time) and how many more are
 * connected through other links. Links are undirected; unsaved edits on indexed timelines
 * are overlaid on the saved list.
 */
const linkDisplay = new Map<string, SearchResult>();
type RelatedEntry = {
  kind: 'moment' | 'duration';
  id: string;
  first: string;
  last: string;
  title: string;
};
function describe(key: string): RelatedEntry | null {
  const ref = refFromKey(key);
  if ('moment' in ref) {
    const moment = model?.byId.get(ref.moment);
    if (moment)
      return {
        kind: 'moment',
        id: ref.moment,
        first: moment.time,
        last: moment.time,
        title: moment.metadata.title ?? '',
      };
  } else {
    const duration = model?.durations.get(ref.duration);
    const band =
      duration && model ? resolveDuration(duration, (id) => model!.momentTime(id)) : null;
    if (duration && band)
      return {
        kind: 'duration',
        id: ref.duration,
        first: band.first,
        last: band.last,
        title: duration.metadata.title ?? '',
      };
  }
  const shown = linkDisplay.get(key);
  return shown ? { ...shown } : null;
}
async function relatedPage(ref: EntityRef, after: { kind: string; id: string } | null) {
  const sparse = sparseWorkspace();
  if (!sparse && model) {
    const direct = [...model.relatedTo(ref)].sort();
    const all = model.relatedTo(ref, Infinity).size;
    const start = after
      ? direct.findIndex((k) => k > (after.kind === 'moment' ? 'm:' : 'd:') + after.id)
      : 0;
    const keys = start < 0 ? [] : direct.slice(start, start + 25);
    return {
      related: keys.map(describe).filter((e): e is RelatedEntry => !!e),
      next: start >= 0 && start + 25 < direct.length ? refEntry(direct[start + 24]) : null,
      reachable: after ? undefined : all,
      direct: direct.length,
    };
  }
  const page = await timelineQuery<{
    related: RelatedEntry[];
    next: { kind: string; id: string } | null;
    reachable?: number;
    direct?: number;
  }>({ kind: 'related', entity: ref, after, limit: 25, revision: (local ?? remote)!.revision });
  // Unsaved links: hide removed ones, add new ones on the first page.
  const own = refKey(ref);
  const changes = [...(sparse?.relationshipChanges.values() ?? [])].filter(
    ({ relationship }) => refKey(relationship.a) === own || refKey(relationship.b) === own,
  );
  const other = (r: Relationship) => (refKey(r.a) === own ? refKey(r.b) : refKey(r.a));
  const removed = new Set(changes.filter((c) => !c.related).map((c) => other(c.relationship)));
  const added = after
    ? []
    : changes
        .filter((c) => c.related)
        .map((c) => describe(other(c.relationship)))
        .filter((e): e is RelatedEntry => !!e);
  const saved = page.related.filter((e) => !removed.has(entryKey(e)));
  return {
    related: [...added.filter((a) => !saved.some((e) => entryKey(e) === entryKey(a))), ...saved],
    next: page.next,
    reachable: page.reachable,
    direct: page.direct ?? page.related.length,
  };
}
/**
 * What a relationship-arrows field (#326) knows of an entity's links: its direct relations,
 * read page by page as the Related to section reads them (up to 1,000), names, and what the
 * other end's own arrows say when its metadata is in memory.
 */
function relationshipContext(ref: EntityRef): RelationshipContext {
  const own = refKey(ref);
  return {
    async related() {
      const entities = new Map<string, string>();
      let after: { kind: string; id: string } | null = null;
      for (let page = 0; page < 40; page++) {
        const found = await relatedPage(ref, after);
        for (const e of found.related)
          entities.set(
            entryKey(e),
            e.title || (e.kind === 'moment' ? 'Untitled moment' : 'Untitled duration'),
          );
        if (!found.next) return { entities, complete: true };
        after = found.next;
      }
      return { entities, complete: false };
    },
    name: (key) => describe(key)?.title || null,
    theirs(key) {
      const other = refFromKey(key);
      const metadata =
        'moment' in other
          ? model?.byId.get(other.moment)?.metadata
          : model?.durations.get(other.duration)?.metadata;
      if (!metadata) return null;
      const plugins = 'moment' in other ? activePlugins() : durationPlugins(installedPlugins());
      return arrowsToward(plugins, metadata, own);
    },
  };
}
function entryKey(e: { kind: string; id: string }) {
  return (e.kind === 'moment' ? 'm:' : 'd:') + e.id;
}
function refEntry(key: string) {
  const ref = refFromKey(key);
  return 'moment' in ref
    ? { kind: 'moment', id: ref.moment }
    : { kind: 'duration', id: ref.duration };
}
function openEntry(entry: RelatedEntry) {
  if (entry.kind === 'duration') {
    void openDurationById(entry.id).catch(fail);
    return;
  }
  durationDialog.close(true);
  void selectGroup({
    id: entry.id,
    first: entry.first,
    last: entry.first,
    count: '1',
    distinct: 1,
  }).catch(fail);
}
function setLink(a: EntityRef, b: EntityRef, related: boolean, display?: SearchResult) {
  if (!model || !editable()) return;
  const link = canonicalRelationship(a, b);
  if (display) linkDisplay.set(entryKey(display), display);
  record({ link, related });
  if (related) model.relate(link.a, link.b);
  else model.unrelate(link.a, link.b);
  changed();
}
/** An entity as a separation names it: by its own ID, not its track's (`<track>:<id>`). */
function separatedRef(ref: EntityRef): EntityRef {
  return 'moment' in ref
    ? { moment: unqualifiedId(ref.moment) }
    : { duration: unqualifiedId(ref.duration) };
}
/**
 * Separates an entity's related (`direct`) or connected (`all`) set (#552): beside the
 * separations shown, or changing the depth of the one already following it.
 */
function separateRelated(ref: EntityRef, depth: 'direct' | 'all', title: string) {
  const key = refKey(ref);
  const current = separation?.tracks ?? [];
  const at = current.findIndex((t) => 'related' in t && refKey(t.related) === key);
  if (at < 0 && current.length >= SEPARATION_LIMIT)
    return void toast(`At most ${SEPARATION_LIMIT} separations are shown at once.`);
  const tracks: SeparationTrack[] =
    at < 0
      ? [...current, { related: ref, depth }]
      : current.map((t, i) => (i === at && 'related' in t ? { ...t, depth } : t));
  startSeparation({ tracks, titles: { ...separation?.titles, [key]: title } });
}
/** Stops separating an entity's relationships; with no separation left, rejoins. */
function stopSeparatingRelated(ref: EntityRef) {
  if (!separation) return;
  const key = refKey(ref);
  const tracks = keptTracks(
    separation.tracks,
    (t) => !('related' in t) || refKey(t.related) !== key,
  );
  if (tracks.length) startSeparation({ tracks, titles: separation.titles });
  else {
    stopComparison();
    heading();
    requestRender();
  }
}
function renderRelated(host: HTMLElement, ref: EntityRef | null, readOnly = false) {
  // While separated, an entity's ID is its track's (`<track>:<id>`): its own is what links name.
  if (ref && separation) ref = separatedRef(ref);
  host.replaceChildren();
  host.hidden = !ref;
  if (!ref) return;
  const generation = ++relatedGeneration;
  const heading = document.createElement('h3');
  heading.textContent = 'Related to';
  const list = document.createElement('div');
  list.className = 'related-list';
  const status = document.createElement('p');
  status.className = 'field-hint';
  const actions = document.createElement('div');
  actions.className = 'related-actions';
  host.append(heading, list, status, actions);
  const canEdit = editable() && !readOnly;
  let cursor: { kind: string; id: string } | null = null;
  const more = document.createElement('button');
  more.type = 'button';
  more.textContent = 'Next 25 related';
  const load = async (after: typeof cursor) => {
    const page = await relatedPage(ref, after);
    if (generation !== relatedGeneration) return;
    list.replaceChildren();
    for (const entry of page.related) {
      const row = document.createElement('div');
      row.className = 'related-row';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'related-entity';
      open.textContent =
        (entry.title || (entry.kind === 'moment' ? 'Untitled moment' : 'Untitled duration')) +
        ' · ' +
        (entry.kind === 'moment'
          ? presentedAlone(Q.parse(entry.first))
          : `${presentedAlone(Q.parse(entry.first))} → ${presentedAlone(Q.parse(entry.last))}`);
      open.onclick = () => openEntry(entry);
      row.append(open);
      if (canEdit) {
        const unlink = document.createElement('button');
        unlink.type = 'button';
        unlink.className = 'related-unlink';
        unlink.textContent = '×';
        unlink.setAttribute('aria-label', 'Remove relationship with ' + (entry.title || entry.id));
        unlink.onclick = () => {
          setLink(ref, refFromKey(entryKey(entry)), false);
          renderRelated(host, ref, readOnly);
        };
        row.append(unlink);
      }
      list.append(row);
    }
    cursor = page.next;
    if (cursor) list.append(more);
    if (page.reachable !== undefined) {
      const beyond = page.reachable - page.direct;
      status.textContent = !page.related.length
        ? 'No relationships yet.'
        : beyond > 0
          ? `${beyond.toLocaleString()} more through other relationships.`
          : '';
      actions.replaceChildren();
      if (page.related.length && (!comparison || separation)) {
        // Separations by its relationships (#552), beside any others shown: added, changed
        // from related to connected (or back), or stopped, here only.
        const own = ref;
        const key = refKey(own);
        const shown = separation?.tracks.find(
          (t): t is Extract<SeparationTrack, { related: EntityRef }> =>
            'related' in t && refKey(t.related) === key,
        );
        const label = describeLabel(own);
        const close = () => {
          durationDialog.close();
          el<HTMLDialogElement>('inspector').close();
        };
        for (const [depth, text] of [
          ['direct', shown ? 'Separate only related' : 'Separate related'],
          ['all', shown ? 'Separate all connected instead' : 'Separate all connected'],
        ] as const) {
          if (depth === 'all' && beyond <= 0 && shown?.depth !== 'all') continue;
          if (shown?.depth === depth) continue;
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = text;
          button.onclick = () => {
            close();
            separateRelated(own, depth, label);
          };
          actions.append(button);
        }
        if (shown) {
          const stop = document.createElement('button');
          stop.type = 'button';
          stop.textContent = 'Stop separating';
          stop.onclick = () => {
            close();
            stopSeparatingRelated(own);
          };
          actions.append(stop);
        }
      }
    }
  };
  more.onclick = () => void load(cursor).catch(fail);
  void load(null).catch(fail);
  // Links to other timelines (#422) come last, after adding a relationship here.
  const elsewhere = document.createElement('div');
  renderTimelineLinks(elsewhere, host, ref, readOnly);
  if (!canEdit) {
    host.append(elsewhere);
    return;
  }
  // New relationships are found in the picker: by searching this timeline's events, or by
  // the address of one of them.
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'related-add';
  add.textContent = 'Add a relationship…';
  add.onclick = () =>
    openLinkPicker(ref, 'here', () => {
      if (generation === relatedGeneration) renderRelated(host, ref, readOnly);
    });
  host.append(add, elsewhere);
}
let relatedGeneration = 0;
/**
 * A link from an entity to one on another timeline, or to another timeline as a whole (kind
 * `timeline`, no times) (#422), as the server lists it.
 */
interface TimelineLinkEntry {
  id: string;
  timeline: { id: string; title: string; owner: string; slug: string | null };
  kind: 'moment' | 'duration' | 'timeline';
  entity: string;
  title: string;
  first: string;
  last: string;
}
/**
 * The section of Related to (`host`), in `container`, listing an entity's links to entities on other timelines (#422;
 * docs/relationships.md#links-to-other-timelines), 25 at a time, each opening the other
 * timeline at that entity. Only for a saved server timeline: links join saved entities and
 * are kept by the server, apart from the timeline. Those who may save it can link to an
 * entity on another timeline they may save, found by searching their timelines, then that
 * timeline's events; and remove links (the server checks the other timeline too).
 */
function renderTimelineLinks(
  container: HTMLElement,
  host: HTMLElement,
  ref: EntityRef,
  readOnly: boolean,
) {
  const timeline = remote;
  if (!timeline || local || comparison || offlineHtml) return;
  const generation = relatedGeneration;
  const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
  const section = document.createElement('div');
  section.className = 'timeline-links';
  const heading = document.createElement('h4');
  heading.textContent = 'On other timelines';
  const list = document.createElement('div');
  list.className = 'related-list';
  const status = document.createElement('p');
  status.className = 'field-hint';
  status.setAttribute('role', 'status');
  section.append(heading, list, status);
  container.append(section);
  const entity: Record<string, string> =
    'moment' in ref ? { moment: ref.moment } : { duration: ref.duration };
  const canLink = !readOnly && !!timeline.canWrite && !!session.user;
  let cursor: string | null = null;
  const more = document.createElement('button');
  more.type = 'button';
  more.textContent = 'Next 25 links';
  const rerender = () => {
    if (generation === relatedGeneration) renderRelated(host, ref, readOnly);
  };
  const load = async (after: string | null) => {
    const page = await api<{ links: TimelineLinkEntry[]; next: string | null }>(
      `timelines/${timeline.id}/links?` +
        new URLSearchParams({ ...entity, ...(after ? { after } : {}) }),
    );
    if (generation !== relatedGeneration) return;
    list.replaceChildren();
    for (const link of page.links)
      list.append(
        timelineLinkRow(link, timeline.id, canLink, rerender, (error) => {
          status.textContent = errorText(error);
        }),
      );
    cursor = page.next;
    if (cursor) list.append(more);
    status.textContent = page.links.length || after ? '' : 'No links to other timelines.';
  };
  more.onclick = () => void load(cursor).catch((error) => (status.textContent = errorText(error)));
  void load(null).catch((error) => (status.textContent = errorText(error)));
  if (!canLink) return;
  // What to link to is found in the picker: searching the timelines the account may save, and
  // their events, or by a pasted address.
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'related-add';
  add.textContent = 'Link to another timeline…';
  add.onclick = () => openLinkPicker(ref, 'elsewhere', rerender);
  section.append(add);
}
/**
 * One link to another timeline (#422) in a list: opening the other entity's page (its timeline
 * open at it), or the other timeline's, at the addresses its pages and search engines use
 * (#335). With `canLink`, × removes it from `timelineId`'s end; the server also checks the other.
 */
function timelineLinkRow(
  link: TimelineLinkEntry,
  timelineId: string,
  canLink: boolean,
  removed: () => void,
  failed: (error: unknown) => void,
) {
  const row = document.createElement('div');
  row.className = 'related-row';
  const open = document.createElement('a');
  open.className = 'related-entity';
  const titled = link.timeline.title || 'Untitled timeline';
  open.target = '_top';
  const other = timelinePath(link.timeline);
  if (link.kind === 'timeline') {
    open.href = other;
    open.textContent = `${titled} · the whole timeline`;
  } else {
    open.href = `${other}/${link.kind === 'moment' ? 'moments' : 'durations'}/${encodeURIComponent(link.entity)}`;
    open.textContent =
      (link.title || (link.kind === 'moment' ? 'Untitled moment' : 'Untitled duration')) +
      ' · on ' +
      titled;
  }
  open.title = `${link.timeline.title} by ${link.timeline.owner}`;
  row.append(open);
  if (canLink) {
    const unlink = document.createElement('button');
    unlink.type = 'button';
    unlink.className = 'related-unlink';
    unlink.textContent = '×';
    unlink.setAttribute(
      'aria-label',
      `Remove the link with ${link.kind === 'timeline' ? link.timeline.title : link.title || link.entity}`,
    );
    unlink.onclick = () =>
      void api(`timelines/${timelineId}/links`, 'DELETE', { link: link.id })
        .then(removed)
        .catch(failed);
    row.append(unlink);
  }
  return row;
}
/** Which timeline's Linked from list is shown, and whether it offers ×, so it loads once each. */
let linkedFromKey: string | null = null;
let linkedFromRequest = 0;
/**
 * The timeline's Linked from list (#458): the moments, durations and timelines elsewhere that
 * link to the open server timeline as a whole, 25 at a time, as its page on the website lists
 * them. Only those on timelines the viewer may read are served. Hidden when nothing links here,
 * and folded until opened. Those who may edit it can remove a link with ×; the server checks
 * the other timeline too. `force` reads it again, as when live updates say its links changed.
 */
function updateLinkedFrom(force = false) {
  const timeline = remote;
  const shown = !!timeline && !local && !comparison && !offlineHtml && !!session.server;
  const canLink = shown && editable() && !!timeline.canWrite && !!session.user;
  const key = shown ? `${timeline.id}:${canLink}` : null;
  if (!force && key === linkedFromKey) return;
  linkedFromKey = key;
  const request = ++linkedFromRequest;
  const details = el<HTMLDetailsElement>('linked-from');
  const list = el('linked-from-list');
  const status = el('linked-from-status');
  if (!force || !key) {
    details.hidden = true;
    list.replaceChildren();
    status.textContent = '';
  }
  if (!key || !timeline) return;
  let cursor: string | null = null;
  const more = document.createElement('button');
  more.type = 'button';
  more.textContent = 'Next 25 links';
  const failed = (error: unknown) => {
    if (request === linkedFromRequest)
      status.textContent = error instanceof Error ? error.message : String(error);
  };
  const load = async (after: string | null) => {
    const page = await api<{ links: TimelineLinkEntry[]; next: string | null }>(
      `timelines/${timeline.id}/links?` + new URLSearchParams(after ? { after } : {}),
    );
    if (request !== linkedFromRequest) return;
    list.replaceChildren(
      ...page.links.map((link) =>
        timelineLinkRow(link, timeline.id, canLink, () => updateLinkedFrom(true), failed),
      ),
    );
    cursor = page.next;
    if (cursor) list.append(more);
    status.textContent = '';
    // Hidden only when nothing links here at all, so removing the last of a later page
    // leaves the list to page back from.
    details.hidden = !page.links.length && !after;
  };
  more.onclick = () => void load(cursor).catch(failed);
  void load(null).catch(failed);
}
/**
 * What the link picker (#422) offers: an event of this timeline (`timeline` null, with its
 * search `result` for the relationship's display), or a timeline or one of its events on
 * another timeline the account may save.
 */
interface PickerChoice {
  kind: 'moment' | 'duration' | 'timeline';
  id: string;
  title: string;
  when: string;
  snippet: string;
  timeline: { id: string; title: string; owner: string; slug: string | null } | null;
  result?: SearchResult;
}
/** What the server makes of a pasted address (POST /api/timelines/{id}/links/resolve). */
interface ResolvedAddress {
  timeline: { id: string; title: string; owner: string; slug: string | null };
  entity: {
    kind: 'moment' | 'duration';
    id: string;
    title: string;
    first: string;
    last: string;
    when: string;
  } | null;
  same: boolean;
  canWrite: boolean;
  full: boolean;
}
/** The picker as it is open: the event linking, where to look, and what to do after. */
let picker: { ref: EntityRef; where: 'here' | 'elsewhere'; done: () => void; page: number } | null =
  null;
let pickerTimer: ReturnType<typeof setTimeout> | undefined;
/** Text with the words a search matched marked (#459), as Explore marks them. */
function markedText(text: string, terms: string[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  let at = 0;
  for (const [start, end] of matchRanges(text, terms)) {
    if (start > at) fragment.append(text.slice(at, start));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(start, end);
    fragment.append(mark);
    at = end;
  }
  if (at < text.length) fragment.append(text.slice(at));
  return fragment;
}
/** Where the picker says what it is doing: the open tab's status line. */
function pickerStatus(text: string) {
  const address = el('link-picker-address-tab').getAttribute('aria-selected') === 'true';
  el(address ? 'link-picker-address-status' : 'link-picker-status').textContent = text;
}
/**
 * Opens the picker for entity `ref` (#422): `here`, to relate it to another event of this
 * timeline; `elsewhere`, to link it to another timeline or an event on one. It searches as
 * Explore does (#459), titles and notes with the words marked, its filters folded away:
 * here, this timeline's events (in the browser, or through the server's search of it);
 * elsewhere, the timelines and events the account may save that are below the link limit,
 * never on this timeline. Or it reads a pasted address. Choosing relates or links them, then
 * `done`.
 */
function openLinkPicker(ref: EntityRef, where: 'here' | 'elsewhere', done: () => void) {
  const elsewhere = where === 'elsewhere';
  picker = { ref, where, done, page: 1 };
  el('link-picker-heading').textContent = elsewhere
    ? 'Link to another timeline'
    : 'Add a relationship';
  el('link-picker-show-timelines').hidden = !elsewhere;
  el('link-picker-tag-label').hidden = !elsewhere;
  el('link-picker-within').hidden = !elsewhere;
  el('link-picker-address-hint').textContent = elsewhere
    ? 'Paste the address of a timeline you can edit, or of an event on it.'
    : 'Paste the address of an event on this timeline, or a link to one.';
  for (const id of ['link-picker-text', 'link-picker-url', 'link-picker-tag'])
    el<HTMLInputElement>(id).value = '';
  for (const box of el('link-picker-show').querySelectorAll('input')) box.checked = true;
  el<HTMLInputElement>('link-picker-within').querySelector('input')!.checked = true;
  el<HTMLDetailsElement>('link-picker-filters').open = false;
  for (const id of ['link-picker-results', 'link-picker-found']) el(id).replaceChildren();
  el('link-picker-status').textContent = '';
  el('link-picker-address-status').textContent = '';
  el('link-picker-pages').hidden = true;
  pickerTab('search');
  el<HTMLDialogElement>('link-picker').showModal();
  el('link-picker-text').focus();
  void pickerSearch();
}
/** Shows the picker's Search or Address tab. */
function pickerTab(tab: 'search' | 'address') {
  for (const name of ['search', 'address'] as const) {
    el(`link-picker-${name}-tab`).setAttribute('aria-selected', String(name === tab));
    el(`link-picker-${name}`).hidden = name !== tab;
  }
}
/** The kinds the picker's boxes show, of those it offers. */
function pickerShown(): string[] {
  return [...el('link-picker-show').querySelectorAll<HTMLInputElement>('input')]
    .filter((box) => box.checked && !box.closest('label')!.hidden)
    .map((box) => box.value);
}
/** Searches as the picker's fields say, and lists what it may choose. */
async function pickerSearch() {
  const current = picker;
  if (!current) return;
  const words = el<HTMLInputElement>('link-picker-text').value,
    terms = searchTerms(words),
    shown = pickerShown(),
    kinds = shown.filter((k) => k !== 'timelines').map((k) => k.slice(0, -1));
  const choices: PickerChoice[] = [];
  let pages = 0;
  if (current.where === 'here') {
    if (!terms.length) {
      el('link-picker-results').replaceChildren();
      el('link-picker-pages').hidden = true;
      pickerStatus('Type words from the title or notes of an event on this timeline.');
      return;
    }
    const page: SearchPage =
      !sparseWorkspace() && model
        ? searchIndex(model, words, current.page)
        : await timelineQuery<SearchPage>({
            kind: 'search',
            text: words,
            page: current.page,
            revision: (local ?? remote)!.revision,
          });
    pages = Math.ceil(Number(page.total) / SEARCH_PAGE_SIZE);
    for (const result of page.results) {
      const other: EntityRef =
        result.kind === 'moment' ? { moment: result.id } : { duration: result.id };
      if (!kinds.includes(result.kind) || refKey(other) === refKey(current.ref)) continue;
      choices.push({
        kind: result.kind,
        id: result.id,
        title: result.title,
        when:
          result.kind === 'moment'
            ? presentedAlone(Q.parse(result.first))
            : `${presentedAlone(Q.parse(result.first))} → ${presentedAlone(Q.parse(result.last))}`,
        snippet: result.snippet,
        timeline: null,
        result,
      });
    }
  } else {
    const timeline = remote!,
      within = el('link-picker-within').querySelector<HTMLInputElement>('input:checked')!.value,
      tag = el<HTMLInputElement>('link-picker-tag').value.trim();
    const filters = {
      scope: within === 'mine' ? 'mine' : 'writable',
      tag,
      linkable: true,
      exclude: timeline.id,
    };
    const [timelines, entities] = await Promise.all([
      shown.includes('timelines')
        ? api<{
            timelines: {
              id: string;
              title: string;
              owner: string;
              slug: string | null;
              description?: string;
              time_span?: string | null;
            }[];
            pages: number;
          }>('timelines/search', 'POST', {
            ...filters,
            search: words,
            page: current.page,
            limit: 5,
            sort: terms.length ? 'relevance' : 'updated',
          })
        : null,
      terms.length && kinds.length
        ? api<{
            entities: {
              kind: 'moment' | 'duration';
              id: string;
              title: string;
              when: string;
              snippet: string;
              timeline: { id: string; title: string; owner: string; slug: string | null };
            }[];
            pages: number;
          }>('timelines/entities/search', 'POST', {
            ...filters,
            search: words,
            kinds,
            page: current.page,
          })
        : null,
    ]);
    for (const t of timelines?.timelines ?? [])
      choices.push({
        kind: 'timeline',
        id: '',
        title: t.title,
        when: t.time_span ?? '',
        snippet: snippet(t.description ?? ''),
        timeline: { id: t.id, title: t.title, owner: t.owner, slug: t.slug ?? null },
      });
    for (const e of entities?.entities ?? []) choices.push({ ...e });
    // Both lists page together, five timelines and twenty events at a time, until both end.
    pages = Math.max(timelines?.pages ?? 0, entities?.pages ?? 0);
  }
  if (picker !== current || el<HTMLInputElement>('link-picker-text').value !== words) return;
  el('link-picker-results').replaceChildren(...choices.map((choice) => pickerItem(choice, terms)));
  el('link-picker-pages').hidden = pages <= 1;
  el<HTMLButtonElement>('link-picker-previous').disabled = current.page <= 1;
  el<HTMLButtonElement>('link-picker-next').disabled = current.page >= pages;
  pickerStatus(
    choices.length
      ? ''
      : current.where === 'here'
        ? 'No events match.'
        : terms.length || shown.includes('timelines')
          ? 'Nothing you can link to matches.'
          : 'Type words to find events.',
  );
}
/** One choice in the picker's lists, as a button choosing it. */
function pickerItem(choice: PickerChoice, terms: string[]): HTMLLIElement {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'search-result';
  const heading = document.createElement('span');
  heading.className = 'picker-heading';
  const kind = document.createElement('span');
  kind.className = 'picker-kind';
  kind.textContent = { moment: 'Moment', duration: 'Duration', timeline: 'Timeline' }[choice.kind];
  const title = document.createElement('strong');
  title.append(
    markedText(
      choice.title ||
        (choice.kind === 'timeline' ? 'Untitled timeline' : `Untitled ${choice.kind}`),
      terms,
    ),
  );
  heading.append(kind, title);
  const meta = document.createElement('span');
  meta.className = 'search-meta';
  meta.textContent = [
    choice.when,
    choice.timeline &&
      (choice.kind === 'timeline'
        ? `by ${choice.timeline.owner}`
        : `on ${choice.timeline.title || 'Untitled timeline'} by ${choice.timeline.owner}`),
  ]
    .filter(Boolean)
    .join(' · ');
  button.append(heading, meta);
  if (choice.snippet) {
    const notes = document.createElement('span');
    notes.className = 'search-snippet';
    notes.append(markedText(choice.snippet, terms));
    button.append(notes);
  }
  button.onclick = () => void pickerChoose(choice);
  item.append(button);
  return item;
}
/** Relates or links the picker's entity to `choice`, then closes it. */
async function pickerChoose(choice: PickerChoice) {
  const current = picker;
  if (!current) return;
  try {
    if (current.where === 'here') {
      setLink(
        current.ref,
        choice.kind === 'moment' ? { moment: choice.id } : { duration: choice.id },
        true,
        choice.result,
      );
    } else {
      const from =
        'moment' in current.ref
          ? { moment: current.ref.moment }
          : { duration: current.ref.duration };
      await api(`timelines/${remote!.id}/links`, 'POST', {
        from,
        to: {
          timeline: choice.timeline!.id,
          ...(choice.kind === 'timeline' ? {} : { [choice.kind]: choice.id }),
        },
      });
    }
  } catch (error) {
    pickerStatus(error instanceof Error ? error.message : String(error));
    return;
  }
  picker = null;
  el<HTMLDialogElement>('link-picker').close();
  current.done();
}
/** Reads the picker's pasted address and offers what it names, if it may be chosen. */
async function pickerFind() {
  const current = picker,
    address = el<HTMLInputElement>('link-picker-url').value.trim();
  if (!current || !address) return;
  const found = el('link-picker-found');
  found.replaceChildren();
  const refuse = (text: string) => (el('link-picker-address-status').textContent = text);
  refuse('Looking it up…');
  let choice: PickerChoice;
  try {
    if (current.where === 'here' && (!remote || local || offlineHtml)) {
      // A timeline without a server address: a link to one of its events (#moment/<id>).
      const hash = address.includes('#') ? address.slice(address.indexOf('#')) : address;
      const named = addressedEntity(address)?.entity ?? parseLink(hash);
      const entry =
        named && (named.kind === 'moment' || named.kind === 'duration')
          ? describe(
              refKey(named.kind === 'moment' ? { moment: named.id } : { duration: named.id }),
            )
          : null;
      if (!entry) return refuse('That isn’t a link to an event on this timeline.');
      choice = {
        kind: entry.kind,
        id: entry.id,
        title: entry.title,
        when: presentedAlone(Q.parse(entry.first)),
        snippet: '',
        timeline: null,
        result: { ...entry, snippet: '' },
      };
    } else {
      const named = await api<ResolvedAddress>(`timelines/${remote!.id}/links/resolve`, 'POST', {
        address,
      });
      if (current.where === 'here') {
        if (!named.same)
          return refuse('That’s on another timeline: link to it with Link to another timeline.');
        if (!named.entity)
          return refuse('That’s this timeline: paste the address of one of its events.');
        const e = named.entity;
        choice = {
          kind: e.kind,
          id: e.id,
          title: e.title,
          when: e.when,
          snippet: '',
          timeline: null,
          result: {
            kind: e.kind,
            id: e.id,
            first: e.first,
            last: e.last,
            title: e.title,
            snippet: '',
          },
        };
      } else {
        if (named.same)
          return refuse('That’s this timeline: relate its events with Add a relationship.');
        if (!named.canWrite)
          return refuse('You can’t edit that timeline, so you can’t link to it.');
        if (named.full) return refuse('That timeline already has as many links as it may have.');
        choice = named.entity
          ? { ...named.entity, snippet: '', timeline: named.timeline }
          : {
              kind: 'timeline',
              id: '',
              title: named.timeline.title,
              when: '',
              snippet: '',
              timeline: named.timeline,
            };
      }
    }
  } catch (error) {
    return refuse(error instanceof Error ? error.message : String(error));
  }
  if (
    current.where === 'here' &&
    refKey(choice.kind === 'moment' ? { moment: choice.id } : { duration: choice.id }) ===
      refKey(current.ref)
  )
    return refuse('That’s this event itself.');
  if (picker !== current) return;
  refuse('');
  found.replaceChildren(pickerItem(choice, []));
}
el('link-picker-search-tab').onclick = () => {
  pickerTab('search');
  el('link-picker-text').focus();
};
el('link-picker-address-tab').onclick = () => {
  pickerTab('address');
  el('link-picker-url').focus();
};
/** Searches again from the first page, once typing pauses (`delay`). */
function pickerChanged(delay = 250) {
  clearTimeout(pickerTimer);
  if (picker) picker.page = 1;
  pickerTimer = setTimeout(
    () => void pickerSearch().catch((error) => pickerStatus(String(error?.message ?? error))),
    delay,
  );
}
el('link-picker-text').oninput = () => pickerChanged();
el('link-picker-tag').oninput = () => pickerChanged();
el('link-picker-within').onchange = () => pickerChanged(0);
el('link-picker-show').onchange = (event) => {
  // One kind at least: clearing the last box shown checks it again.
  const box = event.target as HTMLInputElement;
  if (!pickerShown().length) box.checked = true;
  pickerChanged(0);
};
for (const [id, step] of [
  ['link-picker-previous', -1],
  ['link-picker-next', 1],
] as const)
  el(id).onclick = () => {
    if (!picker) return;
    picker.page += step;
    void pickerSearch().catch((error) => pickerStatus(String(error?.message ?? error)));
  };
el('link-picker-find').onclick = () => void pickerFind();
el('link-picker-url').onkeydown = (event) => {
  if ((event as KeyboardEvent).key === 'Enter') {
    event.preventDefault();
    void pickerFind();
  }
};
el('link-picker-form').onsubmit = (event) => {
  event.preventDefault();
  pickerChanged(0);
};
el('link-picker').addEventListener('close', () => (picker = null));
function describeLabel(ref: EntityRef) {
  const entry = describe(refKey(ref));
  return entry?.title || ('moment' in ref ? 'this moment' : 'this duration');
}
/** Relationship arcs between endpoint times; arcs to off-screen entities run off the edge. */
/** Arc elements persist by relationship: a moving view only reshapes them (#68). */
const edgeArcs = new Map<
  string,
  {
    path: SVGPathElement;
    halo: SVGPathElement;
    title: SVGTitleElement;
    named: string;
    arrows?: SVGPathElement;
  }
>();
/**
 * The entities the frame shows by reference key, with their metadata and titles: single
 * moments, collapsed durations and bands. On a separation's tracks (#415) their IDs carry the
 * track's key, which is taken off, since arcs name the timeline's own entities.
 */
function frameEntities(): Map<string, { metadata?: Record<string, unknown>; title?: string }> {
  const shown = new Map<string, { metadata?: Record<string, unknown>; title?: string }>();
  const own = (id: string, sourceKey?: string) =>
    sourceKey && id.startsWith(sourceKey + ':') ? id.slice(sourceKey.length + 1) : id;
  for (const group of frame.groups) {
    const sourceKey = (group as ComparisonGroup).sourceKey;
    if (group.id)
      shown.set('m:' + own(group.id, sourceKey), { metadata: group.metadata, title: group.title });
    if (group.duration)
      shown.set('d:' + own(group.duration.id, group.duration.sourceKey ?? sourceKey), {
        metadata: group.duration.metadata,
        title: group.duration.metadata.title,
      });
  }
  for (const band of frame.durations ?? [])
    shown.set('d:' + own(band.id, band.sourceKey), {
      metadata: band.metadata,
      title: band.metadata.title,
    });
  return shown;
}
/**
 * The ends of an arc that draw an arrowhead (#326): the union of what its two entities'
 * relationship-arrows fields say, read from the metadata the view already has (the timeline
 * in memory, or the frame's moments and bands), or null when no enabled plugin draws arrows.
 * An entity whose metadata isn't at hand, such as one off screen or inside a summary of a
 * server timeline, says nothing. A separation (#415) reads the saved version, so there the
 * frame's metadata comes before a server or desktop timeline's unsaved edits.
 */
function arrowheadLookup(
  shown: () => Map<string, { metadata?: Record<string, unknown> }>,
): ((a: EntityRef, b: EntityRef) => { a: boolean; b: boolean }) | null {
  const installed = installedPlugins();
  if ((comparison && !separation) || !pluginDrawsArrows(installed)) return null;
  const moments = activePlugins(),
    durations = durationPlugins(installed);
  const edited = separation && sparseWorkspace() ? null : model;
  const end = (ref: EntityRef) => {
    const key = refKey(ref);
    return 'moment' in ref
      ? {
          key,
          plugins: moments,
          metadata: edited?.byId.get(ref.moment)?.metadata ?? shown().get(key)?.metadata ?? null,
        }
      : {
          key,
          plugins: durations,
          metadata:
            edited?.durations.get(ref.duration)?.metadata ?? shown().get(key)?.metadata ?? null,
        };
  };
  return (a, b) => arcArrowheads(end(a), end(b));
}
/**
 * Where each end of an arc is drawn: the height of the axis it rises from. On the timeline,
 * its axis; on a separation (#415) the upper track's for ends on it (`aIn`/`bIn`) and the
 * lower track's for the rest; in a comparison, the axis of the track each end's timeline is
 * on (`aKey`/`bKey` for a link between two of them, #422, else the arc's own track), or the
 * one axis of a combined comparison.
 */
function arcAxes(): ((edge: EdgeBand, end: 'a' | 'b') => number) | null {
  if (!comparison) return () => 192;
  if (comparison.combined) return () => 192;
  const rows = comparisonRows().rows;
  const axis = (key: string | undefined) => 192 + (rows.get(key ?? '')?.offset ?? 0);
  if (separation) {
    // Each separated track's answer has every arc, its ends marked with whether they are on
    // that track: an end is drawn on the first track that has it, else on the last (the rest,
    // whose own answer has no arcs). An arc is drawn once, from the first track's answer.
    const tracks = comparison.tracks.map((t) => t.source.key),
      rest = tracks[tracks.length - 1];
    const on = new Map<string, { a?: string; b?: string }>();
    for (const edge of frame.edges ?? []) {
      const key = edge.sourceKey ?? '';
      const id = edge.id.slice(key.length + 1);
      const ends = on.get(id) ?? {};
      if (edge.aIn !== false && ends.a === undefined) ends.a = key;
      if (edge.bIn !== false && ends.b === undefined) ends.b = key;
      on.set(id, ends);
    }
    return (edge, end) => {
      const ends = on.get(edge.id.slice((edge.sourceKey ?? '').length + 1));
      // An end within a collapsed span is on the track it united into; one on a hidden track
      // (out of view) on the rest (#560).
      const drawn = drawnTrack(
        (end === 'a' ? ends?.a : ends?.b) ?? rest,
        parsedTime(end === 'a' ? edge.aTime : edge.bTime),
      );
      return axis(trackPlan.hidden.has(drawn) ? rest : drawn);
    };
  }
  return (edge, end) => axis((end === 'a' ? edge.aKey : edge.bKey) ?? edge.sourceKey);
}
/** The earliest of a separated track's known disjoin or union times. */
function earliestJoin(index: number, which: 'disjoins' | 'unions'): Q | null | undefined {
  if (!separation || !('tracks' in separation)) return undefined;
  if (!separation.tracks[index]?.[which]?.length) return undefined;
  const times = (separation.resolved?.[index]?.[which] ?? [])
    .map((d) => d.at)
    .filter((at): at is Q => !!at);
  return times.length ? times.reduce((a, b) => (b.compare(a) < 0 ? b : a)) : null;
}
/**
 * Where a separated track begins (#549): at its first disjoin, once its time is known; null
 * for a track that does not disjoin (it begins at once). One whose disjoins are not known yet
 * (or wait for a moment that is gone) begins beyond any view.
 */
function separationBegins(index: number): Q | null {
  const at = earliestJoin(index, 'disjoins');
  if (at === undefined) return null;
  return at ?? viewport.right.add(viewport.span);
}
/** Where a separated track ends: at its first union, once known; null when it never does. */
function separationEnds(index: number): Q | null {
  return earliestJoin(index, 'unions') ?? null;
}
/** How a disjoin's or union's time is named: its time once known, else what it follows. */
function disjoinName(when: DisjoinTime | UnionTime, at: Q | null | undefined): string {
  const known = at ? presented(at) : null;
  if ('at' in when) return presented(Q.parse(when.at));
  if ('moment' in when) return known ? `${known} (a moment)` : `moment ${when.moment}`;
  const bound = 'first' in when ? 'its first moment' : 'its last moment';
  return known ? `${known} (${bound})` : bound;
}
/**
 * The bar's label for separations: each one's tags (or the entity whose relationships it
 * follows), and when it disjoins and unites.
 */
function separationLabel(choice: Separation) {
  const name = (track: number | null) => (track === null ? 'main' : `separation ${track + 1}`);
  return choice.tracks
    .map((t, i) => {
      const when = [
        ...(t.disjoins ?? []).map(
          (d, k) =>
            `from ${name(d.from)} at ${disjoinName(d, choice.resolved?.[i]?.disjoins?.[k]?.at)}`,
        ),
        ...(t.unions ?? []).map(
          (u, k) =>
            `into ${name(u.into)} at ${disjoinName(u, choice.resolved?.[i]?.unions?.[k]?.at)}`,
        ),
      ];
      // One alone is named by its entity: the heading says how it is separated.
      const what =
        'tags' in t
          ? t.tags.join(', ')
          : choice.tracks.length === 1
            ? relatedName(choice, t)
            : `${t.depth === 'direct' ? 'related to' : 'connected to'} “${relatedName(choice, t)}”`;
      return when.length ? `${what} (${when.join('; ')})` : what;
    })
    .join(' · ');
}
/** The events a separation takes, as a plain filter: its tags, or its entity's set (#552). */
function trackFilter(track: SeparationTrack): ViewFilter {
  return 'tags' in track
    ? { tags: track.tags, mode: 'any' }
    : { related: track.related, depth: track.depth, mode: 'any' };
}
/**
 * The latest moment a filter takes in a server or desktop timeline: in the last group of a
 * whole-timeline overview with moments, and the pages of moments from there on.
 */
async function lastTaggedTime(filter: ViewFilter): Promise<string | undefined> {
  const info = (local ?? remote)!;
  if (!info.first || !info.last) return undefined;
  const revision = info.revision;
  const lower = Q.parse(info.first),
    upper = Q.parse(info.last);
  const frame = await timelineQuery<Frame>({
    kind: 'overview',
    lower: lower.toString(),
    upper: upper.toString(),
    threshold: upper.sub(lower).div(Q.from(200n)).toString(),
    filter,
    revision,
    arcs: false,
  });
  const group = [...frame.groups].reverse().find((g) => BigInt(g.count) > 0n);
  if (!group) return undefined;
  let after: { time: string; id: string } | null = null,
    last: string | undefined;
  for (;;) {
    const page: EventPage = await timelineQuery<EventPage>({
      kind: 'events',
      lower: group.first,
      upper: info.last,
      limit: 100,
      filter,
      revision,
      ...(after ? { after } : {}),
    });
    const final = page.events.at(-1);
    if (!final) return last;
    last = final.time;
    if (page.events.length < 100) return last;
    after = { time: final.time, id: final.id };
  }
}
/**
 * Reads each disjoin's and union's time (#549): from the document held here, or by asking the
 * timeline's store for a moment's time and for the first or last moment with a separation's
 * tags. Then redraws.
 */
async function resolveDisjoins(choice: {
  tracks: SeparationTrack[];
  resolved?: ResolvedSeparation[];
}) {
  if (!choice.tracks.some((t) => t.disjoins?.length || t.unions?.length)) return;
  if (!sparseWorkspace() && model) {
    choice.resolved = resolveSeparations(choice.tracks, model.document());
  } else {
    const info = (local ?? remote)!;
    const revision = info.revision;
    const momentTime = async (id: string) =>
      (await timelineQuery<{ event: PointEvent | null }>({ kind: 'moment', id, revision })).event
        ?.time;
    const firstTime = async (filter: ViewFilter) => {
      if (!info.first || !info.last) return undefined;
      const page = await timelineQuery<EventPage>({
        kind: 'events',
        lower: info.first,
        upper: info.last,
        limit: 1,
        filter,
        revision,
      });
      return page.events[0]?.time;
    };
    const time = async (when: DisjoinTime | UnionTime, track: SeparationTrack) => {
      const at =
        'at' in when
          ? when.at
          : 'moment' in when
            ? await momentTime(when.moment).catch(() => undefined)
            : 'first' in when
              ? await firstTime(trackFilter(track)).catch(() => undefined)
              : await lastTaggedTime(trackFilter(track)).catch(() => undefined);
      return at === undefined ? null : Q.parse(at);
    };
    choice.resolved = await Promise.all(
      choice.tracks.map(async (t) => ({
        ...(t.disjoins
          ? {
              disjoins: await Promise.all(
                t.disjoins.map(async (d) => ({ from: d.from, at: await time(d, t) })),
              ),
            }
          : {}),
        ...(t.unions
          ? {
              unions: await Promise.all(
                t.unions.map(async (u) => ({ into: u.into, at: await time(u, t) })),
              ),
            }
          : {}),
      })),
    );
  }
  if (separation === choice) {
    text('separation-tags', separationLabel(choice));
    requestRender();
  }
}
/**
 * Where separations disjoin and unite (#549): at a disjoin, the track it leaves arcs away to
 * the separation's, arriving at the time, as a relationship's arc curves between two tracks;
 * at a union, the separation's track arcs back into the one it joins, leaving at the time.
 */
function renderSeparationForks(svg: Element) {
  svg.querySelectorAll('.separation-fork').forEach((node) => node.remove());
  if (!separation || !('tracks' in separation) || !comparison || comparison.combined) return;
  const rows = comparisonRows().rows,
    keys = comparison.tracks.map((t) => t.source.key),
    right = stageWidth() / uiScale;
  const axis = (key: string) => 192 + (rows.get(key)?.offset ?? 0);
  const track = (index: number | null) => (index === null ? keys.length - 1 : index);
  const ns = 'http://www.w3.org/2000/svg';
  const curve = (x: number, y0: number, y1: number, toward: 1 | -1, name: string) => {
    const reach = Math.min(96, Math.max(48, Math.abs(y1 - y0) / 3));
    // A disjoin's curve arrives at x (toward 1); a union's leaves it (toward -1).
    const x0 = toward === 1 ? x - reach : x,
      x1 = toward === 1 ? x : x + reach;
    if (x1 < 0 || x0 > right) return;
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('class', 'separation-fork separation-fork-line');
    path.setAttribute(
      'd',
      `M${x0} ${y0} C${x0 + (x1 - x0) / 3} ${y0} ${x0 + (2 * (x1 - x0)) / 3} ${y1} ${x1} ${y1}`,
    );
    const title = document.createElementNS(ns, 'title');
    title.textContent = name;
    path.append(title);
    svg.append(path);
  };
  const x = (at: Q) => (inset() + viewport.x(at, width())) / uiScale;
  // None within a span collapsed into the track it unites into, nor to or from a hidden
  // track (#560).
  const drawn = (index: number | null, at: Q) =>
    drawnTrack(keys[track(index)], at) === keys[track(index)] &&
    !trackPlan.hidden.has(keys[track(index)]);
  separation.resolved?.forEach((resolved, i) => {
    if (!keys[i]) return;
    const own = axis(keys[i]),
      title = comparison!.tracks[i].source.title;
    for (const disjoin of resolved.disjoins ?? [])
      if (disjoin.at && drawn(i, disjoin.at) && drawn(disjoin.from, disjoin.at))
        curve(
          x(disjoin.at),
          axis(keys[track(disjoin.from)]),
          own,
          1,
          `${title} disjoins here from ${comparison!.tracks[track(disjoin.from)].source.title}`,
        );
    // Only the first union is drawn: the track ends there.
    const ends = separationEnds(i);
    const union = resolved.unions?.find((u) => u.at && ends && u.at.compare(ends) === 0);
    if (union?.at && drawn(i, union.at) && drawn(union.into, union.at))
      curve(
        x(union.at),
        own,
        axis(keys[track(union.into)]),
        -1,
        `${title} unites here into ${comparison!.tracks[track(union.into)].source.title}`,
      );
  });
}
function renderEdgeArcs() {
  const svg = el('edge-arcs');
  svg.querySelector('.edge-limit')?.remove();
  renderSeparationForks(svg);
  const generation = contentGeneration(),
    shown = new Set<string>(),
    right = stageWidth() / uiScale,
    axes = arcAxes();
  let entities: ReturnType<typeof frameEntities> | null = null;
  const onScreen = () => (entities ??= frameEntities());
  const arrowhead = arrowheadLookup(onScreen);
  const name = (ref: EntityRef, title?: string) =>
    title ||
    describe(refKey(ref))?.title ||
    onScreen().get(refKey(ref))?.title ||
    ('moment' in ref ? 'Moment' : 'Duration');
  // A separation's tracks each carry the arcs: drawn once, from the first track's.
  const firstTrack = separation && comparison ? comparison.tracks[0].source.key : null;
  for (const edge of axes ? (frame.edges ?? []) : []) {
    if (firstTrack !== null && edge.sourceKey !== firstTrack) continue;
    const xa = (inset() + viewport.x(parsedTime(edge.aTime), width())) / uiScale,
      xb = (inset() + viewport.x(parsedTime(edge.bTime), width())) / uiScale;
    // Each end on its track's axis: an arc within a track rises above it; one between the
    // tracks crosses the gap from one end to the other.
    const ya = axes!(edge, 'a'),
      yb = axes!(edge, 'b');
    const distance = Math.abs(xb - xa);
    const lift = Math.min(150, 18 + distance * 0.3);
    let arc = edgeArcs.get(edge.id);
    if (!arc) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', 'edge-arc');
      path.dataset.edgeId = edge.id;
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      path.append(title);
      // Beneath it, a wider stroke in the halo's color, shown over backgrounds (#232).
      const halo = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      halo.setAttribute('class', 'edge-arc-halo');
      svg.append(halo, path);
      arc = { path, halo, title, named: '' };
      edgeArcs.set(edge.id, arc);
    }
    shown.add(edge.id);
    arc.path.classList.toggle('edge-arc-between', ya !== yb);
    // Only the part over the stage, so an endpoint far off screen never puts a coordinate
    // millions of pixels away (which browsers draw coarsely, flickering as the view pans).
    const margin = 64,
      d =
        ya === yb
          ? arcPath(xa, xb, ya, lift, -margin, right + margin)
          : crossArcPath(xa, ya, xb, yb, -margin, right + margin);
    arc.path.setAttribute('d', d);
    arc.halo.setAttribute('d', d);
    // Arrowheads (#326) at the ends either entity's arrows point to, drawn in the arcs' own
    // coordinates so they scale with the content; an end beyond the view draws none.
    const ends = arrowhead?.(edge.a, edge.b),
      toA = !!ends?.a,
      toB = !!ends?.b;
    const head = (x: number, y: number, otherX: number, otherY: number) =>
      x < 0 || x > right
        ? ''
        : y === otherY
          ? arrowheadPath(x, otherX, y, lift)
          : crossArrowheadPath(x, y, otherX, otherY);
    const heads = [toA ? head(xa, ya, xb, yb) : '', toB ? head(xb, yb, xa, ya) : '']
      .filter(Boolean)
      .join(' ');
    if (heads && d) {
      if (!arc.arrows) {
        // Right after its arc, so hovering the arc highlights them too (styles.css).
        arc.arrows = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arc.arrows.setAttribute('class', 'edge-arrows');
        arc.path.after(arc.arrows);
      }
      arc.arrows.setAttribute('d', heads);
    } else if (arc.arrows) {
      arc.arrows.remove();
      arc.arrows = undefined;
    }
    // Names change only with the timeline's content and arrows, not as the view moves. With
    // an arrowhead at exactly one end, the name reads toward it.
    const named = `${generation}:${toA}:${toB}`;
    if (arc.named !== named) {
      const a = name(edge.a, edge.aTitle),
        b = name(edge.b, edge.bTitle);
      arc.title.textContent = toA === toB ? `${a} ↔ ${b}` : toB ? `${a} → ${b}` : `${b} → ${a}`;
      arc.named = named;
    }
  }
  for (const [id, arc] of edgeArcs)
    if (!shown.has(id)) {
      arc.path.remove();
      arc.halo.remove();
      arc.arrows?.remove();
      edgeArcs.delete(id);
    }
  if (axes && frame.edgesTruncated) {
    const note = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    note.setAttribute('x', String(inset()));
    note.setAttribute('y', '14');
    note.setAttribute('class', 'edge-limit');
    note.textContent = 'Showing the first 256 relationships in this window. Zoom in to see more.';
    svg.append(note);
  }
}
/**
 * Duration backgrounds (#94): each duration with a background image shows it behind the
 * timeline over the part of the duration in view. The image fills the stage, keeping its
 * aspect ratio, centered vertically and horizontally between the duration's visible start
 * and end (a view's edge standing in for an end beyond it). Smaller durations show above
 * larger ones, and edges inside the view fade out over a fixed width so backgrounds blend.
 * A duration too narrow to show its picture fades out as it narrows, as the ruler's finest
 * marks do (#222); collapsed durations are summaries, not bands, so they show none. Beneath
 * them all lies the timeline's own background (#223). Elements persist by duration, so
 * images keep loading while the view moves.
 */
const durationBackgrounds = new Map<
  string,
  { box: HTMLDivElement; img: HTMLImageElement; source: string; mask: string }
>();
/** How far each edge of a duration's background fades, in pixels (#222). */
const BACKGROUND_FADE = 48;
/** A box holding one background image, which shows once it has loaded. */
function backgroundBox(className: string, source: string) {
  const box = document.createElement('div');
  box.className = className;
  const img = document.createElement('img');
  img.alt = '';
  img.crossOrigin = 'anonymous';
  img.referrerPolicy = 'no-referrer';
  img.decoding = 'async';
  img.onload = () => img.classList.add('loaded');
  img.onerror = () => img.classList.remove('loaded');
  img.src = source;
  box.append(img);
  return { box, img };
}
let timelineBackdrop: { box: HTMLDivElement; img: HTMLImageElement; source: string } | null = null;
/** The timeline's own background (#223): the whole stage, beneath durations' backgrounds. */
function renderTimelineBackdrop(host: HTMLElement) {
  const source = imageSource(pluginBackdrop(installedPlugins()));
  if (timelineBackdrop && timelineBackdrop.source !== source) {
    timelineBackdrop.box.remove();
    timelineBackdrop = null;
  }
  if (source && !timelineBackdrop) {
    timelineBackdrop = { ...backgroundBox('timeline-backdrop', source), source };
    host.prepend(timelineBackdrop.box);
  }
  return !!timelineBackdrop;
}
type ChartPaths = { area: SVGPathElement; line: SVGPathElement };
let timelineChart: (ChartPaths & { svg: SVGSVGElement; series: ChartPaths[] }) | null = null;
type ChartGroups = Pick<FrameGroup, 'first' | 'last' | 'count'>[];
/**
 * A chart's series' moments in view (#434), each moment in the first series holding one of its
 * tags, only as far as this page knows them: from its index, unsaved edits and all, when it holds
 * the whole timeline; otherwise the view's own moments that it shows one by one, with their tags.
 * Where the view has only counts, those moments are in the total alone. None in a comparison.
 */
function chartSeriesGroups(series: readonly (readonly string[])[]): ChartGroups[] {
  if (comparison) return series.map(() => []);
  if (model && !sparseWorkspace())
    return model.chartSeriesGroups(
      series,
      viewport.left,
      viewport.right,
      viewport.threshold(width(), pixels()),
    );
  const wanted = series.map((tags) => new Set(tags)),
    groups = series.map((): ChartGroups => []);
  for (const group of frame.groups) {
    if (!group.metadata) continue;
    const tags = entityTags(group.metadata),
      i = wanted.findIndex((wanted) => tags.some((tag) => wanted.has(tag)));
    if (i >= 0) groups[i].push(group);
  }
  return groups;
}
/**
 * The background chart (#289): the view's moments as a smooth curve over the stage's lower
 * part, above the backgrounds and beneath the axis and markers. Its highest point is where
 * they are most numerous in view. A chart's series (#434) are curves beneath it, each relative
 * to the total, so where one meets the total all the moments there are in it.
 */
function renderBackgroundChart(host: HTMLElement) {
  const chart = pluginChart(installedPlugins());
  const x = (time: string) => viewport.x(parsedTime(time), width()),
    spread = Math.max(24, 2 * pixels());
  const density = chart && momentDensity(frame.groups, x, width(), spread);
  const most = density ? Math.max(...density) : 0;
  if (!chart || !(most > 0)) {
    timelineChart?.svg.remove();
    timelineChart = null;
    return;
  }
  const ns = 'http://www.w3.org/2000/svg';
  const paths = (kind: string): ChartPaths => {
    const area = document.createElementNS(ns, 'path'),
      line = document.createElementNS(ns, 'path');
    area.classList.add(`timeline-chart-${kind}area`);
    line.classList.add(`timeline-chart-${kind}line`);
    return { area, line };
  };
  if (!timelineChart) {
    const svg = document.createElementNS(ns, 'svg');
    svg.classList.add('timeline-chart');
    const total = paths('');
    svg.append(total.area, total.line);
    timelineChart = { svg, ...total, series: [] };
  }
  const { svg, area, line } = timelineChart;
  // Above the durations' backgrounds, whose z-indexes count up from 1.
  if (svg.parentNode !== host || host.lastChild !== svg) host.append(svg);
  const full = stageWidth(),
    height = stageHeight(),
    top = height * 0.2;
  svg.setAttribute('viewBox', `0 0 ${full} ${height}`);
  svg.style.color = chart.color ?? '';
  const total = chartPaths(
    density!.map((v) => v / most),
    inset(),
    width(),
    top,
    height,
  );
  area.setAttribute('d', total.area);
  line.setAttribute('d', total.line);
  // The series between the total's area and its line, in the plugin's order.
  while (timelineChart.series.length > chart.series.length) {
    const gone = timelineChart.series.pop()!;
    gone.area.remove();
    gone.line.remove();
  }
  while (timelineChart.series.length < chart.series.length) {
    const added = paths('series-');
    line.before(added.area, added.line);
    timelineChart.series.push(added);
  }
  // Stacked in the plugin's order: each series' band lies on those before it.
  const stacked = stackedCurves(
    chartSeriesGroups(chart.series.map((series) => series.tags)),
    x,
    width(),
    spread,
    most,
  );
  chart.series.forEach((series, i) => {
    const drawn = timelineChart!.series[i],
      values = stacked[i];
    drawn.area.style.color = drawn.line.style.color = series.color;
    drawn.line.dataset.series = series.label;
    const d = values ? chartPaths(values.top, inset(), width(), top, height, values.floor) : null;
    drawn.area.setAttribute('d', d?.area ?? '');
    drawn.line.setAttribute('d', d?.line ?? '');
  });
}
let appliedTheme = '';
/** How large the theme draws label and tick text (#267): 1 is the usual size. */
function textScales() {
  return themeScales(pluginTheme(installedPlugins()));
}
/**
 * The timeline's theme (#230): its colors and fonts as the stage's `--timeline-*` properties,
 * changed only when the theme does. Says whether it gives the stage a background color.
 */
function renderTimelineTheme(stage: HTMLElement) {
  const theme = pluginTheme(installedPlugins());
  const properties = themeProperties(theme),
    key = JSON.stringify(properties);
  if (key !== appliedTheme) {
    appliedTheme = key;
    const names = Array.from({ length: stage.style.length }, (_, i) => stage.style.item(i));
    for (const name of names) if (name.startsWith('--timeline-')) stage.style.removeProperty(name);
    for (const [name, value] of Object.entries(properties)) stage.style.setProperty(name, value);
    // A scheme of its own (#382) comes with its own ground, the theme's or the scheme's.
    const scheme = stageScheme(theme);
    stage.style.colorScheme = scheme;
    stage.classList.toggle('own-scheme', !!scheme);
  }
  return !!theme.background;
}
/** The opacity of a background `width` pixels wide: none at two fades wide, full at four. */
function backgroundOpacity(width: number) {
  const t = Math.max(0, Math.min(1, (width - 2 * BACKGROUND_FADE) / (2 * BACKGROUND_FADE)));
  return t * t * (3 - 2 * t);
}
function renderDurationBackgrounds() {
  const host = el('duration-backgrounds');
  const plugins = durationPlugins(installedPlugins());
  const shown = new Set<string>();
  const full = stageWidth();
  const stacked: { box: HTMLDivElement; extent: Q }[] = [];
  const backdrop = renderTimelineBackdrop(host);
  if (plugins.some((p) => p.enabled && p.manifest.background))
    for (const band of frame.durations ?? []) {
      const source = imageSource(pluginBackground(plugins, band.metadata));
      if (!source) continue;
      const start = inset() + viewport.x(parsedTime(band.first), width()),
        end = inset() + viewport.x(parsedTime(band.last), width());
      const left = Math.max(0, start),
        right = Math.min(full, end),
        opacity = backgroundOpacity(end - start);
      if (right <= left || opacity === 0) continue;
      const key = (band.sourceKey ?? '') + '\u0000' + band.id;
      shown.add(key);
      let entry = durationBackgrounds.get(key);
      if (!entry || entry.source !== source) {
        entry?.box.remove();
        const { box, img } = backgroundBox('duration-background', source);
        box.dataset.durationId = band.id;
        host.append(box);
        entry = { box, img, source, mask: '' };
        durationBackgrounds.set(key, entry);
      }
      const { box, img } = entry;
      markSensitive(box, band.metadata);
      box.style.opacity = opacity === 1 ? '' : opacity.toFixed(3);
      box.style.left = left + 'px';
      box.style.width = right - left + 'px';
      img.style.width = full + 'px';
      img.style.left = (left + right) / 2 - full / 2 - left + 'px';
      // Edges in view fade to transparency over a fixed width; an edge where the duration
      // goes on does not. Narrower than two fades, the duration has already faded out.
      const fade = Math.min(BACKGROUND_FADE, (right - left) / 2),
        from = start > 0 ? fade : 0,
        to = end < full ? fade : 0;
      const mask =
        from || to
          ? `linear-gradient(to right, transparent 0, #000 ${from}px, #000 calc(100% - ${to}px), transparent 100%)`
          : 'none';
      if (entry.mask !== mask) {
        entry.mask = mask;
        box.style.setProperty('mask-image', mask);
        box.style.setProperty('-webkit-mask-image', mask);
      }
      stacked.push({ box, extent: parsedTime(band.last).sub(parsedTime(band.first)) });
    }
  // Smaller (more specific) durations above larger ones.
  stacked
    .sort((a, b) => b.extent.compare(a.extent))
    .forEach(({ box }, index) => {
      if (box.style.zIndex !== String(index + 1)) box.style.zIndex = String(index + 1);
    });
  renderBackgroundChart(host);
  for (const [key, entry] of durationBackgrounds)
    if (!shown.has(key)) {
      entry.box.remove();
      durationBackgrounds.delete(key);
    }
  // The halo that keeps the timeline readable over the images (#220), and over a theme's
  // background color (#230).
  const stage = el('timeline-stage'),
    colored = renderTimelineTheme(stage);
  stage.classList.toggle('over-backgrounds', backdrop || colored || stacked.length > 0);
}
/** Band elements persist by duration so clicks and hover cards survive re-rendering. */
const durationButtons = new Map<string, HTMLButtonElement>(),
  bandContent = new WeakMap<HTMLButtonElement, string>(),
  moreChips = new Map<string, HTMLButtonElement>();
/** Where the first row of duration bands is (35 pixels below the axis), and how far apart rows
 * are: a band is 18 pixels tall. */
const DURATION_TOP = 227,
  DURATION_ROW = 19;
/**
 * How many rows the window's bands and "more" chip take beneath the axis, by comparison track
 * ('' outside a comparison); moment labels below the axis go beneath them (drawFrame).
 */
const durationDepth = new Map<string, number>();
/**
 * How many rows of bands are drawn beneath the axis before the rest go into a "more" chip
 * (#316): what fits under the ruler with the axis centered, so it doesn't change as the view
 * pans; at least three, and at most eight on a phone or sixteen otherwise.
 */
function durationRows() {
  const fit = Math.floor((stageHeight() / 2 / uiScale - 45) / DURATION_ROW);
  return Math.max(3, Math.min(compactScreen.matches ? 8 : 16, fit));
}
/**
 * The window's duration bands (#316): spans that nearly coincide drawn as one band ("Title +
 * 12 more"), rows claimed longest first without overlap (#269), at most durationRows() of
 * them, and the rest, with any the window holds beyond those sent, behind a "＋N more
 * durations" chip that lists them.
 */
function renderDurationBands() {
  const host = el('duration-bands');
  host.querySelector('.duration-limit')?.remove();
  const rows = comparisonRows().rows;
  const plugins = durationPlugins(installedPlugins());
  const shown = new Set<string>();
  const bands = (frame.durations ?? []).filter(
    (band) =>
      viewport.x(parsedTime(band.first), width()) <= width() &&
      viewport.x(parsedTime(band.last), width()) >= 0,
  );
  const spanNumber = viewport.span.toApproximateNumber();
  const maxRows = durationRows();
  const { shown: arranged, hidden } = arrangeDurations(
    bands,
    (span) => (span.toApproximateNumber() / spanNumber) * width(),
    pixels(),
    maxRows,
  );
  const top = (source: string | undefined, row: number) =>
    DURATION_TOP + (rows.get(source ?? '')?.offset ?? 0) + row * DURATION_ROW + 'px';
  durationDepth.clear();
  for (const { band, row } of arranged) {
    const source = band.sourceKey ?? '';
    durationDepth.set(source, Math.max(durationDepth.get(source) ?? 0, row + 1));
  }
  for (const { band, members, row } of arranged) {
    const left = Math.max(0, viewport.x(parsedTime(band.first), width())),
      right = Math.min(width(), viewport.x(parsedTime(band.last), width()));
    const key = (band.sourceKey ?? '') + '\u0000' + band.id;
    shown.add(key);
    let button = durationButtons.get(key);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'duration-band';
      button.dataset.durationId = band.id;
      durationButtons.set(key, button);
      host.append(button);
    }
    // A band standing for several opens their list; one alone opens itself.
    button.onclick =
      members.length > 1
        ? () =>
            openDurationList({
              kind: 'bands',
              bands: members,
              heading: 'Durations spanning nearly this time',
            })
        : () => void openDurationById(band.id).catch(fail);
    button.classList.toggle(
      'search-hit',
      searchHit?.kind === 'duration' &&
        members.some((m) => m.id === searchHit!.id) &&
        !band.sourceKey,
    );
    button.style.left = (inset() + left) / uiScale + 'px';
    button.style.width = Math.max(6, (right - left) / uiScale) + 'px';
    // Below the axis's tick labels, which they would otherwise hide (#228).
    button.style.top = top(band.sourceKey, row);
    // An ongoing duration's end is now (#537): where that is in view, the band fades out
    // there rather than reading as having ended.
    button.classList.toggle(
      'ongoing',
      isOngoing(band.end) && viewport.x(parsedTime(band.last), width()) <= width(),
    );
    // What a band says changes with its content, not as the view moves (#68).
    const content = `${contentGeneration()}\u0000${band.first}\u0000${band.last}\u0000${members.length}`;
    if (bandContent.get(button) === content) continue;
    bandContent.set(button, content);
    const title = band.metadata.title || 'Untitled duration',
      others = members.length - 1;
    button.dataset.grouped = String(members.length);
    button.style.backgroundColor = pluginColor(plugins, band.metadata) ?? '';
    // A presumptive duration (#325) has a dashed border; a band standing for several, solid.
    renderPluginOutline(button, others ? 'solid' : pluginOutline(plugins, band.metadata));
    button.textContent = (band.metadata.title ?? '') + (others ? ` + ${others} more` : '');
    button.setAttribute(
      'aria-label',
      'Duration: ' +
        title +
        (others ? `, and ${others} more spanning nearly the same time; opens their list` : ''),
    );
    button.title =
      (band.metadata.title || 'Duration') +
      (others ? ` + ${others} more` : '') +
      ' · ' +
      presented(parsedTime(band.first)) +
      ' → ' +
      (isOngoing(band.end) ? 'now' : presented(parsedTime(band.last)));
    hoverPreview.update(button, plugins, band.metadata, 1n, 'Untitled duration');
  }
  for (const [key, button] of durationButtons)
    if (!shown.has(key)) {
      button.remove();
      durationButtons.delete(key);
    }
  // The chips: one per timeline with hidden bands; the window's own also counts those the
  // server or file didn't send.
  const loaded = frame.durations?.length ?? 0,
    unsent = frame.durationsTruncated && frame.durationsTotal ? frame.durationsTotal - loaded : 0,
    chips = new Map(hidden.map((h) => [h.source, h.bands]));
  if (unsent > 0 && !comparison && !chips.has('')) chips.set('', []);
  const chipKeys = new Set<string>();
  for (const [source, left] of chips) {
    const count = left.length + (source === '' && !comparison ? Math.max(0, unsent) : 0);
    if (!count) continue;
    chipKeys.add(source);
    let chip = moreChips.get(source);
    if (!chip) {
      chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'duration-more';
      chip.setAttribute('aria-haspopup', 'dialog');
      moreChips.set(source, chip);
      host.append(chip);
    }
    // Across the hidden bands' visible extent, or the whole width for unsent ones.
    const xs = left.flatMap((band) => [
      Math.max(0, viewport.x(parsedTime(band.first), width())),
      Math.min(width(), viewport.x(parsedTime(band.last), width())),
    ]);
    const from = xs.length && !unsent ? Math.min(...xs) : 0,
      to = xs.length && !unsent ? Math.max(...xs) : width();
    const used = Math.max(
      -1,
      ...arranged.filter((a) => (a.band.sourceKey ?? '') === source).map((a) => a.row),
    );
    chip.style.left = (inset() + from) / uiScale + 'px';
    chip.style.width = Math.max(150, (to - from) / uiScale) + 'px';
    chip.style.top = top(source || undefined, Math.min(maxRows, used + 1));
    durationDepth.set(source, Math.min(maxRows, used + 1) + 1);
    const label = durationCountText(
      count,
      source === '' && !comparison && !!frame.durationsTotalMore,
    );
    chip.dataset.count = String(count);
    chip.textContent = `＋${label} more ${count === 1 ? 'duration' : 'durations'} ▾`;
    chip.setAttribute('aria-label', `${label} more durations in this view; opens their list`);
    chip.onclick = () =>
      openDurationList(
        comparison || !frame.durationsTruncated
          ? { kind: 'bands', bands: left, heading: 'More durations in this view' }
          : {
              kind: 'window',
              lower: viewport.left.toString(),
              upper: viewport.right.toString(),
              threshold: bandThreshold().toString(),
              heading: 'Durations in this view',
            },
      );
  }
  for (const [key, chip] of moreChips)
    if (!chipKeys.has(key)) {
      chip.remove();
      moreChips.delete(key);
    }
  // A comparison can't list what its timelines didn't send; it says how many there are.
  if (comparison && frame.durationsTruncated) {
    const notice = document.createElement('span');
    notice.className = 'duration-limit';
    notice.textContent = `${durationCountText(
      frame.durationsTotal ?? loaded,
      !!frame.durationsTotalMore,
    )} durations touch this window; zoom in to see more of them.`;
    host.append(notice);
  }
}
/** The shortest duration drawn as a band at this zoom: the grouping distance in time. */
function bandThreshold() {
  return viewport.span.mul(screenQ(pixels())).div(screenQ(width()));
}
/** What the duration list shows: given bands, or every duration touching a window. */
type DurationListSource =
  | { kind: 'bands'; bands: DurationBand[]; heading: string }
  | { kind: 'window'; lower: string; upper: string; threshold: string; heading: string };
interface DurationListPage {
  durations: DurationBand[];
  next: number | null;
  total: number;
  totalMore?: boolean;
}
const DURATION_LIST_PAGE = 25;
let durationList: { source: DurationListSource; offset: number; request: number } | null = null;
/**
 * A page of the duration list (#316): the given bands, or a window's durations from the
 * timeline (the server or the desktop file, or the document in memory), filtered by words in
 * titles and sorted longest first, by start or by title.
 */
async function durationListPage(
  source: DurationListSource,
  words: string,
  sort: string,
  offset: number,
): Promise<DurationListPage> {
  const index = !sparseWorkspace() ? model : null;
  if (source.kind === 'window' && !index && (local ?? remote))
    return timelineQuery<DurationListPage>({
      kind: 'durations',
      overlapping: true,
      lower: source.lower,
      upper: source.upper,
      threshold: source.threshold,
      text: words,
      sort,
      offset,
      limit: DURATION_LIST_PAGE,
      revision: (local ?? remote)!.revision,
    });
  let bands: DurationBand[];
  if (source.kind === 'bands') bands = source.bands;
  else {
    const lower = Q.parse(source.lower),
      upper = Q.parse(source.upper),
      threshold = Q.parse(source.threshold);
    bands = index
      ? [...index.durations.values()]
          .map((d) => resolveDuration(d, (id) => index.momentTime(id)))
          .filter(
            (b): b is DurationBand =>
              !!b &&
              Q.parse(b.first).compare(upper) <= 0 &&
              Q.parse(b.last).compare(lower) >= 0 &&
              !collapses(b, threshold),
          )
      : (frame.durations ?? []);
  }
  const needle = words.trim().toLowerCase();
  const matching = needle
    ? bands.filter((b) =>
        String(b.metadata.title ?? '')
          .toLowerCase()
          .includes(needle),
      )
    : [...bands];
  const title = (b: DurationBand) => String(b.metadata.title ?? '').toLowerCase();
  matching.sort(
    sort === 'start'
      ? (a, b) => Q.parse(a.first).compare(Q.parse(b.first)) || (a.id < b.id ? -1 : 1)
      : sort === 'title'
        ? (a, b) =>
            (title(a) < title(b) ? -1 : title(a) > title(b) ? 1 : 0) ||
            Q.parse(a.first).compare(Q.parse(b.first)) ||
            (a.id < b.id ? -1 : 1)
        : compareDurationRank,
  );
  return {
    durations: matching.slice(offset, offset + DURATION_LIST_PAGE),
    next: matching.length > offset + DURATION_LIST_PAGE ? offset + DURATION_LIST_PAGE : null,
    total: Math.min(matching.length, DURATION_COUNT_CAP),
    ...(matching.length > DURATION_COUNT_CAP ? { totalMore: true } : {}),
  };
}
/** Opens the duration list (#316) on `source`, from its first page. */
function openDurationList(source: DurationListSource) {
  durationList = { source, offset: 0, request: 0 };
  text('duration-list-heading', source.heading);
  input('duration-list-text').value = '';
  el<HTMLSelectElement>('duration-list-sort').value = 'extent';
  const dialog = el<HTMLDialogElement>('duration-list');
  if (!dialog.open) dialog.showModal();
  void renderDurationList();
}
async function renderDurationList() {
  if (!durationList) return;
  const state = durationList,
    request = ++state.request;
  const words = input('duration-list-text').value,
    sort = el<HTMLSelectElement>('duration-list-sort').value;
  text('duration-list-status', 'Loading…');
  try {
    const page = await durationListPage(state.source, words, sort, state.offset);
    if (durationList !== state || request !== state.request) return;
    const list = el('duration-list-results');
    list.replaceChildren();
    for (const band of page.durations) {
      const item = document.createElement('li');
      item.className = 'duration-list-item';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'search-result';
      const name = document.createElement('strong');
      name.textContent = band.metadata.title || 'Untitled duration';
      const meta = document.createElement('span');
      meta.className = 'search-meta';
      meta.textContent = `${presented(Q.parse(band.first))} → ${presented(Q.parse(band.last))}`;
      open.append(name, meta);
      open.onclick = () => {
        el<HTMLDialogElement>('duration-list').close();
        void openDurationById(band.id, band).catch(fail);
      };
      const fitButton = document.createElement('button');
      fitButton.type = 'button';
      fitButton.textContent = 'Fit in view';
      fitButton.setAttribute('aria-label', `Fit ${name.textContent} in view`);
      fitButton.onclick = () => {
        el<HTMLDialogElement>('duration-list').close();
        fitDuration(band.id, band);
      };
      item.append(open, fitButton);
      list.append(item);
    }
    const total = durationCountText(page.total, page.totalMore);
    text(
      'duration-list-status',
      page.total === 0
        ? 'No durations match.'
        : `${total} ${page.total === 1 ? 'duration' : 'durations'}` +
            (page.next !== null || state.offset > 0
              ? ` · ${state.offset + 1}–${state.offset + page.durations.length}`
              : ''),
    );
    el<HTMLButtonElement>('duration-list-previous').disabled = state.offset === 0;
    el<HTMLButtonElement>('duration-list-next').disabled = page.next === null;
    el('duration-list-previous').parentElement!.hidden = state.offset === 0 && page.next === null;
  } catch (error) {
    if (durationList === state && request === state.request)
      text('duration-list-status', error instanceof Error ? error.message : String(error));
  }
}
let durationListTyping: ReturnType<typeof setTimeout> | undefined;
el('duration-list-text').addEventListener('input', () => {
  clearTimeout(durationListTyping);
  durationListTyping = setTimeout(() => {
    if (!durationList) return;
    durationList.offset = 0;
    void renderDurationList();
  }, 200);
});
el('duration-list-sort').addEventListener('change', () => {
  if (!durationList) return;
  durationList.offset = 0;
  void renderDurationList();
});
el('duration-list-form').addEventListener('submit', (event) => event.preventDefault());
el('duration-list-previous').onclick = () => {
  if (!durationList) return;
  durationList.offset = Math.max(0, durationList.offset - DURATION_LIST_PAGE);
  void renderDurationList();
};
el('duration-list-next').onclick = () => {
  if (!durationList) return;
  durationList.offset += DURATION_LIST_PAGE;
  void renderDurationList();
};
el('duration-list').addEventListener('close', () => (durationList = null));
