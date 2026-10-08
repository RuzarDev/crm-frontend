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
