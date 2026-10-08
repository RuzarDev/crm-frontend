<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import ClientCell from '@/components/broker/ClientCell.vue'
import FilterChip from '@/components/broker/FilterChip.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import { SALES_QUOTE_STATUS_CODES, type SalesQuoteListItem } from '@/api/sales'
import { formatMoney } from '@/ui/number'
import type { ZColumn } from '@/ui/table'
import { formatDay } from '@/views/broker/list'
import QuoteDrawer from './QuoteDrawer.vue'
import { filterQuotes, quoteNumber, quoteStatusKey, quoteTone } from './sales'

// Список КП (редизайн, волна 3б, доска Quotes): поиск по клиенту и номеру, фильтр статуса — на клиенте.
// Данные грузит экран «Продажи» (счётчик во вкладке); строка открывает панель КП справа.
const props = defineProps<{ rows: SalesQuoteListItem[]; loading: boolean; error: boolean; loaded: boolean }>()
const emit = defineEmits<{ reload: []; newCalc: [] }>()
const { t } = useI18n()

// ---- Поиск и статус ----
const query = ref('')
const status = ref<string | null>(null)
const filtered = computed(() => !!query.value.trim() || status.value !== null)
const items = computed(() => filterQuotes(props.rows, query.value, status.value === null ? null : Number(status.value), t))
const statusOptions = computed(() => SALES_QUOTE_STATUS_CODES.map((code, i) => ({ value: String(i), label: t(`enum.salesQuoteStatus.${code}`) })))
const resetFilters = () => { query.value = ''; status.value = null }
const page = ref(1)
watch([query, status], () => { page.value = 1 })

// ---- Таблица ----
const columns = computed<ZColumn<SalesQuoteListItem>[]>(() => [
  { key: 'kp', title: t('broker.sales.quotes.col.kp'), width: 160 },
  { key: 'client', title: t('broker.sales.quotes.col.client'), width: 260 },
  { key: 'total', title: t('broker.sales.quotes.col.total'), width: 150, align: 'right' },
  { key: 'status', title: t('broker.sales.quotes.col.status'), width: 130 },
  { key: 'author', title: t('broker.sales.quotes.col.author'), width: 140 },
  { key: 'date', title: t('broker.sales.quotes.col.date'), width: 110 },
])
const tableWidth = computed(() => columns.value.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : 0), 0))
const pagination = computed(() => ({
  current: page.value,
  onChange: (p: number) => { page.value = p },
  showTotal: (total: number, [from, to]: [number, number]) => t('broker.list.range', { from, to, total }),
}))

// ---- Панель КП ----
const selectedId = ref<string | null>(null)
const drawerOpen = ref(false)
const selected = computed(() => props.rows.find((r) => r.id === selectedId.value) ?? null)
const openQuote = (r: SalesQuoteListItem) => {
  selectedId.value = r.id
  drawerOpen.value = true
}
const customRow = (r: SalesQuoteListItem) => ({
  class: 'cursor-pointer',
  'data-quote-row': r.id,
  onClick: (e: MouseEvent) => {
    if ((e.target as HTMLElement | null)?.closest('a,button,input,label')) return
    openQuote(r)
  },
})
// Выбранная строка — подсветка и полоса слева, пока открыта панель.
const rowClass = (r: SalesQuoteListItem) =>
  (drawerOpen.value && r.id === selectedId.value ? 'bg-zircon-soft shadow-[inset_3px_0_0_var(--color-zircon)]' : '')
</script>

<template>
  <div class="flex flex-col gap-4" data-quotes>
    <div class="flex flex-wrap items-center gap-2">
      <ListSearch :value="query" :placeholder="t('broker.sales.quotes.search')" @update:value="query = $event" />
      <FilterChip :label="t('broker.sales.quotes.status')" :options="statusOptions" :value="status" data-quotes-status @update:value="status = $event" />
    </div>

    <div v-if="error && !loaded" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-quotes-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.list.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-quotes-retry @click="emit('reload')">{{ t('broker.list.retry') }}</ZButton>
    </div>
    <template v-else>
      <div v-if="error" class="flex flex-wrap items-center gap-3 rounded-row bg-tone-danger-bg px-4 py-2" data-quotes-error>
        <p class="m-0 min-w-0 flex-1 text-sm text-tone-danger-fg">{{ t('broker.list.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11" data-quotes-retry @click="emit('reload')">{{ t('broker.list.retry') }}</ZButton>
      </div>
      <ZTable
        :columns="columns"
        :data-source="items"
        row-key="id"
        :loading="loading && !loaded"
        :row-class-name="rowClass"
        :custom-row="customRow"
        :pagination="pagination"
        :scroll="{ x: tableWidth }"
        :aria-label="t('broker.sales.quotes.tableLabel')"
        class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
        data-quotes-table
      >
        <template #bodyCell="{ column, record }">
          <button
            v-if="column.key === 'kp'"
            type="button"
            class="cursor-pointer border-0 bg-transparent p-0 text-left font-sans text-sm font-semibold whitespace-nowrap text-ink tabular-nums outline-hidden hover:text-zircon-ink focus-visible:shadow-focus max-sm:min-h-11"
            data-quote-number
            @click="openQuote(record)"
          >{{ quoteNumber(record, t) }}</button>
          <ClientCell v-else-if="column.key === 'client'" :name="record.clientName" />
          <span v-else-if="column.key === 'total'" class="text-sm font-semibold whitespace-nowrap text-ink tabular-nums" data-quote-total>{{ formatMoney(record.grandTotal) }}</span>
          <ZTag v-else-if="column.key === 'status'" :tone="quoteTone(record.status)" data-quote-status>{{ quoteStatusKey(record.status) ? t(quoteStatusKey(record.status)) : '—' }}</ZTag>
          <span v-else-if="column.key === 'author'" class="block truncate text-sm text-ink-2">{{ record.createdByName }}</span>
          <span v-else-if="column.key === 'date'" class="text-sm whitespace-nowrap text-ink-2 tabular-nums">{{ formatDay(record.createdAtUtc) }}</span>
        </template>
        <template #emptyText>
          <ZEmpty
            :title="filtered ? t('broker.list.nothingFound') : t('sales.kpPokaNet')"
            :hint="filtered ? t('broker.list.nothingFoundHint') : t('broker.sales.quotes.emptyHint')"
          >
            <template #action>
              <ZButton v-if="filtered" data-quotes-reset @click="resetFilters">{{ t('broker.list.resetFilters') }}</ZButton>
              <ZButton v-else variant="primary" data-quotes-new @click="emit('newCalc')">{{ t('broker.sales.tab.calc') }}</ZButton>
            </template>
          </ZEmpty>
        </template>
      </ZTable>
    </template>

    <QuoteDrawer v-model:open="drawerOpen" :row="selected" @changed="emit('reload')" />
  </div>
</template>
