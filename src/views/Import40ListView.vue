<template>
  <div class="import40-list-page crm-page">
    <PageHeader kicker="Рабочий модуль" title="Импорт 40" subtitle="Заявки на таможенное оформление: контейнеры, ДТ, статусы.">
      <template #actions>
        <a-button :loading="loading" @click="reload">Обновить</a-button>
        <a-tooltip v-if="canCreate" :title="showOnboardingGate ? 'Сначала подпишите договор и доверенность (Моя компания)' : ''">
          <a-button type="primary" :disabled="showOnboardingGate" @click="openCreate">Новая заявка</a-button>
        </a-tooltip>
        <span class="crm-stat-badge">Заявок:&nbsp;<span class="crm-stat-badge-count">{{ cases.length }}</span></span>
      </template>
    </PageHeader>

    <a-alert
      v-if="showOnboardingGate"
      class="onboarding-alert"
      type="warning"
      show-icon
      message="Онбординг не завершён"
      description="Чтобы создавать заявки на таможенное оформление, подпишите договор и доверенность таможенного представителя в разделе «Моя компания»."
    >
      <template #action>
        <a-button size="small" type="primary" @click="router.push('/import-40/company')">
          Перейти к «Моей компании»
        </a-button>
      </template>
    </a-alert>

    <!-- ─────────── Сотрудник/админ: простое создание ─────────── -->
    <a-modal
      v-if="!isClientRole"
      v-model:open="createOpen"
      :width="560"
      title="Новая заявка"
      :footer="null"
      @cancel="resetCreate"
    >
      <div class="create-grid">
        <label>
          <span>Клиент <span class="req-star">*</span></span>
          <a-select
            v-model:value="draft.clientId"
            show-search
            option-filter-prop="label"
            :options="clientOptions"
            :loading="clientsLoading"
            placeholder="Выберите клиента"
            @change="syncClientName"
          />
        </label>
        <label>
          <span>Груз <span class="req-star">*</span></span>
          <a-input v-model:value="draft.cargo" placeholder="Описание груза" />
        </label>
        <label>
          <span>Пост / СВХ <span class="opt-hint">необязательно</span></span>
          <a-select
            v-model:value="draft.post"
            show-search
            allow-clear
            option-filter-prop="label"
            :options="postOptions"
            placeholder="Выберите пост/СВХ (поиск по названию) — можно позже"
          />
        </label>
        <a-button type="primary" :disabled="!canSubmit" :loading="creating" @click="createCase">
          Создать
        </a-button>
      </div>
    </a-modal>

    <!-- ─────────── Клиент: пошаговый мастер подачи ─────────── -->
    <a-modal
      v-else
      v-model:open="createOpen"
      :width="640"
      title="Новая заявка на оформление"
      :footer="null"
      :mask-closable="false"
      @cancel="resetCreate"
    >
      <a-steps :current="wizardStep" size="small" class="wizard-steps" :items="wizardStepItems" />

      <!-- Шаг 1 · Основное -->
      <div v-show="wizardStep === 0" class="wizard-body">
        <div class="create-grid">
          <label>
            <span>Груз <span class="req-star">*</span></span>
            <a-input v-model:value="draft.cargo" placeholder="Например: комплектующие, 3 палеты" />
          </label>
          <label>
            <span>Пост / СВХ <span class="opt-hint">необязательно</span></span>
            <a-select
              v-model:value="draft.post"
              show-search
              allow-clear
              option-filter-prop="label"
              :options="postOptions"
              placeholder="Поиск по названию — можно указать позже"
            />
          </label>
        </div>
      </div>

      <!-- Шаг 2 · Транспорт -->
      <div v-show="wizardStep === 1" class="wizard-body">
        <label class="w-field">
          <span>Вид транспорта</span>
          <a-select v-model:value="draft.transportMode" :options="IMPORT40_TRANSPORT_MODES" style="width: 100%" />
        </label>
        <div class="create-grid">
          <template v-if="draft.transportMode === 1">
            <label><span>Номер машины (голова)</span><a-input v-model:value="draft.vehicleNumber" placeholder="123ABC01" /></label>
            <label><span>Номер прицепа</span><a-input v-model:value="draft.trailerNumber" placeholder="456DEF01" /></label>
            <label><span>Телефон водителя</span><a-input v-model:value="draft.driverPhone" placeholder="+7 700 000 00 00" /></label>
          </template>
          <template v-else-if="draft.transportMode === 0">
            <label><span>Номер вагона</span><a-input v-model:value="draft.wagonNumber" placeholder="Номер вагона" /></label>
            <label><span>Станция</span><a-input v-model:value="draft.station" placeholder="Станция назначения" /></label>
          </template>
          <template v-else-if="draft.transportMode === 2">
            <label><span>Рейс</span><a-input v-model:value="draft.flightNumber" placeholder="Номер рейса" /></label>
            <label><span>Авианакладная (AWB)</span><a-input v-model:value="draft.airWaybill" placeholder="AWB" /></label>
          </template>
          <template v-else>
            <label><span>Судно</span><a-input v-model:value="draft.vesselName" placeholder="Название судна" /></label>
            <label><span>Коносамент</span><a-input v-model:value="draft.billOfLading" placeholder="B/L" /></label>
          </template>
        </div>

        <div class="sub-label">Контейнеры <span class="opt-hint">необязательно</span></div>
        <div v-for="(c, i) in draft.containers" :key="i" class="wizard-container-row">
          <a-input v-model:value="c.number" placeholder="Номер контейнера" style="max-width: 220px" />
          <a-input v-model:value="c.type" placeholder="Тип (40HC…)" style="max-width: 140px" />
          <a-button type="text" danger size="small" @click="draft.containers.splice(i, 1)"><CloseOutlined /></a-button>
        </div>
        <a-button type="dashed" size="small" @click="draft.containers.push({ number: '', type: '' })">+ Контейнер</a-button>
      </div>

      <!-- Шаг 3 · Стороны -->
      <div v-show="wizardStep === 2" class="wizard-body">
        <div class="party-block">
          <div class="sub-label">Отправитель</div>
          <div class="create-grid">
            <label><span>Наименование</span><a-input v-model:value="draft.senderName" placeholder="Поставщик / отправитель" /></label>
            <label>
              <span>Страна</span>
              <a-select v-model:value="draft.senderCountry" show-search allow-clear option-filter-prop="label" :options="countryOptions" placeholder="CN" />
            </label>
          </div>
        </div>
        <div class="party-block">
          <div class="party-head">
            <div class="sub-label">Получатель</div>
            <a-button v-if="clientCompanyProfile" type="link" size="small" @click="fillReceiverFromProfile">Из моей компании</a-button>
          </div>
          <div class="create-grid">
            <label><span>Наименование</span><a-input v-model:value="draft.receiverName" placeholder="Ваша компания" /></label>
            <label><span>БИН</span><a-input v-model:value="draft.receiverBin" placeholder="БИН" /></label>
            <label>
              <span>Страна</span>
              <a-select v-model:value="draft.receiverCountry" show-search allow-clear option-filter-prop="label" :options="countryOptions" placeholder="KZ" />
            </label>
          </div>
        </div>
        <div class="party-block">
          <div class="sub-label">Стоимость</div>
          <div class="create-grid">
            <label>
              <span>Валюта</span>
              <a-select v-model:value="draft.currency" show-search option-filter-prop="label" :options="CURRENCY_OPTIONS" placeholder="USD" />
            </label>
            <label><span>Ориентировочная стоимость</span><a-input-number v-model:value="draft.estimatedValue" :min="0" :controls="false" style="width: 100%" placeholder="0.00" /></label>
          </div>
        </div>
      </div>

      <!-- Шаг 4 · Документы -->
      <div v-show="wizardStep === 3" class="wizard-body">
        <a-upload-dragger
          class="docs-dragger"
          :multiple="true"
          :show-upload-list="false"
          :custom-request="handleDocUpload"
          :disabled="uploading || !createdCaseId"
        >
          <p class="dz-icon"><InboxOutlined /></p>
          <p class="dz-title">Перетащите файлы сюда или нажмите для выбора</p>
          <p class="dz-hint">PDF, JPG, PNG, XLSX, DOCX — до 20 МБ каждый</p>
        </a-upload-dragger>
        <ul v-if="uploadedFiles.length" class="uploaded-list">
          <li v-for="f in uploadedFiles" :key="f.id">{{ f.originalFileName }}</li>
        </ul>

        <div class="doc-checklist">
          <div class="sub-label">Отметьте, что приложили</div>
          <a-checkbox v-for="d in DOC_CHECKLIST" :key="d" v-model:checked="docChecklist[d]">{{ d }}</a-checkbox>
        </div>

        <a-alert
          type="warning"
          show-icon
          class="responsibility-alert"
          message="Ответственность за документы"
          description="Отправляя заявку, вы подтверждаете, что предоставленные документы и сведения полные и достоверны. Ответственность за их полноту и достоверность несёт клиент."
        />
        <a-checkbox v-model:checked="responsibilityAccepted" class="resp-check">
          Подтверждаю полноту и достоверность документов и сведений
        </a-checkbox>
      </div>

      <!-- Навигация мастера -->
      <div class="wizard-nav">
        <a-button v-if="wizardStep > 0" @click="wizardBack">Назад</a-button>
        <span class="wizard-nav-spacer" />
        <a-button v-if="wizardStep < 3" type="primary" :loading="creating" :disabled="!canGoNext" @click="wizardNext">
          Далее
        </a-button>
        <a-tooltip v-else :title="submitTooltip">
          <a-button type="primary" :disabled="!canSubmitWizard" :loading="submitting" @click="submitCase">
            Отправить заявку
          </a-button>
        </a-tooltip>
        <a-button v-if="createdCaseId" type="link" @click="finishLater">Дозаполнить позже</a-button>
      </div>
    </a-modal>

    <a-card class="crm-shell-card" :bordered="false">
      <a-tabs v-model:activeKey="tab" @change="reload">
        <a-tab-pane key="my" tab="Мои задачи" />
        <a-tab-pane key="all" tab="Все заявки" />
      </a-tabs>

      <a-input v-model:value="search" allow-clear placeholder="Поиск по клиенту, грузу, посту">
        <template #prefix><SearchOutlined /></template>
      </a-input>

      <a-table
        :columns="columns"
        :data-source="filteredCases"
        :loading="loading"
        :pagination="{ pageSize: 10, showSizeChanger: false }"
        :scroll="{ x: 820 }"
        row-key="id"
        class="import-table"
        :custom-row="(r: Import40CaseDto) => ({ onClick: () => router.push(`/import-40/${r.id}`), style: 'cursor: pointer' })"
      >
        <template #emptyText>
          <a-empty :description="tab === 'my' ? 'Заявок, ждущих вас, нет' : 'Заявок пока нет'" />
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'case'">
            <div class="case-cell">
              <strong>{{ record.clientName }}</strong>
              <span>{{ record.cargo }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="record.isProblem ? 'error' : isCompleted(record.status) ? 'success' : 'processing'">
              <template v-if="isCompleted(record.status)">{{ statusLabel(record.status) }}</template>
              <template v-else>шаг {{ stepForStatus(record.status) }}/{{ TOTAL_STEPS }} · {{ statusLabel(record.status) }}</template>
            </a-tag>
            <span v-if="record.isProblem" class="problem-chip">Проблема</span>
          </template>
          <template v-else-if="column.key === 'containers'">
            {{ record.containers.length }} конт. / {{ declCount(record) }} ДТ
          </template>
          <template v-else-if="column.key === 'updated'">
            {{ new Date(record.updatedAtUtc).toLocaleDateString('ru-RU') }}
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'
import { SearchOutlined, InboxOutlined, CloseOutlined } from '@ant-design/icons-vue'
import {
  import40Api,
  IMPORT40_STATUSES,
  IMPORT40_TRANSPORT_MODES,
  type Import40CaseDto,
  type Import40FileDto,
} from '@/api/import40'
import {
  import40ContractApi,
  isDocumentEffective,
  type Import40DocumentDto,
  type ClientCompanyProfileDto,
} from '@/api/import40Contract'
import { referencesApi } from '@/api/references'
import { useAuthStore } from '@/stores/auth'
import { TOTAL_STEPS, isCompleted, stepForStatus } from '@/utils/import40Steps'
import PageHeader from '@/components/PageHeader.vue'

const router = useRouter()
const authStore = useAuthStore()
const loading = ref(false)
const creating = ref(false)
const clientsLoading = ref(false)
const cases = ref<Import40CaseDto[]>([])
const clientOptions = ref<{ value: string; label: string }[]>([])
const postOptions = ref<{ value: string; label: string }[]>([])
const search = ref('')

// Справочник таможенных постов/СВХ для поля «Пост/СВХ» (value=label=полное имя).
const loadPosts = async () => {
  try {
    const posts = await referencesApi.listCustomsPosts()
    postOptions.value = posts.map((p) => ({ value: p.name, label: p.name }))
  } catch {
    postOptions.value = []
  }
}
const tab = ref<'my' | 'all'>('my')

const onboardingChecked = ref(false)
const contractDocs = ref<Import40DocumentDto[]>([])
const poaDocs = ref<Import40DocumentDto[]>([])

const createStep = ref<1 | 2>(1)
const createdCaseId = ref<string | null>(null)
const uploadedFiles = ref<Import40FileDto[]>([])
const uploading = ref(false)
const submitting = ref(false)
const pendingUploads = ref(0)

const draft = reactive({
  clientId: undefined as string | undefined,
  clientName: '',
  cargo: '',
  post: '',
  // Пакет 6 №1 — транспорт
  transportMode: 1, // 1 = Авто по умолчанию
  vehicleNumber: '',
  trailerNumber: '',
  driverPhone: '',
  wagonNumber: '',
  station: '',
  flightNumber: '',
  airWaybill: '',
  vesselName: '',
  billOfLading: '',
  containers: [] as { number: string; type: string }[],
  // Пакет 6 №1 — стороны/стоимость
  senderName: '',
  senderCountry: undefined as string | undefined,
  receiverName: '',
  receiverBin: '',
  receiverCountry: 'KZ' as string | undefined,
  currency: 'USD' as string | undefined,
  estimatedValue: null as number | null,
})

// Мастер подачи (роль client): 0..3
const wizardStep = ref(0)
const wizardStepItems = [
  { title: 'Основное' },
  { title: 'Транспорт' },
  { title: 'Стороны' },
  { title: 'Документы' },
]
const countryOptions = ref<{ value: string; label: string }[]>([])
const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD — Доллар США' },
  { value: 'EUR', label: 'EUR — Евро' },
  { value: 'CNY', label: 'CNY — Юань' },
  { value: 'KZT', label: 'KZT — Тенге' },
  { value: 'RUB', label: 'RUB — Рубль' },
  { value: 'TRY', label: 'TRY — Турецкая лира' },
  { value: 'AED', label: 'AED — Дирхам ОАЭ' },
  { value: 'GBP', label: 'GBP — Фунт стерлингов' },
]
const DOC_CHECKLIST = ['Инвойс', 'Упаковочный лист', 'Транспортные (CMR/накладная)', 'Контракт/спецификация']
const docChecklist = reactive<Record<string, boolean>>({})
const responsibilityAccepted = ref(false)
const clientCompanyProfile = ref<ClientCompanyProfileDto | null>(null)

