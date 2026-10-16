import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { mountWithI18n } from '@/test/mountWithI18n'
import { confirmState } from '@/ui/confirm'

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

  const part = (o: Record<string, unknown>) => ({
    goodsCount: 1, hasPayments: false, factPaymentsCount: 0, hasChildren: false, uploadedToKeden: false, ...o,
  })
  const changeState = (o: Record<string, unknown> = {}) => ({
    sourceDeclarationId: 'd1',
    parts: [
      part({ id: 'e1', role: 'ETT', declarationNumber: 'E-1', updatedAtUtc: '2026-10-16T10:00:00.123456Z' }),
      part({ id: 'v1', role: 'VTO', declarationNumber: '', updatedAtUtc: '2026-10-16T10:00:01.654321Z' }),
    ],
    vtoSortOrders: [1], goodsCarryOver: true, addedGoods: [], returnedSortOrders: [],
    expensesFromSource: false, manualPaymentSortOrders: [], blockedReason: null, ...o,
  })
  const named = rows.map((r, i) => ({ ...r, description: ['Ноутбук', 'Кабель', 'Сумка'][i] }))
  const confirmDialog = async () => {
    await settle()
    expect(confirmState.okText).toBe('Заменить части')
    confirmState.resolve(true)
    await settle()
  }

  // Ревью I1 + I5: в запросе — отметки частей из split-state; в окне — какие товары перейдут ЕТТ↔ВТО.
  it('«Изменить разделение»: что перейдёт ЕТТ↔ВТО, запрос с отметками частей', async () => {
    api.splitSuggestion.mockResolvedValue(named)
    api.splitState.mockResolvedValue(changeState())
    const res = { originalDeclarationId: 'd1', ettDeclarationId: 'e1', vtoDeclarationId: 'v1', paymentsRecalculated: true, replaced: true }
    api.splitDeclaration.mockResolvedValue(res)
    w = mountModal({ mode: 'change' })
    await settle()
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    // Предвыбор — товар 1 (sortOrder 1); отметим ещё товар 3.
    const boxes = dialog.querySelectorAll<HTMLElement>('tbody [role="checkbox"]')
    boxes[1].click()
    await settle()
    expect(dialog.querySelector('[data-dt-split-notes]')!.textContent).toContain('Перейдут из ЕТТ в ВТО: № 4 «Сумка».')
    bodyButton('Изменить разделение')!.click()
    await confirmDialog()
    expect(api.splitDeclaration).toHaveBeenCalledWith('c1', 'd1', {
      vtoGoodSortOrders: [1, 3], replaceExisting: true,
      expectedParts: [{ id: 'e1', updatedAtUtc: '2026-10-16T10:00:00.123456Z' }, { id: 'v1', updatedAtUtc: '2026-10-16T10:00:01.654321Z' }],
    }, { silentConflict: true })
    expect(w.emitted('done')).toEqual([[res]])
  })

  // Ревью I1: части изменили, пока окно было открыто — сообщение, окно перечитано, выбор декларанта остался.
  it('409 «части изменились» — предупреждение и перечитывание окна с прежним выбором', async () => {
    api.splitSuggestion.mockResolvedValue(named)
    api.splitState.mockResolvedValueOnce(changeState()).mockResolvedValueOnce(changeState({
      addedGoods: [{ declarationId: 'v1', role: 'VTO', sortOrder: 1, description: 'РУЧНОЙ', tnvedCode: null }],
    }))
    api.splitDeclaration.mockRejectedValue(Object.assign(new Error('409'), {
      response: { status: 409, data: { title: 'Import40.SplitPartsChanged', detail: 'x' } },
    }))
    w = mountModal({ mode: 'change' })
    await settle()
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    dialog.querySelectorAll<HTMLElement>('tbody [role="checkbox"]')[1].click()
    await settle()
    bodyButton('Изменить разделение')!.click()
    await confirmDialog()
    await settle()
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('Части ЕТТ/ВТО изменились, пока окно было открыто'))
    expect(api.splitState).toHaveBeenCalledTimes(2)
    expect(w.emitted('done')).toBeUndefined()
    const fresh = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(fresh.querySelectorAll('tbody [role="checkbox"][data-state="checked"]')).toHaveLength(2)
    expect(fresh.querySelector('[data-dt-split-notes]')!.textContent).toContain('РУЧНОЙ')
  })

  // Ревью I2: старое двойное разделение — окно объясняет, кнопка выключена, таблицы нет.
  it('несколько частей одной роли — «обратитесь к РОП», изменить нельзя', async () => {
    api.splitSuggestion.mockResolvedValue(named)
    const st = changeState({ blockedReason: 'server text' })
    st.parts.push(part({ id: 'v2', role: 'VTO', declarationNumber: 'V-2', updatedAtUtc: '2026-10-16T10:00:02Z' }))
    api.splitState.mockResolvedValue(st)
    w = mountModal({ mode: 'change' })
    await settle()
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.querySelector('[data-dt-split-blocked]')!.textContent).toContain(
      'По этой ДТ уже несколько частей ЕТТ/ВТО (ЕТТ E-1, ВТО без номера, ВТО V-2) — изменить разделение нельзя, обратитесь к РОП.')
    expect(dialog.querySelector('tbody')).toBeNull()
    expect(bodyButton('Изменить разделение')!.disabled).toBe(true)
    expect(w.emitted('update:open')).toBeUndefined()
  })

  it('прочий запрет (часть выпущена) — причина сервера в окне', async () => {
    api.splitSuggestion.mockResolvedValue(named)
    api.splitState.mockResolvedValue(changeState({ blockedReason: 'Часть ВТО 1 выпущена — менять разделение нельзя' }))
    w = mountModal({ mode: 'change' })
    await settle()
    expect(document.body.querySelector('[data-dt-split-blocked]')!.textContent).toContain('Часть ВТО 1 выпущена')
  })
})

beforeEach(() => { vi.clearAllMocks() })
