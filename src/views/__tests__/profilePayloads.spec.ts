import { describe, it, expect } from 'vitest'
import { buildDeclarantAccountPayload, buildCompanyFormPayload } from '../profilePayloads'

describe('payload профиля', () => {
  it('карточка декларанта не передаёт companyName/innBin (иначе сервер затирает компанию и БИН)', () => {
    const payload = buildDeclarantAccountPayload({ fullName: 'Иванов И.И.', phone: '+7 700 000 00 00' })
    expect(payload).toEqual({ displayName: 'Иванов И.И.', phone: '+7 700 000 00 00' })
    expect('companyName' in payload).toBe(false)
    expect('innBin' in payload).toBe(false)
    expect(JSON.stringify(payload)).not.toContain('companyName')
  })

  it('пустое ФИО/телефон декларанта очищают личные данные (null), компанию не трогают', () => {
    const payload = buildDeclarantAccountPayload({ fullName: '', phone: null })
    expect(payload).toEqual({ displayName: null, phone: null })
  })

  it('форма компании: очищенные поля уходят пустой строкой, а не null', () => {
    const payload = buildCompanyFormPayload({ displayName: 'Брокер', phone: '', companyName: '', innBin: null })
    expect(payload.companyName).toBe('')
    expect(payload.innBin).toBe('')
    expect(payload.phone).toBeNull()
  })

  it('форма компании передаёт значения', () => {
    const payload = buildCompanyFormPayload({ displayName: 'Б', phone: '1', companyName: ' ТОО Х ', innBin: '123456789012' })
    expect(payload).toMatchObject({ companyName: 'ТОО Х', innBin: '123456789012' })
  })
})
