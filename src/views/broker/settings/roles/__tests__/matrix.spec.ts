import { describe, expect, it } from 'vitest'
import type { PermissionGroup, RoleRow } from '@/api/permissions'
import {
  cellLock, changedRoles, diffMatrix, groupKey, isChecked, orderedPermissions, permissionKey, pluralCategory, setCell, toDraft, visibleRoles,
} from '../matrix'

const role = (code: string, permissions: string[], editable = true): RoleRow => ({ code, label: code, scope: '', editable, permissions })
const ROWS: RoleRow[] = [
  role('declarant', ['import40.read', 'import40.declarant']),
  role('kpp', ['import40.read']),
  role('accountant', ['finance.read', 'users.read']),
  role('client', ['import40.read']),
  role('administrator', ['import40.read', 'users.read'], false),
  role('expeditor', []),
]
const GROUPS: PermissionGroup[] = [
  { area: 'Импорт 40', permissions: [{ code: 'import40.read', label: 'a' }, { code: 'import40.declarant', label: 'b' }] },
  { area: 'Финансы', permissions: [{ code: 'finance.read', label: 'c' }] },
  { area: 'Администрирование', permissions: [{ code: 'users.read', label: 'd' }, { code: 'roles.manage', label: 'e' }] },
]

describe('matrix: столбцы и ключи', () => {
  it('visibleRoles: без клиента и экспедитора, «Админ» последним', () => {
    expect(visibleRoles(ROWS).map((r) => r.code)).toEqual(['declarant', 'kpp', 'accountant', 'administrator'])
  })
  it('ключи для переводов', () => {
    expect(permissionKey('users.assign_role')).toBe('users_assign_role')
    expect(groupKey('Импорт 40')).toBe('import40')
    expect(groupKey('Администрирование')).toBe('admin')
    expect(groupKey('Что-то новое')).toBeNull()
  })
})

describe('matrix: черновик и дифф', () => {
  it('без правок диффа нет', () => {
    expect(diffMatrix(ROWS, GROUPS, toDraft(ROWS), ['declarant', 'kpp'])).toEqual([])
  })
  it('setCell не меняет исходный черновик; дифф — по порядку прав, затем столбцов', () => {
    const d0 = toDraft(ROWS)
    let d = setCell(d0, 'kpp', 'import40.declarant', true)
    d = setCell(d, 'declarant', 'import40.read', false)
    d = setCell(d, 'accountant', 'finance.read', false)
    expect(isChecked(d0, 'kpp', 'import40.declarant')).toBe(false)
    expect(diffMatrix(ROWS, GROUPS, d, ['declarant', 'kpp', 'accountant'])).toEqual([
      { role: 'declarant', permission: 'import40.read', added: false },
      { role: 'kpp', permission: 'import40.declarant', added: true },
      { role: 'accountant', permission: 'finance.read', added: false },
    ])
  })
  it('вернули как было — правки нет', () => {
    const d = setCell(setCell(toDraft(ROWS), 'kpp', 'finance.read', true), 'kpp', 'finance.read', false)
    expect(diffMatrix(ROWS, GROUPS, d, ['kpp'])).toEqual([])
  })
  it('changedRoles — в порядке столбцов; orderedPermissions — в порядке каталога', () => {
    const d = setCell(setCell(toDraft(ROWS), 'accountant', 'import40.declarant', true), 'kpp', 'finance.read', true)
    const ch = diffMatrix(ROWS, GROUPS, d, ['declarant', 'kpp', 'accountant'])
    expect(changedRoles(ch, ['declarant', 'kpp', 'accountant'])).toEqual(['kpp', 'accountant'])
    expect(orderedPermissions(d, 'accountant', GROUPS)).toEqual(['import40.declarant', 'finance.read', 'users.read'])
  })
})

describe('matrix: недоступные ячейки (как на сервере)', () => {
  const ctx = (o: Partial<{ canManage: boolean; isAdmin: boolean; ownRoles: string[] }> = {}) => ({ canManage: true, isAdmin: false, ownRoles: [] as string[], ...o })
  const kpp = ROWS[1]
  const acc = ROWS[2]
  const admin = ROWS[4]

  it('без roles.manage недоступно всё', () => {
    expect(cellLock(ctx({ canManage: false }), kpp, 'import40.read')).toBe('noManage')
    expect(cellLock(ctx({ canManage: false, isAdmin: true }), kpp, 'import40.read')).toBe('noManage')
  })
  it('столбец «Админ» не меняется никем', () => {
    expect(cellLock(ctx({ isAdmin: true }), admin, 'import40.read')).toBe('adminColumn')
  })
  it('столбец своей роли недоступен не-администратору', () => {
    expect(cellLock(ctx({ ownRoles: ['kpp'] }), kpp, 'finance.read')).toBe('ownRole')
    expect(cellLock(ctx({ ownRoles: ['KPP'] }), kpp, 'finance.read')).toBe('ownRole')
    expect(cellLock(ctx({ ownRoles: ['kpp'] }), acc, 'finance.read')).toBeNull()
  })
  it('права «Администрирования» не-администратор только снимает', () => {
    expect(cellLock(ctx(), kpp, 'roles.manage')).toBe('adminPermission')
    expect(cellLock(ctx(), acc, 'users.read')).toBeNull() // уже есть: можно снять (и вернуть)
    expect(cellLock(ctx(), kpp, 'finance.read')).toBeNull()
  })
  it('администратор меняет всё, кроме столбца «Админ»', () => {
    expect(cellLock(ctx({ isAdmin: true, ownRoles: ['kpp'] }), kpp, 'roles.manage')).toBeNull()
  })
})

describe('matrix: форма числа', () => {
  it('ru: 1 / 2 / 5; en: 1 / 2', () => {
    expect([1, 2, 5, 21].map((n) => pluralCategory(n, 'ru'))).toEqual(['one', 'few', 'many', 'one'])
    expect([1, 2].map((n) => pluralCategory(n, 'en'))).toEqual(['one', 'other'])
    expect([1, 2].map((n) => pluralCategory(n, 'kk'))).toEqual(['one', 'other'])
  })
})
