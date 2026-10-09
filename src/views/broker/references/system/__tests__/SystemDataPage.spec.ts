import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import { useAuthStore } from '@/stores/auth'
import { useClassifiersStore } from '@/stores/classifiers'
import { confirmState } from '@/ui/confirm'
import type { ClassifierItem, RefItem, TnvedSyncLogDto } from '@/types/api'

const api = vi.hoisted(() => ({
  listStations: vi.fn(), listCustomsPosts: vi.fn(), createStation: vi.fn(), updateStation: vi.fn(), deleteStation: vi.fn(),
  createCustomsPost: vi.fn(), updateCustomsPost: vi.fn(), deleteCustomsPost: vi.fn(),
  listClassifierGroups: vi.fn(), listClassifiers: vi.fn(), createClassifier: vi.fn(), updateClassifier: vi.fn(), deleteClassifier: vi.fn(),
  syncEec: vi.fn(),
  katoStatus: vi.fn(), katoSearch: vi.fn(), katoSync: vi.fn(), katoImport: vi.fn(),
  gr33List: vi.fn(), gr33Usage: vi.fn(),
  troisStatus: vi.fn(), troisSearch: vi.fn(), troisImport: vi.fn(),
  whStatus: vi.fn(), whImport: vi.fn(), nsiStatus: vi.fn(), nsiImportKgd: vi.fn(), nsiImport: vi.fn(), kedenRefresh: vi.fn(),
  syncHistory: vi.fn(), syncTrigger: vi.fn(), seedTransitions: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/references', () => ({
  referencesApi: {
    listStations: api.listStations, listCustomsPosts: api.listCustomsPosts, createStation: api.createStation, updateStation: api.updateStation,
    deleteStation: api.deleteStation, createCustomsPost: api.createCustomsPost, updateCustomsPost: api.updateCustomsPost,
    deleteCustomsPost: api.deleteCustomsPost, listClassifierGroups: api.listClassifierGroups, listClassifiers: api.listClassifiers,
    createClassifier: api.createClassifier, updateClassifier: api.updateClassifier, deleteClassifier: api.deleteClassifier, syncEec: api.syncEec,
  },
}))
vi.mock('@/api/kato', () => ({ katoApi: { status: api.katoStatus, search: api.katoSearch, sync: api.katoSync, import: api.katoImport } }))
vi.mock('@/api/prohibitionCodes', () => ({ prohibitionCodesApi: { list: api.gr33List, kedenUsage: api.gr33Usage } }))
vi.mock('@/api/trois', () => ({ troisApi: { status: api.troisStatus, search: api.troisSearch, importFile: api.troisImport } }))
vi.mock('@/api/warehouseRegistry', () => ({
  warehouseRegistryApi: { status: api.whStatus, importFile: api.whImport },
  warehouseNsiApi: { status: api.nsiStatus, importFromKgd: api.nsiImportKgd, importFile: api.nsiImport },
  kedenRegistriesApi: { refresh: api.kedenRefresh },
}))
vi.mock('@/api/tnved', () => ({ tnvedApi: { syncHistory: api.syncHistory, syncTrigger: api.syncTrigger, seedTransitions: api.seedTransitions } }))
vi.mock('@/ui/message', () => ({ message: api.toast }))

import SystemDataPage from '../SystemDataPage.vue'

// Окно — заглушка (механика Reka не проверяется): содержимое и кнопка «ок».
const ModalStub = {
  props: ['open', 'title'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal :data-title="title"><slot /><button data-ok type="button" @click="$emit(\'ok\')" /></div>',
}

const st = (id: string, name: string, isActive = true): RefItem => ({ id, name, isActive })
const cls = (classifierCode: string, code: string, nameRu: string, isActive = true): ClassifierItem =>
  ({ id: `${classifierCode}-${code}`, classifierCode, code, nameRu, sortOrder: 0, isActive })
const log = (o: Partial<TnvedSyncLogDto>): TnvedSyncLogDto => ({
  id: 1, startedAtUtc: '2026-10-06T03:00:00Z', finishedAtUtc: '2026-10-06T03:02:10Z', status: 'Completed', triggeredBy: 'scheduler',
  nodesAdded: 3, nodesUpdated: 12, nodesRemoved: 1, ratesUpdated: 40, errorMessage: null, ...o,
})
const deferred = <T>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((r, j) => { resolve = r; reject = j })
  return { promise, resolve, reject }
}
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } })

