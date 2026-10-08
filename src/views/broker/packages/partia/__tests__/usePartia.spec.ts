import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import type { DocumentPackageDto } from '@/types/api'
import { draftFromPartia, partiaToBody } from '../partiaModel'
import { container, file, fullPartia, pkg } from './packageFixture'

const api = vi.hoisted(() => ({
  getById: vi.fn(),
  createClientConsolidation: vi.fn(),
  updateClientConsolidation: vi.fn(),
  uploadFile: vi.fn(),
  linkFile: vi.fn(),
}))
vi.mock('@/api/documentPackages', () => ({ documentPackagesApi: api }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
vi.mock('@/ui/message', () => ({ message: toast }))

import { usePartia } from '../usePartia'

let scope: EffectScope
const start = (partiaId = 'p1', containerId = '', pkgId = 'pkg1') => {
  scope = effectScope()
  const ids = { pkg: ref(pkgId), container: ref(containerId), partia: ref(partiaId) }
  const r = scope.run(() => usePartia(() => ids.pkg.value, () => ids.container.value, () => ids.partia.value))!
  return { r, ids }
}
const settle = async () => {
  await flushPromises()
  await nextTick()
}
const httpError = (status: number, data?: unknown) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } })
const deferred = <T>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const invoice = (name: string) => new File(['x'], name, { type: 'application/pdf' })

let stored: DocumentPackageDto | null
beforeEach(() => {
  stored = pkg()
  api.getById.mockImplementation(async () => {
    if (!stored) throw httpError(404)
    return structuredClone(stored)
  })
  api.updateClientConsolidation.mockImplementation(async () => structuredClone(stored))
})
afterEach(() => {
  scope?.stop()
  vi.clearAllMocks()
})

describe('usePartia — загрузка', () => {
  it('грузит пакет тихо; партия и контейнер — из пакета; черновик — из партии; правок нет', async () => {
    const { r } = start()
    expect(r.loading.value).toBe(true)
    await settle()
    expect(api.getById).toHaveBeenCalledWith('pkg1', { silent: true })
    expect(r.loading.value).toBe(false)
    expect(r.pkg.value?.id).toBe('pkg1')
    expect(r.partia.value?.id).toBe('p1')
    expect(r.container.value?.id).toBe('c1')
    expect(r.isNew.value).toBe(false)
    expect(r.draft.clientName).toBe('kazakhmys')
    expect(r.draft.record.organizations[0].name).toBe('ТОО Брокер')
    expect(r.dirty.value).toBe(false)
  })

  it('контейнер существующей партии — из пакета, аргумент контейнера не важен', async () => {
    const { r } = start('p1', 'c2')
    await settle()
    expect(r.container.value?.id).toBe('c1')
  })

  it('нет пакета (404) → notFound', async () => {
    stored = null
    const { r } = start()
    await settle()
    expect(r.notFound.value).toBe(true)
    expect(r.loadError.value).toBe(false)
  })

  it('нет партии в пакете → notFound', async () => {
    const { r } = start('missing')
    await settle()
    expect(r.notFound.value).toBe(true)
    expect(r.partia.value).toBeNull()
  })

  it("'new' без контейнера или с чужим контейнером → notFound", async () => {
    let s = start('new', '')
    await settle()
    expect(s.r.notFound.value).toBe(true)
    scope.stop()
    s = start('new', 'gone')
    await settle()
    expect(s.r.notFound.value).toBe(true)
  })

  it("'new' — черновик по умолчанию, контейнер из аргумента", async () => {
    const { r } = start('new', 'c2')
    await settle()
    expect(r.notFound.value).toBe(false)
    expect(r.isNew.value).toBe(true)
    expect(r.partia.value).toBeNull()
    expect(r.container.value?.id).toBe('c2')
    expect(r.draft.clientName).toBe('')
    expect(r.draft.record.transit.purposeCode).toBe('06')
    expect(r.dirty.value).toBe(false)
  })

  it('прочая ошибка → loadError; load() повторяет', async () => {
    api.getById.mockRejectedValueOnce(httpError(500))
    const { r } = start()
    await settle()
    expect(r.loadError.value).toBe(true)
    expect(r.notFound.value).toBe(false)
    await r.load()
    await nextTick()
    expect(r.loadError.value).toBe(false)
    expect(r.partia.value?.id).toBe('p1')
  })

  it('ответ устаревшего запроса отбрасывается', async () => {
    const slow = deferred<DocumentPackageDto>()
    api.getById.mockImplementationOnce(() => slow.promise)
    const { r, ids } = start()
    ids.partia.value = 'new'
    ids.container.value = 'c2'
    await settle()
    expect(r.isNew.value).toBe(true)
    slow.resolve(pkg({ trainNumber: 'старый' }))
    await settle()
    expect(r.isNew.value).toBe(true)
    expect(r.pkg.value?.trainNumber).toBe('1234')
  })

  it('битый transitDataJson — признак поломки', async () => {
    stored = pkg({ containers: [container({ consolidations: [fullPartia({ transitDataJson: '{oops' })] })] })
    const { r } = start()
    await settle()
    expect(r.transitParseFailed.value).toBe(true)
    expect(r.draft.record.transit.purposeCode).toBe('06')
  })
})

