// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The ellipse (#324): Moment shapes 3's horizontal oval, on moments and stack entries, in every
// size, colored and with icons, from scripts, and as an unknown shape under older versions.
import assert from 'node:assert/strict';
import { closeMomentDetails } from './moment-dialog-browser.mjs';
import {
  BUILTIN_PLUGINS,
  MOMENT_COLORS,
  MOMENT_ICONS,
  MOMENT_SHAPES,
  MOMENT_STACKS,
  PLUGIN_EXAMPLE,
} from '../dist/core.mjs';

const icon = 'https://images.example/condition.png';
// A 1×1 PNG, embedded so the icon draws without a network (and in the offline build).
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMIWJDwHwAE5AJQGRSfFgAAAABJRU5ErkJggg==';

export async function checkEllipseShape(page, restore) {
  const load = async (doc) => {
    await closeMomentDetails(page);
    await page.locator('#json-file').setInputFiles({
      name: 'ellipse.ochx',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    await page.waitForFunction(
      (title) => document.getElementById('timeline-title').value === title,
      doc.title,
    );
  };
  const timeline = (title, plugins, events) => ({
    format: 'openchronology',
    version: 1,
    title,
    description: '',
    plugins: plugins.map((manifest) => ({ manifest, enabled: true })),
    events,
    assets: { [icon]: png },
  });
  const marker = (time) => page.locator(`#markers .event-marker[data-first="${time}"]`);
  const shapeOf = (time) =>
    page.waitForFunction(
      (time) =>
        document.querySelector(`#markers .event-marker[data-first="${time}"]`)?.dataset.shape,
      time,
    );
  const look = (locator) =>
    locator.evaluate((button) => {
      const path = button.querySelector('svg.marker-shape:not(.marker-outline) path');
      const border = button.querySelector('.marker-outline path');
      const box = path?.getBBox();
      const img = button.querySelector('img');
      const imgBox = img?.getBoundingClientRect();
      return {
        shape: button.dataset.shape,
        size: button.dataset.size,
        width: parseFloat(getComputedStyle(button).width),
        clip: button.style.getPropertyValue('--marker-clip'),
        fill: path?.getAttribute('fill'),
        stroke: border?.getAttribute('stroke'),
        borderFill: border?.getAttribute('fill'),
        box: box && { width: box.width, height: box.height },
        img: img && {
          clip: getComputedStyle(img).clipPath,
          width: imgBox.width,
          height: imgBox.height,
          // Its centre's offset from the marker's.
          offset: (({ x, y, width, height }) => [
            imgBox.x + imgBox.width / 2 - (x + width / 2),
            imgBox.y + imgBox.height / 2 - (y + height / 2),
          ])(button.getBoundingClientRect()),
          content: button.clientWidth,
          fit: getComputedStyle(img).objectFit,
        },
        buttonBox: (({ width, height }) => ({ width, height }))(button.getBoundingClientRect()),
      };
    });

  await load(
    timeline(
      'Ellipses',
      [MOMENT_ICONS, MOMENT_STACKS, MOMENT_COLORS, MOMENT_SHAPES],
      [
        {
          id: 'oval',
          time: '0/1',
          metadata: { title: 'Condition', shape: 'ellipse', color: '#7aadc4' },
        },
        {
          id: 'icon',
          time: '100/1',
          metadata: { title: 'With icon', shape: 'ellipse', shapeSize: 'large', iconUrl: icon },
        },
        {
          id: 'stacked',
          time: '200/1',
          metadata: {
            title: 'Stacked',
            stack: [{ id: 'entry', metadata: { title: 'Entry condition', shape: 'ellipse' } }],
          },
        },
        { id: 'plain', time: '300/1', metadata: { title: 'Plain' } },
      ],
    ),
  );
  assert.equal(await shapeOf('0/1').then((h) => h.jsonValue()), 'ellipse');
  // A horizontal oval: wider than tall, in its color, with the white border in front.
  const oval = await look(marker('0/1'));
  assert.equal(oval.clip, 'ellipse(50% 30% at 50% 50%)');
  assert(oval.box.width > oval.box.height * 1.5, JSON.stringify(oval.box));
  assert.equal(oval.fill, 'rgb(122, 173, 196)');
  assert.deepEqual([oval.stroke, oval.borderFill], ['white', 'none']);
  assert.equal(oval.width, 22);

  // An icon inside the large ellipse fills the marker inside its border, centred, and is
  // cropped to the oval, as in the other shapes.
  await page.waitForFunction(
    () => document.querySelector('#markers .event-marker[data-first="100/1"] img')?.complete,
  );
  const withIcon = await look(marker('100/1'));
  assert.deepEqual([withIcon.shape, withIcon.size, withIcon.width], ['ellipse', 'large', 32]);
  assert.match(withIcon.img.clip, /^ellipse\(50% 30%/);
  assert.equal(withIcon.img.fit, 'cover');
  assert.equal(withIcon.img.width, withIcon.img.content, JSON.stringify(withIcon));
  assert(withIcon.img.width >= 20, JSON.stringify(withIcon));
  assert(
    withIcon.img.offset.every((d) => Math.abs(d) <= 0.5),
    JSON.stringify(withIcon),
  );
  assert.equal(withIcon.stroke, 'white');

  // A stack entry takes the ellipse too.
  const entry = page.locator('.stack-marker[data-stack-entry="entry"]');
  await entry.waitFor();
  assert.equal((await look(entry)).shape, 'ellipse');

  // The selector offers it, and it keeps its shape in every size.
  await marker('300/1').click();
  const fields = page.locator('#plugin-event-fields');
  const shape = fields.locator('select[data-plugin-key="shape"]');
  assert((await shape.locator('option').allTextContents()).includes('Ellipse'));
  await shape.selectOption('ellipse');
  await page.waitForFunction(
    () =>
      document.querySelector('#markers .event-marker[data-first="300/1"]').dataset.shape ===
      'ellipse',
  );
  const size = fields.locator('select[data-plugin-key="shapeSize"]');
  for (const [name, px] of [
    ['small', 16],
    ['large', 32],
    ['medium', 22],
  ]) {
    await size.selectOption(name);
    await page.waitForFunction(
      (name) =>
        document.querySelector('#markers .event-marker[data-first="300/1"]').dataset.size === name,
      name,
    );
    const sized = await look(marker('300/1'));
    assert.deepEqual([sized.shape, sized.width], ['ellipse', px]);
    assert(sized.buttonBox.width > 0);
  }
  const metadata = JSON.parse(await page.locator('#event-metadata').inputValue());
  assert.equal(metadata.shape, 'ellipse');
  await closeMomentDetails(page);

  // A stack entry's selector offers it.
  await entry.click();
  const card = page.locator('.stack-card').first();
  assert(
    (
      await card.getByLabel('Moment shape', { exact: true }).locator('option').allTextContents()
    ).includes('Ellipse'),
  );
  assert.equal(await card.getByLabel('Moment shape', { exact: true }).inputValue(), 'ellipse');
  await closeMomentDetails(page);

  // A script draws it when its plugin lists the ellipse among its shapes.
  const script = {
    ...PLUGIN_EXAMPLE,
    shapes: ['ellipse'],
    source: 'function render(m, api) { return api.shape("ellipse"); }',
  };
  await load(
    timeline('Scripted ellipse', [script], [{ id: 'a', time: '0/1', metadata: { title: 'A' } }]),
  );
  assert.equal(await shapeOf('0/1').then((h) => h.jsonValue()), 'ellipse');

  // Pinned to version 2, a stored ellipse is an unknown shape: a circle, its value kept.
  const pinned = BUILTIN_PLUGINS.find((p) => p.id === 'moment-shapes' && p.version === 2);
  await load(
    timeline(
      'Pinned shapes',
      [pinned],
      [{ id: 'old', time: '0/1', metadata: { title: 'Old', shape: 'ellipse' } }],
    ),
  );
  assert.equal(await shapeOf('0/1').then((h) => h.jsonValue()), 'circle');
  await marker('0/1').click();
  const old = page.locator('#plugin-event-fields select[data-plugin-key="shape"]');
  assert(!(await old.locator('option').allTextContents()).includes('Ellipse'));
  assert.equal(await old.inputValue(), 'circle');
  assert.equal(JSON.parse(await page.locator('#event-metadata').inputValue()).shape, 'ellipse');
  await closeMomentDetails(page);

  await load(restore);
  console.log(
    'PASS ellipse: a horizontal oval on moments and stack entries, in every size, colored, cropping icons, from scripts, and unknown to pinned older versions.',
  );
}