const isClientRole = computed(
  () =>
    (authStore.businessRole || '').toLowerCase() === 'client' ||
    (authStore.role || '').toLowerCase() === 'client',
)
const canCreate = computed(
  () => isClientRole.value || (authStore.role || '').toLowerCase() === 'administrator',
)
const canSubmit = computed(
  // Обязательны только Клиент + Груз; Пост/СВХ необязателен (можно заполнить позже).
  () => Boolean(draft.clientId) && draft.cargo.trim().length > 1,
)
const onboardingReady = computed(
  () => contractDocs.value.some(isDocumentEffective) && poaDocs.value.some(isDocumentEffective),
)
// клиент прошёл онбординг ещё не проверен/не завершён — показываем гейт вместо обычного UI создания заявки
const showOnboardingGate = computed(
  () => isClientRole.value && onboardingChecked.value && !onboardingReady.value,
)

const columns = [
  { title: 'Заявка', key: 'case', width: 240 },
  { title: 'Шаг', key: 'status', width: 220 },
  { title: 'Состав', key: 'containers', width: 140 },
  { title: 'Обновлена', key: 'updated', width: 110 },
]

const statusLabel = (status: number) =>
  IMPORT40_STATUSES.find((s) => s.id === status)?.short || 'Неизвестно'
const declCount = (c: Import40CaseDto) => c.declarations.length

