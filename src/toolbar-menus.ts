// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/**
 * The toolbars' menus on a phone: the File menu above the timeline's title, and Tools on the
 * timeline card. While the screen is narrow, the controls a menu holds move into it, the very
 * elements with their ids, handlers and hidden states, and move back when it widens, so wider
 * screens keep their rows exactly as they were. A menu opens below its button, closes on
 * Escape, on a tap or focus anywhere else and after running an action, and arrow keys move
 * between its controls.
 */
export interface ToolbarMenu {
  /** Closes the menu; `refocus` gives the focus back to its button. */
  close(refocus?: boolean): void;
}

export interface ToolbarMenuOptions {
  button: HTMLButtonElement;
  panel: HTMLElement;
  /** Each control, and where in the panel it goes, in the order they appear there. */
  items: readonly (readonly [HTMLElement, HTMLElement])[];
  /** While this matches, the controls are in the menu. */
  query: MediaQueryList;
  /** Controls that leave the menu open once used, such as the text size's steps. */
  stay?: readonly HTMLElement[];
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled])';
/** Whether `element` is shown: it and every element up to the panel are rendered. */
const shown = (element: HTMLElement) => element.getClientRects().length > 0;

export function toolbarMenu({
  button,
  panel,
  items,
  query,
  stay = [],
}: ToolbarMenuOptions): ToolbarMenu {
  const doc = button.ownerDocument;
  // Where each control lives on a wide screen, to put it back exactly there.
  const homes = items.map(([item]) => {
    const marker = doc.createComment(item.id || item.className);
    item.before(marker);
    return marker;
  });
  const open = () => !panel.hidden;
  const close = (refocus = false) => {
    if (!open()) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
  };
  const controls = () => [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(shown);
  // The button shows only on a phone, and only while the menu has something to offer.
  const update = () => {
    const hidden = !query.matches || items.every(([item]) => item.hidden);
    if (button.hidden !== hidden) button.hidden = hidden;
    if (hidden) close();
  };
  const place = () => {
    close();
    items.forEach(([item, slot], i) => {
      if (query.matches) slot.append(item);
      else homes[i].after(item);
    });
    update();
  };
  const watch = new MutationObserver(update);
  for (const [item] of items) watch.observe(item, { attributeFilter: ['hidden'] });
  query.addEventListener('change', place);
  place();

  button.addEventListener('click', (event) => {
    if (open()) return close();
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    // From the keyboard (a click without a pointer), the focus goes into the menu.
    if (event.detail === 0) controls()[0]?.focus();
  });
  const keys = (event: KeyboardEvent) => {
    if (!open()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const target = event.target as HTMLElement;
    // A slider keeps its own arrow keys.
    if (target instanceof HTMLInputElement && target.type === 'range') return;
    const list = controls();
    if (!list.length) return;
    const at = list.indexOf(target);
    const next =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? list[(at + 1) % list.length]
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? list[at <= 0 ? list.length - 1 : at - 1]
          : event.key === 'Home'
            ? list[0]
            : event.key === 'End'
              ? list[list.length - 1]
              : null;
    if (!next || (target === button && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    next.focus();
  };
  button.addEventListener('keydown', keys);
  panel.addEventListener('keydown', keys);
  // A tap anywhere else closes it first, so it never covers the timeline's own gestures.
  doc.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target as Node;
      if (open() && !panel.contains(target) && !button.contains(target)) close();
    },
    true,
  );
  panel.addEventListener('focusout', (event) => {
    const next = event.relatedTarget as Node | null;
    if (next && !panel.contains(next) && !button.contains(next)) close();
  });
  // An action closes the menu once it has run; the text size's steps and settings keep it.
  const action = (event: Event) => {
    const control = (event.target as HTMLElement).closest('button');
    return !!control && !stay.includes(control) && !control.classList.contains('help-tip');
  };
  // The menu's button takes the focus first, so a dialog the action opens gives it back there
  // when it closes, rather than to a control hidden in the closed menu.
  panel.addEventListener(
    'click',
    (event) => {
      if (action(event)) button.focus({ preventScroll: true });
    },
    true,
  );
  panel.addEventListener('click', (event) => {
    if (action(event)) close();
  });
  return { close };
}
