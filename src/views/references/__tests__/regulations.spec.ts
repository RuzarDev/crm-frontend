import { describe, expect, it } from 'vitest'
import type { TnvedRegulationDto } from '@/types/api'
import { filterRegulations, formatDay, regulationDay, regulationRows, sortRegulations } from '../regulations'

const dto = (id: number, number: string, date: string | null, dateStr: string | null = null, url: string | null = null): TnvedRegulationDto =>
  ({ id, number, date, dateStr, url })

describe('regulations', () => {
  it('день — из ISO-даты сервера (время и пояс не двигают день), без неё — из «ДД.ММ.ГГГГ»', () => {
    expect(regulationDay({ date: '2021-09-14T00:00:00', dateStr: null })).toBe('2021-09-14')
    expect(regulationDay({ date: '2021-09-14T23:30:00Z', dateStr: null })).toBe('2021-09-14')
    expect(regulationDay({ date: null, dateStr: '5.3.2019' })).toBe('2019-03-05')
    expect(regulationDay({ date: null, dateStr: 'мусор' })).toBe('')
    expect(regulationDay({ date: null, dateStr: null })).toBe('')
  })

  it('дата показывается по языку интерфейса', () => {
    expect(formatDay('2021-09-14', 'ru')).toBe('14.09.2021')
    expect(formatDay('2021-09-14', 'kk')).toBe('14.09.2021')
    expect(formatDay('2021-09-14', 'en')).toBe('14/09/2021')
    expect(formatDay('', 'ru')).toBe('')
  })

  it('строки: ссылка только http(s); дата не разобралась — строка сервера как есть', () => {
    const rows = regulationRows([
      dto(1, 'А', '2021-09-14', null, ' https://eec.example/a '),
      dto(2, 'Б', null, 'сентябрь 2020', 'javascript:alert(1)'),
      dto(3, 'В', null, null, ''),
    ], 'ru')
    expect(rows.map((r) => r.url)).toEqual(['https://eec.example/a', null, null])
    expect(rows.map((r) => r.dateText)).toEqual(['14.09.2021', 'сентябрь 2020', ''])
  })

  it('сортировка: новые/старые, без даты — в конце при любом порядке, равные даты — по номеру', () => {
    const rows = regulationRows([
      dto(1, 'Решение № 10', '2021-01-01'), dto(2, 'Без даты', null), dto(3, 'Решение № 2', '2021-01-01'), dto(4, 'Старое', '2010-05-05'),
    ], 'ru')
    expect(sortRegulations(rows, 'newest').map((r) => r.id)).toEqual([3, 1, 4, 2])
    expect(sortRegulations(rows, 'oldest').map((r) => r.id)).toEqual([4, 3, 1, 2])
  })

  it('поиск по номеру и дате: год, месяц.год, число, пробелы не мешают', () => {
    const rows = regulationRows([
      dto(1, 'Решение ЕЭК № 80', '2021-09-14'), dto(2, 'Решение КТС № 130', '2010-11-27'), dto(3, 'Приказ 5', null),
    ], 'ru')
    const ids = (q: string) => filterRegulations(rows, q).map((r) => r.id)
    expect(ids('')).toEqual([1, 2, 3])
    expect(ids('2021')).toEqual([1])
    expect(ids('09.2021')).toEqual([1])
    expect(ids('14.09.2021')).toEqual([1])
    expect(ids('2010-11')).toEqual([2])
    expect(ids('ктс №130')).toEqual([2])
    expect(ids('приказ')).toEqual([3])
    expect(ids('zzz')).toEqual([])
  })
})
