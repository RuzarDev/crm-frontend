import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { mountWithI18n } from '@/test/mountWithI18n'
import type { DocumentPackageDto } from '@/types/api'

const api = vi.hoisted(() => ({
  getById: vi.fn(), changeStatus: vi.fn(), uploadFile: vi.fn(), deleteFile: vi.fn(), downloadFile: vi.fn(), saveBlob: vi.fn(),
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}))
vi.mock('@/api/documentPackages', () => ({
  documentPackagesApi: {
    getById: api.getById, changeStatus: api.changeStatus, uploadFile: api.uploadFile, deleteFile: api.deleteFile, downloadFile: api.downloadFile,
  },
}))
vi.mock('@/ui/message', () => ({ message: api.toast }))
vi.mock('@/ui/download', () => ({ saveBlob: api.saveBlob }))

import PackageDrawer from '../PackageDrawer.vue'
import PackageStatusModal from '../PackageStatusModal.vue'
import { useAuthStore } from '@/stores/auth'
import { confirmState } from '@/ui/confirm'

// Панель, окно и выбор — заглушки: проверяется состав панели и запросы, а не механика Reka.
const DrawerStub = {
  props: ['open'], emits: ['update:open'],
  template: '<div v-if="open" data-drawer><div data-drawer-title><slot name="title" /></div><slot /><div v-if="$slots.footer" data-drawer-footer><slot name="footer" /></div></div>',
}
const ModalStub = {
  props: ['open', 'okButtonProps'], emits: ['ok', 'update:open'],
  template: '<div v-if="open" data-modal><slot /><button data-ok type="button" :disabled="okButtonProps?.disabled" @click="$emit(\'ok\')" /></div>',
}
const RadioStub = {
  props: ['value', 'options'], emits: ['update:value'],
  template: '<div><button v-for="o in options" :key="o.value" type="button" :data-radio="o.value" :data-on="String(o.value === value)" @click="$emit(\'update:value\', o.value)">{{ o.label }}</button></div>',
}
const UploadStub = defineComponent({
  emits: ['select'],
  setup: (_, { emit }) => () => h('button', { type: 'button', onClick: () => emit('select', [new File(['x'], 'new.pdf')]) }),
})

const pkg = (o: Partial<DocumentPackageDto> = {}): DocumentPackageDto => ({
  id: 'p1', trainNumber: '2457', comment: 'срочно', status: 'needsFix', createdByExpeditorId: 'e1', createdByExpeditorUsername: 'Ақжол Логистик',
  createdAtUtc: '2026-10-08T04:14:00Z', updatedAtUtc: '2026-10-08T04:14:00Z', reviewedByUserId: null, reviewedAtUtc: null,
  reviewComment: 'нет веса брутто', files: [], containers: [],
  ...o,
})
const FULL = pkg({
  containers: [
    { id: 'c1', packageId: 'p1', containerNumber: 'MRSU4885849', secondaryContainerNumber: 'TGHU3102241', consolidations: [{}, {}] as never },
    { id: 'c2', packageId: 'p1', containerNumber: 'DRYU9953726', secondaryContainerNumber: null, consolidations: [{}] as never },
  ],
  files: [
    { id: 'f1', packageId: 'p1', originalFileName: 'Инвойс 2457.pdf', contentType: 'application/pdf', sizeBytes: 412 * 1024, uploadedByUserId: 'u', uploadedAtUtc: '2026-10-01T04:00:00Z' },
  ],
})

let w: VueWrapper
let router: Router
const as = (role: string, perms: string[]) => {
  const auth = useAuthStore()
  auth.role = role
  auth.permissions = perms
}
const mountDrawer = async (row: DocumentPackageDto = pkg()) => {
  w = mountWithI18n(PackageDrawer, {
    attachTo: document.body,
    props: { open: true, row },
    global: { plugins: [router], stubs: { ZDrawer: DrawerStub, ZModal: ModalStub, ZRadioGroup: RadioStub, ZUpload: UploadStub } },
  })
  await flushPromises()
}
const has = (sel: string) => w.find(sel).exists()

beforeEach(async () => {
  setActivePinia(createPinia())
  router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
  await router.push('/document-packages')
  api.getById.mockResolvedValue(FULL)
  api.changeStatus.mockResolvedValue(pkg({ status: 'accepted' }))
  api.uploadFile.mockResolvedValue({})
  api.deleteFile.mockResolvedValue(undefined)
  api.downloadFile.mockResolvedValue(new Blob(['x']))
  as('importer', ['reestr.read', 'packages.manage'])
})
afterEach(() => {
  w?.unmount()
  document.body.innerHTML = ''
  confirmState.resolve(false)
  vi.clearAllMocks()
})

