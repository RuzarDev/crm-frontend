import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import type { Import40FactPayment } from '@/types/api'
import { mountWithI18n } from '@/test/mountWithI18n'

vi.mock('@/stores/classifiers', () => ({
  useClassifiersStore: () => ({
    cache: {},
    options: (code: string) => (code === 'tax-modes'
      ? [{ value: '1010', label: '1010 — сбор' }, { value: '5060', label: '5060 — НДС' }]
      : [{ value: 'БН', label: 'БН — безналичный' }]),
  }),
}))

import { emptyDtForm, type DtFormState } from '../../dtPayload'
import FactPaymentsTable from '../FactPaymentsTable.vue'

const fact = (code: string, amount: number, o: Partial<Import40FactPayment> = {}): Import40FactPayment => ({
  taxModeCode: code, amount, exchangeRate: 1, paymentDocDate: '2026-10-09', payerTaxpayerId: '201140012345', paymentDate: '2026-10-10', paymentMethodCode: 'БН', ...o,
})

let w: VueWrapper | null = null
afterEach(() => {
  w?.unmount()
  w = null
  document.body.innerHTML = ''
})

function setup(rows: Import40FactPayment[], readonly = false) {
  const form = reactive(emptyDtForm()) as DtFormState
  form.factPayments = rows
  w = mountWithI18n(FactPaymentsTable, { props: { form, readonly }, attachTo: document.body })
  return { form, w: w as VueWrapper }
}
const row = (wr: VueWrapper, i: number) => wr.findAll('[data-fact-row]')[i]
const typeIn = async (el: VueWrapper['element'] | Element, value: string) => {
  const input = el as HTMLInputElement
  input.focus()
  input.value = value
  input.dispatchEvent(new Event('input'))
  input.dispatchEvent(new Event('blur'))
  await nextTick()
}

describe('FactPaymentsTable', () => {
  it('строки — прямо form.factPayments: правка суммы, курса и плательщика пишет в ту же строку формы; даты и способ видны', async () => {
    const { form, w } = setup([fact('1010', 20000), fact('5060', 3348011, { exchangeRate: 1.5 })])
    const first = form.factPayments[0]
    expect(w.findAll('[data-fact-row]').map((r) => r.attributes('data-fact-row'))).toEqual(['1010', '5060'])
    expect((row(w, 1).get('input[data-fact="rate"]').element as HTMLInputElement).value).toBe('1,5')
    expect(row(w, 0).get('[data-fact="docDate"]').html()).toContain('09.10.2026')
    expect(row(w, 0).get('[data-fact="payDate"]').html()).toContain('10.10.2026')
    await typeIn(row(w, 0).get('input[data-fact="amount"]').element, '21000')
    await typeIn(row(w, 0).get('input[data-fact="rate"]').element, '2')
    await typeIn(row(w, 0).get('input[data-fact="payer"]').element, ' 990140000001 ')
    expect(form.factPayments[0]).toBe(first)
    expect(form.factPayments[0]).toMatchObject({ amount: 21000, exchangeRate: 2, payerTaxpayerId: '990140000001' })
  })

  it('«Добавить» — строка с курсом 1 и «БН»; удалить — именно эту строку', async () => {
    const { form, w } = setup([fact('1010', 1), fact('5060', 2)])
    await w.get('[data-fact-add]').trigger('click')
    expect(form.factPayments).toHaveLength(3)
    expect(form.factPayments[2]).toEqual({ taxModeCode: null, amount: null, exchangeRate: 1, paymentDocDate: null, payerTaxpayerId: null, paymentDate: null, paymentMethodCode: 'БН' })
    await row(w, 0).get('[data-fact-remove]').trigger('click')
    expect(form.factPayments.map((p) => p.taxModeCode)).toEqual(['5060', null])
    expect(w.findAll('[data-fact-row]')).toHaveLength(2)
  })

  it('«До подачи» гр. В: графа — строки; строк нет — весь блок', async () => {
    const { form, w } = setup([])
    expect(w.get('[data-dt-fact-payments]').attributes('data-graph')).toBe('В')
    expect(w.get('[data-fact-empty]').text()).toContain('Платежей нет')
    form.factPayments = [fact('1010', 1)]
    await nextTick()
    expect(w.get('[data-dt-fact-payments]').attributes('data-graph')).toBeUndefined()
    expect(w.get('[data-fact-rows]').attributes('data-graph')).toBe('В')
  })

  it('просмотр: поля недоступны, без «Добавить» и удаления', () => {
    const { w } = setup([fact('1010', 1)], true)
    expect(w.find('[data-fact-add]').exists()).toBe(false)
    expect(w.find('[data-fact-remove]').exists()).toBe(false)
    expect(w.get('input[data-fact="amount"]').attributes('disabled')).toBeDefined()
    expect(w.get('input[data-fact="payer"]').attributes('disabled')).toBeDefined()
  })
})

describe('FactPaymentsTable: вид не из справочника', () => {
  it('остаётся и показывается как есть (с пометкой), правка строки его не сбрасывает', async () => {
    const { form, w } = setup([fact('9999', 5)])
    expect((w.get('input[data-fact="mode"]').element as HTMLInputElement).value).toBe('9999')
    expect(w.get('[data-fact-mode-unknown]').text()).toBe('9999 — нет в справочнике видов платежа, оставлен как есть')
    await typeIn(row(w, 0).get('input[data-fact="amount"]').element, '6')
    expect(form.factPayments[0]).toMatchObject({ taxModeCode: '9999', amount: 6 })
    expect(w.find('[data-fact-row="1010"] [data-fact-mode-unknown]').exists()).toBe(false)
  })
})
