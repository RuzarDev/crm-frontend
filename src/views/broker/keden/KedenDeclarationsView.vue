<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhArrowsClockwise } from '@phosphor-icons/vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZTable from '@/components/z/ZTable.vue'
import ZTag from '@/components/z/ZTag.vue'
import FilterChip from '@/components/broker/FilterChip.vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import StatusDot from '@/components/broker/StatusDot.vue'
import { KEDEN_DECLARATION_TYPES, kedenApi, kedenTypeLabelKey } from '@/api/keden'
import { useAuthStore } from '@/stores/auth'
import { useBlock } from '@/views/home/useBlock'
import type { ZColumn } from '@/ui/table'
import {
  emptyFilters, filterRows, formatChanged, hasFilters, postOptions, rowFromListItem, rowFromMine, statusOptions, statusTone,
  type KedenFilters, type KedenMode, type KedenRow,
} from './keden'

// «КЕДЕН» (редизайн, волна 3а, доска Keden): декларации и статусы одним экраном.
// mode='all' — /keden, администратор: все декларации, тип фильтрует сервер, строка ведёт на карточку /keden/:id.
// mode='mine' — /keden-status: статусы по БИН пользователя (сотрудники, экспедиторы, клиенты с модулем «транзит»); тип не приходит.
// Поиск, статус и пост считаются на клиенте по загруженным строкам (сервер отдаёт до 500).
const props = withDefaults(defineProps<{ mode?: KedenMode }>(), { mode: 'all' })
const { t } = useI18n()
const auth = useAuthStore()

const isAll = computed(() => props.mode === 'all')
const isClient = computed(() => (auth.role ?? '').trim().toLowerCase() === 'client')

// ---- Данные ----
const type = ref<string | null>(null)
const board = useBlock(true, async () => {
  if (props.mode === 'all') {
    const res = await kedenApi.list(type.value ? { type: type.value } : undefined, { silent: true })
    return { rows: res.items.map(rowFromListItem), total: res.total }
  }
  const res = await kedenApi.mine({ silent: true })
  return { rows: res.map(rowFromMine), total: res.length }
})
onMounted(() => { void board.load() })

// Экран переиспользуется при переходе между /keden и /keden-status — начинаем с чистого листа.
watch(() => props.mode, () => {
  type.value = null
  filters.value = emptyFilters()
  void board.load()
})

const items = computed<KedenRow[]>(() => board.data?.rows ?? [])
const truncated = computed(() => (isAll.value && board.data ? board.data.total > board.data.rows.length : false))

// ---- Фильтры ----
const filters = ref<KedenFilters>(emptyFilters())
const filtered = computed(() => hasFilters(filters.value) || !!type.value)
const rows = computed(() => filterRows(items.value, filters.value))
const typeOptions = computed(() => KEDEN_DECLARATION_TYPES.map((x) => ({ value: x.key, label: t(`broker.keden.typeFull.${x.key}`) })))
const statuses = computed(() => statusOptions(items.value))
const posts = computed(() => postOptions(items.value))
const setType = (v: string | null) => { type.value = v; void board.load() }
const resetFilters = () => {
  filters.value = emptyFilters()
  if (type.value) setType(null)
}

// ---- Таблица ----
const columns = computed<ZColumn<KedenRow>[]>(() => [
  { key: 'no', title: t('broker.keden.col.no'), width: 230 },
  ...(isAll.value ? [{ key: 'type', title: t('broker.keden.col.type'), width: 90 }] : []),
  { key: 'status', title: t('broker.keden.col.status'), width: 190 },
  { key: 'post', title: t('broker.keden.col.post'), width: 220 },
  // В «mine» декларант — сам пользователь (или его клиент); на телефоне в карточке место дороже.
  { key: 'declarant', title: t('broker.keden.col.declarant'), width: 260, className: isAll.value ? undefined : 'max-sm:hidden' },
  { key: 'changed', title: t('broker.keden.col.changed'), dataIndex: 'ts', width: 130, align: 'right' as const, sorter: true, defaultSortOrder: 'descend' as const },
])
const tableWidth = computed(() => columns.value.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : 0), 0))
const pagination = computed(() => ({
  showTotal: (total: number, [from, to]: [number, number]) => t('broker.keden.range', { from, to, total }),
}))
const typeShort = (code: string) => {
  const k = kedenTypeLabelKey(code)
  const label = t(k)
  return label === k ? code : label
}
const typeFull = (code: string) => {
  const k = `broker.keden.typeFull.${code}`
  const label = t(k)
  return label === k ? code : label
}

const title = computed(() => (isClient.value ? t('broker.keden.clientTitle') : t('broker.keden.title')))
const subtitle = computed(() => t(isAll.value ? 'transit.statusyDeklaraciySinhronizirovannyeS' : 'transit.statusyVashihDeklaraciyV'))
const emptyTitle = computed(() => (filtered.value ? t('broker.list.nothingFound') : t('transit.deklaraciyPokaNet')))
const emptyHint = computed(() => (filtered.value ? t('broker.list.nothingFoundHint') : (isAll.value ? undefined : t('broker.keden.mineHint'))))
</script>

