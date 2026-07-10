import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
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
      path: '/',
      component: () => import('@/layouts/MainLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: '/dashboard',
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
          meta: { requiresRole: 'administrator' },
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
          path: '/my-documents',
          name: 'my-documents',
          component: () => import('@/views/MyDocumentsView.vue'),
        },
        {
          path: '/clients',
          name: 'clients',
          component: () => import('@/views/ClientsView.vue'),
          meta: { requiresRole: 'expeditor' },
        },
        {
          path: '/tnved/tree',
          name: 'tnved-tree',
          component: () => import('@/views/TnvedTreeView.vue'),
        },
        {
          path: '/tnved/news',
          name: 'tnved-news',
          component: () => import('@/views/TnvedNewsView.vue'),
        },
        {
          path: '/tnved/regulations',
          name: 'tnved-regulations',
          component: () => import('@/views/TnvedRegulationsView.vue'),
        },
        {
          path: '/tnved/currencies',
          name: 'tnved-currencies',
          component: () => import('@/views/TnvedCurrenciesView.vue'),
        },
        {
          path: '/tnved/timeline',
          name: 'tnved-timeline',
          component: () => import('@/views/TnvedTimelineView.vue'),
        },
        {
          path: '/tnved/analytics',
          name: 'tnved-analytics',
          component: () => import('@/views/TnvedAnalyticsView.vue'),
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
  const requiresAuth = to.meta.requiresAuth !== false
  const requiredPermission = to.meta.requiresPermission as string | undefined
  const requiredRole = to.meta.requiresRole as string | undefined
  const requiresImport40 = to.meta.requiresImport40 === true
  const requiresSales = to.meta.requiresSales === true

  const normalizedRole = (authStore.role || '').trim().toLowerCase()

  if (requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else if (normalizedRole === 'importer' && to.path === '/reestr') {
    next('/import-40')
  } else if (normalizedRole === 'sales' && (to.path === '/reestr' || to.path === '/dashboard')) {
    next('/sales')
  } else if (
    to.path.startsWith('/document-packages') &&
    !['administrator', 'broker', 'expeditor'].includes(normalizedRole)
  ) {
    next('/')
  } else if (requiredRole && normalizedRole !== requiredRole) {
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
