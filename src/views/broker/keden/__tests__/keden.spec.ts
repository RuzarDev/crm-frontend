import { describe, expect, it } from 'vitest'
import {
  emptyFilters, filterRows, formatChanged, hasFilters, postOptions, rowFromListItem, rowFromMine, statusOptions, statusTone,
} from '../keden'

describe('keden: тон статуса', () => {
  it('по русскому названию', () => {
    expect(statusTone(null, 'Отказ в выпуске')).toBe('danger')
    expect(statusTone(null, 'Условно выпущена')).toBe('pay')
    expect(statusTone(null, 'Выпуск разрешён')).toBe('done')
    expect(statusTone(null, 'Выпущена')).toBe('done')
    expect(statusTone(null, 'Завершена')).toBe('done')
    expect(statusTone(null, 'Завершён')).toBe('done')
    expect(statusTone(null, 'Отозвана')).toBe('neutral')
    expect(statusTone(null, 'Зарегистрирована')).toBe('submitted')
    expect(statusTone(null, 'На проверке')).toBe('wait')
  })

  it('название главнее кода; без названия — по коду', () => {
    expect(statusTone('ACCEPTED', 'Отказ в выпуске')).toBe('danger')
    expect(statusTone('ACCEPTED', null)).toBe('done')
    expect(statusTone('RELEASED', '')).toBe('done')
    expect(statusTone('DRAFT', null)).toBe('neutral')
  })

  it('незнакомое — info', () => {
    expect(statusTone('10', 'Что-то новое')).toBe('info')
    expect(statusTone(null, null)).toBe('info')
    expect(statusTone(undefined, undefined)).toBe('info')
  })
})

const item = (o: Record<string, unknown>) => rowFromListItem({
  id: 'x', kedenId: 'k', declarationType: 'DT', registrationNumber: null, shortName: null, statusCode: null,
  statusName: null, statusDateTimeUtc: null, registeredDateTimeUtc: null, declarantName: null, customsPost: null, ...o,
})
const mine = (o: Record<string, unknown>) => rowFromMine({
  id: 'y', registrationNumber: null, referenceCode: null, statusName: null, statusDateTimeUtc: null,
  registeredDateTimeUtc: null, customsPost: null, declarantXin: null, declarantName: null, ...o,
})

describe('keden: строки и фильтры', () => {
  const rows = [
    item({ id: '1', registrationNumber: '56000/081026/0012484', declarantName: 'ТОО «Казахмыс Трейд»', statusName: 'Выпуск разрешён', customsPost: 'Достык' }),
    mine({ id: '2', registrationNumber: '56000/071026/0012399', declarantName: 'ТОО «Altyn Med»', declarantXin: '200540031208', statusName: 'На проверке', customsPost: 'Хоргос' }),
  ]

  it('поиск по номеру, декларанту и БИН', () => {
    expect(filterRows(rows, { ...emptyFilters(), q: '0012484' }).map((r) => r.id)).toEqual(['1'])
    expect(filterRows(rows, { ...emptyFilters(), q: 'altyn' }).map((r) => r.id)).toEqual(['2'])
    expect(filterRows(rows, { ...emptyFilters(), q: '200540' }).map((r) => r.id)).toEqual(['2'])
  })

  it('статус и пост — точное совпадение; вместе с поиском', () => {
    expect(filterRows(rows, { q: '', status: 'На проверке', post: null }).map((r) => r.id)).toEqual(['2'])
    expect(filterRows(rows, { q: '', status: null, post: 'Достык' }).map((r) => r.id)).toEqual(['1'])
    expect(filterRows(rows, { q: 'altyn', status: null, post: 'Достык' })).toEqual([])
  })

  it('варианты фильтров — различные значения по алфавиту, пустые отброшены', () => {
    const more = [...rows, item({ id: '3', statusName: 'На проверке', customsPost: ' Достык ' }), item({ id: '4' })]
    expect(statusOptions(more).map((o) => o.value)).toEqual(['Выпуск разрешён', 'На проверке'])
    expect(postOptions(more).map((o) => o.value)).toEqual(['Достык', 'Хоргос'])
  })

  it('hasFilters и метка времени', () => {
    expect(hasFilters(emptyFilters())).toBe(false)
    expect(hasFilters({ q: ' ', status: null, post: null })).toBe(false)
    expect(hasFilters({ q: '', status: 'x', post: null })).toBe(true)
    expect(item({ statusDateTimeUtc: '2026-10-08T05:12:00Z' }).ts).toBe(Date.parse('2026-10-08T05:12:00Z'))
    expect(item({ statusDateTimeUtc: 'мусор' }).ts).toBeNull()
  })

  it('формат «ДД.ММ, ЧЧ:мм» в местном поясе', () => {
    const d = new Date(2026, 9, 8, 9, 5)
    expect(formatChanged(d.toISOString())).toBe('08.10, 09:05')
    expect(formatChanged(null)).toBe('')
    expect(formatChanged('мусор')).toBe('')
  })
})
