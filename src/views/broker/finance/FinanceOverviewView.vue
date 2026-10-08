<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhDownloadSimple, PhPaperclip } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import NoticeBanner from '@/components/broker/NoticeBanner.vue'
import PeriodChip from '@/components/broker/PeriodChip.vue'
import StatStrip, { type StatItem } from '@/components/broker/StatStrip.vue'
import { financeApi, type FinanceFile, type FinanceRow } from '@/api/manage'
import { import40Api } from '@/api/import40'
import { useAuthStore } from '@/stores/auth'
import { useImport40Status } from '@/composables/useImport40Status'
import { useBlock } from '@/views/home/useBlock'
import { exportXlsx, formatDay, pluralForm } from '@/views/broker/list'
import { formatMoney } from '@/ui/number'
import { saveBlob } from '@/ui/download'
import { message } from '@/ui/message'
import type { ZColumn } from '@/ui/table'
import {
  FINANCE_FILTERS, STATUS_PAID, filterCounts, filterFinance, financeExcelRows, hasInvoice, isAwaitingAqniet, paymentLabel,
  paymentState, paymentTone, stageTone, type FinanceFilter,
} from './finance'

// «Финансы» — обзор (редизайн, волна 3б, доска Finance): счета СВХ, оплаты клиентов и таможенные платежи по заявкам.
// Период уходит на сервер (фильтр по дате создания заявки); поиск и фильтр оплаты — на клиенте. Показатели над
// таблицей — серверные, от поиска и фильтра не зависят. Только просмотр: изменений данных здесь нет.
// Строка открывает заявку, кроме сотрудников, которые видят только финансы (у них нет доступа к заявкам).
const { t, locale } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const { statusLabel } = useImport40Status()

const period = ref<[string, string] | null>(null)
const board = useBlock(true, () => financeApi.overview(period.value?.[0], period.value?.[1], { silent: true }))
onMounted(() => { void board.load() })
const rows = computed<FinanceRow[]>(() => board.data?.rows ?? [])
const loadingFirst = computed(() => board.loading && !board.data)
const ready = computed(() => !board.loading && !board.error)
// Новый период — другие данные: прежние забываем сразу (иначе при ошибке цифры прошлого периода остались бы
// под новой подписью), загрузка — скелетоном, ошибка — полным блоком с «Повторить».
const setPeriod = (v: [string, string] | null) => { period.value = v; page.value = 1; board.reset(); void board.load() }

// ---- Показатели ----
const stats = computed<StatItem[]>(() => {
  const d = board.data
  return [
    { key: 'invoiced', label: t('broker.finance.stat.invoiced'), value: d ? String(d.invoicedCount) : '', hint: d ? formatMoney(d.svhInvoicedTotal) : undefined },
    { key: 'awaiting', label: t('broker.finance.stat.awaiting'), value: d ? String(d.awaitingPaymentCount) : '', tone: 'gold' },
    { key: 'paid', label: t('broker.finance.stat.paid'), value: d ? String(d.paidCount) : '', hint: d ? formatMoney(d.svhPaidTotal) : undefined, tone: 'done' },
    {
      key: 'customs', label: t('broker.finance.stat.customs'), value: d ? formatMoney(d.customsPaymentsTotal) : '',
      hint: d ? t('broker.finance.stat.customsHint', { n: d.rows.reduce((s, r) => s + r.declarationsCount, 0) }) : undefined,
    },
  ]
})

// ---- Плашка: СВХ оплачен, ждём счёта AQNIET (аудит §4.4). По всем строкам периода, без поиска и фильтра ----
const awaiting = computed(() => rows.value.filter(isAwaitingAqniet))
const SHOWN = 3
const expanded = ref(false)
const shownOrders = computed(() => (expanded.value ? awaiting.value : awaiting.value.slice(0, SHOWN)))
const hiddenCount = computed(() => awaiting.value.length - SHOWN)
// «2 заявки оплатили…»: фраза — ключ по числу (один / много), счётчик — слот count с формой существительного
// (ru — один/несколько/много, остальные языки — свои правила).
const banner = computed(() => {
  const n = awaiting.value.length
  const form = pluralForm(n, locale.value)
  return { keypath: `broker.finance.banner.${form === 'one' ? 'one' : 'many'}`, count: `${n} ${t(`broker.finance.noun.${form}`)}` }
})
watch(() => awaiting.value.length, (n) => { if (n <= SHOWN) expanded.value = false })

// ---- Поиск и фильтр оплаты ----
const query = ref('')
const filter = ref<FinanceFilter>('all')
const isFiltered = computed(() => !!query.value.trim() || filter.value !== 'all')
const items = computed(() => filterFinance(rows.value, query.value, filter.value))
const counts = computed(() => filterCounts(rows.value, query.value))
const filterOptions = computed(() => FINANCE_FILTERS.map((f) => ({
  value: f, label: t(`broker.finance.filter.${f}`), count: ready.value ? counts.value[f] : undefined,
})))
const resetFilters = () => { query.value = ''; filter.value = 'all' }
// Страница — управляемая: новый поиск, фильтр или период начинают с первой.
const page = ref(1)
watch([query, filter], () => { page.value = 1 })

