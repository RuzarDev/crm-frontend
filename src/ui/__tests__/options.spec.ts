import { describe, expect, it } from 'vitest'
import { defaultFilter, filterOptions } from '../options'

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
