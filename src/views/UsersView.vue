<template>
  <div class="users-view crm-page">
    <PageHeader
      :kicker="t('admin.komandaIDostupy')"
      :title="t('admin.polzovateli')"
      :subtitle="t('admin.upravlenieAdministratoramiBrokeramiKlientami')"
    >
      <template #actions>
        <a-button v-if="canLinkUsers" @click="openLinkModal">
          <LinkOutlined /> {{ t('admin.privyazatKKlientu') }} </a-button>
        <a-button type="primary" @click="openCreateModal">
          <PlusOutlined /> {{ t('admin.dobavitPolzovatelya') }} </a-button>
      </template>
    </PageHeader>

    <a-card class="crm-shell-card" :bordered="false">
      <a-tabs v-model:activeKey="catalogTab" class="catalog-tabs">
        <!-- Сотрудники — одна вкладка: брокер-декларант, транзит, продажи, бухгалтер… (тип аккаунта не важен, важны роли) -->
        <a-tab-pane key="administrators" :tab="t('admin.administratory')" />
        <a-tab-pane key="staff" :tab="t('admin.sotrudniki')" />
        <a-tab-pane key="clients" :tab="t('admin.klienty')" />
        <a-tab-pane key="expeditors" :tab="t('admin.ekspeditory')" />
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
          <template v-else-if="column.key === 'businessRole'">
            <!-- Мультироли: все роли сотрудника тегами (из user_business_roles), иначе роль аккаунта -->
            <span class="roles-cell">
              <span v-for="r in rolesOf(record)" :key="r" class="role-tag">{{ formatBusinessRole(r) }}</span>
            </span>
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
          <template v-else-if="column.key === 'poa'">
            <!-- Представитель по доверенности клиентов: ФИО/ИИН/удостоверение берутся из профиля декларанта -->
            <a-tooltip :title="poaTooltip(record.id)">
              <a-switch size="small" :checked="poaMap[record.id]?.enabled ?? false" :disabled="!canAssignRole" @change="(v: boolean) => togglePoa(record.id, v)" />
            </a-tooltip>
            <a-tag v-if="poaMap[record.id]?.enabled && !poaMap[record.id]?.complete" color="warning" style="margin-left: 6px">{{ t('admin.profilNeZapolnen') }}</a-tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-space>
              <a-button
                v-if="canChangeBusinessRole && ['staff', 'administrators'].includes(catalogTab)"
                type="link"
                size="small"
                @click="openBusinessRoleModal(record)"
              > {{ t('admin.roli') }} </a-button>
              <a-button
                v-if="catalogTab === 'staff' && canEditBroker && (record.role === 'broker' || (rolesOf(record).includes('mpp') && 'clients' in record))"
                type="link"
                size="small"
                @click="openEditBroker(record as CatalogBrokerRow | CatalogImporterRow)"
              >
                <EditOutlined /> {{ t('admin.izmenit') }} </a-button>
              <a-button
                v-if="catalogTab === 'expeditors' && canEditExpeditor"
                type="link"
                size="small"
                @click="openEditExpeditor(record as CatalogExpeditorRow)"
              >
                <EditOutlined /> {{ t('admin.izmenit') }} </a-button>
              <!-- Аудит 2026-09-28 п.7: «Роль» звучало как бизнес-роль (рядом уже есть кнопка
                   «Роли»), хотя меняет системный тип аккаунта — переименовано и убрано в «Ещё»,
                   чтобы не плодить кнопки в строке. -->
              <a-dropdown v-if="canAssignRole">
                <a-button type="link" size="small">
                  <MoreOutlined /> {{ t('admin.eshche') }} </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item key="accountType" @click="openChangeRole(record)"><SwapOutlined /> {{ t('admin.tipAkkaunta') }}</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
              <a-popconfirm
                v-if="isAdmin"
                :title="t('admin.sbrositParolStaryyPerestanet')"
                :ok-text="t('admin.sbrosit')"
                :cancel-text="t('admin.net')"
                @confirm="resetPassword(record)"
              >
                <a-button type="link" size="small"><KeyOutlined /> {{ t('admin.parol') }}</a-button>
              </a-popconfirm>
              <a-popconfirm
                v-if="canDeleteUser(record)"
                :title="t('admin.udalitEtogoPolzovatelya')"
                :ok-text="t('admin.da')"
                :cancel-text="t('admin.net')"
                @confirm="handleDelete(record)"
              >
                <a-button type="link" danger size="small">
                  <DeleteOutlined /> {{ t('admin.udalit') }} </a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <a-modal v-model:open="resetOpen" :title="t('admin.vremennyyParol')" :footer="null">
      <p>{{ t('admin.polzovatel') }} <b>{{ resetResult?.username }}</b>{{ t('admin.peredayteParolLichnoPovtorno') }}</p>
      <a-input-group compact>
        <a-input :value="resetResult?.temporaryPassword" readonly style="width: calc(100% - 130px); font-family: monospace" />
        <a-button type="primary" @click="copyTemp">{{ t('admin.skopirovat') }}</a-button>
      </a-input-group>
    </a-modal>

    <a-modal
      v-model:open="modalOpen"
      :title="t('admin.novyyPolzovatel')"
      :ok-text="t('admin.sozdat')"
      :cancel-text="t('admin.otmena')"
      :confirm-loading="saving"
      @ok="handleCreate"
      @cancel="handleCancel"
    >
      <a-form layout="vertical">
        <a-form-item :label="t('admin.login')">
          <a-input v-model:value="form.username" :placeholder="t('admin.vvediteLogin')" />
        </a-form-item>
        <a-form-item :label="t('admin.parol')">
          <a-input-password v-model:value="form.password" :placeholder="t('admin.vvediteParol')" />
        </a-form-item>
        <a-form-item v-if="catalogTab !== 'staff'" :label="t('admin.rol')">
          <a-select
            v-model:value="form.role"
            :placeholder="t('admin.vyberiteRol')"
            :options="roleOptions"
          />
        </a-form-item>
        <a-form-item v-if="showBusinessRoleField" :label="t('admin.biznesRolOstalnyeMozhno')">
          <a-select
            v-model:value="form.businessRole"
            :placeholder="t('admin.vyberiteBiznesRol')"
            :options="businessRoleOptions"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="businessRoleModalOpen"
      :title="t('admin.biznesRoliSotrudnika')"
      :ok-text="t('admin.sohranit')"
      :cancel-text="t('admin.otmena')"
      :confirm-loading="businessRoleSaving"
      @ok="handleBusinessRoleSave"
      @cancel="businessRoleModalOpen = false"
    >
      <a-form layout="vertical">
        <a-form-item :label="`${t('admin.polzovatel')}: ${businessRoleForm.username}`">
          <a-select
            v-model:value="businessRoleForm.roles"
            mode="multiple"
            :placeholder="t('admin.vyberiteOdnuIliNeskolko')"
            :options="staffRoleOptions"
            :loading="staffRolesLoading"
          />
        </a-form-item>
        <p class="modal-hint">{{ t('admin.pravaSkladyvayutsyaIzVseh') }}</p>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="editBrokerModalOpen"
      :title="editingIsBroker ? t('admin.redaktirovanieBrokera') : t('admin.privyazkaKKlientam')"
      :ok-text="t('admin.sohranit')"
      :cancel-text="t('admin.otmena')"
      :confirm-loading="editBrokerSaving"
      @ok="handleEditBrokerSave"
      @cancel="closeEditBrokerModal"
    >
      <a-form layout="vertical">
        <a-form-item v-if="editingIsBroker" :label="t('admin.login')">
          <a-input v-model:value="editBrokerForm.username" :placeholder="t('admin.login')" />
        </a-form-item>
        <a-form-item :label="t('admin.klienty')">
          <a-select
            v-model:value="editBrokerForm.clientIds"
            mode="multiple"
            :placeholder="t('admin.klientyBrokeraPustoOtvyazat')"
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
      :title="t('admin.redaktirovanieEkspeditora')"
      :ok-text="t('admin.sohranit')"
      :cancel-text="t('admin.otmena')"
      :confirm-loading="editExpeditorSaving"
      @ok="handleEditExpeditorSave"
      @cancel="closeEditExpeditorModal"
    >
      <a-form layout="vertical">
        <a-form-item :label="t('admin.login')">
          <a-input v-model:value="editExpeditorForm.username" :placeholder="t('admin.login')" />
        </a-form-item>
        <a-form-item :label="t('admin.klienty')">
          <a-select
            v-model:value="editExpeditorForm.clientIds"
            mode="multiple"
            :placeholder="t('admin.klientyEkspeditoraPustoOtvyazat')"
            :options="clientLinkOptions"
            show-search
            option-filter-prop="label"
            allow-clear
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="changeRoleModalOpen"
      :title="t('admin.izmenitTipAkkauntaPolzovatelya')"
      :ok-text="t('admin.sohranit')"
      :cancel-text="t('admin.otmena')"
      :confirm-loading="changeRoleSaving"
      @ok="handleChangeRoleSave"
      @cancel="changeRoleModalOpen = false"
    >
      <a-form layout="vertical">
        <a-form-item :label="t('admin.polzovatel')">
          <a-input :value="changeRoleForm.username" disabled />
        </a-form-item>
        <a-form-item :label="t('admin.novyyTipAkkaunta')">
          <a-select
            v-model:value="changeRoleForm.role"
            :placeholder="t('admin.vyberiteRol')"
            :options="roleOptions"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="linkModalOpen"
      :title="t('admin.privyazkaBrokeraIliEkspeditora')"
      :ok-text="t('admin.privyazat')"
      :cancel-text="t('admin.otmena')"
      :confirm-loading="linkSaving"
      @ok="handleLink"
      @cancel="closeLinkModal"
    >
      <a-form layout="vertical">
        <a-form-item :label="t('admin.brokerIliEkspeditor')" required>
          <a-select
            v-model:value="linkForm.staffUserId"
            :placeholder="t('admin.vyberitePolzovatelya')"
            :options="staffLinkOptions"
            show-search
            option-filter-prop="label"
            allow-clear
          />
        </a-form-item>
        <a-form-item :label="t('admin.klient')" required>
          <a-select
            v-model:value="linkForm.clientUserId"
            :placeholder="t('admin.vyberiteKlienta')"
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
import { useI18n } from 'vue-i18n'
import { computed, onMounted, reactive, ref } from 'vue'
import { useUsersStore } from '@/stores/users'
import { useRolesStore } from '@/stores/roles'
import { useAuthStore } from '@/stores/auth'
import type {
  CatalogBrokerRow,
  CatalogExpeditorRow,
  CatalogImporterRow,
  CatalogLinkedPerson,
  CatalogTabKey,
  CatalogTableRow,
} from '@/types/api'
import { formatRole } from '@/utils/labels'
import { DeleteOutlined, EditOutlined, LinkOutlined, PlusOutlined, SwapOutlined, KeyOutlined, MoreOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'
import { permissionsApi, businessRoleLabel } from '@/api/permissions'
import { usersApi } from '@/api/users'

const { t } = useI18n()

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
  businessRole: '',
})

