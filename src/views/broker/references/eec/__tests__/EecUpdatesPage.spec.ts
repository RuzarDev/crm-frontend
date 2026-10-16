import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import { useAuthStore } from '@/stores/auth'
import { confirmState } from '@/ui/confirm'
import type {
  EecDecisionView, EecDiscrepancy, EecDiscrepancyReport, EecEditionSummary, EecSyncRunView, EecTreeAbsentCode,
} from '@/api/tnvedEec'

const api = vi.hoisted(() => ({
  editions: vi.fn(), edition: vi.fn(), apply: vi.fn(), reject: vi.fn(),
  startSync: vi.fn(), syncStatus: vi.fn(), syncRuns: vi.fn(),
  discrepancies: vi.fn(), treeAbsent: vi.fn(), closeTreeCode: vi.fn(),
  decisions: vi.fn(), confirmDecision: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
  exportXlsx: vi.fn(),
}))
vi.mock('@/api/tnvedEec', () => ({ tnvedEecApi: api }))
vi.mock('@/ui/message', () => ({ message: api.toast }))
vi.mock('@/views/broker/list', async (orig) => ({ ...(await orig<typeof import('@/views/broker/list')>()), exportXlsx: api.exportXlsx }))

import EecUpdatesPage from '../EecUpdatesPage.vue'

