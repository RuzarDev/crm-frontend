import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { DocumentPackageDto } from '@/types/api'
import { container, pkg } from '../../partia/__tests__/packageFixture'
import { App, BROKER, as, httpError, makeRouter, mockMedia, settle, stubs } from './harness'

const api = vi.hoisted(() => ({
  getById: vi.fn(), linkFile: vi.fn(), uploadFile: vi.fn(), deleteFile: vi.fn(), downloadFile: vi.fn(), changeStatus: vi.fn(),
  createContainer: vi.fn(), updateContainer: vi.fn(), deleteContainer: vi.fn(), deleteClientConsolidation: vi.fn(), generateRows: vi.fn(),
}))
const onboarding = vi.hoisted(() => ({ list: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
const saveBlob = vi.hoisted(() => vi.fn())
vi.mock('@/api/documentPackages', () => ({ documentPackagesApi: api }))
vi.mock('@/api/clientsOnboarding', () => ({ clientsOnboardingApi: onboarding }))
vi.mock('@/ui/message', () => ({ message: toast }))
vi.mock('@/ui/download', () => ({ saveBlob }))

import WorkspacePage from '../WorkspacePage.vue'
import { confirmState } from '@/ui/confirm'

let w: VueWrapper
let router: Router

const mountPage = async (data: DocumentPackageDto | Error = pkg()) => {
  if (data instanceof Error) api.getById.mockRejectedValueOnce(data)
  else api.getById.mockResolvedValue(data)
  await router.push('/document-packages/pkg1/workspace')
  w = mountWithI18n(App, { attachTo: document.body, global: { plugins: [router], stubs } })
  await settle()
}
const has = (sel: string) => w.find(sel).exists()
const fileRow = (id: string) => w.get(`[data-ws-file][data-file-id="${id}"]`)
const menuItems = (root: { findAll: VueWrapper['findAll'] }) => root.findAll('[data-menu-item]').map((b) => b.attributes('data-menu-item'))

beforeEach(async () => {
  setActivePinia(createPinia())
  mockMedia(false)
  router = makeRouter(WorkspacePage)
  onboarding.list.mockResolvedValue([{ id: 'u-k', username: 'kazakhmys', companyName: 'ТОО «Казахмыс Трейд»' }])
  api.linkFile.mockImplementation(async () => pkg())
  api.uploadFile.mockResolvedValue({})
  api.deleteFile.mockResolvedValue(undefined)
  api.generateRows.mockResolvedValue({ generatedRowsCount: 0 })
  as('importer', BROKER)
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('WorkspacePage: состояния', () => {
  it('пакет загружается тихо (silent) — шапка, файлы, контейнеры', async () => {
    await mountPage()
    expect(api.getById).toHaveBeenCalledWith('pkg1', { silent: true })
    expect(w.get('[data-ws-title]').text()).toBe('Поезд 1234')
    expect(w.findAll('[data-ws-file]')).toHaveLength(4)
    expect(w.findAll('[data-ws-container]')).toHaveLength(2)
  })

  it('404 — «Пакет не найден» со ссылкой к пакетам', async () => {
    await mountPage(httpError(404))
    expect(w.get('[data-ws-not-found]').text()).toContain('Пакет не найден')
    expect(w.get('[data-ws-not-found] a').attributes('href')).toBe('/document-packages')
    expect(has('[data-ws-header]')).toBe(false)
  })

  it('прочая ошибка — «Не удалось открыть пакет» и «Повторить»', async () => {
    await mountPage(httpError(500))
    expect(w.get('[data-ws-error]').text()).toContain('Не удалось открыть пакет')
    api.getById.mockResolvedValue(pkg())
    await w.get('[data-ws-retry]').trigger('click')
    await settle()
    expect(has('[data-ws-error]')).toBe(false)
    expect(w.get('[data-ws-title]').text()).toBe('Поезд 1234')
  })
})

describe('WorkspacePage: шапка и плашка решения', () => {
  it('статус из списка пакетов, экспедитор, счётчики контейнеров и партий', async () => {
    await mountPage(pkg({ status: 'accepted' }))
    expect(w.get('[data-ws-status]').text()).toBe('Принят брокером')
    const meta = w.get('[data-ws-meta]').text()
    expect(meta).toContain('экспедитор expeditor')
    expect(w.get('[data-ws-counts]').text().replace(/\s+/g, ' ')).toBe('2 контейнера · 1 партия')
    expect(has('[data-ws-banner]')).toBe(false)
  })

  it('«Нужна правка» с замечанием — золотая плашка; «Изменить решение» открывает окно решения', async () => {
    await mountPage(pkg({ status: 'needsFix', reviewComment: 'нет веса брутто', reviewedAtUtc: '2026-10-08T05:02:00Z' }))
    const banner = w.get('[data-ws-banner]').text()
    expect(banner).toContain('Вернули экспедитору на правку')
    expect(banner).toContain('«нет веса брутто»')
    expect(has('[data-package-status-modal]')).toBe(false)
    await w.get('[data-ws-banner-change]').trigger('click')
    await settle()
    expect(has('[data-package-status-modal]')).toBe(true)
  })

  it('«Решение по пакету» меняет статус через окно волны 3а, страница берёт пакет из ответа', async () => {
    api.changeStatus.mockResolvedValue(pkg({ status: 'accepted' }))
    await mountPage()
    await w.get('[data-ws-decide]').trigger('click')
    await settle()
    await w.get('[data-radio="accepted"]').trigger('click')
    await w.get('[data-package-status-modal] [data-ok]').trigger('click')
    await settle()
    expect(api.changeStatus).toHaveBeenCalledWith('pkg1', { status: 'accepted', reviewComment: null })
    expect(w.get('[data-ws-status]').text()).toBe('Принят брокером')
  })
})

describe('WorkspacePage: «Сформировать строки реестра»', () => {
  it('спрашивает подтверждение с числом партий; «нет» — ничего не уходит', async () => {
    await mountPage()
    await w.get('[data-ws-generate]').trigger('click')
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Сформировать строки по 1 партии?')
    expect(confirmState.content).toBe('Уже созданные строки не дублируются.')
    confirmState.resolve(false)
    await settle()
    expect(api.generateRows).not.toHaveBeenCalled()
  })

  it('создано n > 0 — тост «Создано строк: n» и переход в реестр', async () => {
    api.generateRows.mockResolvedValue({ generatedRowsCount: 3 })
    await mountPage()
    await w.get('[data-ws-generate]').trigger('click')
    confirmState.resolve(true)
    await settle()
    expect(api.generateRows).toHaveBeenCalledWith('pkg1')
    expect(toast.success).toHaveBeenCalledWith('Создано строк: 3')
    expect(router.currentRoute.value.path).toBe('/reestr')
  })

  it('0 — «Новых партий для формирования нет», пакет перечитывается (сервер ставит «Обработан»)', async () => {
    await mountPage()
    api.getById.mockResolvedValue(pkg({ status: 'processed' }))
    await w.get('[data-ws-generate]').trigger('click')
    confirmState.resolve(true)
    await settle()
    expect(toast.info).toHaveBeenCalledWith('Новых партий для формирования нет')
    expect(router.currentRoute.value.path).toBe('/document-packages/pkg1/workspace')
    expect(w.get('[data-ws-status]').text()).toBe('Обработан')
  })

  it('без партий кнопка выключена', async () => {
    await mountPage(pkg({ containers: [container({ consolidations: [] })] }))
    expect(w.get('[data-ws-generate]').attributes('disabled')).toBeDefined()
  })
})

describe('WorkspacePage: файлы', () => {
  it('привязка через «Привязать к…» сохраняет documentType инвойса (баг)', async () => {
    await mountPage()
    await fileRow('f-inv').get('[data-menu-item="link"]').trigger('click')
    await settle()
    const modal = w.get('[data-ws-link-menu]')
    expect(modal.get('[data-link-choice="p:p1"]').attributes('aria-current')).toBe('true')
    await modal.get('[data-link-choice="c:c2"]').trigger('click')
    await settle()
    expect(api.linkFile).toHaveBeenCalledTimes(1)
    expect(api.linkFile).toHaveBeenCalledWith('pkg1', 'f-inv', { containerId: 'c2', clientConsolidationId: null, documentType: 'invoice' })
    expect(toast.success).toHaveBeenCalledWith('Файл привязан')
  })

  it('выбор текущего места запроса не шлёт; «Не распределять» отвязывает', async () => {
    await mountPage()
    await fileRow('f-rail').get('[data-menu-item="link"]').trigger('click')
    await settle()
    await w.get('[data-link-choice="c:c1"]').trigger('click')
    await settle()
    expect(api.linkFile).not.toHaveBeenCalled()
    await fileRow('f-rail').get('[data-menu-item="link"]').trigger('click')
    await settle()
    await w.get('[data-link-choice="none"]').trigger('click')
    await settle()
    expect(api.linkFile).toHaveBeenCalledWith('pkg1', 'f-rail', { containerId: null, clientConsolidationId: null, documentType: null })
    expect(toast.success).toHaveBeenCalledWith('Файл больше не распределён')
  })

  it('удаление файла — с подтверждением; после — пакет перечитывается', async () => {
    await mountPage()
    await fileRow('f-free').get('[data-menu-item="delete"]').trigger('click')
    expect(confirmState.title).toBe('Удалить файл «free.pdf»?')
    expect(confirmState.danger).toBe(true)
    api.getById.mockResolvedValue(pkg({ files: pkg().files.filter((f) => f.id !== 'f-free') }))
    confirmState.resolve(true)
    await settle()
    expect(api.deleteFile).toHaveBeenCalledWith('pkg1', 'f-free')
    expect(toast.success).toHaveBeenCalledWith('Файл удалён')
    expect(w.findAll('[data-ws-file]')).toHaveLength(3)
  })

  it('загрузка: тип и размер проверяются до отправки, файлы уходят по очереди, итог «Загружено n из m»', async () => {
    await mountPage()
    api.uploadFile.mockResolvedValueOnce({}).mockRejectedValueOnce(httpError(400))
    const input = w.get('[data-ws-files] input[type="file"]')
    const big = new File(['x'], 'big.pdf')
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 })
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [new File(['a'], 'a.pdf'), new File(['b'], 'virus.exe'), big, new File(['c'], 'c.xlsx')],
    })
    await input.trigger('change')
    await settle()
    expect(toast.error).toHaveBeenCalledTimes(2) // virus.exe и big.pdf — до отправки
    expect(api.uploadFile.mock.calls.map((c) => (c[1] as File).name)).toEqual(['a.pdf', 'c.xlsx'])
    expect(toast.warning).toHaveBeenCalledWith('Загружено 1 из 2')
    expect(api.getById).toHaveBeenCalledTimes(2)
  })

  it('просмотр: глаз открывает шторку и берёт файл', async () => {
    api.downloadFile.mockResolvedValue(new Blob(['%PDF']))
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x')
    globalThis.URL.revokeObjectURL = vi.fn()
    await mountPage()
    await fileRow('f-free').get('[data-ws-file-preview]').trigger('click')
    await settle()
    expect(api.downloadFile).toHaveBeenCalledWith('pkg1', 'f-free')
    expect(w.get('[data-ws-preview-pdf]').attributes('src')).toBe('blob:x')
  })
})

describe('WorkspacePage: контейнеры и партии', () => {
  it('партия подписана компанией клиента (список клиентов), «Открыть» и «+ Клиент» ведут в редактор партии', async () => {
    await mountPage()
    expect(onboarding.list).toHaveBeenCalledWith({ silent: true })
    expect(w.get('[data-ws-partia-client]').text()).toBe('ТОО «Казахмыс Трейд»')
    await w.get('[data-ws-partia-open]').trigger('click')
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/document-packages/pkg1/partia/p1')
  })

  it('«+ Клиент» — новая партия в этом контейнере', async () => {
    await mountPage()
    await w.findAll('[data-ws-add-partia]')[1].trigger('click')
    await settle()
    expect(router.currentRoute.value.fullPath).toBe('/document-packages/pkg1/partia/new?container=c2')
  })

  it('без clients.read — логин клиента, список клиентов не запрашивается', async () => {
    as('importer', ['reestr.read', 'reestr.write', 'packages.manage'])
    await mountPage()
    expect(onboarding.list).not.toHaveBeenCalled()
    expect(w.get('[data-ws-partia-client]').text()).toBe('kazakhmys')
  })

  it('«Добавить контейнер»: номер обязателен, затем createContainer и пакет из ответа', async () => {
    const added = pkg({ containers: [...pkg().containers, container({ id: 'c3', containerNumber: 'ABCD1234567', consolidations: [] })] })
    api.createContainer.mockResolvedValue(added)
    await mountPage()
    await w.get('[data-ws-add-container]').trigger('click')
    await settle()
    await w.get('[data-ws-container-modal] [data-ok]').trigger('click')
    await settle()
    expect(api.createContainer).not.toHaveBeenCalled()
    expect(w.get('[data-ws-container-modal]').text()).toContain('Укажите номер контейнера')
    await w.get('input[data-ws-modal-number]').setValue(' ABCD1234567 ')
    await w.get('[data-ws-container-modal] [data-ok]').trigger('click')
    await settle()
    expect(api.createContainer).toHaveBeenCalledWith('pkg1', { containerNumber: 'ABCD1234567', secondaryContainerNumber: null })
    expect(has('[data-ws-container-modal]')).toBe(false)
    expect(w.findAll('[data-ws-container]')).toHaveLength(3)
    expect(toast.success).toHaveBeenCalledWith('Контейнер добавлен')
  })

  it('«Изменить» контейнер — окно с номерами, updateContainer; отказ сервера оставляет окно открытым', async () => {
    api.updateContainer.mockRejectedValueOnce(httpError(400))
    await mountPage()
    await w.findAll('[data-ws-container]')[1].get('[data-menu-item="edit"]').trigger('click')
    await settle()
    expect(w.get('[data-ws-container-modal]').attributes('data-title')).toBe('Контейнер TCLU 123456 7')
    expect((w.get('input[data-ws-modal-secondary]').element as HTMLInputElement).value).toBe('CN-77')
    await w.get('[data-ws-container-modal] [data-ok]').trigger('click')
    await settle()
    expect(api.updateContainer).toHaveBeenCalledWith('pkg1', 'c2', { containerNumber: 'TCLU 1234567', secondaryContainerNumber: 'CN-77' })
    expect(has('[data-ws-container-modal]')).toBe(true)
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('удаление контейнера и партии — с подтверждением', async () => {
    api.deleteContainer.mockResolvedValue(pkg({ containers: [container()] }))
    api.deleteClientConsolidation.mockResolvedValue(pkg({ containers: [container({ consolidations: [] })] }))
    await mountPage()
    await w.findAll('[data-ws-container]')[1].get('[data-menu-item="delete"]').trigger('click')
    expect(confirmState.title).toBe('Удалить контейнер и его партии?')
    expect(confirmState.content).toBe('Файлы останутся нераспределёнными.')
    confirmState.resolve(true)
    await settle()
    expect(api.deleteContainer).toHaveBeenCalledWith('pkg1', 'c2')
    expect(w.findAll('[data-ws-container]')).toHaveLength(1)

    await w.get('[data-ws-partia] [data-menu-item="delete"]').trigger('click')
    expect(confirmState.title).toBe('Удалить партию «ТОО «Казахмыс Трейд»»?')
    confirmState.resolve(true)
    await settle()
    expect(api.deleteClientConsolidation).toHaveBeenCalledWith('pkg1', 'c1', 'p1')
    expect(toast.success).toHaveBeenCalledWith('Партия удалена')
    expect(has('[data-ws-partia]')).toBe(false)
  })
})

describe('WorkspacePage: права', () => {
  const editSelectors = ['[data-ws-generate]', '[data-ws-add-container]', '[data-ws-add-partia]', '[data-ws-container-more]', '[data-ws-partia-more]']

  it('экспедитор (reestr.read): дерево только для чтения, файлы — загрузка и удаление, пока пакет «Загружен»', async () => {
    as('expeditor', ['reestr.read', 'clients.read'])
    await mountPage()
    for (const sel of editSelectors) expect(has(sel), sel).toBe(false)
    expect(has('[data-ws-decide]')).toBe(false)
    expect(menuItems(fileRow('f-free'))).toEqual(['download', 'delete'])
    expect(has('[data-ws-upload]')).toBe(true)
    expect(fileRow('f-free').attributes('draggable')).toBe('false')
    expect(has('[data-ws-partia-open]')).toBe(true)
  })

  it('экспедитор и принятый пакет — без загрузки и удаления', async () => {
    as('expeditor', ['reestr.read'])
    await mountPage(pkg({ status: 'accepted' }))
    expect(menuItems(fileRow('f-free'))).toEqual(['download'])
    expect(has('[data-ws-upload]')).toBe(false)
  })

  it('packages.manage без reestr.write — нет «Решения по пакету» и правки; файлы — можно (canModifyFiles)', async () => {
    as('importer', ['reestr.read', 'packages.manage'])
    await mountPage(pkg({ status: 'needsFix', reviewComment: 'нет веса' }))
    expect(has('[data-ws-decide]')).toBe(false)
    expect(has('[data-ws-banner-change]')).toBe(false)
    for (const sel of editSelectors) expect(has(sel), sel).toBe(false)
    expect(menuItems(fileRow('f-free'))).toEqual(['download', 'delete'])
  })

  it('брокер: всё на месте', async () => {
    await mountPage()
    for (const sel of editSelectors) expect(has(sel), sel).toBe(true)
    expect(has('[data-ws-decide]')).toBe(true)
    expect(menuItems(fileRow('f-free'))).toEqual(['link', 'download', 'delete'])
    expect(fileRow('f-free').attributes('draggable')).toBe('true')
  })
})
