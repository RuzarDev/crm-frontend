<template>
  <div class="import40-list-page crm-page">
    <PageHeader
      :kicker="isClientRole ? t('import40List.kickerClient') : t('import40List.kicker')"
      :title="isClientRole ? t('import40List.titleClient') : t('import40List.title')"
      :subtitle="isClientRole ? t('import40List.subtitleClient') : t('import40List.subtitle')"
    >
      <template #actions>
        <a-button :loading="loading" @click="reload">{{ t('common.refresh') }}</a-button>
        <a-tooltip v-if="canCreate" :title="showOnboardingGate ? t('import40List.onboardingTooltip') : canCreateStaff ? t('import40List.newRequestStaffHint') : ''">
          <!-- Основной путь — клиент подаёт заявку сам; для сотрудника (фолбэк 3.13) кнопка вторичная. -->
          <a-button :type="canCreateStaff ? 'default' : 'primary'" :size="canCreateStaff ? 'small' : 'middle'" :disabled="showOnboardingGate" @click="openCreate">{{ t('import40List.newRequest') }}</a-button>
        </a-tooltip>
        <span class="crm-stat-badge">{{ t('import40List.requestsCount') }}&nbsp;<span class="crm-stat-badge-count">{{ cases.length }}</span></span>
      </template>
    </PageHeader>

    <a-alert
      v-if="showOnboardingGate"
      class="onboarding-alert"
      type="warning"
      show-icon
      :message="t('import40List.onboardingTitle')"
      :description="registration.reason.value || t('import40List.onboardingDesc')"
    >
      <template #action>
        <a-button size="small" type="primary" @click="router.push(onboardingGateTarget)">
          {{ registration.needNew.value ? t('import40List.formNewDoc') : t('import40List.goToCompany') }}
        </a-button>
      </template>
    </a-alert>

    <!-- ─────────── Сотрудник/админ: простое создание ─────────── -->
    <a-modal
      v-if="!isClientRole"
      v-model:open="createOpen"
      :width="560"
      :title="t('import40List.newRequest')"
      :footer="null"
      @cancel="resetCreate"
    >
      <div class="create-grid">
        <label>
          <span>{{ t('import40List.client') }} <span class="req-star">*</span></span>
          <a-select
            v-model:value="draft.clientId"
            show-search
            option-filter-prop="label"
            :options="clientOptions"
            :loading="clientsLoading"
            :placeholder="t('import40List.selectClient')"
            @change="syncClientName"
          />
        </label>
        <label>
          <span>{{ t('import40List.cargo') }} <span class="req-star">*</span></span>
          <a-input v-model:value="draft.cargo" :placeholder="t('import40List.cargoPh')" />
        </label>
        <label>
          <span>{{ t('import40List.post') }} <span class="opt-hint">{{ t('import40List.optional') }}</span></span>
          <a-select
            v-model:value="draft.post"
            show-search
            allow-clear
            option-filter-prop="label"
            :options="postOptions"
            :placeholder="t('import40List.postPh')"
          />
        </label>
        <a-button type="primary" :disabled="!canSubmit" :loading="creating" @click="createCase">
          {{ t('import40List.create') }}
        </a-button>
      </div>
    </a-modal>

    <!-- ─────────── Клиент: пошаговый мастер подачи ─────────── -->
    <a-modal
      v-else
      :open="createOpen"
      :width="640"
      :title="t('import40List.wizardTitle')"
      :footer="null"
      :mask-closable="false"
      @cancel="handleWizardCancel"
    >
      <a-spin v-if="continuing" class="wizard-loading" />
      <a-steps :current="wizardStep" size="small" class="wizard-steps" :items="wizardStepItems" />

      <!-- Шаг 1 · Основное -->
      <div v-show="wizardStep === 0" class="wizard-body">
        <div class="create-grid">
          <label>
            <span>{{ t('import40List.cargo') }} <span class="req-star">*</span></span>
            <a-input v-model:value="draft.cargo" :placeholder="t('import40List.cargoExample')" />
          </label>
          <label>
            <!-- «Пост / СВХ» — жаргон, клиенту непонятно, что это и зачем (аудит 23/28). -->
            <span>{{ t('import40List.postClient') }}</span>
            <a-select
              v-model:value="draft.post"
              show-search
              allow-clear
              option-filter-prop="label"
              :options="postOptions"
              :placeholder="t('import40List.postPhShort')"
            />
          </label>
        </div>
      </div>

      <!-- Шаг 2 · Транспорт -->
      <div v-show="wizardStep === 1" class="wizard-body">
        <label class="w-field">
          <span>{{ t('import40List.transportMode') }}</span>
          <a-select v-model:value="draft.transportMode" :options="transportModeOptions" style="width: 100%" />
        </label>
        <div class="create-grid">
          <template v-if="draft.transportMode === 1">
            <label><span>{{ t('import40List.vehicleHead') }}</span><a-input v-model:value="draft.vehicleNumber" placeholder="123ABC01" /></label>
            <label><span>{{ t('import40List.trailer') }}</span><a-input v-model:value="draft.trailerNumber" placeholder="456DEF01" /></label>
            <label><span>{{ t('import40List.driverPhone') }}</span><PhoneInput v-model:value="draft.driverPhone" /></label>
          </template>
          <template v-else-if="draft.transportMode === 0">
            <label><span>{{ t('import40List.wagon') }}</span><a-input v-model:value="draft.wagonNumber" :placeholder="t('import40List.wagon')" /></label>
            <label><span>{{ t('import40List.station') }}</span><a-input v-model:value="draft.station" :placeholder="t('import40List.stationPh')" /></label>
          </template>
          <template v-else-if="draft.transportMode === 2">
            <label><span>{{ t('import40List.flight') }}</span><a-input v-model:value="draft.flightNumber" :placeholder="t('import40List.flightPh')" /></label>
            <label><span>{{ t('import40List.awb') }}</span><a-input v-model:value="draft.airWaybill" placeholder="AWB" /></label>
          </template>
          <template v-else>
            <label><span>{{ t('import40List.vessel') }}</span><a-input v-model:value="draft.vesselName" :placeholder="t('import40List.vesselPh')" /></label>
            <label><span>{{ t('import40List.bl') }}</span><a-input v-model:value="draft.billOfLading" placeholder="B/L" /></label>
          </template>
        </div>

        <div class="sub-label">{{ t('import40List.containers') }} <span class="opt-hint">{{ t('import40List.optional') }}</span></div>
        <div v-for="(c, i) in draft.containers" :key="i" class="wizard-container-row">
          <a-input v-model:value="c.number" :placeholder="t('import40List.containerNumberPh')" style="max-width: 220px" />
          <a-input v-model:value="c.type" :placeholder="t('import40List.containerTypePh')" style="max-width: 140px" />
          <a-button type="text" danger size="small" @click="draft.containers.splice(i, 1)"><CloseOutlined /></a-button>
        </div>
        <a-button type="dashed" size="small" @click="draft.containers.push({ number: '', type: '' })">{{ t('import40List.addContainer') }}</a-button>
      </div>

      <!-- Шаг 3 · Стороны -->
      <div v-show="wizardStep === 2" class="wizard-body">
        <div class="party-block">
          <div class="sub-label">{{ t('import40List.sender') }}</div>
          <div class="create-grid">
            <label><span>{{ t('import40List.name') }}</span><a-input v-model:value="draft.senderName" :placeholder="t('import40List.senderNamePh')" /></label>
            <label>
              <span>{{ t('import40List.country') }}</span>
              <a-select v-model:value="draft.senderCountry" show-search allow-clear :filter-option="filterCountryOption" :options="countryOptions" :placeholder="t('import40List.countryPh')" />
            </label>
          </div>
        </div>
        <div class="party-block">
          <div class="party-head">
            <div class="sub-label">{{ t('import40List.receiver') }}</div>
            <a-button v-if="clientCompanyProfile" type="link" size="small" @click="fillReceiverFromProfile">{{ t('import40List.fromMyCompany') }}</a-button>
          </div>
          <div class="create-grid">
            <label><span>{{ t('import40List.name') }}</span><a-input v-model:value="draft.receiverName" :placeholder="t('import40List.receiverNamePh')" /></label>
            <label><span>{{ t('import40List.bin') }}</span>
              <div class="bin-row">
                <a-input v-model:value="draft.receiverBin" :placeholder="t('import40List.bin')" />
                <BinLookupButton :bin="draft.receiverBin" size="middle" @found="applyReceiverLookup" />
              </div>
            </label>
            <label>
              <span>{{ t('import40List.country') }}</span>
              <a-select v-model:value="draft.receiverCountry" show-search allow-clear :filter-option="filterCountryOption" :options="countryOptions" :placeholder="t('import40List.countryPh')" />
            </label>
          </div>
        </div>
        <div class="party-block">
          <div class="sub-label">{{ t('import40List.value') }}</div>
          <div class="create-grid">
            <label>
              <span>{{ t('import40List.currency') }}</span>
              <a-select v-model:value="draft.currency" show-search option-filter-prop="label" :options="CURRENCY_OPTIONS" placeholder="USD" />
            </label>
            <label><span>{{ t('import40List.estimatedValue') }}</span><a-input-number v-model:value="draft.estimatedValue" :min="0" :controls="false" style="width: 100%" placeholder="0.00" /></label>
          </div>
        </div>
      </div>

      <!-- Шаг 4 · Документы -->
      <div v-show="wizardStep === 3" class="wizard-body">
        <a-upload-dragger
          class="docs-dragger"
          :multiple="true"
          :show-upload-list="false"
          accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
          :custom-request="handleDocUpload"
          :disabled="uploading || !createdCaseId"
        >
          <p class="dz-icon"><InboxOutlined /></p>
          <p class="dz-title">{{ t('import40List.dropTitle') }}</p>
          <p class="dz-hint">{{ t('import40List.dropHint') }}</p>
        </a-upload-dragger>
        <!-- До отправки заявки клиент может убрать лишний или ошибочный файл; после — нет. -->
        <ul v-if="uploadedFiles.length" class="uploaded-list">
          <li v-for="f in uploadedFiles" :key="f.id">
            <span class="uploaded-name">{{ f.originalFileName }}</span>
            <a-tooltip :title="t('import40List.removeFile')">
              <a-button type="text" danger size="small" :loading="removingFileId === f.id" :aria-label="t('import40List.removeFile')" @click="removeUploaded(f)">
                <CloseOutlined />
              </a-button>
            </a-tooltip>
          </li>
        </ul>

        <a-alert
          type="warning"
          show-icon
          class="responsibility-alert"
          :message="t('import40List.respTitle')"
          :description="t('import40List.respDesc')"
        />
        <a-checkbox v-model:checked="responsibilityAccepted" class="resp-check">
          {{ t('import40List.respConfirm') }}
        </a-checkbox>
      </div>

      <!-- Навигация мастера -->
      <div class="wizard-nav">
        <a-button v-if="wizardStep > 0" @click="wizardBack">{{ t('import40List.back') }}</a-button>
        <span class="wizard-nav-spacer" />
        <a-button v-if="wizardStep < 3" type="primary" :loading="creating" :disabled="!canGoNext" @click="wizardNext">
          {{ t('import40List.next') }}
        </a-button>
        <a-tooltip v-else :title="submitTooltip">
          <a-button type="primary" :disabled="!canSubmitWizard" :loading="submitting" @click="submitCase">
            {{ t('import40List.submit') }}
          </a-button>
        </a-tooltip>
        <a-button v-if="createdCaseId" type="link" @click="finishLater">{{ t('import40List.finishLater') }}</a-button>
      </div>
    </a-modal>

    <!-- Закрытие мастера крестиком после того, как черновик уже создан (аудит 5.10) —
         не теряем ввод молча: сохранить сейчас или оставить черновик как есть. -->
    <a-modal
      v-model:open="closeConfirmOpen"
      :title="t('import40List.closeConfirmTitle')"
      :footer="null"
      :width="420"
    >
      <p class="muted">{{ t('import40List.closeConfirmDesc') }}</p>
      <div class="wizard-nav close-confirm-actions">
        <a-button @click="confirmCloseDiscard">{{ t('import40List.closeConfirmDiscard') }}</a-button>
        <span class="wizard-nav-spacer" />
        <a-button type="primary" @click="confirmCloseSave">{{ t('import40List.closeConfirmSave') }}</a-button>
      </div>
    </a-modal>

    <a-card class="crm-shell-card" :bordered="false">
      <a-tabs v-model:activeKey="tab" @change="reload">
        <!-- Клиенту «Мои задачи» непонятно: для него это заявки, где нужен его ход
             (дозаполнить черновик, оплатить счёт). -->
        <a-tab-pane key="all" :tab="isClientRole ? t('import40List.allClient') : t('import40List.allRequests')" />
        <a-tab-pane key="my" :tab="isClientRole ? t('import40List.myTasksClient') : t('import40List.myTasks')" />
      </a-tabs>

      <div class="list-filters">
        <a-input v-model:value="search" allow-clear :placeholder="isClientRole ? t('import40List.searchPhClient') : t('import40List.searchPh')">
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <a-segmented v-if="tab === 'all'" v-model:value="scope" :options="scopeOptions" />
      </div>

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
          <a-empty :description="tab === 'my' ? t('import40List.emptyMy') : t('import40List.emptyAll')" />
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'case'">
            <div class="case-cell">
              <!-- Клиенту не нужно название своей же компании в каждой строке (аудит 5.28). -->
              <strong><span class="case-number">{{ record.number }}</span><template v-if="!isClientRole"> {{ record.clientName }}</template></strong>
              <span>{{ record.cargo }}</span>
              <!-- Черновик клиента можно дозаполнить в том же мастере (аудит 5.9). -->
              <a-button
                v-if="isClientRole && record.status === 0"
                type="link"
                size="small"
                class="continue-draft-btn"
                @click.stop="openContinue(record.id)"
              >{{ t('import40List.continueDraft') }}</a-button>
            </div>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="record.status === 9 ? 'default' : record.isProblem ? 'error' : isCompleted(record.status) ? 'success' : 'processing'">
              <template v-if="isCompleted(record.status)">{{ statusLabel(record.status) }}</template>
              <!-- Клиенту — клиентский словарь шагов, без «Шаг X из Y» и жаргона статусов (5.6/5.18). -->
              <template v-else-if="isClientRole">{{ t(`enum.stepClient.s${stepForStatus(record.status)}`) }}</template>
              <template v-else>{{ t('import40List.stepOf', { step: stepForStatus(record.status), total: TOTAL_STEPS }) }} · {{ statusLabel(record.status) }}</template>
            </a-tag>
            <span v-if="record.isProblem" class="problem-chip">{{ t('import40List.problem') }}</span>
          </template>
          <template v-else-if="column.key === 'executor'">
            {{ executorCell(record) }}
          </template>
          <template v-else-if="column.key === 'containers'">
            {{ t('import40List.compositionCell', { containers: record.containers.length, decl: declCount(record) }) }}
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
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { message } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'
import { SearchOutlined, InboxOutlined, CloseOutlined } from '@ant-design/icons-vue'
import {
  import40Api,
  IMPORT40_TRANSPORT_MODES,
  type Import40CaseDto,
  type Import40FileDto,
} from '@/api/import40'
import { useImport40Status } from '@/composables/useImport40Status'
import { useClientRegistration } from '@/composables/useClientRegistration'
import {
  import40ContractApi,
  type ClientCompanyProfileDto,
} from '@/api/import40Contract'
import { referencesApi } from '@/api/references'
import { useAuthStore } from '@/stores/auth'
import { TOTAL_STEPS, isCompleted, stepForStatus } from '@/utils/import40Steps'
import { buildCountryOptions, filterCountryOption, normalizeCountryCode } from '@/utils/countries'
import type { RefCodeItem } from '@/types/api'
import PageHeader from '@/components/PageHeader.vue'
import BinLookupButton from '@/components/BinLookupButton.vue'
import type { CompanyLookupDto } from '@/api/companyLookup'
import PhoneInput from '@/components/ui/PhoneInput.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const registration = useClientRegistration()
const { t, locale } = useI18n()
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
// Сотруднику по умолчанию — его задачи, клиенту — все его заявки. Аудит §4.6: у бухгалтера
// и продажника нет своего шага в процессе («Мои задачи» для них всегда пусты) — по умолчанию
// сразу открываем «Все», иначе выглядит как пустой список без объяснения.
const tab = ref<'my' | 'all'>(((): 'my' | 'all' => {
  const r = (authStore.role || '').toLowerCase()
  if (r === 'client') return 'all'
  if (authStore.hasBusinessRole('accountant') || authStore.hasBusinessRole('sales')) return 'all'
  return 'my'
})())

