import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { Import40CaseDto, Import40CaseInvoiceDto, Import40FileDto } from '@/api/import40'
import { formatMoney } from '@/ui/number'
import { caseDto, declaration, fileDto } from './caseFixture'

const api = vi.hoisted(() => ({
  get: vi.fn(), listFiles: vi.fn(), listBrokerInvoices: vi.fn(), uploadFile: vi.fn(), action: vi.fn(),
  downloadFile: vi.fn(), blankPdf: vi.fn(), downloadAllDocuments: vi.fn(),
}))
const billing = vi.hoisted(() => ({ pdf: vi.fn() }))
const refs = vi.hoisted(() => ({ listCountries: vi.fn() }))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))
vi.mock('@/api/billing', () => ({ billingApi: billing }))
vi.mock('@/api/references', () => ({ referencesApi: refs }))
vi.mock('@/ui/message', () => ({ message: msg }))

import ClientShipmentView from '../ClientShipmentView.vue'

let w: VueWrapper
let router: Router
const stub = { template: '<div/>' }

// Состояние «сервера»: карточка перечитывает заявку и файлы после каждого действия.
let server: { kase: Import40CaseDto; files: Import40FileDto[]; invoices: Import40CaseInvoiceDto[] }

const mountCard = async (kase: Partial<Import40CaseDto>, files: Import40FileDto[] = [], invoices: Import40CaseInvoiceDto[] = []) => {
  server = { kase: caseDto(kase), files, invoices }
  await router.push('/import-40/c1')
  await router.isReady()
  w = mountWithI18n(ClientShipmentView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}

const pickFile = async (selector: string, file: File) => {
  const input = w.get(`${selector} input[type="file"]`)
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/import-40', component: stub },
      { path: '/import-40/new/:id', component: stub },
      { path: '/import-40/:id', component: stub },
      { path: '/billing', component: stub },
    ],
  })
  api.get.mockImplementation(async () => server.kase)
  api.listFiles.mockImplementation(async () => server.files)
  api.listBrokerInvoices.mockImplementation(async () => server.invoices)
  api.action.mockImplementation(async () => server.kase)
  refs.listCountries.mockResolvedValue([{ id: 'r1', code: '276', name: 'Германия', alpha2: 'DE', isActive: true }])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('ClientShipmentView', () => {
  it('шапка: груз, тег, номер · страна · пост · дата создания', async () => {
    await mountCard({ status: 2, createdAtUtc: '2026-09-24T09:00:00' }, [fileDto()])
    expect(api.get).toHaveBeenCalledWith('c1', { silent: true })
    expect(w.get('h1').text()).toBe('Серверное оборудование')
    expect(w.get('[data-ship-tag]').text()).toBe('Оформляем')
    expect(w.get('[data-ship-meta]').text()).toBe('ИМ-2026-0166 · Германия · пост «Нур-Жолы» · создана 24.09')
    expect(w.find('[data-ship-zip]').exists()).toBe(true)
  })

  it('без файлов кнопки «Все файлы (.zip)» нет', async () => {
    await mountCard({ status: 2 })
    expect(w.find('[data-ship-zip]').exists()).toBe(false)
  })

  it('счёт СВХ без чека — панель оплаты с суммой и номером; чек уходит в payment-check, затем «Чек загружен»', async () => {
    await mountCard(
      { status: 6, svhInvoiceAmount: 312400, svhInvoiceNumber: '1187', svhInvoiceDate: '2026-10-07' },
      [fileDto({ id: 's1', section: 'svh-invoice', originalFileName: 'svh.pdf', uploadedByBusinessRole: 'kpp' })],
    )
    const panel = w.get('[data-ask="paySvh"]')
    expect(panel.text()).toContain('Оплатите склад временного хранения')
    expect(panel.get('[data-pay-text]').text()).toContain('Счёт СВХ № 1187 от 07.10')
    expect(panel.text()).toContain(formatMoney(312400))
    expect(panel.find('[data-pay-download]').exists()).toBe(true)

    const check = new File(['%PDF'], 'check.pdf', { type: 'application/pdf' })
    api.uploadFile.mockImplementation(async (_id: string, section: string) => {
      server.files = [...server.files, fileDto({ id: 'p1', section: section as Import40FileDto['section'], originalFileName: 'check.pdf' })]
      return server.files.at(-1)
    })
    await pickFile('[data-ask="paySvh"]', check)

    expect(api.uploadFile).toHaveBeenCalledWith('c1', 'payment-check', check, undefined)
    expect(w.find('[data-ask="paySvh"]').exists()).toBe(false)
    expect(w.get('[data-notice="check"]').text()).toContain('Чек загружен — проверяем оплату')
    expect(w.get('[data-ship-tag]').text()).toBe('Чек на проверке')
  })

  it('проблема — пустой ответ не уходит; текст уходит в client-reply, тост и перечитывание', async () => {
    await mountCard({ status: 3, isProblem: true, problemClientMessage: 'Нужен сертификат соответствия' })
    const panel = w.get('[data-ask="problem"]')
    expect(panel.get('[data-problem-text]').text()).toBe('Нужен сертификат соответствия')

    const send = w.get('[data-problem-send]')
    expect(send.attributes('disabled')).toBeDefined()
    await w.get('[data-problem-reply]').setValue('   ')
    await send.trigger('click')
    expect(api.action).not.toHaveBeenCalled()

    await w.get('[data-problem-reply]').setValue('Сертификат приложили')
    expect(w.get('[data-problem-send]').attributes('disabled')).toBeUndefined()
    const loadsBefore = api.get.mock.calls.length
    await w.get('[data-problem-send]').trigger('click')
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'client-reply', 'Сертификат приложили')
    expect(msg.success).toHaveBeenCalledWith('Ответ отправлен')
    expect(api.get.mock.calls.length).toBe(loadsBefore + 1)
    expect((w.get('[data-problem-reply]').element as HTMLTextAreaElement).value).toBe('')
  })

  it('проблема — «Приложить документ» грузит в documents с видом other', async () => {
    await mountCard({ status: 3, isProblem: true, problemClientMessage: 'Нужен сертификат' })
    const doc = new File(['x'], 'cert.pdf', { type: 'application/pdf' })
    api.uploadFile.mockResolvedValue(fileDto({ id: 'n1' }))
    await pickFile('[data-ask="problem"]', doc)
    expect(api.uploadFile).toHaveBeenCalledWith('c1', 'documents', doc, 'other')
  })

  it('черновик — «Продолжить оформление» ведёт в мастер /import-40/new/{id}', async () => {
    await mountCard({ status: 0 })
    const link = w.get('[data-draft-continue]')
    expect(link.attributes('href')).toBe('/import-40/new/c1')
    await link.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/import-40/new/c1')
  })

  it('черновик — «Отменить черновик» требует причину и шлёт cancel', async () => {
    await mountCard({ status: 0 })
    await w.get('[data-draft-cancel]').trigger('click')
    await flushPromises()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).not.toBeNull()
    const ok = [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Отменить черновик') as HTMLButtonElement
    expect(ok.disabled).toBe(true)
    const reason = dialog.querySelector('[data-cancel-reason]') as HTMLTextAreaElement
    reason.value = 'Передумали'
    reason.dispatchEvent(new Event('input'))
    await flushPromises()
    expect(ok.disabled).toBe(false)
    ok.click()
    await flushPromises()
    expect(api.action).toHaveBeenCalledWith('c1', 'cancel', 'Передумали')
    expect(msg.success).toHaveBeenCalledWith('Черновик отменён')
  })

  it('возврат на доработку — причина в панели', async () => {
    await mountCard({ status: 0, returnReason: 'Нет инвойса' })
    const panel = w.get('[data-ask="returned"]')
    expect(panel.text()).toContain('Вернули на доработку')
    expect(panel.text()).toContain('Нет инвойса')
  })

  it('склад оплачен, счёт AQNIET выставлен — плашка со ссылкой на «Счета» и строка счёта', async () => {
    const inv: Import40CaseInvoiceDto = { id: 'i1', kind: 'invoice', status: 1, number: '42', year: 2026, total: 150000, issuedAtUtc: null, paidAtUtc: null }
    await mountCard({ status: 7 }, [], [inv])
    expect(w.get('[data-notice="paid"]').text()).toContain('Склад оплачен')
    expect(w.get('[data-paid-link]').attributes('href')).toBe('/billing')
    const row = w.get('[data-service-row]')
    expect(row.text()).toContain('Счёт AQNIET № 42/2026')
    expect(row.text()).toContain('Выставлен')
  })

  it('нет счетов — текст «Счёт выставим после оплаты склада»', async () => {
    await mountCard({ status: 4 })
    expect(w.get('[data-services-empty]').text()).toContain('Счёт выставим после оплаты склада')
    expect(w.find('[data-notice]').exists()).toBe(false)
  })

  it('таймлайн: шаг 3 текущий — по data-state; документы: бланк ДТ после подачи', async () => {
    await mountCard({ status: 3, declarations: [declaration({ id: 'd1' }), declaration({ id: 'd0', declarationNumber: 'OLD', isSplitReplaced: true })] }, [fileDto()])
    expect(w.findAll('[data-ship-timeline] li').map((li) => li.attributes('data-state')))
      .toEqual(['done', 'done', 'current', 'todo', 'todo', 'todo'])
    expect(w.findAll('[data-ship-timeline] li')[2].get('[data-step-note]').text()).toBe('50612/021025/0012345')
    const us = w.findAll('[data-doc-row="us"]')
    expect(us).toHaveLength(1)
    expect(us[0].text()).toContain('50612/021025/0012345')
  })

  it('декларант назначен — «Ваш декларант — …»; история свёрнута со счётчиком', async () => {
    await mountCard({
      status: 2, assignedDeclarantName: 'Айгерим К.',
      logs: [
        { id: 'l1', createdAtUtc: '2026-09-24T09:00:00', text: 'Заявка отправлена', changedByBusinessRole: 'client', changedByName: 'Вы' },
        { id: 'l2', createdAtUtc: '2026-09-27T14:05:00', text: 'Граница пройдена', changedByBusinessRole: 'kpp', changedByName: null },
      ],
    })
    expect(w.get('[data-ship-declarant]').text()).toBe('Ваш декларант — Айгерим К.')
    expect(w.get('[data-ship-history] summary').text()).toBe('История · событий: 2')
    const rows = w.findAll('[data-history-row]').map((r) => r.text())
    expect(rows[0]).toContain('24.09 09:00')
    expect(rows[0]).toContain('Вы')
    expect(rows[1]).toContain('AQNIET')
  })

  it('404 — «Поставка не найдена» и ссылка на список', async () => {
    api.get.mockRejectedValueOnce({ response: { status: 404 } })
    await mountCard({})
    const box = w.get('[data-ship-not-found]')
    expect(box.text()).toContain('Поставка не найдена')
    expect(box.get('a').attributes('href')).toBe('/import-40')
    expect(api.listFiles).not.toHaveBeenCalled()
  })

  it('ошибка сети — «Повторить» загружает снова', async () => {
    api.get.mockRejectedValueOnce(new Error('network'))
    await mountCard({ status: 2 })
    expect(w.find('[data-ship-error]').exists()).toBe(true)
    await w.get('[data-ship-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-ship-error]').exists()).toBe(false)
    expect(w.get('h1').text()).toBe('Серверное оборудование')
  })
})
