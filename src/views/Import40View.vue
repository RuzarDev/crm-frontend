<template>
  <div class="import40-page crm-page">
    <div class="crm-page-header">
      <div>
        <div class="crm-page-kicker">Рабочий модуль</div>
        <h1 class="crm-page-title">Импорт 40</h1>
        <p class="crm-page-subtitle">
          Прототип жизненного цикла ДТ: коммерческий блок, договор, транспорт,
          пост, декларирование, СВХ и закрытие.
        </p>
      </div>
      <div class="crm-page-actions">
        <a-button @click="router.push('/import-40')">
          Назад к списку
        </a-button>
        <a-button :loading="loading" @click="loadCases">
          <FileAddOutlined />
          Обновить
        </a-button>
        <span class="crm-stat-badge">
          <ImportOutlined />
          ДТ:&nbsp;<span class="crm-stat-badge-count">{{ cases.length }}</span>
        </span>
      </div>
    </div>

    <section class="import40-hero">
      <div>
        <span class="module-pill">ИМ 40</span>
        <h2>1 заявка = 1 декларация</h2>
        <p>
          Рабочая область процесса. Данные хранятся на сервере и доступны
          пользователям по их роли.
        </p>
      </div>
      <div class="hero-metrics">
        <div v-for="metric in metrics" :key="metric.label" class="metric-card">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </div>
      </div>
    </section>

    <section class="role-strip">
      <div>
        <span>Ваша роль в процессе</span>
        <strong>{{ roleLabel }}</strong>
      </div>
      <a-segmented v-model:value="roleMode" :options="roleModeOptions" disabled />
    </section>

    <section v-if="false" class="import40-workspace">
      <a-card class="crm-shell-card create-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <FileAddOutlined />
            Новая ДТ
          </div>
        </template>

        <div class="create-grid">
          <label>
            <span>Клиент</span>
            <a-select
              v-model:value="draft.clientId"
              show-search
              :options="clientOptions"
              :loading="clientsLoading"
              placeholder="Выберите клиента"
              @change="syncDraftClientName"
            />
          </label>
          <label>
            <span>Тип клиента</span>
            <a-select v-model:value="draft.clientType" :options="clientTypeOptions" />
          </label>
          <label>
            <span>Груз</span>
            <a-input v-model:value="draft.cargo" placeholder="Описание товара" />
          </label>
          <label>
            <span>Пост / СВХ</span>
            <a-input v-model:value="draft.post" placeholder="Таможенный пост" />
          </label>
          <label>
            <span>Менеджер</span>
            <a-select v-model:value="draft.manager" :options="employeeOptions" />
          </label>
          <a-button
            type="primary"
            class="create-btn"
            :disabled="!canCreate"
            @click="createCase"
          >
            <PlusOutlined />
            Создать заявку
          </a-button>
        </div>
      </a-card>

      <a-card class="crm-shell-card list-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <FolderOpenOutlined />
            Заявки Импорт 40
          </div>
        </template>

        <a-input v-model:value="search" allow-clear placeholder="Поиск по клиенту, ДТ, грузу">
          <template #prefix>
            <SearchOutlined />
          </template>
        </a-input>

        <a-table
          :columns="columns"
          :data-source="filteredCases"
          :pagination="filteredCases.length > 6 ? { pageSize: 6, showSizeChanger: false } : false"
          :scroll="{ x: 860 }"
          row-key="id"
          size="small"
          class="import-table"
          :row-class-name="rowClassName"
        >
          <template #emptyText>
            <a-empty description="Заявок пока нет" />
          </template>

          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'case'">
              <div class="case-cell">
                <strong>{{ record.client }}</strong>
                <span>{{ record.cargo }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'status'">
              <span class="status-chip">{{ currentStatus(record).short }}</span>
            </template>
            <template v-else-if="column.key === 'corridor'">
              <span class="corridor-chip" :class="`corridor-${record.corridor}`">
                {{ corridorLabel(record.corridor) }}
              </span>
            </template>
            <template v-else-if="column.key === 'progress'">
              <div class="progress-cell">
                <a-progress :percent="caseProgress(record)" :show-info="false" stroke-color="#2BBCD4" />
                <span>{{ caseProgress(record) }}%</span>
              </div>
            </template>
            <template v-else-if="column.key === 'action'">
              <a-button size="small" @click="router.push(`/import-40/${record.id}`)">Открыть</a-button>
            </template>
          </template>
        </a-table>
      </a-card>
    </section>

    <section v-if="activeCase" class="active-case">
      <div>
        <span class="module-pill">Активная ДТ</span>
        <h2>{{ activeCase.client }}</h2>
        <p>{{ activeCase.cargo }} · {{ activeCase.post }} · {{ activeCase.clientType }}</p>
      </div>
      <div class="active-controls">
        <label>
          <span>Текущий статус</span>
          <a-select :value="activeCase.status" :options="statusOptions" disabled />
        </label>
        <label>
          <span>Коридор</span>
          <a-select :value="activeCase.corridor" :options="corridorOptions" @change="setCorridor" />
        </label>
      </div>
    </section>

    <section v-if="activeCase" class="action-panel">
      <div>
        <span class="module-pill">Действия роли</span>
        <h3>{{ roleLabel }}</h3>
        <p>{{ roleHelpText }}</p>
      </div>
      <div class="quick-actions">
        <a-button
          v-for="action in visibleActions"
          :key="action.key"
          :disabled="action.disabled"
          @click="runAction(action.key)"
        >
          <component :is="action.icon" />
          {{ action.label }}
        </a-button>
      </div>
      <div v-if="validationWarnings.length" class="validation-box">
        <strong>Что мешает следующему этапу</strong>
        <ul>
          <li v-for="warning in validationWarnings" :key="warning">{{ warning }}</li>
        </ul>
      </div>
    </section>

    <section class="status-timeline">
      <button
        v-for="status in statuses"
        :key="status.id"
        class="status-step"
        :class="{ active: activeCase?.status === status.id, done: isStatusDone(status.id) }"
        type="button"
        :disabled="!activeCase"
        @click="setStatus(status.id)"
      >
        <span>{{ status.id }}</span>
        <strong>{{ status.short }}</strong>
        <small>{{ status.phase }}</small>
      </button>
    </section>

    <a-tabs v-if="activeCase" v-model:activeKey="activeTab" class="import-tabs" :items="visibleTabs" />

    <section v-if="activeCase" class="detail-grid">
      <a-card v-if="roleMode === 'legs' && activeTab === 'post'" class="crm-shell-card mobile-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <MobileOutlined />
            Мобильный режим “Ноги”
          </div>
        </template>

        <div class="mobile-actions">
          <a-button block @click="runAction('downloadPowerOfAttorney')">
            <DownloadOutlined />
            Скачать доверенность
          </a-button>
          <a-button block @click="runAction('photoControl')">
            <CameraOutlined />
            Фото контроля
          </a-button>
          <a-button block @click="runAction('uploadSvhInvoice')">
            <FileTextOutlined />
            Счет СВХ
          </a-button>
          <a-button block :disabled="activeCase.status < 9" @click="runAction('uploadClosedDeclaration')">
            <FileDoneOutlined />
            Закрытая ДТ
          </a-button>
        </div>
      </a-card>

      <a-card v-if="canSeeCommercial && activeTab === 'commercial'" class="crm-shell-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <CalculatorOutlined />
            Коммерческий блок
          </div>
        </template>

        <div class="form-grid">
          <label>
            <span>МПП</span>
            <a-select :value="activeCase.manager" :options="employeeOptions" @change="updateField('manager', $event)" />
          </label>
          <label>
            <span>Декларант</span>
            <a-select :value="activeCase.declarant" :options="employeeOptions" @change="updateField('declarant', $event)" />
          </label>
          <label>
            <span>Расчет стоимости</span>
            <a-input :value="activeCase.costCalculation" placeholder="Например: 850 000 KZT" @change="updateFromInput('costCalculation', $event)" />
          </label>
          <label>
            <span>Риск / комментарий</span>
            <a-input :value="activeCase.riskNote" placeholder="КТС, ГДУ, нетарифка..." @change="updateFromInput('riskNote', $event)" />
          </label>
        </div>
      </a-card>

      <a-card v-if="canSeeTransport && activeTab === 'post'" class="crm-shell-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <CarOutlined />
            Транспорт
          </div>
        </template>

        <div class="form-grid">
          <label>
            <span>Машина / прицеп</span>
            <a-input :value="activeCase.vehicleNumber" placeholder="A 123 BC / прицеп" @change="updateFromInput('vehicleNumber', $event)" />
          </label>
          <label>
            <span>Водитель</span>
            <a-input :value="activeCase.driverName" placeholder="ФИО" @change="updateFromInput('driverName', $event)" />
          </label>
          <label>
            <span>Телефон водителя</span>
            <a-input :value="activeCase.driverPhone" placeholder="+7 ___ ___ __ __" @change="updateFromInput('driverPhone', $event)" />
          </label>
          <label>
            <span>Вид транспорта</span>
            <a-select :value="activeCase.transportType" :options="transportOptions" @change="updateField('transportType', $event)" />
          </label>
        </div>
      </a-card>

      <a-card v-if="canSeeDocuments && activeTab === 'documents'" class="crm-shell-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <FileProtectOutlined />
            Документы и контроль
          </div>
        </template>

        <div class="document-grid">
          <label v-for="doc in documentTypes" :key="doc" class="doc-check">
            <a-checkbox :checked="activeCase.documents.includes(doc)" @change="toggleDocument(doc)" />
            <span>{{ doc }}</span>
          </label>
        </div>
      </a-card>

      <a-card v-if="canSeeFinance && activeTab === 'finance'" class="crm-shell-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <DollarOutlined />
            СВХ и финансы
          </div>
        </template>

        <div class="form-grid">
          <label>
            <span>Счет СВХ</span>
            <a-input :value="activeCase.svhInvoice" placeholder="№ счета / сумма" @change="updateFromInput('svhInvoice', $event)" />
          </label>
          <label>
            <span>Оплата клиента</span>
            <a-input :value="activeCase.paymentCheck" placeholder="Чек / дата оплаты" @change="updateFromInput('paymentCheck', $event)" />
          </label>
          <label>
            <span>Номер ДТ</span>
            <a-input :value="activeCase.declarationNumber" placeholder="После подачи" @change="updateFromInput('declarationNumber', $event)" />
          </label>
          <label>
            <span>Финальная ДТ</span>
            <a-input :value="activeCase.finalDeclarationFile" placeholder="Файл будет подключен через backend" @change="updateFromInput('finalDeclarationFile', $event)" />
          </label>
        </div>
      </a-card>
    </section>

    <a-card v-if="activeCase && activeTab === 'history'" class="crm-shell-card log-card" :bordered="false">
      <template #title>
        <div class="card-title">
          <HistoryOutlined />
          Лог заявки
        </div>
      </template>

      <div class="log-list">
        <div v-for="item in activeCase.logs" :key="item.id" class="log-item">
          <span>{{ formatLogTime(item.createdAt) }}</span>
          <strong>{{ item.text }}</strong>
        </div>
      </div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import {
  CalculatorOutlined,
  CarOutlined,
  DollarOutlined,
  DownloadOutlined,
  CameraOutlined,
  FileAddOutlined,
  FileDoneOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  ImportOutlined,
  MobileOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons-vue'
import { import40Api, type Import40Action, type Import40CaseDto } from '@/api/import40'
import { reestrApi } from '@/api/reestr'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()

type ImportStatus = {
  id: number
  short: string
  phase: string
}

type Import40Case = {
  id: string
  clientId: string
  client: string
  clientType: 'Одноразовый' | 'Постоянный'
  cargo: string
  post: string
  manager: string
  declarant: string
  status: number
  corridor: 'green' | 'yellow' | 'blue' | 'red'
  costCalculation: string
  riskNote: string
  vehicleNumber: string
  driverName: string
  driverPhone: string
  transportType: string
  documents: string[]
  svhInvoice: string
  paymentCheck: string
  declarationNumber: string
  finalDeclarationFile: string
  powerOfAttorneyGenerated: boolean
  powerOfAttorneyReturned: boolean
  controlPhotosCount: number
  closedDeclarationUploaded: boolean
  ropApproved: boolean
  clientAcceptedOffer: boolean
  contractSigned: boolean
  svhPaymentConfirmed: boolean
  createdAt: string
  logs: { id: string; createdAt: string; text: string }[]
}

type EditableField =
  | 'client'
  | 'clientType'
  | 'cargo'
  | 'post'
  | 'manager'
  | 'declarant'
  | 'corridor'
  | 'costCalculation'
  | 'riskNote'
  | 'vehicleNumber'
  | 'driverName'
  | 'driverPhone'
  | 'transportType'
  | 'svhInvoice'
  | 'paymentCheck'
  | 'declarationNumber'
  | 'finalDeclarationFile'
type RoleMode = 'client' | 'rop' | 'sales' | 'legs' | 'declarant'
type ActionKey =
  | 'submitCalculation'
  | 'approveOffer'
  | 'acceptOffer'
  | 'signContract'
  | 'generatePowerOfAttorney'
  | 'downloadPowerOfAttorney'
  | 'returnPowerOfAttorney'
  | 'photoControl'
  | 'submitDeclaration'
  | 'releaseDeclaration'
  | 'uploadSvhInvoice'
  | 'confirmPayment'
  | 'verifyPayment'
  | 'uploadClosedDeclaration'

const statuses: ImportStatus[] = [
  { id: 1, short: 'Черновик', phase: 'Коммерческий' },
  { id: 2, short: 'Расчет', phase: 'Коммерческий' },
  { id: 3, short: 'Согласование', phase: 'Коммерческий' },
  { id: 4, short: 'Договор', phase: 'Юридический' },
  { id: 5, short: 'Доверенность', phase: 'Юридический' },
  { id: 6, short: 'Транспорт', phase: 'Логистика' },
  { id: 7, short: 'Груз на посту', phase: 'Пост / СВХ' },
  { id: 8, short: 'Оформление ДТ', phase: 'Декларирование' },
  { id: 9, short: 'ДТ выпущена', phase: 'Декларирование' },
  { id: 10, short: 'Оплата СВХ', phase: 'Финансы' },
  { id: 11, short: 'Проверка оплаты', phase: 'Финансы' },
  { id: 12, short: 'Выполнено', phase: 'Архив' },
]

const draft = reactive({
  clientId: undefined as string | undefined,
  client: '',
  clientType: 'Одноразовый' as Import40Case['clientType'],
  cargo: '',
  post: '',
  manager: 'Фурхат',
})

const cases = ref<Import40Case[]>([])
const activeCaseId = ref<string | null>(null)
const search = ref('')
const authStore = useAuthStore()
const roleMode = ref<RoleMode>('rop')
const activeTab = ref('overview')
const loading = ref(false)
const clientsLoading = ref(false)
const clientOptions = ref<{ value: string; label: string }[]>([])

const importRoleByUsername: Record<string, RoleMode> = {
  im40_client: 'client',
  im40_rop: 'rop',
  im40_mpp: 'sales',
  im40_nogi: 'legs',
  im40_declarant: 'declarant',
}

const roleModeOptions = [
  { label: 'Клиент', value: 'client' },
  { label: 'РОП', value: 'rop' },
  { label: 'МПП', value: 'sales' },
  { label: 'Ноги', value: 'legs' },
  { label: 'Декларант', value: 'declarant' },
]

const canSeeCommercial = computed(() => ['rop', 'sales'].includes(roleMode.value))
const canSeeTransport = computed(() => ['client', 'legs', 'rop'].includes(roleMode.value))
const canSeeDocuments = computed(() => ['client', 'legs', 'declarant', 'rop'].includes(roleMode.value))
const canSeeFinance = computed(() => ['client', 'legs', 'rop', 'declarant'].includes(roleMode.value))
const visibleTabs = computed(() => {
  const tabs = [{ key: 'overview', label: 'Обзор' }]
  if (canSeeCommercial.value) tabs.push({ key: 'commercial', label: 'Коммерция' })
  if (canSeeTransport.value) tabs.push({ key: 'post', label: roleMode.value === 'legs' ? 'Пост' : 'Транспорт' })
  if (canSeeFinance.value) tabs.push({ key: 'finance', label: 'СВХ / Оплата' })
  if (canSeeDocuments.value) tabs.push({ key: 'documents', label: 'Документы' })
  tabs.push({ key: 'history', label: 'История' })
  return tabs
})

const applyRoleFromLogin = () => {
  const businessRole = authStore.businessRole?.trim().toLowerCase()
  if (businessRole === 'mpp') roleMode.value = 'sales'
  else if (businessRole === 'legs') roleMode.value = 'legs'
  else if (businessRole === 'declarant') roleMode.value = 'declarant'
  else if (businessRole === 'client') roleMode.value = 'client'
  else if (businessRole === 'rop') roleMode.value = 'rop'
  else {
    const username = authStore.username?.trim().toLowerCase()
    if (username) {
      roleMode.value = importRoleByUsername[username] ?? roleMode.value
    }
  }
}

const clientTypeOptions = [
  { label: 'Одноразовый', value: 'Одноразовый' },
  { label: 'Постоянный', value: 'Постоянный' },
]

const employeeOptions = [
  { label: 'Фурхат', value: 'Фурхат' },
  { label: 'Айнур', value: 'Айнур' },
  { label: 'Ерсин', value: 'Ерсин' },
  { label: 'Назначить позже', value: 'Назначить позже' },
]

const transportOptions = [
  { label: 'Тент / Штора', value: 'Тент / Штора' },
  { label: 'Рефрижератор', value: 'Рефрижератор' },
  { label: 'Изотерм', value: 'Изотерм' },
  { label: 'Контейнеровоз', value: 'Контейнеровоз' },
  { label: 'Малотоннажный / Бус', value: 'Малотоннажный / Бус' },
]

const corridorOptions = [
  { label: 'Зеленый', value: 'green' },
  { label: 'Желтый', value: 'yellow' },
  { label: 'Синий', value: 'blue' },
  { label: 'Красный', value: 'red' },
]

const documentTypes = [
  'Договор',
  'Доверенность клиента',
  'Техпаспорт',
  'Обязательство',
  'Фито',
  'Ветеринария',
  'Радиация',
  'Акт досмотра',
  'Счет СВХ',
  'Чек оплаты',
  'Выпущенная ДТ',
  'Закрытая ДТ',
]

const statusOptions = computed(() =>
  statuses.map((status) => ({
    label: `${status.id}. ${status.short}`,
    value: status.id,
  })),
)

const activeCase = computed(() => cases.value.find((item) => item.id === activeCaseId.value) || null)

const roleLabel = computed(
  () =>
    ({
      client: 'Клиент',
      rop: 'РОП',
      sales: 'Менеджер по продажам',
      legs: 'Ноги / пост',
      declarant: 'Декларант',
    })[roleMode.value],
)

const roleHelpText = computed(
  () =>
    ({
      client: 'Загружает транспортные данные, доверенность и чек оплаты.',
      rop: 'Назначает ответственных, утверждает тариф и договор.',
      sales: 'Ведет расчет стоимости, тарифы, риски и первичную коммуникацию.',
      legs: 'Работает с телефона на посту: доверенность, фото контроля, СВХ, закрытая ДТ.',
      declarant: 'Оформляет ДТ, фиксирует коридор, выпуск и итоговые файлы.',
    })[roleMode.value],
)

const filteredCases = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return cases.value

  return cases.value.filter((item) =>
    [item.client, item.cargo, item.post, item.declarationNumber, currentStatus(item).short]
      .join(' ')
      .toLowerCase()
      .includes(query),
  )
})

