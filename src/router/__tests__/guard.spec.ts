import { describe, it, expect } from 'vitest'
import { guardRedirect, type GuardAuth } from '@/router/guard'

const auth = (o: Partial<GuardAuth> & { perms?: string[] } = {}): GuardAuth => {
  const perms = o.perms ?? []
  const role = o.role ?? 'broker'
  return {
    isAuthenticated: o.isAuthenticated ?? true,
    role,
    hasPermission: (p) => role === 'administrator' || perms.includes(p),
    clientHasModule: o.clientHasModule ?? ((m) => m === 'import40'),
    canUseImport40: o.canUseImport40 ?? (role === 'administrator' || perms.includes('import40.read')),
    canUseSales: o.canUseSales ?? (role === 'administrator' || perms.includes('sales.read')),
    isFinanceOnly: o.isFinanceOnly ?? false,
    mustChangePassword: o.mustChangePassword ?? false,
  }
}

describe('guardRedirect', () => {
  it('без входа — на /login', () => {
    expect(guardRedirect('/home', {}, auth({ isAuthenticated: false }))).toBe('/login')
    expect(guardRedirect('/login', { requiresAuth: false }, auth({ isAuthenticated: false }))).toBeNull()
  })
  it('вошедший на /login — на /', () => {
    expect(guardRedirect('/login', { requiresAuth: false }, auth())).toBe('/')
  })
  it('только финансы: стена на заявки/транзит/КЕДЕН/справочники', () => {
    const a = auth({ isFinanceOnly: true, perms: ['finance.read'] })
    for (const p of ['/import-40', '/import-40/manage', '/reestr', '/reestr/abc', '/document-packages', '/keden', '/keden-status', '/tnved/tree', '/dt-guide', '/requests-registry'])
      expect(guardRedirect(p, {}, a), p).toBe('/finance')
    expect(guardRedirect('/home', {}, a)).toBeNull()
  })
  it('/reestr без reestr.read — на импорт, продажи или /', () => {
    expect(guardRedirect('/reestr', {}, auth({ perms: ['import40.read'] }))).toBe('/import-40')
    expect(guardRedirect('/reestr', {}, auth({ perms: ['sales.read'] }))).toBe('/sales')
    expect(guardRedirect('/reestr', {}, auth())).toBe('/')
    expect(guardRedirect('/reestr', {}, auth({ role: 'client' }))).toBeNull()
  })
  it('страница записи /reestr/:id и /reestr/new — то же правило reestr.read; клиенту и администратору можно', () => {
    for (const p of ['/reestr/abc', '/reestr/new']) {
      expect(guardRedirect(p, {}, auth({ perms: ['import40.read'] })), p).toBe('/import-40')
      expect(guardRedirect(p, {}, auth()), p).toBe('/')
      expect(guardRedirect(p, {}, auth({ perms: ['reestr.read'] })), p).toBeNull()
      expect(guardRedirect(p, {}, auth({ role: 'client' })), p).toBeNull()
      expect(guardRedirect(p, {}, auth({ role: 'administrator' })), p).toBeNull()
    }
    // Похожий префикс — не реестр.
    expect(guardRedirect('/reestrx', {}, auth())).toBeNull()
  })
  it('пакеты: админ/экспедитор/packages.manage', () => {
    expect(guardRedirect('/document-packages/1/workspace', {}, auth())).toBe('/')
    expect(guardRedirect('/document-packages/1/partia/new', {}, auth())).toBe('/')
    expect(guardRedirect('/document-packages/1/partia/p1', {}, auth({ role: 'expeditor' }))).toBeNull()
    expect(guardRedirect('/document-packages', {}, auth({ role: 'expeditor' }))).toBeNull()
  })
  it('рабочее место и редактор партии — то же правило: администратор, экспедитор или packages.manage', () => {
    for (const p of ['/document-packages/1/workspace', '/document-packages/1/partia/p1', '/document-packages/1/partia/new']) {
      expect(guardRedirect(p, {}, auth()), p).toBe('/')
      expect(guardRedirect(p, {}, auth({ perms: ['reestr.write'] })), p).toBe('/')
      expect(guardRedirect(p, {}, auth({ role: 'client' })), p).toBe('/')
      expect(guardRedirect(p, {}, auth({ perms: ['packages.manage'] })), p).toBeNull()
      expect(guardRedirect(p, {}, auth({ role: 'expeditor' })), p).toBeNull()
      expect(guardRedirect(p, {}, auth({ role: 'administrator' })), p).toBeNull()
      expect(guardRedirect(p, {}, auth({ isFinanceOnly: true, perms: ['finance.read', 'packages.manage'] })), p).toBe('/finance')
    }
  })
  it('/billing: клиент с импортом, сотрудник с finance.read', () => {
    expect(guardRedirect('/billing', {}, auth({ role: 'client' }))).toBeNull()
    expect(guardRedirect('/billing', {}, auth({ role: 'client', clientHasModule: () => false }))).toBe('/')
    expect(guardRedirect('/billing', {}, auth())).toBe('/')
    expect(guardRedirect('/billing', {}, auth({ perms: ['finance.read'] }))).toBeNull()
  })
  it('мастер клиента /import-40/new — только клиенту Импорта 40', () => {
    const meta = { requiresImport40: true, requiresRole: 'client' }
    const client = auth({ role: 'client', canUseImport40: true })
    expect(guardRedirect('/import-40/new', meta, client)).toBeNull()
    expect(guardRedirect('/import-40/new/abc', meta, client)).toBeNull()
    expect(guardRedirect('/import-40/new', meta, auth({ role: 'client', canUseImport40: false }))).toBe('/')
    expect(guardRedirect('/import-40/new', meta, auth({ perms: ['import40.read'] }))).toBe('/')
    expect(guardRedirect('/import-40/new', meta, auth({ role: 'administrator' }))).toBe('/')
  })
  it('/keden-status', () => {
    expect(guardRedirect('/keden-status', {}, auth({ role: 'expeditor' }))).toBeNull()
    expect(guardRedirect('/keden-status', {}, auth({ role: 'client' }))).toBe('/')
    expect(guardRedirect('/keden-status', {}, auth({ role: 'client', clientHasModule: (m) => m === 'transit' }))).toBeNull()
    expect(guardRedirect('/keden-status', {}, auth({ perms: ['import40.read'] }))).toBeNull()
  })
  it('meta: references / clientTransit / role / import40 / sales / permission', () => {
    expect(guardRedirect('/tnved/tree', { requiresReferences: true }, auth({ role: 'client' }))).toBeNull()
    expect(guardRedirect('/tnved/tree', { requiresReferences: true }, auth())).toBe('/')
    expect(guardRedirect('/my-documents', { requiresClientTransit: true }, auth({ role: 'client' }))).toBe('/')
    expect(guardRedirect('/keden', { requiresRole: 'administrator' }, auth())).toBe('/')
    expect(guardRedirect('/import-40', { requiresImport40: true }, auth())).toBe('/')
    expect(guardRedirect('/sales', { requiresSales: true }, auth({ perms: ['sales.read'] }))).toBeNull()
    expect(guardRedirect('/finance', { requiresPermission: 'finance.read' }, auth())).toBe('/')
    expect(guardRedirect('/x', { requiresAnyRole: ['expeditor'] }, auth({ role: 'expeditor' }))).toBeNull()
  })
  it('/home открыта всем вошедшим', () => {
    expect(guardRedirect('/home', {}, auth({ role: 'sales' }))).toBeNull()
  })
  it('requiresAnyPermission: хватает любого из прав; администратору можно', () => {
    const meta = { requiresAnyPermission: ['finance.read', 'finance.write', 'users.write'] }
    expect(guardRedirect('/settings/organization', meta, auth())).toBe('/')
    for (const perm of ['finance.read', 'finance.write', 'users.write'])
      expect(guardRedirect('/settings/organization', meta, auth({ perms: [perm] })), perm).toBeNull()
    expect(guardRedirect('/settings/organization', meta, auth({ perms: ['users.read'] }))).toBe('/')
    expect(guardRedirect('/settings/organization', meta, auth({ role: 'administrator' }))).toBeNull()
  })
  it('новые адреса «Настроек»: журнал — администратору, система — endpoints.read', () => {
    expect(guardRedirect('/settings/audit', { requiresRole: 'administrator' }, auth())).toBe('/')
    expect(guardRedirect('/settings/audit', { requiresRole: 'administrator' }, auth({ role: 'administrator' }))).toBeNull()
    expect(guardRedirect('/settings/system', { requiresPermission: 'endpoints.read' }, auth())).toBe('/')
    expect(guardRedirect('/settings/system', { requiresPermission: 'endpoints.read' }, auth({ perms: ['endpoints.read'] }))).toBeNull()
  })
})

describe('guardRedirect: обязательная смена временного пароля', () => {
  const must = auth({ mustChangePassword: true, role: 'administrator' })
  it('любой адрес, кроме /profile и /login, ведёт на /profile?tab=password', () => {
    for (const p of ['/', '/home', '/users', '/settings/team', '/import-40/abc', '/notifications', '/forgot-password'])
      expect(guardRedirect(p, p === '/forgot-password' ? { requiresAuth: false } : {}, must), p).toBe('/profile?tab=password')
  })
  it('/profile и /login пропускаются, цикла нет', () => {
    expect(guardRedirect('/profile', {}, must)).toBeNull()
    expect(guardRedirect('/login', { requiresAuth: false }, must)).toBeNull()
  })
  it('без флага всё как прежде; без входа — на /login', () => {
    expect(guardRedirect('/home', {}, auth())).toBeNull()
    expect(guardRedirect('/home', {}, auth({ isAuthenticated: false, mustChangePassword: true }))).toBe('/login')
  })
  it('перекрывает стену финансиста', () => {
    expect(guardRedirect('/reestr', {}, auth({ isFinanceOnly: true, mustChangePassword: true }))).toBe('/profile?tab=password')
  })
})