// Роли при создании сотрудника — тот же каталог, что и в модалке ролей.
const businessRoleOptions = computed(() => staffRoleOptions.value)

const formatBusinessRole = (value: string) => (value ? businessRoleLabel(value) : '—')
const rolesOf = (record: CatalogTableRow): string[] => {
  const many = 'businessRoles' in record ? (record as { businessRoles?: string[] }).businessRoles : undefined
  if (many && many.length) return many
  const one = 'businessRole' in record ? (record as { businessRole?: string }).businessRole : ''
  return one ? [one] : []
}

// Каталог бизнес-ролей сотрудника — с бэка (единый источник: AppBusinessRoles.Staff).
const staffRoleOptions = ref<{ label: string; value: string }[]>([])
const staffRolesLoading = ref(false)
const loadStaffRoles = async () => {
  if (staffRoleOptions.value.length) return
  staffRolesLoading.value = true
  try {
    const items = await permissionsApi.catalog()
    staffRoleOptions.value = items.map((r) => ({ value: r.code, label: `${r.label} · ${r.scope}` }))
  } finally {
    staffRolesLoading.value = false
  }
}

// Администратору бизнес-роль не нужна — у него все права всегда, поле только путает
// при создании (аудит 2026-09-28, раздел 10).
const showBusinessRoleField = computed(() => ['broker', 'importer', 'sales'].includes(form.role))

