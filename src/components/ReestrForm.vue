<template>
  <a-modal
    :open="open"
    :title="modalTitle"
    :ok-text="isClientView ? undefined : t('transit.sohranit')"
    :cancel-text="isClientView ? undefined : t('transit.otmena')"
    :confirm-loading="loading"
    :ok-button-props="isClientView ? { style: { display: 'none' } } : undefined"
    @ok="handleSubmit"
    @cancel="handleCancel"
    :width="showTabs ? '1040px' : '760px'"
  >
    <template v-if="isClientView" #footer>
      <a-button type="primary" @click="handleCancel">{{ t('transit.zakryt') }}</a-button>
    </template>

    <a-alert
      v-if="saveError && !isClientView"
      type="error"
      show-icon
      class="save-alert"
      :message="t('transit.zapisNeSohranena')"
      :description="t('transit.zapisNeSohranenaText', { reason: saveError })"
    />

    <a-tabs v-if="showTabs" v-model:activeKey="activeTab">
      <a-tab-pane key="data" :tab="t('transit.dannye')">
        <div class="form-body">
          <TnvedDeprecationAlert :warning="entry?.deprecationWarning" />
          <ReestrFormFields
            :form-state="formState"
            :is-edit="isEdit"
            :readonly="isClientView"
            :client-options="clientOptions"
            :can-pick-status="canPickStatusInForm"
            :status-options="reestrStatusOptions"
          />
        </div>
      </a-tab-pane>
      <a-tab-pane key="documents" :tab="t('transit.dokumenty')">
        <ReestrDocumentsPanel
          v-if="entry?.id"
          :reestr-id="entry.id"
          :entry-status="entry.status"
          :readonly="isReadonlyView"
          @applied="emit('applied')"
        />
      </a-tab-pane>
      <a-tab-pane v-if="!isClientView" key="history" :tab="t('transit.istoriyaStatusov')">
        <ReestrStatusHistoryPanel
          v-if="entry?.id"
          :reestr-id="entry.id"
          :refresh-key="statusHistoryRefreshKey"
        />
      </a-tab-pane>
      <a-tab-pane key="comments" :tab="t('transit.kommentarii')">
        <ReestrCommentsPanel
          v-if="entry?.id"
          :reestr-id="entry.id"
          :readonly="isClientView"
        />
      </a-tab-pane>
    </a-tabs>
    <div v-else class="form-body">
      <ReestrFormFields
        :form-state="formState"
        :is-edit="isEdit"
        :client-options="clientOptions"
        :can-pick-status="canPickStatusInForm"
        :status-options="reestrStatusOptions"
      />
    </div>
  </a-modal>

  <!-- Диалог в шаблоне, а не Modal.confirm: программные модалки не подхватывают стили темы. -->
  <a-modal
    v-model:open="closeConfirmOpen"
    :title="t('transit.zakrytBezSohraneniyaTitle')"
    :ok-text="t('transit.zakrytBezSohraneniya')"
    :ok-button-props="{ danger: true }"
    :cancel-text="t('transit.vernutsyaKZapisi')"
    width="520px"
    @ok="discardAndClose"
  >
    <p>{{ t('transit.zakrytBezSohraneniyaText') }}</p>
  </a-modal>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRef, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import type {
  ReestrEntry,
  ReestrEntryStatus,
  ReestrGoodsItemInput,
  ReestrDoc44ItemInput,
  ReestrTransitFields,
  ReestrOrganizationInput,
  ReestrCarrierInput,
  ReestrTransportMeansInput,
  ReestrIdentificationMeansInput,
  ReestrPackageInput,
  ReestrContainerInput,
  ReestrPrecedingDocInput,
  ReestrCargoOperationInput,
  ReestrGuaranteeInput,
} from '@/types/api'
import { REESTR_COLUMN_KEYS } from '@/types/api'
import { ReestrEntryStatus as ReestrEntryStatusValues } from '@/types/api'
import { useAuthStore } from '@/stores/auth'
import { formatReestrDateForForm, normalizeReestrFieldsForSubmit } from '@/utils/reestrFormat'
import { reestrStatusOptions as reestrStatusOptionsList, REESTR_TRANSIT_DEFAULTS } from '@/utils/reestrDtoMap'
import { message } from '@/ui/message'
import { useTransitTotals } from '@/composables/useTransitTotals'
import ReestrDocumentsPanel from '@/components/ReestrDocumentsPanel.vue'
import ReestrStatusHistoryPanel from '@/components/ReestrStatusHistoryPanel.vue'
import ReestrFormFields from '@/components/ReestrFormFields.vue'
import TnvedDeprecationAlert from '@/components/TnvedDeprecationAlert.vue'
import ReestrCommentsPanel from '@/components/ReestrCommentsPanel.vue'

