<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  PhColumns, PhDotsThree, PhDownloadSimple, PhEye, PhFileArrowUp, PhFileText, PhPencilSimple, PhPlus, PhReceipt,
} from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDropdown, { type ZDropdownItem } from '@/components/z/ZDropdown.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTooltip from '@/components/z/ZTooltip.vue'
import ClientCell from '@/components/broker/ClientCell.vue'
import FilterChip from '@/components/broker/FilterChip.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import PeriodChip from '@/components/broker/PeriodChip.vue'
import SelectionBar from '@/components/broker/SelectionBar.vue'
import StatusDot from '@/components/broker/StatusDot.vue'
import ReestrForm from '@/components/ReestrForm.vue'
import ImportInvoiceButton from '@/components/ImportInvoiceButton.vue'
import TransitStatusModal from './TransitStatusModal.vue'
import TransitUploadModal from './TransitUploadModal.vue'
import { reestrApi } from '@/api/reestr'
import { useAuthStore } from '@/stores/auth'
import { useReestrStore } from '@/stores/reestr'
import type {
  ReestrCargoOperationInput, ReestrCarrierInput, ReestrContainerInput, ReestrDoc44ItemInput, ReestrEntry, ReestrEntryStatus,
  ReestrGoodsItemInput, ReestrGuaranteeInput, ReestrIdentificationMeansInput, ReestrOrganizationInput, ReestrPackageInput,
  ReestrPrecedingDocInput, ReestrTransitFields, ReestrTransportMeansInput,
} from '@/types/api'
import { reestrDataToUpsertBody } from '@/utils/reestrDtoMap'
import { formatTnved } from '@/views/broker/requests/requests'
import { formatUpdated } from '@/views/broker/list'
import { message } from '@/ui/message'
import { saveBlob } from '@/ui/download'
import { useConfirm } from '@/ui/confirm'
import { cn } from '@/ui/cn'
import type { ZColumn, ZKey } from '@/ui/table'
import {
  DATA_KEY, OPTIONAL_COLUMNS, TRANSIT_COLUMNS, TRANSIT_STATUSES, cellText, formatAmount, formatContainer, formatQuantity,
  pageTotals, readHiddenColumns, statusKey, statusTone, writeHiddenColumns, type TransitColumnId,
} from './transit'

// «Транзит» (редизайн, волна 3а, доска Transit): реестр транзитных записей с серверной пагинацией по 25.
// Открывают сотрудники брокера, экспедиторы и клиенты с модулем «транзит» — наборы действий по ролям
// те же, что у прежнего ReestrView. Фильтры, страница и поиск живут в сторе (переживают уход с экрана)
// и в поля берутся из него. Консолидационные группы не рисуются: сервер создаёт одну запись на консолидацию.
const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const store = useReestrStore()
const { confirm } = useConfirm()

// ---- Роли (как в прежнем ReestrView) ----
const role = computed(() => (auth.role || '').trim().toLowerCase())
const canWrite = computed(() => auth.hasPermission('reestr.write'))
const canDelete = computed(() => auth.hasPermission('reestr.delete'))
const canChangeStatus = computed(() => auth.hasPermission('status.change'))
const isClient = computed(() => role.value === 'client')
const isExpeditor = computed(() => role.value === 'expeditor')
// Аудит §4.2/4.13: «Документы брокера» — всем сотрудникам с reestr.read (в т.ч. МПП с системной ролью importer).
const isBroker = computed(() => !isExpeditor.value && !isClient.value && auth.hasPermission('reestr.read'))
const showPortfolioFilters = computed(() => isExpeditor.value || isBroker.value)
const needsUploadClient = computed(() => !isClient.value)

// ---- Клиенты: для создания/загрузки/импорта и для фильтра ----
type Option = { value: string; label: string }
const createClientOptions = ref<Option[]>([])
const filterClientOptions = ref<Option[]>([])
const toOptions = (list: { id: string; username: string }[]): Option[] => list.map((c) => ({ value: c.id, label: c.username }))
const loadCreateClients = async () => {
  if (!canWrite.value || isClient.value) return
  try {
    createClientOptions.value = toOptions(await reestrApi.listClientsForCreate())
  } catch {
    // тост показал перехватчик; окна создания/загрузки откроются с пустым списком
  }
}
const loadFilterClients = async () => {
  if (!showPortfolioFilters.value) return
  try {
    filterClientOptions.value = toOptions(await reestrApi.listFilterClients())
  } catch {
    // тост показал перехватчик; фильтр по клиенту останется без вариантов
  }
}