const onboardingChecked = ref(false)

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
  // По умолчанию получатель — Казахстан, код ОКСМ (аудит 5.13); не буквенный 'KZ'.
  receiverCountry: '398' as string | undefined,
  currency: 'USD' as string | undefined,
  estimatedValue: null as number | null,
})

// Мастер подачи (роль client): 0..3
const wizardStep = ref(0)
const wizardStepItems = computed(() => [
  { title: t('import40List.stepBasics') },
  { title: t('import40List.stepTransport') },
  { title: t('import40List.stepParties') },
  { title: t('import40List.stepDocs') },
])
// Виды транспорта с переведёнными подписями (значения 0=ЖД,1=Авто,2=Авиа,3=Море).
const TRANSPORT_MODE_KEYS: Record<number, string> = { 0: 'rail', 1: 'road', 2: 'air', 3: 'sea' }
const transportModeOptions = computed(() =>
  IMPORT40_TRANSPORT_MODES.map((m) => ({ value: m.value, label: t('enum.transportMode.' + TRANSPORT_MODE_KEYS[m.value]) })),
)
const countriesRaw = ref<RefCodeItem[]>([])
const countryOptions = computed(() => buildCountryOptions(countriesRaw.value))
// Аудит 2026-09-28, п.10: названия валют были захардкожены на русском независимо от локали.
// Intl.DisplayNames даёт название валюты на текущем языке интерфейса; код валюты (USD, EUR…)
// сам не переводится — это данные, а не текст интерфейса.
const CURRENCY_CODES = ['USD', 'EUR', 'CNY', 'KZT', 'RUB', 'TRY', 'AED', 'GBP']
const CURRENCY_LOCALE_MAP: Record<string, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' }
const currencyDisplayNames = computed(() => {
  try {
    return new Intl.DisplayNames([CURRENCY_LOCALE_MAP[locale.value] || 'ru-RU'], { type: 'currency' })
  } catch {
    return null
  }
})
const currencyName = (code: string): string | null => {
  try {
    return currencyDisplayNames.value?.of(code) ?? null
  } catch {
    return null
  }
}
const CURRENCY_OPTIONS = computed(() => CURRENCY_CODES.map((code) => {
  const name = currencyName(code)
  return { value: code, label: name && name !== code ? `${code} — ${name}` : code }
}))
const responsibilityAccepted = ref(false)
const clientCompanyProfile = ref<ClientCompanyProfileDto | null>(null)

