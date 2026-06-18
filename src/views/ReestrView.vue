<template>
  <div class="reestr-view crm-page">
    <div class="reestr-page-header">
      <div class="reestr-page-title-row">
        <div class="crm-page-kicker">Таможенный реестр</div>
        <h1 class="crm-page-title">Реестр</h1>
        <p class="crm-page-subtitle">
          Основная рабочая таблица по заявкам, документам, статусам и клиентским декларациям.
        </p>
      </div>
      <div class="crm-page-actions">
          <a-button v-if="canWrite" type="primary" @click="showCreateModal">
            <PlusOutlined />
            Добавить запись
          </a-button>
          <a-button v-if="canWrite" @click="showUploadModal">
            <UploadOutlined />
            Загрузить Excel
          </a-button>
          <ImportInvoiceButton
            v-if="canWrite"
            :client-options="createClientOptions"
            @imported="reestrStore.fetchList()"
          />
          <a-button :loading="exporting" @click="handleExport">
            <DownloadOutlined />
            Выгрузить реестр
          </a-button>
          <template v-if="canDelete">
            <a-button @click="selectAllCurrentPage">Выбрать все</a-button>
            <a-button @click="clearSelection">Снять выбор</a-button>
            <span class="reestr-action-sep"></span>
            <a-popconfirm
              title="Удалить выбранные записи?"
              ok-text="Да"
              cancel-text="Нет"
              @confirm="handleDeleteSelected"
            >
              <a-button danger :disabled="selectedRowKeys.length === 0">
                <DeleteOutlined />
                Удалить ({{ selectedRowKeys.length }})
              </a-button>
            </a-popconfirm>
          </template>
      </div>
    </div>

    <a-card class="crm-shell-card" :bordered="false">
      <a-space direction="vertical" style="width: 100%" :size="16">
        <div class="crm-toolbar crm-toolbar-surface">
          <a-input
            v-model:value="searchValue"
            placeholder="Поиск по реестру…"
            allow-clear
            @pressEnter="handleSearch"
            @change="handleSearch"
            style="width: 320px; max-width: 100%"
          >
            <template #prefix>
              <SearchOutlined style="color: var(--atg-muted)" />
            </template>
          </a-input>
          <a-select
            v-model:value="reestrStore.statusFilter"
            allow-clear
            placeholder="Все статусы"
            style="width: 240px"
            :options="reestrStatusSelectOptions"
            @change="handleFiltersChange"
          />
          <template v-if="showPortfolioFilters">
            <a-select
              v-model:value="reestrStore.clientFilter"
              allow-clear
              placeholder="Все клиенты"
              style="width: 220px"
              :options="filterClientOptions"
              @change="handleFiltersChange"
            />
            <a-range-picker
              v-model:value="documentDateRange"
              format="DD.MM.YYYY"
              :placeholder="['Дата с', 'Дата по']"
              @change="handleDateRangeChange"
            />
          </template>
        </div>

        <a-table
          :columns="columns"
          :data-source="reestrStore.entries"
          :loading="reestrStore.loading"
          :pagination="pagination"
          :row-selection="rowSelection"
          :row-key="(record: ReestrEntry) => record.id"
          @change="handleTableChange"
          :scroll="{ x: 1000 }"
        >
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.key === 'rowNumber'">
              {{ getRowNumber(index) }}
            </template>

            <template v-else-if="String(column.key).startsWith('field:')">
              {{
                formatReestrCellForDisplay(
                  String(column.key).slice(6),
                  record.data[String(column.key).slice(6)] ?? null,
                )
              }}
            </template>

            <template v-else-if="column.key === 'reestrStatus'">
              <ReestrStatusCell :status="record.status" />
            </template>

            <template v-else-if="column.key === 'actions'">
              <div v-if="canShowActions" class="row-actions">
                <a-tooltip v-if="isClient" title="Документы">
                  <a-button
                    type="text"
                    size="small"
                    class="action-btn"
                    @click="openReadonlyView(record, 'documents')"
                  >
                    <FileOutlined />
                  </a-button>
                </a-tooltip>
                <a-tooltip v-if="isBroker" title="Документы">
                  <a-button
                    type="text"
                    size="small"
                    class="action-btn"
                    @click="openBrokerDocuments(record)"
                  >
                    <FileOutlined />
                  </a-button>
                </a-tooltip>
                <a-tooltip v-if="isExpeditor" title="Просмотр">
                  <a-button
                    type="text"
                    size="small"
                    class="action-btn"
                    @click="openReadonlyView(record, 'data')"
                  >
                    <EyeOutlined />
                  </a-button>
                </a-tooltip>
                <a-tooltip v-if="isExpeditor" title="Документы">
                  <a-button
                    type="text"
                    size="small"
                    class="action-btn"
                    @click="openExpeditorDocuments(record)"
                  >
                    <FileOutlined />
                  </a-button>
                </a-tooltip>
                <a-tooltip v-if="canWrite" title="Изменить">
                  <a-button
                    type="text"
                    size="small"
                    class="action-btn"
                    @click="handleEdit(record)"
                  >
                    <EditOutlined />
                  </a-button>
                </a-tooltip>
                <a-tooltip v-if="canChangeStatus" title="Сменить статус">
                  <a-button
                    type="text"
                    size="small"
                    class="action-btn"
                    @click="openStatusModal(record)"
                  >
                    <SwapOutlined />
                  </a-button>
                </a-tooltip>
                <a-popconfirm
                  v-if="canDelete"
                  title="Удалить эту запись?"
                  ok-text="Да"
                  cancel-text="Нет"
                  @confirm="handleDelete(record.id)"
                >
                  <a-tooltip title="Удалить">
                    <a-button type="text" size="small" class="action-btn action-btn--danger">
                      <DeleteOutlined />
                    </a-button>
                  </a-tooltip>
                </a-popconfirm>
              </div>
            </template>
          </template>
        </a-table>
      </a-space>
    </a-card>

    <ReestrForm
      :open="formModalOpen"
      :loading="formLoading"
      :entry="currentEntry"
      :client-options="createClientOptions"
      :status-history-refresh-key="statusHistoryRefreshKey"
      :view-mode="formViewMode"
      :initial-tab="formInitialTab"
      @submit="handleFormSubmit"
      @cancel="handleFormCancel"
      @applied="reestrStore.fetchList()"
    />

    <a-modal
      v-model:open="uploadModalOpen"
      title="Загрузка Excel файла"
      :footer="null"
      width="600px"
    >
      <a-space direction="vertical" style="width: 100%" :size="16">
        <a-form-item v-if="needsUploadClient" label="Клиент для импорта">
          <a-select
            v-model:value="uploadClientId"
            :options="createClientOptions"
            placeholder="Выберите клиента"
            style="width: 100%"
          />
        </a-form-item>
        <ExcelUpload @upload="handleFileUpload" />
      </a-space>
    </a-modal>

    <a-modal
      v-model:open="statusModalOpen"
      title="Смена статуса"
      ok-text="Сохранить"
      cancel-text="Отмена"
      :confirm-loading="statusModalSaving"
      destroy-on-close
      @ok="handleStatusModalSave"
      @cancel="closeStatusModal"
    >
      <a-form layout="vertical">
        <a-form-item label="Статус">
          <a-select
            v-model:value="statusModalValue"
            :options="reestrStatusSelectOptions"
            placeholder="Выберите статус"
            style="width: 100%"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useReestrStore } from '@/stores/reestr'
