<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import FilterChip from '@/components/broker/FilterChip.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import NoticeBanner from '@/components/broker/NoticeBanner.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import { tnvedEecApi, type EecEditionKind, type EecEditionStatus, type EecEditionSummary } from '@/api/tnvedEec'
import { formatDay, matchesQuery } from '@/views/broker/list'
import { formatCount, formatDateTime } from '@/views/broker/references/system/systemData'
import { useBlock } from '@/views/home/useBlock'
import type { ZColumn } from '@/ui/table'
import { EDITION_STATUSES, P, editionStatusLabel, editionTitle, editionTone, utc } from './eec'

// Вкладка «Редакции»: все загруженные редакции групп ЕТТ и «Примечаний к ЕТТ», новые сверху (как отдаёт сервер).
// Фильтры — на месте: статус, вид, поиск по номеру группы или имени файла. Строка открывает карточку редакции.
// Отложенные (held) — плашкой сверху: их надо подтвердить или отклонить.
const { t, locale } = useI18n()
const router = useRouter()

const board = useBlock(true, async () => (await tnvedEecApi.editions()).data ?? [])
onMounted(() => { void board.load() })
// version растёт, когда закончился прогон синка: список перечитывается.
const props = defineProps<{ version?: number }>()
watch(() => props.version, () => { void board.load() })

const all = computed<EecEditionSummary[]>(() => board.data ?? [])
const heldCount = computed(() => all.value.filter((e) => e.status === 'held').length)

const status = ref<EecEditionStatus | null>(null)
const kind = ref<EecEditionKind | null>(null)
const query = ref('')
const page = ref(1)
watch([status, kind, query], () => { page.value = 1 })
const filtered = computed(() => !!status.value || !!kind.value || !!query.value.trim())
const rows = computed(() => all.value.filter((e) =>
  (!status.value || e.status === status.value)
  && (!kind.value || e.kind === kind.value)
  && matchesQuery(query.value, [e.group, e.fileName, editionTitle(e, t)])))
const resetFilters = () => { status.value = null; kind.value = null; query.value = '' }

const statusOptions = computed(() => EDITION_STATUSES.map((s) => ({ value: s, label: editionStatusLabel(s, t) })))
const kindOptions = computed(() => [
  { value: 'group', label: t(`${P}.kindGroup`) },
  { value: 'ettNotes', label: t(`${P}.notes`) },
])

const columns = computed<ZColumn<EecEditionSummary>[]>(() => [
  { key: 'edition', title: t(`${P}.col.edition`), width: 260, cardLead: true },
  { key: 'date', title: t(`${P}.col.date`), width: 120 },
  { key: 'status', title: t(`${P}.col.status`), width: 220 },
  { key: 'changes', title: t(`${P}.col.changes`), width: 170 },
  { key: 'codes', title: t(`${P}.col.codes`), width: 100, align: 'right' },
  { key: 'staged', title: t(`${P}.col.staged`), width: 150 },
])
const tableWidth = computed(() => columns.value.reduce((s, c) => s + (typeof c.width === 'number' ? c.width : 0), 0))
const pagination = computed(() => ({
  current: page.value,
  onChange: (p: number) => { page.value = p },
  showTotal: (total: number, [from, to]: [number, number]) => t('broker.list.range', { from, to, total }),
}))
const open = (e: EecEditionSummary) => { void router.push(`/tnved/eec/editions/${e.id}`) }
const customRow = (e: EecEditionSummary) => ({
  class: 'cursor-pointer',
  onClick: (ev: MouseEvent) => {
    if ((ev.target as HTMLElement | null)?.closest('a,button,input,label')) return
    open(e)
  },
})
const num = (n: number) => formatCount(n, locale.value)
</script>

