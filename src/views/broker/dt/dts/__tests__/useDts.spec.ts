import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'

const dtsApi = vi.hoisted(() => ({ get: vi.fn(), pdf: vi.fn(), xml: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }))
const files = vi.hoisted(() => ({ saveFile: vi.fn(), openPdf: vi.fn() }))
vi.mock('@/api/dts', () => ({ dtsApi }))
vi.mock('@/ui/message', () => ({ message: toast }))
vi.mock('../../dtFiles', () => files)

import { useDts, type UseDtsOptions } from '../useDts'
import { dtsView } from './dtsFixture'

let scope: EffectScope | null = null
const setup = (o: Partial<UseDtsOptions> = {}) => {
  const enabled = ref(true)
  scope = effectScope()
  const d = scope.run(() => useDts('c1', 'd1', { enabled, ...o }))!
  return { d, enabled }
}
const deferred = <T>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => {
  dtsApi.get.mockResolvedValue(dtsView())
})
afterEach(() => {
  scope?.stop()
  scope = null
  vi.clearAllMocks()
})

describe('useDts: загрузка', () => {
  it('тихий GET …/dts; пункты — только самой ДТС, пункты ДТ — числом', async () => {
    const { d } = setup()
    expect(d.items.value).toBeNull()
    await d.refresh()
    expect(dtsApi.get).toHaveBeenCalledWith('c1', 'd1', { silent: true })
    expect(d.items.value).toEqual([{ text: 'ДТС: не указано место для гр.17 (Условия поставки и финансы)', goodsIndex: null, graph: 'ДТС', section: 'dts', fromXml: false }])
    expect(d.dtMissingCount.value).toBe(1)
  })

  it('старый сервер без items — пункты ДТС по тексту', async () => {
    dtsApi.get.mockResolvedValue(dtsView({ items: undefined, missing: ['Гр.8, получатель', 'ДТС: товар 2 — гр.43 ДТ = 2'] }))
    const { d } = setup()
    await d.refresh()
    expect(d.items.value!.map((i) => i.text)).toEqual(['ДТС: товар 2 — гр.43 ДТ = 2'])
    expect(d.dtMissingCount.value).toBe(1)
  })

  it('выключен (ДТ разделена, нет права) — без запроса', async () => {
    const { d, enabled } = setup()
    enabled.value = false
    await d.refresh()
    expect(dtsApi.get).not.toHaveBeenCalled()
    expect(d.view.value).toBeNull()
    expect(d.loading.value).toBe(false)
  })

  it('ответ устаревшего запроса не применяется; reset отбрасывает идущий', async () => {
    const first = deferred<unknown>()
    dtsApi.get.mockReturnValueOnce(first.promise).mockResolvedValueOnce(dtsView({ mismatchGoods: [1] }))
    const { d } = setup()
    const a = d.refresh()
    await d.refresh()
    first.resolve(dtsView({ mismatchGoods: [7] }))
    await a
    expect([...d.mismatch.value]).toEqual([1])
    const late = deferred<unknown>()
    dtsApi.get.mockReturnValueOnce(late.promise)
    const c = d.refresh()
    d.reset()
    late.resolve(dtsView())
    await c
    expect(d.view.value).toBeNull()
  })

  it('refresh({ reuse }) во время загрузки — тот же запрос (вход в раздел сразу после сохранения); без загрузки — новый', async () => {
    const pending = deferred<unknown>()
    dtsApi.get.mockReturnValueOnce(pending.promise)
    const { d } = setup()
    const a = d.refresh()
    const b = d.refresh({ reuse: true })
    expect(dtsApi.get).toHaveBeenCalledTimes(1)
    pending.resolve(dtsView({ mismatchGoods: [3] }))
    await Promise.all([a, b])
    expect([...d.mismatch.value]).toEqual([3])
    await d.refresh({ reuse: true })
    expect(dtsApi.get).toHaveBeenCalledTimes(2)
  })

  it('ошибка: прежний лист остаётся (failed), пункты — неизвестно', async () => {
    const { d } = setup()
    await d.refresh()
    dtsApi.get.mockRejectedValueOnce(new Error('500'))
    await d.refresh()
    expect(d.failed.value).toBe(true)
    expect(d.view.value).not.toBeNull()
    expect(d.items.value).toBeNull()
    await d.refresh()
    expect(d.failed.value).toBe(false)
  })
})