const isClientRole = computed(
  () =>
    (authStore.businessRole || '').toLowerCase() === 'client' ||
    (authStore.role || '').toLowerCase() === 'client',
)
const isAdminRole = computed(() => (authStore.role || '').toLowerCase() === 'administrator')
// Декларант/руководитель могут создать заявку за клиента — фолбэк, если клиент прислал всё в
// мессенджере (аудит 3.13). Основной путь — клиент сам, поэтому кнопка для сотрудника вторичная.
const canCreateStaff = computed(
  () => !isClientRole.value && !isAdminRole.value
    && (authStore.hasPermission('import40.declarant') || authStore.hasPermission('import40.assign')),
)
const canCreate = computed(() => isClientRole.value || isAdminRole.value || canCreateStaff.value)
const canSubmit = computed(
  // Обязательны только Клиент + Груз; Пост/СВХ необязателен (можно заполнить позже).
  () => Boolean(draft.clientId) && draft.cargo.trim().length > 1,
)
// клиент прошёл онбординг ещё не проверен/не завершён — показываем гейт вместо обычного UI создания заявки
const showOnboardingGate = computed(
  () => isClientRole.value && onboardingChecked.value && !registration.complete.value,
)
// Куда вести кнопку гейта: если дело в конкретном разовом документе — сразу на его шаг.
const onboardingGateTarget = computed(() =>
  registration.needNew.value ? `/import-40/company?step=${registration.needNew.value}` : '/import-40/company',
)

