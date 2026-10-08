import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { BrokerInvoice } from '@/api/billing'

const api = vi.hoisted(() => ({
  list: vi.fn(), issue: vi.fn(), markPaid: vi.fn(), remind: vi.fn(), cancel: vi.fn(), remove: vi.fn(), pdf: vi.fn(),
  downloadPaymentCheck: vi.fn(), organization: vi.fn(), listClients: vi.fn(), listCases: vi.fn(), listServices: vi.fn(),
  exportXlsx: vi.fn(), saveBlob: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/billing', () => ({
  billingApi: {
    list: api.list, issue: api.issue, markPaid: api.markPaid, remind: api.remind, cancel: api.cancel, remove: api.remove,
    pdf: api.pdf, downloadPaymentCheck: api.downloadPaymentCheck, organization: api.organization,
  },
}))
vi.mock('@/api/import40', () => ({ import40Api: { listClients: api.listClients, list: api.listCases } }))
vi.mock('@/api/sales', () => ({ salesApi: { listServices: api.listServices } }))
vi.mock('@/ui/message', () => ({ message: api.toast }))
vi.mock('@/ui/download', () => ({ saveBlob: api.saveBlob }))
vi.mock('@/views/broker/list', async (orig) => ({ ...(await orig<typeof import('@/views/broker/list')>()), exportXlsx: api.exportXlsx }))

import BillingDocsView from '../BillingDocsView.vue'
import CreateBillingDocModal from '../CreateBillingDocModal.vue'
import RowActions from '@/components/broker/RowActions.vue'
import { useAuthStore } from '@/stores/auth'
import { confirmState } from '@/ui/confirm'

const check = { id: 'f1', fileName: 'chek-07-10.pdf', sizeBytes: 10, createdAtUtc: '2026-10-07T05:00:00Z' }
const inv = (o: Partial<BrokerInvoice>): BrokerInvoice => ({
  id: 'i', clientId: 'c1', clientName: 'ТОО «Altyn Med»', caseId: null, caseNumber: null, kind: 'invoice', status: 1,
  number: '0214', year: 2026, issuedAtUtc: '2026-10-06T05:00:00Z', dueDateUtc: null, paidAtUtc: null,
  vatRate: 12, subtotal: 0, vatAmount: 10286, total: 96000, note: '', createdAtUtc: '2026-10-05T05:00:00Z', lines: [], paymentChecks: [],
  ...o,
})
const ROWS: BrokerInvoice[] = [
  inv({ id: 'a', caseId: 'k1', caseNumber: 'ИМ-2026-0170', paymentChecks: [check] }),
  inv({ id: 'b', number: '0213', clientId: 'c2', clientName: 'ТОО «Steppe Agro»', caseId: 'k2', caseNumber: 'ИМ-2026-0173', total: 72000, vatAmount: 7714, dueDateUtc: '2020-01-01T00:00:00Z' }),
  inv({ id: 'c', status: 0, number: '', issuedAtUtc: null, clientName: 'ТОО «Алатау Строй»', total: 118500, vatAmount: 12696 }),
  inv({ id: 'd', kind: 'act', status: 2, number: '0098', paidAtUtc: '2026-09-27T05:00:00Z', total: 86400, vatAmount: 9257, paymentChecks: [check] }),
  inv({ id: 'e', status: 3, number: '0205', vatRate: 0, vatAmount: 0, clientName: 'ИП «Елубаев»', total: 30000 }),
]
const CASES = [
  { id: 'k1', number: 'ИМ-2026-0170', cargo: 'перчатки', clientId: 'c1' },
  { id: 'k9', number: 'ИМ-2026-0199', cargo: 'ткань', clientId: 'c2' },
]