let w: VueWrapper
let router: Router
const mountAt = async (path: string, role = 'administrator', permissions: string[] = []) => {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = permissions
  await router.push(path)
  await router.isReady()
  w = mountWithI18n(SystemDataPage, { attachTo: document.body, global: { plugins: [pinia, router], stubs: { ZModal: ModalStub } } })
  await flushPromises()
}
const navItems = () => w.findAll('[data-nav-item]').map((b) => b.attributes('data-nav-item'))
const nav = (key: string) => w.get(`[data-nav-item="${key}"]`)
// Числа по языку интерфейса — с неразрывным пробелом в разрядах.
const count = (key: string) => nav(key).get('[data-nav-count]').text().replace(/\s/g, ' ')
const rowNames = () => w.findAll('[data-item-name]').map((e) => e.text())
const rowCodes = () => w.findAll('[data-item-code]').map((e) => e.text())
const segment = (label: string) => w.findAll('[data-items-segment] button').find((b) => b.text().startsWith(label))!
const openMenu = async (i: number) => {
  await w.findAll('[data-row-more]')[i].trigger('keydown', { key: 'Enter' })
  await vi.waitFor(() => expect(document.body.querySelectorAll('[role="menuitem"]').length).toBeGreaterThan(0))
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((e) => e.textContent!.trim())
}
const choose = async (label: string) => {
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((e) => e.textContent?.trim() === label)!
  item.click()
  await flushPromises()
}

