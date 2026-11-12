import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ checkCodes: vi.fn(), node: vi.fn(), rates: vi.fn(), search: vi.fn() }))
vi.mock('@/api/tnved', () => ({ tnvedApi: api }))

import { deiOf, resetTnvedDeiCache } from '../editor/tnvedDei'
import { resolveCodes } from '../importResolve'
import { createDtTnvedCheck, resetDtTnvedCheckCache } from '../tnvedCodeCheck'

// №1 / №9 (пакет импорта 21.10.2026): все коды импорта — одним запросом; ответ засевает кэши раздела и карточки.
beforeEach(() => {
  vi.clearAllMocks()
  resetTnvedDeiCache()
  resetDtTnvedCheckCache()
})

describe('resolveCodes', () => {
  it('один запрос на все различные коды; номер документа и не 10 цифр — не спрашиваются; кэши засеяны', async () => {
    api.checkCodes.mockResolvedValue({ data: [
      { code: '7323990000', valid: true, name: 'ИЗДЕЛИЯ', endDate: null, unitCode: null, unitName: null, unitShortName: null },
      { code: '6403990000', valid: true, name: 'ОБУВЬ', endDate: null, unitCode: '715', unitName: 'Пара', unitShortName: 'ПАР' },
      { code: '9999999999', valid: false, name: null, endDate: null, unitCode: null, unitName: null, unitShortName: null },
    ] })
    const r = await resolveCodes(['7323 99 000 0', '7323990000', '6403990000', '9999999999', '2026020201', '7323', null], { invoiceNo: '№ 2026020201' })
    expect(api.checkCodes).toHaveBeenCalledTimes(1)
    expect(api.checkCodes).toHaveBeenCalledWith(['7323990000', '6403990000', '9999999999'], { silent: true })
    expect(r.failed).toBe(false)
    expect(r.byCode.get('6403990000')).toEqual({ code: '6403990000', valid: true, name: 'ОБУВЬ', dei: { code: '715', name: 'Пара', shortName: 'ПАР' } })
    expect(r.rejected).toEqual(expect.arrayContaining([
      { code: '2026020201', reason: 'docNumber' }, { code: '7323', reason: 'notTenDigits' }, { code: '9999999999', reason: 'notInDirectory' },
    ]))
    // кэш ДЕИ и проверки кода: карточка и раздел не переспрашивают
    expect(deiOf('7323990000')).toBeNull()
    expect(deiOf('6403990000')).toMatchObject({ code: '715' })
    const check = createDtTnvedCheck()
    expect(check.isKnown('7323990000')).toBe(true)
    expect(check.isInvalid('9999999999')).toBe(true)
  })

  it('сбой сети — failed, коды не помечены неверными', async () => {
    api.checkCodes.mockRejectedValue(new Error('429'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const r = await resolveCodes(['7323990000'])
    expect(r).toMatchObject({ failed: true, rejected: [] })
    expect(createDtTnvedCheck().isInvalid('7323990000')).toBe(false)
  })

  // Неполный код (12.11.2026, авиа-инвойс «90 1880»): один подкод — ставится, несколько — подбирает декларант.
  it('неполный код: единственный действующий подкод — дополняется; несколько — partialMany; 4 знака — не ищутся', async () => {
    const leaf = (code: string) => ({ id: 1, code, treeName: '', name: '', parentId: null, is10: true, isLast: true, unitShort: null, nodeLevel: 5 })
    api.search.mockImplementation(async (q: string) => ({ data: q === '901880'
      ? [leaf('9018801000'), leaf('9018809000'), leaf('9018000000'.slice(0, 9))]
      : q === '732399' ? [leaf('7323990000'), leaf('7323990000')] : [] }))
    api.checkCodes.mockResolvedValue({ data: [
      { code: '7323990000', valid: true, name: 'ИЗДЕЛИЯ', endDate: null, unitCode: null, unitName: null, unitShortName: null },
    ] })
    const r = await resolveCodes(['732399', '90 1880', '123456', '7323'])
    expect(api.search).toHaveBeenCalledWith('732399', true, 30, { silent: true })
    expect(api.search).not.toHaveBeenCalledWith('7323', expect.anything(), expect.anything(), expect.anything())
    expect([...r.expanded]).toEqual([['732399', '7323990000']])
    expect(api.checkCodes).toHaveBeenCalledWith(['7323990000'], { silent: true })
    expect(r.rejected).toEqual(expect.arrayContaining([
      { code: '901880', reason: 'partialMany' }, { code: '123456', reason: 'notTenDigits' }, { code: '7323', reason: 'notTenDigits' },
    ]))
  })

  it('неполный код: подкод недействующий или проверка не прошла — не дополняется', async () => {
    const leaf = { id: 1, code: '7323990000', treeName: '', name: '', parentId: null, is10: true, isLast: true, unitShort: null, nodeLevel: 5 }
    api.search.mockResolvedValue({ data: [leaf] })
    api.checkCodes.mockResolvedValue({ data: [
      { code: '7323990000', valid: false, name: null, endDate: null, unitCode: null, unitName: null, unitShortName: null },
    ] })
    const bad = await resolveCodes(['732399'])
    expect(bad.expanded.size).toBe(0)
    expect(bad.rejected).toEqual(expect.arrayContaining([{ code: '732399', reason: 'notTenDigits' }]))
    api.checkCodes.mockRejectedValue(new Error('429'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const off = await resolveCodes(['732399'])
    expect(off).toMatchObject({ failed: true })
    expect(off.expanded.size).toBe(0)
    expect(off.rejected).toEqual([{ code: '732399', reason: 'notTenDigits' }])
  })

  it('кодов нет — запроса нет', async () => {
    expect(await resolveCodes([null, ''])).toMatchObject({ failed: false, rejected: [] })
    expect(api.checkCodes).not.toHaveBeenCalled()
  })
})