const ModalStub = {
  props: ['open', 'title'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal :data-title="title"><slot /><button data-ok type="button" @click="$emit(\'ok\')" /></div>',
}

const edition = (o: Partial<EecEditionSummary>): EecEditionSummary => ({
  id: 1, kind: 'group', group: '27', fileName: 'ru.27_2022_24.08.2026.pdf', editionDate: '2026-08-24', status: 'applied',
  stagedAtUtc: '2026-10-16T03:00:00Z', appliedAtUtc: '2026-10-16T03:00:05Z', statusChangedAtUtc: null, statusChangedBy: null,
  statusReason: null, isClean: true, leafCount: 412, unparsedCount: 0, addedCount: 0, removedCount: 0, changedCount: 3, ...o,
})
const EDITIONS = [
  edition({ id: 3, group: '22', status: 'held', statusReason: 'ушло 7 % кодов', removedCount: 9, fileName: 'ru.22_2022_01.10.2026.pdf', editionDate: '2026-10-01' }),
  edition({ id: 2, kind: 'ettNotes', group: null, fileName: 'ru.notes_24.08.2026.pdf' }),
  edition({ id: 1 }),
]
const run = (o: Partial<EecSyncRunView> = {}): EecSyncRunView => ({
  id: 5, triggeredBy: 'scheduler', startedAtUtc: '2026-10-16T03:00:00Z', finishedAtUtc: '2026-10-16T03:04:00Z', status: 'completed',
  filesListed: 97, filesDownloaded: 3, editionsStaged: 2, editionsApplied: 1, editionsHeld: 1, filesFailed: 0, decisionsResolved: 2,
  kedenPrefetched: 4, errorMessage: null,
  items: [
    { file: 'ru.22_2022_01.10.2026.pdf', group: '22', action: 'held', editionId: 3, detail: 'ушло 7 % кодов' },
    { file: 'ru.27_2022_24.08.2026.pdf', group: '27', action: 'skipped', editionId: 1, detail: 'Applied' },
  ],
  ...o,
})
const disc = (o: Partial<EecDiscrepancy>): EecDiscrepancy => ({
  code: '2710124500', group: '27', name: '– – бензин', kind: 'rate', eecRate: '0%', eecRateText: '0', eecBaseRateText: '5',
  footnoteRefs: ['109С'], footnoteNumber: '109С', footnoteFrom: null, footnoteTo: '2028-12-31', editionId: 1, editionDate: '2026-08-24',
  fileName: 'ru.27_2022_24.08.2026.pdf', notInForceSince: null, pending: [], kedenRate: '5%', kedenUpdatedAtUtc: null, ...o,
})
const report = (items: EecDiscrepancy[], o: Partial<EecDiscrepancyReport> = {}): EecDiscrepancyReport => ({
  date: '2026-10-16', total: items.length, counts: { rate: 1, eecOnly: 0, kedenOnly: 1, eecNotInForce: 0, eecUncertain: 0 },
  page: 1, pageSize: 50, items, groupsLoaded: ['22', '27'], ...o,
})
const decision = (o: Partial<EecDecisionView> = {}): EecDecisionView => ({
  id: 9, body: 'Коллегии', number: '132', decisionDate: '2025-11-10', title: 'Решение Коллегии ЕЭК № 132', entryIntoForce: null,
  source: 'none', publishedDate: '2025-11-12', portalUrl: 'https://docs.eaeunion.org/x', portalComment: null, flags: ['no-date'],
  lastCheckedAtUtc: null, lastCheckError: null, confirmedBy: null, confirmedAtUtc: null, note: null, footnotes: ['109С', '110С'], codes: 14, ...o,
})
const absent = (o: Partial<EecTreeAbsentCode> = {}): EecTreeAbsentCode => ({
  nodeId: 501, code: '8112924100', group: '81', name: '– – прочие', kind: 'absent', eecNotInForceSince: null, addedByEec: false,
  kedenRate: '5%', eecSimilar: ['8112924101', '8112924109'], suggestedEndDate: '2026-08-24', groupEditionFile: 'ru.81.pdf', ...o,
})

let w: VueWrapper
let router: Router
const mountAt = async (path = '/tnved/eec') => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.role = 'administrator'
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(EecUpdatesPage, { attachTo: document.body, global: { plugins: [pinia, router], stubs: { ZModal: ModalStub } } })
  await flushPromises()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  api.editions.mockResolvedValue({ data: EDITIONS })
  api.syncStatus.mockResolvedValue({ data: { isRunning: false, run: run() } })
  api.decisions.mockResolvedValue({ data: [decision()] })
  api.discrepancies.mockResolvedValue({ data: report([disc({}), disc({ code: '2710198100', kind: 'kedenOnly', eecRateText: null, footnoteNumber: null, footnoteRefs: [], footnoteTo: null })]) })
  api.treeAbsent.mockResolvedValue({ data: { total: 1, page: 1, pageSize: 50, items: [absent()], groupsLoaded: ['81'] } })
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('EecUpdatesPage — шапка и проверка ЕЭК', () => {
  it('заголовок, последняя проверка со счётчиками; журнал без «без изменений» по умолчанию', async () => {
    await mountAt()
    expect(w.get('h1').text()).toBe('Обновления ЕЭК')
    expect(w.get('[data-eec-sync-status]').text()).toBe('Успешно')
    expect(w.get('[data-eec-sync-by]').text()).toBe('по расписанию')
    expect(w.get('[data-stat="listed"]').text()).toBe('Файлов на сайте: 97')
    expect(w.get('[data-stat="held"]').classes()).toContain('text-tone-wait-fg')
    await w.get('[data-eec-sync-log-toggle]').trigger('click')
    expect(w.findAll('[data-eec-sync-item]').map((i) => i.attributes('data-action'))).toEqual(['held'])
    w.findComponent({ name: 'ZCheckbox' }).vm.$emit('update:checked', true)
    await flushPromises()
    expect(w.findAll('[data-eec-sync-item]').map((i) => i.attributes('data-action'))).toEqual(['held', 'skipped'])
  })

  it('ещё не проверялся — подпись', async () => {
    api.syncStatus.mockResolvedValue({ data: { isRunning: false, run: null } })
    await mountAt()
    expect(w.get('[data-eec-sync-never]').text()).toBe('Сайт ЕЭК ещё не проверялся')
  })

  it('«Обновить из ЕЭК»: подтверждение → запуск → опрос статуса → по окончании список редакций перечитан, тост', async () => {
    await mountAt()
    expect(api.editions).toHaveBeenCalledTimes(1)
    await w.get('[data-eec-run]').trigger('click')
    expect(confirmState.title).toBe('Проверить сайт ЕЭК?')
    api.startSync.mockResolvedValue({ data: { started: true, runId: 6, isRunning: true, run: run({ id: 6, status: 'running', finishedAtUtc: null, items: [] }) } })
    api.syncStatus.mockResolvedValueOnce({ data: { isRunning: true, run: run({ id: 6, status: 'running', finishedAtUtc: null, items: [] }) } })
    confirmState.resolve(true)
    await flushPromises()
    expect(api.startSync).toHaveBeenCalledTimes(1)
    expect(w.get('[data-eec-sync-running]').text()).toContain('Проверка ЕЭК идёт')
    expect(w.get('[data-eec-run]').attributes('disabled')).toBeDefined()

    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    expect(api.syncStatus).toHaveBeenLastCalledWith(6)
    expect(w.find('[data-eec-sync-running]').exists()).toBe(true)

    api.syncStatus.mockResolvedValueOnce({ data: { isRunning: false, run: run({ id: 6, editionsApplied: 2, editionsHeld: 0 }) } })
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    expect(w.find('[data-eec-sync-running]').exists()).toBe(false)
    expect(api.toast.success).toHaveBeenCalledWith('Проверка ЕЭК закончена: применено 2, ждут подтверждения 0')
    expect(api.editions).toHaveBeenCalledTimes(2)
  })

  it('прогон уже шёл — «уже идёт», опрос без runId, пока сервер его не назвал', async () => {
    await mountAt()
    api.startSync.mockResolvedValue({ data: { started: false, runId: null, isRunning: true, run: null } })
    api.syncStatus.mockResolvedValue({ data: { isRunning: true, run: run() } })
    await w.get('[data-eec-run]').trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(w.get('[data-eec-sync-running]').text()).toContain('Проверка ЕЭК уже идёт — ждём её окончания.')
    await vi.advanceTimersByTimeAsync(3000)
    expect(api.syncStatus).toHaveBeenLastCalledWith(null)
  })

  it('остановлена предохранителем — предупреждение', async () => {
    api.syncStatus.mockResolvedValueOnce({ data: { isRunning: true, run: run({ status: 'running' }) } })
    await mountAt()
    api.syncStatus.mockResolvedValueOnce({ data: { isRunning: false, run: run({ status: 'stopped' }) } })
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()
    expect(api.toast.warning).toHaveBeenCalledWith('Проверка ЕЭК закончилась: Остановлена: ЕЭК не отвечает')
  })
})

describe('EecUpdatesPage — редакции', () => {
  it('строки, статусы, изменения; плашка отложенных фильтрует по статусу; клик — карточка редакции', async () => {
    await mountAt()
    const titles = w.findAll('[data-eec-edition-title]').map((e) => e.text())
    expect(titles).toEqual(['Группа 22', 'Примечания к ЕТТ', 'Группа 27'])
    expect(w.findAll('[data-eec-edition-status]').map((e) => e.text())).toEqual(['Ждёт подтверждения', 'Применена', 'Применена'])
    expect(w.get('[data-eec-edition-date]').text()).toBe('01.10.2026')
    expect(w.get('[data-eec-held-banner]').text()).toContain('Редакций ждут подтверждения: 1')
    await w.get('[data-eec-show-held]').trigger('click')
    expect(w.findAll('[data-eec-edition-title]').map((e) => e.text())).toEqual(['Группа 22'])
    await w.get('[data-eec-edition-open]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/tnved/eec/editions/3')
  })

  it('пусто — подсказка про «Обновить из ЕЭК»; ошибка — «Повторить»', async () => {
    api.editions.mockResolvedValueOnce({ data: [] })
    await mountAt()
    expect(w.text()).toContain('Редакций ЕЭК пока нет')
    w.unmount()
    api.editions.mockRejectedValueOnce(new Error('x'))
    await mountAt()
    expect(w.find('[data-eec-editions-error]').exists()).toBe(true)
    await w.get('[data-eec-editions-retry]').trigger('click')
    await flushPromises()
    expect(w.findAll('[data-eec-edition-title]').length).toBe(3)
  })
})

describe('EecUpdatesPage — даты решений', () => {
  it('счётчик на вкладке; карточка решения; «Указать дату» сохраняет дату и комментарий', async () => {
    await mountAt('/tnved/eec?tab=decisions')
    const tab = w.findAll('[role="tab"]').find((t) => t.text().startsWith('Даты решений'))!
    expect(tab.text()).toContain('1')
    expect(w.get('[data-eec-dec-title]').text()).toBe('Решение Коллегии ЕЭК № 132 от 10.11.2025')
    expect(w.get('[data-eec-dec-entry]').text()).toBe('не известна')
    expect(w.get('[data-flag="no-date"]').text()).toBe('нет даты на портале')
    await w.get('[data-eec-dec-confirm]').trigger('click')
    expect(w.get('[data-modal]').attributes('data-title')).toBe('Дата вступления решения в силу')
    // Без даты — ошибка под полем, запроса нет.
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.confirmDecision).not.toHaveBeenCalled()
    expect(w.get('[data-modal]').text()).toContain('Укажите дату')
    // Дату задаём через компонент поля.
    const dateCmp = w.findComponent({ name: 'ZDate' })
    dateCmp.vm.$emit('update:value', '2025-12-02')
    await w.get('[data-eec-modal-note]').setValue('по тексту решения, п. 3')
    api.confirmDecision.mockResolvedValue({ data: decision({ entryIntoForce: '2025-12-02', source: 'manual' }) })
    api.decisions.mockResolvedValue({ data: [] })
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.confirmDecision).toHaveBeenCalledWith(9, '2025-12-02', 'по тексту решения, п. 3')
    expect(api.toast.success).toHaveBeenCalledWith('Дата вступления сохранена: 02.12.2025')
    expect(w.text()).toContain('Все даты решений известны')
  })

  it('дата раньше даты принятия — не отправляется', async () => {
    await mountAt('/tnved/eec?tab=decisions')
    await w.get('[data-eec-dec-confirm]').trigger('click')
    w.findComponent({ name: 'ZDate' }).vm.$emit('update:value', '2025-01-01')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.confirmDecision).not.toHaveBeenCalled()
    expect(w.get('[data-modal]').text()).toContain('Дата раньше допустимой')
  })
})

