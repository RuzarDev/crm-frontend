import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '@/i18n/locales/en'
import kk from '@/i18n/locales/kk'
import ru from '@/i18n/locales/ru'
import type { ReestrCarrierInput, ReestrOrganizationInput } from '@/types/api'
import CarriersBlock from '../CarriersBlock.vue'
import OrganizationsBlock from '../OrganizationsBlock.vue'
import { CARRIER_ROLE_OPTIONS, ORGANIZATION_ROLE_OPTIONS } from '../reestrLocalOptions'

// Роль новой строки — значение из списка вариантов (в записи хранится русская строка), а не перевод:
// на kk/en перевод «Тасымалдаушы» / «Declarant» не совпадал ни с одним вариантом списка.
const AButton = defineComponent({ emits: ['click'], setup: (_p, { slots, emit }) => () => h('button', { 'data-add': '', onClick: () => emit('click', { stopPropagation() {} }) }, slots.default?.()) })
const Passthrough = defineComponent({ setup: (_p, { slots }) => () => h('div', [slots.extra?.(), slots.default?.()]) })
const Leaf = defineComponent({ setup: () => () => h('div') })
const stubs = {
  'a-collapse': Passthrough, 'a-collapse-panel': Passthrough, 'a-button': AButton, 'a-select': Leaf, 'a-input': Leaf,
}
const mountBlock = (component: unknown, locale: 'ru' | 'kk' | 'en') => mount(component as never, {
  props: { modelValue: [] },
  global: { plugins: [createI18n({ legacy: false, locale, messages: { ru, kk, en } })], stubs },
})

describe.each(['ru', 'kk', 'en'] as const)('роль новой строки по умолчанию, язык %s', (locale) => {
  it('организация — «Декларант» из списка вариантов', async () => {
    const w = mountBlock(OrganizationsBlock, locale)
    await w.get('[data-add]').trigger('click')
    const rows = w.emitted('update:modelValue')!.at(-1)![0] as ReestrOrganizationInput[]
    expect(rows[0].role).toBe('Декларант')
    expect(ORGANIZATION_ROLE_OPTIONS.map((o) => o.value)).toContain(rows[0].role)
  })

  it('перевозчик — «Перевозчик» из списка вариантов', async () => {
    const w = mountBlock(CarriersBlock, locale)
    await w.get('[data-add]').trigger('click')
    const rows = w.emitted('update:modelValue')!.at(-1)![0] as ReestrCarrierInput[]
    expect(rows[0].role).toBe('Перевозчик')
    expect(CARRIER_ROLE_OPTIONS.map((o) => o.value)).toContain(rows[0].role)
  })
})
