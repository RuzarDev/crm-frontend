import { describe, expect, it } from 'vitest'
import type { ReestrEntry } from '@/types/api'
import {
  COLUMNS_STORAGE_KEY, DEFAULT_HIDDEN, cellText, formatAmount, formatContainer, formatQuantity, pageTotals,
  readHiddenColumns, statusKey, statusTone, writeHiddenColumns,
} from '../transit'

const entry = (data: Record<string, string | null>, grandTotalWithVat: number | null = null) =>
  ({ id: 'x', data, grandTotalWithVat } as unknown as ReestrEntry)

const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, m }
}

describe('transit: статусы', () => {
  it('тоны: 0 info, 1 submitted, 2 done, 3 pay, 4 и 5 danger, 6 и 7 neutral', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((s) => statusTone(s as never))).toEqual(
      ['info', 'submitted', 'done', 'pay', 'danger', 'danger', 'neutral', 'neutral'],
    )
    expect(statusTone(42 as never)).toBe('neutral')
  })

  it('ключи подписей статусов', () => {
    expect(statusKey(0)).toBe('InProgress')
    expect(statusKey(3)).toBe('ConditionallyReleased')
    expect(statusKey(7)).toBe('Archived')
  })
})

describe('transit: суммы страницы', () => {
  it('складывает места, вес и итог; нечисловые и пустые пропускаются', () => {
    const t = pageTotals([
      entry({ 'Количество мест': '9', 'Вес': '8529' }, 86400),
      entry({ 'Количество мест': 'много', 'Вес': '12.5' }, null),
      entry({ 'Количество мест': null, 'Вес': '' }, 1000.5),
      entry({ 'Количество мест': '3' }),
    ])
    expect(t).toEqual({ places: 12, weight: 8541.5, total: 87400.5 })
  })

  it('ни одного числа — null; без двоичного хвоста у дробей', () => {
    expect(pageTotals([entry({ 'Вес': 'н/д' })])).toEqual({ places: null, weight: null, total: null })
    expect(pageTotals([entry({ 'Вес': '0.1' }), entry({ 'Вес': '0.2' })]).weight).toBe(0.3)
  })
})

describe('transit: выбор колонок в localStorage', () => {
  it('нет записи — скрыты колонки по умолчанию', () => {
    expect(readHiddenColumns(memory())).toEqual(DEFAULT_HIDDEN)
  })

  it('битый JSON, не массив, недоступное хранилище — по умолчанию, без исключения', () => {
    expect(readHiddenColumns(memory({ [COLUMNS_STORAGE_KEY]: '{oops' }))).toEqual(DEFAULT_HIDDEN)
    expect(readHiddenColumns(memory({ [COLUMNS_STORAGE_KEY]: '"post"' }))).toEqual(DEFAULT_HIDDEN)
    const broken = { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('QuotaExceeded') } }
    expect(readHiddenColumns(broken)).toEqual(DEFAULT_HIDDEN)
    expect(() => writeHiddenColumns(['post'], broken)).not.toThrow()
    expect(readHiddenColumns(null)).toEqual(DEFAULT_HIDDEN)
  })

  it('запись и чтение: неизвестные и несъёмные колонки отбрасываются, порядок — как в таблице', () => {
    const s = memory()
    writeHiddenColumns(['post', 'date', 'container' as never, 'nope' as never], s)
    expect(JSON.parse(s.m.get(COLUMNS_STORAGE_KEY)!)).toEqual(['date', 'post'])
    expect(readHiddenColumns(s)).toEqual(['date', 'post'])
    s.setItem(COLUMNS_STORAGE_KEY, '["no","weight","zzz"]')
    expect(readHiddenColumns(s)).toEqual(['weight'])
    s.setItem(COLUMNS_STORAGE_KEY, '[]')
    expect(readHiddenColumns(s)).toEqual([])
  })
})

describe('transit: ячейки', () => {
  it('пусто — «—», дата — ДД.ММ.ГГГГ, ключи данных — русские', () => {
    const e = entry({ 'Дата': '2026-10-08', 'Груз': '  ', 'Получатель': 'ТОО «Альфа»' })
    expect(cellText(e, 'date')).toBe('08.10.2026')
    expect(cellText(e, 'cargo')).toBe('—')
    expect(cellText(e, 'td')).toBe('—')
    expect(cellText(e, 'consignee')).toBe('ТОО «Альфа»')
  })

  it('контейнер, количества и суммы', () => {
    expect(formatContainer('MRSU4885849')).toBe('MRSU 488584 9')
    expect(formatContainer('mrsu 488584 9')).toBe('MRSU 488584 9')
    expect(formatContainer('ПЛАТФОРМА-12')).toBe('ПЛАТФОРМА-12')
    expect(formatQuantity('8529')).toBe('8 529')
    expect(formatQuantity('12.5')).toBe('12,5')
    expect(formatQuantity(null)).toBe('—')
    expect(formatQuantity('н/д')).toBe('н/д')
    expect(formatAmount(86400)).toBe('86 400')
    expect(formatAmount(null)).toBe('—')
  })
})
