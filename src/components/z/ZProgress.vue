<script setup lang="ts">
import { computed, useId } from 'vue'
import { cn } from '@/ui/cn'

// Полоса прогресса. Имя для скринридера — ariaLabel либо слот label (виден рядом).
const props = withDefaults(defineProps<{
  percent?: number
  status?: 'normal' | 'success' | 'exception'
  size?: 'sm' | 'md'
  showInfo?: boolean
  ariaLabel?: string
}>(), { percent: 0, status: 'normal', size: 'md', showInfo: false })

const labelId = useId()
const value = computed(() => {
  const n = Number(props.percent)
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0
})

const FILL = { normal: 'bg-zircon', success: 'bg-tone-done-fg', exception: 'bg-danger' }
const TRACK = { sm: 'h-1', md: 'h-2' }
</script>

<template>
  <div class="flex items-center gap-2">
    <span v-if="$slots.label" :id="labelId" class="shrink-0 text-xs text-ink-2"><slot name="label" /></span>
    <div
      role="progressbar"
      :aria-valuenow="value"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="$slots.label ? undefined : ariaLabel"
      :aria-labelledby="$slots.label ? labelId : undefined"
      :class="cn('min-w-0 flex-1 overflow-hidden rounded-pill bg-line', TRACK[size])"
    >
      <div
        data-z-progress-fill
        :class="cn('h-full rounded-pill transition-[width] duration-200 ease-out motion-reduce:transition-none', FILL[status])"
        :style="{ width: `${value}%` }"
      />
    </div>
    <span v-if="showInfo" aria-hidden="true" class="shrink-0 text-xs tabular-nums text-ink-2">{{ value }}%</span>
  </div>
</template>
