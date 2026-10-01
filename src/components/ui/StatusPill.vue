<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const props = defineProps<{
  status: string
}>()

const { t, te } = useI18n()
const TONES: Record<string, Tone> = {
  InProgress: 'neutral', Submitted: 'warning', Released: 'success', ConditionallyReleased: 'info',
  Problematic: 'danger', Rejected: 'danger', Withdrawn: 'neutral', Archived: 'neutral',
}

const entry = computed(() => ({
  label: te(`enum.reestrStatus.${props.status}`) ? t(`enum.reestrStatus.${props.status}`) : props.status,
  tone: TONES[props.status] ?? ('neutral' as Tone),
}))
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
  font: 600 12px/1 var(--font-body);
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
