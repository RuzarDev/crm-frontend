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
  ClockCircleOutlined,
  CloudUploadOutlined,
  ExclamationCircleOutlined,
  MinusCircleOutlined,
  StopOutlined,
  FolderOutlined,
} from '@ant-design/icons-vue'

const props = defineProps<{
  status: ReestrEntryStatus
}>()

type StatusVisual = { icon: Component; color: string }

const statusVisuals: Record<ReestrEntryStatus, StatusVisual> = {
  [ReestrEntryStatusValues.InProgress]: { icon: ClockCircleOutlined, color: '#5b6b8c' },
  [ReestrEntryStatusValues.Submitted]: { icon: CloudUploadOutlined, color: '#8c8c8c' },
  [ReestrEntryStatusValues.Released]: { icon: CheckCircleOutlined, color: '#52c41a' },
  [ReestrEntryStatusValues.ConditionallyReleased]: { icon: ExclamationCircleOutlined, color: '#faad14' },
  [ReestrEntryStatusValues.Problematic]: { icon: ExclamationCircleOutlined, color: '#fa8c16' },
  [ReestrEntryStatusValues.Rejected]: { icon: CloseCircleOutlined, color: '#ff4d4f' },
  [ReestrEntryStatusValues.Withdrawn]: { icon: MinusCircleOutlined, color: '#bfbfbf' },
  [ReestrEntryStatusValues.Archived]: { icon: FolderOutlined, color: '#595959' },
}

const meta = computed(
  (): StatusVisual =>
    statusVisuals[props.status] ?? statusVisuals[ReestrEntryStatusValues.InProgress],
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
