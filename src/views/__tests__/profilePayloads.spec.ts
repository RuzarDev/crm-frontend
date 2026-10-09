import { describe, it, expect } from 'vitest'
import { buildCompanyFormPayload } from '../profilePayloads'

describe('payload профиля', () => {
  it('форма компании: очищенные поля уходят пустой строкой, а не null', () => {
    const payload = buildCompanyFormPayload({ displayName: 'Брокер', phone: '', companyName: '', innBin: null }, true)
    expect(payload.companyName).toBe('')
    expect(payload.innBin).toBe('')
    expect(payload.phone).toBeNull()
  })

  it('форма компании передаёт значения', () => {
    const payload = buildCompanyFormPayload({ displayName: 'Б', phone: '1', companyName: ' ТОО Х ', innBin: '123456789012' }, true)
    expect(payload).toMatchObject({ companyName: 'ТОО Х', innBin: '123456789012' })
  })

  it('без полей компании на форме (клиент транзита, импортёр) компанию и БИН не передаём', () => {
    const payload = buildCompanyFormPayload({ displayName: 'Клиент', phone: '+7', companyName: null, innBin: null }, false)
    expect(payload).toEqual({ displayName: 'Клиент', phone: '+7' })
    expect('companyName' in payload).toBe(false)
  })
})
