import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveBlob } from '@/ui/download'
import { exportXlsx, formatDay, formatPeriod, formatUpdated, inPeriod, matchesQuery } from '../list'

vi.mock('@/ui/download', () => ({ saveBlob: vi.fn() }))

const t = (k: string) => (k === 'broker.list.yesterday' ? 'вчера' : k)
const now = new Date(2026, 9, 8, 15, 30) // 08.10.2026 15:30 локально

describe('formatUpdated', () => {
  it('сегодня — HH:mm', () => {
    expect(formatUpdated(new Date(2026, 9, 8, 9, 5).toISOString(), now, t)).toBe('09:05')
  })
  it('вчера — подпись', () => {
    expect(formatUpdated(new Date(2026, 9, 7, 23, 59).toISOString(), now, t)).toBe('вчера')
  })
  it('вчера через границу месяца', () => {
    expect(formatUpdated(new Date(2026, 8, 30, 12, 0).toISOString(), new Date(2026, 9, 1, 8, 0), t)).toBe('вчера')
  })
  it('этот год — DD.MM', () => {
    expect(formatUpdated(new Date(2026, 2, 4, 12, 0).toISOString(), now, t)).toBe('04.03')
  })
  it('другой год — DD.MM.YYYY', () => {
    expect(formatUpdated(new Date(2025, 11, 31, 12, 0).toISOString(), now, t)).toBe('31.12.2025')
  })
  it('мусор — пустая строка', () => {
    expect(formatUpdated('не дата', now, t)).toBe('')
  })
})

describe('matchesQuery', () => {
  it('пустой запрос подходит всему', () => {
    expect(matchesQuery('', ['x'])).toBe(true)
    expect(matchesQuery('   ', [])).toBe(true)
  })
  it('без учёта регистра', () => {
    expect(matchesQuery('казахмыс', ['ТОО «Казахмыс Трейд»'])).toBe(true)
    expect(matchesQuery('ИМ-2026', ['им-2026-0182'])).toBe(true)
  })
  it('пробелы в кодах не мешают', () => {
    expect(matchesQuery('8471 30', ['8471300000'])).toBe(true)
    expect(matchesQuery('8471300000', ['8471 30 000 0'])).toBe(true)
  })
  it('пропускает null/undefined и не находит лишнего', () => {
    expect(matchesQuery('abc', [null, undefined, 'xyz'])).toBe(false)
    expect(matchesQuery('abc', [null, 'xABCx'])).toBe(true)
  })
})

describe('inPeriod', () => {
  const p: [string, string] = ['2026-10-01', '2026-10-08']
  it('нет периода — всё подходит', () => {
    expect(inPeriod(null, null)).toBe(true)
    expect(inPeriod('2020-01-01', null)).toBe(true)
  })
  it('нет даты при заданном периоде — не подходит', () => {
    expect(inPeriod(null, p)).toBe(false)
    expect(inPeriod('', p)).toBe(false)
  })
  it('границы включительно (дата и метка времени)', () => {
    expect(inPeriod('2026-10-01', p)).toBe(true)
    expect(inPeriod('2026-10-08', p)).toBe(true)
    expect(inPeriod('2026-09-30', p)).toBe(false)
    expect(inPeriod('2026-10-09', p)).toBe(false)
    expect(inPeriod(new Date(2026, 9, 8, 23, 59).toISOString(), p)).toBe(true)
    expect(inPeriod(new Date(2026, 9, 1, 0, 0).toISOString(), p)).toBe(true)
    expect(inPeriod(new Date(2026, 9, 9, 0, 0).toISOString(), p)).toBe(false)
  })
})

describe('formatPeriod', () => {
  it('текущий год — без года, иначе с годом', () => {
    expect(formatPeriod(['2026-10-01', '2026-10-08'], now)).toBe('01.10–08.10')
    expect(formatPeriod(['2025-12-30', '2026-01-05'], now)).toBe('30.12.2025–05.01.2026')
  })
})

describe('exportXlsx', () => {
  afterEach(() => { vi.useRealTimers() })
  it('сохраняет xlsx-файл с датой в имени', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0))
    await exportXlsx('zayavki', 'Заявки: [1]', [{ a: 1 }])
    vi.useRealTimers()
    expect(saveBlob).toHaveBeenCalledTimes(1)
    const [blob, name] = vi.mocked(saveBlob).mock.calls[0]
    expect(name).toBe('zayavki_2026-10-08.xlsx')
    expect(blob.size).toBeGreaterThan(0)
  })
})

describe('formatDay', () => {
  it('голая дата — как есть, без сдвига пояса', () => {
    expect(formatDay('2026-10-08')).toBe('08.10.2026')
  })
  it('метка времени — локальный день', () => {
    expect(formatDay(new Date(2026, 9, 8, 23, 30).toISOString())).toBe('08.10.2026')
  })
  it('ISO с Z разбирается', () => {
    expect(formatDay('2026-10-08T12:00:00Z')).toBe('08.10.2026')
  })
  it('null, пусто и мусор — «—»', () => {
    expect(formatDay(null)).toBe('—')
    expect(formatDay(undefined)).toBe('—')
    expect(formatDay('')).toBe('—')
    expect(formatDay('не дата')).toBe('—')
  })
})