const metrics = computed(() => [
  { label: 'Статусов', value: String(statuses.length) },
  { label: 'Активные ДТ', value: String(cases.value.filter((item) => item.status < 12).length) },
  { label: 'Красный коридор', value: String(cases.value.filter((item) => item.corridor === 'red').length) },
])

const validationWarnings = computed(() => {
  if (!activeCase.value) return []
  return validateStatus(activeCase.value, Math.min(activeCase.value.status + 1, 12))
})

const visibleActions = computed(() => {
  if (!activeCase.value) return []

  const actions: {
    key: ActionKey
    label: string
    icon: object
    disabled?: boolean
  }[] = []

  if (roleMode.value === 'sales') {
    actions.push({
      key: 'submitCalculation',
      label: 'Отправить расчет РОПу',
      icon: CalculatorOutlined,
      disabled: !activeCase.value.costCalculation,
    })
  }

  if (roleMode.value === 'rop') {
    actions.push(
      { key: 'approveOffer', label: 'Утвердить тариф', icon: FileDoneOutlined },
      { key: 'signContract', label: 'Подписать договор', icon: FileProtectOutlined },
      { key: 'generatePowerOfAttorney', label: 'Сгенерировать доверенность', icon: FileTextOutlined },
      {
        key: 'verifyPayment',
        label: 'Проверить оплату',
        icon: DollarOutlined,
        disabled: activeCase.value.status < 11,
      },
    )
  }

  if (roleMode.value === 'client') {
    actions.push(
      {
        key: 'acceptOffer',
        label: 'Принять КП',
        icon: FileDoneOutlined,
      },
      {
        key: 'downloadPowerOfAttorney',
        label: 'Скачать доверенность',
        icon: DownloadOutlined,
        disabled: !activeCase.value.powerOfAttorneyGenerated,
      },
      {
        key: 'returnPowerOfAttorney',
        label: 'Вернуть подписанную',
        icon: FileProtectOutlined,
        disabled: !activeCase.value.powerOfAttorneyGenerated,
      },
      { key: 'confirmPayment', label: 'Загрузить чек оплаты', icon: DollarOutlined },
    )
  }

  if (roleMode.value === 'legs') {
    actions.push(
      {
        key: 'downloadPowerOfAttorney',
        label: 'Скачать доверенность',
        icon: DownloadOutlined,
        disabled: !activeCase.value.powerOfAttorneyReturned,
      },
      { key: 'photoControl', label: 'Добавить фото контроля', icon: CameraOutlined },
      { key: 'uploadSvhInvoice', label: 'Загрузить счет СВХ', icon: FileTextOutlined },
      {
        key: 'uploadClosedDeclaration',
        label: 'Загрузить закрытую ДТ',
        icon: FileDoneOutlined,
        disabled: activeCase.value.status < 9,
      },
    )
  }

  if (roleMode.value === 'declarant') {
    actions.push(
      { key: 'submitDeclaration', label: 'Подать ДТ', icon: ImportOutlined },
      { key: 'releaseDeclaration', label: 'Зафиксировать выпуск', icon: FileDoneOutlined },
    )
  }

  return actions
})