describe('useDts: печать и XML', () => {
  it('печать: сначала сохранение перед действием, затем PDF в новой вкладке', async () => {
    const log: string[] = []
    const saveForAction = vi.fn(async () => { log.push('save'); return true })
    dtsApi.pdf.mockImplementation(async (_c: string, _d: string, kind: string) => { log.push(kind); return new Blob(['%PDF']) })
    const { d } = setup({ saveForAction })
    await d.print('pdf')
    await d.print('info-sheet-pdf')
    expect(log).toEqual(['save', 'pdf', 'save', 'info-sheet-pdf'])
    expect(files.openPdf).toHaveBeenCalledTimes(2)
  })

  it('не сохранилось — без выгрузки; ошибка PDF — один тост с текстом сервера', async () => {
    const { d } = setup({ saveForAction: async () => false })
    await d.print('pdf')
    expect(dtsApi.pdf).not.toHaveBeenCalled()
    const ok = setup({ saveForAction: async () => true }).d
    dtsApi.pdf.mockRejectedValueOnce(new Error('Печать ДТС-2 пока не поддерживается'))
    await ok.print('pdf')
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith('Печать ДТС-2 пока не поддерживается')
    dtsApi.pdf.mockRejectedValueOnce(new Error(''))
    await ok.print('info-sheet-pdf')
    expect(toast.error).toHaveBeenLastCalledWith('Не удалось сформировать PDF ДТС')
  })

  it('XML: скачивание через общий saveFile и тост; 400 — список в плашке до следующей загрузки', async () => {
    const blob = new Blob(['<x/>'])
    dtsApi.xml.mockResolvedValueOnce({ blob, fileName: 'dts.xml' })
    const { d } = setup({ saveForAction: async () => true })
    await d.xml()
    expect(files.saveFile).toHaveBeenCalledWith(blob, 'dts.xml')
    expect(toast.success).toHaveBeenCalledWith('XML ДТС сформирован')
    dtsApi.xml.mockResolvedValueOnce({ errors: ['Гр.8, получатель', 'ДТС: нет места'] })
    await d.xml()
    expect(d.xmlErrors.value).toEqual(['Гр.8, получатель', 'ДТС: нет места'])
    expect(toast.warning).toHaveBeenCalledWith('XML ДТС не сформирован — заполните недостающее')
    await d.refresh()
    expect(d.xmlErrors.value).toBeNull()
    dtsApi.xml.mockRejectedValueOnce(new Error('Сервер недоступен'))
    await d.xml()
    expect(toast.error).toHaveBeenCalledWith('Сервер недоступен')
  })
})

describe('useDts: «Пересчитать гр. 45»', () => {
  it('шаг 1 расчёта платежей → тихое сохранение → тост; без права — ничего', async () => {
    const log: string[] = []
    const recalcCustomsValues = vi.fn(async () => { log.push('customs'); return { updated: 2, total: 10 } })
    const save = vi.fn(async () => { log.push('save'); return true })
    const editable = ref(false)
    const { d } = setup({ recalcCustomsValues, save, editable })
    expect(await d.recalc45()).toBe(false)
    expect(log).toEqual([])
    editable.value = true
    expect(await d.recalc45()).toBe(true)
    expect(log).toEqual(['customs', 'save'])
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Гр. 45 пересчитана (товаров: 2)'))
  })

  it('ошибка шага 1 — без сохранения; не сохранилось — предупреждение', async () => {
    const save = vi.fn(async () => false)
    const { d } = setup({ editable: true, save, recalcCustomsValues: vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue({ updated: 1, total: 1 }) })
    expect(await d.recalc45()).toBe(false)
    expect(save).not.toHaveBeenCalled()
    expect(await d.recalc45()).toBe(false)
    expect(toast.warning).toHaveBeenCalledWith('Гр. 45 пересчитана, но ДТ не сохранилась — ДТС не обновлена')
    expect(d.recalcLoading.value).toBe(false)
  })
})
