import type { CatalogClientRow, TeamMemberDto } from '@/types/api'
import type { ClientOnboardingRow, ClientStatus } from '@/api/clientsOnboarding'
import { matchesQuery } from '@/views/broker/list'

// Чистая логика «Команды» (редизайн, волна 5б): подписи ролей, поиск и фильтр, сборка строк клиентов,
// системный тип аккаунта по бизнес-роли, пароль для нового сотрудника.

/** Бизнес-роли сотрудника в порядке показа (флажки, фильтр). Источник правды — каталог сервера; это запасной список. */
export const STAFF_ROLES = ['declarant', 'kpp', 'mpp', 'accountant', 'sales', 'rop'] as const
/** Значение фильтра «Администратор» — это системный тип аккаунта, а не бизнес-роль. */
export const ADMIN_FILTER = 'administrator'

export const isAdminMember = (m: Pick<TeamMemberDto, 'systemRole'>): boolean => (m.systemRole || '').toLowerCase() === 'administrator'

/** Как называть сотрудника: имя из профиля, а без него логин. */
export const memberName = (m: Pick<TeamMemberDto, 'displayName' | 'username'>): string => m.displayName?.trim() || m.username

/** Поиск по имени и логину; фильтр по роли (бизнес-роль или «Администратор»). */
export const filterTeam = (rows: TeamMemberDto[], q: string, role: string | null): TeamMemberDto[] =>
  rows.filter((m) => {
    if (!matchesQuery(q, [m.displayName, m.username])) return false
    if (!role) return true
    return role === ADMIN_FILTER ? isAdminMember(m) : m.businessRoles.includes(role)
  })

/** Системный тип аккаунта по основной бизнес-роли (как раньше в UsersView): мпп работает с реестром транзита
 *  через таблицу Broker, продажи — свои, остальные — importer. */
export const systemRoleFor = (primaryRole: string | undefined, admin: boolean): string => {
  if (admin) return 'administrator'
  if (primaryRole === 'mpp') return 'broker'
  if (primaryRole === 'sales') return 'sales'
  return 'importer'
}

/** Выбранные роли — в порядке списка (не в порядке нажатий): первая и есть основная. */
export const orderRoles = (selected: string[], order: readonly string[]): string[] => {
  const known = order.filter((r) => selected.includes(r))
  return [...known, ...selected.filter((r) => !order.includes(r))]
}

export const MIN_PASSWORD = 8

// Без похожих глифов (0/O, 1/l/I) — пароль диктуют по телефону.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
/** Пароль на 12 знаков из криптослучайных чисел браузера. */
export function generatePassword(length = 12): string {
  const out: string[] = []
  const buf = new Uint32Array(length)
  crypto.getRandomValues(buf)
  // Отбрасываем значения из «хвоста» диапазона, чтобы распределение букв было ровным.
  const limit = Math.floor(0x100000000 / ALPHABET.length) * ALPHABET.length
  let extra: Uint32Array | null = null
  for (let i = 0; i < length; i++) {
    let v = buf[i]
    while (v >= limit) {
      extra ??= new Uint32Array(1)
      crypto.getRandomValues(extra)
      v = extra[0]
    }
    out.push(ALPHABET[v % ALPHABET.length])
  }
  return out.join('')
}

// ---- Клиенты ----
/** Строка вкладки «Клиенты»: справочник клиентов + (если есть право clients.read) компания и статус из онбординга. */
export interface TeamClientRow {
  id: string
  username: string
  createdAtUtc: string
  companyName: string | null
  bin: string | null
  status: ClientStatus | null
  brokers: string[]
  expeditors: string[]
}

export const clientRowName = (c: Pick<TeamClientRow, 'companyName' | 'username'>): string => c.companyName || c.username

export function mergeClients(catalog: CatalogClientRow[], onboarding: ClientOnboardingRow[] | null): TeamClientRow[] {
  const byId = new Map((onboarding ?? []).map((o) => [o.id, o]))
  return catalog
    .map((c) => {
      const o = byId.get(c.id)
      return {
        id: c.id,
        username: c.username,
        createdAtUtc: c.createdAtUtc,
        companyName: o?.companyName ?? null,
        bin: o?.bin ?? null,
        status: o?.status ?? null,
        brokers: c.brokers.map((b) => b.username),
        expeditors: c.expeditors.map((e) => e.username),
      }
    })
    .sort((a, b) => clientRowName(a).localeCompare(clientRowName(b), 'ru'))
}

export const filterClients = (rows: TeamClientRow[], q: string): TeamClientRow[] =>
  rows.filter((c) => matchesQuery(q, [c.companyName, c.username, c.bin]))