describe('PackageDrawer: загрузка и состав', () => {
  it('сначала данные строки со скелетоном контейнеров, затем getById подставляет контейнеры и файлы', async () => {
    let done: (d: DocumentPackageDto) => void = () => {}
    api.getById.mockReturnValueOnce(new Promise<DocumentPackageDto>((r) => { done = r }))
    w = mountWithI18n(PackageDrawer, {
      attachTo: document.body, props: { open: true, row: pkg() },
      global: { plugins: [router], stubs: { ZDrawer: DrawerStub, ZModal: ModalStub, ZRadioGroup: RadioStub, ZUpload: UploadStub } },
    })
    await flushPromises()
    expect(w.get('[data-package-title]').text()).toBe('2457')
    expect(w.get('[data-package-comment]').text()).toBe('срочно')
    expect(has('[data-package-skeleton]')).toBe(true)
    expect(w.findAll('[data-package-container]')).toHaveLength(0)
    done(FULL)
    await flushPromises()
    expect(has('[data-package-skeleton]')).toBe(false)
    expect(api.getById).toHaveBeenCalledWith('p1', { silent: true })
    expect(w.findAll('[data-package-container]').map((c) => c.text())).toEqual([
      expect.stringContaining('MRSU 488584 9'),
      expect.stringContaining('DRYU 995372 6'),
    ])
    expect(w.findAll('[data-package-container]')[0].text()).toContain('прицеп TGHU 310224 1')
    expect(w.findAll('[data-package-container]')[0].text()).toContain('получателей: 2')
    expect(w.get('[data-containers-count]').text()).toBe('2')
    expect(w.get('[data-files-count]').text()).toBe('1')
    expect(w.get('[data-package-file]').text()).toContain('Инвойс 2457.pdf')
    expect(w.get('[data-package-file]').text()).toContain('412 КБ')
  })

  it('шапка: статус, экспедитор и дата; золотая плашка — только при комментарии проверки', async () => {
    await mountDrawer()
    expect(w.get('[data-package-status]').text()).toBe('Нужно исправить')
    expect(w.get('[data-drawer-title]').text()).toContain('экспедитор Ақжол Логистик · 08.10.2026')
    expect(w.get('[data-package-review-comment]').text()).toContain('нет веса брутто')
    w.unmount()
    api.getById.mockResolvedValue({ ...FULL, reviewComment: null })
    await mountDrawer(pkg({ reviewComment: null }))
    expect(has('[data-package-review-comment]')).toBe(false)
  })

  it('getById упал: блок ошибки с «Повторить» вместо контейнеров', async () => {
    api.getById.mockRejectedValueOnce(new Error('500'))
    await mountDrawer()
    expect(has('[data-package-error]')).toBe(true)
    await w.get('[data-package-retry]').trigger('click')
    await flushPromises()
    expect(has('[data-package-error]')).toBe(false)
    expect(w.findAll('[data-package-container]')).toHaveLength(2)
  })
})

describe('PackageDrawer: права', () => {
  it('«Открыть пакет» и «Сменить статус» — только при packages.manage', async () => {
    await mountDrawer()
    expect(has('[data-package-workspace]')).toBe(true)
    expect(has('[data-package-change-status]')).toBe(true)
    await w.get('[data-package-workspace]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/document-packages/p1/workspace')
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
    w.unmount()
    as('expeditor', ['reestr.read'])
    await mountDrawer()
    expect(has('[data-package-workspace]')).toBe(false)
    expect(has('[data-package-change-status]')).toBe(false)
    expect(has('[data-drawer-footer]')).toBe(false)
  })

  it('брокер с packages.manage видит загрузку и удаление на принятом пакете (как на сервере)', async () => {
    api.getById.mockResolvedValue({ ...FULL, status: 'accepted' })
    await mountDrawer(pkg({ status: 'accepted' }))
    expect(has('[data-package-upload]')).toBe(true)
    expect(has('[data-file-delete]')).toBe(true)
  })

  it('экспедитор: загрузка и удаление — пока «Нужна правка», на принятом — только скачивание', async () => {
    as('expeditor', ['reestr.read'])
    await mountDrawer()
    expect(has('[data-package-upload]')).toBe(true)
    expect(has('[data-file-delete]')).toBe(true)
    w.unmount()
    api.getById.mockResolvedValue({ ...FULL, status: 'accepted' })
    await mountDrawer(pkg({ status: 'accepted' }))
    expect(has('[data-package-upload]')).toBe(false)
    expect(has('[data-file-delete]')).toBe(false)
    expect(has('[data-file-download]')).toBe(true)
  })
})

