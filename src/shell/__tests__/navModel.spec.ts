import { describe, it, expect } from 'vitest'
import { buildBrokerNav, buildClientNav, resolveActive, sectionHref, allSections, type NavAccess } from '@/shell/navModel'
import ru from '@/i18n/locales/ru'
import kk from '@/i18n/locales/kk'
import en from '@/i18n/locales/en'

const access = (o: Partial<NavAccess> & { perms?: string[] } = {}): NavAccess => {
  const perms = o.perms ?? []
  const role = o.role ?? 'broker'
  return {
    role,
    hasPermission: (p) => role === 'administrator' || perms.includes(p),
    clientHasModule: o.clientHasModule ?? ((m) => m === 'import40'),
    canUseImport40: o.canUseImport40 ?? (role === 'administrator' || perms.includes('import40.read')),
    canUseSales: o.canUseSales ?? (role === 'administrator' || perms.includes('sales.read')),
    isFinanceOnly: o.isFinanceOnly ?? false,
    registrationIncomplete: o.registrationIncomplete ?? false,
  }
}
const keys = (m: ReturnType<typeof buildBrokerNav>) =>
  allSections(m).map((s) => `${s.key}:${s.pages.map((p) => p.key).join(',')}`)

describe('buildBrokerNav', () => {
  it('администратор видит всё, КЕДЕН без «Статусов», Финансы с вкладкой счетов', () => {
    expect(keys(buildBrokerNav(access({ role: 'administrator' })))).toEqual([
      'home:home',
      'requests:requests,manage,registry',
      'transit:transit',
      'packages:packages',
      'keden:kedenDeclarations',
      'clients:clientsList,clientDocuments',
      'sales:sales',
      'finance:financeOverview,billing',
      'analytics:analytics',
      'references:tnvedTree,currencies,npa,timeline,dtGuide,systemData',
      'settings:team,roles,organization,audit,system',
    ])
  })

  it('декларант: заявки, КЕДЕН-статусы, справочники ТН ВЭД и порядок ДТ', () => {
    const m = buildBrokerNav(access({ perms: ['import40.read', 'import40.declarant', 'references.read'] }))
    expect(keys(m)).toEqual([
      'home:home',
      'requests:requests',
      'keden:kedenStatuses',
      'references:tnvedTree,currencies,npa,timeline,dtGuide',
    ])
  })

  it('бухгалтер (только финансы): без заявок/транзита/справочников', () => {
    const m = buildBrokerNav(access({ perms: ['finance.read', 'import40.read', 'reestr.read'], isFinanceOnly: true }))
    // finance.read открывает просмотр «Организации» в «Настройках» (как на сервере).
    expect(keys(m)).toEqual(['home:home', 'finance:financeOverview,billing', 'settings:organization'])
  })

  it('руководитель: вкладка «Распределение» в заявках', () => {
    const m = buildBrokerNav(access({ perms: ['import40.read', 'import40.assign'] }))
    expect(keys(m)).toContain('requests:requests,manage')
  })

  it('экспедитор: пакеты и статусы КЕДЕН', () => {
    const m = buildBrokerNav(access({ role: 'expeditor' }))
    expect(keys(m)).toEqual(['home:home', 'packages:packages', 'keden:kedenStatuses'])
  })

  it('«Данные системы»: администратору — /references; с tnved.manage и доступом к справочникам — /tnved/sync', () => {
    const m = buildBrokerNav(access({ perms: ['tnved.manage'] }))
    expect(keys(m).some((k) => k.includes('systemData'))).toBe(false)
    const m2 = buildBrokerNav(access({ perms: ['tnved.manage', 'references.read'] }))
    expect(keys(m2)).toContain('references:tnvedTree,currencies,npa,timeline,systemData')
    expect(allSections(m2).find((s) => s.key === 'references')!.pages.at(-1)!.to).toBe('/tnved/sync')
    expect(keys(m2).some((k) => k.startsWith('settings:'))).toBe(false)
    const admin = buildBrokerNav(access({ role: 'administrator' }))
    expect(allSections(admin).find((s) => s.key === 'references')!.pages.at(-1)!.to).toBe('/references')
    const reader = buildBrokerNav(access({ perms: ['references.read'] }))
    expect(keys(reader)).toContain('references:tnvedTree,currencies,npa,timeline')
  })

  it('пустые группы не выводятся', () => {
    const m = buildBrokerNav(access({ role: 'expeditor' }))
    expect(m.groups.map((g) => g.key)).toEqual(['main', 'operations'])
    expect(m.bottom).toEqual([])
  })
})

