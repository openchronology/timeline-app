// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import test from 'node:test';
import { dismissOnBackdrop } from '../dist/dialogs.mjs';

test('backdrop dismissal ignores content clicks and drags, resets on cancel, and cleans up', () => {
  const dialog = new EventTarget();
  let closed = 0;
  dialog.getBoundingClientRect = () => ({ left: 100, right: 400, top: 100, bottom: 400 });
  dialog.close = () => {
    closed++;
    dialog.dispatchEvent(new Event('close'));
  };
  const cleanup = dismissOnBackdrop(dialog);
  const send = (type, x, y) =>
    dialog.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: y }));
  send('pointerdown', 120, 120);
  send('click', 120, 120);
  send('pointerdown', 120, 120);
  send('click', 20, 20);
  assert.equal(closed, 0);
  send('pointerdown', 20, 20);
  send('pointercancel', 20, 20);
  send('click', 20, 20);
  assert.equal(closed, 0);
  send('pointerdown', 20, 20);
  send('click', 20, 20);
  assert.equal(closed, 1);
  cleanup();
  send('pointerdown', 20, 20);
  send('click', 20, 20);
  assert.equal(closed, 1);
});

function animatedFixture(duration = '0.14s') {
  const dialog = new EventTarget();
  dialog.dataset = {};
  dialog.open = false;
  dialog.returnValue = '';
  let closed = 0;
  dialog.ownerDocument = {
    defaultView: {
      getComputedStyle: () => ({
        animationName: duration === '0s' ? 'none' : 'dialog-exit',
        animationDuration: duration,
      }),
    },
  };
  dialog.showModal = () => {
    dialog.open = true;
  };
  dialog.close = (value) => {
    if (value !== undefined) dialog.returnValue = value;
    dialog.open = false;
    closed++;
    dialog.dispatchEvent(new Event('close'));
  };
  dialog.getBoundingClientRect = () => ({ left: 100, right: 400, top: 100, bottom: 400 });
  const cleanup = dismissOnBackdrop(dialog);
  const finish = (name = 'dialog-exit') =>
    dialog.dispatchEvent(Object.assign(new Event('animationend'), { animationName: name }));
  return { dialog, cleanup, finish, closed: () => closed };
}

test('closing retains modality until the panel animation ends, once, preserving return values', () => {
  const { dialog, cleanup, finish, closed } = animatedFixture();
  dialog.showModal();
  dialog.close('apply');
  dialog.close('cancel');
  assert.equal(dialog.open, true);
  assert.equal(closed(), 0);
  finish('dialog-backdrop-exit');
  assert.equal(dialog.open, true);
  finish();
  assert.equal(dialog.open, false);
  assert.equal(closed(), 1);
  assert.equal(dialog.returnValue, 'apply');
  finish();
  assert.equal(closed(), 1);
  cleanup();
});

test('Escape and dialog forms use the animated close path without losing their result', () => {
  const { dialog, cleanup, finish } = animatedFixture();
  dialog.showModal();
  const escape = new Event('cancel', { cancelable: true });
  dialog.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);
  assert.equal(dialog.open, true);
  finish();
  dialog.showModal();
  const submit = new Event('submit', { cancelable: true });
  Object.defineProperty(submit, 'target', { value: { method: 'dialog' } });
  submit.submitter = { value: 'selected', formMethod: '' };
  dialog.dispatchEvent(submit);
  assert.equal(submit.defaultPrevented, true);
  finish();
  assert.equal(dialog.returnValue, 'selected');
  cleanup();
});

test('reopening cancels an outstanding close and reduced motion closes immediately', async () => {
  const { dialog, cleanup, closed } = animatedFixture('0.001s');
  dialog.showModal();
  dialog.close();
  dialog.showModal();
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(dialog.open, true);
  assert.equal(closed(), 0);
  cleanup();
  const reduced = animatedFixture('0s');
  reduced.dialog.showModal();
  reduced.dialog.close('done');
  assert.equal(reduced.dialog.open, false);
  assert.equal(reduced.dialog.returnValue, 'done');
  reduced.cleanup();
});

test('exit completes even when animationend is missing', async () => {
  const { dialog, cleanup, closed } = animatedFixture('1ms');
  dialog.showModal();
  dialog.close();
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(dialog.open, false);
  assert.equal(closed(), 1);
  cleanup();
});

test('closing blocks repeated confirmation clicks and keys until focus is restored', () => {
  const { dialog, cleanup, finish } = animatedFixture();
  let actions = 0;
  dialog.addEventListener('click', () => actions++);
  dialog.showModal();
  dialog.close();
  const click = new Event('click', { cancelable: true });
  dialog.dispatchEvent(click);
  const key = new Event('keydown', { cancelable: true });
  dialog.dispatchEvent(key);
  assert.equal(actions, 0);
  assert.equal(click.defaultPrevented, true);
  assert.equal(key.defaultPrevented, true);
  finish();
  dialog.showModal();
  dialog.dispatchEvent(new Event('click'));
  assert.equal(actions, 1);
  cleanup();
});
