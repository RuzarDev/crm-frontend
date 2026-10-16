<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowClockwise, PhDownloadSimple } from '@phosphor-icons/vue'
import FilterChip from '@/components/broker/FilterChip.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZDate from '@/components/z/ZDate.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import { tnvedEecApi, type EecDiscrepancy, type EecDiscrepancyKind, type EecDiscrepancyQuery, type EecDiscrepancyReport } from '@/api/tnvedEec'
import { exportXlsx, formatDay, todayIso } from '@/views/broker/list'
import { formatCount } from '@/views/broker/references/system/systemData'
import { cleanName, formatTnvedCode } from '@/views/references/tnvedShared'
import { message } from '@/ui/message'
import type { ZColumn } from '@/ui/table'
import {
  DISCREPANCY_KINDS, P, countOf, discrepancyExcelRows, discrepancyLabel, discrepancyTone, footnotePeriod, pendingReasonLabel,
} from './eec'

// Вкладка «Расхождения с КЕДЕН»: ставка ЕТТ ЕЭК на дату ↔ ставка КЕДЕН по каждому коду загруженных групп.
// Сервер считает отчёт на запрос и режет на страницы; вид (вкладки со счётчиками), группа, поиск (начало кода,
// название или номер сноски) и дата — параметрами запроса. «Excel» выгружает все строки текущего отбора.
const PAGE_SIZE = 50
const EXPORT_PAGE_SIZE = 1000
const EXPORT_MAX_PAGES = 30
const SEARCH_DEBOUNCE_MS = 400
const { t, locale } = useI18n()

const kind = ref<EecDiscrepancyKind | 'all'>('all')
const group = ref<string | null>(null)
const query = ref('')
const appliedQuery = ref('')
const date = ref<string | null>(todayIso())
const page = ref(1)

const report = shallowRef<EecDiscrepancyReport | null>(null)
const loading = ref(true)
const error = ref(false)
let seq = 0
const params = (): EecDiscrepancyQuery => ({
  date: date.value || undefined,
  kind: kind.value === 'all' ? null : kind.value,
  group: group.value,
  q: appliedQuery.value.trim() || undefined,
})
const load = async () => {
  const my = ++seq
  loading.value = true
  error.value = false
  try {
    const { data } = await tnvedEecApi.discrepancies({ ...params(), page: page.value, pageSize: PAGE_SIZE })
    if (my === seq) report.value = data
  } catch {
    if (my === seq) error.value = true
  } finally {
    if (my === seq) loading.value = false
  }
}
onMounted(() => { void load() })
const props = defineProps<{ version?: number }>()
watch(() => props.version, () => { void load() })

let timer: ReturnType<typeof setTimeout> | undefined
watch(query, (v) => {
  clearTimeout(timer)
  timer = setTimeout(() => { appliedQuery.value = v }, SEARCH_DEBOUNCE_MS)
})
onBeforeUnmount(() => { clearTimeout(timer); seq += 1 })
watch([kind, group, appliedQuery, date], () => {
  page.value = 1
  void load()
})

const total = computed(() => report.value?.total ?? 0)
const counts = computed(() => report.value?.counts as Record<string, number> | undefined)
const allCount = computed(() => DISCREPANCY_KINDS.reduce((s, k) => s + countOf(counts.value, k), 0))
const num = (n: number) => formatCount(n, locale.value)
const kindOptions = computed(() => [
  { value: 'all', label: t(`${P}.disc.all`), count: report.value ? allCount.value : undefined },
  ...DISCREPANCY_KINDS.map((k) => ({ value: k, label: discrepancyLabel(k, t), count: report.value ? countOf(counts.value, k) : undefined })),
])
const groupOptions = computed(() => (report.value?.groupsLoaded ?? []).map((g) => ({ value: g, label: t(`${P}.group`, { n: g }) })))
const filtered = computed(() => kind.value !== 'all' || !!group.value || !!appliedQuery.value.trim())
const resetFilters = () => { kind.value = 'all'; group.value = null; query.value = ''; appliedQuery.value = '' }
const noGroups = computed(() => !!report.value && !report.value.groupsLoaded.length)

