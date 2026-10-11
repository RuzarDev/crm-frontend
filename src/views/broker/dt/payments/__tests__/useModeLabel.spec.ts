import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mountWithI18n } from '@/test/mountWithI18n'
import { useClassifiersStore } from '@/stores/classifiers'
import { useModeLabel } from '../useModeLabel'

// Подписи видов платежа — общие с карточкой товара (P3): 2050 — «Антидемпинговая пошлина», 4xxx — «Акциз», прочие — из классификатора.
describe('useModeLabel: подписи видов платежа', () => {
  it('1010/2010/2050/5060 и акциз 4xxx — свои подписи, прочие — код из классификатора, иначе пусто', () => {
    setActivePinia(createPinia())
    useClassifiersStore().cache['tax-modes'] = [{ code: '9999', nameRu: 'Прочий платёж' }] as never
    let label!: ReturnType<typeof useModeLabel>
    mountWithI18n(defineComponent({ setup() { label = useModeLabel(); return () => h('div') } }), { global: { plugins: [] } })
    expect(['1010', '2010', '2050', '4420', '5060', '9999', '0000', null].map(label)).toEqual([
      'Таможенный сбор', 'Пошлина', 'Антидемпинговая пошлина', 'Акциз', 'НДС', 'Прочий платёж', '', '',
    ])
  })
})