// ---- Таблица ----
const columns = computed<ZColumn<FinanceRow>[]>(() => [
  { key: 'request', title: t('broker.finance.col.request'), width: 300 },
  { key: 'stage', title: t('broker.finance.col.stage'), width: 180 },
  { key: 'invoice', title: t('broker.finance.col.invoice'), width: 180 },
  { key: 'payment', title: t('broker.finance.col.payment'), width: 170 },
  { key: 'customs', title: t('broker.finance.col.customs'), width: 140 },
  { key: 'files', title: t('broker.finance.col.files'), width: 150 },
  { key: 'created', title: t('broker.finance.col.created'), width: 110 },
])
const tableWidth = computed(() => columns.value.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : 0), 0))
const pagination = computed(() => ({
  current: page.value,
  onChange: (p: number) => { page.value = p },
  showTotal: (total: number, [from, to]: [number, number]) => t('broker.list.range', { from, to, total }),
}))

const canOpenCase = computed(() => !auth.isFinanceOnly)
const caseHref = (r: FinanceRow) => `/import-40/${r.caseId}`
const customRow = (r: FinanceRow) => (canOpenCase.value
  ? {
    class: 'cursor-pointer',
    onClick: (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest('a,button,input,label')) return
      void router.push(caseHref(r))
    },
  }
  : {})

const stageText = (r: FinanceRow) => (!r.isProblem && r.status === STATUS_PAID ? t('broker.finance.stage.aqniet') : statusLabel(r.status))
const fileKind = (f: FinanceFile) => t(f.section === 'svh-invoice' ? 'broker.finance.fileInvoice' : 'broker.finance.fileCheck')

const download = async (caseId: string, f: FinanceFile) => {
  try {
    const blob = await import40Api.downloadFile(caseId, f.id)
    saveBlob(blob, f.fileName)
  } catch {
    message.error(t('admin.neUdalosSkachatFayl'))
  }
}

