<template>
  <a-layout class="main-layout app-shell">
    <a-layout-header class="app-header">
      <div class="brand">
        <AtgLogo :dark="true" :compact="true" :height="34" />
        <div class="brand-text">
          <div class="brand-title">Aqniet Trans Group</div>
          <div class="brand-subtitle">CRM Operations</div>
        </div>
      </div>

      <div class="header-right">
        <span class="role-badge">{{ roleLabel }}</span>
        <span class="username">{{ authStore.username }}</span>

        <!-- Notifications bell -->
        <a-dropdown :trigger="['click']" placement="bottomRight" @open-change="onNotifOpen">
          <a-badge :count="notifStore.unreadCount" :overflow-count="99" class="notif-badge">
            <a-button class="notif-btn" :title="'Уведомления'">
              <BellOutlined />
            </a-button>
          </a-badge>
          <template #overlay>
            <div class="notif-dropdown">
              <div class="notif-header">
                <span class="notif-title">Уведомления</span>
                <a-button
                  v-if="notifStore.items.length"
                  type="link"
                  size="small"
                  @click.stop="notifStore.markAllRead()"
                >
                  Прочитать все
                </a-button>
              </div>
              <a-spin :spinning="notifStore.loading">
                <div v-if="notifStore.items.length" class="notif-list">
                  <div
                    v-for="n in notifStore.items"
                    :key="n.id"
                    class="notif-item"
                    :class="{ 'notif-item--unread': !n.isRead }"
                    @click="notifStore.markRead(n.id)"
                  >
                    <div class="notif-msg">{{ n.message }}</div>
                    <div v-if="n.relatedCode" class="notif-code">{{ n.relatedCode }}</div>
                    <div class="notif-time">{{ formatNotifTime(n.createdAtUtc) }}</div>
                  </div>
                </div>
                <div v-else class="notif-empty">Нет новых уведомлений</div>
              </a-spin>
            </div>
          </template>
        </a-dropdown>

        <a-button class="logout-button" @click="handleLogout">
          <LogoutOutlined />
          <span class="logout-label">Выйти</span>
        </a-button>
        <a-button class="menu-toggle-btn" @click="mobileNavOpen = true" title="Меню">
          <MenuOutlined />
        </a-button>
      </div>
    </a-layout-header>

    <a-layout>
      <a-layout-sider width="248" class="sider">
        <nav class="sider-nav">
          <a-menu
            mode="inline"
            :selected-keys="[selectedMenuKey]"
            :open-keys="openKeys"
            @open-change="onOpenChange"
            @click="handleMenuClick"
            :items="menuItems"
          />
        </nav>
        <div class="sider-footer">
          <div class="sider-footer-role">{{ roleLabel }}</div>
          <div class="sider-footer-user">{{ authStore.username }}</div>
        </div>
      </a-layout-sider>

      <a-layout-content class="content">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>

  <!-- Mobile navigation drawer -->
  <a-drawer
    v-model:open="mobileNavOpen"
    placement="left"
    :width="264"
    class="atg-mobile-drawer"
    :closable="true"
  >
    <template #title>
      <div class="drawer-brand">
        <AtgLogo :dark="true" :compact="true" :height="28" />
        <div>
          <div class="drawer-brand-title">Aqniet Trans Group</div>
          <div class="drawer-brand-sub">CRM Operations</div>
        </div>
      </div>
    </template>

    <a-menu
      mode="inline"
      :selected-keys="[selectedMenuKey]"
      @click="handleMobileMenuClick"
      :items="menuItems"
      class="drawer-menu"
    />

    <div class="drawer-footer">
      <div class="drawer-footer-role">{{ roleLabel }}</div>
      <div class="drawer-footer-user">{{ authStore.username }}</div>
      <a-button class="drawer-logout" block @click="handleLogout">
        <LogoutOutlined />
        Выйти
      </a-button>
    </div>
  </a-drawer>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useNotificationsStore } from '@/stores/notifications'
