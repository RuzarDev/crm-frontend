import { describe, expect, it } from 'vitest'
import { avatarTone, initials } from '../initials'

describe('initials', () => {
  it.each([
    ['ТОО «Казахмыс Трейд»', 'КТ'],
    ['ИП Сейткали А.', 'СА'],
    ['ТОО "Altyn Med"', 'AM'],
    ['QazLogistic', 'QA'],
    ['АО «Ақжол»', 'АҚ'],
    ['  ', '?'],
    // Внутри кавычек ничего не выбрасываем: «Ақ» здесь — часть названия, а не форма АҚ.
    ['ТОО «Ақ Жол»', 'АЖ'],
    ['АҚ «Қазақтелеком»', 'ҚА'],
    ['LLP “Silk Way”', 'SW'],
    // Без кавычек форма выбрасывается только первым словом и только если за ней что-то есть:
    // одна «ТОО» — это всё, что мы знаем о названии, поэтому «ТО», а не «?».
    ['ТОО', 'ТО'],
    ['Ақ Жол', 'ЖО'],
  ])('%s → %s', (name, expected) => {
    expect(initials(name)).toBe(expected)
  })
  it('null/undefined → «?»', () => {
    expect(initials(null)).toBe('?')
    expect(initials(undefined)).toBe('?')
  })
})

describe('avatarTone', () => {
  it('детерминирован и из допустимых тонов', () => {
    const a = avatarTone('ТОО «Astana Foods»')
    expect(avatarTone('ТОО «Astana Foods»')).toBe(a)
    expect(['neutral', 'info', 'wait', 'submitted', 'done', 'pay']).toContain(a)
  })
  it('null/undefined не падают', () => {
    expect(avatarTone(null)).toBe(avatarTone(''))
    expect(avatarTone(undefined)).toBe(avatarTone(''))
  })
})
