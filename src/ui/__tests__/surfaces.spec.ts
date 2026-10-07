import { describe, expect, it } from 'vitest'
import { fieldShell, floatingSurface, listItem, Z_LAYER_FLOATING } from '../surfaces'

describe('fieldShell', () => {
  it('базовая рамка поля md', () => {
    const c = fieldShell({})
    expect(c).toContain('rounded-field')
    expect(c).toContain('h-9')
    expect(c).toContain('focus-within:shadow-focus')
    expect(c).toContain('hover:not-focus-within:border-faint')
  })
  it('invalid — красная рамка и без hover-подсветки', () => {
    const c = fieldShell({ invalid: true })
    expect(c).toContain('border-danger')
    expect(c).not.toContain('hover:not-focus-within:border-faint')
  })
  it('disabled — приглушённый фон и текст ink-3', () => {
    const c = fieldShell({ disabled: true })
    expect(c).toContain('bg-sunken')
    expect(c).toContain('text-ink-3')
  })
  it('sm и multiline', () => {
    expect(fieldShell({ size: 'sm' })).toContain('h-7')
    const m = fieldShell({ multiline: true })
    expect(m).toContain('min-h-9')
    expect(m).not.toContain(' h-9')
  })
})

describe('всплывающая поверхность', () => {
  it('слой выше окон AntD и анимация', () => {
    expect(floatingSurface).toContain(Z_LAYER_FLOATING)
    expect(floatingSurface).toContain('data-[state=open]:animate-pop-in')
    expect(listItem).toContain('data-[highlighted]:bg-sunken')
  })
})