<template>
  <div class="flex flex-col gap-4" data-eec-editions>
    <NoticeBanner v-if="heldCount" tone="gold" data-eec-held-banner>
      {{ t(`${P}.heldBanner`, { n: heldCount }) }}
      <template #action>
        <ZButton class="bg-gold text-navy enabled:hover:bg-gold/85 max-sm:h-11" data-eec-show-held @click="resetFilters(); status = 'held'">
          {{ t(`${P}.show`) }}
        </ZButton>
      </template>
    </NoticeBanner>

    <div class="flex flex-wrap items-center gap-2">
      <ListSearch :value="query" :placeholder="t(`${P}.editionsSearch`)" data-eec-editions-search @update:value="query = $event" />
      <div class="flex min-w-0 flex-wrap items-center gap-1.5">
        <FilterChip
          :label="t(`${P}.col.status`)"
          :all-label="t(`${P}.allStatuses`)"
          :options="statusOptions"
          :value="status"
          data-eec-filter-status
          @update:value="status = $event as EecEditionStatus | null"
        />
        <FilterChip
          :label="t(`${P}.kindLabel`)"
          :all-label="t(`${P}.allKinds`)"
          :options="kindOptions"
          :value="kind"
          data-eec-filter-kind
          @update:value="kind = $event as EecEditionKind | null"
        />
      </div>
    </div>

    <div v-if="board.error && !board.data" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-eec-editions-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t(`${P}.loadError`) }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4" data-eec-editions-retry @click="board.load()">{{ t(`${P}.retry`) }}</ZButton>
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
      :aria-label="t(`${P}.tabs.editions`)"
      class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
      data-eec-editions-table
    >
      <template #bodyCell="{ column, record }">
        <button
          v-if="column.key === 'edition'"
          type="button"
          class="flex min-w-0 max-w-full cursor-pointer flex-col items-start gap-0.5 rounded-field border-0 bg-transparent p-0 text-left font-sans outline-hidden focus-visible:shadow-focus max-sm:min-h-11"
          data-eec-edition-open
          @click="open(record)"
        >
          <span class="text-sm font-semibold text-ink" data-eec-edition-title>{{ editionTitle(record, t) }}</span>
          <span class="block max-w-full truncate font-mono text-xs text-muted" :title="record.fileName">{{ record.fileName }}</span>
        </button>
        <span v-else-if="column.key === 'date'" class="text-sm tabular-nums text-ink" data-eec-edition-date>{{ formatDay(record.editionDate) }}</span>
        <span v-else-if="column.key === 'status'" class="flex min-w-0 flex-col items-start gap-1">
          <ZTag :tone="editionTone(record.status)" data-eec-edition-status>{{ editionStatusLabel(record.status, t) }}</ZTag>
          <span v-if="record.statusReason" class="line-clamp-2 text-xs text-ink-3" :title="record.statusReason">{{ record.statusReason }}</span>
        </span>
        <span v-else-if="column.key === 'changes'" class="flex flex-wrap gap-x-2 gap-y-0.5 text-sm tabular-nums" :title="t(`${P}.changesTitle`)" data-eec-edition-changes>
          <span class="text-tone-done-fg">+{{ num(record.addedCount) }}</span>
          <span class="text-tone-info-fg">~{{ num(record.changedCount) }}</span>
          <span class="text-tone-danger-fg">−{{ num(record.removedCount) }}</span>
          <span v-if="record.unparsedCount" class="text-tone-wait-fg" data-eec-edition-unparsed>{{ t(`${P}.unparsedShort`, { n: num(record.unparsedCount) }) }}</span>
        </span>
        <span v-else-if="column.key === 'codes'" class="text-sm tabular-nums text-ink-2">{{ num(record.leafCount) }}</span>
        <span v-else-if="column.key === 'staged'" class="text-sm tabular-nums text-ink-2">{{ formatDateTime(utc(record.stagedAtUtc), locale) }}</span>
      </template>
      <template #emptyText>
        <ZEmpty
          :title="filtered ? t('broker.list.nothingFound') : t(`${P}.editionsEmpty`)"
          :hint="filtered ? t('broker.list.nothingFoundHint') : t(`${P}.editionsEmptyHint`)"
        >
          <template v-if="filtered" #action>
            <ZButton data-eec-editions-reset @click="resetFilters">{{ t('broker.list.resetFilters') }}</ZButton>
          </template>
        </ZEmpty>
      </template>
    </ZTable>
  </div>
</template>
