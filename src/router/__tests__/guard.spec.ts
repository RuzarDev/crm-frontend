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
    for (const p of ['/import-40', '/import-40/manage', '/reestr', '/document-packages', '/keden', '/keden-status', '/tnved/tree', '/dt-guide', '/requests-registry'])
      expect(guardRedirect(p, {}, a), p).toBe('/finance')
    expect(guardRedirect('/home', {}, a)).toBeNull()
  })
  it('/reestr без reestr.read — на импорт, продажи или /', () => {
    expect(guardRedirect('/reestr', {}, auth({ perms: ['import40.read'] }))).toBe('/import-40')
    expect(guardRedirect('/reestr', {}, auth({ perms: ['sales.read'] }))).toBe('/sales')
    expect(guardRedirect('/reestr', {}, auth())).toBe('/')
    expect(guardRedirect('/reestr', {}, auth({ role: 'client' }))).toBeNull()
  })
  it('пакеты: админ/экспедитор/packages.manage', () => {
    expect(guardRedirect('/document-packages/1/workspace', {}, auth())).toBe('/')
    expect(guardRedirect('/document-packages', {}, auth({ role: 'expeditor' }))).toBeNull()
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
})