const canChangeBusinessRole = computed(() => authStore.hasPermission('users.write'))

const businessRoleModalOpen = ref(false)
const businessRoleSaving = ref(false)
const businessRoleForm = reactive({
  userId: '',
  username: '',
  roles: [] as string[],
})

const openBusinessRoleModal = async (record: CatalogTableRow) => {
  businessRoleForm.userId = record.id
  businessRoleForm.username = record.username
  businessRoleForm.roles = []
  businessRoleModalOpen.value = true
  void loadStaffRoles()
  try {
    businessRoleForm.roles = await permissionsApi.userRoles(record.id)
  } catch {
    businessRoleForm.roles = 'businessRole' in record && record.businessRole ? [record.businessRole.toLowerCase()] : []
  }
}

const handleBusinessRoleSave = async () => {
  if (!businessRoleForm.roles.length) {
    message.error(t('admin.vyberiteHotyaByOdnu'))
    return
  }
  businessRoleSaving.value = true
  try {
    await permissionsApi.setUserRoles(businessRoleForm.userId, businessRoleForm.roles)
    message.success(t('admin.roliSohranenySotrudnikuNuzhno'))
    businessRoleModalOpen.value = false
    await usersStore.fetchCatalogs()
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
  } finally {
    businessRoleSaving.value = false
  }
}

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
const canAssignRole = computed(() => authStore.hasPermission('users.assign_role'))
const isAdmin = computed(() => (authStore.role || '').toLowerCase() === 'administrator')

