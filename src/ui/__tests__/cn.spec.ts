import { describe, expect, it } from 'vitest'
import { cn } from '../cn'

describe('cn', () => {
  it('склеивает и отбрасывает пустое', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c')
  })
  it('размер текста и цвет текста не конфликтуют (наша шкала)', () => {
    expect(cn('text-sm', 'text-ink')).toBe('text-sm text-ink')
    expect(cn('text-md', 'text-ink-2')).toBe('text-md text-ink-2')
  })
  it('последний размер текста побеждает, включая наш md', () => {
    expect(cn('text-sm', 'text-md')).toBe('text-md')
  })
  it('наши радиусы и тени сливаются', () => {
    expect(cn('rounded-field', 'rounded-panel')).toBe('rounded-panel')
    expect(cn('shadow-raised', 'shadow-float')).toBe('shadow-float')
  })
  it('паддинги сливаются как в tailwind-merge', () => {
    expect(cn('px-3', 'px-0')).toBe('px-0')
  })
})
