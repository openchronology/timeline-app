// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// The colors' contrast, light and dark (#382): every pair of tokens from src/theme.css drawn
// together meets WCAG AA (4.5:1 for text, 3:1 for controls, focus rings and large text), and the
// light-only fallback matches the light half of each token (a token without a dark value is the
// same in both).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/theme.css', import.meta.url), 'utf8');
const [plain, paired] = css.split('@supports');
/** Each token's value in a block of declarations. */
const declarations = (block) =>
  new Map([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const fallback = declarations(plain);
// A token the @supports block leaves out is the same in both.
const modes = { light: new Map(fallback), dark: new Map(fallback) };
for (const [name, value] of declarations(paired)) {
  const pair = /^light-dark\((#[0-9a-f]+),\s*(#[0-9a-f]+)\)$/i.exec(value);
  assert.ok(pair, `${name} is light-dark(#…, #…)`);
  modes.light.set(name, pair[1]);
  modes.dark.set(name, pair[2]);
}

/** `#rgb`, `#rrggbb` or `#rrggbbaa` as [r, g, b, a], each 0 to 1. */
function rgba(hex) {
  let h = hex.slice(1);
  if (h.length <= 4) h = [...h].map((c) => c + c).join('');
  const channel = (i) => (i < h.length ? parseInt(h.slice(i, i + 2), 16) / 255 : 1);
  return [channel(0), channel(2), channel(4), channel(6)];
}
/** `top` drawn over the opaque `[r, g, b]`. */
const over = ([r, g, b, a], under) => [r, g, b].map((c, i) => c * a + under[i] * (1 - a));
function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** The contrast of `fg` on `bg`, each a token, the second over `under` when not opaque. */
export function contrast(mode, fg, bg, under = '--bg') {
  const color = (name) => {
    const value = modes[mode].get(name) ?? name;
    assert.ok(value.startsWith('#'), `${name} is a color in ${mode}`);
    return rgba(value);
  };
  const base = over(color(under), [1, 1, 1]);
  const back = over(color(bg), base);
  const front = over(color(fg), back);
  const [a, b] = [luminance(front), luminance(back)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

const TEXT = 4.5,
  UI = 3;
/** Text on its background, as the pages and the editor draw them. */
const TEXT_PAIRS = [
  ['--ink', '--bg'],
  ['--ink', '--paper'],
  ['--ink', '--raised'],
  ['--ink', '--workspace'],
  ['--ink', '--tint'],
  ['--ink', '--tint-strong'],
  ['--ink', '--hover'],
  ['--label', '--paper'],
  ['--label', '--bg'],
  ['--label', '--raised'],
  ['--muted', '--bg'],
  ['--muted', '--paper'],
  ['--muted', '--raised'],
  ['--muted', '--workspace'],
  ['--muted', '--tint'],
  ['--faint', '--paper'],
  ['--faint', '--workspace'],
  ['--faint', '--raised'],
  ['--stage-text-soft', '--stage-ground'],
  ['--green', '--bg'],
  ['--green', '--paper'],
  ['--green', '--raised'],
  ['--green', '--tint'],
  ['--green', '--hover'],
  ['--green-hover', '--paper'],
  ['--link', '--paper'],
  ['--link', '--bg'],
  ['--on-primary', '--primary'],
  ['--on-primary', '--primary-hover'],
  ['--header-ink', '--header'],
  ['--header-ink', '--header-hover'],
  ['--gold', '--header'],
  ['--accent', '--header'],
  ['--on-accent', '--accent'],
  ['--on-accent', '--accent-hover'],
  ['--danger', '--paper'],
  ['--danger', '--bg'],
  ['--danger', '--raised'],
  ['--danger', '--danger-tint'],
  ['--warning', '--warning-tint'],
  ['--notice', '--notice-tint'],
  ['--caution', '--caution-tint'],
  ['--success', '--success-tint'],
  ['--success', '--paper'],
  ['--info', '--paper'],
  ['#fff', '--danger-solid'],
  ['#fff', '--success-solid'],
  ['#fff', '--info-solid'],
  ['#fff', '--amber-solid'],
  ['#fff', '--neutral-solid'],
  ['--ink', '--highlight'],
  ['--ink', '--code'],
  ['--code-block-ink', '--code-block'],
  ['--tooltip-ink', '--tooltip'],
  ['--toast-ink', '--toast'],
  ['--stage-text', '--stage-ground'],
  ['--stage-text-strong', '--stage-heading-backing'],
  ['--stage-measure', '--stage-ground'],
  ['--stage-duration-text', '--stage-duration'],
];
/** Large or secondary text, and controls, focus rings and markers against what is behind them. */
const UI_PAIRS = [
  ['--focus', '--bg'],
  ['--focus', '--paper'],
  ['--focus', '--raised'],
  ['--accent', '--header'],
  ['--stage-marker', '--stage-ground'],
  ['--stage-marker-group', '--stage-ground'],
  ['--stage-marker-strong', '--stage-ground'],
  ['--stage-marker-selected', '--stage-ground'],
  ['--stage-tick-boundary', '--stage-ground'],
  ['--stage-cursor', '--stage-ground'],
  ['--stage-duration', '--stage-ground'],
  ['--stage-arc', '--stage-ground'],
];

for (const mode of ['light', 'dark'])
  test(`${mode} text and controls meet WCAG AA`, () => {
    const failures = [];
    for (const [pairs, least] of [
      [TEXT_PAIRS, TEXT],
      [UI_PAIRS, UI],
    ])
      for (const [fg, bg] of pairs) {
        const ratio = contrast(mode, fg, bg);
        if (ratio < least) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)} < ${least}`);
      }
    assert.deepEqual(failures, []);
  });

test('the light-only fallback is the light half of every token', () => {
  for (const [name, value] of declarations(paired)) {
    assert.ok(fallback.has(name), `${name} has a fallback`);
    assert.equal(fallback.get(name), /^light-dark\((#[0-9a-f]+)/i.exec(value)[1], name);
  }
});
