<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhDownloadSimple } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZSelect from '@/components/z/ZSelect.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import ClientCell from '@/components/broker/ClientCell.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import { clientRegistryApi, REGISTRY_CATEGORIES, type RegistryDocument } from '@/api/clientRegistry'
import { useBlock } from '@/views/home/useBlock'
import { exportXlsx } from '@/views/broker/list'
import { message } from '@/ui/message'
import type { ZColumn } from '@/ui/table'
import {
  docTitle, filterDocs, registryExcelRows, STATUS_FILTERS, STATUS_TONE, statusCounts, validDate, validityHint,
  type CategoryFilter, type StatusFilter,
} from './registry'

// Общий реестр «Документы клиентов» → вкладка «Реестр документов» (волна 17.10, задача 2): контракты, УНК,
// сертификаты, разрешения, лицензии, ТРОИС всех видимых клиентов со сроками. Поиск, категория и статус — на
// клиенте; строка открывает карточку клиента (вкладка «Документы»), Excel — отфильтрованные строки.
const { t } = useI18n()
const router = useRouter()

const board = useBlock(true, () => clientRegistryApi.listAll({ silent: true }))
onMounted(() => { void board.load() })
const items = computed<RegistryDocument[]>(() => board.data ?? [])
const ready = computed(() => !board.loading && !board.error)

const query = ref('')
const category = ref<CategoryFilter>('all')
const status = ref<StatusFilter>('all')
const rows = computed(() => filterDocs(items.value, query.value, category.value, status.value))
const counts = computed(() => statusCounts(items.value, query.value, category.value))
const filtered = computed(() => !!query.value.trim() || category.value !== 'all' || status.value !== 'all')
const resetFilters = () => { query.value = ''; category.value = 'all'; status.value = 'all' }
const categoryOptions = computed(() => [
  { value: 'all', label: t('clientRegistry.allCategories') },
  ...REGISTRY_CATEGORIES.map((c) => ({ value: c, label: t(`clientRegistry.category.${c}`) })),
])
const statusOptions = computed(() => STATUS_FILTERS.map((s) => ({
  value: s,
  label: t(s === 'all' ? 'clientRegistry.allStatuses' : `clientRegistry.status.${s}`),
  count: ready.value ? counts.value[s] : undefined,
})))
const page = ref(1)
watch([query, category, status], () => { page.value = 1 })

const columns = computed<ZColumn<RegistryDocument>[]>(() => [
  { key: 'client', title: t('clientRegistry.col.client'), width: 260 },
  { key: 'doc', title: t('clientRegistry.col.doc'), width: 300 },
  { key: 'status', title: t('clientRegistry.col.status'), width: 140 },
  { key: 'validity', title: t('clientRegistry.col.validity'), width: 170 },
  { key: 'files', title: t('clientRegistry.col.files'), width: 90 },
])
const tableWidth = computed(() => columns.value.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : 0), 0))
const pagination = computed(() => ({
  current: page.value,
  onChange: (p: number) => { page.value = p },
  showTotal: (total: number, [from, to]: [number, number]) => t('broker.list.range', { from, to, total }),
}))

const openClient = (r: RegistryDocument) => { void router.push({ path: `/clients/${r.clientId}`, query: { tab: 'docs' } }) }
const customRow = (r: RegistryDocument) => ({
  class: 'cursor-pointer',
  onClick: (e: MouseEvent) => {
    if ((e.target as HTMLElement | null)?.closest('a,button,input,label')) return
    openClient(r)
  },
})
const hintClass = (r: RegistryDocument) =>
  r.status === 'expired' ? 'font-semibold text-tone-danger-fg' : r.status === 'expiring' ? 'font-semibold text-gold-ink' : 'text-muted'