// Сброс пароля админом (почты нет — «забыли пароль» иначе не решается).
const resetOpen = ref(false)
const resetResult = ref<{ username: string; temporaryPassword: string } | null>(null)
const resetPassword = async (record: { id: string }) => {
  try {
    resetResult.value = await usersApi.resetPassword(record.id)
    resetOpen.value = true
  } catch { message.error(t('admin.neUdalosSbrositParol')) }
}
const copyTemp = async () => {
  try { await navigator.clipboard.writeText(resetResult.value?.temporaryPassword ?? ''); message.success(t('admin.skopirovano')) } catch { /* нет доступа к буферу */ }
}

// Представители по доверенности (кого клиент уполномочивает в доверенности) — переключатель админа.
const poaMap = ref<Record<string, { enabled: boolean; complete: boolean }>>({})
const loadPoa = async () => {
  try {
    const rows = await permissionsApi.poaRepresentatives()
    poaMap.value = Object.fromEntries(rows.map((r) => [r.userId, { enabled: r.enabled, complete: r.complete }]))
  } catch { /* колонка необязательная */ }
}
const poaTooltip = (id: string) =>
  poaMap.value[id]?.enabled
    ? (poaMap.value[id]?.complete ? t('admin.vklyuchenVDoverennostiKlientov') : t('admin.vklyuchenNoVProfile'))
    : t('admin.vklyuchitSotrudnikaVDoverennosti')
const togglePoa = async (id: string, enabled: boolean) => {
  try {
    await permissionsApi.setPoaRepresentative(id, enabled)
    await loadPoa()
    message.success(enabled ? t('admin.sotrudnikDobavlenVDoverennost') : t('admin.sotrudnikUbranIzDoverennosti'))
  } catch { message.error(t('admin.neUdalosIzmenit')) }
}