const canCreate = computed(
  () =>
    Boolean(draft.clientId) &&
    draft.cargo.trim().length > 1 &&
    draft.post.trim().length > 1,
)

const columns = [
  { title: 'Заявка', key: 'case', width: 240 },
  { title: 'Статус', key: 'status', width: 150 },
  { title: 'Менеджер', dataIndex: 'manager', key: 'manager', width: 120 },
  { title: 'Декларант', dataIndex: 'declarant', key: 'declarant', width: 130 },
  { title: 'Коридор', key: 'corridor', width: 110 },
  { title: 'Прогресс', key: 'progress', width: 120 },
  { title: '', key: 'action', width: 92, align: 'right' as const },
]

const fromDto = (dto: Import40CaseDto): Import40Case => ({
  id: dto.id,
  clientId: dto.clientId,
  client: dto.clientName,
  clientType: dto.clientType,
  cargo: dto.cargo,
  post: dto.post,
  manager: dto.manager,
  declarant: dto.declarant,
  status: dto.status,
  corridor: dto.corridor,
  costCalculation: dto.costCalculation,
  riskNote: dto.riskNote,
  vehicleNumber: dto.vehicleNumber,
  driverName: dto.driverName,
  driverPhone: dto.driverPhone,
  transportType: dto.transportType,
  documents: [],
  svhInvoice: dto.svhInvoice,
  paymentCheck: dto.paymentCheck,
  declarationNumber: dto.declarationNumber,
  finalDeclarationFile: dto.finalDeclarationFile,
  powerOfAttorneyGenerated: dto.powerOfAttorneyGenerated,
  powerOfAttorneyReturned: dto.powerOfAttorneyReturned,
  controlPhotosCount: dto.controlPhotosCount,
  closedDeclarationUploaded: dto.closedDeclarationUploaded,
  ropApproved: dto.ropApproved,
  clientAcceptedOffer: dto.clientAcceptedOffer,
  contractSigned: dto.contractSigned,
  svhPaymentConfirmed: dto.svhPaymentConfirmed,
  createdAt: dto.createdAtUtc,
  logs: dto.logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAtUtc,
    text: log.text,
  })),
})

