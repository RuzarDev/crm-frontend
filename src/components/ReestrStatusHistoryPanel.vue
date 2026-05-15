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
      <a-empty v-else :image="simpleImage" description="История пуста" />
    </a-spin>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Empty } from 'ant-design-vue'
import dayjs from 'dayjs'
import { reestrApi } from '@/api/reestr'
import type { ReestrStatusHistoryDto } from '@/types/api'
import { dtoStatusToEntryStatus, formatReestrStatus } from '@/utils/reestrDtoMap'
import { formatRole } from '@/utils/labels'

interface Props {
  reestrId: string
  refreshKey?: number
}

const props = defineProps<Props>()
const simpleImage = Empty.PRESENTED_IMAGE_SIMPLE

const loading = ref(false)
const items = ref<ReestrStatusHistoryDto[]>([])

const columns = [
  { title: 'Дата', key: 'changedAtUtc', width: 150 },
  { title: 'Автор', key: 'author', width: 120 },
  { title: 'Было', key: 'oldStatus', width: 140 },
  { title: 'Стало', key: 'newStatus', width: 140 },
]

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
