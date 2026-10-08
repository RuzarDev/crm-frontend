<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhDownloadSimple, PhFlag } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import ClientCell from '@/components/broker/ClientCell.vue'
import FilterChip from '@/components/broker/FilterChip.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import PeriodChip from '@/components/broker/PeriodChip.vue'
import { registryApi, type RegistryListResponse, type RegistryRowDto } from '@/api/registry'
import { IMPORT40_STATUSES } from '@/api/import40'
import { useImport40Status } from '@/composables/useImport40Status'
import { useBlock } from '@/views/home/useBlock'
import { exportXlsx } from '@/views/broker/list'
import { message } from '@/ui/message'
import { formatDateText } from '@/ui/date'
import type { ZColumn } from '@/ui/table'

// «Сводный реестр» (только администратор; редизайн, волна 3а): заявки Импорта 40 и Транзита одним списком.
// Данные постранично с сервера (25 строк): тип, статус, поиск и период уходят в запрос, любая смена — на страницу 1.
// Поиск — через ListSearch с задержкой 400 мс (запрос по Enter и очистке — сразу).
const { t } = useI18n()
const router = useRouter()
const { statusLabel } = useImport40Status()

type RegistryType = 'all' | 'import40' | 'transit'
const PAGE_SIZE = 25

const type = ref<RegistryType>('all')
const status = ref<string | null>(null)
const q = ref('')
const period = ref<[string, string] | null>(null)
const page = ref(1)

const block = useBlock<RegistryListResponse>(true, () => registryApi.list({
  type: type.value === 'all' ? undefined : type.value,
  status: status.value ?? undefined,
  search: q.value.trim() || undefined,
  from: period.value?.[0],
  to: period.value?.[1],
  page: page.value,
  pageSize: PAGE_SIZE,
}, { silent: true }))
onMounted(() => { void block.load() })

const reload = () => { page.value = 1; void block.load() }
const setType = (v: unknown) => {
  if (v === type.value) return
  type.value = v as RegistryType
  status.value = null // статусы у типов разные
  reload()
}
const setStatus = (v: string | null) => { status.value = v; reload() }
const setPeriod = (v: [string, string] | null) => { period.value = v; reload() }
const onPage = (p: number) => { page.value = p; void block.load() }

// ---- Варианты ----
const typeOptions = computed(() => (['all', 'import40', 'transit'] as const).map((k) => ({ value: k, label: t(`broker.registry.type.${k}`) })))
// Статусы транзита — зеркало меток сервера (TransitStatusLabel).
const TRANSIT_KEYS = ['vRabote', 'podana', 'vypuschena', 'uslovnyyVypusk', 'problemnaya', 'otklonena', 'otozvana', 'arhiv'] as const
const statusOptions = computed(() => {
  if (type.value === 'import40') return IMPORT40_STATUSES.map((s) => ({ value: `import40:${s.id}`, label: statusLabel(s.id) }))
  if (type.value === 'transit') return TRANSIT_KEYS.map((k, i) => ({ value: `transit:${i}`, label: t(`admin.${k}`) }))
  return []
})

// ---- Таблица ----
type Row = RegistryRowDto & { rowKey: string }
const rows = computed<Row[]>(() => (block.data?.items ?? []).map((r) => ({ ...r, rowKey: `${r.serviceType}:${r.id}` })))
const total = computed(() => block.data?.totalCount ?? 0)
const filtered = computed(() => type.value !== 'all' || !!status.value || !!q.value.trim() || !!period.value)

const columns = computed<ZColumn<Row>[]>(() => [
  { key: 'type', title: t('broker.registry.col.type'), width: 120 },
  { key: 'number', title: t('broker.registry.col.number'), width: 150 },
  { key: 'title', title: t('broker.registry.col.title') },
  { key: 'client', title: t('broker.registry.col.client'), width: 190 },
  { key: 'status', title: t('broker.registry.col.status'), width: 190 },
  { key: 'created', title: t('broker.registry.col.created'), width: 104, align: 'right' },
])
const pagination = computed(() => ({
  current: page.value,
  pageSize: PAGE_SIZE,
  total: total.value,
  onChange: onPage,
  showTotal: (n: number, [from, to]: [number, number]) => t('broker.registry.range', { from, to, total: n }),
}))