const replaceCase = (dto: Import40CaseDto) => {
  const item = fromDto(dto)
  const index = cases.value.findIndex((current) => current.id === item.id)
  if (index >= 0) {
    cases.value[index] = item
  } else {
    cases.value = [item, ...cases.value]
  }
  activeCaseId.value = item.id
}

const loadCases = async () => {
  loading.value = true
  try {
    const id = String(route.params.id || '')
    if (id) {
      const item = await import40Api.get(id)
      cases.value = [fromDto(item)]
      activeCaseId.value = id
    } else {
      const items = await import40Api.list()
      cases.value = items.map(fromDto)
      activeCaseId.value = cases.value[0]?.id || null
    }
  } finally {
    loading.value = false
  }
}

const loadClients = async () => {
  clientsLoading.value = true
  try {
    const clients = await reestrApi.listClientsForCreate()
    clientOptions.value = clients.map((client) => ({
      value: client.id,
      label: client.username,
    }))
    if (!draft.clientId && clientOptions.value.length === 1) {
      draft.clientId = clientOptions.value[0].value
      syncDraftClientName()
    }
  } finally {
    clientsLoading.value = false
  }
}

const syncDraftClientName = () => {
  draft.client = clientOptions.value.find((client) => client.value === draft.clientId)?.label || ''
}