describe('PackageDrawer: смена статуса', () => {
  const openStatus = async () => {
    await w.get('[data-package-change-status]').trigger('click')
    await flushPromises()
  }

  it('комментарий подставлен текущий и уходит вместе со статусом; панель и список обновляются', async () => {
    await mountDrawer()
    await openStatus()
    expect((w.get('[data-package-status-comment]').element as HTMLTextAreaElement).value).toBe('нет веса брутто')
    await w.get('[data-radio="accepted"]').trigger('click')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.changeStatus).toHaveBeenCalledWith('p1', { status: 'accepted', reviewComment: 'нет веса брутто' })
    expect(api.toast.success).toHaveBeenCalledWith('Статус обновлен')
    expect(w.emitted('changed')).toHaveLength(1)
    expect(has('[data-modal]')).toBe(false)
    expect(w.get('[data-package-status]').text()).toBe('Принят брокером')
  })

  it('пустой комментарий уходит как null; пробелы по краям убираются', async () => {
    await mountDrawer()
    await openStatus()
    await w.get('[data-radio="processed"]').trigger('click')
    await w.get('[data-package-status-comment]').setValue('  ')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.changeStatus).toHaveBeenCalledWith('p1', { status: 'processed', reviewComment: null })
    w.unmount()
    await mountDrawer()
    await openStatus()
    await w.get('[data-package-status-comment]').setValue('  проверьте вес ')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.changeStatus).toHaveBeenLastCalledWith('p1', { status: 'needsFix', reviewComment: 'проверьте вес' })
  })

  it('«Нужно исправить» без комментария не отправляется — ошибка по месту', async () => {
    await mountDrawer()
    await openStatus()
    await w.get('[data-package-status-comment]').setValue('')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(api.changeStatus).not.toHaveBeenCalled()
    expect(w.text()).toContain('Опишите, что нужно исправить')
    expect(has('[data-modal]')).toBe(true)
  })

  it('«Загружен» выставить нельзя: у такого пакета выбора нет, сохранить нельзя', async () => {
    api.getById.mockResolvedValue({ ...FULL, status: 'uploaded', reviewComment: null })
    await mountDrawer(pkg({ status: 'uploaded', reviewComment: null }))
    await openStatus()
    expect(w.findAll('[data-radio]').map((b) => b.attributes('data-radio'))).toEqual(['accepted', 'needsFix', 'processed'])
    expect(w.findAll('[data-radio][data-on="true"]')).toHaveLength(0)
    expect(w.get('[data-ok]').attributes('disabled')).toBeDefined()
  })

  it('отказ сервера: окно остаётся открытым, список не обновляется', async () => {
    api.changeStatus.mockRejectedValueOnce(new Error('403'))
    await mountDrawer()
    await openStatus()
    await w.get('[data-radio="accepted"]').trigger('click')
    await w.get('[data-ok]').trigger('click')
    await flushPromises()
    expect(has('[data-modal]')).toBe(true)
    expect(w.emitted('changed')).toBeUndefined()
    expect(api.toast.success).not.toHaveBeenCalled()
  })
})

