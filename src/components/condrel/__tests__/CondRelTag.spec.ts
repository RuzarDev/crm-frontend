import { describe, expect, it } from 'vitest'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ConditionalReleaseBrief } from '@/api/conditionalRelease'
import CondRelTag from '../CondRelTag.vue'

const year = new Date().getFullYear()
const brief = (over: Partial<ConditionalReleaseBrief> = {}): ConditionalReleaseBrief => ({
  declarationId: 'd1', declarationNumber: null, docKind: 'conformity', note: null, deadline: `${year}-12-15`,
  overdue: false, daysLeft: 10, uploaded: false, openCount: 1, ...over,
})

describe('CondRelTag', () => {
  it('красная мигающая (только motion-safe), полный текст «до ДД.ММ нужен …»', () => {
    const w = mountWithI18n(CondRelTag, { props: { brief: brief(), blink: true } })
    const tag = w.get('[data-condrel-tag="open"]')
    expect(tag.text()).toContain('Условный выпуск: до 15.12 нужен сертификат или декларация соответствия')
    expect(tag.classes()).toContain('bg-tone-danger-bg')
    // Мигание — только при разрешённой анимации (prefers-reduced-motion выключает).
    expect(tag.classes()).toContain('motion-safe:animate-pulse')
    expect(tag.classes()).not.toContain('animate-pulse')
  })

  it('загружен — спокойный тон без мигания; короткий вид и «+N ДТ»', () => {
    const w = mountWithI18n(CondRelTag, { props: { brief: brief({ uploaded: true, openCount: 3 }), blink: true, short: true } })
    const tag = w.get('[data-condrel-tag="uploaded"]')
    expect(tag.classes()).not.toContain('motion-safe:animate-pulse')
    expect(tag.text()).toContain('Условный выпуск · до 15.12')
    expect(tag.text()).toContain('+2 ДТ')
    expect(tag.attributes('title')).toContain('документ на проверке')
  })
})