const { t } = useI18n()

type ViewMode = 'default' | 'client' | 'readonly'
type FormTab = 'data' | 'documents' | 'comments'

interface Props {
  open: boolean
  loading: boolean
  entry?: ReestrEntry | null
  clientOptions?: { value: string; label: string }[]
  statusHistoryRefreshKey?: number
  viewMode?: ViewMode
  initialTab?: FormTab
  saveError?: string | null
}

interface Emits {
  (
    e: 'submit',
    payload: {
      data: Record<string, string | null>
      status: ReestrEntryStatus
      clientId?: string
      goods: ReestrGoodsItemInput[]
      doc44: ReestrDoc44ItemInput[]
      transit: ReestrTransitFields
      organizations: ReestrOrganizationInput[]
      carriers: ReestrCarrierInput[]
      transportMeans: ReestrTransportMeansInput[]
      identificationMeans: ReestrIdentificationMeansInput[]
      packages: ReestrPackageInput[]
      containers: ReestrContainerInput[]
      precedingDocs: ReestrPrecedingDocInput[]
      cargoOperations: ReestrCargoOperationInput[]
      guarantees: ReestrGuaranteeInput[]
    },
  ): void
  (e: 'cancel'): void
  (e: 'applied'): void
}

const props = withDefaults(defineProps<Props>(), {
  viewMode: 'default',
  initialTab: 'data',
})
const emit = defineEmits<Emits>()
const authStore = useAuthStore()

const reestrStatusOptions = computed(() => reestrStatusOptionsList())
const activeTab = ref<FormTab | 'history' | 'comments'>('data')

const isReadonlyView = computed(
  () => props.viewMode === 'client' || props.viewMode === 'readonly',
)
const isClientView = isReadonlyView
const isEdit = computed(() => !!props.entry)
const showTabs = computed(() => isEdit.value || isClientView.value)

const modalTitle = computed(() => {
  if (isClientView.value) {
    return t('transit.deklaraciya')
  }
  return isEdit.value ? t('transit.izmenitZapis') : t('transit.sozdatZapis')
})

const canPickStatusInForm = computed(
  () => !isClientView.value && (!isEdit.value || authStore.hasPermission('status.change')),
)

const formState = reactive<{
  fields: Record<string, string | null>
  status: ReestrEntryStatus
  clientId?: string
  sealNumber: string | null
  packagingType: string | null
  goods: ReestrGoodsItemInput[]
  doc44: ReestrDoc44ItemInput[]
  transit: ReestrTransitFields
  organizations: ReestrOrganizationInput[]
  carriers: ReestrCarrierInput[]
  transportMeans: ReestrTransportMeansInput[]
  identificationMeans: ReestrIdentificationMeansInput[]
  packages: ReestrPackageInput[]
  containers: ReestrContainerInput[]
  precedingDocs: ReestrPrecedingDocInput[]
  cargoOperations: ReestrCargoOperationInput[]
  guarantees: ReestrGuaranteeInput[]
}>({
  fields: {},
  status: ReestrEntryStatusValues.InProgress,
  clientId: undefined,
  sealNumber: null,
  packagingType: null,
  goods: [],
  doc44: [],
  transit: { ...REESTR_TRANSIT_DEFAULTS },
  organizations: [],
  carriers: [],
  transportMeans: [],
  identificationMeans: [],
  packages: [],
  containers: [],
  precedingDocs: [],
  cargoOperations: [],
  guarantees: [],
})

// КЕДЕН-транзит: автопересчёт §1 «Общие сведения» из товаров — только при правке товаров;
// загрузка записи в форму (loadEntry) итоги не трогает.
const transitTotals = useTransitTotals(
  toRef(() => formState.goods),
  toRef(() => formState.transit),
)

// Ключ колонки даты — константа (ключи data — русские названия колонок реестра, не переводятся).
const DATE_KEY = 'Дата'