const createOpen = ref(false)
const openCreate = () => {
  resetCreate()
  createOpen.value = true
  if (isClientRole.value) {
    void loadCountries()
    void loadClientCompanyProfile()
  }
}
const resetCreate = () => {
  createStep.value = 1
  wizardStep.value = 0
  createdCaseId.value = null
  uploadedFiles.value = []
  responsibilityAccepted.value = false
  for (const d of DOC_CHECKLIST) docChecklist[d] = false
  draft.cargo = ''
  draft.post = ''
  draft.transportMode = 1
  draft.vehicleNumber = ''
  draft.trailerNumber = ''
  draft.driverPhone = ''
  draft.wagonNumber = ''
  draft.station = ''
  draft.flightNumber = ''
  draft.airWaybill = ''
  draft.vesselName = ''
  draft.billOfLading = ''
  draft.containers = []
  draft.senderName = ''
  draft.senderCountry = undefined
  draft.receiverName = ''
  draft.receiverBin = ''
  draft.receiverCountry = 'KZ'
  draft.currency = 'USD'
  draft.estimatedValue = null
}

// Справочник стран для селектов сторон в мастере.
const loadCountries = async () => {
  if (countryOptions.value.length) return
  try {
    const countries = await referencesApi.listCountries()
    countryOptions.value = countries.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))
  } catch {
    countryOptions.value = []
  }
}

