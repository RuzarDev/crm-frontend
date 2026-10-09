import type { PermissionGroup, RoleRow } from '@/api/permissions'

// Чистая логика «Ролей и прав» (редизайн, волна 5б): какие столбцы показывать, черновик правок, дифф к сохранённому,
// какие ячейки недоступны и почему (то же, что проверяет сервер).

export const ADMIN_ROLE = 'administrator'
/** Тип аккаунта «клиент»/«экспедитор» права берёт из типа, а не из матрицы: столбцов у них нет. */
const HIDDEN_ROLES = ['client', 'expeditor']
/** Права группы «Администрирование»: не-администратор может их только снимать, не выдавать. */
export const ADMIN_PERMISSIONS: readonly string[] = ['users.read', 'users.write', 'users.delete', 'users.assign_role', 'roles.manage', 'endpoints.read']
export const isAdminPermission = (code: string): boolean => ADMIN_PERMISSIONS.includes(code)

// Сервер называет группу русским словом; ключ для enum.permissionGroup.* — по нему (неизвестная группа — как есть).
const GROUP_KEYS: Record<string, string> = {
  'Импорт 40': 'import40',
  'Транзит': 'transit',
  'Клиенты': 'clients',
  'Продажи': 'sales',
  'Финансы': 'finance',
  'Справочники': 'references',
  'Аналитика': 'analytics',
  'Администрирование': 'admin',
}
export const groupKey = (area: string): string | null => GROUP_KEYS[area] ?? null

/** Ключ enum.permission.* для кода права. */
export const permissionKey = (code: string): string => code.trim().toLowerCase().replace(/\./g, '_')

export const isAdminRole = (code: string): boolean => (code || '').toLowerCase() === ADMIN_ROLE

/** Столбцы: роли сотрудников в порядке сервера, «Админ» последним; «Клиент»/«Экспедитор» не показываем. */
export function visibleRoles(rows: RoleRow[]): RoleRow[] {
  const shown = rows.filter((r) => !HIDDEN_ROLES.includes(r.code.toLowerCase()))
  return [...shown.filter((r) => !isAdminRole(r.code)), ...shown.filter((r) => isAdminRole(r.code))]
}

/** Черновик: роль → отмеченные права. */
export type Draft = Record<string, string[]>

export const toDraft = (rows: RoleRow[]): Draft => Object.fromEntries(rows.map((r) => [r.code, [...r.permissions]]))

export const isChecked = (draft: Draft, role: string, permission: string): boolean => !!draft[role]?.includes(permission)

/** Новый черновик с одной переключённой ячейкой (исходный не меняется). */
export function setCell(draft: Draft, role: string, permission: string, on: boolean): Draft {
  const rest = (draft[role] ?? []).filter((p) => p !== permission)
  return { ...draft, [role]: on ? [...rest, permission] : rest }
}

export interface Change { role: string; permission: string; added: boolean }

/** Отличия черновика от сохранённого: по порядку прав в таблице, внутри права — по порядку столбцов. */
export function diffMatrix(rows: RoleRow[], groups: PermissionGroup[], draft: Draft, roleOrder: string[]): Change[] {
  const saved = new Map(rows.map((r) => [r.code, new Set(r.permissions)]))
  const out: Change[] = []
  for (const g of groups) {
    for (const p of g.permissions) {
      for (const role of roleOrder) {
        const was = saved.get(role)?.has(p.code) ?? false
        const now = isChecked(draft, role, p.code)
        if (was !== now) out.push({ role, permission: p.code, added: now })
      }
    }
  }
  return out
}

/** Роли с правками — в порядке столбцов. */
export const changedRoles = (changes: Change[], roleOrder: string[]): string[] =>
  roleOrder.filter((r) => changes.some((c) => c.role === r))

/** Права роли для сохранения — в порядке каталога (а не в порядке нажатий). */
export function orderedPermissions(draft: Draft, role: string, groups: PermissionGroup[]): string[] {
  const all = groups.flatMap((g) => g.permissions.map((p) => p.code))
  const set = new Set(draft[role] ?? [])
  const known = all.filter((c) => set.has(c))
  return [...known, ...[...set].filter((c) => !all.includes(c))]
}

export type Lock = 'noManage' | 'adminColumn' | 'ownRole' | 'adminPermission'

export interface LockContext {
  /** У текущего пользователя есть roles.manage. */
  canManage: boolean
  /** Текущий пользователь — администратор (ему можно всё, кроме столбца «Админ»). */
  isAdmin: boolean
  /** Бизнес-роли текущего пользователя. */
  ownRoles: string[]
}

/**
 * Почему ячейка недоступна (null — можно менять). Совпадает с сервером: без roles.manage нельзя ничего;
 * столбец администратора неизменен; не-администратор не меняет столбец своей роли и не выдаёт права «Администрирования»
 * (снять их можно; вернуть то, что было сохранено, — тоже: это не добавление).
 */
export function cellLock(ctx: LockContext, role: RoleRow, permission: string): Lock | null {
  if (!ctx.canManage) return 'noManage'
  if (!role.editable || isAdminRole(role.code)) return 'adminColumn'
  if (ctx.isAdmin) return null
  if (ctx.ownRoles.map((r) => r.toLowerCase()).includes(role.code.toLowerCase())) return 'ownRole'
  if (isAdminPermission(permission) && !role.permissions.includes(permission)) return 'adminPermission'
  return null
}

/** Форма числа для «N изменений»: ru — one/few/many, kk и en — one/other. */
export const pluralCategory = (n: number, locale: string): 'one' | 'few' | 'many' | 'other' =>
  new Intl.PluralRules(locale).select(n) as 'one' | 'few' | 'many' | 'other'
