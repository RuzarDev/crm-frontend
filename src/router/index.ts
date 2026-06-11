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
          path: '/reestr',
          name: 'reestr',
          component: () => import('@/views/ReestrView.vue'),
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
          path: '/process-flow',
          name: 'process-flow',
          component: () => import('@/views/ProcessFlowView.vue'),
          meta: { requiresRole: 'admin' },
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

  if (requiresAuth && !authStore.isAuthenticated) {
    next('/login')
  } else if (requiredRole && (authStore.role || '').trim().toLowerCase() !== requiredRole) {
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
