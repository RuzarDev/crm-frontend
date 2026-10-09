import { describe, expect, it } from 'vitest'
import { mountWithI18n } from '@/test/mountWithI18n'
import DtPaymentsCalcModal from '../DtPaymentsCalcModal.vue'

// Окно расчёта платежей (AntD, до волны 6в): подписи видов платежа — общие с разделом «Платежи» товара (P3).
const pass = { template: '<div><slot /><slot name="description" /></div>' }
const stubs = { 'a-modal': pass, 'a-spin': pass, 'a-tag': pass, 'a-alert': pass, 'a-checkbox': pass, 'a-table': { template: '<div />' } }

describe('DtPaymentsCalcModal: подписи видов платежа', () => {
  it('2050 — «Антидемпинговая пошлина», 4xxx — «Акциз» с кодом, прочие — код', () => {
    const w = mountWithI18n(DtPaymentsCalcModal, {
      props: {
        open: true,
        goods: [],
        result: { goodsRows: [], totalsByTaxMode: { '1010': 6000, '2010': 1, '2050': 2, '4420': 3, '5060': 4, '9999': 5 }, grandTotalB: 6010 },
      },
      global: { stubs },
    })
    expect(w.findAll('.totals-label').map((l) => l.text())).toEqual([
      'Таможенный сбор', 'Пошлина', 'Антидемпинговая пошлина', 'Акциз 4420', 'НДС', '9999',
    ])
  })
})
