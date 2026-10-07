// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
/** Keep the native modal/focus trap alive until its exit animation finishes. */
export function animateDialog(dialog: HTMLDialogElement) {
  const close = dialog.close;
  const show = dialog.showModal;
  if (!show || !dialog.ownerDocument?.defaultView) return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closing = false;
  let returnValue: string | undefined;
  const reset = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    closing = false;
    delete dialog.dataset.dialogClosing;
  };
  const finish = () => {
    if (!closing) return;
    const value = returnValue;
    reset();
    if (value === undefined) close.call(dialog);
    else close.call(dialog, value);
  };
  dialog.close = (value?: string) => {
    if (closing) return;
    if (!dialog.open) {
      if (value === undefined) close.call(dialog);
      else close.call(dialog, value);
      return;
    }
    returnValue = value;
    closing = true;
    dialog.dataset.dialogClosing = '';
    const style = dialog.ownerDocument.defaultView!.getComputedStyle(dialog);
    const duration =
      style.animationName === 'dialog-exit'
        ? parseFloat(style.animationDuration) * (style.animationDuration.endsWith('ms') ? 1 : 1000)
        : 0;
    if (!(duration > 0)) return finish();
    // Fallback handles missing animationend (background tabs or style changes).
    timer = setTimeout(finish, duration + 50);
  };
  dialog.showModal = () => {
    reset();
    show.call(dialog);
  };
  const ended = (event: AnimationEvent) => {
    if (event.target === dialog && event.animationName === 'dialog-exit') finish();
  };
  const cancel = (event: Event) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    dialog.close();
  };
  const submit = (event: SubmitEvent) => {
    if (event.defaultPrevented) return;
    const form = event.target as HTMLFormElement;
    const button = event.submitter as HTMLButtonElement | HTMLInputElement | null;
    if ((button?.formMethod || form.method) !== 'dialog') return;
    event.preventDefault();
    dialog.close(button?.value ?? '');
  };
  const blockInteraction = (event: Event) => {
    if (!closing) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  dialog.addEventListener('click', blockInteraction, true);
  dialog.addEventListener('keydown', blockInteraction, true);
  dialog.addEventListener('animationend', ended);
  dialog.addEventListener('cancel', cancel);
  dialog.addEventListener('submit', submit);
  return () => {
    if (closing) finish();
    reset();
    dialog.close = close;
    dialog.showModal = show;
    dialog.removeEventListener('click', blockInteraction, true);
    dialog.removeEventListener('keydown', blockInteraction, true);
    dialog.removeEventListener('animationend', ended);
    dialog.removeEventListener('cancel', cancel);
    dialog.removeEventListener('submit', submit);
  };
}
/** A backdrop click dismisses; dragging from the dialog onto its backdrop does not. */
export function dismissOnBackdrop(dialog: HTMLDialogElement) {
  const stopAnimation = animateDialog(dialog);
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
    stopAnimation();
    dialog.removeEventListener('pointerdown', down);
    dialog.removeEventListener('click', click);
    dialog.removeEventListener('pointercancel', reset);
    dialog.removeEventListener('close', reset);
  };
}
