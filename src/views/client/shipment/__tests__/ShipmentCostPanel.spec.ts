import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { ShipmentCostDto } from '@/api/shipmentCost'

const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), xlsx: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
const dl = vi.hoisted(() => ({ saveBlob: vi.fn() }))
vi.mock('@/api/shipmentCost', () => ({ shipmentCostApi: api }))
vi.mock('@/ui/message', () => ({ message: msg }))
vi.mock('@/ui/download', () => dl)

import ShipmentCostPanel from '../ShipmentCostPanel.vue'
import { costAvailable } from '../cost'

const nbsp = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ')
const cost = (p: Partial<ShipmentCostDto> = {}): ShipmentCostDto => ({
  caseId: 'c1', caseNumber: 'ИМ-1', cargo: 'ноутбуки', releasedAtUtc: '2026-10-15T08:00:00Z',
  customsKzt: 193300.6,
  declarations: [
    { declarationId: 'd1', number: '50408/151026/0001', source: 'B', feesKzt: 20000, dutyKzt: 50000, vatKzt: 120000, otherKzt: 0, totalKzt: 190000 },
    { declarationId: 'd2', number: '', source: '47', feesKzt: 0, dutyKzt: 1000.4, vatKzt: 2000.2, otherKzt: 0, totalKzt: 3000.6 },
  ],
  brokerKzt: 50000, brokerInvoices: [{ id: 'i1', number: '12', year: 2026, total: 50000, paid: true }],
  svhKzt: null, svhInvoiceNumber: '', certificatesKzt: null, transportKzt: 300000.5, note: '',
  totalKzt: 543301.1, missing: ['svh', 'certificates'], clientUpdatedAtUtc: null, ...p,
})

let w: VueWrapper
const mountIt = (status = 4) => {
  w = mountWithI18n(ShipmentCostPanel, { attachTo: document.body, props: { caseId: 'c1', status, caseNumber: 'ИМ-1', stamp: 'a' } })
}
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('ShipmentCostPanel', () => {
  it('показывается с выпуска по выполненную, у отменённой и до выпуска — нет и без запроса', async () => {
    expect([3, 4, 8, 9].map(costAvailable)).toEqual([false, true, true, false])
    mountIt(3)
    await flushPromises()
    expect(w.find('[data-ship-cost]').exists()).toBe(false)
    expect(api.get).not.toHaveBeenCalled()
  })

  it('разбивка: ТиН по ДТ (гр. В / гр. 47), AQNIET, СВХ, свои расходы, итог и чего не хватает', async () => {
    api.get.mockResolvedValue(cost())
    mountIt()
    await flushPromises()
    expect(api.get).toHaveBeenCalledWith('c1')
    const row = (k: string) => nbsp(w.get(`[data-cost-row="${k}"] [data-cost-value]`).text())
    expect(row('customs')).toBe('193 301 ₸')
    expect(row('broker')).toBe('50 000 ₸')
    expect(row('svh')).toBe('счёт ещё не выставлен')
    expect(row('certificates')).toBe('не указано')
    expect(row('transport')).toBe('300 001 ₸')
    const decls = w.findAll('[data-cost-decl]').map((x) => nbsp(x.text()))
    expect(decls[0]).toContain('ДТ 50408/151026/0001 · уплачено (гр. В)')
    expect(decls[1]).toContain('ДТ — · начислено (гр. 47)')
    expect(nbsp(w.get('[data-cost-total]').text())).toBe('543 301 ₸')
    expect(w.get('[data-cost-missing]').text()).toBe('Итог пока неполный — нет: счёта СВХ, сертификатов.')
  })

  it('«Указать расходы» сохраняет сертификаты, транспорт и пояснение', async () => {
    api.get.mockResolvedValue(cost())
    api.update.mockResolvedValue(cost({ certificatesKzt: 25000, note: 'фрахт', missing: ['svh'] }))
    mountIt()
    await flushPromises()
    await w.get('[data-cost-edit]').trigger('click')
    await flushPromises()
    const cert = document.querySelector('[data-cost-certificates] input, input[data-cost-certificates]') as HTMLInputElement
    cert.value = '25000'
    cert.dispatchEvent(new Event('input'))
    cert.dispatchEvent(new Event('blur'))
    const note = document.querySelector('[data-cost-note-input] textarea, textarea[data-cost-note-input]') as HTMLTextAreaElement
    note.value = '  фрахт  '
    note.dispatchEvent(new Event('input'))
    await flushPromises()
    const ok = [...document.querySelectorAll('[data-cost-modal] button')].find((b) => b.textContent?.includes('Сохранить')) as HTMLButtonElement
    ok.click()
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith('c1', { certificatesKzt: 25000, transportKzt: 300000.5, note: 'фрахт' })
    expect(msg.success).toHaveBeenCalledWith('Расходы сохранены')
    expect(w.get('[data-cost-note]').text()).toBe('Пояснение: фрахт')
  })

  it('Excel по поставке — на языке интерфейса; ошибка загрузки — «Повторить»', async () => {
    api.get.mockRejectedValueOnce(new Error('x')).mockResolvedValue(cost())
    api.xlsx.mockResolvedValue({ blob: new Blob(['x']), fileName: 'cost-1.xlsx' })
    mountIt()
    await flushPromises()
    expect(w.find('[data-cost-error]').exists()).toBe(true)
    await w.get('[data-cost-retry]').trigger('click')
    await flushPromises()
    await w.get('[data-cost-xlsx]').trigger('click')
    await flushPromises()
    expect(api.xlsx).toHaveBeenCalledWith('ru', 'c1')
    expect(dl.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'cost-1.xlsx')
  })
})
