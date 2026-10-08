import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import en from '@/i18n/locales/en'
import kk from '@/i18n/locales/kk'
import ru from '@/i18n/locales/ru'
import { CARGO_OPERATIONS, CARRIER_ROLES, CURRENCY_CODES, GUARANTEE_TYPES, ORGANIZATION_ROLES, SUBJECT_TYPES, useLocalOptions, type LocalOptions } from '../localOptions'

const optionsFor = (locale: 'ru' | 'kk' | 'en'): LocalOptions => {
  let out!: LocalOptions
  mount(defineComponent({ setup() { out = useLocalOptions(); return () => null } }), {
    global: { plugins: [createI18n({ legacy: false, locale, messages: { ru, kk, en } })] },
  })
  return out
}

describe('localOptions', () => {
  it('значения — прежние русские строки на любом языке, подписи — на языке интерфейса', () => {
    for (const locale of ['ru', 'kk', 'en'] as const) {
      const o = optionsFor(locale)
      expect(o.organizationRoles.value.map((x) => x.value)).toEqual(ORGANIZATION_ROLES.map((x) => x.value))
      expect(o.carrierRoles.value.map((x) => x.value)).toEqual(['Перевозчик', 'Представитель'])
      expect(o.subjectTypes.value.map((x) => x.value)).toEqual(SUBJECT_TYPES.map((x) => x.value))
      expect(o.cargoOperations.value.map((x) => x.value)).toEqual(CARGO_OPERATIONS.map((x) => x.value))
      expect(o.guaranteeTypes.value.map((x) => x.value)).toEqual(GUARANTEE_TYPES.map((x) => x.value))
      expect(o.currencies.value.map((x) => x.value)).toEqual(CURRENCY_CODES)
    }
    expect(optionsFor('en').carrierRoles.value[0]).toEqual({ value: 'Перевозчик', label: 'Carrier' })
    expect(optionsFor('kk').carrierRoles.value[0]).toEqual({ value: 'Перевозчик', label: 'Тасымалдаушы' })
    expect(optionsFor('ru').currencies.value[0]).toEqual({ value: 'USD', label: 'USD — Доллар США' })
    expect(CARRIER_ROLES[0].value).toBe('Перевозчик')
  })

  it('у каждого варианта есть перевод на всех языках (не ключ)', () => {
    for (const locale of ['ru', 'kk', 'en'] as const) {
      const o = optionsFor(locale)
      for (const list of [o.organizationRoles, o.carrierRoles, o.subjectTypes, o.cargoOperations, o.guaranteeTypes, o.currencies]) {
        for (const opt of list.value) expect(opt.label, `${locale}:${opt.value}`).not.toContain('broker.transitRecord')
      }
    }
  })
})