// ---- Выбор строк ----
const selected = ref<string[]>([])
const canSelect = computed(() => canDelete.value || canChangeStatus.value)
const rowSelection = computed(() => (canSelect.value
  ? { selectedRowKeys: selected.value as ZKey[], onChange: (keys: ZKey[]) => { selected.value = keys.map(String) } }
  : undefined))
const selectedEntries = computed(() => store.entries.filter((e) => selected.value.includes(e.id)))

// ---- Загрузка и фильтры (значения — в сторе) ----
const load = () => store.fetchList()
const searchText = ref(store.searchQuery)
// Поиск сменили извне (?q=, сброс фильтров) — показываем его в поле; свой ввод с хвостовым пробелом не трогаем.
watch(() => store.searchQuery, (q) => { if (q !== searchText.value.trim()) searchText.value = q })

const refilter = () => {
  store.setPage(1)
  selected.value = []
  void load()
}
const onSearch = (v: string) => {
  const q = v.trim()
  if (q === store.searchQuery) return
  store.setSearch(q)
  selected.value = []
  void load()
}
const statusValue = computed(() => (store.statusFilter == null ? null : String(store.statusFilter)))
const setStatus = (v: string | null) => {
  store.statusFilter = v == null ? null : (Number(v) as ReestrEntryStatus)
  refilter()
}
const setClient = (v: string | null) => {
  store.clientFilter = v
  refilter()
}
const period = computed<[string, string] | null>(() => (store.documentDateFrom && store.documentDateTo ? [store.documentDateFrom, store.documentDateTo] : null))
const setPeriod = (v: [string, string] | null) => {
  store.documentDateFrom = v?.[0] ?? null
  store.documentDateTo = v?.[1] ?? null
  refilter()
}
const filtered = computed(() => !!store.searchQuery || store.statusFilter != null || !!store.clientFilter || !!store.documentDateFrom || !!store.documentDateTo)
const resetFilters = () => {
  store.setSearch('')
  store.statusFilter = null
  store.clientFilter = null
  store.documentDateFrom = null
  store.documentDateTo = null
  refilter()
}
const statusOptions = computed(() => TRANSIT_STATUSES.map((s) => ({ value: String(s), label: t(`enum.reestrStatus.${statusKey(s)}`) })))

// Переход из сквозного поиска: ?q=контейнер. Читается при открытии и пока экран открыт (уход на другой
// экран с ?q= — не наш поиск: экран ещё жив во время перехода).
const applyQuery = (q: unknown): boolean => {
  if (typeof q !== 'string' || !q.trim()) return false
  store.setSearch(q.trim())
  selected.value = []
  return true
}
watch(() => route.query.q, (q) => { if (route.name === 'reestr' && applyQuery(q)) void load() })

onMounted(() => {
  applyQuery(route.query.q)
  void load()
  void loadCreateClients()
  void loadFilterClients()
})

const updatedText = computed(() => (store.loadedAt ? t('broker.list.updatedAt', { time: formatUpdated(store.loadedAt, new Date(), t) }) : ''))

// ---- Колонки ----
const hidden = ref<TransitColumnId[]>(readHiddenColumns())
const toggleColumn = (key: string) => {
  const id = key as TransitColumnId
  hidden.value = hidden.value.includes(id) ? hidden.value.filter((c) => c !== id) : [...hidden.value, id]
  writeHiddenColumns(hidden.value)
}
const columnItems = computed<ZDropdownItem[]>(() => OPTIONAL_COLUMNS.map((c) => ({ key: c, label: t(`broker.transit.col.${c}`), checked: !hidden.value.includes(c) })))

// На телефоне карточка: контейнер (первым), статус, дата, получатель, груз, «Документы» — остальное скрыто.
const PHONE: TransitColumnId[] = ['container', 'date', 'consignee', 'cargo']
const WIDTH: Record<TransitColumnId, number> = {
  no: 104, date: 100, container: 140, consignee: 210, shipper: 180, station: 130, post: 150, shipment: 110,
  cargo: 180, tnved: 128, subcode: 200, places: 72, weight: 96, td: 150, tdCount: 90, extraSheets: 96, total: 110,
}
const RIGHT: TransitColumnId[] = ['places', 'weight', 'tdCount', 'extraSheets', 'total']
const SUMMED: TransitColumnId[] = ['places', 'weight', 'total']
const shownIds = computed(() => TRANSIT_COLUMNS.filter((c) => !hidden.value.includes(c)))

