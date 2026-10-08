import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { BillingRequisites, BrokerInvoice } from '@/api/billing'

const billing = vi.hoisted(() => ({
  list: vi.fn(),
  requisites: vi.fn(),
  uploadPaymentCheck: vi.fn(),
  downloadPaymentCheck: vi.fn(),
  pdf: vi.fn(),
}))
const msg = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/api/billing', () => ({ billingApi: billing }))
vi.mock('@/ui/message', () => ({ message: msg }))

import ClientInvoicesView from '../ClientInvoicesView.vue'

const inv = (o: Partial<BrokerInvoice>): BrokerInvoice => ({
  id: 'i1', clientId: 'cl', clientName: 'ТОО «Казахмыс Трейд»', caseId: 'c1', caseNumber: 'ИМ-2026-0158',
  kind: 'invoice', status: 1, number: '0214', year: 2026,
  issuedAtUtc: '2026-10-01T06:00:00Z', dueDateUtc: '2099-10-15T00:00:00Z', paidAtUtc: null,
  vatRate: 16, subtotal: 159483, vatAmount: 25517, total: 185000, note: '', createdAtUtc: '2026-10-01T06:00:00Z',
  lines: [], paymentChecks: [],
  ...o,
})
// К оплате: i2 (срок раньше) и i1; оплачен i3; акт a1; черновик клиенту не показывается.
const FIXTURE = [
  inv({}),
  inv({ id: 'i3', number: '0198', status: 2, caseNumber: 'ИМ-2026-0141', paidAtUtc: '2026-09-22T08:00:00Z', total: 240000 }),
  inv({ id: 'a1', kind: 'act', number: '0187', caseNumber: null, dueDateUtc: null, total: 240000 }),
  inv({ id: 'i2', number: '0220', dueDateUtc: '2099-10-05T00:00:00Z', total: 90000 }),
  inv({ id: 'd0', number: '', status: 0 }),
]
const REQ: BillingRequisites = {
  companyName: 'Товарищество с ограниченной ответственностью «AQNIET»', shortName: 'ТОО «AQNIET»',
  bin: '123456789012', bank: 'АО «Халык Банк»', iik: 'KZ12 3456 7890 1234 5678', bik: 'HSBKKZKX', kbe: '17',
}

let w: VueWrapper
let router: Router
const stub = { template: '<div/>' }