const columns = computed<ZColumn<EecDiscrepancy>[]>(() => [
  { key: 'code', title: t(`${P}.disc.col.code`), width: 260, cardLead: true },
  { key: 'kind', title: t(`${P}.disc.col.kind`), width: 170 },
  { key: 'eec', title: t(`${P}.disc.col.eec`), width: 180 },
  { key: 'keden', title: t(`${P}.disc.col.keden`), width: 150 },
  { key: 'footnote', title: t(`${P}.disc.col.footnoteShort`), width: 230 },
  { key: 'edition', title: t(`${P}.disc.col.edition`), width: 120 },
])
const tableWidth = computed(() => columns.value.reduce((s, c) => s + (typeof c.width === 'number' ? c.width : 0), 0))
const pagination = computed(() => ({
  current: page.value,
  pageSize: PAGE_SIZE,
  total: total.value,
  onChange: (p: number) => { page.value = p; void load() },
  showTotal: (n: number, [from, to]: [number, number]) => t('broker.list.range', { from, to, total: n }),
}))
const treeTo = (code: string) => ({ path: '/tnved/tree', query: { code } })

// ---- Excel: все страницы текущего отбора ----
const exporting = ref(false)
const exportExcel = async () => {
  if (exporting.value || !total.value) return
  exporting.value = true
  try {
    const rows: EecDiscrepancy[] = []
    for (let p = 1; p <= EXPORT_MAX_PAGES; p += 1) {
      const { data } = await tnvedEecApi.discrepancies({ ...params(), page: p, pageSize: EXPORT_PAGE_SIZE })
      rows.push(...data.items)
      if (rows.length >= data.total || !data.items.length) break
    }
    await exportXlsx(`eec-keden-${date.value || todayIso()}`, t(`${P}.tabs.discrepancies`), discrepancyExcelRows(rows, t))
  } catch {
    message.error(t('errors.generic'))
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4" data-eec-disc>
    <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
      <p class="m-0 min-w-0 flex-1 basis-72 text-sm text-ink-3 text-pretty">{{ t(`${P}.disc.sub`) }}</p>
      <div class="flex flex-wrap gap-2 max-sm:w-full">
        <ZButton variant="ghost" :loading="loading && !!report" class="max-sm:h-11 max-sm:flex-1" data-eec-disc-refresh @click="load">
          <template #icon><PhArrowClockwise :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.refresh') }}
        </ZButton>
        <ZButton
          variant="secondary"
          :loading="exporting"
          :disabled="!total"
          :title="total ? undefined : t('broker.list.exportEmpty')"
          class="max-sm:h-11 max-sm:flex-1"
          data-eec-disc-export
          @click="exportExcel"
        >
          <template #icon><PhDownloadSimple :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.excel') }}
        </ZButton>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <ListSearch :value="query" :placeholder="t(`${P}.disc.search`)" data-eec-disc-search @update:value="query = $event" />
      <FilterChip
        :label="t(`${P}.groupLabel`)"
        :all-label="t(`${P}.allGroups`)"
        :options="groupOptions"
        :value="group"
        data-eec-disc-group
        @update:value="group = $event"
      />
      <label class="inline-flex items-center gap-2 text-sm text-ink-2">
        <span class="whitespace-nowrap">{{ t(`${P}.disc.onDate`) }}</span>
        <ZDate v-model:value="date" size="sm" class="w-36 max-sm:h-11" data-eec-disc-date />
      </label>
    </div>
    <ZSegmented
      :value="kind"
      :options="kindOptions"
      :aria-label="t(`${P}.disc.kindLabel`)"
      class="max-w-full self-start overflow-x-auto [&_button]:whitespace-nowrap"
      data-eec-disc-kinds
      @update:value="kind = $event as EecDiscrepancyKind | 'all'"
    />

    <div v-if="error && !report" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-eec-disc-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t(`${P}.loadError`) }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-eec-disc-retry @click="load">{{ t(`${P}.retry`) }}</ZButton>
    </div>
    <template v-else>
      <div v-if="error" class="flex flex-wrap items-center gap-3 rounded-row bg-tone-danger-bg px-4 py-2" data-eec-disc-error>
        <p class="m-0 min-w-0 flex-1 text-sm text-tone-danger-fg">{{ t(`${P}.loadError`) }}</p>
        <ZButton size="sm" class="max-sm:h-11" @click="load">{{ t(`${P}.retry`) }}</ZButton>
      </div>
      <ZTable
        :columns="columns"
        :data-source="report?.items ?? []"
        row-key="code"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: tableWidth }"
        :aria-label="t(`${P}.tabs.discrepancies`)"
        class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
        data-eec-disc-table
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'code'" class="flex min-w-0 flex-col gap-0.5">
            <RouterLink :to="treeTo(record.code)" class="w-fit font-mono text-sm font-semibold text-zircon-ink underline-offset-2 hover:underline max-sm:min-h-11" data-eec-disc-code>{{ formatTnvedCode(record.code) }}</RouterLink>
            <span v-if="record.name" class="line-clamp-2 text-xs text-ink-3" :title="cleanName(record.name)">{{ cleanName(record.name) }}</span>
          </span>
          <ZTag v-else-if="column.key === 'kind'" :tone="discrepancyTone(record.kind)" data-eec-disc-kind>{{ discrepancyLabel(record.kind, t) }}</ZTag>
          <span v-else-if="column.key === 'eec'" class="flex min-w-0 flex-col gap-0.5 text-sm">
            <span class="font-semibold text-ink" data-eec-disc-eec>{{ record.eecRateText || (record.notInForceSince ? t(`${P}.disc.notInForce`, { date: formatDay(record.notInForceSince) }) : '—') }}</span>
            <span v-if="record.eecBaseRateText && record.eecBaseRateText !== record.eecRateText" class="text-xs text-ink-3" data-eec-disc-base>{{ t(`${P}.disc.base`, { rate: record.eecBaseRateText }) }}</span>
          </span>
          <span v-else-if="column.key === 'keden'" class="text-sm text-ink" data-eec-disc-keden>{{ record.kedenRate || '—' }}</span>
          <span v-else-if="column.key === 'footnote'" class="flex min-w-0 flex-col gap-0.5 text-sm">
            <span v-if="record.footnoteNumber" class="text-ink" data-eec-disc-footnote>
              {{ t(`${P}.source.footnote`, { n: record.footnoteNumber }) }}<template v-if="footnotePeriod(record, t)"> · {{ footnotePeriod(record, t) }}</template>
            </span>
            <span v-else-if="record.footnoteRefs.length" class="text-ink-3">{{ t(`${P}.footnoteShort`, { list: record.footnoteRefs.join(', ') }) }}</span>
            <span v-for="p in record.pending" :key="p.number + p.reason" class="text-xs text-tone-wait-fg" data-eec-disc-pending>
              {{ t(`${P}.disc.pendingLine`, { n: p.number, reason: pendingReasonLabel(p.reason, t) }) }}<template v-if="p.rateText"> ({{ p.rateText }})</template>
            </span>
            <span v-if="!record.footnoteNumber && !record.footnoteRefs.length && !record.pending.length" class="text-ink-3">—</span>
          </span>
          <span v-else-if="column.key === 'edition'" class="text-sm tabular-nums text-ink-2" :title="record.fileName ?? undefined">{{ formatDay(record.editionDate) }}</span>
        </template>
        <template #emptyText>
          <ZEmpty
            v-if="noGroups"
            :title="t(`${P}.disc.noGroups`)"
            :hint="t(`${P}.disc.noGroupsHint`)"
          />
          <ZEmpty
            v-else
            :title="filtered ? t('broker.list.nothingFound') : t(`${P}.disc.empty`)"
            :hint="filtered ? t('broker.list.nothingFoundHint') : t(`${P}.disc.emptyHint`, { n: num(report?.groupsLoaded.length ?? 0) })"
          >
            <template v-if="filtered" #action>
              <ZButton data-eec-disc-reset @click="resetFilters">{{ t('broker.list.resetFilters') }}</ZButton>
            </template>
          </ZEmpty>
        </template>
      </ZTable>
    </template>
  </div>
</template>
