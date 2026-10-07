// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../tokens.css', import.meta.url)), 'utf8')
const color = (name: string): string => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`))
  if (!m) throw new Error(`нет токена --color-${name}`)
  return m[1]
}
const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe('токены стиля C', () => {
  it.each([
    ['ink', 'surface'], ['ink', 'canvas'], ['ink', 'sunken'], ['ink', 'line-strong'],
    ['ink-2', 'surface'], ['ink-2', 'sunken'],
    ['ink-3', 'surface'], ['ink-3', 'canvas'],
    ['muted', 'surface'], ['muted', 'canvas'],
    ['zircon-ink', 'surface'], ['gold-ink', 'gold-soft'], ['danger', 'surface'],
    ['white', 'navy'], ['white', 'danger'],
  ])('%s на %s ≥ 4.5:1', (fg, bg) => {
    expect(contrast(color(fg), color(bg))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['neutral', 'info', 'wait', 'submitted', 'done', 'pay', 'danger'])('тон %s читается ≥ 4.5:1', (tone) => {
    expect(contrast(color(`tone-${tone}-fg`), color(`tone-${tone}-bg`))).toBeGreaterThanOrEqual(4.5)
  })

  it('кольцо фокуса: 2px surface + 2px zircon-ink (≥ 3:1 к surface — видимый фокус, WCAG 2.4.7/1.4.11)', () => {
    const m = css.match(/--shadow-focus:\s*([^;]+);/)
    expect(m?.[1].replace(/\s+/g, ' ').trim()).toBe('0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-zircon-ink)')
    expect(contrast(color('zircon-ink'), color('surface'))).toBeGreaterThanOrEqual(3)
  })
})