beforeEach(() => {
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  api.listStations.mockImplementation(async (o?: { includeInactive?: boolean }) =>
    (o?.includeInactive ? [st('s1', 'Алтынколь'), st('s2', 'Достык', false)] : [st('s1', 'Алтынколь')]))
  api.listCustomsPosts.mockResolvedValue([st('p1', 'Пост 1'), st('p2', 'Пост 2'), st('p3', 'Пост 3')])
  api.listClassifierGroups.mockResolvedValue([{ classifierCode: '2009', count: 1482 }, { classifierCode: 'new-eec', count: 2 }])
  api.listClassifiers.mockImplementation(async (code: string) => (code === '2009'
    ? [cls('2009', '01011', 'Свидетельство о регистрации'), cls('2009', '09023', 'Таможенная расписка', false)]
    : [cls(code, 'A1', 'Новый код')]))
  api.katoStatus.mockResolvedValue({ total: 15612, updatedAtUtc: '2026-10-01T05:00:00Z', sourceUrl: 'https://stat.gov.kz/kato' })
  api.gr33List.mockResolvedValue([{ code: 'D01', name: 'Запрет', categoryCode: 'D', categoryName: 'Меры', kind: 'x', isNegative: false }])
  api.gr33Usage.mockResolvedValue([])
  api.troisStatus.mockResolvedValue({ total: 2500, active: 2140, importedAtUtc: '2026-10-05T05:00:00Z' })
  api.whStatus.mockResolvedValue({ kinds: [{ kind: 'svh', total: 300, importedAtUtc: '2026-10-05T05:00:00Z' }, { kind: 'customs_warehouse', total: 88, importedAtUtc: null }] })
  api.nsiStatus.mockResolvedValue({ kinds: [{ kind: 'svh', total: 10, importedAtUtc: null }] })
  api.syncHistory.mockResolvedValue({ data: [log({})] })
  api.updateStation.mockResolvedValue(st('s1', 'x'))
  api.deleteStation.mockResolvedValue(undefined)
  api.createStation.mockResolvedValue(st('s9', 'x'))
  api.updateClassifier.mockResolvedValue(cls('2009', 'x', 'x'))
  api.createClassifier.mockResolvedValue(cls('2009', 'x', 'x'))
  api.deleteClassifier.mockResolvedValue(undefined)
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('SystemDataPage — меню и адрес', () => {
  it('группы и счётчики грузятся параллельно и тихо; классификатор без подписи — кодом', async () => {
    await mountAt('/references')
    expect(w.get('h1').text()).toBe('Данные системы')
    expect(w.findAll('[data-nav-group]').map((g) => g.attributes('data-nav-group'))).toEqual(['base', 'eec', 'registries', 'tnved'])
    expect(navItems()).toEqual(['stations', 'posts', 'cls:2009', 'cls:new-eec', 'gr33', 'kato', 'warehouses', 'nsi', 'trois', 'tnved-sync'])
    expect(nav('cls:2009').text()).toContain('Виды документов (2009)')
    expect(count('cls:2009')).toBe('1 482')
    expect(nav('cls:new-eec').text()).toContain('new-eec')
    expect(count('kato')).toBe('15 612')
    expect(count('warehouses')).toBe('388')
    expect(count('trois')).toBe('2 140')
    expect(count('tnved-sync')).toBe('06.10')
    expect(count('posts')).toBe('3')
    // открытый пункт (станции) считает активные сам — второго запроса за счётчиком нет
    expect(count('stations')).toBe('1')
    expect(api.listStations).toHaveBeenCalledTimes(1)
    expect(api.listStations).toHaveBeenCalledWith({ silent: true, includeInactive: true })
    expect(api.katoStatus).toHaveBeenCalledWith({ silent: true })
    expect(api.listClassifierGroups).toHaveBeenCalledWith({ silent: true })
    expect(nav('stations').attributes('aria-current')).toBe('page')
  })

  it('ошибка счётчика — «—» с подсказкой, а не 0; сбой станций не прячет посты', async () => {
    api.katoStatus.mockRejectedValue(httpError(500))
    api.listStations.mockRejectedValue(httpError(500))
    await mountAt('/references?item=kato')
    const kato = nav('kato').get('[data-nav-count="error"]')
    expect(kato.text()).toContain('—')
    expect(kato.attributes('title')).toBe('Не удалось загрузить число записей')
    expect(nav('stations').get('[data-nav-count="error"]').text()).toContain('—')
    expect(count('posts')).toBe('3')
  })

  it('выбор пункта пишет ?item=; ?item= открывает пункт; недоступный — первый', async () => {
    await mountAt('/references?item=cls:2009')
    expect(nav('cls:2009').attributes('aria-current')).toBe('page')
    expect(w.get('[data-classifier-title]').text()).toBe('Виды документов (2009)')
    expect(api.listClassifiers).toHaveBeenCalledWith('2009', { silent: true, includeInactive: true })
    await nav('posts').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.item).toBe('posts')
    expect(w.get('[data-ref-list]').attributes('data-ref-list')).toBe('posts')
    expect(rowNames()).toEqual(['Пост 1', 'Пост 2', 'Пост 3'])
    w.unmount()
    await mountAt('/references?item=nonsense')
    expect(nav('stations').attributes('aria-current')).toBe('page')
  })

  it('/tnved/sync у администратора — меню целиком, открыта синхронизация; выбор другого пункта ведёт на /references', async () => {
    await mountAt('/tnved/sync')
    expect(nav('tnved-sync').attributes('aria-current')).toBe('page')
    expect(w.find('[data-tnved-sync]').exists()).toBe(true)
    expect(api.syncHistory).toHaveBeenCalledTimes(1)
    await nav('kato').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/references')
    expect(router.currentRoute.value.query.item).toBe('kato')
  })
})

describe('SystemDataPage — права', () => {
  it('сотрудник с tnved.manage (не администратор): только синхронизация, справочники не запрашиваются', async () => {
    await mountAt('/tnved/sync', 'broker', ['tnved.manage', 'references.read'])
    expect(navItems()).toEqual(['tnved-sync'])
    expect(w.find('[data-tnved-sync]').exists()).toBe(true)
    expect(api.listStations).not.toHaveBeenCalled()
    expect(api.listClassifierGroups).not.toHaveBeenCalled()
    expect(api.katoStatus).not.toHaveBeenCalled()
    // ?item= справочника ему не открывается
    w.unmount()
    await mountAt('/references?item=stations', 'broker', ['tnved.manage'])
    expect(navItems()).toEqual(['tnved-sync'])
    expect(w.find('[data-ref-list]').exists()).toBe(false)
  })

  it('без прав — «Нет доступных разделов»', async () => {
    await mountAt('/references', 'broker', [])
    expect(w.find('[data-system-no-access]').exists()).toBe(true)
  })
})

describe('SystemDataPage — станции и посты', () => {
  it('«Активные / Скрытые n / Все» и поиск', async () => {
    await mountAt('/references?item=stations')
    expect(rowNames()).toEqual(['Алтынколь'])
    expect(segment('Скрытые').text().replace(/\s+/g, ' ')).toBe('Скрытые 1')
    await segment('Скрытые').trigger('click')
    expect(rowNames()).toEqual(['Достык'])
    expect(w.get('[data-item-status]').attributes('data-item-status')).toBe('hidden')
    await segment('Все').trigger('click')
    expect(rowNames()).toEqual(['Алтынколь', 'Достык'])
    await w.get('[data-items-search]').setValue('дост')
    expect(rowNames()).toEqual(['Достык'])
    await w.get('[data-items-search]').setValue('шымкент')
    expect(w.text()).toContain('Ничего не нашлось')
  })

  it('«Скрыть» — с подтверждением; отказ ничего не вызывает', async () => {
    await mountAt('/references?item=stations')
    expect(await openMenu(0)).toEqual(['Скрыть'])
    await choose('Скрыть')
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Скрыть «Алтынколь»?')
    expect(confirmState.danger).toBe(true)
    confirmState.resolve(false)
    await flushPromises()
    expect(api.deleteStation).not.toHaveBeenCalled()

    await openMenu(0)
    await choose('Скрыть')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.deleteStation).toHaveBeenCalledWith('s1')
    expect(api.toast.success).toHaveBeenCalledWith('Запись скрыта')
    expect(api.listStations).toHaveBeenCalledTimes(2)
  })

  it('«Вернуть» скрытую — подтверждение и PUT с isActive=true', async () => {
    await mountAt('/references?item=stations')
    await segment('Скрытые').trigger('click')
    expect(await openMenu(0)).toEqual(['Вернуть'])
    await choose('Вернуть')
    expect(confirmState.title).toBe('Вернуть «Достык»?')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.updateStation).toHaveBeenCalledWith('s2', 'Достык', true)
    expect(api.toast.success).toHaveBeenCalledWith('Запись возвращена')
  })

  it('переименование: окно с названием, PUT с прежней активностью; пустое название не уходит', async () => {
    await mountAt('/references?item=stations')
    await w.get('[data-item-edit]').trigger('click')
    expect(w.get('[data-modal]').attributes('data-title')).toBe('Изменить запись')
    const input = w.get('[data-ref-modal-name]')
    expect((input.element as HTMLInputElement).value).toBe('Алтынколь')
    await input.setValue('  ')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.updateStation).not.toHaveBeenCalled()
    expect(w.text()).toContain('Заполните поле')
    await input.setValue('Алтынколь-экспорт')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.updateStation).toHaveBeenCalledWith('s1', 'Алтынколь-экспорт', true)
    expect(w.find('[data-modal]').exists()).toBe(false)
  })

  it('«Добавить» — POST с названием', async () => {
    await mountAt('/references?item=posts')
    await w.get('[data-ref-add]').trigger('click')
    expect(w.get('[data-modal]').attributes('data-title')).toBe('Новая запись')
    await w.get('[data-ref-modal-name]').setValue('Пост 4')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.createCustomsPost).toHaveBeenCalledWith('Пост 4')
  })
})