describe('раздел «Настройки»: вкладки по правам', () => {
  const settings = (o: Partial<NavAccess> & { perms?: string[] }) =>
    allSections(buildBrokerNav(access(o))).find((s) => s.key === 'settings')?.pages.map((p) => `${p.key}=${p.to}`)

  it('адреса вкладок и порядок', () => {
    expect(settings({ role: 'administrator' })).toEqual([
      'team=/settings/team', 'roles=/settings/roles', 'organization=/settings/organization',
      'audit=/settings/audit', 'system=/settings/system',
    ])
  })
  it('команда и роли — users.read; организация — finance.read | finance.write | users.write; система — endpoints.read', () => {
    expect(settings({ perms: ['users.read'] })).toEqual(['team=/settings/team', 'roles=/settings/roles'])
    expect(settings({ perms: ['users.write'] })).toEqual(['organization=/settings/organization'])
    expect(settings({ perms: ['finance.read'] })).toEqual(['organization=/settings/organization'])
    expect(settings({ perms: ['finance.write'] })).toEqual(['organization=/settings/organization'])
    expect(settings({ perms: ['endpoints.read'] })).toEqual(['system=/settings/system'])
  })
  it('журнал — только администратор; без единой вкладки раздел скрыт', () => {
    expect(settings({ perms: ['users.read', 'users.write', 'endpoints.read', 'roles.manage'] })?.some((x) => x.startsWith('audit'))).toBe(false)
    expect(settings({ perms: ['reestr.read'] })).toBeUndefined()
    expect(buildBrokerNav(access({ perms: ['reestr.read'] })).bottom).toEqual([])
  })
  it('личный раздел есть всегда, в боковое меню и allSections не входит', () => {
    const m = buildBrokerNav(access({ perms: [] }))
    expect(m.personal.pages.map((p) => `${p.key}=${p.to}`)).toEqual(['profile=/profile', 'notifications=/notifications'])
    expect(allSections(m).some((s) => s.key === 'personal')).toBe(false)
    expect(m.bottom.some((s) => s.key === 'personal')).toBe(false)
  })
})

describe('buildClientNav', () => {
  it('клиент импорта: поставки, оформить, документы, счета, инструменты, компания', () => {
    expect(keys(buildClientNav(access({ role: 'client' })))).toEqual([
      'shipments:shipments',
      'newShipment:newShipment',
      'documents:documents',
      'invoices:invoices',
      'tnvedPick:tnvedPick',
      'rates:rates',
      'npa:npa',
      'company:company',
    ])
  })

  it('клиент транзита без импорта: транзит, статусы, документы, инструменты', () => {
    const m = buildClientNav(access({ role: 'client', clientHasModule: (x) => x === 'transit' }))
    expect(keys(m)).toEqual([
      'transit:transit',
      'kedenStatuses:kedenStatuses',
      'documents:documents',
      'tnvedPick:tnvedPick',
      'rates:rates',
      'npa:npa',
    ])
  })

  it('«Документы»: с модулем Импорт 40 — /documents (и подсвечивается на /my-documents), только транзит — /my-documents', () => {
    const imp = buildClientNav(access({ role: 'client' }))
    const impDocs = allSections(imp).find((x) => x.key === 'documents')!
    expect(sectionHref(impDocs)).toBe('/documents')
    expect(resolveActive(imp, '/documents')?.section.key).toBe('documents')
    expect(resolveActive(imp, '/my-documents')?.section.key).toBe('documents')

    const both = buildClientNav(access({ role: 'client', clientHasModule: () => true }))
    const bothDocs = allSections(both).find((x) => x.key === 'documents')!
    expect(bothDocs.pages.map((p) => p.to)).toEqual(['/documents'])

    const tr = buildClientNav(access({ role: 'client', clientHasModule: (x) => x === 'transit' }))
    const trDocs = allSections(tr).find((x) => x.key === 'documents')!
    expect(sectionHref(trDocs)).toBe('/my-documents')
    expect(resolveActive(tr, '/my-documents')?.section.key).toBe('documents')
  })

  it('точка на «Моей компании», пока регистрация не завершена', () => {
    const m = buildClientNav(access({ role: 'client', registrationIncomplete: true }))
    expect(m.bottom[0].dot).toBe(true)
  })

  it('«Оформить поставку» — действие на /import-40/new, не подсвечивается и не подсвечивает «Мои поставки»', () => {
    const m = buildClientNav(access({ role: 'client' }))
    const s = allSections(m).find((x) => x.key === 'newShipment')!
    expect(s.action).toBe(true)
    expect(sectionHref(s)).toBe('/import-40/new')
    expect(resolveActive(m, '/import-40')?.section.key).toBe('shipments')
    expect(resolveActive(m, '/import-40/abc')?.section.key).toBe('shipments')
    expect(resolveActive(m, '/import-40/new')).toBeNull()
    expect(resolveActive(m, '/import-40/new/abc')).toBeNull()
    // Граница по «/»: поставка с номером, начинающимся на «new», — это карточка.
    expect(resolveActive(m, '/import-40/newer')?.section.key).toBe('shipments')
  })
})