describe('PackageDrawer: файлы', () => {
  it('«Загрузить» грузит файлы по одному, обновляет панель и сообщает списку', async () => {
    await mountDrawer()
    await w.get('[data-package-upload]').trigger('click')
    await flushPromises()
    expect(api.uploadFile).toHaveBeenCalledTimes(1)
    expect(api.uploadFile.mock.calls[0][0]).toBe('p1')
    expect((api.uploadFile.mock.calls[0][1] as File).name).toBe('new.pdf')
    expect(api.toast.success).toHaveBeenCalledWith('Файлы загружены')
    expect(api.getById).toHaveBeenCalledTimes(2)
    expect(w.emitted('changed')).toHaveLength(1)
  })

  it('сбой загрузки: без «Файлы загружены», но панель всё равно перечитывается', async () => {
    api.uploadFile.mockRejectedValueOnce(new Error('400'))
    await mountDrawer()
    await w.get('[data-package-upload]').trigger('click')
    await flushPromises()
    expect(api.toast.success).not.toHaveBeenCalled()
    expect(api.getById).toHaveBeenCalledTimes(2)
  })

  it('«Скачать» отдаёт файл браузеру под его именем', async () => {
    await mountDrawer()
    await w.get('[data-file-download]').trigger('click')
    await flushPromises()
    expect(api.downloadFile).toHaveBeenCalledWith('p1', 'f1')
    expect(api.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'Инвойс 2457.pdf')
  })

  it('«Удалить» спрашивает подтверждение; без «да» ничего не уходит', async () => {
    await mountDrawer()
    await w.get('[data-file-delete]').trigger('click')
    expect(confirmState.open).toBe(true)
    expect(confirmState.title).toBe('Удалить файл «Инвойс 2457.pdf»?')
    expect(confirmState.danger).toBe(true)
    confirmState.resolve(false)
    await flushPromises()
    expect(api.deleteFile).not.toHaveBeenCalled()

    await w.get('[data-file-delete]').trigger('click')
    confirmState.resolve(true)
    await flushPromises()
    expect(api.deleteFile).toHaveBeenCalledWith('p1', 'f1')
    expect(api.toast.success).toHaveBeenCalledWith('Файл удален')
    expect(w.emitted('changed')).toHaveLength(1)
  })
})

describe('PackageDrawer: переключение пакетов', () => {
  const B = pkg({ id: 'p2', trainNumber: '2460', status: 'needsFix' })
  const B_FULL = { ...B, containers: [{ id: 'c9', packageId: 'p2', containerNumber: 'TGHU0000001', secondaryContainerNumber: null, consolidations: [] as never }] }
  const deferred = <T,>() => {
    let resolve!: (v: T) => void
    const promise = new Promise<T>((r) => { resolve = r })
    return { promise, resolve }
  }
  const containers = () => w.findAll('[data-package-container]').map((c) => c.text())

  it('открыли A, затем B; ответ по A пришёл позже — не показан', async () => {
    const a = deferred<DocumentPackageDto>()
    api.getById.mockImplementation((id: string) => (id === 'p1' ? a.promise : Promise.resolve(B_FULL)))
    await mountDrawer()
    await w.setProps({ row: B })
    await flushPromises()
    expect(w.get('[data-package-title]').text()).toBe('2460')
    expect(containers()).toHaveLength(1)
    a.resolve(FULL)
    await flushPromises()
    expect(w.get('[data-package-title]').text()).toBe('2460')
    expect(containers()).toEqual([expect.stringContaining('TGHU')])
    expect(has('[data-package-skeleton]')).toBe(false)
  })

  it('загрузка в A закончилась после перехода на B: A не перечитывается, у B свой флаг загрузки', async () => {
    const up = deferred<unknown>()
    api.uploadFile.mockReturnValueOnce(up.promise)
    api.getById.mockImplementation(async (id: string) => (id === 'p1' ? FULL : B_FULL))
    await mountDrawer()
    await w.get('[data-package-upload]').trigger('click')
    await flushPromises()
    expect(w.get('[data-package-upload]').attributes('loading')).toBe('true')
    await w.setProps({ row: B })
    await flushPromises()
    expect(w.get('[data-package-upload]').attributes('loading')).toBe('false')
    const calls = api.getById.mock.calls.length
    up.resolve({})
    await flushPromises()
    expect(api.getById.mock.calls.length).toBe(calls) // A не перечитан
    expect(w.emitted('changed')).toHaveLength(1) // список всё равно обновляется
    expect(containers()).toHaveLength(1)
  })

  it('смена статуса A пришла, когда открыт B: B не затирается', async () => {
    api.getById.mockImplementation(async (id: string) => (id === 'p1' ? FULL : B_FULL))
    await mountDrawer()
    await w.setProps({ row: B })
    await flushPromises()
    w.getComponent(PackageStatusModal).vm.$emit('changed', pkg({ status: 'accepted' }))
    await flushPromises()
    expect(w.get('[data-package-title]').text()).toBe('2460')
    expect(w.get('[data-package-status]').text()).not.toBe('Принят брокером')
    expect(containers()).toHaveLength(1)
    expect(w.emitted('changed')).toHaveLength(1)
  })
})
