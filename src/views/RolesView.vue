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
      <a-tabs v-model:activeKey="activeTab">
        <a-tab-pane key="roles" tab="Пользовательские роли">
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
        </a-tab-pane>

        <a-tab-pane key="matrix" tab="Системная матрица">
          <a-spin :spinning="matrixLoading">
            <div v-if="!matrixLoading && matrix" class="matrix-wrapper">
              <table class="perm-matrix">
                <thead>
                  <tr>
                    <th class="perm-col">Право</th>
                    <th v-for="role in matrix.roles" :key="role.name" class="role-col">
                      <div class="role-col-name">{{ formatRole(role.name) }}</div>
                      <div class="role-col-slug">{{ role.name }}</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="perm in matrix.permissions" :key="perm" class="perm-row">
                    <td class="perm-name">
                      <span class="perm-label">{{ formatPermission(perm) }}</span>
                      <span class="perm-slug">{{ perm }}</span>
                    </td>
                    <td
                      v-for="role in matrix.roles"
                      :key="role.name"
                      class="perm-cell"
                      :class="{ 'has-perm': role.permissions.includes(perm) }"
                    >
                      <CheckCircleFilled v-if="role.permissions.includes(perm)" class="check-icon" />
                      <span v-else class="no-icon">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </a-spin>
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { CheckCircleFilled } from '@ant-design/icons-vue'
import { useRolesStore } from '@/stores/roles'
import { systemApi } from '@/api/system'
import type { RoleItem, PermissionMatrixResponse } from '@/types/api'
import { formatPermission, formatRole } from '@/utils/labels'

const rolesStore = useRolesStore()
const activeTab = ref('roles')

const matrix = ref<PermissionMatrixResponse | null>(null)
const matrixLoading = ref(false)

const columns = [
  { title: 'Роль', key: 'name', dataIndex: 'name' },
  { title: 'Права', key: 'permissions' },
]

onMounted(async () => {
  await rolesStore.fetchRoles()

  matrixLoading.value = true
  try {
    const { data } = await systemApi.getPermissionMatrix()
    matrix.value = data
  } finally {
    matrixLoading.value = false
  }
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
  font-weight: 700;
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
  background: rgba(43, 188, 212, 0.08);
  border-color: rgba(43, 188, 212, 0.22);
  color: var(--atg-accent-strong);
  font-size: 11.5px;
  font-weight: 700;
}

:deep(.crm-shell-card.ant-card) {
  overflow: visible;
}

.matrix-wrapper {
  overflow-x: auto;
}

.perm-matrix {
  min-width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.perm-matrix th,
.perm-matrix td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--atg-line);
  text-align: left;
}

.perm-matrix thead th {
  background: var(--atg-surface-muted);
  font-weight: 700;
  color: var(--atg-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.perm-col {
  min-width: 220px;
}

.role-col {
  text-align: center !important;
  min-width: 110px;
}

.role-col-name {
  font-weight: 650;
  color: var(--atg-ink);
  font-size: 12px;
  text-transform: none;
  letter-spacing: 0;
}

.role-col-slug {
  font-size: 10px;
  color: var(--atg-muted);
  font-family: 'SF Mono', 'Consolas', 'Menlo', monospace;
}

.perm-row:hover {
  background: var(--atg-surface-muted);
}

.perm-name {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.perm-label {
  font-weight: 600;
  color: var(--atg-ink);
}

.perm-slug {
  font-size: 11px;
  color: var(--atg-muted);
  font-family: 'SF Mono', 'Consolas', 'Menlo', monospace;
}

.perm-cell {
  text-align: center !important;
}

.perm-cell.has-perm {
  background: rgba(43, 188, 212, 0.06);
}

.check-icon {
  color: var(--atg-teal, #2BBCD4);
  font-size: 16px;
}

.no-icon {
  color: var(--atg-line);
  font-size: 14px;
}
</style>

<style>
/* allow horizontal scroll on system matrix - ant-card overflow:hidden blocks it */
.roles-view .ant-card {
  overflow: visible !important;
}
</style>