// Сервер отдаёт новые сверху; по «Заявка», «Шаг», «Обновлено» можно пересортировать кликом.
const sortDirections: ('descend' | 'ascend')[] = ['descend', 'ascend']
const columns = computed(() => [
  { title: t('import40List.colRequest'), key: 'case', width: 240, sortDirections,
    sorter: (a: Import40CaseDto, b: Import40CaseDto) => a.number.localeCompare(b.number) },
  { title: t('import40List.colStep'), key: 'status', width: 220, sortDirections,
    sorter: (a: Import40CaseDto, b: Import40CaseDto) => a.status - b.status },
  // Исполнитель и состав (контейнеры) — внутренняя кухня сотрудников, клиенту не нужны (3.12, 5.18).
  ...(isClientRole.value ? [] : [
    { title: t('import40List.colExecutor'), key: 'executor', width: 170 },
    { title: t('import40List.colComposition'), key: 'containers', width: 140 },
  ]),
  { title: t('import40List.colUpdated'), key: 'updated', width: 110, sortDirections,
    sorter: (a: Import40CaseDto, b: Import40CaseDto) => Date.parse(a.updatedAtUtc) - Date.parse(b.updatedAtUtc) },
])

const { statusLabel } = useImport40Status()
const declCount = (c: Import40CaseDto) => c.declarations.length

