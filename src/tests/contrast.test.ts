// Every kind of text on every background it sits on, worked out from the colours in globals.css, so a changed colour can't
// quietly drop below WCAG AA (4.5:1 for normal text).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/app/globals.css', 'utf8');
const colour = (name: string) => {
  const found = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!found) throw new Error(`No colour --${name}`);
  return found[1];
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const BACKGROUNDS = ['surface', 'page', 'primary-soft', 'accent-tint', 'loss-soft', 'hover-neutral', 'road'];

describe('Text contrast', () => {
  it('makes all main text black', () => {
    for (const token of ['text-strong', 'text', 'text-muted', 'accent-ink']) expect(colour(token), token).toBe('#000000');
  });

  it.each(BACKGROUNDS)('main text on --%s', (background) => {
    expect(contrast(colour('text'), colour(background))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['links and gains on white', 'primary', 'surface'],
    ['links and gains on the page', 'primary', 'page'],
    ['links and gains on a green tint', 'primary', 'primary-soft'],
    ['losses on white', 'loss', 'surface'],
    ['errors on their red tint', 'loss-strong', 'loss-soft'],
    ['white on a button', 'surface', 'primary'],
    ['white on a hovered button', 'surface', 'primary-hover'],
    ['a hint in an empty box', 'placeholder', 'surface'],
    ['a day that can not be picked, on white', 'disabled', 'surface'],
  ])('%s', (_what, text, background) => {
    expect(contrast(colour(text), colour(background))).toBeGreaterThanOrEqual(4.5);
  });
});
