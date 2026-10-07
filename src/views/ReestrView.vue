<template>
  <div class="reestr-view crm-page">
    <PageHeader
      stacked
      :kicker="t('transit.tamozhennyyReestr')"
      :title="t('transit.reestr')"
      :subtitle="t('transit.osnovnayaRabochayaTablicaPo')"
    >
      <template #actions>
          <a-button v-if="canWrite" type="primary" @click="showCreateModal">
            <PlusOutlined /> {{ t('transit.dobavitZapis') }} </a-button>
          <a-button v-if="canWrite" @click="showUploadModal">
            <UploadOutlined /> {{ t('transit.zagruzitExcel') }} </a-button>
          <ImportInvoiceButton
            v-if="canWrite"
            :client-options="createClientOptions"
            @imported="reestrStore.fetchList()"
          />
          <a-button :loading="exporting" @click="handleExport">
            <DownloadOutlined /> {{ t('transit.vygruzitReestr') }} </a-button>
          <template v-if="canDelete">
            <a-button @click="selectAllCurrentPage">{{ t('transit.vybratVse') }}</a-button>
            <a-button v-if="selectedRowKeys.length > 0" @click="clearSelection">{{ t('transit.snyatVybor') }}</a-button>
            <span class="reestr-action-sep"></span>
            <a-popconfirm
              :title="t('transit.udalitVybrannyeZapisi')"
              :ok-text="t('transit.da')"
              :cancel-text="t('transit.net')"
              @confirm="handleDeleteSelected"
            >
              <a-button v-if="selectedRowKeys.length > 0" danger>
                <DeleteOutlined />
                {{ t('transit.udalitN', { n: selectedRowKeys.length }) }}
              </a-button>
            </a-popconfirm>
          </template>
      </template>
    </PageHeader>

    <a-card class="crm-shell-card" :bordered="false">
      <a-space direction="vertical" style="width: 100%" :size="16">
        <div class="crm-toolbar crm-toolbar-surface crm-filter-bar">
          <a-input
            v-model:value="searchValue"
            :placeholder="t('transit.poiskPoReestru')"
            allow-clear
            @pressEnter="handleSearch"
            @change="handleSearch"
          >
            <template #prefix>
              <SearchOutlined style="color: var(--z-muted)" />
            </template>
          </a-input>
          <a-select
            v-model:value="reestrStore.statusFilter"
            allow-clear
            :placeholder="t('transit.vseStatusy')"
            :options="reestrStatusSelectOptions"
            @change="handleFiltersChange"
          />
          <template v-if="showPortfolioFilters">
            <a-select
              v-model:value="reestrStore.clientFilter"
              allow-clear
              :placeholder="t('transit.vseKlienty')"
              :options="filterClientOptions"
              @change="handleFiltersChange"
            />
            <a-range-picker
              v-model:value="documentDateRange"
              format="DD.MM.YYYY"
              :placeholder="[t('transit.dataS'), t('transit.dataPo')]"
              @change="handleDateRangeChange"
            />
          </template>
        </div>

        <a-table
          :columns="columns"
          :data-source="tableDataSource"
          :loading="reestrStore.loading"
          :pagination="pagination"
          :row-selection="rowSelection"
          :row-key="(record: ReestrTableRow) => record.id"
          @change="handleTableChange"
          :scroll="{ x: 1000 }"
        >
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.key === 'rowNumber'">
              <template v-if="record.isConsolidationGroup">—</template>
              <template v-else-if="record.isConsolidationChild">↳</template>
              <template v-else>{{ getRowNumber(index) }}</template>
            </template>

            <template v-else-if="String(column.key).startsWith('field:')">
              <template v-if="record.isConsolidationGroup">
                <template v-if="String(column.key).slice(6) === 'Количество мест'">
                  {{ record.groupPlaces ?? '—' }}
                </template>
                <template v-else-if="String(column.key).slice(6) === 'Вес'">
                  {{ record.groupWeight ?? '—' }}
                </template>
                <template v-else>—</template>
              </template>
              <template v-else>
                {{
                  formatReestrCellForDisplay(
                    String(column.key).slice(6),
                    record.data[String(column.key).slice(6)] ?? null,
                  )
                }}
              </template>
            </template>

            <template v-else-if="column.key === 'reestrStatus'">
              <a-tag v-if="record.isConsolidationGroup" color="blue">
                {{ t('transit.konsolidaciyaPoz', { n: record.groupCount }) }}
              </a-tag>
              <ReestrStatusCell v-else :status="record.status" />
            </template>

            <template v-else-if="column.key === 'actions'">
              <div v-if="canShowActions && !record.isConsolidationGroup" class="row-actions">
                <a-tooltip v-if="isClient" :title="t('transit.dokumenty')">
                  <a-button
                    type="text"
                    size="small"
                    class="action-btn"
                    @click="openReadonlyView(record, 'documents')"
                  >
                    <FileOutlined />
                  </a-button>
                </a-tooltip>
                <a-tooltip v-if="isBroker" :title="t('transit.dokumenty')">
                  <a-button
                    type="text"
                    size="small"
                    class="action-btn"
                    @click="openBrokerDocuments(record)"
                  >
                    <FileOutlined />
                  </a-button>
                </a-tooltip>
                <a-tooltip v-if="isExpeditor" :title="t('transit.prosmotr')">
                  <a-button
                    type="text"
                    size="small"
                    class="action-btn"
                    @click="openReadonlyView(record, 'data')"
                  >
                    <EyeOutlined />
                  </a-button>
                </a-tooltip>
                <a-tooltip v-if="isExpeditor" :title="t('transit.dokumenty')">
                  <a-button
                    type="text"
                    size="small"
                    class="action-btn"
                    @click="openExpeditorDocuments(record)"
                  >
                    <FileOutlined />
                  </a-button>
                </a-tooltip>
                <a-tooltip v-if="canWrite" :title="t('transit.izmenit')">
                  <a-button
                    type="text"
                    size="small"
                    class="action-btn"
                    @click="handleEdit(record)"
                  >
                    <EditOutlined />
                  </a-button>
                </a-tooltip>
                <a-tooltip v-if="canChangeStatus" :title="t('transit.smenitStatus')">
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
                  :title="t('transit.udalitEtuZapis')"
                  :ok-text="t('transit.da')"
                  :cancel-text="t('transit.net')"
                  @confirm="handleDelete(record.id)"
                >
                  <a-tooltip :title="t('transit.udalit')">
                    <a-button type="text" size="small" class="action-btn action-btn--danger" :title="$t('common.delete')" :aria-label="$t('common.delete')">
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
      :save-error="reestrStore.saveError"
      @submit="handleFormSubmit"
      @cancel="handleFormCancel"
      @applied="reestrStore.fetchList()"
    />

    <a-modal
      v-model:open="uploadModalOpen"
      :title="t('transit.zagruzkaExcelFayla')"
      :footer="null"
      width="520px"
    >
      <a-space direction="vertical" style="width: 100%" :size="16">
        <a-form-item v-if="needsUploadClient" :label="t('transit.klientDlyaImporta')">
          <a-select
            v-model:value="uploadClientId"
            :options="createClientOptions"
            :placeholder="t('transit.vyberiteKlienta')"
            style="width: 100%"
          />
        </a-form-item>
        <ExcelUpload @upload="handleFileUpload" />
      </a-space>
    </a-modal>

    <a-modal
      v-model:open="statusModalOpen"
      :title="t('transit.smenaStatusa')"
      :ok-text="t('transit.sohranit')"
      :cancel-text="t('transit.otmena')"
      :confirm-loading="statusModalSaving"
      destroy-on-close
      @ok="handleStatusModalSave"
      @cancel="closeStatusModal"
    >
      <a-form layout="vertical">
        <a-form-item :label="t('transit.status')">
          <a-select
            v-model:value="statusModalValue"
            :options="reestrStatusSelectOptions"
            :placeholder="t('transit.vyberiteStatus')"
            style="width: 100%"
          />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
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
import { reestrDataToUpsertBody, reestrStatusOptions } from '@/utils/reestrDtoMap'
import { reestrApi } from '@/api/reestr'
import type { TableProps } from 'ant-design-vue'
import { message } from 'ant-design-vue'
import PageHeader from '@/components/PageHeader.vue'