import { useAuthStore } from '@/stores/auth'
import ReestrForm from '@/components/ReestrForm.vue'
import ReestrStatusCell from '@/components/ReestrStatusCell.vue'
import ExcelUpload from '@/components/ExcelUpload.vue'
import ImportInvoiceButton from '@/components/ImportInvoiceButton.vue'
import {
  PlusOutlined,
  UploadOutlined,
  DownloadOutlined,
  EditOutlined,
  DeleteOutlined,
  SwapOutlined,
  FileOutlined,
  EyeOutlined,
  SearchOutlined,
} from '@ant-design/icons-vue'
import type { ReestrEntry, ReestrEntryStatus } from '@/types/api'
import { REESTR_COLUMN_KEYS, ReestrEntryStatus as ReestrEntryStatusValues } from '@/types/api'
import { formatReestrCellForDisplay } from '@/utils/reestrFormat'
import { reestrDataToUpsertBody, REESTR_STATUS_OPTIONS } from '@/utils/reestrDtoMap'
import { reestrApi } from '@/api/reestr'
import type { TableProps } from 'ant-design-vue'
import { message } from 'ant-design-vue'

const reestrStore = useReestrStore()
const authStore = useAuthStore()
const createClientOptions = ref<{ value: string; label: string }[]>([])
const filterClientOptions = ref<{ value: string; label: string }[]>([])
const uploadClientId = ref<string | undefined>()
const statusHistoryRefreshKey = ref(0)
const documentDateRange = ref<[Dayjs, Dayjs] | null>(null)

