<template>
  <a-modal
    :open="open"
    :title="modalTitle"
    :ok-text="isClientView ? undefined : 'Сохранить'"
    :cancel-text="isClientView ? undefined : 'Отмена'"
    :confirm-loading="loading"
    :ok-button-props="isClientView ? { style: { display: 'none' } } : undefined"
    @ok="handleSubmit"
    @cancel="handleCancel"
    :width="showTabs ? '960px' : '800px'"
  >
    <template v-if="isClientView" #footer>
      <a-button type="primary" @click="handleCancel">Закрыть</a-button>
    </template>

    <a-tabs v-if="showTabs" v-model:activeKey="activeTab">
      <a-tab-pane key="data" tab="Данные">
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
      <a-tab-pane key="documents" tab="Документы">
        <ReestrDocumentsPanel
          v-if="entry?.id"
          :reestr-id="entry.id"
          :entry-status="entry.status"
          :readonly="isReadonlyView"
          @applied="emit('applied')"
        />
      </a-tab-pane>
      <a-tab-pane v-if="!isClientView" key="history" tab="История статусов">
        <ReestrStatusHistoryPanel
          v-if="entry?.id"
          :reestr-id="entry.id"
          :refresh-key="statusHistoryRefreshKey"
        />
      </a-tab-pane>
      <a-tab-pane key="comments" tab="Комментарии">
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
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { ReestrEntry, ReestrEntryStatus, ReestrGoodsItemInput, ReestrDoc44ItemInput } from '@/types/api'
import { REESTR_COLUMN_KEYS } from '@/types/api'
import { ReestrEntryStatus as ReestrEntryStatusValues } from '@/types/api'
import { useAuthStore } from '@/stores/auth'
import { formatReestrDateForForm, normalizeReestrFieldsForSubmit } from '@/utils/reestrFormat'
import { REESTR_STATUS_OPTIONS } from '@/utils/reestrDtoMap'
import { message } from 'ant-design-vue'
import ReestrDocumentsPanel from '@/components/ReestrDocumentsPanel.vue'
import ReestrStatusHistoryPanel from '@/components/ReestrStatusHistoryPanel.vue'
import ReestrFormFields from '@/components/ReestrFormFields.vue'
import TnvedDeprecationAlert from '@/components/TnvedDeprecationAlert.vue'
import ReestrCommentsPanel from '@/components/ReestrCommentsPanel.vue'

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

const reestrStatusOptions = REESTR_STATUS_OPTIONS
const activeTab = ref<FormTab | 'history' | 'comments'>('data')

const isReadonlyView = computed(
  () => props.viewMode === 'client' || props.viewMode === 'readonly',
)
const isClientView = isReadonlyView
const isEdit = computed(() => !!props.entry)
const showTabs = computed(() => isEdit.value || isClientView.value)

const modalTitle = computed(() => {
  if (isClientView.value) {
    return 'Декларация'
  }
  return isEdit.value ? 'Изменить запись' : 'Создать запись'
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
}>({
  fields: {},
  status: ReestrEntryStatusValues.InProgress,
  clientId: undefined,
  sealNumber: null,
  packagingType: null,
  goods: [],
  doc44: [],
})

watch(
  () => props.open,
  (newVal) => {
    if (newVal) {
      activeTab.value = props.initialTab
      const nextFields: Record<string, string | null> = {}
      for (const key of REESTR_COLUMN_KEYS) {
        const raw = props.entry?.data[key] ?? null
        nextFields[key] = key === 'Дата' ? formatReestrDateForForm(raw) : raw
      }
      formState.fields = nextFields
      formState.status = props.entry?.status ?? ReestrEntryStatusValues.InProgress
      formState.clientId = props.entry?.clientId ?? props.clientOptions?.[0]?.value
      formState.sealNumber = props.entry?.data['№ Пломбы'] ?? null
      formState.packagingType = props.entry?.data['Вид упаковки'] ?? null
      formState.goods = [...(props.entry?.goods ?? [])]
      formState.doc44 = [...(props.entry?.doc44 ?? [])]
    }
  },
)

const handleSubmit = () => {
  if (isClientView.value) {
    handleCancel()
    return
  }

  if (isEdit.value && activeTab.value !== 'data') {
    handleCancel()
    return
  }

  const hasAnyValue = Object.values(formState.fields).some((value) =>
    Boolean(value && String(value).trim()),
  )
  if (!hasAnyValue) {
    message.error('Заполните хотя бы одно поле')
    return
  }

  if (!isEdit.value && props.clientOptions?.length && !formState.clientId) {
    message.error('Выберите клиента')
    return
  }

  emit('submit', {
    data: normalizeReestrFieldsForSubmit({
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
  })
}

const handleCancel = () => {
  emit('cancel')
}
</script>

<style scoped>
.form-body {
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 4px;
}
</style>
