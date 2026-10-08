<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import ZEmpty from '@/components/z/ZEmpty.vue'
import ZTable from '@/components/z/ZTable.vue'
import StatusDot from '@/components/broker/StatusDot.vue'
import { reestrApi } from '@/api/reestr'
import type { ReestrStatusHistoryDto } from '@/types/api'
import { dtoStatusToEntryStatus } from '@/utils/reestrDtoMap'
import { formatRole } from '@/utils/labels'
import { formatStamp } from '@/views/broker/packages/packages'
import { statusKey, statusTone } from '../../transit'

// Вкладка «История статусов» записи транзита: дата, автор, было, стало (ZTable, на телефоне — карточки).
// Строки пишет только «Сменить статус» (PATCH), поэтому страница меняет refreshKey после смены статуса.
// Ошибка загрузки — пустой список (тост показал перехватчик). Поздний ответ прежнего запроса новый не затирает.
const props = withDefaults(defineProps<{ reestrId: string; refreshKey?: number }>(), { refreshKey: 0 })
const { t } = useI18n()

const items = ref<ReestrStatusHistoryDto[]>([])
const loading = ref(false)
const loaded = ref(false)
let seq = 0

const load = async () => {
  if (!props.reestrId) return
  const mine = ++seq
  loading.value = true
  try {
    const list = await reestrApi.getStatusHistory(props.reestrId)
    if (mine === seq) items.value = list
  } catch {
    if (mine === seq) items.value = []
  } finally {
    if (mine === seq) {
      loading.value = false
      loaded.value = true
    }
  }
}
watch(() => [props.reestrId, props.refreshKey] as const, load, { immediate: true })

const columns = computed(() => [
  { title: t('transit.data'), key: 'changedAtUtc', width: 160 },
  { title: t('transit.avtor'), key: 'author' },
  { title: t('transit.bylo'), key: 'oldStatus', width: 190 },
  { title: t('transit.stalo'), key: 'newStatus', width: 190 },
])

const statusProps = (raw: ReestrStatusHistoryDto['newStatus']) => {
  const s = dtoStatusToEntryStatus(raw)
  return { tone: statusTone(s), label: t(`enum.reestrStatus.${statusKey(s)}`) }
}
const author = (r: ReestrStatusHistoryDto) => r.changedByUsername || (r.changedByRole ? formatRole(r.changedByRole) : '—')
</script>

<template>
  <div data-record-history>
    <ZEmpty v-if="loaded && !items.length" :title="t('transit.istoriyaPusta')" data-history-empty />
    <ZTable
      v-else
      :columns="columns"
      :data-source="items"
      row-key="id"
      :pagination="false"
      :loading="loading && !loaded"
      :aria-label="t('transit.istoriyaStatusov')"
    >
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'changedAtUtc'" class="whitespace-nowrap tabular-nums text-ink-2">{{ formatStamp(record.changedAtUtc) }}</span>
        <span v-else-if="column.key === 'author'" class="text-ink">{{ author(record) }}</span>
        <template v-else-if="column.key === 'oldStatus'">
          <StatusDot v-if="record.oldStatus != null" v-bind="statusProps(record.oldStatus)" />
          <span v-else class="text-muted">—</span>
        </template>
        <StatusDot v-else-if="column.key === 'newStatus'" v-bind="statusProps(record.newStatus)" />
      </template>
    </ZTable>
  </div>
</template>
