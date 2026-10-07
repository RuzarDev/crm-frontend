import { describe, expect, it } from 'vitest'
import {
  columnKey, columnKeys, compareValues, fixedOffsets, getValue, isEmptyContent, nextSortOrder, pageCount, pageItems, paginate,
  resolveRowKey, sortRows, type ZColumn,
} from '../table'

describe('getValue по dataIndex', () => {
  const r = { a: { b: { c: 7 } }, n: 0, list: [{ x: 'y' }] }
  it('строка, путь через точку и массив', () => {
    expect(getValue(r, 'n')).toBe(0)
    expect(getValue(r, 'a.b.c')).toBe(7)
    expect(getValue(r, ['a', 'b', 'c'])).toBe(7)
    expect(getValue(r, ['list', '0', 'x'])).toBe('y')
  })
  it('нет пути / нет поля — undefined, без исключений', () => {
    expect(getValue(r, undefined)).toBeUndefined()
    expect(getValue(r, 'a.zz.c')).toBeUndefined()
    expect(getValue(null, 'a')).toBeUndefined()
  })
  it('поле с точкой в имени берётся целиком, если есть', () => {
    expect(getValue({ 'a.b': 1 }, 'a.b')).toBe(1)
  })
})

describe('ключи колонок и строк', () => {
  it('key → dataIndex → номер', () => {
    expect(columnKey({ key: 'k', dataIndex: 'd' }, 3)).toBe('k')
    expect(columnKey({ dataIndex: ['a', 'b'] }, 3)).toBe('a.b')
    expect(columnKey({ title: 'Т' }, 3)).toBe('3')
  })
  it('rowKey строкой, функцией (record, index) и запасной номер', () => {
    expect(resolveRowKey({ id: 5 }, 0, 'id')).toBe(5)
    expect(resolveRowKey({ id: 5 }, 2, (r, i) => `${(r as { id: number }).id}-${i}`)).toBe('5-2')
    expect(resolveRowKey({}, 4, 'id')).toBe(4)
  })
})

describe('сортировка', () => {
  it('порядок переключения: нет → по возрастанию → по убыванию → нет', () => {
    expect(nextSortOrder(null)).toBe('ascend')
    expect(nextSortOrder('ascend')).toBe('descend')
    expect(nextSortOrder('descend')).toBeNull()
  })
  it('compareValues: числа числом, строки по-русски с числами внутри', () => {
    expect(compareValues(9, 10)).toBeLessThan(0)
    expect(compareValues('ёж', 'жук')).toBeLessThan(0)
    expect(compareValues('Б', 'а')).toBeGreaterThan(0)
    expect(compareValues('ДТ-9', 'ДТ-10')).toBeLessThan(0)
    expect(compareValues(new Date(2020, 0, 1), new Date(2019, 0, 1))).toBeGreaterThan(0)
  })
  const col = (sorter: ZColumn['sorter'], dataIndex = 'v'): ZColumn => ({ dataIndex, sorter })
  const rows = [{ v: 10 }, { v: null }, { v: 2 }, { v: undefined }, { v: 33 }, { v: '' }]
  it('sorter: true — числа, пустые в конце в обе стороны', () => {
    expect(sortRows(rows, col(true), 'ascend').map((r) => r.v)).toEqual([2, 10, 33, null, undefined, ''])
    expect(sortRows(rows, col(true), 'descend').map((r) => r.v)).toEqual([33, 10, 2, null, undefined, ''])
  })
  it('sorter: true — строки ru', () => {
    const s = [{ v: 'Яблоко' }, { v: 'арбуз' }, { v: 'Ёлка' }, { v: 'Елка' }, { v: null }]
    expect(sortRows(s, col(true), 'ascend').map((r) => r.v)).toEqual(['арбуз', 'Ёлка', 'Елка', 'Яблоко', null])
  })
  it('функция-sorter как у AntD: descend переворачивает её результат', () => {
    const fn = (a: { v: number }, b: { v: number }) => a.v - b.v
    const s = [{ v: 2 }, { v: 1 }, { v: 3 }]
    expect(sortRows(s, { sorter: fn } as ZColumn<{ v: number }>, 'ascend').map((r) => r.v)).toEqual([1, 2, 3])
    expect(sortRows(s, { sorter: fn } as ZColumn<{ v: number }>, 'descend').map((r) => r.v)).toEqual([3, 2, 1])
  })
  it('без порядка или без sorter — исходный массив; исходник не меняется', () => {
    const s = [{ v: 2 }, { v: 1 }]
    expect(sortRows(s, col(true), null)).toBe(s)
    expect(sortRows(s, { dataIndex: 'v' }, 'ascend')).toBe(s)
    sortRows(s, col(true), 'ascend')
    expect(s.map((r) => r.v)).toEqual([2, 1])
  })
  it('устойчивая: равные остаются в исходном порядке', () => {
    const s = [{ v: 1, n: 'a' }, { v: 0, n: 'b' }, { v: 1, n: 'c' }]
    expect(sortRows(s, col(true), 'ascend').map((r) => r.n)).toEqual(['b', 'a', 'c'])
  })
})

