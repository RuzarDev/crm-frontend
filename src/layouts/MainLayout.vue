<template>
  <a-layout class="main-layout">
    <a-layout-header class="header">
      <div class="logo">
        <DatabaseOutlined />
        <span>CRM System</span>
      </div>
      <div class="header-right">
        <span class="username">{{ authStore.username }}</span>
        <a-button type="link" @click="handleLogout">
          <LogoutOutlined />
          Logout
        </a-button>
      </div>
    </a-layout-header>

    <a-layout>
      <a-layout-sider width="220" class="sider">
        <a-menu
          mode="inline"
          :selected-keys="[selectedMenuKey]"
          @click="handleMenuClick"
          :items="menuItems"
        />
      </a-layout-sider>

      <a-layout-content class="content">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { DatabaseOutlined, LogoutOutlined } from '@ant-design/icons-vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const menuItems = computed(() => {
  const items = [
    {
      key: '/reestr',
      label: 'Reestr',
    },
  ]

  if (authStore.hasPermission('roles.manage')) {
    items.push({
      key: '/roles',
      label: 'Roles',
    })
  }

  if (authStore.hasPermission('users.write')) {
    items.push({
      key: '/users',
      label: 'Users',
    })
  }

  return items
})

const selectedMenuKey = computed(() => {
  if (route.path.startsWith('/roles')) {
    return '/roles'
  }
  if (route.path.startsWith('/users')) {
    return '/users'
  }
  return '/reestr'
})

const handleMenuClick = ({ key }: { key: string }) => {
  router.push(key)
}

const handleLogout = () => {
  authStore.logout()
  router.push('/login')
}
</script>

<style scoped>
.main-layout {
  min-height: 100vh;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #001529;
  padding: 0 24px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #fff;
  font-size: 20px;
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.username {
  color: #fff;
}

.content {
  padding: 24px;
  background: #f0f2f5;
}

.sider {
  background: #fff;
}
</style>
