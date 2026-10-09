import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'

const api = vi.hoisted(() => ({ list: vi.fn(), suggest: vi.fn() }))
vi.mock('@/api/prohibitionCodes', () => ({ prohibitionCodesApi: api }))

import { isExportProcedure, resetGr33Suggest, useGr33Suggest } from '../useGr33Suggest'

const REF = [
  { code: 'C1700', name: 'Не подпадает под культурные ценности', categoryCode: 'C17', categoryName: 'Культурные ценности', kind: '', isNegative: true },
  { code: 'D0110', name: 'Обязательная оценка соответствия', categoryCode: 'D01', categoryName: 'Тех. регулирование', kind: '', isNegative: false },
  { code: 'D0100', name: 'Не подпадает под тех. регулирование', categoryCode: 'D01', categoryName: 'Тех. регулирование', kind: '', isNegative: true },
]
const SUGGEST = {
  tnved: '4202121900', fetchedAtUtc: null, stale: false, warning: null,
  codes: [
    { code: 'D0100', name: null, isNegative: true, inReference: true, sourceResolution: null },
    { code: 'D0110', name: null, isNegative: false, inReference: true, sourceResolution: null },
    { code: 'C2000', name: 'Экспортный контроль', isNegative: true, inReference: false, sourceResolution: null, exportOnly: true },
  ],
}

let scope = effectScope()
const run = <T>(fn: () => T): T => scope.run(fn)!

beforeEach(() => {
  resetGr33Suggest()
  scope = effectScope()
  api.list.mockReset().mockResolvedValue(REF)
  api.suggest.mockReset().mockResolvedValue(SUGGEST)
})
afterEach(() => scope.stop())

describe('useGr33Suggest', () => {
  it('процедуры вывоза — 10/21/23/31 по первым двум цифрам', () => {
    expect(['10', '1000', '21', '2300', '31'].map(isExportProcedure)).toEqual([true, true, true, true, true])
    expect(['40', '4000', '', null].map(isExportProcedure)).toEqual([false, false, false, false])
  })

  it('по 10-значному коду — только коды КЕДЕН, экспортные при импорте скрыты; ничего не выбирает само', async () => {
    const s = run(() => useGr33Suggest({ tnved: '4202 12 190 0', procedure: '40' }))
    expect(s.state.loading).toBe(true)
    await flushPromises()
    expect(api.suggest).toHaveBeenCalledWith('4202121900')
    expect(s.byTnved.value).toBe(true)
    expect(s.choices.value.map((c) => c.code)).toEqual(['D0100', 'D0110'])
    expect(s.choices.value[1].name).toBe('Обязательная оценка соответствия')
    expect(s.negativeToAdd([])).toEqual(['D0100'])
    expect(s.negativeToAdd(['D0100'])).toEqual([])
    expect(s.rejected(['D0110', 'C1700', 'C2000'])).toEqual(['C1700', 'C2000'])
  })

  it('при экспорте экспортные коды видны и не «отклоняются»', async () => {
    const s = run(() => useGr33Suggest({ tnved: '4202121900', procedure: '1000' }))
    await flushPromises()
    expect(s.choices.value.map((c) => c.code)).toEqual(['D0100', 'D0110', 'C2000'])
    expect(s.negativeToAdd([])).toEqual(['D0100', 'C2000'])
    expect(s.rejected(['C2000'])).toEqual([])
  })

  it('кода нет или КЕДЕН не ответил — весь справочник, «нет в справочнике» по формату', async () => {
    const tnved = ref<string | null>('8471')
    const s = run(() => useGr33Suggest(() => ({ tnved: tnved.value, procedure: '40' })))
    await flushPromises()
    expect(api.suggest).not.toHaveBeenCalled()
    expect(s.byTnved.value).toBe(false)
    expect(s.choices.value.map((c) => c.code)).toEqual(['C1700', 'D0110', 'D0100'])
    expect(s.unknown(['D0110', 'Z9999', 'bad'])).toEqual(['Z9999'])
    expect(s.rejected(['Z9999'])).toEqual([])

    api.suggest.mockRejectedValueOnce(new Error('down'))
    tnved.value = '8471300000'
    await nextTick()
    await flushPromises()
    expect(s.state.failed).toBe(true)
    expect(s.byTnved.value).toBe(false)
    expect(s.choices.value).toHaveLength(3)
  })

  it('старый пустой кэш сервера = «не отвечает»; старый с кодами — подсказки с пометкой', async () => {
    api.suggest.mockResolvedValueOnce({ ...SUGGEST, stale: true, codes: [] })
    const a = run(() => useGr33Suggest({ tnved: '1111111111', procedure: null }))
    await flushPromises()
    expect(a.state.failed).toBe(true)
    api.suggest.mockResolvedValueOnce({ ...SUGGEST, stale: true })
    const b = run(() => useGr33Suggest({ tnved: '2222222222', procedure: null }))
    await flushPromises()
    expect(b.state.warning).toBe(true)
    expect(b.byTnved.value).toBe(true)
  })

  it('КЕДЕН не ответил (старый кэш сервера) — не запоминается: повторное открытие спрашивает снова', async () => {
    api.suggest.mockResolvedValueOnce({ ...SUGGEST, stale: true, codes: [] })
    const a = run(() => useGr33Suggest({ tnved: '4202121900', procedure: '40' }))
    await flushPromises()
    expect(a.state.failed).toBe(true)
    const b = run(() => useGr33Suggest({ tnved: '4202121900', procedure: '40' }))
    await flushPromises()
    expect(api.suggest).toHaveBeenCalledTimes(2)
    expect(b.state.failed).toBe(false)
    expect(b.byTnved.value).toBe(true)
    // Старый кэш с кодами («сохранённые ранее») — тоже не запоминается.
    api.suggest.mockResolvedValueOnce({ ...SUGGEST, tnved: '5555555555', stale: true })
    run(() => useGr33Suggest({ tnved: '5555555555', procedure: '40' }))
    await flushPromises()
    run(() => useGr33Suggest({ tnved: '5555555555', procedure: '40' }))
    await flushPromises()
    expect(api.suggest).toHaveBeenCalledTimes(4)
  })

  it('кэш на сессию: повторное открытие — сразу, без запроса и без «загрузки»; справочник — один раз', async () => {
    run(() => useGr33Suggest({ tnved: '4202121900', procedure: '40' }))
    await flushPromises()
    const again = run(() => useGr33Suggest({ tnved: '4202121900', procedure: '40' }))
    expect(again.state.loading).toBe(false)
    expect(again.choices.value.map((c) => c.code)).toEqual(['D0100', 'D0110'])
    expect(api.suggest).toHaveBeenCalledTimes(1)
    expect(api.list).toHaveBeenCalledTimes(1)
  })

  it('устаревший ответ не перетирает подсказки нового кода', async () => {
    let release!: (v: unknown) => void
    api.suggest.mockImplementationOnce(() => new Promise((r) => { release = r }))
    const tnved = ref('3333333333')
    const s = run(() => useGr33Suggest(() => ({ tnved: tnved.value, procedure: '40' })))
    tnved.value = '4202121900'
    await nextTick()
    await flushPromises()
    release({ ...SUGGEST, tnved: '3333333333', codes: [{ code: 'E0100', name: null, isNegative: false, inReference: true, sourceResolution: null }] })
    await flushPromises()
    expect(s.state.tnved).toBe('4202121900')
    expect(s.choices.value.map((c) => c.code)).toEqual(['D0100', 'D0110'])
  })
})
