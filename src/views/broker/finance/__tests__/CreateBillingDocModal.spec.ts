import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { Import40CaseDto } from '@/api/import40'
import type { SalesServiceItem } from '@/api/sales'

const api = vi.hoisted(() => ({ create: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@/api/billing', () => ({ billingApi: { create: api.create } }))
vi.mock('@/ui/message', () => ({ message: { success: api.success, error: api.error, warning: vi.fn(), info: vi.fn() } }))

import CreateBillingDocModal from '../CreateBillingDocModal.vue'
import ZCombobox from '@/components/z/ZCombobox.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZNumber from '@/components/z/ZNumber.vue'

// Окно и выпадающие списки — заглушки: здесь проверяется состав формы и тело запроса.
const ModalStub = {
  props: ['open', 'okButtonProps'], emits: ['ok', 'update:open'],
  template: '<div v-if="open"><slot /><button data-ok type="button" :disabled="okButtonProps.disabled" @click="$emit(\'ok\')" /></div>',
}
const SelectStub = {
  props: ['value', 'options'], emits: ['update:value'],
  template: `<select :value="value ?? ''" @change="$emit('update:value', $event.target.value || null)">
    <option value="" /><option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option></select>`,
}

const cases = [
  { id: 'k1', number: 'ИМ-2026-0170', cargo: 'перчатки', clientId: 'c1' },
  { id: 'k2', number: 'ИМ-2026-0173', cargo: 'запчасти', clientId: 'c2' },
] as unknown as Import40CaseDto[]
const tariffs = [
  { id: 's1', name: 'Оформление ДТ', unit: 'ДТ', price: 45000, isActive: true },
  { id: 's2', name: 'Оформление ДТ', unit: 'ДТ', price: 99999, isActive: true },
] as unknown as SalesServiceItem[]
const clients = [{ value: 'c1', label: 'ТОО «Altyn Med»' }, { value: 'c2', label: 'ТОО «Steppe Agro»' }]

let w: VueWrapper
const mount = (props: Record<string, unknown> = {}) => {
  w = mountWithI18n(CreateBillingDocModal, {
    attachTo: document.body,
    props: { open: true, clients, cases, tariffs, vatRate: 12, preset: null, ...props },
    global: { stubs: { ZModal: ModalStub, ZSelect: SelectStub } },
  })
}
const okDisabled = () => w.get('[data-ok]').attributes('disabled') !== undefined
const caseLabels = () => w.get('[data-create-case]').findAll('option').map((o) => o.text()).filter(Boolean)

beforeEach(() => { api.create.mockResolvedValue({ id: 'new' }) })
afterEach(() => { w?.unmount(); document.body.innerHTML = ''; vi.clearAllMocks() })

describe('CreateBillingDocModal', () => {
  it('preset из ?caseId= — клиент и заявка подставлены; повторное открытие без preset — всё сброшено, включая заявку', async () => {
    mount({ preset: { caseId: 'k1', clientId: 'c1' } })
    await flushPromises()
    expect((w.get('[data-create-client]').element as HTMLSelectElement).value).toBe('c1')
    expect((w.get('[data-create-case]').element as HTMLSelectElement).value).toBe('k1')
    await w.get('[data-create-note]').setValue('заметка')
    await w.setProps({ open: false, preset: null })
    await w.setProps({ open: true })
    await flushPromises()
    expect((w.get('[data-create-client]').element as HTMLSelectElement).value).toBe('')
    expect((w.get('[data-create-case]').element as HTMLSelectElement).value).toBe('')
    expect((w.get('[data-create-note]').element as HTMLInputElement).value).toBe('')
    expect(w.findAll('[data-create-line]')).toHaveLength(1)
  })

  it('заявки — по выбранному клиенту; смена клиента очищает чужую заявку', async () => {
    mount()
    await flushPromises()
    expect(caseLabels()).toEqual(['ИМ-2026-0170 · перчатки', 'ИМ-2026-0173 · запчасти'])
    await w.get('[data-create-client]').setValue('c1')
    expect(caseLabels()).toEqual(['ИМ-2026-0170 · перчатки'])
    await w.get('[data-create-case]').setValue('k1')
    await w.get('[data-create-client]').setValue('c2')
    expect((w.get('[data-create-case]').element as HTMLSelectElement).value).toBe('')
    expect(caseLabels()).toEqual(['ИМ-2026-0173 · запчасти'])
  })

  it('«Создать» недоступна без клиента и строки с названием; своя услуга вводится текстом; очистка не роняет проверку', async () => {
    mount()
    await flushPromises()
    expect(okDisabled()).toBe(true)
    await w.get('[data-create-client]').setValue('c1')
    expect(okDisabled()).toBe(true)
    await w.get('input[data-create-service]').setValue('Своя услуга')
    expect(okDisabled()).toBe(false)
    w.getComponent(ZCombobox).vm.$emit('update:value', '')
    await flushPromises()
    expect(okDisabled()).toBe(true)
  })

  it('тариф из прайса подставляет ед. и цену; одинаковые названия — одна подсказка', async () => {
    mount()
    await flushPromises()
    const combo = w.getComponent(ZCombobox)
    expect((combo.props('options') as { label: string }[]).map((o) => o.label)).toEqual(['Оформление ДТ — 45 000 ₸'])
    combo.vm.$emit('update:value', 'Оформление ДТ')
    combo.vm.$emit('select', 'Оформление ДТ', combo.props('options')[0])
    await flushPromises()
    expect((w.get('input[data-create-unit]').element as HTMLInputElement).value).toBe('ДТ')
    expect(w.findAllComponents(ZNumber)[1].props('value')).toBe(45000)
    expect(w.get('[data-create-total]').text()).toBe('45 000 ₸')
  })

  it('отправка: тело как раньше (dueDateUtc с T00:00:00Z, строки без названия отброшены)', async () => {
    mount()
    await flushPromises()
    await w.get('[data-create-client]').setValue('c1')
    await w.get('[data-create-case]').setValue('k1')
    await w.get('[data-create-kind]').setValue('act')
    w.getComponent(ZDate).vm.$emit('update:value', '2026-10-20')
    await w.get('input[data-create-service]').setValue('  Своя услуга ')
    await w.get('input[data-create-unit]').setValue('шт')
    const nums = () => w.findAllComponents(ZNumber)
    nums()[0].vm.$emit('update:value', 2)
    nums()[1].vm.$emit('update:value', 1500)
    await w.get('[data-create-add]').trigger('click')
    await w.get('[data-create-note]').setValue('за ДТ')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.create).toHaveBeenCalledWith({
      clientId: 'c1', caseId: 'k1', kind: 'act', dueDateUtc: '2026-10-20T00:00:00Z', note: 'за ДТ',
      lines: [{ name: 'Своя услуга', unit: 'шт', quantity: 2, unitPrice: 1500 }],
    })
    expect(api.success).toHaveBeenCalledWith('Документ создан как черновик')
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
    expect(w.emitted('created')).toHaveLength(1)
  })

  it('без срока и заметки — null; пустые кол-во и цена — 1 и 0', async () => {
    mount()
    await flushPromises()
    await w.get('[data-create-client]').setValue('c2')
    await w.get('input[data-create-service]').setValue('Услуга')
    w.findAllComponents(ZNumber)[0].vm.$emit('update:value', null)
    w.findAllComponents(ZNumber)[1].vm.$emit('update:value', null)
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.create).toHaveBeenCalledWith({
      clientId: 'c2', caseId: null, kind: 'invoice', dueDateUtc: null, note: null,
      lines: [{ name: 'Услуга', unit: '', quantity: 1, unitPrice: 0 }],
    })
  })

  it('сбой создания: окно остаётся; не-HTTP ошибка — тост', async () => {
    api.create.mockRejectedValueOnce(new Error('network'))
    mount()
    await flushPromises()
    await w.get('[data-create-client]').setValue('c1')
    await w.get('input[data-create-service]').setValue('Услуга')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.error).toHaveBeenCalledWith('Не удалось сохранить документ')
    expect(w.emitted('update:open')).toBeUndefined()
    expect(w.emitted('created')).toBeUndefined()
  })

  it('подсказка НДС: нет до настроек; 0 — «без НДС»; ставка — «выделяется из суммы»', async () => {
    mount({ vatRate: null })
    await flushPromises()
    expect(w.find('[data-create-vat]').exists()).toBe(false)
    await w.setProps({ vatRate: 0 })
    expect(w.get('[data-create-vat]').text()).toBe('без НДС')
    await w.setProps({ vatRate: 16 })
    expect(w.get('[data-create-vat]').text()).toBe('НДС 16% выделяется из суммы')
  })
})