// Профиль компании клиента — для кнопки «Из моей компании» (получатель).
const loadClientCompanyProfile = async () => {
  if (!draft.clientId) return
  try {
    clientCompanyProfile.value = await import40ContractApi.getProfile(draft.clientId)
    // Предзаполняем получателя из профиля, если поля ещё пустые.
    if (!draft.receiverName) fillReceiverFromProfile()
  } catch {
    clientCompanyProfile.value = null
  }
}

const fillReceiverFromProfile = () => {
  const p = clientCompanyProfile.value
  if (!p) return
  draft.receiverName = p.companyName || draft.receiverName
  draft.receiverBin = p.bin || draft.receiverBin
  draft.receiverCountry = p.legalCountryCode || draft.receiverCountry || 'KZ'
}

// ── Навигация мастера ────────────────────────────────────────────────────
const canGoNext = computed(() => {
  if (wizardStep.value === 0) return draft.cargo.trim().length > 1
  return true
})
const canSubmitWizard = computed(
  () => !!createdCaseId.value && uploadedFiles.value.length > 0 && responsibilityAccepted.value,
)
const submitTooltip = computed(() => {
  if (!uploadedFiles.value.length) return 'Прикрепите хотя бы один документ'
  if (!responsibilityAccepted.value) return 'Подтвердите полноту и достоверность'
  return ''
})

