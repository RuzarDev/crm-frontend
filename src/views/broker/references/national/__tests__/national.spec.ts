import { describe, expect, it } from 'vitest'
import type { KzListRow } from '@/api/nationalLists'
import { bandText, emptyRequest, filterRows, parseTab, periodText, validateRequest } from '../national'

const t = (k: string, p?: Record<string, unknown>) => `${k.split('.').slice(-1)[0]}${p ? JSON.stringify(p) : ''}`
const row = (number: number, codeText: string, name = 'товар'): KzListRow =>
  ({ number, codeText, name, partial: false, startDate: null, condition: null, section: null, check: null })

describe('national: вкладки, период, поиск, диапазон ставки, проверка формы', () => {
  it('вкладка из ?tab, неизвестная — «Временные меры»', () => {
    expect(parseTab('muc')).toBe('muc')
    expect(parseTab('utilization')).toBe('utilization')
    expect(parseTab('nope')).toBe('measures')
    expect(parseTab(undefined)).toBe('measures')
  })

  it('период: с … по … или «до отмены»', () => {
    expect(periodText(t, { validFrom: '2026-07-27', validTo: '2027-01-26' })).toBe('period{"from":"27.07.2026","to":"26.01.2027"}')
    expect(periodText(t, { validFrom: '2026-07-27', validTo: null })).toBe('periodOpen{"from":"27.07.2026"}')
  })

  it('поиск по перечню: код (с пробелами, «из …», через запятую), номер позиции, слово наименования', () => {
    const rows = [row(1, '2402 20 900 0', 'сигареты'), row(31, 'из 3304, 3305, 3306, 3307', 'косметика'), row(182, '1512 11 990', 'масло')]
    expect(filterRows(rows, '2402').map((r) => r.number)).toEqual([1])
    expect(filterRows(rows, '3306 10').map((r) => r.number)).toEqual([31])
    expect(filterRows(rows, '1512119900').map((r) => r.number)).toEqual([182]) // 10-значный код внутри 9-значной позиции
    expect(filterRows(rows, '182').map((r) => r.number)).toEqual([182])
    expect(filterRows(rows, 'МАСЛО').map((r) => r.number)).toEqual([182])
    expect(filterRows(rows, '  ')).toHaveLength(3)
  })

  it('диапазон ставки утильсбора', () => {
    expect(bandText(t, { engine: 'electric', measure: null, over: null, upTo: null })).toBe('electric')
    expect(bandText(t, { engine: 'ice', measure: 'cm3', over: 1000, upTo: 2000 })).toBe('between{"from":"1 000","to":"2 000","unit":"cm3"}')
    expect(bandText(t, { engine: null, measure: 'hp', over: null, upTo: 60 })).toBe('upTo{"to":"60","unit":"hp"}')
    expect(bandText(t, { engine: null, measure: 't', over: 20, upTo: null })).toBe('over{"from":"20","unit":"t"}')
    expect(bandText(t, { engine: null, measure: null, over: null, upTo: null })).toBe('—')
  })

  it('форма меры: обязательные поля, окончание не раньше начала, ссылка http(s)', () => {
    expect(Object.keys(validateRequest(emptyRequest())).sort()).toEqual(['actName', 'actNumber', 'codeText', 'goods', 'name', 'validFrom'])
    const ok = { ...emptyRequest(), codeText: '1001', goods: 'Пшеница', name: 'Запрет', actName: 'Приказ', actNumber: '273', validFrom: '2026-07-27' }
    expect(validateRequest(ok)).toEqual({})
    expect(validateRequest({ ...ok, validTo: '2026-07-01' })).toEqual({ validTo: 'beforeStart' })
    expect(validateRequest({ ...ok, actUrl: 'ftp://x' })).toEqual({ actUrl: 'url' })
  })
})
