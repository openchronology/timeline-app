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
