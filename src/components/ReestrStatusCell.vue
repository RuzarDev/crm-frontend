<template>
  <span class="reestr-status-cell" :class="`status--${statusClass}`">
    <component :is="meta.icon" class="status-icon" />
    <span class="status-label">{{ formatReestrStatus(status) }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Component } from 'vue'
import type { ReestrEntryStatus } from '@/types/api'
import { formatReestrStatus } from '@/utils/reestrDtoMap'
import { ReestrEntryStatus as S } from '@/types/api'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  CloudUploadOutlined,
  ExclamationCircleOutlined,
  MinusCircleOutlined,
  FolderOutlined,
} from '@ant-design/icons-vue'

const props = defineProps<{ status: ReestrEntryStatus }>()

type StatusMeta = { icon: Component; class: string }

const statusMap: Record<ReestrEntryStatus, StatusMeta> = {
  [S.InProgress]:           { icon: ClockCircleOutlined,       class: 'in-progress' },
  [S.Submitted]:            { icon: CloudUploadOutlined,       class: 'submitted' },
  [S.Released]:             { icon: CheckCircleOutlined,       class: 'released' },
  [S.ConditionallyReleased]:{ icon: ExclamationCircleOutlined, class: 'conditional' },
  [S.Problematic]:          { icon: ExclamationCircleOutlined, class: 'problematic' },
  [S.Rejected]:             { icon: CloseCircleOutlined,       class: 'rejected' },
  [S.Withdrawn]:            { icon: MinusCircleOutlined,       class: 'withdrawn' },
  [S.Archived]:             { icon: FolderOutlined,            class: 'archived' },
}

const meta = computed((): StatusMeta =>
  statusMap[props.status] ?? statusMap[S.InProgress],
)

const statusClass = computed(() => meta.value.class)
</script>

<style scoped>
.reestr-status-cell {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  padding: 3px 10px 3px 8px;
  border-radius: 999px;
  border-width: 1px;
  border-style: solid;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  line-height: 1;
}

.status-icon {
  flex-shrink: 0;
  font-size: 13px;
  line-height: 1;
}

.status-label {
  line-height: 1.2;
}

/* ── Статусы ─────────────────────────────── */

.status--in-progress {
  color: #1a5c8a;
  background: #deeaf5;
  border-color: #b5cfea;
}

.status--submitted {
  color: #4b4740;
  background: #ebe8e2;
  border-color: #d0cac0;
}

.status--released {
  color: #1e6640;
  background: #d4ebdf;
  border-color: #a8d4b8;
}

.status--conditional {
  color: #8a5a0a;
  background: #faebd0;
  border-color: #e8c98a;
}

.status--problematic {
  color: #8a4210;
  background: #fae0cc;
  border-color: #e8b890;
}

.status--rejected {
  color: #8a1f1f;
  background: #f5d8d8;
  border-color: #e8aaaa;
}

.status--withdrawn {
  color: #50504a;
  background: #e8e5df;
  border-color: #ccc8c0;
}

.status--archived {
  color: #3a3630;
  background: #e2ddd5;
  border-color: #c8c2b8;
}
</style>
