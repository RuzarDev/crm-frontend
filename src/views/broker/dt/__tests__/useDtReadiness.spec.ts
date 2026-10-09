import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import type { KedenReadinessDto } from '@/api/import40'

const api = vi.hoisted(() => ({ kedenReadiness: vi.fn() }))
vi.mock('@/api/import40', () => ({ import40Api: api }))

import { useDtReadiness } from '../useDtReadiness'

let scope: EffectScope
const start = (enabled = true) => {
  scope = effectScope()
  const on = ref(enabled)
  const r = scope.run(() => useDtReadiness('case1', 'dt1', { enabled: on }))!
  return { r, on }
}
const deferred = <T>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

const withItems = (over: Partial<KedenReadinessDto> = {}): KedenReadinessDto => ({
  missing: ['Гр.8, получатель: длина полей адреса', 'Орган подачи декларации (код таможенного органа)', 'Товар 2: вес брутто (гр.35)'],
  items: [
    { text: 'Гр.8, получатель: длина полей адреса', graph: '8', goodsIndex: null },
    { text: 'Орган подачи декларации (код таможенного органа)', graph: 'А', goodsIndex: null },
    { text: 'Товар 2: вес брутто (гр.35)', graph: '35', goodsIndex: 1 },
  ],
  filled: 10,
  total: 13,
  blankFilled: 38,
  blankTotal: 46,
  blankEmptyGraphs: ['гр.7', 'гр.9'],
  ...over,
})

beforeEach(() => {
  api.kedenReadiness.mockResolvedValue(withItems())
})
afterEach(() => {
  scope?.stop()
  vi.clearAllMocks()
})

describe('useDtReadiness — серверная готовность', () => {
  it('тихий запрос; пункты по разделам с графой и номером товара; бланк «заполнено из»', async () => {
    const { r } = start()
    await r.refresh()
    expect(api.kedenReadiness).toHaveBeenCalledWith('case1', 'dt1', { silent: true })
    expect(r.loaded.value).toBe(true)
    expect(r.items.value.map((i) => [i.section, i.graph, i.goodsIndex])).toEqual([
      ['parties', '8', null],
      ['number', 'А', null],
      ['goods', '35', 1],
    ])
    expect(r.bySection.value).toEqual({ parties: 1, number: 1, goods: 1 })
    expect(r.blank.value).toEqual({ filled: 38, total: 46, pct: 83, complete: false, emptyGraphs: ['гр.7', 'гр.9'] })
    expect(r.ready.value).toBe(false)
  })

  it('нет items (старый сервер) — разбор графы из строки без учёта регистра', async () => {
    api.kedenReadiness.mockResolvedValueOnce(withItems({
      items: undefined,
      missing: ['Гр.14, декларант: длина полей адреса', 'гр.30 (код 11): номер документа', 'Товар 1: КЕДЕН при процедуре ИМ40 не предлагает 0Z', 'Инкотермс и место поставки (гр.20)'],
    }))
    const { r } = start()
    await r.refresh()
    expect(r.items.value.map((i) => i.section)).toEqual(['parties', 'customs', 'goods', 'finance'])
    expect(r.items.value[2].goodsIndex).toBe(0)
    expect(r.bySection.value).toEqual({ parties: 1, customs: 1, goods: 1, finance: 1 })
  })

  it('пусто — готово; бланк 46 из 46 — complete', async () => {
    api.kedenReadiness.mockResolvedValueOnce(withItems({ missing: [], items: [], blankFilled: 46 }))
    const { r } = start()
    await r.refresh()
    expect(r.ready.value).toBe(true)
    expect(r.blank.value?.complete).toBe(true)
  })

  it('ещё не загружено или сбой — не «готово» (B4), бланка нет', async () => {
    const { r } = start()
    expect(r.ready.value).toBe(false)
    expect(r.blank.value).toBeNull()
    api.kedenReadiness.mockRejectedValueOnce(new Error('x'))
    await r.refresh()
    expect(r.loaded.value).toBe(false)
    expect(r.ready.value).toBe(false)
  })

  it('enabled=false — ничего не запрашивает; выключили — состояние сброшено', async () => {
    const { r, on } = start(false)
    await r.refresh()
    await r.afterSave()
    expect(api.kedenReadiness).not.toHaveBeenCalled()
    expect(r.loaded.value).toBe(false)
    on.value = true
    await r.refresh()
    expect(r.loaded.value).toBe(true)
    on.value = false
    await flushPromises()
    expect(r.loaded.value).toBe(false)
    expect(r.items.value).toEqual([])
  })

  it('устаревший ответ отбрасывается', async () => {
    const first = deferred<KedenReadinessDto>()
    api.kedenReadiness.mockImplementationOnce(() => first.promise)
    api.kedenReadiness.mockResolvedValueOnce(withItems({ missing: [], items: [] }))
    const { r } = start()
    const p1 = r.refresh()
    await r.refresh()
    first.resolve(withItems())
    await p1
    expect(r.ready.value).toBe(true)
  })
})

describe('useDtReadiness — ошибки выгрузки XML (B1)', () => {
  it('ошибки XML важнее готовности, пока не сохранили; после успешного сохранения — сброс и свежая готовность', async () => {
    const { r } = start()
    await r.refresh()
    r.setXmlErrors(['Гр.44: у документа № 1 не указан код вида документа', 'ДТС: не заполнена гр.7'])
    expect(r.xmlErrors.value).toHaveLength(2)
    expect(r.items.value.map((i) => i.section)).toEqual(['docs', 'dts'])
    expect(r.items.value.every((i) => i.fromXml)).toBe(true)
    expect(r.bySection.value).toEqual({ docs: 1, dts: 1 })

    api.kedenReadiness.mockResolvedValueOnce(withItems({ missing: [], items: [] }))
    await r.afterSave()
    expect(r.xmlErrors.value).toEqual([])
    expect(api.kedenReadiness).toHaveBeenCalledTimes(2)
    expect(r.items.value).toEqual([])
    expect(r.ready.value).toBe(true)
  })

  it('clearXmlErrors — без запроса', async () => {
    const { r } = start()
    r.setXmlErrors(['x'])
    r.clearXmlErrors()
    expect(r.xmlErrors.value).toEqual([])
    expect(api.kedenReadiness).not.toHaveBeenCalled()
  })
})
