import { afterEach, describe, expect, it } from 'vitest'
import { nextTick, reactive } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import { emptyDraft, type ShipmentDraft } from '../useShipmentDraft'
import StepTransport from '../StepTransport.vue'

// Пункт 1 правок 30.10 (01.11.2026): в одной поставке несколько вагонов — «Номер вагона» строками и «+ Вагон», как «+ Контейнер».
let w: VueWrapper
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
})

const mount = (d: ShipmentDraft) => {
  w = mountWithI18n(StepTransport, { props: { draft: d }, attachTo: document.body })
  return w
}

describe('StepTransport: вагоны', () => {
  it('ЖД: одна строка вагона, «+ Вагон» добавляет строку с фокусом, номера — в черновик по порядку', async () => {
    const d = reactive({ ...emptyDraft(), transportMode: 0 }) as ShipmentDraft
    mount(d)
    const rows = () => w.findAll('[data-wz-wagon] [data-wagon-input]')
    expect(rows()).toHaveLength(1)
    expect(w.find('[data-wagon-remove]').exists()).toBe(false)
    expect(w.get('[data-wagon-add]').text()).toContain('Вагон')

    await rows()[0]!.setValue('52147896')
    await w.get('[data-wagon-add]').trigger('click')
    await nextTick()
    expect(rows()).toHaveLength(2)
    expect(document.activeElement).toBe(rows()[1]!.element)
    await rows()[1]!.setValue('52147897')
    expect(d.wagonNumbers).toEqual(['52147896', '52147897'])

    // Строку можно удалить, пока их больше одной.
    const removes = w.findAll('[data-wagon-remove]')
    expect(removes).toHaveLength(2)
    expect(removes[0]!.attributes('aria-label')).toBe('Удалить вагон 52147896')
    await removes[0]!.trigger('click')
    expect(d.wagonNumbers).toEqual(['52147897'])
    expect(w.find('[data-wagon-remove]').exists()).toBe(false)
  })

  it('не ЖД — строк вагонов нет', () => {
    mount(reactive({ ...emptyDraft(), transportMode: 1 }) as ShipmentDraft)
    expect(w.find('[data-wagons]').exists()).toBe(false)
  })
})