const currentStatus = (item: Import40Case) =>
  statuses.find((status) => status.id === item.status) || statuses[0]

const corridorLabel = (corridor: Import40Case['corridor']) =>
  corridorOptions.find((item) => item.value === corridor)?.label || 'Не выбран'

const caseProgress = (item: Import40Case) => Math.round((item.status / statuses.length) * 100)

const rowClassName = (record: Import40Case) =>
  record.id === activeCaseId.value ? 'import-row-active' : ''

const selectCase = (id: string) => {
  activeCaseId.value = id
}

const createCase = async () => {
  if (!canCreate.value) return

  const created = await import40Api.create({
    clientId: draft.clientId!,
    clientName: draft.client.trim(),
    clientType: draft.clientType,
    cargo: draft.cargo.trim(),
    post: draft.post.trim(),
    manager: draft.manager,
  })
  replaceCase(created)
  message.success('Заявка Импорт 40 создана')

  draft.clientId = undefined
  draft.client = ''
  draft.clientType = 'Одноразовый'
  draft.cargo = ''
  draft.post = ''
  draft.manager = 'Фурхат'
}

const setStatus = (status: number) => {
  if (!activeCase.value || activeCase.value.status === status) return
  message.info('Статус меняется через действия роли, вручную выбирать этап не нужно')
}

