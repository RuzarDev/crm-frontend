<script setup lang="ts">
import { computed } from 'vue'

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const props = defineProps<{
  status: string
}>()

const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  InProgress: { label: 'В работе', tone: 'neutral' },
  Submitted: { label: 'Подан', tone: 'warning' },
  Released: { label: 'Выпущено', tone: 'success' },
  ConditionallyReleased: { label: 'Условно', tone: 'info' },
  Problematic: { label: 'Проблемный', tone: 'danger' },
  Rejected: { label: 'Отклонён', tone: 'danger' },
  Withdrawn: { label: 'Отозван', tone: 'neutral' },
  Archived: { label: 'Архив', tone: 'neutral' },
}

const entry = computed(() => STATUS_MAP[props.status] ?? { label: props.status, tone: 'neutral' as Tone })
const label = computed(() => entry.value.label)
const toneClass = computed(() => `z-pill--${entry.value.tone}`)
</script>

<template>
  <span class="z-pill" :class="toneClass">{{ label }}</span>
</template>

<style scoped>
.z-pill {
  display: inline-flex;
  align-items: center;
  border-radius: var(--r-pill);
  font: 600 11.5px/1 var(--font-body);
  padding: 4px 10px;
  white-space: nowrap;
}

.z-pill--success {
  color: var(--z-success);
  background: var(--z-success-soft);
}

.z-pill--warning {
  color: var(--z-warning);
  background: var(--z-warning-soft);
}

.z-pill--danger {
  color: var(--z-danger);
  background: var(--z-danger-soft);
}

.z-pill--info {
  color: var(--z-info);
  background: var(--z-info-soft);
}

.z-pill--neutral {
  color: var(--z-neutral);
  background: var(--z-neutral-soft);
}
</style>
