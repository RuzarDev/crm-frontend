import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { BrokerFirmDto } from '@/api/brokerFirms'
import BrokerFirmPicker from '../sections/BrokerFirmPicker.vue'

const firmsApi = vi.hoisted(() => ({ listBrokerFirms: vi.fn(), getBrokerFirmByBin: vi.fn(), upsertBrokerFirm: vi.fn() }))
vi.mock('@/api/brokerFirms', () => firmsApi)
vi.mock('@/ui/message', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

const SelectStub = {
  props: ['value', 'options'],
  emits: ['update:value'],
  template: `<div data-select-stub :data-value="value ?? ''"><button v-for="o in options" :key="o.value" type="button" :data-option="o.value" @click="$emit('update:value', o.value)">{{ o.label }}</button></div>`,
}
const firm = (o: Partial<BrokerFirmDto> = {}): BrokerFirmDto => ({
  id: 'f1', name: 'ТОО «БРОКЕР-1»', bin: '123456789012', address: 'Алматы', contractNumber: 'К-77', contractDate: '2026-01-10', contractValidUntil: '2027-01-10',
  createdAtUtc: '', updatedAtUtc: '', ...o,
})

let w: VueWrapper
const mount = async (contractNumber: string | null = null) => {
  w = mountWithI18n(BrokerFirmPicker, { props: { contractNumber }, attachTo: document.body, global: { stubs: { ZSelect: SelectStub } } })
  await flushPromises()
}
beforeEach(() => {
  vi.clearAllMocks()
  firmsApi.listBrokerFirms.mockResolvedValue([firm()])
})
afterEach(() => { w?.unmount(); document.body.innerHTML = '' })

// (баг) Прежний блок сам подставлял единственную фирму и писал её номер договора в ДТ при открытии: после загрузки списка
// ДТ менялась без действий пользователя и уходила в автосохранение.
describe('BrokerFirmPicker: номер договора меняется только действием пользователя', () => {
  it('открытие с одной фирмой в справочнике и пустым номером ничего не пишет в ДТ и не выбирает фирму', async () => {
    await mount(null)
    expect(w.emitted('update:contractNumber')).toBeUndefined()
    expect(w.get('[data-firm-pick]').attributes('data-value')).toBe('')
    expect(w.get('input[data-firm-name]').element).toHaveProperty('value', '')
  })

  it('единственная фирма предлагается кнопкой «Подставить»: по клику — выбрана, номер уходит в ДТ', async () => {
    await mount(null)
    await w.get('[data-firm-only]').trigger('click')
    expect(w.emitted('update:contractNumber')).toEqual([['К-77']])
    expect(w.get('input[data-firm-name]').element).toHaveProperty('value', 'ТОО «БРОКЕР-1»')
    expect(w.find('[data-firm-only]').exists()).toBe(false)
  })

  it('фирма по номеру договора, уже стоящему в ДТ, лишь показывается — без записи в ДТ', async () => {
    firmsApi.listBrokerFirms.mockResolvedValue([firm({ id: 'a', bin: '111111111111', name: 'ДРУГАЯ', contractNumber: 'К-1' }), firm()])
    await mount('К-77')
    expect(w.get('[data-firm-pick]').attributes('data-value')).toBe('123456789012')
    expect(w.emitted('update:contractNumber')).toBeUndefined()
    expect(w.find('[data-firm-only]').exists()).toBe(false)
  })

  it('несколько фирм: кнопки «Подставить» нет, выбор — только вручную', async () => {
    firmsApi.listBrokerFirms.mockResolvedValue([firm(), firm({ id: 'b', bin: '999999999999', name: 'ВТОРАЯ', contractNumber: 'В-2' })])
    await mount(null)
    expect(w.find('[data-firm-only]').exists()).toBe(false)
    expect(w.emitted('update:contractNumber')).toBeUndefined()
  })
})