const exporting = ref(false)
const exportExcel = async () => {
  if (exporting.value || !rows.value.length) return
  exporting.value = true
  try {
    await exportXlsx('client-registry', t('clientRegistry.title'), registryExcelRows(rows.value, t))
  } catch {
    message.error(t('errors.generic'))
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4" data-registry-register>
    <div class="flex flex-wrap items-center gap-2">
      <ListSearch :value="query" :placeholder="t('clientRegistry.registerSearch')" @update:value="query = $event" />
      <ZSelect
        :value="category"
        :options="categoryOptions"
        :aria-label="t('clientRegistry.categoryLabel')"
        class="w-full max-sm:h-11 sm:w-[240px]"
        data-register-category
        @update:value="category = ($event ?? 'all') as CategoryFilter"
      />
      <ZSegmented
        :value="status"
        :options="statusOptions"
        :aria-label="t('clientRegistry.statusLabel')"
        class="max-w-full overflow-x-auto [&_button]:whitespace-nowrap"
        data-register-status
        @update:value="status = $event as StatusFilter"
      />
      <div class="flex flex-wrap gap-2 max-sm:w-full sm:ml-auto">
        <ZButton variant="ghost" :loading="board.loading && !!board.data" class="max-sm:h-11 max-sm:flex-1" data-register-refresh @click="board.load()">
          <template #icon><PhArrowClockwise :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.refresh') }}
        </ZButton>
        <ZButton
          variant="secondary"
          :loading="exporting"
          :disabled="!rows.length"
          :title="rows.length ? undefined : t('broker.list.exportEmpty')"
          class="max-sm:h-11 max-sm:flex-1"
          data-register-export
          @click="exportExcel"
        >
          <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.excel') }}
        </ZButton>
      </div>
    </div>

    <div v-if="board.error && !board.data" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-register-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.list.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" @click="board.load()">{{ t('broker.list.retry') }}</ZButton>
    </div>
    <ZTable
      v-else
      :columns="columns"
      :data-source="rows"
      row-key="id"
      :loading="board.loading"
      :custom-row="customRow"
      :pagination="pagination"
      :scroll="{ x: tableWidth }"
      :aria-label="t('clientRegistry.title')"
      class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
      data-register-table
    >
      <template #bodyCell="{ column, record }">
        <button
          v-if="column.key === 'client'"
          type="button"
          class="flex min-w-0 max-w-full cursor-pointer items-start rounded-field border-0 bg-transparent p-0 text-left font-sans outline-hidden focus-visible:shadow-focus max-sm:min-h-11"
          data-register-client
          @click="openClient(record)"
        >
          <ClientCell :name="record.clientName ?? '—'" class="max-w-full" />
        </button>
        <span v-else-if="column.key === 'doc'" class="block min-w-0">
          <span class="block truncate text-sm font-semibold text-ink" data-register-doc-title>{{ docTitle(record, t) }}</span>
          <span v-if="record.counterparty || record.tnvedCodes" class="block truncate text-xs text-muted">
            {{ [record.counterparty, record.tnvedCodes ? t('clientRegistry.tnvedShort', { codes: record.tnvedCodes }) : null].filter(Boolean).join(' · ') }}
          </span>
        </span>
        <ZTag v-else-if="column.key === 'status'" :tone="STATUS_TONE[record.status]" data-register-status-tag>{{ t(`clientRegistry.status.${record.status}`) }}</ZTag>
        <span v-else-if="column.key === 'validity'" class="block min-w-0">
          <span :class="['block text-sm tabular-nums', record.validUntil ? 'text-ink' : 'text-muted']">{{ validDate(record.validUntil) }}</span>
          <span :class="['block text-xs', hintClass(record)]" data-register-hint>{{ validityHint(record, t) }}</span>
        </span>
        <span v-else-if="column.key === 'files'" class="text-sm tabular-nums text-ink-2">{{ record.files.length }}</span>
      </template>
      <template #emptyText>
        <ZEmpty :title="filtered ? t('broker.list.nothingFound') : t('clientRegistry.registerEmpty')" :hint="filtered ? t('broker.list.nothingFoundHint') : undefined">
          <template v-if="filtered" #action>
            <ZButton data-register-reset @click="resetFilters">{{ t('broker.list.resetFilters') }}</ZButton>
          </template>
        </ZEmpty>
      </template>
    </ZTable>
  </div>
</template>
