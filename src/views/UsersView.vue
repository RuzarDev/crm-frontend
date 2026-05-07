<template>
  <div class="users-view">
    <a-card title="Users" :bordered="false">
      <template #extra>
        <a-button type="primary" @click="openCreateModal">
          <PlusOutlined />
          Add user
        </a-button>
      </template>

      <a-table
        :columns="columns"
        :data-source="usersStore.users"
        :loading="usersStore.loading"
        :pagination="false"
        :row-key="(record: User) => record.id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'role'">
            <a-tag color="blue">{{ record.role }}</a-tag>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal
      v-model:open="modalOpen"
      title="Add user"
      :confirm-loading="saving"
      @ok="handleCreate"
      @cancel="handleCancel"
    >
      <a-form layout="vertical">
        <a-form-item label="Login">
          <a-input v-model:value="form.username" placeholder="Enter login" />
        </a-form-item>
        <a-form-item label="Password">
          <a-input-password v-model:value="form.password" placeholder="Enter password" />
        </a-form-item>
        <a-form-item label="Role">
          <a-select
            v-model:value="form.role"
            placeholder="Select role"
            :options="roleOptions"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useUsersStore } from '@/stores/users'
import { useRolesStore } from '@/stores/roles'
import type { User } from '@/types/api'
import { PlusOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'

const usersStore = useUsersStore()
const rolesStore = useRolesStore()

const modalOpen = ref(false)
const saving = ref(false)
const form = reactive({
  username: '',
  password: '',
  role: '',
})

const columns = computed(() => [
  {
    title: 'Login',
    dataIndex: 'username',
    key: 'username',
  },
  {
    title: 'Role',
    key: 'role',
  },
])

const roleOptions = computed(() =>
  rolesStore.roles.map((role) => ({
    label: role.name,
    value: role.name,
  })),
)

onMounted(async () => {
  await Promise.all([usersStore.fetchUsers(), rolesStore.fetchRoles()])
})

const openCreateModal = () => {
  form.username = ''
  form.password = ''
  form.role = rolesStore.roles[0]?.name || ''
  modalOpen.value = true
}

const handleCreate = async () => {
  if (!form.username.trim() || !form.password || !form.role) {
    message.error('Fill login, password and role')
    return
  }

  saving.value = true
  try {
    const success = await usersStore.createUser({
      username: form.username.trim(),
      password: form.password,
      role: form.role,
    })
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
</script>

<style scoped>
.users-view {
  max-width: 1400px;
  margin: 0 auto;
}
</style>
