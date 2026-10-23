import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import { confirmState } from '@/ui/confirm'

const api = vi.hoisted(() => ({ obligationDefaults: vi.fn(), obligation: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
const dl = vi.hoisted(() => ({ saveBlob: vi.fn() }))
vi.mock('@/api/dtForms', async (orig) => ({ ...(await orig<typeof import('@/api/dtForms')>()), dtFormsApi: api }))
vi.mock('@/ui/message', () => ({ message: toast }))
vi.mock('@/ui/download', () => dl)

import DtObligationModal from '../DtObligationModal.vue'

// «Обязательство (условный выпуск)» (переделано 23.10.2026 по образцу декларантов): без таблицы товаров, поля из
// GET …/obligation/defaults правятся, POST — ровно присланное, файл «Обязательство_{получатель}_{дата}.docx».
const defaults = {
  date: '2026-10-21', number: 'Б/Н', consigneeName: 'ТОО «ТЕСТ»',
  invoices: [{ number: 'INV-1', date: '2026-10-14' }, { number: 'INV-2', date: null }],
  countryFrom: 'Китая', postCode: '57505', postName: 'ТЕСТОВЫЙ ПОСТ', warehouseName: 'ТОО «СВХ ТЕСТ»',
  address: 'РК, г. Астана, ул. Тестовая, 1', signerPosition: 'Директор', signerName: 'ИВАНОВ И.И.',
}

let w: VueWrapper
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
const mountModal = async (props: Record<string, unknown> = {}) => {
  w = mountWithI18n(DtObligationModal, {
    props: { open: true, caseId: 'c1', dtId: 'd1', directorName: 'ПЕТРОВ П.П.', canAddDoc44: true, ...props },
    attachTo: document.body,
  })
  await settle()
}
const q = <T extends Element = HTMLElement>(sel: string) => document.body.querySelector<T>(sel)
const bodyButton = (text: string) => [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined
const type = async (sel: string, value: string) => {
  const el = q<HTMLInputElement | HTMLTextAreaElement>(sel)!
  el.value = value
  el.dispatchEvent(new Event('input'))
  await settle()
}

describe('DtObligationModal', () => {
  it('поля — из значений по умолчанию ДТ; таблицы товаров нет', async () => {
    api.obligationDefaults.mockResolvedValue(defaults)
    await mountModal()
    expect(api.obligationDefaults).toHaveBeenCalledWith('c1', 'd1')
    expect(q('[data-dt-pick-table]')).toBeNull()
    expect(q<HTMLInputElement>('[data-dt-obligation-number]')!.value).toBe('Б/Н')
    expect(q<HTMLInputElement>('[data-dt-obligation-consignee]')!.value).toBe('ТОО «ТЕСТ»')
    expect(document.body.querySelectorAll('[data-dt-obligation-invoice]')).toHaveLength(2)
    expect(q<HTMLInputElement>('[data-dt-obligation-invoice="0"] [data-dt-obligation-invoice-number]')!.value).toBe('INV-1')
    expect(q<HTMLInputElement>('[data-dt-obligation-country]')!.value).toBe('Китая')
    expect(q<HTMLInputElement>('[data-dt-obligation-post-code]')!.value).toBe('57505')
    expect(q<HTMLInputElement>('[data-dt-obligation-post-name]')!.value).toBe('ТЕСТОВЫЙ ПОСТ')
    expect(q<HTMLInputElement>('[data-dt-obligation-warehouse]')!.value).toBe('ТОО «СВХ ТЕСТ»')
    expect(q<HTMLTextAreaElement>('[data-dt-obligation-address]')!.value).toBe('РК, г. Астана, ул. Тестовая, 1')
    expect(q<HTMLInputElement>('[data-dt-obligation-position]')!.value).toBe('Директор')
    expect(q<HTMLInputElement>('[data-dt-obligation-signer]')!.value).toBe('ИВАНОВ И.И.')
  })

  it('правки — в POST ровно как в окне; инвойс добавить/убрать; файл по получателю и дате; строка гр. 44 — событием', async () => {
    api.obligationDefaults.mockResolvedValue(defaults)
    api.obligation.mockResolvedValue({ blob: new Blob(['docx']) })
    await mountModal()
    await type('[data-dt-obligation-number]', ' 15 ')
    await type('[data-dt-obligation-country]', 'Турции')
    await type('[data-dt-obligation-address]', 'РК, г. Алматы, склад 2')
    q<HTMLButtonElement>('[data-dt-obligation-invoice="1"] [data-dt-obligation-invoice-remove]')!.click()
    await settle()
    q<HTMLButtonElement>('[data-dt-obligation-invoice-add]')!.click()
    await settle()
    await type('[data-dt-obligation-invoice="1"] [data-dt-obligation-invoice-number]', 'INV-3')
    // Пустой инвойс не уходит.
    q<HTMLButtonElement>('[data-dt-obligation-invoice-add]')!.click()
    await settle()
    bodyButton('Сформировать')!.click()
    await settle()
    expect(confirmState.open).toBe(false)
    expect(api.obligation).toHaveBeenCalledWith('c1', 'd1', {
      ...defaults,
      number: '15',
      countryFrom: 'Турции',
      address: 'РК, г. Алматы, склад 2',
      invoices: [{ number: 'INV-1', date: '2026-10-14' }, { number: 'INV-3', date: null }],
    })
    expect(dl.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'Обязательство_ТОО_ТЕСТ_21.10.2026.docx')
    expect(w.emitted('doc44')).toEqual([[{ number: '15', date: '2026-10-21' }]])
    expect(w.emitted('update:open')).toEqual([[false]])
  })

  it('пустые Ф.И.О. и адрес — подтверждение «Не заполнены…»; «Отмена» — без запроса', async () => {
    api.obligationDefaults.mockResolvedValue({ ...defaults, signerName: null, address: null })
    api.obligation.mockResolvedValue({ blob: new Blob(['docx']) })
    await mountModal()
    bodyButton('Сформировать')!.click()
    await settle()
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Не заполнены: Ф.И.О., адрес нахождения товара')
    confirmState.resolve(false)
    await settle()
    expect(api.obligation).not.toHaveBeenCalled()
    bodyButton('Сформировать')!.click()
    await settle()
    confirmState.resolve(true)
    await settle()
    expect(api.obligation.mock.calls[0][2]).toMatchObject({ signerName: null, address: null })
  })

  it('значения по умолчанию не загрузились — плашка с «Повторить», поля вручную (дата — сегодня, «Б/Н», руководитель)', async () => {
    api.obligationDefaults.mockRejectedValueOnce(new Error('404')).mockResolvedValueOnce(defaults)
    await mountModal()
    expect(q('[data-dt-obligation-load-failed]')).not.toBeNull()
    expect(q<HTMLInputElement>('[data-dt-obligation-number]')!.value).toBe('Б/Н')
    expect(q<HTMLInputElement>('[data-dt-obligation-signer]')!.value).toBe('ПЕТРОВ П.П.')
    expect(q<HTMLInputElement>('[data-dt-obligation-consignee]')!.value).toBe('')
    q<HTMLButtonElement>('[data-dt-obligation-retry]')!.click()
    await settle()
    expect(q('[data-dt-obligation-load-failed]')).toBeNull()
    expect(q<HTMLInputElement>('[data-dt-obligation-consignee]')!.value).toBe('ТОО «ТЕСТ»')
  })

  it('ответ 400 — текст сервера, окно открыто; ДТ только для просмотра — без строки гр. 44', async () => {
    api.obligationDefaults.mockResolvedValue(defaults)
    api.obligation.mockResolvedValueOnce({ error: 'Адрес — не длиннее 1000 знаков.', code: 'address_too_long' })
    await mountModal({ canAddDoc44: false })
    expect(q('[data-dt-obligation-doc44]')).toBeNull()
    bodyButton('Сформировать')!.click()
    await settle()
    expect(toast.error).toHaveBeenCalledWith('Адрес — не длиннее 1000 знаков.')
    expect(w.emitted('update:open')).toBeUndefined()
    api.obligation.mockResolvedValueOnce({ blob: new Blob(['docx']) })
    bodyButton('Сформировать')!.click()
    await settle()
    expect(w.emitted('doc44')).toBeUndefined()
    expect(w.emitted('update:open')).toEqual([[false]])
  })
})