const { t } = useI18n()

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

const reestrStatusSelectOptions = computed(() => reestrStatusOptions())

// --- Консолидация в реестре ---
// Клиентская группировка строк текущей страницы по sourceConsolidationId.
// ВНИМАНИЕ: бэк пока НЕ отдаёт это поле в ответе списка (см. types/api.ts,
// ReestrEntryDto.sourceConsolidationId) — до тех пор группы не формируются,
// все строки рендерятся как раньше.
interface ReestrTableRow extends ReestrEntry {
  isConsolidationGroup?: boolean
  isConsolidationChild?: boolean
  groupCount?: number
  groupPlaces?: number | null
  groupWeight?: number | null
  children?: ReestrTableRow[]
}

const parseNumericField = (value: string | null | undefined): number | null => {
  if (value == null || value === '') {
    return null
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const sumField = (entries: ReestrEntry[], key: string): number | null => {
  let sum = 0
  let hasValue = false
  for (const entry of entries) {
    const n = parseNumericField(entry.data[key])
    if (n != null) {
      sum += n
      hasValue = true
    }
  }
  return hasValue ? sum : null
}

const tableDataSource = computed<ReestrTableRow[]>(() => {
  const list = reestrStore.entries
  const membersByGroup = new Map<string, ReestrEntry[]>()
  for (const entry of list) {
    const cid = entry.sourceConsolidationId
    if (!cid) {
      continue
    }
    if (!membersByGroup.has(cid)) {
      membersByGroup.set(cid, [])
    }
    membersByGroup.get(cid)!.push(entry)
  }

  const seenGroups = new Set<string>()
  const result: ReestrTableRow[] = []
  for (const entry of list) {
    const cid = entry.sourceConsolidationId
    if (!cid) {
      result.push(entry)
      continue
    }
    const members = membersByGroup.get(cid) ?? [entry]
    if (members.length < 2) {
      // Одиночная запись — консолидация её не касается визуально.
      result.push(entry)
      continue
    }
    if (seenGroups.has(cid)) {
      // Остальные члены группы уже показаны как дочерние строки.
      continue
    }
    seenGroups.add(cid)
    result.push({
      ...members[0],
      id: `consolidation:${cid}`,
      isConsolidationGroup: true,
      groupCount: members.length,
      groupPlaces: sumField(members, t('transit.kolichestvoMest')),
      groupWeight: sumField(members, t('transit.ves')),
      children: members.map((member) => ({ ...member, isConsolidationChild: true })),
    })
  }
  return result
})

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
  'Количество доп.листов':              110,
}

const fieldColumnLabels = computed((): Record<string, string> => ({

  '№':                                  '№',
  'Дата':                               t('transit.data'),
  'Контейнер':                          t('transit.konteyner'),
  'Получатель':                         t('transit.poluchatel'),
  'Станция назначения':                 t('transit.stNaznach'),
  'Отправитель':                        t('transit.otpravitel'),
  'Отправка':                           t('transit.otpravka'),
  'Груз':                               t('transit.gruz'),
  'Подкод':                             t('transit.podkod'),
  'Код ТНВЭД':                          t('transit.tnved'),
  'Количество мест':                    t('transit.mest'),
  'Вес':                                t('transit.ves'),
  'ТД':                                 t('transit.td'),
  'Кол-во ТД':                          t('transit.kolVoTd'),
  'Количество доп.листов':              t('transit.dopListy'),
}))
const dynamicFieldColumns = computed(() => {
  const keysFromData = new Set<string>()
  for (const entry of reestrStore.entries) {
    Object.keys(entry.data).forEach((key) => keysFromData.add(key))
  }
  const ordered = orderedFieldColumns.filter((key) => keysFromData.has(key))
  const extra = [...keysFromData].filter((key) => !orderedFieldColumns.includes(key))
  return [...ordered, ...extra].map((key) => ({
    title: fieldColumnLabels.value[key] ?? key,
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
// Аудит §4.2/4.13: раньше «Документы брокера» показывались только системной роли broker —
// МПП с системной ролью importer (вкладка «Сотрудники») их не видел, хотя имеет reestr.read.
const isBroker = computed(() => !isExpeditor.value && !isClient.value && authStore.hasPermission('reestr.read'))
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
      title: t('transit.status'),
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
      title: t('transit.deystviya'),
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
    getCheckboxProps: (record: ReestrTableRow) => ({ disabled: !!record.isConsolidationGroup }),
  }
})

const pagination = computed(() => ({
  current: reestrStore.currentPage,
  pageSize: reestrStore.pageSize,
  total: reestrStore.totalCount,
  showSizeChanger: true,
  showTotal: (total: number) => t('transit.vsegoZapisey', { n: total }),
  pageSizeOptions: ['10', '20', '50', '100'],
}))

const loadCreateClients = async () => {
  if (!authStore.hasPermission('reestr.write') || !isNonClient.value) {
    return
  }
  const clients = await reestrApi.listClientsForCreate()
  createClientOptions.value = clients.map((c) => ({ value: c.id, label: c.username }))
}

const route = useRoute()

onMounted(async () => {
  // Переход из сквозного поиска (аудит §4.13) — приходит ?q=контейнер/получатель и сразу фильтрует список.
  const q = route.query.q
  if (typeof q === 'string' && q.trim()) {
    searchValue.value = q.trim()
    reestrStore.setSearch(searchValue.value)
  }
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

// Ошибка прошлого сохранения не должна всплывать в заново открытой записи.
watch(formModalOpen, (open) => { if (open) reestrStore.saveError = null })

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
  transit?: import('@/types/api').ReestrTransitFields
  organizations?: import('@/types/api').ReestrOrganizationInput[]
  carriers?: import('@/types/api').ReestrCarrierInput[]
  transportMeans?: import('@/types/api').ReestrTransportMeansInput[]
  identificationMeans?: import('@/types/api').ReestrIdentificationMeansInput[]
  packages?: import('@/types/api').ReestrPackageInput[]
  containers?: import('@/types/api').ReestrContainerInput[]
  precedingDocs?: import('@/types/api').ReestrPrecedingDocInput[]
  cargoOperations?: import('@/types/api').ReestrCargoOperationInput[]
  guarantees?: import('@/types/api').ReestrGuaranteeInput[]
}) => {
  formLoading.value = true
  try {
    const clientId = payload.clientId ?? currentEntry.value?.clientId
    if (!clientId) {
      return
    }
    const body = reestrDataToUpsertBody(
      payload.data,
      payload.status,
      clientId,
      payload.goods ?? [],
      payload.doc44 ?? [],
      payload.transit,
      payload.organizations ?? [],
      payload.carriers ?? [],
      payload.transportMeans ?? [],
      payload.identificationMeans ?? [],
      payload.packages ?? [],
      payload.containers ?? [],
      payload.precedingDocs ?? [],
      payload.cargoOperations ?? [],
      payload.guarantees ?? [],
    )
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
    message.error(t('transit.neUdalosVygruzitReestr'))
  } finally {
    exporting.value = false
  }
}

const handleFileUpload = async (file: File) => {
  if (needsUploadClient.value && !uploadClientId.value) {
    message.error(t('transit.vyberiteKlientaDlyaImporta'))
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

.row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

:not(#z) .action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  min-width: 34px;
  min-height: 34px;
  padding: 0;
  border-radius: 7px;
  color: var(--z-muted);
  background: transparent;
  border: none;
  font-size: 16px;
  transition: color var(--z-transition), background var(--z-transition);
}

:not(#z) .action-btn:hover {
  color: var(--z-teal-d);
  background: var(--z-teal-soft);
}

:not(#z) .action-btn--danger {
  color: var(--z-muted);
}

:not(#z) .action-btn--danger:hover {
  color: var(--z-danger);
  background: rgba(184, 74, 60, 0.08);
}

/* Separator between select-actions and danger delete */
.reestr-action-sep {
  display: inline-block;
  width: 1px;
  height: 24px;
  background: var(--z-line-strong);
  border-radius: 1px;
  flex-shrink: 0;
}

/* Keep all actions on one line — no wrap.
   :deep, потому что .crm-page-actions живёт внутри PageHeader. */
.reestr-view :deep(.crm-page-actions) {
  flex-wrap: nowrap;
  align-items: center;
}
</style>
