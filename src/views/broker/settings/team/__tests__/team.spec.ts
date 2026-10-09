import { describe, expect, it } from 'vitest'
import { ADMIN_FILTER, filterTeam, generatePassword, memberName, mergeClients, orderRoles, systemRoleFor } from '../team'
import type { TeamMemberDto } from '@/types/api'

const m = (o: Partial<TeamMemberDto>): TeamMemberDto => ({
  id: 'x', username: 'u', displayName: null, systemRole: 'importer', businessRoles: [], createdAtUtc: '', isPoaRepresentative: false, clientCount: 0, ...o,
})

describe('team.ts', () => {
  it('memberName: имя, а без него логин', () => {
    expect(memberName(m({ displayName: ' Динара ' }))).toBe('Динара')
    expect(memberName(m({ displayName: '  ', username: 'd.s' }))).toBe('d.s')
  })

  it('filterTeam: имя, логин, роль и «Администратор»', () => {
    const rows = [m({ id: '1', username: 'a.k', displayName: 'Куаныш', systemRole: 'administrator', businessRoles: ['rop'] }), m({ id: '2', username: 'd.s', businessRoles: ['kpp'] })]
    expect(filterTeam(rows, 'куан', null).map((r) => r.id)).toEqual(['1'])
    expect(filterTeam(rows, 'D.S', null).map((r) => r.id)).toEqual(['2'])
    expect(filterTeam(rows, '', 'kpp').map((r) => r.id)).toEqual(['2'])
    expect(filterTeam(rows, '', ADMIN_FILTER).map((r) => r.id)).toEqual(['1'])
    expect(filterTeam(rows, 'куан', 'kpp')).toEqual([])
  })

  it('systemRoleFor: mpp→broker, sales→sales, declarant и прочие→importer, администратор важнее', () => {
    expect(systemRoleFor('mpp', false)).toBe('broker')
    expect(systemRoleFor('sales', false)).toBe('sales')
    expect(systemRoleFor('declarant', false)).toBe('importer')
    expect(systemRoleFor('accountant', false)).toBe('importer')
    expect(systemRoleFor('rop', false)).toBe('importer')
    expect(systemRoleFor(undefined, false)).toBe('importer')
    expect(systemRoleFor('mpp', true)).toBe('administrator')
  })

  it('orderRoles: порядок списка, чужие коды в конце', () => {
    expect(orderRoles(['sales', 'declarant', 'zzz'], ['declarant', 'kpp', 'sales'])).toEqual(['declarant', 'sales', 'zzz'])
  })

  it('generatePassword: 12 знаков без похожих глифов, каждый раз другой', () => {
    const a = generatePassword()
    expect(a).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/)
    expect(generatePassword()).not.toBe(a)
  })

  it('mergeClients: компания и статус из онбординга, без него — логин', () => {
    const catalog = [{ id: 'c1', username: 'zz', role: 'client', createdAtUtc: '', brokers: [{ id: 'b', username: 'broker1', role: 'broker' }], expeditors: [] }, { id: 'c2', username: 'aa', role: 'client', createdAtUtc: '', brokers: [], expeditors: [] }]
    const merged = mergeClients(catalog, [{ id: 'c1', companyName: 'ТОО Бета', bin: '1', status: 'Active' }] as never)
    expect(merged.map((r) => [r.id, r.companyName, r.status])).toEqual([['c1', 'ТОО Бета', 'Active'], ['c2', null, null]])
    expect(merged[0].brokers).toEqual(['broker1'])
    expect(mergeClients(catalog, null).every((r) => r.status === null)).toBe(true)
  })

  it('mergeClients: порядок по алфавиту языка интерфейса', () => {
    const c = (id: string, username: string) => ({ id, username, role: 'client', createdAtUtc: '', brokers: [], expeditors: [] })
    const catalog = [c('1', 'Zeta'), c('2', 'Альфа')]
    expect(mergeClients(catalog, null, 'ru').map((r) => r.id)).toEqual(['2', '1'])
    expect(mergeClients(catalog, null, 'en').map((r) => r.id)).toEqual(['1', '2'])
  })
})
