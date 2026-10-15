import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadDei, resetTnvedDeiCache } from '../editor/tnvedDei'

const tnved = vi.hoisted(() => ({ rates: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: tnved }))

describe('tnvedDei: ДЕИ по коду ТН ВЭД', () => {
  beforeEach(() => {
    resetTnvedDeiCache()
    tnved.rates.mockReset()
  })

  it('ответ кэшируется на сессию: единица и «нет ДЕИ» — без повторного запроса', async () => {
    tnved.rates.mockResolvedValueOnce({ data: { unitCode: '55', unitName: 'Квадратный метр', unitShortName: 'М2' } })
    expect(await loadDei('6907 21 0000')).toEqual({ code: '055', name: 'Квадратный метр', shortName: 'М2' })
    expect(await loadDei('6907210000')).toEqual({ code: '055', name: 'Квадратный метр', shortName: 'М2' })
    tnved.rates.mockResolvedValueOnce({ data: { unitCode: null, unitName: null } })
    expect(await loadDei('9403105100')).toBeNull()
    expect(await loadDei('9403105100')).toBeNull()
    expect(tnved.rates).toHaveBeenCalledTimes(2)
  })

  it('(баг) код не найден (404) запоминается — повторно не запрашивается и не пишет в консоль', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    tnved.rates.mockRejectedValue(Object.assign(new Error('404'), { response: { status: 404 } }))
    expect(await loadDei('0000000001')).toBeUndefined()
    expect(await loadDei('0000000001')).toBeUndefined()
    expect(tnved.rates).toHaveBeenCalledTimes(1)
    expect(err).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('сбой сети не запоминается — следующий раз спрашиваем снова', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    tnved.rates.mockRejectedValueOnce(new Error('Network Error'))
    expect(await loadDei('9401790009')).toBeUndefined()
    tnved.rates.mockResolvedValueOnce({ data: { unitCode: '796', unitName: 'Штука', unitShortName: 'ШТ' } })
    expect(await loadDei('9401790009')).toEqual({ code: '796', name: 'Штука', shortName: 'ШТ' })
    expect(tnved.rates).toHaveBeenCalledTimes(2)
    expect(err).toHaveBeenCalledTimes(1)
    err.mockRestore()
  })
})
