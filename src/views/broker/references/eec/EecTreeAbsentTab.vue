<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import FilterChip from '@/components/broker/FilterChip.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import { tnvedEecApi, type EecTreeAbsentCode, type EecTreeAbsentReport } from '@/api/tnvedEec'
import { formatDay, todayIso } from '@/views/broker/list'
import { cleanName, formatTnvedCode } from '@/views/references/tnvedShared'
import { message } from '@/ui/message'
import type { ZColumn } from '@/ui/table'
import EecActionModal, { type EecActionValue } from './EecActionModal.vue'
import { P, absentLabel, absentTone, defaultCloseDate } from './eec'

// Вкладка «Нет в ЕЭК»: действующие 10-значные коды нашего дерева в загруженных группах, которых нет в ЕЭК
// (или они ушли из ЕЭК). Похожие коды ЕЭК (то же 8-значное начало) — подсказка, на что код разбит.
// Сами коды не закрываются: «Закрыть» — человек, с датой (по умолчанию предложенная сервером) и комментарием.
const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 400
const { t } = useI18n()

const group = ref<string | null>(null)
const query = ref('')
const appliedQuery = ref('')
const page = ref(1)
const report = shallowRef<EecTreeAbsentReport | null>(null)
const loading = ref(true)
const error = ref(false)
let seq = 0
const load = async () => {
  const my = ++seq
  loading.value = true
  error.value = false
  try {
    const { data } = await tnvedEecApi.treeAbsent({ group: group.value, q: appliedQuery.value.trim() || undefined, page: page.value, pageSize: PAGE_SIZE })
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
watch([group, appliedQuery], () => { page.value = 1; void load() })

const groupOptions = computed(() => (report.value?.groupsLoaded ?? []).map((g) => ({ value: g, label: t(`${P}.group`, { n: g }) })))
const filtered = computed(() => !!group.value || !!appliedQuery.value.trim())
const resetFilters = () => { group.value = null; query.value = ''; appliedQuery.value = '' }

const columns = computed<ZColumn<EecTreeAbsentCode>[]>(() => [
  { key: 'code', title: t(`${P}.absent.col.code`), width: 300, cardLead: true },
  { key: 'kind', title: t(`${P}.absent.col.kind`), width: 200 },
  { key: 'similar', title: t(`${P}.absent.col.similar`), width: 220 },
  { key: 'keden', title: t(`${P}.absent.col.keden`), width: 120 },
  { key: 'action', title: '', width: 130, align: 'right' },
])
const tableWidth = computed(() => columns.value.reduce((s, c) => s + (typeof c.width === 'number' ? c.width : 0), 0))
const pagination = computed(() => ({
  current: page.value,
  pageSize: PAGE_SIZE,
  total: report.value?.total ?? 0,
  onChange: (p: number) => { page.value = p; void load() },
  showTotal: (n: number, [from, to]: [number, number]) => t('broker.list.range', { from, to, total: n }),
}))
const treeTo = (code: string) => ({ path: '/tnved/tree', query: { code } })

// ---- Ручное закрытие ----
const target = shallowRef<EecTreeAbsentCode | null>(null)
const modalOpen = ref(false)
const ask = (r: EecTreeAbsentCode) => { target.value = r; modalOpen.value = true }
const save = async (v: EecActionValue) => {
  const r = target.value
  if (!r) return
  const { data } = await tnvedEecApi.closeTreeCode(r.code, { endDate: v.date, note: v.note })
  message.success(t(`${P}.absent.closed`, { code: formatTnvedCode(r.code), date: formatDay(data.endDate) }))
  void load()
}
const modalText = computed(() => {
  const r = target.value
  if (!r) return undefined
  return t(`${P}.absent.modalText`, { code: formatTnvedCode(r.code) })
})
</script>

<template>
  <div class="flex flex-col gap-4" data-eec-absent>
    <p class="m-0 text-sm text-ink-3 text-pretty">{{ t(`${P}.absent.sub`) }}</p>
    <div class="flex flex-wrap items-center gap-2">
      <ListSearch :value="query" :placeholder="t(`${P}.absent.search`)" data-eec-absent-search @update:value="query = $event" />
      <FilterChip
        :label="t(`${P}.groupLabel`)"
        :all-label="t(`${P}.allGroups`)"
        :options="groupOptions"
        :value="group"
        data-eec-absent-group
        @update:value="group = $event"
      />
    </div>

    <div v-if="error && !report" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-eec-absent-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t(`${P}.loadError`) }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-eec-absent-retry @click="load">{{ t(`${P}.retry`) }}</ZButton>
    </div>
    <ZTable
      v-else
      :columns="columns"
      :data-source="report?.items ?? []"
      row-key="nodeId"
      :loading="loading"
      :pagination="pagination"
      :scroll="{ x: tableWidth }"
      :aria-label="t(`${P}.tabs.absent`)"
      class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
      data-eec-absent-table
    >
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'code'" class="flex min-w-0 flex-col gap-0.5" :data-code="record.code">
          <RouterLink :to="treeTo(record.code)" class="w-fit font-mono text-sm font-semibold text-zircon-ink underline-offset-2 hover:underline max-sm:min-h-11" data-eec-absent-code>{{ formatTnvedCode(record.code) }}</RouterLink>
          <span class="line-clamp-2 text-xs text-ink-3" :title="cleanName(record.name)">{{ cleanName(record.name) }}</span>
        </span>
        <span v-else-if="column.key === 'kind'" class="flex min-w-0 flex-col items-start gap-1">
          <ZTag :tone="absentTone(record.kind)" data-eec-absent-kind>{{ absentLabel(record.kind, t) }}</ZTag>
          <span v-if="record.eecNotInForceSince" class="text-xs text-ink-3">{{ t(`${P}.since`, { date: formatDay(record.eecNotInForceSince) }) }}</span>
          <span v-if="record.addedByEec" class="text-xs text-ink-3">{{ t(`${P}.absent.addedByEec`) }}</span>
        </span>
        <span v-else-if="column.key === 'similar'" class="flex flex-wrap gap-x-2 gap-y-0.5 text-sm" data-eec-absent-similar>
          <RouterLink
            v-for="c in record.eecSimilar"
            :key="c"
            :to="treeTo(c)"
            class="font-mono text-zircon-ink underline-offset-2 hover:underline"
          >{{ formatTnvedCode(c) }}</RouterLink>
          <span v-if="!record.eecSimilar.length" class="text-ink-3">—</span>
        </span>
        <span v-else-if="column.key === 'keden'" class="text-sm text-ink">{{ record.kedenRate || '—' }}</span>
        <ZButton
          v-else-if="column.key === 'action'"
          size="sm"
          variant="secondary"
          class="max-sm:h-11 max-sm:w-full"
          :aria-label="t(`${P}.absent.closeFor`, { code: formatTnvedCode(record.code) })"
          data-eec-absent-close
          @click="ask(record)"
        >{{ t(`${P}.absent.close`) }}</ZButton>
      </template>
      <template #emptyText>
        <ZEmpty
          :title="filtered ? t('broker.list.nothingFound') : t(`${P}.absent.empty`)"
          :hint="filtered ? t('broker.list.nothingFoundHint') : t(`${P}.absent.emptyHint`)"
        >
          <template v-if="filtered" #action>
            <ZButton data-eec-absent-reset @click="resetFilters">{{ t('broker.list.resetFilters') }}</ZButton>
          </template>
        </ZEmpty>
      </template>
    </ZTable>

    <EecActionModal
      v-model:open="modalOpen"
      :title="t(`${P}.absent.modalTitle`)"
      :text="modalText"
      :ok-text="t(`${P}.absent.close`)"
      :date-label="t(`${P}.absent.endDate`)"
      date-required
      :date-max="todayIso()"
      date-min="2010-01-01"
      :date-help="target?.suggestedEndDate ? t(`${P}.absent.dateHelp`) : undefined"
      :initial-date="target ? defaultCloseDate(target, todayIso()) : null"
      :note-label="t(`${P}.absent.noteLabel`)"
      danger
      :save="save"
    />
  </div>
</template>