const mountAt = async (path: string) => {
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(ClientInvoicesView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const groupTitles = () => w.findAll('[data-invoice-group]').map((h) => h.text())
const cardIds = () => w.findAll('[data-invoice-card]').map((c) => c.attributes('data-invoice-card'))
const card = (id: string) => w.get(`[data-invoice-card="${id}"]`)
const panelTitle = () => w.get('[data-invoice-panel] h2').text()
// formatMoney ставит неразрывные пробелы — в проверках сравниваем с обычными.
const plain = (sel: string) => w.get(sel).text().replace(/\u00a0/g, ' ')

beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/billing', component: stub }, { path: '/:p(.*)*', component: stub }],
  })
  billing.list.mockResolvedValue(FIXTURE)
  billing.requisites.mockResolvedValue(REQ)
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('ClientInvoicesView', () => {
  it('группы «К оплате · N» / «Оплаченные» / «Акты»; по умолчанию выбран ближайший к оплате', async () => {
    await mountAt('/billing')
    expect(billing.list).toHaveBeenCalledWith(undefined, { silent: true })
    expect(w.get('h1').text()).toBe('Счета')
    expect(groupTitles()).toEqual(['К оплате · 2', 'Оплаченные', 'Акты'])
    // Черновик не показывается; «К оплате» — по сроку.
    expect(cardIds()).toEqual(['i2', 'i1', 'i3', 'a1'])
    expect(card('i2').attributes('aria-current')).toBe('true')
    expect(card('i1').attributes('aria-current')).toBeUndefined()

    expect(card('i1').text()).toContain('Счёт № 0214/2026')
    expect(plain('[data-invoice-card="i1"]')).toContain('185 000 ₸')
    expect(card('i1').text()).toContain('ИМ-2026-0158')
    expect(card('i1').get('[data-invoice-state]').text()).toBe('до 15.10')
    expect(card('i3').get('[data-invoice-state]').text()).toBe('Оплачен 22.09')
    expect(card('a1').text()).toContain('Акт № 0187/2026')
    expect(card('a1').text()).toContain('без поставки')

    expect(panelTitle()).toMatch(/^Счёт № 0220\/2026 от \d{2}\.10$/)
    expect(w.get('[data-invoice-tag]').text()).toBe('Ждёт оплаты до 05.10')
    expect(plain('[data-invoice-total]')).toContain('90 000 ₸')
    expect(plain('[data-invoice-total]')).toContain('в т.ч. НДС 16% — 25 517 ₸')
    expect(w.get('[data-invoice-purpose]').text())
      .toMatch(/Оплата по счёту № 0220\/2026 от \d{2}\.10\.2026 за услуги таможенного оформления, в т\.ч\. НДС 16%/)
    expect(w.find('[data-invoice-upload]').exists()).toBe(true)
    expect(w.get('[data-invoice-hint]').text()).toContain('бухгалтер отметит оплату')
    // На телефоне без ?id= — только список: панель скрыта, «назад» не нужна.
    expect(w.get('[data-invoice-panel]').element.parentElement!.className).toContain('max-sm:hidden')
    expect(w.get('[data-invoices-list]').classes()).not.toContain('max-sm:hidden')
  })

  it('?id= выбирает счёт; клик по карточке меняет ?id= без новой записи; «Все счета» — к списку', async () => {
    await mountAt('/billing?id=i3')
    expect(card('i3').attributes('aria-current')).toBe('true')
    expect(panelTitle()).toMatch(/^Счёт № 0198\/2026/)
    expect(w.get('[data-invoice-tag]').text()).toBe('Оплачен 22.09')
    // Оплаченный: без реквизитов и загрузки, только PDF.
    expect(w.find('[data-invoice-requisites]').exists()).toBe(false)
    expect(w.find('[data-invoice-upload]').exists()).toBe(false)
    expect(w.get('[data-invoice-pdf]').text()).toBe('Скачать счёт PDF')
    // Телефон: с ?id= список скрыт, есть «‹ Все счета».
    expect(w.get('[data-invoices-list]').classes()).toContain('max-sm:hidden')

    const replace = vi.spyOn(router, 'replace')
    await card('i1').trigger('click')
    await flushPromises()
    expect(replace).toHaveBeenCalled()
    expect(router.currentRoute.value.query.id).toBe('i1')
    expect(panelTitle()).toMatch(/^Счёт № 0214\/2026/)

    await w.get('[data-invoices-back]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.id).toBeUndefined()
  })

  it('неизвестный ?id= — выбор по умолчанию', async () => {
    await mountAt('/billing?id=nope')
    expect(card('i2').attributes('aria-current')).toBe('true')
    expect(w.find('[data-invoices-back]').exists()).toBe(true)
    expect(w.get('[data-invoices-list]').classes()).not.toContain('max-sm:hidden')
  })

  it('реквизиты: получатель — краткое имя; «Копировать» у ИИК кладёт значение в буфер', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await mountAt('/billing')
    const rows = w.findAll('[data-requisite]').map((r) => r.attributes('data-requisite'))
    expect(rows).toEqual(['recipient', 'bin', 'bank', 'iik', 'bik', 'kbe'])
    expect(w.get('[data-requisite="recipient"] dd').text()).toBe('ТОО «AQNIET»')
    expect(w.get('[data-copy="iik"]').attributes('aria-label')).toBe('Копировать: ИИК')

    await w.get('[data-copy="iik"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('KZ12 3456 7890 1234 5678')
    expect(msg.success).toHaveBeenCalledWith(expect.objectContaining({ content: 'Скопировано' }))
    expect(w.get('[data-copy="iik"]').text()).toBe('Скопировано')

    await w.get('[data-copy="purpose"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenLastCalledWith(expect.stringMatching(/^Оплата по счёту № 0220\/2026/))
  })

  it('нет доступа к буферу — подсказка скопировать вручную', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    await mountAt('/billing')
    await w.get('[data-copy="bin"]').trigger('click')
    await flushPromises()
    expect(msg.warning).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('вручную') }))
  })

  it('загрузка чека: uploadPaymentCheck, чек в списке, «Чек на проверке» на карточке и в теге', async () => {
    const file = new File(['%PDF'], 'check.pdf', { type: 'application/pdf' })
    const check = { id: 'f1', fileName: 'check.pdf', sizeBytes: 4, createdAtUtc: '2026-10-08T09:00:00Z' }
    billing.uploadPaymentCheck.mockResolvedValue({ ...FIXTURE[3], paymentChecks: [check] })
    await mountAt('/billing?id=i2')
    expect(w.find('[data-invoice-checks]').exists()).toBe(false)

    const input = w.get('[data-invoice-panel] input[type="file"]')
    expect(input.attributes('accept')).toBe('.pdf,.jpg,.jpeg,.png')
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()

    expect(billing.uploadPaymentCheck).toHaveBeenCalledWith('i2', file)
    expect(msg.success).toHaveBeenCalledWith('Чек загружен — бухгалтер проверит оплату')
    expect(w.findAll('[data-invoice-check]').map((c) => c.text())).toEqual([expect.stringContaining('check.pdf')])
    expect(card('i2').get('[data-invoice-state]').text()).toBe('Чек на проверке')
    expect(w.get('[data-invoice-tag]').text()).toBe('Чек на проверке')
    expect(w.get('[data-invoice-upload]').text()).toBe('Загрузить ещё чек')
    // Счёт остаётся в «К оплате» до отметки бухгалтера.
    expect(groupTitles()[0]).toBe('К оплате · 2')
  })

  it('чек больше 25 МБ не отправляется', async () => {
    await mountAt('/billing?id=i2')
    const big = new File(['x'], 'big.pdf', { type: 'application/pdf' })
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 })
    const input = w.get('[data-invoice-panel] input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [big], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(billing.uploadPaymentCheck).not.toHaveBeenCalled()
    expect(msg.error).toHaveBeenCalled()
  })

  it('акт — без загрузки чека и реквизитов, только PDF', async () => {
    billing.pdf.mockResolvedValue(new Blob(['%PDF']))
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    await mountAt('/billing?id=a1')
    expect(panelTitle()).toMatch(/^Акт № 0187\/2026/)
    expect(w.get('[data-invoice-panel] p').text()).toBe('Услуги таможенного оформления')
    expect(w.find('[data-invoice-upload]').exists()).toBe(false)
    expect(w.find('[data-invoice-requisites]').exists()).toBe(false)
    expect(w.find('[data-invoice-purpose]').exists()).toBe(false)
    await w.get('[data-invoice-pdf]').trigger('click')
    await flushPromises()
    expect(billing.pdf).toHaveBeenCalledWith('a1')
  })

  it('пустые реквизиты — подсказка уточнить у бухгалтера', async () => {
    billing.requisites.mockResolvedValue({ companyName: '', shortName: '', bin: '', bank: '', iik: '', bik: '', kbe: '' })
    await mountAt('/billing')
    expect(w.find('[data-requisite]').exists()).toBe(false)
    expect(w.get('[data-requisites-empty]').text()).toBe('Реквизиты уточните у бухгалтера AQNIET')
    // Без реквизитов чек всё равно можно приложить.
    expect(w.find('[data-invoice-upload]').exists()).toBe(true)
  })

  it('неполные реквизиты (нет КБе) — та же подсказка, без таблицы с дырами', async () => {
    billing.requisites.mockResolvedValue({
      companyName: 'ТОО «AQNIET»', shortName: '', bin: '123456789012', bank: 'Банк', iik: 'KZ1', bik: 'HSBKKZKX', kbe: '',
    })
    await mountAt('/billing')
    expect(w.find('[data-requisite]').exists()).toBe(false)
    expect(w.get('[data-requisites-empty]').text()).toBe('Реквизиты уточните у бухгалтера AQNIET')
  })

  it('ошибка списка — «Повторить» перезагружает только список', async () => {
    billing.list.mockRejectedValueOnce(new Error('net'))
    await mountAt('/billing')
    expect(w.get('[data-invoices-error]').text()).toContain('Не удалось загрузить счета')
    expect(w.find('[data-invoice-card]').exists()).toBe(false)
    await w.get('[data-invoices-retry]').trigger('click')
    await flushPromises()
    expect(billing.list).toHaveBeenCalledTimes(2)
    expect(billing.requisites).toHaveBeenCalledTimes(1)
    expect(cardIds()).toEqual(['i2', 'i1', 'i3', 'a1'])
  })

  it('ошибка реквизитов — по месту, «Повторить» перезапрашивает реквизиты', async () => {
    billing.requisites.mockRejectedValueOnce(new Error('net'))
    await mountAt('/billing')
    expect(cardIds()).toHaveLength(4)
    expect(w.get('[data-requisites-error]').text()).toContain('Не удалось загрузить реквизиты')
    await w.get('[data-requisites-retry]').trigger('click')
    await flushPromises()
    expect(billing.requisites).toHaveBeenCalledTimes(2)
    expect(w.findAll('[data-requisite]')).toHaveLength(6)
  })

  it('скелетоны во время загрузки; пустой список — «Счетов пока нет»', async () => {
    let resolve!: (v: BrokerInvoice[]) => void
    billing.list.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    await mountAt('/billing')
    expect(w.find('[data-invoices-skeleton]').exists()).toBe(true)
    resolve([inv({ id: 'd0', status: 0 })])
    await flushPromises()
    expect(w.find('[data-invoices-skeleton]').exists()).toBe(false)
    expect(w.get('[data-invoices-empty]').text()).toContain('Счетов пока нет')
    expect(w.get('[data-invoices-empty]').text()).toContain('Счёт появится, когда AQNIET выставит его по поставке')
  })
})
