import { describe, expect, it } from 'vitest'
import { greetingKey, greetingName } from '../greeting'

describe('greetingKey', () => {
  it.each([
    [0, 'night'], [4, 'night'], [5, 'morning'], [11, 'morning'], [12, 'day'], [17, 'day'],
    [18, 'evening'], [22, 'evening'], [23, 'night'],
  ] as const)('%i ч → %s', (hour, part) => {
    expect(greetingKey(hour)).toBe(part)
  })
})

describe('greetingName', () => {
  it('первое слово имени', () => expect(greetingName('  Айгерим   Касымова ')).toBe('Айгерим'))
  it('ФИО с отчеством (имя из профиля декларанта, 02.11.2026) — имя, а не фамилия', () => {
    expect(greetingName('Тестов Тест Тестович')).toBe('Тест')
    expect(greetingName('Тестова Тестия Тестовна')).toBe('Тестия')
    expect(greetingName('Тестбек Тестжан Тестұлы')).toBe('Тестжан')
    expect(greetingName('Тестова Тестгүл Тестқызы')).toBe('Тестгүл')
    expect(greetingName('Тест Тестов Иванов')).toBe('Тест')
  })
  it('пусто и null — пустая строка', () => {
    expect(greetingName(null)).toBe('')
    expect(greetingName('   ')).toBe('')
  })
})