describe('EecUpdatesPage — расхождения с КЕДЕН', () => {
  it('строки с источником, вкладки видов со счётчиками, фильтр вида уходит в запрос', async () => {
    await mountAt('/tnved/eec?tab=discrepancies')
    expect(api.discrepancies).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 50, kind: null }))
    expect(w.findAll('[data-eec-disc-code]').map((c) => c.text())).toEqual(['2710 12 450 0', '2710 19 810 0'])
    expect(w.get('[data-eec-disc-eec]').text()).toBe('0')
    expect(w.get('[data-eec-disc-base]').text()).toBe('основная: 5')
    expect(w.get('[data-eec-disc-keden]').text()).toBe('5%')
    expect(w.get('[data-eec-disc-footnote]').text()).toBe('сноска 109С · до 31.12.2028')
    const kinds = w.get('[data-eec-disc-kinds]').findAll('button')
    expect(kinds.map((b) => b.text())).toEqual(['Все 2', 'Ставка отличается 1', 'Нет в КЕДЕН 0', 'Нет в ЕЭК 1', 'Ушёл из ЕЭК 0', 'Проверить вручную 0'])
    await kinds[1].trigger('click')
    await flushPromises()
    expect(api.discrepancies).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'rate', page: 1 }))
  })

  it('поиск — с паузой; Excel — все страницы текущего отбора', async () => {
    await mountAt('/tnved/eec?tab=discrepancies')
    await w.get('[data-eec-disc] input[type="search"]').setValue('2710')
    expect(api.discrepancies).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(400)
    await flushPromises()
    expect(api.discrepancies).toHaveBeenLastCalledWith(expect.objectContaining({ q: '2710' }))

    api.discrepancies
      .mockResolvedValueOnce({ data: report([disc({})], { total: 2, pageSize: 1000 }) })
      .mockResolvedValueOnce({ data: report([disc({ code: '2710198100' })], { total: 2, pageSize: 1000, page: 2 }) })
    await w.get('[data-eec-disc-export]').trigger('click')
    await flushPromises()
    expect(api.discrepancies).toHaveBeenCalledWith(expect.objectContaining({ q: '2710', page: 2, pageSize: 1000 }))
    expect(api.exportXlsx).toHaveBeenCalledTimes(1)
    const [file, sheet, rows] = api.exportXlsx.mock.calls[0]
    expect(file).toMatch(/^eec-keden-\d{4}-\d{2}-\d{2}$/)
    expect(sheet).toBe('Расхождения с КЕДЕН')
    expect(rows.map((r: Record<string, unknown>) => r['Код'])).toEqual(['2710124500', '2710198100'])
  })

  it('ни одной группы из ЕЭК — пояснение вместо «расхождений нет»', async () => {
    api.discrepancies.mockResolvedValue({ data: report([], { groupsLoaded: [], counts: {} }) })
    await mountAt('/tnved/eec?tab=discrepancies')
    expect(w.text()).toContain('Из ЕЭК ещё не загружена ни одна группа')
    expect(w.get('[data-eec-disc-export]').attributes('disabled')).toBeDefined()
  })
})

