import { describe, expect, it } from 'vitest'
import router from '@/router'

// Таблица маршрутов клиента (редизайн, волна 2a): мастер объявлен до /import-40/:id, имена прежних маршрутов сохранены.
describe('маршруты Импорта 40', () => {
  it.each([
    ['/import-40', 'import-40'],
    ['/import-40/new', 'client-wizard'],
    ['/import-40/new/abc', 'client-wizard-draft'],
    ['/import-40/abc', 'import-40-detail'],
    ['/import-40/company', 'import-40-company'],
    ['/import-40/manage', 'import40-manage'],
  ])('%s → %s', (path, name) => {
    expect(router.resolve(path).name).toBe(name)
  })

  it('единый список «Документы» клиента: /documents → client-documents-all, только клиенту Импорта 40', () => {
    const r = router.resolve('/documents')
    expect(r.name).toBe('client-documents-all')
    expect(r.meta.requiresRole).toBe('client')
    expect(r.meta.requiresImport40).toBe(true)
    expect(router.resolve('/my-documents').name).toBe('my-documents')
  })

  it.each([
    ['/billing', 'billing'],
    ['/tnved/tree', 'tnved-tree'],
    ['/tnved/currencies', 'tnved-currencies'],
  ])('%s сохраняет имя %s после перехода на обёртку', (path, name) => {
    expect(router.resolve(path).name).toBe(name)
  })

  it('мастер — только клиенту Импорта 40', () => {
    for (const path of ['/import-40/new', '/import-40/new/abc']) {
      const { meta } = router.resolve(path)
      expect(meta.requiresRole, path).toBe('client')
      expect(meta.requiresImport40, path).toBe(true)
    }
  })
})

describe('маршруты записи транзита', () => {
  it('/reestr/new и /reestr/:id — страница записи reestr-record; список — reestr', () => {
    expect(router.resolve('/reestr').name).toBe('reestr')
    const page = router.resolve('/reestr/abc')
    expect(page.name).toBe('reestr-record')
    expect(page.params.id).toBe('abc')
    expect(router.resolve('/reestr/new').name).toBe('reestr-record')
    expect(router.resolve('/reestr/new').params.id).toBe('new')
  })
})

describe('раздел «Настройки»: адреса и перенаправления', () => {
  it.each([
    ['/settings/team', 'settings-team'],
    ['/settings/roles', 'settings-roles'],
    ['/settings/organization', 'organization-settings'],
    ['/settings/audit', 'settings-audit'],
    ['/settings/system', 'settings-system'],
  ])('%s → %s', (path, name) => {
    expect(router.resolve(path).name).toBe(name)
  })

  it.each([
    ['/users', '/settings/team'],
    ['/roles', '/settings/roles'],
    ['/system/audit', '/settings/audit'],
    ['/system/endpoints', '/settings/system'],
  ])('старый адрес %s ведёт на %s', (from, to) => {
    // resolve() редирект не раскрывает — смотрим запись маршрута
    expect(router.getRoutes().find((r) => r.path === from)?.redirect).toBe(to)
  })

  it('права на новых маршрутах', () => {
    expect(router.resolve('/settings/team').meta.requiresPermission).toBe('users.read')
    expect(router.resolve('/settings/roles').meta.requiresPermission).toBe('users.read')
    expect(router.resolve('/settings/audit').meta.requiresRole).toBe('administrator')
    expect(router.resolve('/settings/system').meta.requiresPermission).toBe('endpoints.read')
    expect(router.resolve('/settings/organization').meta.requiresAnyPermission).toEqual(['finance.read', 'finance.write', 'users.write'])
  })
})
