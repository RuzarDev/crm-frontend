<script setup lang="ts" generic="T extends ListRow">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { PhPencilSimple } from '@phosphor-icons/vue'
import ListSearch from '@/components/broker/ListSearch.vue'
import RowActions from '@/components/broker/RowActions.vue'
import StatusDot from '@/components/broker/StatusDot.vue'
import ZButton from '@/components/z/ZButton.vue'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZSegmented from '@/components/z/ZSegmented.vue'
import ZTable from '@/components/z/ZTable.vue'
import type { ZColumn } from '@/ui/table'
import { countHidden, filterRows, type ListRow, type Segment } from './systemData'

// Список записей справочника (станции, посты, коды классификатора): поиск, «Активные / Скрытые n / Все»,
// строки «Изменить» и «⋯» → «Скрыть» / «Вернуть». Данные и запросы — у родителя (RefList, ClassifierList).
// resetKey: другой справочник в том же компоненте — поиск и сегмент сбрасываются.
const props = defineProps<{
  rows: T[]
  loading: boolean
  error: boolean
  withCode: boolean
  canEdit: boolean
  label: string
  resetKey: string
}>()
const emit = defineEmits<{ edit: [row: T]; hide: [row: T]; restore: [row: T]; retry: [] }>()
const { t } = useI18n()

const q = ref('')
const segment = ref<Segment>('active')
const page = ref(1)
watch(() => props.resetKey, () => { q.value = ''; segment.value = 'active'; page.value = 1 })
watch([q, segment], () => { page.value = 1 })

const hidden = computed(() => countHidden(props.rows))
const shown = computed(() => filterRows(props.rows, q.value, segment.value))
const segmentOptions = computed(() => [
  { value: 'active', label: t('broker.references.system.list.active') },
  { value: 'hidden', label: t('broker.references.system.list.hidden'), count: hidden.value },
  { value: 'all', label: t('broker.references.system.list.all') },
])

const columns = computed<ZColumn<T>[]>(() => [
  ...(props.withCode ? [{ key: 'code', title: t('broker.references.system.list.colCode'), width: 140 }] : []),
  { key: 'name', title: t(props.withCode ? 'broker.references.system.list.colNameRu' : 'broker.references.system.list.colName') },
  { key: 'status', title: t('broker.references.system.list.colStatus'), width: 130 },
  ...(props.canEdit ? [{ key: 'actions', title: '', width: 96, align: 'right' as const }] : []),
])
const pagination = computed(() => ({
  current: page.value,
  onChange: (p: number) => { page.value = p },
  showTotal: (total: number, [from, to]: [number, number]) => t('broker.list.range', { from, to, total }),
}))

const nameOf = (r: T) => (props.withCode ? `${r.code ?? ''} — ${r.nameRu ?? ''}` : r.name ?? '')
const menuItems = (r: T) => [r.isActive
  ? { key: 'hide', label: t('broker.references.system.list.hide') }
  : { key: 'restore', label: t('broker.references.system.list.restore') }]
const onAction = (r: T, key: string) => {
  if (key === 'hide') emit('hide', r)
  else if (key === 'restore') emit('restore', r)
}

const emptyTitle = computed(() => {
  if (!props.rows.length) return t('broker.references.system.list.empty')
  if (q.value.trim()) return t('broker.references.system.list.nothing')
  return segment.value === 'hidden' ? t('broker.references.system.list.emptyHidden') : t('broker.references.system.list.emptyActive')
})
const emptyHint = computed(() => (q.value.trim() && props.rows.length ? t('broker.references.system.list.nothingHint') : undefined))
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3" data-items>
    <div class="flex flex-wrap items-center gap-2.5">
      <ListSearch
        :value="q"
        :placeholder="withCode ? t('broker.references.system.list.searchCode') : t('broker.references.system.list.search')"
        data-items-search
        @update:value="q = $event"
      />
      <div class="max-w-full min-w-0 overflow-x-clip">
        <div class="overflow-x-auto">
          <ZSegmented
            :value="segment"
            :options="segmentOptions"
            :aria-label="t('broker.references.system.list.segmentLabel')"
            data-items-segment
            @update:value="segment = $event as Segment"
          />
        </div>
      </div>
    </div>

    <div v-if="error && !loading" role="alert" class="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-5 py-4" data-items-error>
      <p class="m-0 min-w-0 flex-1 text-base text-ink-2">{{ t('broker.references.system.loadError') }}</p>
      <ZButton size="sm" class="max-sm:h-11 max-sm:px-4 max-sm:text-sm" data-items-retry @click="emit('retry')">{{ t('broker.references.system.retry') }}</ZButton>
    </div>
    <ZTable
      v-else
      :columns="columns"
      :data-source="shown"
      row-key="id"
      :loading="loading && !rows.length"
      :pagination="pagination"
      :aria-label="label"
      class="overflow-hidden rounded-panel border border-line bg-surface max-sm:overflow-visible max-sm:border-0 max-sm:bg-transparent"
      data-items-table
    >
      <template #headerCell="{ column }">
        <span v-if="column.key === 'actions'" class="sr-only">{{ t('broker.list.actions') }}</span>
      </template>
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'code'" class="font-mono text-sm text-ink" data-item-code>{{ record.code }}</span>
        <span v-else-if="column.key === 'name'" class="text-sm text-ink [overflow-wrap:anywhere]" data-item-name>{{ withCode ? record.nameRu : record.name }}</span>
        <StatusDot
          v-else-if="column.key === 'status'"
          :tone="record.isActive ? 'done' : 'neutral'"
          :label="record.isActive ? t('broker.references.system.list.statusActive') : t('broker.references.system.list.statusHidden')"
          :data-item-status="record.isActive ? 'active' : 'hidden'"
        />
        <div v-else-if="column.key === 'actions'" class="flex items-center justify-end gap-1" @click.stop>
          <ZButton
            variant="ghost"
            class="size-8 px-0 max-sm:size-11"
            :aria-label="t('broker.references.system.list.editLabel', { name: nameOf(record) })"
            :title="t('broker.references.system.list.edit')"
            data-item-edit
            @click="emit('edit', record)"
          >
            <PhPencilSimple :size="16" aria-hidden="true" />
          </ZButton>
          <RowActions
            :items="menuItems(record)"
            :label="t('broker.references.system.list.actionsLabel', { name: nameOf(record) })"
            @action="onAction(record, $event)"
          />
        </div>
      </template>
      <template #emptyText>
        <ZEmpty :title="emptyTitle" :hint="emptyHint" />
      </template>
    </ZTable>
  </div>
</template>
