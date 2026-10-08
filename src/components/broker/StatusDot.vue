<script setup lang="ts">
import type { ZTone } from '@/components/z/ZTag.vue'

defineProps<{ tone: ZTone; label: string }>()

// Статические строки — сканер Tailwind должен видеть каждый класс целиком.
const DOT: Record<ZTone, string> = {
  neutral: 'bg-tone-neutral-fg',
  info: 'bg-tone-info-fg',
  wait: 'bg-tone-wait-fg',
  submitted: 'bg-tone-submitted-fg',
  done: 'bg-tone-done-fg',
  pay: 'bg-tone-pay-fg',
  danger: 'bg-tone-danger-fg',
  accent: 'bg-gold-ink',
}
</script>

<template>
  <span class="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-ink-2">
    <span aria-hidden="true" :class="['size-[7px] shrink-0 rounded-pill', DOT[tone]]" />{{ label }}
  </span>
</template>