describe('resolveActive', () => {
  const admin = buildBrokerNav(access({ role: 'administrator' }))
  it.each([
    ['/home', 'home', 'home'],
    ['/import-40', 'requests', 'requests'],
    ['/import-40/abc', 'requests', 'requests'],
    ['/import-40/abc/dt/1', 'requests', 'requests'],
    ['/import-40/manage', 'requests', 'manage'],
    ['/import-40/company', 'requests', 'requests'],
    ['/keden/42', 'keden', 'kedenDeclarations'],
    ['/clients/7', 'clients', 'clientsList'],
    ['/client-documents', 'clients', 'clientDocuments'],
    ['/billing', 'finance', 'billing'],
    ['/tnved/sync', 'references', 'systemData'],
    ['/references', 'references', 'systemData'],
    ['/document-packages/1/workspace', 'packages', 'packages'],
    ['/document-packages/1/partia/p1', 'packages', 'packages'],
    ['/document-packages/1/partia/new', 'packages', 'packages'],
  ])('%s → %s/%s', (path, section, page) => {
    const r = resolveActive(admin, path)
    expect(r?.section.key).toBe(section)
    expect(r?.page.key).toBe(page)
  })
  it('рабочее место и редактор партии подсвечивают «Пакеты документов» и у сотрудника с packages.manage', () => {
    const m = buildBrokerNav(access({ perms: ['packages.manage'] }))
    for (const path of ['/document-packages', '/document-packages/7/workspace', '/document-packages/7/partia/p1', '/document-packages/7/partia/new']) {
      const r = resolveActive(m, path)
      expect(r?.section.key, path).toBe('packages')
      expect(r?.page.to, path).toBe('/document-packages')
    }
  })
  it('граница префикса: /keden-status не равен /keden', () => {
    const m = buildBrokerNav(access({ perms: ['import40.read'] }))
    expect(resolveActive(m, '/keden-status')?.page.key).toBe('kedenStatuses')
  })
  it('неизвестный путь — null', () => {
    expect(resolveActive(admin, '/nowhere')).toBeNull()
  })
  it('«Настройки»: новые адреса и вложенные страницы подсвечивают свою вкладку', () => {
    for (const [path, page] of [
      ['/settings/team', 'team'], ['/settings/team/42', 'team'], ['/settings/roles', 'roles'],
      ['/settings/organization', 'organization'], ['/settings/audit', 'audit'], ['/settings/system', 'system'],
    ] as const) {
      const r = resolveActive(admin, path)
      expect(r?.section.key, path).toBe('settings')
      expect(r?.page.key, path).toBe(page)
    }
  })
  it('личный раздел: /profile и /notifications — вкладки «Личное», «Главная» на /notifications не горит', () => {
    for (const m of [admin, buildClientNav(access({ role: 'client' }))]) {
      expect(resolveActive(m, '/profile')?.section.key).toBe('personal')
      expect(resolveActive(m, '/profile')?.page.key).toBe('profile')
      expect(resolveActive(m, '/notifications')?.section.key).toBe('personal')
      expect(resolveActive(m, '/notifications')?.page.key).toBe('notifications')
    }
    const trOnly = buildClientNav(access({ role: 'client', clientHasModule: (x) => x === 'transit' }))
    expect(resolveActive(trOnly, '/notifications')?.section.key).toBe('personal')
  })
  it('клиент: /import-40/company — «Моя компания», а не «Мои поставки»', () => {
    const m = buildClientNav(access({ role: 'client' }))
    expect(resolveActive(m, '/import-40/company')?.section.key).toBe('company')
    expect(resolveActive(m, '/import-40/xyz')?.section.key).toBe('shipments')
    expect(resolveActive(m, '/home')?.section.key).toBe('shipments')
  })
})

const get = (o: unknown, k: string) => k.split('.').reduce<unknown>((x, p) => (x as Record<string, unknown> | undefined)?.[p], o)
it('все подписи меню есть в трёх словарях', () => {
  const ks = [buildBrokerNav(access({ role: 'administrator' })), buildClientNav(access({ role: 'client', clientHasModule: () => true }))]
    .flatMap((m) => [...m.groups.map((g) => g.labelKey).filter(Boolean) as string[], ...[...allSections(m), m.personal].flatMap((s) => [s.labelKey, ...s.pages.map((p) => p.labelKey)])])
  for (const d of [ru, kk, en]) for (const k of ks) expect(typeof get(d, k), k).toBe('string')
})
