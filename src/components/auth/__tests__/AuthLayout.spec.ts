import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'

vi.mock('@/i18n', async (orig) => ({ ...(await orig<typeof import('@/i18n')>()), setLocale: vi.fn() }))

import AuthLayout from '@/components/auth/AuthLayout.vue'
import LangSegment from '@/components/auth/LangSegment.vue'
import { setLocale } from '@/i18n'

let w: VueWrapper
afterEach(() => {
  w?.unmount()
  vi.clearAllMocks()
})

const props = {
  title: 'Вход',
  subtitle: 'Брокеры и клиенты входят по одному адресу',
  heroTitle: 'Таможенное оформление без бумажной суеты',
  heroText: 'Заявки и документы в одном окне',
  points: ['Пункт 1', 'Пункт 2', 'Пункт 3'],
}

describe('AuthLayout', () => {
  it('заголовок, подзаголовок, герой, пункты, копирайт с текущим годом, слоты', () => {
    w = mountWithI18n(AuthLayout, { props, slots: { default: '<form data-t="form"/>', footer: '<p data-t="footer">Нет аккаунта?</p>' } })
    expect(w.find('h2').text()).toBe('Вход')
    expect(w.text()).toContain('Брокеры и клиенты входят по одному адресу')
    expect(w.find('h1').text()).toBe('Таможенное оформление без бумажной суеты')
    expect(w.text()).toContain('Заявки и документы в одном окне')
    expect(w.findAll('li').map((li) => li.text())).toEqual(props.points)
    expect(w.text()).toContain(`© ${new Date().getFullYear()} Zircon · Астана`)
    expect(w.find('[data-t="form"]').exists()).toBe(true)
    expect(w.find('[data-t="footer"]').exists()).toBe(true)
  })
})

describe('LangSegment', () => {
  it('у текущего языка aria-pressed="true", у остальных — false', () => {
    w = mountWithI18n(LangSegment)
    const buttons = w.findAll('button')
    expect(buttons.map((b) => b.text())).toEqual(['RU', 'KZ', 'EN'])
    expect(buttons.map((b) => b.attributes('aria-pressed'))).toEqual(['true', 'false', 'false'])
    for (const b of buttons) expect(b.attributes('type')).toBe('button')
    expect(w.find('[role="group"]').attributes('aria-label')).toBe('Язык')
  })

  it('клик «EN» переключает язык; клик по текущему — ничего', async () => {
    w = mountWithI18n(LangSegment)
    await w.findAll('button')[2].trigger('click')
    expect(setLocale).toHaveBeenCalledWith('en')
    vi.mocked(setLocale).mockClear()
    await w.findAll('button')[0].trigger('click')
    expect(setLocale).not.toHaveBeenCalled()
  })
})