const wizardBack = () => {
  if (wizardStep.value > 0) wizardStep.value -= 1
}
const wizardNext = async () => {
  if (!canGoNext.value) return
  // Заявку создаём при переходе с шага 1 — дальше нужен id для загрузки файлов.
  if (wizardStep.value === 0 && !createdCaseId.value) {
    const ok = await createDraftCase()
    if (!ok) return
  }
  wizardStep.value += 1
}

// Создаёт черновик заявки (клиент), возвращает успех. Транспорт/стороны/
// стоимость сохраняются позже, при отправке (persistWizardDraft).
const createDraftCase = async (): Promise<boolean> => {
  if (!draft.clientId) return false
  creating.value = true
  try {
    const created = await import40Api.create({
      clientId: draft.clientId,
      clientName: draft.clientName,
      cargo: draft.cargo.trim(),
      post: (draft.post || '').trim(),
    })
    createdCaseId.value = created.id
    void reload()
    return true
  } catch (e: any) {
    message.error(e?.response?.data?.error ?? 'Не удалось создать заявку')
    return false
  } finally {
    creating.value = false
  }
}

// Сохраняет транспорт/стороны/стоимость и контейнеры на созданной заявке.
const persistWizardDraft = async () => {
  if (!createdCaseId.value) return
  const id = createdCaseId.value
  await import40Api.update(id, {
    cargo: draft.cargo.trim(),
    post: (draft.post || '').trim(),
    transportMode: draft.transportMode,
    vehicleNumber: draft.vehicleNumber.trim(),
    trailerNumber: draft.trailerNumber.trim(),
    driverPhone: draft.driverPhone.trim(),
    wagonNumber: draft.wagonNumber.trim(),
    station: draft.station.trim(),
    flightNumber: draft.flightNumber.trim(),
    airWaybill: draft.airWaybill.trim(),
    vesselName: draft.vesselName.trim(),
    billOfLading: draft.billOfLading.trim(),
    clientSenderName: draft.senderName.trim(),
    clientSenderCountryCode: draft.senderCountry || '',
    clientReceiverName: draft.receiverName.trim(),
    clientReceiverBin: draft.receiverBin.trim(),
    clientReceiverCountryCode: draft.receiverCountry || '',
    clientCurrencyCode: draft.currency || '',
    clientEstimatedValue: draft.estimatedValue,
  })
  for (const c of draft.containers) {
    if (c.number.trim()) {
      await import40Api.addContainer(id, { containerNumber: c.number.trim(), containerType: c.type.trim() })
    }
  }
}

