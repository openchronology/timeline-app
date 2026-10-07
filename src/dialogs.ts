// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/** A backdrop click dismisses; dragging from the dialog onto its backdrop does not. */
export function dismissOnBackdrop(dialog: HTMLDialogElement) {
  let pressedOutside = false;
  const outside = (event: MouseEvent) => {
    const rect = dialog.getBoundingClientRect();
    return (
      event.target === dialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    );
  };
  const down = (event: PointerEvent) => {
    pressedOutside = outside(event);
  };
  const click = (event: MouseEvent) => {
    if (pressedOutside && outside(event)) dialog.close();
    pressedOutside = false;
  };
  const reset = () => {
    pressedOutside = false;
  };
  dialog.addEventListener('pointerdown', down);
  dialog.addEventListener('click', click);
  dialog.addEventListener('pointercancel', reset);
  dialog.addEventListener('close', reset);
  return () => {
    dialog.removeEventListener('pointerdown', down);
    dialog.removeEventListener('click', click);
    dialog.removeEventListener('pointercancel', reset);
    dialog.removeEventListener('close', reset);
  };
}
