import { describe, expect, it } from 'vitest'
import { declarantChanged, emptyDeclarant, iinError, passwordErrors } from '../profileForms'

describe('iinError', () => {
  it('пусто — можно (ИИН не обязателен)', () => {
    expect(iinError(null)).toBeNull()
    expect(iinError('  ')).toBeNull()
  })
  it('12 цифр — можно; иначе ошибка', () => {
    expect(iinError('900412450123')).toBeNull()
    expect(iinError('90041245012')).toBe('iin')
    expect(iinError('9004124501234')).toBe('iin')
    expect(iinError('90041245012a')).toBe('iin')
  })
})

describe('passwordErrors', () => {
  it('пустая форма: нужен текущий, новый короткий', () => {
    expect(passwordErrors({ current: '', next: '', repeat: '' })).toEqual({ current: 'required', next: 'min' })
  })
  it('новый короче 8 — ошибка у нового, повтор не ругаем', () => {
    expect(passwordErrors({ current: 'x', next: '1234567', repeat: '' })).toEqual({ next: 'min' })
  })
  it('повтор не совпал — ошибка у повтора', () => {
    expect(passwordErrors({ current: 'x', next: '12345678', repeat: '1234567' })).toEqual({ repeat: 'mismatch' })
  })
  it('всё верно — ошибок нет', () => {
    expect(passwordErrors({ current: 'x', next: '12345678', repeat: '12345678' })).toEqual({})
  })
})

describe('declarantChanged', () => {
  it('одинаковое — не менялось; пустая строка и null — одно и то же', () => {
    const a = { ...emptyDeclarant(), fullName: 'Иванов' }
    expect(declarantChanged(a, { ...a, position: '' })).toBe(false)
  })
  it('дата с временем и без — одна и та же', () => {
    const a = { ...emptyDeclarant(), idDocIssueDate: '2019-03-12T00:00:00Z' }
    expect(declarantChanged(a, { ...a, idDocIssueDate: '2019-03-12' })).toBe(false)
    expect(declarantChanged(a, { ...a, idDocIssueDate: '2019-03-13' })).toBe(true)
  })
  it('любое поле, в том числе не показанное в форме, считается изменением', () => {
    const a = emptyDeclarant()
    expect(declarantChanged(a, { ...a, iin: '900412450123' })).toBe(true)
    expect(declarantChanged(a, { ...a, idDocCountryCode: 'KZ' })).toBe(true)
  })
})
