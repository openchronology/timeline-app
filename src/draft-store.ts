// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * Where browser drafts live (#188): each in its own IndexedDB database, with the stores
 * drafts.ts describes, and a list of them all — title, moments, owner and when last edited —
 * so starting another timeline keeps the one before. The first draft stays in the database
 * drafts always used ("openchronology"), which also holds the list and work kept across
 * signing in. The editor and the website's dashboard both read the list.
 */
/** One store per kind of record a draft keeps (drafts.ts); the "drafts" store holds the rest. */
export const DRAFT_STORES = [
  'draft-moments',
  'draft-durations',
  'draft-links',
  'draft-retired',
] as const;

/** The draft kept where the single draft of earlier versions was. */
export const MAIN_DRAFT = 'main';
const MAIN_DATABASE = 'openchronology';
const LIST_KEY = 'registry';

export interface DraftEntry {
  id: string;
  /** The account that made it; drafts from before the list have none. */
  owner?: string;
  title: string;
  moments: number;
  /** When it was last stored, as an ISO date; empty for a draft from before the list. */
  updated: string;
}

export const draftDatabase = (id: string) =>
  id === MAIN_DRAFT ? MAIN_DATABASE : `${MAIN_DATABASE}-draft-${id}`;

/** A new draft's ID. */
export function newDraftId(): string {
  return crypto.randomUUID();
}

/** Opens draft `id`'s database (version 2: the "drafts" store and one per kind of entity). */
export function openDraftDb(id: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(draftDatabase(id), 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ['drafts', ...DRAFT_STORES])
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Browser storage is busy in another tab.'));
  });
}
const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });

/** Reads the list, or, before there was one, what the single draft holds. */
async function readList(db: IDBDatabase): Promise<DraftEntry[]> {
  const tx = db.transaction(['drafts', 'draft-moments']);
  const drafts = tx.objectStore('drafts');
  const list = drafts.get(LIST_KEY),
    settings = drafts.get('settings'),
    legacy = drafts.get('current'),
    moments = tx.objectStore('draft-moments').count();
  await done(tx);
  if (Array.isArray(list.result)) return list.result as DraftEntry[];
  // An earlier version's draft: record by record, or one whole document.
  const title = (settings.result ?? legacy.result)?.title;
  if (typeof title !== 'string') return [];
  return [
    {
      id: MAIN_DRAFT,
      title,
      moments: settings.result ? moments.result : (legacy.result?.events?.length ?? 0),
      updated: '',
    },
  ];
}
/**
 * The drafts `owner` may open, most recently edited first: theirs, and any from before drafts
 * had owners.
 */
export async function listDrafts(owner: string): Promise<DraftEntry[]> {
  const db = await openDraftDb(MAIN_DRAFT);
  try {
    return (await readList(db))
      .filter((draft) => !draft.owner || draft.owner === owner)
      .sort((a, b) => b.updated.localeCompare(a.updated));
  } finally {
    db.close();
  }
}
/** Changes the list in one transaction, so tabs editing drafts at once each keep theirs. */
async function changeList(change: (list: DraftEntry[]) => DraftEntry[]) {
  const db = await openDraftDb(MAIN_DRAFT);
  try {
    const current = await readList(db);
    const tx = db.transaction('drafts', 'readwrite');
    const store = tx.objectStore('drafts');
    const read = store.get(LIST_KEY);
    read.onsuccess = () =>
      store.put(change(Array.isArray(read.result) ? read.result : current), LIST_KEY);
    await done(tx);
  } finally {
    db.close();
  }
}
/** Records draft `entry` in the list, in place of what it said before. */
export function recordDraft(entry: DraftEntry): Promise<void> {
  return changeList((list) => [entry, ...list.filter((draft) => draft.id !== entry.id)]);
}
/** Forgets draft `id`: its entry and everything stored of it. */
export async function deleteDraft(id: string): Promise<void> {
  await changeList((list) => list.filter((draft) => draft.id !== id));
  if (id !== MAIN_DRAFT) {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(draftDatabase(id));
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      // Another tab has it open: it is deleted once that tab lets go.
      request.onblocked = () => resolve();
    });
    return;
  }
  // The main database also holds the list and work kept across signing in.
  const db = await openDraftDb(MAIN_DRAFT);
  try {
    const tx = db.transaction(['drafts', ...DRAFT_STORES], 'readwrite');
    for (const name of DRAFT_STORES) tx.objectStore(name).clear();
    for (const key of ['settings', 'assets', 'current']) tx.objectStore('drafts').delete(key);
    await done(tx);
  } finally {
    db.close();
  }
}
