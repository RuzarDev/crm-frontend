<template>
  <div class="reestr-view">
    <a-card title="Реестр" :bordered="false">
      <template #extra>
        <a-space>
          <a-button v-if="canWrite" type="primary" @click="showCreateModal">
            <PlusOutlined />
            Добавить запись
          </a-button>
          <a-button v-if="canWrite" @click="showUploadModal">
            <UploadOutlined />
            Загрузить Excel
          </a-button>
          <a-button v-if="canDelete" @click="selectAllCurrentPage">
            Выбрать все
          </a-button>
          <a-button v-if="canDelete" @click="clearSelection">
            Снять выбор
          </a-button>
          <a-popconfirm
            v-if="canDelete"
            title="Удалить выбранные записи?"
            ok-text="Да"
            cancel-text="Нет"
            @confirm="handleDeleteSelected"
          >
            <a-button danger :disabled="selectedRowKeys.length === 0">
              Удалить выбранные
            </a-button>
          </a-popconfirm>
        </a-space>
      </template>

      <a-space direction="vertical" style="width: 100%" :size="16">
        <a-space wrap align="center" :size="12">
          <a-input-search
            v-model:value="searchValue"
            placeholder="Поиск по текстовым полям строки…"
            enter-button="Найти"
            @search="handleSearch"
            style="width: 320px; max-width: 100%"
          />
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
        </a-space>

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
              <a-space v-if="canShowActions" size="small" wrap>
                <a-button
                  v-if="isClient"
                  type="link"
                  size="small"
                  @click="openClientView(record, 'documents')"
                >
                  <FileOutlined />
                  Документы
                </a-button>
                <a-button v-if="canWrite" type="link" size="small" @click="handleEdit(record)">
                  <EditOutlined />
                  Изменить
                </a-button>
                <a-button
                  v-if="canChangeStatus"
                  type="link"
                  size="small"
                  title="Сменить статус"
                  @click="openStatusModal(record)"
                >
                  <SwapOutlined />
                  Статус
                </a-button>
                <a-popconfirm
                  v-if="canDelete"
                  title="Удалить эту запись?"
                  ok-text="Да"
                  cancel-text="Нет"
                  @confirm="handleDelete(record.id)"
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
import {
  PlusOutlined,
  UploadOutlined,
  EditOutlined,
  DeleteOutlined,
  SwapOutlined,
  FileOutlined,
} from '@ant-design/icons-vue'
import type { ReestrEntry, ReestrEntryStatus } from '@/types/api'
import { REESTR_COLUMN_KEYS, ReestrEntryStatus as ReestrEntryStatusValues } from '@/types/api'
import { formatReestrCellForDisplay } from '@/utils/reestrFormat'
import { reestrDataToUpsertBody, REESTR_STATUS_OPTIONS } from '@/utils/reestrDtoMap'
import { reestrApi } from '@/api/reestr'
import type { TableProps } from 'ant-design-vue'

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
const formLoading = ref(false)
const currentEntry = ref<ReestrEntry | null>(null)
const formViewMode = ref<'default' | 'client'>('default')
const formInitialTab = ref<'data' | 'documents'>('data')

const statusModalOpen = ref(false)
const statusModalSaving = ref(false)
const statusModalEntry = ref<ReestrEntry | null>(null)
const statusModalValue = ref<ReestrEntryStatus>(ReestrEntryStatusValues.Released)

const reestrStatusSelectOptions = REESTR_STATUS_OPTIONS

const orderedFieldColumns: string[] = [...REESTR_COLUMN_KEYS]

const dynamicFieldColumns = computed(() => {
  const keysFromData = new Set<string>()
  for (const entry of reestrStore.entries) {
    Object.keys(entry.data).forEach((key) => keysFromData.add(key))
  }
  const ordered = orderedFieldColumns.filter((key) => keysFromData.has(key))
  const extra = [...keysFromData].filter((key) => !orderedFieldColumns.includes(key))
  return [...ordered, ...extra].map((key) => ({
    title: key,
    key: `field:${key}`,
    width: 180,
    ellipsis: true,
  }))
})

const canWrite = computed(() => authStore.hasPermission('reestr.write'))
const canDelete = computed(() => authStore.hasPermission('reestr.delete'))
const canChangeStatus = computed(() => authStore.hasPermission('status.change'))
const isClient = computed(() => (authStore.role || '').trim().toLowerCase() === 'client')
const showPortfolioFilters = computed(() => authStore.role === 'expeditor')

const needsUploadClient = computed(() => {
  const role = (authStore.role || '').trim().toLowerCase()
  return role !== 'client' && createClientOptions.value.length > 0
})
const canShowActions = computed(
  () => canWrite.value || canDelete.value || canChangeStatus.value || isClient.value,
)

const columns = computed(() => {
  const baseColumns = [
    {
      title: '№',
      key: 'rowNumber',
      width: 70,
      fixed: 'left' as const,
    },
    ...dynamicFieldColumns.value,
    {
      title: 'Статус',
      key: 'reestrStatus',
      width: 148,
      align: 'center' as const,
      ellipsis: true,
    },
  ]

  if (!canShowActions.value) {
    return baseColumns
  }

  return [
    ...baseColumns,
    {
      title: 'Действия',
      key: 'actions',
      width: isClient.value ? 120 : canChangeStatus.value ? 220 : 180,
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

onMounted(async () => {
  reestrStore.fetchList()
  if (authStore.hasPermission('reestr.write')) {
    const clients = await reestrApi.listClientsForCreate()
    createClientOptions.value = clients.map((c) => ({ value: c.id, label: c.username }))
  }
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

const openClientView = (record: ReestrEntry, tab: 'data' | 'documents' = 'documents') => {
  currentEntry.value = record
  formViewMode.value = 'client'
  formInitialTab.value = tab
  formModalOpen.value = true
}

const showUploadModal = () => {
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
}) => {
  formLoading.value = true
  try {
    const clientId = payload.clientId ?? currentEntry.value?.clientId
    if (!clientId) {
      return
    }
    const body = reestrDataToUpsertBody(payload.data, payload.status, clientId)
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

const handleFileUpload = async (file: File) => {
  if (needsUploadClient.value && !uploadClientId.value) {
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
  max-width: 1400px;
  margin: 0 auto;
}
</style>