// Иконки-кнопки строки 30px (на телефоне 44px): сколько их у роли — столько ширины у колонки действий.
const rowMenuItems = computed<ZDropdownItem[]>(() => [
  ...(canChangeStatus.value ? [{ key: 'status', label: t('transit.smenitStatus') }] : []),
  ...(canDelete.value ? [{ key: 'delete', label: t('transit.udalit'), danger: true, divider: canChangeStatus.value }] : []),
])
const showDocuments = computed(() => isClient.value || isExpeditor.value || isBroker.value)
const actionCount = computed(() => [showDocuments.value, isExpeditor.value, canWrite.value, rowMenuItems.value.length > 0].filter(Boolean).length)

type Row = ReestrEntry
const columns = computed<ZColumn<Row>[]>(() => {
  const data = shownIds.value.map((id): ZColumn<Row> => ({
    key: id,
    title: t(`broker.transit.col.${id}`),
    width: WIDTH[id],
    align: RIGHT.includes(id) ? 'right' : undefined,
    className: cn(!PHONE.includes(id) && 'max-sm:hidden', id === 'container' && 'max-sm:-order-1'),
  }))
  const status: ZColumn<Row> = { key: 'status', title: t('broker.transit.col.status'), width: 168 }
  // «№» (не скрывается) — первой, статус — за ней.
  const out = [data[0], status, ...data.slice(1)]
  if (actionCount.value) {
    out.push({ key: 'actions', title: '', width: 24 + actionCount.value * 30 + (actionCount.value - 1) * 4, fixed: 'right', align: 'right' })
  }
  return out
})
const tableWidth = computed(() => columns.value.reduce((s, c) => s + (typeof c.width === 'number' ? c.width : 0), canSelect.value ? 40 : 0))

const pagination = computed(() => ({
  current: store.currentPage,
  pageSize: store.pageSize,
  total: store.totalCount,
  onChange: (page: number, size: number) => {
    store.setPageAndSize(page, size)
    selected.value = []
    void load()
  },
  showTotal: (total: number, [from, to]: [number, number]) => t('broker.list.range', { from, to, total }),
}))

// «Итого по странице»: подпись занимает колонки до первой суммируемой, дальше — суммы под своими колонками.
const summaryLead = computed(() => columns.value.findIndex((c) => SUMMED.includes(c.key as TransitColumnId)))
const summaryTail = computed(() => (summaryLead.value < 0 ? [] : columns.value.slice(summaryLead.value)))
const totalOf = (key: string | undefined, rows: Row[]) => {
  const tt = pageTotals(rows)
  if (key === 'places') return tt.places == null ? '' : formatQuantity(tt.places)
  if (key === 'weight') return tt.weight == null ? '' : formatQuantity(tt.weight)
  if (key === 'total') return tt.total == null ? '' : formatAmount(tt.total)
  return ''
}

// ---- Окно записи (ReestrForm — смонтировано всегда: держит защиту несохранённого при уходе) ----
const formModalOpen = ref(false)
const formLoading = ref(false)
const currentEntry = ref<ReestrEntry | null>(null)
const formViewMode = ref<'default' | 'client' | 'readonly'>('default')
const formInitialTab = ref<'data' | 'documents'>('data')
const statusHistoryRefreshKey = ref(0)
// Ошибка прошлого сохранения не должна всплывать в заново открытой записи.
watch(formModalOpen, (open) => { if (open) store.saveError = null })

const openForm = (entry: ReestrEntry | null, mode: 'default' | 'client' | 'readonly', tab: 'data' | 'documents') => {
  currentEntry.value = entry
  formViewMode.value = mode
  formInitialTab.value = tab
  formModalOpen.value = true
}
const showCreate = () => openForm(null, 'default', 'data')
const handleEdit = (r: ReestrEntry) => openForm(r, 'default', 'data')
// Просмотр без правки: экспедитору — readonly, остальным — клиентский вид.
const openReadonly = (r: ReestrEntry, tab: 'data' | 'documents') => openForm(r, isExpeditor.value ? 'readonly' : 'client', tab)
// Документы: клиент — клиентский вид; экспедитор и сотрудник — форма на вкладке документов (могут загружать).
const openDocuments = (r: ReestrEntry) => (isClient.value ? openReadonly(r, 'documents') : openForm(r, 'default', 'documents'))