describe('EecUpdatesPage — коды не в ЕЭК', () => {
  it('строка с похожими кодами; «Закрыть» — дата по умолчанию от сервера, комментарий, перечитывание', async () => {
    await mountAt('/tnved/eec?tab=absent')
    expect(w.get('[data-eec-absent-code]').text()).toBe('8112 92 410 0')
    expect(w.get('[data-eec-absent-similar]').findAll('a').map((a) => a.text())).toEqual(['8112 92 410 1', '8112 92 410 9'])
    expect(w.get('[data-eec-absent-kind]').text()).toBe('Нет в ЕЭК')
    await w.get('[data-eec-absent-close]').trigger('click')
    expect(w.get('[data-modal]').text()).toContain('Код 8112 92 410 0 станет «не действует»')
    expect(w.findComponent({ name: 'ZDate' }).props('value')).toBe('2026-08-24')
    await w.get('[data-eec-modal-note]').setValue('разбит на 01 и 09')
    api.closeTreeCode.mockResolvedValue({ data: { code: '8112924100', nodesClosed: 1, endDate: '2026-08-24', note: 'x' } })
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.closeTreeCode).toHaveBeenCalledWith('8112924100', { endDate: '2026-08-24', note: 'разбит на 01 и 09' })
    expect(api.toast.success).toHaveBeenCalledWith('Код 8112 92 410 0 закрыт с 24.08.2026')
    expect(api.treeAbsent).toHaveBeenCalledTimes(2)
  })

  it('ошибка закрытия (409) — окно остаётся открытым', async () => {
    await mountAt('/tnved/eec?tab=absent')
    await w.get('[data-eec-absent-close]').trigger('click')
    api.closeTreeCode.mockRejectedValue(Object.assign(new Error('409'), { response: { status: 409 } }))
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(w.find('[data-modal]').exists()).toBe(true)
    expect(api.treeAbsent).toHaveBeenCalledTimes(1)
  })
})