const searchValue = ref('')
const selectedRowKeys = ref<string[]>([])
const formModalOpen = ref(false)
const uploadModalOpen = ref(false)
const exporting = ref(false)
const formLoading = ref(false)
const currentEntry = ref<ReestrEntry | null>(null)
const formViewMode = ref<'default' | 'client' | 'readonly'>('default')
const formInitialTab = ref<'data' | 'documents'>('data')

const statusModalOpen = ref(false)
const statusModalSaving = ref(false)
const statusModalEntry = ref<ReestrEntry | null>(null)
const statusModalValue = ref<ReestrEntryStatus>(ReestrEntryStatusValues.Released)

const reestrStatusSelectOptions = REESTR_STATUS_OPTIONS

const orderedFieldColumns: string[] = [...REESTR_COLUMN_KEYS]

// Колонки где важно видеть полное значение — без обрезания
const fullWidthFields = new Set(['ТД', 'Подкод'])

const fieldColumnWidths: Record<string, number> = {
  '№':                                  60,
  'Дата':                               108,
  'Контейнер':                          148,
  'Получатель':                         190,
  'Станция назначения':                 150,
  'Отправитель':                        170,
  'Отправка':                           108,
  'Груз':                               150,
  'Подкод':                             210,
  'Код ТНВЭД':                          110,
  'Количество мест':                    90,
  'Вес':                                80,
  'ТД':                                 210,
  'Кол-во ТД':                          110,
  'Цена одной ТД, с НДС':              120,
  'Количество доп.листов':              110,
  'Цена одного доп.листа, с НДС':      140,
  'Всего, ДЛ с НДС':                   120,
  'Итого, с НДС':                       110,
}

const fieldColumnLabels: Record<string, string> = {
  '№':                                  '№',
  'Дата':                               'Дата',
  'Контейнер':                          'Контейнер',
  'Получатель':                         'Получатель',
  'Станция назначения':                 'Ст. назнач.',
  'Отправитель':                        'Отправитель',
  'Отправка':                           'Отправка',
  'Груз':                               'Груз',
  'Подкод':                             'Подкод',
  'Код ТНВЭД':                          'ТНВЭД',
  'Количество мест':                    'Мест',
  'Вес':                                'Вес',
  'ТД':                                 'ТД',
  'Кол-во ТД':                          'Кол-во ТД',
  'Цена одной ТД, с НДС':              'Цена ТД',
  'Количество доп.листов':              'Доп. листы',
  'Цена одного доп.листа, с НДС':      'Цена доп.листа',
  'Всего, ДЛ с НДС':                   'Всего ДЛ',
  'Итого, с НДС':                       'Итого',
}

const dynamicFieldColumns = computed(() => {
  const keysFromData = new Set<string>()
  for (const entry of reestrStore.entries) {
    Object.keys(entry.data).forEach((key) => keysFromData.add(key))
  }
  const ordered = orderedFieldColumns.filter((key) => keysFromData.has(key))
  const extra = [...keysFromData].filter((key) => !orderedFieldColumns.includes(key))
  return [...ordered, ...extra].map((key) => ({
    title: fieldColumnLabels[key] ?? key,
    key: `field:${key}`,
    width: fieldColumnWidths[key] ?? 150,
    ellipsis: !fullWidthFields.has(key),
  }))
})

const canWrite = computed(() => authStore.hasPermission('reestr.write'))
const canDelete = computed(() => authStore.hasPermission('reestr.delete'))
const canChangeStatus = computed(() => authStore.hasPermission('status.change'))
const isClient = computed(() => (authStore.role || '').trim().toLowerCase() === 'client')
const isExpeditor = computed(() => (authStore.role || '').trim().toLowerCase() === 'expeditor')
const isBroker = computed(() => (authStore.role || '').trim().toLowerCase() === 'broker')
const isNonClient = computed(() => (authStore.role || '').trim().toLowerCase() !== 'client')
const showPortfolioFilters = computed(() => isExpeditor.value || isBroker.value)

const needsUploadClient = computed(() => isNonClient.value)
const canShowActions = computed(
  () =>
    canWrite.value ||
    canDelete.value ||
    canChangeStatus.value ||
    isClient.value ||
    isExpeditor.value ||
    isBroker.value,
)

