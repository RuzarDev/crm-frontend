<template>
  <div class="roles-view">
    <a-card title="Roles" :bordered="false">
      <template #extra>
        <a-button type="primary" @click="openCreateModal">
          <PlusOutlined />
          Add role
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
          <template v-if="column.key === 'permissions'">
            <a-space wrap>
              <a-tag v-for="permission in record.permissions" :key="permission" color="blue">
                {{ permission }}
              </a-tag>
            </a-space>
          </template>

          <template v-else-if="column.key === 'actions'">
            <a-space>
              <a-button type="link" size="small" @click="openEditModal(record)">
                <EditOutlined />
                Edit
              </a-button>
              <a-popconfirm
                title="Delete this role?"
                ok-text="Yes"
                cancel-text="No"
                @confirm="handleDelete(record.name)"
              >
                <a-button type="link" danger size="small">
                  <DeleteOutlined />
                  Delete
                </a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal
      v-model:open="modalOpen"
      :title="isEditMode ? 'Edit role permissions' : 'Add role'"
      :confirm-loading="saving"
      @ok="handleSave"
      @cancel="handleCancel"
    >
      <a-form layout="vertical">
        <a-form-item label="Role name">
          <a-input
            v-model:value="form.name"
            placeholder="Enter role name"
            :disabled="isEditMode"
          />
        </a-form-item>
        <a-form-item label="Permissions">
          <a-checkbox-group v-model:value="form.permissions" style="width: 100%">
            <a-space direction="vertical" style="width: 100%">
              <a-checkbox
                v-for="permission in rolesStore.permissions"
                :key="permission"
                :value="permission"
              >
                {{ permission }}
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
    title: 'Role',
    dataIndex: 'name',
    key: 'name',
    width: 220,
  },
  {
    title: 'Permissions',
    key: 'permissions',
  },
  {
    title: 'Actions',
    key: 'actions',
    width: 180,
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
    message.error('Role name is required')
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
</style>
