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
          redirect: '/reestr',
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
          path: '/import-40/:id',
          name: 'import-40-detail',
          component: () => import('@/views/Import40View.vue'),
          meta: { requiresImport40: true },
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

  const normalizedRole = (authStore.role || '').trim().toLowerCase()

  if (requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else if (normalizedRole === 'importer' && to.path === '/reestr') {
    next('/import-40')
  } else if (requiredRole && normalizedRole !== requiredRole) {
    next('/')
  } else if (requiresImport40 && !authStore.canUseImport40) {
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