const columns = computed(() => {
  const baseColumns = [
    {
      title: '№',
      key: 'rowNumber',
      width: 56,
      fixed: 'left' as const,
    },
    {
      title: 'Статус',
      key: 'reestrStatus',
      width: 186,
    },
    ...dynamicFieldColumns.value,
  ]

  if (!canShowActions.value) {
    return baseColumns
  }

  return [
    ...baseColumns,
    {
      title: 'Действия',
      key: 'actions',
      // клиент/экспедитор: 1 кнопка=50px; брокер: Документы+Изменить+Статус=3 кнопки; admin: Изменить+Статус+Удалить=3
      width: isClient.value || isExpeditor.value ? 50 : 130,
      fixed: 'right' as const,
    },
  ]
})

const rowSelection = computed(() => {
  if (!canDelete.value) {
    return undefined
  }
  return {
    selectedRowKeys: selectedRowKeys.value,
    onChange: (keys: (string | number)[]) => {
      selectedRowKeys.value = keys.map((key) => String(key))
    },
  }
})

const pagination = computed(() => ({
  current: reestrStore.currentPage,
  pageSize: reestrStore.pageSize,
  total: reestrStore.totalCount,
  showSizeChanger: true,
  showTotal: (total: number) => `Всего записей: ${total}`,
  pageSizeOptions: ['10', '20', '50', '100'],
}))

const loadCreateClients = async () => {
  if (!authStore.hasPermission('reestr.write') || !isNonClient.value) {
    return
  }
  const clients = await reestrApi.listClientsForCreate()
  createClientOptions.value = clients.map((c) => ({ value: c.id, label: c.username }))
}

onMounted(async () => {
  reestrStore.fetchList()
  await loadCreateClients()
  if (showPortfolioFilters.value) {
    const clients = await reestrApi.listFilterClients()
    filterClientOptions.value = clients.map((c) => ({ value: c.id, label: c.username }))
  }
})

const getRowNumber = (index: number) => {
  return (reestrStore.currentPage - 1) * reestrStore.pageSize + index + 1
}

const handleSearch = () => {
  reestrStore.setSearch(searchValue.value)
  reestrStore.fetchList()
}

const handleFiltersChange = () => {
  reestrStore.setPage(1)
  selectedRowKeys.value = []
  reestrStore.fetchList()
}

const handleDateRangeChange = (range: [Dayjs, Dayjs] | [string, string] | null) => {
  if (!range || !Array.isArray(range) || range.length !== 2) {
    reestrStore.documentDateFrom = null
    reestrStore.documentDateTo = null
    documentDateRange.value = null
  } else {
    const from = range[0] as Dayjs
    const to = range[1] as Dayjs
    reestrStore.documentDateFrom = from.format('YYYY-MM-DD')
    reestrStore.documentDateTo = to.format('YYYY-MM-DD')
    documentDateRange.value = [from, to]
  }
  handleFiltersChange()
}

const handleTableChange: TableProps['onChange'] = (pagination) => {
  if (pagination.current) {
    reestrStore.setPage(pagination.current)
  }
  if (pagination.pageSize) {
    reestrStore.setPageSize(pagination.pageSize)
  }
  selectedRowKeys.value = []
  reestrStore.fetchList()
}

const resetFormModalMode = () => {
  formViewMode.value = 'default'
  formInitialTab.value = 'data'
}

const showCreateModal = () => {
  resetFormModalMode()
  currentEntry.value = null
  formModalOpen.value = true
}

// Брокер — открывает форму на вкладке документов (не readonly, может загружать)
const openBrokerDocuments = (record: ReestrEntry) => {
  resetFormModalMode()
  currentEntry.value = record
  formInitialTab.value = 'documents'
  formModalOpen.value = true
}

// Экспедитор — открывает форму на вкладке документов (может загружать в секцию клиента)
const openExpeditorDocuments = (record: ReestrEntry) => {
  resetFormModalMode()
  currentEntry.value = record
  formInitialTab.value = 'documents'
  formModalOpen.value = true
}

const openReadonlyView = (record: ReestrEntry, tab: 'data' | 'documents' = 'documents') => {
  currentEntry.value = record
  formViewMode.value = isExpeditor.value ? 'readonly' : 'client'
  formInitialTab.value = tab
  formModalOpen.value = true
}

const showUploadModal = async () => {
  if (needsUploadClient.value && createClientOptions.value.length === 0) {
    await loadCreateClients()
  }
  uploadClientId.value = createClientOptions.value[0]?.value
  uploadModalOpen.value = true
}

const handleEdit = (record: ReestrEntry) => {
  resetFormModalMode()
  currentEntry.value = record
  formModalOpen.value = true
}