describe('SystemDataPage — классификаторы ЕЭК', () => {
  it('правка кода и названия; 409 — «такой код уже есть» под полем; кэш классификатора сбрасывается', async () => {
    await mountAt('/references?item=cls:2009')
    const store = useClassifiersStore()
    const invalidate = vi.spyOn(store, 'invalidate')
    await w.get('[data-item-edit]').trigger('click')
    expect(w.get('[data-modal]').attributes('data-title')).toBe('Изменить код')
    api.updateClassifier.mockRejectedValueOnce(httpError(409))
    await w.get('[data-ref-modal-code]').setValue('02013')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.updateClassifier).toHaveBeenCalledWith('2009-01011', '02013', 'Свидетельство о регистрации', 0, true)
    expect(w.text()).toContain('Такой код уже есть в классификаторе')
    expect(w.find('[data-modal]').exists()).toBe(true)
    await w.get('[data-ref-modal-code]').setValue('01012')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.updateClassifier).toHaveBeenLastCalledWith('2009-01011', '01012', 'Свидетельство о регистрации', 0, true)
    expect(invalidate).toHaveBeenCalledWith('2009')
    expect(api.listClassifierGroups).toHaveBeenCalledTimes(2)
  })

  it('скрытый код возвращается PUT с isActive=true', async () => {
    await mountAt('/references?item=cls:2009')
    await segment('Скрытые').trigger('click')
    expect(rowCodes()).toEqual(['09023'])
    await openMenu(0)
    await choose('Вернуть')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.updateClassifier).toHaveBeenCalledWith('2009-09023', '09023', 'Таможенная расписка', 0, true)
  })

  it('быстрое переключение классификаторов: поздний ответ прежнего не подменяет строки нового', async () => {
    await mountAt('/references?item=stations')
    const slow = deferred<ClassifierItem[]>()
    api.listClassifiers.mockImplementationOnce(() => slow.promise)
    await nav('cls:2009').trigger('click')
    await flushPromises()
    await nav('cls:new-eec').trigger('click')
    await flushPromises()
    expect(rowCodes()).toEqual(['A1'])
    slow.resolve([cls('2009', '01011', 'Свидетельство о регистрации')])
    await flushPromises()
    expect(rowCodes()).toEqual(['A1'])
    expect(w.get('[data-classifier-title]').text()).toBe('new-eec')
  })

  it('«Сверить с ЕЭК»: подтверждение, загрузка с «до 5 минут», затем окно итогов', async () => {
    await mountAt('/references?item=cls:2009')
    const store = useClassifiersStore()
    const invalidate = vi.spyOn(store, 'invalidate')
    const run = deferred<unknown>()
    api.syncEec.mockReturnValueOnce(run.promise)
    await w.get('[data-eec-sync]').trigger('click')
    expect(confirmState.title).toBe('Сверить справочники с ЕЭК и КЕДЕН?')
    confirmState.resolve(false)
    await flushPromises()
    expect(api.syncEec).not.toHaveBeenCalled()

    await w.get('[data-eec-sync]').trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.syncEec).toHaveBeenCalledTimes(1)
    expect(w.get('[data-eec-running]').text()).toContain('до 5 минут')
    run.resolve([
      { target: '2009', source: 'НСИ', sourceTotal: 1490, added: 8, deactivated: 2, error: null },
      { target: 'customs-posts', source: 'КЕДЕН', sourceTotal: 0, added: 0, deactivated: 0, error: 'timeout' },
    ])
    await flushPromises()
    expect(w.find('[data-eec-running]').exists()).toBe(false)
    expect(api.toast.warning).toHaveBeenCalledWith('Сверка завершена частично: добавлено 8, скрыто 2, не удалось — 1')
    const modal = w.get('[data-modal][data-title="Итоги сверки с ЕЭК и КЕДЕН"]')
    expect(modal.findAll('[data-eec-target]').map((e) => e.text())).toEqual(['Виды документов (2009)', 'Таможенные посты ЕЭК'])
    expect(modal.text()).toContain('timeout')
    expect(invalidate).toHaveBeenCalledWith()
  })
})

