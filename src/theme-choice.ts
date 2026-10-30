// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The color scheme a visitor chooses (#382): System, Light or Dark. Kept in this browser's
// localStorage and set as <html data-theme>, which src/theme.css's tokens follow; System removes
// it, so the system's setting applies, as it does without JavaScript. THEME_BOOT, inline in the
// head of every page, sets it before the first paint. Embeds (/embed/<id>) take only their
// `theme` parameter or the system's setting.

export type ThemeChoice = 'system' | 'light' | 'dark';

/** The choices, in the order they are offered, with their names. */
export const THEME_CHOICES: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Where the choice is kept in localStorage. */
export const THEME_KEY = 'openchronology-theme';

/** The window event a choice made on this page sends, for its other controls to follow. */
export const THEME_EVENT = 'openchronology-theme';

/**
 * The script inline in each page's head that applies the choice before the page first paints:
 * a `theme=light|dark` parameter first, then (except in an embed) the stored choice. Its exact
 * text is hashed into the editor's content security policies, so it changes only with them
 * (test/theme-choice.test.mjs checks src/index.html and the desktop app's policy carry it).
 */
export const THEME_BOOT = `(function(){var d=document.documentElement,m=/[?&]theme=(light|dark)(&|$)/.exec(location.search),t=m&&m[1];if(!t&&!/^\\/embed\\//.test(location.pathname))try{t=localStorage.getItem('${THEME_KEY}')}catch(e){}if(t==='light'||t==='dark')d.setAttribute('data-theme',t)})()`;

/** A stored or given value as a choice: anything else is System. */
export function parseChoice(value: unknown): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** The choice kept in `storage`, or System when there is none or storage is unavailable. */
export function storedChoice(storage: () => Storage | null = () => localStorage): ThemeChoice {
  try {
    return parseChoice(storage()?.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

/** Sets `root`'s data-theme for `choice`: removed for System. */
export function applyChoice(choice: ThemeChoice, root: HTMLElement = document.documentElement) {
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/** Keeps `choice` in `storage` (System as no entry) and applies it to `root`. */
export function chooseTheme(
  choice: ThemeChoice,
  storage: () => Storage | null = () => localStorage,
  root: HTMLElement = document.documentElement,
) {
  try {
    if (choice === 'system') storage()?.removeItem(THEME_KEY);
    else storage()?.setItem(THEME_KEY, choice);
  } catch {
    // Storage refused (a private window, or disabled): the choice holds for this page alone.
  }
  applyChoice(choice, root);
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: choice }));
}

/**
 * Follows a choice made on this page (THEME_EVENT), or in another tab or frame of this site
 * (localStorage's storage event, applied to `root`), calling `changed` with it. Returns a
 * function that stops listening.
 */
export function followChoice(
  changed: (choice: ThemeChoice) => void = () => {},
  root: HTMLElement = document.documentElement,
) {
  const listener = (event: StorageEvent) => {
    if (event.key !== THEME_KEY && event.key !== null) return;
    const choice = parseChoice(event.newValue);
    applyChoice(choice, root);
    changed(choice);
  };
  const local = (event: Event) => changed(parseChoice((event as CustomEvent).detail));
  window.addEventListener('storage', listener);
  window.addEventListener(THEME_EVENT, local);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(THEME_EVENT, local);
  };
}