describe('usePartia — правки', () => {
  it('dirty и revert', async () => {
    const { r } = start()
    await settle()
    r.draft.sealNumber = 'NEW'
    r.draft.consignee.name = 'Другой'
    r.draft.record.organizations[0].name = 'Правка'
    expect(r.dirty.value).toBe(true)
    r.revert()
    expect(r.dirty.value).toBe(false)
    expect(r.draft.sealNumber).toBe('SL-123')
    expect(r.draft.consignee.name).toBe('ТОО «Казахмыс Трейд»')
    expect(r.draft.record.organizations[0].name).toBe('ТОО Брокер')
    r.draft.record.organizations[0].name = 'Ещё'
    expect(r.dirty.value).toBe(true)
  })

  it('очередь инвойсов — тоже несохранённое', async () => {
    const { r } = start('new', 'c2')
    await settle()
    r.pendingInvoices.value = [invoice('a.pdf')]
    expect(r.dirty.value).toBe(true)
  })

  it('итоги не пересчитываются при загрузке, а при правке товаров — да (целые места)', async () => {
    stored = pkg({ containers: [container({ consolidations: [fullPartia({ transitDataJson: JSON.stringify({ goodsQuantity: 7, cargoPlacesCount: 11, grossWeightKg: 9000 }) })] })] })
    const { r } = start()
    await settle()
    expect(r.draft.record.transit.grossWeightKg).toBe(9000)
    expect(r.dirty.value).toBe(false)
    r.draft.record.goods[0].packagesCount = 12.5 // 12,5 + 24
    await nextTick()
    expect(r.draft.record.transit.cargoPlacesCount).toBe(37)
    expect(r.draft.record.transit.goodsQuantity).toBe(7)
    expect(r.draft.record.transit.grossWeightKg).toBe(9000)
    r.revert()
    await nextTick()
    expect(r.draft.record.transit.cargoPlacesCount).toBe(11)
  })
})