const filteredCases = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return cases.value
  return cases.value.filter((c) =>
    [c.clientName, c.cargo, c.post, statusLabel(c.status)].join(' ').toLowerCase().includes(q),
  )
})

const syncClientName = () => {
  draft.clientName = clientOptions.value.find((o) => o.value === draft.clientId)?.label || ''
}

const reload = async () => {
  loading.value = true
  try {
    cases.value = tab.value === 'my' ? await import40Api.myTasks() : await import40Api.list()
  } finally {
    loading.value = false
  }
}

const loadClients = async () => {
  clientsLoading.value = true
  try {
    const clients = await import40Api.listClients()
    clientOptions.value = clients.map((c) => ({ value: c.id, label: c.username }))
    if (isClientRole.value && clients.length) {
      draft.clientId = clients[0].id
      draft.clientName = clients[0].username
      void loadOnboardingStatus(clients[0].id)
    }
  } finally {
    clientsLoading.value = false
  }
}

// для роли client — проверяем, что договор и доверенность действуют,
// чтобы не пускать в форму создания заявки клиента, которого сервер всё равно отклонит (403)
const loadOnboardingStatus = async (clientId: string) => {
  try {
    const [contracts, poas] = await Promise.all([
      import40ContractApi.listDocuments(clientId, 'contract'),
      import40ContractApi.listDocuments(clientId, 'poa'),
    ])
    contractDocs.value = contracts
    poaDocs.value = poas
  } finally {
    onboardingChecked.value = true
  }
}

// Сотрудник/админ: простое создание → сразу карточка ДТ (клиент идёт мастером).
const createCase = async () => {
  if (!canSubmit.value) return
  creating.value = true
  try {
    const created = await import40Api.create({
      clientId: draft.clientId!,
      clientName: draft.clientName,
      cargo: draft.cargo.trim(),
      post: draft.post.trim(),
    })
    createOpen.value = false
    message.success('Заявка создана')
    router.push(`/import-40/${created.id}`)
  } catch (e: any) {
    message.error(e?.response?.data?.error ?? 'Не удалось создать заявку')
  } finally {
    creating.value = false
  }
}

// customRequest вызывается конкурентно на каждый файл при multi-file drop —
// счётчик in-flight гарантирует один финальный listFiles-снапшот и что uploading
// не сбросится, пока соседние загрузки ещё выполняются
const uploadDocs = async (file: File) => {
  if (!createdCaseId.value) return
  const caseId = createdCaseId.value
  pendingUploads.value += 1
  uploading.value = true
  try {
    await import40Api.uploadFile(caseId, 'documents', file)
  } catch (e: any) {
    message.error(e?.response?.data?.error ?? `Не удалось загрузить файл: ${file.name}`)
  } finally {
    pendingUploads.value -= 1
    if (pendingUploads.value === 0) {
      try {
        uploadedFiles.value = (await import40Api.listFiles(caseId)).filter(
          (x) => x.section === 'documents',
        )
      } finally {
        uploading.value = false
      }
    }
  }
}

