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
  it('сотрудник без особых прав: личные данные, язык, пароль', () => {
    const s = profileSections(access())
    expect(s.cards).toEqual(['personal', 'language', 'password'])
    expect(s.companyFields).toBe(false)
    expect(s.locked).toBe(false)
  })

  it('декларант по праву: карточка декларанта, даже если основная роль другая', () => {
    const s = profileSections(access({ permissions: ['import40.declarant', 'import40.kpp'] }))
    expect(s.cards).toEqual(['personal', 'declarant', 'language', 'password'])
  })

  it('без права import40.declarant карточки декларанта нет', () => {
    expect(profileSections(access({ permissions: ['import40.kpp'] })).cards).not.toContain('declarant')
  })

  it('брокер и экспедитор: в личных данных есть компания и БИН', () => {
    expect(profileSections(access({ role: 'broker' })).companyFields).toBe(true)
    expect(profileSections(access({ role: 'Expeditor' })).companyFields).toBe(true)
    expect(profileSections(access({ role: 'importer' })).companyFields).toBe(false)
  })

  it('администратор: все права, карточка декларанта есть, компании в личных данных нет', () => {
    const s = profileSections(access({ role: 'administrator', hasPermission: () => true }))
    expect(s.cards).toEqual(['personal', 'declarant', 'language', 'password'])
    expect(s.companyFields).toBe(false)
  })

  it('клиент Импорта 40: «Компания» со ссылкой вместо формы; декларанта нет, даже если право пришло', () => {
    const s = profileSections(access({ role: 'client', permissions: ['import40.declarant'] }))
    expect(s.cards).toEqual(['company', 'language', 'password'])
    expect(s.companyFields).toBe(false)
  })

  it('клиент транзита: форма имени и телефона остаётся его единственным способом их сменить', () => {
    const s = profileSections(access({ role: 'client', clientHasModule: (m) => m === 'transit' }))
    expect(s.cards).toEqual(['personal', 'language', 'password'])
  })

  it('временный пароль: пароль первым, остальные закрыты', () => {
    const s = profileSections(access({ permissions: ['import40.declarant'], mustChangePassword: true }))
    expect(s.cards).toEqual(['password', 'personal', 'declarant', 'language'])
    expect(s.locked).toBe(true)
  })

  it('?tab=password без временного пароля: пароль первым, но ничего не закрыто', () => {
    const s = profileSections(access({ passwordFirst: true }))
    expect(s.cards).toEqual(['password', 'personal', 'language'])
    expect(s.locked).toBe(false)
  })
})