import {
  ApiOutlined,
  BankOutlined,
  BarChartOutlined,
  BellOutlined,
  CalendarOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FileAddOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  GlobalOutlined,
  ImportOutlined,
  LogoutOutlined,
  MenuOutlined,
  SafetyCertificateOutlined,
  SolutionOutlined,
  SyncOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from '@ant-design/icons-vue'
import { formatRole } from '@/utils/labels'
import AtgLogo from '@/components/AtgLogo.vue'
import dayjs from 'dayjs'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const notifStore = useNotificationsStore()

const mobileNavOpen = ref(false)
const openKeys = ref<string[]>([])

onMounted(() => notifStore.fetch())

const onNotifOpen = (open: boolean) => {
  if (open) notifStore.fetch()
}

const formatNotifTime = (iso: string) => dayjs(iso).format('DD.MM HH:mm')

const menuItems = computed(() => {
  const role = (authStore.role || '').trim().toLowerCase()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = []

  if (role !== 'sales') {
    items.push({
      key: '/dashboard',
      icon: () => h(DashboardOutlined),
      label: 'Дашборд',
    })
  }

  if (role === 'administrator') {
    items.push({
      key: '/analytics',
      icon: () => h(BarChartOutlined),
      label: 'Аналитика',
    })
  }

  if (authStore.canUseSales) {
    items.push({
      key: '/sales',
      icon: () => h(BarChartOutlined),
      label: 'Продажи',
    })
  }

  if (!['importer', 'sales'].includes(role)) {
    items.push({
      key: '/reestr',
      icon: () => h(DatabaseOutlined),
      label: 'Реестр',
    })
  }

  if (['expeditor', 'broker', 'administrator'].includes(role)) {
    items.push({
      key: '/document-packages',
      icon: () => h(FileAddOutlined),
      label: 'Пакеты документов',
    })
  }

  if (authStore.canUseImport40) {
    items.push({
      key: '/import-40',
      icon: () => h(ImportOutlined),
      label: 'Импорт',
    })
  }

  if (role === 'client') {
    items.push({
      key: '/import-40/company',
      icon: () => h(SolutionOutlined),
      label: 'Моя компания',
    })
  }

  if (role === 'administrator') {
    items.push({
      key: '/references',
      icon: () => h(BankOutlined),
      label: 'Справочники',
    })
  }

  if (role === 'client') {
    items.push({
      key: '/my-documents',
      icon: () => h(FileDoneOutlined),
      label: 'Мои документы',
    })
  }

  if (role === 'expeditor') {
    items.push({
      key: '/clients',
      icon: () => h(SolutionOutlined),
      label: 'Клиенты',
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tnvedChildren: any[] = [
    { key: '/tnved/tree', icon: () => h(UnorderedListOutlined), label: 'Классификатор' },
    { key: '/tnved/news', icon: () => h(FileTextOutlined), label: 'Новости' },
    { key: '/tnved/regulations', icon: () => h(FileDoneOutlined), label: 'НПА' },
    { key: '/tnved/currencies', icon: () => h(DatabaseOutlined), label: 'Валюты' },
    { key: '/tnved/timeline', icon: () => h(CalendarOutlined), label: 'Таймлайн' },
    { key: '/tnved/analytics', icon: () => h(BarChartOutlined), label: 'Аналитика' },
  ]

  if (authStore.hasPermission('tnved.manage')) {
    tnvedChildren.push({ key: '/tnved/sync', icon: () => h(SyncOutlined), label: 'Синхронизация' })
  }

  items.push({
    key: 'tnved-group',
    icon: () => h(GlobalOutlined),
    label: 'ТН ВЭД',
    children: tnvedChildren,
  })

  if (authStore.hasPermission('users.read')) {
    items.push({
      key: '/roles',
      icon: () => h(SafetyCertificateOutlined),
      label: 'Роли',
    })
  }

  if (authStore.hasPermission('users.write')) {
    items.push({
      key: '/users',
      icon: () => h(TeamOutlined),
      label: 'Пользователи',
    })
  }

  if (authStore.hasPermission('endpoints.read')) {
    items.push({
      key: '/system/endpoints',
      icon: () => h(ApiOutlined),
      label: 'API',
    })
  }

  items.push({
    key: '/profile',
    icon: () => h(UserOutlined),
    label: 'Профиль',
  })

  return items
})

const roleLabel = computed(() => formatRole(authStore.role || ''))

function onOpenChange(keys: string[]) {
  openKeys.value = keys
}

watch(
  () => route.path,
  (path) => {
    if (path.startsWith('/tnved/')) openKeys.value = ['tnved-group']
  },
  { immediate: true },
)

const selectedMenuKey = computed(() => {
  if (route.path.startsWith('/dashboard')) return '/dashboard'
  if (route.path.startsWith('/analytics')) return '/analytics'
  if (route.path.startsWith('/my-documents')) return '/my-documents'
  if (route.path.startsWith('/clients')) return '/clients'
  if (route.path.startsWith('/document-packages')) return '/document-packages'
  if (route.path.startsWith('/import-40')) return '/import-40'
  if (route.path.startsWith('/references')) return '/references'
  if (route.path.startsWith('/tnved/')) return route.path
  if (route.path.startsWith('/roles')) return '/roles'
  if (route.path.startsWith('/users')) return '/users'
  if (route.path.startsWith('/system/endpoints')) return '/system/endpoints'
  if (route.path.startsWith('/profile')) return '/profile'
  return '/reestr'
})

const handleMenuClick = ({ key }: { key: string }) => {
  router.push(key)
}

const handleMobileMenuClick = ({ key }: { key: string }) => {
  mobileNavOpen.value = false
  router.push(key)
}

const handleLogout = () => {
  mobileNavOpen.value = false
  authStore.logout()
  router.push('/login')
}
</script>

<style scoped>
/* ─── Shell ──────────────────────────────────────────────── */

.main-layout {
  min-height: 100vh;
}

.app-shell {
  background:
    linear-gradient(148deg, rgba(43, 188, 212, 0.04), transparent 26%),
    var(--atg-bg);
}

/* ─── Header ─────────────────────────────────────────────── */

.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 64px;
  min-height: 64px;
  padding: 0 24px;
  line-height: normal;
  background: linear-gradient(135deg, #1B2A4A 0%, #1E3060 60%, #243575 100%);
  border-bottom: 2px solid #2BBCD4;
  box-shadow: 0 2px 20px rgba(27, 42, 74, 0.5);
}

/* Brand */
.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  color: #f0f3ff;
  flex-shrink: 0;
}

.brand-text {
  min-width: 0;
}

.brand-title {
  display: block;
  color: #f0f3ff;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.25;
  white-space: nowrap;
}

.brand-subtitle {
  display: block;
  margin-top: 3px;
  color: rgba(240, 243, 255, 0.48);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

/* Header right */
.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-shrink: 0;
}

.username {
  color: rgba(240, 243, 255, 0.82);
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.role-badge {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 13px;
  border: 1px solid rgba(43, 188, 212, 0.45);
  border-radius: 999px;
  color: #2BBCD4;
  background: rgba(43, 188, 212, 0.12);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

/* Notifications */
.notif-badge :deep(.ant-badge-count) {
  box-shadow: none;
  font-size: 10px;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  padding: 0 4px;
}

.notif-btn {
  color: rgba(240, 243, 255, 0.75);
  border-color: rgba(240, 243, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  min-height: 36px;
  min-width: 36px;
  padding: 0;
  transition:
    color var(--atg-transition),
    border-color var(--atg-transition),
    background var(--atg-transition);
}

.notif-btn:hover {
  color: #1B2A4A !important;
  border-color: #2BBCD4 !important;
  background: #2BBCD4 !important;
}

.notif-dropdown {
  width: 320px;
  background: #fff;
  border-radius: var(--atg-radius-lg);
  border: 1px solid var(--atg-line);
  box-shadow: var(--atg-shadow-lg);
  overflow: hidden;
}

.notif-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 10px;
  border-bottom: 1px solid var(--atg-line);
}

.notif-title {
  font-size: 13px;
  font-weight: 750;
  color: var(--atg-ink);
  letter-spacing: -0.01em;
}

.notif-list {
  max-height: 360px;
  overflow-y: auto;
}

.notif-item {
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--atg-line);
  transition: background var(--atg-transition);
}

.notif-item:last-child {
  border-bottom: none;
}

.notif-item:hover {
  background: var(--atg-accent-soft);
}

.notif-item--unread {
  border-left: 3px solid var(--atg-teal);
  padding-left: 13px;
}

.notif-msg {
  font-size: 13px;
  font-weight: 600;
  color: var(--atg-charcoal);
  line-height: 1.5;
}

.notif-code {
  display: inline-block;
  margin-top: 3px;
  padding: 1px 7px;
  background: var(--atg-teal-soft);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  font-family: monospace;
  color: var(--atg-teal-dark);
  letter-spacing: 0.04em;
}

.notif-time {
  margin-top: 4px;
  font-size: 11px;
  color: var(--atg-muted);
}

.notif-empty {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--atg-muted);
}

.logout-button {
  color: rgba(240, 243, 255, 0.75);
  border-color: rgba(240, 243, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  transition:
    color var(--atg-transition),
    border-color var(--atg-transition),
    background var(--atg-transition);
}

.logout-button:hover {
  color: #1B2A4A !important;
  border-color: #2BBCD4 !important;
  background: #2BBCD4 !important;
}

/* ─── Notifications ──────────────────────────────────────── */

.bell-btn {
  font-size: 18px;
  color: rgba(240, 243, 255, 0.82);
}

.bell-btn:hover,
.bell-btn:focus {
  color: #2bbcd4;
  background: rgba(255, 255, 255, 0.06);
}

.notif-dropdown {
  width: 320px;
  max-height: 420px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid var(--atg-line);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(27, 42, 74, 0.12);
}

.notif-head {
  padding: 10px 14px;
  font-weight: 700;
  border-bottom: 1px solid var(--atg-line);
}

.notif-empty {
  padding: 18px;
  text-align: center;
  color: var(--atg-muted);
}

.notif-item {
  padding: 10px 14px;
  border-bottom: 1px solid var(--atg-line);
  cursor: pointer;
}

.notif-item:hover {
  background: var(--atg-bg);
}

.notif-unread {
  background: rgba(43, 188, 212, 0.06);
}

.notif-title {
  font-weight: 600;
  font-size: 13px;
}

.notif-body {
  font-size: 12px;
  color: var(--atg-charcoal);
  margin-top: 2px;
}

/* ─── Sider ──────────────────────────────────────────────── */

.sider {
  position: sticky;
  top: 64px;
  align-self: flex-start;
  height: calc(100vh - 64px);
  overflow: hidden;
  background: linear-gradient(180deg, #1B2A4A 0%, #132040 100%);
  border-right: 1px solid rgba(43, 188, 212, 0.14);
  display: flex;
  flex-direction: column;
  box-shadow: 2px 0 16px rgba(27, 42, 74, 0.25);
}

.sider :deep(.ant-layout-sider-children) {
  display: flex;
  flex-direction: column;
  padding: 12px;
  height: calc(100vh - 64px);
}

.sider-nav {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.sider :deep(.ant-menu) {
  border-inline-end: 0;
  background: transparent;
  color: rgba(240, 243, 255, 0.6);
}

.sider :deep(.ant-menu-item) {
  height: 42px;
  margin: 3px 0;
  border-radius: 8px;
  color: rgba(240, 243, 255, 0.6);
  font-size: 14px;
  font-weight: 600;
  transition:
    color var(--atg-transition),
    background var(--atg-transition);
}

.sider :deep(.ant-menu-item .anticon) {
  font-size: 16px;
  opacity: 0.8;
  transition: opacity var(--atg-transition);
}

.sider :deep(.ant-menu-item:hover) {
  color: #f0f3ff !important;
  background: rgba(240, 243, 255, 0.07) !important;
}

.sider :deep(.ant-menu-item:hover .anticon) {
  opacity: 1;
}

.sider :deep(.ant-menu-item-selected) {
  color: #ffffff !important;
  background: linear-gradient(90deg, #2BBCD4, #1FA8C0) !important;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(43, 188, 212, 0.35);
}

.sider :deep(.ant-menu-item-selected .anticon) {
  opacity: 1;
}

/* Sider footer */
.sider-footer {
  padding: 12px 10px;
  border-top: 1px solid rgba(43, 188, 212, 0.18);
  margin-top: 8px;
}

.sider-footer-role {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #2BBCD4;
  margin-bottom: 3px;
}

.sider-footer-user {
  font-size: 13px;
  font-weight: 600;
  color: rgba(240, 243, 255, 0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ─── Content ────────────────────────────────────────────── */

.content {
  min-height: calc(100vh - 68px);
  padding: 28px;
  background: transparent;
}

/* ─── Drawer menu ────────────────────────────────────────── */

.drawer-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.drawer-brand-title {
  font-size: 14px;
  font-weight: 700;
  color: #f0f3ff;
  line-height: 1.3;
}

.drawer-brand-sub {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(240, 243, 255, 0.45);
  margin-top: 2px;
}

.drawer-menu {
  border-inline-end: 0 !important;
  background: transparent !important;
  color: rgba(240, 243, 255, 0.6) !important;
}

.drawer-menu :deep(.ant-menu-item) {
  height: 44px;
  margin: 3px 0;
  border-radius: 8px;
  color: rgba(240, 243, 255, 0.6);
  font-size: 14px;
  font-weight: 600;
}

.drawer-menu :deep(.ant-menu-item:hover) {
  color: #f0f3ff !important;
  background: rgba(240, 243, 255, 0.07) !important;
}

.drawer-menu :deep(.ant-menu-item-selected) {
  color: #ffffff !important;
  background: linear-gradient(90deg, #2BBCD4, #1FA8C0) !important;
  font-weight: 700;
}

.drawer-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 14px 12px 18px;
  border-top: 1px solid rgba(43, 188, 212, 0.18);
  background: #1B2A4A;
}

.drawer-footer-role {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #2BBCD4;
  margin-bottom: 2px;
}

.drawer-footer-user {
  font-size: 13px;
  font-weight: 600;
  color: rgba(240, 243, 255, 0.5);
  margin-bottom: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-logout {
  color: rgba(240, 243, 255, 0.7);
  border-color: rgba(240, 243, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
}

.drawer-logout:hover {
  color: #1B2A4A !important;
  border-color: #2BBCD4 !important;
  background: #2BBCD4 !important;
}

/* ─── Responsive ─────────────────────────────────────────── */

@media (max-width: 860px) {
  .app-header {
    height: 60px;
    min-height: 60px;
    padding: 0 16px;
  }

  .sider {
    display: none;
  }

  .content {
    padding: 16px;
    min-height: calc(100vh - 60px);
  }

  .role-badge,
  .username,
  .logout-button {
    display: none;
  }
}

@media (max-width: 480px) {
  .brand-subtitle {
    display: none;
  }

  .content {
    padding: 12px;
  }
}
</style>
