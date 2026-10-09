import { describe, expect, it } from 'vitest'
import type { TnvedCurrencyDto } from '@/types/api'
import { filterRates, formatRate, rateRows, ratesUpdated } from '../rates'

const c = (codeLat: string, name: string, rate: number, updatedAtUtc = '2026-10-08T03:00:00Z'): TnvedCurrencyDto => ({ codeLat, name, rate, updatedAtUtc })
const DATA = [c('AED', 'Дирхам ОАЭ', 136.12), c('USD', 'Доллар США', 500), c('KRW', 'Вона', 0.36789), c('EUR', 'Евро', 1560.1234)]

describe('rates', () => {
  it('курс — 2–4 знака, разделители по языку интерфейса', () => {
    expect(formatRate(500, 'ru')).toBe('500,00')
    expect(formatRate(0.36789, 'ru')).toBe('0,3679')
    expect(formatRate(1560.1234, 'ru')).toBe('1 560,1234')
    expect(formatRate(1560.1234, 'en')).toBe('1,560.1234')
  })

  it('частые валюты сверху, остальные по коду', () => {
    expect(rateRows(DATA, 'ru').map((r) => r.code)).toEqual(['USD', 'EUR', 'AED', 'KRW'])
    expect(rateRows(null, 'ru')).toEqual([])
  })

  it('поиск по коду, названию и серверному названию', () => {
    const rows = rateRows(DATA, 'en')
    expect(filterRates(rows, 'usd').map((r) => r.code)).toEqual(['USD'])
    expect(filterRates(rows, 'доллар').map((r) => r.code)).toEqual(['USD'])
    expect(filterRates(rows, 'dollar').map((r) => r.code)).toEqual(['USD'])
    expect(filterRates(rows, '').length).toBe(4)
  })

  it('«Обновлено» — по самому свежему курсу, местное время, формат языка интерфейса', () => {
    const d = new Date('2026-10-08T03:00:00Z')
    const p = (n: number) => String(n).padStart(2, '0')
    const hm = `${p(d.getHours())}:${p(d.getMinutes())}`
    expect(ratesUpdated([c('A', 'a', 1, '2026-10-01T00:00:00Z'), c('B', 'b', 1)], 'ru')).toBe(`${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${hm}`)
    expect(ratesUpdated(DATA, 'en')).toBe(`${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${hm}`)
    expect(ratesUpdated([c('A', 'a', 1, 'мусор')], 'ru')).toBe('')
    expect(ratesUpdated(null, 'ru')).toBe('')
  })
})