const openStatusModal = (record: ReestrEntry) => {
  statusModalEntry.value = record
  statusModalValue.value = record.status
  statusModalOpen.value = true
}

const closeStatusModal = () => {
  statusModalOpen.value = false
  statusModalEntry.value = null
}

const handleStatusModalSave = async () => {
  const entry = statusModalEntry.value
  if (!entry) {
    return
  }
  if (statusModalValue.value === entry.status) {
    closeStatusModal()
    return
  }
  statusModalSaving.value = true
  try {
    const ok = await reestrStore.changeStatus(entry.id, statusModalValue.value)
    if (ok) {
      statusHistoryRefreshKey.value += 1
      closeStatusModal()
    }
  } finally {
    statusModalSaving.value = false
  }
}

const handleFormSubmit = async (payload: {
  data: Record<string, string | null>
  status: ReestrEntryStatus
  clientId?: string
  goods?: import('@/types/api').ReestrGoodsItemInput[]
  doc44?: import('@/types/api').ReestrDoc44ItemInput[]
}) => {
  formLoading.value = true
  try {
    const clientId = payload.clientId ?? currentEntry.value?.clientId
    if (!clientId) {
      return
    }
    const body = reestrDataToUpsertBody(payload.data, payload.status, clientId, payload.goods ?? [], payload.doc44 ?? [])
    let success = false
    if (currentEntry.value) {
      success = await reestrStore.update(currentEntry.value.id, body)
    } else {
      success = await reestrStore.create(body)
    }

    if (success) {
      formModalOpen.value = false
      currentEntry.value = null
    }
  } finally {
    formLoading.value = false
  }
}

const handleFormCancel = () => {
  formModalOpen.value = false
  currentEntry.value = null
  resetFormModalMode()
}

const handleDelete = async (id: string) => {
  await reestrStore.deleteEntry(id)
  selectedRowKeys.value = selectedRowKeys.value.filter((key) => key !== id)
}

const selectAllCurrentPage = () => {
  selectedRowKeys.value = reestrStore.entries.map((entry) => entry.id)
}

const clearSelection = () => {
  selectedRowKeys.value = []
}

const handleDeleteSelected = async () => {
  const ids = [...selectedRowKeys.value]
  const success = await reestrStore.deleteEntries(ids)
  if (success) {
    selectedRowKeys.value = []
  }
}

const handleExport = async () => {
  exporting.value = true
  try {
    const blob = await reestrApi.exportFile({
      search: searchValue.value || undefined,
      status: reestrStore.statusFilter ?? undefined,
      clientId: showPortfolioFilters.value ? (reestrStore.clientFilter ?? undefined) : undefined,
      documentDateFrom: reestrStore.documentDateFrom ?? undefined,
      documentDateTo: reestrStore.documentDateTo ?? undefined,
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `reestr-${dayjs().format('YYYY-MM-DD')}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch {
    message.error('Не удалось выгрузить реестр')
  } finally {
    exporting.value = false
  }
}

const handleFileUpload = async (file: File) => {
  if (needsUploadClient.value && !uploadClientId.value) {
    message.error('Выберите клиента для импорта')
    return
  }
  const clientId = needsUploadClient.value ? uploadClientId.value : undefined
  const success = await reestrStore.uploadFile(file, clientId)
  if (success) {
    uploadModalOpen.value = false
  }
}


</script>

<style scoped>
.reestr-view {
  margin: 0 auto;
}

.reestr-page-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.reestr-page-title-row {
  /* title block — no flex constraint */
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px !important;
  height: 34px !important;
  min-width: 34px !important;
  min-height: 34px !important;
  padding: 0 !important;
  border-radius: 7px !important;
  color: var(--atg-muted) !important;
  background: transparent !important;
  border: none !important;
  font-size: 16px !important;
  transition: color var(--atg-transition), background var(--atg-transition) !important;
}

.action-btn:hover {
  color: var(--atg-accent-strong) !important;
  background: var(--atg-accent-soft) !important;
}

.action-btn--danger {
  color: var(--atg-muted) !important;
}

.action-btn--danger:hover {
  color: var(--atg-red) !important;
  background: rgba(184, 74, 60, 0.08) !important;
}

/* Separator between select-actions and danger delete */
.reestr-action-sep {
  display: inline-block;
  width: 1px;
  height: 24px;
  background: var(--atg-line-strong);
  border-radius: 1px;
  flex-shrink: 0;
}

/* Keep all actions on one line — no wrap */
.reestr-view .crm-page-actions {
  flex-wrap: nowrap;
  align-items: center;
}
</style>
