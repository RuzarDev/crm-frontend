<template>
  <div class="reestr-status-history">
    <a-spin :spinning="loading">
      <a-table
        v-if="items.length"
        :columns="columns"
        :data-source="items"
        :pagination="false"
        size="small"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'changedAtUtc'">
            {{ formatDate(record.changedAtUtc) }}
          </template>
          <template v-else-if="column.key === 'author'">
            {{ record.changedByUsername || formatRole(record.changedByRole) }}
          </template>
          <template v-else-if="column.key === 'oldStatus'">
            {{
              record.oldStatus != null
                ? formatReestrStatus(dtoStatusToEntryStatus(record.oldStatus))
                : '—'
            }}
          </template>
          <template v-else-if="column.key === 'newStatus'">
            {{ formatReestrStatus(dtoStatusToEntryStatus(record.newStatus)) }}
          </template>
        </template>
      </a-table>
      <a-empty v-else :image="simpleImage" :description="t('transit.istoriyaPusta')" />
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Empty } from 'ant-design-vue'
import dayjs from 'dayjs'
import { useI18n } from 'vue-i18n'
import { reestrApi } from '@/api/reestr'
import type { ReestrStatusHistoryDto } from '@/types/api'
import { dtoStatusToEntryStatus, formatReestrStatus } from '@/utils/reestrDtoMap'
import { formatRole } from '@/utils/labels'

// Аудит 2026-09-28, п.10: заголовки колонок и пустое состояние были захардкожены на русском.
const { t } = useI18n()

interface Props {
  reestrId: string
  refreshKey?: number
}

const props = defineProps<Props>()
const simpleImage = Empty.PRESENTED_IMAGE_SIMPLE

const loading = ref(false)
const items = ref<ReestrStatusHistoryDto[]>([])

const columns = computed(() => [
  { title: t('transit.data'), key: 'changedAtUtc', width: 150 },
  { title: t('transit.avtor'), key: 'author', width: 120 },
  { title: t('transit.bylo'), key: 'oldStatus', width: 140 },
  { title: t('transit.stalo'), key: 'newStatus', width: 140 },
])

const formatDate = (iso: string) => dayjs(iso).format('DD.MM.YYYY HH:mm')

const fetchHistory = async () => {
  if (!props.reestrId) {
    return
  }
  loading.value = true
  try {
    items.value = await reestrApi.getStatusHistory(props.reestrId)
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.reestrId, props.refreshKey] as const,
  () => {
    fetchHistory()
  },
  { immediate: true },
)
</script>
