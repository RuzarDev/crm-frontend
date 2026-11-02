import { describe, expect, it } from 'vitest'
import { profileSections, type ProfileAccess } from '../profileSections'

const access = (over: Partial<ProfileAccess> & { permissions?: string[] } = {}): ProfileAccess => {
  const { permissions = [], ...rest } = over
  return {
    role: 'importer',
    hasPermission: (p) => permissions.includes(p),
    clientHasModule: (m) => m === 'import40',
    mustChangePassword: false,
    ...rest,
  }
}

describe('profileSections: какие карточки кому', () => {
  it('сотрудник без особых прав (бухгалтер, продажи): личные данные с именем и телефоном, язык, пароль', () => {
    const s = profileSections(access())
    expect(s.cards).toEqual(['personal', 'language', 'password'])
    expect(s.companyFields).toBe(false)
    expect(s.nameFields).toBe(true)
    expect(s.locked).toBe(false)
  })

  it('декларант по праву: карточка декларанта и «Мои доверенности»; «Личных данных» нет — ФИО и телефон в карточке (02.11.2026)', () => {
    const s = profileSections(access({ permissions: ['import40.declarant', 'import40.kpp'] }))
    expect(s.cards).toEqual(['declarant', 'mypoas', 'language', 'password'])
    expect(s.nameFields).toBe(false)
  })

  it('брокер с правом декларанта: в «Личных данных» остаются только компания и БИН', () => {
    const s = profileSections(access({ role: 'broker', permissions: ['import40.declarant'] }))
    expect(s.cards).toEqual(['personal', 'declarant', 'mypoas', 'language', 'password'])
    expect(s.nameFields).toBe(false)
    expect(s.companyFields).toBe(true)
  })

  it('без прав import40.declarant и import40.kpp карточки декларанта нет', () => {
    const cards = profileSections(access({ permissions: ['import40.read'] })).cards
    expect(cards).not.toContain('declarant')
    expect(cards).not.toContain('mypoas')
  })

  it('КПП: карточка есть — из неё берутся данные для доверенности (30.10.2026)', () => {
    expect(profileSections(access({ permissions: ['import40.kpp'] })).cards).toEqual(['declarant', 'mypoas', 'language', 'password'])
  })

  it('брокер и экспедитор: в личных данных есть компания и БИН', () => {
    expect(profileSections(access({ role: 'broker' })).companyFields).toBe(true)
    expect(profileSections(access({ role: 'Expeditor' })).companyFields).toBe(true)
    expect(profileSections(access({ role: 'importer' })).companyFields).toBe(false)
  })

  it('администратор: все права, карточка декларанта есть, компании в личных данных нет', () => {
    const s = profileSections(access({ role: 'administrator', hasPermission: () => true }))
    expect(s.cards).toEqual(['declarant', 'mypoas', 'language', 'password'])
    expect(s.companyFields).toBe(false)
  })

  it('клиент Импорта 40: «Компания» со ссылкой вместо формы; декларанта нет, даже если право пришло', () => {
    const s = profileSections(access({ role: 'client', permissions: ['import40.declarant'] }))
    expect(s.cards).toEqual(['company', 'telegram', 'language', 'password'])
    expect(s.companyFields).toBe(false)
  })

  it('клиент транзита: форма имени и телефона остаётся его единственным способом их сменить', () => {
    const s = profileSections(access({ role: 'client', clientHasModule: (m) => m === 'transit' }))
    expect(s.cards).toEqual(['personal', 'telegram', 'language', 'password'])
  })

  it('временный пароль: пароль первым, остальные закрыты', () => {
    const s = profileSections(access({ permissions: ['import40.declarant'], mustChangePassword: true }))
    expect(s.cards).toEqual(['password', 'declarant', 'mypoas', 'language'])
    expect(s.locked).toBe(true)
  })

  it('?tab=password без временного пароля: пароль первым, но ничего не закрыто', () => {
    const s = profileSections(access({ passwordFirst: true }))
    expect(s.cards).toEqual(['password', 'personal', 'language'])
    expect(s.locked).toBe(false)
  })
})
