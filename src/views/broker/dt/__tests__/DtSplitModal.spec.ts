import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'

const api = vi.hoisted(() => ({
  splitSuggestion: vi.fn(), splitState: vi.fn(), splitDeclaration: vi.fn(),
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40', async (orig) => ({ ...(await orig<typeof import('@/api/import40')>()), import40Api: api }))
vi.mock('@/ui/message', () => ({ message: toast }))

import DtSplitModal from '../DtSplitModal.vue'

let w: VueWrapper
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})
const settle = async () => {
  await flushPromises()
  await nextTick()
  await flushPromises()
}
const bodyButton = (text: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined

describe('DtSplitModal', () => {
  const rows = [
    { sortOrder: 1, tnvedCode: '8471300000', vtoStatus: 'Изъятие ВТО', isVtoCandidate: true, ettRate: '10%', vtoRate: '0%' },
    { sortOrder: 2, tnvedCode: '8473302008', vtoStatus: null, isVtoCandidate: false },
    { sortOrder: 3, tnvedCode: '4202121900', vtoStatus: 'Изъятие ВТО', isVtoCandidate: true, ettRate: '12%', vtoRate: '5%' },
  ]
  const mountModal = (props: Record<string, unknown> = {}) => mountWithI18n(DtSplitModal, {
    props: { open: true, caseId: 'c1', dtId: 'd1', goodsCount: 3, save: vi.fn(async () => true), ...props },
    attachTo: document.body,
  })

  it('только кандидаты ВТО, по умолчанию отмечены; «Разделить» — сохранить и разделить', async () => {
    api.splitSuggestion.mockResolvedValue(rows)
    const res = { originalDeclarationId: 'd1', ettDeclarationId: 'e1', vtoDeclarationId: 'v1', paymentsRecalculated: true }
    api.splitDeclaration.mockResolvedValue(res)
    const save = vi.fn(async () => true)
    w = mountModal({ save })
    await settle()
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.textContent).toContain('8471300000')
    expect(dialog.textContent).toContain('4202121900')
    expect(dialog.textContent).not.toContain('8473302008')
    const checked = dialog.querySelectorAll('tbody [role="checkbox"][data-state="checked"]')
    expect(checked).toHaveLength(2)
    // Отмечены 2 из 3 товаров — обычное разделение, не «одна ДТ ВТО».
    expect(dialog.querySelector('[data-dt-split-vto-only]')).toBeNull()
    bodyButton('Разделить')!.click()
    await settle()
    expect(save).toHaveBeenCalledTimes(1)
    expect(api.splitDeclaration).toHaveBeenCalledWith('c1', 'd1', { vtoGoodSortOrders: [1, 3] })
    expect(w.emitted('done')).toEqual([[res]])
    expect(w.emitted('update:open')).toEqual([[false]])
  })

  it('отмечены все товары ДТ — «Создать ДТ ВТО» и пояснение', async () => {
    api.splitSuggestion.mockResolvedValue([rows[0]])
    w = mountModal({ goodsCount: 1 })
    await settle()
    expect(document.body.querySelector('[data-dt-split-vto-only]')).not.toBeNull()
    expect(bodyButton('Создать ДТ ВТО')).toBeDefined()
  })

  it('кандидатов нет — сообщение и окно закрывается', async () => {
    api.splitSuggestion.mockResolvedValue([rows[1]])
    w = mountModal()
    await settle()
    expect(toast.info).toHaveBeenCalledWith('Нет товаров, попадающих под изъятия ВТО — разделять нечего')
    expect(w.emitted('update:open')).toEqual([[false]])
  })

  it('сохранение не прошло — не разделяем', async () => {
    api.splitSuggestion.mockResolvedValue(rows)
    w = mountModal({ save: vi.fn(async () => false) })
    await settle()
    bodyButton('Разделить')!.click()
    await settle()
    expect(api.splitDeclaration).not.toHaveBeenCalled()
  })

  it('«Изменить разделение»: предвыбор — текущая ВТО (и не-кандидат в ней), тот же выбор — кнопка выключена', async () => {
    api.splitSuggestion.mockResolvedValue(rows)
    api.splitState.mockResolvedValue({
      sourceDeclarationId: 'd1', parts: [], vtoSortOrders: [2], goodsCarryOver: true, addedGoods: [], returnedSortOrders: [],
      expensesFromSource: false, manualPaymentSortOrders: [], blockedReason: null,
    })
    w = mountModal({ mode: 'change' })
    await settle()
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.textContent).toContain('Изменить разделение ЕТТ/ВТО')
    expect(dialog.textContent).toContain('8473302008') // не кандидат, но сейчас в ВТО
    expect(dialog.querySelectorAll('tbody [role="checkbox"][data-state="checked"]')).toHaveLength(1)
    expect(dialog.querySelector('[data-dt-split-same]')).not.toBeNull()
    expect(bodyButton('Изменить разделение')!.disabled).toBe(true)
  })
})

beforeEach(() => { vi.clearAllMocks() })