describe('usePartia — сохранение правки', () => {
  it('PUT — полное тело партии с правкой; затем пакет из ответа и новый снимок', async () => {
    const { r } = start()
    await settle()
    r.draft.sealNumber = 'NEW-SEAL'
    stored = pkg({ containers: [container({ consolidations: [fullPartia({ sealNumber: 'NEW-SEAL' })] }), container({ id: 'c2', consolidations: [] })] })
    const id = await r.save()
    await nextTick()
    expect(id).toBe('p1')
    const expected = draftFromPartia(fullPartia())
    expected.sealNumber = 'NEW-SEAL'
    expect(api.updateClientConsolidation).toHaveBeenCalledWith('pkg1', 'c1', 'p1', partiaToBody(expected))
    const body = api.updateClientConsolidation.mock.calls[0][3]
    expect(body.destinationCustomsAuthority).toBe('ТП «Сарыагаш»')
    expect(JSON.parse(body.transitDataJson).guarantees).toHaveLength(1)
    expect(r.partia.value?.sealNumber).toBe('NEW-SEAL')
    expect(r.dirty.value).toBe(false)
    expect(r.saving.value).toBe(false)
    expect(r.saveError.value).toBeNull()
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(api.getById).toHaveBeenCalledTimes(1)
  })

  it('повторное нажатие игнорируется', async () => {
    const slow = deferred<DocumentPackageDto>()
    api.updateClientConsolidation.mockImplementationOnce(() => slow.promise)
    const { r } = start()
    await settle()
    r.draft.sealNumber = 'X'
    const first = r.save()
    expect(r.saving.value).toBe(true)
    expect(await r.save()).toBeNull()
    slow.resolve(pkg())
    expect(await first).toBe('p1')
    expect(api.updateClientConsolidation).toHaveBeenCalledTimes(1)
  })

  it('ошибка сервера → saveError, правки на месте, без своего тоста', async () => {
    api.updateClientConsolidation.mockRejectedValueOnce(httpError(400, { error: 'Клиент не указан' }))
    const { r } = start()
    await settle()
    r.draft.sealNumber = 'X'
    expect(await r.save()).toBeNull()
    expect(r.saveError.value).toBe('Клиент не указан')
    expect(r.saving.value).toBe(false)
    expect(r.dirty.value).toBe(true)
    expect(r.draft.sealNumber).toBe('X')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('проверка на месте: без клиента — без запроса', async () => {
    const { r } = start()
    await settle()
    r.draft.clientName = ' '
    expect(await r.save()).toBeNull()
    expect(r.saveError.value).toBe('Выберите клиента партии.')
    expect(api.updateClientConsolidation).not.toHaveBeenCalled()
  })

  it('битый транзит: без force — отказ; с force — сохраняет', async () => {
    stored = pkg({ containers: [container({ consolidations: [fullPartia({ transitDataJson: '{oops' })] })] })
    const { r } = start()
    await settle()
    expect(await r.save()).toBeNull()
    expect(r.saveError.value).toContain('Транзитные данные партии не прочитались')
    expect(api.updateClientConsolidation).not.toHaveBeenCalled()
    stored = pkg()
    expect(await r.save({ force: true })).toBe('p1')
    expect(api.updateClientConsolidation).toHaveBeenCalledTimes(1)
    expect(r.transitParseFailed.value).toBe(false)
  })

  it('правки, сделанные пока шёл запрос, не теряются', async () => {
    const slow = deferred<DocumentPackageDto>()
    api.updateClientConsolidation.mockImplementationOnce(() => slow.promise)
    const { r } = start()
    await settle()
    r.draft.sealNumber = 'SENT'
    const p = r.save()
    r.draft.destinationStation = 'Пока шёл запрос'
    slow.resolve(pkg({ containers: [container({ consolidations: [fullPartia({ sealNumber: 'SENT' })] })] }))
    await p
    await nextTick()
    expect(r.draft.sealNumber).toBe('SENT')
    expect(r.draft.destinationStation).toBe('Пока шёл запрос')
    expect(r.dirty.value).toBe(true)
  })

  it('не загружено — сохранить нельзя', async () => {
    stored = null
    const { r } = start()
    await settle()
    expect(await r.save()).toBeNull()
    expect(r.saveError.value).toContain('Партия не загружена')
    expect(api.updateClientConsolidation).not.toHaveBeenCalled()
  })
})

describe('usePartia — создание', () => {
  const created = (extraFiles: ReturnType<typeof file>[] = []) => {
    const base = pkg()
    return {
      ...base,
      files: [...base.files, ...extraFiles],
      containers: [base.containers[0], container({ id: 'c2', consolidations: [fullPartia({ id: 'p-new', containerId: 'c2' })] })],
    }
  }

  it('POST в контейнер; id новой партии — по разнице id; повторное сохранение — уже PUT', async () => {
    api.createClientConsolidation.mockResolvedValue(created())
    const { r } = start('new', 'c2')
    await settle()
    r.draft.clientName = 'kazakhmys'
    const id = await r.save()
    await nextTick()
    expect(id).toBe('p-new')
    expect(api.createClientConsolidation).toHaveBeenCalledWith('pkg1', 'c2', expect.objectContaining({ clientName: 'kazakhmys', transitDataJson: expect.any(String) }))
    expect(r.isNew.value).toBe(false)
    expect(r.partia.value?.id).toBe('p-new')
    expect(r.dirty.value).toBe(false)
    expect(api.uploadFile).not.toHaveBeenCalled()

    r.draft.sealNumber = 'X'
    api.updateClientConsolidation.mockResolvedValueOnce(created())
    await r.save()
    expect(api.updateClientConsolidation).toHaveBeenCalledWith('pkg1', 'c2', 'p-new', expect.anything())
    expect(api.createClientConsolidation).toHaveBeenCalledTimes(1)
  })

  it('переход на адрес созданной партии не перезагружает страницу', async () => {
    api.createClientConsolidation.mockResolvedValue(created())
    const { r, ids } = start('new', 'c2')
    await settle()
    r.draft.clientName = 'kazakhmys'
    await r.save()
    ids.partia.value = 'p-new'
    ids.container.value = ''
    await settle()
    expect(api.getById).toHaveBeenCalledTimes(1)
    expect(r.partia.value?.id).toBe('p-new')
  })

  it('инвойсы после создания: загрузка и привязка как инвойс; частичная ошибка — «n из m», неудачные остаются в очереди', async () => {
    api.createClientConsolidation.mockResolvedValue(created())
    const a = invoice('a.pdf')
    const b = invoice('b.pdf')
    const c = invoice('c.pdf')
    api.uploadFile
      .mockResolvedValueOnce(file({ id: 'fa' }))
      .mockRejectedValueOnce(httpError(413))
      .mockResolvedValueOnce(file({ id: 'fc' }))
    api.linkFile.mockImplementation(async (_p: string, fileId: string) => created([file({ id: fileId, clientConsolidationId: 'p-new', documentType: 'invoice' })]))
    const afterAll = created([file({ id: 'fa', clientConsolidationId: 'p-new', documentType: 'invoice' }), file({ id: 'fc', clientConsolidationId: 'p-new', documentType: 'invoice' })])
    api.getById.mockResolvedValueOnce(pkg()).mockResolvedValueOnce(afterAll)

    const { r } = start('new', 'c2')
    await settle()
    r.draft.clientName = 'kazakhmys'
    r.pendingInvoices.value = [a, b, c]
    const id = await r.save()
    await nextTick()

    expect(id).toBe('p-new')
    expect(api.uploadFile).toHaveBeenCalledTimes(3)
    expect(api.uploadFile).toHaveBeenNthCalledWith(1, 'pkg1', a)
    expect(api.linkFile).toHaveBeenCalledTimes(2)
    expect(api.linkFile).toHaveBeenCalledWith('pkg1', 'fa', { containerId: null, clientConsolidationId: 'p-new', documentType: 'invoice' })
    expect(r.invoiceUpload.value).toEqual({ done: 2, total: 3 })
    expect(r.pendingInvoices.value).toEqual([b])
    expect(r.pkg.value?.files.map((f) => f.id)).toEqual(expect.arrayContaining(['fa', 'fc']))
    expect(toast.warning).toHaveBeenCalledTimes(1)
    expect(toast.success).not.toHaveBeenCalled()
    expect(r.saving.value).toBe(false)
    expect(r.dirty.value).toBe(true) // в очереди остался b.pdf
  })

  it('все инвойсы загружены — очередь пуста, обычный тост', async () => {
    api.createClientConsolidation.mockResolvedValue(created())
    api.uploadFile.mockResolvedValue(file({ id: 'fa' }))
    api.linkFile.mockResolvedValue(created([file({ id: 'fa', clientConsolidationId: 'p-new', documentType: 'invoice' })]))
    const { r } = start('new', 'c2')
    await settle()
    r.draft.clientName = 'kazakhmys'
    r.pendingInvoices.value = [invoice('a.pdf')]
    await r.save()
    await nextTick()
    expect(r.invoiceUpload.value).toEqual({ done: 1, total: 1 })
    expect(r.pendingInvoices.value).toEqual([])
    expect(r.pkg.value?.files.some((f) => f.id === 'fa')).toBe(true)
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(r.dirty.value).toBe(false)
  })

  it('ошибка создания — инвойсы не грузятся, очередь на месте', async () => {
    api.createClientConsolidation.mockRejectedValueOnce(httpError(500))
    const { r } = start('new', 'c2')
    await settle()
    r.draft.clientName = 'kazakhmys'
    r.pendingInvoices.value = [invoice('a.pdf')]
    expect(await r.save()).toBeNull()
    expect(r.saveError.value).toBe('HTTP 500')
    expect(api.uploadFile).not.toHaveBeenCalled()
    expect(r.pendingInvoices.value).toHaveLength(1)
    expect(r.isNew.value).toBe(true)
  })
})

describe('usePartia — reload', () => {
  it('перечитывает пакет; несохранённые правки остаются, остальное — с сервера', async () => {
    const { r } = start()
    await settle()
    r.draft.sealNumber = 'моя'
    stored = pkg({ containers: [container({ consolidations: [fullPartia({ destinationStation: 'Алматы-1' })] })] })
    await r.reload()
    await nextTick()
    expect(r.draft.destinationStation).toBe('Алматы-1')
    expect(r.draft.sealNumber).toBe('моя')
    expect(r.dirty.value).toBe(true)
    r.revert()
    expect(r.draft.sealNumber).toBe('SL-123')
    expect(r.draft.destinationStation).toBe('Алматы-1')
  })

  it('партию удалили — notFound', async () => {
    const { r } = start()
    await settle()
    stored = pkg({ containers: [container({ consolidations: [] })] })
    await r.reload()
    expect(r.notFound.value).toBe(true)
  })
})