const typeLabel = (r: RegistryRowDto) => t(`broker.registry.type.${r.serviceType}`)
const created = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return Number.isNaN(d.getTime()) ? '' : formatDateText(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`)
}
// У транзита нет карточки-страницы — открываем реестр модуля.
const target = (r: RegistryRowDto) => (r.serviceType === 'import40' ? `/import-40/${r.id}` : '/reestr')
// Строка кликабельна целиком; ссылка-номер (ctrl/⌘-клик) работает сама.
const customRow = (r: Row) => ({
  class: 'cursor-pointer',
  onClick: (e: MouseEvent) => {
    if ((e.target as HTMLElement | null)?.closest('a,button,input,label')) return
    void router.push(target(r))
  },
})

// ---- Excel: текущая страница (фильтры уже применены сервером) ----
const exporting = ref(false)
const exportExcel = async () => {
  if (exporting.value) return
  exporting.value = true
  try {
    const c = (k: string) => t(`broker.registry.col.${k}`)
    await exportXlsx(t('broker.registry.excelFile'), t('broker.registry.excelSheet'), rows.value.map((r) => ({
      [c('type')]: typeLabel(r),
      [c('number')]: r.number ?? '',
      [c('title')]: r.title,
      [c('client')]: r.clientName,
      [c('status')]: r.statusLabel,
      [c('created')]: created(r.createdAtUtc),
    })))
  } catch {
    message.error(t('errors.generic'))
  } finally {
    exporting.value = false
  }
}

const resetFilters = () => {
  type.value = 'all'
  status.value = null
  q.value = ''
  period.value = null
  reload()
}
</script>

<template>
  <div class="flex flex-col gap-4" data-broker-registry>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div class="flex min-w-0 items-center gap-3">
        <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.registry.title') }}</h1>
        <span
          v-if="block.data"
          class="rounded-pill bg-sunken px-2.5 text-[12.5px] leading-5 font-semibold tabular-nums text-ink-3"
          data-registry-count
        >{{ total }}</span>
      </div>
      <div class="ml-auto flex flex-wrap gap-2 max-sm:w-full">
        <ZButton :loading="exporting" :disabled="!rows.length" class="max-sm:h-11 max-sm:flex-1" data-registry-excel @click="exportExcel">
          <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.excel') }}
        </ZButton>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <ZSegmented
        :value="type"
        :options="typeOptions"
        :aria-label="t('broker.registry.typeLabel')"
        class="max-sm:w-full max-sm:[&>button]:h-11 max-sm:[&>button]:flex-1"
        data-registry-type
        @update:value="setType"
      />
      <ListSearch
        v-model:value="q"
        :placeholder="t('broker.registry.search')"
        :debounce="400"
        class="min-w-0 max-sm:basis-full sm:basis-60 sm:flex-1"
        data-registry-search
        @search="reload"
      />
      <FilterChip v-if="statusOptions.length" :label="t('broker.registry.filter.status')" :options="statusOptions" :value="status" @update:value="setStatus" />
      <PeriodChip :label="t('broker.list.period')" :value="period" @update:value="setPeriod" />
    </div>

    <div v-if="block.error" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-registry-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('admin.neUdalosZagruzitReestr') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-registry-retry @click="block.load()">{{ t('broker.list.retry') }}</ZButton>
    </div>
    <ZTable
      v-else
      :columns="columns"
      :data-source="rows"
      row-key="rowKey"
      :loading="block.loading"
      :custom-row="customRow"
      :pagination="pagination"
      :scroll="{ x: 860 }"
      :aria-label="t('broker.registry.tableLabel')"
      class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
      data-registry-table
    >
      <template #bodyCell="{ column, record }">
        <ZTag v-if="column.key === 'type'" :tone="record.serviceType === 'import40' ? 'info' : 'pay'">{{ typeLabel(record) }}</ZTag>
        <template v-else-if="column.key === 'number'">
          <RouterLink v-if="record.number && record.serviceType === 'import40'" :to="target(record)" class="block truncate rounded-field font-mono text-sm font-medium text-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus" data-registry-link>{{ record.number }}</RouterLink>
          <span v-else-if="record.number" class="block truncate font-mono text-sm text-ink-2">{{ record.number }}</span>
          <span v-else class="text-muted">—</span>
        </template>
        <span v-else-if="column.key === 'title'" class="block truncate text-sm text-ink-2" :title="record.title">{{ record.title }}</span>
        <ClientCell v-else-if="column.key === 'client'" :name="record.clientName" />
        <ZTag v-else-if="column.key === 'status'" :tone="record.isProblem ? 'danger' : 'neutral'">
          <PhFlag v-if="record.isProblem" :size="12" weight="fill" class="mr-1" aria-hidden="true" />{{ record.statusLabel }}
        </ZTag>
        <span v-else-if="column.key === 'created'" class="whitespace-nowrap text-sm tabular-nums text-ink-3">{{ created(record.createdAtUtc) }}</span>
      </template>
      <template #emptyText>
        <ZEmpty :title="t('broker.registry.empty')" :hint="filtered ? t('broker.list.nothingFoundHint') : undefined">
          <template v-if="filtered" #action>
            <ZButton data-registry-reset @click="resetFilters">{{ t('broker.list.resetFilters') }}</ZButton>
          </template>
        </ZEmpty>
      </template>
    </ZTable>
  </div>
</template>