const loadEntry = () => {
  const nextFields: Record<string, string | null> = {}
  for (const key of REESTR_COLUMN_KEYS) {
    const raw = props.entry?.data[key] ?? null
    nextFields[key] = key === DATE_KEY ? formatReestrDateForForm(raw) : raw
  }
  formState.fields = nextFields
  formState.status = props.entry?.status ?? ReestrEntryStatusValues.InProgress
  formState.clientId = props.entry?.clientId ?? props.clientOptions?.[0]?.value
  formState.sealNumber = props.entry?.data['№ Пломбы'] ?? null
  formState.packagingType = props.entry?.data['Вид упаковки'] ?? null
  formState.goods = [...(props.entry?.goods ?? [])]
  formState.doc44 = [...(props.entry?.doc44 ?? [])]
  // Дефолты КЕДЕН-транзита предзаполняются только для новой записи;
  // при редактировании — значения из существующей записи.
  formState.transit = props.entry
    ? { ...props.entry.transit }
    : { ...REESTR_TRANSIT_DEFAULTS }
  formState.organizations = [...(props.entry?.organizations ?? [])]
  formState.carriers = [...(props.entry?.carriers ?? [])]
  formState.transportMeans = [...(props.entry?.transportMeans ?? [])]
  formState.identificationMeans = [...(props.entry?.identificationMeans ?? [])]
  formState.packages = [...(props.entry?.packages ?? [])]
  formState.containers = [...(props.entry?.containers ?? [])]
  formState.precedingDocs = [...(props.entry?.precedingDocs ?? [])]
  formState.cargoOperations = [...(props.entry?.cargoOperations ?? [])]
  formState.guarantees = [...(props.entry?.guarantees ?? [])]
  // Товары только что загружены — это точка отсчёта, а не правка: сохранённые итоги остаются.
  transitTotals.rebase()
  // Снимок — после того как вложенные поля применили свои значения по умолчанию.
  snapshot.value = null
  void nextTick(() => { snapshot.value = JSON.stringify(formState) })
}

// Открытие окна — загрузить запись и встать на начальную вкладку. Запись заменили при открытом окне
// (перечитали после автозаполнения на вкладке «Документы») — форма пересобирается, вкладка остаётся.
watch(
  [() => props.open, () => props.entry],
  ([open, entry], [wasOpen, prevEntry]) => {
    if (!open) {
      snapshot.value = null
      return
    }
    if (!wasOpen) {
      activeTab.value = props.initialTab
      loadEntry()
    } else if (entry !== prevEntry) {
      loadEntry()
    }
  },
)

// Несохранённые правки = форма отличается от снимка на момент открытия (до снимка — правок нет).
const snapshot = ref<string | null>(null)
const dirty = computed(
  () => props.open && !isClientView.value && snapshot.value !== null && JSON.stringify(formState) !== snapshot.value,
)

// Закрыть/обновить вкладку или уйти со страницы с несохранёнными правками — только после вопроса.
const onBeforeUnload = (e: BeforeUnloadEvent) => {
  if (dirty.value || (props.open && props.loading)) { e.preventDefault(); e.returnValue = '' }
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
onBeforeRouteLeave(() => (dirty.value ? window.confirm(t('transit.ujtiBezSohraneniyaZapis')) : true))

const handleSubmit = () => {
  if (isClientView.value) {
    handleCancel()
    return
  }

  // На вкладках «Документы»/«Комментарии» кнопка просто закрывает окно — но не теряя правок вкладки «Данные».
  if (isEdit.value && activeTab.value !== 'data' && !dirty.value) {
    emit('cancel')
    return
  }

  const hasAnyValue = Object.values(formState.fields).some((value) =>
    Boolean(value && String(value).trim()),
  )
  if (!hasAnyValue) {
    message.error(t('transit.zapolniteHotyaByOdno'))
    return
  }

  if (!isEdit.value && props.clientOptions?.length && !formState.clientId) {
    message.error(t('transit.vyberiteKlienta'))
    return
  }

  emit('submit', {
    // Сервер перезаписывает все поля записи: ключи data, которых форма не показывает (например «Пост»),
    // уходят как были в исходной записи; показанные — из формы.
    data: normalizeReestrFieldsForSubmit({
      ...(props.entry?.data ?? {}),
      ...formState.fields,
      '№ Пломбы': formState.sealNumber,
      'Вид упаковки': formState.packagingType,
    }),
    status: canPickStatusInForm.value
      ? formState.status
      : (props.entry?.status ?? ReestrEntryStatusValues.InProgress),
    clientId: formState.clientId,
    goods: formState.goods,
    doc44: formState.doc44,
    transit: formState.transit,
    organizations: formState.organizations,
    carriers: formState.carriers,
    transportMeans: formState.transportMeans,
    identificationMeans: formState.identificationMeans,
    packages: formState.packages,
    containers: formState.containers,
    precedingDocs: formState.precedingDocs,
    cargoOperations: formState.cargoOperations,
    guarantees: formState.guarantees,
  })
}

// «Отмена», крестик, Esc и клик мимо окна: с несохранёнными правками — сначала спросить.
const closeConfirmOpen = ref(false)
const handleCancel = () => {
  if (dirty.value) {
    closeConfirmOpen.value = true
    return
  }
  emit('cancel')
}
const discardAndClose = () => {
  closeConfirmOpen.value = false
  emit('cancel')
}
</script>

<style scoped>
.save-alert {
  margin-bottom: 12px;
}
.form-body {
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 4px;
}
</style>