// «Исполнитель»: декларант и/или КПП, «вы» для себя, «свободна» если никто не назначен (3.12).
const executorCell = (c: Import40CaseDto) => {
  const names = [
    c.assignedDeclarantId ? (c.assignedDeclarantId === authStore.userId ? t('import40Case.you') : c.assignedDeclarantName || t('import40Case.staffAssigned')) : null,
    c.assignedKppId ? (c.assignedKppId === authStore.userId ? t('import40Case.you') : c.assignedKppName || t('import40Case.staffAssigned')) : null,
  ].filter((x): x is string => !!x)
  return names.length ? names.join(' · ') : t('import40List.executorFree')
}

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
  draft.receiverCountry = '398'
  draft.currency = 'USD'
  draft.estimatedValue = null
}

// Справочник стран для селектов сторон в мастере.
const loadCountries = async () => {
  if (countriesRaw.value.length) return
  try {
    countriesRaw.value = await referencesApi.listCountries()
  } catch {
    countriesRaw.value = []
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
  draft.receiverCountry = normalizeCountryCode(p.legalCountryCode, countriesRaw.value) || draft.receiverCountry || '398'
}
// «Найти по БИН» (ГБД ЮЛ): получатель — наименование + страна Казахстан (код ОКСМ 398).
const applyReceiverLookup = (c: CompanyLookupDto) => {
  draft.receiverName = c.nameRu ?? c.nameKz ?? draft.receiverName
  draft.receiverCountry = '398'
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
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
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

// «Все заявки»: активные / архив (выполненные и отменённые) — раньше архив был неотличим от работы.
// «Все заявки»: в работе / черновики (клиент ещё не отправил) / архив (выполненные и отменённые) —
// черновики больше не смешиваются с заявками в работе.
type Scope = 'active' | 'drafts' | 'archive'
const scope = ref<Scope>('active')
const scopeOf = (status: number): Scope => (status === 0 ? 'drafts' : status >= 8 ? 'archive' : 'active')
const scopeOptions = computed(() => {
  const count = (s: Scope) => cases.value.filter((c) => scopeOf(c.status) === s).length
  return [
    { label: `${t('import40List.scopeActive')} (${count('active')})`, value: 'active' },
    { label: `${t('import40List.scopeDrafts')} (${count('drafts')})`, value: 'drafts' },
    { label: `${t('import40List.scopeArchive')} (${count('archive')})`, value: 'archive' },
  ]
})
const filteredCases = computed(() => {
  const q = search.value.trim().toLowerCase()
  const byScope = tab.value === 'all'
    ? cases.value.filter((c) => scopeOf(c.status) === scope.value)
    : cases.value
  if (!q) return byScope
  return byScope.filter((c) =>
    [c.number, c.clientName, c.cargo, c.post, statusLabel(c.status)].join(' ').toLowerCase().includes(q),
  )
})

// Название заявки — компания клиента (сервер всё равно берёт его из профиля клиента).
const clientNames = new Map<string, string>()
const syncClientName = () => {
  draft.clientName = (draft.clientId && clientNames.get(draft.clientId)) || ''
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
    clients.forEach((c) => clientNames.set(c.id, c.companyName || c.username))
    clientOptions.value = clients.map((c) => ({
      value: c.id,
      label: c.companyName ? `${c.companyName} (${c.username})` : c.username,
    }))
    if (isClientRole.value && clients.length) {
      draft.clientId = clients[0].id
      draft.clientName = clients[0].companyName || clients[0].username
      void loadOnboardingStatus()
    }
  } finally {
    clientsLoading.value = false
  }
}

// Для роли client — единая проверка регистрации (аудит 5.3/5.4): та же, что у GET
// import40/can-create и у useClientRegistration (плашка/меню/«Моя компания»), чтобы форма
// создания не открывалась там, где сервер всё равно ответит 403.
const loadOnboardingStatus = async () => {
  try {
    await registration.refresh()
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
    message.success(t('import40List.created'))
    router.push(`/import-40/${created.id}`)
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
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
  } catch {
    // Текст ошибки (включая имя файла) уже показал общий перехватчик — аудит 1.1/1.6.
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

const removingFileId = ref<string | null>(null)
const removeUploaded = async (f: Import40FileDto) => {
  const caseId = createdCaseId.value
  if (!caseId) return
  removingFileId.value = f.id
  try {
    await import40Api.deleteFile(caseId, f.id)
    uploadedFiles.value = uploadedFiles.value.filter((x) => x.id !== f.id)
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
  } finally {
    removingFileId.value = null
  }
}

const submitCase = async () => {
  if (!canSubmitWizard.value) return
  submitting.value = true
  try {
    // Сохраняем транспорт/стороны/стоимость/контейнеры, затем отправляем.
    await persistWizardDraft()
    await import40Api.action(createdCaseId.value!, 'submit-for-processing')
    // Клиент после отправки — в «Мои заявки», а не в карточку с шагами сотрудников.
    message.success({ content: t('import40List.submittedClient'), duration: 6 })
    createOpen.value = false
    await router.push('/import-40')
    await reload()
  } catch {
    // Текст ошибки уже показал общий перехватчик (api/client.ts) — не дублируем (аудит 1.1).
  } finally {
    submitting.value = false
  }
}

const finishLater = async () => {
  if (!createdCaseId.value) return
  // Сохраняем то, что уже ввёл клиент, чтобы черновик не потерялся.
  try { await persistWizardDraft() } catch { /* оставляем как есть */ }
  message.info(t('import40List.draftSaved'))
  createOpen.value = false
  await reload()
}

// Закрытие мастера крестиком (аудит 5.10): если черновик уже создан (шаг 1 пройден) — не
// закрываем молча, спрашиваем, сохранить ли текущий ввод. Ничего не создано — просто закрываем.
const closeConfirmOpen = ref(false)
const handleWizardCancel = () => {
  if (createdCaseId.value) {
    closeConfirmOpen.value = true
    return
  }
  createOpen.value = false
  resetCreate()
}
const confirmCloseSave = async () => {
  closeConfirmOpen.value = false
  try { await persistWizardDraft() } catch { /* оставляем как есть */ }
  message.info(t('import40List.draftSaved'))
  createOpen.value = false
  resetCreate()
  await reload()
}
const confirmCloseDiscard = () => {
  closeConfirmOpen.value = false
  // Ничего не отправляем на сервер — черновик остаётся таким, каким был сохранён на шаге 1
  // (аудит 5.10: не терять его молча, явно сказать, что он не потерян).
  message.info(t('import40List.draftKeptAsIs'))
  createOpen.value = false
  resetCreate()
  void reload()
}

// Продолжить заполнение черновика (аудит 5.9) — тот же мастер, что и для новой заявки, но
// без создания: заявка уже есть, подгружаем её поля и файлы в draft.
const continuing = ref(false)
const openContinue = async (id: string) => {
  resetCreate()
  createOpen.value = true
  continuing.value = true
  await loadCountries()
  try {
    const c = await import40Api.get(id)
    createdCaseId.value = c.id
    draft.cargo = c.cargo || ''
    draft.post = c.post || ''
    draft.transportMode = c.transportMode
    draft.vehicleNumber = c.vehicleNumber || ''
    draft.trailerNumber = c.trailerNumber || ''
    draft.driverPhone = c.driverPhone || ''
    draft.wagonNumber = c.wagonNumber || ''
    draft.station = c.station || ''
    draft.flightNumber = c.flightNumber || ''
    draft.airWaybill = c.airWaybill || ''
    draft.vesselName = c.vesselName || ''
    draft.billOfLading = c.billOfLading || ''
    draft.containers = c.containers.map((x) => ({ number: x.containerNumber, type: x.containerType || '' }))
    draft.senderName = c.clientSenderName || ''
    draft.senderCountry = normalizeCountryCode(c.clientSenderCountryCode, countriesRaw.value) || undefined
    draft.receiverName = c.clientReceiverName || ''
    draft.receiverBin = c.clientReceiverBin || ''
    draft.receiverCountry = normalizeCountryCode(c.clientReceiverCountryCode, countriesRaw.value) || '398'
    draft.currency = c.clientCurrencyCode || 'USD'
    draft.estimatedValue = c.clientEstimatedValue ?? null
    uploadedFiles.value = (await import40Api.listFiles(id)).filter((f) => f.section === 'documents')
    if (!clientCompanyProfile.value) void loadClientCompanyProfile()
  } catch {
    message.error(t('import40List.continueFailed'))
    createOpen.value = false
  } finally {
    continuing.value = false
  }
}

const handleDocUpload: UploadProps['customRequest'] = ({ file }) => {
  void uploadDocs(file as File)
}

onMounted(async () => {
  // KPI дашборда ведёт сюда с ?tab=my (аудит L6) — тот же переключатель вкладок, что и ручной клик.
  if (route.query.tab === 'my' || route.query.tab === 'all') tab.value = route.query.tab
  void reload()
  if (canCreate.value) {
    await loadClients()
    void loadPosts()
  }
  // Кнопка «Продолжить заполнение» в карточке заявки ведёт сюда с ?continueId= (аудит 5.9):
  // мастер живёт только здесь, поэтому карточка не может открыть его сама.
  const continueId = route.query.continueId
  if (typeof continueId === 'string' && continueId) {
    await router.replace('/import-40')
    void openContinue(continueId)
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

/* Поле формы = подпись над контролом на всю ширину. Раньше правило было склеено
   с .list-filters (строка-флекс), из-за чего <a-select> схлопывался в узкую полоску
   и выпадающий список постов/СВХ обрезался до одной буквы. */
.create-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.create-grid label :deep(.ant-select),
.create-grid label :deep(.ant-picker) { width: 100%; }

.list-filters { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.list-filters .ant-input-affix-wrapper { max-width: 360px; }

.case-number { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; color: var(--atg-teal, #22b8d0); margin-right: 4px; }

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

.uploaded-list { margin: 10px 0 0; padding: 0; list-style: none; font-size: 13px; display: grid; gap: 2px; }
.uploaded-list li { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.uploaded-name { overflow-wrap: anywhere; }

/* ── Мастер подачи (клиент) ─────────────────────────────────── */
.wizard-loading { display: flex; justify-content: center; margin-bottom: 12px; }
.wizard-steps { margin: 4px 0 18px; }
.wizard-body { min-height: 220px; }
.w-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.w-field > span { color: var(--atg-charcoal); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.wizard-container-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.bin-row { display: flex; gap: 8px; align-items: center; }
.bin-row .ant-input { flex: 1; }
.party-block { margin-bottom: 16px; }
.party-head { display: flex; align-items: center; justify-content: space-between; }
.sub-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--atg-charcoal); margin: 8px 0 8px; }
.doc-checklist { display: flex; flex-direction: column; gap: 6px; margin: 16px 0; }
.responsibility-alert { border-radius: var(--atg-radius-lg); margin-top: 8px; }
.resp-check { margin-top: 10px; font-weight: 600; }
.wizard-nav { display: flex; align-items: center; gap: 10px; margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--atg-line, #eef1f6); }
.wizard-nav-spacer { flex: 1; }
.close-confirm-actions { border-top: none; padding-top: 0; margin-top: 8px; }
.muted { color: var(--atg-muted, #95a1b7); font-size: 13px; margin: 0 0 4px; }

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

.continue-draft-btn {
  align-self: flex-start;
  padding: 0;
  height: auto;
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