const setCorridor = async (corridor: Import40Case['corridor']) => {
  if (!activeCase.value || activeCase.value.corridor === corridor) return
  const updated = await import40Api.update(activeCase.value.id, { corridor })
  replaceCase(updated)
}

const toUpdatePayloadKey = (field: EditableField) => {
  if (field === 'client') return 'clientName'
  return field
}

const updateField = async (field: EditableField, value: string) => {
  if (!activeCase.value) return
  ;(activeCase.value[field] as string) = value
  const updated = await import40Api.update(activeCase.value.id, {
    [toUpdatePayloadKey(field)]: value,
  })
  replaceCase(updated)
}

const updateFromInput = (field: EditableField, event: Event) => {
  updateField(field, (event.target as HTMLInputElement).value)
}

const toggleDocument = (documentType: string) => {
  if (!activeCase.value) return

  if (activeCase.value.documents.includes(documentType)) {
    activeCase.value.documents = activeCase.value.documents.filter((item) => item !== documentType)
    addLog(activeCase.value, `Документ снят: ${documentType}`)
  } else {
    activeCase.value.documents = [...activeCase.value.documents, documentType]
    addLog(activeCase.value, `Документ добавлен: ${documentType}`)
  }
}

const actionMap: Record<Exclude<ActionKey, 'downloadPowerOfAttorney'>, Import40Action> = {
  submitCalculation: 'submit-calculation',
  approveOffer: 'approve-offer',
  acceptOffer: 'accept-offer',
  signContract: 'sign-contract',
  generatePowerOfAttorney: 'generate-power-of-attorney',
  returnPowerOfAttorney: 'return-power-of-attorney',
  photoControl: 'photo-control',
  submitDeclaration: 'submit-declaration',
  releaseDeclaration: 'release-declaration',
  uploadSvhInvoice: 'upload-svh-invoice',
  confirmPayment: 'confirm-payment',
  verifyPayment: 'verify-payment',
  uploadClosedDeclaration: 'upload-closed-declaration',
}

const runAction = async (action: ActionKey) => {
  if (!activeCase.value) return

  if (action === 'downloadPowerOfAttorney') {
    message.info('Скачивание доверенности будет подключено в блоке файлов. Статус заявки не меняется.')
    return
  }

  const updated = await import40Api.action(activeCase.value.id, actionMap[action])
  replaceCase(updated)
  message.success('Действие выполнено')
}

const addDocumentIfMissing = (item: Import40Case, documentType: string) => {
  if (!item.documents.includes(documentType)) {
    item.documents = [...item.documents, documentType]
  }
}

