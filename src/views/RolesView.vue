<template>
  <div class="roles-view">
    <a-card title="Роли и права" :bordered="false">
      <a-table
        :columns="columns"
        :data-source="rolesStore.roles"
        :loading="rolesStore.loading"
        :pagination="false"
        :row-key="(record: RoleItem) => record.name"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'name'">
            {{ formatRole(record.name) }}
            <span class="role-slug">({{ record.name }})</span>
          </template>
          <template v-else-if="column.key === 'permissions'">
            <a-space wrap>
              <a-tag v-for="permission in record.permissions" :key="permission" color="blue">
                {{ formatPermission(permission) }}
              </a-tag>
            </a-space>
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
.role-slug {
  color: rgba(0, 0, 0, 0.45);
  font-size: 12px;
  margin-left: 6px;
}
</style>
