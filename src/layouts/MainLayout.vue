<template>
  <a-layout class="main-layout app-shell">
    <a-layout-header class="app-header">
      <div class="brand">
        <div class="brand-mark">ATG</div>
        <div class="brand-text">
          <div class="brand-title">Aqniet Trans Group</div>
          <div class="brand-subtitle">CRM Operations</div>
        </div>
      </div>

      <div class="header-right">
        <span class="role-badge">{{ roleLabel }}</span>
        <span class="username">{{ authStore.username }}</span>
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
        <div class="drawer-brand-mark">ATG</div>
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
import { computed, h, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  DatabaseOutlined,
  FileDoneOutlined,
  LogoutOutlined,
  MenuOutlined,
  SafetyCertificateOutlined,
  SolutionOutlined,
  TeamOutlined,
} from '@ant-design/icons-vue'
import { formatRole } from '@/utils/labels'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const mobileNavOpen = ref(false)

const menuItems = computed(() => {
  const items = [
    {
      key: '/reestr',
      icon: () => h(DatabaseOutlined),
      label: 'Реестр',
    },
  ]

  if ((authStore.role || '').trim().toLowerCase() === 'client') {
    items.push({
      key: '/my-documents',
      icon: () => h(FileDoneOutlined),
      label: 'Мои документы',
    })
  }

  if ((authStore.role || '').trim().toLowerCase() === 'expeditor') {
    items.push({
      key: '/clients',
      icon: () => h(SolutionOutlined),
      label: 'Клиенты',
    })
  }

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

  return items
})

const roleLabel = computed(() => formatRole(authStore.role || ''))

const selectedMenuKey = computed(() => {
  if (route.path.startsWith('/my-documents')) return '/my-documents'
  if (route.path.startsWith('/clients')) return '/clients'
  if (route.path.startsWith('/roles')) return '/roles'
  if (route.path.startsWith('/users')) return '/users'
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
    linear-gradient(148deg, rgba(200, 149, 53, 0.06), transparent 24%),
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
  background: linear-gradient(135deg, #161210 0%, #111413 60%, #1a1f1c 100%);
  border-bottom: 1px solid rgba(245, 231, 201, 0.1);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.4);
}

/* Brand */
.brand {
  display: flex;
  align-items: center;
  gap: 13px;
  min-width: 0;
  color: #fff8ea;
  flex-shrink: 0;
}

.brand-mark {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 1px solid rgba(245, 211, 141, 0.4);
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(200, 149, 53, 0.25), rgba(200, 149, 53, 0.1));
  color: #f5d38d;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.04em;
  box-shadow: 0 0 12px rgba(200, 149, 53, 0.2), inset 0 1px 0 rgba(255, 248, 234, 0.1);
}

.brand-text {
  min-width: 0;
}

.brand-title {
  display: block;
  color: #fff8ea;
  font-size: 15px;
  font-weight: 760;
  line-height: 1.25;
  white-space: nowrap;
}

.brand-subtitle {
  display: block;
  margin-top: 3px;
  color: rgba(255, 248, 234, 0.52);
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
  color: rgba(255, 248, 234, 0.85);
  font-size: 13.5px;
  font-weight: 650;
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
  border: 1px solid rgba(245, 211, 141, 0.35);
  border-radius: 999px;
  color: #e8b94a;
  background: rgba(200, 149, 53, 0.12);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.logout-button {
  color: rgba(255, 248, 234, 0.8);
  border-color: rgba(255, 248, 234, 0.16);
  background: rgba(255, 255, 255, 0.04);
  transition:
    color var(--atg-transition),
    border-color var(--atg-transition),
    background var(--atg-transition);
}

.logout-button:hover {
  color: #161412 !important;
  border-color: #f5d38d !important;
  background: #f5d38d !important;
}

/* ─── Sider ──────────────────────────────────────────────── */

.sider {
  background: linear-gradient(180deg, #1d1a16 0%, #181510 100%);
  border-right: 1px solid rgba(245, 231, 201, 0.08);
  display: flex;
  flex-direction: column;
  box-shadow: 2px 0 16px rgba(0, 0, 0, 0.18);
}

.sider :deep(.ant-layout-sider-children) {
  display: flex;
  flex-direction: column;
  padding: 12px;
  height: 100%;
}

.sider-nav {
  flex: 1;
}

.sider :deep(.ant-menu) {
  border-inline-end: 0;
  background: transparent;
  color: rgba(255, 248, 234, 0.65);
}

.sider :deep(.ant-menu-item) {
  height: 42px;
  margin: 3px 0;
  border-radius: 8px;
  color: rgba(255, 248, 234, 0.65);
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
  color: #fff8ea !important;
  background: rgba(255, 248, 234, 0.07) !important;
}

.sider :deep(.ant-menu-item:hover .anticon) {
  opacity: 1;
}

.sider :deep(.ant-menu-item-selected) {
  color: #1a1714 !important;
  background: linear-gradient(90deg, #f5d38d, #e8b94a) !important;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(200, 149, 53, 0.35);
}

.sider :deep(.ant-menu-item-selected .anticon) {
  opacity: 1;
}

/* Sider footer */
.sider-footer {
  padding: 12px 10px;
  border-top: 1px solid rgba(245, 231, 201, 0.1);
  margin-top: 8px;
}

.sider-footer-role {
  font-size: 10.5px;
  font-weight: 750;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--atg-accent);
  margin-bottom: 3px;
}

.sider-footer-user {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 248, 234, 0.6);
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

.drawer-brand-mark {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 1px solid rgba(245, 231, 201, 0.3);
  border-radius: 7px;
  background: rgba(200, 149, 53, 0.15);
  color: #f5d38d;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.drawer-brand-title {
  font-size: 14px;
  font-weight: 760;
  color: #fff8ea;
  line-height: 1.3;
}

.drawer-brand-sub {
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255, 248, 234, 0.5);
  margin-top: 2px;
}

.drawer-menu {
  border-inline-end: 0 !important;
  background: transparent !important;
  color: rgba(255, 248, 234, 0.65) !important;
}

.drawer-menu :deep(.ant-menu-item) {
  height: 44px;
  margin: 3px 0;
  border-radius: 8px;
  color: rgba(255, 248, 234, 0.65);
  font-size: 14px;
  font-weight: 600;
}

.drawer-menu :deep(.ant-menu-item:hover) {
  color: #fff8ea !important;
  background: rgba(255, 248, 234, 0.07) !important;
}

.drawer-menu :deep(.ant-menu-item-selected) {
  color: #1a1714 !important;
  background: #f5d38d !important;
  font-weight: 700;
}

.drawer-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 14px 12px 18px;
  border-top: 1px solid rgba(245, 231, 201, 0.1);
  background: #1d1a16;
}

.drawer-footer-role {
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--atg-accent);
  margin-bottom: 2px;
}

.drawer-footer-user {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 248, 234, 0.55);
  margin-bottom: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-logout {
  color: rgba(255, 248, 234, 0.75);
  border-color: rgba(255, 248, 234, 0.15);
  background: rgba(255, 255, 255, 0.04);
}

.drawer-logout:hover {
  color: #161412 !important;
  border-color: #f5d38d !important;
  background: #f5d38d !important;
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
