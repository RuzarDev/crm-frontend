import type { useAuthStore } from '@/stores/auth'

// Модель меню новых оболочек (спека редизайна §5). Видимость — перенос из прежней оболочки на AntD один к одному;
// разделы, которые спека объединяет, — одна строка меню и вкладки-ссылки в шапке (pages).
export type NavIcon =
  | 'home' | 'requests' | 'transit' | 'packages' | 'keden' | 'clients' | 'sales' | 'finance' | 'analytics'
  | 'references' | 'settings' | 'shipments' | 'plus' | 'documents' | 'invoices' | 'search' | 'rates' | 'npa' | 'company'

export interface NavPage { key: string; to: string; labelKey: string; match?: string[] }
export interface NavSection {
  key: string
  labelKey: string
  icon: NavIcon
  pages: NavPage[]
  /** Действие (ведёт на ?new=1), а не раздел: никогда не подсвечивается. */
  action?: boolean
  badge?: 'attention'
  dot?: boolean
}
export interface NavGroup { key: string; labelKey: string | null; sections: NavSection[] }
export interface NavModel { groups: NavGroup[]; bottom: NavSection[] }

export interface NavAccess {
  role: string
  hasPermission: (p: string) => boolean
  clientHasModule: (m: 'import40' | 'transit') => boolean
  canUseImport40: boolean
  canUseSales: boolean
  isFinanceOnly: boolean
  registrationIncomplete: boolean
}

type PageDef = NavPage & { when: boolean }
const page = (key: string, to: string, labelKey: string, when: boolean, match?: string[]): PageDef =>
  ({ key, to, labelKey, when, match })

const section = (s: Omit<NavSection, 'pages'> & { pages: PageDef[] }): NavSection | null => {
  const pages = s.pages.filter((p) => p.when).map(({ when: _w, ...p }) => p)
  return pages.length ? { ...s, pages } : null
}
const group = (key: string, labelKey: string | null, sections: (NavSection | null)[]): NavGroup | null => {
  const list = sections.filter((s): s is NavSection => !!s)
  return list.length ? { key, labelKey, sections: list } : null
}
const model = (groups: (NavGroup | null)[], bottom: (NavSection | null)[]): NavModel => ({
  groups: groups.filter((g): g is NavGroup => !!g),
  bottom: bottom.filter((s): s is NavSection => !!s),
})

export function buildBrokerNav(a: NavAccess): NavModel {
  const role = (a.role || '').trim().toLowerCase()
  const admin = role === 'administrator'
  const fo = a.isFinanceOnly
  const p = a.hasPermission
  // Старый пункт «ТН ВЭД» (группа references): та же проверка, что и requiresReferences в роутере.
  const tnved = !fo && (admin || p('references.read'))

  return model(
    [
      group('main', null, [
        // Дашборд + Уведомления (колокольчик) → Главная.
        section({ key: 'home', labelKey: 'shell.nav.home', icon: 'home', badge: 'attention', pages: [
          page('home', '/home', 'shell.nav.home', true, ['/home', '/notifications', '/dashboard']),
        ] }),
      ]),
      group('operations', 'shell.group.operations', [
        section({ key: 'requests', labelKey: 'shell.nav.requests', icon: 'requests', pages: [
          page('requests', '/import-40', 'shell.page.requests', a.canUseImport40 && !fo),
          page('manage', '/import-40/manage', 'shell.page.manage', p('import40.assign')),
          page('registry', '/requests-registry', 'shell.page.registry', admin),
        ] }),
        section({ key: 'transit', labelKey: 'shell.nav.transit', icon: 'transit', pages: [
          page('transit', '/reestr', 'shell.nav.transit', !fo && (admin || (role !== 'client' && p('reestr.read')))),
        ] }),
        section({ key: 'packages', labelKey: 'shell.nav.packages', icon: 'packages', pages: [
          page('packages', '/document-packages', 'shell.nav.packages', !fo && (admin || role === 'expeditor' || p('packages.manage'))),
        ] }),
        section({ key: 'keden', labelKey: 'shell.nav.keden', icon: 'keden', pages: [
          page('kedenDeclarations', '/keden', 'shell.page.kedenDeclarations', admin),
          page('kedenStatuses', '/keden-status', 'shell.page.kedenStatuses',
            !fo && !admin && (role === 'expeditor' || (role !== 'client' && (p('reestr.read') || p('import40.read'))))),
        ] }),
      ]),
      group('business', 'shell.group.business', [
        section({ key: 'clients', labelKey: 'shell.nav.clients', icon: 'clients', pages: [
          page('clientsList', '/clients', 'shell.page.clientsList', role !== 'client' && (admin || p('clients.read'))),
          page('clientDocuments', '/client-documents', 'shell.page.clientDocuments', p('clients.read') && role !== 'client'),
        ] }),
        section({ key: 'sales', labelKey: 'shell.nav.sales', icon: 'sales', pages: [
          page('sales', '/sales', 'shell.nav.sales', a.canUseSales),
        ] }),
        section({ key: 'finance', labelKey: 'shell.nav.finance', icon: 'finance', pages: [
          page('financeOverview', '/finance', 'shell.page.financeOverview', p('finance.read')),
          page('billing', '/billing', 'shell.page.billing', p('finance.read') && role !== 'client'),
        ] }),
        section({ key: 'analytics', labelKey: 'shell.nav.analytics', icon: 'analytics', pages: [
          page('analytics', '/analytics', 'shell.nav.analytics', p('analytics.read')),
        ] }),
      ]),
      group('knowledge', 'shell.group.knowledge', [
        section({ key: 'references', labelKey: 'shell.nav.references', icon: 'references', pages: [
          page('tnvedTree', '/tnved/tree', 'shell.page.tnvedTree', tnved),
          page('npa', '/tnved/regulations', 'shell.page.npa', tnved),
          page('currencies', '/tnved/currencies', 'shell.page.currencies', tnved),
          page('timeline', '/tnved/timeline', 'shell.page.timeline', tnved),
          page('tnvedAnalytics', '/tnved/analytics', 'shell.page.tnvedAnalytics', tnved),
          page('dtGuide', '/dt-guide', 'shell.page.dtGuide', !fo && (admin || p('import40.declarant'))),
          page('referenceBook', '/references', 'shell.page.referenceBook', admin),
        ] }),
      ]),
    ],
    [
      section({ key: 'settings', labelKey: 'shell.nav.settings', icon: 'settings', pages: [
        page('users', '/users', 'shell.page.users', p('users.write')),
        page('roles', '/roles', 'shell.page.roles', p('users.read')),
        page('organization', '/settings/organization', 'shell.page.organization', p('users.write')),
        page('audit', '/system/audit', 'shell.page.audit', admin),
        page('apiCatalog', '/system/endpoints', 'shell.page.apiCatalog', p('endpoints.read')),
        page('tnvedSync', '/tnved/sync', 'shell.page.tnvedSync', tnved && p('tnved.manage')),
      ] }),
    ],
  )
}

