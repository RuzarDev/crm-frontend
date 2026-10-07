import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import type { Component } from 'vue'
import ru from '@/i18n/locales/ru'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MountOptions = Record<string, any>

/** mount() с подключённым i18n (ru) — для компонентов, которые зовут useI18n(). */
export const mountWithI18n = (component: Component, options: MountOptions = {}) => {
  const i18n = createI18n({ legacy: false, locale: 'ru', messages: { ru } })
  return mount(component, {
    ...options,
    global: { ...(options.global ?? {}), plugins: [...(options.global?.plugins ?? []), i18n] },
  })
}
