// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Базовые стили после ухода с AntD (волна 7): preflight Tailwind в слое base + совместимость с reset AntD.
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const tailwind = read('../tailwind.css')
const tokens = read('../tokens.css')
const main = read('../../assets/main.css')
const entry = read('../../main.ts')
const pkg = JSON.parse(read('../../../package.json')) as { dependencies: Record<string, string> }
// Имя пакета собрано из частей: иначе этот файл сам попадал бы в grep-проверку «AntD в src = 0».
const ANTD = ['ant', 'design', 'vue'].join('-')

describe('базовые стили', () => {
  it('preflight Tailwind — первым импортом и в слое base; theme/utilities — без слоёв', () => {
    const imports = tailwind.match(/^@import .+$/gm) ?? []
    expect(imports[0]).toBe('@import "tailwindcss/preflight.css" layer(base);')
    expect(imports).toContain('@import "tailwindcss/utilities.css";')
  })

  it('совместимость с reset AntD: высота строки 1.15 в слое base', () => {
    expect(tailwind).toMatch(/@layer base\s*\{[\s\S]*html\s*\{\s*line-height:\s*1\.15;/)
  })

  it('reset и пакет AntD не подключены', () => {
    expect(entry).not.toContain(ANTD)
    expect(pkg.dependencies).not.toHaveProperty(ANTD)
  })

  it('main.css без перебивок AntD, все переменные — из tokens.css', () => {
    expect(main).not.toMatch(/\.a[n]t-|:not\(#z\)|!important/)
    const vars = [...main.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1])
    expect(vars.length).toBeGreaterThan(0)
    for (const v of vars) expect(tokens, v).toContain(`${v}:`)
  })

  it('.rich-html: картинки из серверного HTML остаются в строке текста (preflight делает img блочным)', () => {
    expect(main).toMatch(/\.rich-html :where\(img\)\s*\{\s*display:\s*inline;/)
  })

  it('совместимость с reset AntD: touch-action: manipulation на интерактивных элементах', () => {
    expect(tailwind).toMatch(/touch-action:\s*manipulation/)
  })

  it.each([
    '../../views/broker/dt/DtGraphHelp.vue',
    '../../views/broker/references/DtGuidePage.vue',
    '../../views/broker/references/tnved/TnvedNotesTab.vue',
  ])('HTML с сервера (v-html) — в контейнере .rich-html: %s', (file) => {
    const src = read(file)
    expect(src).toMatch(/class="rich-html [^"]*"[^>]*v-html=/)
  })
})
