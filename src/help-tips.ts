// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The editor's "?" buttons (#172): beside a dialog's heading or a control, a short tip on
 * hover or focus, and a click opens the help about it (docs/, at /help on the server). Kept
 * here, rather than in the markup, so one test checks that each leads to a page and heading
 * that exist (test/help.test.mjs).
 */
export interface HelpTip {
  /** Where the button goes: after this element (`placement: 'after'`), or at its end. */
  selector: string;
  placement?: 'after' | 'inside';
  /** The help page and heading: `tags#separating-by-tags` is /help/tags#separating-by-tags. */
  topic: string;
  /** What it is about, for its accessible name: "Help on <about>". */
  about: string;
  tip: string;
}

export const HELP_TIPS: readonly HelpTip[] = [
  {
    selector: '#moment-heading',
    topic: 'guide#the-details-panel',
    about: 'moment details',
    tip: 'Edits show on the timeline as you type. Save keeps them; Cancel, Escape or closing puts the moment back.',
  },
  {
    selector: '#event-labels > legend',
    placement: 'inside',
    topic: 'moderation#sensitive-content-labels',
    about: 'sensitive content',
    tip: 'Mark what shows nudity, graphic violence or disturbing events: readers are warned first, and its images stay blurred until they choose.',
  },
  {
    selector: '#duration-heading',
    topic: 'durations#editing',
    about: 'durations',
    tip: 'A period with a start and an end. Either end can be a time of its own, or follow a moment and move with it.',
  },
  {
    selector: '#separate-heading',
    topic: 'tags#separating-by-tags',
    about: 'separating by tags',
    tip: 'Moves what carries any of the chosen tags into a track above the rest, to compare them. It changes nothing.',
  },
  {
    selector: '#map-heading',
    topic: 'time-mapping#the-mapping',
    about: 'shifting and scaling times',
    tip: 'Each time becomes (time − around) × scale + around + offset: move a strand of the story, or correct a wrong clock.',
  },
  {
    selector: '#search-heading',
    topic: 'search',
    about: 'searching',
    tip: 'Finds events (moments and durations) whose titles or notes contain every word you type.',
  },
  {
    selector: '#plugins-heading',
    topic: 'plugins',
    about: 'plugins',
    tip: 'Plugins add icons, colours, images, notes and more. They belong to the timeline, so everyone sees them.',
  },
  {
    selector: '#compare-dialog h2',
    topic: 'comparison',
    about: 'comparing timelines',
    tip: 'Stacks timelines on one time axis, each with its own scale and offset. It changes none of them.',
  },
  {
    selector: '#presentation-dialog h2',
    topic: 'time-presentation',
    about: 'the time display',
    tip: 'How times read: plain numbers, units, or dates. Changing it never moves anything.',
  },
  {
    selector: '#sharing-dialog h2',
    topic: 'sharing',
    about: 'sharing',
    tip: 'Who may open this timeline, and the link to send them.',
  },
  {
    selector: '#conflict-heading',
    topic: 'collaboration#saving-while-others-save',
    about: 'edits saved meanwhile',
    tip: 'Someone saved the same things differently while you edited. Keep your versions or use theirs; the rest of your edits merge.',
  },
  {
    selector: '#pull-dialog h2',
    topic: 'collaboration#pull-requests',
    about: 'pull requests',
    tip: 'Changes offered to a timeline by those who can’t save it directly. Writers merge or reject them.',
  },
  {
    selector: '#follow-latest-control',
    placement: 'inside',
    topic: 'guide#what-markers-show',
    about: 'following the latest moments',
    tip: 'Keeps the newest moments in view as others add them, once you stop moving around for 15 seconds.',
  },
  {
    selector: '.density-control',
    placement: 'inside',
    topic: 'guide#what-markers-show',
    about: 'grouping',
    tip: 'Moments closer together than this on screen show as one numbered summary. Click a summary to list them.',
  },
];

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"]), summary';

/**
 * Adds the "?" buttons. `open` opens a help address (a new tab, or the desktop's browser).
 * The tip shows in one tooltip, under the button hovered or focused.
 */
export function addHelpTips(
  root: Document,
  address: (topic: string) => string,
  open: (url: string) => void,
): void {
  const tooltip = root.createElement('div');
  tooltip.id = 'help-tooltip';
  tooltip.className = 'help-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  root.body.append(tooltip);
  let shown: HTMLElement | null = null;
  const hide = () => {
    tooltip.hidden = true;
    shown?.removeAttribute('aria-describedby');
    shown = null;
  };
  const show = (button: HTMLElement, tip: string) => {
    // A tooltip shown inside an open modal dialog must be in it, to be seen above it.
    const dialog = button.closest('dialog');
    (dialog ?? root.body).append(tooltip);
    tooltip.textContent = tip;
    tooltip.hidden = false;
    button.setAttribute('aria-describedby', tooltip.id);
    shown = button;
    const r = button.getBoundingClientRect(),
      width = tooltip.offsetWidth,
      height = tooltip.offsetHeight;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - width / 2, innerWidth - width - 8));
    const below = r.bottom + 6 + height <= innerHeight - 8;
    tooltip.style.left = left + 'px';
    tooltip.style.top = (below ? r.bottom + 6 : r.top - 6 - height) + 'px';
  };
  for (const tip of HELP_TIPS)
    for (const target of root.querySelectorAll<HTMLElement>(tip.selector)) {
      const button = root.createElement('button');
      button.type = 'button';
      button.className = 'help-tip';
      button.textContent = '?';
      button.setAttribute('aria-label', 'Help on ' + tip.about);
      button.dataset.helpTopic = tip.topic;
      button.onmouseenter = () => show(button, tip.tip);
      button.onfocus = (event) => {
        // A dialog opening focuses its first control: that stays what it was before tips.
        const dialog = button.closest('dialog');
        if (dialog && !dialog.contains(event.relatedTarget as Node | null)) {
          const next = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
            (element) =>
              !element.classList.contains('help-tip') &&
              element.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_PRECEDING &&
              element.getClientRects().length > 0,
          );
          if (next) return next.focus();
        }
        if (button.matches(':focus-visible')) show(button, tip.tip);
      };
      button.onmouseleave = button.onblur = hide;
      button.onkeydown = (event) => {
        if (event.key === 'Escape' && shown === button) {
          event.stopPropagation();
          hide();
        }
      };
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        hide();
        open(address(tip.topic));
      };
      if (tip.placement === 'inside') target.append(button);
      else target.after(button);
    }
}
