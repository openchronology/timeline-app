// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The editor's tour (#172): a step at a time, each control lit up with what it does. It
 * starts from the timeline's Help, or /help on the server (/editor?tour=1). Steps whose
 * control isn't shown (say, Share for a timeline in the browser) are left out.
 */
export interface TourStep {
  /** The control: the first of these selectors that is shown. */
  selectors: string[];
  title: string;
  text: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    selectors: ['#timeline-stage'],
    title: 'The timeline',
    text: 'Drag to move through time, and scroll to zoom (on a touch screen, pinch). Click empty space to select a time; click a moment to open it.',
  },
  {
    selectors: ['#add-button'],
    title: 'Add an event',
    text: 'An event is a moment, at one time, or a duration, a period with a start and an end. ＋ Event adds a moment at the selected time, or in the middle of the view; its Duration tab makes it a duration. You can also right-click the timeline, or press and hold it.',
  },
  {
    selectors: ['#search-button'],
    title: 'Search',
    text: 'Finds events by the words in their titles and notes. The / key opens it too.',
  },
  {
    selectors: ['#separate-button'],
    title: 'Separate by tags',
    text: 'Tag moments (war, trade…) in their details, then pull those with some tags into a track of their own.',
  },
  {
    selectors: ['#presentation-button'],
    title: 'Time display',
    text: 'Choose how times read: plain numbers, units such as years, or dates and times. It never moves anything.',
  },
  {
    selectors: ['#plugins-button'],
    title: 'Plugins',
    text: 'Add icons, colours, pictures, rich notes, headings and more to this timeline.',
  },
  {
    selectors: ['#compare-button'],
    title: 'Compare',
    text: 'Stack this timeline with others on one time axis, lining them up when they count time differently.',
  },
  {
    // On a phone, the controls above wait in Tools, and the tour shows it instead of them.
    selectors: ['#view-tools-button'],
    title: 'Tools',
    text: 'On a small screen, Search, Separate by tags, Time display, Plugins, Compare, the text size and Help are here.',
  },
  {
    selectors: ['.window-bounds'],
    title: 'Go to exact times',
    text: 'Type the times to show at the left and right edges, then Go. Undo and Redo are here too.',
  },
  {
    selectors: ['#publish-button', '#sqlite-save', '#export-button', '#file-menu-button'],
    title: 'Keep your work',
    text: 'Save to the server, save the desktop file, or export an .ochx file. The status under the title says where your work stands.',
  },
  {
    selectors: ['#share-button'],
    title: 'Share',
    text: 'Send a link, post it, or embed a public timeline on another site. Who may open it is up to its owner.',
  },
  {
    selectors: ['#timeline-help-button'],
    title: 'Help is here',
    text: 'Help lists the controls and starts this tour again. The ? buttons beside settings explain them, and the guide covers everything.',
  },
];

/** Whether `element` is on the page and shown. */
const shown = (element: Element | null): element is HTMLElement =>
  !!element &&
  (element as HTMLElement).offsetParent !== null &&
  element.getBoundingClientRect().width > 0;

/**
 * Starts the tour. `guide` is the user guide's address, for the last step; `open` opens it.
 * Returns a function that ends the tour.
 */
export function startTour(root: Document, guide: string, open: (url: string) => void): () => void {
  const steps = TOUR_STEPS.map((step) => ({
    ...step,
    target: () => step.selectors.map((s) => root.querySelector(s)).find(shown) ?? null,
  })).filter((step) => step.target());
  root.querySelector('.tour')?.remove();
  const tour = root.createElement('div');
  tour.className = 'tour';
  const spotlight = root.createElement('div');
  spotlight.className = 'tour-spotlight';
  const card = root.createElement('section');
  card.className = 'tour-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'false');
  card.setAttribute('aria-labelledby', 'tour-title');
  card.innerHTML = `<p class="tour-count" aria-live="polite"></p><h2 id="tour-title"></h2><p class="tour-text"></p>
    <div class="tour-actions"><button type="button" class="tour-skip">End tour</button>
    <span><button type="button" class="tour-back">Back</button><button type="button" class="tour-next">Next</button></span></div>`;
  tour.append(spotlight, card);
  root.body.append(tour);
  const part = <T extends HTMLElement>(selector: string) => card.querySelector<T>(selector)!;
  let index = 0,
    frame = 0;
  const place = () => {
    const target = steps[index]?.target();
    if (!target) return;
    const r = target.getBoundingClientRect(),
      pad = 6;
    Object.assign(spotlight.style, {
      left: r.left - pad + 'px',
      top: r.top - pad + 'px',
      width: r.width + pad * 2 + 'px',
      height: r.height + pad * 2 + 'px',
    });
    // Below the control if it fits, else above, else over it at the bottom of the window.
    const width = card.offsetWidth,
      height = card.offsetHeight,
      gap = 12;
    const left = Math.max(8, Math.min(r.left, innerWidth - width - 8));
    const top =
      r.bottom + gap + height <= innerHeight - 8
        ? r.bottom + gap
        : r.top - gap - height >= 8
          ? r.top - gap - height
          : innerHeight - height - 8;
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  };
  const follow = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(place);
  };
  const show = (next: number) => {
    index = next;
    const step = steps[index];
    part('.tour-count').textContent = `${index + 1} of ${steps.length}`;
    part('#tour-title').textContent = step.title;
    part('.tour-text').textContent = step.text;
    part<HTMLButtonElement>('.tour-back').disabled = index === 0;
    const last = index === steps.length - 1;
    part('.tour-next').textContent = last ? 'Open the guide' : 'Next';
    part('.tour-skip').textContent = last ? 'Done' : 'End tour';
    step.target()?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    place();
    part<HTMLButtonElement>('.tour-next').focus();
  };
  const end = () => {
    cancelAnimationFrame(frame);
    removeEventListener('resize', follow);
    removeEventListener('scroll', follow, true);
    root.removeEventListener('keydown', keys, true);
    tour.remove();
  };
  const keys = (event: KeyboardEvent) => {
    if (event.key === 'Escape') end();
    else if (event.key === 'ArrowRight' && index < steps.length - 1) show(index + 1);
    else if (event.key === 'ArrowLeft' && index > 0) show(index - 1);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  part('.tour-skip').onclick = end;
  part('.tour-back').onclick = () => show(Math.max(0, index - 1));
  part('.tour-next').onclick = () => {
    if (index < steps.length - 1) return show(index + 1);
    end();
    open(guide);
  };
  addEventListener('resize', follow);
  addEventListener('scroll', follow, true);
  root.addEventListener('keydown', keys, true);
  if (steps.length) show(0);
  else end();
  return end;
}
