import { afterEach, describe, expect, it } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import NoticeBanner from '../NoticeBanner.vue'

let w: VueWrapper
afterEach(() => w?.unmount())

describe('NoticeBanner', () => {
  it('gold: текст и действие в слотах, золотая точка', () => {
    w = mountWithI18n(NoticeBanner, {
      props: { tone: 'gold' },
      slots: { default: '2 заявки ждут счёта', action: '<button type="button" id="go">Выставить</button>' },
    })
    const root = w.get('[role="status"]')
    expect(root.text()).toContain('2 заявки ждут счёта')
    expect(root.find('#go').exists()).toBe(true)
    expect(root.classes()).toContain('bg-gold-soft')
    expect(root.classes()).toContain('border-gold-line')
    expect(w.get('[data-notice-dot]').classes()).toContain('bg-gold')
  })

  it('neutral: canvas, рамка line, красная точка', () => {
    w = mountWithI18n(NoticeBanner, { props: { tone: 'neutral' }, slots: { default: 'Истекают' } })
    const root = w.get('[role="status"]')
    expect(root.classes()).toContain('bg-canvas')
    expect(root.classes()).toContain('border-line')
    expect(w.get('[data-notice-dot]').classes()).toContain('bg-danger')
  })

  it('без слота action область действия не рисуется', () => {
    w = mountWithI18n(NoticeBanner, { props: { tone: 'gold' }, slots: { default: 'Текст' } })
    expect(w.findAll('button')).toHaveLength(0)
    expect(w.get('[role="status"]').element.children).toHaveLength(2)
  })
})
