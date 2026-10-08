import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { guardRedirect } from '@/router/guard'

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
      component: () => import('@/layouts/AppShell.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: '/home',
        },
        {
          path: '/home',
          name: 'home',
          component: () => import('@/views/HomeView.vue'),
        },
        { path: '/dashboard', redirect: '/home' },
        {
          path: '/analytics',
          name: 'analytics',
          component: () => import('@/views/broker/analytics/AnalyticsView.vue'),
          meta: { requiresPermission: 'analytics.read' },
        },
        {
          path: '/reestr',
          name: 'reestr',
          component: () => import('@/views/broker/transit/TransitView.vue'),
        },
        {
          // Запись транзита — страница вместо окна (редизайн, волна 4б); /reestr/new — новая запись (id = 'new').
          // Один маршрут на обе: после создания /reestr/new → /reestr/:id страница не пересоздаётся.
          // Доступ — как у /reestr (guard: reestr.read, клиенту можно).
          path: '/reestr/:id',
          name: 'reestr-record',
          component: () => import('@/views/broker/transit/record/TransitRecordPage.vue'),
        },
        {
          path: '/requests-registry',
          name: 'requests-registry',
          component: () => import('@/views/broker/requests/BrokerRegistryView.vue'),
          meta: { requiresRole: 'administrator' },
        },
        {
          path: '/document-packages',
          name: 'document-packages',
          component: () => import('@/views/broker/packages/PackagesView.vue'),
        },
        {
          // «Разбор поезда» (редизайн, волна 4в). Доступ — как у /document-packages (guard).
          path: '/document-packages/:id/workspace',
          name: 'document-packages-workspace',
          component: () => import('@/views/broker/packages/workspace/WorkspacePage.vue'),
        },
        {
          // Редактор партии (редизайн, волна 4в): /document-packages/:id/partia/:partiaId; новая —
          // /document-packages/:id/partia/new?container=<id контейнера>. Доступ — как у разбора (guard по /document-packages).
          path: '/document-packages/:id/partia/:partiaId',
          name: 'document-packages-partia',
          component: () => import('@/views/broker/packages/partia/PartiaPage.vue'),
        },
        {
          path: '/import-40',
          name: 'import-40',
          // Клиенту — «Мои поставки», сотруднику — список заявок (выбор по роли внутри обёртки).
          component: () => import('@/views/Import40Route.vue'),
          meta: { requiresImport40: true },
        },
        {
          path: '/import-40/company',
          name: 'import-40-company',
          component: () => import('@/views/Import40CompanyRoute.vue'),
          meta: { requiresImport40: true },
        },
        {
          // Мастер «Оформить поставку» клиента (редизайн, волна 2a): новая и черновик.
          // Объявлены до /import-40/:id, чтобы «new» не читался как номер поставки.
          path: '/import-40/new',
          name: 'client-wizard',
          component: () => import('@/views/client/ClientWizardView.vue'),
          meta: { requiresImport40: true, requiresRole: 'client' },
        },
        {
          path: '/import-40/new/:id',
          name: 'client-wizard-draft',
          component: () => import('@/views/client/ClientWizardView.vue'),
          meta: { requiresImport40: true, requiresRole: 'client' },
        },
        {
          path: '/import-40/:id',
          name: 'import-40-detail',
          component: () => import('@/views/Import40CaseRoute.vue'),
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
          component: () => import('@/views/broker/keden/KedenDeclarationsView.vue'),
          props: { mode: 'all' },
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
          component: () => import('@/views/broker/keden/KedenDeclarationsView.vue'),
          props: { mode: 'mine' },
        },
        {
          path: '/sales',
          name: 'sales',
          component: () => import('@/views/broker/sales/SalesWorkspaceView.vue'),
          meta: { requiresSales: true },
        },
        {
          path: '/notifications',
          name: 'notifications',
          component: () => import('@/views/NotificationsView.vue'),
        },
        {
          // Только клиенту транзита — тот же критерий, что и в меню (navModel: buildClientNav, transit).
          path: '/my-documents',
          name: 'my-documents',
          component: () => import('@/views/MyDocumentsView.vue'),
          meta: { requiresClientTransit: true },
        },
        {
          // Единый список документов клиента Импорта 40 (редизайн, волна 2b): компания + файлы поставок.
          path: '/documents',
          name: 'client-documents-all',
          component: () => import('@/views/client/ClientAllDocumentsView.vue'),
          meta: { requiresImport40: true, requiresRole: 'client' },
        },
        {
          // Волна 2 ролей: финансы (бухгалтер) и панель руководителя.
          path: '/finance',
          name: 'finance',
          component: () => import('@/views/broker/finance/FinanceOverviewView.vue'),
          meta: { requiresPermission: 'finance.read' },
        },
        {
          path: '/import-40/manage',
          name: 'import40-manage',
          component: () => import('@/views/broker/requests/BrokerManageView.vue'),
          meta: { requiresPermission: 'import40.assign' },
        },
        {
          path: '/clients',
          name: 'clients',
          component: () => import('@/views/broker/clients/ClientsListView.vue'),
          meta: { requiresPermission: 'clients.read' },
        },
        {
          path: '/clients/:id',
          name: 'client-card',
          component: () => import('@/views/broker/clients/ClientCardPage.vue'),
          meta: { requiresPermission: 'clients.read' },
        },
        {
          path: '/client-documents',
          name: 'client-documents',
          component: () => import('@/views/broker/clients/ClientDocumentsRegisterView.vue'),
          meta: { requiresPermission: 'clients.read' },
        },
        {
          // Раздел «Счета»: сотрудникам по finance.read, клиенту Импорта 40 — свои счета,
          // только чтение (аудит 5.2/4). Проверка роли клиента — отдельным условием ниже,
          // permission тут не задан специально, иначе клиента без finance.read выкинет.
          path: '/billing',
          name: 'billing',
          component: () => import('@/views/BillingRoute.vue'),
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
          component: () => import('@/views/TnvedTreeRoute.vue'),
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
          component: () => import('@/views/TnvedCurrenciesRoute.vue'),
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
        { path: '/:pathMatch(.*)*', redirect: '/' },
      ],
    },
  ],
})

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore()
  authStore.checkAuth()
  const target = guardRedirect(to.path, to.meta as Record<string, unknown>, {
    isAuthenticated: authStore.isAuthenticated,
    role: authStore.role || '',
    hasPermission: (p) => authStore.hasPermission(p),
    clientHasModule: (m) => authStore.clientHasModule(m),
    canUseImport40: authStore.canUseImport40,
    canUseSales: authStore.canUseSales,
    isFinanceOnly: authStore.isFinanceOnly,
  })
  if (target) next(target)
  else next()
})

export default router
