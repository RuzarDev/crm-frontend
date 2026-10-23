import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import { confirmState } from '@/ui/confirm'
import type { Import40GoodsItemInput } from '@/types/api'

const api = vi.hoisted(() => ({ notice130: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
const dl = vi.hoisted(() => ({ saveBlob: vi.fn() }))
vi.mock('@/api/dtForms', async (orig) => ({ ...(await orig<typeof import('@/api/dtForms')>()), dtFormsApi: api }))
vi.mock('@/ui/message', () => ({ message: toast }))
vi.mock('@/ui/download', () => dl)
vi.mock('@/api/references', () => ({ referencesApi: { listOkeiUnits: vi.fn(async () => []) } }))

import DtNotice130Modal from '../DtNotice130Modal.vue'
import { todayIso } from '../dtForms'

// «Уведомление (Решение 130)» (23.10.2026): «Проставить» по отмеченным, тело запроса, подтверждение при пустых полях,
// предупреждение для «л», строки гр. 44 01416 — событием странице.
const SelectStub = {
  props: ['value', 'options'], emits: ['update:value'],
  template: '<div data-select-stub :data-value="value ?? \'\'"><button v-for="o in options" :key="o.value" type="button" :data-option="o.value" @click="$emit(\'update:value\', o.value)">{{ o.label }}</button></div>',
}
const goods = (o: Partial<Import40GoodsItemInput>): Import40GoodsItemInput =>
  ({ description: null, tnvedCode: null, countryOfOrigin: null, quantity: null, unitCode: null, netWeightKg: null, customsValue: null, characteristics: [], ...o }) as Import40GoodsItemInput
const threeGoods = [
  goods({ description: 'Кушетка', tnvedCode: '9402900000', quantity: 1, unitCode: '796' }),
  goods({ description: 'Стол', tnvedCode: '9403200000', quantity: 2, unitCode: '796' }),
  goods({ description: 'Лампа', tnvedCode: '9405110000', quantity: 3, unitCode: '796' }),
]

let w: VueWrapper
beforeEach(() => { localStorage.clear() })
afterEach(() => {
  confirmState.resolve(false)
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})
const settle = async () => {
  await flushPromises()
  await nextTick()
  await flushPromises()
}
const mountModal = (props: Record<string, unknown> = {}) => {
  w = mountWithI18n(DtNotice130Modal, {
    props: {
      open: true, caseId: 'c1', dtId: 'd1', goods: threeGoods, currency: 'USD',
      declarant: { name: 'ТОО «ТЕСТ»', bin: '000000000000' }, directorName: 'ИВАНОВ И.И.', canAddDoc44: true, ...props,
    },
    attachTo: document.body,
    global: { stubs: { ZSelect: SelectStub } },
  })
}
const q = <T extends Element = HTMLElement>(sel: string) => document.body.querySelector<T>(sel)
const bodyButton = (text: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined
const letterOf = (i: number) => q(`[data-dt-notice-subitem="${i}"]`)?.getAttribute('data-value')
const pickLetter = async (i: number, l: string) => {
  q<HTMLButtonElement>(`[data-dt-notice-subitem="${i}"] [data-option="${l}"]`)!.click()
  await settle()
}

describe('DtNotice130Modal', () => {
  it('все товары отмечены; «Проставить» — букву всем отмеченным, неотмеченный без буквы', async () => {
    mountModal()
    await settle()
    expect(document.body.querySelectorAll('tbody [role="checkbox"][data-state="checked"]')).toHaveLength(3)
    expect(q<HTMLInputElement>('[data-dt-notice-declarant]')!.value).toBe('ТОО «ТЕСТ», БИН 000000000000')
    expect(q<HTMLInputElement>('[data-dt-notice-position]')!.value).toBe('Директор')
    expect(q<HTMLInputElement>('[data-dt-notice-signer]')!.value).toBe('ИВАНОВ И.И.')
    document.body.querySelectorAll<HTMLElement>('tbody [role="checkbox"]')[1].click()
    await settle()
    q<HTMLButtonElement>('[data-dt-notice-bulk-letter] [data-option="к"]')!.click()
    await settle()
    q<HTMLButtonElement>('[data-dt-notice-apply]')!.click()
    await settle()
    expect([letterOf(0), letterOf(1), letterOf(2)]).toEqual(['к', '', 'к'])
  })

  it('«Сформировать»: тело запроса, файл с именем декларанта и датой, строки гр. 44 — событием', async () => {
    api.notice130.mockResolvedValue({ blob: new Blob(['docx']) })
    mountModal()
    await settle()
    await pickLetter(0, 'а')
    await pickLetter(1, 'к')
    await pickLetter(2, 'к')
    const number = q<HTMLInputElement>('[data-dt-notice-number]')!
    number.value = 'У-7'
    number.dispatchEvent(new Event('input'))
    await settle()
    // Две буквы — два уведомления в одном файле.
    expect(q('[data-dt-notice-many]')?.textContent).toContain('2 уведомления')
    bodyButton('Сформировать')!.click()
    await settle()
    const today = todayIso()
    expect(api.notice130).toHaveBeenCalledWith('c1', 'd1', {
      number: 'У-7', date: today, signerPosition: 'Директор', signerName: 'ИВАНОВ И.И.',
      items: [{ sortOrder: 0, subitem: 'а' }, { sortOrder: 1, subitem: 'к' }, { sortOrder: 2, subitem: 'к' }],
    })
    const day = today.split('-').reverse().join('.')
    expect(dl.saveBlob).toHaveBeenCalledWith(expect.any(Blob), `Уведомление_130_ТОО_ТЕСТ_${day}.docx`)
    expect(w.emitted('doc44')).toEqual([[[
      { number: 'У-7-1', date: today, indexes: [0] },
      { number: 'У-7-2', date: today, indexes: [1, 2] },
    ]]])
    expect(w.emitted('update:open')).toEqual([[false]])
    expect(toast.success).toHaveBeenCalledWith('Сформировано уведомлений: 2 (в одном файле)')
  })

  it('пустые Ф.И.О. и буква — подтверждение «Не заполнены…»; «Отмена» — без запроса', async () => {
    api.notice130.mockResolvedValue({ blob: new Blob(['docx']) })
    mountModal({ directorName: null })
    await settle()
    bodyButton('Сформировать')!.click()
    await settle()
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Не заполнены: Ф.И.О., подпункт п. 6')
    confirmState.resolve(false)
    await settle()
    expect(api.notice130).not.toHaveBeenCalled()
    bodyButton('Сформировать')!.click()
    await settle()
    confirmState.resolve(true)
    await settle()
    expect(api.notice130).toHaveBeenCalledTimes(1)
    expect(api.notice130.mock.calls[0][2]).toMatchObject({ signerName: null, items: [{ sortOrder: 0, subitem: null }, { sortOrder: 1, subitem: null }, { sortOrder: 2, subitem: null }] })
  })

  it('«л» у товара с количеством больше 1 — предупреждение; что приложить — по буквам', async () => {
    mountModal()
    await settle()
    expect(q('[data-dt-notice-single]')).toBeNull()
    await pickLetter(0, 'л')
    expect(q('[data-dt-notice-single]')).toBeNull()
    await pickLetter(1, 'л')
    expect(q('[data-dt-notice-single]')?.textContent).toContain('товары № 2')
    await pickLetter(2, 'а')
    expect(q('[data-dt-notice-attach]')?.textContent).toContain('гр. 44: 01410')
  })

  it('ответ 400 — текст сервера, окно не закрывается, файла нет', async () => {
    api.notice130.mockResolvedValue({ error: 'Товара 4 нет в этой ДТ — обновите страницу.', code: 'item_unknown' })
    mountModal()
    await settle()
    for (const i of [0, 1, 2]) await pickLetter(i, 'а')
    bodyButton('Сформировать')!.click()
    await settle()
    expect(toast.error).toHaveBeenCalledWith('Товара 4 нет в этой ДТ — обновите страницу.')
    expect(dl.saveBlob).not.toHaveBeenCalled()
    expect(w.emitted('update:open')).toBeUndefined()
  })

  it('ДТ только для просмотра — без галочки гр. 44 и без события', async () => {
    api.notice130.mockResolvedValue({ blob: new Blob(['docx']) })
    mountModal({ canAddDoc44: false })
    await settle()
    expect(q('[data-dt-notice-doc44]')).toBeNull()
    for (const i of [0, 1, 2]) await pickLetter(i, 'а')
    bodyButton('Сформировать')!.click()
    await settle()
    expect(api.notice130).toHaveBeenCalledTimes(1)
    expect(w.emitted('doc44')).toBeUndefined()
  })
})