const submitCase = async () => {
  if (!canSubmitWizard.value) return
  submitting.value = true
  try {
    // Сохраняем транспорт/стороны/стоимость/контейнеры, затем отправляем.
    await persistWizardDraft()
    await import40Api.action(createdCaseId.value!, 'submit-for-processing')
    message.success('Заявка отправлена на оформление')
    router.push(`/import-40/${createdCaseId.value}`)
  } catch (e: any) {
    message.error(e?.response?.data?.error ?? 'Не удалось отправить заявку')
  } finally {
    submitting.value = false
  }
}

const finishLater = async () => {
  if (!createdCaseId.value) return
  // Сохраняем то, что уже ввёл клиент, чтобы черновик не потерялся.
  try { await persistWizardDraft() } catch { /* оставляем как есть */ }
  router.push(`/import-40/${createdCaseId.value}`)
}

const handleDocUpload: UploadProps['customRequest'] = ({ file }) => {
  void uploadDocs(file as File)
}

onMounted(() => {
  void reload()
  if (canCreate.value) {
    void loadClients()
    void loadPosts()
  }
})
</script>

<style scoped>
.import40-list-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.onboarding-alert {
  border-radius: var(--atg-radius-lg);
}

.create-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  align-items: end;
}

.create-grid label,
.case-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.create-grid label > span {
  color: var(--atg-charcoal);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.create-grid .req-star { color: #cf4a3c; font-weight: 700; }
.create-grid .opt-hint { color: var(--atg-muted, #95a1b7); font-weight: 500; text-transform: none; letter-spacing: 0; font-size: 11px; }

.uploaded-list { margin: 10px 0 0; padding-left: 18px; font-size: 13px; }

/* ── Мастер подачи (клиент) ─────────────────────────────────── */
.wizard-steps { margin: 4px 0 18px; }
.wizard-body { min-height: 220px; }
.w-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.w-field > span { color: var(--atg-charcoal); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.wizard-container-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.party-block { margin-bottom: 16px; }
.party-head { display: flex; align-items: center; justify-content: space-between; }
.sub-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--atg-charcoal); margin: 8px 0 8px; }
.doc-checklist { display: flex; flex-direction: column; gap: 6px; margin: 16px 0; }
.responsibility-alert { border-radius: var(--atg-radius-lg); margin-top: 8px; }
.resp-check { margin-top: 10px; font-weight: 600; }
.wizard-nav { display: flex; align-items: center; gap: 10px; margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--atg-line, #eef1f6); }
.wizard-nav-spacer { flex: 1; }

/* Дропзона: полноценная зона перетаскивания (была тонкая полоска в одну строку) */
.docs-dragger { margin-top: 14px; }
.docs-dragger :deep(.ant-upload-drag) { border-radius: var(--atg-radius-lg); }
.docs-dragger :deep(.ant-upload-btn) { padding: 22px 16px !important; }
.dz-icon { margin: 0 0 6px; line-height: 1; }
.dz-icon :deep(.anticon) { font-size: 34px; color: var(--atg-teal, #22b8d0); }
.dz-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--atg-ink, #182640); }
.dz-hint { margin: 4px 0 0; font-size: 12px; color: var(--atg-muted, #95a1b7); }

/* Кнопки: перенос вместо обрезки длинной ссылки «Дозаполнить позже…» */
.submit-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: 16px;
  align-items: center;
}
.submit-actions :deep(.ant-btn-link) { padding-left: 0; padding-right: 0; }

.case-cell span {
  color: var(--atg-muted);
  font-size: 12.5px;
}

.problem-chip {
  display: inline-flex;
  margin-left: 6px;
  border-radius: 999px;
  background: rgba(184, 74, 60, 0.12);
  color: #b84a3c;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
}

.progress-cell {
  min-width: 100px;
}

@media (max-width: 900px) {
  .import40-summary,
  .create-grid {
    grid-template-columns: 1fr;
  }
}
</style>
