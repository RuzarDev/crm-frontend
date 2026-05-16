<template>
  <div class="roles-view crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Безопасность</div>
        <h1 class="crm-page-title">Роли и права</h1>
        <p class="crm-page-subtitle">
          Матрица доступов CRM: просмотр, редактирование, документы, статусы и управление пользователями.
        </p>
      </div>
    </div>

    <a-card class="crm-shell-card" :bordered="false">
      <a-table
        :columns="columns"
        :data-source="rolesStore.roles"
        :loading="rolesStore.loading"
        :pagination="false"
        :row-key="(record: RoleItem) => record.name"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            <div class="role-name-cell">
              <span class="role-name-label">{{ formatRole(record.name) }}</span>
              <span class="role-slug">{{ record.name }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'permissions'">
            <div class="permissions-wrap">
              <a-tag v-for="permission in record.permissions" :key="permission" class="perm-tag">
                {{ formatPermission(permission) }}
              </a-tag>
            </div>
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRolesStore } from '@/stores/roles'
import type { RoleItem } from '@/types/api'
import { formatPermission, formatRole } from '@/utils/labels'

const rolesStore = useRolesStore()

const columns = [
  { title: 'Роль', key: 'name', dataIndex: 'name' },
  { title: 'Права', key: 'permissions' },
]

onMounted(async () => {
  await rolesStore.fetchRoles()
})
</script>

<style scoped>
.roles-view {
  margin: 0 auto;
}

.role-name-cell {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.role-name-label {
  font-weight: 650;
  color: var(--atg-ink);
}

.role-slug {
  color: var(--atg-muted);
  font-size: 11.5px;
  font-family: 'SF Mono', 'Consolas', 'Menlo', monospace;
  background: var(--atg-surface-muted);
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--atg-line);
}

.permissions-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.perm-tag {
  background: rgba(37, 95, 143, 0.08);
  border-color: rgba(37, 95, 143, 0.2);
  color: var(--atg-blue);
  font-size: 11.5px;
  font-weight: 650;
}
</style>