export function buildClientNav(a: NavAccess): NavModel {
  const imp = a.clientHasModule('import40')
  const tr = a.clientHasModule('transit')
  return model(
    [
      group('main', null, [
        section({ key: 'shipments', labelKey: 'shell.client.shipments', icon: 'shipments', badge: 'attention', pages: [
          page('shipments', '/home', 'shell.client.shipments', imp, ['/home', '/notifications', '/dashboard', '/import-40']),
        ] }),
        section({ key: 'newShipment', labelKey: 'shell.client.newShipment', icon: 'plus', action: true, pages: [
          page('newShipment', '/import-40?new=1', 'shell.client.newShipment', imp, []),
        ] }),
        section({ key: 'transit', labelKey: 'shell.client.transit', icon: 'transit', pages: [
          page('transit', '/reestr', 'shell.client.transit', tr, ['/reestr', ...(imp ? [] : ['/home', '/notifications', '/dashboard'])]),
        ] }),
        section({ key: 'kedenStatuses', labelKey: 'shell.client.kedenStatuses', icon: 'keden', pages: [
          page('kedenStatuses', '/keden-status', 'shell.client.kedenStatuses', tr),
        ] }),
        section({ key: 'documents', labelKey: 'shell.client.documents', icon: 'documents', pages: [
          page('documents', '/my-documents', 'shell.client.documents', tr),
        ] }),
        section({ key: 'invoices', labelKey: 'shell.client.invoices', icon: 'invoices', pages: [
          page('invoices', '/billing', 'shell.client.invoices', imp),
        ] }),
      ]),
      group('tools', 'shell.group.tools', [
        section({ key: 'tnvedPick', labelKey: 'shell.client.tnvedPick', icon: 'search', pages: [
          page('tnvedPick', '/tnved/tree', 'shell.client.tnvedPick', true),
        ] }),
        section({ key: 'rates', labelKey: 'shell.client.rates', icon: 'rates', pages: [
          page('rates', '/tnved/currencies', 'shell.client.rates', true),
        ] }),
        section({ key: 'npa', labelKey: 'shell.client.npa', icon: 'npa', pages: [
          page('npa', '/tnved/regulations', 'shell.client.npa', true),
        ] }),
      ]),
    ],
    [
      section({ key: 'company', labelKey: 'shell.client.company', icon: 'company', dot: a.registrationIncomplete, pages: [
        page('company', '/import-40/company', 'shell.client.company', imp),
      ] }),
    ],
  )
}

export const allSections = (m: NavModel): NavSection[] => [...m.groups.flatMap((g) => g.sections), ...m.bottom]
export const sectionHref = (s: NavSection): string => s.pages[0].to

const pathOf = (to: string) => to.split('?')[0]
const matches = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`)

// Самый длинный подходящий префикс среди всех вкладок — /import-40/manage сильнее /import-40,
// /keden-status не совпадает с /keden (граница по «/»).
export function resolveActive(m: NavModel, path: string): { section: NavSection; page: NavPage } | null {
  let best: { section: NavSection; page: NavPage; len: number } | null = null
  for (const s of allSections(m)) {
    if (s.action) continue
    for (const pg of s.pages) {
      for (const pre of pg.match ?? [pathOf(pg.to)]) {
        if (matches(path, pre) && (!best || pre.length > best.len)) best = { section: s, page: pg, len: pre.length }
      }
    }
  }
  return best ? { section: best.section, page: best.page } : null
}

export const navAccessFromStore = (auth: ReturnType<typeof useAuthStore>, registrationIncomplete: boolean): NavAccess => ({
  role: auth.role || '',
  hasPermission: (p) => auth.hasPermission(p),
  clientHasModule: (m) => auth.clientHasModule(m),
  canUseImport40: auth.canUseImport40,
  canUseSales: auth.canUseSales,
  isFinanceOnly: auth.isFinanceOnly,
  registrationIncomplete,
})