describe('SystemDataPage — реестры', () => {
  it('СВХ: подписи говорят, куда идёт загрузка; «Обновить из КЕДЕН» — СВХ, ТС и ТРОИС, до 5 минут, счётчики перечитываются', async () => {
    await mountAt('/references?item=warehouses')
    const panel = w.get('[data-registry="warehouses"]')
    expect(panel.get('[data-wh-upload="svh"]').text()).toBe('Загрузить СВХ (xlsx) в реестр КГД')
    expect(panel.get('[data-keden-caption]').text()).toBe('СВХ, таможенные склады и ТРОИС')
    const run = deferred<unknown>()
    api.kedenRefresh.mockReturnValueOnce(run.promise)
    await panel.get('[data-keden-refresh]').trigger('click')
    await flushPromises()
    expect(w.get('[data-registry-long]').text()).toBe('Это может занять до 5 минут.')
    run.resolve({ registries: [{ registry: 'svh', total: 301, added: 1, updated: 0, removed: 0, error: null }] })
    await flushPromises()
    expect(api.toast.success).toHaveBeenCalledWith('Склады временного хранения: в выгрузке 301, добавлено 1, обновлено 0, удалено 0')
    expect(api.troisStatus).toHaveBeenCalledTimes(2)
    expect(w.find('[data-registry-long]').exists()).toBe(false)
  })

  it('НСИ КГД: свои подписи загрузок — не путаются с реестром КГД', async () => {
    await mountAt('/references?item=nsi')
    expect(w.get('[data-nsi-upload="svh"]').text()).toBe('Загрузить СВХ (xlsx) в НСИ КГД')
    expect(w.get('[data-nsi-upload="ts"]').text()).toBe('Загрузить таможенные склады (xlsx) в НСИ КГД')
  })

  it('ошибка статуса реестра — «Не удалось загрузить» и «Повторить»', async () => {
    api.troisStatus.mockRejectedValue(httpError(500))
    await mountAt('/references?item=trois')
    expect(w.get('[data-registry-error]').text()).toContain('Не удалось загрузить')
    api.troisStatus.mockResolvedValue({ total: 1, active: 1, importedAtUtc: null })
    await w.get('[data-registry-retry]').trigger('click')
    await flushPromises()
    expect(w.find('[data-registry-error]').exists()).toBe(false)
  })
})

