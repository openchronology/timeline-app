// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// The color scheme's choice (#382), System, Light or Dark: a select in the site's footer, for
// everyone, and a group in the account's menu. Either keeps the choice in this browser and sets
// it at once (src/theme-choice.ts); the head's inline script applies it before the next page's
// first paint.
import { useEffect, useState } from 'react';
import {
  THEME_CHOICES,
  applyChoice,
  chooseTheme,
  followChoice,
  parseChoice,
  storedChoice,
} from '../../src/theme-choice.ts';

/** The choice as stored, following changes from the other controls, tabs and frames. */
function useThemeChoice() {
  // System until mounted: the server cannot know, and the page must hydrate as it rendered.
  const [choice, setChoice] = useState(null);
  useEffect(() => {
    const stored = storedChoice();
    // Pages that Next.js renders in its error shell (such as Not found) leave out the head's
    // script: applied here instead, once the page has loaded.
    applyChoice(stored);
    setChoice(stored);
    return followChoice(setChoice);
  }, []);
  return choice;
}

/** The footer's select, shown once its script runs (without one, the system's setting holds). */
export default function ThemeChoice() {
  const choice = useThemeChoice();
  return (
    <span className="theme-choice" hidden={choice === null}>
      {' · '}
      <label>
        Theme{' '}
        <select
          value={choice ?? 'system'}
          onChange={(event) => chooseTheme(parseChoice(event.target.value))}
        >
          {THEME_CHOICES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </span>
  );
}

/** The account menu's group: one item per choice, the current one checked. */
export function ThemeMenuItems() {
  const choice = useThemeChoice() ?? 'system';
  return (
    <div className="theme-menu" role="group" aria-label="Theme">
      <span className="theme-menu-label" aria-hidden="true">
        Theme
      </span>
      {THEME_CHOICES.map(({ value, label }) => (
        <button
          key={value}
          role="menuitemradio"
          aria-checked={choice === value}
          onClick={() => chooseTheme(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
