import { describe, it, expect } from 'vitest'
import { shortName } from '@/shell/shortName'

describe('shortName', () => {
  it('имя и фамилия → имя и инициал фамилии', () => {
    expect(shortName('Айгерим Касымова')).toBe('Айгерим К.')
    expect(shortName('  Айгерим   Касымова  Нурлановна ')).toBe('Айгерим К.')
    expect(shortName('aigerim kassymova')).toBe('aigerim K.')
  })
  it('одно слово — как есть', () => {
    expect(shortName('admin')).toBe('admin')
    expect(shortName(' declarant ')).toBe('declarant')
  })
  it('пусто и пробелы — пустая строка', () => {
    expect(shortName('  ')).toBe('')
    expect(shortName('')).toBe('')
    expect(shortName(null)).toBe('')
    expect(shortName(undefined)).toBe('')
  })
  it('название организации (второе слово не с буквы) не режется', () => {
    expect(shortName('ТОО «Казахмыс Трейд»')).toBe('ТОО «Казахмыс Трейд»')
  })
})
