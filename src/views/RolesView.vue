<template>
  <div class="roles-view">
    <a-card title="Роли" :bordered="false">
      <template #extra>
        <a-button type="primary" @click="openCreateModal">
          <PlusOutlined />
          Добавить роль
        </a-button>
      </template>

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

          <template v-else-if="column.key === 'actions'">
            <a-space>
              <a-button type="link" size="small" @click="openEditModal(record)">
                <EditOutlined />
                Изменить
              </a-button>
              <a-popconfirm
                title="Удалить эту роль?"
                ok-text="Да"
                cancel-text="Нет"
                @confirm="handleDelete(record.name)"
              >
                <a-button type="link" danger size="small">
                  <DeleteOutlined />
                  Удалить
                </a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal
      v-model:open="modalOpen"
      :title="isEditMode ? 'Права роли' : 'Новая роль'"
      ok-text="Сохранить"
      cancel-text="Отмена"
      :confirm-loading="saving"
      @ok="handleSave"
      @cancel="handleCancel"
    >
      <a-form layout="vertical">
        <a-form-item label="Имя роли (код)">
          <a-input
            v-model:value="form.name"
            placeholder="Например: broker"
            :disabled="isEditMode"
          />
        </a-form-item>
        <a-form-item label="Права доступа">
          <a-checkbox-group v-model:value="form.permissions" style="width: 100%">
            <a-space direction="vertical" style="width: 100%">
              <a-checkbox
                v-for="permission in rolesStore.permissions"
                :key="permission"
                :value="permission"
              >
                {{ formatPermission(permission) }}
                <span class="perm-slug">({{ permission }})</span>
              </a-checkbox>
            </a-space>
          </a-checkbox-group>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRolesStore } from '@/stores/roles'
import type { RoleItem } from '@/types/api'
import { formatPermission, formatRole } from '@/utils/labels'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'

const rolesStore = useRolesStore()

const modalOpen = ref(false)
const isEditMode = ref(false)
const editingRoleName = ref('')
const saving = ref(false)
const form = reactive({
  name: '',
  permissions: [] as string[],
})

const columns = computed(() => [
  {
    title: 'Роль',
    dataIndex: 'name',
    key: 'name',
    width: 260,
  },
  {
    title: 'Права',
    key: 'permissions',
  },
  {
    title: 'Действия',
    key: 'actions',
    width: 200,
  },
])

onMounted(async () => {
  await Promise.all([rolesStore.fetchPermissions(), rolesStore.fetchRoles()])
})

const openCreateModal = () => {
  isEditMode.value = false
  editingRoleName.value = ''
  form.name = ''
  form.permissions = []
  modalOpen.value = true
}

const openEditModal = (role: RoleItem) => {
  isEditMode.value = true
  editingRoleName.value = role.name
  form.name = role.name
  form.permissions = [...role.permissions]
  modalOpen.value = true
}

const handleSave = async () => {
  if (!form.name.trim()) {
    message.error('Укажите имя роли')
    return
  }
  saving.value = true
  try {
    if (isEditMode.value) {
      const success = await rolesStore.updateRolePermissions(editingRoleName.value, form.permissions)
      if (success) {
        modalOpen.value = false
      }
      return
    }

    const success = await rolesStore.createRole(form.name, form.permissions)
    if (success) {
      modalOpen.value = false
    }
  } finally {
    saving.value = false
  }
}

const handleCancel = () => {
  modalOpen.value = false
}

const handleDelete = async (name: string) => {
  await rolesStore.deleteRole(name)
}
</script>

<style scoped>
.roles-view {
  max-width: 1400px;
  margin: 0 auto;
}

.role-slug,
.perm-slug {
  margin-left: 4px;
  font-size: 12px;
  color: #8c8c8c;
}
</style>
