<template>
  <div class="reestr-status-cell">
    <component :is="meta.icon" class="reestr-status-icon" :style="{ color: meta.color }" />
    <span class="reestr-status-label">{{ formatReestrStatus(status) }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import type { ReestrEntryStatus } from '@/types/api'
import { formatReestrStatus } from '@/utils/reestrDtoMap'
import { ReestrEntryStatus as ReestrEntryStatusValues } from '@/types/api'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  BellOutlined,
  FileSearchOutlined,
  CloudUploadOutlined,
  ClockCircleOutlined,
  ExportOutlined,
  MinusCircleOutlined,
} from '@ant-design/icons-vue'

const props = defineProps<{
  status: ReestrEntryStatus
}>()

type StatusVisual = { icon: Component; color: string }

const statusVisuals: Record<ReestrEntryStatus, StatusVisual> = {
  [ReestrEntryStatusValues.Release]: { icon: CheckCircleOutlined, color: '#52c41a' },
  [ReestrEntryStatusValues.Problematic]: { icon: CloseCircleOutlined, color: '#ff4d4f' },
  [ReestrEntryStatusValues.InspectionNotice]: { icon: BellOutlined, color: '#fa8c16' },
  [ReestrEntryStatusValues.InspectionAct]: { icon: FileSearchOutlined, color: '#1677ff' },
  [ReestrEntryStatusValues.SubmittedToCustoms]: { icon: CloudUploadOutlined, color: '#722ed1' },
  [ReestrEntryStatusValues.PendingClarification]: { icon: ClockCircleOutlined, color: '#faad14' },
  [ReestrEntryStatusValues.Exit]: { icon: ExportOutlined, color: '#13c2c2' },
  [ReestrEntryStatusValues.Abbreviated]: { icon: MinusCircleOutlined, color: '#8c8c8c' },
}

const meta = computed(
  (): StatusVisual =>
    statusVisuals[props.status] ?? statusVisuals[ReestrEntryStatusValues.Abbreviated],
)
</script>

<style scoped>
.reestr-status-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 44px;
  text-align: center;
}

.reestr-status-icon {
  font-size: 20px;
  line-height: 1;
}

.reestr-status-label {
  font-size: 12px;
  line-height: 1.25;
  color: rgba(0, 0, 0, 0.75);
  max-width: 140px;
}
</style>
