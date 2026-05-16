<template>
  <div class="users-view crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Команда и доступы</div>
        <h1 class="crm-page-title">Пользователи</h1>
        <p class="crm-page-subtitle">
          Управление администраторами, брокерами, клиентами и экспедиторами с привязкой к клиентскому портфелю.
        </p>
      </div>
      <div class="crm-page-actions">
          <a-button v-if="canLinkUsers" @click="openLinkModal">
            <LinkOutlined />
            Привязать к клиенту
          </a-button>
          <a-button type="primary" @click="openCreateModal">
            <PlusOutlined />
            Добавить пользователя
          </a-button>
      </div>
    </div>

    <a-card class="crm-shell-card" :bordered="false">
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
            <span class="role-tag" :class="`role-tag--${record.role}`">{{ formatRole(record.role) }}</span>
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
              <a-button
                v-if="catalogTab === 'expeditors' && canEditExpeditor"
                type="link"
                size="small"
                @click="openEditExpeditor(record as CatalogExpeditorRow)"
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
      v-model:open="editExpeditorModalOpen"
      title="Редактирование экспедитора"
      ok-text="Сохранить"
      cancel-text="Отмена"
      :confirm-loading="editExpeditorSaving"
      @ok="handleEditExpeditorSave"
      @cancel="closeEditExpeditorModal"
    >
      <a-form layout="vertical">
        <a-form-item label="Логин">
          <a-input v-model:value="editExpeditorForm.username" placeholder="Логин" />
        </a-form-item>
        <a-form-item label="Клиенты">
          <a-select
            v-model:value="editExpeditorForm.clientIds"
            mode="multiple"
            placeholder="Клиенты экспедитора (пусто — отвязать всех)"
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
  CatalogExpeditorRow,
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
const canEditExpeditor = computed(() => authStore.hasPermission('clients.manage'))

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

const editExpeditorModalOpen = ref(false)
const editExpeditorSaving = ref(false)
const editingExpeditorOriginalUsername = ref('')
const editingExpeditorId = ref<string | null>(null)
const editExpeditorForm = reactive({
  username: '',
  clientIds: [] as string[],
})

const systemRoleOrder = ['client', 'broker', 'expeditor', 'administrator']

const defaultRoleByTab: Record<CatalogTabKey, string> = {
  administrators: 'administrator',
  brokers: 'broker',
  clients: 'client',
  expeditors: 'expeditor',
}

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
    (catalogTab.value === 'brokers' && canEditBroker.value) ||
    (catalogTab.value === 'expeditors' && canEditExpeditor.value)

  const actionsColumn = showActionsColumn
    ? [
        {
          title: 'Действия',
          key: 'actions',
          width:
            (catalogTab.value === 'brokers' && canEditBroker.value) ||
            (catalogTab.value === 'expeditors' && canEditExpeditor.value)
              ? 200
              : 120,
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
  rolesStore.roles
    .filter((role) => systemRoleOrder.includes(role.name))
    .sort((a, b) => systemRoleOrder.indexOf(a.name) - systemRoleOrder.indexOf(b.name))
    .map((role) => ({
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
  form.role = defaultRoleByTab[catalogTab.value]
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

const openEditExpeditor = (record: CatalogExpeditorRow) => {
  editingExpeditorId.value = record.id
  editingExpeditorOriginalUsername.value = record.username
  editExpeditorForm.username = record.username
  editExpeditorForm.clientIds = record.clients.map((c) => c.id)
  editExpeditorModalOpen.value = true
}

const closeEditExpeditorModal = () => {
  editExpeditorModalOpen.value = false
}

const handleEditExpeditorSave = async () => {
  if (!editingExpeditorId.value) {
    return
  }
  editExpeditorSaving.value = true
  try {
    const trimmed = editExpeditorForm.username.trim()
    const username = trimmed || editingExpeditorOriginalUsername.value
    const ok = await usersStore.editExpeditor(editingExpeditorId.value, {
      username,
      clientsId: [...(editExpeditorForm.clientIds ?? [])],
    })
    if (ok) {
      closeEditExpeditorModal()
    }
  } finally {
    editExpeditorSaving.value = false
  }
}
</script>

<style scoped>
.users-view {
  margin: 0 auto;
}

.catalog-tabs {
  margin-bottom: 16px;
}

.relations-cell {
  font-size: 13px;
  color: var(--atg-muted);
}

.role-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  border: 1px solid transparent;
}

.role-tag--administrator {
  background: rgba(17, 20, 19, 0.08);
  border-color: rgba(17, 20, 19, 0.15);
  color: var(--atg-ink);
}

.role-tag--broker {
  background: rgba(37, 95, 143, 0.08);
  border-color: rgba(37, 95, 143, 0.2);
  color: var(--atg-blue);
}

.role-tag--expeditor {
  background: rgba(40, 107, 75, 0.08);
  border-color: rgba(40, 107, 75, 0.2);
  color: var(--atg-green);
}

.role-tag--client {
  background: var(--atg-accent-soft);
  border-color: rgba(200, 149, 53, 0.25);
  color: var(--atg-accent-strong);
}
</style>
