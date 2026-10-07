import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// Аудит §4.5: стартовая страница — по бизнес-роли, а не всегда «Дашборд Импорта», которого
// нет в меню бухгалтера/продажника. Порядок соответствует решению владельца (Волна 5).
const homeRouteForRole = (): string => {
  const authStore = useAuthStore()
  const role = (authStore.role || '').trim().toLowerCase()
  if (role === 'administrator' || role === 'client') return '/dashboard'
  if (authStore.hasBusinessRole('accountant')) return '/finance'
  if (authStore.hasBusinessRole('sales')) return '/sales'
  if (authStore.hasBusinessRole('kpp') || authStore.hasBusinessRole('declarant') || authStore.hasBusinessRole('rop')) return '/import-40'
  if (authStore.hasBusinessRole('mpp')) return '/reestr'
  return '/dashboard'
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // Каталог компонентов редизайна — только в dev-сборке (спека 2026-10-07 §6).
    ...(import.meta.env.DEV
      ? [{ path: '/_ui', name: 'ui-catalog', component: () => import('@/views/dev/UiCatalogView.vue'), meta: { requiresAuth: false } }]
      : []),
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      component: () => import('@/views/ForgotPasswordView.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/reset-password/:token',
      name: 'reset-password',
      component: () => import('@/views/ResetPasswordView.vue'),
      meta: { requiresAuth: false },
    },
    {
      // Путь клиента: принятие приглашения от сотрудника (задать пароль).
      path: '/invite/:token',
      name: 'invite-accept',
      component: () => import('@/views/InviteAcceptView.vue'),
      meta: { requiresAuth: false },
    },
    {
      path: '/',
      component: () => import('@/layouts/MainLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: homeRouteForRole,
        },
        {
          path: '/dashboard',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
        },
        {
          path: '/analytics',
          name: 'analytics',
          component: () => import('@/views/AnalyticsView.vue'),
          meta: { requiresPermission: 'analytics.read' },
        },
        {
          path: '/reestr',
          name: 'reestr',
          component: () => import('@/views/ReestrView.vue'),
        },
        {
          path: '/requests-registry',
          name: 'requests-registry',
          component: () => import('@/views/RequestsRegistryView.vue'),
          meta: { requiresRole: 'administrator' },
        },
        {
          path: '/document-packages',
          name: 'document-packages',
          component: () => import('@/views/DocumentPackagesView.vue'),
        },
        {
          path: '/document-packages/:id/workspace',
          name: 'document-packages-workspace',
          component: () => import('@/views/DocumentPackageWorkspaceView.vue'),
        },
        {
          path: '/import-40',
          name: 'import-40',
          component: () => import('@/views/Import40ListView.vue'),
          meta: { requiresImport40: true },
        },
        {
          path: '/import-40/company',
          name: 'import-40-company',
          component: () => import('@/views/Import40CompanyView.vue'),
          meta: { requiresImport40: true },
        },
        {
          path: '/import-40/:id',
          name: 'import-40-detail',
          component: () => import('@/views/Import40CaseView.vue'),
          meta: { requiresImport40: true },
        },
        {
          path: '/import-40/:caseId/dt/:dtId',
          name: 'import-40-dt',
          component: () => import('@/views/Import40DtView.vue'),
          meta: { requiresImport40: true },
        },
        {
          // Справочник ДТ — только декларанту (тот же критерий, что в меню, аудит §8).
          path: '/dt-guide',
          name: 'dt-guide',
          component: () => import('@/views/DtGuideView.vue'),
          meta: { requiresPermission: 'import40.declarant' },
        },
        {
          path: '/keden',
          name: 'keden',
          component: () => import('@/views/KedenListView.vue'),
          meta: { requiresRole: 'administrator' },
        },
        {
          path: '/keden/:id',
          name: 'keden-detail',
          component: () => import('@/views/KedenView.vue'),
          meta: { requiresRole: 'administrator' },
        },
        {
          // Аудит §4.10: гейт был по списку системных ролей (requiresAnyRole), а меню
          // показывает пункт по праву (reestr.read/import40.read) — продажник видел пункт,
          // но переход тихо уводил на дашборд. Проверка — в общем guard'е, как /reestr и /billing.
          path: '/keden-status',
          name: 'keden-status',
          component: () => import('@/views/KedenStatusView.vue'),
        },
        {
          path: '/sales',
          name: 'sales',
          component: () => import('@/views/SalesView.vue'),
          meta: { requiresSales: true },
        },
        {
          path: '/notifications',
          name: 'notifications',
          component: () => import('@/views/NotificationsView.vue'),
        },
        {
          // Только клиенту транзита — тот же критерий, что и в меню (MainLayout: clientTransit).
          path: '/my-documents',
          name: 'my-documents',
          component: () => import('@/views/MyDocumentsView.vue'),
          meta: { requiresClientTransit: true },
        },
        {
          // Волна 2 ролей: финансы (бухгалтер) и панель руководителя.
          path: '/finance',
          name: 'finance',
          component: () => import('@/views/FinanceView.vue'),
          meta: { requiresPermission: 'finance.read' },
        },
        {
          path: '/import-40/manage',
          name: 'import40-manage',
          component: () => import('@/views/Import40ManageView.vue'),
          meta: { requiresPermission: 'import40.assign' },
        },
        {
          path: '/clients',
          name: 'clients',
          component: () => import('@/views/ClientsView.vue'),
          meta: { requiresPermission: 'clients.read' },
        },
        {
          path: '/clients/:id',
          name: 'client-card',
          component: () => import('@/views/ClientCardView.vue'),
          meta: { requiresPermission: 'clients.read' },
        },
        {
          path: '/client-documents',
          name: 'client-documents',
          component: () => import('@/views/ClientDocumentsView.vue'),
          meta: { requiresPermission: 'clients.read' },
        },
        {
          // Раздел «Счета»: сотрудникам по finance.read, клиенту Импорта 40 — свои счета,
          // только чтение (аудит 5.2/4). Проверка роли клиента — отдельным условием ниже,
          // permission тут не задан специально, иначе клиента без finance.read выкинет.
          path: '/billing',
          name: 'billing',
          component: () => import('@/views/BillingView.vue'),
        },
        {
          path: '/system/audit',
          name: 'audit-log',
          component: () => import('@/views/AuditLogView.vue'),
          meta: { requiresRole: 'administrator' },
        },
        {
          path: '/settings/organization',
          name: 'organization-settings',
          component: () => import('@/views/OrganizationSettingsView.vue'),
          meta: { requiresPermission: 'users.write' },
        },
        {
          // Гейт группы ТН ВЭД — тот же критерий, что и в меню (references.read, плюс
          // admin/client всегда): аудит §8, у маршрутов не было meta вовсе.
          path: '/tnved/tree',
          name: 'tnved-tree',
          component: () => import('@/views/TnvedTreeView.vue'),
          meta: { requiresReferences: true },
        },
        {
          path: '/tnved/regulations',
          name: 'tnved-regulations',
          component: () => import('@/views/TnvedRegulationsView.vue'),
          meta: { requiresReferences: true },
        },
        {
          path: '/tnved/currencies',
          name: 'tnved-currencies',
          component: () => import('@/views/TnvedCurrenciesView.vue'),
          meta: { requiresReferences: true },
        },
        {
          path: '/tnved/timeline',
          name: 'tnved-timeline',
          component: () => import('@/views/TnvedTimelineView.vue'),
          meta: { requiresReferences: true },
        },
        {
          path: '/tnved/analytics',
          name: 'tnved-analytics',
          component: () => import('@/views/TnvedAnalyticsView.vue'),
          meta: { requiresReferences: true },
        },
        {
          path: '/tnved/sync',
          name: 'tnved-sync',
          component: () => import('@/views/TnvedSyncView.vue'),
          meta: { requiresPermission: 'tnved.manage' },
        },
        {
          path: '/roles',
          name: 'roles',
          component: () => import('@/views/RolesView.vue'),
          meta: { requiresPermission: 'users.read' },
        },
        {
          path: '/users',
          name: 'users',
          component: () => import('@/views/UsersView.vue'),
          meta: { requiresPermission: 'users.write' },
        },
        {
          path: '/profile',
          name: 'profile',
          component: () => import('@/views/ProfileView.vue'),
        },
        {
          path: '/system/endpoints',
          name: 'system-endpoints',
          component: () => import('@/views/SystemEndpointsView.vue'),
          meta: { requiresPermission: 'endpoints.read' },
        },
        {
          path: '/references',
          name: 'references',
          component: () => import('@/views/ReferencesView.vue'),
          meta: { requiresRole: 'administrator' },
        },
      ],
    },
  ],
})

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  authStore.checkAuth()

  // Финансист видит только платежи и документы: операционные разделы закрыты
  // даже по прямой ссылке (решение владельца 2026-09-23).
  const financeBlocked = ['/import-40', '/reestr', '/document-packages', '/keden', '/tnved', '/dt-guide', '/requests-registry']
  if (authStore.isFinanceOnly && financeBlocked.some((prefix) => to.path.startsWith(prefix))) {
    return next('/finance')
  }
  const requiresAuth = to.meta.requiresAuth !== false
  const requiredPermission = to.meta.requiresPermission as string | undefined
  const requiredRole = to.meta.requiresRole as string | undefined
  const requiredAnyRole = to.meta.requiresAnyRole as string[] | undefined
  const requiresImport40 = to.meta.requiresImport40 === true
  const requiresSales = to.meta.requiresSales === true
  const requiresReferences = to.meta.requiresReferences === true
  const requiresClientTransit = to.meta.requiresClientTransit === true

  const normalizedRole = (authStore.role || '').trim().toLowerCase()

  if (requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else if (
    // Реестр (транзит) — по праву reestr.read; клиенту оставляем как было.
    to.path === '/reestr' && normalizedRole !== 'administrator' && normalizedRole !== 'client'
    && !authStore.hasPermission('reestr.read')
  ) {
    next(authStore.canUseImport40 ? '/import-40' : authStore.canUseSales ? '/sales' : '/')
  } else if (
    to.path.startsWith('/document-packages') &&
    !(normalizedRole === 'administrator' || normalizedRole === 'expeditor' || authStore.hasPermission('packages.manage'))
  ) {
    next('/')
  } else if (
    // Счета — сотрудникам по finance.read, клиенту Импорта 40 (свои, только чтение).
    to.path === '/billing' && normalizedRole !== 'administrator'
    && !(normalizedRole === 'client' ? authStore.clientHasModule('import40') : authStore.hasPermission('finance.read'))
  ) {
    next('/')
  } else if (
    // Статусы КЕДЕН — то же условие, что и пункт меню (MainLayout): экспедитор/клиент транзита/
    // reestr.read/import40.read. Раньше гейтился списком системных ролей — не совпадал с меню.
    to.path === '/keden-status' && normalizedRole !== 'administrator' && normalizedRole !== 'expeditor'
    && !(normalizedRole === 'client'
      ? authStore.clientHasModule('transit')
      : authStore.hasPermission('reestr.read') || authStore.hasPermission('import40.read'))
  ) {
    next('/')
  } else if (
    // ТН ВЭД — то же условие, что и группа в меню: references.read, admin и client всегда.
    requiresReferences && !(normalizedRole === 'administrator' || normalizedRole === 'client' || authStore.hasPermission('references.read'))
  ) {
    next('/')
  } else if (
    // «Мои документы» — только клиент транзита (то же условие, что и пункт меню).
    requiresClientTransit && !(normalizedRole === 'client' && authStore.clientHasModule('transit'))
  ) {
    next('/')
  } else if (requiredRole && normalizedRole !== requiredRole) {
    next('/')
  } else if (requiredAnyRole && !requiredAnyRole.includes(normalizedRole)) {
    next('/')
  } else if (requiresImport40 && !authStore.canUseImport40) {
    next('/')
  } else if (requiresSales && !authStore.canUseSales) {
    next('/')
  } else if (requiredPermission && !authStore.hasPermission(requiredPermission)) {
    next('/')
  } else if (to.path === '/login' && authStore.isAuthenticated) {
    next('/')
  } else {
    next()
  }
})

export default router