let w: VueWrapper
let router: Router
const as = (role: string, perms: string[]) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
}
const mountView = async () => {
  w = mountWithI18n(BillingDocsView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
}
const has = (sel: string) => w.find(sel).exists()
const docs = () => w.findAll('[data-billing-doc]').map((d) => d.text())
const actionsOf = (i: number) => w.findAllComponents(RowActions)[i]
const menuKeys = (i: number) => (actionsOf(i).props('items') as { key: string }[]).map((x) => x.key)
const primaryKey = (i: number) => (actionsOf(i).props('primary') as { key: string } | null)?.key ?? null
const nb = (s: string) => s.replace(/ /g, ' ')

beforeEach(async () => {
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/billing')
  api.list.mockResolvedValue(ROWS)
  api.listClients.mockResolvedValue([{ id: 'c1', username: 'altyn', companyName: 'ТОО «Altyn Med»' }, { id: 'c2', username: 'steppe', companyName: '' }])
  api.listCases.mockResolvedValue(CASES)
  api.listServices.mockResolvedValue([{ id: 's1', name: 'Оформление ДТ', unit: 'ДТ', price: 45000, isActive: true }])
  api.organization.mockResolvedValue({ vatPayer: true, vatRate: 12 })
  api.issue.mockResolvedValue({})
  api.markPaid.mockResolvedValue({})
  api.cancel.mockResolvedValue({})
  api.remove.mockResolvedValue(undefined)
  api.remind.mockResolvedValue({ ok: true, emailSent: true, to: 'a@b.kz' })
  api.pdf.mockResolvedValue(new Blob(['%PDF']))
  api.downloadPaymentCheck.mockResolvedValue(new Blob(['x']))
  api.exportXlsx.mockResolvedValue(undefined)
  as('accountant', ['finance.read', 'finance.write'])
})
afterEach(() => {
  confirmState.resolve(false)
  w?.unmount()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('«Счета и акты» (сотрудник)', () => {
  it('один запрос списка (silent); заголовок, показатели — суммы по счетам, акты не входят', async () => {
    await mountView()
    expect(api.list).toHaveBeenCalledWith(undefined, { silent: true })
    expect(w.get('h1').text()).toBe('Счета и акты')
    expect(w.get('[data-billing-count]').text()).toBe('5')
    expect(w.get('[data-billing-new]').classes()).toEqual(expect.arrayContaining(['max-sm:h-11', 'max-sm:flex-1']))
    const cells = w.findAll('[data-stat-cell]')
    const parts = (i: number) => [...cells[i].element.querySelectorAll(':scope > div')].map((d) => nb(d.textContent ?? '').trim())
    expect(parts(0)).toEqual(['Выставлено', '168 000 ₸', '2 счёта'])
    expect(parts(1)).toEqual(['Оплачено', '0 ₸', '0 счетов'])
    expect(parts(2)).toEqual(['Ждёт оплаты', '168 000 ₸', '2 счёта · 1 просрочен'])
    expect(parts(3)).toEqual(['Черновики', '1', 'не выставлены'])
  })

  it('колонки и ячейки: документ, клиент, статус, сумма с НДС, даты, чек', async () => {
    await mountView()
    expect(w.findAll('thead th').map((th) => th.text())).toEqual(['Документ', 'Клиент', 'Статус', 'Сумма', 'Даты', 'Чек клиента', ''])
    expect(docs()).toEqual(['Счёт № 0214/2026', 'Счёт № 0213/2026', 'Черновик', 'Акт № 0098/2026', 'Счёт № 0205/2026'])
    const r = w.findAll('tbody tr')
    expect(r[0].get('[data-billing-case]').text()).toBe('ИМ-2026-0170')
    expect(r[2].get('[data-billing-case]').text()).toBe('без заявки')
    expect(w.findAll('[data-billing-status-tag]').map((x) => x.text())).toEqual(['Выставлен', 'Выставлен', 'Черновик', 'Оплачен', 'Аннулирован'])
    expect(nb(r[0].get('[data-billing-total]').text())).toBe('96 000 ₸')
    expect(nb(r[0].get('[data-billing-vat]').text())).toBe('НДС 12%: 10 286 ₸')
    expect(r[4].get('[data-billing-vat]').text()).toBe('Без НДС')
    expect(r[4].classes()).toContain('opacity-60')
    expect(r[0].get('[data-billing-date1]').text()).toBe('выставлен 06.10.2026')
    expect(r[1].get('[data-billing-date2]').text()).toMatch(/^просрочен \d+ дн\.$/)
    expect(r[1].get('[data-billing-date2]').classes()).toContain('text-tone-danger-fg')
    expect(r[2].get('[data-billing-date1]').text()).toBe('создан 05.10.2026')
    expect(r[3].get('[data-billing-date2]').text()).toBe('оплачен 27.09.2026')
    expect(r[0].get('[data-billing-check]').text()).toContain('chek-07-10.pdf')
    expect(r[1].text()).toContain('—')
  })

  it('главная кнопка и меню по статусу, виду и чеку', async () => {
    await mountView()
    expect([0, 1, 2, 3, 4].map(primaryKey)).toEqual(['markPaid', 'remind', 'issue', null, null])
    expect(menuKeys(0)).toEqual(['pdf', 'remind', 'cancel'])
    expect(menuKeys(1)).toEqual(['pdf', 'markPaid', 'cancel'])
    expect(menuKeys(2)).toEqual(['pdf', 'delete'])
    expect(menuKeys(3)).toEqual(['pdf', 'cancel'])
    expect(menuKeys(4)).toEqual(['pdf'])
    expect(w.findAll('[data-row-primary]').map((b) => b.text())).toEqual(['Отметить оплату', 'Напомнить', 'Выставить'])
    expect(has('[data-billing-new]')).toBe(true)
  })

  it('без finance.write: ни «Новый документ», ни главных кнопок, ни действий записи — только PDF и чеки', async () => {
    as('kpp', ['finance.read', 'import40.read'])
    await mountView()
    expect(has('[data-billing-new]')).toBe(false)
    expect(has('[data-row-primary]')).toBe(false)
    for (let i = 0; i < 5; i++) expect(menuKeys(i)).toEqual(['pdf'])
    expect(w.findComponent(CreateBillingDocModal).exists()).toBe(false)
    actionsOf(0).vm.$emit('action', 'pdf')
    await flushPromises()
    expect(api.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'Счёт-0214.pdf')
    await w.get('[data-billing-check]').trigger('click')
    await flushPromises()
    expect(api.downloadPaymentCheck).toHaveBeenCalledWith('a', 'f1')
    expect(api.saveBlob).toHaveBeenLastCalledWith(expect.any(Blob), 'chek-07-10.pdf')
    // Действие записи, пришедшее в обход меню, не выполняется.
    actionsOf(2).vm.$emit('action', 'issue')
    await flushPromises()
    expect(confirmState.open).toBe(false)
    expect(api.issue).not.toHaveBeenCalled()
  })

  it('администратор без finance.write — запись есть', async () => {
    as('Administrator', [])
    await mountView()
    expect(has('[data-billing-new]')).toBe(true)
    expect(primaryKey(2)).toBe('issue')
  })

  it('«Выставить» спрашивает подтверждение: отмена — ничего; да — issue, тост, перечитать', async () => {
    await mountView()
    await w.findAll('[data-row-primary]')[2].trigger('click')
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Выставить счёт? Клиент получит письмо, после выставления документ нельзя изменить.')
    expect(confirmState.okText).toBe('Выставить')
    confirmState.resolve(false)
    await flushPromises()
    expect(api.issue).not.toHaveBeenCalled()
    await w.findAll('[data-row-primary]')[2].trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.issue).toHaveBeenCalledWith('c')
    expect(api.toast.success).toHaveBeenCalledWith('Документ выставлен')
    expect(api.list).toHaveBeenCalledTimes(2)
  })

  it('«Отметить оплату», «Аннулировать», «Удалить черновик» — подтверждение и тост успеха', async () => {
    await mountView()
    actionsOf(0).vm.$emit('action', 'markPaid')
    await flushPromises()
    expect(confirmState.title).toBe('Отметить оплаченным? Если это счёт по заявке и все счета оплачены, заявка станет выполненной.')
    expect(confirmState.danger).toBe(false)
    confirmState.resolve(true)
    await flushPromises()
    expect(api.markPaid).toHaveBeenCalledWith('a')
    expect(api.toast.success).toHaveBeenLastCalledWith('Оплата отмечена')

    actionsOf(3).vm.$emit('action', 'cancel')
    await flushPromises()
    expect(confirmState.title).toBe('Аннулировать документ?')
    expect(confirmState.danger).toBe(true)
    confirmState.resolve(true)
    await flushPromises()
    expect(api.cancel).toHaveBeenCalledWith('d')
    expect(api.toast.success).toHaveBeenLastCalledWith('Документ аннулирован')

    actionsOf(2).vm.$emit('action', 'delete')
    await flushPromises()
    expect(confirmState.title).toBe('Удалить черновик?')
    expect(confirmState.okText).toBe('Удалить черновик')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.remove).toHaveBeenCalledWith('c')
    expect(api.toast.success).toHaveBeenLastCalledWith('Черновик удалён')
  })

  it('«Напомнить» без подтверждения: письмо ушло — успех, нет email — предупреждение', async () => {
    await mountView()
    await w.findAll('[data-row-primary]')[1].trigger('click')
    await flushPromises()
    expect(confirmState.open).toBe(false)
    expect(api.remind).toHaveBeenCalledWith('b')
    expect(api.toast.success).toHaveBeenCalledWith('Напоминание отправлено на a@b.kz')
    api.remind.mockResolvedValueOnce({ ok: true, emailSent: false, to: null })
    await w.findAll('[data-row-primary]')[1].trigger('click')
    await flushPromises()
    expect(api.toast.warning).toHaveBeenCalled()
  })

  it('HTTP-ошибка действия — без своего тоста (показал перехватчик); не-HTTP — «Не удалось выполнить действие»', async () => {
    await mountView()
    api.remind.mockRejectedValueOnce({ response: { status: 409 } })
    await w.findAll('[data-row-primary]')[1].trigger('click')
    await flushPromises()
    expect(api.toast.error).not.toHaveBeenCalled()
    api.remind.mockRejectedValueOnce(new Error('net'))
    await w.findAll('[data-row-primary]')[1].trigger('click')
    await flushPromises()
    expect(api.toast.error).toHaveBeenCalledWith('Не удалось выполнить действие')
  })

  it('фильтры: вид, статус (с аннулированными и счётчиками), поиск по «N/ГГГГ»', async () => {
    await mountView()
    const segs = (sel: string) => w.findAll(`${sel} button`).map((b) => b.text().replace(/\s+/g, ' ').trim())
    expect(segs('[data-billing-kind]')).toEqual(['Все', 'Счета', 'Акты'])
    expect(segs('[data-billing-status]')).toEqual(['Все 5', 'Черновики 1', 'Выставлены 2', 'Оплачены 1', 'Аннулированы 1'])
    await w.findAll('[data-billing-status] button')[4].trigger('click')
    expect(docs()).toEqual(['Счёт № 0205/2026'])
    await w.findAll('[data-billing-status] button')[0].trigger('click')
    await w.findAll('[data-billing-kind] button')[2].trigger('click')
    expect(docs()).toEqual(['Акт № 0098/2026'])
    await w.findAll('[data-billing-kind] button')[0].trigger('click')
    await w.get('input[type="search"]').setValue('0213/2026')
    expect(docs()).toEqual(['Счёт № 0213/2026'])
  })

  it('пока идёт действие: кнопки других строк и пункты записи неактивны, попытка — сообщение до вопроса', async () => {
    await mountView()
    let finish!: (v: unknown) => void
    api.remind.mockReturnValueOnce(new Promise((r) => { finish = r }))
    await w.findAll('[data-row-primary]')[1].trigger('click') // «Напомнить» строки b — запрос идёт
    await flushPromises()
    const primaries = w.findAllComponents(RowActions).map((a) => a.props('primary') as { disabled?: boolean; loading?: boolean } | null)
    expect(primaries[1]).toMatchObject({ loading: true, disabled: false })
    expect(primaries[2]).toMatchObject({ disabled: true })
    const items0 = actionsOf(0).props('items') as { key: string; disabled?: boolean }[]
    expect(items0.filter((x) => x.disabled).map((x) => x.key)).toEqual(menuKeys(0).filter((k) => k !== 'pdf'))
    expect(items0.find((x) => x.key === 'pdf')?.disabled).toBe(false)
    actionsOf(0).vm.$emit('action', 'markPaid')
    await flushPromises()
    expect(confirmState.open).toBe(false)
    expect(api.toast.info).toHaveBeenCalledWith('Дождитесь завершения предыдущего действия')
    expect(api.markPaid).not.toHaveBeenCalled()
    finish({ ok: true, emailSent: true, to: 'a@b.kz' })
    await flushPromises()
    expect((actionsOf(2).props('primary') as { disabled?: boolean }).disabled).toBe(false)
  })

  it('ушли с экрана до конца загрузки — ?caseId= не открывает окно и не правит адрес', async () => {
    let finish!: (v: unknown) => void
    api.list.mockReturnValueOnce(new Promise((r) => { finish = r }))
    await router.push('/billing?caseId=k1')
    w = mountWithI18n(BillingDocsView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()
    // Отключение приложения сбрасывает currentRoute роутера — проверяем сам вызов replace.
    const replace = vi.spyOn(router, 'replace')
    w.unmount()
    finish(ROWS)
    await flushPromises()
    expect(api.listClients).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('?case= — фильтр по номеру заявки; смена параметра на открытом экране — перечитать и отфильтровать', async () => {
    await router.push('/billing?case=k2')
    await mountView()
    expect((w.get('input[type="search"]').element as HTMLInputElement).value).toBe('ИМ-2026-0173')
    expect(docs()).toEqual(['Счёт № 0213/2026'])
    expect(w.findComponent(CreateBillingDocModal).props('open')).toBe(false)
    await router.push('/billing?case=k1')
    await flushPromises()
    expect(api.list).toHaveBeenCalledTimes(2)
    expect(docs()).toEqual(['Счёт № 0214/2026'])
  })

  it('?caseId= — фильтр и окно с заявкой и клиентом; параметр убирается из адреса', async () => {
    await router.push('/billing?caseId=k9&x=1')
    await mountView()
    const modal = w.getComponent(CreateBillingDocModal)
    expect(modal.props('open')).toBe(true)
    expect(modal.props('preset')).toEqual({ caseId: 'k9', clientId: 'c2' })
    expect(modal.props('vatRate')).toBe(12)
    expect(modal.props('clients')).toEqual([{ value: 'c1', label: 'ТОО «Altyn Med»' }, { value: 'c2', label: 'steppe' }])
    expect((w.get('input[type="search"]').element as HTMLInputElement).value).toBe('ИМ-2026-0199')
    expect(router.currentRoute.value.query).toEqual({ x: '1' })
  })

  it('?caseId= на открытом экране — окно открывается снова с новой заявкой', async () => {
    await mountView()
    const modal = w.getComponent(CreateBillingDocModal)
    expect(modal.props('open')).toBe(false)
    await router.push('/billing?caseId=k1')
    await flushPromises()
    expect(modal.props('open')).toBe(true)
    expect(modal.props('preset')).toEqual({ caseId: 'k1', clientId: 'c1' })
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('?caseId= без права записи — только фильтр, окна нет, параметр остаётся', async () => {
    as('kpp', ['finance.read'])
    await router.push('/billing?caseId=k1')
    await mountView()
    expect((w.get('input[type="search"]').element as HTMLInputElement).value).toBe('ИМ-2026-0170')
    expect(router.currentRoute.value.query).toEqual({ caseId: 'k1' })
  })

  it('«Новый документ» открывает окно без preset; создан — список перечитан', async () => {
    await mountView()
    await w.get('[data-billing-new]').trigger('click')
    const modal = w.getComponent(CreateBillingDocModal)
    expect(modal.props('open')).toBe(true)
    expect(modal.props('preset')).toBeNull()
    modal.vm.$emit('created')
    await flushPromises()
    expect(api.list).toHaveBeenCalledTimes(2)
  })

  it('ошибка загрузки — по месту с «Повторить», без тоста', async () => {
    api.list.mockRejectedValueOnce(new Error('500'))
    await mountView()
    expect(w.get('[data-billing-error]').text()).toContain('Не удалось загрузить список')
    expect(has('[data-billing-table]')).toBe(false)
    expect(api.toast.error).not.toHaveBeenCalled()
    await w.get('[data-billing-retry]').trigger('click')
    await flushPromises()
    expect(has('[data-billing-error]')).toBe(false)
    expect(docs()).toHaveLength(5)
  })

  it('Excel — отфильтрованные строки; без строк кнопка неактивна', async () => {
    await mountView()
    await w.findAll('[data-billing-kind] button')[2].trigger('click')
    await w.get('[data-billing-export]').trigger('click')
    await flushPromises()
    const [base, sheet, out] = api.exportXlsx.mock.calls[0]
    expect(base).toBe('billing')
    expect(sheet).toBe('Счета и акты')
    expect(out).toHaveLength(1)
    expect(Object.keys(out[0])).toEqual(['Документ', '№', 'Клиент', 'Заявка', 'Статус', 'Сумма', 'НДС', 'Выставлен', 'Оплачен'])
    await w.get('input[type="search"]').setValue('нет такого')
    expect(w.get('[data-billing-export]').attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('Ничего не нашлось')
  })
})