interface FormPayload {
  data: Record<string, string | null>
  status: ReestrEntryStatus
  clientId?: string
  goods?: ReestrGoodsItemInput[]
  doc44?: ReestrDoc44ItemInput[]
  transit?: ReestrTransitFields
  organizations?: ReestrOrganizationInput[]
  carriers?: ReestrCarrierInput[]
  transportMeans?: ReestrTransportMeansInput[]
  identificationMeans?: ReestrIdentificationMeansInput[]
  packages?: ReestrPackageInput[]
  containers?: ReestrContainerInput[]
  precedingDocs?: ReestrPrecedingDocInput[]
  cargoOperations?: ReestrCargoOperationInput[]
  guarantees?: ReestrGuaranteeInput[]
}
const handleFormSubmit = async (payload: FormPayload) => {
  formLoading.value = true
  try {
    const clientId = payload.clientId ?? currentEntry.value?.clientId
    if (!clientId) {
      message.error(t('transit.vyberiteKlienta'))
      return
    }
    const body = reestrDataToUpsertBody(
      payload.data, payload.status, clientId, payload.goods ?? [], payload.doc44 ?? [], payload.transit,
      payload.organizations ?? [], payload.carriers ?? [], payload.transportMeans ?? [], payload.identificationMeans ?? [],
      payload.packages ?? [], payload.containers ?? [], payload.precedingDocs ?? [], payload.cargoOperations ?? [], payload.guarantees ?? [],
    )
    const ok = currentEntry.value ? await store.update(currentEntry.value.id, body) : await store.create(body)
    if (ok) {
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
}

// ---- Статус, удаление ----
const statusOpen = ref(false)
const statusEntries = ref<ReestrEntry[]>([])
// Окно открыто из полосы выбора: после смены статуса выбор снимается (даже если выбрана одна строка).
const statusFromBar = ref(false)
const openStatus = (entries: ReestrEntry[], fromBar = false) => {
  if (!entries.length) return
  statusEntries.value = entries
  statusFromBar.value = fromBar
  statusOpen.value = true
}
const onStatusChanged = () => {
  statusHistoryRefreshKey.value += 1
  if (statusFromBar.value) selected.value = []
}

const deleteOne = async (r: ReestrEntry) => {
  const ok = await confirm({ title: t('transit.udalitEtuZapis'), okText: t('transit.udalit'), cancelText: t('transit.otmena'), danger: true })
  if (!ok) return
  await store.deleteEntry(r.id)
  selected.value = selected.value.filter((id) => id !== r.id)
}
const deleteSelected = async () => {
  const ids = [...selected.value]
  if (!ids.length) return
  const ok = await confirm({ title: t('transit.udalitVybrannyeZapisi'), okText: t('transit.udalit'), cancelText: t('transit.otmena'), danger: true })
  if (ok && (await store.deleteEntries(ids))) selected.value = []
}
const onRowMenu = (key: string, r: ReestrEntry) => {
  if (key === 'status') openStatus([r])
  else if (key === 'delete') void deleteOne(r)
}

// ---- Загрузка Excel, импорт из инвойса, выгрузка ----
const uploadOpen = ref(false)
const showUpload = async () => {
  if (needsUploadClient.value && !createClientOptions.value.length) await loadCreateClients()
  uploadOpen.value = true
}
const importer = ref<InstanceType<typeof ImportInvoiceButton>>()
const openImport = () => importer.value?.open()

const exporting = ref(false)
const exportFile = async () => {
  if (exporting.value) return
  exporting.value = true
  try {
    const blob = await reestrApi.exportFile({
      search: store.searchQuery || undefined,
      status: store.statusFilter ?? undefined,
      clientId: showPortfolioFilters.value ? store.clientFilter ?? undefined : undefined,
      documentDateFrom: store.documentDateFrom ?? undefined,
      documentDateTo: store.documentDateTo ?? undefined,
    })
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    saveBlob(blob, `reestr-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.xlsx`)
  } catch {
    message.error(t('transit.neUdalosVygruzitReestr'))
  } finally {
    exporting.value = false
  }
}
// Узкий экран: вторичные действия шапки — в меню «⋯», главное остаётся кнопкой.
const headerMenuItems = computed<ZDropdownItem[]>(() => [
  ...(canWrite.value ? [{ key: 'upload', label: t('broker.transit.uploadExcel'), icon: PhFileArrowUp }, { key: 'import', label: t('broker.transit.importInvoice'), icon: PhReceipt }] : []),
  { key: 'export', label: t('transit.vygruzitReestr'), icon: PhDownloadSimple },
])
const onHeaderMenu = (key: string) => {
  if (key === 'upload') void showUpload()
  else if (key === 'import') openImport()
  else if (key === 'export') void exportFile()
}

const iconBase =
  'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-field border-0 bg-transparent p-0 text-ink-3 outline-hidden hover:bg-sunken hover:text-ink focus-visible:shadow-focus'
const iconBtn = `${iconBase} size-[30px] max-sm:size-11`
// «Документы» на телефоне — кнопка с подписью 44px (в карточке клиента это главное действие).
const docBtn = `${iconBase} h-[30px] w-[30px] max-sm:h-11 max-sm:w-auto max-sm:gap-2 max-sm:bg-sunken max-sm:px-4 max-sm:font-sans max-sm:text-sm max-sm:font-semibold max-sm:text-ink`
const outlineBtn = 'border border-line-strong bg-surface enabled:hover:bg-sunken'
</script>

<template>
  <div data-transit>
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div class="flex min-w-0 items-center gap-3">
          <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.transit.title') }}</h1>
          <span
            v-if="store.loadedAt"
            class="rounded-pill bg-sunken px-2.5 text-[12.5px] leading-5 font-semibold tabular-nums text-ink-3"
            data-transit-count
          >{{ store.totalCount }}</span>
        </div>
        <div class="ml-auto flex flex-wrap gap-2 max-sm:w-full">
          <template v-if="canWrite">
            <ZButton :class="cn(outlineBtn, 'max-xl:hidden')" data-transit-upload @click="showUpload">
              <template #icon><PhFileArrowUp :size="16" aria-hidden="true" /></template>
              {{ t('broker.transit.uploadExcel') }}
            </ZButton>
            <ZButton :class="cn(outlineBtn, 'max-xl:hidden')" data-transit-import @click="openImport">
              <template #icon><PhReceipt :size="16" aria-hidden="true" /></template>
              {{ t('broker.transit.importInvoice') }}
            </ZButton>
          </template>
          <ZButton :loading="exporting" :class="cn(canWrite && 'max-xl:hidden', 'max-sm:h-11 max-sm:flex-1')" data-transit-export @click="exportFile">
            <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
            {{ t('broker.list.excel') }}
          </ZButton>
          <ZDropdown v-if="canWrite" :items="headerMenuItems" @select="onHeaderMenu">
            <ZButton class="xl:hidden max-sm:size-11 max-sm:px-0" :aria-label="t('broker.transit.moreActions')" data-transit-more>
              <PhDotsThree :size="18" weight="bold" aria-hidden="true" />
            </ZButton>
          </ZDropdown>
          <ZButton v-if="canWrite" variant="primary" class="max-sm:h-11 max-sm:flex-1" data-transit-new @click="showCreate">
            <template #icon><PhPlus :size="16" weight="bold" aria-hidden="true" /></template>
            {{ t('broker.transit.newEntry') }}
          </ZButton>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <ListSearch
          :value="searchText"
          :debounce="300"
          :placeholder="t('broker.transit.search')"
         
          @update:value="searchText = $event"
          @search="onSearch"
        />
        <FilterChip :label="t('broker.transit.filter.status')" :options="statusOptions" :value="statusValue" data-transit-filter-status @update:value="setStatus" />
        <template v-if="showPortfolioFilters">
          <FilterChip :label="t('broker.transit.filter.client')" :options="filterClientOptions" :value="store.clientFilter" data-transit-filter-client @update:value="setClient" />
          <PeriodChip :label="t('broker.list.period')" :value="period" data-transit-filter-period @update:value="setPeriod" />
        </template>
        <div class="ml-auto flex items-center gap-2">
          <span v-if="updatedText" class="whitespace-nowrap text-xs text-muted" data-transit-updated>{{ updatedText }}</span>
          <ZDropdown :items="columnItems" @select="toggleColumn">
            <ZButton size="sm" variant="ghost" class="max-sm:hidden" data-transit-columns>
              <template #icon><PhColumns :size="14" aria-hidden="true" /></template>
              {{ t('broker.transit.columns') }}
            </ZButton>
          </ZDropdown>
        </div>
      </div>

      <div
        v-if="store.loadError && !store.entries.length"
        class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4"
        data-transit-error
      >
        <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.list.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-transit-retry @click="load">{{ t('broker.list.retry') }}</ZButton>
      </div>
      <template v-else>
        <div v-if="store.loadError" class="flex flex-wrap items-center gap-3 rounded-row bg-tone-danger-bg px-4 py-2" data-transit-error>
          <p class="m-0 min-w-0 flex-1 text-sm text-tone-danger-fg">{{ t('broker.list.loadError') }}</p>
          <ZButton size="sm" class="max-sm:h-11" data-transit-retry @click="load">{{ t('broker.list.retry') }}</ZButton>
        </div>
        <ZTable
          :columns="columns"
          :data-source="store.entries"
          row-key="id"
          size="small"
          row-class-name="h-11"
          :loading="store.loading"
          :row-selection="rowSelection"
          :pagination="pagination"
          :scroll="{ x: tableWidth }"
          :aria-label="t('broker.transit.tableLabel')"
          class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
          data-transit-table
        >
          <template #headerCell="{ column }">
            <span v-if="column.key === 'actions'" class="sr-only">{{ t('broker.transit.col.actions') }}</span>
          </template>
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'no'" class="block truncate font-mono text-sm text-ink-2" :title="record.data[DATA_KEY.no] ?? undefined">{{ cellText(record, 'no') }}</span>
            <StatusDot v-else-if="column.key === 'status'" :tone="statusTone(record.status)" :label="t(`enum.reestrStatus.${statusKey(record.status)}`)" />
            <span v-else-if="column.key === 'date'" class="whitespace-nowrap tabular-nums text-ink-2">{{ cellText(record, 'date') }}</span>
            <span
              v-else-if="column.key === 'container'"
              class="block truncate font-mono text-sm font-semibold text-ink"
              data-transit-container
            >{{ record.data[DATA_KEY.container] ? formatContainer(record.data[DATA_KEY.container]!) : '—' }}</span>
            <template v-else-if="column.key === 'consignee'">
              <ClientCell v-if="record.data[DATA_KEY.consignee]" :name="record.data[DATA_KEY.consignee]!" />
              <span v-else class="text-muted">—</span>
            </template>
            <span v-else-if="column.key === 'tnved'" class="whitespace-nowrap font-mono text-sm text-ink-2">{{
              record.data[DATA_KEY.tnved] ? formatTnved(record.data[DATA_KEY.tnved]!) : '—'
            }}</span>
            <span v-else-if="column.key === 'td'" class="block truncate font-mono text-sm text-ink-2" :title="record.data[DATA_KEY.td] ?? undefined">{{ cellText(record, 'td') }}</span>
            <span
              v-else-if="column.key === 'places' || column.key === 'weight' || column.key === 'tdCount' || column.key === 'extraSheets'"
              class="tabular-nums"
            >{{ formatQuantity(record.data[DATA_KEY[column.key]]) }}</span>
            <span v-else-if="column.key === 'total'" class="whitespace-nowrap tabular-nums" :class="record.grandTotalWithVat == null ? 'text-muted' : 'text-ink'">{{ formatAmount(record.grandTotalWithVat) }}</span>
            <span
              v-else-if="column.key === 'shipper' || column.key === 'station' || column.key === 'post' || column.key === 'shipment' || column.key === 'cargo' || column.key === 'subcode'"
              class="block truncate"
              :class="cellText(record, column.key) === '—' ? 'text-muted' : 'text-ink'"
              :title="record.data[DATA_KEY[column.key]] ?? undefined"
            >{{ cellText(record, column.key) }}</span>
            <div v-else-if="column.key === 'actions'" class="inline-flex items-center justify-end gap-1 max-sm:w-full max-sm:flex-wrap" data-transit-actions>
              <ZTooltip v-if="isExpeditor" :title="t('transit.prosmotr')">
                <button type="button" :class="iconBtn" :aria-label="t('transit.prosmotr')" data-row-view @click="openReadonly(record, 'data')">
                  <PhEye :size="16" aria-hidden="true" />
                </button>
              </ZTooltip>
              <ZTooltip v-if="showDocuments" :title="t('transit.dokumenty')">
                <button
                  type="button"
                  :class="docBtn"
                  :aria-label="t('transit.dokumenty')"
                  data-row-documents
                  @click="openDocuments(record)"
                >
                  <PhFileText :size="16" aria-hidden="true" />
                  <span class="hidden max-sm:inline">{{ t('transit.dokumenty') }}</span>
                </button>
              </ZTooltip>
              <ZTooltip v-if="canWrite" :title="t('transit.izmenit')">
                <button type="button" :class="iconBtn" :aria-label="t('transit.izmenit')" data-row-edit @click="handleEdit(record)">
                  <PhPencilSimple :size="16" aria-hidden="true" />
                </button>
              </ZTooltip>
              <ZDropdown v-if="rowMenuItems.length" :items="rowMenuItems" @select="onRowMenu($event, record)">
                <button type="button" :class="iconBtn" :aria-label="t('broker.transit.rowMore')" data-row-more>
                  <PhDotsThree :size="18" weight="bold" aria-hidden="true" />
                </button>
              </ZDropdown>
            </div>
          </template>
          <template #summary="{ pageData }">
            <tr v-if="pageData.length && summaryLead >= 0" class="max-sm:hidden" data-transit-summary>
              <td :colspan="summaryLead + (canSelect ? 1 : 0)" class="text-sm font-normal text-ink-3">{{ t('broker.transit.pageTotal') }}</td>
              <td
                v-for="c in summaryTail"
                :key="c.key"
                :class="cn('text-right text-sm tabular-nums text-ink', c.key === 'actions' && 'sticky right-0 bg-canvas')"
                :data-sum="c.key"
              >{{ totalOf(c.key, pageData) }}</td>
            </tr>
          </template>
          <template #emptyText>
            <ZEmpty v-if="filtered" :title="t('broker.list.nothingFound')" :hint="t('broker.list.nothingFoundHint')">
              <template #action>
                <ZButton class="max-sm:h-11" data-transit-reset @click="resetFilters">{{ t('broker.list.resetFilters') }}</ZButton>
              </template>
            </ZEmpty>
            <ZEmpty v-else :title="t('broker.transit.empty')" :hint="canWrite ? t('broker.transit.emptyHint') : undefined">
              <template v-if="canWrite" #action>
                <ZButton variant="primary" class="max-sm:h-11" data-transit-empty-new @click="showCreate">{{ t('broker.transit.newEntry') }}</ZButton>
              </template>
            </ZEmpty>
          </template>
        </ZTable>
      </template>

      <SelectionBar :count="selected.length" class="sticky bottom-3 z-10 self-start" data-transit-selection @clear="selected = []">
        <template #default="{ actionClass }">
          <button v-if="canChangeStatus" type="button" :class="actionClass" data-bulk-status @click="openStatus(selectedEntries, true)">{{ t('transit.smenitStatus') }}</button>
          <button
            v-if="canDelete"
            type="button"
            :class="cn(actionClass, 'bg-transparent text-tone-danger-bg hover:bg-white/10')"
            data-bulk-delete
            @click="deleteSelected"
          >{{ t('transit.udalit') }}</button>
        </template>
      </SelectionBar>
    </div>

    <!-- Окна и скрытый импорт — вне колонки с gap: их корневые узлы не добавляют отступ под списком. -->
    <ReestrForm
      :open="formModalOpen"
      :loading="formLoading"
      :entry="currentEntry"
      :client-options="createClientOptions"
      :status-history-refresh-key="statusHistoryRefreshKey"
      :view-mode="formViewMode"
      :initial-tab="formInitialTab"
      :save-error="store.saveError"
      @submit="handleFormSubmit"
      @cancel="handleFormCancel"
      @applied="load()"
    />
    <TransitStatusModal v-model:open="statusOpen" :entries="statusEntries" @changed="onStatusChanged" />
    <TransitUploadModal v-model:open="uploadOpen" :needs-client="needsUploadClient" :client-options="createClientOptions" />
    <ImportInvoiceButton v-if="canWrite" ref="importer" hide-trigger :client-options="createClientOptions" @imported="load()" />
  </div>
</template>