const validateStatus = (item: Import40Case, targetStatus: number) => {
  const errors: string[] = []

  if (targetStatus >= 3 && !item.costCalculation) {
    errors.push('нужно заполнить расчет стоимости')
  }
  if (targetStatus >= 4 && !item.ropApproved && !item.clientAcceptedOffer) {
    errors.push('нужно согласовать тариф с РОПом или клиентом')
  }
  if (targetStatus >= 5 && !item.contractSigned) {
    errors.push('нужно отметить подписанный договор')
  }
  if (targetStatus >= 6 && !item.powerOfAttorneyReturned) {
    errors.push('нужно вернуть подписанную доверенность')
  }
  if (targetStatus >= 7 && (!item.vehicleNumber || !item.driverPhone || !item.documents.includes('Техпаспорт') || !item.documents.includes('Обязательство'))) {
    errors.push('нужно заполнить транспорт, телефон, техпаспорт и обязательство')
  }
  if (targetStatus >= 9 && !item.declarationNumber) {
    errors.push('нужно указать номер ДТ')
  }
  if (targetStatus >= 11 && !item.svhInvoice) {
    errors.push('нужно загрузить счет СВХ')
  }
  if (targetStatus >= 12 && (!item.svhPaymentConfirmed || !item.closedDeclarationUploaded)) {
    errors.push('нужно подтвердить оплату и загрузить закрытую ДТ')
  }

  return errors
}

const isStatusDone = (status: number) => Boolean(activeCase.value && activeCase.value.status > status)

const addLog = (item: Import40Case, text: string) => {
  item.logs = [
    { id: `${Date.now()}-${Math.random()}`, createdAt: new Date().toISOString(), text },
    ...item.logs,
  ]
}

const formatLogTime = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value))

const normalizeCase = (item: Import40Case) => {
  item.documents ||= []
  item.logs ||= []
  item.powerOfAttorneyGenerated ||= false
  item.powerOfAttorneyReturned ||= false
  item.controlPhotosCount ||= 0
  item.closedDeclarationUploaded ||= false
  item.ropApproved ||= false
  item.clientAcceptedOffer ||= false
  item.contractSigned ||= false
  item.svhPaymentConfirmed ||= false
  item.transportType ||= 'Тент / Штора'
  item.corridor ||= 'green'
  item.status ||= 1
}

onMounted(() => {
  applyRoleFromLogin()
  void loadClients()
  void loadCases()
})

watch(() => authStore.username, applyRoleFromLogin)
watch(() => authStore.businessRole, applyRoleFromLogin)
</script>

<style scoped>
.import40-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 24px;
}

.import40-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(340px, 0.9fr);
  gap: 18px;
  padding: 22px;
  border-radius: var(--atg-radius-lg);
  background: linear-gradient(135deg, #1b2a4a, #243575);
  color: #f0f3ff;
  box-shadow: var(--atg-shadow-md);
}

.module-pill {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  padding: 0 10px;
  border: 1px solid rgba(43, 188, 212, 0.5);
  border-radius: 999px;
  color: #2bbcd4;
  background: rgba(43, 188, 212, 0.12);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.import40-hero h2 {
  margin: 14px 0 8px;
  color: #fff;
  font-size: clamp(26px, 2.4vw, 38px);
  font-weight: 850;
  line-height: 1.1;
}

.import40-hero p {
  max-width: 680px;
  margin: 0;
  color: rgba(240, 243, 255, 0.72);
  line-height: 1.65;
}

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  align-self: end;
}

.metric-card {
  min-height: 82px;
  padding: 13px;
  border: 1px solid rgba(240, 243, 255, 0.14);
  border-radius: var(--atg-radius);
  background: rgba(255, 255, 255, 0.06);
}

.metric-card span {
  display: block;
  color: rgba(240, 243, 255, 0.6);
  font-size: 12px;
  font-weight: 700;
}

.metric-card strong {
  display: block;
  margin-top: 10px;
  color: #2bbcd4;
  font-size: 24px;
}

.role-strip {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 14px 16px;
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius-lg);
  background: #fff;
  box-shadow: var(--atg-shadow);
}

.role-strip > div {
  display: grid;
  gap: 3px;
}

.role-strip span {
  color: var(--atg-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.role-strip strong {
  color: var(--atg-ink);
  font-size: 16px;
  font-weight: 850;
}

.import40-workspace {
  display: grid;
  grid-template-columns: minmax(360px, 0.78fr) minmax(0, 1.22fr);
  gap: 18px;
  align-items: start;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--atg-ink);
  font-weight: 820;
}

.card-title :deep(.anticon) {
  color: var(--atg-accent-strong);
}

.create-grid,
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.create-grid label,
.form-grid label,
.active-controls label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.create-grid label span,
.form-grid label span,
.active-controls label span {
  color: var(--atg-charcoal);
  font-size: 12px;
  font-weight: 780;
}

.create-btn {
  min-height: 40px;
  align-self: end;
  font-weight: 780;
}

.list-card :deep(.ant-card-body) {
  display: grid;
  gap: 12px;
}

.import-table {
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius);
  overflow: hidden;
}

.import-table :deep(.ant-table-thead > tr > th) {
  background: #e4e8f2;
  color: var(--atg-ink);
  font-size: 11px;
  font-weight: 850;
  text-transform: uppercase;
}

.import-table :deep(.import-row-active > td) {
  background: var(--atg-cyan-soft) !important;
}

.case-cell strong,
.case-cell span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.case-cell strong {
  color: var(--atg-ink);
  font-size: 13px;
  font-weight: 820;
}

