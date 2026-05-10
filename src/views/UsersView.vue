<template>
  <div class="users-view">
    <a-card title="Пользователи" :bordered="false">
      <template #extra>
        <a-space>
          <a-button v-if="canLinkUsers" @click="openLinkModal">
            <LinkOutlined />
            Привязать к клиенту
          </a-button>
          <a-button type="primary" @click="openCreateModal">
            <PlusOutlined />
            Добавить пользователя
          </a-button>
        </a-space>
      </template>

      <a-tabs v-model:activeKey="catalogTab" class="catalog-tabs">
        <a-tab-pane key="administrators" tab="Администраторы" />
        <a-tab-pane key="brokers" tab="Брокеры" />
        <a-tab-pane key="clients" tab="Клиенты" />
        <a-tab-pane key="expeditors" tab="Экспедиторы" />
      </a-tabs>

      <a-table
        :columns="tableColumns"
        :data-source="tableRows"
        :loading="usersStore.loading"
        :pagination="false"
        :row-key="(record: CatalogTableRow) => record.id"
        :scroll="{ x: 960 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'role'">
            <a-tag color="blue">{{ formatRole(record.role) }}</a-tag>
          </template>
          <template v-else-if="column.key === 'brokers'">
            <span class="relations-cell">{{ formatLinkedPeople('brokers' in record ? record.brokers : undefined) }}</span>
          </template>
          <template v-else-if="column.key === 'expeditors'">
            <span class="relations-cell">{{ formatLinkedPeople('expeditors' in record ? record.expeditors : undefined) }}</span>
          </template>
          <template v-else-if="column.key === 'clients'">
            <span class="relations-cell">{{ formatLinkedPeople('clients' in record ? record.clients : undefined) }}</span>
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-space>
              <a-button
                v-if="catalogTab === 'brokers' && canEditBroker"
                type="link"
                size="small"
                @click="openEditBroker(record as CatalogBrokerRow)"
              >
                <EditOutlined />
                Изменить
              </a-button>
              <a-popconfirm
                v-if="canDeleteUser(record)"
                title="Удалить этого пользователя?"
                ok-text="Да"
                cancel-text="Нет"
                @confirm="handleDelete(record)"
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
      title="Новый пользователь"
      ok-text="Создать"
      cancel-text="Отмена"
      :confirm-loading="saving"
      @ok="handleCreate"
      @cancel="handleCancel"
    >
      <a-form layout="vertical">
        <a-form-item label="Логин">
          <a-input v-model:value="form.username" placeholder="Введите логин" />
        </a-form-item>
        <a-form-item label="Пароль">
          <a-input-password v-model:value="form.password" placeholder="Введите пароль" />
        </a-form-item>
        <a-form-item label="Роль">
          <a-select
            v-model:value="form.role"
            placeholder="Выберите роль"
            :options="roleOptions"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="editBrokerModalOpen"
      title="Редактирование брокера"
      ok-text="Сохранить"
      cancel-text="Отмена"
      :confirm-loading="editBrokerSaving"
      @ok="handleEditBrokerSave"
      @cancel="closeEditBrokerModal"
    >
      <a-form layout="vertical">
        <a-form-item label="Логин">
          <a-input v-model:value="editBrokerForm.username" placeholder="Логин" />
        </a-form-item>
        <a-form-item label="Клиенты">
          <a-select
            v-model:value="editBrokerForm.clientIds"
            mode="multiple"
            placeholder="Клиенты брокера (пусто — отвязать всех)"
            :options="clientLinkOptions"
            show-search
            option-filter-prop="label"
            allow-clear
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="linkModalOpen"
      title="Привязка брокера или экспедитора к клиенту"
      ok-text="Привязать"
      cancel-text="Отмена"
      :confirm-loading="linkSaving"
      @ok="handleLink"
      @cancel="closeLinkModal"
    >
      <a-form layout="vertical">
        <a-form-item label="Брокер или экспедитор" required>
          <a-select
            v-model:value="linkForm.staffUserId"
            placeholder="Выберите пользователя"
            :options="staffLinkOptions"
            show-search
            option-filter-prop="label"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="Клиент" required>
          <a-select
            v-model:value="linkForm.clientUserId"
            placeholder="Выберите клиента"
            :options="clientLinkOptions"
            show-search
            option-filter-prop="label"
            allow-clear
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
import { useAuthStore } from '@/stores/auth'
import type {
  CatalogBrokerRow,
  CatalogLinkedPerson,
  CatalogTabKey,
  CatalogTableRow,
} from '@/types/api'
import { formatRole } from '@/utils/labels'
import { DeleteOutlined, EditOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'

const usersStore = useUsersStore()
const rolesStore = useRolesStore()
const authStore = useAuthStore()

const catalogTab = ref<CatalogTabKey>('administrators')

const modalOpen = ref(false)
const saving = ref(false)
const linkModalOpen = ref(false)
const linkSaving = ref(false)
const form = reactive({
  username: '',
  password: '',
  role: '',
})

const linkForm = reactive({
  staffUserId: undefined as string | undefined,
  clientUserId: undefined as string | undefined,
})

const formatLinkedPeople = (list: CatalogLinkedPerson[] | undefined) => {
  if (!list?.length) {
    return '—'
  }
  return list.map((p) => `${p.username} (${formatRole(p.role)})`).join(', ')
}

const canLinkUsers = computed(() => authStore.hasPermission('clients.manage'))
const canEditBroker = computed(() => authStore.hasPermission('clients.manage'))

const staffLinkOptions = computed(() => {
  const brokerOpts = usersStore.brokers.map((u) => ({
    label: `${u.username} (${formatRole(u.role)})`,
    value: u.id,
  }))
  const expOpts = usersStore.expeditors.map((u) => ({
    label: `${u.username} (${formatRole(u.role)})`,
    value: u.id,
  }))
  return [...brokerOpts, ...expOpts]
})

const clientLinkOptions = computed(() =>
  usersStore.clients.map((u) => ({
    label: u.username,
    value: u.id,
  })),
)

const editBrokerModalOpen = ref(false)
const editBrokerSaving = ref(false)
const editingBrokerOriginalUsername = ref('')
const editingBrokerId = ref<string | null>(null)
const editBrokerForm = reactive({
  username: '',
  clientIds: [] as string[],
})

const tableRows = computed((): CatalogTableRow[] => {
  switch (catalogTab.value) {
    case 'administrators':
      return usersStore.administrators
    case 'brokers':
      return usersStore.brokers
    case 'clients':
      return usersStore.clients
    case 'expeditors':
      return usersStore.expeditors
    default:
      return []
  }
})

const tableColumns = computed(() => {
  const showActionsColumn =
    authStore.hasPermission('users.delete') ||
    (catalogTab.value === 'brokers' && canEditBroker.value)

  const actionsColumn = showActionsColumn
    ? [
        {
          title: 'Действия',
          key: 'actions',
          width: catalogTab.value === 'brokers' && canEditBroker.value ? 200 : 120,
        },
      ]
    : []

  const usernameColumn = {
    title: 'Логин',
    dataIndex: 'username',
    key: 'username',
    width: 200,
  }

  switch (catalogTab.value) {
    case 'administrators':
      return [
        usernameColumn,
        { title: 'Роль', key: 'role', width: 140 },
        ...actionsColumn,
      ]
    case 'brokers':
      return [
        usernameColumn,
        { title: 'Клиенты', key: 'clients', ellipsis: true },
        ...actionsColumn,
      ]
    case 'clients':
      return [
        usernameColumn,
        { title: 'Брокеры', key: 'brokers', ellipsis: true },
        { title: 'Экспедиторы', key: 'expeditors', ellipsis: true },
        ...actionsColumn,
      ]
    case 'expeditors':
      return [
        usernameColumn,
        { title: 'Клиенты', key: 'clients', ellipsis: true },
        ...actionsColumn,
      ]
    default:
      return [usernameColumn, ...actionsColumn]
  }
})

const canDeleteUser = (record: CatalogTableRow) => {
  if (!authStore.hasPermission('users.delete')) {
    return false
  }
  if (authStore.username && record.username === authStore.username) {
    return false
  }
  return true
}

const roleOptions = computed(() =>
  rolesStore.roles.map((role) => ({
    label: `${formatRole(role.name)} (${role.name})`,
    value: role.name,
  })),
)

onMounted(async () => {
  await Promise.all([usersStore.fetchCatalogs(), rolesStore.fetchRoles()])
})

const openCreateModal = () => {
  form.username = ''
  form.password = ''
  form.role = rolesStore.roles[0]?.name || ''
  modalOpen.value = true
}

const openLinkModal = () => {
  linkForm.staffUserId = undefined
  linkForm.clientUserId = undefined
  linkModalOpen.value = true
}

const closeLinkModal = () => {
  linkModalOpen.value = false
}

const handleLink = async () => {
  if (!linkForm.staffUserId || !linkForm.clientUserId) {
    message.error('Выберите брокера/экспедитора и клиента')
    return
  }
  if (linkForm.staffUserId === linkForm.clientUserId) {
    message.error('Нужны два разных пользователя')
    return
  }
  linkSaving.value = true
  try {
    const ok = await usersStore.linkUsers({
      staffUserId: linkForm.staffUserId,
      clientUserId: linkForm.clientUserId,
    })
    if (ok) {
      closeLinkModal()
    }
  } finally {
    linkSaving.value = false
  }
}

const handleCreate = async () => {
  if (!form.username.trim() || !form.password || !form.role) {
    message.error('Заполните логин, пароль и роль')
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

const handleDelete = async (record: CatalogTableRow) => {
  await usersStore.deleteUser(record.id)
}

const openEditBroker = (record: CatalogBrokerRow) => {
  editingBrokerId.value = record.id
  editingBrokerOriginalUsername.value = record.username
  editBrokerForm.username = record.username
  editBrokerForm.clientIds = record.clients.map((c) => c.id)
  editBrokerModalOpen.value = true
}

const closeEditBrokerModal = () => {
  editBrokerModalOpen.value = false
}

const handleEditBrokerSave = async () => {
  if (!editingBrokerId.value) {
    return
  }
  editBrokerSaving.value = true
  try {
    const trimmed = editBrokerForm.username.trim()
    const username =
      trimmed === editingBrokerOriginalUsername.value ? null : trimmed || null
    const ok = await usersStore.editBroker(editingBrokerId.value, {
      username,
      clientIds: [...(editBrokerForm.clientIds ?? [])],
    })
    if (ok) {
      closeEditBrokerModal()
    }
  } finally {
    editBrokerSaving.value = false
  }
}
</script>

<style scoped>
.users-view {
  max-width: 1400px;
  margin: 0 auto;
}

.catalog-tabs {
  margin-bottom: 16px;
}

.relations-cell {
  font-size: 13px;
  color: rgba(0, 0, 0, 0.75);
}
</style>