// ---- Excel: отфильтрованные строки ----
const exporting = ref(false)
const exportExcel = async () => {
  if (exporting.value || !items.value.length) return
  exporting.value = true
  try {
    await exportXlsx('finance', t('broker.finance.title'), financeExcelRows(items.value, t, statusLabel))
  } catch {
    message.error(t('errors.generic'))
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4" data-finance>
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div class="flex min-w-0 items-center gap-3">
        <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ t('broker.finance.title') }}</h1>
        <span
          v-if="board.data"
          class="rounded-pill bg-sunken px-2.5 text-[12.5px] leading-5 font-semibold tabular-nums text-ink-3"
          data-finance-count
        >{{ rows.length }}</span>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-2 max-sm:w-full">
        <PeriodChip :label="t('broker.list.period')" :value="period" class="max-sm:basis-full" data-finance-period @update:value="setPeriod" />
        <ZButton variant="ghost" :loading="board.loading && !!board.data" class="max-sm:h-11 max-sm:flex-1" data-finance-refresh @click="board.load()">
          <template #icon><PhArrowClockwise :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.refresh') }}
        </ZButton>
        <ZButton
          variant="secondary"
          :loading="exporting"
          :disabled="!items.length"
          :title="items.length ? undefined : t('broker.list.exportEmpty')"
          class="max-sm:h-11 max-sm:flex-1"
          data-finance-export
          @click="exportExcel"
        >
          <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.excel') }}
        </ZButton>
      </div>
    </div>

    <StatStrip v-if="!board.error || board.data" :items="stats" :loading="loadingFirst" data-finance-stats />

    <NoticeBanner v-if="board.data && awaiting.length" tone="gold" data-finance-banner>
      <span class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <i18n-t :keypath="banner.keypath" tag="span" scope="global">
          <template #count><b class="font-semibold">{{ banner.count }}</b></template>
        </i18n-t>
        <span aria-hidden="true">—</span>
        <span class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <RouterLink
            v-for="r in shownOrders"
            :key="r.caseId"
            :to="`/billing?caseId=${r.caseId}`"
            class="inline-flex items-center rounded-field font-mono text-sm font-medium text-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
            :aria-label="t('broker.finance.openInBilling', { number: r.number })"
            data-finance-banner-link
          >{{ r.number }}</RouterLink>
          <button
            v-if="!expanded && hiddenCount > 0"
            type="button"
            class="inline-flex cursor-pointer items-center rounded-field border-0 bg-transparent p-0 font-sans text-sm font-semibold text-gold-ink underline-offset-4 outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
            aria-expanded="false"
            data-finance-banner-more
            @click="expanded = true"
          >{{ t('broker.finance.more', { n: hiddenCount }) }}</button>
        </span>
      </span>
    </NoticeBanner>

    <div class="flex flex-wrap items-center gap-2">
      <ListSearch :value="query" :placeholder="t('broker.finance.search')" @update:value="query = $event" />
      <ZSegmented
        :value="filter"
        :options="filterOptions"
        :aria-label="t('broker.finance.filterLabel')"
        class="max-w-full overflow-x-auto [&_button]:whitespace-nowrap"
        data-finance-filters
        @update:value="filter = $event as FinanceFilter"
      />
    </div>

    <div v-if="board.error && !board.data" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-finance-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.list.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-finance-retry @click="board.load()">{{ t('broker.list.retry') }}</ZButton>
    </div>
    <template v-else>
      <div v-if="board.error" class="flex flex-wrap items-center gap-3 rounded-row bg-tone-danger-bg px-4 py-2" data-finance-error>
        <p class="m-0 min-w-0 flex-1 text-sm text-tone-danger-fg">{{ t('broker.list.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11" data-finance-retry @click="board.load()">{{ t('broker.list.retry') }}</ZButton>
      </div>
      <ZTable
        :columns="columns"
        :data-source="items"
        row-key="caseId"
        :loading="board.loading"
        :custom-row="customRow"
        :pagination="pagination"
        :scroll="{ x: tableWidth }"
        :aria-label="t('broker.finance.tableLabel')"
        class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
        data-finance-table
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'request'" class="block min-w-0">
            <RouterLink
              v-if="canOpenCase"
              :to="caseHref(record)"
              class="inline-flex max-w-full items-center truncate rounded-field font-mono text-sm font-medium text-ink no-underline outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
              :aria-label="t('broker.finance.openCase', { number: record.number })"
              data-finance-link
            >{{ record.number }}</RouterLink>
            <span v-else class="block truncate font-mono text-sm font-medium text-ink" data-finance-number>{{ record.number }}</span>
            <span class="block truncate text-xs text-muted" :title="`${record.clientName} · ${record.cargo}`" data-finance-sub>{{ record.clientName }}<template v-if="record.cargo"> · {{ record.cargo }}</template></span>
          </span>
          <ZTag v-else-if="column.key === 'stage'" :tone="stageTone(record)" data-finance-stage>{{ stageText(record) }}</ZTag>
          <span v-else-if="column.key === 'invoice'" class="block min-w-0">
            <template v-if="hasInvoice(record)">
              <span class="block truncate text-sm font-semibold text-ink tabular-nums" data-finance-invoice>{{ record.svhInvoiceAmount != null ? formatMoney(record.svhInvoiceAmount) : (record.svhInvoiceNote || '—') }}</span>
              <span class="block truncate text-xs text-muted" data-finance-invoice-sub>{{ [record.svhInvoiceNumber ? t('broker.finance.invoiceNo', { number: record.svhInvoiceNumber }) : '', record.invoicedAtUtc ? formatDay(record.invoicedAtUtc) : '', record.svhInvoiceAmount != null ? record.svhInvoiceNote : ''].filter(Boolean).join(' · ') }}</span>
            </template>
            <span v-else class="text-sm text-muted">—</span>
          </span>
          <template v-else-if="column.key === 'payment'">
            <ZTag v-if="paymentTone(paymentState(record))" :tone="paymentTone(paymentState(record))!" data-finance-payment>{{ paymentLabel(paymentState(record), t) }}</ZTag>
            <span v-else class="text-sm text-muted">—</span>
          </template>
          <span v-else-if="column.key === 'customs'" class="block min-w-0">
            <template v-if="record.customsPaymentsKzt">
              <span class="block truncate text-sm font-semibold text-ink tabular-nums" data-finance-customs>{{ formatMoney(record.customsPaymentsKzt) }}</span>
              <span v-if="record.declarationsCount" class="block text-xs text-muted">{{ t('broker.finance.dtCount', { n: record.declarationsCount }) }}</span>
            </template>
            <span v-else class="text-sm text-muted">—</span>
          </span>
          <span v-else-if="column.key === 'files'" class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <ZButton
              v-for="f in record.files"
              :key="f.id"
              variant="link"
              class="text-xs max-sm:h-11"
              :aria-label="t('broker.finance.download', { name: f.fileName })"
              :data-finance-file="f.section"
              @click.stop="download(record.caseId, f)"
            >
              <template #icon><PhPaperclip :size="14" aria-hidden="true" /></template>
              {{ fileKind(f) }}
            </ZButton>
            <span v-if="!record.files.length" class="text-sm text-muted">—</span>
          </span>
          <span v-else-if="column.key === 'created'" class="text-sm text-ink-3 tabular-nums">{{ formatDay(record.createdAtUtc) }}</span>
        </template>
        <template #emptyText>
          <ZEmpty :title="isFiltered ? t('broker.list.nothingFound') : t('broker.finance.empty')" :hint="isFiltered ? t('broker.list.nothingFoundHint') : t('broker.finance.emptyHint')">
            <template v-if="isFiltered" #action>
              <ZButton data-finance-reset @click="resetFilters">{{ t('broker.list.resetFilters') }}</ZButton>
            </template>
          </ZEmpty>
        </template>
      </ZTable>
    </template>
  </div>
</template>