.case-cell span {
  margin-top: 3px;
  color: var(--atg-muted);
  font-size: 12px;
}

.status-chip,
.corridor-chip {
  display: inline-flex;
  min-height: 24px;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 820;
  white-space: nowrap;
}

.status-chip {
  color: var(--atg-accent-strong);
  background: var(--atg-accent-soft);
}

.corridor-green {
  color: #286b4b;
  background: #dcebe3;
}

.corridor-yellow {
  color: #8a6500;
  background: #fff1c7;
}

.corridor-blue {
  color: #255f8f;
  background: #e3edf8;
}

.corridor-red {
  color: #fff;
  background: #b84a3c;
}

.progress-cell {
  display: grid;
  grid-template-columns: minmax(66px, 1fr) 38px;
  gap: 8px;
  align-items: center;
}

.progress-cell span {
  color: var(--atg-muted);
  font-size: 12px;
  font-weight: 780;
}

.active-case {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 0.52fr);
  gap: 18px;
  align-items: center;
  padding: 18px;
  border: 1px solid var(--atg-line);
  border-left: 4px solid var(--atg-accent);
  border-radius: var(--atg-radius-lg);
  background: #fff;
  box-shadow: var(--atg-shadow);
}

.active-case h2 {
  margin: 12px 0 5px;
  color: var(--atg-ink);
  font-size: 24px;
  font-weight: 850;
}

.active-case p {
  margin: 0;
  color: var(--atg-muted);
}

.active-controls {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.action-panel {
  display: grid;
  grid-template-columns: minmax(260px, 0.45fr) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  padding: 16px;
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius-lg);
  background: linear-gradient(135deg, #fff, #f7f9fc);
  box-shadow: var(--atg-shadow);
}

.action-panel h3 {
  margin: 10px 0 5px;
  color: var(--atg-ink);
  font-size: 18px;
  font-weight: 850;
}

.action-panel p {
  margin: 0;
  color: var(--atg-muted);
  line-height: 1.55;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-actions .ant-btn {
  min-height: 38px;
  font-weight: 760;
}

.validation-box {
  grid-column: 1 / -1;
  padding: 12px 14px;
  border: 1px solid rgba(184, 74, 60, 0.22);
  border-radius: var(--atg-radius);
  background: rgba(184, 74, 60, 0.07);
}

.validation-box strong {
  display: block;
  margin-bottom: 6px;
  color: var(--atg-red);
  font-size: 13px;
  font-weight: 850;
}

.validation-box ul {
  margin: 0;
  padding-left: 18px;
  color: var(--atg-text);
}

.validation-box li {
  margin: 4px 0;
  line-height: 1.45;
}

.status-timeline {
  position: sticky;
  top: 76px;
  z-index: 20;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  padding: 10px 0;
  background: rgba(243, 245, 249, 0.94);
  backdrop-filter: blur(10px);
}

.status-step {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 4px 8px;
  align-items: center;
  min-height: 62px;
  padding: 9px;
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius);
  background: #fff;
  color: var(--atg-ink);
  text-align: left;
  cursor: pointer;
}

.status-step:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.status-step span {
  display: grid;
  grid-row: span 2;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: var(--atg-surface-muted);
  color: var(--atg-muted);
  font-size: 12px;
  font-weight: 850;
}

.status-step strong,
.status-step small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-step strong {
  font-size: 12px;
  font-weight: 850;
}

.status-step small {
  color: var(--atg-muted);
  font-size: 10px;
  font-weight: 700;
}

.status-step.done span,
.status-step.active span {
  color: #fff;
  background: var(--atg-accent);
}

.status-step.active {
  border-color: var(--atg-accent);
  box-shadow: var(--atg-shadow-md);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  align-items: start;
}

.mobile-card {
  border-top-color: var(--atg-gold);
  background: linear-gradient(135deg, #ffffff, #f7fbfd);
}

.mobile-actions {
  display: grid;
  gap: 10px;
}

.mobile-actions .ant-btn {
  min-height: 46px;
  justify-content: flex-start;
  font-weight: 800;
}

.document-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.doc-check {
  display: flex;
  gap: 10px;
  min-height: 42px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius);
  background: var(--atg-surface);
  color: var(--atg-text);
}

.log-list {
  display: grid;
  gap: 8px;
}

.log-item {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 10px;
  padding: 9px 10px;
  border: 1px solid var(--atg-line);
  border-radius: var(--atg-radius);
  background: var(--atg-surface);
}

.log-item span {
  color: var(--atg-muted);
  font-size: 12px;
  font-weight: 780;
}

.log-item strong {
  color: var(--atg-ink);
  font-size: 13px;
  font-weight: 720;
}

@media (max-width: 1180px) {
  .import40-hero,
  .import40-workspace,
  .active-case,
  .action-panel,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .status-timeline {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .hero-metrics,
  .role-strip,
  .create-grid,
  .form-grid,
  .active-controls,
  .document-grid,
  .status-timeline {
    grid-template-columns: 1fr;
  }

  .status-timeline {
    position: static;
    padding: 0;
    background: transparent;
    backdrop-filter: none;
  }
}
</style>