describe('страницы', () => {
  it('pageCount и paginate', () => {
    expect(pageCount(0, 25)).toBe(0)
    expect(pageCount(25, 25)).toBe(1)
    expect(pageCount(26, 25)).toBe(2)
    const list = Array.from({ length: 30 }, (_, i) => i)
    expect(paginate(list, 1, 25)).toHaveLength(25)
    expect(paginate(list, 2, 25)).toEqual([25, 26, 27, 28, 29])
  })
  it('pageItems: до 7 страниц — все; дальше — с многоточиями', () => {
    expect(pageItems(1, 1)).toEqual([1])
    expect(pageItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(pageItems(1, 9)).toEqual([1, 2, 3, 4, 5, '…', 9])
    expect(pageItems(5, 9)).toEqual([1, '…', 4, 5, 6, '…', 9])
    expect(pageItems(9, 9)).toEqual([1, '…', 5, 6, 7, 8, 9])
    expect(pageItems(4, 20)).toEqual([1, 2, 3, 4, 5, '…', 20])
    expect(pageItems(17, 20)).toEqual([1, '…', 16, 17, 18, 19, 20])
  })
})

describe('закреплённые колонки', () => {
  it('смещения слева накапливаются (с учётом колонки выбора), справа — с конца; крайние помечены', () => {
    const cols: ZColumn[] = [
      { key: 'a', fixed: 'left', width: 56 },
      { key: 'b', fixed: 'left', width: '120px' },
      { key: 'c', width: 200 },
      { key: 'd', fixed: 'right', width: 90 },
      { key: 'e', fixed: 'right', width: 130 },
    ]
    expect(fixedOffsets(cols, 40)).toEqual([
      { side: 'left', offset: 40, edge: false },
      { side: 'left', offset: 96, edge: true },
      {},
      { side: 'right', offset: 130, edge: true },
      { side: 'right', offset: 0, edge: false },
    ])
  })
  it('строковая ширина не в px не учитывается', () => {
    const cols: ZColumn[] = [{ key: 'a', fixed: 'left', width: '10%' }, { key: 'b', fixed: 'left', width: 50 }]
    expect(fixedOffsets(cols, 0)[1]).toEqual({ side: 'left', offset: 0, edge: true })
  })
})

describe('isEmptyContent', () => {
  it('пусто: null, false, \'\', комментарий v-if, фрагмент из пустого; не пусто: текст, элемент, 0', async () => {
    const { h, createCommentVNode, createTextVNode, Fragment } = await import('vue')
    expect(isEmptyContent(undefined)).toBe(true)
    expect(isEmptyContent([createCommentVNode('v-if', true)])).toBe(true)
    expect(isEmptyContent([h(Fragment, [createCommentVNode('v-if', true), createTextVNode('')])])).toBe(true)
    expect(isEmptyContent([createTextVNode('x')])).toBe(false)
    expect(isEmptyContent([h('b')])).toBe(false)
    expect(isEmptyContent(0)).toBe(false)
  })
})

describe('числа строкой и уникальные ключи колонок', () => {
  it('строки-числа сортируются по величине (в т.ч. «1 000,00»), пустые — в конце', () => {
    const rows = ['10.5', '9', '', '-3', '-20', '1 000,00', null].map((v) => ({ v }))
    const col: ZColumn<{ v: string | null }> = { dataIndex: 'v', sorter: true }
    expect(sortRows(rows, col, 'ascend').map((r) => r.v)).toEqual(['-20', '-3', '9', '10.5', '1 000,00', '', null])
    expect(sortRows(rows, col, 'descend').map((r) => r.v)).toEqual(['1 000,00', '10.5', '9', '-3', '-20', '', null])
  })
  it('compareValues: обе строки-числа — числом; иначе — строкой (числа раньше текста)', () => {
    expect(compareValues('9', '10.5')).toBeLessThan(0)
    expect(compareValues('-20', '-3')).toBeLessThan(0)
    expect(compareValues('1 000,00', '999')).toBeGreaterThan(0)
    expect(compareValues('ДТ-9', 'ДТ-10')).toBeLessThan(0)
    expect(compareValues('08.10.2026', '09.10.2025')).toBeLessThan(0)
    expect(compareValues('5', 'абв')).toBeLessThan(0)
    expect(compareValues('абв', '5')).toBeGreaterThan(0)
  })
  it('columnKeys: совпавшие ключи (без key, общий dataIndex) делаются уникальными номером колонки', () => {
    expect(columnKeys([{ dataIndex: 'sum' }, { dataIndex: 'sum' }, { key: 'x' }, { title: 'Т' }])).toEqual(['sum', 'sum-1', 'x', '3'])
    expect(columnKeys([{ key: 'a' }, { dataIndex: 'b' }])).toEqual(['a', 'b'])
  })
})