<template>
  <div class="flex flex-col gap-4" data-keden>
    <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-3">
          <h1 class="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">{{ title }}</h1>
          <span
            v-if="board.data"
            class="rounded-pill bg-sunken px-2.5 text-[12.5px] leading-5 font-semibold tabular-nums text-ink-3"
            data-keden-count
          >{{ board.data.total }}</span>
        </div>
        <p class="m-0 mt-1 text-sm text-muted" data-keden-subtitle>{{ subtitle }}</p>
      </div>
      <div class="flex flex-wrap gap-2 max-sm:w-full">
        <ZButton :loading="board.loading" class="max-sm:h-11 max-sm:flex-1" data-keden-refresh @click="board.load()">
          <template #icon><PhArrowsClockwise :size="16" aria-hidden="true" /></template>
          {{ t('broker.list.refresh') }}
        </ZButton>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <FilterChip
        v-if="isAll"
        :label="t('broker.keden.filter.type')"
        :options="typeOptions"
        :value="type"
        data-keden-filter-type
        @update:value="setType"
      />
      <ListSearch
        :value="filters.q"
        :placeholder="t('broker.keden.search')"
        class="min-w-0 max-sm:basis-full sm:basis-60 sm:flex-1"
        @update:value="filters = { ...filters, q: $event }"
      />
      <FilterChip
        :label="t('broker.keden.filter.status')"
        :options="statuses"
        :value="filters.status"
        data-keden-filter-status
        @update:value="filters = { ...filters, status: $event }"
      />
      <FilterChip
        :label="t('broker.keden.filter.post')"
        :options="posts"
        :value="filters.post"
        data-keden-filter-post
        @update:value="filters = { ...filters, post: $event }"
      />
    </div>

    <div v-if="board.error && !board.data" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-keden-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.list.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-keden-retry @click="board.load()">{{ t('broker.list.retry') }}</ZButton>
    </div>
    <template v-else>
      <div v-if="board.error" class="flex flex-wrap items-center gap-3 rounded-row bg-tone-danger-bg px-4 py-2" data-keden-error>
        <p class="m-0 min-w-0 flex-1 text-sm text-tone-danger-fg">{{ t('broker.list.loadError') }}</p>
        <ZButton size="sm" class="max-sm:h-11" data-keden-retry @click="board.load()">{{ t('broker.list.retry') }}</ZButton>
      </div>
      <ZTable
        :columns="columns"
        :data-source="rows"
        row-key="id"
        :loading="board.loading"
        :pagination="pagination"
        :scroll="{ x: tableWidth }"
        :aria-label="t('broker.keden.tableLabel')"
        class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
        data-keden-table
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'no'">
            <RouterLink
              v-if="isAll && record.registrationNumber"
              :to="`/keden/${record.id}`"
              class="inline-flex max-w-full items-center truncate rounded-field font-mono text-sm font-medium text-ink outline-hidden hover:underline focus-visible:shadow-focus max-sm:min-h-11"
              data-keden-open
            >{{ record.registrationNumber }}</RouterLink>
            <span v-else-if="record.registrationNumber" class="block truncate font-mono text-sm font-medium text-ink" data-keden-no>{{ record.registrationNumber }}</span>
            <span v-else class="text-muted">—</span>
          </template>
          <ZTag v-else-if="column.key === 'type'" tone="neutral" :title="record.type ? typeFull(record.type) : undefined" data-keden-type>{{ record.type ? typeShort(record.type) : '—' }}</ZTag>
          <StatusDot v-else-if="column.key === 'status'" :tone="statusTone(record.statusCode, record.statusName)" :label="record.statusName || '—'" />
          <span v-else-if="column.key === 'post'" class="block truncate" :class="record.customsPost ? 'text-ink-2' : 'text-muted'" :title="record.customsPost ?? undefined">{{ record.customsPost || '—' }}</span>
          <template v-else-if="column.key === 'declarant'">
            <template v-if="record.declarantName || record.declarantXin">
              <span v-if="record.declarantName" class="block truncate text-ink" :title="record.declarantName">{{ record.declarantName }}</span>
              <span v-if="record.declarantXin" class="block truncate text-xs text-muted">{{ t('broker.keden.bin', { bin: record.declarantXin }) }}</span>
            </template>
            <span v-else class="text-muted">—</span>
          </template>
          <span v-else-if="column.key === 'changed'" class="whitespace-nowrap text-sm tabular-nums text-ink-3">{{ formatChanged(record.changedAt) || '—' }}</span>
        </template>
        <template #emptyText>
          <ZEmpty :title="emptyTitle" :hint="emptyHint">
            <template v-if="filtered" #action>
              <ZButton data-keden-reset @click="resetFilters">{{ t('broker.list.resetFilters') }}</ZButton>
            </template>
          </ZEmpty>
        </template>
      </ZTable>

      <p v-if="truncated && board.data" class="m-0 text-sm text-ink-3" data-keden-truncated>{{ t('broker.list.truncated', { n: board.data.rows.length }) }}</p>
    </template>
  </div>
</template>
