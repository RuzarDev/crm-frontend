import { describe, expect, it } from 'vitest'
import { nextTick, reactive, ref } from 'vue'
import type { Import40DeclarationExpense, Import40GoodsItemInput } from '@/types/api'
import { useDtTotals, type DtTotalsFormRef } from '../useDtTotals'

const good = (over: Partial<Import40GoodsItemInput> = {}): Import40GoodsItemInput => ({
  description: null, tnvedCode: null, tnvedDescription: null, countryOfOrigin: null, quantity: null, unit: null,
  unitCode: null, grossWeightKg: null, netWeightKg: null, packagesCount: null, quantityTypeCode: null,
  customsValue: null, currency: null, ...over,
})

const setup = (opts: {
  goods?: Import40GoodsItemInput[]
  form?: DtTotalsFormRef
  rates?: Record<string, { rate: number; date: string }>
  deductions?: string[]
  server?: number | null
  dirty?: boolean
} = {}) => {
  const state = reactive({ goods: opts.goods ?? [] })
  const form = reactive<DtTotalsFormRef>({})
  const rates = ref(opts.rates ?? {})
  const suspended = ref(false)
  const server = ref<number | null>(opts.server ?? null)
  const dirty = ref(opts.dirty ?? false)
  const totals = useDtTotals(() => state.goods, form, rates, suspended, {
    isDeduction: (code) => (opts.deductions ?? []).includes(code ?? ''),
    serverCustomsValue: () => server.value,
    dirty: () => dirty.value,
  })
  // Форма приходит после создания (как загрузка ДТ): первый прогон с пустым списком товаров пишет гр.22 = 0.
  Object.assign(form, opts.form ?? {})
  return { state, form, rates, suspended, server, dirty, totals }
}

describe('useDtTotals — листы гр.3 как в печати (B5)', () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 2],
    [5, 3],
    [7, 3],
    [8, 4],
  ])('%i товаров → всего листов %i (1 + ceil((n−1)/3), DtBlankPdf)', async (n, sheets) => {
    const { state, form } = setup()
    state.goods = Array.from({ length: n }, () => good())
    await nextTick()
    expect(form.totalSheets).toBe(sheets)
    expect(form.sheetNumber).toBe(1)
  })

  it('без товаров листы не трогаются', async () => {
    const { form } = setup({ form: { totalSheets: 5 } })
    await nextTick()
    expect(form.totalSheets).toBe(5)
  })

  it('при загрузке (suspended) устаревшее «всего листов» приводится к печати, гр.22 не трогается', async () => {
    const { state, form, suspended } = setup({ form: { totalSheets: 4, totalInvoiceValue: 999 } })
    suspended.value = true
    state.goods = [good({ customsValue: 10 }), good({ customsValue: 20 }), good({ customsValue: 30 }), good({ customsValue: 40 })]
    await nextTick()
    expect(form.totalSheets).toBe(2)
    expect(form.totalInvoiceValue).toBe(999)
  })
})

describe('useDtTotals — гр.12 (B6)', () => {
  it('предпросмотр = гр.22 × гр.23 + расходы − вычеты (расходы в тенге по курсу их валюты)', async () => {
    const { totals } = setup({
      dirty: true,
      form: {
        totalInvoiceValue: 1000,
        exchangeRate: 500,
        expenses: [
          { expenseTypeCode: '17', amount: 100, currencyCode: 'USD' },
          { expenseTypeCode: '21', amount: 20, currencyCode: 'USD' },
          { expenseTypeCode: '18', amount: 3000, currencyCode: 'KZT' },
        ] as Import40DeclarationExpense[],
      },
      rates: { USD: { rate: 500, date: '2026-10-09' } },
      deductions: ['21'],
    })
    await nextTick()
    // 1000×500 + 100×500 − 20×500 + 3000
    expect(totals.customsValuePreview.value).toBe(543000)
    expect(totals.customsValueKzt.value).toBe(543000)
    expect(totals.customsValueFromServer.value).toBe(false)
  })

  it('без несохранённых правок — серверная гр.12 (как в печати и XML)', async () => {
    const { totals, dirty, server } = setup({
      server: 123456.78,
      form: { totalInvoiceValue: 1000, exchangeRate: 500, expenses: [] },
    })
    expect(totals.customsValueKzt.value).toBe(123456.78)
    expect(totals.customsValueFromServer.value).toBe(true)
    dirty.value = true
    expect(totals.customsValueKzt.value).toBe(500000)
    dirty.value = false
    server.value = null
    expect(totals.customsValueKzt.value).toBe(500000)
  })

  it('без опций — прежний вызов работает (предпросмотр, вычетов нет)', () => {
    const form = reactive<DtTotalsFormRef>({ totalInvoiceValue: 10, exchangeRate: 2, expenses: [{ expenseTypeCode: 'x', amount: 5, currencyCode: 'KZT' }] })
    const totals = useDtTotals(() => [good({ customsValue: 10 })], form, ref({}), ref(false))
    expect(totals.customsValueKzt.value).toBe(25)
  })
})
