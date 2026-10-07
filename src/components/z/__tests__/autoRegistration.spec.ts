// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import fg from 'fast-glob'
import { minimatch } from 'minimatch'
import { componentGlobs } from '../../../../vite.config'

// unplugin-vue-components 0.26: глобы приводятся к абсолютным путям (resolve(root, glob),
// префикс «!» сохраняется), новый файл в dev-наблюдателе регистрируется, если совпал
// ХОТЬ С ОДНИМ глобом (OR через minimatch). Поэтому исключение «!…» не работает —
// допустимы только положительные глобы, которые сами не захватывают z/.
const root = resolve(__dirname, '../../../..')
const abs = componentGlobs.map((g) => {
  const neg = g.startsWith('!')
  return `${neg ? '!' : ''}${resolve(root, g.replace(/^!/, ''))}`
})
const devMatches = (rel: string) => abs.some((g) => minimatch(resolve(root, rel), g))

describe('автоподключение компонентов (unplugin-vue-components)', () => {
  it('только положительные глобы', () => {
    expect(componentGlobs.every((g) => !g.startsWith('!'))).toBe(true)
  })
  it('dev-наблюдатель: z/ и .superpowers не регистрируются, остальное — да', () => {
    expect(devMatches('src/components/z/ZNew.vue')).toBe(false)
    expect(devMatches('src/components/z/sub/ZDeep.vue')).toBe(false)
    expect(devMatches('.superpowers/sdd/x/task.diff')).toBe(false)
    expect(devMatches('.superpowers/sdd/x/Foo.vue')).toBe(false)
    expect(devMatches('src/components/PageHeader.vue')).toBe(true)
    expect(devMatches('src/components/ui/ZTable.vue')).toBe(true)
    expect(devMatches('src/components/import40/deep/nested/X.vue')).toBe(true)
    expect(devMatches('src/components/zeta/X.vue')).toBe(true)
  })
  it('сборка: набор файлов = все .vue в src/components, кроме z/', () => {
    const expected = fg
      .sync('src/components/**/*.vue', { cwd: root })
      .filter((p) => !p.startsWith('src/components/z/'))
      .sort()
    const got = fg.sync(componentGlobs, { cwd: root }).sort()
    expect(got).toEqual(expected)
    expect(got.length).toBeGreaterThan(0)
  })
})