describe('SystemDataPage — синхронизация ТН ВЭД', () => {
  it('история: статус, длительность, +~−, ставки, кто запустил; ошибка раскрывается', async () => {
    api.syncHistory.mockResolvedValue({ data: [
      log({ id: 2, status: 'Failed', triggeredBy: 'admin:42', errorMessage: 'КЕДЕН не ответил', finishedAtUtc: '2026-10-06T03:00:40Z' }),
      log({ id: 1 }),
    ] })
    await mountAt('/tnved/sync', 'broker', ['tnved.manage'])
    const rows = w.findAll('[data-sync-row]')
    expect(rows.map((r) => r.attributes('data-status'))).toEqual(['Failed', 'Completed'])
    expect(rows[0].text()).toContain('Ошибка')
    expect(rows[0].get('[data-sync-duration]').text()).toContain('40 с')
    expect(rows[0].get('[data-sync-by]').text()).toBe('вручную')
    expect(rows[1].get('[data-sync-changes]').text().replace(/\s+/g, '')).toBe('+3~12−1')
    expect(rows[1].get('[data-sync-duration]').text()).toContain('2 мин')
    expect(rows[1].get('[data-sync-by]').text()).toBe('по расписанию')
    expect(rows[0].find('[data-sync-error-text]').exists()).toBe(false)
    await rows[0].get('[data-sync-error-toggle]').trigger('click')
    expect(rows[0].get('[data-sync-error-text]').text()).toBe('КЕДЕН не ответил')
    expect(rows[1].find('[data-sync-error-toggle]').exists()).toBe(false)
  })

  it('«Запустить синхронизацию» — подтверждение, «выполняется…» до ответа, затем история заново', async () => {
    await mountAt('/tnved/sync', 'broker', ['tnved.manage'])
    await w.get('[data-sync-run]').trigger('click')
    expect(confirmState.title).toBe('Запустить синхронизацию ТН ВЭД?')
    confirmState.resolve(false)
    await flushPromises()
    expect(api.syncTrigger).not.toHaveBeenCalled()

    const run = deferred<unknown>()
    api.syncTrigger.mockReturnValueOnce(run.promise)
    await w.get('[data-sync-run]').trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(w.get('[data-sync-running]').text()).toContain('выполняется')
    run.resolve({ data: {} })
    await flushPromises()
    expect(w.find('[data-sync-running]').exists()).toBe(false)
    expect(api.toast.success).toHaveBeenCalledWith('Синхронизация завершена')
    expect(api.syncHistory).toHaveBeenCalledTimes(2)
  })

  it('«Загрузить переходы» — итог тостом', async () => {
    api.seedTransitions.mockResolvedValue({ data: { inserted: 120, total: 120, sourceVersion: '2026-10' } })
    await mountAt('/tnved/sync', 'broker', ['tnved.manage'])
    await w.get('[data-sync-seed]').trigger('click')
    await flushPromises()
    expect(api.toast.success).toHaveBeenCalledWith('Переходы кодов загружены: 120 записей (2026-10)')
  })
})

describe('маршруты', () => {
  it('/references и /tnved/sync ведут на «Данные системы» с прежними гейтами', async () => {
    const { default: realRouter } = await import('@/router')
    const refs = realRouter.resolve('/references')
    const sync = realRouter.resolve('/tnved/sync')
    expect(refs.meta.requiresRole).toBe('administrator')
    expect(sync.meta.requiresPermission).toBe('tnved.manage')
    const load = async (r: typeof refs) => {
      const c = r.matched[r.matched.length - 1].components!.default as () => Promise<{ default: unknown }>
      return (await c()).default
    }
    expect(await load(refs)).toBe(SystemDataPage)
    expect(await load(sync)).toBe(SystemDataPage)
  })
})
