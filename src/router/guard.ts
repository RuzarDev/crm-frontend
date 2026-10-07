// Решения beforeEach в чистой функции (редизайн, волна 1): логика перенесена из router/index.ts
// без изменений — так её можно проверить тестами. Порядок проверок важен и сохранён.
export interface GuardAuth {
  isAuthenticated: boolean
  role: string
  hasPermission: (p: string) => boolean
  clientHasModule: (m: 'import40' | 'transit') => boolean
  canUseImport40: boolean
  canUseSales: boolean
  isFinanceOnly: boolean
}

// Финансист видит только платежи и документы: операционные разделы закрыты
// даже по прямой ссылке (решение владельца 2026-09-23).
const FINANCE_BLOCKED = ['/import-40', '/reestr', '/document-packages', '/keden', '/tnved', '/dt-guide', '/requests-registry']

/** Куда перенаправить; `null` — пропустить как есть. */
export function guardRedirect(path: string, meta: Record<string, unknown>, a: GuardAuth): string | null {
  if (a.isFinanceOnly && FINANCE_BLOCKED.some((prefix) => path.startsWith(prefix))) {
    return '/finance'
  }
  const requiresAuth = meta.requiresAuth !== false
  const requiredPermission = meta.requiresPermission as string | undefined
  const requiredRole = meta.requiresRole as string | undefined
  const requiredAnyRole = meta.requiresAnyRole as string[] | undefined
  const requiresImport40 = meta.requiresImport40 === true
  const requiresSales = meta.requiresSales === true
  const requiresReferences = meta.requiresReferences === true
  const requiresClientTransit = meta.requiresClientTransit === true

  const normalizedRole = (a.role || '').trim().toLowerCase()

  if (requiresAuth && !a.isAuthenticated) {
    return '/login'
  } else if (
    // Реестр (транзит) — по праву reestr.read; клиенту оставляем как было.
    path === '/reestr' && normalizedRole !== 'administrator' && normalizedRole !== 'client'
    && !a.hasPermission('reestr.read')
  ) {
    return a.canUseImport40 ? '/import-40' : a.canUseSales ? '/sales' : '/'
  } else if (
    path.startsWith('/document-packages') &&
    !(normalizedRole === 'administrator' || normalizedRole === 'expeditor' || a.hasPermission('packages.manage'))
  ) {
    return '/'
  } else if (
    // Счета — сотрудникам по finance.read, клиенту Импорта 40 (свои, только чтение).
    path === '/billing' && normalizedRole !== 'administrator'
    && !(normalizedRole === 'client' ? a.clientHasModule('import40') : a.hasPermission('finance.read'))
  ) {
    return '/'
  } else if (
    // Статусы КЕДЕН — то же условие, что и пункт меню (navModel, buildBrokerNav): экспедитор/клиент транзита/
    // reestr.read/import40.read. Раньше гейтился списком системных ролей — не совпадал с меню.
    path === '/keden-status' && normalizedRole !== 'administrator' && normalizedRole !== 'expeditor'
    && !(normalizedRole === 'client'
      ? a.clientHasModule('transit')
      : a.hasPermission('reestr.read') || a.hasPermission('import40.read'))
  ) {
    return '/'
  } else if (
    // ТН ВЭД — то же условие, что и группа в меню: references.read, admin и client всегда.
    requiresReferences && !(normalizedRole === 'administrator' || normalizedRole === 'client' || a.hasPermission('references.read'))
  ) {
    return '/'
  } else if (
    // «Мои документы» — только клиент транзита (то же условие, что и пункт меню).
    requiresClientTransit && !(normalizedRole === 'client' && a.clientHasModule('transit'))
  ) {
    return '/'
  } else if (requiredRole && normalizedRole !== requiredRole) {
    return '/'
  } else if (requiredAnyRole && !requiredAnyRole.includes(normalizedRole)) {
    return '/'
  } else if (requiresImport40 && !a.canUseImport40) {
    return '/'
  } else if (requiresSales && !a.canUseSales) {
    return '/'
  } else if (requiredPermission && !a.hasPermission(requiredPermission)) {
    return '/'
  } else if (path === '/login' && a.isAuthenticated) {
    return '/'
  }
  return null
}