const staffLinkOptions = computed(() => {
  const brokerOpts = usersStore.brokers.map((u) => ({
    label: `${u.username} (${formatRole(u.role)})`,
    value: u.id,
  }))
  const expOpts = usersStore.expeditors.map((u) => ({
    label: `${u.username} (${formatRole(u.role)})`,
    value: u.id,
  }))
  // Волна 5 (аудит §4.3): мпп, заведённый не в таблице Broker (importer/salesperson), тоже
  // должен появляться в списке для привязки к клиенту реестра транзита.
  const mppImporterOpts = usersStore.importers
    .filter((u) => rolesOf(u).includes('mpp'))
    .map((u) => ({ label: `${u.username} (${businessRoleLabel('mpp')})`, value: u.id }))
  const mppSalesOpts = usersStore.salespersons
    .filter((u) => rolesOf(u).includes('mpp'))
    .map((u) => ({ label: `${u.username} (${businessRoleLabel('mpp')})`, value: u.id }))
  return [...brokerOpts, ...expOpts, ...mppImporterOpts, ...mppSalesOpts]
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
// Модалка общая: для роли broker — логин + клиенты (usersStore.editBroker), для остальных
// сотрудников с бизнес-ролью mpp (importer/salesperson) — только клиенты (editStaffClients).
const editingIsBroker = ref(true)
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

const changeRoleModalOpen = ref(false)
const changeRoleSaving = ref(false)
const changeRoleTargetId = ref<string | null>(null)
const changeRoleForm = reactive({
  username: '',
  role: '',
})

const systemRoleOrder = ['client', 'broker', 'expeditor', 'importer', 'sales', 'administrator']

const defaultRoleByTab: Record<CatalogTabKey, string> = {
  administrators: 'administrator',
  staff: 'importer', // сотрудник: тип аккаунта технический, роли задаются бизнес-ролями
  brokers: 'broker',
  clients: 'client',
  expeditors: 'expeditor',
  importers: 'importer',
  salespersons: 'sales',
}

const tableRows = computed((): CatalogTableRow[] => {
  switch (catalogTab.value) {
    case 'administrators':
      return usersStore.administrators
    case 'staff':
      return [...usersStore.brokers, ...usersStore.importers, ...usersStore.salespersons]
        .sort((a, b) => a.username.localeCompare(b.username, 'ru'))
    case 'brokers':
      return usersStore.brokers
    case 'clients':
      return usersStore.clients
    case 'expeditors':
      return usersStore.expeditors
    case 'importers':
      return usersStore.importers
    case 'salespersons':
      return usersStore.salespersons
    default:
      return []
  }
})

const tableColumns = computed(() => {
  const showActionsColumn =
    authStore.hasPermission('users.delete') ||
    (catalogTab.value === 'staff' && canEditBroker.value) ||
    (catalogTab.value === 'expeditors' && canEditExpeditor.value) ||
    (canChangeBusinessRole.value && ['administrators', 'staff'].includes(catalogTab.value))

  const actionsColumn = showActionsColumn
    ? [
        {
          title: t('admin.deystviya'),
          key: 'actions',
          width:
            (catalogTab.value === 'staff' && canEditBroker.value) ||
            (catalogTab.value === 'expeditors' && canEditExpeditor.value)
              ? 200
              : 120,
        },
      ]
    : []

  const usernameColumn = {
    title: t('admin.login'),
    dataIndex: 'username',
    key: 'username',
    width: 200,
  }

  switch (catalogTab.value) {
    case 'administrators':
      return [
        usernameColumn,
        { title: t('admin.rol'), key: 'role', width: 140 },
        { title: t('admin.biznesRoli'), key: 'businessRole', width: 140 },
        // Администратор тоже может быть привязан к клиентам транзита через staff_client_links
        // (аудит 2026-09-28, раздел 10) — у большинства строка будет пустой, это нормально.
        { title: t('admin.klientyTranzit'), key: 'clients', ellipsis: true },
        ...actionsColumn,
      ]
    case 'staff':
    case 'brokers':
      return [
        usernameColumn,
        { title: t('admin.biznesRoli'), key: 'businessRole', width: 260 },
        { title: t('admin.klientyTranzit'), key: 'clients', ellipsis: true },
        ...(catalogTab.value === 'staff' ? [{ title: t('admin.vDoverennosti'), key: 'poa', width: 150 }] : []),
        ...actionsColumn,
      ]
    case 'clients':
      return [
        usernameColumn,
        { title: t('admin.brokery'), key: 'brokers', ellipsis: true },
        { title: t('admin.ekspeditory'), key: 'expeditors', ellipsis: true },
        ...actionsColumn,
      ]
    case 'expeditors':
      return [
        usernameColumn,
        { title: t('admin.klienty'), key: 'clients', ellipsis: true },
        ...actionsColumn,
      ]
    case 'importers':
    case 'salespersons':
      return [
        usernameColumn,
        { title: t('admin.rol'), key: 'role', width: 140 },
        { title: t('admin.biznesRoli'), key: 'businessRole', width: 160 },
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

// Аудит 2026-09-28 п.7: селект показывал технический код в скобках («Импорт (importer)») —
// оставляем только человекочитаемую подпись.
const roleOptions = computed(() =>
  rolesStore.roles
    .filter((role) => systemRoleOrder.includes(role.name))
    .sort((a, b) => systemRoleOrder.indexOf(a.name) - systemRoleOrder.indexOf(b.name))
    .map((role) => ({
      label: formatRole(role.name),
      value: role.name,
    })),
)

onMounted(async () => {
  await Promise.all([usersStore.fetchCatalogs(), rolesStore.fetchRoles(), loadStaffRoles(), loadPoa()])
})

const openCreateModal = () => {
  form.username = ''
  form.password = ''
  form.role = defaultRoleByTab[catalogTab.value]
  form.businessRole = ''
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
    message.error(t('admin.vyberiteBrokeraEkspeditoraI'))
    return
  }
  if (linkForm.staffUserId === linkForm.clientUserId) {
    message.error(t('admin.nuzhnyDvaRaznyhPolzovatelya'))
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
    message.error(t('admin.zapolniteLoginParolI'))
    return
  }
  // Аудит §4.7: на вкладке «Сотрудники» бизнес-роль обязательна — иначе сотрудник молча
  // становился декларантом (AppBusinessRoles.DefaultForSystemRole), хотя мог быть, например, мпп.
  if (catalogTab.value === 'staff' && !form.businessRole) {
    message.error(t('admin.vyberiteBiznesRol'))
    return
  }

  saving.value = true
  try {
    // Системный тип аккаунта сотрудника по бизнес-роли: mpp работает с реестром транзита
    // через таблицу Broker (готовая инфраструктура привязок к клиентам); остальные — importer.
    const role =
      catalogTab.value === 'staff' && form.businessRole === 'mpp' ? 'broker' : form.role
    const success = await usersStore.createUser({
      username: form.username.trim(),
      password: form.password,
      role,
      businessRole: showBusinessRoleField.value && form.businessRole ? form.businessRole : undefined,
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

const openEditBroker = (record: CatalogBrokerRow | CatalogImporterRow) => {
  editingIsBroker.value = record.role === 'broker'
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
    if (editingIsBroker.value) {
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
    } else {
      const ok = await usersStore.editStaffClients(editingBrokerId.value, {
        clientIds: [...(editBrokerForm.clientIds ?? [])],
      })
      if (ok) {
        closeEditBrokerModal()
      }
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

const openChangeRole = (record: CatalogTableRow) => {
  changeRoleTargetId.value = record.id
  changeRoleForm.username = record.username
  changeRoleForm.role = record.role
  changeRoleModalOpen.value = true
}

const handleChangeRoleSave = async () => {
  if (!changeRoleTargetId.value || !changeRoleForm.role) {
    message.error(t('admin.vyberiteRol'))
    return
  }
  changeRoleSaving.value = true
  try {
    await usersStore.changeUserRole(changeRoleTargetId.value, changeRoleForm.role)
    message.success(t('admin.rolIzmenena'))
    changeRoleModalOpen.value = false
    await usersStore.fetchCatalogs()
  } catch {
    // error handled in store/api
  } finally {
    changeRoleSaving.value = false
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
.roles-cell { display: inline-flex; gap: 6px; flex-wrap: wrap; }
</style>
