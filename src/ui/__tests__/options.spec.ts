import { describe, expect, it } from 'vitest'
import { defaultFilter, filterOptions, fromKey, indexOptions, optionFor, sameValue, toKey } from '../options'

const opts = [
  { value: 'KZ', label: 'Казахстан', alpha2: 'KZ' },
  { value: 'CN', label: 'Китай', alpha2: 'CN' },
  { value: 'DE', label: 'Германия', alpha2: 'DE' },
]

describe('фильтр опций', () => {
  it('по умолчанию — по label без учёта регистра', () => {
    expect(defaultFilter('каз', opts[0])).toBe(true)
    expect(defaultFilter('КИТ', opts[1])).toBe(true)
    expect(defaultFilter('xx', opts[2])).toBe(false)
  })
  it('optionFilterProp выбирает поле', () => {
    expect(filterOptions(opts, 'cn', true, 'alpha2').map((o) => o.value)).toEqual(['CN'])
  })
  it('функция — как у AntD (input, option)', () => {
    expect(filterOptions(opts, 'x', (_i, o) => o.value === 'DE', 'label').map((o) => o.value)).toEqual(['DE'])
  })
  it('false — без фильтрации; пустой ввод — все', () => {
    expect(filterOptions(opts, 'zzz', false, 'label')).toHaveLength(3)
    expect(filterOptions(opts, '', true, 'label')).toHaveLength(3)
  })
})

describe('ключи для Reka и сравнение значений', () => {
  it('пустая строка подменяется ключом и возвращается обратно; остальное как есть', () => {
    expect(toKey('')).not.toBe('')
    expect(fromKey(toKey(''))).toBe('')
    expect(toKey('IM')).toBe('IM')
    expect(toKey(0)).toBe(0)
    expect(fromKey('IM')).toBe('IM')
    expect(fromKey(7)).toBe(7)
  })
  it('optionFor находит опцию, в том числе с value \'\', иначе — подпись из значения', () => {
    const idx = indexOptions([{ value: '', label: 'Все' }, { value: 1, label: 'Один' }])
    expect(optionFor(idx, '')).toEqual({ value: '', label: 'Все' })
    expect(optionFor(idx, 1).label).toBe('Один')
    expect(optionFor(idx, 'X')).toEqual({ value: 'X', label: 'X' })
  })
  it('sameValue: одиночные, null/undefined, массивы', () => {
    expect(sameValue('EK', 'EK')).toBe(true)
    expect(sameValue('', null)).toBe(false)
    expect(sameValue(null, undefined)).toBe(true)
    expect(sameValue(1, '1')).toBe(false)
    expect(sameValue(['A', 'B'], ['A', 'B'])).toBe(true)
    expect(sameValue(['A', 'B'], ['B', 'A'])).toBe(false)
    expect(sameValue([], null)).toBe(false)
  })
})
